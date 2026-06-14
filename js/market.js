// ============================================
// 시장 구경 + 찜
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, getDocs, arrayUnion, arrayRemove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let me = null;
let allItems = [];           // [{ id, ...data }]
let wishlist = new Set();    // 찜한 itemId 모음
let phase = "pre-open";

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  wishlist = new Set(me.profile.wishlist || []);

  await loadPhase();
  await loadCategories();
  await loadItems();

  $("search").addEventListener("input", render);
  $("catFilter").addEventListener("change", render);
  $("refreshBtn").addEventListener("click", loadItems);
});

async function loadPhase(){
  const ps = await getDoc(doc(db, "config", "phaseSchedule"));
  phase = ps.exists() ? ps.data().phase : "pre-open";
  const map = {
    "pre-open": "마켓 시작 전 — 구경하고 찜해두세요",
    "A-open": "A마켓 열림",
    "B-open": "B마켓 열림",
    "closed": "마켓 마감",
  };
  $("notice").textContent = map[phase] || "";
}

async function loadCategories(){
  const fp = await getDoc(doc(db, "config", "footprintTable"));
  const cats = fp.exists() ? (fp.data().categories || []) : [];
  $("catFilter").innerHTML = `<option value="">전체 구분</option>` +
    cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

async function loadItems(){
  $("list").innerHTML = "불러오는 중…";
  const snap = await getDocs(collection(db, "items"));
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 살 수 있는 것만 (판매완료·삭제 제외)
  items = items.filter(it => it.status === "registered" || it.status === "onSale");
  // 페이즈별 노출
  if(phase === "A-open") items = items.filter(it => it.market === "A");
  if(phase === "B-open") items = items.filter(it => it.market === "B" || it.market === "A");
  // 최신순
  items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  allItems = items;
  render();
}

function render(){
  const kw = $("search").value.trim().toLowerCase();
  const cat = $("catFilter").value;
  let view = allItems;
  if(cat) view = view.filter(it => it.category === cat);
  if(kw) view = view.filter(it => (it.name || "").toLowerCase().includes(kw));

  const box = $("list");
  if(view.length === 0){ box.innerHTML = `<p class="greeting">해당하는 물품이 없어요.</p>`; return; }

  box.innerHTML = view.map(it => {
    const mine = it.sellerUid === me.uid;
    const liked = wishlist.has(it.id);
    const heart = mine ? "내 물건" : (liked ? "♥ 찜" : "♡ 찜");
    return `<div class="item-card">
      <div class="row1">
        <span class="nm">${it.name}</span>
        <button class="heart ${liked ? "on" : ""}" data-id="${it.id}" ${mine ? "disabled" : ""}>${heart}</button>
      </div>
      <div class="ino">${it.itemNo} · ${it.category}${it.condition ? " · " + it.condition : ""}</div>
      <div class="meta">${it.price}G · 사면 +${it.leafValue} 리프</div>
      ${it.story ? `<div class="story">${it.story}</div>` : ""}
    </div>`;
  }).join("");

  box.querySelectorAll(".heart:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => toggleWish(btn.dataset.id, btn));
  });
}

async function toggleWish(itemId, btn){
  const liked = wishlist.has(itemId);
  btn.disabled = true;
  try {
    const userRef = doc(db, "users", me.uid);
    if(liked){
      await updateDoc(userRef, { wishlist: arrayRemove(itemId) });
      wishlist.delete(itemId);
    } else {
      await updateDoc(userRef, { wishlist: arrayUnion(itemId) });
      wishlist.add(itemId);
    }
    btn.classList.toggle("on", !liked);
    btn.textContent = !liked ? "♥ 찜" : "♡ 찜";
  } catch(e){
    alert("찜 오류: " + (e.code || e.message));
  } finally {
    btn.disabled = false;
  }
}