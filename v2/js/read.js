/* 책 보며 심기 — 학생이 종이 책·읽기자료를 직접 읽다가 갸우뚱한 곳·중요해 보인 곳·모르는 낱말에서 질문을 심는다(2026-11-10).
   · 본문은 앱에 넣지 않는다. 앱에는 네 칸(어디 · 책에 나온 것 · 내 생각 · 질문)만.
   · 네 칸은 심을 때 questions.journal.read 에 함께 들어간다(v2_07). 모르는 낱말의 찾은 뜻은 탐구 일지 「찾기」 칸에서 save_read_found.
   · 선생님 읽기자료 = lesson_materials.reading 이 있는 자료 {unit:'para'|'page', need:['says','think']}.
     교과서·그 밖에(학생 책)는 쪽, 읽기자료는 문단(선생님이 page 로 올리면 쪽). need 는 그 자료로 심을 때 꼭 쓸 칸.
   · 근거: 선도교원 연수 「학생 질문 중심 독서 수업 설계」 p.9·p.19·p.23·p.24(직접 정보 / 추론 / 추가 탐구 필요, 밑줄·중요한 문장 표시, 문장틀).
   read = {src:'book'|'mat'|'etc', mat_id, mat, loc, unit:'page'|'para', kind:1|2|3, word, guess, says, think, found, found_at} */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const KIND = {1:'갸우뚱', 2:'중요해 보임', 3:'모르는 낱말'};
const KIND_BTN = {1:'갸우뚱했어', 2:'중요해 보였어', 3:'모르는 낱말이야'};
const THINK_PH = {
  0:'그래서 나는 ~라고 생각해 / ~일 것 같아',
  1:'뭐가 이상했어? 나는 원래 ~라고 생각했어',
  2:'왜 중요해 보였어? 그래서 나는 ~라고 생각해',
  3:'그래서 나는 ~라고 생각해 / ~일 것 같아'};
const STEMS = ['왜 ~일까?', '어떤 조건에서 ~일까?', '~하면 어떻게 될까?'];
const LIM = {etc:40, loc:10, word:30, guess:100, says:300, think:300, found:200};
const BOOK = '<svg class="rd-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5c3-1.3 6-1.3 10 1 4-2.3 7-2.3 10-1v14c-3-1.3-6-1.3-10 1-4-2.3-7-2.3-10-1z"/><path d="M12 6v14"/></svg>';
const R = {on:false, src:'book', mat:null, kind:0, f:{}, err:''};
const clen = s => Array.from(String(s || '').trim()).length;
const cut = (s, n) => Array.from(String(s || '').trim()).slice(0, n).join('');

/* ── 읽기자료·위치 단위 ── */
function mats(){ const M = QO.materials && QO.materials._m; return ((M && M.list) || []).filter(m => m && m.reading && typeof m.reading === 'object'); }
function unitOf(){ return R.src === 'mat' && R.mat && (R.mat.reading || {}).unit !== 'page' ? 'para' : 'page'; }
function needOf(){ const n = R.src === 'mat' && R.mat ? (R.mat.reading || {}).need : null; return Array.isArray(n) ? n : []; }
function locWord(unit){ return unit === 'para' ? '문단' : '쪽'; }
function whereText(r){
  const name = r.src === 'book' ? '교과서' : (r.mat || '읽은 글');
  return name + (r.loc ? ' · ' + r.loc + locWord(r.unit) : '');
}

/* ── 탐구 탭 문 ── */
function entryHTML(){
  return '<button type="button" class="rd-entry" data-rd="open">' + BOOK + '<span><b>책 보며 심기</b><small>읽다가 갸우뚱한 곳, 중요해 보인 곳에서</small></span></button>';
}

