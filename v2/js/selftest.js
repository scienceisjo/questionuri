/* 질문과수원 2 — 스스로 시험(?selftest=1, 언제나 흉내 DB).
   QO.selftest.add(이름, async t => {…}) 로 등록하면 차례로 돈다. 시험마다 흉내 DB 를 처음 상태로 되돌리고
   학생 쪽은 A(가람), 선생님 쪽은 T 로 들어간 뒤 시작한다. 결과는 <pre id="qo-selftest">, 끝줄은 document.title 에도.
   모듈 시험은 각 모듈 파일 안에서 add 한다(이 파일은 뼈대 시험만). */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg;
const tests = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const desc = w => typeof w === 'string' ? w : (w && (w.label || String(w).slice(0, 80)));

const h = {
  wait: sleep,
  $: s => document.querySelector(s),
  $$: s => Array.from(document.querySelectorAll(s)),
  async waitFor(what, ms){
    ms = ms || 3000;
    const fn = typeof what === 'function' ? what : () => document.querySelector(what);
    const t0 = Date.now();
    for(;;){
      let v = null; try{ v = fn(); }catch(_){ v = null; }
      if(v) return v;
      if(Date.now() - t0 > ms) throw new Error('기다림 초과: ' + desc(what));
      await sleep(25);
    }
  },
  async click(sel){
    const el = typeof sel === 'string' ? await h.waitFor(sel, 2000) : sel;
    if(!el) throw new Error('누를 것이 없어요: ' + desc(sel));
    el.click(); await sleep(0);
    return el;
  },
  async type(sel, text){
    const el = typeof sel === 'string' ? await h.waitFor(sel, 2000) : sel;
    if(el.focus) el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    return el;
  },
  expect(cond, msg){ if(!cond) throw new Error(msg || '기대와 달라요'); },
  eq(a, b, msg){ const A = JSON.stringify(a), B = JSON.stringify(b); if(A !== B) throw new Error((msg || '값이 달라요') + ' — 기대 ' + B + ', 실제 ' + A); },
  async rejects(p, msg){
    try{ await (typeof p === 'function' ? p() : p); }
    catch(e){ if(msg != null && e.message !== msg) throw new Error('오류 문구가 달라요 — 기대 「' + msg + '」, 실제 「' + e.message + '」'); return e; }
    throw new Error('오류가 나야 하는데 통과했어요' + (msg ? ' (' + msg + ')' : ''));
  },
  /* 화면 없이 그 사람으로만 바꾼다(데이터 시험) */
  as(key){ return QO.mock.loginAs(key); },
  /* 그 사람으로 앱에 다시 들어간다(화면 시험) */
  async loginAs(key){ QO.mock.loginAs(key); await QO.app.enter(); await sleep(0); },
  render(){ QO.tabs.rerender(); },
  toastText(){ const t = document.getElementById('toast'); return t && t.classList.contains('show') ? t.textContent : ''; },
  get api(){ return QO.api; },
  get db(){ return QO.mock.db; },
  get state(){ return QO.state; }
};

function withTimeout(p, ms, name){
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과(' + ms + 'ms)')), ms))]);
}
let running = false;
async function run(){
  if(running) return; running = true;
  const out = QO.ui.debugPre('qo-selftest');
  const lines = ['SELFTEST START ' + cfg.page + ' · ' + tests.length + '개'];
  const paint = () => { out.textContent = lines.join('\n'); };
  paint();
  let pass = 0, fail = 0;
  const only = new URLSearchParams(location.search).get('only');      // ?only=이름 일부 — 그 시험만
  for(const t of tests){
    if(only && t.name.indexOf(only) < 0) continue;
    const before = QO.errors.length;
    try{
      QO.mock.reset();
      await h.loginAs(t.opt.as || (cfg.page === 'teacher' ? 'T' : 'A'));
      await withTimeout(Promise.resolve().then(() => t.fn(h)), t.opt.timeout || 12000);
      if(QO.errors.length > before) throw new Error('앱 오류 — ' + QO.errors.slice(before).map(e => '[' + e.ctx + '] ' + e.msg).join(' / '));
      pass++; lines.push('PASS ' + t.name);
    }catch(e){
      fail++; lines.push('FAIL ' + t.name + ': ' + (e && e.message || e));
    }
    QO.ui.closeDialogs();
    paint();
  }
  QO.mock.reset();
  try{ await h.loginAs(cfg.page === 'teacher' ? 'T' : 'A'); }catch(_){}
  const last = 'SELFTEST DONE pass=' + pass + ' fail=' + fail;
  lines.push(last); paint();
  document.title = last;
  document.body.dataset.selftest = 'done';
  running = false;
}
QO.selftest = {add(name, fn, opt){ tests.push({name:name, fn:fn, opt:opt || {}}); }, run, tests, h};
const add = QO.selftest.add;

/* ═══════════ 뼈대 시험 — 두 쪽 공통 ═══════════ */
add('뼈대 · api 이름과 인자 수가 진짜·흉내 양쪽에 같음', t => {
  const real = Object.keys(QO.apiReal).filter(k => typeof QO.apiReal[k] === 'function').sort();
  const fake = Object.keys(QO.mock.api).filter(k => typeof QO.mock.api[k] === 'function').sort();
  const onlyReal = real.filter(k => fake.indexOf(k) < 0), onlyFake = fake.filter(k => real.indexOf(k) < 0);
  t.expect(!onlyReal.length && !onlyFake.length, '한쪽에만 있음 — 진짜만: ' + onlyReal.join(',') + ' / 흉내만: ' + onlyFake.join(','));
  const arity = real.filter(k => QO.apiReal[k].length !== QO.mock.api[k].length);
  t.expect(!arity.length, '인자 수가 다름: ' + arity.map(k => k + '(' + QO.apiReal[k].length + '/' + QO.mock.api[k].length + ')').join(','));
  const need = ['signInStudent', 'signInTeacher', 'signOut', 'session', 'loadMe', 'myTree', 'myForest', 'loadMyQuestions', 'plantQuestion', 'saveJournal', 'loadMarks',
    'loadMyFootprints', 'loadCluesOnMine', 'markFbSeen', 'classmateQuestions', 'clueTargets', 'addClue', 'thankClue', 'declineClue', 'markCurious', 'mySentClues',
    'myGroup', 'startGroupInquiry', 'saveGroupStep', 'pickTeller', 'writeHeard', 'sendGroupInquiry', 'lessonLive', 'teacherMe', 'classList', 'classStudents',
    'pendingFruits', 'questionDetail', 'confirmFruit', 'returnFruit', 'classClues', 'hideClue', 'setGroups', 'classGroups', 'confirmGroup', 'returnGroup',
    'liveStart', 'liveSetStage', 'liveStop', 'cutoverStatus'];
  const miss = need.filter(k => real.indexOf(k) < 0);
  t.expect(!miss.length, '약속한 함수가 없음: ' + miss.join(','));
  t.expect(QO.api.loadMe === QO.mock.api.loadMe, '시연 모드인데 앞문이 흉내를 고르지 않았어요');
});

