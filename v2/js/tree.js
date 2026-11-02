/* 내 나무 · 우리 반 숲 — tree 모듈. 탭 둘(tree·forest)을 이 파일이 등록한다.
   내 나무: myTree()(레벨은 나무 크기로만) · 받은 꽃(receivedFlowers) · 발자국(QO.state.footprints, 숫자 없이) · 도토리(profile.seeds)
   우리 반 숲: myForest() 열린 곳 · 다음에 열릴 곳(숫자 없음) · 2D 지도 · 막힘 깃발(classmateQuestions 200, 익명 빼고) → 단서 */
(function(){
'use strict';
const QO = window.QO;
const U = QO.ui, esc = U.esc;

/* ═══════════ 상태(사람이 바뀌면 비움) ═══════════ */
const T = {treeSeq:0, forestSeq:0};
function clear(uid){
  Object.assign(T, {uid:uid || null, tree:null, flowers:null, treeErr:'', forest:null, forestErr:'', seen:{}, pick:null, kind:{}, curious:{}, flAll:false});
}
clear(null);
const uidNow = () => (QO.state.me ? QO.state.me.id : null);
function sync(){ const u = uidNow(); if(u !== T.uid) clear(u); return T.uid; }
const COUNTED = QO.K.STEPS.filter(s => s.counted);
const PLACES = QO.K.PLACES;
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
/* 화면에 쓰는 레벨 — 서버 level, 찍어 둔 레벨이 더 크면 그것(화면에서 줄이지 않는다) */
function shownLevel(t){ const lv = Math.max(Number(t.level) || 1, Number(t.legacy_level) || 0); return Math.min(10, Math.max(1, lv)); }

function repaint(id){
  if(QO.tabs.current() !== id) return;
  /* 단서 칸에 쓰던 글은 다시 그려도 남긴다 */
  const keep = {};
  U.$$('#body .tr-fq .tpl[data-q] input').forEach(i => { keep[i.closest('.tpl').dataset.q + ':' + i.dataset.i] = i.value; });
  const act = document.activeElement, actKey = act && act.matches && act.matches('#body .tr-fq .tpl[data-q] input') ? act.closest('.tpl').dataset.q + ':' + act.dataset.i : null;
  QO.tabs.rerender(id);
  U.$$('#body .tr-fq .tpl[data-q] input').forEach(i => {
    const k = i.closest('.tpl').dataset.q + ':' + i.dataset.i;
    if(keep[k] != null) i.value = keep[k];
    if(k === actKey) try{ i.focus(); }catch(_){}
  });
}

/* ═══════════ 불러오기 ═══════════ */
async function loadTree(){
  const uid = sync(); if(!uid) return;
  const my = ++T.treeSeq;
  try{
    const r = await Promise.all([QO.api.myTree(), QO.api.receivedFlowers()]);
    if(my !== T.treeSeq || uid !== uidNow()) return;
    const same = !T.treeErr && JSON.stringify([T.tree, T.flowers]) === JSON.stringify([r[0] || {}, r[1] || []]);
    T.tree = r[0] || {}; T.flowers = r[1] || []; T.treeErr = '';
    if(!same) repaint('tree');
  }catch(e){
    if(my !== T.treeSeq || uid !== uidNow()) return;
    const m = U.userMsg(e); if(!m) QO.err(e, 'tree');
    T.treeErr = m || '내 나무를 불러오지 못했어요.';
    repaint('tree');
  }
}
async function loadForest(){
  const uid = sync(); if(!uid) return;
  const my = ++T.forestSeq;
  try{
    const r = await Promise.all([QO.api.myForest(), QO.api.classmateQuestions(200, null), QO.api.mySentClues(), QO.api.myCurious().catch(() => null)]);
    if(my !== T.forestSeq || uid !== uidNow()) return;
    const seenBefore = Object.keys(T.seen).sort().join();
    (r[0] || []).forEach(u => { if(u && u.place && !T.seen[u.place]) T.seen[u.place] = true; });   // 한 번 열리면 계속
    const sent = {};
    (r[2] || []).slice().sort((a, b) => a.id - b.id).forEach(c => { if(c.question_id != null) sent[c.question_id] = c.body; });
    const next = {flags:pickFlags(r[1] || []), sent:sent};
    const same = !T.forestErr && seenBefore === Object.keys(T.seen).sort().join() && JSON.stringify(T.forest) === JSON.stringify(next);
    T.forest = next; T.forestErr = '';
    if(Array.isArray(r[3])) r[3].forEach(id => { T.curious[id] = true; });
    if(T.pick != null && !next.flags.some(f => f.id === T.pick)) T.pick = null;
    if(!same) repaint('forest');
  }catch(e){
    if(my !== T.forestSeq || uid !== uidNow()) return;
    const m = U.userMsg(e); if(!m) QO.err(e, 'forest');
    T.forestErr = m || '우리 반 숲을 불러오지 못했어요.';
    repaint('forest');
  }
}

/* ═══════════ 내 나무 ═══════════ */
const BLOBS = [[0,-70,46,'#5FA86D'],[-40,-52,30,'#6CB57A'],[40,-56,32,'#57A065'],[-14,-98,28,'#74BC80'],[22,-92,26,'#68B275'],
  [-60,-78,22,'#62AC70'],[60,-84,22,'#6FB97C'],[4,-110,20,'#5BA469']];
const SPOTS = [[-6,-72],[24,-60],[-30,-54],[8,-96],[-22,-88],[44,-46],[-48,-44],[30,-80],[-60,-76],[60,-84],[4,-110],[-10,-48]];
const FL_SPOTS = [[-30,20],[30,22],[-52,25],[52,24],[-74,21],[74,25],[-17,29],[17,30],[-92,26],[92,27]];
function fruitSVG(kind, x, y, sprout){
  let s = '<g class="tr-fruit" data-kind="' + kind + '"' + (sprout ? ' data-sprout="1"' : '') + '>';
  if(kind === 'fog') s += '<circle cx="' + x + '" cy="' + y + '" r="8" fill="#6F84A0"/><path d="M' + (x - 4.5) + ' ' + (y + 0.5) + 'h9M' + (x - 3) + ' ' + (y + 3.5) + 'h6" stroke="#E9EEF5" stroke-width="1.6" stroke-linecap="round"/>';
  else if(kind === 'group') s += [[-4.2, 2.4], [4.2, 2.4], [0, -4.6]].map(p => '<circle cx="' + (x + p[0]) + '" cy="' + (y + p[1]) + '" r="5" fill="#C9433A"/><circle cx="' + (x + p[0] - 1.6) + '" cy="' + (y + p[1] - 1.6) + '" r="1.3" fill="#F19A93"/>').join('') +
    '<path d="M' + x + ' ' + (y - 9) + ' q4 -5 9 -3 q-4 4 -9 3z" fill="#1F7A80"/>';
  else s += '<circle cx="' + x + '" cy="' + y + '" r="8" fill="#C9433A"/><circle cx="' + (x - 2.6) + '" cy="' + (y - 2.6) + '" r="2" fill="#F19A93"/>';
  if(sprout) s += '<path transform="translate(' + x + ' ' + (y - 7) + ') scale(1.45)" d="M0 0 q-1 -6 -5 -7 q4 -1 5 3 q1 -5 6 -5 q-3 3 -6 9" fill="#8FD19A" stroke="#2C6A3A" stroke-width=".7" stroke-linejoin="round"/>';
  return s + '</g>';
}
function flowerSVG(x, y){
  return '<g class="tr-flower" transform="translate(' + x + ' ' + y + ')"><circle r="3.4" cy="-3.4" fill="#F3A8C2"/><circle r="3.4" cx="3.4" fill="#F3A8C2"/><circle r="3.4" cy="3.4" fill="#F3A8C2"/><circle r="3.4" cx="-3.4" fill="#F3A8C2"/><circle r="2.2" fill="#F7D774"/></g>';
}
function treeSVG(t){
  const lv = shownLevel(t), sc = (0.6 + lv * 0.04).toFixed(3);
  const fr = [];
  const nFruit = +t.fruit || 0, nFog = +t.fog || 0, nGroup = +t.group_fruit || 0;
  let sp = +t.sprout || 0;
  for(let i = 0; i < nFruit; i++) fr.push({k:'fruit', s:sp-- > 0});
  for(let i = 0; i < nFog; i++) fr.push({k:'fog', s:sp-- > 0});
  for(let i = 0; i < nGroup; i++) fr.push({k:'group', s:false});
  const nBlob = Math.min(BLOBS.length, Math.max(3, lv + 2));
  const fruits = fr.slice(0, SPOTS.length).map((f, i) => fruitSVG(f.k, SPOTS[i][0], SPOTS[i][1], f.s)).join('');
  const nFl = Math.min(+t.flowers || 0, FL_SPOTS.length);
  let flowers = ''; for(let i = 0; i < nFl; i++) flowers += flowerSVG(FL_SPOTS[i][0], FL_SPOTS[i][1]);
  const all = nFruit + nFog + nGroup;
  return '<svg viewBox="-120 -130 240 170" width="300" height="212" role="img" aria-label="내 나무, 레벨 ' + lv + ', 열매 ' + all + '개, 꽃 ' + (+t.flowers || 0) + '개">' +
    '<ellipse cx="0" cy="22" rx="105" ry="16" fill="#E2E8D6"/>' +
    '<g transform="translate(0 20) scale(' + sc + ') translate(0 -20)">' +
    '<path d="M-9 20 Q-6 -20 -3 -40 L3 -40 Q6 -20 9 20 Z" fill="#8B6A4A"/><path d="M-2 -30 Q-20 -46 -34 -50" stroke="#8B6A4A" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M2 -36 Q18 -50 30 -58" stroke="#8B6A4A" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    BLOBS.slice(0, nBlob).map(b => '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="' + b[3] + '"/>').join('') +
    fruits + '</g>' + flowers + '</svg>';
}
function legacyNoteKey(){ return 'qo2-tree-legacy-note-' + T.uid; }
function noteSeen(){ try{ return localStorage.getItem(legacyNoteKey()) === '1'; }catch(_){ return false; } }
const FOG_SMALL = U.FOG_SVG;
const ICON_FRUIT = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="6" fill="#C9433A"/><circle cx="6" cy="7" r="1.6" fill="#F19A93"/></svg>';
function renderTree(root){
  sync();
  if(!T.uid){ root.innerHTML = ''; return; }
  const t = T.tree;
  if(!t){
    root.innerHTML = T.treeErr ? '<div class="card tr-fail"><div class="err">' + esc(T.treeErr) + '</div><button type="button" class="btn soft sm" data-tr="retry-tree">다시 불러오기</button></div>'
      : '<div class="empty tr-loading">내 나무를 불러오는 중이에요…</div>';
    return;
  }
  const lv = shownLevel(t);
  const nFruit = +t.fruit || 0, nFog = +t.fog || 0, nGroup = +t.group_fruit || 0, all = nFruit + nFog + nGroup;
  const sub = [nFog ? '안개\u00a0' + nFog : '', nGroup ? '모둠\u00a0' + nGroup : ''].filter(Boolean).join(' · ');
  const note = (t.legacy_level != null && !noteSeen()) ? '<div class="guide tr-note"><span>이제 나무는 열매로 커요. 지금 나무 크기는 그대로예요.</span><button type="button" class="link" data-tr="note-ok">알겠어요</button></div>' : '';
  const treeCard = '<div class="card tr-tree" data-ready="1" data-level="' + lv + '"><div class="tr-cap"><span>내 나무</span></div>' +
    '<div class="tree-wrap">' + treeSVG(t) + '</div>' +
    '<div class="stats"><div class="tr-st-fruit"><b>' + all + '</b><span>' + ICON_FRUIT + ' 열매</span>' + (sub ? '<small class="tr-sub">' + FOG_SMALL.replace('width="14" height="14"', 'width="12" height="12"') + ' ' + esc(sub) + '</small>' : '') + '</div>' +
    '<div class="tr-st-sprout"><b>' + (+t.sprout || 0) + '</b><span>🌱 새싹 달린 열매</span></div><div class="tr-st-flower"><b>' + (+t.flowers || 0) + '</b><span>🌸 꽃</span></div></div>' +
    '<div class="hint tr-hint">나무는 끝까지 탐구한 질문(열매)으로 자라요. 꽃은 내 단서로 친구가 한 걸음 간 흔적이에요.</div></div>';
  /* 받은 꽃 */
  const fl = (T.flowers || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id);
  const shown = T.flAll ? fl : fl.slice(0, 5);
  const flHTML = '<div class="sec">받은 꽃' + (fl.length ? ' <span class="n">' + fl.length + '</span>' : '') + '</div><div class="card tr-flowers">' +
    (fl.length ? shown.map(f => {
      const tx = String(f.thanks_text || '').trim(), line = /^덕분에/.test(tx) ? tx : '덕분에 ' + tx;
      const meta = [f.question_body ? '「' + cut(f.question_body, 26) + '」' : '', U.fmtTime(f.created_at)].filter(Boolean).join(' · ');
      return '<div class="tr-fl"><span class="e" aria-hidden="true">🌸</span><div><b>' + esc(line) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</div></div>';
    }).join('') + (fl.length > 5 ? '<button type="button" class="link tr-more" data-tr="fl-all">' + (T.flAll ? '접기' : '모두 보기') + '</button>' : '')
      : '<div class="hint">내 단서로 친구가 한 걸음 가면 여기에 꽃이 피어요.</div>') + '</div>';
  /* 발자국 — 숫자 없이, 발자국이 난 칸 종류만 */
  const fp = QO.state.footprints || [];
  const has = {}; fp.forEach(f => { has[f.step] = true; });
  const fpHTML = '<div class="sec">내 발자국</div><div class="card tr-fp">' +
    (fp.length ? '<div class="tr-fp-chips">' + COUNTED.map(s => '<span data-step="' + s.k + '"' + (has[s.k] ? ' class="on"' : '') + '>' + (has[s.k] ? '✓ ' : '') + esc(s.n) + '</span>').join('') + '</div>'
      : '') + '<div class="hint">일지 칸을 내 말로 처음 채우면 ' + (fp.length ? '그 칸에' : '여기에') + ' 발자국이 남아요.</div></div>';
  const seeds = QO.state.me ? (QO.state.me.seeds || 0) : 0;
  const acHTML = '<div class="card tr-acorn"><span class="e" aria-hidden="true">🌰</span><div><b>도토리 <span class="tr-seeds">' + seeds + '</span></b><div class="hint">도토리는 선생님이 열매를 확인할 때 받아요.</div></div></div>';
  const right = flHTML + fpHTML + acHTML;
  root.innerHTML = U.wide() ? '<div class="cols tr-cols"><div>' + note + treeCard + '</div><div>' + right + '</div></div>' : note + treeCard + right;
}

/* ═══════════ 우리 반 숲 ═══════════ */
/* 막힘 깃발 자리(지도 좌표) — 단서가 적은 질문부터 골라, 질문 id 로 자리를 정해 다시 읽어도 그대로 */
const SLOTS = [[246,112],[292,246],[46,248],[198,304],[178,110],[40,128],[236,368],[338,168]];
const SCENERY = [[30,40],[150,36],[214,48],[288,40],[350,272],[262,150],[160,350],[280,352],[28,166],[352,350],[96,384],[204,140],[256,292],[352,116],[226,262]];
function pickFlags(qs){
  const flagged = qs.filter(q => q && q.flag_step && !q.is_anonymous)
    .sort((a, b) => (a.clue_count || 0) - (b.clue_count || 0) || b.id - a.id).slice(0, SLOTS.length)
    .sort((a, b) => a.id - b.id);
  const used = {};
  return flagged.map(q => {
    let s = (Number(q.id) * 7) % SLOTS.length;
    while(used[s]) s = (s + 1) % SLOTS.length;
    used[s] = true;
    return {id:q.id, body:q.body, unit:q.unit || '', step:q.flag_step, tried:q.flag_tried || '', slot:s};
  });
}
function placeSVG(k){
  if(k === 'spring') return '<g data-place="spring" transform="translate(300 318)"><ellipse rx="38" ry="19" fill="#9FD3E2"/><ellipse cx="-4" cy="-2" rx="22" ry="8" fill="#C4E6EF"/><circle cx="-40" cy="6" r="5" fill="#C9CFBF"/><circle cx="36" cy="12" r="4" fill="#C9CFBF"/><circle cx="30" cy="-14" r="3.5" fill="#C9CFBF"/>' +
    '<text y="38" text-anchor="middle" class="tr-lbl" fill="#2F5B6A">샘물</text></g>';
  if(k === 'bridge') return '<g data-place="bridge" transform="translate(113 189) rotate(-2)"><rect x="-27" y="-11" width="54" height="22" rx="3" fill="#B58A5C"/>' +
    [-18, -9, 0, 9, 18].map(x => '<path d="M' + x + ' -10v20" stroke="#8C6640" stroke-width="1.6"/>').join('') +
    '<path d="M-29 -12h58M-29 12h58" stroke="#6B4A2A" stroke-width="3" stroke-linecap="round"/><text y="-20" text-anchor="middle" class="tr-lbl" fill="#6B4A2A">다리</text></g>';
  if(k === 'obs') return '<g data-place="obs" transform="translate(316 70)"><ellipse cy="26" rx="54" ry="16" fill="#C8DDB6"/><rect x="-17" y="-4" width="34" height="28" rx="2" fill="#F1F3F5" stroke="#9AA5B1" stroke-width="1.5"/>' +
    '<path d="M-19 -4 A19 19 0 0 1 19 -4 Z" fill="#C9D3DE" stroke="#8D99A6" stroke-width="1.5"/><path d="M-2 -21 L2 -21 L3 -4 L-3 -4 Z" fill="#5A6774"/><path d="M4 -12 L20 -26" stroke="#5A6774" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="-5" y="10" width="10" height="14" rx="1" fill="#9AA5B1"/><text y="52" text-anchor="middle" class="tr-lbl" fill="#3F4E5C">관측소</text></g>';
  if(k === 'winter') return '<g data-place="winter" transform="translate(56 318)"><ellipse cy="22" rx="50" ry="14" fill="#F4F8FA"/>' +
    [[-22, 8, 0.9], [2, 0, 1.15], [24, 10, 0.85]].map(p => '<g transform="translate(' + p[0] + ' ' + p[1] + ') scale(' + p[2] + ')"><rect x="-2.5" y="8" width="5" height="8" fill="#7A5A3C"/><path d="M0 -24 L14 8 L-14 8 Z" fill="#3F7A55"/><path d="M0 -24 L6.5 -9 Q0 -6 -6.5 -9 Z" fill="#fff"/><path d="M-10 0 Q0 4 10 0 L12 4 Q0 8 -12 4 Z" fill="#fff" opacity=".9"/></g>').join('') +
    '<text y="48" text-anchor="middle" class="tr-lbl" fill="#3F5574">겨울 숲</text></g>';
  return '';
}
function mapSVG(f){
  let s = '<svg viewBox="0 0 380 400" role="img" aria-label="우리 반 숲 지도"><rect width="380" height="400" fill="#DCEBCF"/>' +
    '<ellipse cx="96" cy="86" rx="70" ry="38" fill="#E2EFD6"/><ellipse cx="270" cy="230" rx="80" ry="40" fill="#E2EFD6"/>' +
    '<path d="M20 210 Q120 170 190 205 T360 190" stroke="#E9DFC4" stroke-width="22" fill="none" stroke-linecap="round"/>' +
    '<path d="M92 -4 C80 70 126 120 112 189 S150 300 162 404" stroke="#A8D5E2" stroke-width="16" fill="none" stroke-linecap="round"/>' +
    '<path d="M92 -4 C80 70 126 120 112 189 S150 300 162 404" stroke="#C4E4EE" stroke-width="5" fill="none" stroke-linecap="round" transform="translate(-2 0)"/>';
  const taken = f.flags.map(x => SLOTS[x.slot]);
  const blocked = [];
  PLACES.forEach(p => { if(T.seen[p.k]) blocked.push(p.k); });
  const near = (a, b, d) => Math.abs(a[0] - b[0]) < d && Math.abs(a[1] - b[1]) < d;
  const AREA = {spring:[300, 318, 50], obs:[316, 72, 58], winter:[56, 322, 56], bridge:[113, 189, 34]};
  SCENERY.forEach(p => {
    if(taken.some(q => near(p, q, 36))) return;
    if(blocked.some(k => near(p, AREA[k], AREA[k][2]))) return;
    s += '<g transform="translate(' + p[0] + ' ' + p[1] + ')" opacity=".6"><circle r="14" fill="#86BF8F"/><circle cx="-5" cy="-5" r="8" fill="#9BCDA2"/></g>';
  });
  PLACES.forEach(p => { if(T.seen[p.k]) s += placeSVG(p.k); });
  f.flags.forEach(x => {
    const p = SLOTS[x.slot], on = T.pick === x.id, sent = f.sent[x.id] != null;
    s += '<g class="tr-flag" data-qid="' + x.id + '" transform="translate(' + p[0] + ' ' + p[1] + ')"><circle r="18" fill="' + (on ? '#2C6A3A' : '#5FA86D') + '"/><circle cx="-6" cy="-6" r="10" fill="' + (on ? '#3F8B4F' : '#7DBE87') + '"/>' +
      (on ? '<circle r="22" fill="none" stroke="#155A5F" stroke-width="2.5"/>' : '') +
      (sent ? '<circle cx="14" cy="-14" r="8" fill="#1F7A80"/><path d="M10 -14 l2.8 2.8 5 -5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<g transform="translate(10 -34)"><line x1="0" y1="0" x2="0" y2="24" stroke="#155A5F" stroke-width="2.4"/><path d="M0 0 L15 5.5 L0 11 Z" fill="#1F7A80"/></g>') + '</g>';
  });
  s += '<g transform="translate(190 205)"><circle r="20" fill="#3F8B4F" stroke="#fff" stroke-width="3"/><text y="5" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">나</text></g></svg>';
  /* 누를 곳은 진짜 단추로(44px 이상) */
  const pins = f.flags.map(x => {
    const p = SLOTS[x.slot], sent = f.sent[x.id] != null;
    return '<button type="button" class="tr-pin" data-tr="pick" data-q="' + x.id + '" style="left:' + (p[0] / 3.8).toFixed(2) + '%;top:' + ((p[1] - 6) / 4).toFixed(2) + '%"' +
      ' aria-pressed="' + (T.pick === x.id) + '" aria-label="' + esc(sent ? '단서를 보낸 친구 질문' : '막힌 친구 질문 — ' + QO.journal.stepName(x.step) + '에서 막힘') + '"></button>';
  }).join('');
  return '<div class="tr-map">' + s + pins + '</div>';
}
function kindOf(x){ return T.kind[x.id] || QO.K.STUCK_KIND[x.step] || 'where'; }
function friendCardHTML(x, f){
  let h = '<div class="card fq tr-fq" id="tr-fq" data-q="' + x.id + '"><div class="who">같은 반 친구 · 이름은 보이지 않아요 <span class="tag flag">' + esc(QO.journal.stepName(x.step) || '한 칸') + '에서 막힘</span></div>' +
    '<div class="qt">' + esc(x.body) + '</div>' + (x.tried ? '<div class="tried">여기까지 해 봤어요: ' + esc(x.tried) + '</div>' : '');
  if(f.sent[x.id] != null) return h + '<div class="sent">단서를 보냈어요 — 「' + esc(f.sent[x.id]) + '」</div></div>';
  const L = QO.state.live;
  if(L && L.mode === 'clue') return h + '<div class="hint tr-lock">단서 시간에는 함께 탭에서 단서를 보내요.</div></div>';
  const kind = kindOf(x), K = QO.K.CLUE_KINDS[kind];
  h += '<div class="lbl" style="margin:12px 0 6px">정답 말고, 찾아갈 길을 알려 줘요 · ' + esc(K.n) + '</div><div class="tpl" data-q="' + x.id + '" data-kind="' + kind + '">' +
    K.parts.map((p, i) => typeof p === 'string' ? '<span>' + esc(p) + '</span>'
      : '<input data-i="' + i + '" placeholder="' + esc(p.ph) + '" aria-label="' + esc(p.ph) + '" style="max-width:' + p.w + 'px" maxlength="24"' + (p.ph === '쪽' ? ' inputmode="numeric"' : '') + '>').join('') + '</div>' +
    '<div class="row" style="margin-top:10px"><button type="button" class="btn teal" style="flex:1" data-tr="send" data-q="' + x.id + '">보내기</button></div><div class="err" id="tr-ce" role="alert"></div>' +
    '<div class="row" style="justify-content:space-between;flex-wrap:wrap"><button type="button" class="link teal" data-tr="kind" data-q="' + x.id + '">다른 종류로</button>' +
    (T.curious[x.id] ? '<span class="hint">「나도 궁금해요」를 보냈어요</span>' : '<button type="button" class="link" data-tr="curious" data-q="' + x.id + '">나도 궁금해요</button>') + '</div></div>';
  return h;
}
function renderForest(root){
  sync();
  if(!T.uid){ root.innerHTML = ''; return; }
  const f = T.forest;
  if(!f){
    root.innerHTML = T.forestErr ? '<div class="card tr-fail"><div class="err">' + esc(T.forestErr) + '</div><button type="button" class="btn soft sm" data-tr="retry-forest">다시 불러오기</button></div>'
      : '<div class="empty tr-loading">우리 반 숲을 불러오는 중이에요…</div>';
    return;
  }
  const next = PLACES.find(p => !T.seen[p.k]);
  const places = '<div class="card tr-places" data-ready="1"><div class="tr-next">' + (next ? '다음에 열릴 곳: ' + esc(next.n) : '숲이 모두 열렸어요') + '</div>' +
    (next ? '<div class="hint" style="margin-top:2px">' + esc(next.cond) + ' 열려요.</div>' : '') +
    '<div class="places">' + PLACES.map(p => '<div class="' + (T.seen[p.k] ? 'on' : '') + '" data-place="' + p.k + '"><b>' + (T.seen[p.k] ? '✓ ' : '') + esc(p.n) + '</b><span>' + esc(p.cond) + '</span></div>').join('') + '</div></div>';
  const map = '<div class="card map-card">' + mapSVG(f) + '</div>' +
    '<div class="hint tr-maphint">' + (f.flags.length ? '청록 깃발은 친구가 막혀 있는 질문이에요. 눌러서 찾아갈 길을 알려 줄 수 있어요. 이름은 보이지 않아요.'
      : '친구가 질문에 막힘 표시를 하면 그 나무에 청록 깃발이 서요.') + '</div>';
  const x = T.pick != null ? f.flags.find(y => y.id === T.pick) : null;
  const side = x ? friendCardHTML(x, f) : (U.wide() && f.flags.length ? '<div class="hint" style="margin-top:12px">지도에서 깃발이 선 나무를 눌러 보세요.</div>' : '');
  /* 폰: 장소 → 지도 → 친구 카드 / 넓은 화면: 지도 왼쪽, 장소·친구 카드 오른쪽 */
  root.innerHTML = U.wide() ? '<div class="cols tr-cols"><div>' + map + '</div><div>' + places + side + '</div></div>' : places + map + side;
}

/* ═══════════ 단서 보내기 ═══════════ */
function clueText(kind, ins){
  const K = QO.K.CLUE_KINDS[kind];
  const v = i => ((ins.find(e => +e.dataset.i === i) || {}).value || '').trim();
  if(kind === 'where'){
    const idx = K.parts.map((p, i) => typeof p === 'string' ? -1 : i).filter(i => i >= 0);
    const page = v(idx[0]).replace(/쪽$/, '').trim(), kw = v(idx[1]);
    return [page ? '교과서 ' + page + '쪽' : '', kw ? '검색어 ' + kw : ''].filter(Boolean).join(' · ');   // 함께 탭과 같은 모양
  }
  return K.parts.map((p, i) => typeof p === 'string' ? p : v(i)).join('').trim();
}
async function sendClue(btn, qid){
  const f = T.forest; if(!f) return;
  const x = f.flags.find(y => y.id === qid); if(!x) return;
  const kind = kindOf(x), K = QO.K.CLUE_KINDS[kind], err = U.$('#tr-ce');
  const ins = U.$$('#body .tr-fq .tpl[data-q="' + qid + '"] input');
  const filled = ins.filter(i => i.value.trim());
  if(K.any ? !filled.length : filled.length < ins.length){
    const emp = ins.find(i => !i.value.trim());
    err.textContent = K.any ? '쪽수나 검색어 중 하나는 적어 주세요.' : '빈칸을 채워 주세요.';
    (emp || ins[0]).focus(); return;
  }
  for(const i of filled){ if(/([^\d\s])\1\1/.test(i.value) || /[ㅋㅎ]{2,}/.test(i.value) || /^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(i.value) || i.value.indexOf('__') >= 0){ err.textContent = '장난 글자는 보낼 수 없어요.'; i.focus(); return; } }
  const text = clueText(kind, ins);
  if(Array.from(text).length < 5){ err.textContent = '빈칸을 조금 더 채워 주세요.'; return; }
  const r = await U.busy(btn, () => QO.api.addClue(qid, kind, text), {errEl:err});
  if(r === undefined) return;
  if(T.forest === f) f.sent[qid] = text;
  repaint('forest');
  U.toast('단서를 보냈어요.');
}

/* ═══════════ 누르기(한 곳에서) ═══════════ */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tr]');
  if(!b || !document.getElementById('body').contains(b)) return;
  const act = b.dataset.tr, qid = b.dataset.q != null ? Number(b.dataset.q) : null;
  if(act === 'retry-tree'){ T.treeErr = ''; repaint('tree'); loadTree(); }
  else if(act === 'retry-forest'){ T.forestErr = ''; repaint('forest'); loadForest(); }
  else if(act === 'note-ok'){ try{ localStorage.setItem(legacyNoteKey(), '1'); }catch(_){} repaint('tree'); }
  else if(act === 'fl-all'){ T.flAll = !T.flAll; repaint('tree'); }
  else if(act === 'pick'){
    T.pick = T.pick === qid ? null : qid;
    repaint('forest');
    const c = U.$('#tr-fq');
    if(c && T.pick != null){ try{ c.scrollIntoView({block:'nearest', behavior:'smooth'}); }catch(_){} }
    const pin = U.$('#body .tr-pin[data-q="' + qid + '"]'); if(pin) try{ pin.focus({preventScroll:true}); }catch(_){}
  }
  else if(act === 'kind'){
    const f = T.forest, x = f && f.flags.find(y => y.id === qid); if(!x) return;
    const ks = Object.keys(QO.K.CLUE_KINDS), cur = kindOf(x);
    T.kind[qid] = ks[(ks.indexOf(cur) + 1) % ks.length];
    repaint('forest');
  }
  else if(act === 'send') await sendClue(b, qid);
  else if(act === 'curious'){
    const r = await U.busy(b, () => QO.api.markCurious(qid));
    if(r === undefined) return;
    if(r){ T.curious[qid] = true; repaint('forest'); U.toast('친구에게 「나도 궁금해요」를 보냈어요.'); }
    else U.toast('이 질문에는 보낼 수 없어요.');
  }
});
/* 단서 칸에서 Enter = 보내기(한글 조합 중에는 무시) */
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.repeat) return;
  const i = e.target.closest && e.target.closest('#body .tr-fq .tpl[data-q] input'); if(!i) return;
  e.preventDefault();
  const btn = U.$('#body [data-tr="send"][data-q="' + i.closest('.tpl').dataset.q + '"]');
  if(btn) btn.click();
});

