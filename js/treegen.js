/* ════════════════════════════════════════════════════════════════
   treegen.js — 길음중 아나바다 나무 생성/렌더 엔진 (의존성 없음)
   사용:  import { mountTree, CONFIG } from './treegen.js';
   ─────────────────────────────────────────────────────────────────
   핵심 원리
   ① 가지 뼈대를 재귀로 먼저 자라게 한다  → 잎이 붙을 줄기가 항상 존재
   ② 잎은 가지 옆면에 고르게(밀도 min/max 보장) 붙는다 → 끝 뭉침·빈 가지 없음
   ③ 수관(crown)을 둥근 타원 안에 가둔다  → 반마다 형태는 달라도 "늘 나무"
   ④ 반 이름으로 시드를 고정한다           → 같은 반은 항상 같은 나무
   ⑤ 상/하·좌/우 4분면 균형 선택           → 한쪽으로 쏠리지 않음
   ════════════════════════════════════════════════════════════════ */

/* ── 여기 숫자만 바꾸면 모양이 조절됩니다 ─────────────────────── */
export const CONFIG = {
    trunkWidth: 68,         // 둥치(줄기) 굵기. 이 값 하나로 나무 전체 굵기가 비례해서 바뀜
    firstBranchRatio: 0.7,  // 첫 가지 굵기 = trunkWidth × 이 값 (이후 가지는 0.68배씩 가늘어짐)
    leafCap: 230,          // 잎이 가득 찼을 때의 최대 장수
    accentRatio: 0.10,     // 초록 아닌 강조색 잎 비율 (0~1).  0이면 전부 초록
    crown: { cx: 500, cy: 292, rx: 372, ry: 256 },  // 수관 타원(중심/반지름)
    forkY: 520,            // 첫 분기점 높이(작을수록 위). 작게 하면 잎이 위로 올라감
    viewW: 1000, viewH: 720,
    greens: ['#3f7a3f','#4c8a3a','#5a9e46','#69b04a','#79bd54','#8ccf63','#a0d97a'],
    accents: ['#e0518a','#e07b3c','#9c5bd6','#e7b13c','#d65a4a'],
  };
  
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const UP = -Math.PI / 2;
  const BLADE = 'M0 0 C 21 -16.5 23.1 -46.5 0 -69 C -23.1 -46.5 -21 -16.5 0 0 Z';
  const VEIN  = 'M0 -6 L0 -63 M0 -24 L14.7 -33 M0 -24 L-14.7 -33 M0 -42 L12.6 -49.5 M0 -42 L-12.6 -49.5';
  
  function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function inCrown(x,y,slack=1.04){const c=CONFIG.crown;const dx=(x-c.cx)/c.rx,dy=(y-c.cy)/c.ry;return dx*dx+dy*dy<=slack;}
  
  /* ── 나무 한 그루 생성 (순수 데이터) ──────────────────────────── */
  export function generateTree(seedStr){
    const rng = mulberry32(hashStr(String(seedStr)) ^ 0x9e3779b9);
    const C = CONFIG, crown = C.crown;
    const branches = [], anchors = [];
    const baseX = crown.cx, baseY = C.viewH - 28, stemTopY = C.forkY;
    branches.push({ id:0, parent:-1, x1:baseX, y1:baseY, x2:baseX, y2:stemTopY, w:C.trunkWidth, depth:0 });
    const MAX_DEPTH = 6;
  
    function grow(x, y, ang, len, w, depth, parent){
      const x2 = x + Math.cos(ang)*len, y2 = y + Math.sin(ang)*len;
      const id = branches.length;
      branches.push({ id, parent, x1:x, y1:y, x2, y2, w:Math.max(1.1,w), depth });
      const terminal = depth>=MAX_DEPTH || len<20 || !inCrown(x2,y2);
  
      // 모든 가지에 고르게 분포 + 가지당 잎 개수 최소/최대 보장
      if (depth >= 1){
        const SPACING = 22, MINL = 2, MAXL = 5;
        const nL = Math.max(MINL, Math.min(MAXL, Math.round(len / SPACING)));
        for (let i=0;i<nL;i++){
          const t = (i + 0.5) / nL * 0.82 + 0.12;
          const px = x+(x2-x)*t, py = y+(y2-y)*t;
          const side = (i%2===0?1:-1) * (rng()<0.9?1:-1);
          const fwd  = t>0.88 ? 0.3 : 1;
          const dir  = ang + side*(0.5 + rng()*0.6)*fwd;
          const off  = w*0.5 + 1.5;
          const ox = px+Math.cos(dir)*off, oy = py+Math.sin(dir)*off;
          if (inCrown(ox,oy,1.1)) anchors.push({ x:ox, y:oy, ang:dir, depth, br:id });
        }
      }
      if (terminal) return;
  
      const n = depth<2 ? 2 : (rng()<0.42 ? 3 : 2);
      const spread = (0.95 - depth*0.1)*(0.85 + rng()*0.3);
      for (let i=0;i<n;i++){
        const frac = n===1 ? 0 : (i/(n-1))-0.5;
        let childAng = ang + frac*spread*2 + (rng()-0.5)*0.25;
        const bias = 0.12 + depth*0.05;
        childAng = childAng*(1-bias) + UP*bias;
        grow(x2, y2, childAng, len*(0.66+rng()*0.22), w*0.68, depth+1, id);
      }
    }
  
    // 첫 분기: 2갈래. 큰 구조는 균형, 불규칙은 깊은 곳에서만 → 한쪽 쏠림 방지
    const d = 0.06 + rng()*0.09;
    const lens = [150*(1+d), 150*(1-d)];
    if (rng()<0.5) lens.reverse();
    for (let i=0;i<2;i++){
      const a = UP + (i-0.5)*1.28 + (rng()-0.5)*0.18;
      grow(baseX, stemTopY, a, lens[i] + (rng()-0.5)*18, C.trunkWidth * C.firstBranchRatio, 1, 0);
    }
  
    // 잎 후보 풀 (앵커당 잎 1개)
    const pool = [];
    for (const an of anchors){
      const jx = an.x+(rng()-0.5)*6, jy = an.y+(rng()-0.5)*6;
      if (!inCrown(jx,jy,1.14)) continue;
      const lean = (rng()-0.5)*0.7;
      const rot = (an.ang+lean)*180/Math.PI + 90;
      const z = rng();
      const scale = 0.90 + z*0.32 + (rng()-0.5)*0.12;
      pool.push({ x:jx, y:jy, rot, scale, z, hueRoll:rng(), swayDelay:rng()*3.4, swayDur:3+rng()*1.4, br:an.br });
    }
  
    // 사분면 균형 선택 (상/하 × 좌/우)
    const shuffle = arr => { for (let i=arr.length-1;i>0;i--){ const k=Math.floor(rng()*(i+1)); [arr[i],arr[k]]=[arr[k],arr[i]]; } return arr; };
    const keyOf = p => (p.y < crown.cy ? 'U' : 'D') + (p.x < crown.cx ? 'L' : 'R');
    const buckets = { UL:[], UR:[], DL:[], DR:[] };
    for (const p of pool) buckets[keyOf(p)].push(p);
    for (const k in buckets) shuffle(buckets[k]);
    const lShare = 0.5 + (rng()-0.5)*0.10, uShare = 0.54;
    const want = { UL:uShare*lShare, UR:uShare*(1-lShare), DL:(1-uShare)*lShare, DR:(1-uShare)*(1-lShare) };
    const order = ['UL','UR','DL','DR'];
    const take = {}; let used = 0;
    for (const k of order){ take[k] = Math.min(buckets[k].length, Math.round(C.leafCap*want[k])); used += take[k]; }
    let rem = C.leafCap - used;
    while (rem > 0){ let prog=false; for (const k of order){ if (rem>0 && take[k]<buckets[k].length){ take[k]++; rem--; prog=true; } } if(!prog) break; }
    const sel = {}; for (const k of order) sel[k] = buckets[k].slice(0, take[k]);
    const leaves = [];
    const maxLen = Math.max(...order.map(k=>sel[k].length));
    for (let i=0;i<maxLen;i++) for (const k of order) if (i<sel[k].length) leaves.push(sel[k][i]);
  
    return { branches, leaves, leafSites: pool };
  }
  
  /* ── 렌더 ─────────────────────────────────────────────────────── */
  function leafFill(z, roll){
    const C = CONFIG;
    if (roll > 1 - C.accentRatio) return C.accents[Math.floor((1-roll)/C.accentRatio*C.accents.length) % C.accents.length];
    return C.greens[Math.min(C.greens.length-1, Math.floor(z*C.greens.length))];
  }
  function visibleBranchSet(branches, shownLeaves){
    const byId = new Map(branches.map(b=>[b.id,b]));
    const keep = new Set();
    for (const b of branches) if (b.depth<=2) keep.add(b.id);
    for (const l of shownLeaves){ let c=byId.get(l.br); while(c&&!keep.has(c.id)){ keep.add(c.id); c=byId.get(c.parent);} }
    return keep;
  }
  function el(name, attrs){ const e=document.createElementNS(SVG_NS,name); for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }
  
  /**
   * 가지/잎을 svg 안의 #branches, #leaves 그룹에 그린다.
   * @param {SVGElement} svg  - <svg> (안에 <g id="branches"></g><g id="leaves"></g> 필요)
   * @param {object} data     - generateTree() 결과
   * @param {number} count    - 표시할 잎 장수 (0~CONFIG.leafCap)
   * @param {object} opts     - { sproutFrom, skeletonOnly }
   */
  export function renderTree(svg, data, count, opts={}){
    const gB = svg.querySelector('#branches'), gL = svg.querySelector('#leaves');
    gB.textContent=''; gL.textContent='';
    count = Math.max(0, Math.min(data.leaves.length, count|0));
    const shown = data.leaves.slice(0, count);
    const keep = opts.skeletonOnly ? new Set(data.branches.map(b=>b.id)) : visibleBranchSet(data.branches, shown);
    for (const br of data.branches.filter(b=>keep.has(b.id)).sort((p,q)=>p.depth-q.depth)){
      const col = br.depth<=1 ? '#6b4a2b' : br.depth<=3 ? '#785535' : '#8a6647';
      gB.appendChild(el('line',{ x1:br.x1.toFixed(1), y1:br.y1.toFixed(1), x2:br.x2.toFixed(1), y2:br.y2.toFixed(1), stroke:col, 'stroke-width':br.w.toFixed(1), 'stroke-linecap':'round' }));
    }
    if (opts.skeletonOnly) return;
  
    const sproutFrom = opts.sproutFrom ?? count;
    const drawn = shown.map((l,i)=>({l,i})).sort((a,b)=>a.l.z-b.l.z);
    let popOrder = 0;
    for (const {l,i} of drawn){
      const place = el('g',{ transform:`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.rot.toFixed(1)})` });
      const sway  = el('g',{ class:'leaf-sway' });
      sway.style.animationDelay = (-l.swayDelay).toFixed(2)+'s';
      sway.style.animationDuration = l.swayDur.toFixed(2)+'s';
      const sized = el('g',{ transform:`scale(${l.scale.toFixed(2)})` });
      const host = (i >= sproutFrom) ? el('g',{ class:'leaf-pop' }) : sized;
      if (i >= sproutFrom){ host.style.animationDelay = Math.min(0.9, popOrder++*0.012).toFixed(3)+'s'; sized.appendChild(host); }
      host.appendChild(el('path',{ d:BLADE, fill:leafFill(l.z,l.hueRoll), stroke:'rgba(30,55,30,.1)', 'stroke-width':1.1 }));
      host.appendChild(el('path',{ d:VEIN, stroke:'rgba(255,255,255,.3)', 'stroke-width':0.9, fill:'none' }));
      sway.appendChild(sized); place.appendChild(sway); gL.appendChild(place);
    }
  }
  
  /* ── 편의 함수: 반 이름 + 리프합계 → 화면에 나무 표시 ──────────
     같은 반은 캐시해서 매번 새로 생성하지 않음.
     leavesPerRipe: 리프 몇 점당 잎 1장으로 환산할지 (기본 1).             */
  const _cache = new Map();
  export function mountTree(svg, { className, leafTotal = 0, leavesPerRipe = 1, animateGrow = true }){
    if (!_cache.has(className)) _cache.set(className, generateTree(className));
    const data = _cache.get(className);
    const count = Math.max(0, Math.min(CONFIG.leafCap, Math.floor(leafTotal / leavesPerRipe)));
    const key = '_prev_' + className;
    const prev = mountTree[key] ?? 0;
    renderTree(svg, data, count, { sproutFrom: animateGrow ? prev : count });
    mountTree[key] = count;
    return { count, capacity: CONFIG.leafCap };
  }