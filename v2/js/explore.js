/* 탐구 탭 + 탐구 일지 시트 — explore 모듈.
   기준: 설계서 §2·§4, 시제품 renderExplore·qCardHTML·renderSheet·stepBodyHTML.
   칸이 찼는지는 서버 칸 표시(step_marks)가 먼저, 없으면 글 길이(method 2자·나머지 5자).
   옛 solve 글은 「옛 과수원에서 쓴 글」로 보여 주고 이어서 쓴다. 도토리는 여기서 주지 않는다. */
(function(){
'use strict';
const QO = window.QO, S = QO.state, K = QO.K, ui = QO.ui;
const $ = ui.$, $$ = ui.$$, esc = ui.esc;

/* 옛 index.html UNIT_FALLBACK_G2 그대로(진도 트래커 2학년 차시) */
const UNITS = ['학기 첫 시간 · 과학을 왜 배우는 걸까?', '마찰 전기', '정전기 유도', '중단원 정리 ① · 회로 기호', '전류·전압·저항', '옴의 법칙', '옴의 법칙 실험 (연습)', '직렬과 병렬', '소비 전력', '중단원 정리 ②', '코일 주위의 자기장', '전동기', '중단원 정리 ③', '연주 시차', '별의 밝기와 등급', '겉보기·절대 등급과 별의 색', '우리은하', '성운과 성단', '우주 팽창'];
const COUNTED = ['predict', 'method', 'find', 'wrap', 'extend'];
const minLen = k => k === 'method' ? 2 : 5;
const LEGACY_HOW = {exp:'exp', obs:'exp', cmp:'exp', src:'book'};
const HOW_NAME = {exp:'실험', obs:'관찰', cmp:'비교', src:'조사'};
const VERDICT = {same:'right', half:'part', diff:'changed'};
const CMP_NAME = {right:'맞았어요', part:'일부 맞았어요', changed:'바뀌었어요'};
/* 답만 달기(2026-11-12, 사용자 「해결의 자유도 — 모든 절차를 거치는 길과 답만 다는 길 둘」).
   일지 칸을 다 거치지 않고 답과 어디서 알았는지만 적어 선생님께 보낸다(AI 도 출처로 고를 수 있다).
   서버 save_journal(v2_02)이 정리 칸을 known/unknown 으로만 받아서, 새 SQL 없이 표시를 붙인다: wrap.cmp='quick', wrap.changedBy=출처.
   도토리는 발자국 칸 수 + 5 라서, 끝까지 탐구한 질문이 자연히 더 받는다. */
const QUICK = 'quick';
const isQuick = w => !!w && w.cmp === QUICK;
const QSRC = ['교과서', '선생님', '실험·관찰', '인터넷 검색', 'AI', '친구', '원래 알던 것'];
const STAMP = {observe:'본 것을 정확히 적었어요', testable:'이건 알아볼 수 있는 질문이에요', unknown:'선생님도 몰라요. 같이 찾아봐요',
  connect:'지난 시간이랑 이어졌어요', onemore:'한 걸음만 더 가볼까요?', pick:'수업에서 다룰게요'};
const AI_RE = /(\bAI\b|\bGPT|ChatGPT|제미나이|Gemini|클로드|Claude|뤼튼|코파일럿|Copilot|퍼플렉시티|인공지능|에이아이)/i;
const OLD = '<span class="xlegacy">옛 과수원에서 쓴 글</span>';
/* 다듬기 점검 — 과학과 선도교원 연수 「질문 점검 체크리스트」(수행 과제 1 학습지, PDF 12쪽)의 구체성·탐구 가능성 점검을
   학생 화면에 맞게 다섯으로 줄임. 「왜 ~일까?」는 바꿀 대상이 아니다(같은 자료 10쪽 질문 문장 틀 1번이 「왜 ___일까?」).
   정교화 단계에서 질문을 정답형으로 바꾸지 않는다(36차시 과학과 p.7·23~24). 예시는 다듬기 전 → 다듬은 뒤, 단원에 맞춰 고른다. */
const REFINE = [
  {g:'구체적인가', t:'무엇을 알고 싶은지 분명한가', how:'이거, 그거 대신 무엇인지 이름을 쓰고, 어떤 실험이나 장면에서 본 건지 적어요.'},
  {g:'구체적인가', t:'너무 넓거나 모호하지 않은가', how:'한 번에 다 묻지 말고 가장 궁금한 한 가지로 좁혀요.'},
  {g:'구체적인가', t:'배운 개념이 들어 있는가', how:'이번 단원에서 배운 낱말을 하나 넣어 봐요. 어디서 답을 찾을지도 보여요.'},
  {g:'구체적인가', t:'네·아니요로 끝나지 않는가', how:'네·아니요로 끝나면 왜, 어떻게를 붙여서 이유나 과정을 묻게 해요.'},
  {g:'알아볼 수 있는가', t:'답을 찾을 방법이 떠오르는가', how:'실험, 관찰, 교과서·자료 중 어디서 알아볼지 떠올려 봐요. 견줄 것이나 바꿔 볼 조건을 넣으면 방법이 잘 보여요.'}
];
const REFINE_CHECKS = REFINE.map(r => r.t);
const REFINE_EX = {
  star:[['별은 왜 다 달라?', '베텔게우스는 왜 리겔보다 붉게 보일까?'],
        ['우주는 왜 그렇게 넓어?', '멀리 있는 별까지의 거리는 어떻게 알아낼까?'],
        ['가까운 별은 어떻게 알아?', '연주 시차가 큰 별은 왜 가까이 있는 별일까?'],
        ['시리우스가 제일 밝아?', '시리우스는 왜 다른 별보다 밝게 보일까?'],
        ['별은 왜 밝기가 달라?', '같은 전구를 멀리 두면 왜 더 어둡게 보일까?']],
  elec:[['왜 따라와?', '털가죽으로 문지른 빨대를 대면 캔은 왜 따라올까?'],
        ['전기는 왜 생겨?', '털가죽과 빨대를 문지르면 왜 전기를 띠게 될까?'],
        ['나침반은 왜 돌아?', '전류가 흐르는 도선 주위의 자기장은 왜 나침반 바늘을 움직일까?'],
        ['전자석은 철을 붙여?', '전자석은 왜 전류가 흐를 때만 철을 붙일까?'],
        ['전자석은 왜 세져?', '전자석에 흐르는 전류를 세게 하면 왜 클립이 더 많이 붙을까?']],
  gas:[['왜 부풀어?', '과자 봉지는 높은 산에 올라가면 왜 부풀까?'],
       ['공기는 왜 신기해?', '공기는 눈에 안 보이는데 왜 병뚜껑을 밀어낼 수 있을까?'],
       ['풍선은 왜 커져?', '온도가 높아지면 기체 입자가 어떻게 움직이길래 풍선이 커질까?'],
       ['뜨거운 물에 넣으면 풍선이 커져?', '뜨거운 물에 넣은 페트병 위 풍선은 왜 커질까?'],
       ['풍선은 왜 커져?', '물 온도를 바꾸면 풍선 크기는 왜, 어떻게 달라질까?']]
};
function refineEx(v){
  const t = (v.unit || '') + ' ' + (v.original || '') + ' ' + (v.text || '');
  if(/별|등급|시차|은하|우주|광년|행성|태양/.test(t)) return REFINE_EX.star;
  if(/기체|압력|부피|풍선|과자|공기|온도|입자/.test(t)) return REFINE_EX.gas;
  if(/전기|전류|전압|자기|자석|코일|정전기|전하|전동기|저항|빨대/.test(t)) return REFINE_EX.elec;
  return REFINE_EX.star;
}

/* ── 작은 도우미 ── */
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const has = s => s != null && String(s).trim() !== '';
const str = v => v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
const cws = a => a.filter(x => x != null).map(str).join(' ').trim();          // concat_ws(' ', …)
const clen = s => Array.from(String(s == null ? '' : s).trim()).length;
const ms = ts => { const n = ts ? Date.parse(ts) : NaN; return isNaN(n) ? 0 : n; };
const cut = (s, n) => { const a = Array.from(String(s || '')); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
const methodName = k => (K.METHODS.find(m => m[0] === k) || [k, k || ''])[1];
const METHOD_TO = {exp:'실험·관찰로', book:'교과서·책으로', web:'검색으로', person:'사람에게 묻기로', ai:'AI에게 묻기로'};
const stepName = k => (K.STEPS.find(s => s.k === k) || {}).n || '';
const val = id => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
const tog = (id, hide) => { const el = document.getElementById(id); if(el) el.hidden = !!hide; };
const focusId = id => setTimeout(() => { const el = document.getElementById(id); if(el) try{ el.focus({preventScroll:true}); }catch(_){ el.focus(); } }, 0);

/* 서버 private.step_texts 와 같은 대응(칸별 글) */
function stepTexts(row){
  const s = obj(row.solve), j = obj(row.journal), t = {};
  t.refine = row.refined_text == null ? '' : String(row.refined_text);
  if(Array.isArray(j.predict) && j.predict.length) t.predict = str((j.predict[j.predict.length - 1] || {}).text);
  else t.predict = cws([s.guess, s.why]);
  if('method' in j) t.method = cws([obj(j.method).kind, obj(j.method).plan]);
  else t.method = cws([Array.isArray(s.how) ? (s.how.length ? s.how.map(String).join(',') : null) : s.how, s.change]);
  if(Array.isArray(j.find) && j.find.length) t.find = j.find.map(e => cws([obj(e).src, obj(e).text])).join(' | ');
  else t.find = cws([s.source, s.result]);
  if('wrap' in j){ const w = obj(j.wrap); t.wrap = cws([w.text, w.reached, w.stuckQ]); }
  else t.wrap = cws([s.answer, String(s.stuck) === '1' ? s.stuckWhere : null]);
  t.extend = 'extend' in j ? str(obj(j.extend).text) : str(s.newq);
  return t;
}

/* ═══════════ 질문 한 개의 보기 — QO.explore.view(row, marks, clues) ═══════════ */
function view(row, marks, clues, all){
  row = row || {}; marks = marks || {};
  const s = obj(row.solve), j = obj(row.journal);
  const vis = (clues || []).filter(c => c && !c.hidden_at);
  const d = {}, old = {};
  /* 다듬기 */
  d.refine = {done:!!j.refine_done || has(row.refined_text), text:has(row.refined_text) ? String(row.refined_text).trim() : ''};
  /* 예상 — 덮어쓰지 않는다. 옛 guess(+why)가 첫 예상과 다르면 맨 앞 */
  const pj = (Array.isArray(j.predict) ? j.predict : []).filter(p => p && has(p.text)).map(p => ({text:String(p.text).trim(), at:p.at || null}));
  d.predict = pj;
  if(has(s.guess) && !(pj.length && pj[0].text === String(s.guess).trim())){ d.predict = [{text:cws([s.guess, s.why]), at:null, legacy:true}].concat(pj); old.predict = true; }
  if(has(s.known)) d.known = String(s.known).trim();
  /* 알아볼 방법 */
  if(j.method && has(j.method.kind)) d.method = {kind:String(j.method.kind), plan:str(j.method.plan).trim()};
  else {
    const how = (Array.isArray(s.how) ? s.how : (has(s.how) ? String(s.how).split(',') : [])).map(x => String(x).trim()).filter(Boolean);
    if(how.length || has(s.change)){ d.method = {kind:LEGACY_HOW[how[0]] || 'book', plan:str(s.change).trim(), how:how.map(x => HOW_NAME[x] || x).join(', '), legacy:true}; old.method = true; }
  }
  /* 찾기 — 옛 source·result 와 옛 AI 답을 앞에 */
  const fj = (Array.isArray(j.find) ? j.find : []).filter(f => f && (has(f.src) || has(f.text))).map(f => ({src:str(f.src).trim(), text:str(f.text).trim(), ai:f.ai === true || f.ai === 'true', at:f.at || null}));
  const lf = [];
  if(has(s.result) || (has(s.source) && !fj.some(f => f.src === String(s.source).trim())) || (s.tried === 'yes' && !fj.length && !has(s.source)))
    lf.push({src:has(s.source) ? String(s.source).trim() : '해 본 것', text:str(s.result).trim(), ai:false, legacy:true});
  ['ai', 'ai2'].forEach(key => { if(has(s[key])) lf.push({src:'AI', text:String(s[key]).trim(), ai:true, legacy:true}); });
  d.find = lf.concat(fj);
  if(lf.length) old.find = true;
  if(has(j.same)) d.same = String(j.same);
  if(has(j.aiCmp)) d.aiCmp = String(j.aiCmp);
  /* 정리 */
  if(j.wrap && has(j.wrap.mode)) d.wrap = Object.assign({}, j.wrap);
  else {
    const ans = [s.answer, row.finding, row.answer_text].find(has);
    if(ans){ d.wrap = {mode:'known', text:String(ans).trim(), cmp:VERDICT[s.verdict] || '', changedBy:'', legacy:true}; old.wrap = true; }
    else if(String(s.stuck) === '1' && !row.resolved){ d.wrap = {mode:'unknown', reached:str(s.stuckWhere).trim(), stuckQ:'', why:'', cmp:'', legacy:true}; old.wrap = true; }
  }
  /* 넓히기 — 새 칸, 옛 newq, 또는 #일상·#사회문제 태그를 단 꼬리 질문 */
  if(j.extend && has(j.extend.text)) d.extend = {kind:j.extend.kind === 'newq' ? 'newq' : 'life', text:String(j.extend.text).trim()};
  else if(has(s.newq)){ d.extend = {kind:'newq', text:String(s.newq).trim(), legacy:true}; old.extend = true; }
  else if(row.id != null){
    const tagOf = x => (Array.isArray(x.tags) ? x.tags : []).map(t => String(t).replace(/^#/, ''));
    const kid = (all || S.questions || []).find(x => x && x.parent_id != null && Number(x.parent_id) === Number(row.id) && tagOf(x).some(t => t === '일상' || t === '사회문제'));
    if(kid){ d.extend = {kind:tagOf(kid).indexOf('일상') >= 0 ? 'life' : 'newq', text:String(kid.text || ''), legacy:true}; old.extend = true; }
  }
  if(j.flag && has(j.flag.step)) d.flag = {step:String(j.flag.step), tried:str(j.flag.tried), at:j.flag.at || null};
  const status = row.fruit_kind === 'fruit' ? 'fruit' : row.fruit_kind === 'fog' ? 'fog' : row.resolve_requested_at ? 'wait' : 'open';
  if(j.returned && has(j.returned.step) && status === 'open') d.returned = {step:String(j.returned.step), at:j.returned.at || null, note:str(row.teacher_nudge).trim()};
  const legacyHarvest = !!row.fruit_kind && !d.predict.length && !d.method && !d.find.length && !d.wrap;

  /* 칸이 찼나 — 서버 칸 표시가 있으면 찬 칸, 없으면 글 길이 */
  const texts = stepTexts(row);
  const filled = (k, alt) => !!marks[k] || clen(texts[k]) >= minLen(k) || clen(alt) >= minLen(k);
  const aiUsed = (!!d.method && !d.method.legacy && d.method.kind === 'ai') || d.find.some(f => f.ai);   // 옛 AI 답도(core findOK·선생님 경고와 같은 기준)
  const findOK = d.find.some(f => !f.ai) && (!aiUsed || has(d.aiCmp));
  const done = {
    plant:true,
    refine:d.refine.done,
    predict:d.predict.length > 0 && filled('predict', d.predict[d.predict.length - 1].text),
    method:!!d.method && filled('method', d.method.kind),
    find:d.find.length > 0 && findOK && filled('find', d.find.map(f => f.src + ' ' + f.text).join(' ')),
    wrap:!!d.wrap && filled('wrap', d.wrap.mode === 'unknown' ? d.wrap.reached : d.wrap.text),
    extend:!!d.extend && filled('extend', d.extend.text)
  };
  /* 선생님 글 — 다듬기 글(teacher_refine_note)과 되묻기(teacher_nudge).
     · 되돌린 질문의 nudge 는 되돌림 글(그 칸에) · 정리를 다시 보낸 뒤의 nudge 는 정리 칸의 「지난번 선생님 글」
     · 글 시각(teacher_fb_at)이 없는 옛 글은 보여만 주고 다듬기를 막지 않는다
     · save_journal 은 refined_at 을 돌려주지 않으니 서버 칸 표시(refine.last_at)도 본다 */
  const fbAt = ms(row.teacher_fb_at);
  const refinedAt = Math.max(ms(row.refined_at), marks.refine ? ms(marks.refine.last_at) : 0);
  const isRet = !!(j.returned && has(j.returned.step));
  const wrapAt = j.wrap && j.wrap.at ? ms(j.wrap.at) : 0, resent = !!wrapAt && wrapAt >= fbAt;
  const refNote = has(row.teacher_refine_note) ? String(row.teacher_refine_note).trim() : '';
  const nudge = has(row.teacher_nudge) && !isRet ? String(row.teacher_nudge).trim() : '';
  const tch = refNote || (nudge && !resent ? nudge : '');
  const tch2 = refNote && nudge && !resent && nudge !== refNote ? nudge : '';
  const pastNudge = nudge && resent ? nudge : '';
  const refined = refinedAt > 0 || d.refine.done;
  const answered = fbAt ? (refinedAt > fbAt || (refined && (isRet || resent))) : refined;
  const refineAsk = !!tch && !!fbAt && status === 'open' && !legacyHarvest && !isRet && !answered;
  const rk = d.returned ? (d.returned.step === 'plant' ? 'refine' : d.returned.step) : null;
  const returnedFixed = !!d.returned && rk !== 'wrap' && !!marks[rk] && ms(marks[rk].last_at) > ms(d.returned.at);
  let cur = null;
  if(status === 'open' && !legacyHarvest){
    if(refineAsk) cur = 'refine';
    else if(d.returned && !returnedFixed) cur = K.STEPS.some(st => st.k === rk) ? rk : 'wrap';
    else cur = K.CORE.find(k => !done[k]) || 'wrap';      // 다 찼으면 선생님께 보내기
  }
  const prints = COUNTED.filter(k => done[k]).length;
  const openClues = vis.filter(c => !c.thanked_at && !c.declined_at);
  /* 고마움 — 단서가 온 뒤에 그 칸 표시가 바뀌었을 때만(md5 비교는 서버가 한 번 더) */
  const thankable = c => !!c && !c.thanked_at && !c.declined_at && !c.hidden_at && !!marks[c.step] && ms(marks[c.step].last_at) > ms(c.created_at) &&
    !(c.snapshot_md5 && marks[c.step].text_md5 && marks[c.step].text_md5 === c.snapshot_md5);
  return {
    id:Number(row.id), row, text:has(row.refined_text) ? String(row.refined_text).trim() : String(row.text || ''), original:String(row.text || ''),
    unit:row.unit || '', anon:!!row.is_anonymous, status, legacyHarvest, d, old, texts, done, aiUsed, findOK,
    fogOK:d.find.length >= 2 || vis.length > 0,
    tch, tch2, pastNudge, answered, refineAsk, rk, returnedFixed, cur, prints, clues:vis, openClues, thankable,
    unread:!!row.fb_unread, sprout:!!row.fruit_kind && !!d.extend,
    solveNote:str(row.teacher_solve_note).trim(), answer:str(row.teacher_answer).trim(), stamp:STAMP[row.teacher_stamp] || '',
    newToday:!!row.created_at && ui.kstDay(row.created_at) === ui.kstToday()
  };
}
const V = row => view(row, QO.store.marksOf(row.id), QO.store.cluesOf(row.id));
const curRow = () => S.openQ != null ? QO.store.question(S.openQ) : null;
const curV = () => { const r = curRow(); return r ? V(r) : null; };
const nextName = v => v.cur === 'wrap' && v.done.wrap ? '선생님께 보내기' : stepName(v.cur);

/* ═══════════ 모듈 상태 ═══════════ */
const X = {edit:null, peek:null, flagFor:null, thx:{}, f:{}, msg:{}, showDone:false, nowUnit:null, nowAt:0, unitTouched:false, qmode:{}, sosFor:null,
  saving:0, next:null, seenBusy:new Set(), guide:false, guideFor:null, phase:'before'};
function resetForm(){ X.edit = null; X.peek = null; X.flagFor = null; X.sosFor = null; X.thx = {}; X.f = {}; X.msg = {}; }
function resetAll(){ resetForm(); X.showDone = false; X.nowUnit = null; X.nowAt = 0; X.unitTouched = false; X.next = null; X.seenBusy.clear(); X.guideFor = null; }
function guideSeen(){ try{ return localStorage.getItem('qo2-x-guide') === '1' || X.guide; }catch(_){ return X.guide; } }
function markGuide(){ X.guide = true; X.guideFor = null; try{ localStorage.setItem('qo2-x-guide', '1'); }catch(_){} }

/* 다시 그려도 쓰던 글·포커스·스크롤이 남게 */
function grab(root){
  if(!root) return null;
  const vals = {};
  $$('input[id^="x_"],textarea[id^="x_"],select[id^="x_"]', root).forEach(el => { vals[el.id] = el.type === 'checkbox' ? {c:el.checked} : {v:el.value}; });
  const ae = document.activeElement;
  let sel = null;
  try{ if(ae && typeof ae.selectionStart === 'number') sel = [ae.selectionStart, ae.selectionEnd]; }catch(_){}
  const body = root.querySelector('.sh-body');
  return {vals, focus:ae && ae.id && root.contains(ae) ? ae.id : null, sel, scroll:body ? body.scrollTop : null};
}
function put(root, k){
  if(!root || !k) return;
  Object.keys(k.vals).forEach(id => {
    if(id === 'x_unit' && !X.unitTouched) return;
    const el = document.getElementById(id);
    if(!el || !root.contains(el)) return;
    const w = k.vals[id];
    if('c' in w) el.checked = w.c;
    else if(el.tagName === 'SELECT'){ if(Array.from(el.options).some(o => o.value === w.v)) el.value = w.v; }
    else el.value = w.v;
  });
  if(k.scroll != null){ const b = root.querySelector('.sh-body'); if(b) b.scrollTop = k.scroll; }
  if(k.focus){
    const el = document.getElementById(k.focus);
    if(el && root.contains(el)){ try{ el.focus({preventScroll:true}); }catch(_){} try{ if(k.sel && typeof el.setSelectionRange === 'function') el.setSelectionRange(k.sel[0], k.sel[1]); }catch(_){} }
  }
}
function scrollInto(el, center, ifNeeded){
  const body = document.getElementById('x_body'); if(!body || !el || !body.contains(el)) return;
  const br = body.getBoundingClientRect(), er = el.getBoundingClientRect();
  /* 지금 칸의 앞부분이 이미 보이면 그대로 둔다(앞 칸들도 함께 보이게) */
  if(ifNeeded && er.top >= br.top && er.top + Math.min(er.height, 220) <= br.bottom) return;
  let top = body.scrollTop + er.top - br.top - 8;
  if(center) top -= Math.max(0, (br.height - er.height) / 2 - 8);
  body.scrollTop = Math.max(0, top);
}
function drop(el, ch){
  const app = $('#app'); if(!el || !app) return;
  const r = el.getBoundingClientRect(), a = app.getBoundingClientRect();
  const dd = document.createElement('div'); dd.className = 'drop'; dd.textContent = ch || '💧';
  dd.style.left = (r.left - a.left + r.width / 2 - 10) + 'px'; dd.style.top = (r.top - a.top - 4) + 'px';
  app.appendChild(dd); setTimeout(() => dd.remove(), 1000);
}
/* 수업 열기·닫기(옛 앱 setPhase) — 다시 그리지 않고 단추·안내만 바꾼다(쓰던 글이 남게) */
const PH_HINT = {before:'궁금한 걸 한 줄로 적어요', after:'수업 뒤 새로 궁금해진 걸 한 줄로 적어요'};
function setPhase(p){
  X.phase = p === 'after' ? 'after' : 'before';
  $$('#body .x-phase [data-ph]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ph === X.phase)));
  const inp = $('#x_plant'); if(inp){ inp.placeholder = PH_HINT[X.phase]; try{ inp.focus(); }catch(_){} }
}
function setErr(key, text){ X.msg[key] = text || ''; const el = document.getElementById('x_e_' + key); if(el) el.textContent = text || ''; return null; }
const errDiv = key => '<div class="err" id="x_e_' + key + '" role="alert">' + esc(X.msg[key] || '') + '</div>';
function need(id, n, key, others){
  const el = document.getElementById(id), v = (el && el.value || '').trim();
  if(clen(v) < n){ setErr(key, n + '글자 넘게, 내 말로 적어 주세요.'); if(el) el.focus(); return null; }
  const jw = QO.check.junkWhy(v, others); if(jw){ setErr(key, jw); if(el) el.focus(); return null; }
  return v;
}

/* ═══════════ 탐구 탭 — 목록 ═══════════ */
function rank(v){ if(v.status === 'wait') return 2; if((v.d.returned && !v.returnedFixed) || v.refineAsk) return 0; return 1; }
function lists(){
  const vs = S.questions.map(V);
  return {
    open:vs.filter(v => v.status === 'open' || v.status === 'wait').sort((a, b) => rank(a) - rank(b) || b.id - a.id),
    done:vs.filter(v => v.status === 'fruit' || v.status === 'fog')
  };
}
function unitOptions(){
  const now = X.nowUnit, list = UNITS.slice();
  if(now && list.indexOf(now) < 0) list.unshift(now);
  const pick = now || '';
  return list.map(u => '<option value="' + esc(u) + '"' + (u === pick ? ' selected' : '') + '>' + esc(u) + '</option>').join('') +
    '<option value=""' + (pick === '' ? ' selected' : '') + '>나중에 고를래요</option>';
}
function tagHTML(v){
  if(v.d.returned && !v.returnedFixed) return '<span class="tag tch">되돌아옴</span>';
  if(v.refineAsk) return '<span class="tag tch">선생님 글</span>';
  if(v.status === 'wait') return '<span class="tag wait">선생님이 읽는 중</span>';
  if(v.status === 'fruit') return '<span class="tag fruit">🍎 열매' + (v.sprout ? ' 🌱' : '') + '</span>';
  if(v.status === 'fog') return '<span class="tag fog">' + ui.FOG_SVG + '안개 열매</span>';
  if(v.unread) return '<span class="tag tch">선생님 글</span>';
  if(v.openClues.length) return '<span class="tag clue">단서 ' + v.openClues.length + '</span>';
  if(v.d.flag) return '<span class="tag flag">막힘 표시</span>';
  if(v.newToday && !v.prints && !v.done.refine) return '<span class="tag new">새 질문</span>';
  return '';
}
function cardHTML(v, wide){
  let dots = '';
  K.STEPS.forEach(st => {
    const dn = v.done[st.k], opt = st.k === 'refine' || st.k === 'extend';
    const c = [dn ? 'd' : (st.k === v.cur ? 'c' : ''), opt && !dn ? 'o' : ''].filter(Boolean).join(' ');
    dots += '<i' + (c ? ' class="' + c + '"' : '') + '></i>';
  });
  const next = v.legacyHarvest ? '옛 기록' : v.status === 'open' ? v.prints + '/5칸 · 다음: ' + nextName(v) : v.prints + '/5칸';
  return '<button type="button" class="qcard' + (wide && S.openQ === v.id ? ' sel' : '') + '" data-xa="open" data-id="' + v.id + '">' +
    '<div class="qt">' + esc(v.text) + '</div><div class="meta"><div class="dots" aria-hidden="true">' + dots + '</div><span class="next">' + esc(next) + '</span>' +
    ((QO.store.question(v.id) || {}).phase === 'after' ? '<span class="x-ph">닫기 질문</span>' : '') + (QO.pick ? QO.pick.tag(v.id) : '') + tagHTML(v) + '</div></button>';
}
function listHTML(L){
  const wide = ui.wide();
  const aft = X.phase === 'after';
  let h = '<div class="card x-plant"><div class="x-phase" role="group" aria-label="언제 생긴 질문인가요?">' +
    '<button type="button" data-xa="phase" data-ph="before" aria-pressed="' + !aft + '">수업 열기</button><button type="button" data-xa="phase" data-ph="after" aria-pressed="' + aft + '">수업 닫기</button></div>' +
    '<div class="row"><input class="inp" id="x_plant" placeholder="' + PH_HINT[X.phase] + '" maxlength="200" autocomplete="off" aria-label="궁금한 것">' +
    '<button type="button" class="btn" data-xa="plant">심기</button></div>' +
    '<div class="x-opts"><label class="unitpick">어느 단원? <select id="x_unit">' + unitOptions() + '</select></label>' +
    '<label class="chk"><input type="checkbox" id="x_anon">익명으로 심기</label></div>' + errDiv('plant') + (QO.read ? QO.read.entryHTML() : '') + '</div>';   // 책 보며 심기(read.js)
  /* 선생님 자료는 「선생님 자료」 탭으로 옮김(2026-11-12, materials.js) */
  h += '<div class="sec">이어서 해 볼 질문 <span class="n">' + L.open.length + '</span></div>';
  if(!L.open.length) h += '<div class="empty">지금 이어서 할 질문이 없어요. 위에서 하나 심어 봐요.</div>';
  L.open.forEach(v => { h += cardHTML(v, wide); });
  h += '<div class="sec">열매 맺은 질문 <span class="n">' + L.done.length + '</span></div>';
  if(!L.done.length) h += '<div class="empty">끝까지 탐구한 질문이 여기에 모여요.</div>';
  else if(X.showDone){ L.done.forEach(v => { h += cardHTML(v, wide); }); h += '<button type="button" class="fold" data-xa="fold">접기</button>'; }
  else h += '<button type="button" class="fold" data-xa="fold" aria-expanded="false">열매 ' + L.done.filter(v => v.status === 'fruit').length + ' · 안개 열매 ' + L.done.filter(v => v.status === 'fog').length + ' — 펼쳐 보기</button>';
  return h;
}

/* ═══════════ 탐구 일지 시트 ═══════════ */
function summary(v, k, noOld){
  const d = v.d, o = noOld ? '' : OLD;
  if(k === 'refine') return d.refine.text ? '다듬은 질문: ' + esc(d.refine.text) : '처음 질문 그대로 탐구해요';
  if(k === 'predict'){
    const p = d.predict;
    return p.map((x, i) => (i ? '<br><b>바뀐 생각</b> ' : '') + (x.legacy ? o : '') + (i < p.length - 1 ? '<span class="x-was">' + esc(x.text) + '</span>' : esc(x.text))).join('');
  }
  if(k === 'method'){
    const m = d.method;
    if(m.legacy) return o + (m.how ? '<b>' + esc(m.how) + '</b>' : '') + (m.plan ? (m.how ? ' · ' : '') + esc(m.plan) : '');
    return '<b>' + esc(methodName(m.kind)) + '</b>' + (m.plan ? ' · ' + esc(m.plan) : '');
  }
  if(k === 'find') return findLines(v, noOld) + (d.same ? '<br><b>두 곳 비교</b> · ' + esc(d.same) : '') + (d.aiCmp ? '<br><b>AI 답과 견주기</b> · ' + esc(d.aiCmp) : '');
  if(k === 'wrap'){
    const w = d.wrap;
    const cmp = w.cmp && CMP_NAME[w.cmp] ? '<b>내 예상은</b> ' + CMP_NAME[w.cmp] + (w.changedBy ? ' — ' + esc(w.changedBy) : '') + '<br>' : '';
    const body = w.mode === 'unknown'
      ? '<b>아직 모름</b> · 여기까지: ' + esc(w.reached || '') + (w.stuckQ ? '<br>막힌 곳: ' + esc(w.stuckQ) + (w.why ? ' (' + esc(w.why) + ')' : '') : '')
      : (isQuick(w) ? '<b>답만 달기</b> · ' : '') + esc(w.text || '') + (isQuick(w) && w.changedBy ? '<br><b>어디서</b> · ' + esc(w.changedBy) : '');
    return (w.legacy ? o : '') + cmp + body;
  }
  if(k === 'extend') return (d.extend.legacy ? o : '') + '<b>' + (d.extend.kind === 'life' ? '생활과 잇기' : '새 질문') + '</b> · ' + esc(d.extend.text);
  return '';
}
function findLines(v, noOld){
  return v.d.find.map(f => (f.legacy && !noOld ? OLD : '') + '<b>' + esc(f.src) + (f.ai ? ' (AI)' : '') + '</b>' + (f.text ? ' · ' + esc(f.text) : '')).join('<br>');
}
const plain = html => String(html).split('<br>')[0].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function teacherBox(v, k){
  let h = '';
  if(k === 'plant' && v.answer) h += '<div class="tchbox ans"><b>선생님의 답변</b>' + esc(v.answer) + '</div>';
  if(k === 'plant' && v.stamp) h += '<div class="tchbox done"><b>선생님 도장</b>' + esc(v.stamp) + '</div>';
  if(k === 'refine' && v.tch){
    if(v.refineAsk) h += '<div class="tchbox"><b>선생님 글</b>' + esc(v.tch) + '</div>';
    else if(v.answered) h += '<div class="tchbox done"><b>선생님 글 → 내가 고친 것</b>' + esc(v.tch) + '</div>';
    else h += '<div class="tchbox"><b>선생님 글</b>' + esc(v.tch) + '</div>';
    if(v.tch2) h += '<div class="tchbox' + (v.refineAsk ? '' : ' done') + '"><b>선생님 글</b>' + esc(v.tch2) + '</div>';
  }
  if(k === 'wrap' && v.pastNudge) h += '<div class="tchbox done"><b>지난번 선생님 글</b>' + esc(v.pastNudge) + '</div>';
  const r = v.d.returned;
  if(r && (r.step === k || (r.step === 'plant' && k === 'refine')))
    h += '<div class="tchbox' + (v.returnedFixed ? ' done' : '') + '"><b>선생님이 이 칸을 다시 보자고 했어요</b>' + esc(r.note) + '</div>';
  if(k === 'wrap' && v.solveNote) h += '<div class="tchbox"><b>선생님 글</b>' + esc(v.solveNote) + '</div>';
  return h;
}
function clueBoxHTML(v, c){
  const kn = (K.CLUE_KINDS[c.kind] || {}).n || '단서';
  let h = '<div class="cluebox" id="x_clue_' + c.id + '"><div class="h">친구 단서 · ' + esc(kn) + '</div><div class="t">' + esc(c.body) + '</div>' +
    '<div class="who">' + esc(ui.fmtTime(c.created_at)) + ' · 정답이 아니라 찾아갈 길이에요</div>';
  if(v.thankable(c)){
    if(X.thx[c.id] === 'yes'){
      h += '<div class="ask"><div class="q">무엇 덕분이었는지 한 줄로 알려 줘요</div><div class="tpl">덕분에 <input id="x_thx_' + c.id + '" maxlength="40" placeholder="__했어요" autocomplete="off" aria-label="덕분에"></div>' +
        '<div class="row"><button type="button" class="btn line sm" data-xa="thxBack" data-cid="' + c.id + '">그만두기</button><button type="button" class="btn teal sm" style="flex:1" data-xa="thxSend" data-cid="' + c.id + '">꽃 보내기</button></div>' + errDiv('thx' + c.id) + '</div>';
    } else {
      h += '<div class="ask"><div class="q">친구 단서가 도움이 됐나요?</div><div class="row"><button type="button" class="btn line sm" style="flex:1" data-xa="thxNo" data-cid="' + c.id + '">아니요</button>' +
        '<button type="button" class="btn teal sm" style="flex:2" data-xa="thxYes" data-cid="' + c.id + '">덕분에 한 걸음 갔어요</button></div>' + errDiv('thx' + c.id) + '</div>';
    }
  } else h += '<div class="x-cluewait">고마움은 이 단서를 보고 그 칸을 적거나 고친 뒤에 보낼 수 있어요.</div>';
  return h + '</div>';
}
const cluesHTML = (v, k) => v.openClues.filter(c => c.step === k).map(c => clueBoxHTML(v, c)).join('');
function cluesLater(v, k){
  const n = v.openClues.filter(c => c.step === k).length;
  return n ? '<div class="x-cluewait x-later">친구 단서 ' + n + '개가 와 있어요. 이 칸을 쓸 차례가 되면 보여요.</div>' : '';
}
function flagAskHTML(k){
  return '<div class="ask"><div class="q">어디까지 해 봤어요? (안 써도 돼요)</div><input class="inp" id="x_tried" placeholder="여기까지 해 봤는데 __에서 막혔어요" autocomplete="off" maxlength="200">' +
    '<div class="row"><button type="button" class="btn line sm" data-xa="flagCancel">그만두기</button><button type="button" class="btn teal sm" style="flex:1" data-xa="flag" data-k="' + k + '">막힘 표시 세우기</button></div>' + errDiv('flag') + '</div>';
}
function segHTML(id, g, items, on){
  return '<div class="seg" id="' + id + '" data-g="' + g + '">' + items.map(it => '<button type="button" data-xa="seg" data-v="' + esc(it[0]) + '"' + (it[0] === on ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(it[1]) + '</button>').join('') + '</div>';
}
function chipsHTML(id, g, items, on){
  return '<div class="chips" id="' + id + '" data-g="' + g + '">' + items.map(it => '<button type="button" class="chip' + (it[0] === on ? ' on' : '') + '" data-xa="seg" data-v="' + esc(it[0]) + '" aria-pressed="' + (it[0] === on) + '">' + esc(it[1]) + '</button>').join('') + '</div>';
}
const fget = (g, dflt) => X.f[g] != null ? X.f[g] : dflt;

function stepBody(v, st, dn, isCur){
  const d = v.d, k = st.k, open = v.status === 'open';
  if(k === 'plant') return '<div class="val">' + esc(v.original) + '</div>';
  if(dn && !isCur){
    if(X.peek === k){
      let h = '<div class="val">' + summary(v, k) + '</div><div class="x-links">';
      if(open || k === 'extend'){
        if(k === 'predict') h += '<button type="button" class="link" data-xa="edit" data-k="predict">생각이 바뀌었어요</button>';
        else if(k === 'find') h += '<button type="button" class="link" data-xa="edit" data-k="find">다른 곳에서 하나 더 찾기</button>';
        else if(k !== 'wrap') h += '<button type="button" class="link" data-xa="edit" data-k="' + k + '">고치기</button>';
      }
      return h + '<button type="button" class="link x-quiet" data-xa="peek" data-k="">접기</button></div>';
    }
    const w = d.wrap;
    const p = k === 'wrap' ? (w.mode === 'unknown' ? '아직 모름 · ' + (w.reached || '') : String(w.text || '')) : plain(summary(v, k, true));
    return '<button type="button" class="sumline" data-xa="peek" data-k="' + k + '">' + (v.old[k] ? OLD : '') + esc(cut(p, 30)) + ' <b>펼치기</b></button>';
  }
  if(!isCur){
    if(k === 'refine' && open && !dn) return '<button type="button" class="link" data-xa="edit" data-k="refine">다듬어 보기</button>';
    if(k === 'extend' && !dn && v.status !== 'open') return '<button type="button" class="link" data-xa="edit" data-k="extend">넓혀 보기</button>';
    return '';
  }
  let f = '<div class="form">';
  if(k === 'refine'){
    const ex = refineEx(v);
    f += '<div class="hint">왜 ~일까? 는 좋은 질문이에요. 다듬기는 질문을 바꾸는 게 아니라 더 분명하게 만드는 거예요. 걸리는 것 하나만 고쳐도 돼요.</div>' +
      REFINE.map((c, i) => (i === 0 || REFINE[i - 1].g !== c.g ? '<div class="rc-g">' + esc(c.g) + '</div>' : '') +
        '<div class="rc"><label class="chk"><input type="checkbox" id="x_rc' + i + '">' + esc(c.t) + '</label>' +
        '<div class="rc-how">' + esc(c.how) + '</div>' +
        '<details class="rc-ex"><summary>예시 보기</summary><div class="rc-pair"><span class="rc-b">' + esc(ex[i][0]) + '</span><span class="rc-arrow" aria-label="다듬으면">→</span><span class="rc-a">' + esc(ex[i][1]) + '</span></div></details></div>').join('') +
      '<textarea class="inp" id="x_refine" rows="2" placeholder="더 분명하게 고쳐 써 봐요">' + esc(d.refine.text || v.original) + '</textarea>' +
      '<div class="row">' + (v.refineAsk || dn || v.rk === 'refine' ? '' : '<button type="button" class="btn line" style="flex:1" data-xa="refineSkip">그대로 갈래요</button>') +
      '<button type="button" class="btn" style="flex:1" data-xa="refine">다듬기 저장</button></div>';
  }
  if(k === 'predict'){
    if(dn) f += '<div class="val" style="margin-top:0">' + summary(v, 'predict') + '</div><div class="hint">처음 생각은 지우지 않고 남겨요. 바뀐 생각만 적어요.</div>';
    f += '<textarea class="inp" id="x_predict" rows="3" placeholder="내 생각은 __. 왜냐하면 __."></textarea>' +
      (dn ? '' : '<div class="hint">틀려도 괜찮아요. 처음 생각을 남겨 두면 정리할 때 얼마나 바뀌었는지 보여요.</div>') +
      '<button type="button" class="btn wide" data-xa="predict">' + (dn ? '바뀐 생각 남기기' : '예상 남기기') + '</button>';
  }
  if(k === 'method'){
    const m = d.method || {}, mk = fget('mk', m.legacy ? '' : (m.kind || ''));
    if(m.legacy) f += '<div class="val" style="margin-top:0">' + summary(v, 'method') + '</div>';
    f += chipsHTML('x_mkind', 'mk', K.METHODS, mk) +
      '<div id="x_mplan"' + (mk === 'exp' ? '' : ' hidden') + '><div class="lbl" style="margin-bottom:6px">무엇을 바꾸고 무엇을 볼까요?</div>' +
      '<textarea class="inp" id="x_method" rows="2" placeholder="예) 전지를 반대로 끼우고 나침반 바늘이 도는 쪽 보기">' + esc(m.plan || '') + '</textarea></div>' +
      '<div class="hint" id="x_maihint"' + (mk === 'ai' ? '' : ' hidden') + '>AI 답은 틀릴 수 있어요. 찾기에서 AI가 아닌 곳 한 군데를 더 찾아 견줘야 정리가 열려요.</div>' +
      '<button type="button" class="btn wide" data-xa="method">방법 정하기</button>';
  }
  if(k === 'find'){
    const list = d.find;
    const fai = fget('fai', !!(d.method && !d.method.legacy && d.method.kind === 'ai' && !list.length));
    if(list.length) f += '<div class="val" style="margin-top:0">' + findLines(v) + '</div>';
    f += '<input class="inp" id="x_fsrc" placeholder="' + (list.length ? '다른 곳은 어디예요?' : '어디서? 예) 교과서 112쪽') + '" autocomplete="off" aria-label="출처" maxlength="120">' +
      '<textarea class="inp" id="x_find" rows="3" placeholder="그곳에서 알아낸 것을 내 말로" aria-label="알아낸 것"></textarea>' +
      '<label class="chk"><input type="checkbox" id="x_fai"' + (fai ? ' checked' : '') + '>AI가 한 답이에요</label>';
    if(list.length) f += '<div class="lbl">두 곳이 같은 말을 하나요?</div>' + segHTML('x_same', 'same', [['같아요', '같아요'], ['달라요', '달라요']], fget('same', '')) +
      '<input class="inp" id="x_samewhy" placeholder="다르다면 무엇이 달라요?" autocomplete="off">';
    if(list.length) f += '<div id="x_aicmpBox"' + (v.aiUsed || fai ? '' : ' hidden') + '><div class="lbl" style="margin-bottom:6px">AI 답과 견주면?</div>' +
      '<input class="inp" id="x_aicmp" placeholder="AI 답과 같은 점이나 다른 점 한 줄" autocomplete="off" value="' + esc(d.aiCmp || '') + '"></div>';
    f += '<button type="button" class="btn wide" data-xa="find">찾은 것 남기기</button>';
  }
  if(k === 'wrap'){
    const p = d.predict, w = d.wrap || {};
    const cmp = fget('cmp', w.cmp || ''), mode = fget('wmode', w.mode || 'known');
    if(p.length) f += '<div class="lbl">처음 내 예상</div><div class="val x-first" style="margin-top:0">' + esc(p[0].text) + '</div>' +
      '<div class="lbl">내 예상은…</div>' + segHTML('x_cmp', 'cmp', [['right', '맞았어요'], ['part', '일부 맞았어요'], ['changed', '바뀌었어요']], cmp) +
      '<input class="inp" id="x_changed" placeholder="무엇이 생각을 바꿨나요?" autocomplete="off" value="' + esc(w.changedBy || '') + '"' + (cmp === 'changed' ? '' : ' hidden') + '>';
    f += segHTML('x_wmode', 'wmode', [['known', '알아낸 것 정리'], ['unknown', '아직 모름']], mode);
    f += '<div id="x_wKnown"' + (mode === 'unknown' ? ' hidden' : '') + '>' + (w.legacy && w.mode === 'known' ? '<div style="margin-bottom:6px">' + OLD + '</div>' : '') +
      '<textarea class="inp" id="x_wrap" rows="3" placeholder="알아낸 것을 한두 문장으로, 내 말로">' + esc(w.mode === 'known' ? (w.text || '') : '') + '</textarea></div>';
    f += '<div id="x_wUnknown"' + (mode === 'unknown' ? '' : ' hidden') + '>';
    if(v.fogOK){
      f += '<div class="hint" style="margin-bottom:8px">답을 못 찾았어도 괜찮아요. 어디까지 가 봤는지 적으면 그것도 열매가 돼요.</div>' +
        '<div class="lbl" style="margin-bottom:6px">여기까지 알아냈어요</div><textarea class="inp" id="x_reached" rows="2" placeholder="찾은 사실 하나와 어디서 찾았는지">' + esc(w.mode === 'unknown' ? (w.reached || '') : '') + '</textarea>' +
        '<div class="lbl" style="margin:10px 0 6px">여기서 막혔어요 (질문 꼴로)</div><input class="inp" id="x_stuckq" placeholder="__는 왜 __일까?" autocomplete="off" maxlength="200" value="' + esc(w.mode === 'unknown' ? (w.stuckQ || '') : '') + '">' +
        '<div class="lbl" style="margin:10px 0 6px">왜 막혔나요?</div>' + chipsHTML('x_why', 'why', K.WHY_CHIPS.map(c => [c, c]), fget('why', w.mode === 'unknown' ? (w.why || '') : ''));
    } else {
      f += '<div class="hint">「아직 모름」은 두 곳 이상에서 찾아보거나 친구 단서를 받은 뒤에 고를 수 있어요. 한 곳 더 찾아보거나 찾기 칸에 막힘 표시를 세워 봐요.</div>';
      if(d.flag) f += '<div class="flagbox">막힘 표시를 세워 두었어요. 친구 단서가 오면 고를 수 있어요.</div>';
      else if(X.flagFor === 'find') f += flagAskHTML('find');
      else f += '<button type="button" class="link teal" data-xa="flagOpen" data-k="find">찾기에서 막혔어요</button>';
    }
    f += '</div>';
    if(!v.done.extend){
      f += '<div class="lbl" style="margin-top:6px">넓히기 (골라도 되고 건너뛰어도 돼요)</div>' + segHTML('x_xmode', 'xmode', [['life', '생활과 잇기'], ['newq', '새 질문']], fget('xmode', '')) +
        '<textarea class="inp" id="x_extend" rows="2" maxlength="200" placeholder="이걸 알고 나니 무엇이 다르게 보이나요? 또는 새로 궁금해진 것"></textarea>';
    }
    f += '<button type="button" class="btn wide" data-xa="wrap">선생님께 보내기</button>';
  }
  if(k === 'extend'){
    const e = d.extend || {};
    f += segHTML('x_xmode', 'xmode', [['life', '생활과 잇기'], ['newq', '새 질문']], fget('xmode', e.kind || 'life')) +
      '<textarea class="inp" id="x_extend" rows="2" maxlength="200" placeholder="이걸 알고 나니 무엇이 다르게 보이나요? 또는 새로 궁금해진 것">' + esc(e.legacy ? '' : (e.text || '')) + '</textarea>' +
      '<button type="button" class="btn wide" data-xa="extend">남기기</button>';
  }
  f += errDiv(k);
  if(X.edit === k) f += '<button type="button" class="link x-quiet" data-xa="cancel">그만두기</button>';
  f += '</div>';
  if(['predict', 'method', 'find'].indexOf(k) >= 0 && open && !dn && !d.flag && X.edit !== k){
    f += X.flagFor === k ? flagAskHTML(k) : '<button type="button" class="link teal" data-xa="flagOpen" data-k="' + k + '">여기서 막혔어요</button>';
  }
  return f;
}
function sheetHTML(row){
  const v = V(row);
  const stWord = {wait:' · 선생님이 읽는 중', fruit:' · 열매', fog:' · 안개 열매'}[v.status] || '';
  const sub = (v.unit ? esc(v.unit) + ' · ' : '') + (v.anon ? '익명 · ' : '') + (v.legacyHarvest ? '옛 기록' : v.prints + '/5칸') + stWord;
  let h = '<div class="sh-top" data-qid="' + v.id + '"><button type="button" class="back" data-xa="close" aria-label="닫기">' + ui.icons.back + '</button>' +
    '<div class="x-head"><div class="qt">' + esc(v.text) + '</div><div class="sub">' + sub + '</div></div></div><div class="sh-body" id="x_body">';
  if(QO.pick) h += QO.pick.html(v);                  // 대표 질문(pick.js)
  if(QO.read) h += QO.read.boxHTML(v.id);            // 책 보며 심은 질문 — 읽은 곳(read.js)
  if(!guideSeen() && (X.guideFor == null || X.guideFor === v.id)){ X.guideFor = v.id; h += '<div class="guide">칸을 하나 채울 때마다 카드의 점이 하나씩 채워져요.</div>'; }
  /* 「나중에 고를래요」로 심은 질문 — 여기서 단원을 붙인다 */
  if(!v.unit && !v.legacyHarvest) h += '<div class="x-unitset"><label class="unitpick">단원 <select id="x_setunit" aria-label="단원 고르기"><option value="">아직 안 골랐어요</option>' +
    UNITS.map(u => '<option value="' + esc(u) + '">' + esc(u) + '</option>').join('') + '</select></label>' + errDiv('unit') + '</div>';
  const paths = v.status === 'open' && !v.legacyHarvest;
  if(paths) h += pathsHTML(v);                          // 끝까지 탐구 / 답만 달기 · 친구에게 SOS
  const quick = paths && X.qmode[v.id] === QUICK;
  const steps = v.legacyHarvest ? K.STEPS.filter(st => st.k === 'plant' || st.k === 'extend') : quick ? K.STEPS.filter(st => st.k === 'plant') : K.STEPS;
  steps.forEach(st => {
    const k = st.k, i = K.STEPS.indexOf(st), dn = v.done[k];
    const isCur = X.edit === k || (!X.edit && k === v.cur);
    h += '<div class="step ' + (isCur ? 'cur' : (dn ? 'done' : '')) + '" id="x_st_' + k + '"><div class="ic">' + (dn && !isCur ? '✓' : (i + 1)) + '</div><div class="bx">' +
      '<div class="nm">' + esc(st.n) + '<span>' + esc(st.s) + '</span></div>';
    h += teacherBox(v, k);
    if(isCur) h += cluesHTML(v, k);                 // 친구 단서는 입력칸 위
    h += stepBody(v, st, dn, isCur);
    if(k === 'find' && QO.read && !v.legacyHarvest) h += QO.read.findHTML(v.id);   // 모르는 낱말의 찾은 뜻(read.js)
    if(!isCur) h += dn ? cluesHTML(v, k) : cluesLater(v, k);   // 아직 안 간 칸은 개수만(처음 생각이 끌려가지 않게)
    if(v.d.flag && v.d.flag.step === k) h += '<div class="flagbox">친구에게 SOS를 보냈어요' + (v.d.flag.tried ? ' — 「' + esc(v.d.flag.tried) + '」' : '') + '. 우리 반 숲 깃발과 단서 시간에 친구들이 볼 수 있어요.' +
      (v.status === 'open' ? ' <button type="button" class="link teal x-mini" data-xa="unflag">표시 내리기</button>' : '') + '</div>';
    h += '</div></div>';
  });
  if(quick) h += quickHTML(v);
  if(QO.photos) h += QO.photos.html(v);              // 사진(photos.js)
  if(v.legacyHarvest) h += '<div class="statusbar fruit">🍎 옛 과수원에서 거둔 열매예요. 그때는 일지 칸 없이 거뒀어요.' + (v.sprout ? ' 넓히기까지 해서 열매에 새싹 🌱이 달렸어요.' : '') + '</div>';
  else if(v.status === 'wait') h += '<div class="statusbar wait">선생님께 보냈어요. 선생님이 읽고 나면 열매가 열려요.</div>';
  else if(v.status === 'fruit') h += '<div class="statusbar fruit">🍎 선생님이 확인했어요. 열매가 열렸어요.' + (v.sprout ? ' 넓히기까지 해서 열매에 새싹 🌱이 달렸어요.' : '') + '</div>';
  else if(v.status === 'fog') h += '<div class="statusbar fog">' + ui.FOG_SVG + ' 끝까지 찾아본 질문이에요. 어디까지 알아냈는지 기록으로 남았어요.</div>';
  return h + '</div>';
}

/* ═══════════ 그리기 ═══════════ */
function validOpen(){ return S.openQ != null && !!QO.store.question(S.openQ); }
function setOpen(id){
  id = id == null ? null : Number(id);
  if(S.openQ !== id){ resetForm(); if(X.guideFor != null && X.guideFor !== id) markGuide(); }
  S.openQ = id;
}
/* 선생님 글을 연 질문은 읽음으로 */
function seenFb(row){
  if(!row || !row.fb_unread || X.seenBusy.has(row.id)) return;
  const id = row.id;
  X.seenBusy.add(id);
  QO.api.markFbSeen(id).then(() => { if(QO.store.question(id)) QO.store.upsertQuestion({id, fb_unread:false}); })
    .catch(e => { if(!ui.userMsg(e)) QO.err(e, 'explore:markFbSeen'); })
    .finally(() => { X.seenBusy.delete(id); });
}
/* 쓰던 글 붙잡기(2026-11-12, 사용자 「끝까지 못 하고 중간에 나가면 하던 게 사라진다」).
   「○○ 남기기」를 누른 칸은 원래도 서버에 저장된다. 사라지던 건 단추를 누르기 전에 쓰던 글이다.
   → 일지 칸에 쓰는 글을 이 기기에 바로 저장해 두고, 다시 열면 빈 칸에 되살린다. 그 칸을 저장하면 지운다. 서버엔 안 보낸다. */
const DRAFT_IDS = /^x_(refine|predict|mplan|fsrc|find|samewhy|aicmp|wrap|reached|stuckq|changed|extend|tried|sos|qans|qsrcd)$/;
const DRAFT_OF = {refine:['x_refine'], predict_add:['x_predict'], method:['x_mplan'], find_add:['x_fsrc', 'x_find'], same:['x_samewhy'], aiCmp:['x_aicmp'],
  wrap:['x_wrap', 'x_reached', 'x_stuckq', 'x_changed', 'x_qans', 'x_qsrcd'], extend:['x_extend'], flag:['x_tried', 'x_sos']};
const dKey = (qid, id) => 'qo2-draft-' + ((QO.state.me || {}).id || 'x') + '-' + qid + '-' + id;
function dropDrafts(qid, keys){
  keys.forEach(k => (DRAFT_OF[k] || []).forEach(id => { try{ localStorage.removeItem(dKey(qid, id)); }catch(_){} }));
}
function restoreDrafts(el, qid){
  let n = 0;
  el.querySelectorAll('input[id], textarea[id]').forEach(f => {
    if(!DRAFT_IDS.test(f.id) || f.value.trim()) return;
    let v = null; try{ v = localStorage.getItem(dKey(qid, f.id)); }catch(_){}
    if(v){ f.value = v; n++; }
  });
  if(n && X.restoredFor !== qid){ X.restoredFor = qid; ui.toast('지난번에 쓰던 글을 되살렸어요. 이어서 써 봐요.'); }
}
/* 스스로 시험은 시험마다 흉내 DB 를 새로 깔므로 쓰던 글도 비운다(앞 시험 글이 되살아나지 않게) */
QO.bus.on('ready', () => {
  if(!QO.cfg.selftest) return;
  try{ Object.keys(localStorage).filter(k => k.indexOf('qo2-draft-') === 0).forEach(k => localStorage.removeItem(k)); }catch(_){}
});
document.addEventListener('input', e => {
  const t = e.target, sh = $('#sheet');
  if(!t || !t.id || !DRAFT_IDS.test(t.id) || !sh || !sh.contains(t) || S.openQ == null) return;
  try{ if(t.value.trim()) localStorage.setItem(dKey(S.openQ, t.id), t.value); else localStorage.removeItem(dKey(S.openQ, t.id)); }catch(_){}
}, true);

function paintSheet(o){
  o = o || {};
  const el = $('#sheet'); if(!el) return;
  const wide = ui.wide();
  if(!wide && !el.classList.contains('show') && !o.force) return;
  const row = curRow();
  if(!row){ if(wide) ui.sheet.placeholder(); return; }
  const keep = grab(el);
  if(o.scroll && keep) keep.scroll = null;
  el.innerHTML = sheetHTML(row);
  put(el, keep);
  restoreDrafts(el, row.id);                            // 이 기기에 남겨 둔 쓰던 글
  seenFb(row);
  if(o.scroll){
    const v = V(row);
    let target = null, center = false;
    if(typeof o.scroll === 'string'){ target = document.getElementById(o.scroll); center = true; }
    else if(X.edit || v.cur) target = document.getElementById('x_st_' + (X.edit || v.cur));
    else if(o.toStatus) target = el.querySelector('.statusbar');
    if(target) setTimeout(() => scrollInto(target, center, !center), 30);
  }
}
function render(root){
  const o = X.next || {}; X.next = null;
  const keep = grab(root);
  const L = lists();
  const wide = ui.wide();
  if(wide && !validOpen()){ const f = L.open[0]; setOpen(f ? f.id : null); }
  root.innerHTML = listHTML(L);
  put(root, keep);
  if(wide){ if(validOpen()) paintSheet(o); else ui.sheet.placeholder(); }
  else if($('#sheet') && $('#sheet').classList.contains('show')) paintSheet(o);
}
function paint(o){
  if(QO.tabs.current() !== 'explore') return;
  X.next = o || null;
  QO.tabs.rerender('explore');
}
/* 질문 하나 열기 — 다른 모듈도 쓴다(QO.explore.open) */
function open(id){
  id = Number(id);
  if(!QO.store.question(id)) return false;
  setOpen(id);
  if(QO.tabs.current() !== 'explore') QO.tabs.show('explore');
  if(ui.wide()) paint({scroll:true});
  else { paintSheet({force:true, scroll:true}); ui.sheet.open(); }
  return true;
}

/* ═══════════ 저장 ═══════════ */
async function run(btn, key, work){
  const errEl = document.getElementById('x_e_' + key);
  X.saving++;
  let r;
  try{ r = await ui.busy(btn, work, {errEl}); }
  finally{ X.saving--; }
  if(r === undefined){ const el = document.getElementById('x_e_' + key) || errEl; X.msg[key] = el ? el.textContent : ''; paint(); }
  return r;
}
async function saveTo(id, patch){
  const res = await QO.api.saveJournal(id, patch);
  dropDrafts(id, Object.keys(patch || {}));            // 저장한 칸의 쓰던 글은 지운다
  QO.store.upsertQuestion(res);
  await QO.store.refreshQuestion(id);
  return res;
}
async function plantChild(v, text, patch){
  const row = await QO.api.plantQuestion({text:text, parent_id:v.id, is_anonymous:v.anon});
  QO.store.upsertQuestion(row);
  QO.acorn('plant', row.id);                            // 꼬리 질문도 심기 도토리(기다리지 않음)
  if(patch) QO.store.upsertQuestion(await QO.api.saveJournal(row.id, patch));
  await QO.store.refreshQuestion(row.id);
  return row;
}
/* 이 질문에서 나온 꼬리 질문(같은 글) */
const sameText = (a, b) => String(a || '').replace(/\s+/g, '') === String(b || '').replace(/\s+/g, '');
const childWith = (v, text) => S.questions.find(q => q && Number(q.parent_id) === v.id && sameText(q.text, text)) || null;
/* 「아직 모름」의 막힌 곳 — 되돌림 뒤 다시 보내도 막힘 표시 선 새 질문은 하나만 남긴다.
   같은 글이면 다시 심지 않고, 글이 바뀌었으면 옛 꼬리 질문의 막힘 표시를 내리고 새로 심는다(옛 질문은 지우지 않음) */
async function plantStuck(v, text, tried){
  const flagged = q => !!(q.journal && q.journal.flag && q.journal.flag.step);
  const prev = v.d.wrap && v.d.wrap.mode === 'unknown' && !v.d.wrap.legacy ? v.d.wrap.stuckQ : '';   // 지난번에 보낸 막힌 곳
  const old = prev && !sameText(prev, text) ? childWith(v, prev) : null;
  if(old && flagged(old)) QO.store.upsertQuestion(await QO.api.saveJournal(old.id, {flag:null}));
  const same = childWith(v, text);
  if(same){
    if(!flagged(same) && !same.fruit_kind) QO.store.upsertQuestion(await QO.api.saveJournal(same.id, {flag:{step:'find', tried:tried}}));
    return same;
  }
  return plantChild(v, text, {flag:{step:'find', tried:tried}});
}
/* 칸을 저장한 뒤 — 도토리는 없고, 쓴 말을 돌려준다. 이 칸에 온 단서가 있으면 고마움을 묻는다 */
function finish(k, wasDone, msg, keepEdit){
  X.edit = keepEdit ? k : null; X.peek = null; X.flagFor = null; X.f = {};
  const keepMsg = keepEdit ? X.msg[k] : '';
  X.msg = {}; if(keepMsg) X.msg[k] = keepMsg;
  const v = curV();
  const helped = v ? v.openClues.filter(c => c.step === k && v.thankable(c)) : [];
  paint({scroll:helped.length ? 'x_clue_' + helped[0].id : true, toStatus:v && v.status !== 'open'});
  if(!wasDone) drop(document.querySelector('#x_st_' + k + ' .ic'));
  if(msg) ui.toast(msg);
}

async function plant(btn){
  setErr('plant', '');
  const inp = $('#x_plant');
  if(inp && QO.ime && QO.ime.ask(inp)){ setErr('plant', '글자가 영어로 쳐진 것 같아요. 아래에서 골라 주세요.'); return; }   // 깨진 한글 입력은 심기 전에
  const v = (inp && inp.value || '').trim();
  if(clen(v) < 5){ setErr('plant', '한 마디만 더 붙여 볼까요? 다섯 글자 넘게 적어요.'); if(inp) inp.focus(); return; }
  const jw = QO.check.junkWhy(v); if(jw){ setErr('plant', jw); if(inp) inp.focus(); return; }
  /* 같은 질문 또 심기(옛 앱 findDupQ 와 같은 일) — 최근 60개 */
  const dup = S.questions.slice(0, 60).find(q => q && (QO.check.similar(v, q.text) >= 0.85 || (q.refined_text && QO.check.similar(v, q.refined_text) >= 0.85)));
  if(dup){ setErr('plant', '비슷한 질문 「' + cut(dup.refined_text || dup.text, 24) + '」을 이미 심었어요. 다른 질문이면 조금 더 구체적으로 적어 주세요.'); if(inp) inp.focus(); return; }
  const input = {text:v, is_anonymous:!!($('#x_anon') || {}).checked, phase:X.phase};
  const sel = $('#x_unit');
  if(X.unitTouched && sel) input.unit = sel.value;      // '' = 나중에 고를래요, 안 건드리면 지금 차시
  const row = await run(btn, 'plant', async () => {
    const r = await QO.api.plantQuestion(input);
    QO.store.upsertQuestion(r);
    await QO.store.refreshQuestion(r.id);
    return r;
  });
  if(!row) return;
  const i2 = $('#x_plant'); if(i2) i2.value = '';
  const a2 = $('#x_anon'); if(a2) a2.checked = false;
  X.unitTouched = false; X.msg.plant = '';
  if(ui.wide()) setOpen(row.id);                       // 태블릿: 심은 질문의 일지를 오른쪽에 바로
  paint({scroll:true});
  const got = await QO.acorn('plant', row.id);          // 심기 도토리(하루 상한 안에서)
  ui.toast('🌱 씨앗을 심었어요' + (got ? ' · 🌰 +' + got : '') + '. 예상부터 적으면 첫 칸이 채워져요.');
  setTimeout(() => { const c = document.querySelector('#body .qcard[data-id="' + row.id + '"]'); if(c) c.classList.add('flash'); }, 30);
}
async function saveRefine(btn, skip){
  const v = curV(); if(!v) return;
  setErr('refine', '');
  let patch, msg;
  if(skip){ patch = {refine:''}; msg = '처음 질문 그대로 탐구해요.'; }
  else {
    const raw = val('x_refine');
    /* 85% 넘게 같으면 못 낸다 — 끝의 「요」·문장부호만 바꾼 글도 같은 글로 본다 */
    const near = (a, b) => QO.check.containedIn(a, b) >= 0.85 || QO.check.similar(a, b) >= 0.85;
    if(clen(raw) >= 6 && near(raw, v.original)) return setErr('refine', '처음 질문과 거의 같아요. 조금 더 분명하게 바꿔 봐요.');
    if(clen(raw) >= 6 && v.refineAsk && v.d.refine.text && near(raw, v.d.refine.text)) return setErr('refine', '지난번에 다듬은 질문과 거의 같아요. 선생님 글을 보고 조금 더 바꿔 봐요.');
    const t = need('x_refine', 6, 'refine'); if(t == null) return;
    patch = {refine:t}; msg = '다듬은 질문으로 탐구해요.';
  }
  const r = await run(btn, 'refine', () => saveTo(v.id, patch));
  if(r) finish('refine', true, msg);
}
async function savePredict(btn){
  const v = curV(); if(!v) return;
  setErr('predict', '');
  const first = !v.d.predict.length;
  const t = need('x_predict', 8, 'predict', [v.original, v.text].concat(v.d.predict.map(p => p.text))); if(t == null) return;
  if(!QO.check.hasReason(t)) return setErr('predict', '까닭도 한 마디 붙여 볼까요? 「왜냐하면 __」처럼요.');
  const r = await run(btn, 'predict', () => saveTo(v.id, {predict_add:t}));
  if(r) finish('predict', !first, first ? '예상을 남겼어요. 정리할 때 다시 보여 줄게요.' : '바뀐 생각을 남겼어요. 처음 생각도 그대로 있어요.');
}
async function saveMethod(btn){
  const v = curV(); if(!v) return;
  setErr('method', '');
  const m = v.d.method || {};
  const kind = fget('mk', m.legacy ? '' : (m.kind || ''));
  if(!kind) return setErr('method', '어떻게 알아볼지 하나 골라 주세요.');
  let plan = '';
  if(kind === 'exp'){ plan = need('x_method', 8, 'method', [v.original]); if(plan == null) return; }
  const was = v.done.method;
  const r = await run(btn, 'method', () => saveTo(v.id, {method:{kind, plan}}));
  if(r) finish('method', was, (METHOD_TO[kind] || methodName(kind) + '(으)로') + ' 알아보기로 했어요.');
}
async function saveFind(btn){
  const v = curV(); if(!v) return;
  setErr('find', '');
  const list = v.d.find, was = v.done.find;
  const src = val('x_fsrc'), txt = val('x_find');
  const cmpBox = document.getElementById('x_aicmpBox'), cmp = cmpBox && !cmpBox.hidden ? val('x_aicmp') : '';
  const patch = {};
  if(src || txt){
    const s = need('x_fsrc', 2, 'find'); if(s == null) return;
    const t = need('x_find', 10, 'find', [v.original, v.text].concat(list.map(x => x.text))); if(t == null) return;
    const ai = !!($('#x_fai') || {}).checked || AI_RE.test(s);
    if(list.length){
      const same = fget('same', '');
      if(!same) return setErr('find', '두 곳이 같은 말을 하는지 골라 주세요.');
      const why = val('x_samewhy');
      patch.same = same + (same === '달라요' && why ? ' — ' + why : '');
    }
    patch.find_add = {src:s, text:t, ai};
  } else if(!cmp || cmp === (v.d.aiCmp || '')){
    return setErr('find', list.length ? '다른 곳의 이름과 알아낸 것을 적어 주세요.' : '어디서 무엇을 알았는지 적어 주세요.');
  }
  if(cmp && cmp !== (v.d.aiCmp || '')){
    if(clen(cmp) < 6) return setErr('find', 'AI 답과 견준 것을 여섯 글자 넘게 적어 주세요.');
    const jw = QO.check.junkWhy(cmp, [v.original]); if(jw) return setErr('find', jw);
    patch.aiCmp = cmp;
  }
  const r = await run(btn, 'find', () => saveTo(v.id, patch));
  if(!r) return;
  ['x_fsrc', 'x_find', 'x_samewhy'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const nv = curV();
  if(nv && !nv.findOK){
    /* AI 를 썼으면 AI 아닌 출처 + 견주기가 있어야 찾기가 끝난다 */
    X.msg.find = nv.d.find.some(x => !x.ai) ? 'AI 답과 같은 점이나 다른 점을 한 줄 적어 주세요.' : 'AI 답은 틀릴 수 있어요. AI가 아닌 곳을 한 군데 더 찾아 주세요.';
    finish('find', true, '찾은 것을 남겼어요.', true);
    return;
  }
  finish('find', was, patch.find_add ? (list.length ? '두 곳에서 찾은 것을 견줘 봤어요.' : '찾은 것을 남겼어요.') : 'AI 답과 견준 것을 남겼어요.');
}
async function saveWrap(btn){
  const v = curV(); if(!v) return;
  const k = 'wrap'; setErr(k, '');
  const p = v.d.predict, w0 = v.d.wrap || {};
  const cmp = fget('cmp', w0.cmp || '');
  if(p.length && !cmp) return setErr(k, '내 예상이 어땠는지 먼저 골라 주세요.');
  let changedBy = '';
  if(cmp === 'changed'){ changedBy = need('x_changed', 4, k); if(changedBy == null) return; }
  const mode = fget('wmode', w0.mode || 'known');
  const others = [v.original, v.text].concat(p.map(x => x.text));
  let w;
  /* 알아낸 것은 내 말로 — 찾기 글을 그대로 옮긴 것도 막는다(여기까지 알아냈어요는 찾은 사실을 옮기는 칸이라 뺌) */
  if(mode === 'known'){ const t = need('x_wrap', 10, k, others.concat(v.d.find.map(f => f.text))); if(t == null) return; w = {mode:'known', text:t}; }
  else {
    if(!v.fogOK) return setErr(k, '아직은 「아직 모름」을 고를 수 없어요.');
    const r = need('x_reached', 8, k, others); if(r == null) return;
    const sq = need('x_stuckq', 6, k, [v.original]); if(sq == null) return;
    if(!/(\?|？|까|까요)$/.test(sq)) return setErr(k, '막힌 곳은 질문 꼴로 적어 주세요. 「__는 왜 __일까?」처럼요.');
    const why = fget('why', w0.mode === 'unknown' ? (w0.why || '') : '');
    if(!why) return setErr(k, '왜 막혔는지 하나 골라 주세요.');
    w = {mode:'unknown', reached:r, stuckQ:sq, why};
  }
  w.cmp = cmp; w.changedBy = changedBy;
  const patch = {wrap:w};
  let ext = null;
  if(!v.done.extend){
    const xm = fget('xmode', ''), xt = val('x_extend');
    if(xt){
      if(!xm) return setErr(k, '넓히기는 「생활과 잇기」나 「새 질문」 중 하나를 골라 주세요.');
      if(clen(xt) < 6) return setErr(k, '넓히기 한 줄을 여섯 글자 넘게 적어 주세요.');
      const jw = QO.check.junkWhy(xt, [v.original]); if(jw) return setErr(k, jw);
      ext = {kind:xm, text:xt}; patch.extend = ext;
    }
  }
  const r = await run(btn, k, async () => {
    const res = await saveTo(v.id, patch);
    if(w.mode === 'unknown') await plantStuck(v, w.stuckQ, w.reached);   // 막힌 곳은 새 질문 + 막힘 표시(하나만)
    if(ext && ext.kind === 'newq' && !childWith(v, ext.text)) await plantChild(v, ext.text);
    return res;
  });
  if(!r) return;
  let msg = '선생님께 보냈어요.';
  if(w.mode === 'unknown') msg += ' 막힌 곳은 새 질문으로 심고 막힘 표시를 세웠어요.';
  else if(ext && ext.kind === 'newq') msg += ' 새 질문도 씨앗으로 심었어요.';
  finish(k, v.done.wrap, msg);
}
async function saveExtend(btn){
  const v = curV(); if(!v) return;
  setErr('extend', '');
  const kind = fget('xmode', (v.d.extend || {}).kind || 'life');
  const t = need('x_extend', 6, 'extend', [v.original]); if(t == null) return;
  const was = v.done.extend;
  const r = await run(btn, 'extend', async () => {
    const res = await saveTo(v.id, {extend:{kind, text:t}});
    if(kind === 'newq' && !childWith(v, t)) await plantChild(v, t);
    return res;
  });
  if(r) finish('extend', was, kind === 'newq' ? '새 질문을 씨앗으로 심었어요.' : '생활과 이었어요.' + (v.status === 'fruit' || v.status === 'fog' ? ' 열매에 새싹이 달렸어요.' : ''));
}
async function saveUnit(sel){
  const v = curV(); if(!v) return;
  const unit = sel.value;
  sel.disabled = true;
  const r = await run(null, 'unit', async () => { const x = await QO.api.setUnit(v.id, unit); QO.store.upsertQuestion({id:v.id, unit:x.unit}); return x; });
  if(!r){ const s2 = document.getElementById('x_setunit'); if(s2) s2.disabled = false; return; }
  delete X.msg.unit;
  paint();
  ui.toast('단원을 붙였어요.');
}
async function raiseFlag(btn){
  const v = curV(); if(!v) return;
  setErr('flag', '');
  const k = btn.dataset.k || 'find';
  const el = document.getElementById('x_tried'), raw = (el && el.value || '').trim();
  let t = '';                                            // 한 줄은 안 써도 된다(11-12 「막혔어요까지 너무 길다」)
  if(raw){ t = need('x_tried', 4, 'flag', [v.original]); if(t == null) return; }
  const r = await run(btn, 'flag', () => saveTo(v.id, {flag:{step:k, tried:t}}));
  if(!r) return;
  X.flagFor = null;
  paint();
  ui.toast('친구에게 SOS를 보냈어요. 우리 반 숲에 깃발이 섰어요.');
}
/* ── 끝까지 탐구 / 답만 달기 · 친구에게 SOS(일지 맨 위) ── */
function pathsHTML(v){
  const q = X.qmode[v.id] === QUICK, d = v.d;
  let h = '<div class="x-paths"><div class="seg" role="group" aria-label="어떻게 해결할까요?">' +
    '<button type="button" data-xa="qmode" data-m="full" aria-pressed="' + !q + '"' + (q ? '' : ' class="on"') + '>끝까지 탐구</button>' +
    '<button type="button" data-xa="qmode" data-m="quick" aria-pressed="' + q + '"' + (q ? ' class="on"' : '') + '>답만 달기</button></div>';
  if(d.flag) h += '<div class="x-sos on"><span>친구에게 SOS를 보냈어요. 우리 반 숲 깃발 숲에 깃발이 섰어요.</span><button type="button" class="link teal x-mini" data-xa="unflag">SOS 내리기</button></div>';
  else if(X.sosFor === v.id) h += '<div class="x-sos ask"><input class="inp" id="x_sos" maxlength="200" autocomplete="off" placeholder="어디서 막혔는지 한 줄 (안 써도 돼요)">' +
    '<div class="row"><button type="button" class="btn line sm" data-xa="sosCancel">그만</button><button type="button" class="btn teal sm" style="flex:1" data-xa="sosSend">SOS 보내기</button></div>' + errDiv('sos') + '</div>';
  else h += '<button type="button" class="x-sosbtn" data-xa="sosOpen">친구에게 SOS</button>';
  return h + '</div>';
}
function quickHTML(v){
  return '<div class="card x-quick"><div class="lbl">알아낸 답</div>' +
    '<textarea class="inp" id="x_qans" rows="3" maxlength="1000" placeholder="알아낸 답을 내 말로 한두 문장"></textarea>' +
    '<div class="lbl" style="margin:12px 0 6px">어디서 알았어요?</div>' + chipsHTML('x_qsrc', 'qsrc', QSRC.map(s => [s, s]), fget('qsrc', '')) +
    '<input class="inp" id="x_qsrcd" style="margin-top:8px" maxlength="80" autocomplete="off" placeholder="자세히 (안 써도 돼요) 예: 교과서 120쪽">' +
    '<button type="button" class="btn wide" style="margin-top:12px" data-xa="quick">선생님께 보내기</button>' + errDiv('quick') +
    '<div class="hint" style="margin-top:8px">끝까지 탐구로 칸을 채울수록 발자국이 남아서, 열매를 맺을 때 도토리를 더 받아요.</div></div>';
}
async function saveQuick(btn){
  const v = curV(); if(!v) return;
  const k = 'quick'; setErr(k, '');
  const el = document.getElementById('x_qans');
  if(el && el.value.trim() && QO.ime && QO.ime.ask(el)) return setErr(k, '글자가 영어로 쳐진 것 같아요. 아래에서 골라 주세요.');
  const t = need('x_qans', 10, k, [v.original, v.text]); if(t == null) return;
  const src = fget('qsrc', '');
  if(!src) return setErr(k, '어디서 알았는지 하나 골라 주세요.');
  const det = (document.getElementById('x_qsrcd') || {}).value || '';
  const where = Array.from((det.trim() ? src + ' · ' + det.trim() : src)).slice(0, 190).join('');
  const r = await run(btn, k, () => saveTo(v.id, {wrap:{mode:'known', text:t, cmp:QUICK, changedBy:where}}));
  if(!r) return;
  X.qmode[v.id] = null; X.f = {};
  paint({scroll:true, toStatus:true});
  ui.toast('선생님께 보냈어요. 선생님이 읽고 나면 열매가 열려요.');
}
async function sendSos(btn){
  const v = curV(); if(!v) return;
  setErr('sos', '');
  const el = document.getElementById('x_sos'), t = (el && el.value || '').trim();
  if(t){
    if(QO.ime && QO.ime.ask(el)) return setErr('sos', '글자가 영어로 쳐진 것 같아요. 아래에서 골라 주세요.');
    const jw = QO.check.junkWhy(t, [v.original]); if(jw) return setErr('sos', jw);
  }
  const step = ['predict', 'method', 'find', 'wrap'].indexOf(v.cur) >= 0 ? v.cur : 'find';   // 지금 하고 있는 칸에
  const r = await run(btn, 'sos', () => saveTo(v.id, {flag:{step:step, tried:t}}));
  if(!r) return;
  X.sosFor = null; paint();
  ui.toast('친구에게 SOS를 보냈어요. 우리 반 숲에 깃발이 섰어요.');
}
async function lowerFlag(btn){
  const v = curV(); if(!v) return;
  const r = await run(btn, 'flag', () => saveTo(v.id, {flag:null}));
  if(r){ paint(); ui.toast('막힘 표시를 내렸어요.'); }
}
/* 고마움(꽃) — 「덕분에 __」 4~40자. thanks_text 에는 빈칸 글만 들어간다 */
async function thxSend(btn){
  const v = curV(); if(!v) return;
  const cid = Number(btn.dataset.cid), key = 'thx' + cid;
  setErr(key, '');
  const el = document.getElementById('x_thx_' + cid);
  const t = (el && el.value || '').trim().replace(/^덕분에\s*/, '');
  if(clen(t) < 4){ setErr(key, '무엇 덕분이었는지 네 글자 넘게 적어 주세요.'); if(el) el.focus(); return; }
  const jw = QO.check.junkWhy(t); if(jw) return setErr(key, jw);
  const r = await run(btn, key, async () => { const ok = await QO.api.thankClue(cid, t); await QO.store.refreshQuestion(v.id); return ok; });
  if(r === undefined) return;
  delete X.thx[cid]; delete X.msg[key];
  paint();
  ui.toast('🌸 친구에게 고마움을 보냈어요.');
}
async function thxNo(btn){
  const v = curV(); if(!v) return;
  const cid = Number(btn.dataset.cid);
  const r = await run(btn, 'thx' + cid, async () => { await QO.api.declineClue(cid); await QO.store.refreshQuestion(v.id); return true; });
  if(r === undefined) return;
  delete X.thx[cid];
  paint();
}

/* ═══════════ 누르기·입력 ═══════════ */
function seg(b){
  const box = b.parentNode, g = box && box.dataset.g; if(!g) return;
  X.f[g] = b.dataset.v;
  Array.from(box.children).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const v = X.f[g];
  if(g === 'mk'){ tog('x_mplan', v !== 'exp'); tog('x_maihint', v !== 'ai'); }
  if(g === 'cmp') tog('x_changed', v !== 'changed');
  if(g === 'wmode'){ tog('x_wKnown', v === 'unknown'); tog('x_wUnknown', v !== 'unknown'); }
}
const ACT = {
  plant, phase:b => setPhase(b.dataset.ph), open:b => open(b.dataset.id), close:() => ui.sheet.close(),
  fold:() => { X.showDone = !X.showDone; paint(); },
  peek:b => { X.peek = b.dataset.k || null; paint(); },
  edit:b => { X.edit = b.dataset.k; X.peek = null; X.flagFor = null; X.f = {}; delete X.msg[b.dataset.k]; paint({scroll:true}); },
  cancel:() => { X.edit = null; X.flagFor = null; X.f = {}; paint({scroll:true}); },
  seg,
  refine:b => saveRefine(b, false), refineSkip:b => saveRefine(b, true),
  predict:savePredict, method:saveMethod, find:saveFind, wrap:saveWrap, extend:saveExtend,
  flagOpen:b => { X.flagFor = b.dataset.k; paint(); focusId('x_tried'); },
  qmode:b => { const v = curV(); if(!v) return; X.qmode[v.id] = b.dataset.m === QUICK ? QUICK : null; X.f = {}; delete X.msg.quick; paint(); if(X.qmode[v.id]) focusId('x_qans'); },
  quick:saveQuick,
  sosOpen:() => { const v = curV(); if(!v) return; X.sosFor = v.id; paint(); focusId('x_sos'); },
  sosCancel:() => { X.sosFor = null; delete X.msg.sos; paint(); },
  sosSend:sendSos,
  flagCancel:() => { X.flagFor = null; delete X.msg.flag; paint(); },
  flag:raiseFlag, unflag:lowerFlag,
  thxYes:b => { X.thx[b.dataset.cid] = 'yes'; paint(); focusId('x_thx_' + b.dataset.cid); },
  thxBack:b => { delete X.thx[b.dataset.cid]; paint(); },
  thxNo, thxSend
};
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-xa]');
  if(!b || !b.closest('#app')) return;
  const fn = ACT[b.dataset.xa]; if(!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(b)).catch(err => QO.err(err, 'explore:' + b.dataset.xa));
});
document.addEventListener('change', e => {
  const t = e.target; if(!t || !t.id) return;
  if(t.id === 'x_unit') X.unitTouched = true;
  if(t.id === 'x_setunit' && t.value) saveUnit(t).catch(err => QO.err(err, 'explore:unit'));
  if(t.id === 'x_fai'){ X.f.fai = t.checked; const v = curV(); tog('x_aicmpBox', !(t.checked || (v && v.aiUsed))); }
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.repeat || e.shiftKey) return;
  const t = e.target; if(!t || !t.id || t.tagName === 'TEXTAREA') return;
  let btn = null;
  if(t.id === 'x_plant') btn = $('[data-xa="plant"]');
  else if(t.id.indexOf('x_thx_') === 0) btn = $('[data-xa="thxSend"][data-cid="' + t.id.slice(6) + '"]');
  else if(t.id === 'x_tried') btn = $('[data-xa="flag"]');
  if(btn){ e.preventDefault(); btn.click(); }
});

/* ═══════════ 지금 차시 · 이벤트 ═══════════ */
async function loadNowUnit(){
  X.nowAt = Date.now();
  try{
    const u = await QO.api.nowUnit();
    if(!S.me) return;
    if(u !== X.nowUnit){ X.nowUnit = u || null; if(!X.unitTouched) paint(); }
  }catch(e){ if(!ui.userMsg(e)) QO.err(e, 'explore:nowUnit'); }
}
QO.bus.on('me:changed', () => { if(!S.ready) resetAll(); });          // 들어갈 때마다 처음부터
QO.bus.on('ready', e => { if(e && e.page === 'student') loadNowUnit(); });
QO.bus.on('questions:changed', () => { if(!X.saving && S.ready && QO.tabs.current() === 'explore') QO.tabs.rerender('explore'); });
QO.bus.on('q:open', e => { if(e && e.id != null) open(e.id); });
QO.bus.on('wide:changed', w => { if(!w){ setOpen(null); } });
QO.bus.on('sheet:close', () => { if(X.guideFor != null) markGuide(); setOpen(null); paint(); });

QO.tabs.register({
  id:'explore', label:'탐구', icon:ui.icons.explore, split:true,
  render,
  onShow(){ if(S.ready && Date.now() - X.nowAt > 60000) loadNowUnit(); },
  onHide(){ if(!ui.wide()) setOpen(null); }
});

QO.explore = {view, open, UNITS, stepTexts};

/* ═══════════ 스스로 시험 ═══════════ */
if(QO.selftest && QO.cfg.page === 'student'){
  const add = QO.selftest.add;
  const q$ = s => document.querySelector(s);
  const dbq = (t, id) => t.db.questions.find(x => x.id === id);
  const VV = id => view(QO.store.question(id), QO.store.marksOf(id), QO.store.cluesOf(id));
  async function openQ(t, id){
    await t.click('#nav [data-t="explore"]');
    open(id);
    await t.waitFor(() => { const e = q$('#sheet .sh-top'); return e && e.dataset.qid === String(id); });
  }
  async function setup(t, id, patches){
    for(const p of patches) QO.store.upsertQuestion(await t.api.saveJournal(id, p));
    await QO.store.refreshQuestion(id);
  }

  add('탐구 · 일지 보기(칸 표시 기준·옛 글·발자국 수)', async t => {
    t.eq([VV(102).prints, VV(102).cur], [2, 'find'], '102');
    t.eq([VV(105).cur, VV(105).prints, !!VV(105).old.predict, !!VV(105).old.wrap], ['wrap', 4, true, true], '105 옛 solve 만');
    t.eq(VV(104).status, 'wait', '104'); t.expect(VV(106).sprout, '106 새싹'); t.eq(VV(107).status, 'fog', '107');
    t.expect(VV(109).legacyHarvest && VV(109).cur === null, '109 옛 수확');
    t.eq([VV(108).cur, VV(101).cur, VV(103).d.flag.step], ['refine', 'predict', 'find'], '108·101·103');
    const row = {id:-1, text:'시험용 질문이에요', journal:{predict:[{text:'짧아'}], method:{kind:'ai', plan:''}, find:[{src:'챗GPT', text:'AI가 한 말을 적었어요', ai:true}]}};
    const a = view(row, {}, []);
    t.eq([a.done.predict, a.done.method, a.done.find, a.cur, a.prints], [false, true, false, 'predict', 1], '글 길이 기준·AI 만');
    const now = new Date().toISOString();
    const b = view(row, {predict:{first_at:now, last_at:now, text_md5:'m'}}, []);
    t.eq([b.done.predict, b.cur], [true, 'find'], '서버 칸 표시가 있으면 찬 칸');
    const lv = view({id:-2, text:'전지를 넣으면 불이 켜질까?', solve:{guess:'불이 켜질 것 같다', why:'전지가 있으니까', how:['obs', 'src'], change:'전구를 보기', source:'교과서', result:'불이 켜졌다', answer:'전지를 연결하면 전류가 흘러 불이 켜진다', newq:'전지 두 개면 더 밝을까?'}}, {}, []);
    t.eq(lv.d.predict[0].text, '불이 켜질 것 같다 전지가 있으니까', '옛 예상 = guess + why');
    t.eq([lv.d.method.how, lv.d.method.plan, lv.d.find[0].src, lv.d.wrap.text, lv.d.extend.kind], ['관찰, 조사', '전구를 보기', '교과서', '전지를 연결하면 전류가 흘러 불이 켜진다', 'newq'], '옛 칸');
    t.eq([lv.prints, lv.cur], [5, 'wrap'], '옛 칸 다섯 · 보내기 전');
    const clue = {id:9, step:'find', created_at:new Date(Date.now() - 60000).toISOString()};
    t.expect(!view(row, {}, [clue]).thankable(clue) && view(row, {find:{first_at:now, last_at:now, text_md5:'z'}}, [clue]).thankable(clue), '고마움은 단서 뒤 칸이 바뀐 뒤');
    t.expect(view(row, {}, [clue]).fogOK && !view(row, {}, []).fogOK, '안개 조건(단서)');
    /* 💬 선생님의 답변 — 되묻기와 따로 보이고, 다듬기를 막지 않는다 */
    const iso0 = d => new Date(Date.now() + d).toISOString();
    const ansV = view({id:-4, text:'정전기는 왜 생길까요?', teacher_answer:'전자가 옮겨 가서 생겨요.', teacher_nudge:'그럼 겨울엔 왜 더 잘 생길까?', teacher_fb_at:iso0(-1000), status:'open', journal:{}}, {}, []);
    t.eq([ansV.answer, ansV.tch.length > 0], ['전자가 옮겨 가서 생겨요.', true], '답변은 되묻기와 따로 읽힘');
    t.expect(teacherBox(ansV, 'plant').indexOf('선생님의 답변') >= 0 && teacherBox(ansV, 'plant').indexOf('전자가 옮겨') >= 0, '심기 칸에 「선생님의 답변」 상자');
    t.expect(!view({id:-5, text:'질문이에요 정말', status:'open', journal:{}}, {}, []).answer, '답변 없으면 빈 칸');
    /* 선생님 글 기준 — 시각 없는 옛 되묻기는 막지 않음 · 다듬기에 답한 뒤 되돌리면 되돌린 칸부터 · 다시 보낸 뒤 되돌림 글은 정리 칸으로 */
    const P8 = '자석이 철을 당기는 것 같다. 왜냐하면 가까이 가면 붙으니까.';
    const oldN = view({id:-3, text:'자석은 왜 철에만 붙을까?', teacher_nudge:'어떤 철에 붙는지 더 적어 볼까요?', teacher_fb_at:null, status:'open', journal:{predict:[{text:P8}]}}, {}, []);
    t.eq([oldN.refineAsk, oldN.cur, oldN.tch.length > 0], [false, 'method', true], '시각 없는 옛 되묻기');
    const iso = d => new Date(Date.now() + d).toISOString();
    const J4 = {refine_done:true, predict:[{text:P8}], method:{kind:'book', plan:''}, find:[{src:'교과서 120쪽', text:'자석은 철·니켈·코발트를 끌어당긴다.'}], wrap:{mode:'known', text:'자석은 철 같은 몇 가지 금속만 끌어당긴다.', at:iso(-30000)}};
    const base4 = {id:-4, text:'자석은 왜 철에만 붙을까?', refined_text:'냉장고 문에 자석은 붙는데 알루미늄 캔에는 왜 안 붙을까?', refined_at:iso(-60000),
      teacher_refine_note:'어떤 물체에 붙고 안 붙는지 써 볼까요?', teacher_nudge:'찾은 곳이 한 곳뿐이에요.', teacher_fb_at:iso(-1000)};
    const ret = view(Object.assign({}, base4, {journal:Object.assign({}, J4, {returned:{step:'find', at:iso(-1000)}})}), {}, []);
    t.eq([ret.refineAsk, ret.cur, ret.answered], [false, 'find', true], '다듬기에 답한 뒤 찾기로 되돌림');
    const re2 = view(Object.assign({}, base4, {resolve_requested_at:iso(0), journal:Object.assign({}, J4, {wrap:Object.assign({}, J4.wrap, {at:iso(0)})})}), {}, []);
    t.eq([re2.status, re2.refineAsk, re2.pastNudge, re2.tch2], ['wait', false, '찾은 곳이 한 곳뿐이에요.', ''], '다시 보낸 뒤 되돌림 글은 지난 글');
    const r2 = view(Object.assign({}, base4, {teacher_refine_note:null, journal:Object.assign({}, J4, {refine_done:false, returned:{step:'refine', at:iso(-1000)}})}, {refined_text:null, refined_at:null}), {}, []);
    t.eq([r2.cur, r2.rk], ['refine', 'refine'], '다듬기로 되돌림');
  });

  add('탐구 · 심기 → 목록에 보임(지금 차시·익명·나중에)', async t => {
    await t.click('#nav [data-t="explore"]');
    await t.type('#x_plant', 'ㅋㅋㅋㅋㅋㅋ');
    await t.click('[data-xa="plant"]');
    t.expect(q$('#x_e_plant').textContent.length > 0, '장난 글 막힘');
    t.eq(QO.check.junkWhy('별의 표면 온도가 30000K 이면 무슨 색일까? 아아아 궁금해'), '', '같은 글자 반복은 막지 않음(30000K)');
    t.expect(QO.check.junkWhy('\u110F\u110F\u110F\u110F') && QO.check.junkWhy('\u1100\u1102'), '첫소리 모양 ᄏᄏ·자모도 막음');
    t.eq(QO.check.junkWhy('\u1100\u1161\u1102\u1161'.repeat(3)), '', '풀어 쓴 글자(가나)는 막지 않음');
    await t.type('#x_plant', '자석을 반으로 자르면 극은 어떻게 될까?');
    await t.click('[data-xa="plant"]');
    await t.waitFor(() => t.$$('#body .qcard').find(b => b.textContent.indexOf('자석을 반으로') >= 0));
    const q = t.db.questions.find(x => x.text === '자석을 반으로 자르면 극은 어떻게 될까?');
    t.eq([q.unit, q.is_anonymous, q.user_id], ['코일 주위의 자기장', false, 'u-A'], '지금 차시가 붙음');
    t.eq(q$('#x_plant').value, '', '입력칸 비움');
    if(ui.wide()) await t.waitFor(() => q$('#sheet .sh-top') && q$('#sheet .sh-top').dataset.qid === String(q.id));
    await t.type('#x_plant', '나침반 바늘은 왜 늘 같은 쪽을 가리킬까?');
    q$('#x_anon').checked = true;
    const sel = q$('#x_unit'); sel.value = ''; sel.dispatchEvent(new Event('change', {bubbles:true}));
    await t.click('[data-xa="plant"]');
    const q2 = await t.waitFor(() => t.db.questions.find(x => x.text === '나침반 바늘은 왜 늘 같은 쪽을 가리킬까?'));
    t.eq([q2.unit, q2.is_anonymous], [null, true], '나중에 고를래요·익명');
    await t.waitFor(() => t.$$('#body .qcard').some(b => b.dataset.id === String(q2.id)));
    t.expect(t.$$('#body .qcard').find(b => b.dataset.id === String(q2.id)).textContent.indexOf('새 질문') >= 0, '새 질문 표시');
    /* 비슷한 질문은 다시 심지 않음 */
    await t.type('#x_plant', '전동기는 어떻게 계속 같은 방향으로 돌까요?');
    await t.click('[data-xa="plant"]');
    t.expect(q$('#x_e_plant').textContent.indexOf('비슷한 질문') === 0, '같은 질문 거르기: ' + q$('#x_e_plant').textContent);
    /* 단원 없이 심은 질문은 일지에서 단원을 붙임 */
    await openQ(t, q2.id);
    const us = await t.waitFor('#x_setunit');
    us.value = '코일 주위의 자기장'; us.dispatchEvent(new Event('change', {bubbles:true}));
    await t.waitFor(() => t.db.questions.find(x => x.id === q2.id).unit === '코일 주위의 자기장');
    await t.waitFor(() => !q$('#x_setunit') && q$('#sheet .sh-top .sub').textContent.indexOf('코일 주위의 자기장') === 0);
  });

  add('탐구 · 깨진 한글 입력(전각은 조용히 고침 · 영타는 묻고 심기 멈춤) · 심기 도토리', async t => {
    await t.click('#nav [data-t="explore"]');
    const inp = await t.waitFor('#x_plant');
    const n0 = t.db.questions.length, s0 = t.state.me.seeds;
    await t.type(inp, 'wjsfbrkdl gmfmaus wkrlwkddl todrlsmsrk');      // 「전류가이 흐르면 자기장이 생기는가」를 영어 자판으로
    await t.click('#body [data-xa="plant"]');
    await t.waitFor('#qo-ime');
    t.eq(t.db.questions.length, n0, '묻는 동안은 안 심김');
    t.expect(/영어로 쳐진/.test(t.$('#body .x-plant .err').textContent), '안내 글');
    t.expect(/^전류가/.test(t.$('#qo-ime .g').textContent), '한글로 바꾼 글을 보여 줌');
    await t.click('#qo-ime [data-ime="yes"]');
    t.expect(/^전류가/.test(t.$('#x_plant').value) && !t.$('#qo-ime'), '바꾸기 누르면 칸이 한글로');   // 칸이 다시 그려졌을 수 있어 새로 찾음
    await t.click('#body [data-xa="plant"]');
    await t.waitFor(() => t.db.questions.length === n0 + 1);
    await t.waitFor(() => t.state.me.seeds === s0 + 1);
    const last = t.db.questions.slice().sort((a, b) => b.id - a.id)[0];
    t.expect(/^전류가/.test(last.text), '한글로 심김 — ' + last.text);
    t.eq(QO.ime.fixWidth('ｐｕｓｈ　ｅａｃｈ'), 'push each', '전각 고치기');
    t.eq(QO.ime.maybeKorean('electricity and magnetism'), null, '진짜 영어는 안 물음');
  });
  add('탐구 · 수업 닫기 질문(고르면 phase=after, 쓰던 글은 남음, 카드에 표시)', async t => {
    await t.click('#nav [data-t="explore"]');
    const inp = await t.waitFor('#x_plant');
    await t.type(inp, '수업이 끝나고 새로 궁금해진 것');
    await t.click('#body .x-phase [data-ph="after"]');
    t.eq(t.$('#body .x-phase [data-ph="after"]').getAttribute('aria-pressed'), 'true', '닫기 눌림');
    t.eq(inp.value, '수업이 끝나고 새로 궁금해진 것', '쓰던 글 그대로');
    t.expect(/수업 뒤/.test(inp.placeholder), '안내 글이 바뀜');
    await t.click('#body [data-xa="plant"]');
    await t.waitFor(() => t.db.questions.some(q => q.text === '수업이 끝나고 새로 궁금해진 것'));
    t.eq(t.db.questions.find(q => q.text === '수업이 끝나고 새로 궁금해진 것').phase, 'after', 'phase=after 로 심김');
    await t.waitFor(() => t.$$('#body .qcard .x-ph').length >= 1);
    await t.click('#body .x-phase [data-ph="before"]');
    await t.type(t.$('#x_plant'), '수업 열 때 궁금한 것을 적어요');
    await t.click('#body [data-xa="plant"]');
    await t.waitFor(() => t.db.questions.some(q => q.text === '수업 열 때 궁금한 것을 적어요'));
    t.eq(t.db.questions.find(q => q.text === '수업 열 때 궁금한 것을 적어요').phase, 'before', '열기로 돌아옴');
  });
  add('탐구 · 예상은 덮어쓰지 않고 덧붙음', async t => {
    await openQ(t, 101);
    t.expect(q$('#x_st_predict.cur'), '예상 칸이 지금 칸');
    await t.type('#x_predict', '자석과 전류가 서로 밀고 당기며 도는 것 같다');
    await t.click('[data-xa="predict"]');
    t.expect(q$('#x_e_predict').textContent.indexOf('까닭') >= 0, '까닭 없으면 막힘');
    await t.type('#x_predict', '자석과 전류가 서로 밀어서 도는 것 같다. 왜냐하면 자석 사이에 전선이 있으니까.');
    await t.click('[data-xa="predict"]');
    await t.waitFor(() => q$('#x_st_method.cur'));
    t.eq(dbq(t, 101).journal.predict.length, 1, '첫 예상');
    await t.click('#x_st_predict [data-xa="peek"][data-k="predict"]');
    await t.click('#x_st_predict [data-xa="edit"]');
    await t.type('#x_predict', '생각이 바뀌었다. 코일에 흐르는 전류의 방향이 반 바퀴마다 바뀌어서 같은 쪽으로 도는 것 같다.');
    await t.click('[data-xa="predict"]');
    await t.waitFor(() => (dbq(t, 101).journal.predict || []).length === 2);
    const j = dbq(t, 101).journal;
    t.expect(j.predict[0].text.indexOf('자석과 전류') === 0 && j.predict[1].text.indexOf('생각이 바뀌었다') === 0, '처음 예상은 그대로, 바뀐 생각은 뒤에');
    await t.waitFor(() => VV(101).d.predict.length === 2 && q$('#x_st_method.cur'));
    await t.click('#x_st_predict [data-xa="peek"][data-k="predict"]');
    await t.waitFor(() => q$('#x_st_predict').textContent.indexOf('바뀐 생각') >= 0 && q$('#x_st_predict .x-was'));
  });

  add('탐구 · 알아볼 방법(실험·관찰이면 무엇을 바꿀지)', async t => {
    await setup(t, 101, [{predict_add:'자석과 전류가 서로 밀어서 도는 것 같다. 왜냐하면 자석 사이에 전선이 있으니까.'}]);
    await openQ(t, 101);
    t.expect(q$('#x_st_method.cur'), '방법 칸');
    await t.click('[data-xa="method"]');
    t.expect(q$('#x_e_method').textContent.indexOf('골라') >= 0, '안 고르면 막힘');
    await t.click('#x_mkind [data-v="exp"]');
    t.expect(!q$('#x_mplan').hidden, '실험이면 계획 칸');
    await t.click('[data-xa="method"]');
    t.expect(q$('#x_e_method').textContent.length > 0, '계획 없으면 막힘');
    await t.type('#x_method', '전지를 반대로 끼우고 코일이 도는 방향 보기');
    await t.click('[data-xa="method"]');
    await t.waitFor(() => (dbq(t, 101).journal || {}).method);
    t.eq(dbq(t, 101).journal.method, {kind:'exp', plan:'전지를 반대로 끼우고 코일이 도는 방향 보기'}, '저장');
    await t.waitFor(() => q$('#x_st_find.cur'));
  });

  add('탐구 · AI 찾기는 AI 아닌 출처와 견주기가 있어야 완료', async t => {
    await openQ(t, 102);
    t.expect(q$('#x_st_find.cur'), '찾기 칸');
    await t.type('#x_fsrc', '챗GPT');
    await t.type('#x_find', '공기가 건조하면 전기가 빠져나가지 못해서 정전기가 잘 생긴다고 했다.');
    await t.click('[data-xa="find"]');
    await t.waitFor(() => (dbq(t, 102).journal.find || []).length === 1);
    t.expect(dbq(t, 102).journal.find[0].ai === true, 'AI 출처 표시');
    await t.waitFor(() => q$('#x_e_find') && q$('#x_e_find').textContent.indexOf('AI가 아닌 곳') >= 0);
    t.eq(VV(102).cur, 'find', 'AI 하나로는 찾기가 안 끝남');
    await t.type('#x_fsrc', '교과서 112쪽');
    await t.type('#x_find', '습도가 낮으면 물체에 생긴 전기가 공기 중으로 잘 빠져나가지 못한다.');
    await t.click('[data-xa="find"]');
    t.expect(q$('#x_e_find').textContent.indexOf('같은 말') >= 0, '두 곳 비교를 골라야 함');
    await t.click('#x_same [data-v="같아요"]');
    await t.click('[data-xa="find"]');
    await t.waitFor(() => dbq(t, 102).journal.find.length === 2);
    await t.waitFor(() => q$('#x_e_find') && q$('#x_e_find').textContent.indexOf('AI 답과') >= 0);
    t.eq(VV(102).cur, 'find', '견주기 없으면 아직');
    await t.type('#x_aicmp', 'AI 답과 교과서가 같은 말을 했지만 교과서가 더 자세했다.');
    await t.click('[data-xa="find"]');
    await t.waitFor(() => dbq(t, 102).journal.aiCmp);
    await t.waitFor(() => VV(102).cur === 'wrap' && q$('#x_st_wrap.cur'));
  });

  add('탐구 · 정리 → 선생님이 읽는 중(처음 예상과 견주기)', async t => {
    await setup(t, 102, [{find_add:{src:'교과서 112쪽', text:'습도가 낮으면 전기가 공기 중으로 잘 빠져나가지 못한다.', ai:false}}]);
    await openQ(t, 102);
    t.eq(VV(102).cur, 'wrap', '정리 칸');
    t.expect(q$('#x_st_wrap').textContent.indexOf('겨울엔 공기가 건조해서') >= 0, '처음 예상이 보임');
    await t.type('#x_wrap', '습도가 낮은 겨울에는 물체에 생긴 전기가 공기 중으로 빠져나가지 못해서 정전기가 잘 생긴다.');
    await t.click('[data-xa="wrap"]');
    t.expect(q$('#x_e_wrap').textContent.indexOf('예상') >= 0, '견주기 안 고르면 막힘');
    await t.click('#x_cmp [data-v="part"]');
    await t.click('[data-xa="wrap"]');
    await t.waitFor(() => dbq(t, 102).resolve_requested_at);
    await t.waitFor(() => q$('#sheet .statusbar.wait'));
    t.eq([VV(102).status, VV(102).cur, dbq(t, 102).journal.wrap.cmp], ['wait', null, 'part'], '선생님이 읽는 중');
    t.expect(!q$('#sheet [data-xa="wrap"]') && !q$('#sheet [data-xa="flagOpen"]'), '보낸 뒤에는 정리 폼이 없음');
    await t.waitFor(() => t.$$('#body .qcard').some(b => b.dataset.id === '102' && b.textContent.indexOf('선생님이 읽는 중') >= 0));
    t.expect(dbq(t, 102).fruit_kind == null, '학생이 열매를 열 수 없음');
  });

  add('탐구 · 안개 열매는 출처 둘이나 단서가 있어야, 막힌 곳은 새 질문', async t => {
    await setup(t, 101, [{predict_add:'자석이 코일을 밀어서 도는 것 같다. 왜냐하면 자석 가까이 있으니까.'}, {method:{kind:'book', plan:''}},
      {find_add:{src:'교과서 130쪽', text:'전동기 속 코일에 전류가 흐르면 자석에게 힘을 받아 돈다.', ai:false}}]);
    await openQ(t, 101);
    t.eq(VV(101).cur, 'wrap', '정리 칸');
    await t.click('#x_wmode [data-v="unknown"]');
    t.expect(!q$('#x_reached') && q$('#x_wUnknown').textContent.indexOf('두 곳 이상') >= 0, '조건 전에는 세 칸이 없음');
    await t.click('#x_cmp [data-v="right"]');
    await t.click('[data-xa="wrap"]');
    t.expect(q$('#x_e_wrap').textContent.indexOf('아직 모름') >= 0, '못 보냄');
    t.expect(!dbq(t, 101).resolve_requested_at, '보내지지 않음');
    await t.click('#x_st_find [data-xa="peek"][data-k="find"]');
    await t.click('#x_st_find [data-xa="edit"]');
    await t.type('#x_fsrc', '과학관 누리집');
    await t.type('#x_find', '정류자가 반 바퀴마다 코일에 흐르는 전류의 방향을 바꿔 준다.');
    await t.click('#x_same [data-v="달라요"]');
    await t.type('#x_samewhy', '누리집은 정류자 이야기를 더 했어요');
    await t.click('[data-xa="find"]');
    await t.waitFor(() => dbq(t, 101).journal.find.length === 2);
    await t.waitFor(() => q$('#x_st_wrap.cur'));
    await t.click('#x_wmode [data-v="unknown"]');
    await t.waitFor('#x_reached');
    await t.click('#x_cmp [data-v="changed"]');
    await t.type('#x_changed', '정류자 이야기를 읽고');
    await t.type('#x_reached', '정류자가 전류의 방향을 바꿔 준다는 것을 과학관 누리집에서 찾았다.');
    await t.type('#x_stuckq', '정류자는 어떻게 전류의 방향을 바꿀까');
    await t.click('[data-xa="wrap"]');
    t.expect(q$('#x_e_wrap').textContent.indexOf('왜 막혔') >= 0, '까닭 칩');
    await t.click('#x_why button');
    await t.click('[data-xa="wrap"]');
    await t.waitFor(() => dbq(t, 101).resolve_requested_at);
    const child = await t.waitFor(() => t.db.questions.find(x => x.parent_id === 101 && x.journal && x.journal.flag));
    t.eq([child.text, child.journal.flag.step, child.unit], ['정류자는 어떻게 전류의 방향을 바꿀까', 'find', '전동기'], '막힌 곳이 새 질문 + 막힘 표시');
    t.eq(dbq(t, 101).journal.wrap.mode, 'unknown', '아직 모름으로 보냄');
    await t.waitFor(() => t.$$('#body .qcard').some(b => b.dataset.id === String(child.id) && b.textContent.indexOf('막힘 표시') >= 0));
  });

  add('탐구 · 선생님 글이 달리면 다듬기 먼저·되돌아온 칸부터', async t => {
    await openQ(t, 108);
    t.expect(q$('#x_st_refine.cur'), '다듬기가 지금 칸');
    t.expect(q$('#x_st_refine .tchbox').textContent.indexOf('어떤 별을') >= 0, '선생님 글');
    t.expect(!q$('[data-xa="refineSkip"]'), '그대로 갈래요가 없음');
    await t.waitFor(() => dbq(t, 108).fb_unread === false);
    await t.type('#x_refine', '별은 왜 반짝거릴까?');
    await t.click('[data-xa="refine"]');
    t.expect(q$('#x_e_refine').textContent.indexOf('거의 같아요') >= 0, '처음 질문과 85% 넘게 같으면 못 냄');
    await t.type('#x_refine', '별은 왜 반짝거릴까요?');
    await t.click('[data-xa="refine"]');
    t.expect(q$('#x_e_refine').textContent.indexOf('거의 같아요') >= 0, '끝에 「요」만 붙여도 못 냄');
    t.expect(!dbq(t, 108).refined_text, '저장 안 됨');
    await t.type('#x_refine', '밤하늘에서 밝은 별과 어두운 별 중 어느 쪽이 더 반짝여 보일까?');
    await t.click('[data-xa="refine"]');
    await t.waitFor(() => dbq(t, 108).refined_text);
    await t.waitFor(() => VV(108).cur === 'predict' && q$('#x_st_refine .tchbox.done'));
    t.eq(q$('#sheet .sh-top .qt').textContent, '밤하늘에서 밝은 별과 어두운 별 중 어느 쪽이 더 반짝여 보일까?', '다듬은 질문이 제목');
    await t.loginAs('B');
    await openQ(t, 122);
    t.expect(q$('#x_st_find.cur') && q$('#x_st_find .tchbox').textContent.indexOf('한 곳뿐') >= 0, '되돌아온 칸과 선생님 글');
    t.expect(t.$$('#body .qcard').find(b => b.dataset.id === '122').textContent.indexOf('되돌아옴') >= 0, '카드 표시');
    await t.type('#x_fsrc', '과학관 누리집');
    await t.type('#x_find', '전압이 같을 때 저항이 두 배가 되면 전류는 절반으로 줄어든다.');
    await t.click('#x_same [data-v="같아요"]');
    await t.click('[data-xa="find"]');
    await t.waitFor(() => VV(122).returnedFixed && q$('#x_st_wrap.cur'));
    t.eq(q$('#x_wrap').value, '저항은 전류의 흐름을 방해해서 저항이 크면 전류가 작아진다.', '보냈던 정리를 다시 보냄');
  });

  add('탐구 · 옛 과수원에서 쓴 글이 보이고 이어서 보냄', async t => {
    await openQ(t, 105);
    t.expect(q$('#sheet').textContent.indexOf('옛 과수원에서 쓴 글') >= 0, '옛 글 표시');
    await t.click('#x_st_predict [data-xa="peek"][data-k="predict"]');
    t.expect(q$('#x_st_predict').textContent.indexOf('건전지 두 개가 함께 밀어 주니까') >= 0, '옛 예상(guess+why)');
    t.eq(VV(105).cur, 'wrap', '보내기 전');
    t.eq(q$('#x_wrap').value, '건전지를 직렬로 연결하면 전압이 커져서 전구에 흐르는 전류가 세지고 더 밝아진다.', '옛 정리를 이어서');
    await t.click('#x_cmp [data-v="right"]');
    await t.click('[data-xa="wrap"]');
    await t.waitFor(() => dbq(t, 105).resolve_requested_at);
    t.eq(dbq(t, 105).journal.wrap.text, '건전지를 직렬로 연결하면 전압이 커져서 전구에 흐르는 전류가 세지고 더 밝아진다.', '정리 저장');
    t.eq(dbq(t, 105).solve.guess, '전구가 더 밝아질 것 같다', '옛 solve 는 그대로');
  });

  add('탐구 · 쓰던 글은 닫았다 열어도 남고, 저장하면 지워짐', async t => {
    await openQ(t, 101);
    await t.type('#x_predict', '정류자가 방향을 바꿔 줄 것 같다. 왜냐하면 반 바퀴마다 힘이 바뀌니까.');
    ui.sheet.close(true);
    await openQ(t, 101);
    await t.waitFor(() => q$('#x_predict') && /정류자가 방향을/.test(q$('#x_predict').value));
    await t.click('[data-xa="predict"]');
    await t.waitFor(() => (dbq(t, 101).journal || {}).predict);
    let left = null; try{ left = localStorage.getItem('qo2-draft-' + t.state.me.id + '-101-x_predict'); }catch(_){}
    t.eq(left, null, '저장하면 쓰던 글은 지움');
  });
  add('탐구 · 답만 달기(답과 출처만 보내면 선생님 확인 대기)', async t => {
    await openQ(t, 101);
    await t.click('#sheet [data-xa="qmode"][data-m="quick"]');
    await t.waitFor('#x_qans');
    t.expect(!q$('#x_st_predict'), '일지 칸이 숨음');
    await t.type('#x_qans', '정류자가 반 바퀴마다 전류 방향을 바꿔 줘서 같은 쪽으로 계속 돈다.');
    await t.click('#sheet [data-xa="quick"]');
    t.expect(/골라/.test(q$('#x_e_quick').textContent), '출처를 안 고르면 막힘');
    await t.click('#x_qsrc [data-v="교과서"]');
    await t.type('#x_qsrcd', '120쪽');
    await t.click('#sheet [data-xa="quick"]');
    await t.waitFor(() => dbq(t, 101).resolve_requested_at);
    const w = dbq(t, 101).journal.wrap;
    t.eq([w.mode, w.cmp, w.changedBy], ['known', 'quick', '교과서 · 120쪽'], '답만 달기 표시');
    await t.waitFor(() => VV(101).status === 'wait');
  });
  add('탐구 · 친구에게 SOS(한 번에, 한 줄은 안 써도 됨)', async t => {
    await openQ(t, 102);
    await t.click('#sheet [data-xa="sosOpen"]');
    await t.click(await t.waitFor('#sheet [data-xa="sosSend"]'));
    await t.waitFor(() => (dbq(t, 102).journal || {}).flag);
    t.eq(dbq(t, 102).journal.flag.step, 'find', '지금 칸(찾기)에 SOS');
    await t.click(await t.waitFor('#sheet .x-sos [data-xa="unflag"]'));
    await t.waitFor(() => !(dbq(t, 102).journal || {}).flag);
  });

  add('탐구 · 단서 뒤 칸을 안 고치면 고마움 막힘, 고친 뒤 열림', async t => {
    await openQ(t, 102);
    const box = await t.waitFor('#x_clue_501');
    t.expect(box.textContent.indexOf('이 단서를 보고 그 칸을 적거나 고친 뒤에 보낼 수 있어요') >= 0, '안내');
    t.expect(!box.querySelector('[data-xa="thxYes"]'), '고마움 단추 없음');
    t.expect(box.compareDocumentPosition(q$('#x_fsrc')) & Node.DOCUMENT_POSITION_FOLLOWING, '단서는 입력칸 위');
    await t.rejects(t.api.thankClue(501, '쪽수를 알았어요'), '이 단서를 보고 그 칸을 적거나 고친 뒤에 보낼 수 있어요');
    await t.type('#x_fsrc', '교과서 112쪽');
    await t.type('#x_find', '습도가 낮으면 물체에 생긴 전기가 공기 중으로 잘 빠져나가지 못한다.');
    await t.click('[data-xa="find"]');
    await t.click(await t.waitFor('#x_clue_501 [data-xa="thxYes"]'));
    await t.type(await t.waitFor('#x_thx_501'), '찾아봄');
    await t.click('#x_clue_501 [data-xa="thxSend"]');
    t.expect(q$('#x_e_thx501').textContent.length > 0, '짧으면 막힘');
    await t.type('#x_thx_501', '교과서 쪽수를 알고 바로 찾았어요');
    await t.click('#x_clue_501 [data-xa="thxSend"]');
    await t.waitFor(() => t.db.clues.find(c => c.id === 501).thanked_at);
    t.eq(t.db.clues.find(c => c.id === 501).thanks_text, '교과서 쪽수를 알고 바로 찾았어요', '덕분에 __');
    t.eq(t.db.flowers.filter(f => f.receiver === 'u-B').length, 1, '나래에게 꽃');
    await t.waitFor(() => !q$('#x_clue_501'));
    await t.loginAs('B');
    await openQ(t, 121);
    t.expect(q$('#x_clue_502') && !q$('#x_clue_502 [data-xa="thxNo"]'), '방법 칸 단서(아직 못 보냄)');
    await t.click('#x_mkind [data-v="book"]');
    await t.click('[data-xa="method"]');
    await t.click(await t.waitFor('#x_clue_502 [data-xa="thxNo"]'));
    await t.waitFor(() => t.db.clues.find(c => c.id === 502).declined_at);
    await t.waitFor(() => !q$('#x_clue_502'));
  });

  add('탐구 · 막힘 표시 세우기와 넓히기(열매에 새싹)', async t => {
    await openQ(t, 101);
    await t.click('#x_st_predict [data-xa="flagOpen"]');
    await t.type(await t.waitFor('#x_tried'), '무엇부터 생각해야 할지 모르겠어요');
    await t.click('[data-xa="flag"]');
    await t.waitFor(() => (dbq(t, 101).journal || {}).flag);
    t.eq(dbq(t, 101).journal.flag.step, 'predict', '막힘 표시');
    await t.waitFor(() => q$('#x_st_predict .flagbox'));
    await openQ(t, 109);
    t.expect(q$('#sheet .statusbar.fruit') && !q$('#x_st_predict'), '옛 수확 열매는 일지 칸 없이');
    await t.click('#x_st_extend [data-xa="edit"]');
    await t.type('#x_extend', '겨울에 문고리를 잡을 때 따끔한 것도 정전기 때문이다.');
    await t.click('[data-xa="extend"]');
    await t.waitFor(() => (dbq(t, 109).journal || {}).extend);
    await t.waitFor(() => VV(109).sprout && q$('#sheet .statusbar.fruit').textContent.indexOf('새싹') >= 0);
  });

  add('탐구 · 되돌림 뒤 다시 보낸 「아직 모름」은 막힌 곳 질문을 하나만 남김', async t => {
    await setup(t, 101, [{predict_add:'자석이 코일을 밀어서 도는 것 같다. 왜냐하면 자석 가까이 있으니까.'}, {method:{kind:'book', plan:''}},
      {find_add:{src:'교과서 130쪽', text:'전동기 속 코일에 전류가 흐르면 자석에게 힘을 받아 돈다.', ai:false}},
      {find_add:{src:'과학관 누리집', text:'정류자가 반 바퀴마다 코일에 흐르는 전류의 방향을 바꿔 준다.', ai:false}, same:'같아요'},
      {wrap:{mode:'unknown', reached:'정류자가 전류 방향을 바꾼다는 것을 누리집에서 찾았다.', stuckQ:'전동기는 왜 도나요?', why:'용어가 어려움', cmp:'right', changedBy:''}}]);
    const kid = await t.api.plantQuestion({text:'전동기는 왜 도나요?', parent_id:101});
    QO.store.upsertQuestion(await t.api.saveJournal(kid.id, {flag:{step:'find', tried:'정류자가 전류 방향을 바꾼다는 것을 누리집에서 찾았다.'}}));
    QO.store.upsertQuestion(kid);
    t.as('T'); await t.api.returnFruit(101, 'wrap', '막힌 곳을 처음 질문보다 좁게, 질문 꼴로 다시 적어 볼까요?'); t.as('A');
    await QO.store.refreshQuestions();
    await openQ(t, 101);
    await t.waitFor('#x_st_wrap.cur #x_stuckq');
    t.eq(q$('#x_stuckq').value, '전동기는 왜 도나요?', '보냈던 막힌 곳');
    await t.type('#x_stuckq', '정류자는 어떻게 반 바퀴마다 전류의 방향을 바꿀까?');
    await t.click('[data-xa="wrap"]');
    await t.waitFor(() => t.db.questions.find(x => x.parent_id === 101 && x.text.indexOf('정류자는') === 0 && x.journal && x.journal.flag));
    const kids = t.db.questions.filter(x => x.parent_id === 101);
    t.eq(kids.filter(x => x.journal && x.journal.flag).map(x => x.text), ['정류자는 어떻게 반 바퀴마다 전류의 방향을 바꿀까?'], '막힘 표시 선 막힌 곳 질문은 하나');
    t.expect(kids.some(x => x.id === kid.id), '옛 막힌 곳 질문은 지우지 않음');
    await t.waitFor(() => dbq(t, 101).resolve_requested_at);
  });
}
})();
