/* 나의 성장 — 따로 탭(2026-11-11, 사용자 「나의 성장이 중요한 요소니까 탭 하나로」). 예전엔 「내 나무」 탭 오른쪽 아래 카드.
   · 내 질문이 어떻게 달라졌나: 처음 심은 질문 ↔ 최근에 심은 질문(연구수업 「내 질문 돌아보기」와 이어짐)
   · 다듬기 전 → 다듬은 뒤(최근 여섯)
   · 단원마다 내 질문(수업 차례대로) — 어디서 많이 물었고 어디는 비었나
   · 내 발자국(「내 나무」 탭에서 옮김) — 숫자 없이 칸 종류만
   · 책 보며 알게 된 낱말(read.js: 내 짐작 → 찾은 뜻)
   · 「아직 모르는 것」 모음 — 다음 질문의 씨앗
   숫자를 크게 보이지 않는다(설계서 §1-7). 랭킹·업적은 넣지 않는다. */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const shown = q => (q.refined_text && String(q.refined_text).trim()) ? q.refined_text : q.text;
const md = ts => U.kstDay(ts).slice(5).replace('-', '/');
const GS = {unitOpen:null};
function wonders(qs){
  const out = [];
  qs.forEach(q => {
    const j = q.journal || {}, w = j.wrap || {};
    if(w.mode === 'unknown' && String(w.stuckQ || '').trim()) out.push({t:w.stuckQ, at:q.created_at, from:shown(q)});
    else if(String(q.still_wondering || '').trim()) out.push({t:q.still_wondering, at:q.created_at, from:shown(q)});
  });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
function mine(){ return (QO.state.questions || []).filter(q => q && q.text); }

/* 처음 ↔ 최근 · 다듬기 */
function changeHTML(qs){
  const byTime = qs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const first = byTime[0], last = byTime[byTime.length - 1];
  let h = '<div class="sec">내 질문이 어떻게 달라졌나</div><div class="card gr-card">';
  if(qs.length < 2) return h + '<div class="hint">질문을 두 개 넘게 심으면 처음 질문과 요즘 질문을 나란히 볼 수 있어요.</div></div>';
  h += '<div class="gr-pair"><div><span class="lb">처음 심은 질문 · ' + esc(md(first.created_at)) + '</span><p>' + esc(shown(first)) + '</p></div>' +
    '<div><span class="lb">최근에 심은 질문 · ' + esc(md(last.created_at)) + '</span><p>' + esc(shown(last)) + '</p></div></div>' +
    '<div class="hint">두 질문을 견줘 봐요. 무엇을 더 구체적으로 묻게 되었나요?</div>';
  const refined = byTime.filter(q => q.refined_text && String(q.refined_text).trim() && q.refined_text !== q.text).reverse().slice(0, 6);
  if(refined.length) h += '<div class="gr-ref"><span class="lb">다듬기 전 → 다듬은 뒤</span>' + refined.map(q =>
    '<div class="gr-refi"><p><s>' + esc(q.text) + '</s></p><p>' + esc(q.refined_text) + '</p></div>').join('') + '</div>';
  const nAfter = qs.filter(q => q.phase === 'after').length, nKid = qs.filter(q => q.parent_id).length;
  return h + '<div class="gr-line">수업 닫기 질문 ' + nAfter + '개 · 이어서 심은 질문 ' + nKid + '개</div></div>';
}
/* 단원마다 — 수업 차례(explore UNITS)대로, 질문이 있는 단원만 */
function unitsHTML(qs){
  const order = (QO.explore && QO.explore.UNITS) || [];
  const by = new Map();
  qs.forEach(q => { const u = q.unit || '단원 안 고름'; if(!by.has(u)) by.set(u, []); by.get(u).push(q); });
  if(!by.size) return '';
  const keys = Array.from(by.keys()).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
  return '<div class="sec">단원마다 내 질문</div><div class="card gr-units">' + keys.map(k => {
    const list = by.get(k).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const open = GS.unitOpen === k, fr = list.filter(q => q.fruit_kind).length;
    return '<div class="gr-u"><button type="button" class="gr-uh" data-gr="unit" data-u="' + esc(k) + '" aria-expanded="' + open + '">' +
      '<span class="nm">' + esc(k) + '</span><span class="gr-dots" aria-label="질문 ' + list.length + '개' + (fr ? ', 열매 ' + fr + '개' : '') + '">' +
      list.slice(0, 12).map(q => '<i class="' + (q.fruit_kind === 'fruit' ? 'f' : q.fruit_kind === 'fog' ? 'g' : '') + '"></i>').join('') + (list.length > 12 ? '<em>+' + (list.length - 12) + '</em>' : '') + '</span></button>' +
      (open ? '<div class="gr-ub">' + list.map(q => '<p>' + esc(shown(q)) + '<small>' + esc(md(q.created_at)) + (q.fruit_kind === 'fruit' ? ' · 열매' : q.fruit_kind === 'fog' ? ' · 안개 열매' : '') + '</small></p>').join('') + '</div>' : '') + '</div>';
  }).join('') + '<div class="hint">점 하나가 질문 하나예요. 빨간 점은 열매, 파란 점은 안개 열매. 단원을 누르면 질문이 펼쳐져요.</div></div>';
}
/* 내 발자국 — 숫자 없이 칸 종류만 */
function fpHTML(){
  const COUNTED = QO.K.STEPS.filter(s => s.counted);
  const fp = QO.state.footprints || [], has = {};
  fp.forEach(f => { has[f.step] = true; });
  return '<div class="sec">내 발자국</div><div class="card tr-fp">' +
    (fp.length ? '<div class="tr-fp-chips">' + COUNTED.map(s => '<span data-step="' + s.k + '"' + (has[s.k] ? ' class="on"' : '') + '>' + (has[s.k] ? '✓ ' : '') + esc(s.n) + '</span>').join('') + '</div>' : '') +
    '<div class="hint">일지 칸을 내 말로 처음 채우면 ' + (fp.length ? '그 칸에' : '여기에') + ' 발자국이 남아요.</div></div>';
}
/* 책 보며 알게 된 낱말(read.js) */
function wordsHTML(qs){
  const ws = qs.map(q => ({q, r:(q.journal || {}).read})).filter(x => x.r && Number(x.r.kind) === 3 && x.r.word)
    .sort((a, b) => String(b.q.created_at).localeCompare(String(a.q.created_at)));
  if(!ws.length) return '';
  return '<div class="sec">책 보며 만난 낱말</div><div class="card gr-words">' + ws.slice(0, 12).map(x =>
    '<div class="gr-w"><b>' + esc(x.r.word) + '</b>' + (x.r.guess ? '<span class="gs">내 짐작 · ' + esc(x.r.guess) + '</span>' : '') +
    (x.r.found ? '<span class="fd">찾은 뜻 · ' + esc(x.r.found) + '</span>' : '<span class="later">찾은 뜻은 그 질문의 「찾기」 칸에서 적어요</span>') + '</div>').join('') + '</div>';
}
function wondersHTML(qs){
  const wd = wonders(qs).slice(0, 6);
  if(!wd.length) return '';
  return '<div class="sec">아직 모르는 것</div><div class="card gr-wd">' + wd.map(w => '<p>· ' + esc(w.t) + '</p>').join('') +
    '<div class="hint">이 가운데 하나를 새 질문으로 심어 봐요.</div></div>';
}
function render(root){
  const qs = mine();
  if(!QO.state.me){ root.innerHTML = ''; return; }
  if(!qs.length){ root.innerHTML = '<div class="empty">질문을 심으면 여기에 내가 자란 기록이 쌓여요.</div>'; return; }
  const left = changeHTML(qs) + wondersHTML(qs), right = unitsHTML(qs) + fpHTML() + wordsHTML(qs);
  root.innerHTML = U.wide() ? '<div class="cols gr-cols"><div>' + left + '</div><div>' + right + '</div></div>' : left + right;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-gr="unit"]'); if(!b) return;
  GS.unitOpen = GS.unitOpen === b.dataset.u ? null : b.dataset.u;
  QO.tabs.rerender('grow');
});
const GROW_IC = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 14c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M8 21h8"/></svg>';
QO.tabs.register({id:'grow', label:'나의 성장', icon:GROW_IC, render:render});
['questions:changed', 'footprints:changed'].forEach(ev => QO.bus.on(ev, () => { if(QO.tabs.current() === 'grow') QO.tabs.rerender('grow'); }));
QO.bus.on('ready', () => { GS.unitOpen = null; });
QO.growth = {render:render};

if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('나의 성장 탭(처음↔최근 질문·다듬기 전후·단원마다·발자국)', async t => {
  await t.click('#nav [data-t="grow"]');
  await t.waitFor('#body .gr-card');
  const card = t.$('#body .gr-card');
  const mineQ = t.state.questions.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  t.expect(card.querySelector('.gr-pair').textContent.indexOf(shown(mineQ[0])) >= 0, '처음 질문');
  t.expect(card.querySelector('.gr-pair').textContent.indexOf(shown(mineQ[mineQ.length - 1])) >= 0, '최근 질문');
  t.expect(/수업 닫기 질문 \d+개/.test(card.textContent), '열기·닫기 한 줄');
  const u = t.$('#body .gr-uh'); t.expect(u, '단원 줄');
  await t.click(u);
  await t.waitFor('#body .gr-ub p');
  t.expect(t.$('#body .tr-fp'), '발자국이 이 탭으로');
});
})();
