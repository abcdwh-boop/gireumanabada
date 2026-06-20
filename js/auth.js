// ============================================
// 로그인 / 비밀번호 변경 / 로그아웃 / 페이지 보호
// ============================================
import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, updatePassword, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DOMAIN = "gireum.sen.ms.kr";

// ID + 비번으로 로그인. 성공하면 Firestore 사용자 정보도 같이 읽어 돌려줌
export async function loginWithStudentId(studentId, password){
  const email = `${studentId}@${DOMAIN}`;
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  return { user: cred.user, profile: snap.exists() ? snap.data() : null };
}

// 새 비밀번호로 변경 + mustChangePassword 끄기
export async function changePassword(newPassword){
  const user = auth.currentUser;
  if(!user) throw new Error("로그인 상태가 아닙니다.");
  await updatePassword(user, newPassword);
  await updateDoc(doc(db, "users", user.uid), { mustChangePassword: false });
}

export async function logout(){
  await signOut(auth);
}

// 페이지 보호: 로그인 안 했으면 로그인 화면으로 되돌려보냄.
// 로그인돼 있으면 callback(user, profile) 실행
export function requireLogin(callback){
  onAuthStateChanged(auth, async (user) => {
    if(!user){ window.location.href = "index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    callback(user, snap.exists() ? snap.data() : null);
  });
}