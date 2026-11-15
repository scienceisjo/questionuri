/* AI와 내 속도로 — 학생 탭(2026-11-15, 사용자: 「AI는 정보를 주는 속도가 우리 사고보다 너무 빨라서 결과만 보고 배웠다고 착각한다
   → 그 문제를 푸는 탭」). 근거: 자기주도 학습 영상 둘(AI가 나에게 묻게 하기 · 거울 시험 = 내 말로 설명하고 AI에게 평가받기 ·
   튜터 「teach me, test me」) · 「설명 깊이의 착각」(지퍼 실험).
   걸음: ① 질문 고르기(내 ☆ 대표 질문 먼저 · 모둠 질문은 직접 적기) ② AI가 나에게 묻게(튜터 프롬프트 복사)
         ③ 내 말로 설명(붙여넣기 막음) ④ AI에게 평가받기(평가 프롬프트 복사 → 결과 고르기 · 짚은 것 한 줄) ⑤ 고쳐 쓰기 → 저장
   저장: SQL v2_13 pace_logs · save_pace_log. 표가 없으면 e.soon → 안내 한 줄(프롬프트 복사는 그대로 됨).
   데이터 함수: savePaceLog(qid, qtext, explain, verdict, note, revised) · myPaceLogs() — 진짜·흉내 둘 다 여기서.
   선생님 쪽 읽기(classPaceLogs)는 teacher.js. */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const shown = q => (q.refined_text && String(q.refined_text).trim()) ? q.refined_text : q.text;
const clen = s => Array.from(String(s == null ? '' : s)).length;
const VERDICT = [['good', '잘 설명함'], ['fix', '조금 고치면 됨'], ['redo', '다시 알아보기']];
const vName = k => (VERDICT.find(v => v[0] === k) || [])[1] || '';
const PS = {qid:null, qtext:'', own:'', explain:'', verdict:'', note:'', revised:'', tail:'', logs:null, soon:false, loadErr:false, err:'', saved:'', seq:0, dirty:false, open:null};

/* ── 쓰던 글 붙잡기(이 기기) ── */
const dkey = () => 'qo2-pace-' + ((QO.state.me && QO.state.me.id) || 'x');
function saveDraft(){ try{ localStorage.setItem(dkey(), JSON.stringify({qid:PS.qid, own:PS.own, explain:PS.explain, verdict:PS.verdict, note:PS.note, revised:PS.revised, tail:PS.tail})); }catch(_){} }
function loadDraft(){
  try{ const d = JSON.parse(localStorage.getItem(dkey()) || 'null'); if(d && typeof d === 'object') ['qid', 'own', 'explain', 'verdict', 'note', 'revised', 'tail'].forEach(k => { if(d[k] != null) PS[k] = d[k]; }); }catch(_){}
}
function clearDraft(){ try{ localStorage.removeItem(dkey()); }catch(_){} }

