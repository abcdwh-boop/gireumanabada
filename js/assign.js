// ============================================
// 마켓 지정 (A/B)
//  · 상인·담임(vip)  : 자기 학급 물품만 (자동)
//  · 교사·관리자      : 반을 선택해서 그 반 물품 지정 (학급 0이라 전체 대신 반 선택)
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { canSell, isClassBoundSeller } from './roles.js';

const $ = (id) => document.getElementById(id);
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  const role = me.profile.role;

  if(!canSell(role)){
    $("guard").textContent = "이 화면은 상인·담임·교사·관리자만 사용할 수 있어요.";
    return;
  }

  if(isClassBoundSeller(role)){
    // 상인·담임: 자기 학급 자동
    await loadItems(me.profile.grade, me.profile.classNo);
  } else {
    // 교사·관리자: 반 선택 후 지정
    await setupClassPicker();
  }
});

// 교사·관리자용 반 선택 드롭다운 (groupMapping 에서 반 목록)
async function setupClassPicker(){
  const gm = await getDoc(doc(db, "config", "groupMapping"));
  const groups = gm.exists() ? (gm.data().groups || {}) : {};
  const classes = [];
  Object.values(groups).forEach(g => (g.classes || []).forEach(c => classes.push({ grade: g.grade, classNo: c })));
  classes.sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);

  $("guard").textContent = "반을 선택하면 그 반 물품을 A·B마켓으로 나눌 수 있어요. (같은 버튼을 다시 누르면 해제)";

  const sel = document.createElement("select");
  sel.id = "classPick";
  sel.style.cssText = "font-size:16px;padding:9px 12px;border-radius:8px;border:1px solid #b8cdb8;font-weight:700;color:#25402c;margin:6px 0 12px;width:100%;background:#fff;";
  sel.innerHTML = `<option value="">반을 선택하세요</option>` +
    classes.map(c => `<option value="${c.grade}-${c.classNo}">${c.grade}학년 ${c.classNo}반</option>`).join("");
  $("list").insertAdjacentElement("beforebegin", sel);
  $("list").innerHTML = "";

  sel.addEventListener("change", () => {
    if(!sel.value){ $("list").innerHTML = ""; return; }
    const [g, c] = sel.value.split("-").map(Number);
    loadItems(g, c);
  });
}

async function loadItems(grade, classNo){
  const box = $("list");
  box.innerHTML = "불러오는 중…";
  // 해당 학급 물품: classNo로 가져와 grade로 거름
  const snap = await getDocs(query(collection(db, "items"), where("classNo", "==", classNo)));
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(it => it.grade === grade)
    .filter(it => it.status === "registered" || it.status === "onSale");
  items.sort((a, b) => (a.itemNo || "").localeCompare(b.itemNo || ""));

  if(items.length === 0){ box.innerHTML = `<p class="greeting">지정할 물품이 없어요.</p>`; return; }

  box.innerHTML = items.map(it => {
    const m = it.market || "";
    return `<div class="item-card">
      <div class="row1"><span class="nm">${it.name}</span><span class="ino">${it.itemNo}</span></div>
      <div class="meta">${it.category} · ${it.price}G</div>
      <div class="ab">
        <button class="ab-btn ${m === "A" ? "on" : ""}" data-id="${it.id}" data-m="A">A마켓</button>
        <button class="ab-btn ${m === "B" ? "on" : ""}" data-id="${it.id}" data-m="B">B마켓</button>
      </div>
    </div>`;
  }).join("");

  box.querySelectorAll(".ab-btn").forEach(btn => btn.addEventListener("click", () => setMarket(btn)));
}

async function setMarket(btn){
  const id = btn.dataset.id, m = btn.dataset.m;
  const card = btn.closest(".item-card");
  const cur = card.querySelector(".ab-btn.on");
  const already = cur && cur.dataset.m === m;   // 같은 버튼 다시 누르면 해제

  btn.disabled = true;
  try {
    await updateDoc(doc(db, "items", id), { market: already ? null : m });
    card.querySelectorAll(".ab-btn").forEach(b => b.classList.remove("on"));
    if(!already) btn.classList.add("on");
  } catch(e){
    alert("지정 오류: " + (e.code || e.message));
  } finally {
    btn.disabled = false;
  }
}