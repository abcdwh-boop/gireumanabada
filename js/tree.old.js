// ============================================
// 학급별 나무 (전자칠판용) — 재귀 가지 + 잎갓(canopy) 분산 잎
// ============================================
import { db } from './firebase-config.js';
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const pad2 = (n) => String(n).padStart(2, "0");

const LEAVES_CAP = 250;   // 가득 찬 나무 (250장)
const LEAF_PER   = 2;     // 2리프당 잎 1장
const POINT_COLORS = ["#e6b800", "#e0902a", "#d4582a", "#cc3f6a", "#a96bd6"];

// ▼▼ 잎갓 모양 조절 — 이 숫자들만 바꾸면 됩니다 ▼▼
const CANOPY_SCALE   = 1.0;  // 잎갓 전체 크기 (↑클수록 넓게 퍼짐)
const CANOPY_MARGIN  = 50;    // 가지 끝보다 얼마나 더 부풀릴지(px)
const CANOPY_LIFT    = 15;    // 잎갓을 위로 올리는 정도(px)
const LEAF_GAP       = 10;    // 잎 사이 최소 간격 (↑클수록 겹침↓·더 흩어짐)
const LEAF_SCALE_MIN = 1.5;   // 잎 최소 크기
const LEAF_SCALE_VAR = 0.8;   // 잎 크기 편차 (실제 = MIN ~ MIN+VAR)
// ▲▲ 여기까지 ▲▲

