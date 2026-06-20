// ============================================
// 시장 구경 + 찜  (페이지네이션 20개 + 카테고리 정렬)
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, getDocs,
         query, where, orderBy, limit, startAfter,
         arrayUnion, arrayRemove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const PAGE = 20;             // 한 번에 불러오는 개수

let me = null;
let allItems = [];           // 지금까지 불러온 물품 [{ id, ...data }]
let wishlist = new Set();    // 찜한 itemId 모음
let phase = "pre-open";

let lastDoc = null;          // 다음 페이지 커서
let reachedEnd = false;      // 더 없으면 true
let loading = false;
let moreBtn = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  wishlist = new Set(me.profile.wishlist || []);

  await loadPhase();
  await loadCategories();
  setupMoreBtn();
  await loadPage(true);      // 첫 20개

  $("search").addEventListener("input", render);          // 검색은 불러온 목록 안에서
  $("catFilter").addEventListener("change", () => loadPage(true)); // 카테고리는 서버에서 다시
  $("refreshBtn").addEventListener("click", () => loadPage(true));
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
  setBanner();
}

// 상단 A/B 마켓 배너 (A·B 진행 중일 때만 색 배너 표시)
function setBanner(){
  const el = $("marketBanner");
  if(!el) return;
  if(phase === "A-open"){
    el.textContent = "🅰️ A마켓 진행 중";
    el.style.background = "#0f8a7e";   // A: 청록
    el.style.display = "block";
  } else if(phase === "B-open"){
    el.textContent = "🅱️ B마켓 진행 중";
    el.style.background = "#e07a2c";   // B: 주황
    el.style.display = "block";
  } else {
    el.style.display = "none";         // 시작 전·마감은 배너 숨김(아래 안내문만)
  }
}

async function loadCategories(){
  const fp = await getDoc(doc(db, "config", "footprintTable"));
  const cats = fp.exists() ? (fp.data().categories || []) : [];
  $("catFilter").innerHTML = `<option value="">전체 구분</option>` +
    cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

// 현재 페이즈 + 선택 카테고리에 맞는 쿼리 조건 만들기
function buildConstraints(){
  const cat = $("catFilter").value;
  const c = [];

  // 페이즈별 마켓 노출 (서버에서 거름)
  if(phase === "A-open")      c.push(where("market", "==", "A"));
  else if(phase === "B-open") c.push(where("market", "in", ["A", "B"]));
  // pre-open / closed 은 마켓 조건 없음 (전부 노출)

  // 카테고리: 고르면 그 품목만 / 전체면 품목별로 묶어서 정렬
  if(cat){
    c.push(where("category", "==", cat));
    c.push(orderBy("itemNo"));
  } else {
    c.push(orderBy("category"));
    c.push(orderBy("itemNo"));
  }

  c.push(limit(PAGE));
  if(lastDoc) c.push(startAfter(lastDoc));
  return c;
}

async function loadPage(reset){
  if(loading) return;
  if(reset){ allItems = []; lastDoc = null; reachedEnd = false; }
  if(reachedEnd) return;

  loading = true;
  if(reset) $("list").innerHTML = "불러오는 중…";
  if(moreBtn) moreBtn.textContent = "불러오는 중…";

  try {
    const snap = await getDocs(query(collection(db, "items"), ...buildConstraints()));
    if(snap.docs.length < PAGE) reachedEnd = true;
    if(snap.docs.length)        lastDoc = snap.docs[snap.docs.length - 1];
    snap.docs.forEach(d => allItems.push({ id: d.id, ...d.data() }));
    render();
  } catch(e){
    console.error(e);
    $("list").innerHTML =
      `<p class="greeting">목록을 불러오지 못했어요.<br>
       <small>${e.code || e.message}</small><br>
       <small>(처음 한 번이라면 F12 콘솔의 색인 만들기 링크를 눌러주세요)</small></p>`;
  } finally {
    loading = false;
    updateMoreBtn();
  }
}

function render(){
  const kw = $("search").value.trim().toLowerCase();

  // 살 수 있는 것만 (판매완료·삭제 제외) + 검색어
  let view = allItems.filter(it => it.status === "registered" || it.status === "onSale");
  if(kw) view = view.filter(it => (it.name || "").toLowerCase().includes(kw));

  const box = $("list");
  if(view.length === 0){
    box.innerHTML = `<p class="greeting">해당하는 물품이 없어요.</p>`;
    updateMoreBtn();
    return;
  }

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

  updateMoreBtn();
}

function setupMoreBtn(){
  moreBtn = document.createElement("button");
  moreBtn.id = "moreBtn";
  moreBtn.textContent = "더 보기";
  moreBtn.style.cssText =
    "display:none;width:100%;margin-top:12px;height:46px;border:1px solid #2d5f3f;" +
    "border-radius:8px;background:#fff;color:#2d5f3f;font-size:15px;font-weight:700;cursor:pointer;";
  $("list").insertAdjacentElement("afterend", moreBtn);
  moreBtn.addEventListener("click", () => loadPage(false));
}

function updateMoreBtn(){
  if(!moreBtn) return;
  moreBtn.textContent = "더 보기";
  moreBtn.style.display = reachedEnd ? "none" : "block";
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