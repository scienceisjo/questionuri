/* 함께 탭 — 단서 시간 · 모둠 탐구 일지 · 옆 모둠 · 소식(설계서 §3·§4, 시제품 renderTogether·groupHTML 기준).
   막힌 친구 질문은 단서 시간 카드와 우리 반 숲 깃발로만 받는다(친구 질문 목록은 두지 않음).
   데이터: QO.api.classmateQuestions(모둠 후보) · clueTargets · addClue · markCurious · myCurious · mySentClues · myGroup · myGroupFruits ·
   neighborInquiries(SQL 없음) · startGroupInquiry · saveGroupStep · pickTeller · writeHeard · sendGroupInquiry, 수업 진행은 QO.state.live(live:changed).
   안내·오류 글은 T.msg 에 두어 다시 그려도 남는다. */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg, ui = QO.ui, K = QO.K;
const esc = ui.esc, $$ = ui.$$;
const KIND_ORDER = ['where', 'test', 'me', 'ask'];
const WHY = [['tool', '오늘 도구로 알아볼 수 있나', '오늘 도구로 알아볼 수 있음'], ['all', '모두 궁금한가', '모두 궁금함']];
const ROLE_KINDS = ['method', 'find', 'compare', 'wrap', 'extra'];
const NEUTRAL = {bg:'#EEF0EA', fg:'#4E5A51'};
/* 모둠 진행 단계마다 학생 화면 안내(K.GROUP_STAGES 와 같은 순서) */
const GROUP_NOW = [
  '칠판을 봐요. 오늘 쓸 수 있는 도구를 선생님이 보여 줘요.',
  '모둠원 질문 중에서 함께 풀 질문을 하나 골라요.',
  '각자 예상을 한 줄씩 적어요. 까닭도 함께요.',
  '모둠이 함께 이야기하고, 맡은 사람이 알아볼 방법을 적어요.',
  '찾기를 맡은 두 사람은 서로 다른 곳에서 찾고, 다 찾으면 함께 견줘요.',
  '모둠이 함께 이야기하고, 정리를 맡은 사람이 받아 적어요.',
  '설명할 사람을 뽑아 옆 모둠에 설명해요. 옆 모둠 설명을 들었으면 「옆 모둠 설명 듣기」에 남겨요.'
];

/* ═══════════ 상태(사람이 바뀌면 새로) ═══════════ */
let T = fresh(null);
function fresh(uid){
  return {uid:uid, loaded:false, loading:null, seq:{}, errs:{}, msg:{},
    friends:[], targets:null, sent:[], g:{group:null, members:[], inquiry:null, steps:[]}, nb:[], gf:[], gfWait:0, curious:[],
    kind:{}, openRow:null, editing:null, pick:null, newPick:false, nbOpen:null,
    moreSent:false, morePick:false, chips:{}, drafts:{},
    clueEnded:null, endedSeen:false};
}
const meId = () => QO.state.me ? QO.state.me.id : null;
function ensure(){
  const id = meId(); if(!id) return false;
  if(T.uid !== id){ T = fresh(id); T.early = !QO.state.ready; }   // early: 들어오는 중(ready 전)에 만든 것
  if(!T.loaded && !T.loading) loadAll();
  return true;
}
/* 안내·오류 글 — 상태에 두고 그릴 때 다시 넣는다 */
const msgDiv = (key, cls) => '<div class="err' + (cls ? ' ' + cls : '') + '" role="alert" data-msg="' + esc(key) + '">' + esc(T.msg[key] || '') + '</div>';
function say(key, el, text){ T.msg[key] = text || ''; if(!text) delete T.msg[key]; if(el) el.textContent = text || ''; }

/* ═══════════ 읽기 — 늦게 온 옛 응답은 버린다 ═══════════ */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SOFT = {nb:'together:neighbor_inquiries', curious:'together:myCurious', gf:'together:myGroupFruits'}, warned = {};
async function fetchInto(key, fn){
  const my = T; if(!my.uid) return false;
  const n = my.seq[key] = (my.seq[key] || 0) + 1;
  try{
    const r = await fn();
    if(my !== T || my.seq[key] !== n) return false;
    const ch = !same(my[key], r) || !!my.errs[key];
    my[key] = r; delete my.errs[key];
    return ch;
  }catch(e){
    if(my !== T || my.seq[key] !== n || !QO.state.me || QO.state.me.id !== my.uid) return false;
    if(SOFT[key]){                           // neighbor_inquiries 는 아직 DB 에 없을 수 있다 → 조용히 빈 목록(한 번만 남김)
      if(!warned[key]){ warned[key] = true; QO.err(e, SOFT[key]); }
      if(!Array.isArray(my[key])) my[key] = [];
      return false;
    }
    my.errs[key] = e; QO.err(e, 'together:' + key);
    return true;
  }
}
const getGf = () => fetchInto('gf', () => QO.api.myGroupFruits());
/* 모둠 질문이 열매가 되면 내가 열매를 받았는지도 다시 읽는다(다 읽기 전에는 「못 받은 학생」 안내를 그리지 않음) */
const getGroup = () => { const my = T; return fetchInto('g', () => QO.api.myGroup()).then(ch => {
  const inq = my.g.inquiry;
  if(my !== T || !(inq && inq.status === 'fruit' && my.gf.indexOf(Number(inq.id)) < 0)) return ch;   // 사람이 바뀐 뒤 온 응답은 그대로 버림
  my.gfWait++;
  return getGf().then(c2 => ch || c2).finally(() => { my.gfWait--; });
}); };
const getCurious = () => fetchInto('curious', () => QO.api.myCurious());
const getSent = () => fetchInto('sent', () => QO.api.mySentClues());
const getNb = () => fetchInto('nb', () => QO.api.neighborInquiries());
const getFriends = () => fetchInto('friends', () => QO.api.classmateQuestions(60, null));
function getTargets(){
  const L = QO.state.live;
  if(!L || L.mode !== 'clue') return Promise.resolve(false);
  /* 한 번의 단서 시간 동안 카드 두 장은 그대로(보낸 뒤 다시 읽어도 자리·질문이 바뀌지 않게) */
  return fetchInto('targets', () => QO.api.clueTargets(2).then(rows => {
    rows = rows || [];
    const prev = T.targets;
    if(prev && prev.lid === L.id && prev.rows.length){
      const keep = prev.rows.map(p => rows.find(x => Number(x.id) === Number(p.id)) || p);
      rows = keep.concat(rows.filter(x => !keep.some(k => Number(k.id) === Number(x.id))).slice(0, Math.max(0, 2 - keep.length)));
    }
    return {lid:L.id, rows:rows};
  }));
}
function loadAll(){
  const my = T; if(!my.uid) return Promise.resolve();
  if(my.loading) return my.loading;
  const p = Promise.all([getGroup(), getSent(), getFriends(), getNb(), getTargets(), getCurious(), getGf()]).then(() => {
    if(my !== T || my.loading !== p) return;     // 더 나중에 시작한 읽기가 있으면 그쪽이 마무리
    my.loaded = true; my.loading = null;
    repaint(true);
  });
  my.loading = p;
  return p;
}
function reload(){ T.loading = null; return loadAll(); }
function repaint(group){ if(group) QO.bus.emit('group:changed'); QO.tabs.rerender('together'); }
const rr = () => QO.tabs.rerender('together');

/* ═══════════ 작은 도우미 ═══════════ */
const cut = (s, n) => { s = String(s || ''); return Array.from(s).length > n ? Array.from(s).slice(0, n).join('') + '…' : s; };
const tms = ts => ts ? new Date(ts).getTime() : 0;
function batchim(s){ const c = String(s || '').trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 !== 0 : /[013678]$/.test(String(s)); }
const ga = name => name === '나' ? '내가' : name + (batchim(name) ? '이' : '가');
const wa = name => name + (batchim(name) ? '과' : '와');
const josaNum = name => name + (/[①③]$/.test(name) ? '과' : '와');
function member(uid){ return T.g.members.find(m => m.user_id === uid) || null; }
function nameOf(uid){ if(uid && uid === meId()) return '나'; const m = member(uid); return m ? (m.name || '모둠원') : uid ? '옆 모둠' : ''; }
function avOf(uid){
  if(uid && uid === meId()){ const me = QO.state.me; const a = ui.avatar(me.name, me.number); return {bg:a.bg, fg:a.fg, ch:'나'}; }
  const m = member(uid); if(!m) return Object.assign({ch:'?'}, NEUTRAL);
  return ui.avatar(m.name, m.number);
}
const avHTML = a => '<span class="av" style="background:' + a.bg + ';color:' + a.fg + '" aria-hidden="true">' + esc(a.ch) + '</span>';
function sentOn(qid){ return T.sent.filter(c => Number(c.question_id) === Number(qid)); }
function sentDuring(L){ const t0 = tms(L.created_at); return T.sent.filter(c => tms(c.created_at) >= t0); }
const stepLabel = k => QO.journal.stepName(k) || '';

