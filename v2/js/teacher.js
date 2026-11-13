/* teacher.html 본체 — 열매 확인 · 수업 진행 · 모둠 · 단서 살피기 · 칠판 화면 (설계서 §5 · §3-2 · §3-3).
   수업 진행 구역과 칠판 화면에는 학생 이름을 띄우지 않는다(전자칠판에 그대로 비칠 수 있다).
   더한 데이터 함수: classLive(g, c) · classStuck(g, c) — 둘 다 표 읽기라 SQL 은 더 필요 없다. */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg, S = QO.state, K = QO.K, J = QO.journal, ui = QO.ui;
const $ = ui.$, $$ = ui.$$, esc = ui.esc;
const P = new URLSearchParams(location.search);

/* ═══════════ 덧붙인 데이터 함수 ═══════════ */
/* 진짜 쪽 — api.js 와 같은 세션의 클라이언트(QO.sbClient)로 표를 읽는다 */
const sb = () => QO.sbClient();
async function rows(q){ const r = await q; if(r.error){ const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; } return r.data || []; }
function stuckRow(q, owner, n){
  const j = q.journal || {}, f = j.flag || {};
  return {id:q.id, body:(q.refined_text && q.refined_text !== '') ? q.refined_text : q.text, flag_step:f.step || null, flag_tried:f.tried || null, flagged_at:f.at || q.created_at,
    is_anonymous:!!q.is_anonymous, clue_count:n || 0, owner_name:owner ? owner.name || '' : '', owner_number:owner && owner.number != null ? owner.number : null};
}
/* 익명 질문은 뒤로(칠판 시범 기본 질문이 되지 않게), 그다음 단서 적은 것부터 */
const stuckSort = (a, b) => (a.is_anonymous ? 1 : 0) - (b.is_anonymous ? 1 : 0) || a.clue_count - b.clue_count || String(b.flagged_at).localeCompare(String(a.flagged_at));

/* 그 반에서 지금 켜져 있는 수업 진행 행(학생 lessonLive 와 같은 행) */
QO.api.classLive = async function(g, c){
  const cl = await sb();
  const d = await rows(cl.from('lesson_live').select('*').eq('grade', g).eq('class_no', c).eq('active', true).order('created_at', {ascending:false}).limit(1));
  return d[0] || null;
};
/* 그 반의 막힘 표시가 선 질문(열매 전) — 단서 시간 ① 시범에 띄울 것 */
QO.api.classStuck = async function(g, c){
  const st = await QO.apiReal.classStudents(g, c);
  if(!st.length) return [];
  const by = new Map(st.map(s => [s.id, s])), ids = st.map(s => s.id), cl = await sb(), qs = [];
  for(let i = 0; i < ids.length; i += 100){
    const ch = ids.slice(i, i + 100);
    for(let from = 0; ; from += 1000){
      const d = await rows(cl.from('questions').select('id,text,refined_text,is_anonymous,user_id,journal,created_at').in('user_id', ch)
        .not('journal', 'is', null).is('fruit_kind', null).order('id').range(from, from + 999));
      qs.push.apply(qs, d);
      if(d.length < 1000) break;
    }
  }
  const stuck = qs.filter(q => q.journal && q.journal.flag && q.journal.flag.step);
  const cnt = {};
  for(let i = 0; i < stuck.length; i += 100){
    (await rows(cl.from('clues').select('question_id').in('question_id', stuck.slice(i, i + 100).map(q => q.id)).is('hidden_at', null).limit(1000)))
      .forEach(x => { cnt[x.question_id] = (cnt[x.question_id] || 0) + 1; });
  }
  return stuck.map(q => stuckRow(q, by.get(q.user_id), cnt[q.id])).sort(stuckSort);
};
/* 흉내 쪽 — 이름·인자 수를 진짜와 같게 */
QO.mock.extend({
  classLive(g, c){
    const h = QO.mock.h, db = QO.mock.db;
    if(!h.isTeacher(h.me())) return null;
    return db.lesson_live.filter(l => l.active && l.grade === Number(g) && l.class_no === Number(c))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0] || null;
  },
  classStuck(g, c){
    const h = QO.mock.h, db = QO.mock.db;
    if(!h.isTeacher(h.me())) return [];
    const by = new Map(db.profiles.filter(p => p.grade === Number(g) && p.class_no === Number(c)).map(p => [p.id, p]));
    return db.questions.filter(q => by.has(q.user_id) && q.fruit_kind == null && q.journal && q.journal.flag && q.journal.flag.step)
      .map(q => stuckRow(q, by.get(q.user_id), db.clues.filter(x => x.question_id === q.id && x.hidden_at == null).length)).sort(stuckSort);
  }
});
/* 학생 성장 기록(SQL v2_09 growth_notes, 학생 growth.js 가 쓴다) — 선생님은 RLS(v2_growth_read)로 다 읽는다.
   이름·번호는 다른 목록처럼 classStudents(profiles)로 붙인다. 표가 아직 없으면 e.soon = true 로 던진다(화면은 안내 한 줄) */