if(cfg.page === 'student'){
/* ═══════════ 학생 쪽 뼈대 ═══════════ */
add('뼈대 · mock 로그인과 머리글(제목·도토리·얼굴)', async t => {
  t.eq(t.state.me && t.state.me.name, '가람', '이름');
  t.eq(document.getElementById('acorn').textContent, '23', '도토리');
  t.eq(document.getElementById('meBtn').textContent, '가', '얼굴 글자');
  t.expect(!document.getElementById('app').classList.contains('out'), '로그인 화면이 그대로예요');
  t.eq(t.state.questions.length, t.db.questions.filter(q => q.user_id === 'u-A').length, '내 질문 수');
  t.expect(t.state.marks instanceof Map && t.state.marks.size > 0, '칸 표시(Map)');
});
add('뼈대 · 탭 여섯 전환', async t => {
  for(const id of ['mat', 'together', 'tree', 'grow', 'forest', 'explore']){
    await t.click('#nav [data-t="' + id + '"]');
    t.eq(QO.tabs.current(), id, '지금 탭');
    t.expect(document.querySelector('#nav [data-t="' + id + '"]').classList.contains('on'), id + ' 단추 표시');
    t.expect(document.getElementById('body').children.length > 0, id + ' 화면이 비었어요');
  }
  t.eq(QO.tabs.ids(), ['explore', 'mat', 'together', 'tree', 'grow', 'forest'], '탭 순서');
});
add('뼈대 · 학생 로그인 화면(틀린 비밀번호 → 맞는 비밀번호)', async t => {
  await QO.app.signOut(true);
  await t.waitFor(() => document.getElementById('app').classList.contains('out'));
  await t.click('#lgBtn');
  await t.waitFor(() => document.getElementById('lgErr').textContent === '학년·반·번호를 모두 입력해주세요');
  await t.type('#lgG', '2'); await t.type('#lgC', '11'); await t.type('#lgNum', '2'); await t.type('#lgPw', '0000');
  await t.click('#lgBtn');
  await t.waitFor(() => document.getElementById('lgErr').textContent === '학년·반·번호 또는 비밀번호를 확인해주세요');
  await t.type('#lgPw', '1234');
  await t.click('#lgBtn');
  await t.waitFor(() => !document.getElementById('app').classList.contains('out') && t.state.me && t.state.me.name === '나래');
  t.expect(t.state.questions.every(q => t.db.questions.find(x => x.id === q.id).user_id === 'u-B'), '다른 학생 질문이 섞였어요');
});
add('뼈대 · 시연 띠에서 학생 바꾸기', async t => {
  t.expect(!document.getElementById('mockbar').hidden, '시연 띠가 안 보여요');
  await t.click('#mockWho');
  await t.click('.qo-dialog [data-dlg="as-C"]');
  await t.waitFor(() => t.state.me && t.state.me.name === '다온');
  t.eq(document.getElementById('mockName').textContent, '다온 (2-11 3번)', '띠 이름');
});
add('뼈대 · 옮기지 않은 반은 질문과수원 1 안내만(탭·쓰기 없음)', async t => {
  const app = document.getElementById('app');
  await t.loginAs('E');
  await t.waitFor(() => app.classList.contains('notyet'));
  t.expect(!t.state.ready && getComputedStyle(document.getElementById('nav')).display === 'none' && getComputedStyle(document.getElementById('body')).display === 'none', '탭 화면 숨김');
  t.expect(getComputedStyle(document.getElementById('notyet')).display !== 'none' && getComputedStyle(document.getElementById('login')).display === 'none', '안내 화면');
  t.eq(document.getElementById('nyGo').getAttribute('href'), '../', '질문과수원 1 링크');
  t.eq(await t.api.myCutover(), null, '2-5반은 v2_cutover 에 없음');
  await t.click('#nyOut');
  await t.waitFor(() => !app.classList.contains('notyet') && app.classList.contains('out') && getComputedStyle(document.getElementById('login')).display !== 'none');
  await t.loginAs('A');
  await t.waitFor(() => t.state.ready && !app.classList.contains('out'));
  t.expect(await t.api.myCutover(), '2-11반은 옮긴 반');
});
add('뼈대 · 학생 정보를 잠깐 못 읽으면 로그아웃하지 않고 다시 해 보기', async t => {
  const n = QO.errors.length, orig = QO.mock.api.loadMe;
  QO.mock.api.loadMe = async () => { throw new Error('Failed to fetch'); };
  try{
    await QO.app.enter();
    await t.waitFor(() => document.getElementById('app').classList.contains('out') && !document.getElementById('lgRetry').hidden);
    t.expect(QO.mock.who() && QO.mock.who().key === 'A', '세션은 그대로');
  } finally { QO.mock.api.loadMe = orig; QO.err.clear(n); }
  await t.click('#lgRetry');
  await t.waitFor(() => t.state.ready && !document.getElementById('app').classList.contains('out'));
  t.expect(document.getElementById('lgRetry').hidden, '다시 들어오면 단추 숨김');
});
add('뼈대 · 얼굴 단추: 닫기가 주 단추, 로그아웃은 한 번 더 묻기', async t => {
  await t.click('#meBtn');
  const ok = await t.waitFor('.qo-dialog [data-dlg="ok"]');
  t.eq(ok.textContent, '닫기', '주 단추');
  t.expect(ok.classList.contains('btn') && !ok.classList.contains('line'), '닫기 모양');
  await t.click('.qo-dialog [data-dlg="out"]');
  await t.click(await t.waitFor('.qo-dialog [data-dlg="cancel"]'));
  t.expect(t.state.ready && QO.mock.who(), '「그대로」면 로그아웃 안 함');
});
add('뼈대 · 끄는 것을 잊은 지난 수업 진행은 학생 화면에 안 보임', async t => {
  const y = new Date(Date.now() - 864e5).toISOString();
  t.db.lesson_live.push({id:QO.mock.h.seq('lesson_live'), teacher_id:1, grade:2, class_no:11, mode:'clue', stage:2, stage_started_at:y, active:true, created_at:y});
  await QO.live.refresh();
  t.eq(t.state.live, null, '어제 켠 진행');
  const old = new Date(Date.now() - 100 * 60000).toISOString();
  t.expect(QO.live.stale({created_at:new Date().toISOString(), stage_started_at:old}) || QO.ui.kstDay(old) !== QO.ui.kstToday(), '단계가 90분 넘게 그대로');
  t.expect(!QO.live.stale({created_at:new Date().toISOString(), stage_started_at:new Date().toISOString()}), '지금 켠 진행');
});
add('뼈대 · 나도 궁금해요·모둠 열매·단원 붙이기·받은 꽃 읽기', async t => {
  await t.api.markCurious(121);
  t.eq(await t.api.myCurious(), [121], '내가 누른 질문');
  t.eq(await t.api.myGroupFruits(), [], '아직 모둠 열매 없음');
  const q = await t.api.plantQuestion({text:'단원 없이 심은 질문이에요', unit:''});
  t.eq(await t.api.setUnit(q.id, '전동기'), {id:q.id, unit:'전동기'}, '단원 붙이기');
  await t.rejects(t.api.setUnit(121, '전동기'), '내 질문만 고칠 수 있어요');
  t.eq(await t.api.receivedFlowers(), [], '받은 꽃 없음');
  await t.rejects(t.api.plantQuestion({text:'가'.repeat(501)}));
});
add('뼈대 · 오류 처리(P0001 은 그대로, 나머지는 「잠시 뒤」)', async t => {
  QO.ui.fail(QO.userError('같은 반 친구 질문에만 단서를 보낼 수 있어요'));
  t.eq(t.toastText(), '같은 반 친구 질문에만 단서를 보낼 수 있어요', '학생용 문구');
  const n = QO.errors.length;
  QO.ui.fail(new Error('network down'));
  t.eq(t.toastText(), '잠시 뒤 다시 해 주세요', '그 밖의 오류');
  t.eq(QO.errors.length, n + 1, 'QO.errors 에 쌓임');
  QO.err.clear(n);
  const b = document.createElement('button'); document.body.appendChild(b);
  let runs = 0;
  const work = () => { runs++; return t.wait(50).then(() => 'ok'); };
  const r = await Promise.all([QO.ui.busy(b, work), QO.ui.busy(b, work)]);
  b.remove();
  t.eq(runs, 1, '두 번 눌러도 한 번만');
  t.eq(r, ['ok', undefined], 'busy 결과');
});
add('뼈대 · 일지 보기(옛 solve·새 journal 함께 읽기)', async t => {
  const V = id => QO.journal.view(QO.store.question(id));
  const v105 = V(105);
  t.expect(v105.legacy && ['predict', 'method', 'find', 'wrap'].every(k => QO.journal.stepDone(v105, k)), '옛 solve 만 있는 질문의 칸');
  t.eq(v105.status, 'open', '105 상태');
  t.expect(V(109).legacyHarvest, '옛 수확 열매');
  t.eq(V(104).status, 'wait', '104 확인 요청');
  t.eq(V(106).status, 'fruit', '106 열매'); t.expect(V(106).sprout, '106 새싹');
  t.eq(V(107).status, 'fog', '107 안개');
  t.eq(V(103).d.flag.step, 'find', '103 막힘 표시');
  t.eq(QO.journal.curStep(V(102)), 'find', '102 다음 칸');
  t.eq(QO.journal.prints(V(102)), 2, '102 칸 수');
  t.eq(QO.journal.curStep(V(108)), 'refine', '108 선생님 다듬기 글');
  t.eq(QO.journal.curStep(V(101)), 'predict', '101 새 질문');
});
add('뼈대 · 수업 진행 읽기(lesson_live → live:changed)', async t => {
  let got = null;
  const fn = QO.bus.on('live:changed', e => { got = e; });
  t.as('T'); const row = await t.api.liveStart(2, 11, 'clue');
  t.as('A'); await QO.live.refresh();
  QO.bus.off('live:changed', fn);
  t.expect(got && got.live && got.live.id === row.id && got.live.mode === 'clue', 'live:changed 가 안 왔어요');
  t.eq(t.state.live.stage, 0, '첫 단계');
  t.expect(QO.live.left() > 50, '남은 시간');
});
add('뼈대 · 기기 시계가 달라도 단계 타이머가 바로 0:00 이 되지 않음', async t => {
  const ago = s => new Date(Date.now() - s * 1000).toISOString();
  /* 늦게 들어온 학생 — 기기 시계로 센다 */
  const row = {id:QO.mock.h.seq('lesson_live'), teacher_id:1, grade:2, class_no:11, mode:'clue', stage:1, stage_started_at:ago(30), active:true, created_at:ago(200)};
  t.db.lesson_live.push(row);
  QO.live.reset();                       // 방금 앱을 연 것처럼(앞 읽기 없음)
  await QO.live.refresh();
  const l1 = QO.live.left();
  t.expect(l1 > 20 && l1 < 35, '늦게 들어오면 30초 지난 것으로: ' + l1);
  /* 지켜보는 중에 단계가 바뀌었는데 선생님 기기 시계가 3분 늦음 */
  row.stage = 2; row.stage_started_at = ago(180);
  await QO.live.refresh();
  const l2 = QO.live.left();
  t.expect(l2 > 105, '방금 바뀐 단계는 거의 처음부터: ' + l2);
});
add('뼈대 · 심기(지금 차시·과목·나무·꼬리 질문 차시)', async t => {
  const a = await t.api.plantQuestion({text:'자석을 반으로 자르면 극은 어떻게 될까?'});
  t.eq([a.unit, a.subject_id, a.tree_id, a.fruit_kind, a.resolve_requested_at], ['코일 주위의 자기장', 'science_u-A', 201, null, null], '심은 질문');
  t.eq(t.db.questions.find(q => q.id === a.id).phase, 'before', 'phase');
  const b = await t.api.plantQuestion({text:'나중에 단원을 고를 질문이에요', unit:''});
  t.eq(b.unit, null, '나중에 고를래요');
  const c = await t.api.plantQuestion({text:'습도가 높으면 정전기는 어떻게 될까?', parent_id:102});
  t.eq([c.unit, c.parent_id], ['마찰 전기', 102], '꼬리 질문은 부모 차시');
  await t.api.markFbSeen(108);
  t.eq(t.db.questions.find(q => q.id === 108).fb_unread, false, '피드백 읽음');
});

/* ═══════════ 흉내 규칙 = SQL 규칙 ═══════════ */
add('흉내 규칙 · save_journal 키 단위로 합치기·예상 덧붙이기', async t => {
  await t.api.saveJournal(101, {method:{kind:'book', plan:''}});
  const r = await t.api.saveJournal(101, {predict_add:'자석과 전류가 밀어서 그런 것 같다. 왜냐하면 자석 근처라서.'});
  t.expect(r.journal.method && r.journal.method.kind === 'book' && r.journal.predict.length === 1, '앞서 저장한 칸이 사라졌어요');
  const q = t.db.questions.find(x => x.id === 101);
  t.eq(q.solve.how, ['src'], 'solve.how'); t.expect(q.solve.guess.indexOf('자석과') === 0, 'solve.guess');
  const r2 = await t.api.saveJournal(102, {predict_add:'생각이 바뀌었다. 습도가 낮으면 전기가 빠져나가지 못해서다.'});
  t.eq(r2.journal.predict.length, 2, '예상은 덧붙는다');
  t.expect(t.db.questions.find(x => x.id === 102).solve.guess.indexOf('겨울엔') === 0, '처음 예상(solve.guess)은 그대로');
});
add('흉내 규칙 · 막힘 표시 세우기·내리기', async t => {
  let r = await t.api.saveJournal(101, {flag:{step:'predict', tried:'무엇부터 생각할지 모르겠어요'}});
  t.eq(r.journal.flag.step, 'predict', '세우기');
  r = await t.api.saveJournal(101, {flag:null});
  t.expect(!r.journal.flag, 'null 이면 내림');
  r = await t.api.saveJournal(103, {find_add:{src:'교과서 120쪽', text:'도선 바로 아래에 나침반을 두면 바늘이 돌아간다.'}});
  t.expect(!r.journal.flag, '그 칸을 저장하면 막힘 표시가 내려가야 해요');
  r = await t.api.saveJournal(101, {flag:{step:'method', tried:'방법을 못 정했어요'}});
  r = await t.api.saveJournal(101, {method:{kind:'exp', plan:'자석 가까이에 전선을 두고 전류를 흘려 보기'}});
  t.expect(!r.journal.flag, 'method 저장 → 내림');
});
add('흉내 규칙 · wrap 은 확인 요청, 되돌림 표시는 지운다', async t => {
  const r = await t.api.saveJournal(102, {wrap:{mode:'known', text:'습도가 낮으면 전기가 공기로 빠져나가지 못해 정전기가 잘 생긴다.', cmp:'part'}});
  t.expect(!!r.resolve_requested_at, 'resolve_requested_at');
  const q = t.db.questions.find(x => x.id === 102);
  t.expect(q.finding && q.solve.answer === q.finding, 'finding·solve.answer');
  t.as('B');
  const r2 = await t.api.saveJournal(122, {wrap:{mode:'unknown', reached:'교과서 92쪽에서 저항이 크면 전류가 작다는 것을 찾았다.', stuckQ:'저항은 왜 전류를 방해할까?', why:'용어가 어려움'}});
  t.expect(!r2.journal.returned && !!r2.resolve_requested_at, '되돌림 표시');
  const q2 = t.db.questions.find(x => x.id === 122);
  t.eq([q2.solve.stuck, q2.still_wondering], [1, '저항은 왜 전류를 방해할까?'], '아직 모름 → stuck·still_wondering');
});
add('흉내 규칙 · 열매 뒤에도 고침(v2_11 고친 시각) · 남의 질문은 못 고침', async t => {
  const r = await t.api.saveJournal(106, {extend:{kind:'newq', text:'지구도 큰 자석일까?'}});
  t.eq(r.journal.extend.kind, 'newq', '넓히기');
  t.eq(t.db.questions.find(x => x.id === 106).solve.newq, '지구도 큰 자석일까?', 'solve.newq');
  t.expect(!r.journal.edited_at, '넓히기는 고침으로 치지 않아요');
  const r2 = await t.api.saveJournal(106, {predict_add:'다시 생각해 보니 다르다'});
  t.expect(r2.journal.predict.length === 2 && !!r2.journal.edited_at && r2.fruit_kind === 'fruit', '열매 뒤에도 예상을 더하고 고친 시각이 찍혀야 해요');
  const r3 = await t.api.saveJournal(106, {wrap:{mode:'known', text:'열매 뒤에 정리를 고쳤어요. 철가루가 자기장을 따라 늘어선다.', cmp:'part'}});
  t.eq([r3.resolve_requested_at, r3.fruit_kind], [null, 'fruit'], '열매 뒤 정리는 확인 요청을 다시 보내지 않아요');
  await t.rejects(t.api.saveJournal(121, {predict_add:'남의 질문'}), '내 질문만 고칠 수 있어요');
  t.as('T');
  await t.rejects(t.api.saveJournal(101, {predict_add:'선생님도 못 고침'}), '내 질문만 고칠 수 있어요');
});
add('흉내 규칙 · 칸 표시는 글이 바뀔 때만(method 2자·나머지 5자)', async t => {
  const mk = (q, s) => t.db.step_marks.find(m => m.question_id === q && m.step === s);
  await t.api.saveJournal(101, {method:{kind:'ai', plan:''}});
  const a = Object.assign({}, mk(101, 'method')); t.expect(a.text_md5, 'method 2자도 표시');
  await t.wait(5);
  await t.api.saveJournal(101, {method:{kind:'ai', plan:''}});
  t.eq(mk(101, 'method').last_at, a.last_at, '같은 글이면 last_at 그대로');
  await t.wait(5);
  await t.api.saveJournal(101, {method:{kind:'web', plan:''}});
  const b = mk(101, 'method');
  t.expect(b.last_at > a.last_at && b.text_md5 !== a.text_md5 && b.first_at === a.first_at, '글이 바뀌면 last_at·md5 갱신');
  await t.api.saveJournal(101, {predict_add:'몰라요'});
  t.expect(!mk(101, 'predict'), '5자 안 되는 예상은 표시 안 함');
  t.eq(t.db.questions.find(x => x.id === 101).journal.predict.length, 1, '그래도 일지에는 남음');
});
add('흉내 규칙 · 발자국은 처음 채울 때 한 번', async t => {
  const fp = () => t.db.footprints.filter(f => f.question_id === 101);
  t.eq(fp().length, 0, '처음');
  await t.api.saveJournal(101, {predict_add:'자석이 밀고 당겨서 도는 것 같다. 왜냐하면 자석이 있으니까.'});
  await t.api.saveJournal(101, {predict_add:'바뀐 생각: 전류의 방향이 바뀌어서 같은 쪽으로 도는 것 같다.'});
  await t.api.saveJournal(101, {refine:'전동기 속 코일은 어떻게 한 방향으로만 계속 돌까?'});
  t.eq(fp().map(f => f.step), ['predict'], '예상 발자국 하나, 다듬기는 세지 않음');
  const mine = await t.api.loadMyFootprints();
  t.expect(mine.some(f => f.question_id === 101 && f.step === 'predict') && mine.every(f => t.db.footprints.find(x => x.id === f.id).user_id === 'u-A'), '내 발자국만');
});
add('흉내 규칙 · add_clue 관문(내 질문·다른 반·종류·빈칸·같은 종류·하루 10개)', async t => {
  await t.rejects(t.api.addClue(101, 'where', '교과서 10쪽 보기'), '내 질문에는 단서를 보낼 수 없어요');
  await t.rejects(t.api.addClue(171, 'where', '교과서 10쪽 보기'), '같은 반 친구 질문에만 단서를 보낼 수 있어요');
  await t.rejects(t.api.addClue(131, 'zzz', '교과서 10쪽 보기'), '단서 종류가 올바르지 않아요');
  await t.rejects(t.api.addClue(131, 'where', '교과서'), '빈칸을 채워서 보내 주세요');
  await t.rejects(t.api.addClue(131, 'where', '교과서 __쪽 · 검색어 코일'), '빈칸을 채워서 보내 주세요');
  await t.rejects(t.api.addClue(9999, 'where', '교과서 10쪽 보기'), '질문을 찾을 수 없어요');
  const id = await t.api.addClue(131, 'where', '교과서 118쪽 · 검색어 코일 자기장');
  t.expect(typeof id === 'number', '단서 번호');
  const c = t.db.clues.find(x => x.id === id);
  t.eq([c.step, c.grade, c.class_no], ['find', 2, 11], '단서 칸·반');
  await t.rejects(t.api.addClue(131, 'where', '교과서 120쪽 보기'), '이 질문에는 같은 종류의 단서를 이미 보냈어요');
  const today = QO.ui.dayStartISO();
  const qs = [121, 122, 123, 131, 132, 141, 142, 151, 161], kinds = ['where', 'test', 'me', 'ask'];
  let sent = t.db.clues.filter(x => x.author_id === 'u-A' && x.created_at >= today).length;
  outer: for(const q of qs){ for(const k of kinds){
    if(sent >= 10) break outer;
    if(t.db.clues.some(x => x.question_id === q && x.author_id === 'u-A' && x.kind === k)) continue;
    await t.api.addClue(q, k, '단서 문장 ' + q + k); sent++;
  } }
  await t.rejects(t.api.addClue(161, 'ask', '그럼 여름에는 어떨까요?'), '오늘은 단서를 충분히 보냈어요');
});
add('흉내 규칙 · thank_clue(칸을 고친 뒤에만·글 길이·꽃·다리)', async t => {
  await t.rejects(t.api.thankClue(501, '덕분에 찾았어요'), '이 단서를 보고 그 칸을 적거나 고친 뒤에 보낼 수 있어요');
  t.as('B');
  await t.rejects(t.api.thankClue(501, '덕분에 찾았어요'), '내 질문에 온 단서에만 고마움을 보낼 수 있어요');
  t.as('A');
  t.expect(!(await t.api.myForest()).some(p => p.place === 'bridge'), '다리는 처음엔 잠김');
  await t.api.saveJournal(102, {find_add:{src:'교과서 112쪽', text:'습도가 낮으면 전기가 공기 중으로 잘 빠져나가지 못한다.'}});
  await t.rejects(t.api.thankClue(501, '덕분'), '무엇 덕분이었는지 한 줄로 적어 주세요');
  t.eq(await t.api.thankClue(501, '찾아볼 쪽수를 알았어요'), true, '고마움');
  t.eq(t.db.flowers.filter(f => f.receiver === 'u-B').length, 1, '나래에게 꽃');
  t.expect((await t.api.myForest()).some(p => p.place === 'bridge'), '다리가 열려야 해요');
  t.eq(await t.api.thankClue(501, '다시 보내도'), true, '이미 보낸 고마움은 그대로 true');
  t.eq(t.db.flowers.length, 1, '꽃은 한 번');
  await t.api.saveJournal(102, {predict_add:'바뀐 생각 하나 더 적어 봐요'});
  t.eq(await t.api.declineClue(501), false, '고마움을 보낸 단서는 거절 못 함');
});
add('흉내 규칙 · 꽃은 받는 사람 하루 3개', async t => {
  t.as('B');
  const targets = [[101, 'A'], [132, 'C'], [142, 'D'], [151, 'F']];
  const ids = [];
  for(const x of targets) ids.push(await t.api.addClue(x[0], 'where', '교과서 50쪽 · 검색어 단서'));
  for(let i = 0; i < targets.length; i++){
    t.as(targets[i][1]);
    await t.api.saveJournal(targets[i][0], {find_add:{src:'교과서 50쪽', text:'단서를 보고 찾아본 내용을 적었다.'}});
    t.eq(await t.api.thankClue(ids[i], '덕분에 찾았어요 ' + i), true, '고마움 ' + i);
  }
  t.eq(t.db.flowers.filter(f => f.receiver === 'u-B').length, 3, '꽃은 셋까지');
  t.expect(t.db.clues.find(c => c.id === ids[3]).thanked_at, '넷째도 고마움 글은 남음');
});
add('흉내 규칙 · 심기·물주기 도토리(한 번씩·남의 질문·하루 상한)', async t => {
  t.as('A');
  const seeds = () => t.db.profiles.find(p => p.id === 'u-A').seeds;
  const s0 = seeds();
  const q = await t.api.plantQuestion({text:'도토리 시험으로 심는 질문이에요'});
  let r = await t.api.acornFor('plant', q.id);
  t.eq([r.granted, r.seeds, seeds()], [1, s0 + 1, s0 + 1], '심기 +1');
  t.eq((await t.api.acornFor('plant', q.id)).granted, 0, '같은 질문 두 번은 안 줌');
  t.eq((await t.api.acornFor('plant', 121)).granted, 0, '남의 질문은 심기 도토리 없음');
  t.eq((await t.api.acornFor('water', 121)).granted, 0, '물을 안 줬으면 없음');
  await t.api.markCurious(121);
  t.eq((await t.api.acornFor('water', 121)).granted, 1, '친구 질문 물주기 +1');
  t.eq((await t.api.acornFor('water', 121)).granted, 0, '같은 질문 물주기 두 번은 안 줌');
  for(let i = 0; i < 8; i++){ const x = await t.api.plantQuestion({text:'하루 상한을 보려고 심는 질문 ' + '가나다라마바사아'[i]}); await t.api.acornFor('plant', x.id); }
  t.eq(t.db.acorn_ledger.filter(l => l.user_id === 'u-A' && (l.reason === 'plant' || l.reason === 'water')).length, 8, '하루 8개까지');
});
add('흉내 규칙 · confirm_fruit(도토리 = 발자국 칸 수 + 5, 안개면 샘물)', async t => {
  const n = new Set(t.db.footprints.filter(f => f.question_id === 104).map(f => f.step)).size;
  await t.rejects(t.api.confirmFruit(104, 'fruit'), '선생님만 할 수 있어요');
  t.as('T');
  await t.rejects(t.api.confirmFruit(104, 'apple'), '열매 종류가 올바르지 않아요');
  await t.rejects(t.api.confirmFruit(9999, 'fruit'), '질문을 찾을 수 없어요');
  const before = t.db.profiles.find(p => p.id === 'u-A').seeds;
  t.eq(await t.api.confirmFruit(104, 'fruit'), n + 5, '도토리 수');
  const q = t.db.questions.find(x => x.id === 104);
  t.eq([q.fruit_kind, q.fruit_source, q.resolved, q.resolve_requested_at], ['fruit', 'teacher', true, null], '열매 칸');
  t.eq(t.db.profiles.find(p => p.id === 'u-A').seeds, before + n + 5, 'profiles.seeds');
  t.eq(await t.api.confirmFruit(104, 'fruit'), 0, '두 번째는 0');
  t.expect(!t.db.class_forest_unlocks.some(u => u.grade === 2 && u.class_no === 5), '2-5 샘물은 아직');
  t.eq(await t.api.confirmFruit(172, 'fog'), new Set(t.db.footprints.filter(f => f.question_id === 172).map(f => f.step)).size + 5, '안개 도토리');
  t.expect(t.db.class_forest_unlocks.some(u => u.grade === 2 && u.class_no === 5 && u.place === 'spring'), '샘물');
  t.eq(t.db.questions.find(x => x.id === 172).resolved, false, '안개는 resolved=false');
  t.as('A');
  const tr = await t.api.myTree();
  t.eq([tr.fruit, tr.fog], [3, 1], '내 나무 열매');
});
add('흉내 규칙 · return_fruit(칸 짚어 되돌리기)', async t => {
  t.as('T');
  t.eq(await t.api.returnFruit(104, 'find', '한 곳 더 찾아볼까요?'), true, '되돌림');
  const q = t.db.questions.find(x => x.id === 104);
  t.eq([q.journal.returned.step, q.teacher_nudge, q.fb_unread, q.resolve_requested_at], ['find', '한 곳 더 찾아볼까요?', true, null], '되돌린 칸');
  t.eq(await t.api.returnFruit(106, 'find', 'x'), false, '열매는 되돌리지 않음');
  t.as('A');
  await QO.store.refreshQuestions();
  const v = QO.journal.view(QO.store.question(104));
  t.eq([v.status, QO.journal.curStep(v), v.d.returned.note], ['open', 'find', '한 곳 더 찾아볼까요?'], '학생 쪽 보기');
});
add('흉내 규칙 · 모둠 관문(시작·칸 쓰기·보내기·들은 것·뽑기·열매)', async t => {
  await t.rejects(t.api.startGroupInquiry(11, null, '번개는 왜 생길까요', ''), '이미 함께 푸는 질문이 있어요');
  await t.rejects(t.api.startGroupInquiry(12, null, '자석은 왜 붙을까요', ''), '우리 모둠만 시작할 수 있어요');
  t.as('C');
  await t.rejects(t.api.startGroupInquiry(12, 101, null, ''), '모둠원의 질문만 고를 수 있어요');
  await t.rejects(t.api.startGroupInquiry(12, null, '짧음', ''), '질문을 다섯 글자 넘게 적어 주세요');
  const inq = await t.api.startGroupInquiry(12, 131, null, '모두 궁금함');
  const g = await t.api.myGroup();
  t.eq([g.group.id, g.inquiry.id, g.inquiry.question_text, g.members.map(m => m.number)], [12, inq, '코일에 전류가 흐르면 왜 자석처럼 될까?', [3, 4, 6]], '내 모둠');
  const S = k => g.steps.filter(s => s.kind === k);
  t.eq(g.steps.length, 13, '칸 수(3명: 예상 3 · 방법 · 찾기 2 · 비교 · 정리 · 내 칸 3 · 설명 · 들은 것)');
  t.eq([S('method')[0].assignee_id, S('find')[0].assignee_id, S('find')[1].assignee_id, S('compare')[0].assignee_id, S('wrap')[0].assignee_id], ['u-C', 'u-D', 'u-G', 'u-D', 'u-C'], '역할');
  await t.rejects(t.api.saveGroupStep(S('find')[0].id, '교과서에서 찾음', '교과서'), '맡은 칸만 쓸 수 있어요');
  await t.rejects(t.api.saveGroupStep(S('tell')[0].id, '설명합니다요', ''), '이 칸은 따로 써요');
  await t.rejects(t.api.sendGroupInquiry(inq), '정리가 먼저 차야 해요');
  t.as('D');
  await t.rejects(t.api.saveGroupStep(S('compare')[0].id, '두 곳이 같아요', ''), '찾기 두 칸이 먼저 차야 해요');
  await t.rejects(t.api.saveGroupStep(S('find')[0].id, '짧음', ''), '네 글자 넘게 적어 주세요');
  t.eq(await t.api.saveGroupStep(S('find')[0].id, '코일에 전류가 흐르면 자기장이 생긴다.', '교과서 118쪽'), true, '찾기 ①');
  t.as('G');
  await t.api.saveGroupStep(S('find')[1].id, '전류가 흐르는 코일 주위에 나침반을 두면 바늘이 움직인다.', '실험 영상');
  t.as('C');
  await t.rejects(t.api.saveGroupStep(S('wrap')[0].id, '정리해 봅니다', ''), '두 출처 비교가 먼저 차야 해요');
  t.as('G');
  t.eq(await t.api.saveGroupStep(S('compare')[0].id, '두 곳 모두 자기장이 생긴다고 해요', ''), true, '찾기 맡은 사람은 비교를 쓸 수 있음');
  t.as('C');
  await t.rejects(t.api.saveGroupStep(S('used').find(s => s.assignee_id === 'u-C').id, '내 칸이 쓰였어요', ''), '정리가 먼저 차야 해요');
  await t.api.saveGroupStep(S('wrap')[0].id, '코일에 전류가 흐르면 주위에 자기장이 생겨 자석처럼 된다.', '');
  await t.api.saveGroupStep(S('used').find(s => s.assignee_id === 'u-C').id, '정리 문장을 내가 받아 적었어요', '');
  t.as('D');
  await t.api.saveGroupStep(S('used').find(s => s.assignee_id === 'u-D').id, '내가 찾은 교과서 내용이 첫 문장에 들어갔어요', '');
  t.as('A');
  await t.rejects(t.api.pickTeller(inq), '우리 모둠만 할 수 있어요');
  t.as('D');
  const who = await t.api.pickTeller(inq);
  t.expect(['u-C', 'u-D', 'u-G'].indexOf(who) >= 0, '모둠원 중에서 뽑기');
  t.eq(await t.api.sendGroupInquiry(inq), true, '보내기');
  t.as('G');
  await t.rejects(t.api.saveGroupStep(S('used').find(s => s.assignee_id === 'u-G').id, '이제는 못 써요', ''), '선생님께 보낸 뒤에는 고칠 수 없어요');
  t.as('C');
  await t.rejects(t.api.writeHeard(inq, '한 줄 요약과 되묻기'), '설명을 들은 옆 모둠이 남겨요');
  t.as('E');
  await t.rejects(t.api.writeHeard(inq, '한 줄 요약과 되묻기'), '같은 반만 남길 수 있어요');
  t.as('A');
  await t.rejects(t.api.writeHeard(inq, '짧다'), '한 줄 요약과 되묻기를 적어 주세요');
  const nb = await t.api.neighborInquiries();
  t.eq(nb.map(x => x.inquiry_id), [inq], '옆 모둠 질문');
  t.eq(await t.api.writeHeard(inq, '코일이 자석이 된대요 · 되묻기: 전류를 끊으면 어떻게 될까?'), true, '들은 것');
  t.as('T');
  t.eq(await t.api.confirmGroup(inq), 2, '열매는 맡은 칸 + 「내 칸이 정리 어디에」 쓴 두 명');
  t.eq(t.db.group_fruits.map(f => f.user_id).sort(), ['u-C', 'u-D'], '모둠 열매 받은 사람');
  const fo = t.db.class_forest_unlocks.filter(u => u.grade === 2 && u.class_no === 11).map(u => u.place);
  t.expect(fo.indexOf('winter') >= 0 && fo.indexOf('obs') < 0, '겨울 숲은 열리고 관측소는 아직(1모둠 정리 전)');
  t.eq(await t.api.returnGroup(inq, '다시'), false, '열매 뒤 되돌리기 없음');
});
add('흉내 규칙 · my_tree 레벨 = max(지금 레벨, 열매+안개+모둠열매+1)', async t => {
  let tr = await t.api.myTree();
  t.eq([tr.fruit, tr.fog, tr.sprout, tr.group_fruit, tr.legacy_level, tr.level], [2, 1, 1, 0, 3, 4], '가람 나무');
  t.db.legacy_level.find(l => l.user_id === 'u-A').level = 7;
  tr = await t.api.myTree();
  t.eq(tr.level, 7, '찍어 둔 레벨보다 작아지지 않음');
  t.as('E');
  tr = await t.api.myTree();
  t.eq([tr.legacy_level, tr.level], [null, 1], '옮기지 않은 반');
});
add('흉내 규칙 · classmate_questions(익명은 이름 없음·고른 칸만)', async t => {
  const rows = await t.api.classmateQuestions(60, null);
  const keys = ['id', 'body', 'unit', 'is_anonymous', 'owner_name', 'owner_number', 'flag_step', 'flag_tried', 'clue_count', 'created_at'];
  t.expect(rows.length > 0 && rows.every(r => JSON.stringify(Object.keys(r)) === JSON.stringify(keys)), '돌려주는 칸');
  t.expect(rows.every(r => t.db.questions.find(q => q.id === r.id).user_id !== 'u-A'), '내 질문은 빠짐');
  t.expect(!rows.some(r => r.id === 171), '다른 반은 빠짐');
  const an = rows.find(r => r.id === 123);
  t.eq([an.is_anonymous, an.owner_name, an.owner_number], [true, null, null], '익명');
  t.eq(rows.find(r => r.id === 121).owner_name, '나래', '이름');
  const two = await t.api.classmateQuestions(2, null);
  t.eq(two.length, 2, 'limit');
  const older = await t.api.classmateQuestions(60, two[1].id);
  t.expect(older.length > 0 && older.every(r => r.id < two[1].id), 'before');
});
add('흉내 규칙 · clue_targets(막힘 표시만·익명·내 것·내 모둠 질문 빼고)', async t => {
  const ids = (await t.api.clueTargets(6)).map(r => r.id).sort();
  t.eq(ids, [131, 141], '가람에게 올 막힌 질문(같은 모둠 나래의 121 은 빠짐)');
  const first = (await t.api.clueTargets(null));
  t.eq(first.length, 2, '기본 두 개');
  const orderA = (await t.api.clueTargets(6)).map(r => r.id);
  t.as('B');
  t.eq((await t.api.clueTargets(6)).map(r => r.id), orderA, '같은 모둠은 같은 질문을 같은 순서로');
  t.as('A');
  t.as('F');
  await t.api.saveJournal(151, {flag:{step:'find', tried:'교과서에 번개 사진만 있어요'}});
  t.as('A');
  t.expect(!(await t.api.clueTargets(6)).some(r => r.id === 151), '내 모둠 질문은 빠짐');
  t.as('C');
  t.expect((await t.api.clueTargets(6)).some(r => r.id === 151), '다른 모둠에게는 보임');
});
add('흉내 규칙 · 수업 진행(같은 반 active 는 하나)', async t => {
  t.as('T');
  const a = await t.api.liveStart(2, 11, 'clue');
  const b = await t.api.liveStart(2, 11, 'group');
  t.eq(t.db.lesson_live.filter(l => l.active && l.grade === 2 && l.class_no === 11).map(l => l.id), [b.id], 'active 하나');
  const s = await t.api.liveSetStage(b.id, 3);
  t.eq(s.stage, 3, '단계');
  t.as('A');
  t.eq((await t.api.lessonLive()).id, b.id, '학생이 읽는 행');
  t.as('E');
  t.eq(await t.api.lessonLive(), null, '다른 반은 없음');
  t.as('T');
  await t.api.liveStop(b.id);
  t.as('A');
  t.eq(await t.api.lessonLive(), null, '끄면 null');
});
}

