/* 질문과수원 2 — 공용 뼈대(core)
   화면 도우미 · 상태 · 이벤트 · 탭 등록 · 수업 진행 읽기 · 오류 · 앱 시작(학생·선생님).
   모듈(explore·together·tree·teacher)은 이 파일을 고치지 않는다. 약속은 CONTRACT.md. */
(function(){
'use strict';
const QO = window.QO;
const cfg = QO.cfg;

/* ═══════════ 작은 도우미 ═══════════ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* KST 날짜·시각 — 서버 kst_today() 와 같은 기준 */
const partsOf = (fmt, ts) => {
  const o = {};
  fmt.formatToParts(ts == null ? new Date() : new Date(ts)).forEach(p => { o[p.type] = p.value; });
  return o;
};
const F_DAY = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'});
const F_HM = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
function kstDay(ts){ const p = partsOf(F_DAY, ts); return p.year + '-' + p.month + '-' + p.day; }
function kstHM(ts){ const p = partsOf(F_HM, ts); return (p.hour === '24' ? '00' : p.hour) + ':' + p.minute; }
function dayStartISO(day){ return new Date((day || kstDay()) + 'T00:00:00+09:00').toISOString(); }
function addDays(day, n){ const d = new Date((day || kstDay()) + 'T12:00:00+09:00'); d.setUTCDate(d.getUTCDate() + n); return kstDay(d); }
function schoolYear(ts){ const p = partsOf(F_DAY, ts); const y = +p.year, m = +p.month; return m < 3 ? y - 1 : y; }
function fmtTime(ts){
  if(!ts) return '';
  const d = kstDay(ts), today = kstDay();
  if(d === today) return kstHM(ts);
  if(d === addDays(today, -1)) return '어제 ' + kstHM(ts);
  const [y, m, dd] = d.split('-').map(Number);
  return (String(y) === today.slice(0, 4) ? '' : y + '년 ') + m + '월 ' + dd + '일';
}
const clock = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ═══════════ 이벤트 ═══════════ */
const handlers = {};
QO.bus = {
  on(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); return fn; },
  off(ev, fn){ const a = handlers[ev]; if(!a) return; const i = a.indexOf(fn); if(i >= 0) a.splice(i, 1); },
  emit(ev, data){ (handlers[ev] || []).slice().forEach(fn => { try{ fn(data); }catch(e){ QO.err(e, 'bus:' + ev); } }); }
};

/* ═══════════ 오류 ═══════════ */
QO.errors = [];
function paintErrors(){
  const el = document.getElementById('qo-errors');
  if(el) el.textContent = QO.errors.map(x => '[' + x.ctx + '] ' + x.msg).join('\n');
}
QO.err = function(e, ctx){
  const msg = (e && e.message) || (e && e.reason && e.reason.message) || String(e);
  QO.errors.push({at:new Date().toISOString(), ctx:ctx || '', msg:msg, code:e && e.code || '', stack:e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : ''});
  try{ console.warn('[QO]', ctx, e); }catch(_){}
  paintErrors();
};
QO.err.clear = function(from){ QO.errors.length = from || 0; paintErrors(); };
/* Postgres P0001(raise exception) 문구는 학생에게 보여 줄 한국어다 */
function userMsg(e){ return e && (e.code === 'P0001' || e.user === true) && e.message ? e.message : null; }
QO.userError = function(msg){ const e = new Error(msg); e.code = 'P0001'; return e; };

/* ═══════════ 화면 도우미 ═══════════ */
const WIDE_MQ = window.matchMedia('(min-width:760px)');
function isWide(){ return WIDE_MQ.matches && cfg.shot !== 'phone'; }
function applyWide(){ document.documentElement.classList.toggle('wide', isWide()); }

function toast(msg, ms){
  const el = $('#toast'); if(!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), ms || 2600);
}
function fail(e, errEl){
  const m = userMsg(e);
  if(m){ if(errEl) errEl.textContent = m; else toast(m); return m; }
  QO.err(e, 'fail');
  const g = '잠시 뒤 다시 해 주세요';
  if(errEl) errEl.textContent = g; else toast(g);
  return g;
}
/* 누른 버튼을 잠그고 일을 끝낸다. 실패하면 알리고 undefined. api 함수는 성공하면 undefined 가 아닌 값을 돌려준다. */
async function busy(btn, work, opts){
  opts = opts || {};
  if(btn && (btn.disabled || btn.dataset.busy)) return undefined;
  if(btn){ btn.disabled = true; btn.dataset.busy = '1'; btn.setAttribute('aria-busy', 'true'); }
  if(opts.errEl) opts.errEl.textContent = '';
  try{ return await (typeof work === 'function' ? work() : work); }
  catch(e){ fail(e, opts.errEl); return undefined; }
  finally{ if(btn){ btn.disabled = false; delete btn.dataset.busy; btn.removeAttribute('aria-busy'); } }
}
/* 한글 조합 중 Enter 는 무시 */
function onEnter(el, fn){
  if(!el) return;
  el.addEventListener('keydown', e => {
    if(e.isComposing || e.keyCode === 229 || e.repeat) return;
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); fn(e); }
  });
}
/* 작은 대화 상자 — 버튼 [{label, value, cls}] 중 누른 것의 value, 바깥·Esc 는 null */
function dialog(html, buttons){
  return new Promise(resolve => {
    const host = $('#app') || document.body;
    const w = document.createElement('div');
    w.className = 'qo-dialog';
    w.innerHTML = '<div class="qo-dialog-card" role="dialog" aria-modal="true"><div class="qo-dialog-msg">' + html + '</div><div class="qo-dialog-btns">' +
      buttons.map((b, i) => '<button type="button" class="' + esc(b.cls || 'btn') + '" data-dlg="' + esc(b.key || ('b' + i)) + '" data-i="' + i + '">' + esc(b.label) + '</button>').join('') + '</div></div>';
    const done = v => { w.remove(); resolve(v); };
    w._close = () => done(null);
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if(b) return done(buttons[+b.dataset.i].value);
      if(e.target === w) done(null);
    });
    host.appendChild(w);
    const first = w.querySelector('[data-dlg="ok"]') || w.querySelector('button');
    if(first) setTimeout(() => { try{ first.focus(); }catch(_){} }, 0);
  });
}
function confirmBox(msg, opts){
  opts = opts || {};
  return dialog(opts.html ? msg : esc(msg), [
    {label:opts.cancel || '아니요', value:false, cls:'btn line', key:'cancel'},
    {label:opts.ok || '네', value:true, cls:opts.danger ? 'btn danger' : 'btn', key:'ok'}
  ]).then(v => v === true);
}
function closeDialogs(){ $$('.qo-dialog').forEach(w => w._close ? w._close() : w.remove()); }