/* ═══════════ 탭 등록 · 다시 읽기 ═══════════ */
QO.tabs.register({
  id:'tree', label:'내 나무', icon:QO.ui.icons.tree,
  render:renderTree,
  onShow(){ loadTree(); }
});
QO.tabs.register({
  id:'forest', label:'우리 반 숲', icon:QO.ui.icons.forest,
  render:renderForest,
  onShow(){ loadForest(); }
});
/* 다시 들어오면(로그인·시연 학생 바꾸기) 지난 화면 자료는 버리고, 지금 탭이 나무·숲이면 새로 읽는다 */
QO.bus.on('ready', () => {
  clear(uidNow());
  const c = QO.tabs.current();
  if(c === 'tree') loadTree(); else if(c === 'forest') loadForest();
});
QO.bus.on('me:changed', () => { sync(); repaint('tree'); });
QO.bus.on('footprints:changed', () => repaint('tree'));
QO.bus.on('live:changed', () => repaint('forest'));
QO.bus.on('questions:changed', d => { if(d && d.all && QO.tabs.current() === 'tree') loadTree(); });

/* ═══════════ 스스로 시험 ═══════════ */
if(!QO.selftest) return;
const add = QO.selftest.add;
const treeReady = t => t.waitFor(() => document.querySelector('#body .tr-tree[data-ready]'));
const forestReady = t => t.waitFor(() => document.querySelector('#body .tr-places[data-ready]'));

