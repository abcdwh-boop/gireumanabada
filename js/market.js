// ============================================
// 시장 구경 + 찜  (페이지네이션 20개 + 카테고리 정렬)
//  · 그룹 범위: 학생·상인은 '자기 그룹(groupId)' 물품만 / 담임·교사·관리자는 전체
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc, collection, getDocs,
  query, where, orderBy, limit, startAfter,
  arrayUnion, arrayRemove, serverTimestamp
}
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { isStaff } from './roles.js';

const $ = (id) => document.getElementById(id);

const PAGE = 20;             // 한 번에 불러오는 개수

let me = null;
let allItems = [];           // 지금까지 불러온 물품 [{ id, ...data }]
let wishlist = new Set();    // 찜한 itemId 모음
let phase = "pre-open";

let groupScoped = false;     // 학생·상인이면 true (자기 그룹만)
let classScoped = false;     // 담임(vip)이면 true (자기 학급만)
let canModerate = false;     // 관리자·담임이면 true (등록자 표시 + 삭제)
let myGroup = null;          // 내 groupId

let lastDoc = null;          // 다음 페이지 커서
let reachedEnd = false;      // 더 없으면 true
let loading = false;
let moreBtn = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  wishlist = new Set(me.profile.wishlist || []);

  // 노출 범위 결정
  const role = String(me.profile.role || "").toLowerCase();
  groupScoped = !isStaff(role);                        // 학생·상인: 자기 그룹만
  classScoped = (role === "vip");                      // 담임: 자기 학급만
  canModerate = (role === "admin" || role === "vip");  // 관리자·담임: 등록자 표시 + 삭제
  myGroup = me.profile.groupId || "";

  await loadPhase();
  await loadCategories();
  setupMoreBtn();
  await loadPage(true);      // 첫 20개

  $("search").addEventListener("input", render);          // 검색은 불러온 목록 안에서
  $("catFilter").addEventListener("change", () => classScoped ? render() : loadPage(true));
  $("refreshBtn").addEventListener("click", () => loadPage(true));
});