/* 일지 시트 — 폰은 덮는 시트(#sheet.show), 태블릿 탐구는 목록 옆 칸(.app.split) */
const sheet = {
  el(){ return $('#sheet'); },
  open(html){ const el = $('#sheet'); if(!el) return; if(html != null) el.innerHTML = html; el.classList.add('show'); QO.state.sheetOpen = true; QO.bus.emit('sheet:open'); },
  set(html){ const el = $('#sheet'); if(el) el.innerHTML = html; },
  close(quiet){ const el = $('#sheet'); if(!el) return; const was = el.classList.contains('show'); el.classList.remove('show'); QO.state.sheetOpen = false; if(was && !quiet) QO.bus.emit('sheet:close'); },
  isOpen(){ const el = $('#sheet'); return !!el && (el.classList.contains('show') || ($('#app').classList.contains('split'))); },
  placeholder(){ sheet.set('<div class="ph-empty">왼쪽에서 질문을 고르면<br>탐구 일지가 여기에 열려요.</div>'); }
};

const FOG_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="6" fill="#6F84A0"/><path d="M4 9.5h7.5M5.5 12h5" stroke="#E9EEF5" stroke-width="1.4" stroke-linecap="round"/></svg>';
const SV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const icons = {
  explore: SV + '<path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M6 18a2 2 0 0 1 2-2h11"/><path d="M10 8h5"/></svg>',
  together: SV + '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15 20a4.5 4.5 0 0 1 6.5-4"/></svg>',
  tree: SV + '<circle cx="12" cy="9" r="6"/><path d="M12 15v6"/><path d="M9 21h6"/></svg>',
  forest: SV + '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
};
const AV_COLORS = [['#E6F2E5','#2C6A3A'], ['#E5EEF8','#2F5B8A'], ['#FBEAF0','#8A2F55'], ['#FDF1DE','#8A5A12'], ['#E2F2F2','#155A5F'], ['#EFEAF8','#5A3F8A']];
function avatar(name, n){ const c = AV_COLORS[Math.abs(Number(n) || 0) % AV_COLORS.length]; return {bg:c[0], fg:c[1], ch:String(name || '?').trim().charAt(0) || '?'}; }

function debugPre(id){
  let el = document.getElementById(id);
  if(el) return el;
  el = document.createElement('pre');
  el.id = id; el.className = 'qo-pre';
  const foot = document.getElementById('app-credit');
  if(foot && foot.parentNode === document.body) document.body.insertBefore(el, foot); else document.body.appendChild(el);
  return el;
}

QO.ui = {
  $, $$, esc, sleep, toast, busy, fail, onEnter, dialog, confirm:confirmBox, closeDialogs, sheet,
  kstToday:() => kstDay(), kstDay, kstHM, dayStartISO, addDays, schoolYear, fmtTime, clock,
  wide:isWide, icons, FOG_SVG, avatar, debugPre, userMsg
};

