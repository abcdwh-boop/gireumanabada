// ============================================
// Firebase 연결 정보 (가게 열쇠)
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ⚠️ 여기에 자네가 받은 firebaseConfig를 그대로 붙여넣게
const firebaseConfig = {
  apiKey: "AIzaSyAwP1kE1uQd90I4AD7HGmwo36R9oheTrOQ",
  authDomain: "gireum-anabada-30ebc.firebaseapp.com",
  projectId: "gireum-anabada-30ebc",
  storageBucket: "gireum-anabada-30ebc.firebasestorage.app",
  messagingSenderId: "57958909801",
  appId: "1:57958909801:web:95386662e525f994b3dff8"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// 다른 파일에서 쓸 수 있게 내보냄
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { firebaseConfig };