/* ── 심기 화면 ── */
function sync(){
  ['etc', 'loc', 'word', 'guess', 'says', 'think', 'q'].forEach(k => { const el = document.getElementById('x_rd' + k); if(el) R.f[k] = el.value; });
}
function val(k){ return String(R.f[k] || '').trim(); }
function viewHTML(){
  const list = mats(), unit = unitOf(), need = needOf();
  const chip = (src, id, label) => {
    const on = R.src === src && (src !== 'mat' || (R.mat && R.mat.id === id));
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-rd="src" data-src="' + src + '"' + (id != null ? ' data-id="' + id + '"' : '') + ' aria-pressed="' + on + '">' + esc(label) + '</button>';
  };
  const tag = k => need.indexOf(k) >= 0 ? '<span class="rd-need">오늘은 꼭</span>' : '<span class="rd-opt">고르기</span>';
  const input = (k, ph, extra) => '<input class="inp" id="x_rd' + k + '" maxlength="' + LIM[k] + '" autocomplete="off" placeholder="' + esc(ph) + '" value="' + esc(R.f[k] || '') + '"' + (extra || '') + '>';
  const area = (k, ph) => '<textarea class="inp" id="x_rd' + k + '" rows="2" maxlength="' + LIM[k] + '" placeholder="' + esc(ph) + '">' + esc(R.f[k] || '') + '</textarea>';
  let h = '<div class="qm-head"><h2>책 보며 심기</h2><button type="button" class="qm-x" data-rd="close" aria-label="닫기"></button></div><div class="qm-scroll rd-scroll">';
  h += '<p class="hint">읽다가 갸우뚱한 곳, 중요해 보인 곳, 모르는 낱말을 찾아요. 책에 연필로 표시해 두면 다시 찾기 쉬워요.</p>';
  /* 1 어디 */
  h += '<div class="rd-step"><div class="rd-tt"><span class="rd-no">1</span>어디였어?<span class="rd-need">꼭</span></div><div class="card">' +
    '<div class="chips" role="group" aria-label="무엇을 읽었나요?">' + list.map(m => chip('mat', m.id, cut(m.title || '읽기자료', 16) + (Array.from(m.title || '').length > 16 ? '…' : ''))).join('') +
    chip('book', null, '교과서') + chip('etc', null, '그 밖에') + '</div>' +
    (R.src === 'etc' ? '<div class="rd-gap">' + input('etc', '무엇을 읽었어? (책 이름 등)') + '</div>' : '') +
    '<div class="rd-lbl">어떤 곳이야?</div><div class="chips" role="group" aria-label="어떤 곳인가요?">' +
    [1, 2, 3].map(k => '<button type="button" class="chip rd-k' + k + (R.kind === k ? ' on' : '') + '" data-rd="kind" data-k="' + k + '" aria-pressed="' + (R.kind === k) + '">' + KIND_BTN[k] + '</button>').join('') + '</div>' +
    '<div class="rd-mini">' + input('loc', locWord(unit), ' inputmode="numeric" aria-label="' + locWord(unit) + '"') + input('word', '그 부분의 낱말 한두 개', ' aria-label="그 부분의 낱말"') + '</div>' +
    (R.kind === 3 ? '<div class="rd-guess"><p class="hint">앞뒤 문장을 다시 읽고 뜻을 짐작해 봐요. 틀려도 괜찮아요. 찾은 뜻은 탐구 일지 「찾기」 칸에서 적어요.</p>' + input('guess', '내 짐작: 아마 ~라는 뜻 같아', ' aria-label="내 짐작"') + '</div>' : '') +
    '</div></div>';
  /* 2 책에 나온 것 · 3 내 생각 */
  h += '<div class="rd-step"><div class="rd-tt"><span class="rd-no">2</span>책에 나온 것' + tag('says') + '</div><div class="card">' + area('says', '책이 뭐라고 했는지 내 말로 한 줄') +
    '<p class="rd-under">책 문장을 그대로 옮기지 말고, 친구한테 말해 주듯이.</p></div></div>';
  h += '<div class="rd-step"><div class="rd-tt"><span class="rd-no">3</span>내 생각' + tag('think') + '</div><div class="card">' + area('think', THINK_PH[R.kind || 0]) +
    '<p class="rd-under">책에는 없는데 내가 짐작한 것, 예전에 본 것과 이어지는 것.</p></div></div>';
  /* 4 질문 */
  const w = val('word');
  h += '<div class="rd-step"><div class="rd-tt"><span class="rd-no">4</span>아직 모르는 것을 질문으로<span class="rd-need">꼭</span></div><div class="card">' + area('q', '궁금한 걸 질문으로') +
    '<div class="rd-stems">' + STEMS.map(s => '<button type="button" data-rd="stem" data-s="' + esc(s) + '">' + esc(s) + '</button>').join('') +
    (R.kind === 3 && w ? '<button type="button" class="w" data-rd="wordstem">「' + esc(cut(w, 12)) + '」에서 시작</button>' : '') + '</div></div></div>';
  h += '<div class="err" id="x_e_rd" role="alert">' + esc(R.err || '') + '</div></div>';
  h += '<div class="qm-plant rd-foot"><button type="button" class="btn wide" data-rd="plant">심기</button></div>';
  return h;
}
function paint(focusId){
  const el = document.getElementById('rd-view'); if(!el) return;
  const sc = el.querySelector('.rd-scroll'), keep = sc ? sc.scrollTop : 0;
  el.innerHTML = viewHTML();
  const sc2 = el.querySelector('.rd-scroll'); if(sc2) sc2.scrollTop = keep;
  if(focusId){ const f = document.getElementById(focusId); if(f) try{ f.focus(); }catch(_){} }
}
function open(matId){
  if(QO.materials && QO.materials.close) QO.materials.close();
  R.on = true; R.err = ''; R.f = {}; R.kind = 0;
  const m = matId != null ? mats().find(x => x.id === Number(matId)) : null;
  R.src = m ? 'mat' : 'book'; R.mat = m || null;
  let el = document.getElementById('rd-view');
  if(!el){ el = document.createElement('section'); el.id = 'rd-view'; el.className = 'qm-view rd-view'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '책 보며 심기'); document.getElementById('app').appendChild(el); }
  el.hidden = false; document.documentElement.classList.add('qm-on');
  paint();
}
function close(){
  const el = document.getElementById('rd-view'); if(el){ el.hidden = true; el.innerHTML = ''; }
  if(R.on) document.documentElement.classList.remove('qm-on');
  R.on = false;
}
function setErr(m, focusId){ R.err = m || ''; const e = document.getElementById('x_e_rd'); if(e) e.textContent = R.err; if(focusId){ const f = document.getElementById(focusId); if(f) f.focus(); } }