add('나무 · 레벨은 서버 값(찍어 둔 레벨이 더 크면 그것)·열매 그림', async t => {
  try{ localStorage.removeItem('qo2-tree-legacy-note-u-A'); }catch(_){}
  await t.click('#nav [data-t="tree"]');
  const card = await treeReady(t);
  const srv = await t.api.myTree();
  t.eq(Number(card.dataset.level), Math.max(srv.level, srv.legacy_level || 0), '레벨(나무 크기)');
  t.expect(!/레벨/.test(U.$('#body .tr-cap').textContent) && /레벨 \d/.test(U.$('#body .tree-wrap svg').getAttribute('aria-label')), '레벨 숫자는 화면 글자에 없고 그림 설명에만');
  const kinds = U.$$('#body .tr-fruit').map(g => g.dataset.kind);
  t.eq(kinds, ['fruit', 'fruit', 'fog'], '열매 그림(열매 둘·안개 하나)');
  t.eq(U.$$('#body .tr-fruit[data-sprout]').length, srv.sprout, '새싹');
  t.eq(U.$('#body .tr-st-fruit b').textContent, String(srv.fruit + srv.fog + srv.group_fruit), '열매 수');
  t.expect(U.$('#body .tr-note'), '찍어 둔 레벨이 있으면 첫 안내');
  await t.click('#body [data-tr="note-ok"]');
  t.expect(!U.$('#body .tr-note'), '안내를 닫으면 사라짐');
  /* 서버가 레벨을 낮게 줘도 찍어 둔 레벨 아래로 그리지 않음 */
  const orig = QO.mock.api.myTree;
  QO.mock.api.myTree = async function(){ const r = await orig(); return Object.assign(r, {level:2, legacy_level:6}); };
  try{
    await t.click('#nav [data-t="explore"]'); await t.click('#nav [data-t="tree"]');
    await t.waitFor(() => { const c = U.$('#body .tr-tree'); return c && c.dataset.level === '6'; });
  } finally { QO.mock.api.myTree = orig; }
  /* 찍어 둔 레벨이 더 크면 서버도 그 값 */
  t.db.legacy_level.find(l => l.user_id === 'u-A').level = 8;
  await t.click('#nav [data-t="explore"]'); await t.click('#nav [data-t="tree"]');
  await t.waitFor(() => { const c = U.$('#body .tr-tree'); return c && c.dataset.level === '8'; });
});

