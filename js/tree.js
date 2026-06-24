// ============================================
// 학급별 나무 (전자칠판용)
//  · 데이터(반 목록 / 리프 합계)는 기존과 동일 — Firestore 그대로 사용
//  · 나무 그리기는 treegen.js 엔진으로 교체 (재귀 가지 + 가지 옆면 분산 잎)
//  ※ treegen.js 를 이 파일과 같은 js/ 폴더에 함께 넣어주세요.
// ============================================
import { db } from './firebase-config.js';
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mountTree, CONFIG } from './treegen.js';

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");

// ── 조절값 (여기 숫자만 바꾸면 됩니다) ───────────────────────────
CONFIG.leafCap     = 250;   // 가득 찬 나무 (기존 LEAVES_CAP)
const LEAF_PER     = 2;     // 2리프당 잎 1장 (기존 LEAF_PER)
CONFIG.trunkWidth  = 50;    // 둥치 굵기 (가지는 0.68배씩 가늘어짐) — 원하면 변경
CONFIG.accentRatio = 0.12;  // 강조색 잎 비율 (기존 12%)
CONFIG.accents     = ["#e6b800", "#e0902a", "#d4582a", "#cc3f6a", "#a96bd6"]; // 기존 POINT_COLORS
// ────────────────────────────────────────────────────────────────

const svg = document.querySelector('svg');   // 안에 #branches, #leaves 포함
let currentKey = null;
let unsub = null;

// 리프 합계가 바뀔 때마다 호출 (실시간) → 늘어난 잎만 톡 돋아남
function update(classKey, total){
  const { count } = mountTree(svg, { className: classKey, leafTotal: total, leavesPerRipe: LEAF_PER });
  $("leafTotal").textContent = total;   // 거래로 모은 리프 합계
  $("leafCount").textContent = count;   // 화면에 달린 잎 장수
}

function setClass(classKey, label){
  if(unsub){ unsub(); unsub = null; }
  currentKey = classKey;
  $("treeLabel").textContent = label;
  // classStats/{반키}.leafTotal 실시간 구독 (기존과 동일)
  unsub = onSnapshot(doc(db, "classStats", classKey), (snap) => {
    update(classKey, snap.exists() ? (snap.data().leafTotal || 0) : 0);
  }, () => {});
}

async function init(){
  ensureLeafStyles();
  // 반 목록: config/groupMapping → groups (기존과 동일)
  const gm = await getDoc(doc(db, "config", "groupMapping"));
  const groups = gm.exists() ? (gm.data().groups || {}) : {};
  const classes = [];
  Object.values(groups).forEach(g => (g.classes || []).forEach(c => classes.push({ grade: g.grade, classNo: c })));
  classes.sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);

  const sel = $("classSel");
  sel.innerHTML = classes.map(c =>
    `<option value="${c.grade}-${pad2(c.classNo)}" data-label="${c.grade}학년 ${c.classNo}반">${c.grade}-${c.classNo}</option>`
  ).join("");
  sel.addEventListener("change", () => {
    const opt = sel.options[sel.selectedIndex];
    setClass(sel.value, opt.dataset.label);
  });

  if(classes.length){
    const first = sel.options[0];
    setClass(first.value, first.dataset.label);
  } else {
    $("treeLabel").textContent = "반 정보가 없어요 (seed 먼저)";
  }
}

// 잎 애니메이션 CSS 주입 (tree.html 안 건드려도 되도록, 기존 CSS와 안 겹치게 tg- 접두어)
function ensureLeafStyles(){
  if (document.getElementById('treegen-style')) return;
  const css = `
  .leaf-pop  { transform-box: fill-box; transform-origin: 50% 100%; animation: tg-sprout .6s cubic-bezier(.2,1.5,.4,1) both; }
  .leaf-sway { transform-box: fill-box; transform-origin: 50% 100%; animation: tg-sway 3.4s ease-in-out infinite; }
  @keyframes tg-sprout { 0%{transform:scale(.05);opacity:0} 55%{opacity:1} 100%{transform:scale(1);opacity:1} }
  @keyframes tg-sway   { 0%,100%{transform:rotate(-3.2deg)} 50%{transform:rotate(3.2deg)} }
  @media (prefers-reduced-motion: reduce){ .leaf-pop,.leaf-sway{ animation:none !important } }`;
  const s = document.createElement('style');
  s.id = 'treegen-style'; s.textContent = css;
  document.head.appendChild(s);
}

init();