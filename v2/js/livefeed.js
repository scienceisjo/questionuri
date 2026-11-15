/* 실시간 올라온 글(2026-11-15, 사용자 「애들이 중간중간 올리는 거 다 확인하고 싶은데 대시보드는 정적 — 질문과수원 맵 안에서
   교사로 로그인하면 올라올 때마다 바로 뜨게, 전자칠판에서 다 같이 보게」).
   선생님 숲 방문(QO.state.visit)으로 「우리 반 숲」을 보고 있으면 몇 초마다 그 반에서 올라온 것을 읽어 옆 목록에 쌓는다.
   새 카드는 잠깐 빛나고, 카드를 누르면 칠판 가운데에 크게 띄운다(다 같이 보기).
   정한 것(사용자): 이름 없이 · 쌓이고 고른 것만 크게 · 새 질문 / 일지 칸 씀·고침 / 선생님께 보냄·막힘 SOS(+친구 단서).
   이름·번호는 서버가 아예 안 보낸다. 익명 질문은 안 나온다. 서버 teacher_class_feed(v2_12), 흉내는 맨 아래. */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg, ui = QO.ui;
if(cfg.page !== 'student') return;
const S = QO.state, $ = ui.$, esc = ui.esc;
const cut = (s, n) => { const a = Array.from(String(s == null ? '' : s).replace(/\s+/g, ' ').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
const POLL = 5000, MAX = 80;

const F = {key:'', items:[], seen:new Set(), since:null, open:true, spot:null, fresh:new Set(), unseen:0,
  err:'', soonAt:0, busy:false, first:true, sheet:false, timer:null};
QO.livefeed = F;

/* ── 무엇이 왔나: 카드 머리글 ── */
const STEP = k => (QO.journal && QO.journal.stepName(k)) || '일지';
const CLUE_N = k => ((QO.K.CLUE_KINDS || {})[k] || {}).n || '';
function head(e){
  if(e.kind === 'plant') return {cls:'k-plant', t:'새 질문'};
  if(e.kind === 'step') return {cls:'k-step', t:STEP(e.step) + (e.extra === 'edit' ? ' 고침' : ' 씀')};
  if(e.kind === 'send') return {cls:'k-send', t:'선생님께 보냄' + (e.extra === 'unknown' ? ' · 아직 모름' : e.extra === 'quick' ? ' · 답만 달기' : '')};
  if(e.kind === 'sos') return {cls:'k-sos', t:'막혔어요' + (e.step ? ' · ' + STEP(e.step) + '에서' : '')};
  if(e.kind === 'clue') return {cls:'k-clue', t:'친구 단서' + (CLUE_N(e.extra) ? ' · ' + CLUE_N(e.extra) : '')};
  return {cls:'', t:'올라옴'};
}
function bodyOf(e){
  if(e.kind === 'plant') return '';
  if(e.kind === 'sos') return e.detail || '어디서 막혔는지는 안 적었어요.';
  return e.detail || '';
}
function ago(ts){
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if(!isFinite(s)) return '';
  if(s < 60) return '방금';
  if(s < 3600) return Math.floor(s / 60) + '분 전';
  return ui.fmtTime(ts);
}

/* ── 지금 띄울 때인가: 선생님 숲 방문 · 반을 골랐음 · 숲 탭 ── */
const visitKey = () => S.visit && S.visit.grade != null && S.visit.class_no != null ? S.visit.grade + '-' + S.visit.class_no : '';
const active = () => !!(S.ready && visitKey() && QO.tabs.current() === 'forest');

/* ── 읽기 ── */
const isSoon = e => /teacher_class_feed|schema cache|PGRST202|42883|Could not find the function/i.test(String((e && e.message) || e || '') + ' ' + String((e && e.code) || ''));
async function poll(force){
  const key = visitKey();
  if(!key){ paint(); return; }
  if(key !== F.key){ Object.assign(F, {key, items:[], seen:new Set(), since:null, spot:null, fresh:new Set(), unseen:0, err:'', soonAt:0, first:true}); }
  if(F.busy) return;
  if(F.err && !force && Date.now() - F.soonAt < 60000) return;     // SQL 전이면 1분마다만 다시 본다
  if(!force && (!active() || document.visibilityState !== 'visible')) return;
  F.busy = true;
  const g = S.visit.grade, c = S.visit.class_no;
  /* 지난번 가장 늦은 때에서 몇 초 앞부터(같은 때에 올라온 것을 놓치지 않게) — 겹친 것은 ev_key 로 거른다 */
  const since = F.since ? new Date(new Date(F.since).getTime() - 3000).toISOString() : null;
  try{
    const rows = (await QO.api.classFeed(g, c, since, F.first ? 60 : 100)) || [];
    if(visitKey() !== key) return;                        // 그사이 반을 바꿈
    F.err = '';
    let added = 0;
    rows.slice().reverse().forEach(e => {                 // 오래된 것부터 넣어 맨 위가 가장 새것
      if(!e || !e.ev_key || F.seen.has(e.ev_key)) return;
      F.seen.add(e.ev_key);
      F.items.unshift(e);
      if(!F.first){ F.fresh.add(e.ev_key); added++; }
      if(!F.since || new Date(e.at) > new Date(F.since)) F.since = e.at;
    });
    if(F.items.length > MAX) F.items.length = MAX;
    if(added && (!F.open || (!ui.wide() && !F.sheet))) F.unseen += added;
    F.first = false;
  }catch(e){
    if(isSoon(e)){ F.err = '실시간 목록은 선생님이 v2_12 SQL 을 실행한 뒤에 떠요.'; F.soonAt = Date.now(); }
    else if(!ui.userMsg(e)) QO.err(e, 'livefeed');
    else F.err = ui.userMsg(e);
  }finally{ F.busy = false; }
  paint();
}

/* ── 그리기 ── */
function root(){
  let el = $('#lf');
  if(!el){
    const app = $('#app'); if(!app) return null;
    el = document.createElement('aside'); el.id = 'lf'; el.className = 'lf'; el.setAttribute('aria-label', '올라온 글');
    app.appendChild(el);
    const pill = document.createElement('button'); pill.type = 'button'; pill.id = 'lfPill'; pill.className = 'lf-pill'; pill.dataset.lf = 'open';
    app.appendChild(pill);
    const spot = document.createElement('div'); spot.id = 'lfSpot'; spot.className = 'lf-spot'; spot.hidden = true;
    spot.setAttribute('role', 'dialog'); spot.setAttribute('aria-modal', 'true'); spot.setAttribute('aria-label', '크게 보기');
    app.appendChild(spot);
  }
  return el;
}
function cardHTML(e){
  const h = head(e), b = bodyOf(e), fresh = F.fresh.has(e.ev_key);
  return '<button type="button" class="lf-card ' + h.cls + (fresh ? ' lf-new' : '') + (F.spot === e.ev_key ? ' on' : '') + '" data-lf="spot" data-k="' + esc(e.ev_key) + '">' +
    '<span class="lf-h"><b>' + esc(h.t) + '</b><time data-at="' + esc(e.at) + '">' + esc(ago(e.at)) + '</time></span>' +
    '<span class="lf-q">' + esc(cut(e.question, e.kind === 'plant' ? 90 : 48)) + '</span>' +
    (b ? '<span class="lf-d">' + esc(cut(b, 90)) + '</span>' : '') + '</button>';
}
function paint(){
  const el = root(); if(!el) return;
  const app = $('#app'), on = active(), wide = ui.wide();
  const show = on && (wide ? F.open : F.sheet);
  app.classList.toggle('lf-on', on && wide && F.open);
  el.hidden = !show;
  const pill = $('#lfPill');
  if(pill){
    pill.hidden = !on || show;
    pill.innerHTML = '<span>올라온 글</span>' + (F.unseen ? '<b>' + F.unseen + '</b>' : '');
    pill.setAttribute('aria-label', '올라온 글 ' + (F.unseen ? '새 글 ' + F.unseen + '개 ' : '') + '열기');
  }
  if(!on){ closeSpot(true); return; }
  if(show){
    const v = S.visit;
    let h = '<div class="lf-top"><div><b>올라온 글</b><span>' + esc(v.grade + '학년 ' + v.class_no + '반') + ' · 몇 초마다 새로 읽어요 · 이름은 안 보여요</span></div>' +
      '<button type="button" class="lf-x" data-lf="close" aria-label="올라온 글 접기">접기</button></div>';
    if(F.err) h += '<div class="lf-msg">' + esc(F.err) + '</div>';
    else if(F.first) h += '<div class="lf-msg">불러오는 중이에요…</div>';
    else if(!F.items.length) h += '<div class="lf-msg">아직 올라온 글이 없어요. 학생이 질문을 심거나 일지 칸을 쓰면 여기에 바로 떠요.</div>';
    else h += '<div class="lf-list">' + F.items.map(cardHTML).join('') + '</div>';
    /* 바뀐 게 없으면 다시 그리지 않는다(5초마다 그리면 누르는 중인 카드가 사라져 눌리지 않음). 「방금·N분 전」은 아래 타이머가 글자만 */
    const sig = F.key + '|' + F.err + '|' + F.first + '|' + F.spot + '|' + F.items.map(e => e.ev_key).join(',');
    if(el.dataset.sig === sig && !el.hidden && el.firstChild){ F.fresh.clear(); if(F.spot) paintSpot(); return; }
    el.dataset.sig = sig;
    const keep = el.querySelector('.lf-list'), y = keep ? keep.scrollTop : 0;
    el.innerHTML = h;
    const list = el.querySelector('.lf-list'); if(list && y) list.scrollTop = y;
    F.fresh.clear();                                       // 빛나는 표시는 한 번만(애니메이션은 css)
    if(F.open && (wide || F.sheet)) F.unseen = 0;
    if(pill) pill.innerHTML = '<span>올라온 글</span>';
  }
  if(F.spot) paintSpot();
}

/* ── 크게 보기(다 같이) ── */
function paintSpot(force){
  const sp = $('#lfSpot'); if(!sp) return;
  const i = F.items.findIndex(e => e.ev_key === F.spot), e = F.items[i];
  if(!e){ closeSpot(true); return; }
  const ssig = e.ev_key + '|' + i + '|' + F.items.length + '|' + ago(e.at);     // 바뀐 게 없으면 다시 그리지 않음
  if(!force && sp.dataset.sig === ssig && !sp.hidden) return;
  sp.dataset.sig = ssig;
  const h = head(e), b = bodyOf(e);
  sp.className = 'lf-spot ' + h.cls;
  sp.innerHTML = '<div class="lfs-top"><span class="lfs-k">' + esc(h.t) + '</span><time>' + esc(ago(e.at)) + '</time>' +
      (e.unit ? '<span class="lfs-u">' + esc(e.unit) + '</span>' : '') + '<button type="button" class="lfs-x" data-lf="spotClose">닫기</button></div>' +
    '<div class="lfs-body"><div class="lfs-q">' + esc(e.question) + '</div>' +
      (b ? '<div class="lfs-d">' + esc(b) + '</div>' : '') + '</div>' +
    '<div class="lfs-nav"><button type="button" data-lf="spotNext" data-d="-1"' + (i <= 0 ? ' disabled' : '') + '>더 새 글</button>' +
      '<span>' + (i + 1) + ' / ' + F.items.length + '</span>' +
      '<button type="button" data-lf="spotNext" data-d="1"' + (i >= F.items.length - 1 ? ' disabled' : '') + '>지난 글</button></div>';
  sp.hidden = false;
}
function openSpot(k){
  F.spot = k; paintSpot(true);
  document.querySelectorAll('#lf .lf-card').forEach(c => c.classList.toggle('on', c.dataset.k === k));
  const x = document.querySelector('#lfSpot .lfs-x'); if(x) x.focus();
}
function closeSpot(quiet){
  const sp = $('#lfSpot'), was = F.spot;
  F.spot = null;
  if(sp) sp.hidden = true;
  document.querySelectorAll('#lf .lf-card.on').forEach(c => c.classList.remove('on'));
  if(!quiet && was){ const c = document.querySelector('#lf .lf-card[data-k="' + CSS.escape(was) + '"]'); if(c) c.focus(); }
}

/* ── 누르기·키보드 ── */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-lf]');
  if(!b || !b.closest('#app')) return;
  const a = b.dataset.lf;
  if(a === 'spot') openSpot(b.dataset.k);
  else if(a === 'spotClose') closeSpot();
  else if(a === 'spotNext'){
    const i = F.items.findIndex(x => x.ev_key === F.spot) + Number(b.dataset.d), n = F.items[i];
    if(n) openSpot(n.ev_key);
  }
  else if(a === 'close'){ if(ui.wide()) F.open = false; else F.sheet = false; paint(); }
  else if(a === 'open'){ if(ui.wide()) F.open = true; else F.sheet = true; F.unseen = 0; paint(); poll(true); }
});
document.addEventListener('keydown', e => {
  if(!F.spot || e.isComposing) return;
  if(e.key === 'Escape'){ e.preventDefault(); closeSpot(); }
  else if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
    const i = F.items.findIndex(x => x.ev_key === F.spot) + (e.key === 'ArrowLeft' ? -1 : 1), n = F.items[i];
    if(n){ e.preventDefault(); openSpot(n.ev_key); }
  }
});

