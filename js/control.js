// ============================================
// 운영 제어 (관리자: 마켓 페이즈 전환)
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const PHASES = [
  { key: "pre-open", label: "마켓 시작 전", desc: "등록·수정·찜 가능" },
  { key: "A-open",   label: "A마켓 열림",   desc: "A로 지정한 물품만 거래" },
  { key: "B-open",   label: "B마켓 열림",   desc: "B + A 미판매분 거래" },
  { key: "closed",   label: "마켓 마감",     desc: "거래 잠금 · 후기" },
];
const labelOf = (k) => (PHASES.find(p => p.key === k)?.label) || k;
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  if(me.profile.role !== "admin"){
    $("guard").textContent = "이 화면은 관리자만 사용할 수 있어요.";
    $("panel").style.display = "none";
    return;
  }
  renderButtons();
  // 현재 페이즈 실시간 반영
  onSnapshot(doc(db, "config", "phaseSchedule"), (s) => {
    const cur = s.exists() ? s.data().phase : "pre-open";
    $("current").textContent = labelOf(cur);
    document.querySelectorAll(".phase-btn").forEach(b => b.classList.toggle("on", b.dataset.key === cur));
  });
});

function renderButtons(){
  $("buttons").innerHTML = PHASES.map(p =>
    `<button class="phase-btn" data-key="${p.key}">
       <span class="pb-label">${p.label}</span>
       <span class="pb-desc">${p.desc}</span>
     </button>`).join("");
  document.querySelectorAll(".phase-btn").forEach(b =>
    b.addEventListener("click", () => setPhase(b.dataset.key)));
}

async function setPhase(key){
  if(!confirm(`마켓 단계를 "${labelOf(key)}"(으)로 바꿀까요?`)) return;
  try {
    await updateDoc(doc(db, "config", "phaseSchedule"), { phase: key });
    $("msg").style.color = "#2d5f3f";
    $("msg").textContent = `변경됨 → ${labelOf(key)}`;
  } catch(e){
    $("msg").style.color = "#c53030";
    $("msg").textContent = "변경 오류: " + (e.code || e.message);
  }
}