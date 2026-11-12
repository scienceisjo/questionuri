/* 내 생각 칸은 붙여넣기 막기 — 질문·다듬기·예상·알아볼 방법·알아낸 것·정리·여기까지·넓히기·AI와 견주기·모둠 일지 칸.
   출처 칸(x_fsrc)·차시 고르기 등은 그대로. Ctrl+V·오른쪽 클릭·Win+V·끌어 놓기 모두 막는다. */
(function(){
'use strict';
const IDS = /^x_(body|refine|predict|method|mplan|find|wrap|reached|extend|aicmp|stuckq|tried|samewhy|changed|rdq|rdsays|rdthink|rdguess|rdfound)$/;   // rd*: 책 보며 심기(read.js)
const isOwn = t => !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') &&
  ((t.id && IDS.test(t.id)) || (t.dataset && t.dataset.tgk != null));
let last = 0;
function say(){
  const now = Date.now(); if(now - last < 1500) return; last = now;
  const msg = '여기는 내 생각을 쓰는 칸이라 붙여넣기가 안 돼요. 내 말로 적어 볼까요?';
  if(window.QO && QO.ui && QO.ui.toast) QO.ui.toast(msg);
}
['paste', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  if(!isOwn(e.target)) return;
  e.preventDefault(); e.stopPropagation(); say();
}, true));
document.addEventListener('beforeinput', e => {
  if(/^insertFrom(Paste|Drop|PasteAsQuotation)$/.test(e.inputType || '') && isOwn(e.target)){ e.preventDefault(); say(); }
}, true);
})();
