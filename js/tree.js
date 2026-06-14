// ============================================
// 학급별 나무 (전자칠판용) — 로그인 불필요
// ============================================
import { db } from './firebase-config.js';
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const pad2 = (n) => String(n).padStart(2, "0");

const LEAVES_CAP = 100;   // 가득 찬 나무 = 100장
const LEAF_PER   = 5;     // 5리프당 잎 1장
const CANOPY = { cx: 500, cy: 235, rx: 285, ry: 175 };
const POINT_COLORS = ["#e6b800", "#e0902a", "#d4582a", "#cc3f6a", "#a96bd6"];

let leafDefs = [];
let rendered = 0;
let unsub = null;

// 시드 기반 난수 (반마다 고정된 잎 배치)
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function buildLeafDefs(classKey){
  const rng = mulberry32(hashStr(classKey) ^ 0x9e3779b9);
  const defs = [];
  for(let i=0;i<LEAVES_CAP;i++){
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng());
    const x = CANOPY.cx + Math.cos(ang) * rad * CANOPY.rx;
    const y = CANOPY.cy + Math.sin(ang) * rad * CANOPY.ry - (1 - rad) * 18;
    const rot = -38 + rng() * 76;
    const scale = 0.85 + rng() * 0.7;
    let color;
    if(rng() < 0.12){
      color = POINT_COLORS[Math.floor(rng() * POINT_COLORS.length)];   // 포인트 색
    } else {
      const h = 78 + rng() * 62;   // 연두 ~ 진초록
      const s = 45 + rng() * 22;
      const l = 30 + rng() * 20;
      color = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
    }
    defs.push({ x, y, rot, scale, color });
  }
  return defs;
}

function leafNode(d, isNew){
  const g = document.createElementNS(NS, "g");
  g.setAttribute("transform", `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) rotate(${d.rot.toFixed(1)}) scale(${d.scale.toFixed(2)})`);
  const inner = document.createElementNS(NS, "g");
  inner.setAttribute("class", "leaf-inner" + (isNew ? " leaf-new" : ""));
  const leaf = document.createElementNS(NS, "path");
  leaf.setAttribute("d", "M0,-11 C6.5,-6 6.5,7 0,13 C-6.5,7 -6.5,-6 0,-11 Z");
  leaf.setAttribute("fill", d.color);
  const vein = document.createElementNS(NS, "path");
  vein.setAttribute("d", "M0,-9 L0,11");
  vein.setAttribute("stroke", "rgba(0,0,0,.18)");
  vein.setAttribute("stroke-width", "0.8");
  inner.appendChild(leaf); inner.appendChild(vein);
  g.appendChild(inner);
  return g;
}

function update(total){
  const target = Math.min(LEAVES_CAP, Math.floor(total / LEAF_PER));
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
  leafDefs = buildLeafDefs(classKey);
  rendered = 0;
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