/* ── 프롬프트 ── */
const EX_CONCEPTS = '연주 시차, 겉보기 등급, 절대 등급, 별의 색과 표면 온도';
function curQ(){
  if(PS.qid){ const q = QO.store.question(PS.qid); if(q) return shown(q); }
  return String(PS.own || '').trim();
}
function tutorPrompt(q){
  return '너는 중학교 2학년 과학 튜터야. 내 질문은 「' + q + '」야.\n' +
    '답을 바로 알려 주지 마. 내가 스스로 답을 찾도록 한 번에 하나씩만 질문해 줘. 내가 대답하면 그 대답을 보고 다음 질문을 해 줘.\n' +
    '중학생이 이해할 수 있는 말로 하고, 어려운 개념이 필요하면 쉬운 비유로 먼저 설명해 줘.\n' +
    '이 질문이 중학교 교과서에서 배운 내용(예: ' + EX_CONCEPTS + ')과 이어지면 그 개념에서 출발해 줘. ' +
    '교과서 밖 내용이면 「교과서 밖 내용이야」라고 먼저 알려 주고, 믿을 만한 자료(과학관, 한국천문연구원, NASA 같은 기관 자료)를 어디서 확인할 수 있는지 알려 줘.\n' +
    '잘 모르는 건 모른다고 말하고, 지어내지 마.\n그럼 첫 질문부터 해 줘.';
}
function evalPrompt(q, ex){
  return '아래는 중학교 2학년 학생이 「' + q + '」라는 질문에 대해 자기 말로 쓴 설명이야.\n\n[내 설명]\n' + (ex || '(여기에 내 설명이 들어가요)') + '\n\n' +
    '정답을 먼저 말하지 말고, 다음 순서로 평가해 줘.\n' +
    '1. 맞게 설명한 점\n2. 틀리거나 빠진 점(왜 그런지 짧게)\n3. 확인해 볼 교과서 개념이나 믿을 만한 자료\n4. 내가 더 생각해 볼 되묻는 질문 하나\n' +
    '5. 마지막 줄에 「잘 설명함 / 조금 고치면 됨 / 다시 알아보기」 중 하나만\n' +
    '교과서 밖 내용이면 그렇다고 알려 주고, 확인이 필요한 부분을 짚어 줘. 잘 모르는 건 모른다고 말해 줘.';
}
async function copy(text, btn){
  let ok = false;
  try{ if(navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(text); ok = true; } }catch(_){}
  if(!ok){
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    try{ ok = document.execCommand('copy'); }catch(_){}
    ta.remove();
  }
  U.toast(ok ? '복사했어요. AI 창에 붙여 넣어요.' : '복사가 안 됐어요. 글을 길게 눌러 복사해 주세요.');
  if(ok && btn){ const t = btn.textContent; btn.textContent = '복사됨'; setTimeout(() => { if(btn.isConnected) btn.textContent = t; }, 1600); }
}

/* ── 그리기 ── */
const SV = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
const PACE_IC = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10"/><path d="M7 21h10"/><path d="M8 3c0 4 8 5 8 9s-8 5-8 9"/><path d="M16 3c0 4-8 5-8 9s8 5 8 9"/></svg>';
const step = (n, title, sub, body) => '<section class="card pc-step"><div class="pc-sh"><span class="pc-n">' + n + '</span><h2>' + esc(title) + '</h2></div>' +
  (sub ? '<p class="hint pc-sub">' + sub + '</p>' : '') + body + '</section>';
