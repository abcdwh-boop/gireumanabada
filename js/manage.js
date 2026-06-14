// ============================================
// 관리자 설정: 역할 지정 / 카테고리·리프 / 체크리스트
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  if(me.profile.role !== "admin"){
    $("guard").textContent = "이 화면은 관리자만 사용할 수 있어요.";
    $("panel").style.display = "none";
    return;
  }
  $("roleBtn").addEventListener("click", changeRole);
  $("addCat").addEventListener("click", () => addCatRow("", ""));
  $("saveCat").addEventListener("click", saveCategories);
  $("addCk").addEventListener("click", () => addCkRow(""));
  $("saveCk").addEventListener("click", saveCheckList);
  await loadCategories();
  await loadCheckList();
});

// ── 역할 지정 ──
async function changeRole(){
  const sid = $("roleSid").value.trim();
  const role = $("roleSel").value;
  $("roleMsg").style.color = "#c53030";
  if(!sid){ $("roleMsg").textContent = "학번을 입력하세요."; return; }
  const snap = await getDocs(query(collection(db, "users"), where("studentId", "==", sid)));
  if(snap.empty){ $("roleMsg").textContent = "그 학번을 찾을 수 없어요."; return; }
  try {
    await updateDoc(snap.docs[0].ref, { role });
    $("roleMsg").style.color = "#2d5f3f";
    $("roleMsg").textContent = `${sid} → ${role} 로 변경됐어요. (그 사람은 다음 로그인/새로고침 때 반영)`;
  } catch(e){ $("roleMsg").textContent = "오류: " + (e.code || e.message); }
}

// ── 카테고리·리프 ──
async function loadCategories(){
  const fp = await getDoc(doc(db, "config", "footprintTable"));
  const cats = fp.exists() ? (fp.data().categories || []) : [];
  $("catRows").innerHTML = "";
  cats.forEach(c => addCatRow(c.name, c.leaf));
}
function addCatRow(name, leaf){
  const div = document.createElement("div");
  div.className = "edit-row";
  div.innerHTML =
    `<input class="cat-name" type="text" value="${esc(name)}" placeholder="구분명">
     <input class="cat-leaf" type="number" min="0" value="${leaf ?? ""}" placeholder="리프">
     <button type="button" class="mini danger">×</button>`;
  div.querySelector("button").addEventListener("click", () => div.remove());
  $("catRows").appendChild(div);
}
async function saveCategories(){
  const cats = [];
  for(const r of $("catRows").querySelectorAll(".edit-row")){
    const name = r.querySelector(".cat-name").value.trim();
    const leaf = Number(r.querySelector(".cat-leaf").value);
    if(name) cats.push({ name, leaf: isNaN(leaf) ? 0 : leaf });
  }
  $("catMsg").style.color = "#c53030";
  if(cats.length === 0){ $("catMsg").textContent = "최소 한 개는 있어야 해요."; return; }
  try {
    await setDoc(doc(db, "config", "footprintTable"), { categories: cats }, { merge: true });
    $("catMsg").style.color = "#2d5f3f";
    $("catMsg").textContent = `저장됨 (${cats.length}종)`;
  } catch(e){ $("catMsg").textContent = "오류: " + (e.code || e.message); }
}

// ── 체크리스트 ──
async function loadCheckList(){
  const cl = await getDoc(doc(db, "config", "checkList"));
  const items = cl.exists() ? (cl.data().items || []) : [];
  $("ckRows").innerHTML = "";
  items.forEach(t => addCkRow(t));
}
function addCkRow(text){
  const div = document.createElement("div");
  div.className = "edit-row";
  div.innerHTML =
    `<input class="ck-text" type="text" value="${esc(text)}" placeholder="확인 문구">
     <button type="button" class="mini danger">×</button>`;
  div.querySelector("button").addEventListener("click", () => div.remove());
  $("ckRows").appendChild(div);
}
async function saveCheckList(){
  const items = [...$("ckRows").querySelectorAll(".ck-text")].map(i => i.value.trim()).filter(Boolean);
  $("ckMsg").style.color = "#c53030";
  if(items.length === 0){ $("ckMsg").textContent = "최소 한 개는 있어야 해요."; return; }
  try {
    await setDoc(doc(db, "config", "checkList"), { items }, { merge: true });
    $("ckMsg").style.color = "#2d5f3f";
    $("ckMsg").textContent = `저장됨 (${items.length}항목)`;
  } catch(e){ $("ckMsg").textContent = "오류: " + (e.code || e.message); }
}