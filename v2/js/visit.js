/* 선생님 숲 방문(2026-11-13, SQL v2_08) — 학생용 질문과수원에 선생님 계정으로 들어오면 반을 골라 그 반 숲을 걷고 단서를 준다.
   들어가기·반 바꾸기는 core.js(enterVisit·setVisitClass)가 맡고 QO.state.visit = {grade, class_no} 를 채운다.
   이 파일은 데이터 함수만: 진짜(Supabase RPC) · 흉내(?mock=1). tree.js·world.js 가 QO.state.visit 일 때 이것을 부른다.
     visitForest()            → teacher_visit_forest     : 열린 장소
     visitQuestions(limit)    → teacher_visit_questions  : 그 반 질문(막힘 깃발용, classmate_questions 와 같은 칸)
     visitTrees()             → teacher_visit_trees      : 그 반 나무(classmate_trees 와 같은 칸)
     visitFriend(num)         → teacher_visit_friend     : 한 학생의 질문(friend_questions 와 같은 칸, watered=false)
     visitAddClue(q, k, body) → teacher_add_clue         : 선생님 단서(by_teacher=true)
     visitTick(state)         → teacher_visit_tick       : 함께 걷기(k = -선생님 id, 이름 「선생님」) */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg;
const V = () => QO.state.visit || {};
const need = () => { const v = V(); if(v.grade == null || v.class_no == null) throw QO.userError('반을 먼저 골라 주세요.'); return v; };

/* ── 진짜 ── */
async function rpcV(name, args){
  const c = await QO.sbClient();
  const r = await c.rpc(name, args || {});
  if(r.error){
    const msg = String(r.error.message || r.error);
    if(/teacher_visit|teacher_add_clue|schema cache|PGRST202/i.test(msg + (r.error.code || ''))) throw QO.userError('선생님 숲 방문은 v2_08 SQL 을 실행한 뒤에 쓸 수 있어요.');
    const e = new Error(msg); e.code = r.error.code; throw e;
  }
  return r.data;
}
QO.api.visitForest = async function(){ const v = need(); return (await rpcV('teacher_visit_forest', {p_grade:v.grade, p_class:v.class_no})) || []; };
QO.api.visitQuestions = async function(limit){ const v = need(); return (await rpcV('teacher_visit_questions', {p_grade:v.grade, p_class:v.class_no, p_limit:limit == null ? 200 : limit})) || []; };
QO.api.visitTrees = async function(){ const v = need(); return (await rpcV('teacher_visit_trees', {p_grade:v.grade, p_class:v.class_no})) || []; };
QO.api.visitFriend = async function(num){ const v = need(); return (await rpcV('teacher_visit_friend', {p_grade:v.grade, p_class:v.class_no, p_number:num})) || []; };
QO.api.visitAddClue = function(qid, kind, body){ return rpcV('teacher_add_clue', {p_qid:qid, p_kind:kind, p_body:body}); };
QO.api.visitTick = function(st){ const v = V(); return rpcV('teacher_visit_tick', {p_grade:v.grade == null ? null : v.grade, p_class:v.class_no == null ? null : v.class_no, p_state:st}); };