async function plant(btn){
  sync(); setErr('');
  /* 깨진 한글 입력은 심기 전에(질문 → 책에 나온 것 → 내 생각 → 짐작 순) */
  for(const k of ['q', 'says', 'think', 'guess', 'word', 'etc']){
    const el = document.getElementById('x_rd' + k);
    if(el && el.value.trim() && QO.ime && QO.ime.ask(el)) return setErr('글자가 영어로 쳐진 것 같아요. 아래에서 골라 주세요.');
  }
  const need = needOf();
  if(!R.kind) return setErr('어떤 곳인지 하나 골라요. 갸우뚱했어, 중요해 보였어, 모르는 낱말이야 가운데서요.');
  if(R.src === 'etc' && clen(val('etc')) < 2) return setErr('무엇을 읽었는지 적어요.', 'x_rdetc');
  if(!val('loc') && !val('word')) return setErr(locWord(unitOf()) + '이나 그 부분의 낱말을 적어요.', 'x_rdloc');
  if(R.kind === 3 && clen(val('word')) < 1) return setErr('모르는 낱말을 적어요.', 'x_rdword');
  if(need.indexOf('says') >= 0 && clen(val('says')) < 5) return setErr('오늘은 「책에 나온 것」도 꼭 써요. 책이 한 말을 내 말로 한 줄.', 'x_rdsays');
  if(need.indexOf('think') >= 0 && clen(val('think')) < 5) return setErr('오늘은 「내 생각」도 꼭 써요. 한 줄이면 돼요.', 'x_rdthink');
  const q = val('q');
  if(/~/.test(q)) return setErr('「~」 자리에 내 말을 넣어 질문을 마무리해요.', 'x_rdq');
  if(clen(q) < 5) return setErr('질문을 한 마디만 더 붙여 볼까요? 다섯 글자 넘게 적어요.', 'x_rdq');
  const jw = QO.check.junkWhy(q); if(jw) return setErr(jw, 'x_rdq');
  const dup = (QO.state.questions || []).slice(0, 60).find(x => x && (QO.check.similar(q, x.text) >= 0.85 || (x.refined_text && QO.check.similar(q, x.refined_text) >= 0.85)));
  if(dup) return setErr('비슷한 질문 「' + cut(dup.refined_text || dup.text, 24) + '」을 이미 심었어요. 다른 질문이면 조금 더 구체적으로 적어 주세요.', 'x_rdq');
  const read = {src:R.src, unit:unitOf(), kind:R.kind,
    loc:cut(val('loc'), LIM.loc), word:cut(val('word'), LIM.word),
    guess:R.kind === 3 ? cut(val('guess'), LIM.guess) : '',
    says:cut(val('says'), LIM.says), think:cut(val('think'), LIM.think)};
  if(R.src === 'mat' && R.mat){ read.mat_id = R.mat.id; read.mat = cut(R.mat.title || '읽기자료', 60); }
  if(R.src === 'etc') read.mat = cut(val('etc'), LIM.etc);
  const input = {text:q, read:read, phase:'before'};
  if(R.src === 'mat' && R.mat){ input.material_id = R.mat.id; if(R.mat.unit) input.unit = R.mat.unit; }
  const errEl = document.getElementById('x_e_rd');
  const row = await U.busy(btn, async () => { const r = await QO.api.plantQuestion(input); QO.store.upsertQuestion(r); await QO.store.refreshQuestion(r.id); return r; }, {errEl:errEl});
  if(!row) return;
  const got = (await QO.acorn('plant', row.id)) + (read.mat_id ? await QO.acorn('material', row.id) : 0);
  close();
  U.toast('🌱 책 보며 질문을 심었어요' + (got ? ' · 🌰 +' + got : '') + '.');
  if(QO.explore && QO.explore.open) QO.explore.open(row.id);
}