function pickList(){
  const qs = (QO.state.questions || []).filter(q => q && q.text);
  const picked = qs.filter(q => q.is_picked), rest = qs.filter(q => !q.is_picked).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8);
  const btn = q => '<button type="button" class="pc-q' + (PS.qid === q.id ? ' on' : '') + '" data-pc="q" data-q="' + q.id + '" aria-pressed="' + (PS.qid === q.id) + '">' +
    (q.is_picked ? '<span class="pc-star">★ 대표</span>' : '') + '<span>' + esc(shown(q)) + '</span></button>';
  let h = '';
  if(picked.length) h += '<div class="lbl">내 대표 질문</div><div class="pc-qs">' + picked.map(btn).join('') + '</div>';
  if(rest.length) h += '<div class="lbl">최근 내 질문</div><div class="pc-qs">' + rest.map(btn).join('') + '</div>';
  h += '<div class="lbl">모둠 질문이 내 질문이 아니면 직접 적기</div>' +
    '<input class="inp" id="pc_own" data-pcin="own" maxlength="300" autocomplete="off" placeholder="예) 시리우스는 정말 밝아서 밝게 보일까, 가까워서일까?" value="' + esc(PS.own) + '">';
  return h;
}
function logsHTML(){
  if(PS.soon) return '<p class="hint">기록 저장은 선생님이 준비를 마치면 돼요. 프롬프트 복사는 지금도 돼요.</p>';
  if(PS.loadErr) return '<p class="hint">기록을 불러오지 못했어요. <button type="button" class="link" data-pc="reload">다시 읽기</button></p>';
  if(!PS.logs) return '<p class="hint">기록을 불러오는 중이에요.</p>';
  if(!PS.logs.length) return '<p class="hint">아직 저장한 기록이 없어요.</p>';
  return PS.logs.map(l => {
    const open = PS.open === l.id;
    return '<div class="pc-log"><button type="button" class="pc-logh" data-pc="open" data-id="' + l.id + '" aria-expanded="' + open + '">' +
      '<span class="pc-logq">' + esc(l.question_text) + '</span>' + (l.verdict ? '<span class="pc-v v-' + esc(l.verdict) + '">' + esc(vName(l.verdict)) + '</span>' : '') + '</button>' +
      (open ? '<div class="pc-logb"><div class="lbl">내 말로 설명</div><p>' + esc(l.explain) + '</p>' +
        (l.ai_note ? '<div class="lbl">AI가 짚은 것</div><p>' + esc(l.ai_note) + '</p>' : '') +
        (l.revised ? '<div class="lbl">고친 설명</div><p>' + esc(l.revised) + '</p>' : '') +
        (l.tail ? '<div class="lbl">꼬리 질문</div><p>' + esc(l.tail) + '</p>' : '') + '</div>' : '') + '</div>';
  }).join('');
}
function render(root){
  if(!QO.state.me){ root.innerHTML = ''; return; }
  const a = document.activeElement;
  const fk = a && a.dataset && a.dataset.pcin && root.contains(a) ? {k:a.dataset.pcin, s:a.selectionStart, e:a.selectionEnd} : null;
  const q = curQ(), ex = String(PS.explain || '').trim();
  const head = '<section class="pc-hero"><div class="pc-ic">' + PACE_IC + '</div><div><h1>AI와 내 속도로</h1>' +
    '<p>AI는 1초 만에 답하지만, 생각은 내 속도로. 답을 봤다고 아는 건 아니다.</p>' +
    '<div class="pc-rules"><span>AI가 나에게 묻게</span><span>내 말로 설명</span><span>AI에게 평가받기</span></div></div></section>';
  const s1 = step(1, '질문 고르기', '', pickList());
  const s2 = step(2, 'AI가 나에게 묻게 하기', '답을 받지 말고, AI가 한 번에 하나씩 묻게 해요. AI가 묻는 말에 내 생각으로 답하며 알아가요.',
    q ? '<textarea class="inp pc-pr" readonly rows="6" aria-label="튜터 프롬프트">' + esc(tutorPrompt(q)) + '</textarea>' +
        '<button type="button" class="btn wide" data-pc="copyT">튜터 프롬프트 복사</button>'
      : '<p class="hint">먼저 질문을 골라요.</p>');
  const s3 = step(3, '내 말로 설명하기', '모둠원에게 먼저 말로 설명해 보고, 그 말을 적어요. 붙여넣기는 안 돼요.',
    '<textarea class="inp" id="pc_ex" data-pcin="explain" data-tgk="" rows="5" maxlength="1200" placeholder="내가 알아낸 것을 친구에게 설명하듯이">' + esc(PS.explain) + '</textarea>');
  const s4 = step(4, 'AI에게 평가받기', '내 설명이 들어간 평가 프롬프트를 AI에 붙여 넣고, AI가 마지막 줄에 고른 결과를 여기서 골라요.',
    (q && clen(ex) >= 10 ? '<textarea class="inp pc-pr" readonly rows="7" aria-label="평가 프롬프트" id="pc_evp">' + esc(evalPrompt(q, ex)) + '</textarea>' +
       '<button type="button" class="btn wide" data-pc="copyE">평가 프롬프트 복사</button>'
     : '<p class="hint">질문을 고르고 내 설명을 열 글자 넘게 적으면 평가 프롬프트가 만들어져요.</p>') +
    '<div class="lbl">AI 평가 결과</div><div class="chips pc-vs" role="group" aria-label="AI 평가 결과">' +
      VERDICT.map(v => '<button type="button" class="chip' + (PS.verdict === v[0] ? ' on' : '') + '" data-pc="v" data-v="' + v[0] + '" aria-pressed="' + (PS.verdict === v[0]) + '">' + v[1] + '</button>').join('') + '</div>' +
    '<div class="lbl">AI가 짚은 것 한 줄 (안 써도 돼요)</div><input class="inp" id="pc_note" data-pcin="note" maxlength="300" autocomplete="off" placeholder="예) 각도의 단위가 빠졌다고 함" value="' + esc(PS.note) + '">');
  /* AI 평가에 따라 5번 안내가 바뀐다: 잘 설명함 → 고칠 곳 없음, 바로 6번 / 조금 고치면 됨·다시 알아보기 → 고쳐 쓰고 6번 */
  const guide5 = PS.verdict === 'good' ? '<p class="pc-go ok">「잘 설명함」 · 고칠 곳이 없으면 바로 6번 꼬리 질문으로 가요.</p>'
    : (PS.verdict === 'fix' || PS.verdict === 'redo') ? '<p class="pc-go fix">「' + esc(vName(PS.verdict)) + '」 · 여기서 고쳐 쓰고, 모둠원에게 다시 설명한 뒤 6번으로 가요.</p>'
    : '<p class="hint">4번에서 AI 평가 결과를 고르면 무엇을 할지 알려 줘요.</p>';
  const s5 = step(5, '고쳐 쓰기', 'AI가 짚은 곳을 자료에서 확인하고, 내 설명을 바로잡아요.',
    guide5 +
    '<textarea class="inp" id="pc_rev" data-pcin="revised" data-tgk="" rows="5" maxlength="1200" placeholder="고친 설명(교과서 밖이라고 했으면 자료 한 곳에서 꼭 확인)">' + esc(PS.revised) + '</textarea>');
  const s6 = step(6, '꼬리 질문 만들기', '정리한 답에서 새로 궁금해진 것 하나. 답에서 다음 질문으로 이어 가요. 해도 되고 안 해도 돼요.',
    '<input class="inp" id="pc_tail" data-pcin="tail" data-tgk="" maxlength="300" autocomplete="off" placeholder="예) 그럼 시리우스와 태양을 같은 거리에 두면 어느 쪽이 더 밝을까?" value="' + esc(PS.tail) + '">' +
    '<div class="err" id="pc_err" role="alert">' + esc(PS.err) + '</div>' +
    '<button type="button" class="btn wide" data-pc="save">저장하기</button>' + (PS.saved ? '<p class="hint pc-ok">' + esc(PS.saved) + '</p>' : ''));
  const check = '<section class="card pc-check"><h2>모둠 체크리스트</h2><ul><li>모둠원 모두 말로 설명했다</li><li>AI에게 평가받았다</li><li>고쳐서 다시 설명했다</li><li>정리한 답에서 꼬리 질문 하나 만들었다(선택)</li></ul></section>';
  const logs = '<section class="card pc-logs"><h2>내 기록</h2>' + logsHTML() + '</section>';
  root.innerHTML = '<div class="pc-root">' + head + (U.wide() ? '<div class="cols pc-cols"><div>' + s1 + s2 + s3 + '</div><div>' + s4 + s5 + s6 + check + logs + '</div></div>'
    : s1 + s2 + s3 + s4 + s5 + s6 + check + logs) + '</div>';
  if(PS.logs == null && !PS.soon && !PS.loadErr) loadLogs();
  if(fk){ const el = root.querySelector('[data-pcin="' + fk.k + '"]'); if(el){ try{ el.focus({preventScroll:true}); el.setSelectionRange(fk.s, fk.e); }catch(_){} } }
}
const rr = () => { if(QO.tabs.current() === 'pace') QO.tabs.rerender('pace'); };
const typing = () => { const a = document.activeElement; return !!(a && a.dataset && a.dataset.pcin); };
function soft(){ if(QO.tabs.current() !== 'pace') return; if(typing()){ PS.dirty = true; return; } PS.dirty = false; rr(); }