/* ── 언제 읽나: 숲 탭에 들어올 때 바로, 그 뒤 5초마다(안 보이면 쉼). 「방금·N분 전」은 30초마다 글자만 ── */
QO.bus.on('tab:show', () => { paint(); if(active()) poll(true); });
QO.bus.on('ready', () => { paint(); if(active()) poll(true); });
QO.bus.on('wide:changed', () => { F.sheet = false; paint(); });
QO.bus.on('me:changed', () => { Object.assign(F, {key:'', items:[], seen:new Set(), since:null, spot:null, unseen:0, err:'', first:true, sheet:false}); paint(); });
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && active()) poll(true); });
F.timer = setInterval(() => { if(active()) poll(); }, POLL);
setInterval(() => { document.querySelectorAll('#lf time[data-at]').forEach(t => { t.textContent = ago(t.dataset.at); }); }, 30000);
F.poll = poll; F.paint = paint;

/* ═══════════ 데이터 함수 — classFeed(학년, 반, 이때부터, 몇 개) → teacher_class_feed(v2_12) ═══════════ */
QO.api.classFeed = async function(g, c, since, limit){
  const cl = await QO.sbClient();
  const r = await cl.rpc('teacher_class_feed', {p_grade:g, p_class:c, p_since:since == null ? null : since, p_limit:limit == null ? 60 : limit});
  if(r.error){ const e = new Error(String(r.error.message || r.error)); e.code = r.error.code; throw e; }
  return r.data || [];
};
/* 흉내 — SQL 과 같은 규칙·문구(선생님만, 반 필수, 익명·다른 반 빼기, 보낼 때의 정리 칸은 보냄 하나로, 선생님 단서 빼기, 이름 없음) */
if(QO.mock && QO.mock.extend) QO.mock.extend({
  classFeed(g, c, since, limit){
    const h = QO.mock.h, db = QO.mock.db;
    const uid = h.needMe();
    if(!h.teacherOf(uid)) throw h.userErr('선생님만 할 수 있어요');
    if(g == null || c == null) throw h.userErr('반을 먼저 골라 주세요');
    const ms = v => { const t = v ? new Date(v).getTime() : NaN; return isFinite(t) ? t : NaN; };
    const s0 = Math.max(since == null ? Date.now() - 3 * 3600e3 : ms(since), Date.now() - 2 * 86400e3);
    const y0 = Date.UTC(h.schoolYear(), 2, 1);
    const qs = db.questions.filter(q => { const p = h.prof(q.user_id); return p && p.grade === Number(g) && p.class_no === Number(c) && ms(q.created_at) >= y0 && !q.is_anonymous; });
    const body = q => (q.refined_text && q.refined_text !== '') ? q.refined_text : q.text;
    const left = (s, n) => Array.from(String(s == null ? '' : s)).slice(0, n).join('');
    const ev = [];
    qs.forEach(q => {
      const j = q.journal && typeof q.journal === 'object' ? q.journal : {}, w = j.wrap && typeof j.wrap === 'object' ? j.wrap : null;
      if(ms(q.created_at) > s0) ev.push({ev_key:'plant:' + q.id, kind:'plant', at:q.created_at, question_id:q.id, question:body(q), unit:q.unit || null, step:null, detail:q.text, extra:null});
      const t = h.stepTexts(q), req = ms(q.resolve_requested_at);
      db.step_marks.filter(m => m.question_id === q.id && ms(m.last_at) > s0).forEach(m => {
        if(m.step === 'wrap' && isFinite(req) && Math.abs(ms(m.last_at) - req) < 10000) return;
        ev.push({ev_key:'step:' + q.id + ':' + m.step + ':' + ms(m.last_at), kind:'step', at:m.last_at, question_id:q.id, question:body(q), unit:q.unit || null,
          step:m.step, detail:left(t[m.step] || '', 600), extra:m.first_at === m.last_at ? 'new' : 'edit'});
      });
      if(isFinite(req) && req > s0 && q.fruit_kind == null){
        const unknown = w && w.mode === 'unknown';
        ev.push({ev_key:'send:' + q.id + ':' + req, kind:'send', at:q.resolve_requested_at, question_id:q.id, question:body(q), unit:q.unit || null, step:'wrap',
          detail:left(unknown ? (w.reached || '') + ' / 막힌 곳: ' + (w.stuckQ || '') : ((w && w.text != null ? w.text : q.finding) || ''), 600),
          extra:w && w.cmp === 'quick' ? 'quick' : unknown ? 'unknown' : 'known'});
      }
      const fl = j.flag && typeof j.flag === 'object' ? j.flag : null;
      if(fl && /^\d{4}-\d{2}-\d{2}/.test(String(fl.at || '')) && ms(fl.at) > s0)
        ev.push({ev_key:'sos:' + q.id + ':' + fl.at, kind:'sos', at:fl.at, question_id:q.id, question:body(q), unit:q.unit || null, step:fl.step || null, detail:left(fl.tried || '', 300), extra:null});
      db.clues.filter(x => x.question_id === q.id && ms(x.created_at) > s0 && x.hidden_at == null && !x.by_teacher).forEach(x => {
        ev.push({ev_key:'clue:' + x.id, kind:'clue', at:x.created_at, question_id:q.id, question:body(q), unit:q.unit || null, step:x.step || null, detail:left(x.body || '', 600), extra:x.kind || null});
      });
    });
    ev.sort((a, b) => ms(b.at) - ms(a.at));
    return ev.slice(0, Math.min(Math.max(limit == null ? 60 : Number(limit), 1), 200));
  }
});