/* ── 탐구 일지: 읽은 곳 상자 · 찾기 칸의 찾은 뜻 ── */
function readOf(qid){ const q = QO.store.question(qid); return q && q.journal && q.journal.read && typeof q.journal.read === 'object' ? q.journal.read : null; }
function boxHTML(qid){
  const r = readOf(qid); if(!r) return '';
  const k = Number(r.kind) || 0;
  let h = '<div class="rd-box"><div class="rd-bh">' + BOOK + '<b class="rd-bl">읽은 곳</b><span>' + esc(whereText(r)) + '</span></div>';
  if(r.word || k) h += '<div class="rd-br"><b>고른 곳</b>' + (k ? '<span class="rd-kind rd-k' + k + '">' + KIND[k] + '</span>' : '') + '<span class="rd-word">' + esc(r.word || '') + '</span>' +
    (k === 3 ? (r.guess ? '<div class="rd-gs">내 짐작 · ' + esc(r.guess) + '</div>' : '') +
      (r.found ? '<div class="rd-fd">찾은 뜻 · ' + esc(r.found) + '</div>' : '<div class="rd-later">찾은 뜻은 「찾기」 칸에서 적어요</div>') : '') + '</div>';
  if(r.says) h += '<div class="rd-br"><b>책에 나온 것</b>' + esc(r.says) + '</div>';
  if(r.think) h += '<div class="rd-br"><b>내 생각</b>' + esc(r.think) + '</div>';
  return h + '</div>';
}
function findHTML(qid){
  const r = readOf(qid); if(!r || Number(r.kind) !== 3 || r.found) return '';
  return '<div class="rd-found"><label for="x_rdfound">모르는 낱말 「' + esc(r.word || '') + '」 뜻을 찾았어?</label>' +
    (r.guess ? '<div class="hint">내 짐작 · ' + esc(r.guess) + '</div>' : '') +
    '<div class="row"><input class="inp" id="x_rdfound" maxlength="' + LIM.found + '" autocomplete="off" placeholder="찾은 뜻을 내 말로">' +
    '<button type="button" class="btn sm" data-rd="found" data-id="' + qid + '">적기</button></div><div class="err" id="x_e_rdfound" role="alert"></div></div>';
}
async function saveFound(btn){
  const qid = Number(btn.dataset.id), inp = document.getElementById('x_rdfound'), err = document.getElementById('x_e_rdfound');
  if(!inp) return;
  if(err) err.textContent = '';
  if(QO.ime && QO.ime.ask(inp)){ if(err) err.textContent = '글자가 영어로 쳐진 것 같아요. 아래에서 골라 주세요.'; return; }
  const t = inp.value.trim();
  if(clen(t) < 2){ if(err) err.textContent = '찾은 뜻을 두 글자 넘게 적어요.'; inp.focus(); return; }
  const res = await U.busy(btn, () => QO.api.saveReadFound(qid, t), {errEl:err});
  if(!res) return;
  const q = QO.store.question(qid);
  if(q) QO.store.upsertQuestion({id:qid, journal:Object.assign({}, q.journal || {}, {read:res})});
  U.toast('찾은 뜻을 적었어요. 내 짐작과 견줘 봐요.');
}

