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

// ── 금칙어 필터 ─────────────────────────────────────────────
//  여기 BANNED_WORDS 배열의 단어만 추가·삭제하면 됩니다. (2글자 이상, 명백한 단어 권장)
const BANNED_WORDS = [
  // 욕설
  "시발", "씨발", "씨빨", "시빨", "씨발놈", "시발년", "개새끼", "개색기", "개세끼", "개시키",
  "썅", "쌍놈", "쌍년", "개년", "개놈", "존나", "존만", "좆같", "좆나", "니미", "느금마", "애미뒤",
  "병신", "븅신", "등신", "지랄", "닥쳐", "꺼져", "엿먹어", "미친놈", "미친년", "씹새", "씹창", "좆", "ㅅㅂ", "ㅄ", "ㅂㅅ", "ㅗ", "ㄲㅈ", "ㅈㄹ", "ㅆㅂ",
  // 성적 표현
  "섹스", "야동", "포르노", "자위", "딸딸이", "창녀", "걸레같", "발정", "ㄲㅊ", "꼬추", "고추",
  // ⚠ 아래는 정상 단어에도 걸릴 수 있어요(예: '바라보지마', '곤충의 변태'). 오탐 생기면 그 줄만 지우세요.
  "보지", "자지", "후장", "변태",
];

// 텍스트를 청소(공백·특수문자 제거·소문자화)한 뒤 금칙어 포함 여부 검사 → 걸린 단어 반환
function findBannedWord(text) {
  const cleaned = String(text || "")
    .toLowerCase()
    .replace(/[\s.,!?*\-_~^·'"()\[\]{}<>\/\\|@#$%&+=]/g, "");
  return BANNED_WORDS.find(w => cleaned.includes(w.toLowerCase()));
}

let me = null;
let categories = [];
let phaseOpen = true;
let myItems = [];
let editingId = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { $("notice").textContent = "사용자 정보를 찾을 수 없습니다."; return; }
  me = { uid: user.uid, profile: snap.data() };
  await loadConfig();
  await loadMyItems();
});

async function loadConfig() {
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
  if (!phaseOpen) {
    $("notice").textContent = "지금은 물품 등록·수정 기간이 아닙니다.";
    $("regForm").querySelectorAll("input,select,textarea,button").forEach(el => el.disabled = true);
  }
}

function allChecked() {
  const cks = [...document.querySelectorAll('#checklist input[type=checkbox]')];
  return cks.length > 0 && cks.every(c => c.checked);
}
function updateGate() {
  if (!phaseOpen) return;
  const ok = allChecked();
  $("submitBtn").disabled = !ok;
  $("submitBtn").textContent = ok ? (editingId ? "수정 저장" : "물품 등록하기") : "모두 확인해야 등록돼요";
}

$("regForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("message").style.color = "#c53030";
  $("message").textContent = "";
  if (!me || !phaseOpen) return;
  if (!allChecked()) { $("message").textContent = "확인 항목을 모두 체크하세요."; return; }

  const catIdx = $("category").value;
  if (catIdx === "") { $("message").textContent = "물품 구분을 선택하세요."; return; }
  const cat = categories[catIdx];
  const name = $("name").value.trim();
  if (!name) { $("message").textContent = "물품명을 입력하세요."; return; }

  const fields = {
    name, category: cat.name, leafValue: cat.leaf,
    usage: $("usage").value.trim(),
    period: $("period").value.trim(),
    condition: $("condition").value,
    story: $("story").value.trim(),
    price: Number($("price").value),
  };

  // 금칙어 검사 (물품명·소개글·용도) — 걸리면 등록/수정 중단
  const _bad = findBannedWord(`${fields.name} ${fields.story} ${fields.usage}`);
  if (_bad) {
    $("message").style.color = "#c53030";
    $("message").textContent = "부적절한 표현이 포함되어 등록할 수 없어요. 표현을 수정해주세요.";
    return;
  }

  $("submitBtn").disabled = true;
  $("submitBtn").textContent = editingId ? "저장 중…" : "등록 중…";
  try {
    if (editingId) {
      await updateDoc(doc(db, "items", editingId), { ...fields, updatedAt: serverTimestamp() });
      $("message").style.color = "#2d5f3f";
      $("message").textContent = "수정 완료!";
      exitEditMode();
    } else {
      const { itemNo, gained } = await registerItem(fields);
      $("message").style.color = "#2d5f3f";
      $("message").textContent = gained > 0
        ? `등록 완료! 물품번호 ${itemNo} · ${gained}G 적립 🎉`
        : `등록 완료! 물품번호 ${itemNo} · (G캐시는 최대 ${BALANCE_CAP}G까지예요)`;
      $("regForm").reset();
      $("leafHint").textContent = "";
      updateGate();
    }
    await loadMyItems();
  } catch (err) {
    $("message").style.color = "#c53030";
    $("message").textContent = "오류: " + (err.message || err.code);
    updateGate();
  }
});

