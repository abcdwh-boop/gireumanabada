// ============================================
// 구매 후기 (구글폼으로 이동, 학번 자동 채움)
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let me = null;
let form = null;   // { url, entryId }

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };

  const fSnap = await getDoc(doc(db, "config", "reviewForm"));
  form = fSnap.exists() ? fSnap.data() : null;

  // 관리자에게만 설정칸 노출
  if(me.profile.role === "admin"){
    $("adminBox").style.display = "block";
    if(form){ $("formUrl").value = form.url || ""; $("entryId").value = form.entryId || ""; }
    $("saveForm").addEventListener("click", saveForm);
  }
  renderStudent();
});

function renderStudent(){
  const box = $("studentBox");
  if(!form || !form.url || !form.entryId){
    box.innerHTML = `<p class="greeting">후기 폼이 아직 준비되지 않았어요.</p>`;
    return;
  }
  const link = `${form.url}?usp=pp_url&entry.${form.entryId}=${encodeURIComponent(me.profile.studentId)}`;
  box.innerHTML = `<a class="btn-primary btn-block" target="_blank" rel="noopener"
      style="display:block;text-align:center;text-decoration:none;line-height:52px;"
      href="${link}">후기 작성하러 가기 →</a>`;
}

async function saveForm(){
  const url = $("formUrl").value.trim().split("?")[0];   // 물음표 뒷부분 제거
  const entryId = $("entryId").value.trim().replace(/[^0-9]/g, "");
  $("adminMsg").style.color = "#c53030";
  if(!url || !entryId){ $("adminMsg").textContent = "폼 주소와 entry 번호를 모두 입력하세요."; return; }
  try {
    await setDoc(doc(db, "config", "reviewForm"), { url, entryId }, { merge: true });
    form = { url, entryId };
    $("adminMsg").style.color = "#2d5f3f";
    $("adminMsg").textContent = "저장됐어요. 학생 화면에 버튼이 나타납니다.";
    renderStudent();
  } catch(e){
    $("adminMsg").textContent = "저장 오류: " + (e.code || e.message);
  }
}