/* ═══════════ 단서 — 종류 넷, 빈칸 틀 ═══════════ */
function kindList(f){
  const first = K.STUCK_KIND[f.flag_step] || 'where';
  const used = new Set(sentOn(f.id).map(c => c.kind));
  return [first].concat(KIND_ORDER.filter(k => k !== first)).filter(k => !used.has(k));
}
function curKind(f){ const ks = kindList(f), k = T.kind[f.id]; return ks.indexOf(k) >= 0 ? k : (ks[0] || null); }
function curiousBtn(qid){
  return T.curious.indexOf(Number(qid)) >= 0 ? '<button type="button" class="link" disabled>💧 물을 줬어요</button>'
    : '<button type="button" class="link" data-tg="curious" data-q="' + qid + '">💧 물 주기</button>';
}
const clueKey = (ctx, qid, kind) => 'c:' + ctx + ':' + qid + ':' + kind;
function clueFormHTML(f, ctx){
  const kind = curKind(f), qid = Number(f.id);
  if(!kind) return '<div class="hint tg-lock">이 질문에는 단서 종류 넷을 모두 보냈어요.</div>';
  const KD = K.CLUE_KINDS[kind];
  let h = '<div class="lbl tg-lbl">정답 말고, 찾아갈 길을 알려 줘요 · ' + esc(KD.n) + '</div><div class="tpl">' +
    KD.parts.map((p, i) => typeof p === 'string' ? '<span>' + esc(p) + '</span>'
      : '<input data-i="' + i + '" data-tgk="c:' + ctx + ':' + qid + ':' + kind + ':' + i + '" placeholder="' + esc(p.ph) + '" aria-label="' + esc(p.ph) + '" style="max-width:' + p.w + 'px" maxlength="24" autocomplete="off">').join('') + '</div>';
  h += '<div class="row" style="margin-top:10px"><button type="button" class="btn teal" style="flex:1" data-tg="clue-send" data-q="' + qid + '" data-kind="' + kind + '" data-ctx="' + ctx + '">보내기</button></div>' + msgDiv(clueKey(ctx, qid, kind));
  h += '<div class="row tg-acts">' + (kindList(f).length > 1 ? '<button type="button" class="link teal" data-tg="clue-kind" data-q="' + qid + '">다른 종류로</button>' : '<span></span>') +
    curiousBtn(qid) + '</div>';
  return h;
}
/* 단서 시간 카드(ctx 'live') — 이름은 보이지 않는다 */
function friendCardHTML(f, ctx, L){
  const qid = Number(f.id);
  let h = '<div class="card fq tg-fq" data-q="' + qid + '" data-ctx="' + ctx + '"><div class="who"><span class="tg-name">같은 반 친구 · 이름은 보이지 않아요</span>' +
    (f.flag_step ? '<span class="tag flag">' + esc(stepLabel(f.flag_step)) + '에서 막힘</span>' : '') + '</div>' +
    '<div class="qt">' + esc(f.body) + '</div>' + (f.flag_tried ? '<div class="tried">여기까지 해 봤어요: ' + esc(f.flag_tried) + '</div>' : '');
  const mine = sentOn(qid);
  mine.forEach(c => { h += '<div class="sent">단서를 보냈어요 — 「' + esc(c.body) + '」</div>'; });
  if(L.stage === 1) return h + '<div class="hint" style="margin-top:8px">「단서 하나 보내기」 때 여기서 보내요.</div></div>';
  if(L.stage !== 2) return h + '</div>';
  const during = sentDuring(L);
  if(during.length){
    if(!during.some(c => Number(c.question_id) === qid)) h += '<div class="hint tg-lock">단서는 한 사람이 하나씩 보내요.</div>';
    return h + '</div>';
  }
  return h + clueFormHTML(f, ctx) + '</div>';
}
function findFriend(qid){
  qid = Number(qid);
  const t = T.targets && T.targets.rows ? T.targets.rows.find(x => Number(x.id) === qid) : null;
  return t || null;
}
async function sendClue(btn){
  const qid = Number(btn.dataset.q), kind = btn.dataset.kind, ctx = btn.dataset.ctx;
  const box = btn.closest('.tg-fq'), err = box.querySelector('.err'), KD = K.CLUE_KINDS[kind], key = clueKey(ctx, qid, kind);
  const ins = $$('.tpl input', box), val = i => String(i.value || '').trim();
  const filled = ins.filter(i => val(i));
  say(key, err, '');
  if(KD.any ? !filled.length : filled.length < ins.length){
    const emp = ins.find(i => !val(i));
    say(key, err, KD.any ? '쪽수나 검색어 중 하나는 적어 주세요.' : '빈칸을 채워 주세요.');
    (emp || ins[0]).focus(); return;
  }
  for(const i of filled){
    const v = val(i);
    if(/[ㅋㅎ\u110F\u1112]{2,}/.test(v) || /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(v)){ say(key, err, '장난 글자는 보낼 수 없어요.'); i.focus(); return; }
  }
  let text = '';
  KD.parts.forEach((p, idx) => {
    if(typeof p === 'string'){ text += p; return; }
    const el = ins.find(i => Number(i.dataset.i) === idx);
    let v = el ? val(el) : '';
    if(kind === 'where' && idx === 1) v = v.replace(/쪽$/, '').trim();
    text += v || '__';
  });
  if(KD.any) text = text.replace('교과서 __쪽 · ', '').replace(' · 검색어 __', '');
  text = text.trim();
  if(text.indexOf('__') >= 0){ say(key, err, '빈칸을 채워 주세요.'); return; }
  if(sentOn(qid).some(c => c.kind === kind)){ say(key, err, '이 질문에는 같은 종류의 단서를 이미 보냈어요'); return; }
  const L = QO.state.live;
  if(ctx === 'live' && L && L.mode === 'clue' && sentDuring(L).length){ say(key, err, '단서는 한 사람이 하나씩 보내요.'); return; }
  const my = T;
  const id = await ui.busy(btn, () => QO.api.addClue(qid, kind, text), {errEl:err});
  if(my !== T) return;
  if(id === undefined){ say(key, null, err.textContent); return; }
  say(key, null, '');
  const f = findFriend(qid);
  dropDrafts('c:' + ctx + ':' + qid + ':');
  T.sent = [{id:id, question_id:qid, kind:kind, step:KD.step, body:text, created_at:new Date().toISOString(), thanked_at:null, thanks_text:null, declined_at:null, hidden_at:null,
    question_body:f ? f.body : null}].concat(T.sent);
  delete T.kind[qid];
  rr(); ui.toast('단서를 보냈어요.');
  const r = await Promise.all([getSent(), getTargets()]);
  if(r.some(Boolean)) rr();
}
async function markCurious(btn, qid){
  const my = T;
  const ok = await ui.busy(btn, () => QO.api.markCurious(qid));
  if(ok === undefined || my !== T) return;
  if(ok === false){ ui.toast('이 질문에는 표시할 수 없어요.'); return; }
  if(T.curious.indexOf(qid) < 0) T.curious.push(qid);
  const got = await QO.acorn('water', qid);
  rr(); ui.toast('친구 질문에 물을 줬어요' + (got ? ' · 🌰 +' + got : '') + '.');
}

/* ═══════════ 단서 시간(mode 'clue') ═══════════ */
function clueLiveHTML(L){
  const st = K.LESSON_STAGES[L.stage] || K.LESSON_STAGES[0];
  let h = '<div class="stage tg-stage"><div class="h"><b>단서 시간</b><span class="time" id="tgTime" aria-label="남은 시간">' + ui.clock(QO.live.left(L)) + '</span></div><ol>' +
    K.LESSON_STAGES.map((s, i) => '<li class="' + (i === L.stage ? 'on' : '') + '"' + (i === L.stage ? ' aria-current="step"' : '') + '>' + esc(s[0]) + '</li>').join('') +
    '</ol><div class="now">' + esc(st[2]) + '</div></div>';
  if(L.stage >= 1){
    const rows = T.targets && T.targets.lid === L.id ? T.targets.rows : null;
    if(!rows) h += '<div class="card tg-fq"><div class="hint">친구 질문을 불러오는 중이에요.</div></div>';
    else if(!rows.length) h += '<div class="card tg-fq"><div class="hint">지금은 단서를 기다리는 친구 질문이 없어요.</div></div>';
    else rows.forEach(f => { h += friendCardHTML(f, 'live', L); });
  }
  return h;
}
function endedHTML(){
  const E = T.clueEnded, n = T.sent.filter(c => tms(c.created_at) >= tms(E.since)).length;
  return '<div class="card tg-ended"><b>단서 시간이 끝났어요.</b><div class="hint">보낸 단서 ' + n + '개. 친구가 그 단서로 한 걸음 가면 내 나무에 꽃이 피어요.</div></div>';
}

/* ═══════════ 모둠 일지 — 칸(group_steps)을 줄로 ═══════════ */
function editable(){ const i = T.g.inquiry; return !!i && (i.status === 'open' || i.status === 'returned'); }
function rowsOf(){
  const g = T.g, me = meId(), st = g.steps || [], inq = g.inquiry, ed = editable();
  const done = s => !!s.done_at;
  const cnt = k => st.filter(s => s.kind === k && done(s)).length;
  const finders = st.filter(s => s.kind === 'find').map(s => s.assignee_id);
  const can = k => k === 'compare' ? cnt('find') >= 2 : k === 'wrap' ? cnt('compare') >= 1 : (k === 'used' || k === 'tell') ? cnt('wrap') >= 1 : k === 'heard' ? cnt('tell') >= 1 : true;
  const rows = [], multi = {};
  st.forEach(s => {
    if(s.kind === 'predict' || s.kind === 'used'){
      if(multi[s.kind]){ multi[s.kind].steps.push(s); return; }
      const r = {key:s.kind, kind:s.kind, name:s.kind === 'predict' ? '예상' : (K.GROUP_KINDS.used || s.name), multi:true, steps:[s]};
      multi[s.kind] = r; rows.push(r); return;
    }
    rows.push({key:'s' + s.id, kind:s.kind, name:s.name, multi:false, steps:[s]});
  });
  rows.forEach(r => {
    const s0 = r.steps[0];
    r.can = can(r.kind);
    if(r.kind === 'tell' || r.kind === 'heard') r.mine = null;
    else if(r.multi) r.mine = r.steps.find(s => s.assignee_id === me) || null;
    else r.mine = (s0.assignee_id === me || (r.kind === 'compare' && finders.indexOf(me) >= 0)) ? s0 : null;
    r.done = r.steps.every(done);
    r.turn = ed && r.can && !!r.mine && !done(r.mine);
    r.editId = ed && r.mine && done(r.mine) ? r.mine.id : null;
    const some = r.steps.some(done);
    if(r.turn) r.state = 'me';
    else if(r.done) r.state = 'ok';
    else if(r.kind === 'tell' && r.can && inq && inq.status !== 'fruit') r.state = tellOpen() ? 'pick' : 'later';
    else if(!r.can) r.state = 'wait';
    else if(!ed && r.kind !== 'heard') r.state = some ? 'part' : 'empty';
    else r.state = 'doing';
    /* 누구 칸인가 */
    if(r.kind === 'predict'){ r.who = '각자 한 줄'; r.av = Object.assign({ch:'각'}, NEUTRAL); }
    else if(r.kind === 'used'){ r.who = '모두 한 줄씩'; r.av = Object.assign({ch:'모'}, NEUTRAL); }
    else if(r.kind === 'heard'){ r.who = '옆 모둠이 남겨요'; r.av = Object.assign({ch:'옆'}, NEUTRAL); }
    else if(r.kind === 'tell'){ r.who = done(s0) ? ga(nameOf(s0.assignee_id)) + ' 설명해요' : '그 자리에서 뽑기'; r.av = done(s0) ? avOf(s0.assignee_id) : Object.assign({ch:'?'}, NEUTRAL); }
    else if(r.kind === 'compare'){
      const ns = finders.map(nameOf).filter(Boolean);
      r.who = ns.join(' · ') || nameOf(s0.assignee_id); r.av = avOf(finders.indexOf(me) >= 0 ? me : (finders[0] || s0.assignee_id));
    }
    else if(r.kind === 'wrap'){ r.who = (nameOf(s0.assignee_id) || '정하지 않음') + ' · 모둠 회의 뒤 받아 적기'; r.av = avOf(s0.assignee_id); }
    else { r.who = nameOf(s0.assignee_id) || '정하지 않음'; r.av = avOf(s0.assignee_id); }
  });
  return rows;
}
/* 설명할 사람은 그 자리에서 — 모둠 진행 중이면 「옆 모둠에 설명」(마지막) 단계에서만 뽑는다 */
function tellOpen(){ const L = QO.state.live; return !L || (L.mode === 'group' && L.stage === K.GROUP_STAGES.length - 1); }
function qualifies(uid){
  const st = T.g.steps || [];
  return st.some(s => s.assignee_id === uid && ROLE_KINDS.indexOf(s.kind) >= 0 && s.done_at) && st.some(s => s.assignee_id === uid && s.kind === 'used' && s.done_at);
}
function myTurns(){ if(!T.uid || T.uid !== meId() || !T.g.inquiry) return []; return rowsOf().filter(r => r.turn); }
const ST = {me:['me', '내 차례'], ok:['ok', '했어요'], wait:['no', '앞 칸 기다림'], doing:['no', '쓰는 중'], empty:['no', '비어 있어요'], part:['no', '일부 비어 있어요'], pick:['me', '뽑을 차례'], later:['no', '설명 때 뽑기']};
const stateHTML = r => '<span class="st ' + ST[r.state][0] + '">' + ST[r.state][1] + '</span>';

