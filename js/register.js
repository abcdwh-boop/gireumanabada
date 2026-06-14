// ============================================
// 물품 등록 + 내 물품 목록 + 수정/삭제
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where, runTransaction, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
const STATUS_KO = { registered: "등록됨", onSale: "판매중", sold: "판매완료", removed: "삭제" };

let me = null;
let categories = [];
let phaseOpen = true;
let myItems = [];        // [{ id, ...data }]
let editingId = null;    // 수정 중인 물품 id (없으면 등록 모드)

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if(!snap.exists()){ $("notice").textContent = "사용자 정보를 찾을 수 없습니다."; return; }
  me = { uid: user.uid, profile: snap.data() };
  await loadConfig();
  await loadMyItems();
});

async function loadConfig(){
  const fp = await getDoc(doc(db, "config", "footprintTable"));
  categories = fp.exists() ? (fp.data().categories || []) : [];
  const sel = $("category");
  sel.innerHTML = `<option value="">선택하세요</option>` +
    categories.map((c, i) => `<option value="${i}">${c.name} (리프 ${c.leaf})</option>`).join("");
  sel.addEventListener("change", () => {
    const c = categories[sel.value];
    $("leafHint").textContent = c ? `이 물건의 환경기여도: ${c.leaf} 리프` : "";
  });

  const cl = await getDoc(doc(db, "config", "checkList"));
  const items = cl.exists() ? (cl.data().items || []) : [];
  $("checklist").innerHTML = items.map((t, i) =>
    `<label class="ck"><input type="checkbox" data-ck="${i}"><span>${t}</span></label>`).join("");
  $("checklist").addEventListener("change", updateGate);

  const ps = await getDoc(doc(db, "config", "phaseSchedule"));
  phaseOpen = (ps.exists() ? ps.data().phase : "pre-open") === "pre-open";
  if(!phaseOpen){
    $("notice").textContent = "지금은 물품 등록·수정 기간이 아닙니다.";
    $("regForm").querySelectorAll("input,select,textarea,button").forEach(el => el.disabled = true);
  }
}

function allChecked(){
  const cks = [...document.querySelectorAll('#checklist input[type=checkbox]')];
  return cks.length > 0 && cks.every(c => c.checked);
}
function updateGate(){
  if(!phaseOpen) return;
  const ok = allChecked();
  $("submitBtn").disabled = !ok;
  $("submitBtn").textContent = ok ? (editingId ? "수정 저장" : "물품 등록하기") : "모두 확인해야 등록돼요";
}

$("regForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("message").style.color = "#c53030";
  $("message").textContent = "";
  if(!me || !phaseOpen) return;
  if(!allChecked()){ $("message").textContent = "확인 항목을 모두 체크하세요."; return; }

  const catIdx = $("category").value;
  if(catIdx === ""){ $("message").textContent = "물품 구분을 선택하세요."; return; }
  const cat = categories[catIdx];
  const name = $("name").value.trim();
  if(!name){ $("message").textContent = "물품명을 입력하세요."; return; }

  const fields = {
    name, category: cat.name, leafValue: cat.leaf,
    usage: $("usage").value.trim(),
    period: $("period").value.trim(),
    condition: $("condition").value,
    story: $("story").value.trim(),
    price: Number($("price").value),
  };

  $("submitBtn").disabled = true;
  $("submitBtn").textContent = editingId ? "저장 중…" : "등록 중…";
  try {
    if(editingId){
      await updateDoc(doc(db, "items", editingId), { ...fields, updatedAt: serverTimestamp() });
      $("message").style.color = "#2d5f3f";
      $("message").textContent = "수정 완료!";
      exitEditMode();
    } else {
      const itemNo = await registerItem(fields);
      $("message").style.color = "#2d5f3f";
      $("message").textContent = `등록 완료! 물품번호 ${itemNo} · 1G 적립 🎉`;
      $("regForm").reset();
      $("leafHint").textContent = "";
      updateGate();
    }
    await loadMyItems();
  } catch(err){
    $("message").style.color = "#c53030";
    $("message").textContent = "오류: " + (err.message || err.code);
    updateGate();
  }
});