if(cfg.page === 'teacher'){
/* ═══════════ 선생님 쪽 뼈대 ═══════════ */
add('선생님 뼈대 · mock 선생님 로그인과 반 목록', async t => {
  t.eq(t.state.teacher && t.state.teacher.id, 1, '선생님');
  t.expect(!document.getElementById('app').classList.contains('out'), '로그인 화면이 그대로예요');
  const keys = t.state.classes.map(c => c.grade + '-' + c.class_no);
  t.eq(keys, ['2-5', '2-11'], '학생이 있는 반');
  t.eq(t.state.classes.find(c => c.class_no === 11).n, 6, '2-11 학생 수');
  t.expect(t.state.cls && t.state.cls.grade === 2, '고른 반');
});
add('선생님 뼈대 · 반 고르기(class:changed)', async t => {
  let got = null;
  const fn = QO.bus.on('class:changed', c => { got = c; });
  const cs = document.getElementById('tClass');
  cs.value = '11'; cs.dispatchEvent(new Event('change', {bubbles:true}));
  t.eq(got, {grade:2, class_no:11}, '2-11');
  cs.value = '5'; cs.dispatchEvent(new Event('change', {bubbles:true}));
  QO.bus.off('class:changed', fn);
  t.eq(t.state.cls, {grade:2, class_no:5}, '2-5');
});
add('선생님 뼈대 · 구역 여섯 전환', async t => {
  t.eq(QO.tabs.ids(), ['fruits', 'opened', 'live', 'groups', 'clues', 'read'], '구역 순서');
  for(const id of ['opened', 'live', 'groups', 'clues', 'read', 'fruits']){
    await t.click('#nav [data-t="' + id + '"]');
    t.eq(QO.tabs.current(), id, '지금 구역');
    t.expect(document.getElementById('body').children.length > 0, id + ' 화면이 비었어요');
  }
});
add('선생님 뼈대 · 칠판 화면 열고 닫기', async t => {
  await t.click('#boardBtn');
  t.expect(document.getElementById('board').classList.contains('show') && document.documentElement.classList.contains('board-on'), '칠판 화면이 안 열렸어요');
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  t.expect(!document.getElementById('board').classList.contains('show') && !document.documentElement.classList.contains('board-on'), 'Esc 로 닫혀야 해요');
});
add('선생님 뼈대 · 학생 계정은 「선생님 계정이 아니에요」', async t => {
  await QO.app.signOut(true);
  await t.waitFor(() => document.getElementById('app').classList.contains('out'));
  await t.type('#lgEmail', 's2_11_1@haenuri.app'); await t.type('#lgPw', '1234');
  await t.click('#lgBtn');
  await t.waitFor(() => document.getElementById('lgErr').textContent === '선생님 계정이 아니에요');
  await t.type('#lgEmail', 'teacher@haenuri.app'); await t.type('#lgPw', '1234');
  await t.click('#lgBtn');
  await t.waitFor(() => !document.getElementById('app').classList.contains('out') && t.state.teacher);
});
add('선생님 뼈대 · 열매 확인 자료(pendingFruits·questionDetail·classClues·classGroups)', async t => {
  const p = await t.api.pendingFruits(2, 11);
  t.eq(p.map(q => [q.id, q.student.name]), [[104, '가람']], '확인할 열매');
  const d = await t.api.questionDetail(104);
  t.expect(d.question.user_id === 'u-A' && d.marks.length >= 4 && d.footprints.length === 4 && d.student.number === 1, '질문 자세히');
  const cl = await t.api.classClues(2, 11, QO.ui.kstDay(t.db.clues.find(c => c.id === 502).created_at));
  t.expect(cl.some(c => c.id === 502 && c.author_name === '가람' && c.question_text.indexOf('병렬') > 0), '단서 살피기');
  const gs = await t.api.classGroups(2, 11);
  t.eq(gs.map(g => [g.group.group_no, g.members.length, !!g.inquiry]), [[1, 3, true], [2, 3, false]], '모둠');
  t.eq((await t.api.cutoverStatus()).map(c => c.class_no), [11], '옮긴 반');
  t.eq(await t.api.setGroups(2, 5, [{group_no:1, name:'1모둠', numbers:[1]}]), 1, '모둠 편성');
  t.eq((await t.api.classForest(2, 11)).map(f => f.place), ['spring'], '반 숲');
});
}
})();
