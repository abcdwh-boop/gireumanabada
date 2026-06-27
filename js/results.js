// ============================================
// 시상 결과: 반별 리프 / 거래량 순위 + CSV 다운로드 (관리자 전용)
//  · 리프  = classStats/{반}.leafTotal  (나무가 보여주는 값과 동일)
//  · 거래량 = 그 반 학생들의 users.tradeCount 합 (거래 1건당 구매·판매 양쪽 +1)
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
const label = (r) => `${r.grade}학년 ${r.classNo}반`;
let rows = [];

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : "";
  if(role !== "admin"){
    $("guard").textContent = "이 화면은 관리자만 볼 수 있어요.";
    return;
  }
  await compute();
});

async function compute(){
  const cls = {};   // key 'g-cc' → { grade, classNo, leaf, trade }
  const keyOf = (g, c) => `${g}-${pad2(c)}`;

  // 1) 반별 리프: classStats
  const cs = await getDocs(collection(db, "classStats"));
  cs.forEach(d => {
    const x = d.data();
    if(!(x.grade >= 1)) return;
    cls[d.id] = { grade: x.grade, classNo: x.classNo, leaf: x.leafTotal || 0, trade: 0 };
  });

  // 2) 반별 거래량: users.tradeCount 합산 (교직원 grade 0 제외)
  const us = await getDocs(collection(db, "users"));
  us.forEach(d => {
    const u = d.data();
    if(!(u.grade >= 1)) return;                  // 교사·관리자(0) 제외
    const k = keyOf(u.grade, u.classNo);
    if(!cls[k]) cls[k] = { grade: u.grade, classNo: u.classNo, leaf: 0, trade: 0 };
    cls[k].trade += (u.tradeCount || 0);
  });

  rows = Object.values(cls).filter(r => r.grade >= 1);
  if(rows.length === 0){
    $("guard").textContent = "집계할 데이터가 없어요. (거래가 아직 없거나 초기화 직후)";
    return;
  }

  $("guard").style.display = "none";
  $("panel").style.display = "block";
  renderBoard("leafBoard", [...rows].sort((a,b)=>b.leaf-a.leaf), "leaf");
  renderBoard("tradeBoard", [...rows].sort((a,b)=>b.trade-a.trade), "trade");

  const topLeaf = [...rows].sort((a,b)=>b.leaf-a.leaf)[0];
  const topTrade = [...rows].sort((a,b)=>b.trade-a.trade)[0];
  $("leafWin").textContent = label(topLeaf);  $("leafWinVal").textContent = `리프 ${topLeaf.leaf}`;
  $("tradeWin").textContent = label(topTrade); $("tradeWinVal").textContent = `거래 ${topTrade.trade}건`;

  $("csvBtn").addEventListener("click", downloadCsv);
}

function renderBoard(tbodyId, sorted, field){
  const top = sorted.length ? sorted[0][field] : null;
  $(tbodyId).innerHTML = sorted.map((r, i) => {
    const isTop = r[field] === top && top > 0;
    return `<tr class="${isTop ? "top" : ""}">
      <td class="rank">${i+1}</td>
      <td>${label(r)}${isTop ? " 🏆" : ""}</td>
      <td class="num">${r[field]}</td>
    </tr>`;
  }).join("");
}

function downloadCsv(){
  const sorted = [...rows].sort((a,b)=> a.grade-b.grade || a.classNo-b.classNo);
  const head = "학년,반,리프합계,거래합계";
  const body = sorted.map(r => `${r.grade},${r.classNo},${r.leaf},${r.trade}`).join("\n");
  const csv = "\uFEFF" + head + "\n" + body;   // BOM: 엑셀에서 한글 안 깨지게
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "아나바다_반별결과.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
