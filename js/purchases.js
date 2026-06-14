// ============================================
// 내 구매 내역
// ============================================
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let me = null;

onAuthStateChanged(auth, async (user) => {
  if(!user){ location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  me = { uid: user.uid, profile: snap.exists() ? snap.data() : {} };
  await loadPurchases();
});

async function loadPurchases(){
  const box = $("list");
  const sid = me.profile.studentId;
  const snap = await getDocs(query(collection(db, "items"), where("buyerStudentId", "==", sid)));
  if(snap.empty){ box.innerHTML = `<p class="greeting">아직 구매한 물건이 없어요.</p>`; return; }

  const items = snap.docs.map(d => d.data());
  items.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

  let totalG = 0, totalLeaf = 0;
  items.forEach(it => { totalG += (it.soldPrice || 0); totalLeaf += (it.leafValue || 0); });

  box.innerHTML =
    `<p class="greeting">총 ${items.length}건 · ${totalG}G 사용 · 리프 ${totalLeaf} 적립</p>` +
    items.map(it => `<div class="item-card">
      <div class="row1"><span class="nm">${it.name}</span><span class="badge sold">구매완료</span></div>
      <div class="ino">${it.itemNo} · ${it.category}</div>
      <div class="meta">${it.soldPrice ?? it.price}G · +${it.leafValue} 리프</div>
    </div>`).join("");
}