// ============================================
// 상인 판매완료 처리
//  · 판매 처리 가능: 상인 + 담임(vip) + 교사(teacher) + 관리자  (canSell)
//  · 자기 학급 물품만: 상인 + 담임(vip)        / 교사·관리자는 모든 반
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, runTransaction, serverTimestamp, increment }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { canSell, isClassBoundSeller } from './roles.js';

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  if(!canSell(me.profile.role)){
    $("guard").textContent = "이 화면은 상인·담임·교사·관리자만 사용할 수 있어요.";
    $("saleForm").style.display = "none";
  }
});

$("itemNo").addEventListener("change", async () => {
  $("preview").textContent = "";
  const itemNo = $("itemNo").value.trim();
  if(!itemNo) return;
  const snap = await getDocs(query(collection(db, "items"), where("itemNo", "==", itemNo)));
  if(snap.empty){ $("preview").textContent = "그런 물품번호가 없어요."; return; }
  const it = snap.docs[0].data();
  $("preview").textContent = `${it.name} · ${it.category} · 등록가 ${it.price}G · 리프 ${it.leafValue}`;
  if($("price").value === "") $("price").value = it.price;
});

$("saleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("message").style.color = "#c53030";
  $("message").textContent = "";

  const itemNo = $("itemNo").value.trim();
  const buyerId = $("buyerId").value.trim().toLowerCase();
  const price = Number($("price").value);

  if(!itemNo || !buyerId){ $("message").textContent = "물품번호와 구매자 ID를 입력하세요."; return; }
  if(!Number.isInteger(price) || price < 0 || price > 3){ $("message").textContent = "실거래가는 0~3 사이 정수여야 해요."; return; }

  const itemSnap = await getDocs(query(collection(db, "items"), where("itemNo", "==", itemNo)));
  if(itemSnap.empty){ $("message").textContent = "물품번호를 찾을 수 없어요."; return; }
  const itemRef = itemSnap.docs[0].ref;
  const itemData = itemSnap.docs[0].data();

  // 상인·담임은 자기 학급 물품만 / 교사·관리자는 모든 반 처리 가능
  if(isClassBoundSeller(me.profile.role) &&
     (itemData.grade !== me.profile.grade || itemData.classNo !== me.profile.classNo)){
    $("message").textContent = "우리 학급 물품만 처리할 수 있어요."; return;
  }

  const buyerSnap = await getDocs(query(collection(db, "users"), where("studentId", "==", buyerId)));
  if(buyerSnap.empty){ $("message").textContent = "구매자 ID를 찾을 수 없어요."; return; }
  const buyerRef = buyerSnap.docs[0].ref;
  const sellerRef = doc(db, "users", itemData.sellerUid);

  $("submitBtn").disabled = true; $("submitBtn").textContent = "처리 중…";
  try {
    await runTransaction(db, async (tx) => {
      // ── 읽기 먼저 ──
      const itemFresh = await tx.get(itemRef);
      const buyerFresh = await tx.get(buyerRef);
      const sellerFresh = await tx.get(sellerRef);

      if(!itemFresh.exists()) throw new Error("물품이 사라졌어요.");
      const it = itemFresh.data();
      if(it.status === "sold") throw new Error("이미 판매완료된 물품이에요.");
      if(it.status === "removed") throw new Error("삭제된 물품이에요.");
      if(buyerRef.id === sellerRef.id) throw new Error("판매자 본인은 구매할 수 없어요.");

      const buyer = buyerFresh.data();
      const buyerBal = buyer.balance || 0;
      if(buyerBal < price) throw new Error(`구매자 잔액이 부족해요 (보유 ${buyerBal}G).`);

      const leafVal = it.leafValue || 0;

      // ── 쓰기 ──
      tx.update(itemRef, {
        status: "sold",
        buyerStudentId: buyerId,
        soldPrice: price,
        updatedAt: serverTimestamp(),
      });
      // 구매자: 캐시 차감 + 리프 적립 + 거래 +1
      tx.update(buyerRef, {
        balance: buyerBal - price,
        leaf: (buyer.leaf || 0) + leafVal,
        tradeCount: (buyer.tradeCount || 0) + 1,
      });
      // ★ 판매자: 잔액은 그대로, 리프 적립 + 거래 +1
      if(sellerFresh.exists()){
        const seller = sellerFresh.data();
        tx.update(sellerRef, {
          leaf: (seller.leaf || 0) + leafVal,
          tradeCount: (seller.tradeCount || 0) + 1,
        });
      }

      // ★ 학급별 리프 총량 누적 (구매자 학급 + 판매자 학급 각각 +leafVal)
      const inc = {};
      const buyerKey = `${buyer.grade}-${pad2(buyer.classNo)}`;
      const sellerKey = `${it.grade}-${pad2(it.classNo)}`;
      inc[buyerKey] = (inc[buyerKey] || 0) + leafVal;
      inc[sellerKey] = (inc[sellerKey] || 0) + leafVal;
      for(const [key, v] of Object.entries(inc)){
        const [g, c] = key.split("-");
        tx.set(doc(db, "classStats", key),
          { leafTotal: increment(v), grade: Number(g), classNo: Number(c) },
          { merge: true });
      }
    });
    $("message").style.color = "#2d5f3f";
    $("message").textContent = `판매완료! ${itemNo} → 구매자 ${buyerId} · ${price}G 🎉 (양쪽 리프 +적립)`;
    $("saleForm").reset();
    $("preview").textContent = "";
  } catch(err){
    $("message").style.color = "#c53030";
    $("message").textContent = "처리 실패: " + (err.message || err.code);
  } finally {
    $("submitBtn").disabled = false; $("submitBtn").textContent = "판매완료 처리";
  }
});