// ============================================
// 관리자/담임 설정: 역할 지정 / (admin) 카테고리·리프 / (admin) 체크리스트
//  · admin : ID로 5개 역할 지정 + config 편집
//  · vip(담임) : 우리 반 명단에서 학생↔상인 토글만
//  권한 판단은 roles.js 한 곳에서.
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { canManageRoles, assignableRoles, roleLabel, canAssignTarget, isStaff }
  from './roles.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  const role = me.profile.role;

  if(!canManageRoles(role)){          // admin·vip 만 접근
    $("guard").textContent = "이 화면은 관리자/담임만 사용할 수 있어요.";
    $("panel").style.display = "none";
    return;
  }

  if(role === "admin"){
    // 역할 지정(ID 방식) + config 편집
    $("adminRoleSec").style.display = "";
    fillRoleSelect("admin");
    $("roleBtn").addEventListener("click", changeRoleById);
    $("addCat").addEventListener("click", () => addCatRow("", ""));
    $("saveCat").addEventListener("click", saveCategories);
    $("addCk").addEventListener("click", () => addCkRow(""));
    $("saveCk").addEventListener("click", saveCheckList);
    await loadCategories();
    await loadCheckList();
  } else {
    // vip(담임): 우리 반 명단만. config 섹션 숨김.
    $("vipRoleSec").style.display = "";
    $("catSec").style.display = "none";
    $("ckSec").style.display = "none";
    $("vipTitle").textContent = `${me.profile.grade}학년 ${me.profile.classNo}반 상인 지정`;
    await renderVipRoster();
  }
});

function fillRoleSelect(forRole){
  const sel = $("roleSel");
  sel.innerHTML = assignableRoles(forRole)
    .map(r => `<option value="${r}">${roleLabel(r)}</option>`).join("");
}

// ── admin: ID 입력으로 역할 변경 (5개 역할) ──
async function changeRoleById(){
  const sid = $("roleSid").value.trim().toLowerCase();
  const role = $("roleSel").value;
  $("roleMsg").style.color = "#c53030";
  if(!sid){ $("roleMsg").textContent = "ID를 입력하세요."; return; }
  const snap = await getDocs(query(collection(db, "users"), where("studentId", "==", sid)));
  if(snap.empty){ $("roleMsg").textContent = "그 ID를 찾을 수 없어요."; return; }
  const targetRef = snap.docs[0].ref;
  const target = snap.docs[0].data();

  // 클라이언트 1차 검증 (서버 규칙으로도 막아야 안전)
  if(!canAssignTarget(me.profile, target, role)){
    $("roleMsg").textContent = "그 역할로는 변경할 권한이 없어요.";
    return;
  }
  try {
    await updateDoc(targetRef, { role });
    $("roleMsg").style.color = "#2d5f3f";
    $("roleMsg").textContent = `${sid} → ${roleLabel(role)} 로 변경됐어요. (그 사람은 다음 로그인/새로고침 때 반영)`;
  } catch(e){ $("roleMsg").textContent = "오류: " + (e.code || e.message); }
}

// ── vip(담임): 우리 반 명단 + 학생↔상인 토글 ──
async function renderVipRoster(){
  const box = $("vipRoster");
  box.innerHTML = "불러오는 중…";
  let docs = [];
  try {
    const snap = await getDocs(query(collection(db, "users"),
      where("grade", "==", Number(me.profile.grade)),
      where("classNo", "==", Number(me.profile.classNo))));
    docs = snap.docs;
  } catch(e){
    box.innerHTML = "";
    $("vipMsg").style.color = "#c53030";
    $("vipMsg").textContent = "명단을 불러오지 못했어요: " + (e.code || e.message);
    return;
  }

  // 코드명 순 정렬
  docs.sort((a,b) => String(a.data().name||a.data().studentId).localeCompare(String(b.data().name||b.data().studentId)));

  box.innerHTML = "";
  let count = 0;
  for(const d of docs){
    const u = d.data();
    const r = String(u.role || "student").toLowerCase();
    if(isStaff(r)) continue;          // 다른 담임/교사/관리자 계정은 명단에서 숨김(못 건드림)
    count++;

    const row = document.createElement("div");
    row.className = "roster-row";
    const badgeCls = r === "merchant" ? "merchant" : "student";
    row.innerHTML =
      `<span class="nm">${esc(u.name || u.studentId)}</span>
       <span class="badge ${badgeCls}">${roleLabel(r)}</span>
       <span class="spacer"></span>`;

    const next = r === "merchant" ? "student" : "merchant";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mini";
    btn.textContent = r === "merchant" ? "학생으로" : "상인 임명";
    btn.addEventListener("click", () => toggleRole(d.ref, u, next, btn));
    row.appendChild(btn);
    box.appendChild(row);
  }
  if(count === 0) box.innerHTML = "<p class='greeting'>우리 반 학생 계정이 없어요.</p>";
}

async function toggleRole(ref, target, newRole, btn){
  $("vipMsg").style.color = "#c53030";
  if(!canAssignTarget(me.profile, target, newRole)){
    $("vipMsg").textContent = "변경할 권한이 없어요.";
    return;
  }
  btn.disabled = true;
  try {
    await updateDoc(ref, { role: newRole });
    $("vipMsg").style.color = "#2d5f3f";
    $("vipMsg").textContent = `${target.name || target.studentId} → ${roleLabel(newRole)} 완료.`;
    await renderVipRoster();          // 명단 새로고침
  } catch(e){
    btn.disabled = false;
    $("vipMsg").textContent = "오류: " + (e.code || e.message);
  }
}

// ── 카테고리·리프 (admin) ──
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

// ── 체크리스트 (admin) ──
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