add('나무 · 받은 꽃(덕분에 __)이 목록·그림·수에 나온다', async t => {
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  t.expect(/여기에 꽃이 피어요/.test(U.$('#body .tr-flowers').textContent), '꽃이 없을 때 안내');
  t.eq(U.$$('#body .tr-flower').length, 0, '꽃 그림 없음');
  t.as('B');
  await t.api.saveJournal(121, {method:{kind:'exp', plan:'전구 하나를 빼 보고 다른 전구가 켜지는지 보기'}});
  t.eq(await t.api.thankClue(502, '덕분에 실험 방법을 정했어요'), true, '나래가 고마움');
  await t.loginAs('A');
  await t.click('#nav [data-t="tree"]');
  await t.waitFor(() => /실험 방법을 정했어요/.test((U.$('#body .tr-flowers') || {}).textContent || ''));
  const row = U.$('#body .tr-fl');
  t.expect(/^덕분에 실험 방법을 정했어요/.test(row.querySelector('b').textContent), '「덕분에 __」 한 줄');
  t.expect(/전구 두 개를 병렬로/.test(row.textContent), '어느 질문인지');
  t.eq(U.$$('#body .tr-flower').length, 1, '꽃 그림 하나');
  t.eq(U.$('#body .tr-st-flower b').textContent, '1', '꽃 수');
  const mine = await t.api.receivedFlowers();
  t.eq(mine.length, 1, '받은 꽃 함수');
  t.as('B'); t.eq((await t.api.receivedFlowers()).length, 0, '준 사람에게는 받은 꽃 없음'); t.as('A');
});