const SOON_RE = /PGRST202|PGRST205|42P01|42883|schema cache|does not exist/i;
const isSoon = e => !!e && (e.soon === true || SOON_RE.test(String(e.message || '') + ' ' + String(e.code || '')));
let loading = false;
function loadLogs(){
  if(loading) return; loading = true;
  const seq = PS.seq;
  Promise.resolve().then(() => QO.api.myPaceLogs()).then(r => { if(seq !== PS.seq) return; PS.logs = r || []; },
    e => { if(seq !== PS.seq) return; if(isSoon(e)){ PS.soon = true; PS.logs = []; } else { PS.loadErr = true; QO.err(e, 'pace logs'); } })
    .finally(() => { loading = false; soft(); });
}
async function save(btn){
  const q = curQ(), ex = String(PS.explain || '').trim();
  const say = m => { PS.err = m; const el = document.getElementById('pc_err'); if(el) el.textContent = m; };
  if(clen(q) < 2) return say('먼저 질문을 골라요.');
  if(clen(ex) < 10) return say('내 말로 설명을 열 글자 넘게 적어 주세요.');
  say('');
  let soonHit = false;
  const id = await U.busy(btn, () => QO.api.savePaceLog(PS.qid || null, q, ex, PS.verdict || null, PS.note || null, PS.revised || null, PS.tail || null)
    .catch(e => { if(isSoon(e)){ soonHit = true; return null; } throw e; }), {errEl:document.getElementById('pc_err')});
  if(soonHit){ PS.soon = true; rr(); U.toast('기록 저장은 선생님이 준비를 마치면 돼요.'); return; }
  if(id === undefined || id === null) return;
  PS.saved = '저장했어요. 다른 질문도 해 볼 수 있어요.';
  PS.logs = null; PS.open = id;
  clearDraft();
  rr();
}

