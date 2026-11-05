/* 질문과수원 2 — 흉내 DB(QO.mock). ?mock=1 · ?selftest=1 에서만 쓴다. 서버에 아무것도 보내지 않는다.
   규칙·오류 문구는 sql/v2_01_기초.sql 을 그대로 옮겼다(함수마다 SQL 이름을 적어 둠).
   localStorage 'qo2-mock-v1' 에 저장. 지연 80~200ms(selftest 는 15~45ms, ?slow=1 이면 그대로).
   함수 하나는 거래 하나: 중간에 오류가 나면 DB 를 그 전으로 되돌린다. */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg;
const KEY = 'qo2-mock-v1', VER = 1;
const WHO_KEY = 'qo2-mock-who-' + cfg.page;
const COLS = QO.COLS.split(',').concat(QO.COLS.indexOf('teacher_answer') < 0 ? ['teacher_answer'] : []);
const CLUE_COLS = QO.CLUE_COLS.split(',');
const COUNTED = ['predict', 'method', 'find', 'wrap', 'extend'];
const TEACHER_FB = ['teacher_nudge', 'teacher_stamp', 'teacher_solve_note', 'teacher_refine_note', 'teacher_answer'];
let db = null, whoMem = null;

const M = QO.mock = {api:{}, delay:(cfg.selftest && !cfg.slow) ? [15, 45] : [80, 200]};
Object.defineProperty(M, 'db', {get(){ return db; }});

/* ── 도우미 ── */
const nowISO = () => new Date().toISOString();
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const userErr = m => QO.userError(m);
const sysErr = m => new Error(m);
const sleep = () => { const a = M.delay[0], b = M.delay[1]; return new Promise(r => setTimeout(r, a + Math.random() * (b - a))); };
const chars = s => Array.from(String(s));
const clen = s => s == null ? 0 : chars(s).length;                    // char_length
const left = (s, n) => s == null ? null : chars(s).slice(0, n).join('');
const btrim = s => s == null ? null : String(s).trim();
const sval = v => v == null ? null : (typeof v === 'object' ? JSON.stringify(v) : String(v));   // ->>
const cws = arr => arr.filter(v => v != null).join(' ');             // concat_ws(' ', …)
const kstDay = ts => QO.ui.kstDay(ts);
const kstToday = () => QO.ui.kstToday();
const dayStart = d => QO.ui.dayStartISO(d);
const schoolYear = ts => QO.ui.schoolYear(ts);
function md5ish(s){            // 진짜 md5 는 아니고, 같은 글이면 같은 값
  let out = '';
  for(let r = 0; r < 4; r++){
    let h = 0x811c9dc5 ^ (r * 0x9e3779b1);
    const str = String(s);
    for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    out += ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  return out;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(_){} }
function load(){ try{ const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if(s && s.v === VER) return s; }catch(_){} return null; }
function seq(t){ db.seq[t] = (db.seq[t] || 0) + 1; return db.seq[t]; }
function pick(o, keys){ const r = {}; keys.forEach(k => { r[k] = o[k] === undefined ? null : o[k]; }); return r; }

function me(){ if(whoMem !== null) return whoMem || null; try{ return sessionStorage.getItem(WHO_KEY) || null; }catch(_){ return null; } }
function setWho(uid){ whoMem = uid || ''; try{ if(uid) sessionStorage.setItem(WHO_KEY, uid); else sessionStorage.removeItem(WHO_KEY); }catch(_){} }
function needMe(){ const u = me(); if(!u) throw userErr('로그인이 필요해요'); return u; }
const prof = id => db.profiles.find(p => p.id === id) || null;
const teacherOf = id => db.teachers.find(t => t.auth_id === id) || null;
const isTeacher = id => !!id && !!teacherOf(id);
const qById = id => db.questions.find(q => q.id === Number(id)) || null;
function sameClass(a, b){ const pa = prof(a), pb = prof(b); return !!(pa && pb && pa.grade != null && pa.class_no != null && pa.grade === pb.grade && pa.class_no === pb.class_no); }
function grantAcorns(user, delta, reason, ref){          // private.grant_acorns
  if(db.acorn_ledger.some(l => l.user_id === user && l.reason === reason && l.ref_id === String(ref))) return 0;
  db.acorn_ledger.push({id:seq('acorn_ledger'), user_id:user, delta:delta, reason:reason, ref_id:String(ref), kst_day:kstToday(), created_at:nowISO()});
  const p = prof(user); if(p) p.seeds = Math.max(0, (p.seeds || 0) + delta);
  return delta;
}
function unlockPlace(year, g, c, place, at){             // private.unlock_place
  if(g == null || c == null) return;
  if(db.class_forest_unlocks.some(u => u.school_year === year && u.grade === g && u.class_no === c && u.place === place)) return;
  db.class_forest_unlocks.push({school_year:year, grade:g, class_no:c, place:place, unlocked_at:at || nowISO()});
}

/* ── 질문 칸 글(private.step_texts) · 칸 표시와 발자국(private.mark_question) ── */
function stepTexts(q){
  const s = q.solve && typeof q.solve === 'object' ? q.solve : {};
  const j = q.journal && typeof q.journal === 'object' ? q.journal : {};
  const t = {};
  t.refine = q.refined_text == null ? '' : String(q.refined_text);
  if(Array.isArray(j.predict) && j.predict.length){ const last = j.predict[j.predict.length - 1]; t.predict = sval(last && last.text) || ''; }
  else t.predict = cws([sval(s.guess), sval(s.why)]).trim();
  if('method' in j){ const m = j.method || {}; t.method = cws([sval(m.kind), sval(m.plan)]).trim(); }
  else {
    const how = Array.isArray(s.how) ? (s.how.length ? s.how.map(String).join(',') : null) : sval(s.how);
    t.method = cws([how, sval(s.change)]).trim();
  }
  if(Array.isArray(j.find) && j.find.length) t.find = j.find.map(e => cws([sval(e && e.src), sval(e && e.text)])).join(' | ');
  else t.find = cws([sval(s.source), sval(s.result)]).trim();
  if('wrap' in j){ const w = j.wrap || {}; t.wrap = cws([sval(w.text), sval(w.reached), sval(w.stuckQ)]).trim(); }
  else t.wrap = cws([sval(s.answer), sval(s.stuck) === '1' ? sval(s.stuckWhere) : null]).trim();
  if('extend' in j) t.extend = sval((j.extend || {}).text) || '';
  else t.extend = sval(s.newq) || '';
  return t;
}
function markQuestion(q, source, at){
  if(!q || !q.user_id) return;
  at = at || nowISO();
  const t = stepTexts(q), p = prof(q.user_id) || {};
  Object.keys(t).forEach(k => {
    const v = String(t[k] == null ? '' : t[k]).trim();
    if(clen(v) < (k === 'method' ? 2 : 5)) return;
    const h = md5ish(v);
    const m = db.step_marks.find(x => x.question_id === q.id && x.step === k);
    if(!m) db.step_marks.push({question_id:q.id, step:k, first_at:at, last_at:at, text_md5:h});
    else { if(m.text_md5 !== h) m.last_at = at; m.text_md5 = h; }
    if(COUNTED.indexOf(k) >= 0 && !db.footprints.some(f => f.question_id === q.id && f.step === k)){
      db.footprints.push({id:seq('footprints'), user_id:q.user_id, question_id:q.id, step:k, source:source || 'live',
        school_year:schoolYear(at), grade:p.grade == null ? null : p.grade, class_no:p.class_no == null ? null : p.class_no, kst_day:kstDay(at), created_at:at});
    }
  });
}
function baseQ(){
  return {id:null, user_id:null, subject_id:null, text:'', resolved:false, question_date:kstToday(), tags:[], fruit_emoji:null, is_anonymous:false,
    water_count:0, watered_by:[], tree_id:null, starred:false, answer_text:null, phase:'before', parent_id:null, created_at:nowISO(),
    finding:null, still_wondering:null, teacher_nudge:null, unit:null, teacher_stamp:null, refined_text:null, refined_at:null, solve:null,
    teacher_solve_note:null, teacher_refine_note:null, teacher_answer:null, teacher_fb_at:null, fb_seen_at:null, fb_unread:false,
    journal:null, fruit_kind:null, fruit_source:null, resolved_by:null, resolved_at:null, resolve_requested_at:null};
}
/* 질문 넣기 — guard_owner_cols(INSERT) · inherit_parent_unit · journal_marks */
function insertQ(row){
  const at = nowISO();
  const q = Object.assign(baseQ(), row);
  if(!isTeacher(me())){
    q.created_at = at; q.starred = false;
    q.teacher_nudge = null; q.teacher_stamp = null; q.teacher_refine_note = null; q.teacher_solve_note = null; q.teacher_answer = null; q.teacher_fb_at = null;
    q.fruit_kind = null; q.fruit_source = null; q.resolved_by = null; q.resolved_at = null; q.resolve_requested_at = null;
  }
  if(q.parent_id != null && !q.unit){ const par = qById(q.parent_id); q.unit = par ? par.unit : null; }
  q.id = seq('questions');
  db.questions.push(q);
  markQuestion(q, 'live', at);
  return q;
}
/* 질문 고치기(서버 함수 쪽) — questions_fb_touch · journal_marks */
function updateQ(q, patch, at){
  at = at || nowISO();
  const old = Object.assign({}, q);
  Object.assign(q, patch);
  if(TEACHER_FB.some(k => (old[k] == null ? null : old[k]) !== (q[k] == null ? null : q[k]))){
    q.teacher_fb_at = at;
    if(TEACHER_FB.some(k => q[k] != null && String(q[k]) !== '')) q.fb_unread = true;
  }
  if('solve' in patch || 'journal' in patch || 'refined_text' in patch) markQuestion(q, 'live', at);
  return q;
}
function nowUnitFor(uid){
  const p = prof(uid); if(!p) return null;
  const tids = new Set((p.teacher_ids || []).map(Number)); if(!tids.size && p.teacher_id) tids.add(Number(p.teacher_id));
  const now = nowISO();
  const hit = db.active_units.filter(a => a.expires_at > now).sort((a, b) => b.set_at.localeCompare(a.set_at))
    .find(a => (!a.target_grade || a.target_grade === p.grade) && (!a.target_class || a.target_class === p.class_no) && (!tids.size || tids.has(Number(a.teacher_id))));
  return hit ? hit.unit : null;
}
const sortNum = (a, b) => (a.number || 0) - (b.number || 0);
function memberRows(gid){ return db.group_members.filter(m => m.group_id === gid).map(m => { const p = prof(m.user_id) || {}; return {user_id:m.user_id, name:p.name || '', number:p.number == null ? null : p.number}; }).sort(sortNum); }
function latestInquiry(gid){ return db.group_inquiries.filter(i => i.group_id === gid).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0] || null; }
function stepsOf(inq){ return db.group_steps.filter(s => s.inquiry_id === inq).sort((a, b) => a.step_no - b.step_no || a.id - b.id); }
/* start_group_inquiry 의 칸 나누기(번호 순 mem 으로) */
function buildSteps(inq, mem){
  const k = mem.length, a = mem[0], b = mem[1], c = mem[2] || mem[0], d = mem[3] || mem[0], e = mem[4] || null;
  const add = (no, kind, name, who) => { const r = {id:seq('group_steps'), inquiry_id:inq, step_no:no, kind:kind, name:name, assignee_id:who || null, body:null, src:null, done_at:null}; db.group_steps.push(r); return r; };
  for(let i = 0; i < k; i++) add(1, 'predict', '예상', mem[i]);
  add(2, 'method', '알아볼 방법', a);
  add(3, 'find', '찾기 ①', b);
  add(4, 'find', '찾기 ②', c);
  add(5, 'compare', '두 출처 비교', b);
  add(6, 'wrap', '정리', k >= 4 ? d : a);
  if(e) add(4, 'extra', '찾기 ③ 다른 출처', e);
  for(let i = 0; i < k; i++) add(7, 'used', '내 칸이 정리 어디에 쓰였나', mem[i]);
  add(8, 'tell', '옆 모둠에 설명', null);
  add(9, 'heard', '옆 모둠에서 들은 것', null);
}
const qCols = q => pick(q, COLS);

