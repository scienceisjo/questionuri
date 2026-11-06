/* 깨진 한글 입력 되살리기 — 옛 앱(질문과수원 1) index.html 의 「⌨️ 깨진 입력 되살리기」를 그대로 옮김(2026-11-05).
   태블릿·노트북 한글 입력기가 모드를 잃으면 세 가지로 깨진다.
     ① 전각   ｐｕｓｈ　ｅａｃｈ   ② 반각 자모  ﾡￜﾵﾼￆﾩﾷￜ   ③ 한영 전환 실패  dho qkfeork tjfh
   ①②는 무엇을 쳤는지 확정적이라 칸을 떠날 때 조용히 고친다(타이핑 중에 바꾸면 커서가 튄다).
   ③은 진짜 영어일 수도 있어서 칸 아래에서 물어본다(짧은 영어는 우연히 한글이 된다: the→솓).
   data-ime="off" 칸·비밀번호·숫자 칸은 건드리지 않는다. 쓰는 곳: QO.ime.fixWidth · maybeKorean · ask(el) */
(function(){
'use strict';
const QO = window.QO;
const JL = 'ᄀᄁᄂᄃᄄᄅᄆᄇᄈᄉᄊᄋᄌᄍᄎᄏᄐᄑᄒ';
const JV = 'ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ';
const JT = 'ᆨᆩᆪᆫᆬᆭᆮᆯᆰᆱᆲᆳᆴᆵᆶᆷᆸᆹᆺᆻᆼᆽᆾᆿᇀᇁᇂ';
const VMERGE = {'ᅩᅡ':'ᅪ', 'ᅩᅢ':'ᅫ', 'ᅩᅵ':'ᅬ', 'ᅮᅥ':'ᅯ', 'ᅮᅦ':'ᅰ', 'ᅮᅵ':'ᅱ', 'ᅳᅵ':'ᅴ'};
const TMERGE = {'ᆨᆺ':'ᆪ', 'ᆫᆽ':'ᆬ', 'ᆫᇂ':'ᆭ', 'ᆯᆨ':'ᆰ', 'ᆯᆷ':'ᆱ', 'ᆯᆸ':'ᆲ', 'ᆯᆺ':'ᆳ', 'ᆯᇀ':'ᆴ', 'ᆯᇁ':'ᆵ', 'ᆯᇂ':'ᆶ', 'ᆸᆺ':'ᆹ'};
const L2T = {'ᄀ':'ᆨ', 'ᄁ':'ᆩ', 'ᄂ':'ᆫ', 'ᄃ':'ᆮ', 'ᄅ':'ᆯ', 'ᄆ':'ᆷ', 'ᄇ':'ᆸ', 'ᄉ':'ᆺ', 'ᄊ':'ᆻ', 'ᄋ':'ᆼ', 'ᄌ':'ᆽ', 'ᄎ':'ᆾ', 'ᄏ':'ᆿ', 'ᄐ':'ᇀ', 'ᄑ':'ᇁ', 'ᄒ':'ᇂ'};
const isSyl = c => { const o = c.charCodeAt(0); return o >= 0xAC00 && o <= 0xD7A3; };
function split(c){ const i = c.charCodeAt(0) - 0xAC00; return {l:JL[Math.floor(i / 588)], v:JV[Math.floor((i % 588) / 28)], t:(i % 28) ? JT[i % 28 - 1] : ''}; }
function join(l, v, t){ return String.fromCharCode(0xAC00 + (JL.indexOf(l) * 21 + JV.indexOf(v)) * 28 + (t ? JT.indexOf(t) + 1 : 0)); }

/* ①② 전각 영문·전각 공백·반각 자모를 정상 한글/ASCII 로 */
function fixWidth(src){
  const s = String(src || '').normalize('NFKC'), out = [];
  for(const ch of s){
    const prev = out.length ? out[out.length - 1] : '';
    if(prev && isSyl(prev)){
      const p = split(prev);
      if(!p.t && JV.indexOf(ch) >= 0){ const nv = VMERGE[p.v + ch]; if(nv){ out[out.length - 1] = join(p.l, nv, ''); continue; } }
      if(!p.t && L2T[ch]){ out[out.length - 1] = join(p.l, p.v, L2T[ch]); continue; }
      if(p.t && L2T[ch]){ const nt = TMERGE[p.t + L2T[ch]]; if(nt){ out[out.length - 1] = join(p.l, p.v, nt); continue; } }
    }
    out.push(ch);
  }
  return out.join('');
}

/* ③ 영어로 쳐진 한글 되돌리기 */
const QK = {q:'ᄇ', w:'ᄌ', e:'ᄃ', r:'ᄀ', t:'ᄉ', y:'ᅭ', u:'ᅧ', i:'ᅣ', o:'ᅢ', p:'ᅦ', a:'ᄆ', s:'ᄂ', d:'ᄋ', f:'ᄅ', g:'ᄒ', h:'ᅩ', j:'ᅥ', k:'ᅡ', l:'ᅵ',
  z:'ᄏ', x:'ᄐ', c:'ᄎ', v:'ᄑ', b:'ᅲ', n:'ᅮ', m:'ᅳ', Q:'ᄈ', W:'ᄍ', E:'ᄄ', R:'ᄁ', T:'ᄊ', O:'ᅤ', P:'ᅨ'};
Object.keys(QK).forEach(k => { const u = k.toUpperCase(); if(!(u in QK)) QK[u] = QK[k]; });
function assemble(buf){
  const out = []; let made = 0, orphan = 0, i = 0;
  while(i < buf.length){
    const c = buf[i];
    if(JL.indexOf(c) >= 0 && i + 1 < buf.length && JV.indexOf(buf[i + 1]) >= 0){
      const l = c; i++;
      let v = buf[i]; i++;
      if(i < buf.length && VMERGE[v + buf[i]]){ v = VMERGE[v + buf[i]]; i++; }
      let t = '';
      if(i < buf.length && L2T[buf[i]] && !(i + 1 < buf.length && JV.indexOf(buf[i + 1]) >= 0)){
        t = L2T[buf[i]]; i++;
        if(i < buf.length && L2T[buf[i]] && TMERGE[t + L2T[buf[i]]] && !(i + 1 < buf.length && JV.indexOf(buf[i + 1]) >= 0)){ t = TMERGE[t + L2T[buf[i]]]; i++; }
      }
      out.push(join(l, v, t)); made++;
    }else{ out.push(c); orphan++; i++; }
  }
  return {text:out.join(''), made:made, orphan:orphan};
}
function qwertyToHan(src){
  let out = '', buf = [], made = 0, orphan = 0;
  const flush = () => { const r = assemble(buf); out += r.text; made += r.made; orphan += r.orphan; buf = []; };
  for(const ch of String(src || '')){ if(QK[ch]) buf.push(QK[ch]); else{ flush(); out += ch; } }
  flush();
  return {text:out, made:made, orphan:orphan};
}
/* 임계값 근거(옛 앱 실측): 진짜 영어 최고 0.67, 영어로 친 한글 최저 0.83 → 0.75. 6글자 미만은 보지 않는다 */
function maybeKorean(src){
  const s = String(src || ''), letters = (s.match(/[A-Za-z]/g) || []).length;
  if(letters < 6 || letters / s.length < 0.6) return null;
  const r = qwertyToHan(s), total = r.made + r.orphan, sc = total ? r.made / total : 0;
  if(sc < 0.75 || r.text === s) return null;
  return {text:r.text, score:sc};
}

/* 칸 아래 「이렇게 쓰려던 거예요?」 */
const keep = new Set();                       // 「영어가 맞아요」라고 답한 글
let owner = null;                             // 지금 상자가 붙은 칸 — 다른 칸이 빠져나갈 때 남의 상자를 닫지 않게
let pend = null;                              // {id, value, fixed} — 화면이 다시 그려져도 같은 칸·같은 글이면 상자를 다시 붙인다
function chipClose(){ const c = document.getElementById('qo-ime'); if(c) c.remove(); owner = null; pend = null; }
function closeFor(el){ if(owner === el) chipClose(); }
function chip(el, fixed){
  chipClose();
  owner = el;
  if(el.id) pend = {id:el.id, value:el.value, fixed:fixed};
  const box = document.createElement('div');
  box.id = 'qo-ime'; box.className = 'qo-ime'; box.setAttribute('role', 'alert');
  box.innerHTML = '<div class="t">자판이 영어로 되어 있었나 봐요. 이렇게 쓰려던 거예요?</div><div class="g"></div>' +
    '<div class="b"><button type="button" class="btn sm" data-ime="yes">네, 바꿔 줘요</button><button type="button" class="btn line sm" data-ime="no">영어가 맞아요</button></div>';
  box.querySelector('.g').textContent = fixed;
  el.parentNode.insertBefore(box, el.nextSibling);
  box.querySelector('[data-ime="yes"]').onclick = () => { el.value = fixed; el.dispatchEvent(new Event('input', {bubbles:true})); chipClose(); try{ el.focus(); }catch(_){} };
  box.querySelector('[data-ime="no"]').onclick = () => { keep.add(el.value); chipClose(); try{ el.focus(); }catch(_){} };
}
function skip(el){
  if(!el || !el.tagName || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return true;
  if(el.dataset && el.dataset.ime === 'off') return true;
  const ty = (el.type || 'text').toLowerCase();
  return ty === 'password' || ty === 'number' || ty === 'email' || ty === 'date' || ty === 'checkbox' || ty === 'radio';
}
/* 조용히 고치고, 영타면 묻는다. 물어보는 중이면 true */
function ask(el){
  if(skip(el)) return false;
  const raw = el.value || '';
  if(!raw.trim()){ closeFor(el); return false; }
  const w = fixWidth(raw);
  if(w !== raw){ el.value = w; el.dispatchEvent(new Event('input', {bubbles:true})); }
  const ko = maybeKorean(el.value);
  if(ko && !keep.has(el.value)){ chip(el, ko.text); return true; }
  closeFor(el);
  return false;
}
document.addEventListener('focusout', e => { const el = e.target; if(!skip(el)) setTimeout(() => ask(el), 0); }, true);   // 버튼 누르기가 먼저
new MutationObserver(() => {
  if(!pend || document.getElementById('qo-ime')) return;
  const el = document.getElementById(pend.id);
  if(el && el.value === pend.value){ const f = pend.fixed; chip(el, f); } else pend = null;
}).observe(document.body, {childList:true, subtree:true});

const st = document.createElement('style');
st.textContent = '.qo-ime{margin:8px 0 4px;padding:10px 12px;border:1px solid #9FCFD2;border-radius:10px;background:#EEF8F8;font-size:14px;word-break:keep-all}' +
  '.qo-ime .t{color:#155A5F;font-weight:700}.qo-ime .g{margin:6px 0 8px;padding:6px 8px;background:#fff;border-radius:6px;color:#2B3A2C}' +
  '.qo-ime .b{display:flex;gap:8px;flex-wrap:wrap}.qo-ime .b .btn{min-height:44px}';
document.head.appendChild(st);

QO.ime = {fixWidth:fixWidth, qwertyToHan:qwertyToHan, maybeKorean:maybeKorean, ask:ask, close:chipClose};
})();
