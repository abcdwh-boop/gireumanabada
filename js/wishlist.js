// ============================================
// 찜 목록
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayRemove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const STATUS_KO = { registered: "등록됨", onSale: "판매중", sold: "판매완료", removed: "삭제" };

let me = null;
let wishlist = [];

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  wishlist = me.profile.wishlist || [];
  await loadWishlist();
});

async function loadWishlist(){
  const box = $("list");
  if(wishlist.length === 0){
    box.innerHTML = `<p class="greeting">아직 찜한 물품이 없어요. 시장 구경에서 ♡를 눌러보세요.</p>`;
    return;
  }
  box.innerHTML = "불러오는 중…";

  // 찜한 itemId만 콕 집어 읽기 (전체를 읽지 않아 가벼움)
  const results = await Promise.all(wishlist.map(async (id) => {
    try { const s = await getDoc(doc(db, "items", id)); return s.exists() ? { id, ...s.data() } : null; }
    catch { return null; }
  }));
  const items = results.filter(Boolean);

  if(items.length === 0){ box.innerHTML = `<p class="greeting">찜한 물품을 찾을 수 없어요.</p>`; return; }
  items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  box.innerHTML = items.map(it => {
    const st = it.status || "registered";
    return `<div class="item-card">
      <div class="row1">
        <span class="nm">${it.name}</span>
        <button class="heart on" data-id="${it.id}">♥ 해제</button>
      </div>
      <div class="ino">${it.itemNo} · ${it.category}${it.condition ? " · " + it.condition : ""}</div>
      <div class="meta">${it.price}G · 사면 +${it.leafValue} 리프 · <span class="badge ${st}">${STATUS_KO[st] || st}</span></div>
      ${it.story ? `<div class="story">${it.story}</div>` : ""}
    </div>`;
  }).join("");

  box.querySelectorAll(".heart").forEach(btn => {
    btn.addEventListener("click", () => removeWish(btn.dataset.id, btn));
  });
}

async function removeWish(itemId, btn){
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "users", me.uid), { wishlist: arrayRemove(itemId) });
    wishlist = wishlist.filter(id => id !== itemId);
    btn.closest(".item-card").remove();
    if(wishlist.length === 0) $("list").innerHTML = `<p class="greeting">찜 목록이 비었어요.</p>`;
  } catch(e){
    alert("해제 오류: " + (e.code || e.message));
    btn.disabled = false;
  }
}