document.addEventListener('input', e => {
  const el = e.target; if(!el || !el.dataset || !el.dataset.pcin) return;
  const k = el.dataset.pcin;
  PS[k] = el.value;
  if(k === 'own' && String(el.value).trim()) PS.qid = null;
  PS.saved = ''; if(PS.err){ PS.err = ''; const er = document.getElementById('pc_err'); if(er) er.textContent = ''; }
  saveDraft();
  if(k === 'explain'){       // 평가 프롬프트는 설명을 따라 바뀐다 — 칸을 다시 그리지 않고 글만
    const q = curQ(), ex = String(PS.explain || '').trim(), pv = document.getElementById('pc_evp');
    if(pv) pv.value = evalPrompt(q, ex);
    else if(clen(ex) >= 10 && q) PS.dirty = true;
  }
});
document.addEventListener('focusout', e => {
  if(!e.target || !e.target.dataset || !e.target.dataset.pcin) return;
  setTimeout(() => { if(PS.dirty && !typing()) soft(); }, 250);
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-pc]'); if(!b) return;
  const k = b.dataset.pc, q = curQ();
  if(k === 'q'){ const id = Number(b.dataset.q); PS.qid = PS.qid === id ? null : id; if(PS.qid) PS.own = ''; PS.saved = ''; saveDraft(); rr(); return; }
  if(k === 'copyT'){ if(q) copy(tutorPrompt(q), b); return; }
  if(k === 'copyE'){ if(q) copy(evalPrompt(q, String(PS.explain || '').trim()), b); return; }
  if(k === 'v'){ PS.verdict = PS.verdict === b.dataset.v ? '' : b.dataset.v; saveDraft(); rr(); return; }
  if(k === 'save'){ save(b).catch(err => U.fail(err)); return; }
  if(k === 'open'){ const id = Number(b.dataset.id); PS.open = PS.open === id ? null : id; rr(); return; }
  if(k === 'reload'){ PS.logs = null; PS.loadErr = false; rr(); }
});

QO.tabs.register({id:'pace', label:'AI와 내 속도로', icon:PACE_IC, render:render});
QO.bus.on('questions:changed', () => soft());
QO.bus.on('ready', () => { Object.assign(PS, {qid:null, qtext:'', own:'', explain:'', verdict:'', note:'', revised:'', tail:'', logs:null, soon:false, loadErr:false, err:'', saved:'', dirty:false, open:null}); PS.seq++; loadDraft(); });
QO.pace = {tutorPrompt, evalPrompt, render};

/* ═══════════ 데이터 함수 — 진짜(Supabase, SQL v2_13) ═══════════ */
function failP(err){
  if(isSoon(err)){ const e = QO.userError('기록 저장은 선생님이 준비를 마치면 돼요.'); e.soon = true; throw e; }
  const e = new Error(err.message || String(err)); e.code = err.code; e.details = err.details; throw e;
}
QO.api.savePaceLog = async function(qid, qtext, explain, verdict, note, revised, tail){
  const c = await QO.sbClient();
  const r = await c.rpc('save_pace_log', {p_qid:qid, p_qtext:qtext || '', p_explain:explain || '', p_verdict:verdict, p_note:note, p_revised:revised, p_tail:tail || null});
  if(r.error) failP(r.error);
  return r.data;
};
QO.api.myPaceLogs = async function(){
  const c = await QO.sbClient();
  const s = await c.auth.getSession();
  const uid = s && s.data && s.data.session ? s.data.session.user.id : null;
  if(!uid) return [];
  const r = await c.from('pace_logs').select('id,question_id,question_text,explain,verdict,ai_note,revised,tail,created_at,updated_at').eq('user_id', uid).order('updated_at', {ascending:false}).limit(200);
  if(r.error) failP(r.error);
  return r.data || [];
};

