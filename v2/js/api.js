/* 질문과수원 2 — 진짜 데이터 함수(QO.apiReal) 와 앞문(QO.api).
   QO.api.x 를 읽으면 시연 모드(cfg.mock)에서는 QO.mock.api.x, 아니면 QO.apiReal.x 가 나온다.
   QO.api.x = fn 으로 넣으면 언제나 진짜 쪽(QO.apiReal)에 들어간다. 흉내 쪽은 QO.mock.extend({x}).
   모든 함수는 이름·인자·돌려주는 모양이 QO.mock.api 와 같다(CONTRACT.md). 실패하면 throw. */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg;
/* 학생 화면이 쓰는 질문 칸(학생이 읽을 수 있는 것만) */
const BASE_COLS = 'id,text,refined_text,refined_at,unit,is_anonymous,created_at,resolved,resolved_at,solve,journal,finding,still_wondering,answer_text,tags,' +
  'teacher_nudge,teacher_stamp,teacher_refine_note,teacher_solve_note,teacher_fb_at,fb_unread,fruit_kind,fruit_source,resolve_requested_at,parent_id,tree_id,subject_id,phase,material_id,answer_files,is_picked';
let COLS = BASE_COLS;
const CLUE_COLS = 'id,question_id,kind,step,body,created_at,thanked_at,thanks_text,declined_at,hidden_at';
QO.COLS = COLS; QO.CLUE_COLS = CLUE_COLS;