/* ═══════════ 함수 등록 — 지연 · 거래(실패하면 되돌림) · 돌려줄 때 복사 ═══════════ */
function def(name, fn){
  const w = async function(){
    const args = Array.prototype.slice.call(arguments).map(clone);
    await sleep();
    const snap = JSON.stringify(db);
    try{ const r = await fn.apply(null, args); save(); return clone(r); }
    catch(e){ db = JSON.parse(snap); throw e; }
  };
  Object.defineProperty(w, 'length', {value:fn.length});
  M.api[name] = w;
  return w;
}
M.extend = function(obj){ Object.keys(obj || {}).forEach(k => def(k, obj[k])); };
M.h = {me, needMe, prof, teacherOf, isTeacher, sameClass, qById, userErr, sysErr, nowISO, kstToday, kstDay, schoolYear, seq, insertQ, updateQ, markQuestion, stepTexts, grantAcorns, unlockPlace, md5ish, pick, COLS, CLUE_COLS};

/* ── 로그인 ── */
def('signInStudent', function(g, c, n, pw){
  const bad = QO.check.identity(g, c, n); if(bad) throw userErr(bad);
  if(!pw) throw userErr('비밀번호를 입력해주세요');
  const email = QO.check.fakeEmail(g, c, n);
  const u = Object.values(db.users).find(x => x.email === email);
  if(!u || u.pw !== pw) throw userErr('학년·반·번호 또는 비밀번호를 확인해주세요');
  setWho(u.uid);
  return {user:{id:u.uid, email:email}};
});
def('signInTeacher', function(email, pw){
  if(!email || !pw) throw userErr('이메일과 비밀번호를 넣어 주세요');
  const u = Object.values(db.users).find(x => x.email === String(email).trim().toLowerCase());
  if(!u || u.pw !== pw) throw userErr('이메일 또는 비밀번호를 확인해 주세요');
  if(!isTeacher(u.uid)) throw userErr('선생님 계정이 아니에요');
  setWho(u.uid);
  return {user:{id:u.uid, email:u.email}, teacher:clone(teacherOf(u.uid))};
});
def('signOut', function(scope){ setWho(null); return true; });   // scope: 'global'(학생 직접) | 'local'
def('session', function(){ const u = me(); if(!u) return null; const x = Object.values(db.users).find(v => v.uid === u); return x ? {user:{id:u, email:x.email}} : null; });

/* ── 나 ── */
def('loadMe', function(){
  const id = needMe(), p = prof(id);
  if(!p) throw userErr('학생 정보를 찾지 못했어요. 선생님께 알려 주세요.');
  const subjects = db.subjects.filter(s => s.user_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(s => pick(s, ['id', 'label', 'icon', 'sort_order']));
  const trees = db.trees.filter(t => t.user_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id).map(t => pick(t, ['id', 'subject_id', 'sort_order']));
  const profile = pick(p, ['id', 'name', 'grade', 'class_no', 'number', 'seeds', 'active_sub', 'teacher_id', 'teacher_ids', 'active_tree', 'active_companion', 'unlocked_items']);
  if(!subjects.find(s => s.id === profile.active_sub)) profile.active_sub = subjects.length ? subjects[0].id : '';
  profile.seeds = profile.seeds || 0;
  return {profile, subjects, trees};
});
def('myTree', function(){                                 // my_tree
  const id = me(); const mine = db.questions.filter(q => q.user_id === id);
  const fruit = mine.filter(q => q.fruit_kind === 'fruit').length, fog = mine.filter(q => q.fruit_kind === 'fog').length;
  const sprout = mine.filter(q => q.fruit_kind != null && q.journal && 'extend' in q.journal).length;
  const g = db.group_fruits.filter(f => f.user_id === id).length, fl = db.flowers.filter(f => f.receiver === id).length;
  const lv = db.legacy_level.find(l => l.user_id === id);
  const water = mine.reduce((a, q) => a + (q.water_count || 0), 0);
  return {fruit, fog, sprout, group_fruit:g, flowers:fl, water, legacy_level:lv ? lv.level : null, level:Math.max(lv ? lv.level : 1, Math.min(fruit + fog + g + 1, 10))};
});
def('myForest', function(){                               // my_forest
  const p = prof(me()); if(!p) return [];
  const y = schoolYear();
  return db.class_forest_unlocks.filter(u => u.grade === p.grade && u.class_no === p.class_no && u.school_year === y).map(u => ({place:u.place, unlocked_at:u.unlocked_at}));
});
def('myCutover', function(){                              // v2_cutover(우리 반 한 줄)
  const p = prof(needMe()); if(!p || p.grade == null || p.class_no == null) return null;
  const c = db.v2_cutover.find(x => x.grade === p.grade && x.class_no === p.class_no);
  return c ? {cutover_at:c.cutover_at} : null;
});
def('classmates', function(){
  const p = prof(needMe()); if(!p) return [];
  return db.profiles.filter(x => x.grade === p.grade && x.class_no === p.class_no).sort(sortNum).map(x => ({number:x.number, name:x.name}));
});

/* ── 내 질문 ── */
def('loadMyQuestions', function(){ const id = needMe(); return db.questions.filter(q => q.user_id === id).sort((a, b) => b.id - a.id).map(qCols); });
def('plantQuestion', function(input){
  input = input || {};
  const id = needMe(), p = prof(id);
  const text = String(input.text || '').trim();
  if(!text) throw userErr('궁금한 것을 적어 주세요');
  if(clen(text) > 500) throw sysErr('new row for relation "questions" violates check constraint "questions_text_len_chk"');   // 설치.sql 1~500자
  if(!p) throw userErr('학생 정보를 찾지 못했어요. 선생님께 알려 주세요.');
  const subs = db.subjects.filter(s => s.user_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const subId = subs.some(s => s.id === p.active_sub) ? p.active_sub : (subs[0] ? subs[0].id : null);
  const tree = subId ? db.trees.filter(t => t.user_id === id && t.subject_id === subId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)[0] : null;
  let unit = input.unit;
  if(unit === undefined && !input.parent_id) unit = nowUnitFor(id);
  const row = {user_id:id, subject_id:subId, text:text, tags:Array.isArray(input.tags) ? input.tags : [], question_date:kstToday(),
    is_anonymous:!!input.is_anonymous, phase:input.phase || 'before', water_count:0, watered_by:[]};
  if(unit) row.unit = unit;
  if(input.parent_id){
    if(!qById(input.parent_id)) throw sysErr('insert or update on table "questions" violates foreign key constraint "questions_parent_id_fkey"');
    row.parent_id = Number(input.parent_id);
  }
  if(tree) row.tree_id = tree.id;
  return qCols(insertQ(row));
});
def('saveJournal', function(qid, patch){                 // save_journal
  const id = me(); patch = patch || {};
  if(!id) throw userErr('로그인이 필요해요');
  const q = qById(qid);
  if(!q || q.user_id !== id) throw userErr('내 질문만 고칠 수 있어요');
  const has = k => Object.prototype.hasOwnProperty.call(patch, k);
  if(q.fruit_kind != null && (has('wrap') || has('predict_add') || has('method') || has('find_add'))) throw userErr('선생님이 확인한 질문은 넓히기만 더할 수 있어요');
  const at = nowISO();
  let j = clone(q.journal && typeof q.journal === 'object' ? q.journal : {}), s = clone(q.solve && typeof q.solve === 'object' ? q.solve : {});
  let req = q.resolve_requested_at, refined = q.refined_text, refinedAt = q.refined_at, finding = q.finding, still = q.still_wondering;
  if(has('refine')){
    refined = patch.refine == null ? null : left(btrim(sval(patch.refine)), 500); refinedAt = at;
    if(refined === '') refined = null;
    j.refine_done = true;
  }
  if(has('predict_add') && clen(btrim(sval(patch.predict_add))) >= 2){
    const v = left(btrim(sval(patch.predict_add)), 500);
    j.predict = (Array.isArray(j.predict) ? j.predict : []).concat([{text:v, at:at}]);
    if((s.guess == null ? '' : String(s.guess)) === '') s.guess = v;
  }
  if(has('method')){
    const v = patch.method || {};
    j.method = {kind:left(sval(v.kind), 20), plan:left(sval(v.plan) || '', 300)};
    s.how = [v.kind === 'exp' ? 'exp' : 'src'];
    s.change = left(sval(v.plan) || '', 300);
  }
  if(has('find_add')){
    const v = patch.find_add || {};
    if(clen(btrim(sval(v.src) || '')) >= 2 && clen(btrim(sval(v.text) || '')) >= 2){
      const ai = v.ai === true || v.ai === 'true';
      j.find = (Array.isArray(j.find) ? j.find : []).concat([{src:left(btrim(sval(v.src)), 120), text:left(btrim(sval(v.text)), 500), ai:ai, at:at}]);
      if((s.source == null ? '' : String(s.source)) === '' && !ai) s.source = left(btrim(sval(v.src)), 120);
    }
  }
  if(has('same')) j.same = left(sval(patch.same) || '', 200);
  if(has('aiCmp')) j.aiCmp = left(sval(patch.aiCmp) || '', 200);
  if(has('extend')){
    const v = patch.extend || {};
    j.extend = {kind:left(sval(v.kind), 10), text:left(sval(v.text) || '', 300)};
    if(v.kind === 'newq') s.newq = left(sval(v.text) || '', 300);
  }
  if(has('flag')){
    const f = patch.flag;
    if(f && typeof f === 'object' && !Array.isArray(f)) j.flag = {step:left(sval(f.step), 20), tried:left(sval(f.tried) || '', 200), at:at};
    else delete j.flag;
  }
  if(has('wrap')){
    const v = patch.wrap && typeof patch.wrap === 'object' ? patch.wrap : {};
    delete j.returned;
    const cut = (k, n) => left(sval(v[k]) || '', n);     // v2_02: 정해진 칸만 길이를 잘라
    j.wrap = {mode:v.mode === 'unknown' ? 'unknown' : 'known', text:cut('text', 1000), reached:cut('reached', 500), stuckQ:cut('stuckQ', 500),
              why:cut('why', 200), cmp:cut('cmp', 20), changedBy:cut('changedBy', 200), at:at};
    if(v.mode === 'unknown'){ s.stuck = 1; s.stuckWhere = left(sval(v.reached) || '', 500); still = left(sval(v.stuckQ) || '', 500); }
    else { s.answer = left(sval(v.text) || '', 1000); finding = left(sval(v.text) || '', 1000); }
    req = at;
  }
  /* 칸을 저장하면 그 칸의 막힘 표시는 내린다 */
  if(j.flag && (has(j.flag.step) || (j.flag.step === 'predict' && has('predict_add')) || (j.flag.step === 'find' && has('find_add')))) delete j.flag;
  s.saved_at = at;
  updateQ(q, {journal:j, solve:s, refined_text:refined, refined_at:refinedAt, finding:finding, still_wondering:still, resolve_requested_at:req}, at);
  return {id:q.id, journal:q.journal, refined_text:q.refined_text, resolve_requested_at:q.resolve_requested_at, fruit_kind:q.fruit_kind};
});
function canSeeQ(q, uid){ return !!q && (q.user_id === uid || isTeacher(uid)); }
def('loadMarks', function(qids){
  const id = me(); const set = new Set((qids || []).map(Number));
  return db.step_marks.filter(m => set.has(m.question_id) && canSeeQ(qById(m.question_id), id))
    .sort((a, b) => a.question_id - b.question_id || a.step.localeCompare(b.step)).map(m => pick(m, ['question_id', 'step', 'first_at', 'last_at', 'text_md5']));
});
def('loadMyFootprints', function(){ const id = needMe(); return db.footprints.filter(f => f.user_id === id).sort((a, b) => a.id - b.id).map(f => pick(f, ['id', 'question_id', 'step', 'source', 'kst_day', 'created_at'])); });
def('loadCluesOnMine', function(qids){
  const id = me(); const set = new Set((qids || []).map(Number));
  return db.clues.filter(c => set.has(c.question_id) && c.hidden_at == null && (c.author_id === id || isTeacher(id) || (qById(c.question_id) || {}).user_id === id))
    .sort((a, b) => a.id - b.id).map(c => pick(c, CLUE_COLS.concat(['snapshot_md5'])));
});
def('setUnit', function(qid, unit){                       // questions.unit 직접 고치기(주인만)
  const id = needMe(), q = qById(qid);
  if(!q || q.user_id !== id) throw userErr('내 질문만 고칠 수 있어요');
  q.unit = String(unit || '').trim() || null;
  return {id:q.id, unit:q.unit};
});
def('markFbSeen', function(qid){
  const id = needMe(), at = nowISO();
  (Array.isArray(qid) ? qid : [qid]).forEach(x => { const q = qById(x); if(q && q.user_id === id){ q.fb_unread = false; q.fb_seen_at = at; } });
  return true;
});
def('nowUnit', function(){ return nowUnitFor(me()); });

/* ── 친구·단서 ── */
def('classmateQuestions', function(limit, before){         // classmate_questions
  const id = me(), p = prof(id); if(!p) return [];
  const since = new Date(Date.UTC(schoolYear(), 2, 1)).toISOString();
  const n = Math.min(Math.max(limit == null ? 60 : Number(limit), 1), 200);
  return db.questions.filter(q => { const o = prof(q.user_id); return o && o.grade === p.grade && o.class_no === p.class_no && q.user_id !== id && q.created_at >= since && (before == null || q.id < Number(before)); })
    .sort((a, b) => b.id - a.id).slice(0, n).map(q => {
      const o = prof(q.user_id), j = q.journal || {};
      return {id:q.id, body:(q.refined_text && q.refined_text !== '') ? q.refined_text : q.text, unit:q.unit, is_anonymous:!!q.is_anonymous,
        owner_name:q.is_anonymous ? null : o.name, owner_number:q.is_anonymous ? null : o.number,
        flag_step:j.flag ? sval(j.flag.step) : null, flag_tried:j.flag ? sval(j.flag.tried) : null,
        clue_count:db.clues.filter(c => c.question_id === q.id && c.hidden_at == null).length, created_at:q.created_at};
    });
});
def('clueTargets', function(n){                           // clue_targets
  const id = me(), p = prof(id); if(!p) return [];
  const myGroups = db.group_members.filter(m => m.user_id === id).map(m => m.group_id);
  const groupQ = new Set(db.group_inquiries.filter(i => myGroups.indexOf(i.group_id) >= 0 && i.question_id != null).map(i => i.question_id));
  // v2_02: 올해 내 모둠 — 같은 모둠은 같은 두 질문, 내 모둠원 질문은 뺀다
  const gid = (db.groups.filter(g => myGroups.indexOf(g.id) >= 0 && g.school_year === schoolYear()).sort((a, b) => b.id - a.id)[0] || {}).id;
  const mates = new Set(gid == null ? [] : db.group_members.filter(m => m.group_id === gid).map(m => m.user_id));
  const cnt = q => db.clues.filter(c => c.question_id === q.id && c.hidden_at == null).length;
  const lim = Math.min(Math.max(n == null ? 2 : Number(n), 1), 6);
  return db.questions.filter(q => { const o = prof(q.user_id); return o && o.grade === p.grade && o.class_no === p.class_no && q.user_id !== id && !q.is_anonymous && q.journal && 'flag' in q.journal && q.fruit_kind == null && !groupQ.has(q.id) && !mates.has(q.user_id); })
    .map(q => ({q, n:cnt(q), h:md5ish(String(q.id) + (gid == null ? id : String(gid)))}))
    .sort((a, b) => a.n - b.n || a.h.localeCompare(b.h)).slice(0, lim)
    .map(x => { const j = x.q.journal || {}; return {id:x.q.id, body:(x.q.refined_text && x.q.refined_text !== '') ? x.q.refined_text : x.q.text, unit:x.q.unit,
      flag_step:j.flag ? sval(j.flag.step) : null, flag_tried:j.flag ? sval(j.flag.tried) : null, clue_count:x.n,
      already:db.clues.some(c => c.question_id === x.q.id && c.author_id === id)}; });
});
def('addClue', function(qid, kind, body){                 // add_clue
  const id = me();
  if(!id) throw userErr('로그인이 필요해요');
  const q = qById(qid);
  if(!q) throw userErr('질문을 찾을 수 없어요');
  if(q.user_id === id) throw userErr('내 질문에는 단서를 보낼 수 없어요');
  if(!sameClass(id, q.user_id)) throw userErr('같은 반 친구 질문에만 단서를 보낼 수 있어요');
  const step = {where:'find', test:'method', me:'find', ask:'refine'}[kind];
  if(!step) throw userErr('단서 종류가 올바르지 않아요');
  body = String(body == null ? '' : body).trim();
  if(clen(body) < 5 || clen(body) > 80 || body.indexOf('__') >= 0) throw userErr('빈칸을 채워서 보내 주세요');
  const since = dayStart(kstToday());
  if(db.clues.filter(c => c.author_id === id && c.created_at >= since).length >= 10) throw userErr('오늘은 단서를 충분히 보냈어요');
  if(db.clues.some(c => c.question_id === q.id && c.author_id === id && c.kind === kind)) throw userErr('이 질문에는 같은 종류의 단서를 이미 보냈어요');
  const p = prof(id), mk = db.step_marks.find(m => m.question_id === q.id && m.step === step);
  const c = {id:seq('clues'), question_id:q.id, author_id:id, kind:kind, step:step, body:body, snapshot_md5:mk ? mk.text_md5 : null,
    school_year:schoolYear(), grade:p.grade, class_no:p.class_no, created_at:nowISO(), thanked_at:null, thanks_text:null, declined_at:null, hidden_at:null};
  db.clues.push(c);
  return c.id;
});
def('thankClue', function(clueId, thanks){                // thank_clue
  const id = me();
  if(!id) throw userErr('로그인이 필요해요');
  const c = db.clues.find(x => x.id === Number(clueId));
  if(!c || c.question_id == null) throw userErr('단서를 찾을 수 없어요');
  const q = qById(c.question_id);
  if(!q || q.user_id !== id) throw userErr('내 질문에 온 단서에만 고마움을 보낼 수 있어요');
  if(c.thanked_at != null) return true;
  if(c.hidden_at != null) throw userErr('선생님이 숨긴 단서예요');
  const mk = db.step_marks.find(m => m.question_id === c.question_id && m.step === c.step);
  if(!mk || mk.last_at <= c.created_at || mk.text_md5 === c.snapshot_md5) throw userErr('이 단서를 보고 그 칸을 적거나 고친 뒤에 보낼 수 있어요');
  thanks = String(thanks == null ? '' : thanks).trim();
  if(clen(thanks) < 4 || clen(thanks) > 40) throw userErr('무엇 덕분이었는지 한 줄로 적어 주세요');
  const at = nowISO(), day = kstToday();
  c.thanked_at = at; c.thanks_text = thanks;
  if(db.flowers.filter(f => f.receiver === c.author_id && f.kst_day === day).length < 3
     && !db.flowers.some(f => f.clue_id === c.id || (f.giver === id && f.receiver === c.author_id && f.kst_day === day))){
    db.flowers.push({id:seq('flowers'), clue_id:c.id, giver:id, receiver:c.author_id, thanks_text:thanks, kst_day:day, created_at:at});
  }
  unlockPlace(c.school_year, c.grade, c.class_no, 'bridge', at);
  return true;
});
def('declineClue', function(clueId){                      // decline_clue
  const id = me(), c = db.clues.find(x => x.id === Number(clueId));
  if(!c || c.thanked_at != null || !(qById(c.question_id) && qById(c.question_id).user_id === id)) return false;
  c.declined_at = nowISO();
  return true;
});
def('myCurious', function(){ const id = needMe(); return db.curious_marks.filter(m => m.user_id === id).map(m => m.question_id).sort((a, b) => a - b); });
def('receivedFlowers', function(){                         // flowers 표: receiver = 나
  const id = needMe();
  return db.flowers.filter(f => f.receiver === id).sort((a, b) => b.id - a.id).map(f => {
    const c = db.clues.find(x => x.id === f.clue_id) || null;
    const q = c ? qById(c.question_id) : null;
    const vis = !!(q && q.user_id !== id && sameClass(id, q.user_id));
    return {id:f.id, clue_id:f.clue_id, kind:c ? c.kind : null, thanks_text:f.thanks_text, kst_day:f.kst_day, created_at:f.created_at,
      question_body:vis ? (q.refined_text ? q.refined_text : q.text) : null};
  });
});
def('markCurious', function(qid){                         // mark_curious
  const id = me(), q = qById(qid);
  if(!q || q.user_id === id || !sameClass(id, q.user_id)) return false;
  if(!db.curious_marks.some(m => m.question_id === q.id && m.user_id === id)) db.curious_marks.push({question_id:q.id, user_id:id, created_at:nowISO()});
  const by = q.watered_by || [];                             // v2_03: 옛 물주기 칸도 — 한 사람 한 번
  if(by.indexOf(id) < 0){ q.watered_by = by.concat([id]); q.water_count = q.watered_by.length; }
  return true;
});

/* ── 상점 · 우리 반 나무(v2_03) ── */
const SHOP_PRICE = {default:['tree', 0], pine:['tree', 20], cherry:['tree', 30], maple:['tree', 40], palm:['tree', 50], baobab:['tree', 100], storytree:['tree', 150],
  butterfly:['companion', 10], bird:['companion', 15], squirrel:['companion', 20], swing:['companion', 25], beehive:['companion', 30], owl:['companion', 35], fox:['companion', 40]};
def('buyItem', function(item){                             // buy_item
  const id = needMe(), it = SHOP_PRICE[item]; if(!it) throw userErr('없는 물건이에요');
  const p = prof(id); if(!p) throw userErr('학생 정보를 찾지 못했어요');
  const own = (p.unlocked_items || ['default']).slice();
  if(it[1] === 0 || own.indexOf(item) >= 0) return {owned:true, bought:false, seeds:p.seeds || 0, items:own};
  if((p.seeds || 0) < it[1]) throw userErr('도토리가 부족해요');
  grantAcorns(id, -it[1], 'buy', item);
  p.unlocked_items = own.concat([item]);
  return {owned:true, bought:true, seeds:p.seeds || 0, items:p.unlocked_items};
});
def('equipItem', function(item){                           // equip_item
  const id = needMe(), it = SHOP_PRICE[item]; if(!it) throw userErr('없는 물건이에요');
  const p = prof(id); if(!p) throw userErr('학생 정보를 찾지 못했어요');
  if(it[1] > 0 && (p.unlocked_items || ['default']).indexOf(item) < 0) throw userErr('먼저 사야 해요');
  if(it[0] === 'tree') p.active_tree = item; else p.active_companion = p.active_companion === item ? null : item;
  return {active_tree:p.active_tree || 'default', active_companion:p.active_companion || null};
});
def('classmateTrees', function(){                          // classmate_trees
  const id = me(), p = prof(id); if(!p) return [];
  const since = new Date(Date.UTC(schoolYear(), 2, 1)).toISOString();
  return db.profiles.filter(x => x.id !== id && x.grade === p.grade && x.class_no === p.class_no && x.number != null && !isTeacher(x.id)).sort(sortNum).map(x => {
    const qs = db.questions.filter(q => q.user_id === x.id);
    const f = qs.filter(q => q.fruit_kind != null).length + db.group_fruits.filter(g => g.user_id === x.id).length;
    const lv = db.legacy_level.find(l => l.user_id === x.id);
    const open = qs.filter(q => !q.is_anonymous && q.created_at >= since);
    return {owner_number:x.number, owner_name:x.name, active_tree:x.active_tree || 'default', active_companion:x.active_companion || null,
      level:Math.max(lv ? lv.level : 1, Math.min(f + 1, 10)), fruits:f, questions:open.length, water:open.reduce((a, q) => a + (q.water_count || 0), 0)};
  });
});
def('friendQuestions', function(num){                      // friend_questions
  const id = me(), p = prof(id); if(!p) return [];
  const since = new Date(Date.UTC(schoolYear(), 2, 1)).toISOString();
  const o = db.profiles.find(x => x.grade === p.grade && x.class_no === p.class_no && x.number === Number(num) && x.id !== id); if(!o) return [];
  return db.questions.filter(q => q.user_id === o.id && !q.is_anonymous && q.created_at >= since).sort((a, b) => b.id - a.id).slice(0, 100).map(q => ({
    id:q.id, body:(q.refined_text && q.refined_text !== '') ? q.refined_text : q.text, unit:q.unit, fruit_kind:q.fruit_kind || null,
    water_count:(q.watered_by || []).length || q.water_count || 0,
    watered:(q.watered_by || []).indexOf(id) >= 0 || db.curious_marks.some(m => m.question_id === q.id && m.user_id === id), created_at:q.created_at}));
});
def('mySentClues', function(){
  const id = needMe(), p = prof(id);
  return db.clues.filter(c => c.author_id === id).sort((a, b) => b.id - a.id).slice(0, 300).map(c => {
    const q = qById(c.question_id), o = q && prof(q.user_id);
    const vis = q && o && p && o.grade === p.grade && o.class_no === p.class_no && q.user_id !== id;
    return Object.assign(pick(c, CLUE_COLS), {question_body:vis ? ((q.refined_text && q.refined_text !== '') ? q.refined_text : q.text) : null});
  });
});

/* ── 모둠 ── */
def('myGroupFruits', function(){ const id = needMe(); return db.group_fruits.filter(f => f.user_id === id).map(f => f.inquiry_id); });
def('myGroup', function(){
  const id = needMe(), y = schoolYear();
  const gids = db.group_members.filter(m => m.user_id === id).map(m => m.group_id);
  const group = db.groups.filter(g => gids.indexOf(g.id) >= 0 && g.school_year === y).sort((a, b) => b.id - a.id)[0];
  if(!group) return {group:null, members:[], inquiry:null, steps:[]};
  const inquiry = latestInquiry(group.id);
  return {group:clone(group), members:memberRows(group.id), inquiry:inquiry ? clone(inquiry) : null, steps:inquiry ? clone(stepsOf(inquiry.id)) : []};
});
def('neighborInquiries', function(){                      // SQL 없음 — sql_gaps 의 neighbor_inquiries 흉내
  const id = me(), p = prof(id); if(!p) return [];
  const y = schoolYear();
  const mine = new Set(db.group_members.filter(m => m.user_id === id).map(m => m.group_id));
  return db.groups.filter(g => g.school_year === y && g.grade === p.grade && g.class_no === p.class_no && !mine.has(g.id)).sort((a, b) => a.group_no - b.group_no)
    .map(g => ({g, inq:latestInquiry(g.id)})).filter(x => x.inq).map(x => {
      const st = stepsOf(x.inq.id);
      return {inquiry_id:x.inq.id, group_id:x.g.id, group_no:x.g.group_no, group_name:x.g.name, question_text:x.inq.question_text, status:x.inq.status,
        told:st.some(s => s.kind === 'tell' && s.done_at != null), heard:st.some(s => s.kind === 'heard' && s.done_at != null)};
    });
});
def('startGroupInquiry', function(groupId, questionId, text, why){   // start_group_inquiry
  const id = me(), gid = Number(groupId);
  if(!(isTeacher(id) || db.group_members.some(m => m.group_id === gid && m.user_id === id))) throw userErr('우리 모둠만 시작할 수 있어요');
  if(db.group_inquiries.some(i => i.group_id === gid && (i.status === 'open' || i.status === 'wait'))) throw userErr('이미 함께 푸는 질문이 있어요');
  const mem = db.group_members.filter(m => m.group_id === gid).map(m => prof(m.user_id)).filter(Boolean).sort(sortNum).map(p => p.id);
  if(mem.length < 2) throw userErr('모둠원이 둘 넘게 있어야 해요');
  let txt = String(text == null ? '' : text).trim();
  if(questionId != null){
    const q = qById(questionId);
    if(q && q.is_anonymous) throw userErr('익명 질문은 모둠 질문으로 고를 수 없어요');   // v2_02
    txt = q && mem.indexOf(q.user_id) >= 0 ? ((q.refined_text && q.refined_text !== '') ? q.refined_text : q.text) : null;
    if(txt == null) throw userErr('모둠원의 질문만 고를 수 있어요');
  }
  if(clen(txt) < 5) throw userErr('질문을 다섯 글자 넘게 적어 주세요');
  const inq = {id:seq('group_inquiries'), group_id:gid, question_id:questionId == null ? null : Number(questionId), question_text:txt, why:left(why == null ? '' : String(why), 200),
    status:'open', teacher_note:null, confirmed_by:null, confirmed_at:null, created_at:nowISO()};
  db.group_inquiries.push(inq);
  buildSteps(inq.id, mem);
  return inq.id;
});
def('saveGroupStep', function(stepId, body, src){        // save_group_step
  const id = me(), st = db.group_steps.find(s => s.id === Number(stepId));
  if(!st) throw userErr('칸을 찾을 수 없어요');
  if(st.kind === 'tell' || st.kind === 'heard') throw userErr('이 칸은 따로 써요');
  if(st.assignee_id !== id && !(st.kind === 'compare' && db.group_steps.some(x => x.inquiry_id === st.inquiry_id && x.kind === 'find' && x.assignee_id === id))) throw userErr('맡은 칸만 쓸 수 있어요');
  const inq = db.group_inquiries.find(i => i.id === st.inquiry_id);
  if(!inq || (inq.status !== 'open' && inq.status !== 'returned')) throw userErr('선생님께 보낸 뒤에는 고칠 수 없어요');
  const all = db.group_steps.filter(s => s.inquiry_id === st.inquiry_id);
  const done = k => all.filter(s => s.kind === k && s.done_at != null).length;
  if(st.kind === 'compare' && done('find') < 2) throw userErr('찾기 두 칸이 먼저 차야 해요');
  if(st.kind === 'wrap' && done('compare') < 1) throw userErr('두 출처 비교가 먼저 차야 해요');
  if(st.kind === 'used' && done('wrap') < 1) throw userErr('정리가 먼저 차야 해요');
  if(clen(btrim(body == null ? '' : String(body))) < 4) throw userErr('네 글자 넘게 적어 주세요');
  st.body = left(btrim(String(body)), 500); st.src = left(btrim(src == null ? '' : String(src)), 120); st.done_at = nowISO();
  if(st.assignee_id == null) st.assignee_id = id;
  return true;
});
def('pickTeller', function(inqId){                        // pick_teller
  const id = me(), inq = db.group_inquiries.find(i => i.id === Number(inqId)), g = inq ? inq.group_id : null;
  if(!(isTeacher(id) || db.group_members.some(m => m.group_id === g && m.user_id === id))) throw userErr('우리 모둠만 할 수 있어요');
  const told = db.group_steps.find(s => s.inquiry_id === Number(inqId) && s.kind === 'tell' && s.done_at != null);
  if(told && told.assignee_id) return told.assignee_id;     // v2_02: 한 번 뽑으면 그대로
  const mem = db.group_members.filter(m => m.group_id === g);
  const who = mem.length ? mem[Math.floor(Math.random() * mem.length)].user_id : null;
  db.group_steps.filter(s => s.inquiry_id === Number(inqId) && s.kind === 'tell').forEach(s => { s.assignee_id = who; s.done_at = nowISO(); s.body = '그 자리에서 뽑힘'; });
  return who;
});
def('writeHeard', function(inqId, body){                  // write_heard
  const id = me(), inq = db.group_inquiries.find(i => i.id === Number(inqId)), g = inq && db.groups.find(x => x.id === inq.group_id);
  if(!g) throw userErr('모둠 질문을 찾을 수 없어요');
  if(db.group_members.some(m => m.group_id === g.id && m.user_id === id)) throw userErr('설명을 들은 옆 모둠이 남겨요');
  const p = prof(id);
  if(!(p && p.grade === g.grade && p.class_no === g.class_no)) throw userErr('같은 반만 남길 수 있어요');
  const st = db.group_steps.filter(s => s.inquiry_id === inq.id);   // v2_02: 설명을 들은 뒤에, 한 번만
  if(!st.some(s => s.kind === 'tell' && s.done_at != null)) throw userErr('설명을 들은 뒤에 남겨요');
  if(st.some(s => s.kind === 'heard' && s.done_at != null)) throw userErr('이미 남겼어요');
  if(clen(btrim(body == null ? '' : String(body))) < 6) throw userErr('한 줄 요약과 되묻기를 적어 주세요');
  db.group_steps.filter(s => s.inquiry_id === inq.id && s.kind === 'heard').forEach(s => { s.body = left(btrim(String(body)), 500); s.assignee_id = id; s.done_at = nowISO(); });
  return true;
});
def('sendGroupInquiry', function(inqId){                  // send_group_inquiry
  const id = me(), inq = db.group_inquiries.find(i => i.id === Number(inqId)), g = inq ? inq.group_id : null;
  if(!db.group_members.some(m => m.group_id === g && m.user_id === id)) throw userErr('우리 모둠만 보낼 수 있어요');
  if(!db.group_steps.some(s => s.inquiry_id === inq.id && s.kind === 'wrap' && s.done_at != null)) throw userErr('정리가 먼저 차야 해요');
  if(inq.status !== 'open' && inq.status !== 'returned') return false;
  inq.status = 'wait';
  return true;
});

/* ── 수업 진행 ── */
def('lessonLive', function(){
  const p = prof(me()); if(!p) return null;
  return db.lesson_live.filter(l => l.active && l.grade === p.grade && l.class_no === p.class_no).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0] || null;
});

/* ── 선생님 ── */
function needTeacher(){ const id = me(); if(!isTeacher(id)) throw userErr('선생님만 할 수 있어요'); return teacherOf(id); }
def('teacherMe', function(){ const t = teacherOf(me()); return t ? pick(t, ['id', 'auth_id', 'name', 'subject_id', 'subject_label', 'grade']) : null; });
def('classList', function(){
  if(!isTeacher(me())) return [];
  const m = new Map();
  db.profiles.forEach(p => { if(p.grade == null || p.class_no == null) return; const k = p.grade + '-' + p.class_no; m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).map(e => { const x = e[0].split('-').map(Number); return {grade:x[0], class_no:x[1], n:e[1]}; }).sort((a, b) => a.grade - b.grade || a.class_no - b.class_no);
});
function students(g, c){ return db.profiles.filter(p => p.grade === Number(g) && p.class_no === Number(c)).sort(sortNum); }
def('classStudents', function(g, c){ if(!isTeacher(me())) return []; return students(g, c).map(p => pick(p, ['id', 'name', 'number', 'seeds'])); });
def('pendingFruits', function(g, c){
  if(!isTeacher(me())) return [];
  const by = new Map(students(g, c).map(p => [p.id, p]));
  return db.questions.filter(q => by.has(q.user_id) && q.resolve_requested_at != null && q.fruit_kind == null)
    .sort((a, b) => String(a.resolve_requested_at).localeCompare(String(b.resolve_requested_at)))
    .map(q => Object.assign(qCols(q), {user_id:q.user_id, student:{name:by.get(q.user_id).name, number:by.get(q.user_id).number}}));
});
def('questionDetail', function(qid){
  if(!isTeacher(me())) throw userErr('질문을 찾을 수 없어요');
  const q = qById(qid); if(!q) throw userErr('질문을 찾을 수 없어요');
  const p = prof(q.user_id);
  return {question:Object.assign(qCols(q), {user_id:q.user_id}),
    marks:db.step_marks.filter(m => m.question_id === q.id).map(m => pick(m, ['question_id', 'step', 'first_at', 'last_at', 'text_md5'])),
    footprints:db.footprints.filter(f => f.question_id === q.id).sort((a, b) => a.id - b.id).map(f => pick(f, ['id', 'question_id', 'step', 'source', 'kst_day', 'created_at'])),
    clues:db.clues.filter(c => c.question_id === q.id).sort((a, b) => a.id - b.id),
    student:p ? pick(p, ['id', 'name', 'grade', 'class_no', 'number']) : null};
});
def('confirmFruit', function(qid, kind){                  // confirm_fruit
  needTeacher();
  if(kind !== 'fruit' && kind !== 'fog') throw userErr('열매 종류가 올바르지 않아요');
  const q = qById(qid); if(!q) throw userErr('질문을 찾을 수 없어요');
  const at = nowISO();
  const jj = Object.assign({}, q.journal || {}); delete jj.flag;   // v2_02: 열매가 되면 막힘 표시를 내린다
  updateQ(q, {fruit_kind:kind, fruit_source:'teacher', resolved_by:me(), resolved_at:at, resolved:kind === 'fruit', resolve_requested_at:null, journal:jj}, at);
  const n = new Set(db.footprints.filter(f => f.question_id === q.id).map(f => f.step)).size;
  const g = grantAcorns(q.user_id, n + 5, 'fruit', q.id);
  if(kind === 'fog'){ const p = prof(q.user_id) || {}; unlockPlace(schoolYear(), p.grade, p.class_no, 'spring', at); }
  return g;
});
def('returnFruit', function(qid, step, note){             // return_fruit
  needTeacher();
  const q = qById(qid); if(!q || q.fruit_kind != null) return false;
  const at = nowISO(), n = btrim(note == null ? '' : String(note));
  updateQ(q, {resolve_requested_at:null, teacher_nudge:n === '' ? null : n, journal:Object.assign({}, q.journal || {}, {returned:{step:step, at:at}})}, at);
  return true;
});
def('classClues', function(g, c, day){
  if(!isTeacher(me())) return [];
  const d = day || kstToday(), from = dayStart(d), to = dayStart(QO.ui.addDays(d, 1));
  const by = new Map(students(g, c).map(p => [p.id, p]));
  return db.clues.filter(x => x.grade === Number(g) && x.class_no === Number(c) && x.created_at >= from && x.created_at < to).sort((a, b) => a.id - b.id).map(x => {
    const a = by.get(x.author_id) || {}, q = qById(x.question_id) || {}, o = by.get(q.user_id) || {};
    return Object.assign(clone(x), {author_name:a.name || '', author_number:a.number || null, question_text:(q.refined_text && q.refined_text !== '') ? q.refined_text : (q.text || ''),
      question_anonymous:!!q.is_anonymous, owner_name:o.name || '', owner_number:o.number || null});
  });
});
def('hideClue', function(id, hide){                       // teacher_hide_clue
  needTeacher();
  const c = db.clues.find(x => x.id === Number(id)); if(!c) return false;
  c.hidden_at = hide === false ? null : nowISO();
  return true;
});
def('setGroups', function(g, c, rows){                    // teacher_set_groups
  needTeacher();
  const y = schoolYear(); let n = 0;
  (rows || []).forEach(r => {
    const no = Number(r.group_no);
    let gr = db.groups.find(x => x.school_year === y && x.grade === Number(g) && x.class_no === Number(c) && x.group_no === no);
    const name = r.name == null ? no + '모둠' : String(r.name);
    if(gr) gr.name = name;
    else { gr = {id:seq('groups'), school_year:y, grade:Number(g), class_no:Number(c), group_no:no, name:name, created_at:nowISO()}; db.groups.push(gr); }
    db.group_members = db.group_members.filter(m => m.group_id !== gr.id);
    const nums = (r.numbers || []).map(Number);
    students(g, c).filter(p => nums.indexOf(p.number) >= 0).forEach(p => { if(!db.group_members.some(m => m.group_id === gr.id && m.user_id === p.id)) db.group_members.push({group_id:gr.id, user_id:p.id}); });
    n++;
  });
  return n;
});
def('classGroups', function(g, c){
  if(!isTeacher(me())) return [];
  const y = schoolYear();
  return db.groups.filter(x => x.school_year === y && x.grade === Number(g) && x.class_no === Number(c)).sort((a, b) => a.group_no - b.group_no).map(gr => {
    const inq = latestInquiry(gr.id);
    return {group:clone(gr), members:memberRows(gr.id), inquiry:inq ? clone(inq) : null, steps:inq ? clone(stepsOf(inq.id)) : []};
  });
});
def('confirmGroup', function(inqId){                      // confirm_group
  needTeacher();
  const inq = db.group_inquiries.find(i => i.id === Number(inqId));
  if(!inq) throw userErr('모둠 질문을 찾을 수 없어요');
  const g = db.groups.find(x => x.id === inq.group_id), at = nowISO();
  const st = db.group_steps.filter(s => s.inquiry_id === inq.id);
  let n = 0;
  db.group_members.filter(m => m.group_id === inq.group_id).forEach(m => {
    const core = st.some(s => s.assignee_id === m.user_id && ['method', 'find', 'compare', 'wrap', 'extra'].indexOf(s.kind) >= 0 && s.done_at != null);
    const used = st.some(s => s.assignee_id === m.user_id && s.kind === 'used' && s.done_at != null);
    if(!core || !used) return;
    if(!db.group_fruits.some(f => f.inquiry_id === inq.id && f.user_id === m.user_id)) db.group_fruits.push({inquiry_id:inq.id, user_id:m.user_id, created_at:at});
    grantAcorns(m.user_id, 5, 'group_fruit', inq.id);
    n++;
  });
  inq.status = 'fruit'; inq.confirmed_by = me(); inq.confirmed_at = at;
  unlockPlace(g.school_year, g.grade, g.class_no, 'winter', at);
  const all = db.groups.filter(x => x.school_year === g.school_year && x.grade === g.grade && x.class_no === g.class_no);
  const done = all.filter(gr => db.group_inquiries.some(i => i.group_id === gr.id && db.group_steps.some(s => s.inquiry_id === i.id && s.kind === 'wrap' && s.done_at != null))).length;
  if(all.length > 0 && all.length === done) unlockPlace(g.school_year, g.grade, g.class_no, 'obs', at);
  return n;
});
def('returnGroup', function(inqId, note){                 // return_group
  needTeacher();
  const inq = db.group_inquiries.find(i => i.id === Number(inqId));
  if(!inq || inq.status !== 'wait') return false;
  const n = btrim(note == null ? '' : String(note));
  inq.status = 'returned'; inq.teacher_note = n === '' ? null : n;
  return true;
});
def('classForest', function(g, c){
  if(!isTeacher(me())) return [];
  const y = schoolYear();
  return db.class_forest_unlocks.filter(u => u.school_year === y && u.grade === Number(g) && u.class_no === Number(c)).map(u => ({place:u.place, unlocked_at:u.unlocked_at}));
});
def('liveStart', function(g, c, mode){
  const t = teacherOf(me());
  if(!t) throw sysErr('new row violates row-level security policy for table "lesson_live"');
  if(mode !== 'clue' && mode !== 'group') throw sysErr('new row for relation "lesson_live" violates check constraint "lesson_live_mode_check"');
  db.lesson_live.forEach(l => { if(l.active && l.grade === Number(g) && l.class_no === Number(c) && l.teacher_id === t.id) l.active = false; });
  const at = nowISO();
  const row = {id:seq('lesson_live'), teacher_id:t.id, grade:Number(g), class_no:Number(c), mode:mode, stage:0, stage_started_at:at, active:true, created_at:at};
  db.lesson_live.push(row);
  return row;
});
function ownLive(id){ const t = teacherOf(me()); const l = db.lesson_live.find(x => x.id === Number(id)); if(!t || !l || l.teacher_id !== t.id) throw sysErr('JSON object requested, multiple (or no) rows returned'); return l; }
def('liveSetStage', function(id, stage){ const l = ownLive(id); l.stage = Number(stage) || 0; l.stage_started_at = nowISO(); return l; });
def('liveStop', function(id){ const t = teacherOf(me()); const l = db.lesson_live.find(x => x.id === Number(id)); if(t && l && l.teacher_id === t.id) l.active = false; return true; });
def('cutoverStatus', function(){ return db.v2_cutover.slice().sort((a, b) => a.grade - b.grade || a.class_no - b.class_no); });

/* ═══════════ 씨앗 자료 ═══════════ */
const PEOPLE = [   // key, 이름, 학년, 반, 번호, 도토리, 지금 레벨(옮긴 반만)
  ['A', '가람', 2, 11, 1, 23, 3], ['B', '나래', 2, 11, 2, 12, 2], ['C', '다온', 2, 11, 3, 8, 2], ['D', '라온', 2, 11, 4, 5, 1],
  ['F', '바다', 2, 11, 5, 6, 1], ['G', '새봄', 2, 11, 6, 9, 2], ['E', '마루', 2, 5, 1, 4, null]
];
function seed(){
  const T0 = Date.now(), MIN = 6e4, H = 36e5, D = 864e5;
  const ago = ms => new Date(T0 - ms).toISOString();
  db = {v:VER, seq:{questions:200, clues:500, groups:10, group_inquiries:30, group_steps:300, trees:200, footprints:0, acorn_ledger:0, flowers:0, lesson_live:0, active_units:0},
    users:{}, profiles:[], subjects:[], trees:[], teachers:[], questions:[], step_marks:[], footprints:[], acorn_ledger:[], clues:[], flowers:[], curious_marks:[],
    groups:[], group_members:[], group_inquiries:[], group_steps:[], group_fruits:[], lesson_live:[], class_forest_unlocks:[], legacy_level:[], v2_cutover:[], active_units:[]};
  PEOPLE.forEach(r => {
    const uid = 'u-' + r[0];
    db.users[r[0]] = {key:r[0], uid:uid, email:QO.check.fakeEmail(r[2], r[3], r[4]), pw:'1234'};
    db.profiles.push({id:uid, name:r[1], grade:r[2], class_no:r[3], number:r[4], seeds:r[5], active_sub:'science_' + uid, teacher_id:1, teacher_ids:[1], unlocked_items:['default'], active_tree:'default', active_companion:null});
    db.subjects.push({id:'science_' + uid, user_id:uid, label:'과학', icon:'🔬', sort_order:1});
    db.trees.push({id:seq('trees'), user_id:uid, subject_id:'science_' + uid, name:'나의 첫 나무', sort_order:1});
    if(r[6]) db.legacy_level.push({user_id:uid, level:r[6], taken_at:ago(7 * D)});
  });
  db.users.T = {key:'T', uid:'u-T', email:'teacher@haenuri.app', pw:'1234'};
  db.teachers.push({id:1, auth_id:'u-T', name:'과학', subject_id:'science', subject_label:'과학', grade:2});

  const treeOf = uid => (db.trees.find(t => t.user_id === uid) || {}).id || null;
  const Q = (id, who, created, text, unit, extra) => {
    const uid = 'u-' + who;
    const q = Object.assign(baseQ(), {id:id, user_id:uid, subject_id:'science_' + uid, tree_id:treeOf(uid), text:text, unit:unit || null, created_at:created, question_date:kstDay(created)}, extra || {});
    db.questions.push(q);
    return q;
  };
  const P = (text, at) => ({text:text, at:at});
  /* 가람(A) — 여러 상태 */
  Q(101, 'A', ago(2 * H), '전동기는 어떻게 계속 같은 방향으로 돌까?', '전동기');
  const p102 = '겨울엔 공기가 건조해서 그런 것 같다. 여름엔 땀이 나니까 덜 생긴다.';
  Q(102, 'A', ago(3 * D), '겨울에 정전기가 더 잘 생기는 이유는 뭘까?', '마찰 전기', {
    journal:{predict:[P(p102, ago(3 * D - 10 * MIN))], method:{kind:'book', plan:''}},
    solve:{guess:p102, how:['src'], change:'', saved_at:ago(3 * D - 20 * MIN)}});
  const p103 = '바늘이 반대쪽으로 돌 것 같다. 왜냐하면 전류의 방향이 바뀌면 자기장의 방향도 바뀌니까.';
  const m103 = '전지를 반대로 끼우고 나침반 바늘이 가리키는 쪽을 보기';
  Q(103, 'A', ago(2 * D), '전류의 방향을 바꾸면 나침반 바늘은 어떻게 될까?', '코일 주위의 자기장', {
    journal:{predict:[P(p103, ago(2 * D - 10 * MIN))], method:{kind:'exp', plan:m103}, flag:{step:'find', tried:'실험 방법은 정했는데 나침반을 도선 어디에 둬야 할지 모르겠어요', at:ago(1 * D)}},
    solve:{guess:p103, how:['exp'], change:m103, saved_at:ago(1 * D)}});
  const p104 = '빛이 더 빨라서 그런 것 같다. 왜냐하면 불꽃놀이도 빛이 먼저 보이니까.';
  const w104 = '빛이 소리보다 훨씬 빨라서 번개의 빛이 천둥소리보다 먼저 도착한다.';
  Q(104, 'A', ago(5 * D), '번개는 소리보다 빛이 먼저 보이는 이유는?', '마찰 전기', {
    journal:{predict:[P(p104, ago(5 * D - 10 * MIN))], method:{kind:'web', plan:''},
      find:[{src:'과학관 누리집', text:'빛은 1초에 약 30만 km를 가고, 소리는 1초에 약 340 m를 간다.', ai:false, at:ago(4 * D)},
            {src:'교과서 104쪽', text:'번개가 칠 때 빛과 소리가 함께 생기지만 빛이 훨씬 먼저 도착한다.', ai:false, at:ago(4 * D - H)}],
      same:'같아요', wrap:{mode:'known', text:w104, cmp:'right', changedBy:'', at:ago(1 * D)}},
    solve:{guess:p104, how:['src'], change:'', source:'과학관 누리집', answer:w104, saved_at:ago(1 * D)},
    finding:w104, resolve_requested_at:ago(1 * D)});
  const a105 = '건전지를 직렬로 연결하면 전압이 커져서 전구에 흐르는 전류가 세지고 더 밝아진다.';
  Q(105, 'A', ago(40 * D), '건전지를 직렬로 연결하면 왜 전구가 더 밝아질까?', '직렬과 병렬', {
    solve:{mode:'full', guess:'전구가 더 밝아질 것 같다', why:'건전지 두 개가 함께 밀어 주니까', how:['exp'], change:'건전지 1개일 때와 2개를 직렬로 연결했을 때 전구 밝기 비교',
      source:'교과서 98쪽', answer:a105, saved_at:ago(40 * D - H)}, finding:a105});
  Q(106, 'A', ago(9 * D), '자석 주위에 철가루를 뿌리면 왜 무늬가 생길까?', '코일 주위의 자기장', {
    journal:{predict:[P('N극과 S극 근처에 철가루가 많이 모일 것 같다. 왜냐하면 극에서 끌어당기는 힘이 가장 세니까.', ago(9 * D - 10 * MIN))],
      method:{kind:'exp', plan:'막대자석 위에 종이를 놓고 철가루를 뿌려 모양 보기'},
      find:[{src:'실험', text:'철가루가 두 극 사이를 잇는 곡선 모양으로 늘어섰다.', ai:false, at:ago(8 * D)}],
      wrap:{mode:'known', text:'자석 주위에는 자기장이 있고, 철가루가 자기장의 방향을 따라 늘어서서 무늬가 생긴다.', cmp:'part', changedBy:'두 극 사이를 잇는 곡선 모양을 보고', at:ago(7 * D)},
      extend:{kind:'life', text:'냉장고 자석 주변에도 자기장이 있어서 클립이 끌려가는 것 같다.'}},
    solve:{guess:'N극과 S극 근처에 철가루가 많이 모일 것 같다. 왜냐하면 극에서 끌어당기는 힘이 가장 세니까.', how:['exp'], change:'막대자석 위에 종이를 놓고 철가루를 뿌려 모양 보기',
      source:'실험', answer:'자석 주위에는 자기장이 있고, 철가루가 자기장의 방향을 따라 늘어서서 무늬가 생긴다.', saved_at:ago(7 * D)},
    finding:'자석 주위에는 자기장이 있고, 철가루가 자기장의 방향을 따라 늘어서서 무늬가 생긴다.',
    fruit_kind:'fruit', fruit_source:'teacher', resolved:true, resolved_by:'u-T', resolved_at:ago(2 * D)});
  const r107 = '우주가 계속 팽창하고 있다는 것까지 교과서 160쪽과 과학관 누리집에서 찾았다.';
  Q(107, 'A', ago(12 * D), '우주 끝에는 무엇이 있을까?', '우주 팽창', {
    journal:{predict:[P('아무것도 없는 공간이 계속될 것 같다. 왜냐하면 끝이 있다면 그 너머가 또 있어야 하니까.', ago(12 * D - 10 * MIN))], method:{kind:'book', plan:''},
      find:[{src:'교과서 160쪽', text:'우주는 계속 팽창하고 있고, 은하들이 서로 멀어지고 있다.', ai:false, at:ago(11 * D)},
            {src:'과학관 누리집', text:'우리가 관측할 수 있는 우주에는 끝이 있다.', ai:false, at:ago(10 * D)}],
      same:'달라요 — 교과서는 팽창을, 누리집은 관측할 수 있는 끝을 말해요',
      wrap:{mode:'unknown', reached:r107, stuckQ:'관측할 수 있는 우주 바깥에는 무엇이 있을까?', why:'과학자도 아직 모름', cmp:'changed', changedBy:'우주가 계속 팽창한다는 글', at:ago(9 * D)}},
    solve:{guess:'아무것도 없는 공간이 계속될 것 같다. 왜냐하면 끝이 있다면 그 너머가 또 있어야 하니까.', how:['src'], change:'', source:'교과서 160쪽', stuck:1, stuckWhere:r107, saved_at:ago(9 * D)},
    still_wondering:'관측할 수 있는 우주 바깥에는 무엇이 있을까?', fruit_kind:'fog', fruit_source:'teacher', resolved_by:'u-T', resolved_at:ago(5 * D)});
  Q(108, 'A', ago(1 * D), '별은 왜 반짝거릴까?', '별의 밝기와 등급', {
    teacher_refine_note:'좋은 질문이에요. 어떤 별을, 어디서 볼 때 반짝이는지 상황을 더 자세히 써 보면 찾기가 쉬워져요.', teacher_fb_at:ago(5 * H), fb_unread:true});
  Q(109, 'A', ago(60 * D), '정전기는 왜 생길까?', '마찰 전기', {teacher_answer:'서로 다른 물체를 문지르면 전자가 한쪽으로 옮겨 가서 생겨요. 겨울에는 공기가 건조해서 그 전하가 잘 빠져나가지 못해요.', resolved:true, fruit_kind:'fruit', fruit_source:'legacy', resolved_at:ago(58 * D)});
  /* 나래(B) */
  const p121 = '전구 하나일 때보다 어두워질 것 같다. 왜냐하면 전기를 둘이 나눠 쓰니까.';
  Q(121, 'B', ago(2 * D), '전구 두 개를 병렬로 연결하면 밝기는 어떻게 될까?', '직렬과 병렬', {
    journal:{predict:[P(p121, ago(2 * D - 10 * MIN))], flag:{step:'method', tried:'예상은 했는데 어떻게 알아볼지 모르겠어요', at:ago(1 * D + H)}}, solve:{guess:p121, saved_at:ago(2 * D - 10 * MIN)}});
  const w122 = '저항은 전류의 흐름을 방해해서 저항이 크면 전류가 작아진다.';
  Q(122, 'B', ago(6 * D), '저항이 크면 왜 전류가 작아질까?', '옴의 법칙', {
    journal:{predict:[P('전류가 작아질 것 같다. 왜냐하면 저항이 전류를 막으니까.', ago(6 * D - 10 * MIN))], method:{kind:'book', plan:''},
      find:[{src:'교과서 92쪽', text:'전압이 같을 때 저항이 크면 전류가 작게 흐른다.', ai:false, at:ago(5 * D)}],
      wrap:{mode:'known', text:w122, cmp:'right', changedBy:'', at:ago(3 * D)}, returned:{step:'find', at:ago(1 * D)}},
    solve:{guess:'전류가 작아질 것 같다. 왜냐하면 저항이 전류를 막으니까.', how:['src'], change:'', source:'교과서 92쪽', answer:w122, saved_at:ago(3 * D)}, finding:w122,
    teacher_nudge:'찾은 곳이 한 곳뿐이에요. 교과서 말고 다른 곳에서 하나 더 찾아볼까요?', teacher_fb_at:ago(1 * D), fb_unread:true});
  Q(123, 'B', ago(3 * D), '주유소에서 정전기 때문에 불이 날 수도 있을까?', '마찰 전기', {is_anonymous:true,
    journal:{predict:[P('날 수 있을 것 같다. 왜냐하면 정전기도 불꽃이 튀니까.', ago(3 * D - 10 * MIN))], flag:{step:'find', tried:'주유소 안내문은 봤는데 왜 위험한지는 못 찾았어요', at:ago(2 * D)}},
    solve:{guess:'날 수 있을 것 같다. 왜냐하면 정전기도 불꽃이 튀니까.', saved_at:ago(2 * D)}});
  /* 다온(C) · 라온(D) · 바다(F) · 새봄(G) */
  Q(131, 'C', ago(2 * D), '코일에 전류가 흐르면 왜 자석처럼 될까?', '코일 주위의 자기장', {
    journal:{predict:[P('전류가 자기장을 만들어서 그런 것 같다. 왜냐하면 도선 옆 나침반이 움직였으니까.', ago(2 * D - 10 * MIN))], flag:{step:'find', tried:'예상은 했는데 어디서 확인해야 할지 모르겠어요', at:ago(1 * D)}},
    solve:{guess:'전류가 자기장을 만들어서 그런 것 같다. 왜냐하면 도선 옆 나침반이 움직였으니까.', saved_at:ago(1 * D)}});
  Q(132, 'C', ago(4 * H), '주사기 입구를 막고 누르면 왜 잘 안 들어갈까?', null);
  Q(141, 'D', ago(3 * D), '별의 색은 왜 다를까?', '겉보기·절대 등급과 별의 색', {
    journal:{predict:[P('별의 온도가 서로 달라서 그런 것 같다. 왜냐하면 불도 뜨거울수록 색이 바뀌니까.', ago(3 * D - 10 * MIN))], flag:{step:'find', tried:'온도와 관계 있다는 말은 들었는데 출처를 못 찾았어요', at:ago(2 * D)}},
    solve:{guess:'별의 온도가 서로 달라서 그런 것 같다. 왜냐하면 불도 뜨거울수록 색이 바뀌니까.', saved_at:ago(2 * D)}});
  Q(142, 'D', ago(1 * D), '전기뱀장어는 어떻게 전기를 만들까?', '전류·전압·저항');
  Q(151, 'F', ago(4 * D), '번개는 왜 지그재그로 칠까?', '마찰 전기');
  Q(161, 'G', ago(1 * D), '풍선을 머리에 문지르면 왜 머리카락이 달라붙을까?', '마찰 전기', {
    journal:{predict:[P('풍선과 머리카락이 서로 다른 전기를 띠어서 그런 것 같다. 왜냐하면 문지르면 전기가 생기니까.', ago(1 * D - 10 * MIN))]},
    solve:{guess:'풍선과 머리카락이 서로 다른 전기를 띠어서 그런 것 같다. 왜냐하면 문지르면 전기가 생기니까.', saved_at:ago(1 * D - 10 * MIN)}});
  /* 마루(E, 2-5) */
  Q(171, 'E', ago(2 * D), '마찰 전기로 전구를 켤 수 있을까?', '마찰 전기', {
    journal:{predict:[P('켤 수 있을 것 같다. 왜냐하면 정전기도 전기니까.', ago(2 * D - 10 * MIN))], flag:{step:'find', tried:'정전기로 형광등이 잠깐 켜지는 영상은 봤는데 왜 그런지 못 찾았어요', at:ago(1 * D)}},
    solve:{guess:'켤 수 있을 것 같다. 왜냐하면 정전기도 전기니까.', saved_at:ago(1 * D)}});
  const w172 = '별이 멀수록 지구가 공전해도 별이 보이는 방향이 조금만 바뀌어서 연주 시차가 작다.';
  Q(172, 'E', ago(6 * D), '멀리 있는 별일수록 왜 연주 시차가 작을까?', '연주 시차', {
    journal:{predict:[P('멀리 있으면 덜 움직여 보일 것 같다. 왜냐하면 먼 산은 차를 타고 가도 천천히 지나가니까.', ago(6 * D - 10 * MIN))], method:{kind:'book', plan:''},
      find:[{src:'교과서 140쪽', text:'연주 시차는 별까지의 거리가 멀수록 작아진다.', ai:false, at:ago(5 * D)},
            {src:'과학관 누리집', text:'가까운 별은 1년 동안 위치가 조금 바뀌어 보이고, 먼 별은 거의 바뀌지 않는다.', ai:false, at:ago(4 * D)}],
      same:'같아요', wrap:{mode:'known', text:w172, cmp:'right', changedBy:'', at:ago(1 * D)}},
    solve:{guess:'멀리 있으면 덜 움직여 보일 것 같다. 왜냐하면 먼 산은 차를 타고 가도 천천히 지나가니까.', how:['src'], change:'', source:'교과서 140쪽', answer:w172, saved_at:ago(1 * D)},
    finding:w172, resolve_requested_at:ago(1 * D)});

  /* 칸 표시·발자국 — 그 질문을 마지막으로 쓴 때 기준 */
  db.questions.forEach(q => {
    const s = q.solve || {}, j = q.journal || {};
    const ts = [q.created_at, s.saved_at].concat((j.predict || []).map(p => p.at), (j.find || []).map(f => f.at), j.wrap ? [j.wrap.at] : [], j.flag ? [j.flag.at] : []).filter(Boolean).sort();
    markQuestion(q, q.journal ? 'live' : 'backfill', ts[ts.length - 1]);
  });

  /* 단서 — 102 에 나래의 「찾아볼 곳」, 121 에 가람의 「해 볼 실험」 */
  const C = (id, qid, who, kind, step, body, at) => {
    const p = prof('u-' + who), mk = db.step_marks.find(m => m.question_id === qid && m.step === step && m.first_at <= at);
    db.clues.push({id:id, question_id:qid, author_id:p.id, kind:kind, step:step, body:body, snapshot_md5:mk ? mk.text_md5 : null,
      school_year:schoolYear(at), grade:p.grade, class_no:p.class_no, created_at:at, thanked_at:null, thanks_text:null, declined_at:null, hidden_at:null});
  };
  C(501, 102, 'B', 'where', 'find', "교과서 112쪽 · 검색어 '습도 정전기'", ago(2 * D));
  C(502, 121, 'A', 'test', 'method', '전구 하나를 빼 보고 다른 전구가 켜지는지 보면 알 수 있을 것 같아요', ago(20 * H));
  db.seq.clues = 502;

  /* 모둠 — 2-11 은 둘, 2-5 는 하나 */
  const y = schoolYear();
  const G = (id, g, c, no, keys) => { db.groups.push({id:id, school_year:y, grade:g, class_no:c, group_no:no, name:no + '모둠', created_at:ago(7 * D)}); keys.forEach(k => db.group_members.push({group_id:id, user_id:'u-' + k})); };
  G(11, 2, 11, 1, ['A', 'B', 'F']); G(12, 2, 11, 2, ['C', 'D', 'G']); G(13, 2, 5, 1, ['E']);
  db.seq.groups = 13;
  db.group_inquiries.push({id:31, group_id:11, question_id:151, question_text:'번개는 왜 지그재그로 칠까?', why:'모두 궁금함 · 교과서와 영상으로 알아볼 수 있음',
    status:'open', teacher_note:null, confirmed_by:null, confirmed_at:null, created_at:ago(1 * D)});
  db.seq.group_inquiries = 31;
  buildSteps(31, ['u-A', 'u-B', 'u-F']);
  const fill = (kind, who, body, src) => { const s = db.group_steps.find(x => x.inquiry_id === 31 && x.kind === kind && x.assignee_id === 'u-' + who && !x.done_at); s.body = body; s.src = src || ''; s.done_at = ago(20 * H); };
  fill('predict', 'A', '공기가 고르지 않아서 전기가 흐르기 쉬운 길을 찾아가는 것 같다.');
  fill('predict', 'B', '구름 속 전기가 한꺼번에 내려오지 못해서 꺾이는 것 같다.');
  fill('predict', 'F', '바람 때문에 번개가 휘는 것 같다.');
  fill('find', 'B', '번개는 공기 속에서 전기가 흐르기 쉬운 길을 따라 조금씩 나아간다.', '과학관 누리집');

  /* 도토리 원장 · 옮긴 반 · 반 숲 · 지금 차시 */
  db.v2_cutover.push({grade:2, class_no:11, cutover_at:ago(7 * D), note:{}});
  db.profiles.filter(p => p.grade === 2 && p.class_no === 11).forEach(p => {
    const fr = db.questions.filter(q => q.user_id === p.id && q.fruit_source === 'teacher');
    const grants = fr.map(q => ({q, n:new Set(db.footprints.filter(f => f.question_id === q.id).map(f => f.step)).size + 5}));
    const opening = Math.max(0, p.seeds - grants.reduce((a, g) => a + g.n, 0));
    db.acorn_ledger.push({id:seq('acorn_ledger'), user_id:p.id, delta:opening, reason:'opening', ref_id:'T0', kst_day:kstDay(ago(7 * D)), created_at:ago(7 * D)});
    grants.forEach(g => db.acorn_ledger.push({id:seq('acorn_ledger'), user_id:p.id, delta:g.n, reason:'fruit', ref_id:String(g.q.id), kst_day:kstDay(g.q.resolved_at), created_at:g.q.resolved_at}));
  });
  unlockPlace(y, 2, 11, 'spring', ago(5 * D));
  db.active_units.push({id:seq('active_units'), teacher_id:1, target_grade:2, target_class:11, unit:'코일 주위의 자기장', subject_id:'science', subject_label:'과학',
    set_at:ago(10 * MIN), expires_at:new Date(T0 + 30 * D).toISOString()});
}

/* ═══════════ 바깥에 보이는 것 ═══════════ */
const LABELS = {A:'가람 (2-11 1번)', B:'나래 (2-11 2번)', C:'다온 (2-11 3번)', D:'라온 (2-11 4번)', E:'마루 (2-5 1번)', F:'바다 (2-11 5번)', G:'새봄 (2-11 6번)', T:'선생님'};
function reset(){ seed(); save(); return true; }
function loginAs(key){
  const u = db.users[String(key || '').toUpperCase()];
  if(!u) throw new Error('mock 에 없는 사람: ' + key);
  setWho(u.uid);
  return u.uid;
}
function who(){ const id = me(); const u = id && Object.values(db.users).find(x => x.uid === id); return u ? {key:u.key, uid:u.uid, label:LABELS[u.key] || u.key} : null; }
function picker(){ return (cfg.page === 'teacher' ? ['T'] : ['A', 'B', 'C', 'D', 'E']).map(k => ({key:k, label:LABELS[k]})); }
Object.assign(M, {reset, save, loginAs, logout:() => setWho(null), who, picker, seed, LABELS, PEOPLE});

db = load();
if(!db){ seed(); save(); }
})();
