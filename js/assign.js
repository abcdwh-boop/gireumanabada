// ============================================
// 마켓 지정 (상인: 자기 학급 물품을 A/B로)
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  const role = me.profile.role;
  if(role !== "merchant" && role !== "admin"){
    $("guard").textContent = "이 화면은 상인·관리자만 사용할 수 있어요.";
    return;
  }
  await loadItems();
});

async function loadItems(){
  const box = $("list");
  box.innerHTML = "불러오는 중…";
  // 내 학급 물품: classNo로 가져와 grade로 거름
  const snap = await getDocs(query(collection(db, "items"), where("classNo", "==", me.profile.classNo)));
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(it => it.grade === me.profile.grade)
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