let sb = null, sbP = null, teacherCache = null;
function loadLib(){
  return new Promise((res, rej) => {
    if(window.supabase && window.supabase.createClient) return res();
    const s = document.createElement('script');
    s.src = cfg.sbLib; s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('supabase 라이브러리를 불러오지 못했어요'));
    document.head.appendChild(s);
  });
}
/* 💬 선생님의 답변 칸(18_선생님답변.sql) — DB 에 칸이 생겼을 때만 같이 읽는다. 없으면 예전 칸만(그래야 SQL 전에 올려도 안 깨진다) */
let ansProbe = null;
async function cols(cl){
  if(COLS !== BASE_COLS) return COLS;
  if(ansProbe === null){
    ansProbe = cl.from('questions').select('teacher_answer').limit(1).then(r => {
      if(!r.error){ COLS = BASE_COLS + ',teacher_answer'; QO.COLS = COLS; }
      else if(!/teacher_answer|42703|column/i.test((r.error.message || '') + (r.error.code || ''))) ansProbe = null;   /* 로그인 전 권한 오류 등은 나중에 다시 */
    }, () => { ansProbe = null; });
  }
  await ansProbe;
  return COLS;
}
/* 선생님 단서 표시 칸(v2_08 clues.by_teacher) — 있을 때만 같이 읽는다(SQL 전에 올려도 안 깨지게) */
let clueProbe = null, clueColsNow = CLUE_COLS;
async function clueCols(cl){
  if(clueColsNow !== CLUE_COLS) return clueColsNow;
  if(clueProbe === null){
    clueProbe = cl.from('clues').select('by_teacher').limit(1).then(r => {
      if(!r.error){ clueColsNow = CLUE_COLS + ',by_teacher'; QO.CLUE_COLS = clueColsNow; }
      else if(!/by_teacher|42703|column/i.test((r.error.message || '') + (r.error.code || ''))) clueProbe = null;
    }, () => { clueProbe = null; });
  }
  await clueProbe;
  return clueColsNow;
}
async function client(){
  if(sb) return sb;
  if(!sbP) sbP = loadLib().then(() => { sb = window.supabase.createClient(cfg.url, cfg.key); return sb; }).catch(e => { sbP = null; throw e; });
  return sbP;
}
/* 모듈이 표를 직접 읽어야 할 때 쓰는 문(같은 세션의 클라이언트). QO.apiReal 밖에 두어 흉내 쪽과 이름 견주기에 안 걸리게 */
QO.sbClient = client;
function fail(error){ const e = new Error(error.message || String(error)); e.code = error.code; e.details = error.details; e.hint = error.hint; throw e; }
const userErr = msg => QO.userError(msg);
async function uid(){ const c = await client(); const r = await c.auth.getSession(); return r.data && r.data.session ? r.data.session.user.id : null; }
async function needUid(){ const id = await uid(); if(!id) throw userErr('로그인이 필요해요'); return id; }
async function rpc(name, args){ const c = await client(); const r = await c.rpc(name, args || {}); if(r.error) fail(r.error); return r.data; }
/* PostgREST 는 한 번에 1000줄에서 조용히 자른다 → 나눠 받는다. make 는 매번 새 쿼리를 만든다 */
async function pages(make){
  const out = [];
  for(let from = 0; ; from += 1000){
    const r = await make().range(from, from + 999);
    if(r.error) fail(r.error);
    const d = r.data || [];
    out.push.apply(out, d);
    if(d.length < 1000) break;
  }
  return out;
}
function chunks(a, n){ const out = []; for(let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
async function one(q){ const r = await q; if(r.error) fail(r.error); return r.data; }
async function meProfile(){
  const id = await needUid();
  if(QO.state.me && QO.state.me.id === id) return QO.state.me;
  const r = await A.loadMe();
  return r.profile;
}
const nowISO = () => new Date().toISOString();
/* 하루·차시 상한 — 옛 앱 fetchQuota·unitBlocked 와 같은 RPC(7_하루제한.sql). 못 세면 통과(수업을 막지 않는다) */
async function quotaCheck(unit, phase){
  let q = null;
  try{ const c = await client(); const r = await c.rpc('my_daily_quota'); if(!r.error) q = Array.isArray(r.data) ? r.data[0] : r.data; }catch(_){ q = null; }
  if(!q) return;
  const cap = q.new_per_day == null ? -1 : (q.new_per_day | 0), planted = q.planted | 0;
  /* 「수업 닫기」 질문은 상한을 다 썼어도 하루 한 개 더(옛 앱 quotaBlocked 와 같음). 상한 0 = 새 질문 없는 날 */
  const afterFree = phase === 'after' && (q.planted_after | 0) === 0;
  if(cap === 0 || (cap > 0 && planted >= cap && !afterFree)) throw userErr('오늘 심을 수 있는 새 질문을 다 심었어요. 이어서 해 볼 질문을 탐구해 봐요.');
  const unitCap = q.per_unit != null ? (q.per_unit | 0) : 0;
  if(!unit || unitCap <= 0) return;
  try{
    const c = await client(); const r = await c.rpc('my_unit_count', {p_unit:unit});
    if(r.error) return;
    const n = typeof r.data === 'number' ? r.data : ((r.data && r.data[0]) || 0);
    if(n >= unitCap) throw userErr('이 차시에는 질문을 ' + unitCap + '개까지 심을 수 있어요. 심어 둔 질문을 이어서 탐구해 봐요.');
  }catch(e){ if(e && e.code === 'P0001') throw e; }
}
const sortNum = (a, b) => (a.number || 0) - (b.number || 0);

const A = QO.apiReal = {
  /* ── 로그인 ── */
  async signInStudent(g, c, n, pw){
    const bad = QO.check.identity(g, c, n); if(bad) throw userErr(bad);
    if(!pw) throw userErr('비밀번호를 입력해주세요');
    const cl = await client();
    const r = await cl.auth.signInWithPassword({email:QO.check.fakeEmail(g, c, n), password:pw});
    if(r.error) throw userErr(/invalid/i.test(r.error.message) ? '학년·반·번호 또는 비밀번호를 확인해주세요' : '로그인 실패: ' + r.error.message);
    if(!r.data || !r.data.user) throw userErr('로그인 처리 중 문제가 발생했어요.');
    return {user:{id:r.data.user.id, email:r.data.user.email}};
  },
  async signInTeacher(email, pw){
    if(!email || !pw) throw userErr('이메일과 비밀번호를 넣어 주세요');
    const cl = await client();
    const r = await cl.auth.signInWithPassword({email:String(email).trim(), password:pw});
    if(r.error) throw userErr(/invalid/i.test(r.error.message) ? '이메일 또는 비밀번호를 확인해 주세요' : '로그인 실패: ' + r.error.message);
    teacherCache = null;
    const t = await A.teacherMe();
    if(!t){ await cl.auth.signOut(); throw userErr('선생님 계정이 아니에요'); }
    return {user:{id:r.data.user.id, email:r.data.user.email}, teacher:t};
  },
  /* 기본은 이 기기만(local). 학생이 직접 누른 로그아웃만 모든 기기(global) — 선생님 결정 11-02 */
  async signOut(scope){ const cl = await client(); teacherCache = null; const r = await cl.auth.signOut({scope:scope === 'global' ? 'global' : 'local'}); if(r && r.error) fail(r.error); return true; },
  async session(){
    const cl = await client();
    const r = await cl.auth.getSession();
    const s = r.data && r.data.session;
    return s ? {user:{id:s.user.id, email:s.user.email}} : null;
  },

  /* ── 나 ── */
  async loadMe(){
    const id = await needUid(), cl = await client();
    const prof = await one(cl.from('profiles').select('id,name,grade,class_no,number,seeds,active_sub,teacher_id,teacher_ids,active_tree,active_companion,unlocked_items').eq('id', id).maybeSingle());
    if(!prof) throw userErr('학생 정보를 찾지 못했어요. 선생님께 알려 주세요.');
    const subjects = await one(cl.from('subjects').select('id,label,icon,sort_order').eq('user_id', id).order('sort_order'));
    const trees = await one(cl.from('trees').select('id,subject_id,sort_order').eq('user_id', id).order('sort_order', {ascending:true}).order('id', {ascending:true}));
    const subs = subjects || [];
    let active = prof.active_sub || '';
    if(!subs.find(s => s.id === active)) active = subs.length ? subs[0].id : '';
    prof.active_sub = active;
    prof.seeds = prof.seeds || 0;
    return {profile:prof, subjects:subs, trees:trees || []};
  },
  myTree(){ return rpc('my_tree'); },
  /* 상점·우리 반 나무(v2_03) — 값은 서버가 정한다 */
  buyItem(id){ return rpc('buy_item', {p_item:id}); },
  equipItem(id){ return rpc('equip_item', {p_item:id}); },
  /* 열매 종류(v2_10) — 바꾸기 {active_fruit}, 내 것 읽기(칸이 아직 없으면 null) */
  setFruit(kind){ return rpc('set_fruit', {p_kind:kind}); },
  async myFruit(){
    const id = await needUid(), cl = await client();
    const r = await cl.from('profiles').select('active_fruit').eq('id', id).maybeSingle();
    if(r.error) return null;
    return r.data ? (r.data.active_fruit || null) : null;
  },
  async classmateTrees(){ return (await rpc('classmate_trees')) || []; },
  async friendQuestions(num){ return (await rpc('friend_questions', {p_number:num})) || []; },
  async myForest(){ return (await rpc('my_forest')) || []; },
  /* 우리 반이 질문과수원 2로 옮겨졌나 — 옮긴 반이면 {cutover_at}, 아니면 null(v2_cutover_read 는 모두 읽기) */
  async myCutover(){
    const me = await meProfile(), cl = await client();
    if(me.grade == null || me.class_no == null) return null;
    return one(cl.from('v2_cutover').select('cutover_at').eq('grade', me.grade).eq('class_no', me.class_no).maybeSingle());
  },
  async classmates(){
    const me = await meProfile(), cl = await client();
    return pages(() => cl.from('profiles').select('number,name').eq('grade', me.grade).eq('class_no', me.class_no).order('number'));
  },

  /* ── 내 질문 ── */
  async loadMyQuestions(){
    const id = await needUid(), cl = await client(), C = await cols(cl);
    return pages(() => cl.from('questions').select(C).eq('user_id', id).order('id', {ascending:false}));
  },
  async plantQuestion(input){
    input = input || {};
    const id = await needUid(), cl = await client();
    const text = String(input.text || '').trim();
    if(!text) throw userErr('궁금한 것을 적어 주세요');
    let me = QO.state.me, subjects = QO.state.subjects, trees = QO.state.trees;
    if(!me || me.id !== id){ const r = await A.loadMe(); me = r.profile; subjects = r.subjects; trees = r.trees; }
    const subId = (subjects || []).some(s => s.id === me.active_sub) ? me.active_sub : ((subjects || [])[0] ? subjects[0].id : null);
    const tree = subId ? (trees || []).filter(t => t.subject_id === subId)[0] : null;
    let unit = input.unit;
    if(unit === undefined && !input.parent_id) unit = await A.nowUnit();   // 선생님이 켠 지금 차시
    if(!input.parent_id) await quotaCheck(unit || null, input.phase);                   // 선생님이 정한 하루·차시 상한(옛 앱과 같음)
    /* question_date 는 서버 기본값(current_date) — 옛 앱과 같은 뜻으로 둔다 */
    const payload = {
      user_id:id, subject_id:subId, text:text, tags:Array.isArray(input.tags) ? input.tags : [],
      is_anonymous:!!input.is_anonymous, phase:input.phase || 'before',
      water_count:0, watered_by:[]
    };
    if(unit) payload.unit = unit;
    if(input.parent_id) payload.parent_id = input.parent_id;
    if(input.material_id) payload.material_id = input.material_id;   // 선생님 자료를 보며 심은 질문
    if(input.read && typeof input.read === 'object') payload.journal = {read:input.read};   // 책 보며 심기(read.js) 네 칸
    if(tree) payload.tree_id = tree.id;
    const C = await cols(cl);
    let r = await cl.from('questions').insert(payload).select(C).single();
    /* 나무가 사라졌으면 나무 없이 한 번 더(질문을 잃지 않게) */
    if(r.error && payload.tree_id && /tree/i.test((r.error.message || '') + ' ' + (r.error.details || ''))){
      delete payload.tree_id;
      r = await cl.from('questions').insert(payload).select(C).single();
    }
    if(r.error) fail(r.error);
    return r.data;
  },
  saveJournal(qid, patch){ return rpc('save_journal', {p_qid:qid, p_patch:patch || {}}); },
  saveReadFound(qid, text){ return rpc('save_read_found', {p_qid:qid, p_text:text}); },   // v2_07 모르는 낱말의 찾은 뜻
  async loadMarks(qids){
    qids = (qids || []).filter(x => x != null); if(!qids.length) return [];
    const cl = await client(), out = [];
    for(const ch of chunks(qids, 100)) out.push.apply(out, await pages(() => cl.from('step_marks').select('question_id,step,first_at,last_at,text_md5').in('question_id', ch).order('question_id').order('step')));
    return out;
  },
  async loadMyFootprints(){
    const id = await needUid(), cl = await client();
    return pages(() => cl.from('footprints').select('id,question_id,step,source,kst_day,created_at').eq('user_id', id).order('id'));
  },
  async loadCluesOnMine(qids){
    qids = (qids || []).filter(x => x != null); if(!qids.length) return [];
    const cl = await client(), out = [], cc = await clueCols(cl);
    for(const ch of chunks(qids, 100)) out.push.apply(out, await pages(() => cl.from('clues').select(cc + ',snapshot_md5').in('question_id', ch).is('hidden_at', null).order('id')));
    return out;
  },
  async markFbSeen(qid){
    const id = await needUid(), cl = await client();
    const ids = (Array.isArray(qid) ? qid : [qid]).filter(x => x != null);
    if(!ids.length) return true;
    const r = await cl.from('questions').update({fb_unread:false, fb_seen_at:nowISO()}).in('id', ids).eq('user_id', id);
    if(r.error) fail(r.error);
    return true;
  },
  /* 단원을 뒤에 붙이기 — 주인은 unit 을 고칠 수 있다(guard_owner_cols 가 막지 않음) */
  async setUnit(qid, unit){
    const id = await needUid(), cl = await client();
    const u = String(unit || '').trim() || null;
    const r = await cl.from('questions').update({unit:u}).eq('id', qid).eq('user_id', id).select('id,unit').maybeSingle();
    if(r.error) fail(r.error);
    if(!r.data) throw userErr('내 질문만 고칠 수 있어요');
    return r.data;
  },
  /* 선생님이 켠 지금 차시(10_지금차시.sql). 표가 없거나 꺼져 있으면 null */
  async nowUnit(){
    const me = await meProfile(), cl = await client();
    const r = await cl.from('active_units').select('unit,target_grade,target_class,teacher_id,set_at').gt('expires_at', nowISO()).order('set_at', {ascending:false}).limit(30);
    if(r.error) return null;
    const tids = new Set((me.teacher_ids || []).map(Number));
    if(!tids.size && me.teacher_id) tids.add(Number(me.teacher_id));
    const hit = (r.data || []).find(a => (!a.target_grade || +a.target_grade === +me.grade) && (!a.target_class || +a.target_class === +me.class_no) && (!tids.size || tids.has(+a.teacher_id)));
    return hit ? hit.unit : null;
  },

  /* ── 친구·단서 ── */
  async classmateQuestions(limit, before){ return (await rpc('classmate_questions', {p_limit:limit == null ? 60 : limit, p_before:before == null ? null : before})) || []; },
  async clueTargets(n){ return (await rpc('clue_targets', {p_n:n == null ? 2 : n})) || []; },
  addClue(qid, kind, body){ return rpc('add_clue', {p_qid:qid, p_kind:kind, p_body:body}); },
  thankClue(clueId, thanks){ return rpc('thank_clue', {p_clue:clueId, p_thanks:thanks}); },
  declineClue(clueId){ return rpc('decline_clue', {p_clue:clueId}); },
  markCurious(qid){ return rpc('mark_curious', {p_qid:qid}); },
  acornFor(kind, qid){ return rpc('acorn_for', {p_kind:kind, p_qid:qid}); },   // v2_05 심기·물주기 도토리 {granted, seeds}
  /* 내가 「나도 궁금해요」를 누른 질문 id(v2_curious_read: user_id = 나) */
  async myCurious(){
    const id = await needUid(), cl = await client();
    return (await pages(() => cl.from('curious_marks').select('question_id').eq('user_id', id).order('question_id'))).map(r => Number(r.question_id));
  },
  /* 받은 꽃 — flowers 표(receiver = 나). 단서 종류·질문은 내가 쓴 단서에서 */
  async receivedFlowers(){
    const id = await needUid(), cl = await client();
    const fl = await pages(() => cl.from('flowers').select('id,clue_id,thanks_text,kst_day,created_at').eq('receiver', id).order('id', {ascending:false}));
    const cids = fl.map(f => f.clue_id).filter(x => x != null), cmap = new Map();
    for(const ch of chunks(cids, 100)) (await one(cl.from('clues').select('id,kind,question_id').in('id', ch)) || []).forEach(c => cmap.set(c.id, c));
    let bodies = {};
    try{ ((await rpc('classmate_questions', {p_limit:200, p_before:null})) || []).forEach(q => { bodies[q.id] = q.body; }); }catch(_){ bodies = {}; }
    return fl.map(f => { const c = cmap.get(f.clue_id) || {}; return {id:f.id, clue_id:f.clue_id, kind:c.kind || null, thanks_text:f.thanks_text, kst_day:f.kst_day, created_at:f.created_at, question_body:bodies[c.question_id] || null}; });
  },
  async mySentClues(){
    const id = await needUid(), cl = await client();
    const rows = await one(cl.from('clues').select(CLUE_COLS).eq('author_id', id).order('id', {ascending:false}).limit(300));
    let bodies = {};
    try{ ((await rpc('classmate_questions', {p_limit:200, p_before:null})) || []).forEach(q => { bodies[q.id] = q.body; }); }catch(_){ bodies = {}; }
    return (rows || []).map(c => Object.assign({}, c, {question_body:bodies[c.question_id] || null}));
  },

  /* ── 모둠 ── */
  async myGroup(){
    const id = await needUid(), cl = await client();
    const empty = {group:null, members:[], inquiry:null, steps:[]};
    const gm = await one(cl.from('group_members').select('group_id').eq('user_id', id));
    const gids = (gm || []).map(x => x.group_id);
    if(!gids.length) return empty;
    const gs = await one(cl.from('groups').select('*').in('id', gids).eq('school_year', QO.ui.schoolYear()).order('id', {ascending:false}).limit(1));
    const group = (gs || [])[0];
    if(!group) return empty;
    const mem = await one(cl.from('group_members').select('user_id').eq('group_id', group.id));
    const uids = (mem || []).map(x => x.user_id);
    const profs = uids.length ? await one(cl.from('profiles').select('id,name,number').in('id', uids)) : [];
    const members = (profs || []).map(p => ({user_id:p.id, name:p.name, number:p.number})).sort(sortNum);
    const inqs = await one(cl.from('group_inquiries').select('*').eq('group_id', group.id).order('created_at', {ascending:false}).order('id', {ascending:false}).limit(1));
    const inquiry = (inqs || [])[0] || null;
    const steps = inquiry ? await one(cl.from('group_steps').select('*').eq('inquiry_id', inquiry.id).order('step_no').order('id')) : [];
    return {group, members, inquiry, steps:steps || []};
  },
  /* 내가 모둠 열매를 받은 모둠 질문 id(v2_gf_read: user_id = 나) */
  async myGroupFruits(){
    const id = await needUid(), cl = await client();
    return ((await one(cl.from('group_fruits').select('inquiry_id').eq('user_id', id))) || []).map(r => Number(r.inquiry_id));
  },
  /* SQL 에 아직 없다(sql_gaps: neighbor_inquiries) — 같은 반 다른 모둠의 지금 모둠 질문 */
  async neighborInquiries(){ return (await rpc('neighbor_inquiries')) || []; },
  startGroupInquiry(groupId, questionId, text, why){ return rpc('start_group_inquiry', {p_group:groupId, p_question:questionId == null ? null : questionId, p_text:text == null ? null : text, p_why:why == null ? null : why}); },
  saveGroupStep(stepId, body, src){ return rpc('save_group_step', {p_step:stepId, p_body:body, p_src:src == null ? null : src}); },
  pickTeller(inqId){ return rpc('pick_teller', {p_inquiry:inqId}); },
  writeHeard(inqId, body){ return rpc('write_heard', {p_inquiry:inqId, p_body:body}); },
  sendGroupInquiry(inqId){ return rpc('send_group_inquiry', {p_inquiry:inqId}); },

  /* ── 수업 진행 ── */
  async lessonLive(){
    const me = await meProfile(), cl = await client();
    const d = await one(cl.from('lesson_live').select('*').eq('grade', me.grade).eq('class_no', me.class_no).eq('active', true).order('created_at', {ascending:false}).limit(1));
    return (d || [])[0] || null;
  },

  /* ── 선생님 ── */
  async teacherMe(){
    const id = await uid(); if(!id) return null;
    if(teacherCache && teacherCache.auth_id === id) return teacherCache;
    const cl = await client();
    const t = await one(cl.from('teachers').select('id,auth_id,name,subject_id,subject_label,grade').eq('auth_id', id).maybeSingle());
    teacherCache = t || null;
    return teacherCache;
  },
  async classList(){
    const cl = await client();
    const rows = await pages(() => cl.from('profiles').select('id,grade,class_no').not('grade', 'is', null).not('class_no', 'is', null).order('id'));
    const m = new Map();
    rows.forEach(r => { const k = r.grade + '-' + r.class_no; m.set(k, (m.get(k) || 0) + 1); });
    return Array.from(m.entries()).map(e => { const p = e[0].split('-').map(Number); return {grade:p[0], class_no:p[1], n:e[1]}; })
      .sort((a, b) => a.grade - b.grade || a.class_no - b.class_no);
  },
  async classStudents(g, c){
    const cl = await client();
    return pages(() => cl.from('profiles').select('id,name,number,seeds').eq('grade', g).eq('class_no', c).order('number'));
  },
  async pendingFruits(g, c){
    const cl = await client(), C = await cols(cl);
    const st = await A.classStudents(g, c);
    const by = new Map(st.map(s => [s.id, s]));
    const out = [];
    for(const ch of chunks(st.map(s => s.id), 100)){
      out.push.apply(out, await pages(() => cl.from('questions').select(C + ',user_id').in('user_id', ch).not('resolve_requested_at', 'is', null).is('fruit_kind', null).order('id')));
    }
    return out.map(q => Object.assign({}, q, {student:{name:(by.get(q.user_id) || {}).name || '', number:(by.get(q.user_id) || {}).number || null}}))
      .sort((a, b) => String(a.resolve_requested_at).localeCompare(String(b.resolve_requested_at)));
  },
  async questionDetail(qid){
    const cl = await client(), C = await cols(cl);
    const q = await one(cl.from('questions').select(C + ',user_id').eq('id', qid).maybeSingle());
    if(!q) throw userErr('질문을 찾을 수 없어요');
    const res = await Promise.all([
      one(cl.from('step_marks').select('question_id,step,first_at,last_at,text_md5').eq('question_id', qid)),
      one(cl.from('footprints').select('id,question_id,step,source,kst_day,created_at').eq('question_id', qid).order('id')),
      one(cl.from('clues').select('*').eq('question_id', qid).order('id')),
      one(cl.from('profiles').select('id,name,grade,class_no,number').eq('id', q.user_id).maybeSingle())
    ]);
    return {question:q, marks:res[0] || [], footprints:res[1] || [], clues:res[2] || [], student:res[3] || null};
  },
  /* 책 보며 심은 질문(journal.read 가 있는 것) — 선생님 「책 보며 심기」 탭 */
  async classReading(g, c){
    const cl = await client();
    const st = await A.classStudents(g, c);
    const by = new Map(st.map(s => [s.id, s]));
    const out = [];
    for(const ch of chunks(st.map(s => s.id), 100)){
      out.push.apply(out, await pages(() => cl.from('questions').select('id,text,refined_text,journal,material_id,unit,is_anonymous,created_at,user_id').in('user_id', ch).not('journal->read', 'is', null).order('id')));
    }
    return out.filter(q => q.journal && q.journal.read && typeof q.journal.read === 'object')
      .map(q => Object.assign({}, q, {student:{name:(by.get(q.user_id) || {}).name || '', number:(by.get(q.user_id) || {}).number || null}}))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  confirmFruit(qid, kind){ return rpc('confirm_fruit', {p_qid:qid, p_kind:kind}); },
  returnFruit(qid, step, note){ return rpc('return_fruit', {p_qid:qid, p_step:step, p_note:note == null ? null : note}); },
  async classClues(g, c, day){
    const cl = await client();
    const d = day || QO.ui.kstToday();
    const from = QO.ui.dayStartISO(d), to = QO.ui.dayStartISO(QO.ui.addDays(d, 1));
    const rows = await pages(() => cl.from('clues').select('*').eq('grade', g).eq('class_no', c).gte('created_at', from).lt('created_at', to).order('id'));
    const st = await A.classStudents(g, c);
    const by = new Map(st.map(s => [s.id, s]));
    const qids = Array.from(new Set(rows.map(r => r.question_id).filter(x => x != null)));
    const qs = new Map();
    for(const ch of chunks(qids, 100)) (await one(cl.from('questions').select('id,text,refined_text,is_anonymous,user_id').in('id', ch)) || []).forEach(q => qs.set(q.id, q));
    return rows.map(r => {
      const a = by.get(r.author_id) || {}, q = qs.get(r.question_id) || {}, o = by.get(q.user_id) || {};
      return Object.assign({}, r, {author_name:a.name || '', author_number:a.number || null, question_text:q.refined_text || q.text || '', question_anonymous:!!q.is_anonymous, owner_name:o.name || '', owner_number:o.number || null});
    });
  },
  hideClue(id, hide){ return rpc('teacher_hide_clue', {p_clue:id, p_hide:hide !== false}); },
  setGroups(g, c, rows){ return rpc('teacher_set_groups', {p_grade:g, p_class:c, p_rows:rows || []}); },
  async classGroups(g, c){
    const cl = await client();
    const groups = await one(cl.from('groups').select('*').eq('school_year', QO.ui.schoolYear()).eq('grade', g).eq('class_no', c).order('group_no'));
    if(!groups || !groups.length) return [];
    const gids = groups.map(x => x.id);
    const mem = await one(cl.from('group_members').select('group_id,user_id').in('group_id', gids));
    const st = await A.classStudents(g, c);
    const by = new Map(st.map(s => [s.id, s]));
    const inqs = await one(cl.from('group_inquiries').select('*').in('group_id', gids).order('id', {ascending:false}));
    const latest = new Map();
    (inqs || []).forEach(i => { if(!latest.has(i.group_id)) latest.set(i.group_id, i); });
    const iids = Array.from(latest.values()).map(i => i.id);
    const steps = iids.length ? await pages(() => cl.from('group_steps').select('*').in('inquiry_id', iids).order('inquiry_id').order('step_no').order('id')) : [];
    return groups.map(gr => {
      const inquiry = latest.get(gr.id) || null;
      return {
        group:gr,
        members:(mem || []).filter(m => m.group_id === gr.id).map(m => ({user_id:m.user_id, name:(by.get(m.user_id) || {}).name || '', number:(by.get(m.user_id) || {}).number || null})).sort(sortNum),
        inquiry, steps:inquiry ? steps.filter(s => s.inquiry_id === inquiry.id) : []
      };
    });
  },
  confirmGroup(inqId){ return rpc('confirm_group', {p_inquiry:inqId}); },
  returnGroup(inqId, note){ return rpc('return_group', {p_inquiry:inqId, p_note:note == null ? null : note}); },
  async classForest(g, c){
    const cl = await client();
    return (await one(cl.from('class_forest_unlocks').select('place,unlocked_at').eq('school_year', QO.ui.schoolYear()).eq('grade', g).eq('class_no', c))) || [];
  },
  async liveStart(g, c, mode){
    const cl = await client();
    const t = await A.teacherMe();
    if(!t) throw userErr('선생님만 할 수 있어요');
    const off = await cl.from('lesson_live').update({active:false}).eq('grade', g).eq('class_no', c).eq('active', true).eq('teacher_id', t.id);
    if(off.error) fail(off.error);
    return one(cl.from('lesson_live').insert({teacher_id:t.id, grade:g, class_no:c, mode:mode, stage:0, active:true}).select('*').single());   // 시작 시각은 서버 now()
  },
  async liveSetStage(id, stage){
    const cl = await client();
    return one(cl.from('lesson_live').update({stage:stage, stage_started_at:nowISO()}).eq('id', id).select('*').single());
  },
  async liveStop(id){
    const cl = await client();
    const r = await cl.from('lesson_live').update({active:false}).eq('id', id);
    if(r.error) fail(r.error);
    return true;
  },
  async cutoverStatus(){
    const cl = await client();
    return (await one(cl.from('v2_cutover').select('*').order('grade').order('class_no'))) || [];
  }
};

/* 선생님 「열린 열매」 — 그 반 학생 질문 중 열매·안개 열매가 열린 것 전부(1000줄 넘어도 나눠 받기).
   최신 먼저: 열린 때(resolved_at)와 열매 뒤 고친 때(journal.edited_at) 중 늦은 것.
   흉내 쪽은 teacher.js(QO.mock.extend)에 있어서 선생님 화면에서만 넣는다(학생 화면의 이름 견주기 시험이 깨지지 않게) */
const tms = ts => { const n = ts ? Date.parse(ts) : NaN; return isNaN(n) ? 0 : n; };
const fruitAt = q => { const e = tms(q.journal && typeof q.journal === 'object' ? q.journal.edited_at : null); return Math.max(tms(q.resolved_at), e > Date.now() + 3e5 ? 0 : e); };   // 고친 때가 지금 + 5분보다 뒤면 없는 것으로(teacher.js 와 같게)
if(cfg.page === 'teacher') A.classFruits = async function(g, c){
  const cl = await client(), C = await cols(cl);
  const st = await A.classStudents(g, c);
  const by = new Map(st.map(s => [s.id, s]));
  const out = [];
  for(const ch of chunks(st.map(s => s.id), 100)){
    out.push.apply(out, await pages(() => cl.from('questions').select(C + ',user_id').in('user_id', ch).not('fruit_kind', 'is', null).order('id')));
  }
  return out.map(q => Object.assign({}, q, {student:{name:(by.get(q.user_id) || {}).name || '', number:(by.get(q.user_id) || {}).number || null}}))
    .sort((a, b) => fruitAt(b) - fruitAt(a) || b.id - a.id);
};

/* ── 앞문: 시연 모드면 흉내, 아니면 진짜. 넣기는 언제나 진짜 쪽으로 ── */
const target = () => (cfg.mock && QO.mock && QO.mock.api) ? QO.mock.api : QO.apiReal;
QO.api = new Proxy({}, {
  get(_, k){ return target()[k]; },
  set(_, k, v){ QO.apiReal[k] = v; return true; },
  has(_, k){ return k in target(); },
  ownKeys(){ return Reflect.ownKeys(target()); },
  getOwnPropertyDescriptor(_, k){ const t = target(); return k in t ? {value:t[k], writable:true, enumerable:true, configurable:true} : undefined; }
});

/* 심기·물주기 도토리(선생님 결정 2026-11-05: 옛 앱처럼 둔다) — 받은 수를 돌려준다. v2_05 SQL 이 없거나 실패해도 조용히 0 */
QO.acorn = async function(kind, qid){
  try{
    const r = await QO.api.acornFor(kind, qid);
    if(r && r.granted > 0){ QO.store.setSeeds(r.seeds); return r.granted; }
  }catch(_){}
  return 0;
};
})();
