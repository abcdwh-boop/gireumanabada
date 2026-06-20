// createUsers.js — 길음 아나바다 익명 계정 일괄 생성 (Firebase Admin SDK)
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");

const serviceAccount = require("./serviceAccount.json");
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();

const DOMAIN = "gireum.sen.ms.kr";
const INIT_PASSWORD = "000000";
const CSV_PATH = "./students.csv";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseCSV(text){
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== "");
  lines.shift();                       // 헤더 줄 버림
  return lines.map(l => l.split(",").map(c => c.trim()));
}

async function main(){
  const rows = parseCSV(fs.readFileSync(CSV_PATH, "utf8"));
  console.log(`총 ${rows.length}명 처리 시작...\n`);

  let ok = 0, skip = 0, fail = 0;
  for(let i = 0; i < rows.length; i++){
    const [studentId, grade, classNo, groupId, role] = rows[i];
    if(!studentId){ skip++; continue; }

    const id = studentId.toLowerCase();
    const email = `${id}@${DOMAIN}`;
    const roleNorm = (role || "").trim().toLowerCase();
    const codePart = id.replace(/^[0-9]+/, "");
    const name = (roleNorm === "admin") ? "관리자" : (codePart || id);

    try {
      const user = await auth.createUser({ email, password: INIT_PASSWORD });
      await db.doc(`users/${user.uid}`).set({
        studentId: id,
        name,
        grade: Number(grade),
        classNo: Number(classNo),
        groupId: groupId || "",
        role: roleNorm || "student",
        balance: (roleNorm === "admin") ? 0 : 3,
        leaf: 0,
        tradeCount: 0,
        mustChangePassword: true,
        wishlist: []
      });
      ok++;
      if(ok % 50 === 0) console.log(`  ...${ok}명 완료`);
    } catch(e){
      if(e.code === "auth/email-already-exists" || e.code === "auth/email-already-in-use"){
        console.log(`⚠️ 이미 있음(건너뜀): ${id}`); skip++;
      } else if(e.code === "auth/too-many-requests"){
        console.log(`⏳ 잠깐 쉬고 재시도: ${id}`);
        await sleep(5000); i--; continue;   // 같은 줄 다시
      } else {
        console.log(`❌ 실패: ${id} → ${e.code || e.message}`); fail++;
      }
    }
  }
  console.log(`\n완료! 성공 ${ok} / 건너뜀 ${skip} / 실패 ${fail}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });