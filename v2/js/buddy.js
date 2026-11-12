/* 과수원 친구 말풍선(2026-11-11) — 「내 나무」 칸의 캐릭터가 내 질문을 하나씩 돌려 가며 말한다.
   · 3D 가 되면 tree3d.js 의 캐릭터 머리 위(--bx·--by)에 붙고, 말이 바뀔 때 깡충 뛴다(QO.tree3d.cheer).
   · 3D 가 안 되면(스스로 시험·WebGL 없음) 같은 모양의 SVG 친구를 나무 그림 왼쪽 아래에 세운다.
   · 돌리는 순서: 아직 탐구 중인 내 질문(최근 것부터) → 「아직 모르는 것」. 질문이 없으면 심어 보자는 말.
   · 말풍선을 누르면 그 질문 일지가 열린다(탐구 탭). 4.5초마다 바뀌고, 탭이 안 보이면 멈춘다. */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const B = {i:0, timer:0, list:[], sig:''};
const shown = q => (q.refined_text && String(q.refined_text).trim()) ? q.refined_text : q.text;
const cut = (s, n) => { const a = Array.from(String(s || '').trim()); return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
function lines(){
  const qs = (QO.state.questions || []).filter(q => q && q.text);
  const open = qs.filter(q => !q.fruit_kind).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10)
    .map(q => ({lb:'내가 궁금한 것', t:shown(q), id:q.id}));
  const wd = [];
  qs.forEach(q => {
    const w = (q.journal || {}).wrap || {};
    const t = w.mode === 'unknown' && String(w.stuckQ || '').trim() ? w.stuckQ : String(q.still_wondering || '').trim();
    if(t) wd.push({lb:'아직 모르는 것', t:t, id:q.id, at:q.created_at});
  });
  wd.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const out = open.concat(wd.slice(0, 4));
  return out.length ? out : [{lb:'', t:'궁금한 걸 심으면 내가 하나씩 읽어 줄게!', id:null}];
}
/* 3D 가 안 될 때 세우는 같은 친구(SVG) */
const BUDDY_SVG = '<svg class="bd-svg" viewBox="0 0 80 96" width="64" height="77" aria-hidden="true">' +
  '<ellipse cx="40" cy="92" rx="22" ry="4" fill="#000" opacity=".1"/>' +
  '<path d="M40 22 V10" stroke="#5E9E4E" stroke-width="3" stroke-linecap="round"/>' +
  '<ellipse cx="30" cy="10" rx="11" ry="5" fill="#6DBA5E" transform="rotate(-25 30 10)"/><ellipse cx="50" cy="10" rx="11" ry="5" fill="#6DBA5E" transform="rotate(25 50 10)"/>' +
  '<ellipse cx="40" cy="56" rx="29" ry="32" fill="#F4E4C4"/><ellipse cx="40" cy="64" rx="19" ry="18" fill="#FFF6E4"/>' +
  '<ellipse cx="12" cy="62" rx="6" ry="8" fill="#F4E4C4"/><ellipse cx="68" cy="62" rx="6" ry="8" fill="#F4E4C4"/>' +
  '<circle cx="31" cy="48" r="4" fill="#2B2622"/><circle cx="49" cy="48" r="4" fill="#2B2622"/><circle cx="32.4" cy="46.5" r="1.3" fill="#fff"/><circle cx="50.4" cy="46.5" r="1.3" fill="#fff"/>' +
  '<circle cx="23" cy="56" r="4" fill="#F4A7A0" opacity=".75"/><circle cx="57" cy="56" r="4" fill="#F4A7A0" opacity=".75"/>' +
  '<path d="M36 55 Q40 59 44 55" stroke="#2B2622" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
  '<ellipse cx="30" cy="88" rx="8" ry="4" fill="#D8B585"/><ellipse cx="50" cy="88" rx="8" ry="4" fill="#D8B585"/></svg>';