const BALANCE_CAP = 6;   // G캐시 상한 (등록은 계속 가능하지만 캐시는 여기까지만)

async function registerItem(fields) {
  const cc = pad2(me.profile.classNo);
  const counterRef = doc(db, "counters", `${me.profile.grade}-${cc}`);
  const userRef = doc(db, "users", me.uid);
  const itemRef = doc(collection(db, "items"));
  let itemNo, gained = 0;
  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const userSnap = await tx.get(userRef);
    const seq = (counterSnap.exists() ? (counterSnap.data().seq || 0) : 0) + 1;
    itemNo = `${me.profile.grade}-${cc}-${pad2(seq)}`;
    const bal = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
    const newBal = Math.min(BALANCE_CAP, bal + 1);   // 6G 상한
    gained = newBal - bal;                            // 0 또는 1
    tx.set(counterRef, { seq }, { merge: true });
    tx.set(itemRef, {
      ...fields, itemNo,
      sellerUid: me.uid, sellerStudentId: me.profile.studentId,
      grade: me.profile.grade, classNo: me.profile.classNo, groupId: me.profile.groupId,
      market: null, status: "registered", checklistPassed: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    tx.update(userRef, { balance: newBal });
  });
  return { itemNo, gained };
}

function startEdit(id) {
  const it = myItems.find(x => x.id === id);
  if (!it) return;
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

function exitEditMode() {
  editingId = null;
  $("regForm").reset();
  $("leafHint").textContent = "";
  $("notice").textContent = "";
  $("cancelEdit").style.display = "none";
  updateGate();
}
$("cancelEdit").addEventListener("click", exitEditMode);

async function deleteItem(id) {
  const it = myItems.find(x => x.id === id);
  if (!confirm(`"${it?.name}" 을(를) 삭제할까요?\n등록 보상 1G가 회수됩니다.`)) return;
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", me.uid);
      const itemRef = doc(db, "items", id);
      const userSnap = await tx.get(userRef);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error("이미 없는 물품이에요.");
      if (itemSnap.data().status === "sold") throw new Error("판매완료된 물품은 삭제할 수 없어요.");
      const bal = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
      tx.update(itemRef, { status: "removed", updatedAt: serverTimestamp() });
      tx.update(userRef, { balance: Math.max(0, bal - 1) });
    });
    if (editingId === id) exitEditMode();
    await loadMyItems();
  } catch (e) {
    alert("삭제 오류: " + (e.message || e.code));
  }
}

async function loadMyItems() {
  const box = $("myItems");
  try {
    const snap = await getDocs(query(collection(db, "items"), where("sellerUid", "==", me.uid)));
    myItems = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(it => it.status !== "removed");
    if (myItems.length === 0) { box.innerHTML = `<p class="greeting">아직 등록한 물품이 없어요.</p>`; return; }
    myItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    box.innerHTML = myItems.map(it => {
      const st = it.status || "registered";
      const canEdit = (st === "registered" && phaseOpen);
      return `<div class="item-card">
        <div class="row1"><span class="nm">${it.name}</span>
          <span class="badge ${st}">${STATUS_KO[st] || st}</span></div>
        <div class="itemno-big">📌 물품번호: ${it.itemNo}</div>
        <div class="ino">${it.category}${it.market ? " · " + it.market + "마켓" : ""}</div>
        <div class="meta">${it.price}G · 리프 ${it.leafValue}</div>
        ${canEdit ? `<div class="card-actions">
          <button class="mini" data-edit="${it.id}">수정</button>
          <button class="mini danger" data-del="${it.id}">삭제</button>
        </div>` : ""}
      </div>`;
    }).join("");

    box.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => startEdit(b.dataset.edit)));
    box.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteItem(b.dataset.del)));
  } catch (err) {
    box.innerHTML = `<p class="message">목록 오류: ${err.code || err.message}</p>`;
  }
}