async function loadPhase() {
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
function setBanner() {
  const el = $("marketBanner");
  if (!el) return;
  if (phase === "A-open") {
    el.textContent = "🅰️ A마켓 진행 중";
    el.style.background = "#0f8a7e";   // A: 청록
    el.style.display = "block";
  } else if (phase === "B-open") {
    el.textContent = "🅱️ B마켓 진행 중";
    el.style.background = "#e07a2c";   // B: 주황
    el.style.display = "block";
  } else {
    el.style.display = "none";         // 시작 전·마감은 배너 숨김(아래 안내문만)
  }
}

async function loadCategories() {
  const fp = await getDoc(doc(db, "config", "footprintTable"));
  const cats = fp.exists() ? (fp.data().categories || []) : [];
  $("catFilter").innerHTML = `<option value="">전체 구분</option>` +
    cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

// 현재 그룹 + 페이즈 + 선택 카테고리에 맞는 쿼리 조건 만들기
function buildConstraints() {
  const cat = $("catFilter").value;
  const c = [];

  // 그룹: 학생·상인은 자기 그룹 물품만 (교직원은 조건 없음 = 전체)
  if (groupScoped) c.push(where("groupId", "==", myGroup));

  // 페이즈별 마켓 노출 (서버에서 거름)
  if (phase === "A-open") c.push(where("market", "==", "A"));
  else if (phase === "B-open") c.push(where("market", "in", ["A", "B"]));
  // pre-open / closed 은 마켓 조건 없음 (전부 노출)

  // 카테고리: 고르면 그 품목만 / 전체면 품목별로 묶어서 정렬
  if (cat) {
    c.push(where("category", "==", cat));
    c.push(orderBy("itemNo"));
  } else {
    c.push(orderBy("category"));
    c.push(orderBy("itemNo"));
  }

  c.push(limit(PAGE));
  if (lastDoc) c.push(startAfter(lastDoc));
  return c;
}

async function loadPage(reset) {
  if (loading) return;

  // 학생·상인인데 그룹이 지정 안 됐으면 안내만 (전체가 보이면 안 되므로 막음)
  if (groupScoped && !myGroup) {
    $("list").innerHTML = `<p class="greeting">아직 그룹이 지정되지 않았어요.<br><small>관리자/담임 선생님께 문의해주세요.</small></p>`;
    if (moreBtn) moreBtn.style.display = "none";
    return;
  }

  // 담임(vip): 자기 학급 물품 전체를 한 번에 (equality 쿼리라 복합색인 불필요)
  if (classScoped) { await loadClassItems(); return; }

  if (reset) { allItems = []; lastDoc = null; reachedEnd = false; }
  if (reachedEnd) return;

  loading = true;
  if (reset) $("list").innerHTML = "불러오는 중…";
  if (moreBtn) moreBtn.textContent = "불러오는 중…";

  try {
    const snap = await getDocs(query(collection(db, "items"), ...buildConstraints()));
    if (snap.docs.length < PAGE) reachedEnd = true;
    if (snap.docs.length) lastDoc = snap.docs[snap.docs.length - 1];
    snap.docs.forEach(d => allItems.push({ id: d.id, ...d.data() }));
    render();
  } catch (e) {
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

// 담임: 자기 학급(grade+classNo) 물품 전체 로드 — equality 쿼리라 복합색인 불필요
async function loadClassItems() {
  if (loading) return;
  loading = true;
  $("list").innerHTML = "불러오는 중…";
  try {
    const snap = await getDocs(query(collection(db, "items"),
      where("grade", "==", Number(me.profile.grade)),
      where("classNo", "==", Number(me.profile.classNo))));
    allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    reachedEnd = true;   // 한 번에 다 불러오므로 '더 보기' 없음
    render();
  } catch (e) {
    console.error(e);
    $("list").innerHTML = `<p class="greeting">목록을 불러오지 못했어요.<br><small>${e.code || e.message}</small></p>`;
  } finally {
    loading = false;
    updateMoreBtn();
  }
}

function render() {
  const kw = $("search").value.trim().toLowerCase();
  const cat = $("catFilter").value;

  // 살 수 있는 것만 (판매완료·삭제 제외) + 카테고리 + 검색어
  let view = allItems.filter(it => it.status === "registered" || it.status === "onSale");
  if (cat) view = view.filter(it => it.category === cat);
  if (kw) view = view.filter(it => (it.name || "").toLowerCase().includes(kw));

  const box = $("list");
  if (view.length === 0) {
    box.innerHTML = `<p class="greeting">해당하는 물품이 없어요.</p>`;
    updateMoreBtn();
    return;
  }

  box.innerHTML = view.map(it => {
    const mine = it.sellerUid === me.uid;
    const liked = wishlist.has(it.id);
    const heart = mine ? "내 물건" : (liked ? "♥ 찜" : "♡ 찜");
    // 관리자·담임에게만: 등록자 ID + 삭제 버튼 (학생·상인 화면엔 아예 안 나옴)
    const mod = canModerate
      ? `<div class="mod-row" style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px dashed #e0c0c0;">
           <span style="font-size:12px;color:#a03050;font-weight:700;">등록자: ${it.sellerStudentId || "?"}</span>
           <button class="del-item" data-del="${it.id}" style="border:1px solid #c0392b;background:#fff;color:#c0392b;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer;">삭제</button>
         </div>`
      : "";
    return `<div class="item-card">
      <div class="row1">
        <span class="nm">${it.name}</span>
        <button class="heart ${liked ? "on" : ""}" data-id="${it.id}" ${mine ? "disabled" : ""}>${heart}</button>
      </div>
      <div class="ino">${it.itemNo} · ${it.category}${it.condition ? " · " + it.condition : ""}</div>
      <div class="meta">${it.price}G · 사면 +${it.leafValue} 리프</div>
      ${it.story ? `<div class="story">${it.story}</div>` : ""}
      ${mod}
    </div>`;
  }).join("");

  box.querySelectorAll(".heart:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => toggleWish(btn.dataset.id, btn));
  });
  box.querySelectorAll(".del-item").forEach(btn => {
    btn.addEventListener("click", () => hideItem(btn.dataset.del));
  });

  updateMoreBtn();
}

// 관리자·담임: 물품을 시장에서 삭제(숨김) — status를 removed 로 (되돌림·최종삭제는 콘솔에서)
async function hideItem(id) {
  const it = allItems.find(x => x.id === id);
  if (!confirm(`"${it?.name || "이 물품"}" 을(를) 시장에서 삭제할까요?\n학생들 화면에서 사라집니다.`)) return;
  try {
    await updateDoc(doc(db, "items", id), { status: "removed", updatedAt: serverTimestamp() });
    allItems = allItems.filter(x => x.id !== id);
    render();
  } catch (e) {
    alert("삭제 오류: " + (e.code || e.message));
  }
}

function setupMoreBtn() {
  moreBtn = document.createElement("button");
  moreBtn.id = "moreBtn";
  moreBtn.textContent = "더 보기";
  moreBtn.style.cssText =
    "display:none;width:100%;margin-top:12px;height:46px;border:1px solid #2d5f3f;" +
    "border-radius:8px;background:#fff;color:#2d5f3f;font-size:15px;font-weight:700;cursor:pointer;";
  $("list").insertAdjacentElement("afterend", moreBtn);
  moreBtn.addEventListener("click", () => loadPage(false));
}

function updateMoreBtn() {
  if (!moreBtn) return;
  moreBtn.textContent = "더 보기";
  moreBtn.style.display = reachedEnd ? "none" : "block";
}

async function toggleWish(itemId, btn) {
  const liked = wishlist.has(itemId);
  btn.disabled = true;
  try {
    const userRef = doc(db, "users", me.uid);
    if (liked) {
      await updateDoc(userRef, { wishlist: arrayRemove(itemId) });
      wishlist.delete(itemId);
    } else {
      await updateDoc(userRef, { wishlist: arrayUnion(itemId) });
      wishlist.add(itemId);
    }
    btn.classList.toggle("on", !liked);
    btn.textContent = !liked ? "♥ 찜" : "♡ 찜";
  } catch (e) {
    alert("찜 오류: " + (e.code || e.message));
  } finally {
    btn.disabled = false;
  }
}