/* ═══════════ 스스로 시험 ═══════════ */
if(QO.selftest){
  const add = QO.selftest.add, q$ = s => document.querySelector(s);
  add('실시간 올라온 글 · 선생님 숲 방문에서 옆 목록 · 새 글이 빛남 · 누르면 크게 · 이름 없음', async t => {
    await t.waitFor(() => document.documentElement.classList.contains('visit') && QO.tabs.current() === 'forest');
    await t.waitFor(() => q$('#lf') && !F.first);
    const wide = ui.wide();
    if(wide) t.expect(!q$('#lf').hidden && q$('#app').classList.contains('lf-on'), '넓은 화면은 옆 칸으로');
    else { t.expect(!q$('#lfPill').hidden, '좁은 화면은 「올라온 글」 단추'); await t.click('#lfPill'); await t.waitFor(() => !q$('#lf').hidden); }
    const n0 = F.items.length;
    /* 학생이 질문을 심고 예상을 씀 → 다음 읽기에 새 카드 */
    t.as('A');
    const q = await t.api.plantQuestion({text:'번개는 왜 지그재그로 칠까요?', is_anonymous:false});
    await t.api.saveJournal(q.id, {predict_add:'공기 속 지나기 쉬운 길을 따라가서 그런 것 같다. 왜냐하면 전기는 쉬운 길로 가니까.'});
    const qa = await t.api.plantQuestion({text:'익명으로 심는 비밀 질문이에요', is_anonymous:true});
    t.as('T');
    await poll(true);
    await t.waitFor(() => q$('#lf .lf-card.lf-new'));
    const keys = F.items.slice(0, F.items.length - n0).map(e => e.kind + ':' + (e.step || ''));
    t.expect(keys.indexOf('plant:') >= 0 && keys.indexOf('step:predict') >= 0, '새 질문·예상 씀 — ' + keys.join(','));
    t.expect(!F.items.some(e => e.question_id === qa.id), '익명 질문은 안 나옴');
    t.expect(q$('#lf').textContent.indexOf('가람') < 0 && !/\d+번/.test(q$('#lf').textContent), '목록에 이름·번호 없음');
    t.expect(F.items.every(e => !('owner_name' in e) && !('owner_number' in e)), '자료에도 이름·번호 없음');
    /* 같은 것을 다시 읽어도 겹치지 않음 */
    const n1 = F.items.length;
    await poll(true);
    t.eq(F.items.length, n1, '다시 읽어도 같은 글은 한 번만');
    const c0 = q$('#lf .lf-card');
    await poll(true);
    t.expect(q$('#lf .lf-card') === c0, '새 글이 없으면 다시 그리지 않음(누르던 카드가 그대로)');
    /* 누르면 크게, 이전·다음, Esc 로 닫기 */
    const first = q$('#lf .lf-card');
    await t.click(first);
    await t.waitFor(() => !q$('#lfSpot').hidden);
    t.expect(q$('#lfSpot .lfs-q').textContent.length > 0, '크게 보기 — 질문');
    t.expect(q$('#lfSpot').textContent.indexOf('가람') < 0, '크게 보기에도 이름 없음');
    t.expect(q$('#lfSpot [data-d="-1"]').disabled && !q$('#lfSpot [data-d="1"]').disabled, '맨 위 글이면 「더 새 글」 막힘');
    await t.click('#lfSpot [data-d="1"]');
    t.eq(F.spot, F.items[1].ev_key, '「지난 글」로 넘어감');
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    await t.waitFor(() => q$('#lfSpot').hidden);
    /* SOS·선생님께 보냄·친구 단서 */
    t.as('A');
    await t.api.saveJournal(q.id, {flag:{step:'find', tried:'자료를 못 찾겠어요'}});
    t.as('T');
    await poll(true);
    await t.waitFor(() => F.items.some(e => e.kind === 'sos' && e.question_id === q.id));
    t.expect(/막혔어요 · 찾기에서/.test(q$('#lf').textContent), 'SOS 카드 머리글');
    /* 접기·펼치기 */
    await t.click('#lf [data-lf="close"]');
    await t.waitFor(() => q$('#lf').hidden && !q$('#lfPill').hidden);
    await t.click('#lfPill');
    await t.waitFor(() => !q$('#lf').hidden);
  }, {as:'T'});
}
})();