/* ── 흉내(규칙·문구는 v2_13 save_pace_log · v2_pace_read 그대로) ── */
if(QO.mock && QO.mock.extend){
  const H = () => QO.mock.h;
  const DB = () => { const d = QO.mock.db; d.pace_logs = d.pace_logs || []; return d; };
  const cut = (s, n) => Array.from(String(s)).slice(0, n).join('');
  QO.mock.extend({
    savePaceLog(qid, qtext, explain, verdict, note, revised, tail){
      const h = H(), db = DB(), me = h.needMe(), pr = h.prof(me);
      if(!pr || pr.grade == null) throw h.userErr('학생만 쓸 수 있어요');
      let qt = String(qtext == null ? '' : qtext).trim(), ex = String(explain == null ? '' : explain).trim();
      const vd = String(verdict == null ? '' : verdict).trim() || null, nt = String(note == null ? '' : note).trim() || null, rv = String(revised == null ? '' : revised).trim() || null, tl = String(tail == null ? '' : tail).trim() || null;
      if(qid != null){
        const q = db.questions.find(x => x.id === Number(qid));
        if(!q) throw h.userErr('질문을 찾을 수 없어요');
        const ow = h.prof(q.user_id) || {};
        if(q.user_id !== me && (ow.grade !== pr.grade || ow.class_no !== pr.class_no)) throw h.userErr('우리 반 질문만 고를 수 있어요');
        if(clen(qt) < 2) qt = (q.refined_text && String(q.refined_text).trim()) || q.text;
      }
      if(clen(qt) < 2) throw h.userErr('어떤 질문인지 적어 주세요');
      if(clen(ex) < 10) throw h.userErr('내 말로 설명을 열 글자 넘게 적어 주세요');
      if(vd && ['good', 'fix', 'redo'].indexOf(vd) < 0) throw h.userErr('AI 평가를 다시 골라 주세요');
      qt = cut(qt, 300); ex = cut(ex, 1200);
      const now = h.nowISO();
      if(qid != null){
        const old = db.pace_logs.find(l => l.user_id === me && l.question_id === Number(qid));
        if(old){ Object.assign(old, {question_text:qt, explain:ex, verdict:vd || old.verdict, ai_note:nt ? cut(nt, 300) : old.ai_note, revised:rv ? cut(rv, 1200) : old.revised, tail:tl ? cut(tl, 300) : old.tail, updated_at:now}); return old.id; }
      }
      const from = U.dayStartISO(h.kstToday());
      if(db.pace_logs.filter(l => l.user_id === me && l.created_at >= from).length >= 20) throw h.userErr('오늘은 기록을 충분히 남겼어요. 내일 또 해요');
      const id = h.seq('pace_logs');
      db.pace_logs.push({id:id, user_id:me, school_year:h.schoolYear(), grade:pr.grade, class_no:pr.class_no == null ? null : pr.class_no,
        question_id:qid == null ? null : Number(qid), question_text:qt, explain:ex, verdict:vd, ai_note:nt ? cut(nt, 300) : null, revised:rv ? cut(rv, 1200) : null, tail:tl ? cut(tl, 300) : null, created_at:now, updated_at:now});
      return id;
    },
    myPaceLogs(){
      const h = H(), db = DB(), me = h.me();
      if(!me) return [];
      return db.pace_logs.filter(l => l.user_id === me).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .map(l => h.pick(l, ['id', 'question_id', 'question_text', 'explain', 'verdict', 'ai_note', 'revised', 'tail', 'created_at', 'updated_at']));
    }
  });
}
})();