/* ── 눌림 ── */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rd]'); if(!b) return;
  const k = b.dataset.rd;
  if(k === 'open') open(b.dataset.mat != null ? b.dataset.mat : null);
  else if(k === 'close') close();
  else if(k === 'src'){ sync(); R.src = b.dataset.src; R.mat = R.src === 'mat' ? mats().find(m => m.id === Number(b.dataset.id)) || null : null; R.err = ''; paint(); }
  else if(k === 'kind'){ sync(); R.kind = Number(b.dataset.k); R.err = ''; paint(R.kind === 3 && !val('word') ? 'x_rdword' : null); }
  else if(k === 'stem' || k === 'wordstem'){
    sync();
    const q = document.getElementById('x_rdq'); if(!q) return;
    if(!q.value.trim()) q.value = k === 'stem' ? b.dataset.s : val('word') + '은(는) ';
    q.focus();
    const i = q.value.indexOf('~'); if(i >= 0) q.setSelectionRange(i, i + 1); else q.setSelectionRange(q.value.length, q.value.length);
  }
  else if(k === 'plant') plant(b);
  else if(k === 'found') saveFound(b);
});
document.addEventListener('input', e => {
  if(R.on && e.target && e.target.id === 'x_rdword' && R.kind === 3){
    sync();
    const box = document.querySelector('#rd-view .rd-stems'); if(!box) return;
    let w = box.querySelector('[data-rd="wordstem"]'), word = val('word');
    if(!word){ if(w) w.remove(); return; }
    if(!w){ w = document.createElement('button'); w.type = 'button'; w.className = 'w'; w.dataset.rd = 'wordstem'; box.appendChild(w); }
    w.textContent = '「' + cut(word, 12) + '」에서 시작';
  }
});
document.addEventListener('keydown', e => {
  if(R.on && e.key === 'Escape'){ close(); return; }
  if(e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && e.target && e.target.id === 'x_rdfound'){
    e.preventDefault(); const b = document.querySelector('[data-rd="found"]'); if(b) b.click();
  }
});
QO.bus.on('ready', () => close());
QO.bus.on('tab:show', id => { if(id !== 'explore') close(); });

QO.read = {entryHTML, open, close, boxHTML, findHTML, readOf, whereText, KIND, _r:R};