/* ── 흉내(규칙·문구는 v2_08 그대로) ── */
if(QO.mock && QO.mock.extend){
  const H = () => QO.mock.h, db = () => QO.mock.db;
  const needT = () => { const h = H(), uid = h.needMe(), t = h.teacherOf(uid); if(!t) throw h.userErr('선생님만 할 수 있어요'); return {uid, t}; };
  const since = () => new Date(Date.UTC(H().schoolYear(), 2, 1)).toISOString();
  const inCls = (p, v) => p && p.grade === Number(v.grade) && p.class_no === Number(v.class_no);
  const bodyOf = q => (q.refined_text && q.refined_text !== '') ? q.refined_text : q.text;
  QO.mock.extend({
    visitForest(){
      needT(); const v = need(), y = H().schoolYear();
      return db().class_forest_unlocks.filter(u => u.grade === Number(v.grade) && u.class_no === Number(v.class_no) && u.school_year === y).map(u => ({place:u.place, unlocked_at:u.unlocked_at}));
    },
    visitQuestions(limit){
      needT(); const v = need(), h = H(), s0 = since();
      const n = Math.min(Math.max(limit == null ? 200 : Number(limit), 1), 200);
      return db().questions.filter(q => inCls(h.prof(q.user_id), v) && q.created_at >= s0).sort((a, b) => b.id - a.id).slice(0, n).map(q => {
        const o = h.prof(q.user_id), j = q.journal || {};
        return {id:q.id, body:bodyOf(q), unit:q.unit, is_anonymous:!!q.is_anonymous,
          owner_name:q.is_anonymous ? null : o.name, owner_number:q.is_anonymous ? null : o.number,
          flag_step:j.flag && j.flag.step != null ? String(j.flag.step) : null, flag_tried:j.flag && j.flag.tried != null ? String(j.flag.tried) : null,
          clue_count:db().clues.filter(c => c.question_id === q.id && c.hidden_at == null).length, created_at:q.created_at};
      });
    },
    visitTrees(){
      needT(); const v = need(), h = H(), s0 = since();
      return db().profiles.filter(x => inCls(x, v) && x.number != null && !h.isTeacher(x.id)).sort((a, b) => a.number - b.number).map(x => {
        const qs = db().questions.filter(q => q.user_id === x.id);
        const f = qs.filter(q => q.fruit_kind != null).length + db().group_fruits.filter(g => g.user_id === x.id).length;
        const lv = db().legacy_level.find(l => l.user_id === x.id);
        const open = qs.filter(q => !q.is_anonymous && q.created_at >= s0);
        return {owner_number:x.number, owner_name:x.name, active_tree:x.active_tree || 'default', active_companion:x.active_companion || null,
          level:Math.max(lv ? lv.level : 1, Math.min(f + 1, 10)), fruits:f, questions:open.length, water:open.reduce((a, q) => a + (q.water_count || 0), 0), active_fruit:x.active_fruit || 'apple'};
      });
    },
    visitFriend(num){
      needT(); const v = need(), s0 = since();
      const o = db().profiles.find(x => inCls(x, v) && x.number === Number(num)); if(!o) return [];
      return db().questions.filter(q => q.user_id === o.id && !q.is_anonymous && q.created_at >= s0).sort((a, b) => b.id - a.id).slice(0, 100).map(q => ({
        id:q.id, body:bodyOf(q), unit:q.unit, fruit_kind:q.fruit_kind || null, water_count:(q.watered_by || []).length || q.water_count || 0, watered:false, created_at:q.created_at}));
    },
    visitAddClue(qid, kind, body){
      const h = H(), me = needT();
      const q = h.qById(qid); if(!q) throw h.userErr('질문을 찾을 수 없어요');
      const step = {where:'find', test:'method', me:'find', ask:'refine'}[kind];
      if(!step) throw h.userErr('단서 종류가 올바르지 않아요');
      body = String(body == null ? '' : body).trim();
      const len = Array.from(body).length;
      if(len < 5 || len > 80 || body.indexOf('__') >= 0) throw h.userErr('빈칸을 채워서 보내 주세요');
      const d0 = QO.ui.dayStartISO(h.kstToday());
      if(db().clues.filter(c => c.author_id === me.uid && c.created_at >= d0).length >= 60) throw h.userErr('오늘은 단서를 충분히 보냈어요');
      if(db().clues.some(c => c.question_id === q.id && c.author_id === me.uid && c.kind === kind)) throw h.userErr('이 질문에는 같은 종류의 단서를 이미 보냈어요');
      const o = h.prof(q.user_id) || {}, mk = db().step_marks.find(m => m.question_id === q.id && m.step === step);
      const c = {id:h.seq('clues'), question_id:q.id, author_id:me.uid, kind:kind, step:step, body:body, snapshot_md5:mk ? mk.text_md5 : null,
        school_year:h.schoolYear(), grade:o.grade == null ? null : o.grade, class_no:o.class_no == null ? null : o.class_no, created_at:h.nowISO(),
        thanked_at:null, thanks_text:null, declined_at:null, hidden_at:null, by_teacher:true};
      db().clues.push(c);
      return c.id;
    }
  });

  /* 함께 걷기 흉내 — world.js 흉내와 같은 저장소(localStorage)를 쓴다: 학생 탭과 선생님 탭이 같은 브라우저에서 만난다 */
  const WK = cfg.selftest ? 'qo2-world-mock-test' : 'qo2-world-mock-v1';
  const ld = () => { try{ const s = JSON.parse(localStorage.getItem(WK) || 'null'); if(s && s.open && s.ps) return s; }catch(_){} return {open:{}, ps:{}}; };
  const sv = s => { try{ localStorage.setItem(WK, JSON.stringify(s)); }catch(_){} };
  const nap = () => new Promise(r => setTimeout(r, cfg.selftest ? 10 : 40 + Math.random() * 80));
  QO.mock.api.visitTick = async function(p){
    await nap();
    const me = needT(), v = V();
    const shut = now => ({open:false, until:null, now:new Date(now).toISOString(), ps:[], keys:[]});
    const now = Date.now();
    if(v.grade == null || v.class_no == null) return shut(now);
    const ck = v.grade + '-' + v.class_no, s = ld();
    if(s.open[ck] == null) s.open[ck] = cfg.selftest ? 0 : now + 45 * 6e4;
    if(!(s.open[ck] > now)){ delete s.ps[me.uid]; sv(s); return shut(now); }
    p = p || {};
    const prev = s.ps[me.uid];
    const st = {k:-me.t.id, ck:ck, name:'선생님', x:p.x | 0, y:p.y | 0, d:p.d | 0, n:p.n | 0, trail:[], look:0, emo:p.emo | 0, emo_n:p.emo_n | 0, say:p.say | 0, say_n:p.say_n | 0, seen:now};
    const pa = Array.isArray(p.path) ? p.path.slice(-20) : []; for(let i = 0; i + 1 < pa.length; i += 2) st.trail.push([pa[i] | 0, pa[i + 1] | 0]);
    const changed = !prev || prev.ck !== ck || now - prev.seen > 15000 || ['x', 'y', 'd', 'n', 'emo_n', 'say_n'].some(k => prev[k] !== st[k]);
    st.at = changed ? now : prev.at;
    s.ps[me.uid] = st; sv(s);
    const from = p.since ? Date.parse(p.since) - 2000 : 0;
    const all = Object.keys(s.ps).filter(u => u !== me.uid && s.ps[u].ck === ck && now - s.ps[u].seen < 15000).map(u => s.ps[u]);
    const arr = r => [r.k, r.x, r.y, r.d, r.n, (r.trail || []).reduce((a, q) => a.concat(q), []), r.look, r.emo, r.emo_n, r.say, r.say_n, r.name];
    return {open:true, until:new Date(s.open[ck]).toISOString(), now:new Date(now).toISOString(), ps:all.filter(r => r.at > from).map(arr), keys:all.map(r => r.k)};
  };
}
})();