add('나무 · 발자국은 숫자 없이 칸 종류만, 도토리는 머리글과 같다', async t => {
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  await t.waitFor(() => t.state.footprints.length > 0 && U.$('#body .tr-fp-chips'));
  const has = {}; t.state.footprints.forEach(f => { has[f.step] = true; });
  for(const s of ['predict', 'method', 'find', 'wrap', 'extend']) t.eq(U.$('#body .tr-fp-chips [data-step="' + s + '"]').classList.contains('on'), !!has[s], '발자국 ' + s);
  t.expect(!/[0-9]/.test(U.$('#body .tr-fp').textContent), '발자국에 숫자가 없음');
  t.eq(U.$('#body .tr-seeds').textContent, document.getElementById('acorn').textContent, '도토리 = 머리글');
  t.eq(U.$('#body .tr-seeds').textContent, String(t.state.me.seeds), '도토리 = profile.seeds');
  t.expect(!U.$('#body .shop'), '꾸미기는 없음');
  /* 도토리가 바뀌면 함께 바뀜 */
  QO.store.setSeeds(31);
  t.eq(U.$('#body .tr-seeds').textContent, '31', '도토리 다시 그림');
});

add('나무 · 숲 장소 열림·잠김과 다음에 열릴 곳(숫자 없음)', async t => {
  await t.click('#nav [data-t="forest"]');
  const pc = await forestReady(t);
  t.expect(U.$('#body .places [data-place="spring"]').classList.contains('on'), '샘물 열림');
  t.expect(!U.$('#body .places [data-place="bridge"]').classList.contains('on'), '다리 잠김');
  t.eq(U.$('#body .tr-next').textContent, '다음에 열릴 곳: 다리', '다음에 열릴 곳');
  t.expect(pc.textContent.indexOf('친구 단서로 막힌 칸이 처음 풀린 날 열려요.') >= 0, '열리는 조건 문구');
  t.expect(U.$('#body svg [data-place="spring"]') && !U.$('#body svg [data-place="bridge"]'), '지도에는 열린 곳만');
  const noDigit = () => {
    t.expect(!/[0-9]/.test(U.$('#body .tr-places').textContent), '장소 카드에 숫자');
    t.expect(!U.$$('#body .tr-map text').some(x => /[0-9]/.test(x.textContent)), '지도 글자에 숫자');
    t.expect(!U.$$('#body .tr-pin').some(x => /[0-9]/.test(x.getAttribute('aria-label'))), '깃발 이름에 숫자');
  };
  noDigit();
  /* 친구 단서로 막힌 칸이 풀리면 다리 */
  t.as('B');
  await t.api.saveJournal(121, {method:{kind:'exp', plan:'전구 하나를 빼 보고 다른 전구가 켜지는지 보기'}});
  await t.api.thankClue(502, '덕분에 실험 방법을 정했어요');
  await t.loginAs('A');
  await t.click('#nav [data-t="forest"]');
  await t.waitFor(() => U.$('#body svg [data-place="bridge"]'));
  t.eq(U.$('#body .tr-next').textContent, '다음에 열릴 곳: 관측소', '다음은 관측소');
  t.expect(U.$('#body .tr-places').textContent.indexOf('모든 모둠 일지가 정리까지 간 날 열려요.') >= 0, '관측소 조건');
  noDigit();
  /* 순서와 다르게 열려도(겨울 숲 먼저) 다음은 앞에서부터, 모두 열리면 끝 문구 */
  const y = U.schoolYear();
  t.db.class_forest_unlocks.push({school_year:y, grade:2, class_no:11, place:'winter', unlocked_at:new Date().toISOString()});
  await t.click('#nav [data-t="tree"]'); await t.click('#nav [data-t="forest"]');
  await t.waitFor(() => U.$('#body svg [data-place="winter"]'));
  t.eq(U.$('#body .tr-next').textContent, '다음에 열릴 곳: 관측소', '겨울 숲이 먼저 열려도 다음은 관측소');
  t.db.class_forest_unlocks.push({school_year:y, grade:2, class_no:11, place:'obs', unlocked_at:new Date().toISOString()});
  await t.click('#nav [data-t="tree"]'); await t.click('#nav [data-t="forest"]');
  await t.waitFor(() => /숲이 모두 열렸어요/.test(U.$('#body .tr-next').textContent));
  t.eq(U.$$('#body svg [data-place]').length, 4, '네 곳 모두 지도에');
  noDigit();
  /* 한 번 열린 곳은 서버가 빠뜨려도 그대로 */
  t.db.class_forest_unlocks = t.db.class_forest_unlocks.filter(u => u.place !== 'obs');
  await t.click('#nav [data-t="tree"]'); await t.click('#nav [data-t="forest"]');
  await t.wait(200);
  t.expect(U.$('#body svg [data-place="obs"]'), '열린 곳은 다시 잠기지 않음');
});

