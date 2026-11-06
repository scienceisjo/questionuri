/* 대표 질문 — 옛 앱 ⭐ togglePick 을 탐구 일지 맨 위로 옮김(2026-11-06).
   · 차시마다 2개까지(서버 9_질문다듬기_해결.sql pick_guard 트리거가 같은 규칙을 지킨다). 차시가 붙은 내 질문만.
   · 칸은 옛 앱과 같은 questions.is_picked → 선생님 대시보드 「대표 질문」 탭·다듬기 수업 화면이 그대로 읽는다. 새 SQL 없음. */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const MAX = 2;

QO.api.setPicked = async function(qid, on){
  const cl = await QO.sbClient();
  const r = await cl.from('questions').update({is_picked:!!on}).eq('id', qid).select('id,is_picked');
  if(r.error){ if(/2개까지/.test(r.error.message || '')) throw QO.userError('한 차시에 대표 질문은 ' + MAX + '개까지예요.'); const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; }
  if(!r.data || !r.data.length) throw QO.userError('저장되지 않았어요. 새로고침한 뒤 다시 해 봐요.');
  return r.data[0];
};
if(QO.mock) QO.mock.extend({
  setPicked(qid, on){
    const h = QO.mock.h, me = h.needMe(), q = h.qById(qid);
    if(!q || q.user_id !== me) throw h.userErr('내 질문만 고를 수 있어요');
    if(on && q.unit && QO.mock.db.questions.filter(x => x.user_id === me && x.unit === q.unit && x.is_picked && x.id !== q.id).length >= MAX) throw h.userErr('한 차시에 대표 질문은 ' + MAX + '개까지예요.');
    q.is_picked = !!on;
    return {id:q.id, is_picked:q.is_picked};
  }
});

const qOf = id => QO.store.question(id);
const pickedIn = unit => (QO.state.questions || []).filter(q => q && q.unit === unit && q.is_picked);   // state.questions = 내 질문만
function html(v){
  const q = qOf(v.id); if(!q || !q.unit || v.legacyHarvest) return '';
  const n = pickedIn(q.unit).length;
  return '<div class="pk-bar"><button type="button" class="pk-btn' + (q.is_picked ? ' on' : '') + '" data-pk="toggle" data-q="' + v.id + '" aria-pressed="' + !!q.is_picked + '">' +
    (q.is_picked ? '★ 이 차시 대표 질문' : '☆ 대표 질문으로 고르기') + '</button><span class="pk-n">' + esc(q.unit) + ' 대표 ' + n + '/' + MAX + '</span></div>';
}
function tag(id){ const q = qOf(id); return q && q.is_picked ? '<span class="pk-tag">★ 대표</span>' : ''; }
async function toggle(btn, qid){
  const q = qOf(qid); if(!q) return;
  const want = !q.is_picked;
  if(want && pickedIn(q.unit).length >= MAX){ U.toast('이 차시는 이미 대표 질문이 ' + MAX + '개예요. 하나를 먼저 빼 주세요.'); return; }
  if(want && !(q.refined_text || '').trim() && !(await U.confirm('아직 다듬지 않은 질문이에요. 그래도 대표로 고를까요?', {ok:'고를래요', cancel:'다듬고 올게요'}))) return;
  const r = await U.busy(btn, () => QO.api.setPicked(qid, want));
  if(r === undefined) return;
  QO.store.upsertQuestion(Object.assign({}, qOf(qid), {is_picked:r.is_picked}));
  U.toast(want ? '이 차시의 대표 질문으로 골랐어요.' : '대표 질문에서 뺐어요.');
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-pk="toggle"]'); if(!b) return;
  e.preventDefault(); toggle(b, Number(b.dataset.q));
});
QO.pick = {html:html, tag:tag};

if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('탐구 · 대표 질문(차시마다 2개까지·is_picked)', async t => {
  const mine = t.db.questions.filter(x => x.user_id === 'u-A' && !x.parent_id);
  mine.forEach(x => { x.is_picked = false; x.unit = 'Ⅴ-3. 전류의 자기 작용'; x.refined_text = x.refined_text || x.text; });
  await QO.store.refreshQuestions();
  const ids = mine.slice(0, 3).map(x => x.id);
  t.expect(ids.length === 3, '내 질문 셋');
  for(const id of ids.slice(0, 2)){
    const h = html({id:id}); t.expect(/대표 질문으로 고르기/.test(h), '고르기 단추');
    const div = document.createElement('div'); div.innerHTML = h; document.body.appendChild(div);
    await t.click(div.querySelector('[data-pk="toggle"]')); await t.waitFor(() => t.db.questions.find(x => x.id === id).is_picked);
    div.remove();
  }
  const div = document.createElement('div'); div.innerHTML = html({id:ids[2]}); document.body.appendChild(div);
  await t.click(div.querySelector('[data-pk="toggle"]'));
  await t.wait(150);
  div.remove();
  t.eq(t.db.questions.find(x => x.id === ids[2]).is_picked, false, '셋째는 안 됨(2개까지)');
  t.expect(/★ 대표/.test(tag(ids[0])), '카드 표시');
  t.expect(/대표 2\/2/.test(html({id:ids[0]})), '차시 대표 수');
});
})();