function bubbleHTML(){
  const L = B.list[B.i % B.list.length] || {lb:'', t:''};
  return '<button type="button" class="bd-bubble" data-bd="open"' + (L.id != null ? ' data-q="' + L.id + '"' : '') + ' aria-live="polite" aria-label="' + esc((L.lb ? L.lb + ': ' : '') + L.t) + '">' +
    (L.lb ? '<small>' + esc(L.lb) + '</small>' : '') + '<span>' + esc(cut(L.t, 46)) + '</span></button>';
}
/* tree.js 가 내 나무 칸을 그린 뒤 부른다 */
function mount(wrap){
  if(!wrap) return;
  const sig = (QO.state.questions || []).map(q => q.id + ':' + (q.fruit_kind || '') + ':' + (q.refined_text || '')).join(',');
  if(sig !== B.sig){ B.sig = sig; B.list = lines(); B.i = 0; }
  wrap.classList.add('bd-on');
  let fb = wrap.querySelector('.bd-svg'); if(!fb){ wrap.insertAdjacentHTML('beforeend', BUDDY_SVG); }
  let box = wrap.querySelector('.bd-box');
  if(!box){ box = document.createElement('div'); box.className = 'bd-box'; wrap.appendChild(box); }
  box.innerHTML = bubbleHTML();
  start();
}
function next(){
  const box = document.querySelector('#body .tr-tree .bd-box'); if(!box || !B.list.length) return;
  B.i = (B.i + 1) % B.list.length;
  box.classList.add('bd-swap');
  setTimeout(() => { box.innerHTML = bubbleHTML(); box.classList.remove('bd-swap'); if(QO.tree3d && QO.tree3d.cheer && B.list.length > 1) QO.tree3d.cheer(); }, 220);
}
function start(){
  stop();
  if(B.list.length < 2) return;
  B.timer = setInterval(() => {
    if(document.hidden || QO.tabs.current() !== 'tree' || !document.querySelector('#body .tr-tree .bd-box')) return;
    next();
  }, 4500);
}
function stop(){ if(B.timer){ clearInterval(B.timer); B.timer = 0; } }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-bd="open"]'); if(!b) return;
  const id = b.dataset.q != null ? Number(b.dataset.q) : null;
  QO.tabs.show('explore');
  if(id != null && QO.explore && QO.explore.open) setTimeout(() => QO.explore.open(id), 0);
});
QO.bus.on('tab:show', id => { if(id !== 'tree') stop(); });
QO.bus.on('ready', () => { stop(); B.sig = ''; B.list = []; B.i = 0; });
QO.buddy = {mount:mount, next:next, lines:lines, _b:B};

if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('나무 · 과수원 친구 말풍선(내 질문을 돌려 말함·누르면 그 질문 일지)', async t => {
  await t.click('#nav [data-t="tree"]');
  const bub = await t.waitFor('#body .tr-tree .bd-bubble');
  t.expect(t.$('#body .tr-tree .bd-svg'), '3D 가 아니면 SVG 친구');
  const L = lines();
  t.expect(L.length >= 2 && L[0].lb === '내가 궁금한 것', '탐구 중인 질문부터');
  t.expect(bub.textContent.indexOf(cut(L[0].t, 46)) >= 0, '첫 말: ' + bub.textContent);
  next();
  await t.waitFor(() => (t.$('#body .tr-tree .bd-bubble') || {}).textContent.indexOf(cut(L[1].t, 46)) >= 0);
  const id = Number(t.$('#body .tr-tree .bd-bubble').dataset.q);
  await t.click('#body .tr-tree .bd-bubble');
  await t.waitFor(() => QO.tabs.current() === 'explore');
  await t.waitFor(() => { const e = document.querySelector('#sheet .sh-top'); return e && e.dataset.qid === String(id); });
  const c = document.querySelector('[data-xa="close"]'); if(c) c.click();
});
})();