add('나무 · 숲 깃발(익명 빼고) → 단서 보내기·다른 종류·나도 궁금해요', async t => {
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  const ids = U.$$('#body .tr-flag').map(g => Number(g.dataset.qid)).sort((a, b) => a - b);
  t.eq(ids, [121, 131, 141], '막힘 깃발(익명 123 빼고)');
  t.eq(U.$$('#body .tr-pin').length, 3, '누를 곳');
  t.expect(U.$$('#body .tr-pin').every(b => b.offsetWidth >= 44 && b.offsetHeight >= 44), '누를 곳 44px');
  /* 이미 단서를 보낸 질문 */
  await t.click('#body .tr-pin[data-q="121"]');
  await t.waitFor('#tr-fq[data-q="121"]');
  t.expect(/단서를 보냈어요/.test(U.$('#tr-fq').textContent), '보낸 단서 표시');
  t.expect(!/나래/.test(U.$('#tr-fq').textContent), '이름은 안 보임');
  /* 찾기에서 막힌 질문 → 찾아볼 곳이 골라져 있음 */
  await t.click('#body .tr-pin[data-q="131"]');
  await t.waitFor('#tr-fq[data-q="131"]');
  t.eq(U.$('#body .tpl[data-q="131"]').dataset.kind, 'where', '막힌 칸에 맞는 종류');
  await t.click('#body [data-tr="send"][data-q="131"]');
  t.eq(U.$('#tr-ce').textContent, '쪽수나 검색어 중 하나는 적어 주세요.', '빈칸 검사');
  await t.click('#body [data-tr="kind"][data-q="131"]');
  t.eq(U.$('#body .tpl[data-q="131"]').dataset.kind, 'test', '다른 종류로');
  await t.click('#body [data-tr="kind"][data-q="131"]');
  await t.click('#body [data-tr="kind"][data-q="131"]');
  await t.click('#body [data-tr="kind"][data-q="131"]');
  t.eq(U.$('#body .tpl[data-q="131"]').dataset.kind, 'where', '한 바퀴 돌아옴');
  const ins = U.$$('#body .tpl[data-q="131"] input');
  await t.type(ins[0], '111');                          // 숫자가 이어져도 장난 글자가 아님
  await t.type(ins[1], '코일 자기장');
  await t.click('#body [data-tr="send"][data-q="131"]');
  await t.waitFor(() => /단서를 보냈어요/.test((U.$('#tr-fq') || {}).textContent || ''));
  const c = t.db.clues.find(x => x.question_id === 131 && x.author_id === 'u-A');
  t.expect(c && c.kind === 'where' && c.body === '교과서 111쪽 · 검색어 코일 자기장', '보낸 단서 — ' + (c && c.body));
  t.expect(U.$('#body .tr-flag[data-qid="131"] path[stroke="#fff"]'), '깃발 대신 보냄 표시');
  /* 나도 궁금해요 */
  await t.click('#body .tr-pin[data-q="141"]');
  await t.waitFor('#tr-fq[data-q="141"]');
  await t.click('#body [data-tr="curious"][data-q="141"]');
  await t.waitFor(() => t.db.curious_marks.some(m => m.question_id === 141 && m.user_id === 'u-A'));
  await t.waitFor(() => !U.$('#body [data-tr="curious"][data-q="141"]'));
  /* 쓰던 글은 다시 그려도 남음 */
  const in2 = U.$$('#body .tpl[data-q="141"] input');
  await t.type(in2[0], '120');
  repaint('forest');
  t.eq(U.$$('#body .tpl[data-q="141"] input')[0].value, '120', '다시 그려도 쓰던 글 그대로');
});

add('나무 · 단서 시간에는 숲에서 단서를 보내지 않고 함께 탭으로', async t => {
  const row = {id:QO.mock.h.seq('lesson_live'), teacher_id:1, grade:2, class_no:11, mode:'clue', stage:2, stage_started_at:new Date().toISOString(), active:true, created_at:new Date().toISOString()};
  t.db.lesson_live.push(row);
  await QO.live.refresh();
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  await t.click('#body .tr-pin[data-q="131"]');
  await t.waitFor('#tr-fq[data-q="131"] .tr-lock');
  t.expect(!U.$('#body [data-tr="send"]'), '보내기 단추 없음');
  row.active = false; await QO.live.refresh();
  await t.waitFor('#body [data-tr="send"][data-q="131"]');
});
})();