let leafDefs = [];
let rendered = 0;
let unsub = null;

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function buildTree(classKey){
  const rng = mulberry32(hashStr(classKey) ^ 0x9e3779b9);

  // 1) 가지 (재귀, 각도·길이 불규칙) — 기존과 동일
  const segs = [];
  function grow(x, y, ang, len, w, depth){
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    segs.push({ x1: x, y1: y, x2, y2, w });
    if(depth <= 0 || w < 2.6) return;
    if(depth <= 1 && rng() < 0.08) return;
    const r = rng();
    const kids = depth >= 4 ? 2 : (r < 0.10 ? 1 : (r < 0.90 ? 2 : 3));
    const spread = 0.30 + rng() * 0.32;
    for(let k = 0; k < kids; k++){
      let da;
      if(kids === 1) da = (rng() - 0.5) * 0.60;
      else { const t = (k / (kids - 1) - 0.5); da = t * spread * 2 + (rng() - 0.5) * 0.45; }
      grow(x2, y2, clamp(ang + da, -1.2, 1.2), len * (0.62 + rng() * 0.28), w * (0.66 + rng() * 0.06), depth - 1);
    }
  }
  grow(500, 675, 0, 152, 34, 5);

  // 2) 잎갓(canopy) 타원 계산: 가는 가지 끝들의 분포로 영역을 잡음
  const tips = [];
  for(const s of segs){ if(s.w < 16) tips.push({ x: s.x2, y: s.y2 }); }
  if(!tips.length) tips.push({ x: 500, y: 320 });
  let cx = 0, cy = 0;
  for(const t of tips){ cx += t.x; cy += t.y; }
  cx /= tips.length; cy /= tips.length;
  cy -= CANOPY_LIFT;
  let rx = 0, ry = 0;
  for(const t of tips){ rx = Math.max(rx, Math.abs(t.x - cx)); ry = Math.max(ry, Math.abs(t.y - cy)); }
  rx = (rx + CANOPY_MARGIN) * CANOPY_SCALE;
  ry = (ry + CANOPY_MARGIN) * CANOPY_SCALE;
  const lobePhase = rng() * Math.PI * 2;   // 외곽을 살짝 유기적으로

  // 잎 자리 하나 뽑기 (타원 안 균일 분포 + 약한 물결 외곽 + 아래쪽은 덜 퍼짐)
  function sample(){
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng());
    const lobe = 1 - 0.14 * Math.sin(ang * 3 + lobePhase);
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const downScale = ey > 0 ? 0.7 : 1;     // 아래쪽(줄기 방향)은 덜 퍼지게
    return { x: cx + ex * rad * rx * lobe, y: cy + ey * rad * ry * lobe * downScale };
  }

  // 3) 잎 자리: 타원 안에 흩뿌리되 서로 너무 가까우면 거름(겹침↓)
  const spots = [];
  const minD2 = LEAF_GAP * LEAF_GAP;
  let tries = 0; const maxTries = LEAVES_CAP * 40;
  while(spots.length < LEAVES_CAP && tries < maxTries){
    tries++;
    const p = sample();
    let ok = true;
    for(const s of spots){ const dx = s.x - p.x, dy = s.y - p.y; if(dx*dx + dy*dy < minD2){ ok = false; break; } }
    if(ok) spots.push(p);
  }
  while(spots.length < LEAVES_CAP) spots.push(sample());   // 간격 때문에 못 채웠으면 마저 채움

  // 4) 잎 정의: 중심에서 바깥으로 살짝 펼침(splay) + 색
  const defs = [];
  for(let i = 0; i < spots.length; i++){
    const sp = spots[i];
    const dir = Math.atan2(sp.y - cy, sp.x - cx);
    const rotRad = dir + Math.PI / 2 + (rng() - 0.5) * 1.4;   // 바깥으로 펼치되 충분히 랜덤
    const rot = rotRad * 180 / Math.PI;
    const scale = LEAF_SCALE_MIN + rng() * LEAF_SCALE_VAR;
    let color;
    if(rng() < 0.12) color = POINT_COLORS[Math.floor(rng() * POINT_COLORS.length)];
    else { const h = 80 + rng() * 60, s = 48 + rng() * 22, l = 30 + rng() * 20; color = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`; }
    defs.push({ x: sp.x, y: sp.y, rot, scale, color });
  }
  return { segs, defs };
}

function drawBranches(segs){
  const g = $("branches");
  g.innerHTML = "";
  for(const s of segs){
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", s.x1.toFixed(1)); ln.setAttribute("y1", s.y1.toFixed(1));
    ln.setAttribute("x2", s.x2.toFixed(1)); ln.setAttribute("y2", s.y2.toFixed(1));
    ln.setAttribute("stroke", "#7a5230");
    ln.setAttribute("stroke-width", Math.max(2, s.w).toFixed(1));
    ln.setAttribute("stroke-linecap", "round");
    g.appendChild(ln);
  }
}

function leafNode(d, isNew){
  const g = document.createElementNS(NS, "g");
  g.setAttribute("transform", `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) rotate(${d.rot.toFixed(1)}) scale(${d.scale.toFixed(2)})`);

  // 흔들림 전용 래퍼 (잎마다 속도·시작 시점을 달리해 자연스럽게)
  const sway = document.createElementNS(NS, "g");
  sway.setAttribute("class", "leaf-sway");
  sway.style.animationDuration = (2.8 + Math.random() * 1.6).toFixed(2) + "s";  // 2.8~4.4초
  sway.style.animationDelay    = (-Math.random() * 4).toFixed(2) + "s";          // 시작점 분산

  const inner = document.createElementNS(NS, "g");
  inner.setAttribute("class", "leaf-inner" + (isNew ? " leaf-new" : ""));
  const leaf = document.createElementNS(NS, "path");
  leaf.setAttribute("d", "M0,-15 C9,-8 9,9 0,18 C-9,9 -9,-8 0,-15 Z");
  leaf.setAttribute("fill", d.color);
  const vein = document.createElementNS(NS, "path");
  vein.setAttribute("d", "M0,-12 L0,15");
  vein.setAttribute("stroke", "rgba(0,0,0,.16)"); vein.setAttribute("stroke-width", "1"); vein.setAttribute("fill", "none");
  inner.appendChild(leaf); inner.appendChild(vein);
  sway.appendChild(inner);
  g.appendChild(sway);
  return g;
}

function update(total){
  const target = Math.min(leafDefs.length, LEAVES_CAP, Math.floor(total / LEAF_PER));
  $("leafTotal").textContent = total;
  $("leafCount").textContent = target;
  const box = $("leaves");
  if(target > rendered){
    for(let i = rendered; i < target; i++) box.appendChild(leafNode(leafDefs[i], true));
  } else if(target < rendered){
    while(box.childNodes.length > target) box.removeChild(box.lastChild);
  }
  rendered = target;
}

function setClass(classKey, label){
  if(unsub){ unsub(); unsub = null; }
  const { segs, defs } = buildTree(classKey);
  drawBranches(segs);
  leafDefs = defs; rendered = 0;
  $("leaves").innerHTML = "";
  $("treeLabel").textContent = label;
  unsub = onSnapshot(doc(db, "classStats", classKey), (snap) => {
    update(snap.exists() ? (snap.data().leafTotal || 0) : 0);
  }, () => {});
}

async function init(){
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
init();