// 새 물품 등록: 채번 + 저장 + 1G (트랜잭션)
async function registerItem(fields){
  const cc = pad2(me.profile.classNo);
  const counterRef = doc(db, "counters", `${me.profile.grade}-${cc}`);
  const userRef = doc(db, "users", me.uid);
  const itemRef = doc(collection(db, "items"));
  let itemNo;
  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const userSnap = await tx.get(userRef);
    const seq = (counterSnap.exists() ? (counterSnap.data().seq || 0) : 0) + 1;
    itemNo = `${me.profile.grade}-${cc}-${pad2(seq)}`;
    const bal = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
    tx.set(counterRef, { seq }, { merge: true });
    tx.set(itemRef, {
      ...fields, itemNo,
      sellerUid: me.uid, sellerStudentId: me.profile.studentId,
      grade: me.profile.grade, classNo: me.profile.classNo, groupId: me.profile.groupId,
      market: null, status: "registered", checklistPassed: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    tx.update(userRef, { balance: bal + 1 });
  });
  return itemNo;
}

function startEdit(id){
  const it = myItems.find(x => x.id === id);
  if(!it) return;
  editingId = id;
  $("category").value = String(categories.findIndex(c => c.name === it.category));
  $("leafHint").textContent = `이 물건의 환경기여도: ${it.leafValue} 리프`;
  $("name").value = it.name || "";
  $("usage").value = it.usage || "";
  $("period").value = it.period || "";
  $("condition").value = it.condition || "보통";
  $("story").value = it.story || "";
  $("price").value = String(it.price ?? 1);
  document.querySelectorAll('#checklist input').forEach(c => c.checked = true);
  $("notice").style.color = "#2d5f3f";
  $("notice").textContent = `✏️ "${it.name}" 수정 중`;
  $("cancelEdit").style.display = "inline-block";
  updateGate();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function exitEditMode(){
  editingId = null;
  $("regForm").reset();
  $("leafHint").textContent = "";
  $("notice").textContent = "";
  $("cancelEdit").style.display = "none";
  updateGate();
}
$("cancelEdit").addEventListener("click", exitEditMode);

async function deleteItem(id){
  const it = myItems.find(x => x.id === id);
  if(!confirm(`"${it?.name}" 을(를) 삭제할까요?\n등록 보상 1G가 회수됩니다.`)) return;
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", me.uid);
      const itemRef = doc(db, "items", id);
      const userSnap = await tx.get(userRef);
      const itemSnap = await tx.get(itemRef);
      if(!itemSnap.exists()) throw new Error("이미 없는 물품이에요.");
      if(itemSnap.data().status === "sold") throw new Error("판매완료된 물품은 삭제할 수 없어요.");
      const bal = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
      tx.update(itemRef, { status: "removed", updatedAt: serverTimestamp() });
      tx.update(userRef, { balance: Math.max(0, bal - 1) });
    });
    if(editingId === id) exitEditMode();
    await loadMyItems();
  } catch(e){
    alert("삭제 오류: " + (e.message || e.code));
  }
}

async function loadMyItems(){
  const box = $("myItems");
  try {
    const snap = await getDocs(query(collection(db, "items"), where("sellerUid", "==", me.uid)));
    myItems = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(it => it.status !== "removed");           // 삭제된 건 숨김
    if(myItems.length === 0){ box.innerHTML = `<p class="greeting">아직 등록한 물품이 없어요.</p>`; return; }
    myItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    box.innerHTML = myItems.map(it => {
      const st = it.status || "registered";
      const canEdit = (st === "registered" && phaseOpen);
      return `<div class="item-card">
        <div class="row1"><span class="nm">${it.name}</span>
          <span class="badge ${st}">${STATUS_KO[st] || st}</span></div>
        <div class="ino">${it.itemNo} · ${it.category}${it.market ? " · " + it.market + "마켓" : ""}</div>
        <div class="meta">${it.price}G · 리프 ${it.leafValue}</div>
        ${canEdit ? `<div class="card-actions">
          <button class="mini" data-edit="${it.id}">수정</button>
          <button class="mini danger" data-del="${it.id}">삭제</button>
        </div>` : ""}
      </div>`;
    }).join("");

    box.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => startEdit(b.dataset.edit)));
    box.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteItem(b.dataset.del)));
  } catch(err){
    box.innerHTML = `<p class="message">목록 오류: ${err.code || err.message}</p>`;
  }
}