const growSoon = e => /PGRST202|PGRST205|42P01|42883|schema cache|does not exist/i.test(String((e && e.message) || '') + ' ' + String((e && e.code) || ''));
const growRow = (n, s) => Object.assign({}, n, {student:{name:s ? s.name || '' : '', number:s && s.number != null ? s.number : null}});
const growSort = (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id;
QO.api.classGrowthNotes = async function(g, c){
  const st = await QO.apiReal.classStudents(g, c);
  const by = new Map(st.map(s => [s.id, s])), cl = await sb(), out = [];
  try{
    for(let from = 0; ; from += 1000){
      const d = await rows(cl.from('growth_notes').select('id,user_id,frame,parts,body,created_at').eq('school_year', ui.schoolYear()).eq('grade', g).eq('class_no', c)
        .order('created_at', {ascending:false}).order('id', {ascending:false}).range(from, from + 999));
      out.push.apply(out, d);
      if(d.length < 1000) break;
    }
  }catch(e){ if(growSoon(e)) e.soon = true; throw e; }
  return out.map(n => growRow(n, by.get(n.user_id))).sort(growSort);
};
QO.mock.extend({
  classGrowthNotes(g, c){
    const h = QO.mock.h, db = QO.mock.db, me = h.me(), all = h.isTeacher(me), y = h.schoolYear();
    if(db.growth_notes == null) growSeed(db, h);
    return db.growth_notes.filter(n => (all || n.user_id === me) && n.school_year === y && n.grade === Number(g) && n.class_no === Number(c))
      .map(n => growRow(h.pick(n, ['id', 'user_id', 'frame', 'parts', 'body', 'created_at']), h.prof(n.user_id))).sort(growSort);
  }
});
/* 시연용 몇 줄 — 흉내 DB 에 성장 기록 표가 아직 없을 때 한 번(학생 화면에서 쓰면 그 표를 그대로 쓴다) */
function growSeed(db, h){
  const y = h.schoolYear(), ago = hrs => new Date(Date.now() - hrs * 36e5).toISOString();
  const N = (id, who, frame, parts, body, hrs) => { const p = h.prof(who) || {}; return {id, user_id:who, school_year:y, grade:p.grade, class_no:p.class_no, frame, parts, body, created_at:ago(hrs)}; };
  db.growth_notes = [
    N(1, 'u-B', 'change', {before:'저항은 전류를 막는 벽', now:'저항은 전류가 흐르기 어려운 정도'}, '처음에는 저항은 전류를 막는 벽이라고 생각했는데, 지금은 저항은 전류가 흐르기 어려운 정도라고 생각해요.', 50),
    N(2, 'u-C', 'next', {what:'코일을 감은 횟수를 바꿔 보는 실험'}, '다음에는 코일을 감은 횟수를 바꿔 보는 실험을 해 보고 싶어요.', 26),
    N(3, 'u-G', 'question', {before:'무엇인지만 묻곤', now:'왜 그런지 까닭을 묻곤'}, '예전 내 질문은 무엇인지만 묻곤 했는데, 요즘은 왜 그런지 까닭을 묻곤 해요.', 5)
  ];
  db.seq.growth_notes = Math.max(db.seq.growth_notes || 0, 3);
}

/* ═══════════ 상태 ═══════════ */
const T = {
  tRef:null, key:'', seq:0, inflight:0, reqs:{}, dirty:false,
  cutover:null, students:null,
  pending:null, detail:{}, open:null, ret:null, bulk:null, quick:null,
  live:null, staleLive:null, ended:null, stuck:null, today:null, demoQ:null, ex:{no:'', yes:''}, pick:[], showOwner:{},
  groups:null, gFold:null, gDraft:null, gRet:null, gOpen:{},
  day:null, clues:null, cluesWant:null,
  reading:null, rdPer:null, rdSrc:'',
  grow:null, growOpen:false
};
const clsKey = () => S.cls ? S.cls.grade + '-' + S.cls.class_no : '';
const clsName = () => S.cls ? S.cls.grade + '학년 ' + S.cls.class_no + '반' : '';
/* 새로 들어왔거나 반이 바뀌면 그 반 자료를 비우고 다시 읽는다 */
function ensure(){
  const key = clsKey();
  if(T.tRef === S.teacher && T.key === key) return;
  const fresh = T.tRef !== S.teacher;
  T.tRef = S.teacher; T.key = key; T.seq++; T.reqs = {};
  Object.assign(T, {students:null, pending:null, detail:{}, open:null, ret:null, bulk:null, quick:null, live:null, staleLive:null, ended:null, stuck:null, today:null, demoQ:null, pick:[], showOwner:{},
    groups:null, gFold:null, gDraft:null, gRet:null, gOpen:{}, clues:null, cluesWant:null, reading:null, rdSrc:'', grow:null});
  if(fresh){ T.cutover = null; T.ex = {no:'', yes:''}; T.day = null; }
  if(!S.teacher || !S.cls) return;
  loadPending(); loadGroups(); loadLive(); loadStudents();
  if(!T.cutover) loadCutover();
}
/* 읽기 하나 — 반·사람이 바뀌었거나 더 새 요청이 있으면 결과를 버린다 */
function load(name, work, done){
  const my = T.seq, who = T.tRef, n = (T.reqs[name] = (T.reqs[name] || 0) + 1);
  T.inflight++;
  return Promise.resolve().then(work).then(r => {
    if(my === T.seq && who === S.teacher && T.reqs[name] === n) done(r);
    return r;
  }, e => { if(my === T.seq && who === S.teacher) ui.fail(e); }).finally(() => { T.inflight--; });
}
const G = () => S.cls.grade, C = () => S.cls.class_no;
function loadPending(){ return load('pending', () => QO.api.pendingFruits(G(), C()), r => { T.pending = r; if(T.open && !r.some(q => q.id === T.open)){ T.open = null; T.ret = null; } soft('fruits'); }); }
function loadDetail(id){ return load('d' + id, () => QO.api.questionDetail(id), r => { T.detail[id] = r; soft('fruits'); }); }
function loadStudents(){ return load('students', () => QO.api.classStudents(G(), C()), r => { T.students = r; soft('fruits'); soft('groups'); soft('clues'); }); }
function loadGroups(){ return load('groups', () => QO.api.classGroups(G(), C()), r => { T.groups = r; soft('groups'); if(T.live && T.live.mode === 'group') soft('live'); boardRefresh(); }); }
function loadLive(){ return load('live', () => QO.api.classLive(G(), C()), r => setLive(r, false)); }
function loadToday(){ return load('today', () => QO.api.classClues(G(), C(), ui.kstToday()), r => { T.today = r; soft('live'); boardRefresh(); }); }
function loadStuck(){ return load('stuck', () => QO.api.classStuck(G(), C()), r => { T.stuck = r; soft('live'); boardRefresh(); }); }
function loadClues(day){ return load('clues', () => QO.api.classClues(G(), C(), day), r => { T.clues = {day:day, rows:r}; soft('clues'); }); }
function loadCutover(){ return load('cutover', () => QO.api.cutoverStatus(), r => { T.cutover = r; soft('fruits'); }); }
async function idle(){ while(T.inflight > 0) await ui.sleep(20); }

/* 남이 일으킨 다시 그리기 — 입력칸에 쓰는 중이면 미뤘다가 손을 뗀 뒤에 */
function typing(){ const a = document.activeElement, b = $('#body'); return !!(a && b && b.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
function soft(tab){
  QO.tabs.paintBadges();
  if(QO.tabs.current() !== tab) return;
  if(typing()){ T.dirty = true; return; }
  QO.tabs.rerender(tab);
}
let pointerDown = false;
function flushDirty(){ if(!T.dirty || pointerDown || typing()) return; T.dirty = false; QO.tabs.rerender(); }

/* 누르는 일 하나 — 버튼 잠금 + 한 번에 하나만 */
let lock = false;
async function act(btn, work, opts){
  if(lock) return undefined;
  lock = true;
  try{ return await ui.busy(btn, work, opts); }
  finally{ lock = false; }
}

/* ═══════════ 작은 도우미 ═══════════ */
const methodName = k => (K.METHODS.find(m => m[0] === k) || [k, k || ''])[1];
const kindName = k => (K.CLUE_KINDS[k] || {}).n || k || '';
const CMP = {right:'맞았어요', part:'일부 맞았어요', changed:'바뀌었어요'};
const mins = sec => { const m = Math.floor(sec / 60), s = sec % 60; return (m ? m + '분' : '') + (s ? (m ? ' ' : '') + s + '초' : ''); };
const stagesOf = L => L && L.mode === 'group' ? K.GROUP_STAGES : K.LESSON_STAGES;
const modeName = m => m === 'group' ? '모둠 진행' : '단서 시간';
const isLegacyReq = q => !!q && q.resolved === true && !(q.journal && q.journal.wrap && q.journal.wrap.mode);
const byNum = () => new Map((T.students || []).map(s => [s.number, s]));
const byId = () => new Map((T.students || []).map(s => [s.id, s]));
const who = (id, fallback) => { const s = byId().get(id); return s ? s.name + '(' + s.number + '번)' : (fallback || '다른 반 학생'); };
const sortSteps = a => a.slice().sort((x, y) => x.step_no - y.step_no || x.id - y.id);

/* ═══════════ 열매 확인 ═══════════ */
const RET_STEPS = ['refine', 'predict', 'method', 'find', 'wrap'];
const RET_EX = [
  {step:'find', text:'찾은 곳이 한 곳뿐이에요. 다른 곳에서 하나 더 찾아볼까요?'},
  {step:'wrap', text:'막힌 곳을 처음 질문보다 좁게, 질문 꼴로 다시 적어 볼까요?'}
];
function cutoverNote(){
  if(!T.cutover || !S.cls) return '';
  const c = T.cutover.find(x => x.grade === S.cls.grade && x.class_no === S.cls.class_no);
  if(!c) return '<span class="t-clsnote">아직 질문과수원 1을 쓰는 반이에요</span>';
  const d = ui.kstDay(c.cutover_at).split('-').map(Number);
  return '<span class="t-clsnote">' + d[1] + '월 ' + d[2] + '일부터 질문과수원 2를 써요</span>';
}
function renderFruits(root){
  ensure();
  if(!S.cls){ root.innerHTML = '<div class="empty">학생이 있는 반이 없어요.</div>'; return; }
  const list = T.pending;
  let h = '<div class="t-bar"><span class="t-count">' + (list ? '확인 요청 ' + list.length + '개' : '확인 요청을 불러오는 중이에요') + '</span>' + cutoverNote() +
    (list && list.length ? '<button type="button" class="link" data-act="f-csv">CSV 내려받기</button>' +
      '<label class="link t-up" for="t_fcsv">CSV 올리기</label><input type="file" id="t_fcsv" accept=".csv,text/csv" hidden>' +
      '<button type="button" class="link" data-act="f-quick">빠르게 확인</button>' : '') +
    '<button type="button" class="link" data-act="f-reload">새로 읽기</button></div>';
  if(!list){ root.innerHTML = h; return; }
  if(T.bulk){ root.innerHTML = h + bulkHTML(); return; }
  if(T.quick && list.length){ root.innerHTML = h + quickHTML(); return; }
  if(!list.length){ root.innerHTML = h + '<div class="card empty">확인을 기다리는 질문이 없어요.</div>' + growHTML() + demoBox(); return; }
  const wide = ui.wide(), open = list.find(q => q.id === T.open) || null;
  if(open && !T.detail[open.id] && !T.reqs['d' + open.id]) loadDetail(open.id);
  let items = '';
  list.forEach(q => { items += (!wide && open === q) ? detailHTML(q) : itemHTML(q); });
  if(wide) h += '<div class="t-split"><div class="t-list">' + items + '</div><div class="t-pane">' +
    (open ? detailHTML(open) : '<div class="t-ph">왼쪽에서 질문을 고르면 탐구 일지가 여기에 열려요.</div>') + '</div></div>';
  else h += '<div class="t-list">' + items + '</div>';
  root.innerHTML = h + growHTML() + demoBox();
}
function itemHTML(q){
  const v = J.view(q), w = v.d.wrap, st = q.student || {}, on = T.open === q.id;
  let tags = '';
  if(w && w.mode === 'unknown') tags += '<span class="tag fog">' + ui.FOG_SVG + '아직 모름</span>';
  if(w && w.cmp === 'quick') tags += '<span class="tag">답만 달기</span>';   // explore.js QUICK — 일지 칸 없이 답·출처만
  if(isLegacyReq(q)) tags += '<span class="tag t-old">옛 앱에서 마침</span>';
  if(J.hasAI(v)) tags += '<span class="tag t-ai">AI 사용</span>';
  return '<button type="button" class="t-item' + (on ? ' sel' : '') + '" data-act="f-open" data-q="' + q.id + '" aria-expanded="' + on + '">' +
    '<div class="qt">' + esc(v.text) + '</div><div class="meta"><span class="t-who">' + esc(st.name || '') + (st.number != null ? ' · ' + st.number + '번' : '') + '</span>' +
    '<span class="t-when">' + esc(ui.fmtTime(q.resolve_requested_at)) + '</span>' + tags + '</div></button>';
}
const row = (name, body) => '<div class="t-row"><div class="t-rl">' + name + '</div><div class="t-rv">' + body + '</div></div>';
const EMPTY = '<span class="t-empty">비어 있어요</span>';
function journalRows(v){
  const d = v.d;
  let h = '';
  if(d.refine && d.refine.text) h += row('다듬기', esc(d.refine.text) + (v.notes.refine ? '<div class="t-note">선생님 글 · ' + esc(v.notes.refine) + '</div>' : ''));
  h += row('예상', d.predict ? '<ol class="t-pred">' + d.predict.map((p, i) => '<li><span class="t-k">' + (i ? '바뀐 생각' : '처음') + '</span>' + esc(p.text) +
    (p.at ? '<span class="t-at">' + esc(ui.fmtTime(p.at)) + '</span>' : '') + '</li>').join('') + '</ol>' + (d.known ? '<div class="t-note">이미 알던 것 · ' + esc(d.known) + '</div>' : '') : EMPTY);
  h += row('알아볼 방법', d.method ? '<b>' + esc(methodName(d.method.kind)) + '</b>' + (d.method.plan ? ' · ' + esc(d.method.plan) : '') : EMPTY);
  let f = EMPTY;
  if(d.find){
    f = d.find.map(x => '<div class="t-src"><b>' + esc(x.src || '출처 없음') + '</b>' + (x.ai ? ' <span class="tag t-ai">AI</span>' : '') + (x.text ? '<div>' + esc(x.text) + '</div>' : '') + '</div>').join('');
    if(d.same) f += '<div class="t-note">두 곳이 같은 말을 하나요? · ' + esc(d.same) + '</div>';
    if(d.aiCmp) f += '<div class="t-note">AI 답과 견주면 · ' + esc(d.aiCmp) + '</div>';
    if(J.hasAI(v) && !J.findOK(v)) f += '<div class="t-warn">' + (d.find.some(x => !x.ai) ? '「AI 답과 견주기」가 비어 있어요.' : 'AI 말고 다른 출처가 없어요.') + '</div>';
  }
  h += row('찾기', f);
  const w = d.wrap;
  let wr = EMPTY;
  if(w && w.mode === 'unknown'){
    wr = (w.cmp ? '<div><b>내 예상은</b> ' + esc(CMP[w.cmp] || w.cmp) + (w.changedBy ? ' — ' + esc(w.changedBy) : '') + '</div>' : '') +
      '<div class="t-fogbox"><div><b>여기까지 알아냈어요</b>' + esc(w.reached || '—') + '</div><div><b>여기서 막혔어요</b>' + esc(w.stuckQ || '—') + '</div><div><b>왜 막혔나</b>' + esc(w.why || '—') + '</div></div>';
  } else if(w && w.cmp === 'quick'){
    wr = '<div><b>답만 달기</b>' + (w.changedBy ? ' · 어디서: ' + esc(w.changedBy) : '') + '</div><div>' + esc(w.text || '') + '</div>';
  } else if(w){
    wr = (w.cmp ? '<div><b>내 예상은</b> ' + esc(CMP[w.cmp] || w.cmp) + (w.changedBy ? ' — ' + esc(w.changedBy) : '') + '</div>' : '') + '<div>' + esc(w.text || '') + '</div>';
  }
  h += row(w && w.mode === 'unknown' ? '정리 · 아직 모름' : w && w.cmp === 'quick' ? '정리 · 답만 달기' : '정리', wr);
  if(d.extend) h += row('넓히기', '<b>' + (d.extend.kind === 'newq' ? '새 질문' : '생활과 잇기') + '</b> · ' + esc(d.extend.text));
  return h;
}
function detailHTML(q){
  const D = T.detail[q.id];
  if(!D) return '<div class="card t-detail" data-detail="' + q.id + '"><div class="t-dq">' + esc(J.view(q).text) + '</div><div class="empty">일지를 불러오는 중이에요.</div></div>';
  const Q = D.question, v = J.view(Q), d = v.d, st = D.student || q.student || {}, id = q.id;
  let h = '<div class="card t-detail" data-detail="' + id + '"><div class="t-dh"><div class="t-dtop"><div class="t-dq">' + esc(v.text) + '</div>' +
    (ui.wide() ? '' : '<button type="button" class="link t-fold1" data-act="f-open" data-q="' + id + '" aria-expanded="true">접기</button>') + '</div><div class="hint">' +
    [st.name ? esc(st.name) + (st.number != null ? ' · ' + st.number + '번' : '') : '', v.unit ? esc(v.unit) : '', Q.is_anonymous ? '익명으로 심음' : '', Q.resolve_requested_at ? '보낸 때 ' + esc(ui.fmtTime(Q.resolve_requested_at)) : '']
      .filter(Boolean).join(' · ') + '</div>' + (v.original && v.original !== v.text ? '<div class="hint">처음 질문 · ' + esc(v.original) + '</div>' : '') + '</div>';
  const blank = !d.predict && !d.method && !d.find && !d.wrap;
  if(isLegacyReq(Q)) h += '<div class="rule">옛 앱에서 학생이 스스로 마친 질문이에요.' + (blank ? ' 일지 칸에 적힌 것이 없어요.' : '') + '</div>';
  if(v.notes.nudge) h += '<div class="t-note">지난번 되돌릴 때 쓴 글 · ' + esc(v.notes.nudge) + '</div>';
  h += '<div class="t-rows">' + journalRows(v) + '</div>';
  /* 발자국 칸 수 → 확인하면 들어갈 도토리 */
  const steps = K.STEPS.filter(s => (D.footprints || []).some(f => f.step === s.k));
  h += '<div class="t-prints">발자국 ' + steps.length + '칸' + (steps.length ? ' (' + steps.map(s => s.n).join(' · ') + ')' : '') + ' · 확인하면 도토리 ' + (steps.length + 5) + '개</div>';
  const cl = D.clues || [];
  if(cl.length){
    h += '<div><div class="t-sub">받은 단서 ' + cl.length + '개</div>' + cl.map(c => '<div class="t-cl"><span class="tag clue">' + esc(kindName(c.kind)) + '</span> ' + esc(c.body) +
      '<div class="hint">' + esc(c.by_teacher ? '선생님' : who(c.author_id)) + ' · ' + esc(J.stepName(c.step)) + ' 칸 · ' + esc(ui.fmtTime(c.created_at)) +
      (c.thanked_at ? ' · 고마움 「' + esc(c.thanks_text || '') + '」' : '') + (c.hidden_at ? ' · 숨김' : '') + '</div></div>').join('') + '</div>';
  } else h += '<div class="hint">받은 단서는 없어요.</div>';
  const fogFirst = !!(d.wrap && d.wrap.mode === 'unknown');
  if(fogFirst) h += '<div class="rule t-crit"><b>안개 열매 판정 기준</b><ol><li>알아낸 것에 구체적인 사실 하나와 출처가 있어요.</li>' +
    '<li>막힌 곳이 처음 질문보다 좁고 구체적이에요.</li><li>교과서에서 답이 나오는 질문이면 「한 곳 더 찾아보자」로 되돌려요.</li></ol></div>';
  const bFruit = l => '<button type="button" class="btn t-fruit' + (l ? ' line' : '') + '" data-act="f-ok" data-kind="fruit" data-q="' + id + '">🍎 열매</button>';
  const bFog = l => '<button type="button" class="btn t-fogb' + (l ? ' line' : '') + '" data-act="f-ok" data-kind="fog" data-q="' + id + '">' + ui.FOG_SVG + ' 안개 열매</button>';
  h += '<div class="t-acts">' + (fogFirst ? bFog(false) + bFruit(true) : bFruit(false) + bFog(true)) +
    '<button type="button" class="btn line" data-act="f-ret" data-q="' + id + '" aria-expanded="' + !!(T.ret && T.ret.qid === id) + '">되돌리기</button></div>';
  if(T.ret && T.ret.qid === id){
    const R = T.ret;
    h += '<div class="t-ret"><div class="lbl">다시 열 칸</div><div class="chips">' + RET_STEPS.map(k => '<button type="button" class="chip' + (R.step === k ? ' on' : '') +
      '" data-act="f-ret-step" data-step="' + k + '" aria-pressed="' + (R.step === k) + '">' + esc(J.stepName(k)) + '</button>').join('') + '</div>' +
      '<label class="lbl" for="t_retNote">학생에게 한 줄</label><input class="inp" id="t_retNote" data-bind="retNote" maxlength="120" autocomplete="off" value="' + esc(R.note) + '" placeholder="무엇을 더 해 보면 좋을지 한 줄로">' +
      '<div class="t-exs"><span class="hint">예시</span>' + RET_EX.map((x, i) => '<button type="button" class="chip t-ex" data-act="f-ret-ex" data-i="' + i + '">' + esc(x.text) + '</button>').join('') + '</div>' +
      '<div class="err" id="t_retErr" role="alert"></div><div class="row"><button type="button" class="btn line sm" data-act="f-ret-cancel">그만두기</button>' +
      '<button type="button" class="btn sm t-grow1" data-act="f-ret-send" data-q="' + id + '">되돌려 보내기</button></div></div>';
  }
  return h + '</div>';
}
function retDefault(D){
  const v = J.view(D.question), d = v.d;
  if(d.wrap && d.wrap.mode === 'unknown') return 'find';
  if(!J.findOK(v) || (d.find || []).length < 2) return 'find';
  return 'wrap';
}
/* 확인할 답 CSV(설계서 §5) — 일지 칸 전부와 「AI 사용」. 실명은 넣지 않는다(학생 번호만). 뒤 세 칸은 선생님이 적는 자리 */
const CSV_HEAD = ['질문 번호', '학생 번호', '처음 질문', '다듬은 질문', '단원', '예상', '알아볼 방법', '찾기(출처: 알아낸 것)', '두 곳 비교', 'AI 답과 견주기',
  '내 예상은', '정리', '여기까지 알아냈어요', '막힌 곳', '왜 막혔나', '넓히기', 'AI 사용', '보낸 때', '결과(열매·안개 열매·되돌리기)', '되돌릴 칸', '학생에게 한 줄'];
function csvOf(list){
  const cell = x => '"' + String(x == null ? '' : x).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  const rows = (list || []).map(q => {
    const v = J.view(q), d = v.d, w = d.wrap || {}, st = q.student || {};
    return [q.id, st.number != null ? st.number : '', v.original, d.refine && d.refine.text ? d.refine.text : '', v.unit,
      (d.predict || []).map((p, i) => (i ? '바뀐 생각: ' : '') + p.text).join(' / '),
      d.method ? methodName(d.method.kind) + (d.method.plan ? ' · ' + d.method.plan : '') : '',
      (d.find || []).map(f => (f.src || '') + (f.ai ? '(AI)' : '') + ': ' + (f.text || '')).join(' / '),
      d.same || '', d.aiCmp || '', w.cmp === 'quick' ? '답만 달기' + (w.changedBy ? ' · 어디서: ' + w.changedBy : '') : w.cmp ? (CMP[w.cmp] || w.cmp) + (w.changedBy ? ' — ' + w.changedBy : '') : '',
      w.mode === 'known' ? w.text || '' : '', w.mode === 'unknown' ? w.reached || '' : '', w.mode === 'unknown' ? w.stuckQ || '' : '', w.mode === 'unknown' ? w.why || '' : '',
      d.extend ? (d.extend.kind === 'newq' ? '새 질문: ' : '생활과 잇기: ') + d.extend.text : '', J.hasAI(v) ? '예' : '',
      q.resolve_requested_at ? ui.kstDay(q.resolve_requested_at) + ' ' + ui.kstHM(q.resolve_requested_at) : '', '', '', ''];
  });
  return '\ufeff' + [CSV_HEAD].concat(rows).map(r => r.map(cell).join(',')).join('\r\n');
}
function dropPending(id){
  if(T.pending) T.pending = T.pending.filter(q => q.id !== id);
  delete T.detail[id];
  if(T.open === id){ T.open = null; T.ret = null; }
  QO.tabs.rerender('fruits');
}
const ACT = {};
ACT['f-csv'] = () => {
  if(!T.pending || !T.pending.length || !S.cls) return;
  const blob = new Blob([csvOf(T.pending)], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = '열매확인_' + S.cls.grade + '-' + S.cls.class_no + '_' + ui.kstToday() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
ACT['f-reload'] = () => { T.pending = null; T.detail = {}; QO.tabs.rerender('fruits'); loadPending(); loadCutover(); };
ACT['f-open'] = b => {
  const id = Number(b.dataset.q);
  T.open = T.open === id ? null : id; T.ret = null;
  if(T.open && !T.detail[id]) loadDetail(id);
  if(T.open && !T.students) loadStudents();
  QO.tabs.rerender('fruits');
  if(T.open && !ui.wide()){ const el = $('.t-detail[data-detail="' + id + '"]'); if(el && el.scrollIntoView) el.scrollIntoView({block:'nearest'}); }
};
ACT['f-ok'] = async b => {
  const id = Number(b.dataset.q), kind = b.dataset.kind;
  const n = await act(b, () => QO.api.confirmFruit(id, kind));
  if(n === undefined) return;
  ui.toast(n > 0 ? (kind === 'fog' ? '안개 열매가 열렸어요. ' : '열매가 열렸어요. ') + '도토리 ' + n + '개가 들어갔어요' : '이미 확인한 질문이라 도토리는 더 들어가지 않았어요');
  dropPending(id); loadPending();
};
ACT['f-ret'] = b => {
  const id = Number(b.dataset.q), D = T.detail[id];
  T.ret = T.ret && T.ret.qid === id ? null : {qid:id, step:D ? retDefault(D) : 'find', note:''};
  QO.tabs.rerender('fruits');
  const inp = $('#t_retNote'); if(inp) inp.focus();
};
ACT['f-ret-step'] = b => { if(!T.ret) return; T.ret.step = b.dataset.step; QO.tabs.rerender('fruits'); };
ACT['f-ret-ex'] = b => { if(!T.ret) return; const x = RET_EX[Number(b.dataset.i)]; if(!x) return; T.ret.note = x.text; T.ret.step = x.step; QO.tabs.rerender('fruits'); };
ACT['f-ret-cancel'] = () => { T.ret = null; QO.tabs.rerender('fruits'); };
ACT['f-ret-send'] = async b => {
  const R = T.ret, err = $('#t_retErr'); if(!R) return;
  const inp = $('#t_retNote'); R.note = inp ? inp.value : R.note;
  const note = String(R.note || '').trim();
  if(err) err.textContent = '';
  if(!R.step){ if(err) err.textContent = '다시 열 칸을 골라 주세요.'; return; }
  if(note.length < 5){ if(err) err.textContent = '학생에게 보낼 한 줄을 적어 주세요.'; if(inp) inp.focus(); return; }
  const r = await act(b, () => QO.api.returnFruit(R.qid, R.step, note), {errEl:err});
  if(r === undefined) return;
  ui.toast(r ? J.stepName(R.step) + ' 칸을 다시 열어 돌려보냈어요' : '이미 확인한 질문이에요');
  dropPending(R.qid); loadPending();
};

/* ═══════════ ① CSV 올리기 → 한 줄씩 보는 표 → 반영 ═══════════
   CSV 는 「CSV 내려받기」 파일 그대로(뒤 세 칸만 채운 것). 「AI 메모」 칸이 있으면 같이 보여 주고,
   메모에 「확인」이 들어 있거나 결과가 비었거나 틀린 줄은 체크를 풀어 둔다 — 선생님이 보고 눌러야 들어간다. */
function parseCSV(text){
  const rows = []; let row = [], cur = '', q = false;
  text = String(text || '').replace(/^\ufeff/, '');
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if(c === '"') q = true;
    else if(c === ','){ row.push(cur); cur = ''; }
    else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const KIND_OF = v => { v = String(v || '').replace(/\s/g, ''); if(!v) return '';
  if(/안개|fog/i.test(v)) return 'fog'; if(/되돌|돌려|return|다시/i.test(v)) return 'ret'; if(/열매|fruit|🍎/i.test(v)) return 'fruit'; if(/건너|skip|보류/i.test(v)) return 'skip'; return '?'; };
const STEP_OF = v => { v = String(v || '').trim(); if(!v) return '';
  if(RET_STEPS.indexOf(v) >= 0) return v;
  const hit = RET_STEPS.find(k => { const n = J.stepName(k); return n && (v === n || v.indexOf(n) >= 0 || n.indexOf(v) >= 0); });
  return hit || '?'; };
function bulkCheck(r){
  if(!r.q) return '목록에 없는 질문이에요(이미 확인했거나 다른 반)';
  if(r.kind === '?' ) return '결과 칸을 알아볼 수 없어요';
  if(!r.kind || r.kind === 'skip') return '';
  if(r.kind === 'ret'){
    if(!r.step || r.step === '?') return '되돌릴 칸을 골라 주세요';
    if(String(r.note || '').trim().length < 5) return '학생에게 한 줄을 적어 주세요';
  }
  return '';
}
function bulkLoad(text, name){
  const rows = parseCSV(text);
  if(!rows.length) throw QO.userError('빈 파일이에요');
  const head = rows[0].map(x => String(x).trim());
  const col = re => head.findIndex(h => re.test(h));
  const ci = col(/^질문\s*번호$/), cr = col(/^결과/), cs = col(/^되돌릴/), cn = col(/학생에게/), cm = col(/AI\s*메모|메모|선생님\s*확인/);
  if(ci < 0 || cr < 0) throw QO.userError('「CSV 내려받기」로 받은 파일이 아니에요(질문 번호·결과 칸이 없어요)');
  const byId = new Map((T.pending || []).map(q => [q.id, q]));
  const out = rows.slice(1).map(r => {
    const id = Number(String(r[ci] || '').trim()), memo = cm >= 0 ? String(r[cm] || '').trim() : '';
    const x = {id:id, q:byId.get(id) || null, kind:KIND_OF(r[cr]), step:STEP_OF(cs >= 0 ? r[cs] : ''), note:cn >= 0 ? String(r[cn] || '').trim() : '', memo:memo, done:'', err:''};
    if(x.kind === 'ret' && !x.step && x.q){ const D = T.detail[id]; x.step = D ? retDefault(D) : 'find'; }
    x.err = bulkCheck(x);
    x.on = !x.err && !!x.kind && x.kind !== 'skip' && !/확인/.test(memo);
    return x;
  }).filter(x => x.id);
  T.bulk = {name:name || '', rows:out, busy:false};
  QO.tabs.rerender('fruits');
}
function bulkHTML(){
  const B = T.bulk, n = B.rows.filter(r => r.on && !r.done).length;
  const opt = (v, cur, label) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + label + '</option>';
  let h = '<div class="card t-bulk"><div class="t-bh"><b>올린 CSV 확인</b>' + (B.name ? ' <span class="hint">' + esc(B.name) + '</span>' : '') +
    '<div class="hint">체크한 줄만 반영돼요. 「확인」 표시가 있거나 칸이 비거나 틀린 줄은 체크를 풀어 뒀어요. 반영하면 열매·도토리가 바로 들어가요.</div></div>' +
    '<div class="t-btable">';
  B.rows.forEach((r, i) => {
    const v = r.q ? J.view(r.q) : null, st = r.q ? (r.q.student || {}) : {};
    h += '<div class="t-brow' + (r.done ? ' done' : '') + (r.err ? ' bad' : '') + '" data-i="' + i + '">' +
      '<label class="t-bchk"><input type="checkbox" data-bind="bk-on-' + i + '"' + (r.on ? ' checked' : '') + (r.done || (r.err && r.q === null) ? ' disabled' : '') + '></label>' +
      '<div class="t-bq"><div class="qt">' + (v ? esc(v.text) : '질문 ' + r.id) + '</div><div class="hint">' + (st.number != null ? st.number + '번' : '') + (st.name ? ' ' + esc(st.name) : '') + ' · 질문 ' + r.id + '</div>' +
      (r.memo ? '<div class="t-bmemo">AI 메모 · ' + esc(r.memo) + '</div>' : '') +
      (r.done ? '<div class="t-bok">' + esc(r.done) + '</div>' : '') + (r.err ? '<div class="err">' + esc(r.err) + '</div>' : '') + '</div>' +
      '<div class="t-bset"><select class="inp" data-bind="bk-kind-' + i + '" aria-label="결과"' + (r.done ? ' disabled' : '') + '>' +
        opt('fruit', r.kind, '열매') + opt('fog', r.kind, '안개 열매') + opt('ret', r.kind, '되돌리기') + opt('skip', r.kind === '' || r.kind === '?' ? 'skip' : r.kind, '건너뛰기') + '</select>' +
      (r.kind === 'ret' ? '<select class="inp" data-bind="bk-step-' + i + '" aria-label="되돌릴 칸"' + (r.done ? ' disabled' : '') + '>' + RET_STEPS.map(k => opt(k, r.step, J.stepName(k))).join('') + '</select>' +
        '<input class="inp" data-bind="bk-note-' + i + '" maxlength="120" autocomplete="off" placeholder="학생에게 한 줄" value="' + esc(r.note) + '"' + (r.done ? ' disabled' : '') + '>' : '') +
      '</div></div>';
  });
  h += '</div><div class="err" id="t_bErr" role="alert"></div><div class="row t-bacts"><button type="button" class="btn line" data-act="f-bulk-cancel">' + (B.rows.some(r => r.done) ? '닫기' : '그만두기') + '</button>' +
    '<button type="button" class="btn" data-act="f-bulk-apply"' + (n ? '' : ' disabled') + '>체크한 ' + n + '개 반영하기</button></div></div>';
  return h;
}
function bulkBind(k, el){
  const B = T.bulk; if(!B) return;
  const m = /^bk-(on|kind|step|note)-(\d+)$/.exec(k); if(!m) return;
  const r = B.rows[Number(m[2])]; if(!r || r.done) return;
  if(m[1] === 'on') r.on = el.checked;
  if(m[1] === 'kind'){ r.kind = el.value; if(r.kind === 'ret' && !r.step) r.step = 'find'; r.err = bulkCheck(r); r.on = !r.err && r.kind !== 'skip'; QO.tabs.rerender('fruits'); return; }
  if(m[1] === 'step'){ r.step = el.value; r.err = bulkCheck(r); }
  if(m[1] === 'note'){ r.note = el.value; const was = r.err; r.err = bulkCheck(r); if(!!was !== !!r.err || (!r.err && !r.on)){ if(!r.err) r.on = true; } }
  const btn = $('[data-act="f-bulk-apply"]');
  if(btn){ const n = B.rows.filter(x => x.on && !x.done).length; btn.textContent = '체크한 ' + n + '개 반영하기'; btn.disabled = !n; }
}
document.addEventListener('change', e => {
  const t = e.target; if(!t || t.id !== 't_fcsv' || !t.files || !t.files[0]) return;
  const f = t.files[0]; t.value = '';
  f.text().then(x => bulkLoad(x, f.name)).catch(er => ui.fail(er));
});
ACT['f-bulk-cancel'] = () => { const had = T.bulk && T.bulk.rows.some(r => r.done); T.bulk = null; QO.tabs.rerender('fruits'); if(had) loadPending(); };
ACT['f-bulk-apply'] = async b => {
  const B = T.bulk; if(!B || B.busy) return;
  const err = $('#t_bErr'); if(err) err.textContent = '';
  const todo = B.rows.filter(r => r.on && !r.done);
  const bad = todo.find(r => bulkCheck(r)); if(bad){ bad.err = bulkCheck(bad); QO.tabs.rerender('fruits'); return; }
  B.busy = true; b.disabled = true;
  let ok = 0, acorn = 0, fail = 0;
  for(const r of todo){
    b.textContent = (ok + fail + 1) + ' / ' + todo.length + ' 반영하는 중…';
    try{
      if(r.kind === 'ret'){ const x = await QO.api.returnFruit(r.id, r.step, String(r.note).trim()); r.done = x ? J.stepName(r.step) + ' 칸을 다시 열어 돌려보냈어요' : '이미 확인한 질문이에요'; }
      else { const n = await QO.api.confirmFruit(r.id, r.kind); acorn += n || 0; r.done = (r.kind === 'fog' ? '안개 열매' : '열매') + (n > 0 ? ' · 도토리 ' + n + '개' : ' · 이미 확인한 질문'); }
      r.on = false; ok++;
    }catch(e){ r.err = ui.userMsg(e) || '반영하지 못했어요'; fail++; }
  }
  B.busy = false;
  ui.toast(ok + '개 반영했어요' + (acorn ? ' · 도토리 ' + acorn + '개' : '') + (fail ? ' · ' + fail + '개는 못 했어요' : ''));
  T.pending = (T.pending || []).filter(q => !B.rows.some(r => r.done && r.id === q.id));
  QO.tabs.rerender('fruits');
};

/* ═══════════ ② 빠르게 확인 — 한 장씩, 키보드로 ═══════════ */
function quickHTML(){
  const list = T.pending || [], Qk = T.quick;
  if(Qk.i >= list.length) Qk.i = Math.max(0, list.length - 1);
  const q = list[Qk.i]; if(!q) return '';
  const v = J.view(q), st = q.student || {}, fogFirst = !!(v.d.wrap && v.d.wrap.mode === 'unknown');
  let h = '<div class="card t-quick" data-q="' + q.id + '"><div class="t-qh"><b>' + (Qk.i + 1) + ' / ' + list.length + '</b>' +
    '<span class="hint">' + (st.number != null ? st.number + '번 ' : '') + esc(st.name || '') + (v.unit ? ' · ' + esc(v.unit) : '') + '</span>' +
    '<button type="button" class="link" data-act="f-quick-off">그만</button></div>' +
    '<div class="t-dq">' + esc(v.text) + '</div>' + (v.original && v.original !== v.text ? '<div class="hint">처음 질문 · ' + esc(v.original) + '</div>' : '') +
    (J.hasAI(v) ? '<span class="tag t-ai">AI 사용</span>' : '') + '<div class="t-rows">' + journalRows(v) + '</div>' +
    '<div class="t-acts t-qacts">' +
      '<button type="button" class="btn t-fruit' + (fogFirst ? ' line' : '') + '" data-act="f-q" data-kind="fruit"><kbd>1</kbd> 🍎 열매</button>' +
      '<button type="button" class="btn t-fogb' + (fogFirst ? '' : ' line') + '" data-act="f-q" data-kind="fog"><kbd>2</kbd> ' + ui.FOG_SVG + ' 안개 열매</button>' +
      '<button type="button" class="btn line" data-act="f-q" data-kind="ret"><kbd>3</kbd> 되돌리기</button>' +
      '<button type="button" class="btn line" data-act="f-q-move" data-d="-1" aria-label="앞 질문"><kbd>←</kbd></button>' +
      '<button type="button" class="btn line" data-act="f-q-move" data-d="1" aria-label="다음 질문(건너뛰기)"><kbd>→</kbd> 건너뛰기</button></div>';
  if(Qk.ret){
    h += '<div class="t-ret"><div class="lbl">다시 열 칸</div><div class="chips">' + RET_STEPS.map(k => '<button type="button" class="chip' + (Qk.step === k ? ' on' : '') +
      '" data-act="f-q-step" data-step="' + k + '" aria-pressed="' + (Qk.step === k) + '">' + esc(J.stepName(k)) + '</button>').join('') + '</div>' +
      '<label class="lbl" for="t_qNote">학생에게 한 줄 (Enter 로 보내기)</label><input class="inp" id="t_qNote" data-bind="qNote" maxlength="120" autocomplete="off" value="' + esc(Qk.note || '') + '" placeholder="무엇을 더 해 보면 좋을지 한 줄로">' +
      '<div class="err" id="t_qErr" role="alert"></div><div class="row"><button type="button" class="btn line sm" data-act="f-q-retoff">그만두기</button>' +
      '<button type="button" class="btn sm t-grow1" data-act="f-q-send">되돌려 보내기</button></div></div>';
  }
  return h + '<div class="hint t-qhint">키보드: 1 열매 · 2 안개 열매 · 3 되돌리기 · → 건너뛰기 · ← 앞 · Esc 그만</div></div>';
}
ACT['f-quick'] = () => { T.quick = {i:0, ret:false, step:'find', note:''}; T.open = null; T.ret = null; QO.tabs.rerender('fruits'); };
ACT['f-quick-off'] = () => { T.quick = null; QO.tabs.rerender('fruits'); };
ACT['f-q-move'] = b => { const Qk = T.quick; if(!Qk) return; const n = (T.pending || []).length; Qk.i = Math.min(Math.max(0, Qk.i + Number(b.dataset.d)), Math.max(0, n - 1)); Qk.ret = false; Qk.note = ''; QO.tabs.rerender('fruits'); };
ACT['f-q-step'] = b => { if(!T.quick) return; T.quick.step = b.dataset.step; QO.tabs.rerender('fruits'); const i = $('#t_qNote'); if(i) i.focus(); };
ACT['f-q-retoff'] = () => { if(!T.quick) return; T.quick.ret = false; QO.tabs.rerender('fruits'); };
function quickDone(id){
  T.pending = (T.pending || []).filter(q => q.id !== id); delete T.detail[id];
  const Qk = T.quick; if(Qk){ Qk.ret = false; Qk.note = ''; if(!T.pending.length) T.quick = null; }
  QO.tabs.rerender('fruits');
}
ACT['f-q'] = async b => {
  const Qk = T.quick, q = Qk && (T.pending || [])[Qk.i]; if(!q) return;
  const kind = b.dataset.kind;
  if(kind === 'ret'){ Qk.ret = true; const v = J.view(q); Qk.step = (v.d.wrap && v.d.wrap.mode === 'unknown') || !J.findOK(v) || (v.d.find || []).length < 2 ? 'find' : 'wrap'; QO.tabs.rerender('fruits'); const i = $('#t_qNote'); if(i) i.focus(); return; }
  const n = await act(b, () => QO.api.confirmFruit(q.id, kind));
  if(n === undefined) return;
  ui.toast((kind === 'fog' ? '안개 열매' : '열매') + (n > 0 ? ' · 도토리 ' + n + '개' : ' · 이미 확인한 질문'));
  quickDone(q.id);
};
ACT['f-q-send'] = async b => {
  const Qk = T.quick, q = Qk && (T.pending || [])[Qk.i]; if(!q) return;
  const inp = $('#t_qNote'), err = $('#t_qErr'), note = String(inp ? inp.value : Qk.note || '').trim();
  if(err) err.textContent = '';
  if(note.length < 5){ if(err) err.textContent = '학생에게 보낼 한 줄을 적어 주세요.'; if(inp) inp.focus(); return; }
  const r = await act(b, () => QO.api.returnFruit(q.id, Qk.step, note), {errEl:err});
  if(r === undefined) return;
  ui.toast(r ? J.stepName(Qk.step) + ' 칸을 다시 열어 돌려보냈어요' : '이미 확인한 질문이에요');
  quickDone(q.id);
};
document.addEventListener('keydown', e => {
  if(!T.quick || QO.tabs.current() !== 'fruits' || e.isComposing || e.keyCode === 229 || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const a = document.activeElement, inInput = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  const click = sel => { const b = $(sel); if(b && !b.disabled){ e.preventDefault(); b.click(); } };
  if(inInput){
    if(a.id === 't_qNote' && e.key === 'Enter'){ e.preventDefault(); click('[data-act="f-q-send"]'); }
    else if(a.id === 't_qNote' && e.key === 'Escape'){ e.preventDefault(); click('[data-act="f-q-retoff"]'); }
    return;
  }
  if(e.key === '1') click('[data-act="f-q"][data-kind="fruit"]');
  else if(e.key === '2') click('[data-act="f-q"][data-kind="fog"]');
  else if(e.key === '3') click('[data-act="f-q"][data-kind="ret"]');
  else if(e.key === 'ArrowRight') click('[data-act="f-q-move"][data-d="1"]');
  else if(e.key === 'ArrowLeft') click('[data-act="f-q-move"][data-d="-1"]');
  else if(e.key === 'Escape') click(T.quick.ret ? '[data-act="f-q-retoff"]' : '[data-act="f-quick-off"]');
});

/* ═══════════ 수업 진행(단서 시간 · 모둠 진행) ═══════════ */
function setLive(row, local){
  /* 끄는 것을 잊은 지난 진행(오늘이 아니거나 한 단계가 90분 넘게) — 진행으로 보지 않고 「끝내기」만 */
  const st = row && row.active && QO.live.stale(row) ? row : null;
  if(JSON.stringify(st) !== JSON.stringify(T.staleLive)){ T.staleLive = st; if(!row || st) soft('live'); }
  if(st) row = null;
  const prev = T.live, next = row && row.active ? row : null;
  /* 이 기기에서 시작하거나 단계를 바꾼 때 — 타이머는 이 시각부터(기기 시계와 서버 시각이 달라도) */
  if(local && next && (!prev || prev.id !== next.id || prev.stage !== next.stage)) QO.live.mark(next);
  if(JSON.stringify(prev) === JSON.stringify(next)) return;
  T.live = next;
  if(prev && !next && !local && !T.ended) T.ended = {mode:prev.mode, sent:sessionClues(prev).length};
  if(next && (!prev || prev.id !== next.id)){
    T.pick = []; T.ended = null;
    if(next.mode === 'clue'){ loadStuck(); loadToday(); } else loadGroups();
  }
  if(local) QO.tabs.rerender('live'); else soft('live');
  boardRefresh();
  QO.tabs.paintBadges();
}
const sessionClues = L => L ? (T.today || []).filter(c => !c.hidden_at && String(c.created_at) >= String(L.created_at)) : [];
function demoQ(){ const s = T.stuck || []; return s.find(q => q.id === T.demoQ) || s[0] || null; }
function modeCard(mode){
  const ST = mode === 'group' ? K.GROUP_STAGES : K.LESSON_STAGES, total = ST.reduce((a, s) => a + s[1], 0);
  return '<div class="card t-mode"><div class="t-mh"><b>' + modeName(mode) + '</b><span class="hint">' + (mode === 'group' ? '1차시 · ' : '') + '모두 ' + mins(total) + '</span></div>' +
    '<ol class="t-plan">' + ST.map(s => '<li><span>' + esc(s[0]) + '</span><span>' + mins(s[1]) + '</span></li>').join('') + '</ol>' +
    '<button type="button" class="btn teal wide" data-act="l-start" data-mode="' + mode + '">' + modeName(mode) + ' 시작</button></div>';
}
function cellsHTML(g){
  if(!g.inquiry) return '';
  const st = sortSteps(g.steps || []), by = k => st.filter(s => s.kind === k), fd = by('find');
  return [['예상', by('predict')], ['알아볼 방법', by('method')], ['찾기 ①', fd.slice(0, 1)], ['찾기 ②', fd.slice(1, 2)], ['두 출처 비교', by('compare')],
    ['정리', by('wrap')], ['내 칸', by('used')], ['옆 모둠 설명', by('tell')], ['들은 것', by('heard')]]
    .filter(c => c[1].length).map(c => {
      const n = c[1].length, done = c[1].filter(s => s.done_at).length;
      return '<span class="t-cell' + (done === n ? ' on' : done ? ' part' : '') + '">' + (done === n ? '✓ ' : '') + c[0] + (n > 1 ? ' ' + done + '/' + n : '') + '</span>';
    }).join('');
}
const gName = g => g.group.name || g.group.group_no + '모둠';
function gStatus(inq){
  if(!inq) return '';
  if(inq.status === 'wait') return '<span class="tag wait">선생님께 보냄</span>';
  if(inq.status === 'fruit') return '<span class="tag fruit">🍎 모둠 열매</span>';
  if(inq.status === 'returned') return '<span class="tag tch">되돌림</span>';
  return '<span class="st no">쓰는 중</span>';
}
function progressHTML(){
  if(!T.groups) return '<div class="card empty">모둠을 불러오는 중이에요.</div>';
  if(!T.groups.length) return '<div class="card empty">이 반에는 모둠이 없어요. 모둠 구역에서 편성해 주세요.</div>';
  return '<div class="card t-prog">' + T.groups.map(g => '<div class="t-pr"><div class="t-prn">' + esc(gName(g)) + '</div><div class="t-prb"><div class="t-prq">' +
    (g.inquiry ? esc(g.inquiry.question_text) : '<span class="t-empty">질문 고르는 중</span>') + ' ' + gStatus(g.inquiry) + '</div><div class="t-cells">' + cellsHTML(g) + '</div></div></div>').join('') + '</div>';
}
function clueLine(c, pickable){
  const on = T.pick.indexOf(c.id) >= 0;
  const inner = '<span class="tag clue">' + esc(kindName(c.kind)) + '</span> <span class="t-cbody">' + esc(c.body) + '</span><small>' + esc(c.question_text || '') + '</small>';
  return pickable ? '<button type="button" class="t-opt t-chk' + (on ? ' on' : '') + '" data-act="l-pick" data-id="' + c.id + '" aria-pressed="' + on + '"><i aria-hidden="true"></i><span>' + inner + '</span></button>'
    : '<div class="t-cl">' + inner + '</div>';
}
function cluePanel(L, st){
  const sent = sessionClues(L);
  let h = '<div class="t-sentline">지금까지 보낸 단서 ' + sent.length + '개</div>';
  if(st === 0){
    const dq = demoQ();
    h += '<div class="sec">칠판에 띄울 막힌 질문</div>';
    if(!T.stuck) h += '<div class="card empty">막힌 질문을 불러오는 중이에요.</div>';
    else if(!T.stuck.length) h += '<div class="card empty">막힘 표시가 선 질문이 아직 없어요.</div>';
    else h += '<div class="card t-opts">' + T.stuck.slice(0, 8).map(q => '<button type="button" class="t-opt' + (dq && dq.id === q.id ? ' on' : '') + '" data-act="l-demo" data-q="' + q.id +
      '" aria-pressed="' + !!(dq && dq.id === q.id) + '"><i aria-hidden="true"></i><span><b>' + esc(q.body) + '</b><small>' + (q.is_anonymous ? '익명 질문 · ' : '') + esc(J.stepName(q.flag_step)) + '에서 막힘' +
      (q.flag_tried ? ' · ' + esc(q.flag_tried) : '') + '</small></span></button>').join('') + '</div>';
    h += '<div class="sec">나란히 보여 줄 두 말</div><div class="card t-exform">' +
      '<label class="fld">정답을 알려 주면<input class="inp" id="t_exNo" data-bind="exNo" maxlength="60" autocomplete="off" value="' + esc(T.ex.no) + '" placeholder="예) 전지는 +극과 -극이 정해져 있어서 그래"></label>' +
      '<label class="fld">찾아갈 길을 알려 주면<input class="inp" id="t_exYes" data-bind="exYes" maxlength="80" autocomplete="off" value="' + esc(T.ex.yes) + '" placeholder="예) 교과서 전지 그림에서 극 표시를 찾아봐"></label>' +
      '<div class="hint">비워 두면 칠판에 단서 종류 넷의 시작 문장이 나와요.</div></div>';
  } else if(st === 2 && sent.length){
    const by = new Map();
    sent.forEach(c => { const k = c.question_id; if(!by.has(k)) by.set(k, {t:c.question_text, n:0}); by.get(k).n++; });
    h += '<div class="card t-counts">' + Array.from(by.values()).map(x => '<div class="t-cl"><span class="t-cbody">' + esc(x.t) + '</span><b class="t-cn">' + x.n + '개</b></div>').join('') + '</div>';
  } else if(st === 3){
    h += '<div class="sec">칠판에 띄울 단서</div>';
    h += sent.length ? '<div class="card t-opts">' + sent.map(c => clueLine(c, true)).join('') + '</div><div class="hint t-pad">고르지 않으면 가장 최근 단서 세 개가 칠판에 나와요.</div>'
      : '<div class="card empty">이번 단서 시간에 온 단서가 아직 없어요.</div>';
  }
  return h;
}
function renderLive(root){
  ensure();
  if(!S.cls){ root.innerHTML = '<div class="empty">학생이 있는 반이 없어요.</div>'; return; }
  const L = T.live;
  let h = '';
  if(!L){
    if(T.ended) h += '<div class="card t-ended"><b>' + (T.ended.mode === 'clue' ? '단서 시간이 끝났어요 · 보낸 단서 ' + T.ended.sent + '개' : '모둠 진행을 끝냈어요') + '</b></div>';
    if(T.staleLive) h += '<div class="card t-stale"><div><b>지난 ' + esc(modeName(T.staleLive.mode)) + '이 켜져 있어요</b><div class="hint">' + esc(ui.fmtTime(T.staleLive.created_at)) +
      '에 시작한 진행이에요. 학생 화면에는 보이지 않아요.</div></div><button type="button" class="btn line sm" data-act="l-stop-stale">끝내기</button></div>';
    root.innerHTML = h + '<div class="cols t-modes">' + modeCard('clue') + modeCard('group') + '</div>' + worldCard() + demoBox();
    return;
  }
  const ST = stagesOf(L), st = Math.max(0, Math.min(L.stage || 0, ST.length - 1)), last = st >= ST.length - 1, left = QO.live.left(L);
  h += '<div class="stage t-stage"><div class="h"><b>' + modeName(L.mode) + '</b><span class="time' + (left <= 0 ? ' t-over' : '') + '" data-tleft>' + ui.clock(left) + '</span></div>' +
    '<ol>' + ST.map((s, i) => '<li class="' + (i === st ? 'on' : i < st ? 'done' : '') + '"><button type="button" data-act="l-go" data-st="' + i + '"' + (i === st ? ' aria-current="step"' : '') + '>' +
      esc(s[0]) + '<small>' + mins(s[1]) + '</small></button></li>').join('') + '</ol>' +
    '<div class="now">학생 화면 · ' + esc(L.mode === 'clue' ? ST[st][2] : '지금: ' + ST[st][0] + ' — ' + mins(ST[st][1])) + '</div></div>';
  h += '<div class="t-ctl"><button type="button" class="btn teal" data-act="l-next">' + (last ? '끝내기' : '다음 단계 · ' + esc(ST[st + 1][0])) + '</button>' +
    '<button type="button" class="btn line" data-act="l-board">칠판 화면</button>' + (last ? '' : '<button type="button" class="btn line" data-act="l-stop">끝내기</button>') + '</div>';
  if(L.teacher_id != null && S.teacher && L.teacher_id !== S.teacher.id) h += '<div class="hint t-pad">다른 선생님이 시작한 진행이에요.</div>';
  h += L.mode === 'clue' ? cluePanel(L, st) : '<div class="sec">모둠별 진행</div>' + progressHTML();
  root.innerHTML = h + worldCard() + demoBox();
}

/* ═══════════ 함께 걷기 — 우리 반 숲에서 같은 반 친구가 서로 보이게(v2_04) ═══════════ */
const WORLD = {key:null, st:null, err:'', at:0};
const worldKey = () => S.cls ? G() + '-' + C() : null;
async function loadWorld(force){
  const k = worldKey(); if(!k) return;
  if(!force && WORLD.key === k && Date.now() - WORLD.at < 15000) return;
  WORLD.key = k; WORLD.at = Date.now();
  try{ WORLD.st = await QO.api.worldStatus(G(), C()); WORLD.err = ''; }
  catch(e){
    WORLD.st = null;
    WORLD.err = /teacher_world|function|schema cache|PGRST202/i.test(String((e && e.message) || e)) ? 'soon' : (ui.userMsg(e) || '함께 걷기 상태를 불러오지 못했어요.');
  }
  if(worldKey() === k) soft('live');
}
function worldCard(){
  const k = worldKey(); if(!k || !QO.api.worldStatus) return '';
  if(WORLD.key !== k){ loadWorld(true); return '<div class="card t-world"><div><b>함께 걷기</b><div class="hint">불러오는 중이에요…</div></div></div>'; }
  if(WORLD.err === 'soon') return '<div class="card t-world"><div><b>함께 걷기</b><div class="hint">v2_04 SQL 을 실행하면 쓸 수 있어요. 그 전에는 학생들이 우리 반 숲을 혼자 걸어요.</div></div></div>';
  if(WORLD.err) return '<div class="card t-world"><div><b>함께 걷기</b><div class="err">' + esc(WORLD.err) + '</div></div><button type="button" class="btn line sm" data-act="w-reload">다시 읽기</button></div>';
  const st = WORLD.st || {};
  if(st.open) return '<div class="card t-world on"><div><b>함께 걷기 · 열려 있어요</b><div class="hint">' + esc(ui.kstHM(st.until)) + '까지 · 지금 숲에 ' + (+st.people || 0) + '명</div></div>' +
    '<div class="t-wbtn"><button type="button" class="btn line sm" data-act="w-more">10분 더</button><button type="button" class="btn line sm" data-act="w-close">닫기</button></div></div>';
  return '<div class="card t-world"><div><b>함께 걷기 · 닫혀 있어요</b><div class="hint">열면 이 반 학생들이 「우리 반 숲」에서 서로 보이고, 그림 반응과 정해진 말풍선을 주고받아요.</div></div>' +
    '<div class="t-wbtn"><button type="button" class="btn teal sm" data-act="w-open" data-min="20">20분 열기</button><button type="button" class="btn line sm" data-act="w-open" data-min="45">45분 열기</button></div></div>';
}
const worldSet = r => { WORLD.st = r; WORLD.err = ''; WORLD.at = Date.now(); QO.tabs.rerender('live'); };
ACT['w-open'] = async b => { const r = await act(b, () => QO.api.worldOpen(G(), C(), Number(b.dataset.min) || 45)); if(r !== undefined){ worldSet(r); ui.toast('함께 걷기를 열었어요'); } };
ACT['w-more'] = async b => {
  const left = WORLD.st && WORLD.st.until ? Math.max(0, Math.ceil((Date.parse(WORLD.st.until) - Date.now()) / 60000)) : 0;
  const r = await act(b, () => QO.api.worldOpen(G(), C(), Math.min(120, left + 10))); if(r !== undefined) worldSet(r);
};
ACT['w-close'] = async b => { const r = await act(b, () => QO.api.worldClose(G(), C())); if(r !== undefined){ worldSet(r); ui.toast('함께 걷기를 닫았어요'); } };
ACT['w-reload'] = () => loadWorld(true);
setInterval(() => { if(S.ready && S.teacher && S.cls && QO.tabs.current() === 'live' && document.visibilityState === 'visible') loadWorld(false); }, 5000);
async function goStage(b, stage){
  const L = T.live; if(!L) return;
  const max = stagesOf(L).length;
  if(stage >= max) return stopLive(b, true);
  stage = Math.max(0, stage);
  if(stage === L.stage) return;
  const row = await act(b, () => QO.api.liveSetStage(L.id, stage));
  if(row === undefined) return;
  setLive(row, true);
  if(row.mode === 'clue' && stage >= 2) loadToday();
  if(row.mode === 'group') loadGroups();
}
async function stopLive(b, atEnd){
  const L = T.live; if(!L) return;
  if(!atEnd && !(await ui.confirm(modeName(L.mode) + '을 끝낼까요?', {ok:'끝내기', cancel:'계속하기'}))) return;
  const r = await act(b, () => QO.api.liveStop(L.id));
  if(r === undefined) return;
  if(L.mode === 'clue') await loadToday();
  T.ended = {mode:L.mode, sent:sessionClues(L).length};
  setLive(null, true);
  QO.board.close();
}
ACT['l-start'] = async b => {
  if(!S.cls) return;
  const mode = b.dataset.mode;
  const row = await act(b, () => QO.api.liveStart(G(), C(), mode));
  if(row === undefined) return;
  T.ended = null;
  setLive(row, true);
};
ACT['l-stop-stale'] = async b => {
  const L = T.staleLive; if(!L) return;
  const r = await act(b, () => QO.api.liveStop(L.id));
  if(r === undefined) return;
  T.staleLive = null; QO.tabs.rerender('live');
  ui.toast('지난 진행을 끝냈어요');
};
ACT['l-next'] = b => T.live && goStage(b, (T.live.stage || 0) + 1);
ACT['l-go'] = b => goStage(b, Number(b.dataset.st));
ACT['l-stop'] = b => stopLive(b, false);
ACT['l-board'] = () => openBoard();
ACT['l-demo'] = b => { T.demoQ = Number(b.dataset.q); QO.tabs.rerender('live'); boardRefresh(); };
ACT['l-pick'] = b => {
  const id = Number(b.dataset.id), i = T.pick.indexOf(id);
  if(i >= 0) T.pick.splice(i, 1); else T.pick.push(id);
  QO.tabs.rerender('live'); boardRefresh();
};

/* ═══════════ 칠판 화면 — 실명 없음 ═══════════ */
const STARTERS = ['교과서 [  ]쪽 · 검색어 [  ]', '[  ] 보면 알 수 있을 것 같아요', '나는 [  ] 겪어 봤어요', '그럼 [  ]에는 어떨까요?'];
function strip(ST, st){ return '<ol class="t-bstrip">' + ST.map((s, i) => '<li class="' + (i === st ? 'on' : i < st ? 'done' : '') + '">' + esc(s[0]) + '</li>').join('') + '</ol>'; }
function clueGroups(list){
  const by = new Map();
  list.filter(c => !c.hidden_at).forEach(c => { const k = c.question_id; if(!by.has(k)) by.set(k, {t:c.question_text, items:[]}); by.get(k).items.push(c); });
  if(!by.size) return '<div class="t-bsay">아직 온 단서가 없어요.</div>';
  return '<div class="t-bgroups">' + Array.from(by.values()).map(g => '<div class="t-bg"><div class="t-bgq">' + esc(g.t) + '</div>' +
    g.items.map(c => '<div class="t-bgc"><span class="t-bk">' + esc(kindName(c.kind)) + '</span>' + esc(c.body) + '</div>').join('') + '</div>').join('') + '</div>';
}
function boardClue(L){
  const ST = K.LESSON_STAGES, st = Math.max(0, Math.min(L.stage || 0, ST.length - 1)), left = QO.live.left(L), sent = sessionClues(L);
  let h = strip(ST, st) + '<div class="t-bmain"><div class="t-bstage">' + esc(ST[st][0]) + '</div><div class="t-btime' + (left <= 0 ? ' t-over' : '') + '" data-tleft>' + ui.clock(left) + '</div></div>';
  if(st === 0){
    const q = demoQ();
    if(!T.stuck) h += '<div class="t-bsay">막힌 질문을 불러오는 중이에요.</div>';
    else if(q) h += '<div class="bq">' + esc(q.body) + '</div>' + (q.flag_tried ? '<div class="bt">여기까지 해 봤어요: ' + esc(q.flag_tried) + '</div>' : '');
    else h += '<div class="t-bsay">막힘 표시가 선 질문이 아직 없어요.</div>';
    h += '<div class="cmp"><div class="no"><b>정답을 알려 주면</b>' + (T.ex.no ? '「' + esc(T.ex.no) + '」' : '「답은 ○○이야」<span class="t-bnote">답을 바로 알려 주는 말</span>') + '</div>' +
      '<div class="yes"><b>찾아갈 길을 알려 주면</b>' + (T.ex.yes ? '「' + esc(T.ex.yes) + '」' : STARTERS.map(s => '<div>「' + esc(s) + '」</div>').join('')) + '</div></div>';
  } else if(st === 1){
    h += '<div class="t-bsay">' + esc(ST[1][2]) + '</div>';
  } else if(st === 2){
    h += '<div class="t-bbig"><b>' + sent.length + '</b><span>보낸 단서</span></div><div class="t-bsay">' + esc(ST[2][2]) + '</div>';
  } else {
    const picked = sent.filter(c => T.pick.indexOf(c.id) >= 0);
    h += clueGroups(picked.length ? picked : sent.slice(-3));
  }
  return h + '<div class="t-bfoot"><span class="cnt">지금까지 보낸 단서 ' + sent.length + '개 · 이름은 보이지 않아요</span>' +
    '<button type="button" class="btn soft sm" data-act="b-next">' + (st < ST.length - 1 ? '다음 단계' : '끝내기') + '</button></div>';
}
function boardGroup(L){
  const ST = K.GROUP_STAGES, st = Math.max(0, Math.min(L.stage || 0, ST.length - 1)), left = QO.live.left(L);
  let h = strip(ST, st) + '<div class="t-bmain"><div class="t-bstage">' + esc(ST[st][0]) + '</div><div class="t-btime' + (left <= 0 ? ' t-over' : '') + '" data-tleft>' + ui.clock(left) + '</div></div>';
  if(!T.groups) h += '<div class="t-bsay">모둠을 불러오는 중이에요.</div>';
  else if(!T.groups.length) h += '<div class="t-bsay">이 반에는 모둠이 없어요.</div>';
  else h += '<div class="t-bprog">' + T.groups.map(g => '<div class="t-bpr"><div class="t-bpn">' + esc(gName(g)) + '</div><div><div class="t-bpq">' +
    (g.inquiry ? esc(g.inquiry.question_text) : '질문 고르는 중') + (g.inquiry && g.inquiry.status === 'wait' ? ' · 선생님께 보냄' : g.inquiry && g.inquiry.status === 'fruit' ? ' · 🍎 모둠 열매' : '') +
    '</div><div class="t-cells">' + cellsHTML(g) + '</div></div></div>').join('') + '</div>';
  return h + '<div class="t-bfoot"><span class="cnt">이름은 보이지 않아요</span><button type="button" class="btn soft sm" data-act="b-next">' + (st < ST.length - 1 ? '다음 단계' : '끝내기') + '</button></div>';
}
function boardToday(){
  if(!T.today) return '<div class="t-bmain"><div class="t-bstage">오늘 우리 반 단서</div></div><div class="t-bsay">단서를 불러오는 중이에요.</div>';
  return '<div class="t-bmain"><div class="t-bstage">오늘 우리 반 단서</div></div>' + clueGroups(T.today) + '<div class="t-bfoot"><span class="cnt">이름은 보이지 않아요</span></div>';
}
function renderBoard(el){
  el = el || QO.board.el(); if(!el) return;
  ensure();
  const L = T.live;
  let h = '<div class="bh"><span>칠판 화면 · ' + esc(clsName()) + '</span>' + (L ? '<span class="t-bnow">' + esc(modeName(L.mode)) + '</span>' : '') +
    '<button type="button" class="btn soft sm t-bclose" data-board-close>닫기</button></div>';
  if(!S.cls) h += '<div class="t-bsay">학생이 있는 반이 없어요.</div>';
  else if(!L) h += boardToday();
  else h += L.mode === 'group' ? boardGroup(L) : boardClue(L);
  el.innerHTML = h;
}
function boardRefresh(){ if(QO.board.isOpen()) renderBoard(QO.board.el()); }
function boardLoads(){
  if(!S.cls || !S.teacher) return;
  loadLive();
  const L = T.live;
  if(!L || L.mode === 'clue'){ loadToday(); if(!T.stuck) loadStuck(); }
  if(L && L.mode === 'group') loadGroups();
}
QO.board.render = el => { renderBoard(el); boardLoads(); };
function openBoard(){ QO.board.open(''); QO.board.render(QO.board.el()); }

/* ═══════════ 모둠 ═══════════ */
function stepRows(g){
  const out = [];
  sortSteps(g.steps || []).forEach(s => {
    if(s.kind === 'predict' || s.kind === 'used'){ let r = out.find(x => x.kind === s.kind); if(!r){ r = {kind:s.kind, name:s.name, items:[]}; out.push(r); } r.items.push(s); }
    else out.push({kind:s.kind, name:s.name, items:[s]});
  });
  return out;
}
/* 모둠 열매 기준(confirm_group 과 같다): 예상 말고 맡은 칸 하나 이상 + 「내 칸이 정리 어디에」 */
function fruitCheck(g){
  const st = g.steps || [];
  return g.members.map(m => {
    const core = st.some(s => s.assignee_id === m.user_id && ['method', 'find', 'compare', 'wrap', 'extra'].indexOf(s.kind) >= 0 && s.done_at);
    const used = st.some(s => s.assignee_id === m.user_id && s.kind === 'used' && s.done_at);
    return {m, core, used, ok:core && used};
  });
}
function memberName(g, id){ const m = g.members.find(x => x.user_id === id); if(m) return m.name; const s = byId().get(id); return s ? s.name : ''; }
function groupCardHTML(g){
  const inq = g.inquiry, mem = g.members;
  let h = '<div class="card t-gcard" data-g="' + g.group.id + '"><div class="t-gh"><b>' + esc(gName(g)) + '</b>' + gStatus(inq) + '</div><div class="hint">' +
    (mem.length ? mem.map(m => esc(m.name) + ' ' + m.number).join(' · ') : '모둠원이 없어요') + '</div>';
  if(!inq) return h + '<div class="t-gnone">아직 함께 푸는 질문이 없어요.</div></div>';
  h += '<div class="t-gq">' + esc(inq.question_text) + '</div>' + (inq.why ? '<div class="hint">고른 까닭 · ' + esc(inq.why) + '</div>' : '');
  h += '<div class="t-gsteps">' + stepRows(g).map((r, i) => {
    const key = inq.id + ':' + i, open = !!T.gOpen[key], n = r.items.length, done = r.items.filter(s => s.done_at).length;
    const names = r.items.map(s => { const nm = s.assignee_id ? memberName(g, s.assignee_id) : ''; return (nm ? esc(nm) : '—') + (n > 1 && s.done_at ? ' ✓' : ''); }).join(' · ');
    const one = n === 1 ? (r.items[0].assignee_id ? memberName(g, r.items[0].assignee_id) : '') : '';
    const av = n > 1 ? {bg:'#EEF0EA', fg:'#4E5A51', ch:String(n)} : one ? ui.avatar(one, (mem.find(m => m.user_id === r.items[0].assignee_id) || {}).number) : {bg:'#EEF0EA', fg:'#4E5A51', ch:'–'};
    const state = done === n ? '<span class="st ok">했어요</span>' : done ? '<span class="st no">' + done + '/' + n + '</span>' : '<span class="st no">비어 있어요</span>';
    let b = '';
    if(open) b = '<div class="grow-b">' + r.items.map(s => '<div class="t-gi">' + (n > 1 || r.kind === 'heard' ? '<b>' + esc(s.assignee_id ? memberName(g, s.assignee_id) || '—' : '—') + '</b> ' : '') +
      (s.done_at ? esc(s.body || '') + (s.src ? ' <span class="hint">(출처 · ' + esc(s.src) + ')</span>' : '') : '<span class="t-empty">아직 비어 있어요</span>') + '</div>').join('') + '</div>';
    return '<div class="grow"><button type="button" class="grow-h" data-act="g-step" data-k="' + key + '" aria-expanded="' + open + '"><div class="av" style="background:' + av.bg + ';color:' + av.fg + '">' + esc(av.ch) + '</div>' +
      '<div class="nm">' + esc(r.name) + '<small>' + (names || '—') + '</small></div>' + state + '</button>' + b + '</div>';
  }).join('') + '</div>';
  const chk = fruitCheck(g), oks = chk.filter(x => x.ok);
  if(inq.status === 'wait'){
    const nos = chk.filter(x => !x.ok);
    h += '<div class="t-fp"><div><b>열매 받을 사람</b> ' + (oks.length ? oks.map(x => esc(x.m.name)).join(' · ') : '아직 없어요') + '</div>' +
      (nos.length ? '<div class="hint">아직 아닌 사람 · ' + nos.map(x => esc(x.m.name) + '(' + (!x.core ? '맡은 칸' : '「내 칸이 정리 어디에」') + ' 없음)').join(' · ') + '</div>' : '') +
      '<div class="hint">예상 말고 맡은 칸 하나 이상과 「내 칸이 정리 어디에」 한 줄을 쓴 사람이 열매를 받아요.</div></div>' +
      '<div class="t-acts"><button type="button" class="btn t-fruit" data-act="g-ok" data-inq="' + inq.id + '" data-n="' + oks.length + '">🍎 모둠 열매</button>' +
      '<button type="button" class="btn line" data-act="g-ret" data-inq="' + inq.id + '" aria-expanded="' + !!(T.gRet && T.gRet.inq === inq.id) + '">되돌리기</button></div>';
    if(T.gRet && T.gRet.inq === inq.id) h += '<div class="t-ret"><label class="lbl" for="t_gRetNote">모둠에게 한 줄</label><input class="inp" id="t_gRetNote" data-bind="gRetNote" maxlength="120" autocomplete="off" value="' + esc(T.gRet.note) +
      '" placeholder="예) 두 출처 중 더 믿을 만한 쪽과 그 까닭을 적어 볼까요?"><div class="err" id="t_gRetErr" role="alert"></div><div class="row"><button type="button" class="btn line sm" data-act="g-ret-cancel">그만두기</button>' +
      '<button type="button" class="btn sm t-grow1" data-act="g-ret-send" data-inq="' + inq.id + '">되돌려 보내기</button></div></div>';
  } else if(inq.status === 'returned'){
    h += '<div class="t-note">되돌린 글 · ' + esc(inq.teacher_note || '') + '</div>';
  } else if(inq.status === 'fruit'){
    h += '<div class="statusbar fruit">칸을 맡아 채운 ' + oks.length + '명의 나무에 열매가 열렸어요.</div>';
  }
  return h + '</div>';
}
function draft(){
  if(T.gDraft) return T.gDraft;
  const rws = {}; let maxNo = 0;
  (T.groups || []).forEach(g => { rws[g.group.group_no] = g.members.map(m => m.number).filter(n => n != null).sort((a, b) => a - b).join(', '); maxNo = Math.max(maxNo, g.group.group_no); });
  T.gDraft = {n:Math.min(10, Math.max(7, maxNo)), rows:rws};
  return T.gDraft;
}
function parseNums(v){
  const nums = [], bad = [];
  String(v || '').split(/[\s,，、·./]+/).filter(Boolean).forEach(x => { if(/^\d{1,2}$/.test(x)) nums.push(Number(x)); else bad.push(x); });
  return {nums, bad};
}
function namesFor(v){
  const by = byNum(), p = parseNums(v);
  return p.nums.map(n => by.has(n) ? esc(by.get(n).name) : '<span class="bad">' + n + '번 없음</span>').concat(p.bad.map(x => '<span class="bad">「' + esc(x) + '」</span>')).join(' · ');
}
function leftoverHTML(){
  const D = draft(), used = new Set();
  for(let i = 1; i <= D.n; i++) parseNums(D.rows[i]).nums.forEach(n => used.add(n));
  const left = (T.students || []).filter(s => !used.has(s.number));
  return left.length ? '모둠이 없는 학생 · ' + left.map(s => s.number + '번 ' + esc(s.name)).join(' · ') : '모든 학생이 모둠에 들어 있어요.';
}
function formHTML(){
  if(!T.students) return '<div class="card empty">학생 명단을 불러오는 중이에요.</div>';
  const D = draft();
  let h = '<div class="card t-gform"><div class="row t-gn"><label class="lbl" for="t_gN">모둠 수</label><select id="t_gN" data-bind="gN">';
  for(let i = 3; i <= 10; i++) h += '<option value="' + i + '"' + (i === D.n ? ' selected' : '') + '>' + i + '</option>';
  h += '</select><span class="hint">번호를 쉼표로 띄워 적어요</span></div><div class="t-grows">';
  for(let i = 1; i <= D.n; i++){
    const v = D.rows[i] || '';
    h += '<div class="t-grow"><label class="t-gno" for="t_g' + i + '">' + i + '모둠</label><div><input class="inp" id="t_g' + i + '" data-bind="g' + i + '" inputmode="numeric" autocomplete="off" value="' + esc(v) +
      '" placeholder="예) 1, 8, 15, 22"><div class="t-gnames" id="t_gn' + i + '">' + namesFor(v) + '</div></div></div>';
  }
  return h + '</div><div class="hint t-gleft" id="t_gleft">' + leftoverHTML() + '</div><div class="err" id="t_gErr" role="alert"></div><button type="button" class="btn wide" data-act="g-save">모둠 저장</button></div>';
}
function renderGroups(root){
  ensure();
  if(!S.cls){ root.innerHTML = '<div class="empty">학생이 있는 반이 없어요.</div>'; return; }
  const gs = T.groups;
  if(!gs){ root.innerHTML = '<div class="empty">모둠을 불러오는 중이에요.</div>'; return; }
  if(!T.students && !T.reqs.students) loadStudents();
  const waiting = gs.filter(g => g.inquiry && g.inquiry.status === 'wait').length;
  let h = '<div class="t-bar"><span class="t-count">모둠 ' + gs.length + '개' + (waiting ? ' · 선생님께 보낸 모둠 ' + waiting + '개' : '') + '</span>' +
    '<button type="button" class="link" data-act="g-reload">새로 읽기</button></div>';
  const emptyN = gs.filter(g => !g.members.length).length;
  if(emptyN) h += '<div class="rule t-gempty">모둠원이 없는 모둠이 ' + emptyN + '개 남아 있어요. 반 숲의 관측소는 모든 모둠이 정리까지 가야 열려서, 빈 모둠이 있으면 열리지 않아요.</div>';
  if(gs.length) h += '<div class="t-ggrid">' + gs.map(groupCardHTML).join('') + '</div>';
  else h += '<div class="card empty">아직 모둠이 없어요. 아래에 번호를 넣어 편성해 주세요.</div>';
  const open = T.gFold != null ? T.gFold : !gs.length;
  h += '<button type="button" class="fold t-fold" data-act="g-fold" aria-expanded="' + open + '"><span>' + (gs.length ? '모둠 편성 고치기' : '모둠 편성') + '</span><small>' + (open ? '접기' : '펼치기') + '</small></button>';
  if(open) h += formHTML();
  root.innerHTML = h + demoBox();
}
ACT['g-reload'] = () => { T.groups = null; T.gDraft = null; QO.tabs.rerender('groups'); loadGroups(); loadStudents(); };
ACT['g-step'] = b => { const k = b.dataset.k; T.gOpen[k] = !T.gOpen[k]; QO.tabs.rerender('groups'); };
ACT['g-fold'] = () => { const gs = T.groups || []; const open = T.gFold != null ? T.gFold : !gs.length; T.gFold = !open; if(T.gFold) T.gDraft = null; QO.tabs.rerender('groups'); };
ACT['g-save'] = async b => {
  const D = draft(), err = $('#t_gErr'); if(err) err.textContent = '';
  const say = m => { if(err) err.textContent = m; };
  for(let i = 1; i <= D.n; i++){ const el = $('#t_g' + i); if(el) D.rows[i] = el.value; }
  const by = byNum(), seen = new Map(), out = [];
  for(let i = 1; i <= D.n; i++){
    const p = parseNums(D.rows[i]);
    if(p.bad.length) return say(i + '모둠 칸에는 번호와 쉼표만 적어 주세요.');
    for(const n of p.nums){
      if(!by.has(n)) return say(n + '번 학생이 없어요.');
      if(seen.has(n) && seen.get(n) !== i) return say(n + '번이 ' + seen.get(n) + '모둠과 ' + i + '모둠에 함께 들어 있어요.');
      seen.set(n, i);
    }
    const nums = Array.from(new Set(p.nums)).sort((a, x) => a - x), ex = (T.groups || []).find(g => g.group.group_no === i);
    if(nums.length || ex) out.push({group_no:i, name:ex && ex.group.name ? ex.group.name : i + '모둠', numbers:nums});
  }
  (T.groups || []).forEach(g => { if(g.group.group_no > D.n) out.push({group_no:g.group.group_no, name:gName(g), numbers:[]}); });
  if(!out.some(r => r.numbers.length)) return say('번호를 하나 넘게 적어 주세요.');
  const moved = (T.groups || []).filter(g => {
    if(!g.inquiry || g.inquiry.status === 'fruit') return false;
    const r = out.find(x => x.group_no === g.group.group_no);
    return (r ? r.numbers : []).join(',') !== g.members.map(m => m.number).sort((a, x) => a - x).join(',');
  });
  if(moved.length && !(await ui.confirm(moved.map(gName).join(', ') + '에 함께 푸는 질문이 있어요. 모둠원을 바꿔도 이미 맡은 칸은 그대로예요. 저장할까요?', {ok:'저장', cancel:'그대로'}))) return;
  const n = await act(b, () => QO.api.setGroups(G(), C(), out), {errEl:err});
  if(n === undefined) return;
  ui.toast('모둠 ' + n + '개를 저장했어요');
  T.gDraft = null; T.gFold = false;
  QO.tabs.rerender('groups'); loadGroups();
};
ACT['g-ok'] = async b => {
  const inq = Number(b.dataset.inq);
  if(Number(b.dataset.n) === 0 && !(await ui.confirm('아직 열매 받을 사람이 없어요. 그래도 확인할까요?', {ok:'확인', cancel:'그대로'}))) return;
  const n = await act(b, () => QO.api.confirmGroup(inq));
  if(n === undefined) return;
  ui.toast(n > 0 ? '칸을 맡아 채운 ' + n + '명의 나무에 열매가 열렸어요' : '모둠 질문을 확인했어요. 열매 받은 사람은 없어요');
  T.gRet = null; QO.tabs.rerender('groups'); loadGroups();
};
ACT['g-ret'] = b => { const inq = Number(b.dataset.inq); T.gRet = T.gRet && T.gRet.inq === inq ? null : {inq, note:''}; QO.tabs.rerender('groups'); const i = $('#t_gRetNote'); if(i) i.focus(); };
ACT['g-ret-cancel'] = () => { T.gRet = null; QO.tabs.rerender('groups'); };
ACT['g-ret-send'] = async b => {
  const R = T.gRet, err = $('#t_gRetErr'); if(!R) return;
  const inp = $('#t_gRetNote'), note = String(inp ? inp.value : R.note || '').trim();
  if(err) err.textContent = '';
  if(note.length < 4){ if(err) err.textContent = '모둠에게 보낼 한 줄을 적어 주세요.'; if(inp) inp.focus(); return; }
  const r = await act(b, () => QO.api.returnGroup(R.inq, note), {errEl:err});
  if(r === undefined) return;
  ui.toast(r ? '모둠 일지를 되돌려 보냈어요' : '이미 확인했거나 아직 보내지 않은 모둠이에요');
  T.gRet = null; QO.tabs.rerender('groups'); loadGroups();
};

/* ═══════════ 단서 살피기 ═══════════ */
function renderClues(root){
  ensure();
  if(!S.cls){ root.innerHTML = '<div class="empty">학생이 있는 반이 없어요.</div>'; return; }
  const today = ui.kstToday(), day = T.day || today;
  if((!T.clues || T.clues.day !== day) && T.cluesWant !== day){ T.cluesWant = day; loadClues(day); }
  if(!T.students && !T.reqs.students) loadStudents();
  let h = '<div class="t-dayrow"><button type="button" class="btn line sm t-arrow" data-act="c-day" data-d="-1" aria-label="하루 전">‹</button>' +
    '<input type="date" class="inp t-day" id="t_day" data-bind="day" value="' + day + '" max="' + today + '" aria-label="날짜">' +
    '<button type="button" class="btn line sm t-arrow" data-act="c-day" data-d="1" aria-label="하루 뒤"' + (day >= today ? ' disabled' : '') + '>›</button>' +
    (day !== today ? '<button type="button" class="link" data-act="c-today">오늘로</button>' : '') + '</div>';
  if(!T.clues || T.clues.day !== day){ root.innerHTML = h + '<div class="empty">단서를 불러오는 중이에요.</div>'; return; }
  const list = T.clues.rows, hid = list.filter(c => c.hidden_at).length;
  h += '<div class="t-bar"><span class="t-count">단서 ' + list.length + '개' + (hid ? ' · 숨긴 단서 ' + hid + '개' : '') + '</span></div>';
  if(!list.length){ root.innerHTML = h + '<div class="card empty">이날 온 단서가 없어요.</div>' + demoBox(); return; }
  h += '<div class="t-clist">' + list.slice().reverse().map(c => {
    const author = c.by_teacher ? '선생님(숲 방문)' : c.author_name ? c.author_name + '(' + c.author_number + '번)' : '보낸 사람 모름';
    const ownerName = c.owner_name ? c.owner_name + '(' + c.owner_number + '번)' : '주인 모름';
    const owner = c.question_anonymous && !T.showOwner[c.id] ? '익명 질문 주인' : ownerName;
    return '<div class="card t-clue' + (c.hidden_at ? ' t-hid' : '') + '"><div class="t-ch"><span class="tag clue">' + esc(kindName(c.kind)) + '</span><span class="t-cs">' + esc(J.stepName(c.step)) + ' 칸</span>' +
      '<span class="t-at">' + esc(ui.kstHM(c.created_at)) + '</span></div><div class="t-cb">' + esc(c.body) + '</div>' +
      '<div class="hint">' + esc(author) + ' → ' + esc(owner) + '의 질문 「' + esc(c.question_text || '') + '」' + (c.question_anonymous ? ' · 익명 질문' : '') +
      (c.question_anonymous ? ' <button type="button" class="link t-owner" data-act="c-owner" data-id="' + c.id + '" aria-pressed="' + !!T.showOwner[c.id] + '">' + (T.showOwner[c.id] ? '주인 가리기' : '주인 보기') + '</button>' : '') + '</div>' +
      (c.thanked_at ? '<div class="t-thx">🌸 고마움 「' + esc(c.thanks_text || '') + '」</div>' : c.declined_at ? '<div class="hint">주인이 「아니요」를 골랐어요.</div>' : '') +
      '<div class="t-cact">' + (c.hidden_at ? '<span class="t-hidtag">숨긴 단서</span>' : '') + '<button type="button" class="btn line sm" data-act="c-hide" data-id="' + c.id + '" data-h="' + (c.hidden_at ? 0 : 1) + '">' +
      (c.hidden_at ? '다시 보이기' : '숨기기') + '</button></div></div>';
  }).join('') + '</div>';
  root.innerHTML = h + demoBox();
}
function setDay(d){
  const today = ui.kstToday();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
  T.day = d > today ? today : d; T.clues = null; T.cluesWant = null;
  QO.tabs.rerender('clues');
}
ACT['c-day'] = b => setDay(ui.addDays(T.day || ui.kstToday(), Number(b.dataset.d)));
ACT['c-owner'] = b => { const id = Number(b.dataset.id); T.showOwner[id] = !T.showOwner[id]; QO.tabs.rerender('clues'); };
ACT['c-today'] = () => setDay(ui.kstToday());
ACT['c-hide'] = async b => {
  const id = Number(b.dataset.id), hide = b.dataset.h === '1';
  const r = await act(b, () => QO.api.hideClue(id, hide));
  if(r === undefined) return;
  const at = hide ? new Date().toISOString() : null;
  [T.clues && T.clues.rows, T.today].forEach(a => (a || []).forEach(c => { if(c.id === id) c.hidden_at = at; }));
  ui.toast(hide ? '단서를 숨겼어요. 학생 화면에서 보이지 않아요' : '단서를 다시 보이게 했어요');
  QO.tabs.rerender('clues'); boardRefresh();
};

/* ═══════════ 책 보며 심기(학생 read.js 로 심은 질문) ═══════════
   학생이 종이 책·읽기자료를 읽다 고른 곳(갸우뚱 · 중요해 보임 · 모르는 낱말)을 반 단위로 모아 본다.
   본문은 앱에 없으므로 「어디」는 자료 이름 + 쪽/문단 + 그 부분의 낱말로 묶는다. */
const RD_KIND = {1:'갸우뚱', 2:'중요해 보임', 3:'모르는 낱말'};
function loadReading(){ return load('reading', () => QO.api.classReading(G(), C()), r => { T.reading = r; soft('read'); }); }
const rdOf = q => (q && q.journal && q.journal.read) || {};
const rdSrcKey = r => r.src === 'mat' ? 'm' + r.mat_id : r.src === 'etc' ? 'e:' + (r.mat || '') : 'book';
const rdSrcName = r => r.src === 'book' ? '교과서' : (r.mat || '읽은 글');
const rdLocW = r => r.unit === 'para' ? '문단' : '쪽';
const rdNorm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const rdWho = q => q.is_anonymous ? '익명' : (q.student && q.student.number ? q.student.number + '번 ' : '') + ((q.student && q.student.name) || '');
function renderRead(root){
  ensure();
  if(!S.cls){ root.innerHTML = '<div class="empty">학생이 있는 반이 없어요.</div>'; return; }
  if(!T.reading && !T.reqs.reading) loadReading();
  if(!T.reading){ root.innerHTML = '<div class="empty">책 보며 심은 질문을 불러오는 중이에요.</div>'; return; }
  const per = T.rdPer || 'week', today = ui.kstToday();
  const since = per === 'today' ? ui.dayStartISO(today) : per === 'week' ? ui.dayStartISO(ui.addDays(today, -6)) : null;
  let list = T.reading.filter(q => !since || String(q.created_at) >= since);
  const srcs = new Map();
  list.forEach(q => { const r = rdOf(q), k = rdSrcKey(r); if(!srcs.has(k)) srcs.set(k, {k:k, name:rdSrcName(r), n:0}); srcs.get(k).n++; });
  const sel = T.rdSrc && srcs.has(T.rdSrc) ? T.rdSrc : '';
  if(sel) list = list.filter(q => rdSrcKey(rdOf(q)) === sel);
  const chip = (act, v, on, label) => '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
  let h = '<div class="t-rd-head"><div class="chips" role="group" aria-label="기간">' +
    chip('rd-per', 'today', per === 'today', '오늘') + chip('rd-per', 'week', per === 'week', '이번 주') + chip('rd-per', 'all', per === 'all', '전체') +
    '<button type="button" class="link" data-act="rd-reload">새로 읽기</button></div>';
  if(srcs.size > 1) h += '<div class="chips t-rd-srcs" role="group" aria-label="읽은 것">' + chip('rd-src', '', !sel, '모두') +
    Array.from(srcs.values()).map(s => chip('rd-src', s.k, sel === s.k, s.name + ' ' + s.n)).join('') + '</div>';
  h += '</div>';
  if(!list.length){ root.innerHTML = h + '<div class="card empty">이 기간에 책 보며 심은 질문이 없어요. 읽기자료는 옛 대시보드 「수업 자료」에서 「읽기자료」로 올리면 학생 목록에 떠요.</div>'; return; }
  /* 많이 고른 곳 — 자료 + 위치 + 낱말로 묶기 */
  const grp = new Map();
  list.forEach(q => {
    const r = rdOf(q), w = rdNorm(r.word), key = rdSrcKey(r) + '|' + (w ? '' : String(r.loc || '')) + '|' + w;
    if(!grp.has(key)) grp.set(key, {label:r.word || (r.loc ? r.loc + rdLocW(r) : '위치 없음'), src:rdSrcName(r), n:0, k:{1:0, 2:0, 3:0}, locs:new Set()});
    const g = grp.get(key); g.n++; g.k[Number(r.kind)] = (g.k[Number(r.kind)] || 0) + 1; if(r.loc) g.locs.add(r.loc + rdLocW(r));
  });
  const top = Array.from(grp.values()).sort((a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label))).slice(0, 12);
  const max = Math.max.apply(null, top.map(g => g.n).concat([1]));
  h += '<div class="sec">많이 고른 곳 <span class="n">질문 ' + list.length + '개</span></div><div class="card t-rd-bars">' + top.map(g => {
    const seg = [1, 2, 3].filter(k => g.k[k]).map(k => '<i class="k' + k + '" style="width:' + (g.k[k] / max * 100).toFixed(1) + '%" title="' + RD_KIND[k] + ' ' + g.k[k] + '"></i>').join('');
    const locs = Array.from(g.locs).join(', ');
    return '<div class="t-rd-bar"><span class="w"><b>' + esc(g.label) + '</b><small>' + esc(g.src + (locs ? ' · ' + locs : '')) + '</small></span><span class="g">' + seg + '</span><span class="n">' + g.n + '개</span></div>';
  }).join('') + '<div class="t-rd-legend"><span><i class="k1"></i>갸우뚱</span><span><i class="k2"></i>중요해 보임</span><span><i class="k3"></i>모르는 낱말</span></div></div>';
  /* 모르는 낱말 — 내 짐작과 찾은 뜻 나란히 */
  const unk = list.filter(q => Number(rdOf(q).kind) === 3);
  if(unk.length){
    h += '<div class="sec">모르는 낱말 <span class="n">' + unk.length + '</span></div><div class="card t-rd-words">' +
      unk.slice().sort((a, b) => rdNorm(rdOf(a).word).localeCompare(rdNorm(rdOf(b).word))).map(q => {
        const r = rdOf(q);
        return '<div class="t-rd-w"><div class="t-rd-wh"><b>' + esc(r.word || '') + '</b><span>' + esc(rdWho(q)) + '</span></div>' +
          '<div>짐작 · ' + (r.guess ? esc(r.guess) : '<span class="t-empty">안 적음</span>') + '</div>' +
          '<div class="t-rd-fd">찾은 뜻 · ' + (r.found ? esc(r.found) : '<span class="t-empty">아직</span>') + '</div></div>';
      }).join('') + '</div><p class="hint">짐작과 찾은 뜻을 견줘 보면 엇나간 낱말이 보여요. 다음 시간 첫 장면 거리예요.</p>';
  }
  /* 질문 목록 */
  h += '<div class="sec">질문 <span class="n">' + list.length + '</span></div><div class="t-rd-qs">' + list.map(q => {
    const r = rdOf(q), k = Number(r.kind) || 0;
    return '<div class="card t-rd-q"><div class="t-rd-qh">' + (k ? '<span class="t-rd-kind k' + k + '">' + RD_KIND[k] + '</span>' : '') +
      '<span class="t-rd-where">' + esc(rdSrcName(r) + (r.loc ? ' · ' + r.loc + rdLocW(r) : '') + (r.word ? ' · ' + r.word : '')) + '</span><span class="t-rd-who">' + esc(rdWho(q)) + '</span></div>' +
      '<div class="t-rd-qt">' + esc(q.refined_text || q.text) + '</div>' +
      (r.says ? '<div class="t-rd-l"><b>책에 나온 것</b>' + esc(r.says) + '</div>' : '') +
      (r.think ? '<div class="t-rd-l"><b>내 생각</b>' + esc(r.think) + '</div>' : '') + '</div>';
  }).join('') + '</div>';
  root.innerHTML = h;
}
ACT['rd-per'] = b => { T.rdPer = b.dataset.v; QO.tabs.rerender('read'); };
ACT['rd-src'] = b => { T.rdSrc = b.dataset.v || ''; QO.tabs.rerender('read'); };
ACT['rd-reload'] = () => { T.reading = null; loadReading(); QO.tabs.rerender('read'); };

/* ═══════════ 학생 성장 기록(v2_09) — 열매 확인 아래 접는 카드 ═══════════
   학생이 「나의 성장」 탭에서 빈칸 틀로 완성한 한 문장. 지금 고른 반 · 올해 · 최신순.
   CSV 는 열매 확인 CSV 처럼 실명 없이 학생 번호만(AI 에 그대로 넣어도 되게). 새 탭을 만들지 않고 이 구역 아래에 둔다 */
const GROW_FRAME = {change:'생각이 바뀐 것', question:'질문이 달라진 것', proud:'내가 잘한 것', next:'다음에 해 볼 것'};
const growWhen = ts => ui.kstDay(ts).slice(5).replace('-', '/') + ' ' + ui.kstHM(ts);
function loadGrow(){
  return load('grow', () => QO.api.classGrowthNotes(G(), C()).catch(e => { if(e && (e.soon || growSoon(e))) return {soon:true}; throw e; }), r => { T.grow = r; soft('fruits'); });
}
function growCss(){      // teacher.css 는 이 작업 범위 밖이라 이 구역 모양만 여기서 한 번 넣는다
  if(document.getElementById('t-grow-css')) return;
  const st = document.createElement('style'); st.id = 't-grow-css';
  st.textContent = '.t-sg{margin-top:18px}.t-sgh{display:flex;align-items:center;gap:8px}.t-sgh .n{color:var(--mute);font-weight:700}' +
    '.t-sgh svg{margin-left:auto;flex:none;transition:transform .2s}.t-sgh[aria-expanded="true"]{border-bottom-left-radius:0;border-bottom-right-radius:0}' +
    '.t-sgh[aria-expanded="true"] svg{transform:rotate(180deg)}.t-sgb{border-top:none;border-top-left-radius:0;border-top-right-radius:0;padding-top:6px}' +
    '.t-sgbar{display:flex;flex-wrap:wrap;align-items:center;gap:0 14px}.t-sgbar .hint{flex:1 1 240px}' +
    '.t-sgi{padding:11px 0;border-top:1px solid var(--line)}.t-sgih{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:12.5px;color:var(--sub)}' +
    '.t-sgiw{font-weight:800;color:var(--ink);font-size:13.5px}.t-sgih .t-at{margin-left:auto;color:var(--mute)}.t-sgit{font-size:15px;line-height:1.55;margin-top:4px;word-break:keep-all}' +
    '.t-sgi .tag.f-change{color:var(--clue-d)}.t-sgi .tag.f-question{color:var(--leaf-d)}.t-sgi .tag.f-proud{color:var(--wait)}.t-sgi .tag.f-next{color:#3F5574}' +
    '@media (prefers-reduced-motion:reduce){.t-sgh svg{transition:none}}';
  document.head.appendChild(st);
}
function growHTML(){
  growCss();
  const open = !!T.growOpen, list = Array.isArray(T.grow) ? T.grow : null;
  if(open && !T.grow && !T.reqs.grow) loadGrow();
  const chev = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  let h = '<div class="t-sg"><button type="button" class="fold t-sgh" data-act="sg-fold" aria-expanded="' + open + '" aria-controls="t_grow"><span>학생 성장 기록</span>' +
    (list ? '<span class="n">' + list.length + '</span>' : '') + chev + '</button>';
  if(!open) return h + '</div>';
  h += '<div class="card t-sgb" id="t_grow">';
  const reload = '<button type="button" class="link" data-act="sg-reload">새로 읽기</button>';
  if(T.grow && T.grow.soon) return h + '<div class="hint">성장 기록은 v2_09 SQL 을 실행한 뒤에 볼 수 있어요.</div></div></div>';
  if(!list) return h + '<div class="t-sgbar"><span class="hint">성장 기록을 불러오는 중이에요.</span>' + reload + '</div></div></div>';
  h += '<div class="t-sgbar"><span class="hint">' + esc(clsName()) + ' 학생이 「나의 성장」 탭에서 남긴 한 문장 · 최신순</span>' +
    (list.length ? '<button type="button" class="link" data-act="sg-csv">CSV 내려받기</button>' : '') + reload + '</div>';
  if(!list.length) return h + '<div class="t-sgi hint">아직 남긴 기록이 없어요.</div></div></div>';
  return h + list.map(n => {
    const st = n.student || {};
    return '<div class="t-sgi" data-id="' + n.id + '"><div class="t-sgih"><span class="t-sgiw">' + esc((st.number != null ? st.number + '번 ' : '') + (st.name || '이름 모름')) + '</span>' +
      '<span class="tag f-' + esc(n.frame) + '">' + esc(GROW_FRAME[n.frame] || n.frame) + '</span><span class="t-at">' + esc(growWhen(n.created_at)) + '</span></div>' +
      '<div class="t-sgit">' + esc(n.body) + '</div></div>';
  }).join('') + '</div></div>';
}
function growCsvOf(list){
  const cell = x => '"' + String(x == null ? '' : x).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  const rows = (list || []).map(n => [n.student && n.student.number != null ? n.student.number : '', GROW_FRAME[n.frame] || n.frame, n.body, ui.kstDay(n.created_at) + ' ' + ui.kstHM(n.created_at)]);
  return '﻿' + [['학생 번호', '틀', '문장', '쓴 때']].concat(rows).map(r => r.map(cell).join(',')).join('\r\n');
}
ACT['sg-fold'] = () => { T.growOpen = !T.growOpen; QO.tabs.rerender('fruits'); };
ACT['sg-reload'] = () => { T.grow = null; loadGrow(); QO.tabs.rerender('fruits'); };
ACT['sg-csv'] = () => {
  if(!Array.isArray(T.grow) || !T.grow.length || !S.cls) return;
  const blob = new Blob([growCsvOf(T.grow)], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = '성장기록_' + S.cls.grade + '-' + S.cls.class_no + '_' + ui.kstToday() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

/* ═══════════ 시연 도구(?mock=1 에서만) — 학생 쪽 움직임을 흉내 DB 에 바로 적는다 ═══════════ */
function demoBox(){
  if(!cfg.mock) return '';
  return '<div class="demo"><div class="h">시연 도구 · 시연 모드에서만 보여요</div><div class="chips">' +
    '<button type="button" class="chip" data-act="d-fruit">확인 요청 하나 더</button><button type="button" class="chip" data-act="d-clue">학생 단서 하나 도착</button>' +
    '<button type="button" class="chip" data-act="d-group">모둠이 선생님께 보냄</button>' +
    '<a class="chip t-chiplink" href="index.html?mock=1" target="_blank" rel="noopener">학생 화면 열기</a></div></div>';
}
const DEMO_CLUES = [
  [103, 'where', '교과서 118쪽 · 검색어 직선 도선 주위의 자기장'],
  [131, 'test', '코일 옆에 나침반을 두고 전류를 흘려 보면 알 수 있을 것 같아요'],
  [141, 'where', '교과서 146쪽 · 검색어 별의 색과 표면 온도'],
  [123, 'where', '교과서 108쪽 · 검색어 정전기 방전 불꽃'],
  [103, 'test', '나침반을 도선 바로 아래와 위에 두고 전류를 흘려 보면 알 수 있을 것 같아요'],
  [131, 'where', '교과서 118쪽 · 검색어 코일 주위의 자기장'],
  [141, 'ask', '그럼 태양은 어떤 색의 별일까요?'],
  [121, 'where', '교과서 100쪽 · 검색어 병렬연결 전구 밝기'],
  [171, 'where', '교과서 108쪽 · 검색어 정전기 형광등']
];
function inCls(p){ return !!(p && S.cls && p.grade === S.cls.grade && p.class_no === S.cls.class_no); }
function demoClue(){
  const db = QO.mock.db, h = QO.mock.h;
  const studs = db.profiles.filter(inCls).sort((a, b) => a.number - b.number);
  for(const d of DEMO_CLUES){
    const q = h.qById(d[0]); if(!q || !inCls(h.prof(q.user_id))) continue;
    if(db.clues.some(x => x.question_id === d[0] && x.kind === d[1] && x.body === d[2])) continue;
    const au = studs.find(p => p.id !== q.user_id && !db.clues.some(x => x.question_id === d[0] && x.author_id === p.id && x.kind === d[1]));
    if(!au) continue;
    const step = K.CLUE_KINDS[d[1]].step, mk = db.step_marks.find(m => m.question_id === q.id && m.step === step), id = h.seq('clues');
    db.clues.push({id, question_id:q.id, author_id:au.id, kind:d[1], step, body:d[2], snapshot_md5:mk ? mk.text_md5 : null, school_year:h.schoolYear(),
      grade:au.grade, class_no:au.class_no, created_at:h.nowISO(), thanked_at:null, thanks_text:null, declined_at:null, hidden_at:null});
    QO.mock.save();
    return id;
  }
  return null;
}
const GROUP_TXT = {
  method:{body:'교과서와 과학관 누리집에서 번개 사진과 설명을 찾아보기'},
  find:{body:'번개는 공기 중에서 전기가 흐르기 쉬운 곳을 따라 조금씩 꺾이며 내려온다.', src:'교과서 110쪽'},
  compare:{body:'두 곳 모두 전기가 흐르기 쉬운 길을 따라간다고 해요. 교과서는 그림이 있어서 더 알기 쉬워요.'},
  wrap:{body:'번개는 공기 속에서 전기가 흐르기 쉬운 길을 따라 조금씩 나아가서 지그재그 모양이 된다.'},
  extra:{body:'번개가 칠 때 공기가 고르지 않아서 꺾인다는 설명도 있었다.', src:'과학 잡지'},
  used:{body:'내가 맡은 칸의 내용이 정리 문장에 들어갔어요'},
  predict:{body:'공기 때문에 꺾이는 것 같다. 왜냐하면 바람이 불면 연기도 휘니까.'},
  heard:{body:'번개는 흐르기 쉬운 길을 찾아 꺾인대요 · 되묻기: 그럼 번개는 왜 높은 곳에 잘 떨어질까?'}
};
function demoGroup(){
  const db = QO.mock.db, h = QO.mock.h, y = h.schoolYear();
  const gs = db.groups.filter(g => S.cls && g.school_year === y && g.grade === S.cls.grade && g.class_no === S.cls.class_no).sort((a, b) => a.group_no - b.group_no);
  for(const g of gs){
    const inq = db.group_inquiries.filter(i => i.group_id === g.id).sort((a, b) => b.id - a.id)[0];
    if(!inq || (inq.status !== 'open' && inq.status !== 'returned')) continue;
    const mem = db.group_members.filter(m => m.group_id === g.id).map(m => m.user_id), at = h.nowISO();
    const other = db.group_members.find(m => m.group_id !== g.id && gs.some(x => x.id === m.group_id));
    db.group_steps.filter(s => s.inquiry_id === inq.id).forEach(s => {
      if(s.done_at) return;
      const t = GROUP_TXT[s.kind] || {body:'모둠원이 채운 칸이에요.'};
      if(s.kind === 'tell'){ s.assignee_id = mem[0] || null; s.body = '그 자리에서 뽑힘'; }
      else if(s.kind === 'heard'){ s.assignee_id = other ? other.user_id : null; s.body = t.body; }
      else { s.body = t.body; s.src = t.src || ''; if(!s.assignee_id) s.assignee_id = mem[0] || null; }
      s.done_at = at;
    });
    inq.status = 'wait';
    QO.mock.save();
    return g.id;
  }
  return null;
}
const DEMO_FRUIT = {
  102:{find:[{src:'교과서 112쪽', text:'공기가 건조하면 물체에 생긴 전기가 공기 중으로 잘 빠져나가지 못한다.', ai:false},
             {src:'과학관 누리집', text:'습도가 높으면 공기 중의 물 분자를 따라 전기가 조금씩 빠져나가서 정전기가 덜 생긴다.', ai:false}],
       same:'같아요', wrap:{mode:'unknown', reached:'공기가 건조하면 전기가 잘 빠져나가지 못한다는 것까지 교과서 112쪽에서 찾았다.', stuckQ:'물 분자는 어떻게 전기를 빠져나가게 할까?', why:'용어가 어려움', cmp:'part', changedBy:''}},
  171:{method:{kind:'web', plan:''}, find:[{src:'교과서 108쪽', text:'정전기는 전기가 한꺼번에 짧게 흐르는 방전으로 불꽃이 튈 수 있다.', ai:false},
             {src:'과학관 누리집', text:'정전기를 모아 형광등에 흘려보내면 아주 잠깐 빛이 난다.', ai:false}],
       same:'같아요', wrap:{mode:'known', text:'정전기를 모아 한꺼번에 흘려보내면 형광등이 잠깐 켜질 수 있지만 전류가 아주 짧게 흘러서 계속 켜 두기는 어렵다.', cmp:'part', changedBy:'잠깐만 켜진다는 글'}}
};
function demoFruit(){
  const db = QO.mock.db, h = QO.mock.h;
  for(const id of Object.keys(DEMO_FRUIT)){
    const q = h.qById(id), x = DEMO_FRUIT[id];
    if(!q || q.fruit_kind != null || q.resolve_requested_at || !inCls(h.prof(q.user_id))) continue;
    const at = h.nowISO(), j = JSON.parse(JSON.stringify(q.journal || {})), s = JSON.parse(JSON.stringify(q.solve || {}));
    if(x.method) j.method = x.method;
    j.find = (j.find || []).concat(x.find.map(f => Object.assign({at:at}, f)));
    j.same = x.same; j.wrap = Object.assign({at:at}, x.wrap); delete j.flag; delete j.returned;
    s.source = s.source || x.find[0].src;
    const patch = {journal:j, solve:s, resolve_requested_at:at};
    if(x.wrap.mode === 'unknown'){ s.stuck = 1; s.stuckWhere = x.wrap.reached; patch.still_wondering = x.wrap.stuckQ; }
    else { s.answer = x.wrap.text; patch.finding = x.wrap.text; }
    h.updateQ(q, patch, at);
    QO.mock.save();
    return q.id;
  }
  return null;
}
ACT['d-clue'] = () => { const id = demoClue(); ui.toast(id ? '학생 단서가 하나 왔어요' : '보낼 수 있는 시연 단서가 더 없어요'); if(id){ loadToday(); if(T.clues) loadClues(T.clues.day); } };
ACT['d-group'] = () => { const id = demoGroup(); ui.toast(id ? '모둠 일지가 선생님께 왔어요' : '함께 푸는 질문이 있는 모둠이 없어요'); if(id) loadGroups(); };
ACT['d-fruit'] = () => { const id = demoFruit(); ui.toast(id ? '확인 요청이 하나 왔어요' : '이 반에는 더 만들 시연 요청이 없어요'); if(id) loadPending(); };

/* ═══════════ 구역 등록 · 이벤트 ═══════════ */
QO.tabs.register({id:'fruits', label:'열매 확인', render:renderFruits, badge(){ return !!(T.pending && T.pending.length); }});
QO.tabs.register({id:'live', label:'수업 진행', render:renderLive, badge(){ return !!T.live; }});
QO.tabs.register({id:'groups', label:'모둠', render:renderGroups, badge(){ return !!(T.groups && T.groups.some(g => g.inquiry && g.inquiry.status === 'wait')); }});
QO.tabs.register({id:'clues', label:'단서 살피기', render:renderClues});
QO.tabs.register({id:'read', label:'책 보며 심기', render:renderRead});

function bind(el, ev){
  const k = el.dataset.bind;
  if(k === 'retNote'){ if(T.ret) T.ret.note = el.value; return; }
  if(k === 'qNote'){ if(T.quick) T.quick.note = el.value; return; }
  if(/^bk-/.test(k)){ bulkBind(k, el); return; }
  if(k === 'gRetNote'){ if(T.gRet) T.gRet.note = el.value; return; }
  if(k === 'exNo' || k === 'exYes'){ T.ex[k === 'exNo' ? 'no' : 'yes'] = el.value.trim(); boardRefresh(); return; }
  if(k === 'gN'){ if(ev === 'change'){ draft().n = Number(el.value) || 7; QO.tabs.rerender('groups'); } return; }
  if(/^g\d+$/.test(k)){
    const i = Number(k.slice(1)); draft().rows[i] = el.value;
    const nm = $('#t_gn' + i); if(nm) nm.innerHTML = namesFor(el.value);
    const lf = $('#t_gleft'); if(lf) lf.innerHTML = leftoverHTML();
    return;
  }
  if(k === 'day' && ev === 'change') setDay(el.value);
}
const body = $('#body'), boardEl = $('#board');
if(body){
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if(!b || !body.contains(b)) return;
    const f = ACT[b.dataset.act]; if(!f) return;
    Promise.resolve().then(() => f(b, e)).catch(err => ui.fail(err));
  });
  body.addEventListener('input', e => { const el = e.target.closest && e.target.closest('[data-bind]'); if(el) bind(el, 'input'); });
  body.addEventListener('change', e => { const el = e.target.closest && e.target.closest('[data-bind]'); if(el) bind(el, 'change'); });
  body.addEventListener('focusout', () => setTimeout(flushDirty, 300));
}
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => { pointerDown = false; setTimeout(flushDirty, 60); }, true);
if(boardEl) boardEl.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if(b && b.dataset.act === 'b-next' && T.live) Promise.resolve().then(() => goStage(b, (T.live.stage || 0) + 1)).catch(err => ui.fail(err));
});
QO.bus.on('class:changed', () => { ensure(); boardRefresh(); });

/* 남은 시간은 1초마다 글자만, 수업 진행 구역이나 칠판이 열려 있을 때는 6초마다 서버를 다시 읽는다 */
setInterval(() => {
  if(!T.live) return;
  const left = QO.live.left(T.live);
  $$('[data-tleft]').forEach(el => { el.textContent = ui.clock(left); el.classList.toggle('t-over', left <= 0); });
}, 1000);
setInterval(() => {
  if(!S.ready || !S.teacher || !S.cls || document.visibilityState !== 'visible') return;
  const onLive = QO.tabs.current() === 'live', bo = QO.board.isOpen();
  if(!onLive && !bo) return;
  ensure();
  loadLive();
  const L = T.live;
  if((L && L.mode === 'clue') || (!L && bo)) loadToday();
  if(L && L.mode === 'group') loadGroups();
}, 6000);

/* 캡처용(?mock=1 에서만): ?tcls=2-11 · ?tlive=clue:3 · ?tdemo=clue,clue,group,fruit · ?topen=104 · ?tret=1 · ?tgfold=1 · ?board=1 */
let captured = false;
QO.bus.on('ready', ev => { if(ev && ev.page === 'teacher') captureSetup().catch(e => QO.err(e, 'capture')); });
async function captureSetup(){
  if(captured || !cfg.mock || cfg.selftest) return;
  captured = true;
  const tc = (P.get('tcls') || '').split('-').map(Number);
  if(tc[0] && tc[1]) QO.app.setClass(tc[0], tc[1]);
  ensure();
  const tl = (P.get('tlive') || '').split(':');
  if((tl[0] === 'clue' || tl[0] === 'group') && S.cls){
    let r = await QO.api.liveStart(G(), C(), tl[0]);
    if(Number(tl[1]) > 0) r = await QO.api.liveSetStage(r.id, Number(tl[1]));
    setLive(r, true);
  }
  (P.get('tdemo') || '').split(',').forEach(d => { if(d === 'clue') demoClue(); if(d === 'group') demoGroup(); if(d === 'fruit') demoFruit(); });
  await Promise.all([loadPending(), loadGroups(), loadToday(), loadStuck(), loadStudents()]);
  const op = Number(P.get('topen'));
  if(op){ T.open = op; await loadDetail(op); if(P.get('tret') && T.detail[op]) T.ret = {qid:op, step:retDefault(T.detail[op]), note:''}; }
  if(P.get('tgfold')) T.gFold = true;
  if(P.get('tgrow')) T.growOpen = true;      // ?tgrow=1 — 학생 성장 기록 펼쳐 두기
  QO.tabs.rerender();
  if(P.get('board') === '1') openBoard();
}

/* 시험에서 쓴다 */
QO.teacherView = {T, idle, csvOf, growthCsv:growCsvOf, bulkLoad, parseCSV, demo:{clue:demoClue, group:demoGroup, fruit:demoFruit}, async refresh(){ await Promise.all([loadLive(), loadToday(), loadGroups(), loadPending()]); }};

/* ═══════════ 스스로 시험(teacher.html?mock=1&selftest=1) ═══════════ */
if(!QO.selftest || cfg.page !== 'teacher') return;
const add = QO.selftest.add;
const TV = QO.teacherView;
const NAMES = ['가람', '나래', '다온', '라온', '바다', '새봄', '마루'];
async function to211(t, tab){ QO.app.setClass(2, 11); await TV.idle(); if(tab) await t.click('#nav [data-t="' + tab + '"]'); await TV.idle(); }
const fpCount = (t, qid) => new Set(t.db.footprints.filter(f => f.question_id === qid).map(f => f.step)).size;
const savedDB = () => JSON.parse(localStorage.getItem('qo2-mock-v1') || 'null');

add('선생님 · 열매 확인: 확인 요청 → 열매(도토리 = 발자국 칸 + 5)', async t => {
  await to211(t, 'fruits');
  const card = await t.waitFor('[data-act="f-open"][data-q="104"]');
  t.eq(t.$$('[data-act="f-open"]').length, 1, '2-11 확인 요청 수');
  await t.click(card);
  const det = await t.waitFor('.t-detail[data-detail="104"] .t-acts');
  const n = fpCount(t, 104), box = t.$('.t-detail[data-detail="104"]'), tx = box.textContent;
  t.expect(tx.indexOf('과학관 누리집') >= 0 && tx.indexOf('교과서 104쪽') >= 0, '찾기 출처');
  t.expect(tx.indexOf('발자국 ' + n + '칸') >= 0 && tx.indexOf('도토리 ' + (n + 5) + '개') >= 0, '발자국 칸과 도토리 미리 보기');
  t.expect(tx.indexOf('빛이 더 빨라서') >= 0, '예상 기록');
  t.eq(det.querySelector('[data-act="f-ok"]').dataset.kind, 'fruit', '알아낸 것 → 열매를 먼저 제안');
  const before = t.db.profiles.find(p => p.id === 'u-A').seeds;
  await t.click(det.querySelector('[data-act="f-ok"][data-kind="fruit"]'));
  await t.waitFor(() => t.toastText().indexOf('도토리 ' + (n + 5) + '개가 들어갔어요') >= 0);
  const q = t.db.questions.find(x => x.id === 104);
  t.eq([q.fruit_kind, q.fruit_source, q.resolve_requested_at], ['fruit', 'teacher', null], '열매 칸');
  t.eq(t.db.profiles.find(p => p.id === 'u-A').seeds, before + n + 5, '도토리 잔액');
  await t.waitFor(() => !t.$('[data-act="f-open"][data-q="104"]') && t.$('#body').textContent.indexOf('확인을 기다리는 질문이 없어요') >= 0);
  await TV.idle();
});
add('선생님 · 되돌리기: 칸 고르기 + 한 줄 → 학생 질문에 returned·nudge', async t => {
  await to211(t, 'fruits');
  await t.click(await t.waitFor('[data-act="f-open"][data-q="104"]'));
  await t.click(await t.waitFor('.t-detail[data-detail="104"] [data-act="f-ret"]'));
  await t.click(await t.waitFor('[data-act="f-ret-step"][data-step="method"]'));
  t.eq(t.$('[data-act="f-ret-step"].on').dataset.step, 'method', '칸 고르기');
  await t.click('[data-act="f-ret-send"]');
  await t.waitFor(() => (t.$('#t_retErr') || {}).textContent === '학생에게 보낼 한 줄을 적어 주세요.');
  t.expect(t.db.questions.find(x => x.id === 104).resolve_requested_at, '한 줄 없이는 보내지 않음');
  await t.click('[data-act="f-ret-ex"][data-i="0"]');
  t.eq(t.$('[data-act="f-ret-step"].on').dataset.step, 'find', '예시를 고르면 그 칸');
  const note = '찾은 곳이 한 곳뿐이에요. 교과서 말고 다른 곳에서 하나 더 찾아볼까요?';
  await t.type('#t_retNote', note);
  await t.click('[data-act="f-ret-send"]');
  await t.waitFor(() => t.toastText().indexOf('찾기 칸을 다시 열어') >= 0);
  const q = t.db.questions.find(x => x.id === 104);
  t.eq([q.journal.returned.step, q.teacher_nudge, q.fb_unread, q.resolve_requested_at, q.fruit_kind], ['find', note, true, null, null], '되돌린 질문');
  /* 같은 브라우저의 학생 화면은 이 localStorage 를 읽는다 */
  const saved = savedDB().questions.find(x => x.id === 104), v = QO.journal.view(saved);
  t.eq([v.status, QO.journal.curStep(v), v.d.returned.note], ['open', 'find', note], '학생 화면이 읽는 일지');
  await t.waitFor(() => t.$('#body').textContent.indexOf('확인을 기다리는 질문이 없어요') >= 0);
  await TV.idle();
});
add('선생님 · 안개 열매 요청은 안개 열매를 먼저 · 옛 앱 수확도 확인 요청', async t => {
  await to211(t, 'fruits');
  t.eq(TV.demo.fruit(), 102, '시연 요청(아직 모름)');
  const q105 = t.db.questions.find(x => x.id === 105);
  q105.resolved = true; q105.resolve_requested_at = new Date().toISOString(); QO.mock.save();
  await t.click('[data-act="f-reload"]');
  await t.waitFor('[data-act="f-open"][data-q="102"]');
  t.expect(t.$('[data-act="f-open"][data-q="105"] .t-old'), '옛 앱에서 마친 질문 표시');
  t.expect(t.$('[data-act="f-open"][data-q="102"] .tag.fog'), '아직 모름 표시');
  await t.click('[data-act="f-open"][data-q="102"]');
  await t.waitFor('.t-detail[data-detail="102"] .t-acts [data-act="f-ok"]');
  await TV.idle();
  const first = t.$('.t-detail[data-detail="102"] .t-acts [data-act="f-ok"]');
  t.eq(first.dataset.kind, 'fog', '안개 열매를 먼저 제안');
  const box = t.$('.t-detail[data-detail="102"]');
  t.expect(box.querySelector('.t-crit') && box.textContent.indexOf('물 분자는 어떻게') >= 0 && box.textContent.indexOf('용어가 어려움') >= 0, '판정 기준과 세 칸');
  t.expect(box.textContent.indexOf('받은 단서 1개') >= 0 && box.textContent.indexOf('나래(2번)') >= 0, '받은 단서와 보낸 사람');
  const n = fpCount(t, 102);
  await t.click(first);
  await t.waitFor(() => t.toastText().indexOf('안개 열매가 열렸어요. 도토리 ' + (n + 5) + '개') >= 0);
  t.eq(t.db.questions.find(x => x.id === 102).fruit_kind, 'fog', '안개 열매');
  await t.click(await t.waitFor('[data-act="f-open"][data-q="105"]'));
  await t.waitFor('.t-detail[data-detail="105"] .rule');
  t.expect(t.$('.t-detail[data-detail="105"]').textContent.indexOf('옛 앱에서 학생이 스스로 마친 질문') >= 0, '옛 앱 안내');
  t.expect(t.$('.t-detail[data-detail="105"]').textContent.indexOf('교과서 98쪽') >= 0, '옛 solve 칸도 읽음');
  await TV.idle();
});
add('선생님 · 단서 시간: 시작 → 다음 단계 → 칠판(이름 없음) → 끝내기', async t => {
  await to211(t, 'live');
  await t.click(await t.waitFor('[data-act="l-start"][data-mode="clue"]'));
  await t.waitFor(() => t.db.lesson_live.some(l => l.active && l.mode === 'clue' && l.grade === 2 && l.class_no === 11 && l.stage === 0));
  await t.waitFor('[data-act="l-next"]');
  t.eq(t.$$('.t-stage ol button').length, 4, '단계 넷');
  t.expect(/^[01]:\d\d$/.test(t.$('.t-stage [data-tleft]').textContent), '남은 시간');
  const opt = await t.waitFor('[data-act="l-demo"]');
  await t.click(opt);
  await t.type('#t_exNo', '전류가 바뀌면 바늘이 반대로 돌아');
  await t.click('#boardBtn');
  await t.waitFor(() => t.$('#board.show .bq'));
  const b0 = t.$('#board').textContent;
  t.expect(b0.indexOf('선생님 시범') >= 0 && b0.indexOf('여기까지 해 봤어요') >= 0 && b0.indexOf('전류가 바뀌면 바늘이 반대로 돌아') >= 0, '시범 칠판');
  QO.board.close();
  const live = () => t.db.lesson_live.find(l => l.active);
  await t.click('[data-act="l-next"]'); await t.waitFor(() => live() && live().stage === 1);
  await t.click(await t.waitFor('[data-act="l-next"]')); await t.waitFor(() => live() && live().stage === 2);
  t.expect(TV.demo.clue() && TV.demo.clue(), '시연 단서 둘');
  await TV.refresh();
  await t.waitFor(() => t.$('#body').textContent.indexOf('지금까지 보낸 단서 2개') >= 0);
  await t.click(await t.waitFor('[data-act="l-next"]')); await t.waitFor(() => live() && live().stage === 3);
  const pk = await t.waitFor('[data-act="l-pick"]');
  await t.click(pk);
  await t.click('#boardBtn');
  await t.waitFor(() => t.$('#board.show .t-bgc'));
  const bt = t.$('#board').textContent;
  t.eq(t.$$('#board .t-bgc').length, 1, '고른 단서만 칠판에');
  t.expect(!NAMES.some(nm => bt.indexOf(nm) >= 0), '칠판에 이름이 없어야 해요');
  await t.click('#board [data-act="b-next"]');
  await t.waitFor(() => !t.db.lesson_live.some(l => l.active));
  await t.waitFor(() => !t.$('#board').classList.contains('show'));
  await t.waitFor(() => t.$('#body').textContent.indexOf('단서 시간이 끝났어요 · 보낸 단서 2개') >= 0);
  await TV.idle();
});
add('선생님 · 모둠 진행: 7단계와 분 · 칠판에 모둠별 진행 칸', async t => {
  await to211(t, 'live');
  await t.click(await t.waitFor('[data-act="l-start"][data-mode="group"]'));
  await t.waitFor('[data-act="l-next"]');
  t.eq(t.$$('.t-stage ol button').length, 7, '단계 일곱');
  const live = () => t.db.lesson_live.find(l => l.active);
  await t.click('[data-act="l-next"]');
  await t.waitFor(() => live() && live().stage === 1);
  await t.waitFor(() => /^[23]:\d\d$/.test(t.$('.t-stage [data-tleft]').textContent));
  await t.click(await t.waitFor('.t-stage ol button[data-st="4"]'));
  await t.waitFor(() => live() && live().stage === 4);
  await t.waitFor(() => /^(10|9):\d\d$/.test(t.$('.t-stage [data-tleft]').textContent));
  t.expect(t.$('.t-stage .now').textContent.indexOf('찾기 ①② + 두 출처 비교 — 10분') >= 0, '학생 화면 안내');
  await t.click('#boardBtn');
  await t.waitFor(() => t.$$('#board .t-bpr').length === 2);
  const bt = t.$('#board').textContent;
  t.expect(bt.indexOf('번개는 왜 지그재그로 칠까?') >= 0 && bt.indexOf('질문 고르는 중') >= 0 && t.$('#board .t-cell.on'), '모둠별 진행 칸');
  t.expect(!NAMES.some(nm => bt.indexOf(nm) >= 0), '칠판에 이름이 없어야 해요');
  QO.board.close();
  await t.click('[data-act="l-stop"]');
  await t.click(await t.waitFor('.qo-dialog [data-dlg="ok"]'));
  await t.waitFor(() => !t.db.lesson_live.some(l => l.active));
  await t.waitFor(() => t.$('#body').textContent.indexOf('모둠 진행을 끝냈어요') >= 0);
  await TV.idle();
});
add('선생님 · 모둠 편성 저장(번호 → setGroups)', async t => {
  await to211(t, 'groups');
  await t.click(await t.waitFor('[data-act="g-fold"]'));
  await t.waitFor('#t_g1');
  t.eq([t.$('#t_g1').value, t.$('#t_g2').value, t.$$('.t-grow').length], ['1, 2, 5', '3, 4, 6', 7], '지금 편성과 기본 7모둠');
  await t.type('#t_g3', '3');
  await t.click('[data-act="g-save"]');
  await t.waitFor(() => t.$('#t_gErr').textContent === '3번이 2모둠과 3모둠에 함께 들어 있어요.');
  await t.type('#t_g2', '4'); await t.type('#t_g3', '3, 6'); await t.type('#t_g4', '9');
  t.expect(t.$('#t_gn4').textContent.indexOf('9번 없음') >= 0, '없는 번호 표시');
  await t.click('[data-act="g-save"]');
  await t.waitFor(() => t.$('#t_gErr').textContent === '9번 학생이 없어요.');
  await t.type('#t_g4', '');
  t.expect(t.$('#t_gleft').textContent.indexOf('모든 학생이') >= 0, '모둠이 없는 학생 없음');
  await t.click('[data-act="g-save"]');
  await t.waitFor(() => t.toastText() === '모둠 3개를 저장했어요');
  const mem = no => { const g = t.db.groups.find(x => x.grade === 2 && x.class_no === 11 && x.group_no === no); return g ? t.db.group_members.filter(m => m.group_id === g.id).map(m => m.user_id).sort() : null; };
  t.eq([mem(1), mem(2), mem(3)], [['u-A', 'u-B', 'u-F'], ['u-D'], ['u-C', 'u-G']], '저장된 모둠');
  await t.waitFor(() => t.$$('.t-gcard').length === 3);
  await TV.idle();
});
add('선생님 · 모둠 일지: 되돌리기 → 다시 보냄 → 모둠 열매(받는 사람 수)', async t => {
  await to211(t, 'groups');
  t.eq(TV.demo.group(), 11, '시연: 1모둠이 보냄');
  await t.click('[data-act="g-reload"]');
  await t.click(await t.waitFor('[data-act="g-ret"]'));
  t.expect(t.$('.t-gcard[data-g="11"]').textContent.indexOf('선생님께 보냄') >= 0, '보낸 상태');
  await t.click(await t.waitFor('[data-act="g-ret-send"]'));
  await t.waitFor(() => t.$('#t_gRetErr').textContent === '모둠에게 보낼 한 줄을 적어 주세요.');
  const note = '두 출처 중 더 믿을 만한 쪽과 그 까닭을 적어 볼까요?';
  await t.type('#t_gRetNote', note);
  await t.click('[data-act="g-ret-send"]');
  await t.waitFor(() => t.db.group_inquiries.find(i => i.id === 31).status === 'returned');
  t.eq(t.db.group_inquiries.find(i => i.id === 31).teacher_note, note, '되돌린 글');
  await t.waitFor(() => t.$('.t-gcard[data-g="11"] .tag.tch'));
  TV.demo.group();
  await t.click('[data-act="g-reload"]');
  const ok = await t.waitFor('[data-act="g-ok"]');
  const fp = t.$('.t-gcard[data-g="11"] .t-fp').textContent;
  t.expect(['가람', '나래', '바다'].every(nm => fp.indexOf(nm) >= 0), '열매 받을 사람 미리 보기');
  await t.click(ok);
  await t.waitFor(() => t.toastText() === '칸을 맡아 채운 3명의 나무에 열매가 열렸어요');
  t.eq(t.db.group_fruits.map(f => f.user_id).sort(), ['u-A', 'u-B', 'u-F'], '모둠 열매 받은 사람');
  t.eq(t.db.group_inquiries.find(i => i.id === 31).status, 'fruit', '모둠 질문 상태');
  await t.waitFor(() => t.$('.t-gcard[data-g="11"] .statusbar.fruit'));
  await TV.idle();
});
add('선생님 · 단서 살피기: 날짜 고르기 · 숨기기 · 다시 보이기', async t => {
  await to211(t, 'clues');
  const day = QO.ui.kstDay(t.db.clues.find(c => c.id === 502).created_at);
  await t.type(await t.waitFor('#t_day'), day);
  const btn = await t.waitFor('[data-act="c-hide"][data-id="502"]');
  const card = btn.closest('.t-clue').textContent;
  t.expect(card.indexOf('가람(1번)') >= 0 && card.indexOf('나래(2번)') >= 0 && card.indexOf('병렬') >= 0, '보낸 사람 · 받은 질문');
  await t.click(btn);
  await t.waitFor(() => t.db.clues.find(c => c.id === 502).hidden_at);
  t.expect(savedDB().clues.find(c => c.id === 502).hidden_at, '학생 화면이 읽는 DB 에도 숨김');
  await t.waitFor(() => (t.$('[data-act="c-hide"][data-id="502"]') || {}).textContent === '다시 보이기');
  await t.click('[data-act="c-hide"][data-id="502"]');
  await t.waitFor(() => !t.db.clues.find(c => c.id === 502).hidden_at);
  await t.waitFor(() => (t.$('[data-act="c-hide"][data-id="502"]') || {}).textContent === '숨기기');
  await TV.idle();
});
add('선생님 · 칠판 화면(진행 없음): 오늘 단서를 질문별로, 이름 없이', async t => {
  await to211(t, 'fruits');
  t.expect(TV.demo.clue(), '시연 단서');
  await t.click('#boardBtn');
  await t.waitFor(() => t.$('#board.show .t-bgc'));
  const bt = t.$('#board').textContent;
  t.expect(bt.indexOf('오늘 우리 반 단서') >= 0 && bt.indexOf('직선 도선') >= 0, '오늘 단서');
  t.expect(!NAMES.some(nm => bt.indexOf(nm) >= 0), '칠판에 이름이 없어야 해요');
  await t.click('#board [data-board-close]');
  t.expect(!t.$('#board').classList.contains('show'), '닫기');
  await TV.idle();
});
add('선생님 · 끄는 것을 잊은 지난 진행은 「끝내기」만', async t => {
  const y = new Date(Date.now() - 864e5).toISOString();
  t.db.lesson_live.push({id:QO.mock.h.seq('lesson_live'), teacher_id:1, grade:2, class_no:11, mode:'clue', stage:2, stage_started_at:y, active:true, created_at:y});
  QO.mock.save();
  await to211(t, 'live');
  await TV.refresh(); await TV.idle();
  const card = await t.waitFor('.t-stale');
  t.expect(card.textContent.indexOf('지난 단서 시간이 켜져 있어요') >= 0 && t.$('[data-act="l-start"][data-mode="clue"]'), '지난 진행 안내와 시작 카드');
  t.expect(!t.$('.t-stage'), '진행 화면이 아님');
  await t.click('[data-act="l-stop-stale"]');
  await t.waitFor(() => !t.db.lesson_live.some(l => l.active) && !t.$('.t-stale'));
  await TV.idle();
});
add('선생님 · 익명 질문은 시범 목록 뒤 · 단서 살피기에서 주인 가림', async t => {
  t.db.questions.find(q => q.id === 123).journal.flag.at = new Date().toISOString();
  QO.mock.save();
  await to211(t, 'live');
  await t.click(await t.waitFor('[data-act="l-start"][data-mode="clue"]'));
  await t.waitFor('[data-act="l-demo"]');
  await TV.idle();
  const opts = t.$$('[data-act="l-demo"]');
  t.expect(opts[0].dataset.q !== '123' && opts[opts.length - 1].dataset.q === '123', '익명 질문은 맨 뒤: ' + opts.map(o => o.dataset.q));
  t.expect(opts[opts.length - 1].textContent.indexOf('익명 질문') >= 0 && opts[0].getAttribute('aria-pressed') === 'true', '익명 표시 · 기본은 익명 아닌 질문');
  t.expect(TV.demo.clue(), '시연 단서');
  let id = null;
  for(let i = 0; i < 4 && !id; i++){ TV.demo.clue(); id = (t.db.clues.find(c => c.question_id === 123) || {}).id; }
  t.expect(id, '익명 질문에 온 단서');
  await t.click('#nav [data-t="clues"]');
  const btn = await t.waitFor('[data-act="c-owner"][data-id="' + id + '"]');
  const card = () => btn.isConnected ? btn.closest('.t-clue').textContent : t.$('[data-act="c-owner"][data-id="' + id + '"]').closest('.t-clue').textContent;
  t.expect(card().indexOf('나래') < 0 && card().indexOf('익명 질문 주인') >= 0, '주인 이름 가림');
  await t.click(btn);
  await t.waitFor(() => t.$('[data-act="c-owner"][data-id="' + id + '"]').closest('.t-clue').textContent.indexOf('나래(2번)') >= 0);
  await TV.idle();
});
add('선생님 · CSV 올리기: AI 가 채운 결과 → 표 → 체크한 것만 반영', async t => {
  /* 확인 요청 하나 더 만들기(2-11 학생 질문 중 아직 열매 아닌 것) */
  const extra = t.db.questions.find(q => q.id !== 104 && q.fruit_kind == null && t.db.profiles.some(p => p.id === q.user_id && p.grade === 2 && p.class_no === 11));
  extra.resolve_requested_at = new Date().toISOString();
  await to211(t, 'fruits');
  await t.waitFor('[data-act="f-csv"]');
  const p = await t.api.pendingFruits(2, 11);
  t.expect(p.length >= 2, '확인 요청 둘 이상');
  const lines = TV.csvOf(p).replace(/^\ufeff/, '').split('\r\n');
  const cells = TV.parseCSV(lines.join('\n'));
  const head = cells[0].concat(['AI 메모']);
  const body = cells.slice(1).map(r => { const id = Number(r[0]);
    const x = r.slice(); x[18] = id === 104 ? '열매' : '되돌리기'; x[19] = id === 104 ? '' : '찾기'; x[20] = id === 104 ? '' : '다른 곳에서 하나 더 찾아볼까요?';
    return x.concat([id === 104 ? '정리가 질문에 답함' : '']); });
  body.push(['99999'].concat(new Array(17).fill('')).concat(['열매', '', '', '']));   // 목록에 없는 질문
  const csv = [head].concat(body).map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  TV.bulkLoad(csv, '시험.csv');
  await t.waitFor('.t-bulk');
  const rows = t.$$('.t-brow');
  t.eq(rows.length, body.length, '표 줄 수');
  t.expect(t.$('.t-brow.bad .err') && /목록에 없는/.test(t.$('.t-brow.bad .err').textContent), '없는 질문은 빨간 줄');
  const before = t.db.profiles.find(x => x.id === 'u-A').seeds, n104 = fpCount(t, 104);
  await t.click('[data-act="f-bulk-apply"]');
  await t.waitFor(() => t.$$('.t-brow.done').length === 2);
  t.eq(t.db.questions.find(q => q.id === 104).fruit_kind, 'fruit', '104 열매');
  t.eq(t.db.profiles.find(x => x.id === 'u-A').seeds, before + n104 + 5, '도토리');
  const ex = t.db.questions.find(q => q.id === extra.id);
  t.expect(ex.fruit_kind == null && ex.resolve_requested_at == null, '되돌린 질문은 열매 아님·요청 풀림');
  await t.click('[data-act="f-bulk-cancel"]');
  await t.waitFor(() => !t.$('.t-bulk'));
  await TV.idle();
});
add('선생님 · 빠르게 확인: 키보드 1·3·→ 로 한 장씩', async t => {
  const extra = t.db.questions.filter(q => q.id !== 104 && q.fruit_kind == null && t.db.profiles.some(p => p.id === q.user_id && p.grade === 2 && p.class_no === 11)).slice(0, 2);
  extra.forEach(q => { q.resolve_requested_at = new Date().toISOString(); });
  await to211(t, 'fruits');
  await t.click(await t.waitFor('[data-act="f-quick"]'));
  await t.waitFor('.t-quick');
  const total = (await t.api.pendingFruits(2, 11)).length;
  t.expect(/1 \/ /.test(t.$('.t-qh b').textContent), '첫 장');
  const key = k => document.dispatchEvent(new KeyboardEvent('keydown', {key:k, bubbles:true}));
  key('ArrowRight'); await t.waitFor(() => /2 \/ /.test(t.$('.t-qh b').textContent));
  key('ArrowLeft'); await t.waitFor(() => /1 \/ /.test(t.$('.t-qh b').textContent));
  const first = Number(t.$('.t-quick').dataset.q);
  key('1');
  await t.waitFor(() => t.db.questions.find(q => q.id === first).fruit_kind === 'fruit');
  await t.waitFor(() => t.$('.t-quick') && Number(t.$('.t-quick').dataset.q) !== first);
  const second = Number(t.$('.t-quick').dataset.q);
  key('3'); await t.waitFor('#t_qNote');
  t.$('#t_qNote').value = '한 곳 더 찾아볼까요?'; t.$('#t_qNote').dispatchEvent(new Event('input', {bubbles:true}));
  t.$('#t_qNote').focus();
  t.$('#t_qNote').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
  await t.waitFor(() => t.db.questions.find(q => q.id === second).resolve_requested_at == null);
  t.eq(t.db.questions.find(q => q.id === second).fruit_kind, null, '되돌린 건 열매 아님');
  t.expect(total >= 3, '확인 요청 셋 이상이었음');
  key('Escape'); await t.waitFor(() => !t.$('.t-quick'));
  await TV.idle();
});
add('선생님 · 책 보며 심기: 많이 고른 곳·모르는 낱말(짐작·찾은 뜻)·질문', async t => {
  await to211(t, 'read');
  await t.click('#body [data-act="rd-per"][data-v="all"]');
  await t.waitFor('#body .t-rd-bars');
  const bars = t.$$('#body .t-rd-bar');
  t.expect(/대전/.test(bars[0].textContent) && /2개/.test(bars[0].textContent), '같은 쪽·같은 낱말 둘이 한 줄로 묶여 맨 위: ' + bars[0].textContent);
  t.expect(bars[0].querySelector('.g i.k3'), '모르는 낱말 색');
  const words = t.$('#body .t-rd-words').textContent;
  t.expect(/전기가 대신 생기는 것/.test(words) && /물체가 전기를 띠는 현상/.test(words) && /아직/.test(words), '짐작·찾은 뜻·아직');
  t.expect(/익명/.test(words) && !/나래/.test(words), '익명 질문은 이름 가림');
  const qs = t.$$('#body .t-rd-q');
  t.eq(qs.length, 5, '2-11 책 보며 심은 질문 5개');
  t.expect(t.$('#body').textContent.indexOf('불꽃도 파란 불이') >= 0 && t.$('#body').textContent.indexOf('별의 색은 표면 온도에 따라') >= 0, '책에 나온 것·내 생각');
  await t.click('#body [data-act="rd-src"][data-v="m9004"]');
  await t.waitFor(() => t.$$('#body .t-rd-q').length === 1);
  t.expect(/별빛은 얼마나 먼 길을 왔을까 · 2문단/.test(t.$('#body .t-rd-q .t-rd-where').textContent), '읽기자료는 문단');
  await t.click('#body [data-act="rd-src"][data-v=""]');
  await TV.idle();
});
add('선생님 · 확인할 답 CSV(일지 칸·AI 사용, 실명 없음)', async t => {
  await to211(t, 'fruits');
  await t.waitFor('[data-act="f-csv"]');
  const p = await t.api.pendingFruits(2, 11);
  const csv = TV.csvOf(p), lines = csv.replace(/^﻿/, '').split('\r\n');
  t.expect(lines[0].indexOf('"AI 사용"') >= 0 && lines[0].indexOf('"알아볼 방법"') >= 0 && lines[0].indexOf('"넓히기"') >= 0, '머리줄');
  t.eq(lines.length, p.length + 1, '줄 수');
  t.expect(lines[1].indexOf('"104"') === 0 && lines[1].indexOf('과학관 누리집: 빛은 1초에') >= 0 && lines[1].indexOf('맞았어요') >= 0, '104 일지 칸');
  t.expect(!NAMES.some(nm => csv.indexOf(nm) >= 0), 'CSV 에 이름이 없어야 해요');
  await TV.idle();
});
add('선생님 · 학생 성장 기록(열매 확인 아래 접는 카드 · 이름·번호·틀·문장·날짜 · CSV)', async t => {
  const y = QO.mock.h.schoolYear(), ago = hrs => new Date(Date.now() - hrs * 36e5).toISOString();
  t.db.growth_notes = [
    {id:1, user_id:'u-B', school_year:y, grade:2, class_no:11, frame:'change', parts:{before:'저항은 벽', now:'흐르기 어려운 정도'}, body:'처음에는 저항은 벽이라고 생각했는데, 지금은 흐르기 어려운 정도라고 생각해요.', created_at:ago(30)},
    {id:2, user_id:'u-A', school_year:y, grade:2, class_no:11, frame:'next', parts:{what:'자석 두 개로 하는 실험'}, body:'다음에는 자석 두 개로 하는 실험을 해 보고 싶어요.', created_at:ago(2)},
    {id:3, user_id:'u-E', school_year:y, grade:2, class_no:5, frame:'proud', parts:{what:'끝까지 한 것', why:'포기 안 했거든요'}, body:'이번에 내가 잘한 것은 끝까지 한 것이에요. 왜냐하면 포기 안 했거든요.', created_at:ago(1)},
    {id:4, user_id:'u-C', school_year:y - 1, grade:2, class_no:11, frame:'next', parts:{what:'작년 것'}, body:'다음에는 작년 것을 해 보고 싶어요.', created_at:ago(9000)}
  ];
  t.db.seq.growth_notes = 4;
  await to211(t, 'fruits');
  const fold = await t.waitFor('[data-act="sg-fold"]');
  t.eq(fold.getAttribute('aria-expanded'), 'false', '처음엔 접혀 있음');
  await t.click(fold);
  await t.waitFor(() => t.$$('#t_grow .t-sgi[data-id]').length === 2);
  const rows = t.$$('#t_grow .t-sgi[data-id]');
  t.eq(rows.map(r => r.dataset.id), ['2', '1'], '최신 먼저 · 다른 반·지난해 기록은 빠짐');
  t.expect(/1번 가람/.test(rows[0].textContent) && /다음에 해 볼 것/.test(rows[0].textContent) && rows[0].textContent.indexOf('자석 두 개로 하는 실험을') >= 0, '번호·이름·틀·문장');
  t.expect(/2번 나래/.test(rows[1].textContent) && /생각이 바뀐 것/.test(rows[1].textContent), '두 번째 줄');
  t.expect(/\d{2}\/\d{2} \d{2}:\d{2}/.test(rows[0].querySelector('.t-at').textContent), '날짜');
  t.eq(t.$('[data-act="sg-fold"]').getAttribute('aria-expanded'), 'true', '펼침 표시');
  t.expect(t.$('#t_grow [data-act="sg-csv"]'), 'CSV 단추');
  const csv = TV.growthCsv(TV.T.grow), lines = csv.slice(1).split('\r\n');
  t.eq(csv.charCodeAt(0), 0xFEFF, 'UTF-8 BOM');
  t.eq(lines[0], '"학생 번호","틀","문장","쓴 때"', '머리줄');
  t.eq(lines.length, 3, '줄 수');
  t.expect(lines[1].indexOf('"1","다음에 해 볼 것","다음에는 자석 두 개로') === 0, '첫 줄');
  t.expect(!NAMES.some(nm => csv.indexOf(nm) >= 0), 'CSV 에 이름이 없어야 해요');
  /* 반을 바꾸면 그 반 기록으로 */
  QO.app.setClass(2, 5); await TV.idle();
  await t.waitFor(() => t.$$('#t_grow .t-sgi[data-id]').length === 1 && t.$('#t_grow .t-sgi[data-id="3"]'));
  await TV.idle();
});
})();