/* ═══════════ 글 검사(모든 칸 공통) — 시제품 junkWhy 그대로 ═══════════ */
function grams(s){ s = String(s || '').replace(/\s+/g, ''); const g = new Set(); for(let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; }
function containedIn(a, b){ const A = grams(a), B = grams(b); if(A.size < 3) return 0; let n = 0; A.forEach(x => { if(B.has(x)) n++; }); return n / A.size; }
function junkWhy(v, others){
  const s = String(v || '').replace(/\s+/g, '');
  if(/(.)\1\1/.test(s)) return '같은 글자가 계속 이어져요. 내 말로 적어 주세요.';
  if(/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(s) || /[ㅋㅎ]{2,}/.test(s)) return '자음·모음만 쓰지 말고 문장으로 적어 주세요.';
  for(const o of (others || [])){ if(o && containedIn(v, o) >= 0.6) return '앞에 쓴 글과 거의 같아요. 이 칸에 맞게 새로 적어 주세요.'; }
  return '';
}
const hasReason = v => /(왜냐하면|때문|니까|아서|어서|여서|해서|라서|거든|므로)/.test(String(v || ''));
/* 두 질문이 얼마나 같은가(0~1) — 띄어쓰기·문장부호·끝의 「요」를 떼고 편집 거리로 */
const normQ = s => String(s || '').replace(/[\s?？!！.,，·~…'"「」]/g, '').replace(/요$/, '');
function similar(a, b){
  const A = Array.from(normQ(a)), B = Array.from(normQ(b));
  if(!A.length || !B.length) return 0;
  let prev = B.map((_, j) => j + 1); prev.unshift(0);
  for(let i = 1; i <= A.length; i++){
    const cur = [i];
    for(let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[B.length] / Math.max(A.length, B.length);
}
/* 옛 앱 validateIdentity 와 같은 문구 */
function identity(g, c, num){
  if(!g || !c || !num) return '학년·반·번호를 모두 입력해주세요';
  const gN = Number(g), cN = Number(c), nN = Number(num);
  if(!Number.isInteger(gN) || gN < 1 || gN > 9) return '학년은 1~9 사이 숫자여야 해요';
  if(!Number.isInteger(cN) || cN < 1 || cN > 20) return '반은 1~20 사이 숫자여야 해요';
  if(!Number.isInteger(nN) || nN < 1 || nN > 50) return '번호는 1~50 사이 숫자여야 해요';
  return null;
}
const fakeEmail = (g, c, n) => 's' + Number(g) + '_' + Number(c) + '_' + Number(n) + '@' + cfg.domain;
QO.check = {grams, containedIn, junkWhy, hasReason, similar, identity, fakeEmail};

/* ═══════════ 상수(시제품·설계서 기준) ═══════════ */
QO.K = {
  STEPS: [
    {k:'plant',   n:'심기',        s:'궁금한 것',             counted:false},
    {k:'refine',  n:'다듬기',      s:'선택',                  counted:false},
    {k:'predict', n:'예상',        s:'내 생각과 그 까닭',      counted:true},
    {k:'method',  n:'알아볼 방법', s:'어떻게 알아볼까',        counted:true},
    {k:'find',    n:'찾기',        s:'어디서 무엇을 알았나',   counted:true},
    {k:'wrap',    n:'정리',        s:'알아낸 것 또는 아직 모르는 것', counted:true},
    {k:'extend',  n:'넓히기',      s:'생활과 잇거나 새 질문',  counted:true}
  ],
  CORE: ['predict', 'method', 'find', 'wrap'],
  /* 진도 트래커 2학년 차시(옛 앱 UNIT_FALLBACK_G2). 선생님이 켠 「지금 차시」 이름과 같다 */
  UNITS: ['마찰 전기', '정전기 유도', '중단원 정리 ① · 회로 기호', '전류·전압·저항', '옴의 법칙', '옴의 법칙 실험 (연습)', '직렬과 병렬', '소비 전력', '중단원 정리 ②',
          '코일 주위의 자기장', '전동기', '중단원 정리 ③', '연주 시차', '별의 밝기와 등급', '겉보기·절대 등급과 별의 색', '우리은하', '성운과 성단', '우주 팽창'],
  METHODS: [['exp', '실험·관찰'], ['book', '교과서·책'], ['web', '검색'], ['person', '사람에게 묻기'], ['ai', 'AI에게 묻기']],
  CLUE_KINDS: {
    where: {n:'찾아볼 곳', step:'find',   parts:['교과서 ', {ph:'쪽', w:60}, '쪽 · 검색어 ', {ph:'검색어', w:120}], any:true},
    test:  {n:'해 볼 실험', step:'method', parts:[{ph:'예) 전지를 반대로 끼워', w:190}, ' 보면 알 수 있을 것 같아요']},
    me:    {n:'내 경험',   step:'find',   parts:['나는 ', {ph:'예) 니트를 벗을 때', w:170}, ' 겪어 봤어요']},
    ask:   {n:'되묻기',    step:'refine', parts:['그럼 ', {ph:'예) 여름', w:120}, '에는 어떨까요?']}
  },
  STUCK_KIND: {find:'where', method:'test', predict:'me', wrap:'where', refine:'ask'},
  WHY_CHIPS: ['자료를 못 찾음', '출처끼리 말이 다름', '용어가 어려움', '실험을 할 수 없음', '과학자도 아직 모름'],
  /* 단서 시간 — lesson_live(mode='clue').stage 가 이 순서(0부터). [이름, 초, 학생 화면 안내] */
  LESSON_STAGES: [
    ['선생님 시범', 60, '칠판을 봐요. 선생님이 「정답」과 「찾아갈 길」이 어떻게 다른지 보여 줘요.'],
    ['모둠 이야기', 60, '내게 온 막힌 질문 두 개를 읽고, 어떤 길을 알려 줄지 모둠과 이야기해요.'],
    ['단서 하나 보내기', 120, '한 사람이 단서 하나씩 보내요. 같은 질문이면 모둠원끼리 서로 다른 종류로요.'],
    ['칠판에서 함께 읽기', 60, '선생님이 보낸 단서 몇 개를 칠판에서 읽어 줘요.']
  ],
  /* 모둠 진행 — lesson_live(mode='group').stage 가 이 순서(0부터). 1차시 대본 [이름, 초] */
  GROUP_STAGES: [
    ['오늘 도구 보여 주기', 60], ['고르기', 180], ['예상 각자', 120], ['알아볼 방법 함께', 120],
    ['찾기 ①② + 두 출처 비교', 600], ['정리 회의', 180], ['옆 모둠에 설명', 360]
  ],
  PLACES: [
    {k:'spring', n:'샘물',   cond:'우리 반 첫 안개 열매가 열린 날'},
    {k:'bridge', n:'다리',   cond:'친구 단서로 막힌 칸이 처음 풀린 날'},
    {k:'obs',    n:'관측소', cond:'모든 모둠 일지가 정리까지 간 날'},
    {k:'winter', n:'겨울 숲', cond:'우리 반 첫 모둠 열매가 열린 날'}
  ],
  GROUP_KINDS: {predict:'예상', method:'알아볼 방법', find:'찾기', compare:'두 출처 비교', wrap:'정리', used:'내 칸이 정리 어디에 쓰였나', tell:'옆 모둠에 설명', heard:'옆 모둠에서 들은 것', extra:'찾기 ③ 다른 출처'}
};

/* ═══════════ 질문 한 행 → 일지 보기(옛 solve 와 새 journal 을 함께 읽는다, 설계서 §6-1) ═══════════ */
const LEGACY_HOW = {exp:'exp', obs:'exp', cmp:'exp', src:'book'};
const VERDICT = {same:'right', half:'part', diff:'changed'};
function nonEmpty(s){ return s != null && String(s).trim() !== ''; }
function journalView(q){
  q = q || {};
  const s = q.solve && typeof q.solve === 'object' ? q.solve : {};
  const j = q.journal && typeof q.journal === 'object' ? q.journal : {};
  const d = {};
  let legacy = false;
  /* 다듬기 */
  if(j.refine_done || nonEmpty(q.refined_text)) d.refine = {done:true, text:q.refined_text || ''};
  /* 예상 — 덮어쓰지 않는 기록 */
  if(Array.isArray(j.predict) && j.predict.length) d.predict = j.predict.map(p => ({text:p.text, at:p.at || null}));
  else if(nonEmpty(s.guess)){ d.predict = [{text:[s.guess, s.why].filter(nonEmpty).join(' '), at:null, legacy:true}]; legacy = true; }
  if(nonEmpty(s.known)) d.known = s.known;
  /* 알아볼 방법 */
  if(j.method && j.method.kind) d.method = {kind:j.method.kind, plan:j.method.plan || ''};
  else if(s.how && (Array.isArray(s.how) ? s.how.length : nonEmpty(s.how))){
    const h = Array.isArray(s.how) ? s.how[0] : s.how;
    d.method = {kind:LEGACY_HOW[h] || 'book', plan:s.change || '', legacy:true}; legacy = true;
  }
  /* 찾기 */
  if(Array.isArray(j.find) && j.find.length) d.find = j.find.map(f => ({src:f.src, text:f.text, ai:!!f.ai, at:f.at || null}));
  else {
    const f = [];
    if(nonEmpty(s.source) || nonEmpty(s.result) || s.tried === 'yes') f.push({src:s.source || '해 본 것', text:s.result || '', ai:false, legacy:true});
    if(nonEmpty(s.ai)) f.push({src:'AI', text:s.ai, ai:true, legacy:true});
    if(f.length){ d.find = f; legacy = true; }
  }
  if(nonEmpty(j.same)) d.same = j.same;
  if(nonEmpty(j.aiCmp)) d.aiCmp = j.aiCmp;
  /* 정리 */
  if(j.wrap && j.wrap.mode) d.wrap = Object.assign({}, j.wrap);
  else {
    const ans = [s.answer, q.finding, q.answer_text].find(nonEmpty);
    if(ans){ d.wrap = {mode:'known', text:ans, cmp:VERDICT[s.verdict] || '', legacy:true}; legacy = true; }
    else if(String(s.stuck) === '1' && !q.resolved){ d.wrap = {mode:'unknown', reached:s.stuckWhere || '', stuckQ:'', legacy:true}; legacy = true; }
  }
  /* 넓히기 */
  if(j.extend && nonEmpty(j.extend.text)) d.extend = {kind:j.extend.kind || 'life', text:j.extend.text};
  else if(nonEmpty(s.newq)){ d.extend = {kind:'newq', text:s.newq, legacy:true}; legacy = true; }
  if(j.flag && j.flag.step) d.flag = Object.assign({}, j.flag);
  if(j.returned && j.returned.step) d.returned = Object.assign({}, j.returned, {note:q.teacher_nudge || ''});

  const status = q.fruit_kind === 'fruit' ? 'fruit' : q.fruit_kind === 'fog' ? 'fog' : q.resolve_requested_at ? 'wait' : 'open';
  /* 옛 수확 열매 — 일지 칸이 비어 있다 → 「옛 기록」으로 접어 보여 준다 */
  const legacyHarvest = !!q.fruit_kind && !d.predict && !d.method && !d.find && !d.wrap;
  /* 선생님 글(다듬기 글·되묻기)에 아직 답하지 않았나 — explore.js view 와 같은 기준.
     글 시각(teacher_fb_at)이 없는 옛 글은 막지 않고, 되돌린 질문은 되돌린 칸부터, 정리를 다시 보낸 뒤의 되묻기는 지난 글 */
  const ms = ts => { const n = ts ? Date.parse(ts) : NaN; return isNaN(n) ? 0 : n; };
  const fbAt = ms(q.teacher_fb_at), refinedAt = ms(q.refined_at), wrapAt = j.wrap && j.wrap.at ? ms(j.wrap.at) : 0;
  const returned = !!(j.returned && j.returned.step), resent = !!wrapAt && wrapAt >= fbAt;
  const nudgeOn = nonEmpty(q.teacher_nudge) && !returned && !resent;
  const refined = refinedAt > 0 || nonEmpty(q.refined_text);
  const answered = fbAt ? (refinedAt > fbAt || (refined && (returned || resent))) : refined;
  const refineAsk = (nonEmpty(q.teacher_refine_note) || nudgeOn) && !!fbAt && !answered && !returned && status === 'open' && !legacyHarvest;
  return {
    id:q.id, text:nonEmpty(q.refined_text) ? q.refined_text : q.text, original:q.text, unit:q.unit || '',
    status, d, legacy, legacyHarvest, refineAsk,
    notes:{refine:q.teacher_refine_note || '', nudge:q.teacher_nudge || '', solve:q.teacher_solve_note || '', stamp:q.teacher_stamp || ''},
    unread:!!q.fb_unread, sprout:!!q.fruit_kind && !!d.extend
  };
}
function hasAI(v){ const d = v.d; return (d.method && d.method.kind === 'ai') || (d.find || []).some(f => f.ai); }
function findOK(v){ const f = v.d.find || []; if(!f.length) return false; if(!hasAI(v)) return true; return f.some(x => !x.ai) && !!v.d.aiCmp; }
function stepDone(v, k){
  const d = v.d;
  if(k === 'plant') return true;
  if(k === 'refine') return !!(d.refine && d.refine.done);
  if(k === 'predict') return !!(d.predict && d.predict.length);
  if(k === 'method') return !!d.method;
  if(k === 'find') return findOK(v);
  if(k === 'wrap') return !!d.wrap;
  if(k === 'extend') return !!d.extend;
  return false;
}
function curStep(v){
  if(v.refineAsk && v.status === 'open') return 'refine';
  if(v.d.returned && v.status === 'open') return v.d.returned.step;
  for(const k of QO.K.CORE){ if(!stepDone(v, k)) return k; }
  return 'extend';
}
const prints = v => QO.K.STEPS.filter(s => s.counted && stepDone(v, s.k)).length;
/* 「아직 모름」을 고를 수 있나 — 출처 두 곳 이상이거나 친구 단서를 받은 뒤 */
const fogAllowed = (v, clues) => (v.d.find || []).length >= 2 || (clues || []).length > 0;
const stepName = k => (QO.K.STEPS.find(s => s.k === k) || {}).n || '';
QO.journal = {view:journalView, stepDone, curStep, prints, hasAI, findOK, fogAllowed, stepName};

/* ═══════════ 상태 ═══════════ */
const S = QO.state = {
  me:null, subjects:[], trees:[],
  questions:[], marks:new Map(), footprints:[], cluesOnMine:[],
  live:null, tab:null, openQ:null, sheetOpen:false, ready:false,
  teacher:null, classes:[], cls:null
};
function resetState(){
  Object.assign(S, {me:null, subjects:[], trees:[], questions:[], marks:new Map(), footprints:[], cluesOnMine:[], live:null, openQ:null, sheetOpen:false, ready:false, teacher:null, classes:[], cls:null});
  QO.live.reset();
}

/* 서버에서 다시 읽기 — 늦게 온 옛 응답이 새 값을 덮지 않게 */
let ver = 0;
const fresh = new Map();          // qid → 마지막으로 한 질문만 고친 때의 ver
function markMap(rows){
  const m = new Map();
  (rows || []).forEach(r => { const id = Number(r.question_id); if(!m.has(id)) m.set(id, {}); m.get(id)[r.step] = {first_at:r.first_at, last_at:r.last_at, text_md5:r.text_md5}; });
  return m;
}
let meSeq = 0, fpSeq = 0;
QO.store = {
  async refreshMe(){
    const my = ++meSeq;
    const r = await QO.api.loadMe();
    if(my !== meSeq) return S.me;
    S.me = r.profile; S.subjects = r.subjects || []; S.trees = r.trees || [];
    paintHeader(); QO.bus.emit('me:changed', S.me);
    return S.me;
  },
  async refreshQuestions(){
    const start = ++ver;
    const rows = await QO.api.loadMyQuestions();
    const ids = rows.map(r => r.id);
    const res = await Promise.all([QO.api.loadMarks(ids), QO.api.loadCluesOnMine(ids)]);
    const marks = markMap(res[0]);
    const keep = new Set(Array.from(fresh.entries()).filter(e => e[1] > start).map(e => e[0]));
    if(keep.size){                 // 읽는 동안 따로 고친 질문은 지금 값을 둔다
      rows.forEach((r, i) => { const cur = QO.store.question(r.id); if(keep.has(r.id) && cur) rows[i] = cur; });
      keep.forEach(id => { if(S.marks.has(id)) marks.set(id, S.marks.get(id)); });
    }
    const clues = res[1].filter(c => !keep.has(Number(c.question_id))).concat(S.cluesOnMine.filter(c => keep.has(Number(c.question_id))));
    S.questions = rows; S.marks = marks; S.cluesOnMine = clues;
    QO.bus.emit('questions:changed', {all:true});
    return rows;
  },
  /* 한 질문의 칸 표시·단서만 다시 읽는다(일지를 저장한 뒤) */
  async refreshQuestion(qid){
    qid = Number(qid);
    const res = await Promise.all([QO.api.loadMarks([qid]), QO.api.loadCluesOnMine([qid])]);
    fresh.set(qid, ++ver);
    const m = markMap(res[0]);
    S.marks.set(qid, m.get(qid) || {});
    S.cluesOnMine = S.cluesOnMine.filter(c => Number(c.question_id) !== qid).concat(res[1]);
    QO.bus.emit('questions:changed', {id:qid});
  },
  async refreshFootprints(){
    const my = ++fpSeq;
    const rows = await QO.api.loadMyFootprints();
    if(my !== fpSeq) return S.footprints;
    S.footprints = rows; QO.bus.emit('footprints:changed');
    return rows;
  },
  /* 저장 결과(일부 칸만 와도 된다)를 목록에 합친다 */
  upsertQuestion(row){
    if(!row || row.id == null) return null;
    const id = Number(row.id);
    fresh.set(id, ++ver);
    const i = S.questions.findIndex(q => q.id === id);
    const merged = i >= 0 ? Object.assign({}, S.questions[i], row) : row;
    if(i >= 0) S.questions[i] = merged; else S.questions.unshift(merged);
    QO.bus.emit('questions:changed', {id});
    return merged;
  },
  question(id){ id = Number(id); return S.questions.find(q => q.id === id) || null; },
  marksOf(id){ return S.marks.get(Number(id)) || {}; },
  cluesOf(id){ id = Number(id); return S.cluesOnMine.filter(c => Number(c.question_id) === id && !c.hidden_at); },
  setSeeds(n){ if(S.me){ S.me.seeds = n; paintHeader(); QO.bus.emit('me:changed', S.me); } },
  async reloadAll(){
    await QO.store.refreshMe();
    await Promise.all([QO.store.refreshQuestions(), QO.store.refreshFootprints()]);
  }
};

/* ═══════════ 탭 등록부 ═══════════ */
const ORDER = {student:['explore', 'together', 'tree', 'forest'], teacher:['fruits', 'live', 'groups', 'clues']};
const defs = {};
let built = false;
function orderedIds(){
  const base = ORDER[cfg.page] || [];
  return Object.keys(defs).sort((a, b) => {
    const ia = base.indexOf(a), ib = base.indexOf(b);
    return (ia < 0 ? 99 + (defs[a].order || 0) : ia) - (ib < 0 ? 99 + (defs[b].order || 0) : ib);
  });
}
function safe(fn, ctx){ try{ return fn(); }catch(e){ QO.err(e, ctx); return undefined; } }
QO.tabs = {
  ORDER,
  register(def){
    if(!def || !def.id || typeof def.render !== 'function') throw new Error('탭 등록에는 id 와 render 가 있어야 해요');
    defs[def.id] = def;
    if(built) QO.tabs.build();
  },
  get(id){ return defs[id] || null; },
  ids: orderedIds,
  current(){ return S.tab; },
  build(){
    const nav = $('#nav'); if(!nav) return;
    built = true;
    nav.innerHTML = orderedIds().map(id => {
      const d = defs[id];
      return '<button type="button" data-t="' + esc(id) + '"' + (S.tab === id ? ' class="on" aria-current="page"' : '') + '>' + (d.icon || '') + '<span>' + esc(d.label || id) + '</span><i class="dot" hidden></i></button>';
    }).join('');
    $$('button', nav).forEach(b => b.addEventListener('click', () => QO.tabs.show(b.dataset.t)));
  },
  show(id){
    const ids = orderedIds();
    const def = defs[id] || defs[ids[0]];
    if(!def) return;
    const changed = S.tab !== def.id;
    const prev = defs[S.tab];
    if(changed && prev && prev.onHide) safe(() => prev.onHide(), 'tab:' + prev.id + ':hide');
    S.tab = def.id;
    $$('#nav button').forEach(b => { const on = b.dataset.t === def.id; b.classList.toggle('on', on); if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if(changed) sheet.close(true);
    QO.tabs.applySplit();
    const root = $('#body');
    if(root){
      if(safe(() => { def.render(root); return true; }, 'tab:' + def.id) !== true) root.innerHTML = '<div class="empty">이 화면을 그리지 못했어요. 잠시 뒤 다시 열어 주세요.</div>';
      if(changed) root.scrollTop = 0;
    }
    if(def.onShow) safe(() => def.onShow(), 'tab:' + def.id + ':show');
    QO.tabs.paintBadges();
    QO.bus.emit('tab:show', def.id);
  },
  /* 지금 탭을 다시 그린다(스크롤 자리 유지). 다른 탭 id 면 점만 다시 칠한다 */
  rerender(id){
    if(id && id !== S.tab){ QO.tabs.paintBadges(); return; }
    const def = defs[S.tab]; const root = $('#body');
    if(!def || !root) return;
    const st = root.scrollTop;
    safe(() => def.render(root), 'tab:' + def.id);
    root.scrollTop = st;
    QO.tabs.paintBadges();
  },
  applySplit(){
    const app = $('#app'); if(!app || cfg.page !== 'student') return;
    const def = defs[S.tab];
    app.classList.toggle('split', !!(def && def.split && isWide()));
  },
  paintBadges(){
    $$('#nav button').forEach(b => {
      const d = defs[b.dataset.t], dot = b.querySelector('.dot');
      if(!dot) return;
      const on = !!(d && d.badge && S.ready && d.id !== S.tab && safe(() => d.badge(), 'badge:' + d.id));
      dot.hidden = !on;
    });
  }
};
['questions:changed', 'live:changed', 'group:changed', 'me:changed', 'footprints:changed'].forEach(ev => QO.bus.on(ev, () => QO.tabs.paintBadges()));

/* ═══════════ 수업 진행 읽기 — 8초마다, 보이는 탭일 때만 ═══════════ */
QO.live = {
  timer:null, last:'', busy:false, watch:{}, lastOk:0,
  start(){
    QO.live.stop();
    if(document.visibilityState !== 'visible') return;
    QO.live.tick();
    QO.live.timer = setInterval(QO.live.tick, 8000);
  },
  stop(){ if(QO.live.timer){ clearInterval(QO.live.timer); QO.live.timer = null; } },
  reset(){ QO.live.stop(); QO.live.last = ''; QO.live.watch = {}; QO.live.lastOk = 0; },
  /* 단계가 바뀌는 것을 이 기기에서 본 시각 — 기기 시계가 서로 달라도 타이머가 바로 0:00 이 되지 않게 */
  mark(row, at){ if(row && row.id != null) QO.live.watch[row.id + ':' + row.stage] = at || Date.now(); },
  async tick(force){
    if((!force && document.visibilityState !== 'visible') || !S.me || QO.live.busy) return;
    QO.live.busy = true;
    try{
      const raw = await QO.api.lessonLive();
      const row = raw && !QO.live.stale(raw) ? raw : null;     // 끄는 것을 잊은 지난 진행은 없는 것으로
      const key = JSON.stringify(row || null), now = Date.now();
      /* 바로 앞 읽기(20초 안)와 단계가 다르면 방금 바뀐 것 — 늦게 들어온 학생은 기기 시계로 센다 */
      if(row && QO.live.lastOk && now - QO.live.lastOk < 20000 && (!S.live || S.live.id !== row.id || S.live.stage !== row.stage)) QO.live.mark(row, now);
      QO.live.lastOk = now;
      if(key !== QO.live.last){
        const prev = S.live;
        QO.live.last = key; S.live = row || null;
        QO.bus.emit('live:changed', {live:S.live, prev:prev});
      }
    }catch(e){ if(S.me) QO.err(e, 'live'); }
    finally{ QO.live.busy = false; }
  },
  async refresh(){ while(QO.live.busy) await sleep(20); return QO.live.tick(true); },
  /* 오늘(KST) 시작한 것이 아니거나 지금 단계가 90분 넘게 그대로면 지난 진행 */
  stale(live){
    if(!live) return false;
    const at = Date.parse(live.stage_started_at || live.created_at);
    return kstDay(live.created_at) !== kstDay() || (!isNaN(at) && Date.now() - at > 90 * 60000);
  },
  /* 지금 단계에서 남은 초 */
  left(live){
    live = live || S.live; if(!live) return 0;
    const st = (live.mode === 'group' ? QO.K.GROUP_STAGES : QO.K.LESSON_STAGES)[live.stage];
    if(!st) return 0;
    let el = (Date.now() - new Date(live.stage_started_at).getTime()) / 1000;
    const w = QO.live.watch[live.id + ':' + live.stage];
    if(w) el = isNaN(el) ? (Date.now() - w) / 1000 : Math.min(el, (Date.now() - w) / 1000 + 10);   // 읽는 간격 8초 + 여유
    if(isNaN(el)) el = 0;
    return Math.max(0, st[1] - el);
  }
};
let lastFull = Date.now();
document.addEventListener('visibilitychange', () => {
  if(cfg.page !== 'student' || !S.ready) return;
  if(document.visibilityState === 'visible'){
    QO.live.start();
    if(Date.now() - lastFull > 60000){ lastFull = Date.now(); QO.store.reloadAll().catch(e => QO.err(e, 'reload')); }
  } else QO.live.stop();
});

/* ═══════════ 칠판 화면(선생님) ═══════════ */
QO.board = {
  render:null,                 // teacher.js 가 function(el) 로 채운다
  el(){ return $('#board'); },
  open(html){
    const el = $('#board'); if(!el) return;
    if(html != null) el.innerHTML = html;
    el.classList.add('show'); document.documentElement.classList.add('board-on');
    try{ if(!document.fullscreenElement && el.requestFullscreen){ const p = el.requestFullscreen(); if(p && p.catch) p.catch(() => {}); } }catch(_){}
    QO.bus.emit('board:open');
  },
  set(html){ const el = $('#board'); if(el) el.innerHTML = html; },
  close(){
    const el = $('#board'); if(!el || !el.classList.contains('show')) return;
    el.classList.remove('show'); document.documentElement.classList.remove('board-on');
    try{ if(document.fullscreenElement && document.exitFullscreen){ const p = document.exitFullscreen(); if(p && p.catch) p.catch(() => {}); } }catch(_){}
    QO.bus.emit('board:close');
  },
  isOpen(){ const el = $('#board'); return !!el && el.classList.contains('show'); }
};
function openBoardFromButton(){
  QO.board.open('');
  const el = QO.board.el();
  if(typeof QO.board.render === 'function'){ if(safe(() => { QO.board.render(el); return true; }, 'board') === true) return; }
  el.innerHTML = '<div class="bh">칠판 화면<button type="button" class="btn soft sm" data-board-close style="margin-left:auto">닫기</button></div><div class="bq">준비 중이에요.</div>';
}
document.addEventListener('fullscreenchange', () => { if(!document.fullscreenElement && QO.board.isOpen() && QO.board._wasFull) QO.board.close(); QO.board._wasFull = !!document.fullscreenElement; });
document.addEventListener('click', e => { if(e.target.closest('[data-board-close]')) QO.board.close(); });

/* ═══════════ 머리글·시연 띠 ═══════════ */
function paintHeader(){
  const me = S.me;
  const ac = $('#acorn'); if(ac) ac.textContent = me ? (me.seeds || 0) : 0;
  const mb = $('#meBtn');
  if(mb){
    if(me){ const a = avatar(me.name, me.number); mb.textContent = a.ch; mb.style.background = a.bg; mb.style.color = a.fg; mb.title = (me.name || '') + ' · ' + me.grade + '-' + me.class_no; }
    else { mb.textContent = '나'; mb.removeAttribute('style'); }
  }
  const mn = $('#mockName');
  if(mn && QO.mock){ const w = QO.mock.who(); mn.textContent = w ? w.label : '학생 고르기'; }
}
async function meMenu(){
  const me = S.me; if(!me) return;
  const v = await dialog('<b>' + esc(me.name || '') + '</b><div class="hint" style="margin-top:4px">' + esc(me.grade + '학년 ' + me.class_no + '반 ' + me.number + '번') + '</div>',
    [{label:'로그아웃', value:'out', cls:'btn line', key:'out'}, {label:'닫기', value:false, cls:'btn', key:'ok'}]);
  if(v === 'out') QO.app.signOut();
}
async function mockMenu(){
  if(!QO.mock) return;
  const list = QO.mock.picker();
  const v = await dialog('<b>시연 모드</b><div class="hint" style="margin-top:4px">실제 기록이 아니에요. 이 기기 안에서만 바뀌어요.</div>',
    list.map(p => ({label:p.label, value:p.key, cls:'btn soft', key:'as-' + p.key})).concat([{label:'처음 상태로', value:'__reset', cls:'btn line', key:'reset'}]));
  if(!v) return;
  if(v === '__reset'){ const w = QO.mock.who(); QO.mock.reset(); if(w) QO.mock.loginAs(w.key); }
  else QO.mock.loginAs(v);
  await QO.app.enter();
  toast(v === '__reset' ? '처음 상태로 되돌렸어요.' : (QO.mock.who() || {}).label + '(으)로 들어왔어요.');
}

/* ═══════════ 앱 시작 ═══════════ */
let enterSeq = 0, booted = false;
function showLoginView(msg, opts){
  const app = $('#app'); if(!app) return;
  app.classList.add('out'); app.classList.remove('split', 'notyet');
  S.ready = false;
  const e = $('#lgErr'); if(e) e.textContent = msg || '';
  const r = $('#lgRetry'); if(r) r.hidden = !(opts && opts.retry);
  paintHeader();
}
/* 아직 옮기지 않은 반 — 질문과수원 1 안내만(탭·쓰기는 열지 않는다) */
function showNotYet(){
  const app = $('#app'); if(!app) return;
  app.classList.add('out', 'notyet'); app.classList.remove('split');
  S.ready = false;
  const b = $('#body'); if(b) b.innerHTML = '';
  paintHeader();
}
function closeAll(){ closeDialogs(); sheet.close(true); QO.board.close(); }

async function enterStudent(){
  const my = ++enterSeq;
  closeAll(); resetState(); fresh.clear();
  try{ await QO.store.refreshMe(); }
  catch(e){
    if(my !== enterSeq) return false;
    const m = userMsg(e);
    /* 학생 정보가 정말 없을 때만 로그아웃. 잠깐 끊긴 것이면 세션은 두고 다시 해 보기 */
    if(m){ try{ await QO.api.signOut(); }catch(_){} showLoginView(m); }
    else { QO.err(e, 'loadMe'); showLoginView('학생 정보를 불러오지 못했어요. 잠시 뒤 다시 해 주세요.', {retry:true}); }
    return false;
  }
  if(my !== enterSeq) return false;
  /* 반이 질문과수원 2로 옮겨졌나(v2_cutover). 못 읽으면 막지 않는다 */
  let moved = true;
  try{ moved = !!(await QO.api.myCutover()); }catch(e){ if(my === enterSeq) QO.err(e, 'cutover'); moved = true; }
  if(my !== enterSeq) return false;
  if(!moved){ showNotYet(); return false; }
  $('#app').classList.remove('out', 'notyet');
  const rt = $('#lgRetry'), le = $('#lgErr'); if(rt) rt.hidden = true; if(le) le.textContent = '';
  try{ await QO.store.refreshQuestions(); }catch(e){ if(my === enterSeq) fail(e); }
  if(my !== enterSeq) return false;
  QO.store.refreshFootprints().catch(e => { if(my === enterSeq) QO.err(e, 'footprints'); });
  S.ready = true; lastFull = Date.now();
  const first = !booted;
  booted = true;
  const tab = (first && cfg.tab && defs[cfg.tab]) ? cfg.tab : 'explore';
  if(first && cfg.q) S.openQ = cfg.q;
  S.tab = null;
  QO.tabs.show(tab);
  if(first && cfg.q) QO.bus.emit('q:open', {id:cfg.q});
  QO.live.start();
  paintHeader();
  QO.bus.emit('ready', {page:'student'});
  return true;
}

function paintClassPick(){
  const gs = $('#tGrade'), cs = $('#tClass'); if(!gs || !cs) return;
  const grades = Array.from(new Set(S.classes.map(c => c.grade))).sort((a, b) => a - b);
  const g = S.cls ? S.cls.grade : grades[0];
  gs.innerHTML = grades.map(x => '<option value="' + x + '"' + (x === g ? ' selected' : '') + '>' + x + '학년</option>').join('');
  cs.innerHTML = S.classes.filter(c => c.grade === g).map(c => '<option value="' + c.class_no + '"' + (S.cls && c.class_no === S.cls.class_no ? ' selected' : '') + '>' + c.class_no + '반</option>').join('');
}
function setClass(grade, class_no, quiet){
  grade = Number(grade); class_no = Number(class_no);
  const ok = S.classes.find(c => c.grade === grade && c.class_no === class_no) || S.classes.find(c => c.grade === grade) || S.classes[0];
  S.cls = ok ? {grade:ok.grade, class_no:ok.class_no} : null;
  try{ if(S.cls) localStorage.setItem('qo2-t-cls', S.cls.grade + '-' + S.cls.class_no); }catch(_){}
  paintClassPick();
  if(!quiet){ QO.bus.emit('class:changed', S.cls); QO.tabs.rerender(); }
}
async function enterTeacher(){
  const my = ++enterSeq;
  closeAll(); resetState();
  let t = null;
  try{ t = await QO.api.teacherMe(); }
  catch(e){ if(my !== enterSeq) return false; const m = userMsg(e); if(!m) QO.err(e, 'teacherMe'); showLoginView(m || '잠시 뒤 다시 해 주세요'); return false; }
  if(my !== enterSeq) return false;
  if(!t){ try{ await QO.api.signOut(); }catch(_){} showLoginView('선생님 계정이 아니에요'); return false; }
  S.teacher = t;
  try{ S.classes = await QO.api.classList(); }catch(e){ fail(e); S.classes = []; }
  if(my !== enterSeq) return false;
  let saved = null; try{ saved = (localStorage.getItem('qo2-t-cls') || '').split('-').map(Number); }catch(_){}
  const pref = saved && saved[0] ? saved : (t.grade ? [t.grade, 0] : [0, 0]);
  setClass(pref[0], pref[1], true);
  const tn = $('#tName'); if(tn) tn.textContent = (t.name || '') + ' 선생님';
  $('#app').classList.remove('out');
  S.ready = true;
  const first = !booted; booted = true;
  S.tab = null;
  QO.tabs.show((first && cfg.tab && defs[cfg.tab]) ? cfg.tab : ORDER.teacher[0]);
  QO.bus.emit('ready', {page:'teacher'});
  return true;
}

function bindStudentLogin(){
  const btn = $('#lgBtn'); if(!btn) return;
  const go = async () => {
    const err = $('#lgErr');
    const r = await busy(btn, () => QO.api.signInStudent($('#lgG').value.trim(), $('#lgC').value.trim(), $('#lgNum').value.trim(), $('#lgPw').value), {errEl:err});
    if(r === undefined) return;
    $('#lgPw').value = '';
    await QO.app.enter();
  };
  btn.addEventListener('click', go);
  onEnter($('#lgPw'), go);
}
function bindTeacherLogin(){
  const btn = $('#lgBtn'); if(!btn) return;
  const go = async () => {
    const err = $('#lgErr');
    const r = await busy(btn, () => QO.api.signInTeacher($('#lgEmail').value.trim(), $('#lgPw').value), {errEl:err});
    if(r === undefined) return;
    $('#lgPw').value = '';
    await QO.app.enter();
  };
  btn.addEventListener('click', go);
  onEnter($('#lgPw'), go);
}

QO.app = {
  async boot(){
    window.addEventListener('error', ev => QO.err(ev.error || ev.message, 'window'));
    window.addEventListener('unhandledrejection', ev => {
      const m = userMsg(ev.reason);
      if(m){ toast(m); ev.preventDefault(); return; }
      QO.err(ev.reason, 'promise');
    });
    if(cfg.debug){ debugPre('qo-errors'); paintErrors(); }
    if(cfg.shot) document.documentElement.classList.add('shot-' + String(cfg.shot).replace(/[^a-z0-9-]/gi, ''));
    applyWide();
    const onWide = () => { applyWide(); QO.tabs.applySplit(); if(!isWide()) sheet.close(true); QO.bus.emit('wide:changed', isWide()); if(S.ready) QO.tabs.rerender(); };
    if(WIDE_MQ.addEventListener) WIDE_MQ.addEventListener('change', onWide); else WIDE_MQ.addListener(onWide);
    document.addEventListener('keydown', e => {
      if(e.key !== 'Escape' || e.isComposing) return;
      const d = $$('.qo-dialog').pop();
      if(d){ d._close ? d._close() : d.remove(); return; }
      if(QO.board.isOpen()){ QO.board.close(); return; }
      if(S.sheetOpen && !isWide()) sheet.close();
    });
    const mb = $('#meBtn'); if(mb) mb.addEventListener('click', meMenu);
    const rt = $('#lgRetry'); if(rt) rt.addEventListener('click', () => busy(rt, () => QO.app.enter()));
    const no = $('#nyOut'); if(no) no.addEventListener('click', () => QO.app.signOut(true));
    const bb = $('#boardBtn'); if(bb) bb.addEventListener('click', openBoardFromButton);
    const ob = $('#tOut'); if(ob) ob.addEventListener('click', () => QO.app.signOut());
    const gs = $('#tGrade'), cs = $('#tClass');
    if(gs) gs.addEventListener('change', () => { const g = Number(gs.value); const c = S.classes.find(x => x.grade === g); setClass(g, c ? c.class_no : 0); });
    if(cs) cs.addEventListener('change', () => setClass(gs.value, cs.value));
    if(cfg.page === 'teacher') bindTeacherLogin(); else bindStudentLogin();

    if(cfg.mock){
      document.documentElement.classList.add('is-mock');
      const bar = $('#mockbar'); if(bar && !cfg.shot) bar.hidden = false;
      const mw = $('#mockWho'); if(mw) mw.addEventListener('click', mockMenu);
      const lm = $('#lgMock');
      if(lm && QO.mock){
        lm.hidden = false;
        lm.querySelector('.chips').innerHTML = QO.mock.picker().map(p => '<button type="button" class="chip" data-as="' + esc(p.key) + '">' + esc(p.label) + '</button>').join('');
        lm.addEventListener('click', async e => { const b = e.target.closest('[data-as]'); if(!b) return; QO.mock.loginAs(b.dataset.as); await QO.app.enter(); });
      }
      if(cfg.selftest){ QO.mock.reset(); QO.mock.loginAs(cfg.page === 'teacher' ? 'T' : 'A'); }
      if(cfg.as) QO.mock.loginAs(cfg.as);
    }
    QO.tabs.build();
    let sess = null;
    try{ sess = await QO.api.session(); }catch(e){ QO.err(e, 'session'); }
    if(sess) await QO.app.enter(); else showLoginView('');
    if(cfg.selftest && QO.selftest) QO.selftest.run();
  },
  enter(){ return cfg.page === 'teacher' ? enterTeacher() : enterStudent(); },
  showLogin: showLoginView,
  async signOut(skipConfirm){
    const student = cfg.page !== 'teacher';
    if(!skipConfirm && !(await confirmBox(student ? '모든 기기에서 로그아웃할까요?' : '로그아웃할까요?', {ok:'로그아웃', cancel:'그대로'}))) return false;
    ++enterSeq;
    QO.live.stop();
    try{ await QO.api.signOut(student ? 'global' : 'local'); }catch(e){ QO.err(e, 'signOut'); }
    closeAll(); resetState(); fresh.clear();
    const b = $('#body'); if(b) b.innerHTML = '';
    showLoginView('');
    return true;
  },
  setClass,
  paintHeader
};
})();