/* ── 스스로 시험 ── */
if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('탐구 · 책 보며 심기(읽기자료·네 칸·필수 칸·찾은 뜻)', async t => {
  await t.click('#nav [data-t="explore"]');
  await t.waitFor('#body [data-rd="open"]');
  /* 선생님 읽기자료에서 열기 — 그 자료가 골라진 채, 위치는 문단 */
  await t.waitFor('#body .qm-row[data-mat="9004"]');
  await t.click('#body .qm-row[data-mat="9004"]');
  await t.waitFor('#rd-view:not([hidden]) #x_rdq');
  t.expect(t.$('#rd-view [data-rd="src"][data-src="mat"].on'), '읽기자료가 골라짐');
  t.eq(t.$('#x_rdloc').placeholder, '문단', '읽기자료 위치는 문단');
  await t.click('#rd-view [data-rd="plant"]');
  t.expect(/어떤 곳인지/.test(t.$('#x_e_rd').textContent), '종류를 안 고르면 막음');
  await t.click('#rd-view [data-rd="kind"][data-k="3"]');
  await t.waitFor('#x_rdguess');
  await t.type('#x_rdloc', '3');
  await t.type('#x_rdword', '겉보기 등급');
  await t.waitFor('#rd-view [data-rd="wordstem"]');
  await t.type('#x_rdguess', '눈으로 본 밝기 순위');
  await t.click('#rd-view [data-rd="stem"]');
  t.eq(t.$('#x_rdq').value, '왜 ~일까?', '문장틀이 들어감');
  await t.click('#rd-view [data-rd="plant"]');
  t.expect(/「책에 나온 것」/.test(t.$('#x_e_rd').textContent), '이 자료는 「책에 나온 것」이 꼭 — 막음');
  await t.type('#x_rdsays', '숫자가 작을수록 밝게 보이는 별이다.');
  await t.click('#rd-view [data-rd="plant"]');
  t.expect(/~/.test(t.$('#x_e_rd').textContent), '「~」 남으면 막음');
  await t.type('#x_rdq', '왜 등급 숫자가 작을수록 더 밝은 별일까?');
  const n0 = t.db.questions.length;
  await t.click('#rd-view [data-rd="plant"]');
  await t.waitFor(() => t.db.questions.length === n0 + 1);
  const q = t.db.questions.slice().sort((a, b) => b.id - a.id)[0];
  const r = (q.journal || {}).read || {};
  t.eq([q.material_id, r.src, r.mat_id, r.unit, r.kind, r.loc, r.word, r.guess], [9004, 'mat', 9004, 'para', 3, '3', '겉보기 등급', '눈으로 본 밝기 순위'], '네 칸이 journal.read 로');
  t.expect(r.says === '숫자가 작을수록 밝게 보이는 별이다.' && !r.think, '책에 나온 것만 씀');
  await t.waitFor(() => t.$('#rd-view') && t.$('#rd-view').hidden);
  /* 일지: 읽은 곳 상자 · 찾기 칸에서 찾은 뜻 */
  await t.waitFor('.rd-box');
  t.expect(/별빛은 얼마나 먼 길을 왔을까.* · 3문단/.test(t.$('.rd-box .rd-bh').textContent), '읽은 곳 표시: ' + t.$('.rd-box .rd-bh').textContent);
  t.expect(/찾기」 칸에서/.test(t.$('.rd-box').textContent), '찾은 뜻은 아직');
  await t.waitFor('#x_rdfound');
  await t.type('#x_rdfound', '지구에서 눈으로 본 별의 밝기를 등급으로 나타낸 것');
  await t.click('[data-rd="found"]');
  await t.waitFor(() => ((t.db.questions.find(x => x.id === q.id).journal || {}).read || {}).found);
  await t.waitFor(() => /찾은 뜻 · 지구에서/.test((t.$('.rd-box') || {}).textContent || ''));
  t.expect(!t.$('#x_rdfound'), '찾은 뒤 입력칸 사라짐');
  /* 교과서는 쪽, 필수 칸 없음 */
  if(t.$('[data-xa="close"]')) await t.click('[data-xa="close"]');
  await t.click('#body [data-rd="open"]');
  await t.waitFor('#rd-view:not([hidden]) #x_rdq');
  t.expect(t.$('#rd-view [data-rd="src"][data-src="book"].on') && t.$('#x_rdloc').placeholder === '쪽', '교과서 · 쪽');
  await t.click('#rd-view [data-rd="kind"][data-k="1"]');
  t.expect(/이상했어/.test(t.$('#x_rdthink').placeholder), '갸우뚱이면 내 생각 안내가 바뀜');
  await t.click('#rd-view [data-rd="close"]');
  t.expect(t.$('#rd-view').hidden, '닫힘');
});
})();
