/* 나의 성장 — 옛 앱 📈 renderGrowthMirror 가운데 수업에 쓰는 것만 「내 나무」 탭으로 옮김(2026-11-06).
   · 처음 심은 질문 ↔ 최근에 심은 질문(내 질문이 어떻게 달라졌나 — 연구수업 「내 질문 돌아보기」와 이어짐)
   · 다듬기 전 → 다듬은 뒤(가장 최근 하나)
   · 「아직 모르는 것」 모음(옛 앱 still_wondering + 질문과수원 2 「아직 모름」 정리) — 다음 질문의 씨앗
   · 한 줄: 수업 열기·닫기 질문, 이어서 심은 질문(꼬리). 숫자를 크게 보이지 않는다(설계서 §1-7). 랭킹·업적은 옮기지 않는다. */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const shown = q => (q.refined_text && String(q.refined_text).trim()) ? q.refined_text : q.text;
function wonders(qs){
  const out = [];
  qs.forEach(q => {
    const j = q.journal || {}, w = j.wrap || {};
    if(w.mode === 'unknown' && String(w.stuckQ || '').trim()) out.push({t:w.stuckQ, at:q.created_at, from:shown(q)});
    else if(String(q.still_wondering || '').trim()) out.push({t:q.still_wondering, at:q.created_at, from:shown(q)});
  });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
function html(){
  const qs = (QO.state.questions || []).filter(q => q && q.text);
  if(qs.length < 2) return '';
  const byTime = qs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const first = byTime[0], last = byTime[byTime.length - 1];
  const refined = byTime.filter(q => q.refined_text && String(q.refined_text).trim() && q.refined_text !== q.text).pop();
  const wd = wonders(qs).slice(0, 5);
  const nAfter = qs.filter(q => q.phase === 'after').length, nKid = qs.filter(q => q.parent_id).length;
  let h = '<div class="sec">나의 성장</div><div class="card gr-card">' +
    '<div class="gr-pair"><div><span class="lb">처음 심은 질문 · ' + esc(U.kstDay(first.created_at).slice(5).replace('-', '/')) + '</span><p>' + esc(shown(first)) + '</p></div>' +
    '<div><span class="lb">최근에 심은 질문 · ' + esc(U.kstDay(last.created_at).slice(5).replace('-', '/')) + '</span><p>' + esc(shown(last)) + '</p></div></div>' +
    '<div class="hint">두 질문을 견줘 봐요. 무엇을 더 구체적으로 묻게 되었나요?</div>';
  if(refined) h += '<div class="gr-ref"><span class="lb">다듬기 전 → 다듬은 뒤</span><p><s>' + esc(refined.text) + '</s></p><p>' + esc(refined.refined_text) + '</p></div>';
  if(wd.length) h += '<div class="gr-wd"><span class="lb">아직 모르는 것</span>' + wd.map(w => '<p>· ' + esc(w.t) + '</p>').join('') + '<div class="hint">이 가운데 하나를 새 질문으로 심어 봐요.</div></div>';
  h += '<div class="gr-line">수업 닫기 질문 ' + nAfter + '개 · 이어서 심은 질문 ' + nKid + '개</div>';
  return h + '</div>';
}
QO.growth = {html:html};

if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('나무 · 나의 성장(처음↔최근 질문·다듬기 전후·아직 모르는 것)', async t => {
  await t.click('#nav [data-t="tree"]');
  await t.waitFor('#body .gr-card');
  const card = t.$('#body .gr-card');
  const mine = t.state.questions.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  t.expect(card.querySelector('.gr-pair').textContent.indexOf(shown(mine[0])) >= 0, '처음 질문');
  t.expect(card.querySelector('.gr-pair').textContent.indexOf(shown(mine[mine.length - 1])) >= 0, '최근 질문');
  t.expect(/수업 닫기 질문 \d+개/.test(card.textContent), '열기·닫기 한 줄');
});
})();
