// ============================================
// roles.js — 권한 한곳 정의 (모든 페이지가 이걸 import 해서 사용)
//  역할: student / merchant / vip(담임) / teacher(교사) / admin
//  ※ 페이지마다 role 문자열을 직접 비교하지 말고 여기 함수를 쓰세요.
// ============================================

export const ROLES = {
    STUDENT:  'student',
    MERCHANT: 'merchant',
    VIP:      'vip',       // 담임 교사
    TEACHER:  'teacher',   // 일반 교사
    ADMIN:    'admin',
  };
  
  const norm = (r) => String(r || '').trim().toLowerCase();
  
  // ── 권한 판정 ───────────────────────────────────────────────
  // 상인 행위(물품 판매/판매 트랜잭션) 가능?  merchant·vip·teacher·admin
  export function canSell(role){
    return ['merchant','vip','teacher','admin'].includes(norm(role));
  }
  
  // 나무 보기 가능?  vip·teacher·admin (일반 학생·상인은 불가)
  export function canViewTree(role){
    return ['vip','teacher','admin'].includes(norm(role));
  }
  
  // 역할부여(역할 지정) 페이지 접근 가능?  vip·admin
  export function canManageRoles(role){
    return ['vip','admin'].includes(norm(role));
  }
  
  // 교직원 여부 (학년/반 0, 그룹 없음으로 다루는 쪽)
  export function isStaff(role){
    return ['vip','teacher','admin'].includes(norm(role));
  }
  
  // 판매 처리 시 '자기 학급 물품만' 가능한 역할 (merchant·vip).
  //  teacher·admin 은 학급이 0이므로 제한 없이 모든 반 처리 가능.
  export function isClassBoundSeller(role){
    return ['merchant','vip'].includes(norm(role));
  }
  
  // ── 역할부여 로직 ───────────────────────────────────────────
  // 이 사람이 "지정해 줄 수 있는" 역할 목록 (드롭다운에 넣을 값)
  export function assignableRoles(assignerRole){
    switch(norm(assignerRole)){
      case 'admin': return ['student','merchant','vip','teacher','admin']; // 전체
      case 'vip':   return ['student','merchant'];                          // 두 가지만
      default:      return [];                                              // 권한 없음
    }
  }
  
  // 한글 라벨 (화면 표시용)
  export function roleLabel(role){
    return ({
      student:'학생', merchant:'상인', vip:'담임', teacher:'교사', admin:'관리자',
    })[norm(role)] || norm(role);
  }
  
  /**
   * 핵심 검증: assigner(지정하는 사람)가 target(대상 계정)의 역할을 newRole 로 바꿀 수 있는가?
   *  - UI에서 옵션을 숨겨도, 실제 저장 직전에 이 함수로 한 번 더 막아야 안전합니다.
   *  - (서버단 Firestore 규칙으로도 똑같이 막아야 진짜 안전 — 규칙은 따로 작성)
   * @param {{role:string, grade?:number, classNo?:number}} assigner  로그인한 사람의 user 문서
   * @param {{role:string, grade?:number, classNo?:number}} target    바꾸려는 대상 user 문서
   * @param {string} newRole
   * @returns {boolean}
   */
  export function canAssignTarget(assigner, target, newRole){
    const aRole = norm(assigner?.role);
    const tRole = norm(target?.role);
    const nRole = norm(newRole);
  
    // 지정하려는 역할이 애초에 이 사람이 줄 수 있는 범위인지
    if(!assignableRoles(aRole).includes(nRole)) return false;
  
    // 관리자: 누구든, 어떤 역할이든 가능
    if(aRole === 'admin') return true;
  
    // 담임(vip): 자기 학급의 '학생/상인' 계정만, '학생/상인'으로만 변경 가능
    if(aRole === 'vip'){
      const sameClass = Number(assigner.grade)   === Number(target.grade)
                     && Number(assigner.classNo) === Number(target.classNo);
      const targetIsSwitchable = ['student','merchant'].includes(tRole); // 다른 담임/교사/관리자 계정은 못 건드림
      return sameClass && targetIsSwitchable && ['student','merchant'].includes(nRole);
    }
  
    return false;
  }