function bodyHTML(r){
  const me = meId(), s0 = r.steps[0];
  const empty = '<span class="tg-mute">아직 비어 있어요</span>';
  let h = '';
  if(r.multi){
    const hide = r.kind === 'predict' && r.mine && !r.mine.done_at;
    h = r.steps.map(s => '<div class="tg-line"><b>' + esc(nameOf(s.assignee_id)) + '</b> ' +
      (s.done_at ? (hide && s.assignee_id !== me ? '<span class="tg-mute">썼어요</span>' : esc(s.body)) : empty) + '</div>').join('');
    if(hide && r.steps.some(s => s.done_at && s.assignee_id !== me)) h += '<div class="hint">내 예상을 먼저 쓰면 모둠원 예상이 보여요.</div>';
  } else if(r.kind === 'find' || r.kind === 'extra'){
    h = s0.done_at ? (s0.src ? '<div class="tg-src">출처: ' + esc(s0.src) + '</div>' : '') + esc(s0.body) : empty;
  } else if(r.kind === 'tell'){
    h = s0.done_at ? (s0.assignee_id === me ? '내가 뽑혔어요. 우리 모둠 질문과 정리를 옆 모둠에 설명해요.' : esc(ga(nameOf(s0.assignee_id))) + ' 옆 모둠에 설명해요.')
      : r.state === 'later' ? '「옆 모둠에 설명」 단계가 되면 그 자리에서 뽑아요.' : '정리가 차면 그 자리에서 뽑아요.';
  } else if(r.kind === 'heard'){
    h = s0.done_at ? esc(s0.body) : '옆 모둠이 설명을 듣고 한 줄 요약과 되묻기를 남겨요.';
  } else {
    h = s0.done_at ? esc(s0.body) : (!r.can ? '앞 칸이 차면 쓸 수 있어요.' : empty);
  }
  if(r.editId) h += '<div><button type="button" class="link teal" data-tg="gedit" data-step="' + r.editId + '">' + (r.kind === 'predict' ? '근거 보태기' : '고치기') + '</button></div>';
  return h;
}
function formHTML(r){
  if(r.kind === 'tell') return '<div class="tg-pickbox"><div class="hint">모둠원 중 한 사람을 그 자리에서 뽑아요.</div>' +
    '<button type="button" class="btn teal wide" data-tg="tell-pick">설명할 사람 뽑기</button>' + msgDiv('tell') + '</div>';
  const s = T.g.steps.find(x => x.id === (T.editing && r.editId === T.editing ? T.editing : (r.mine && r.mine.id))) || r.mine;
  const id = s.id, k = 'g' + id + ':';
  const field = (f, ph, rows) => rows
    ? '<textarea class="inp" rows="' + rows + '" data-tgk="' + k + f + '" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '"></textarea>'
    : '<input class="inp" data-tgk="' + k + f + '" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" autocomplete="off">';
  const btn = label => '<button type="button" class="btn wide" data-tg="gsave" data-step="' + id + '">' + label + '</button>' +
    (T.editing === id ? '<button type="button" class="link" data-tg="gcancel">그만 고치기</button>' : '') + msgDiv('g' + id);
  const steps = T.g.steps;
  const val = (label, x) => '<div class="val"><b>' + esc(label) + '</b> ' + (x && x.src ? '[' + esc(x.src) + '] ' : '') + esc(x ? x.body || '' : '') + '</div>';
  switch(s.kind){
    case 'predict':
      /* 예상은 덮어쓰지 않는다 — 올린 뒤에는 근거만 덧붙인다 */
      if(s.done_at) return '<div class="form">' + val('처음 예상', s) + field('add', '보탤 근거 한 줄 (예: 왜냐하면 ~)', 2) + btn('근거 보태기') + '</div>';
      return '<div class="form">' + field('t', '내 생각과 그 까닭 (예: ~일 것 같다. 왜냐하면 ~)', 3) + btn('모둠 일지에 올리기') + '</div>';
    case 'method': {
      const on = T.chips['g' + id] || [];
      return '<div class="form"><div class="chips" role="group" aria-label="알아볼 방법">' + K.METHODS.map(m => '<button type="button" class="chip' + (on.indexOf(m[0]) >= 0 ? ' on' : '') +
        '" aria-pressed="' + (on.indexOf(m[0]) >= 0) + '" data-tg="mchip" data-step="' + id + '" data-m="' + m[0] + '">' + esc(m[1]) + '</button>').join('') + '</div>' +
        field('t', '무엇을 바꾸고 무엇을 볼지, 또는 어디서 찾을지', 2) + btn('모둠 일지에 올리기') + '</div>';
    }
    case 'find': case 'extra': {
      const others = steps.filter(x => (x.kind === 'find' || x.kind === 'extra') && x.id !== id);
      const partner = others.find(x => x.kind === 'find' && x.assignee_id && x.assignee_id !== meId());
      const ph = s.kind === 'extra' ? '어디서? 찾기 ①·②와 다른 곳에서' : partner ? '어디서? ' + wa(nameOf(partner.assignee_id)) + ' 다른 곳에서' : '어디서? (교과서 쪽수, 누리집 이름)';
      return '<div class="form">' + field('s', ph) + field('t', '알아낸 것을 내 말로', 3) + btn('모둠 일지에 올리기') + '</div>';
    }
    case 'compare': {
      const fs = steps.filter(x => x.kind === 'find');
      const partner = fs.map(x => x.assignee_id).find(u => u && u !== meId());
      return '<div class="form"><div class="tg-cmpsrc">' + fs.map(x => val(x.name, x)).join('') + '</div>' +
        '<div class="hint">찾기 ①과 ②를 ' + esc(partner ? wa(nameOf(partner)) : '모둠원과') + (partner ? ' ' : '') + '함께 읽고 써요.</div>' +
        field('a', '두 출처가 같은 말을 하는 곳') + field('b', '다른 곳, 또는 더 믿을 만한 쪽과 그 까닭') + btn('비교 올리기') + '</div>';
    }
    case 'wrap': {
      const c = steps.find(x => x.kind === 'compare');
      return '<div class="form">' + (c && c.done_at ? '<div class="tg-cmpsrc">' + val('두 출처 비교', c) + '</div>' : '') +
        '<div class="hint">모둠 회의에서 나온 말을 받아 적어요.</div>' + field('t', '알아낸 것을 모둠의 말로', 3) + btn('정리 올리기') + '</div>';
    }
    case 'used': {
      const w = steps.find(x => x.kind === 'wrap');
      return '<div class="form">' + (w && w.done_at ? '<div class="tg-cmpsrc">' + val('정리', w) + '</div>' : '') +
        field('t', '내가 찾은 「__」이(가) 정리의 「__」 부분에 들어갔어요') + btn('한 줄 올리기') + '</div>';
    }
  }
  return '';
}
function rowHTML(r){
  const editing = !!T.editing && r.editId === T.editing;
  const form = r.turn || editing || r.state === 'pick';
  const open = !form && T.openRow === r.key;
  let h = '<div class="grow tg-row" data-k="' + r.key + '" data-kind="' + r.kind + '"><button type="button" class="grow-h" data-tg="row" data-k="' + r.key + '" aria-expanded="' + (form || open) + '">' +
    avHTML(r.av) + '<span class="nm">' + esc(r.name) + '<small>' + esc(r.who) + '</small></span>' + stateHTML(r) + '</button>';
  if(form) h += '<div class="grow-b tg-formwrap">' + formHTML(r) + '</div>';
  else if(open) h += '<div class="grow-b">' + bodyHTML(r) + '</div>';
  return h + '</div>';
}
function bandHTML(gl, rows){
  const st = K.GROUP_STAGES[gl.stage] || K.GROUP_STAGES[0];
  let mine = '';
  if(gl.stage >= 2 && editable()){
    const turns = rows.filter(r => r.turn);
    if(turns.length) mine = '<div class="now tg-mine"><b>내 차례:</b> ' + esc(turns.map(r => r.name).join(' · ')) + '</div>';
    else {
      const pre = rows.find(r => r.kind === 'predict');
      mine = '<div class="now tg-idle">지금 내 차례 칸이 없어요. 기다리는 동안 다른 출처를 하나 더 찾아 두거나 내 예상에 근거를 보태요.' +
        (pre && pre.editId ? ' <button type="button" class="tg-onteal" data-tg="gedit" data-step="' + pre.editId + '">내 예상에 근거 보태기</button>' : '') + '</div>';
    }
  }
  return '<div class="stage tg-gstage"><div class="h"><b>지금: ' + esc(st[0]) + ' — ' + Math.round(st[1] / 60) + '분</b><span class="time" id="tgTime" aria-label="남은 시간">' + ui.clock(QO.live.left(gl)) + '</span></div>' +
    '<div class="tg-gbar" aria-hidden="true">' + K.GROUP_STAGES.map((s, i) => '<i class="' + (i < gl.stage ? 'd' : i === gl.stage ? 'on' : '') + '"></i>').join('') + '</div>' +
    '<div class="now">' + esc(GROUP_NOW[gl.stage] || '') + '</div>' + mine + '</div>';
}
function candidates(){
  const me = meId(), nums = new Set(T.g.members.filter(m => m.user_id !== me && m.number != null).map(m => Number(m.number)));
  const mine = (QO.state.questions || []).filter(q => !q.is_anonymous && !q.fruit_kind)
    .map(q => ({id:q.id, text:(q.refined_text && String(q.refined_text).trim()) || q.text, who:'내 질문'}));
  const others = (T.friends || []).filter(f => !f.is_anonymous && f.owner_number != null && nums.has(Number(f.owner_number)))
    .map(f => ({id:f.id, text:f.body, who:f.owner_name || '모둠원'}));
  return mine.concat(others);
}
function pickHTML(){
  const P = T.pick || (T.pick = {sel:null, why:[]});
  const c = candidates(), shown = T.morePick ? c : c.slice(0, 8);
  const names = T.g.members.map(m => m.user_id === meId() ? '나' : m.name).join(' · ');
  let h = '<div class="tg-gq">함께 풀 질문 고르기</div><div class="hint">모둠원: ' + esc(names) + '</div><div class="hint tg-why">모둠원 질문 중에서 하나를 함께 골라요.</div><div class="tg-picks">';
  if(!c.length) h += '<div class="hint">모둠원 질문이 아직 없어요. 함께 정한 질문을 직접 적어도 돼요.</div>';
  h += shown.map(q => { const on = P.sel === String(q.id); return '<button type="button" class="qcard tg-pick' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-tg="pick-q" data-q="' + q.id + '"><span class="qt">' + esc(q.text) + '</span><span class="tg-pwho">' + esc(q.who) + '</span></button>'; }).join('');
  if(c.length > shown.length) h += '<button type="button" class="fold tg-more" data-tg="pick-more">질문 더 보기</button>';
  const own = P.sel === 'own';
  h += '<button type="button" class="qcard tg-pick' + (own ? ' sel' : '') + '" aria-pressed="' + own + '" data-tg="pick-q" data-q="own"><span class="qt">직접 적기</span><span class="tg-pwho">모둠이 함께 정한 질문</span></button>';
  if(own) h += '<input class="inp tg-own" data-tgk="pick:own" placeholder="모둠이 함께 정한 질문" aria-label="모둠이 함께 정한 질문" maxlength="120" autocomplete="off">';
  h += '</div><div class="lbl tg-lbl">고르기 전에 함께 살펴봐요</div><div class="chips">' + WHY.map(w => { const on = P.why.indexOf(w[0]) >= 0; return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-tg="pick-why" data-w="' + w[0] + '">' + esc(w[1]) + '</button>'; }).join('') + '</div>' +
    '<button type="button" class="btn wide tg-start" data-tg="pick-start">이 질문으로 시작하기</button>' + msgDiv('pick', 'tg-pickerr');
  return h;
}
function groupHTML(){
  const g = T.g, L = QO.state.live, gl = L && L.mode === 'group' ? L : null;
  if(T.errs.g && !g.group) return '<div class="sec">우리 모둠 일지</div><div class="card"><div class="hint">모둠 일지를 불러오지 못했어요.</div></div>';
  if(!g.group) return '<div class="sec">우리 모둠 일지</div><div class="card tg-group">' + (gl ? bandHTML(gl, []) : '') +
    '<div class="hint">아직 모둠이 없어요. 선생님이 모둠을 만들면 여기에 우리 모둠 일지가 열려요.</div></div>';
  const name = g.group.name || (g.group.group_no + '모둠');
  const head = '<div class="sec">' + esc(name) + ' 함께 푸는 질문</div><div class="card tg-group">';
  const inq = g.inquiry;
  if(!inq || (inq.status === 'fruit' && T.newPick)) return head + (gl ? bandHTML(gl, []) : '') + pickHTML() + '</div>';
  const rows = rowsOf();
  let h = head + (gl ? bandHTML(gl, rows) : '');
  h += '<div class="tg-gq">' + esc(inq.question_text) + '</div>' + (inq.why ? '<div class="hint tg-why">고른 까닭: ' + esc(inq.why) + '</div>' : '');
  if(inq.status === 'returned') h += '<div class="tchbox"><b>선생님 글</b>' + esc(inq.teacher_note || '선생님이 일지를 되돌려 보냈어요.') + '</div><div class="hint tg-why">칸을 고친 뒤 다시 선생님께 보내요.</div>';
  rows.forEach(r => { h += rowHTML(r); });
  const wrapDone = (g.steps || []).some(s => s.kind === 'wrap' && s.done_at);
  if(inq.status === 'wait') h += '<div class="statusbar wait tg-status">선생님이 읽는 중이에요.</div>';
  else if(inq.status === 'fruit'){
    const n = g.members.filter(m => qualifies(m.user_id)).length;
    h += '<div class="statusbar fruit tg-status">' + (n ? '칸을 맡아 채운 ' + n + '명의 나무에 열매가 열렸어요.' : '선생님이 모둠 일지를 확인했어요.') + '</div>';
    if(T.gf.indexOf(Number(inq.id)) < 0 && !T.gfWait) h += '<div class="rule">다음 모둠 일지에서 칸을 맡으면 열매를 받아요.</div>';
    h += '<button type="button" class="btn soft wide tg-send" data-tg="new-pick">새 질문 고르기</button>';
  } else {
    if(wrapDone) h += '<button type="button" class="btn wide tg-send" data-tg="send-group">선생님께 보내기</button>' + msgDiv('send', 'tg-senderr');
    h += '<div class="rule">예상 말고 맡은 칸을 하나 채우고 「내 칸이 정리 어디에 쓰였나」까지 쓰면 모둠 열매를 받아요. 옆 모둠에 설명할 사람은 그 자리에서 뽑으니 모두가 전체를 알아 두어요.</div>';
  }
  return h + '</div>';
}

/* ═══════════ 모둠 일지 쓰기 ═══════════ */
function dropDrafts(prefix){ Object.keys(T.drafts).forEach(k => { if(k.indexOf(prefix) === 0) delete T.drafts[k]; }); }
function rowKeyOf(s){ return (s.kind === 'predict' || s.kind === 'used') ? s.kind : 's' + s.id; }
function startEdit(stepId){
  const s = T.g.steps.find(x => x.id === stepId); if(!s) return;
  const k = 'g' + stepId + ':', body = s.body || '';
  if(s.kind === 'predict'){
    /* 근거 보태기 — 처음 글은 그대로, 빈칸에서 시작 */
  } else if(s.kind === 'method'){
    const m = /^(.+?) — ([\s\S]*)$/.exec(body);
    T.chips['g' + stepId] = m ? m[1].split(', ').map(l => (K.METHODS.find(x => x[1] === l.trim()) || [])[0]).filter(Boolean) : [];
    if(T.drafts[k + 't'] == null) T.drafts[k + 't'] = m ? m[2] : body;
  } else if(s.kind === 'compare'){
    const m = /^같은 곳: ([\s\S]*?) \/ 다른 곳: ([\s\S]*)$/.exec(body);
    if(T.drafts[k + 'a'] == null) T.drafts[k + 'a'] = m ? m[1] : body;
    if(T.drafts[k + 'b'] == null) T.drafts[k + 'b'] = m ? m[2] : '';
  } else {
    if(T.drafts[k + 't'] == null) T.drafts[k + 't'] = body;
    if((s.kind === 'find' || s.kind === 'extra') && T.drafts[k + 's'] == null) T.drafts[k + 's'] = s.src || '';
  }
  T.editing = stepId; T.openRow = rowKeyOf(s);
  rr();
  focusSoon('[data-tgk^="' + k + '"]');
}
function focusSoon(sel){ setTimeout(() => { const el = document.querySelector('.tg-root ' + sel); if(el){ try{ el.focus({preventScroll:false}); }catch(_){} } }, 0); }
async function saveStep(btn){
  const id = Number(btn.dataset.step), s = T.g.steps.find(x => x.id === id); if(!s) return;
  const box = btn.closest('.form') || btn.parentNode, err = box.querySelector('.err');
  const v = f => String((box.querySelector('[data-tgk="g' + id + ':' + f + '"]') || {}).value || '').trim();
  const steps = T.g.steps, inq = T.g.inquiry, key = 'g' + id;
  let body = '', src = null, why = '';
  say(key, err, '');
  if(s.kind === 'predict' && s.done_at){
    const add = v('add');
    body = (s.body || '') + ' · 보탠 근거: ' + add;
    why = Array.from(add).length < 4 ? '보탤 근거를 한 줄 적어 주세요.' : Array.from(body).length > 500 ? '더 보탤 자리가 없어요. 짧게 적어 주세요.' : QO.check.junkWhy(add, [s.body]);
  } else if(s.kind === 'predict'){
    body = v('t');
    why = Array.from(body).length < 6 ? '내 생각을 한 줄로 적어 주세요.' : !QO.check.hasReason(body) ? '까닭도 한 마디 적어 주세요(왜냐하면·때문에·~니까).' : QO.check.junkWhy(body, [inq && inq.question_text]);
  } else if(s.kind === 'method'){
    const on = T.chips['g' + id] || [], plan = v('t');
    why = !on.length ? '방법을 하나 골라 주세요.' : Array.from(plan).length < 4 ? '무엇을 할지 한 줄로 적어 주세요.' : QO.check.junkWhy(plan, [inq && inq.question_text]);
    body = K.METHODS.filter(m => on.indexOf(m[0]) >= 0).map(m => m[1]).join(', ') + ' — ' + plan;
  } else if(s.kind === 'find' || s.kind === 'extra'){
    src = v('s'); body = v('t');
    const others = steps.filter(x => (x.kind === 'find' || x.kind === 'extra') && x.id !== id && x.done_at);
    const norm = x => String(x || '').replace(/\s+/g, '').toLowerCase();
    const dup = others.find(x => x.src && norm(x.src) === norm(src));
    why = (Array.from(src).length < 2 || Array.from(body).length < 10) ? '어디서 찾았는지와, 알아낸 것을 열 글자 넘게 적어 주세요.'
      : dup ? josaNum(dup.name) + ' 다른 출처에서 찾아 주세요.' : QO.check.junkWhy(body, others.map(x => x.body));
  } else if(s.kind === 'compare'){
    const a = v('a'), b = v('b');
    why = (Array.from(a).length < 4 || Array.from(b).length < 4) ? '같은 곳과 다른 곳을 하나씩 적어 주세요.' : QO.check.junkWhy(a + ' ' + b, []);
    body = '같은 곳: ' + a + ' / 다른 곳: ' + b;
  } else if(s.kind === 'wrap'){
    body = v('t');
    const c = steps.find(x => x.kind === 'compare');
    why = Array.from(body).length < 10 ? '정리를 열 글자 넘게 적어 주세요.' : QO.check.junkWhy(body, [c && c.body]);
  } else if(s.kind === 'used'){
    body = v('t');
    why = body.indexOf('__') >= 0 ? '빈칸을 채워 주세요.' : Array.from(body).length < 8 ? '한 줄을 조금 더 적어 주세요.' : QO.check.junkWhy(body, []);
  }
  if(why){ say(key, err, why); const el = box.querySelector('[data-tgk]'); if(el && !el.value) el.focus(); return; }
  const my = T;
  const r = await ui.busy(btn, () => QO.api.saveGroupStep(id, body, src), {errEl:err});
  if(my !== T) return;
  if(r === undefined){ say(key, null, err.textContent); return; }
  say(key, null, '');
  dropDrafts('g' + id + ':'); delete T.chips['g' + id];
  T.editing = null; T.openRow = null;
  await getGroup();
  repaint(true); ui.toast('모둠 일지에 올렸어요.');
}
async function startInquiry(btn){
  const P = T.pick || {sel:null, why:[]}, err = btn.parentNode.querySelector('.tg-pickerr'), g = T.g.group;
  say('pick', err, '');
  if(!P.sel){ say('pick', err, '함께 풀 질문을 하나 골라 주세요.'); return; }
  let qid = null, text = null;
  if(P.sel === 'own'){
    text = String(T.drafts['pick:own'] || '').trim();
    const j = Array.from(text).length < 5 ? '질문을 다섯 글자 넘게 적어 주세요' : QO.check.junkWhy(text, []);
    if(j){ say('pick', err, j); return; }
  } else qid = Number(P.sel);
  if(P.why.length < WHY.length){ say('pick', err, '두 기준을 모두 골라 주세요.'); return; }
  const why = WHY.filter(w => P.why.indexOf(w[0]) >= 0).map(w => w[2]).join(' · ');
  const my = T;
  const r = await ui.busy(btn, () => QO.api.startGroupInquiry(g.id, qid, text, why), {errEl:err});
  if(my !== T) return;
  if(r === undefined){
    say('pick', null, err.textContent);
    if(err.textContent === '이미 함께 푸는 질문이 있어요'){ say('pick', null, ''); await getGroup(); repaint(true); ui.toast('이미 함께 푸는 질문이 있어요'); }
    return;
  }
  say('pick', null, '');
  T.pick = null; T.newPick = false; T.morePick = false; dropDrafts('pick:');
  await getGroup();
  repaint(true); ui.toast('모둠 질문을 시작했어요.');
}
async function pickTeller(btn){
  const inq = T.g.inquiry; if(!inq) return;
  const err = btn.parentNode.querySelector('.err'), my = T;
  if(!tellOpen()){ say('tell', err, '「옆 모둠에 설명」 단계에서 뽑아요.'); return; }
  const who = await ui.busy(btn, () => QO.api.pickTeller(inq.id), {errEl:err});
  if(my !== T) return;
  if(who === undefined){ say('tell', null, err.textContent); return; }
  say('tell', null, '');
  await getGroup();
  repaint(true);
  ui.toast(who ? ga(nameOf(who)) + ' 뽑혔어요.' : '뽑을 모둠원이 없어요.');
}
async function sendGroup(btn){
  const inq = T.g.inquiry; if(!inq) return;
  const ok = await ui.confirm('선생님께 보낼까요? 보낸 뒤에는 칸을 고칠 수 없어요.', {ok:'보내기', cancel:'아직이요'});
  if(!ok) return;
  const err = btn.parentNode && btn.parentNode.querySelector('.tg-senderr'), my = T;
  const r = await ui.busy(btn, () => QO.api.sendGroupInquiry(inq.id), {errEl:err});
  if(my !== T) return;
  if(r === undefined){ say('send', null, err ? err.textContent : ''); return; }
  say('send', null, '');
  await getGroup();
  repaint(true); ui.toast(r ? '선생님께 보냈어요.' : '이미 보낸 일지예요.');
}

/* ═══════════ 옆 모둠 설명 듣기 ═══════════ */
function neighborHTML(){
  if(!T.g.group) return '';
  const L = QO.state.live, st6 = !!(L && L.mode === 'group' && L.stage === 6);
  if(!T.nb.length) return st6 ? '<div class="sec">옆 모둠 설명 듣기</div><div class="card"><div class="hint">옆 모둠이 질문을 고르면 여기에 보여요.</div></div>' : '';
  let h = '<div class="sec">옆 모둠 설명 듣기</div><div class="card tg-nb">';
  T.nb.forEach(n => {
    const id = Number(n.inquiry_id), open = T.nbOpen === id;
    const gname = n.group_name || (n.group_no + '모둠');
    const st = n.heard ? '<span class="st ok">남겼어요</span>' : n.told ? '<span class="st me">들은 것 남기기</span>' : '<span class="st no">설명 기다림</span>';
    const a = ui.avatar(gname, n.group_no);
    h += '<div class="grow tg-nbrow" data-inq="' + id + '"><button type="button" class="grow-h" data-tg="nb-row" data-inq="' + id + '" aria-expanded="' + open + '">' +
      avHTML({bg:a.bg, fg:a.fg, ch:String(n.group_no || '?')}) + '<span class="nm">' + esc(gname) + '<small>' + esc(cut(n.question_text, 40)) + '</small></span>' + st + '</button>';
    if(open){
      h += '<div class="grow-b tg-formwrap"><div class="val"><b>' + esc(n.question_text) + '</b></div>';
      if(n.heard) h += '<div class="hint">들은 것이 남아 있어요.</div>';
      else if(!n.told) h += '<div class="hint">' + esc(gname + (batchim(gname) ? '이' : '가')) + ' 설명할 사람을 뽑으면 여기에 남길 수 있어요.</div>';
      else h += '<div class="form"><div class="hint">설명을 듣고 한 줄 요약과 되묻기 하나를 남겨요.</div>' +
        '<input class="inp" data-tgk="nb' + id + ':a" placeholder="한 줄 요약 — 들은 설명을 우리 말로" aria-label="한 줄 요약" maxlength="200" autocomplete="off">' +
        '<input class="inp" data-tgk="nb' + id + ':b" placeholder="되묻기 — 그럼 ~는 어떨까요?" aria-label="되묻기" maxlength="200" autocomplete="off">' +
        '<button type="button" class="btn teal wide" data-tg="nb-save" data-inq="' + id + '">남기기</button>' + msgDiv('nb' + id) + '</div>';
      h += '</div>';
    }
    h += '</div>';
  });
  return h + '</div>';
}
async function saveHeard(btn){
  const id = Number(btn.dataset.inq), box = btn.closest('.form'), err = box.querySelector('.err');
  const v = f => String((box.querySelector('[data-tgk="nb' + id + ':' + f + '"]') || {}).value || '').trim();
  const a = v('a'), b = v('b'), key = 'nb' + id;
  say(key, err, '');
  if(Array.from(a).length < 4 || Array.from(b).length < 4){ say(key, err, '한 줄 요약과 되묻기를 모두 적어 주세요.'); return; }
  const j = QO.check.junkWhy(a, []) || QO.check.junkWhy(b, [a]);
  if(j){ say(key, err, j); return; }
  const my = T;
  const r = await ui.busy(btn, () => QO.api.writeHeard(id, a + ' · 되묻기: ' + b), {errEl:err});
  if(my !== T) return;
  if(r === undefined){ say(key, null, err.textContent); return; }
  say(key, null, '');
  dropDrafts('nb' + id + ':'); T.nbOpen = null;
  await getNb();
  rr(); ui.toast('옆 모둠에 남겼어요.');
}

/* ═══════════ 소식 · 보낸 단서 ═══════════ */
function thanksLine(t){ t = String(t || '').trim(); return t.indexOf('덕분에') === 0 ? t : '덕분에 ' + t; }
function newsHTML(){
  const items = [];
  T.sent.filter(c => c.thanked_at).forEach(c => items.push({at:c.thanked_at, e:'🌸',
    t:'「' + cut(c.question_body || '친구 질문', 14) + '」 친구가 내 단서 덕분에 한 걸음 갔대요. 「' + thanksLine(c.thanks_text) + '」'}));
  (QO.state.questions || []).filter(q => q.fruit_kind && q.fruit_source === 'teacher' && q.resolved_at).forEach(q => {
    const fog = q.fruit_kind === 'fog';
    items.push({at:q.resolved_at, svg:fog ? ui.FOG_SVG : null, e:'🍎',
      t:'「' + cut((q.refined_text && String(q.refined_text).trim()) || q.text, 14) + '」 질문을 선생님이 확인했어요. ' + (fog ? '안개 열매가' : '열매가') + ' 열렸어요.'});
  });
  items.sort((a, b) => tms(b.at) - tms(a.at));
  const list = items.slice(0, 6);
  return '<div class="sec">소식</div><div class="card tg-news">' + (list.length ? list.map(n => '<div class="news"><span class="e" aria-hidden="true">' + (n.svg || esc(n.e)) + '</span><span>' + esc(n.t) +
    '<small class="tg-time">' + esc(ui.fmtTime(n.at)) + '</small></span></div>').join('') : '<div class="empty">아직 소식이 없어요.</div>') + '</div>';
}
function sentHTML(){
  if(!T.sent.length) return '';
  const list = T.moreSent ? T.sent.slice(0, 40) : T.sent.slice(0, 4);
  return '<div class="sec">보낸 단서</div><div class="card tg-sentlist">' + list.map(c => '<div class="news"><span class="e" aria-hidden="true">' + (c.thanked_at ? '🌸' : '<i class="tg-dot"></i>') + '</span><span><b>' +
    esc((K.CLUE_KINDS[c.kind] || {}).n || '') + '</b> ' + esc(c.body) + '<small class="tg-time">「' + esc(cut(c.question_body || '친구 질문', 18)) + '」에 · ' + esc(ui.fmtTime(c.created_at)) +
    (c.hidden_at ? ' · 선생님이 가렸어요' : '') + '</small></span></div>').join('') +
    (T.sent.length > 4 ? '<button type="button" class="link" data-tg="more-sent">' + (T.moreSent ? '접기' : '보낸 단서 더 보기') + '</button>' : '') + '</div>';
}
/* ═══════════ 시연 도구(?mock=1 만) — 선생님 쪽 흐름을 이 화면에서 눌러 본다 ═══════════ */
function demoHTML(){
  if(!cfg.mock || cfg.shot || !QO.mock) return '';
  const L = QO.state.live, inq = T.g.inquiry, b = [];
  if(L && L.mode === 'clue') b.push(['clue-next', '단서 시간: 다음 단계로'], ['stop', '단서 시간 끝내기']);
  else if(L && L.mode === 'group') b.push(['group-next', '모둠 진행: 다음 단계'], ['stop', '모둠 진행 끝내기']);
  else b.push(['clue', '선생님이 단서 시간 시작'], ['group', '선생님이 모둠 진행 시작']);
  if(inq && editable() && demoFillable()) b.push(['fill', '다른 모둠원이 칸 채우기']);
  if(inq && inq.status === 'wait') b.push(['confirm', '선생님이 모둠 일지 확인'], ['return', '선생님이 되돌려 보냄']);
  return '<div class="demo"><div class="h">시연 도구 · 실제 학생 화면에는 없어요</div><div class="chips">' +
    b.map(x => '<button type="button" class="chip" data-tg="demo" data-d="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div></div>';
}
function demoFillable(){
  const db = QO.mock.db, inq = T.g.inquiry; if(!inq) return null;
  const st = db.group_steps.filter(s => s.inquiry_id === inq.id).sort((a, b) => a.step_no - b.step_no || a.id - b.id);
  const n = k => st.filter(s => s.kind === k && s.done_at).length;
  const ok = k => k === 'compare' ? n('find') >= 2 : k === 'wrap' ? n('compare') >= 1 : k === 'used' ? n('wrap') >= 1 : ['predict', 'method', 'find', 'extra'].indexOf(k) >= 0;
  return st.find(s => !s.done_at && s.assignee_id && s.assignee_id !== meId() && ok(s.kind)) || null;
}
function liveNow(start, mode, stage){
  const db = QO.mock.db, h = QO.mock.h, me = QO.state.me, at = new Date(Date.now() - (start || 0)).toISOString();
  db.lesson_live.forEach(l => { if(l.active && l.grade === me.grade && l.class_no === me.class_no) l.active = false; });
  const row = {id:h.seq('lesson_live'), teacher_id:1, grade:me.grade, class_no:me.class_no, mode:mode, stage:stage || 0, stage_started_at:at, active:true, created_at:at};
  db.lesson_live.push(row);
  return row;
}
async function demo(d){
  const db = QO.mock.db, h = QO.mock.h, me = QO.state.me; if(!db || !me) return;
  const at = h.nowISO();
  const L = db.lesson_live.find(l => l.active && l.grade === me.grade && l.class_no === me.class_no);
  const inq = T.g.inquiry ? db.group_inquiries.find(i => i.id === T.g.inquiry.id) : null;
  if(d === 'clue' || d === 'group') liveNow(0, d, 0);
  else if((d === 'clue-next' || d === 'group-next') && L){
    const max = (L.mode === 'clue' ? K.LESSON_STAGES : K.GROUP_STAGES).length;
    if(L.stage + 1 >= max) L.active = false; else { L.stage += 1; L.stage_started_at = at; }
  }
  else if(d === 'stop' && L) L.active = false;
  else if(d === 'fill'){ const s = demoFillable(); if(s){ s.body = '(시연) 모둠원이 채운 칸이에요.'; s.src = (s.kind === 'find' || s.kind === 'extra') ? '(시연) 교과서' : ''; s.done_at = at; } }
  else if(d === 'return' && inq){ inq.status = 'returned'; inq.teacher_note = '찾기 두 칸의 출처를 조금 더 자세히 적어 볼까요?'; }
  else if(d === 'confirm' && inq){
    const st = db.group_steps.filter(s => s.inquiry_id === inq.id);
    db.group_members.filter(m => m.group_id === inq.group_id).forEach(m => {
      const u = m.user_id;
      if(!(st.some(s => s.assignee_id === u && ROLE_KINDS.indexOf(s.kind) >= 0 && s.done_at) && st.some(s => s.assignee_id === u && s.kind === 'used' && s.done_at))) return;
      if(!db.group_fruits.some(f => f.inquiry_id === inq.id && f.user_id === u)) db.group_fruits.push({inquiry_id:inq.id, user_id:u, created_at:at});
      h.grantAcorns(u, 5, 'group_fruit', inq.id);
    });
    inq.status = 'fruit'; inq.confirmed_by = 'u-T'; inq.confirmed_at = at;
    const g = db.groups.find(x => x.id === inq.group_id); if(g) h.unlockPlace(g.school_year, g.grade, g.class_no, 'winter', at);
  }
  QO.mock.save();
  await QO.live.refresh();
  await Promise.all([getGroup(), getNb(), d === 'confirm' ? QO.store.refreshMe() : null]);
  repaint(true);
}
/* 캡처용: ?mock=1&tglive=clue2 · group4 — 들어오자마자 그 단계로 */
let tgliveDone = false;
function tglive(){
  if(tgliveDone || !cfg.mock || !QO.mock) return; tgliveDone = true;
  const m = /^(clue|group)(\d)$/.exec(new URLSearchParams(location.search).get('tglive') || '');
  if(!m || !QO.state.me) return;
  liveNow(25000, m[1], Number(m[2]));
  QO.mock.save();
  QO.live.refresh();
}

/* ═══════════ 그리기 ═══════════ */
function pageHTML(){
  const L = QO.state.live, clue = !!(L && L.mode === 'clue');
  const errs = Object.keys(T.errs).length ? '<div class="card tg-loaderr"><div class="hint">불러오지 못한 것이 있어요.</div><button type="button" class="link teal" data-tg="reload">다시 불러오기</button></div>' : '';
  const top = errs + (clue ? clueLiveHTML(L) : T.clueEnded ? endedHTML() : '');
  const group = groupHTML(), nb = neighborHTML(), news = newsHTML(), sent = sentHTML();
  if(ui.wide()){
    /* 단서 시간이면 왼쪽 친구 질문 · 오른쪽 모둠 일지와 소식 / 아니면 왼쪽 모둠 일지 · 오른쪽 소식 */
    const left = clue ? top : top + group + nb, right = clue ? group + nb + news + sent : news + sent;
    return '<div class="cols"><div>' + left + '</div><div>' + right + '</div></div>' + demoHTML();
  }
  return top + group + nb + news + sent + demoHTML();
}
function render(root){
  if(!ensure()){ root.innerHTML = ''; return; }
  const a = document.activeElement;
  const focus = a && a.dataset && a.dataset.tgk && root.contains(a) ? {k:a.dataset.tgk, s:a.selectionStart, e:a.selectionEnd} : null;
  if(!T.loaded){ root.innerHTML = '<div class="tg-root"><div class="empty">함께 화면을 불러오는 중이에요.</div></div>'; return; }
  root.innerHTML = '<div class="tg-root">' + pageHTML() + '</div>';
  $$('[data-tgk]', root).forEach(el => { const v = T.drafts[el.dataset.tgk]; if(v != null) el.value = v; });
  if(focus){
    const el = $$('[data-tgk]', root).find(x => x.dataset.tgk === focus.k);
    if(el){ try{ el.focus({preventScroll:true}); el.setSelectionRange(focus.s, focus.e); }catch(_){} }
  }
  if(QO.state.live) startClock(); else stopClock();
  if(T.clueEnded) T.endedSeen = true;
}

/* 남은 시간 1초마다(함께 탭이 보일 때만) */
let clockT = null;
function startClock(){
  if(clockT) return;
  clockT = setInterval(() => {
    const el = document.getElementById('tgTime');
    if(!QO.state.live || QO.tabs.current() !== 'together'){ stopClock(); return; }
    if(el) el.textContent = ui.clock(QO.live.left());
  }, 1000);
}
function stopClock(){ if(clockT){ clearInterval(clockT); clockT = null; } }
/* 모둠 칸은 모둠원이 채운다 → 함께 탭이 보이는 동안 10초마다 다시 읽기(시험 중에는 끔) */
let pollT = null;
function startPoll(){ stopPoll(); if(!cfg.selftest) pollT = setInterval(pollTick, 10000); }
function stopPoll(){ if(pollT){ clearInterval(pollT); pollT = null; } }
async function pollTick(){
  if(QO.tabs.current() !== 'together' || !QO.state.ready || document.visibilityState !== 'visible' || !T.loaded) return;
  const L = QO.state.live, inq = T.g.inquiry;
  const liveGroup = !!(L && L.mode === 'group');
  if(!liveGroup && !(inq && inq.status !== 'fruit')) return;
  const r = await Promise.all([getGroup(), liveGroup ? getNb() : false]);
  if(r.some(Boolean)) repaint(r[0]);
}

QO.tabs.register({
  id:'together', label:'함께', icon:ui.icons.together,
  render:render,
  onShow(){ if(ensure() && T.loaded) reload(); startPoll(); },
  onHide(){ stopClock(); stopPoll(); if(T.endedSeen){ T.clueEnded = null; T.endedSeen = false; } },
  /* 탭 점: 단서 시간이거나 내 차례 모둠 칸이 있을 때만 */
  badge(){ const L = QO.state.live; return !!(L && L.mode === 'clue') || myTurns().length > 0; }
});

/* ═══════════ 이벤트 ═══════════ */
QO.bus.on('ready', e => {
  if(!e || e.page !== 'student') return;
  /* 들어오는 동안 함께 탭이 먼저 그려져 같은 사람으로 읽기를 시작했으면 그것을 쓴다(두 번 읽다 엉키지 않게) */
  if(!(T.early && T.uid === meId() && !T.loaded)) T = fresh(meId());
  T.early = false;
  loadAll(); tglive();
});
QO.bus.on('live:changed', e => {
  if(!T.uid) return;
  const live = e && e.live, prev = e && e.prev;
  const isClue = !!(live && live.mode === 'clue'), wasClue = !!(prev && prev.mode === 'clue');
  if(isClue){ T.clueEnded = null; T.endedSeen = false; }
  else if(wasClue){ T.clueEnded = {since:prev.created_at}; T.endedSeen = false; }
  rr();
  const jobs = [];
  if(isClue) jobs.push(getTargets());
  if(isClue || wasClue) jobs.push(getSent());
  const grp = !!((live && live.mode === 'group') || (prev && prev.mode === 'group'));
  if(grp) jobs.push(getGroup(), getNb());
  if(jobs.length) Promise.all(jobs).then(r => { if(r.some(Boolean)) repaint(grp); });
});
QO.bus.on('questions:changed', e => { if(e && e.all && QO.tabs.current() === 'together') rr(); });

document.addEventListener('input', e => {
  const k = e.target && e.target.dataset && e.target.dataset.tgk; if(!k) return;
  T.drafts[k] = e.target.value;
  delete T.msg[k.replace(/:[^:]*$/, '')];          // 그 칸에 다시 쓰기 시작하면 안내는 다음 그리기 때 내림
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.repeat) return;
  const inp = e.target && e.target.closest && e.target.closest('.tg-root .tpl input');
  if(!inp) return;
  e.preventDefault();
  const b = inp.closest('.tg-fq').querySelector('[data-tg="clue-send"]'); if(b) b.click();
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-tg]');
  if(!b || !b.closest('.tg-root') || b.disabled) return;
  const a = b.dataset.tg, q = Number(b.dataset.q);
  switch(a){
    case 'reload': T.errs = {}; reload(); break;
    case 'more-sent': T.moreSent = !T.moreSent; rr(); break;
    case 'clue-kind': { const f = findFriend(q); if(!f) break; const ks = kindList(f), cur = curKind(f); T.kind[q] = ks[(ks.indexOf(cur) + 1) % ks.length]; rr(); focusSoon('.tg-fq[data-q="' + q + '"] .tpl input'); break; }
    case 'clue-send': sendClue(b); break;
    case 'curious': markCurious(b, q); break;
    case 'row': T.openRow = T.openRow === b.dataset.k ? null : b.dataset.k; rr(); break;
    case 'mchip': {
      const key = 'g' + b.dataset.step, arr = T.chips[key] || (T.chips[key] = []), m = b.dataset.m, i = arr.indexOf(m);
      if(i >= 0) arr.splice(i, 1); else arr.push(m);
      b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', String(i < 0));
      break;
    }
    case 'gsave': saveStep(b); break;
    case 'gedit': startEdit(Number(b.dataset.step)); break;
    case 'gcancel': if(T.editing){ dropDrafts('g' + T.editing + ':'); delete T.msg['g' + T.editing]; } T.editing = null; rr(); break;
    case 'pick-q': (T.pick || (T.pick = {sel:null, why:[]})).sel = b.dataset.q; rr(); if(b.dataset.q === 'own') focusSoon('.tg-own'); break;
    case 'pick-why': {
      const P = T.pick || (T.pick = {sel:null, why:[]}), w = b.dataset.w, i = P.why.indexOf(w);
      if(i >= 0) P.why.splice(i, 1); else P.why.push(w);
      b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', String(i < 0));
      break;
    }
    case 'pick-more': T.morePick = true; rr(); break;
    case 'pick-start': startInquiry(b); break;
    case 'new-pick': T.newPick = true; T.pick = null; rr(); break;
    case 'tell-pick': pickTeller(b); break;
    case 'send-group': sendGroup(b); break;
    case 'nb-row': { const id = Number(b.dataset.inq); T.nbOpen = T.nbOpen === id ? null : id; rr(); break; }
    case 'nb-save': saveHeard(b); break;
    case 'demo': demo(b.dataset.d); break;
  }
});

/* 시험·다른 모듈이 쓸 것 */
QO.together = {reload:reload, state:() => T, myTurns:myTurns};

/* ═══════════ 스스로 시험 ═══════════ */
if(QO.selftest){
  const add = QO.selftest.add;
  const go = async t => { await t.click('#nav [data-t="together"]'); await t.waitFor(() => !QO.together.state().loading && t.$('.tg-root .sec')); };
  const nowISO = () => new Date().toISOString();
  function mkLive(t, mode, stage){
    const db = t.db;
    db.lesson_live.forEach(l => { if(l.grade === 2 && l.class_no === 11) l.active = false; });
    const row = {id:QO.mock.h.seq('lesson_live'), teacher_id:1, grade:2, class_no:11, mode:mode, stage:stage || 0, stage_started_at:nowISO(), active:true, created_at:nowISO()};
    db.lesson_live.push(row);
    return row;
  }
  async function setStage(row, s){ row.stage = s; row.stage_started_at = nowISO(); await QO.live.refresh(); }
  const steps31 = (t, k) => t.db.group_steps.filter(s => s.inquiry_id === 31 && s.kind === k);
  const txt = (t, sel) => { const el = t.$(sel); return el ? el.textContent : ''; };

  add('함께 · 친구 질문 목록은 없음 · 나도 궁금해요는 단서 시간 카드에서(다시 읽어도 남음)', async t => {
    await go(t);
    t.eq(t.$$('.tg-fq').length, 0, '단서 시간 밖에는 친구 질문 카드가 없음');
    t.expect(t.$('.tg-news') && t.$('.tg-group'), '모둠 일지와 소식');
    mkLive(t, 'clue', 2); await QO.live.refresh();
    await t.waitFor(() => t.$$('.tg-fq[data-ctx="live"] .tpl').length === 2);
    const qid = +t.$$('.tg-fq[data-ctx="live"]')[0].dataset.q;
    await t.click('.tg-fq[data-q="' + qid + '"] [data-tg="curious"]');
    await t.waitFor(() => t.db.curious_marks.some(m => m.question_id === qid && m.user_id === 'u-A'));
    await t.waitFor(() => !t.$('.tg-fq[data-q="' + qid + '"] [data-tg="curious"]'));
    t.eq(t.db.clues.filter(c => c.author_id === 'u-A').length, 1, '나도 궁금해요는 단서가 아님');
    await t.loginAs('A');
    await go(t);
    await t.waitFor(() => t.$('.tg-fq[data-q="' + qid + '"] .tpl') && !t.$('.tg-fq[data-q="' + qid + '"] [data-tg="curious"]'));
  });
  add('함께 · 단서 — 빈칸·장난 글자는 못 보냄 · 안내는 다시 그려도 남음', async t => {
    mkLive(t, 'clue', 2); await QO.live.refresh();
    await go(t);
    await t.waitFor('.tg-fq[data-q="131"] .tpl input');
    t.expect(txt(t, '.tg-fq[data-q="131"] .tg-lbl').indexOf('찾아볼 곳') >= 0, '찾기에서 막힘 → 찾아볼 곳');
    await t.click('.tg-fq[data-q="131"] [data-tg="clue-send"]');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="131"] .err') === '쪽수나 검색어 중 하나는 적어 주세요.');
    QO.tabs.rerender('together');
    t.eq(txt(t, '.tg-fq[data-q="131"] .err'), '쪽수나 검색어 중 하나는 적어 주세요.', '다시 그려도 안내');
    await t.click('.tg-fq[data-q="131"] [data-tg="clue-kind"]');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="131"] .tg-lbl').indexOf('해 볼 실험') >= 0);
    await t.click('.tg-fq[data-q="131"] [data-tg="clue-send"]');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="131"] .err') === '빈칸을 채워 주세요.');
    await t.type('.tg-fq[data-q="131"] .tpl input', 'ㅋㅋㅋ');
    await t.click('.tg-fq[data-q="131"] [data-tg="clue-send"]');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="131"] .err') === '장난 글자는 보낼 수 없어요.');
    t.eq(t.db.clues.filter(c => c.question_id === 131).length, 0, '아직 안 보냄');
    for(let i = 0; i < 3; i++) await t.click('.tg-fq[data-q="131"] [data-tg="clue-kind"]');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="131"] .tg-lbl').indexOf('찾아볼 곳') >= 0);
    await t.type('.tg-fq[data-q="131"] .tpl input[data-i="3"]', '코일 자기장');
    await t.click('.tg-fq[data-q="131"] [data-tg="clue-send"]');
    await t.waitFor(() => t.db.clues.some(c => c.question_id === 131 && c.author_id === 'u-A'));
    t.eq(t.db.clues.find(c => c.question_id === 131 && c.author_id === 'u-A').body, '검색어 코일 자기장', '검색어만 적은 찾아볼 곳');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="131"] .sent').indexOf('단서를 보냈어요') === 0);
    await t.waitFor(() => t.$('.tg-sentlist') && t.$('.tg-sentlist').textContent.indexOf('코일 자기장') >= 0);
  });
  add('함께 · 단서 — 같은 질문 같은 종류는 한 번', async t => {
    mkLive(t, 'clue', 2); await QO.live.refresh();
    await go(t);
    await t.waitFor('.tg-fq[data-q="141"] .tpl input');
    await t.type('.tg-fq[data-q="141"] .tpl input[data-i="3"]', '별의 색 온도');
    await t.api.addClue(141, 'where', '교과서 150쪽');          // 다른 기기에서 먼저 보냄
    await t.click('.tg-fq[data-q="141"] [data-tg="clue-send"]');
    await t.waitFor(() => txt(t, '.tg-fq[data-q="141"] .err') === '이 질문에는 같은 종류의 단서를 이미 보냈어요');
    t.eq(t.db.clues.filter(c => c.question_id === 141 && c.author_id === 'u-A').length, 1, '하나만 남음');
    await QO.together.reload();
    await t.waitFor(() => t.$('.tg-fq[data-q="141"] .sent') && !t.$('.tg-fq[data-ctx="live"] .tpl'));
    await t.rejects(t.api.addClue(141, 'where', '검색어 별의 온도와 색'), '이 질문에는 같은 종류의 단서를 이미 보냈어요');
  });
  add('함께 · 단서 시간 — 단계 띠 · 남은 시간 · 한 사람 하나 · 끝', async t => {
    const row = mkLive(t, 'clue', 0);
    await QO.live.refresh();
    await go(t);
    await t.waitFor(() => txt(t, '.tg-stage li.on') === '선생님 시범');
    t.expect(/^\d+:\d\d$/.test(txt(t, '#tgTime')), '남은 시간: ' + txt(t, '#tgTime'));
    t.eq(t.$$('.tg-fq[data-ctx="live"]').length, 0, '시범 때는 칠판만');
    t.expect(QO.tabs.get('together').badge() === true, '단서 시간 탭 점');
    await setStage(row, 1);
    await t.waitFor(() => t.$$('.tg-fq[data-ctx="live"]').length === 2);
    t.eq(t.$$('.tg-fq[data-ctx="live"] input').length, 0, '모둠 이야기 때는 읽기만');
    t.expect(t.$$('.tg-fq[data-ctx="live"]').every(c => c.querySelector('.who').textContent.indexOf('이름은 보이지 않아요') >= 0), '이름 숨김');
    t.eq(t.$$('.tg-fq[data-ctx="live"]').map(c => +c.dataset.q).sort(), [131, 141], '막힌 질문 둘');
    const order = t.$$('.tg-fq[data-ctx="live"]').map(c => +c.dataset.q);
    await setStage(row, 2);
    await t.waitFor(() => t.$$('.tg-fq[data-ctx="live"] .tpl').length === 2);
    t.eq(t.$$('.tg-fq[data-ctx="live"]').map(c => +c.dataset.q), order, '모둠 이야기 때 읽은 두 질문 그대로');
    const card = t.$$('.tg-fq[data-ctx="live"]')[0], qid = +card.dataset.q;
    await t.type(card.querySelector('.tpl input[data-i="1"]'), '118');
    await t.click(card.querySelector('[data-tg="clue-send"]'));
    await t.waitFor(() => t.db.clues.some(c => c.author_id === 'u-A' && c.question_id === qid && c.body === '교과서 118쪽'));
    await t.waitFor(() => t.$$('.tg-fq[data-ctx="live"] .tpl').length === 0 && t.$('.tg-lock'));
    t.eq(t.$$('.tg-fq[data-ctx="live"]').map(c => +c.dataset.q), order, '보낸 뒤에도 카드 자리 그대로');
    await setStage(row, 3);
    await t.waitFor(() => txt(t, '.tg-stage li.on') === '칠판에서 함께 읽기');
    t.eq(t.$$('.tg-fq[data-ctx="live"] input').length, 0, '칠판 읽기 때는 입력 없음');
    row.active = false; await QO.live.refresh();
    await t.waitFor(() => t.$('.tg-ended') && txt(t, '.tg-ended').indexOf('보낸 단서 1개') >= 0);
    t.eq(t.$$('.tg-fq').length, 0, '끝나면 입력 잠김');
  });
  add('함께 · 모둠 질문 고르기 → 맡은 칸만 입력', async t => {
    await t.loginAs('C');
    await go(t);
    await t.waitFor('[data-tg="pick-q"]');
    const ids = t.$$('[data-tg="pick-q"]').map(b => b.dataset.q);
    t.expect(['131', '141', '161'].every(x => ids.indexOf(x) >= 0), '모둠원 질문: ' + ids);
    t.expect(ids.indexOf('121') < 0 && ids.indexOf('151') < 0, '다른 모둠 질문은 빠짐');
    await t.click('[data-tg="pick-q"][data-q="141"]');
    await t.click('[data-tg="pick-start"]');
    await t.waitFor(() => txt(t, '.tg-pickerr') === '두 기준을 모두 골라 주세요.');
    await t.click('[data-tg="pick-why"][data-w="tool"]');
    await t.click('[data-tg="pick-why"][data-w="all"]');
    await t.click('[data-tg="pick-start"]');
    await t.waitFor(() => t.db.group_inquiries.some(i => i.group_id === 12 && i.question_id === 141));
    t.eq(t.db.group_inquiries.find(i => i.group_id === 12).why, '오늘 도구로 알아볼 수 있음 · 모두 궁금함', '고른 까닭');
    await t.waitFor('.tg-row[data-kind="method"] .form');
    t.expect(t.$('.tg-row[data-kind="predict"] .form'), '예상(각자) 입력');
    t.eq(t.$$('.tg-row[data-kind="find"] .form').length, 0, '남의 칸(찾기)은 입력 없음');
    t.eq(t.$$('.tg-row[data-kind="find"] .st').map(e => e.textContent), ['쓰는 중', '쓰는 중'], '찾기 상태');
    t.eq(txt(t, '.tg-row[data-kind="compare"] .st'), '앞 칸 기다림', '비교');
    t.eq(txt(t, '.tg-row[data-kind="wrap"] .st'), '앞 칸 기다림', '정리(내 칸이어도 앞 칸 기다림)');
    t.eq(t.$$('.tg-row[data-kind="wrap"] .form').length, 0, '정리는 아직 입력 없음');
    await t.type('.tg-row[data-kind="predict"] textarea', '별이 뜨거울수록 파랗게 보일 것 같다');
    await t.click('.tg-row[data-kind="predict"] [data-tg="gsave"]');
    await t.waitFor(() => txt(t, '.tg-row[data-kind="predict"] .err').indexOf('까닭도 한 마디') === 0);
    await t.type('.tg-row[data-kind="predict"] textarea', '별이 뜨거울수록 파랗게 보일 것 같다. 왜냐하면 불꽃도 뜨거우면 파라니까.');
    await t.click('.tg-row[data-kind="predict"] [data-tg="gsave"]');
    const inq = t.db.group_inquiries.find(i => i.group_id === 12);
    await t.waitFor(() => t.db.group_steps.some(s => s.inquiry_id === inq.id && s.kind === 'predict' && s.assignee_id === 'u-C' && s.done_at));
    await t.waitFor(() => !t.$('.tg-row[data-kind="predict"] .form') && txt(t, '.tg-row[data-kind="predict"] .st') === '쓰는 중');
  });
  add('함께 · 두 출처 비교 — 찾기 둘이 차기 전에는 막힘', async t => {
    const cmp = steps31(t, 'compare')[0], f2 = steps31(t, 'find')[1];
    await t.loginAs('B');
    await go(t);
    await t.waitFor('.tg-row[data-kind="compare"]');
    t.eq(txt(t, '.tg-row[data-kind="compare"] .st'), '앞 칸 기다림', '비교 상태');
    t.expect(!t.$('.tg-row[data-kind="compare"] .form'), '비교 입력 없음');
    await t.rejects(t.api.saveGroupStep(cmp.id, '두 곳이 같아요', ''), '찾기 두 칸이 먼저 차야 해요');
    await t.loginAs('F');
    await go(t);
    const sel = '.tg-row[data-k="s' + f2.id + '"]';
    await t.waitFor(sel + ' .form');
    await t.type(sel + ' input', '과학관 누리집');
    await t.type(sel + ' textarea', '번개는 구름과 땅 사이 공기를 지나며 여러 갈래로 갈라진다.');
    await t.click(sel + ' [data-tg="gsave"]');
    await t.waitFor(() => txt(t, sel + ' .err') === '찾기 ①과 다른 출처에서 찾아 주세요.');
    await t.type(sel + ' input', '교과서 108쪽');
    await t.click(sel + ' [data-tg="gsave"]');
    await t.waitFor(() => t.db.group_steps.find(s => s.id === f2.id).done_at);
    await t.loginAs('B');
    await go(t);
    await t.waitFor('.tg-row[data-kind="compare"] .form');
    t.eq(t.$$('.tg-row[data-kind="compare"] .tg-cmpsrc .val').length, 2, '찾기 두 칸을 보며 비교');
    await t.type('[data-tgk="g' + cmp.id + ':a"]', '전기가 흐르기 쉬운 길을 따라간다');
    await t.type('[data-tgk="g' + cmp.id + ':b"]', '교과서는 갈래로 갈라진다고 해서 더 자세해요');
    await t.click('.tg-row[data-kind="compare"] [data-tg="gsave"]');
    await t.waitFor(() => t.db.group_steps.find(s => s.id === cmp.id).done_at);
    t.eq(t.db.group_steps.find(s => s.id === cmp.id).body, '같은 곳: 전기가 흐르기 쉬운 길을 따라간다 / 다른 곳: 교과서는 갈래로 갈라진다고 해서 더 자세해요', '비교 글');
  });
  add('함께 · 옆 모둠에 설명할 사람 뽑기', async t => {
    t.as('F'); await t.api.saveGroupStep(steps31(t, 'find')[1].id, '번개는 여러 갈래로 갈라지며 땅으로 내려온다.', '교과서 108쪽');
    t.as('B'); await t.api.saveGroupStep(steps31(t, 'compare')[0].id, '같은 곳: 쉬운 길을 따라간다 / 다른 곳: 교과서가 더 자세해요', '');
    t.as('A'); await t.api.saveGroupStep(steps31(t, 'wrap')[0].id, '번개는 공기 속에서 전기가 흐르기 쉬운 길을 따라 조금씩 나아가서 지그재그로 친다.', '');
    const gl = mkLive(t, 'group', 5);
    await QO.live.refresh();
    await QO.together.reload();
    await go(t);
    await t.waitFor(() => txt(t, '.tg-row[data-kind="tell"] .st') === '설명 때 뽑기');
    t.expect(!t.$('[data-tg="tell-pick"]'), '정리 회의 때는 뽑기 단추가 없음');
    await setStage(gl, 6);
    await t.waitFor('.tg-row[data-kind="tell"] [data-tg="tell-pick"]');
    t.eq(txt(t, '.tg-row[data-kind="tell"] .st'), '뽑을 차례', '설명 칸');
    t.expect(t.$('.tg-row[data-kind="used"] .form'), '정리가 차면 「내 칸이 정리 어디에」 차례');
    t.expect(t.$('[data-tg="send-group"]'), '선생님께 보내기 단추');
    await t.click('[data-tg="tell-pick"]');
    await t.waitFor(() => steps31(t, 'tell')[0].done_at);
    const who = steps31(t, 'tell')[0].assignee_id;
    t.expect(['u-A', 'u-B', 'u-F'].indexOf(who) >= 0, '모둠원 중에서');
    const say = {'u-A':'내가', 'u-B':'나래가', 'u-F':'바다가'}[who];
    await t.waitFor(() => txt(t, '.tg-row[data-kind="tell"] small').indexOf(say + ' 설명해요') === 0);
    t.expect(!t.$('[data-tg="tell-pick"]'), '뽑은 뒤에는 단추가 없음');
  });
  add('함께 · 옆 모둠에서 들은 것', async t => {
    t.as('C');
    const inq = await t.api.startGroupInquiry(12, 131, null, '모두 궁금함');
    await t.api.pickTeller(inq);
    t.as('A');
    await QO.together.reload();
    await go(t);
    await t.waitFor('.tg-nb [data-tg="nb-row"]');
    t.eq(txt(t, '.tg-nb .st'), '들은 것 남기기', '옆 모둠 상태');
    await t.click('.tg-nb [data-tg="nb-row"]');
    await t.waitFor('.tg-nb [data-tg="nb-save"]');
    await t.type('[data-tgk="nb' + inq + ':a"]', '코일에 전류가 흐르면 자석처럼 된대요');
    await t.click('.tg-nb [data-tg="nb-save"]');
    await t.waitFor(() => txt(t, '.tg-nb .err') === '한 줄 요약과 되묻기를 모두 적어 주세요.');
    await t.type('[data-tgk="nb' + inq + ':b"]', '그럼 전류를 끊으면 어떻게 될까요?');
    await t.click('.tg-nb [data-tg="nb-save"]');
    await t.waitFor(() => t.db.group_steps.some(s => s.inquiry_id === inq && s.kind === 'heard' && s.done_at && s.assignee_id === 'u-A'));
    t.eq(t.db.group_steps.find(s => s.inquiry_id === inq && s.kind === 'heard').body, '코일에 전류가 흐르면 자석처럼 된대요 · 되묻기: 그럼 전류를 끊으면 어떻게 될까요?', '들은 것');
    await t.waitFor(() => txt(t, '.tg-nb .st') === '남겼어요');
    await t.loginAs('C');
    await go(t);
    await t.waitFor(() => txt(t, '.tg-row[data-kind="heard"] .st') === '했어요');
    await t.click('.tg-row[data-kind="heard"] [data-tg="row"]');
    await t.waitFor(() => txt(t, '.tg-row[data-kind="heard"] .grow-b').indexOf('전류를 끊으면') >= 0);
  });
  add('함께 · 선생님께 보내기 · 되돌림 · 모둠 열매', async t => {
    t.as('F'); await t.api.saveGroupStep(steps31(t, 'find')[1].id, '번개는 여러 갈래로 갈라지며 땅으로 내려온다.', '교과서 108쪽');
    t.as('B'); await t.api.saveGroupStep(steps31(t, 'compare')[0].id, '같은 곳: 쉬운 길 / 다른 곳: 교과서가 더 자세해요', '');
    t.as('A'); await t.api.saveGroupStep(steps31(t, 'wrap')[0].id, '번개는 전기가 흐르기 쉬운 길을 따라 조금씩 나아가서 지그재그로 친다.', '');
    await t.api.saveGroupStep(steps31(t, 'used').find(s => s.assignee_id === 'u-A').id, '정리 문장을 내가 받아 적었어요', '');
    t.as('B'); await t.api.saveGroupStep(steps31(t, 'used').find(s => s.assignee_id === 'u-B').id, '내가 찾은 「쉬운 길」이 정리 첫 부분에 들어갔어요', '');
    t.as('A');
    await QO.together.reload();
    await go(t);
    await t.click('[data-tg="send-group"]');
    await t.click(await t.waitFor('.qo-dialog [data-dlg="ok"]'));
    await t.waitFor(() => t.db.group_inquiries.find(i => i.id === 31).status === 'wait');
    await t.waitFor('.tg-group .statusbar.wait');
    t.eq(t.$$('.tg-group .form').length, 0, '보낸 뒤에는 입력 없음');
    t.as('T'); await t.api.returnGroup(31, '찾기 ②의 출처를 더 자세히 적어 볼까요?'); t.as('A');
    await QO.together.reload();
    await t.waitFor(() => txt(t, '.tg-group .tchbox').indexOf('출처를 더 자세히') >= 0);
    t.expect(t.$('[data-tg="send-group"]'), '고친 뒤 다시 보내기');
    await t.api.sendGroupInquiry(31);
    t.as('T'); t.eq(await t.api.confirmGroup(31), 2, '열매 둘'); t.as('A');
    await t.loginAs('F');
    await go(t);
    await t.waitFor('.tg-group .statusbar.fruit');
    t.expect(txt(t, '.tg-group .statusbar.fruit').indexOf('2명') >= 0, '받은 사람 수');
    t.expect(txt(t, '.tg-group').indexOf('다음 모둠 일지에서 칸을 맡으면 열매를 받아요') >= 0, '못 받은 학생 안내');
    await t.loginAs('A');
    await go(t);
    await t.waitFor('.tg-group .statusbar.fruit');
    t.expect(txt(t, '.tg-group').indexOf('다음 모둠 일지에서') < 0, '받은 학생에게는 없음 ' + JSON.stringify([QO.together.state().gf, QO.together.state().uid, QO.together.state().seq, QO.mock.who() && QO.mock.who().key, t.db.group_fruits]));
    await t.click('[data-tg="new-pick"]');
    await t.waitFor('[data-tg="pick-start"]');
  });
  add('함께 · 모둠 진행 띠와 대기 칸 안내', async t => {
    mkLive(t, 'group', 4);
    await t.loginAs('F');
    await go(t);
    await t.waitFor('.tg-gstage');
    t.eq(txt(t, '.tg-gstage .h b'), '지금: 찾기 ①② + 두 출처 비교 — 10분', '띠');
    t.expect(txt(t, '.tg-gstage .tg-mine').indexOf('찾기 ②') >= 0, '바다 내 차례: ' + txt(t, '.tg-gstage'));
    await t.loginAs('B');
    await go(t);
    await t.waitFor('.tg-gstage .tg-idle');
    t.expect(txt(t, '.tg-gstage .tg-idle [data-tg="gedit"]') === '내 예상에 근거 보태기', '대기 칸 단추');
    await t.click('.tg-gstage [data-tg="gedit"]');
    const ta = await t.waitFor('.tg-row[data-kind="predict"] textarea');
    t.expect(ta.value === '' && txt(t, '.tg-row[data-kind="predict"] .form .val').indexOf('구름 속 전기') >= 0, '처음 예상은 그대로 보이고 빈칸에서 시작');
    await t.type(ta, '왜냐하면 번개 사진을 보면 가지가 여러 개로 갈라지니까');
    await t.click('.tg-row[data-kind="predict"] [data-tg="gsave"]');
    const mine = () => t.db.group_steps.find(x => x.inquiry_id === 31 && x.kind === 'predict' && x.assignee_id === 'u-B');
    await t.waitFor(() => mine().body.indexOf('보탠 근거') > 0);
    t.eq(mine().body, '구름 속 전기가 한꺼번에 내려오지 못해서 꺾이는 것 같다. · 보탠 근거: 왜냐하면 번개 사진을 보면 가지가 여러 개로 갈라지니까', '처음 글 + 보탠 근거');
  });
  add('함께 · 탭 점 — 내 차례 모둠 칸이 있을 때만', async t => {
    await QO.together.reload();
    const def = QO.tabs.get('together');
    t.expect(def.badge() === true, '가람은 알아볼 방법 차례');
    t.expect(!t.$('#nav [data-t="together"] .dot').hidden, '점 보임');
    await t.loginAs('C');
    await QO.together.reload();
    t.expect(def.badge() === false, '다온은 모둠 질문을 고르기 전');
    t.expect(t.$('#nav [data-t="together"] .dot').hidden, '점 숨김');
  });
  add('함께 · 다시 그려도 쓰던 글이 남음 · 방법 칩', async t => {
    await go(t);
    await t.waitFor('.tg-row[data-kind="method"] textarea');
    const ta = t.$('.tg-row[data-kind="method"] textarea');
    await t.type(ta, '교과서 번개 사진과 느린 화면 영상 보기');
    ta.focus();
    QO.tabs.rerender('together');
    const ta2 = t.$('.tg-row[data-kind="method"] textarea');
    t.expect(ta2 !== ta, '다시 그려짐');
    t.eq(ta2.value, '교과서 번개 사진과 느린 화면 영상 보기', '쓰던 글');
    t.expect(document.activeElement === ta2, '커서 자리');
    await t.click('.tg-row[data-kind="method"] [data-tg="gsave"]');
    await t.waitFor(() => txt(t, '.tg-row[data-kind="method"] .err') === '방법을 하나 골라 주세요.');
    QO.tabs.rerender('together');
    t.eq(txt(t, '.tg-row[data-kind="method"] .err'), '방법을 하나 골라 주세요.', '다시 그려도 안내가 남음');
    await t.click('.tg-row[data-kind="method"] [data-m="book"]');
    await t.click('.tg-row[data-kind="method"] [data-m="web"]');
    await t.click('.tg-row[data-kind="method"] [data-tg="gsave"]');
    await t.waitFor(() => steps31(t, 'method')[0].done_at);
    t.eq(steps31(t, 'method')[0].body, '교과서·책, 검색 — 교과서 번개 사진과 느린 화면 영상 보기', '방법 글');
    await t.waitFor(() => txt(t, '.tg-row[data-kind="method"] .st') === '했어요');
    await t.click('.tg-row[data-kind="method"] [data-tg="row"]');
    await t.click(await t.waitFor('.tg-row[data-kind="method"] [data-tg="gedit"]'));
    await t.waitFor(() => t.$('.tg-row[data-kind="method"] textarea') && t.$('.tg-row[data-kind="method"] textarea').value.indexOf('교과서 번개') === 0);
    t.eq(t.$$('.tg-row[data-kind="method"] .chip.on').map(c => c.dataset.m), ['book', 'web'], '칩도 다시 켜짐');
  });
}
})();
