// ============================================
// 학급별 나무 (전자칠판용) — 재귀 가지 + 랜덤 잎
// ============================================
import { db } from './firebase-config.js';
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const pad2 = (n) => String(n).padStart(2, "0");

const LEAVES_CAP = 100;   // 가득 찬 나무
const LEAF_PER   = 5;     // 5리프당 잎 1장
const POINT_COLORS = ["#e6b800", "#e0902a", "#d4582a", "#cc3f6a", "#a96bd6"];

let leafDefs = [];
let rendered = 0;
let unsub = null;

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 반마다 고정된 나무(가지 + 잎 자리/색) 생성
function buildTree(classKey){
  const rng = mulberry32(hashStr(classKey) ^ 0x9e3779b9);

  // 1) 가지 (재귀, 각도·길이 불규칙)
  const segs = [];
  function grow(x, y, ang, len, w, depth){
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    segs.push({ x1: x, y1: y, x2, y2, w });
    if(depth <= 0 || w < 2.6) return;
    if(depth <= 1 && rng() < 0.08) return;           // 가끔 일찍 멈춤 → 들쭉날쭉
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

  // 2) 잎 자리: 가는 가지 위 아무 데나 (끝뿐 아니라 중간도)
  const spots = [];
  for(const s of segs){
    if(s.w < 12){
      const n = s.w < 6 ? 3 : 2;
      const a = Math.atan2(s.x2 - s.x1, -(s.y2 - s.y1));
      for(let i = 0; i < n; i++){
        const t = 0.1 + rng() * 0.9;
        spots.push({ x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t, a });
      }
    }
  }
  for(let i = spots.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }

  // 3) 잎 정의 (최대 100)
  const defs = [];
  for(let i = 0; i < Math.min(LEAVES_CAP, spots.length); i++){
    const sp = spots[i];
    const rot = sp.a * 180 / Math.PI + (rng() - 0.5) * 100;
    const scale = 1.4 + rng() * 0.8;                  // 면적 ↑
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
  const inner = document.createElementNS(NS, "g");
  inner.setAttribute("class", "leaf-inner" + (isNew ? " leaf-new" : ""));
  const leaf = document.createElementNS(NS, "path");
  leaf.setAttribute("d", "M0,-15 C9,-8 9,9 0,18 C-9,9 -9,-8 0,-15 Z");
  leaf.setAttribute("fill", d.color);
  const vein = document.createElementNS(NS, "path");
  vein.setAttribute("d", "M0,-12 L0,15");
  vein.setAttribute("stroke", "rgba(0,0,0,.16)"); vein.setAttribute("stroke-width", "1"); vein.setAttribute("fill", "none");
  inner.appendChild(leaf); inner.appendChild(vein);
  g.appendChild(inner);
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