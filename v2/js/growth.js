/* 나의 성장 — 따로 탭(2026-11-11, 사용자 「나의 성장이 중요한 요소니까 탭 하나로」). 예전엔 「내 나무」 탭 오른쪽 아래 카드.
   2026-11-13 꾸밈 + 「나의 성장 기록」(SQL v2_09 growth_notes). 글만 늘어놓던 모양을 카드·그림으로 바꿨다.
   · 맨 위 장면: 새싹에서 자라는 줄기, 지금까지 지나온 탐구 칸(심기~넓히기)이 마디마다 잎으로 — 한 줄 요약
   · 나의 성장 기록: 빈칸 틀 넷(생각이 바뀐 것·질문이 달라진 것·내가 잘한 것·다음에 해 볼 것) 중 하나를 골라
     한 문장을 완성한다. 틀 옆에 내 기록에서 뽑은 실마리. 저장한 기록은 날짜와 함께 줄로(내 글은 지울 수 있음)
   · 내 질문이 어떻게 달라졌나: 처음 심은 질문 → 최근에 심은 질문(연구수업 「내 질문 돌아보기」와 이어짐)
   · 다듬기 전과 뒤(최근 여섯) · 다듬지 않고 간 질문의 까닭(v2_09 journal.refine_skip)
   · 단원마다 내 질문(수업 차례대로 가로 띠) — 점 하나가 질문 하나, 누르면 펼침
   · 내 발자국(「내 나무」 탭에서 옮김) — 숫자 없이 칸 종류 아이콘이 길처럼
   · 책 보며 알게 된 낱말(read.js: 내 짐작 → 찾은 뜻)
   · 아직 모르는 것 — 다음 질문의 씨앗
   숫자를 크게 보이지 않는다(설계서 §1-7). 랭킹·업적은 넣지 않는다.
   데이터 함수: addGrowthNote(frame, parts, body) · myGrowthNotes() · deleteGrowthNote(id) — 진짜(Supabase)·흉내(?mock=1) 둘 다 여기서.
   선생님 쪽 읽기(classGrowthNotes)는 teacher.html 이 이 파일을 싣지 않아서 teacher.js 에 있다. */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const shown = q => (q.refined_text && String(q.refined_text).trim()) ? q.refined_text : q.text;
const mdK = ts => { const d = U.kstDay(ts).split('-').map(Number); return d[1] + '월 ' + d[2] + '일'; };
const byNew = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
const byOld = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
const clen = s => Array.from(String(s == null ? '' : s)).length;
const GS = {unitOpen:null, frame:null, draft:{}, notes:null, loading:false, soon:false, loadErr:false, seq:0, animated:false, dirty:false, err:''};

/* ═══════════ 아이콘(이모지 대신 선 그림) ═══════════ */
const SV = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
const IC = {
  change:   SV + '<path d="M4 8h12l-3.5-3.5"/><path d="M20 16H8l3.5 3.5"/></svg>',
  question: SV + '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/><path d="M9.7 9.6a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.4"/><path d="M12 16.6h.01"/></svg>',
  proud:    SV + '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/></svg>',
  next:     SV + '<path d="M4 12h14"/><path d="M13 6.5l5.5 5.5-5.5 5.5"/></svg>',
  write:    SV + '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  path:     SV + '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.2 16.8C13 15.6 11 8.6 15.8 7.2"/></svg>',
  refine:   SV + '<path d="M4 6h10"/><path d="M4 11h7"/><path d="M4 16h4"/><path d="M13 19.5l7-7-2.5-2.5-7 7v2.5z"/></svg>',
  units:    SV + '<circle cx="5" cy="6.5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="17.5" r="2"/><path d="M6.7 7.8l3.6 2.9M13.7 13.3l3.6 2.9"/></svg>',
  foot:     SV + '<path d="M8 3.5c1.9 0 2.9 2 2.9 4.6S10 12.4 8 12.4 5.1 10.7 5.1 8.1 6.1 3.5 8 3.5z"/><path d="M6 15h4v1.6a2 2 0 0 1-4 0z"/><path d="M16 7.5c1.9 0 2.9 2 2.9 4.6S18 16.4 16 16.4s-2.9-1.7-2.9-4.3.9-4.6 2.9-4.6z"/><path d="M14 19h4v.2a2 2 0 0 1-4 0z"/></svg>',
  book:     SV + '<path d="M3 5.5c2.5-1 5.5-1 9 1 3.5-2 6.5-2 9-1v13c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z"/><path d="M12 6.5v13"/></svg>',
  seed:     SV + '<path d="M12 21c-3.9 0-6-2.9-6-6.4S8.9 7 12 4c3.1 3 6 7.1 6 10.6S15.9 21 12 21z"/><path d="M12 21v-6.5"/><path d="M12 16c-1.6-.4-2.6-1.7-2.6-3.4"/></svg>',
  trash:    SV + '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/></svg>',
  arrow:    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h15"/><path d="M13.5 6.5l5.5 5.5-5.5 5.5"/></svg>',
  /* 발자국 칸 */
  predict:  SV + '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
  method:   SV + '<path d="M9 3h6"/><path d="M10 3v6l-5 9.2A1.9 1.9 0 0 0 6.7 21h10.6a1.9 1.9 0 0 0 1.7-2.8L14 9V3"/><path d="M7.4 15h9.2"/></svg>',
  find:     SV + '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  wrap:     SV + '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 12.2l2 2 4-4.4"/></svg>',
  extend:   SV + '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 16V9a3 3 0 0 1 3-3h7"/><path d="M8 18h8"/></svg>'
};
const head = (ic, title, sub) => '<div class="gr-hd"><span class="gr-ic">' + IC[ic] + '</span><h2>' + esc(title) + '</h2>' + (sub ? '<span class="gr-sub">' + esc(sub) + '</span>' : '') + '</div>';

/* ═══════════ 내 자료에서 뽑기 ═══════════ */
function mine(){ return (QO.state.questions || []).filter(q => q && q.text); }
const wrapText = w => !w ? '' : String((w.mode === 'unknown' ? w.reached : w.text) || '').trim();
function wonders(qs){
  const out = [];
  qs.forEach(q => {
    const j = q.journal || {}, w = j.wrap || {};
    if(w.mode === 'unknown' && String(w.stuckQ || '').trim()) out.push({t:w.stuckQ, at:q.created_at, from:shown(q), id:q.id});
    else if(String(q.still_wondering || '').trim()) out.push({t:q.still_wondering, at:q.created_at, from:shown(q), id:q.id});
  });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
/* 지나온 탐구 칸 — 질문 하나라도 그 칸을 채웠으면(발자국도 함께 본다) */
function reachedSteps(qs){
  const r = {};
  qs.forEach(q => { const v = QO.journal.view(q); QO.K.STEPS.forEach(s => { if(!r[s.k] && QO.journal.stepDone(v, s.k)) r[s.k] = true; }); });
  (QO.state.footprints || []).forEach(f => { r[f.step] = true; });
  return r;
}

/* ═══════════ 맨 위 장면 — 새싹에서 자라는 줄기 ═══════════ */
const SHORT = {plant:'심기', refine:'다듬기', predict:'예상', method:'방법', find:'찾기', wrap:'정리', extend:'넓히기'};
const f1 = n => n.toFixed(1);
function heroHTML(qs){
  const STEPS = QO.K.STEPS, N = STEPS.length, W = 340;
  const reached = qs.length ? reachedSteps(qs) : {};
  const pts = STEPS.map((s, i) => { const t = i / (N - 1); return [28 + t * 284, 116 - 84 * Math.pow(t, 1.25)]; });
  let last = -1; STEPS.forEach((s, i) => { if(reached[s.k]) last = i; });
  /* 마디를 지나는 부드러운 줄기(Catmull-Rom → 3차 베지어). 칸마다 따로 그려서 앞뒤 모양이 같다 */
  const seg = i => {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    return ' C' + f1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
  };
  const run = (a, b) => { let d = 'M' + f1(pts[a][0]) + ' ' + f1(pts[a][1]); for(let i = a; i < b; i++) d += seg(i); return d; };
  const anim = !GS.animated && qs.length > 0;
  GS.animated = GS.animated || qs.length > 0;
  let s = '<svg class="gh-svg' + (anim ? ' anim' : '') + '" viewBox="0 0 ' + W + ' 136" role="img" aria-label="' + esc(heroAria(reached)) + '">' +
    '<path class="gh-hill2" d="M0 122 C70 112 150 110 210 116 S300 110 340 106 V136 H0Z"/>' +
    '<path class="gh-hill" d="M0 126 C80 118 170 118 240 124 S320 122 340 120 V136 H0Z"/>';
  if(last > 0) s += '<path class="gh-stem" pathLength="1" d="' + run(0, last) + '"/>';
  if(last < N - 1) s += '<path class="gh-rest" d="' + run(Math.max(last, 0), N - 1) + '"/>';
  STEPS.forEach((st, i) => {
    const p = pts[i], on = !!reached[st.k];
    if(i === 0){      // 심기 — 땅에 묻힌 씨앗과 떡잎
      s += '<g class="gh-node' + (on ? ' on' : '') + '" data-step="plant" style="--i:0"><ellipse class="gh-seed" cx="' + f1(p[0]) + '" cy="' + f1(p[1] + 5) + '" rx="7" ry="4.6"/>' +
        (on ? '<path class="gh-leaf" d="M' + f1(p[0]) + ' ' + f1(p[1]) + ' c-2-6-8-8-12-6 c2 5 7 7 12 6z"/><path class="gh-leaf" d="M' + f1(p[0]) + ' ' + f1(p[1]) + ' c2-6 8-8 12-6 c-2 5-7 7-12 6z"/>' : '') + '</g>';
      return;
    }
    if(!on){ s += '<g class="gh-node" data-step="' + st.k + '"><circle class="gh-bud" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="4"/></g>'; return; }
    const z = 0.8 + i * 0.09;      // 위로 갈수록 잎이 조금 크다
    const leaf = 'M0 0 C4 -5 11 -5 15 0 C11 5 4 5 0 0Z';
    s += '<g class="gh-node on" data-step="' + st.k + '" style="--i:' + i + '">' +
      '<path class="gh-leaf" transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ') rotate(-128) scale(' + z.toFixed(2) + ')" d="' + leaf + '"/>' +
      '<path class="gh-leaf b" transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ') rotate(-24) scale(' + z.toFixed(2) + ')" d="' + leaf + '"/>' +
      '<circle class="gh-knot" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="2.6"/></g>';
  });
  s += '</svg>';
  const labels = '<div class="gh-steps" aria-hidden="true">' + STEPS.map((st, i) => '<span class="' + (reached[st.k] ? 'on' : '') + '" style="left:' + (pts[i][0] / W * 100).toFixed(2) + '%">' + esc(SHORT[st.k] || st.n) + '</span>').join('') + '</div>';
  return '<div class="card gr-hero" data-k="' + esc(heroKey(qs)) + '">' + '<div class="gh-scene">' + s + labels + '</div>' +
    '<div class="gh-txt"><p class="gh-sum">' + esc(summary(qs)) + '</p><p class="gh-cap">잎이 난 마디는 내가 한 번이라도 지나온 탐구 칸이에요.</p></div></div>';
}
function heroKey(qs){ const r = qs.length ? reachedSteps(qs) : {}; return QO.K.STEPS.map(st => r[st.k] ? 1 : 0).join('') + '|' + summary(qs); }
function heroAria(reached){
  const on = QO.K.STEPS.filter(s => reached[s.k]).map(s => s.n), off = QO.K.STEPS.filter(s => !reached[s.k]).map(s => s.n);
  return '지나온 탐구 칸: ' + (on.length ? on.join(', ') : '아직 없음') + (off.length ? '. 아직 안 간 칸: ' + off.join(', ') : '');
}
function summary(qs){
  if(!qs.length) return '아직 심은 질문이 없어요. 질문을 하나 심으면 줄기가 자라기 시작해요.';
  const w = qs.filter(q => QO.journal.view(q).d.wrap).length;
  return w ? '질문 ' + qs.length + '개를 심었고, 그중 ' + w + '개는 정리까지 갔어요.' : '질문 ' + qs.length + '개를 심었어요. 정리까지 간 질문은 아직 없어요.';
}

/* ═══════════ 나의 성장 기록 — 빈칸 틀 넷 ═══════════
   parts: k(빈칸 이름) · lead(앞말) · j(받침 있을 때/없을 때 조사) · jd(조사를 정하지 못할 때 보이는 꼴) · trail(뒷말) · dot(끝에 마침표) */
const FRAMES = [
  {k:'change', n:'생각이 바뀐 것', d:'처음 생각과 지금 생각', parts:[
    {k:'before', lead:'처음에는', j:['이라고', '라고'], jd:'(이)라고', trail:'생각했는데,', ph:'그때 내 생각'},
    {k:'now', lead:'지금은', j:['이라고', '라고'], jd:'(이)라고', trail:'생각해요.', ph:'지금 내 생각'}]},
  {k:'question', n:'질문이 달라진 것', d:'예전 질문과 요즘 질문', parts:[
    {k:'before', lead:'예전 내 질문은', trail:'했는데,', ph:'예) 낱말 뜻을 묻곤'},
    {k:'now', lead:'요즘은', trail:'해요.', ph:'예) 왜 그런지 까닭을 묻곤'}]},
  {k:'proud', n:'내가 잘한 것', d:'잘한 것과 그 까닭', parts:[
    {k:'what', lead:'이번에 내가 잘한 것은', j:['이에요', '예요'], jd:'(이)에요', trail:'', dot:true, ph:'예) 출처를 두 곳에서 찾은 것'},
    {k:'why', lead:'왜냐하면', trail:'', dot:true, ph:'예) 두 곳 말이 달라서 더 알아봤거든요'}]},
  {k:'next', n:'다음에 해 볼 것', d:'다음에 해 보고 싶은 것', parts:[
    {k:'what', lead:'다음에는', j:['을', '를'], jd:'을(를)', trail:'해 보고 싶어요.', ph:'예) 실험으로 직접 확인하는 것'}]}
];
const FR = k => FRAMES.find(f => f.k === k) || null;
const frameName = k => (FR(k) || {}).n || k || '';
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
/* 받침이 있으면 j[0], 없으면 j[1]. 한글로 끝나지 않으면(숫자·영어) 괄호 꼴 그대로 */
function josa(word, p){
  const ch = Array.from(word).pop() || '', o = ch.charCodeAt(0);
  if(o >= 0xAC00 && o <= 0xD7A3) return (o - 0xAC00) % 28 ? p.j[0] : p.j[1];
  return p.jd;
}
function piece(p, raw){
  let v = clean(raw);
  if(!v){ const tail = ((p.jd ? p.jd + ' ' : '') + p.trail).trim(); return p.lead + ' ____' + (tail ? ' ' + tail : '') + (p.dot ? '.' : ''); }
  if(p.j || p.trail) v = v.replace(/[\s.,!?~…。]+$/, '');
  let out = p.lead + ' ' + v + (p.j ? josa(v, p) : '') + (p.trail ? ' ' + p.trail : '');
  if(p.dot && !/[.!?…。]$/.test(out)) out += '.';
  return out;
}
function sentence(fk, vals){ const f = FR(fk); if(!f) return ''; return f.parts.map(p => piece(p, (vals || {})[p.k])).join(' '); }
const draftOf = fk => (GS.draft[fk] = GS.draft[fk] || {});

/* 틀 옆 실마리 — 내 자료만, 없으면 줄을 숨긴다 */
function cluesFor(fk, qs){
  const out = [], views = qs.map(q => ({q, v:QO.journal.view(q)}));
  const newest = (a, b) => byNew(a.q, b.q);
  if(fk === 'change'){
    const both = views.filter(x => x.v.d.predict && x.v.d.predict.length && wrapText(x.v.d.wrap)).sort(newest)[0];
    if(both){
      out.push({lb:'그때 내 예상', t:both.v.d.predict[0].text, from:shown(both.q)});
      out.push({lb:'정리한 것', t:wrapText(both.v.d.wrap), from:shown(both.q)});
    } else {
      const p = views.filter(x => x.v.d.predict && x.v.d.predict.length).sort(newest)[0];
      const w = views.filter(x => wrapText(x.v.d.wrap)).sort(newest)[0];
      if(p) out.push({lb:'내 예상', t:p.v.d.predict[0].text, from:shown(p.q)});
      if(w) out.push({lb:'정리한 것', t:wrapText(w.v.d.wrap), from:shown(w.q)});
    }
  } else if(fk === 'question'){
    if(qs.length >= 2){
      const t = qs.slice().sort(byOld);
      out.push({lb:'처음 심은 질문 · ' + mdK(t[0].created_at), t:shown(t[0])});
      out.push({lb:'최근에 심은 질문 · ' + mdK(t[t.length - 1].created_at), t:shown(t[t.length - 1])});
    }
  } else if(fk === 'proud'){
    const cl = id => (QO.store && QO.store.cluesOf ? QO.store.cluesOf(id) : []).length;
    const pick = views.slice().sort(newest).map(x => ({x, why:cl(x.q.id) ? '단서를 받은 질문' : x.q.fruit_kind === 'fruit' ? '열매가 된 질문' : x.q.fruit_kind === 'fog' ? '안개 열매가 된 질문' : x.v.d.wrap ? '정리까지 간 질문' : ''}))
      .filter(y => y.why).slice(0, 2);
    pick.forEach(y => out.push({lb:y.why, t:shown(y.x.q)}));
  } else if(fk === 'next'){
    const w = wonders(qs)[0];
    if(w) out.push({lb:'아직 모르는 것', t:w.t, from:w.from});
  }
  return out;
}
const SOON_RE = /PGRST202|PGRST205|42P01|42883|schema cache|does not exist/i;
const isSoon = e => !!e && (e.soon === true || SOON_RE.test(String(e.message || '') + ' ' + String(e.code || '')));
function loadNotes(){
  if(!QO.state.me) return;
  const my = ++GS.seq, who = QO.state.me.id;
  GS.loading = true; GS.loadErr = false;
  return Promise.resolve().then(() => QO.api.myGrowthNotes()).then(r => {
    if(my !== GS.seq || !QO.state.me || QO.state.me.id !== who) return;
    GS.notes = (r || []).slice().sort((a, b) => byNew(a, b) || (b.id - a.id)); GS.soon = false;
  }, e => {
    if(my !== GS.seq) return;
    if(isSoon(e)){ GS.soon = true; GS.notes = []; }
    else { GS.loadErr = true; QO.err(e, 'growth:notes'); }
  }).finally(() => { if(my === GS.seq){ GS.loading = false; soft(); } });
}
function writeHTML(qs){
  let h = '<div class="card gr-write" id="gr_write">' + head('write', '나의 성장 기록');
  if(GS.soon) return h + '<p class="hint gw-soon">성장 기록은 선생님이 준비를 마치면 쓸 수 있어요.</p></div>';
  if(GS.notes === null){
    if(!GS.loading && !GS.loadErr) loadNotes();
    if(GS.loadErr) return h + '<p class="hint">기록을 불러오지 못했어요. <button type="button" class="link" data-gr="reload">다시 읽기</button></p></div>';
    return h + '<p class="hint">기록을 불러오는 중이에요.</p></div>';
  }
  h += '<p class="hint gw-lead">요즘 내가 어떻게 자랐는지 한 문장으로 남겨요. 틀을 하나 고르면 빈칸이 열려요.</p>';
  const f = FR(GS.frame);
  h += '<div class="gw-grid"><div class="gw-main"><div class="gw-frames" role="group" aria-label="성장 기록 틀 고르기">' + FRAMES.map(x => {
    const on = !!f && f.k === x.k;
    return '<button type="button" class="gw-f f-' + x.k + (on ? ' on' : '') + '" data-gr="frame" data-f="' + x.k + '" aria-pressed="' + on + '">' +
      '<span class="gw-fi">' + IC[x.k] + '</span><b>' + esc(x.n) + '</b><small>' + esc(x.d) + '</small></button>';
  }).join('') + '</div>';
  if(f) h += formHTML(f, qs);
  h += '</div><div class="gw-side">' + logHTML() + '</div></div>';
  return h + '</div>';
}
function formHTML(f, qs){
  const d = draftOf(f.k), cl = cluesFor(f.k, qs);
  let h = '<div class="gw-form f-' + f.k + '"><div class="gw-sent">' + f.parts.map((p, i) => {
    const id = 'gr_in_' + f.k + '_' + p.k, tail = (p.jd || p.trail) ? ((p.jd ? p.jd + ' ' : '') + p.trail).trim() + (p.dot ? '.' : '') : '';
    /* data-tgk="" — 붙여넣기 막기(nopaste.js 는 data-tgk 가 붙은 칸을 막는다. 값이 비어 있어 together.js 초안 저장에는 안 걸린다) */
    return '<div class="gw-line"><label class="gw-word" for="' + id + '">' + esc(p.lead) + '</label>' +
      '<textarea class="inp gw-in" id="' + id + '" rows="1" maxlength="120" data-grin="' + f.k + ':' + p.k + '" data-tgk="" placeholder="' + esc(p.ph) + '"' +
      (tail ? ' aria-describedby="' + id + '_t"' : '') + ' autocomplete="off">' + esc(d[p.k] || '') + '</textarea>' +
      (tail ? '<span class="gw-word" id="' + id + '_t">' + esc(tail) + '</span>' : '') + '</div>';
  }).join('') + '</div>';
  if(cl.length) h += '<div class="gw-clue"><div class="gw-clh">' + IC.seed + '<b>내 기록에서 찾은 실마리</b><small>보고 내 말로 적어요</small></div>' + cl.map(c =>
    '<div class="gw-cli"><span class="lb">' + esc(c.lb) + '</span><p>' + esc(c.t) + '</p>' + (c.from && c.from !== c.t ? '<small>「' + esc(c.from) + '」</small>' : '') + '</div>').join('') + '</div>';
  h += '<div class="gw-prev"><span class="lb">완성 문장</span><p id="gr_prev" aria-live="polite">' + esc(sentence(f.k, d)) + '</p></div>' +
    '<div class="err" id="gr_err" role="alert">' + esc(GS.err) + '</div>' +
    '<div class="row gw-acts"><button type="button" class="btn line sm" data-gr="close">닫기</button><button type="button" class="btn sm" data-gr="save">기록 남기기</button></div></div>';
  return h;
}
function logHTML(){
  const ns = GS.notes || [];
  let h = '<div class="gw-log"><div class="gw-logh">내가 남긴 기록</div>';
  if(!ns.length) return h + '<p class="gw-empty">아직 남긴 기록이 없어요. 틀 하나를 골라 처음 기록을 남겨 봐요.</p></div>';
  return h + '<ol class="gw-tl">' + ns.map(n => '<li class="gw-ti f-' + esc(n.frame) + '" data-id="' + n.id + '"><span class="gw-dot">' + (IC[n.frame] || IC.write) + '</span>' +
    '<div class="gw-tb"><div class="gw-tm"><b>' + esc(frameName(n.frame)) + '</b><time datetime="' + esc(n.created_at) + '">' + esc(mdK(n.created_at)) + '</time></div><p>' + esc(n.body) + '</p></div>' +
    '<button type="button" class="gw-del" data-gr="del" data-id="' + n.id + '" aria-label="' + esc(mdK(n.created_at) + ' ' + frameName(n.frame) + ' 기록 지우기') + '">' + IC.trash + '</button></li>').join('') + '</ol></div>';
}
function validate(f){
  const d = draftOf(f.k), prev = [];
  for(const p of f.parts){
    const v = clean(d[p.k]);
    if(!v) return {err:'빈칸을 모두 채워 주세요.', k:p.k};
    if(clen(v.replace(/\s/g, '')) < 2) return {err:'빈칸을 조금 더 자세히 적어 주세요.', k:p.k};
    const jw = QO.check.junkWhy(v, prev); if(jw) return {err:jw, k:p.k};
    prev.push(v);
  }
  const body = sentence(f.k, d);
  if(clen(body) < 10) return {err:'열 글자 넘게 적어 주세요', k:f.parts[0].k};
  const parts = {}; f.parts.forEach(p => { parts[p.k] = clean(d[p.k]); });
  return {parts, body};
}
async function save(btn){
  const f = FR(GS.frame); if(!f) return;
  const errEl = document.getElementById('gr_err');
  const v = validate(f);
  if(v.err){
    GS.err = v.err; if(errEl) errEl.textContent = v.err;
    const el = document.getElementById('gr_in_' + f.k + '_' + v.k); if(el) el.focus();
    return;
  }
  GS.err = '';
  let soonHit = false;
  const id = await U.busy(btn, () => QO.api.addGrowthNote(f.k, v.parts, v.body).catch(e => { if(isSoon(e)){ soonHit = true; return null; } throw e; }), {errEl});
  if(soonHit){ GS.soon = true; rr(); return; }
  if(id === undefined){ GS.err = errEl ? errEl.textContent : ''; return; }
  GS.draft[f.k] = {}; GS.frame = null; GS.err = '';
  GS.notes = [{id:Number(id), frame:f.k, parts:v.parts, body:v.body, created_at:new Date().toISOString()}].concat(GS.notes || []);
  U.toast('성장 기록을 남겼어요.');
  rr();
  loadNotes();
}
async function del(btn){
  const id = Number(btn.dataset.id);
  const ok = await U.confirm('이 기록을 지울까요? 지운 기록은 되돌릴 수 없어요.', {ok:'지우기', cancel:'그대로 두기', danger:true});
  if(!ok) return;
  const r = await U.busy(btn, () => QO.api.deleteGrowthNote(id));
  if(r === undefined) return;
  GS.notes = (GS.notes || []).filter(n => Number(n.id) !== id);
  U.toast('기록을 지웠어요.');
  rr();
}

/* ═══════════ 아래 구역들 ═══════════ */
/* 처음 → 최근 */
function changeHTML(qs){
  let h = '<div class="card gr-box gr-card">' + head('path', '내 질문이 어떻게 달라졌나');
  if(qs.length < 2) return h + '<div class="hint">질문을 두 개 이상 심으면 처음 질문과 요즘 질문을 나란히 볼 수 있어요.</div></div>';
  const t = qs.slice().sort(byOld), first = t[0], last = t[t.length - 1];
  h += '<div class="gr-pair gc-pair"><div class="gc-q"><span class="lb">처음 심은 질문</span><p>' + esc(shown(first)) + '</p><time>' + esc(mdK(first.created_at)) + '</time></div>' +
    '<span class="gc-ar">' + IC.arrow + '</span>' +
    '<div class="gc-q now"><span class="lb">최근에 심은 질문</span><p>' + esc(shown(last)) + '</p><time>' + esc(mdK(last.created_at)) + '</time></div></div>' +
    '<div class="hint">두 질문을 견줘 봐요. 무엇을 더 구체적으로 묻게 되었나요?</div>';
  const nAfter = qs.filter(q => q.phase === 'after').length, nKid = qs.filter(q => q.parent_id).length;
  return h + '<div class="gr-line">수업 닫기 질문 ' + nAfter + '개 · 이어서 심은 질문 ' + nKid + '개</div></div>';
}
/* 다듬기 전과 뒤 · 다듬지 않고 간 까닭 */
function refineHTML(qs){
  const t = qs.slice().sort(byNew);
  const refined = t.filter(q => q.refined_text && String(q.refined_text).trim() && q.refined_text !== q.text).slice(0, 6);
  const skipped = t.filter(q => { const s = (q.journal || {}).refine_skip; return s && String(s.reason || '').trim(); }).slice(0, 3);
  let h = '<div class="card gr-box gr-refine">' + head('refine', '다듬기 전과 뒤');
  if(!refined.length && !skipped.length) return h + '<div class="hint">질문을 다듬으면 다듬기 전과 뒤가 여기에 짝지어 보여요.</div></div>';
  h += refined.map(q => '<div class="gf-row"><p class="gf-old"><span class="sr">다듬기 전 </span>' + esc(q.text) + '</p><span class="gf-ar">' + IC.arrow + '</span><p class="gf-new"><span class="sr">다듬은 뒤 </span>' + esc(q.refined_text) + '</p></div>').join('');
  h += skipped.map(q => {
    const sk = q.journal.refine_skip, chk = (Array.isArray(sk.checks) ? sk.checks : []).filter(c => typeof c === 'string' && c.trim()).slice(0, 6);
    return '<div class="gf-row gf-skip"><p class="gf-new">' + esc(q.text) + '</p><div class="gf-why"><span class="lb">다듬지 않은 까닭</span>' + esc(sk.reason) +
      (chk.length ? '<ul class="gf-chk" aria-label="체크한 것">' + chk.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '') + '</div></div>';
  }).join('');
  return h + '</div>';
}
/* 단원마다 — 수업 차례(explore UNITS)대로 가로 띠, 질문이 있는 단원만 */
function unitsHTML(qs){
  const order = (QO.explore && QO.explore.UNITS) || QO.K.UNITS || [];
  const by = new Map();
  qs.forEach(q => { const u = q.unit || '단원 안 고름'; if(!by.has(u)) by.set(u, []); by.get(u).push(q); });
  if(!by.size) return '';
  const keys = Array.from(by.keys()).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
  if(GS.unitOpen && !by.has(GS.unitOpen)) GS.unitOpen = null;
  let h = '<div class="card gr-box gr-units">' + head('units', '단원마다 내 질문') + '<div class="gu-strip" role="group" aria-label="단원(수업 차례)">' + keys.map(k => {
    const list = by.get(k), open = GS.unitOpen === k, fr = list.filter(q => q.fruit_kind).length;
    return '<button type="button" class="gr-uh' + (open ? ' on' : '') + '" data-gr="unit" data-u="' + esc(k) + '" aria-expanded="' + open + '" aria-controls="gr_ub">' +
      '<span class="nm">' + esc(k) + '</span><span class="gr-dots" aria-label="질문 ' + list.length + '개' + (fr ? ', 열매 ' + fr + '개' : '') + '">' +
      list.slice().sort(byOld).slice(0, 10).map(q => '<i class="' + (q.fruit_kind === 'fruit' ? 'f' : q.fruit_kind === 'fog' ? 'g' : '') + '"></i>').join('') + (list.length > 10 ? '<em>…</em>' : '') + '</span></button>';
  }).join('') + '</div>';
  if(GS.unitOpen){
    const list = by.get(GS.unitOpen).slice().sort(byNew);
    h += '<div class="gr-ub" id="gr_ub"><div class="gu-bh">' + esc(GS.unitOpen) + '</div>' + list.map(q => '<p>' + esc(shown(q)) + '<small>' + esc(mdK(q.created_at)) +
      (q.fruit_kind === 'fruit' ? ' · 열매' : q.fruit_kind === 'fog' ? ' · 안개 열매' : '') + '</small></p>').join('') + '</div>';
  }
  return h + '<div class="hint">점 하나가 질문 하나예요. 빨간 점은 열매, 파란 점은 안개 열매예요. 단원을 누르면 그 단원 질문이 펼쳐져요.</div></div>';
}
/* 내 발자국 — 숫자 없이 칸 종류 아이콘이 길처럼(tree.js 시험이 .tr-fp-chips [data-step].on 을 본다) */
function fpHTML(){
  const COUNTED = QO.K.STEPS.filter(s => s.counted);
  const fp = QO.state.footprints || [], has = {};
  fp.forEach(f => { has[f.step] = true; });
  return '<div class="card gr-box tr-fp gr-fp">' + head('foot', '내 발자국') + '<div class="tr-fp-chips gp-path">' + COUNTED.map(s =>
    '<span data-step="' + s.k + '"' + (has[s.k] ? ' class="on"' : '') + '><i>' + IC[s.k] + '</i><b>' + esc(s.n) + '</b><em class="sr">' + (has[s.k] ? ' 발자국 있음' : ' 아직') + '</em></span>').join('') + '</div>' +
    '<div class="hint">일지 칸을 내 말로 처음 채우면 ' + (fp.length ? '그 칸에' : '여기에') + ' 발자국이 남아요.</div></div>';
}
/* 책 보며 알게 된 낱말(read.js) */
function wordsHTML(qs){
  const ws = qs.map(q => ({q, r:(q.journal || {}).read})).filter(x => x.r && Number(x.r.kind) === 3 && x.r.word)
    .sort((a, b) => byNew(a.q, b.q));
  if(!ws.length) return '';
  return '<div class="card gr-box gr-words">' + head('book', '책 보며 만난 낱말') + '<div class="gw-wgrid">' + ws.slice(0, 12).map(x =>
    '<div class="gr-w"><b>' + esc(x.r.word) + '</b>' + '<span class="gs"><span class="lb">내 짐작</span>' + (x.r.guess ? esc(x.r.guess) : '<em>안 적음</em>') + '</span>' +
    (x.r.found ? '<span class="fd"><span class="lb">찾은 뜻</span>' + esc(x.r.found) + '</span>' : '<span class="later">찾은 뜻은 그 질문의 「찾기」 칸에서 적어요</span>') + '</div>').join('') + '</div></div>';
}
/* 아직 모르는 것 — 다음 질문의 씨앗 */
function wondersHTML(qs){
  const wd = wonders(qs).slice(0, 6);
  if(!wd.length) return '';
  return '<div class="card gr-box gr-wd">' + head('seed', '다음 질문의 씨앗', '아직 모르는 것') + '<div class="gs-list">' + wd.map(w =>
    '<div class="gs-card"><span class="gs-seed" aria-hidden="true"><svg viewBox="0 0 32 40" width="26" height="32"><path d="M16 38c-7 0-11-5-11-11.5S10.5 12 16 6c5.5 6 11 14 11 20.5S23 38 16 38z"/><path class="vein" d="M16 37V22"/></svg></span>' +
    '<div><p>' + esc(w.t) + '</p><small>「' + esc(w.from) + '」에서</small>' + (w.id != null && QO.explore ? '<button type="button" class="link" data-gr="openq" data-q="' + w.id + '">그 질문 열기</button>' : '') + '</div></div>').join('') + '</div>' +
    '<div class="hint">정리할 때 「아직 모름」으로 남긴 것들이에요. 이 가운데 하나를 새 질문으로 심어 봐요.</div></div>';
}

/* ═══════════ 그리기 ═══════════ */
function render(root){
  if(!QO.state.me){ root.innerHTML = ''; return; }
  const a = document.activeElement;
  const fk = a && a.dataset && a.dataset.grin && root.contains(a) ? {k:a.dataset.grin, s:a.selectionStart, e:a.selectionEnd} : null;
  const qs = mine();
  let rest;
  if(!qs.length) rest = '<div class="empty">질문을 심으면 여기에 내가 자란 기록이 쌓여요.</div>';
  else {
    const left = changeHTML(qs) + refineHTML(qs) + (U.wide() ? wondersHTML(qs) : ''), right = unitsHTML(qs) + fpHTML() + wordsHTML(qs);
    rest = U.wide() ? '<div class="cols gr-cols"><div>' + left + '</div><div>' + right + '</div></div>' : left + right + wondersHTML(qs);
  }
  /* 장면이 그대로면 그 그림은 두고 아래만 다시 그린다 — 다시 그릴 때마다 줄기가 처음부터 자라지 않게 */
  const gr = root.firstElementChild, oldHero = gr && gr.classList.contains('gr-root') ? gr.firstElementChild : null;
  if(oldHero && oldHero.classList.contains('gr-hero') && oldHero.dataset.k === heroKey(qs)){
    while(oldHero.nextSibling) oldHero.nextSibling.remove();
    oldHero.insertAdjacentHTML('afterend', writeHTML(qs) + rest);
  } else root.innerHTML = '<div class="gr-root">' + heroHTML(qs) + writeHTML(qs) + rest + '</div>';
  if(fk){
    const el = root.querySelector('[data-grin="' + fk.k + '"]');
    if(el){ try{ el.focus({preventScroll:true}); el.setSelectionRange(fk.s, fk.e); }catch(_){} }
  }
}
const rr = () => { if(QO.tabs.current() === 'grow') QO.tabs.rerender('grow'); };
const typing = () => { const a = document.activeElement; return !!(a && a.dataset && a.dataset.grin); };
/* 남이 일으킨 다시 그리기 — 빈칸에 쓰는 중이면 미뤘다가 손을 뗀 뒤에 */
function soft(){
  if(QO.tabs.current() !== 'grow') return;
  if(typing()){ GS.dirty = true; return; }
  GS.dirty = false; QO.tabs.rerender('grow');
}
document.addEventListener('focusout', e => {
  if(!e.target || !e.target.dataset || !e.target.dataset.grin) return;
  setTimeout(() => { if(GS.dirty && !typing()) soft(); }, 250);
});
document.addEventListener('input', e => {
  const el = e.target; if(!el || !el.dataset || !el.dataset.grin) return;
  const [fk, pk] = el.dataset.grin.split(':');
  draftOf(fk)[pk] = el.value;
  const pv = document.getElementById('gr_prev'); if(pv) pv.textContent = sentence(fk, draftOf(fk));
  if(GS.err){ GS.err = ''; const er = document.getElementById('gr_err'); if(er) er.textContent = ''; }
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-gr]'); if(!b) return;
  const k = b.dataset.gr;
  if(k === 'unit'){ GS.unitOpen = GS.unitOpen === b.dataset.u ? null : b.dataset.u; rr(); return; }
  if(k === 'frame'){
    const f = b.dataset.f;
    GS.frame = GS.frame === f ? null : f; GS.err = '';
    rr();
    if(GS.frame){ const el = document.querySelector('[data-grin^="' + GS.frame + ':"]'); if(el){ try{ el.focus({preventScroll:true}); }catch(_){} } }
    return;
  }
  if(k === 'close'){ GS.frame = null; GS.err = ''; rr(); return; }
  if(k === 'save'){ save(b).catch(err => U.fail(err)); return; }
  if(k === 'del'){ del(b).catch(err => U.fail(err)); return; }
  if(k === 'reload'){ GS.notes = null; GS.loadErr = false; loadNotes(); rr(); return; }
  if(k === 'openq'){ if(QO.explore && QO.explore.open) QO.explore.open(Number(b.dataset.q)); }
});
const GROW_IC = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 14c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M8 21h8"/></svg>';
QO.tabs.register({id:'grow', label:'나의 성장', icon:GROW_IC, render:render});
['questions:changed', 'footprints:changed'].forEach(ev => QO.bus.on(ev, () => soft()));
QO.bus.on('ready', () => { Object.assign(GS, {unitOpen:null, frame:null, draft:{}, notes:null, loading:false, soon:false, loadErr:false, dirty:false, err:''}); GS.seq++; capture(); });
/* 캡처용(?mock=1 에서만): ?grframe=change(틀 하나 열어 두기) · ?grdemo=1(내 기록이 없으면 보기 두 줄 넣기) */
let captured = false;
function capture(){
  if(captured || !QO.cfg.mock || QO.cfg.selftest || QO.cfg.page !== 'student' || QO.state.visit) return;
  captured = true;
  const P = new URLSearchParams(location.search);
  if(FR(P.get('grframe'))) GS.frame = P.get('grframe');
  if(P.get('grdemo') !== '1') return;
  Promise.resolve().then(async () => {
    if((await QO.api.myGrowthNotes()).length) return;
    await QO.api.addGrowthNote('next', {what:'코일을 감은 횟수를 바꿔 보는 실험'}, '다음에는 코일을 감은 횟수를 바꿔 보는 실험을 해 보고 싶어요.');
    await QO.api.addGrowthNote('change', {before:'우주에는 끝이 있다', now:'우리가 볼 수 있는 우주에만 끝이 있다'}, sentence('change', {before:'우주에는 끝이 있다', now:'우리가 볼 수 있는 우주에만 끝이 있다'}));
    GS.seq++; GS.notes = null; GS.loading = false; rr();
  }).catch(e => QO.err(e, 'growth:capture'));
}
QO.growth = {render, sentence, FRAMES, frameName};

/* ═══════════ 데이터 함수 — 진짜(Supabase, SQL v2_09) ═══════════
   SQL 을 아직 안 돌렸으면(PGRST202·PGRST205·42P01 …) e.soon = true 로 던진다 → 화면은 조용한 안내 한 줄 */
function failG(err){
  if(isSoon(err)){ const e = QO.userError('성장 기록은 선생님이 준비를 마치면 쓸 수 있어요.'); e.soon = true; throw e; }
  const e = new Error(err.message || String(err)); e.code = err.code; e.details = err.details; throw e;
}
QO.api.addGrowthNote = async function(frame, parts, body){
  const c = await QO.sbClient();
  const r = await c.rpc('add_growth_note', {p_frame:frame, p_parts:parts || {}, p_body:body});
  if(r.error) failG(r.error);
  return r.data;
};
QO.api.myGrowthNotes = async function(){
  const c = await QO.sbClient();
  const s = await c.auth.getSession();
  const uid = s && s.data && s.data.session ? s.data.session.user.id : null;
  if(!uid) return [];
  const r = await c.from('growth_notes').select('id,frame,parts,body,created_at').eq('user_id', uid).order('created_at', {ascending:false}).limit(300);
  if(r.error) failG(r.error);
  return r.data || [];
};
QO.api.deleteGrowthNote = async function(id){
  const c = await QO.sbClient();
  const r = await c.rpc('delete_growth_note', {p_id:id});
  if(r.error) failG(r.error);
  return r.data === true;
};

/* ── 흉내(규칙·문구는 v2_09 add_growth_note · delete_growth_note · v2_growth_read 그대로) ── */
if(QO.mock && QO.mock.extend){
  const H = () => QO.mock.h;
  const DB = () => { const d = QO.mock.db; d.growth_notes = d.growth_notes || []; return d; };
  const cut = (s, n) => Array.from(String(s)).slice(0, n).join('');
  const bytes = v => { try{ return new TextEncoder().encode(JSON.stringify(v)).length; }catch(_){ return JSON.stringify(v).length; } };
  QO.mock.extend({
    addGrowthNote(frame, parts, body){
      const h = H(), db = DB(), me = h.needMe(), pr = h.prof(me);
      if(!pr || pr.grade == null) throw h.userErr('학생만 쓸 수 있어요');
      const f = String(frame == null ? '' : frame).trim();
      let b = String(body == null ? '' : body).trim();
      if(clen(f) < 1 || clen(f) > 20) throw h.userErr('어떤 틀로 쓰는지 알 수 없어요');
      if(clen(b) < 10) throw h.userErr('열 글자 넘게 적어 주세요');
      if(clen(b) > 400) b = cut(b, 400);
      if(parts != null && (typeof parts !== 'object' || Array.isArray(parts) || bytes(parts) > 2000)) throw h.userErr('빈칸 글이 너무 길어요');
      const from = U.dayStartISO(h.kstToday());
      if(db.growth_notes.filter(n => n.user_id === me && n.created_at >= from).length >= 5) throw h.userErr('오늘은 성장 기록을 충분히 남겼어요. 내일 또 적어요');
      const id = h.seq('growth_notes');
      db.growth_notes.push({id:id, user_id:me, school_year:h.schoolYear(), grade:pr.grade, class_no:pr.class_no == null ? null : pr.class_no,
        frame:f, parts:parts || {}, body:b, created_at:h.nowISO()});
      return id;
    },
    myGrowthNotes(){
      const h = H(), db = DB(), me = h.me();
      if(!me) return [];
      return db.growth_notes.filter(n => n.user_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map(n => h.pick(n, ['id', 'frame', 'parts', 'body', 'created_at']));
    },
    deleteGrowthNote(id){
      const h = H(), db = DB(), me = h.me();
      const i = db.growth_notes.findIndex(n => n.id === Number(id) && n.user_id === me);
      if(i < 0) return false;
      db.growth_notes.splice(i, 1);
      return true;
    }
  });
}

/* ═══════════ 스스로 시험 ═══════════ */
if(!QO.selftest || QO.cfg.page !== 'student') return;
const add = QO.selftest.add;
const goGrow = async t => { await t.click('#nav [data-t="grow"]'); await t.waitFor('#body .gr-hero'); };
add('나의 성장 탭(장면·처음↔최근 질문·다듬기 전후·단원 띠·발자국 길)', async t => {
  await goGrow(t);
  const reached = reachedSteps(t.state.questions);
  t.eq(t.$$('#body .gh-node.on').length, QO.K.STEPS.filter(s => reached[s.k]).length, '잎 난 마디 = 지나온 칸');
  QO.K.STEPS.forEach(s => t.eq(t.$('#body .gh-node[data-step="' + s.k + '"]').classList.contains('on'), !!reached[s.k], '마디 ' + s.k));
  QO.K.STEPS.slice(1).forEach(s => { if(!reached[s.k]) t.expect(t.$('#body .gh-node[data-step="' + s.k + '"] .gh-bud'), '안 간 칸은 꽃눈 ' + s.k); });
  const wrapped = t.state.questions.filter(q => QO.journal.view(q).d.wrap).length;
  t.eq(t.$('#body .gh-sum').textContent, '질문 ' + t.state.questions.length + '개를 심었고, 그중 ' + wrapped + '개는 정리까지 갔어요.', '한 줄 요약');
  t.expect(!t.$('#body .gr-hero [class*="badge"]'), '큰 숫자 배지 없음');
  const card = await t.waitFor('#body .gr-card .gr-pair');
  const mineQ = t.state.questions.slice().sort(byOld);
  t.expect(card.textContent.indexOf(shown(mineQ[0])) >= 0, '처음 질문');
  t.expect(card.textContent.indexOf(shown(mineQ[mineQ.length - 1])) >= 0, '최근 질문');
  t.expect(card.querySelector('.gc-ar svg'), '처음 → 최근 화살표');
  t.expect(/수업 닫기 질문 \d+개/.test(t.$('#body .gr-card').textContent), '열기·닫기 한 줄');
  t.expect(t.$('#body .gr-refine'), '다듬기 전과 뒤 카드');
  t.expect(t.$$('#body .gr-box .gr-hd svg').length >= 4, '구역 머리 아이콘(SVG)');
  const u = t.$('#body .gu-strip .gr-uh'); t.expect(u, '단원 띠');
  await t.click(u);
  await t.waitFor('#body .gr-ub p');
  t.eq(t.$('#body .gu-strip .gr-uh').getAttribute('aria-expanded'), 'true', '펼친 단원 표시');
  t.expect(t.$('#body .tr-fp .gp-path [data-step="predict"] svg'), '발자국 길에 칸 아이콘');
  t.expect(t.$('#body .gr-wd .gs-card'), '다음 질문의 씨앗');
  t.expect(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t.$('#body').textContent), '이모지 없음');
});
add('나의 성장 기록 · 틀 고르기 → 실마리 → 막힘 → 저장 → 목록 → 지우기', async t => {
  await goGrow(t);
  await t.waitFor('#body [data-gr="frame"]');
  t.expect(t.$('#body .gw-empty'), '처음엔 빈 상태');
  t.eq(t.$$('#body [data-gr="frame"]').length, 4, '틀 넷');
  await t.click('#body [data-gr="frame"][data-f="question"]');
  const a = await t.waitFor('#body [data-grin="question:before"]');
  t.eq(t.$('#body [data-gr="frame"][data-f="question"]').getAttribute('aria-pressed'), 'true', '고른 틀');
  t.eq(document.activeElement, a, '첫 빈칸에 커서');
  t.eq(a.getAttribute('data-tgk'), '', '붙여넣기 막는 칸(nopaste)');
  const ev = new Event('paste', {bubbles:true, cancelable:true}); a.dispatchEvent(ev);
  t.expect(ev.defaultPrevented, '붙여넣기가 막혀요');
  const sorted = t.state.questions.slice().sort(byOld);
  t.expect(t.$('#body .gw-clue').textContent.indexOf(shown(sorted[0])) >= 0, '실마리: 처음 심은 질문');
  await t.click('#body [data-gr="save"]');
  t.eq(t.$('#gr_err').textContent, '빈칸을 모두 채워 주세요.', '빈칸 막기');
  await t.type(a, 'ㅋㅋㅋㅋ');
  await t.type('#body [data-grin="question:now"]', '왜 그런지 까닭을 묻곤');
  await t.wait(30);      // ime.js 가 칸을 떠날 때 글을 고치고 input 을 다시 보낸다(실제로는 누르기 전에 끝남)
  await t.click('#body [data-gr="save"]');
  t.eq(t.$('#gr_err').textContent, '자음·모음만 쓰지 말고 문장으로 적어 주세요.', '장난 글 막기');
  t.eq(t.db.growth_notes ? t.db.growth_notes.length : 0, 0, '막히면 저장 안 됨');
  await t.type(a, '낱말 뜻만 묻곤');
  const body = '예전 내 질문은 낱말 뜻만 묻곤 했는데, 요즘은 왜 그런지 까닭을 묻곤 해요.';
  t.eq(t.$('#gr_prev').textContent, body, '완성 문장 미리 보기');
  await t.click('#body [data-gr="save"]');
  await t.waitFor(() => t.$$('#body .gw-ti').length === 1 && !t.$('#body .gw-form'));
  const n = t.db.growth_notes[0];
  t.eq([n.frame, n.parts.before, n.parts.now, n.body, n.user_id, n.grade, n.class_no], ['question', '낱말 뜻만 묻곤', '왜 그런지 까닭을 묻곤', body, 'u-A', 2, 11], '저장한 줄');
  t.expect(t.$('#body .gw-ti').textContent.indexOf(body) >= 0 && /질문이 달라진 것/.test(t.$('#body .gw-ti').textContent), '목록에 틀 이름·문장');
  t.expect(t.$('#body .gw-ti time'), '날짜');
  await t.click('#body [data-gr="del"]');
  await t.click(await t.waitFor('.qo-dialog [data-dlg="ok"]'));
  await t.waitFor(() => !t.$('#body .gw-ti') && t.$('#body .gw-empty'));
  t.eq(t.db.growth_notes.length, 0, '지움');
});
add('나의 성장 기록 · 문장 잇기(조사)·흉내 규칙(하루 5개·열 글자·학생만·내 글만)', async t => {
  const S = QO.growth.sentence;
  t.eq(S('change', {before:'공기가 건조해서', now:'물 분자가 전기를 옮겨 준다'}), '처음에는 공기가 건조해서라고 생각했는데, 지금은 물 분자가 전기를 옮겨 준다라고 생각해요.', '라고');
  t.eq(S('change', {before:'자석의 힘', now:'자기장.'}), '처음에는 자석의 힘이라고 생각했는데, 지금은 자기장이라고 생각해요.', '이라고 · 끝 문장부호 떼기');
  t.eq(S('proud', {what:'출처를 두 곳에서 찾은 것', why:'두 곳 말이 달라서 더 알아봤거든요'}), '이번에 내가 잘한 것은 출처를 두 곳에서 찾은 것이에요. 왜냐하면 두 곳 말이 달라서 더 알아봤거든요.', '이에요 · 마침표');
  t.eq(S('proud', {what:'실험 계획 세우기', why:'처음 해 봤으니까!'}), '이번에 내가 잘한 것은 실험 계획 세우기예요. 왜냐하면 처음 해 봤으니까!', '예요 · 이미 있는 문장부호');
  t.eq(S('next', {what:'코일 실험'}), '다음에는 코일 실험을 해 보고 싶어요.', '을');
  t.eq(S('next', {what:'두 출처 비교'}), '다음에는 두 출처 비교를 해 보고 싶어요.', '를');
  t.eq(S('next', {what:'LED'}), '다음에는 LED을(를) 해 보고 싶어요.', '한글이 아니면 괄호 꼴');
  t.eq(S('proud', {}), '이번에 내가 잘한 것은 ____ (이)에요. 왜냐하면 ____.', '빈칸일 때 미리 보기(마침표 앞 빈칸 없음)');
  t.eq(S('question', {}), '예전 내 질문은 ____ 했는데, 요즘은 ____ 해요.', '빈칸일 때 미리 보기');
  for(let i = 0; i < 5; i++) await t.api.addGrowthNote('next', {what:'실험 ' + i}, '다음에는 실험 ' + i + '번을 해 보고 싶어요.');
  await t.rejects(t.api.addGrowthNote('next', {what:'하나 더'}, '다음에는 하나 더 해 보고 싶어요.'), '오늘은 성장 기록을 충분히 남겼어요. 내일 또 적어요');
  t.eq((await t.api.myGrowthNotes()).length, 5, '내 기록 다섯');
  t.db.growth_notes.forEach(n => { n.created_at = new Date(Date.now() - 2 * 864e5).toISOString(); });
  await t.rejects(t.api.addGrowthNote('next', {what:'짧게'}, '짧은 글'), '열 글자 넘게 적어 주세요');
  await t.rejects(t.api.addGrowthNote('', {}, '다음에는 무엇이든 해 보고 싶어요.'), '어떤 틀로 쓰는지 알 수 없어요');
  await t.rejects(t.api.addGrowthNote('next', ['배열'], '다음에는 무엇이든 해 보고 싶어요.'), '빈칸 글이 너무 길어요');
  const id = await t.api.addGrowthNote('proud', {what:'끝까지 한 것', why:'포기 안 했거든요'}, '이번에 내가 잘한 것은 끝까지 한 것이에요. 왜냐하면 포기 안 했거든요.');
  t.as('B');
  t.eq((await t.api.myGrowthNotes()).length, 0, '남의 기록은 안 보임');
  t.eq(await t.api.deleteGrowthNote(id), false, '남의 기록은 못 지움');
  t.as('T');
  await t.rejects(t.api.addGrowthNote('next', {what:'수업'}, '다음에는 수업을 해 보고 싶어요.'), '학생만 쓸 수 있어요');
  t.as('A');
  t.eq(await t.api.deleteGrowthNote(id), true, '내 기록은 지움');
});
add('나의 성장 · 다듬기 전과 뒤에 다듬지 않은 까닭·체크한 것(v2_09 refine_skip)', async t => {
  const q = t.db.questions.filter(x => x.user_id === 'u-A' && !x.fruit_kind).sort(byNew)[0];
  t.expect(q, '내 질문 하나');
  q.refined_text = null;
  q.journal = Object.assign({}, q.journal || {}, {refine_done:true, refine_skip:{checks:['무엇을 묻는지 분명해요', '알아볼 방법이 떠올라요'], reason:'이미 무엇을 알아볼지 분명한 질문이라서요', at:new Date().toISOString()}});
  await QO.store.refreshQuestions();
  await goGrow(t);
  const row = await t.waitFor('#body .gr-refine .gf-skip');
  t.expect(row.textContent.indexOf(q.text) >= 0, '질문');
  t.expect(row.textContent.indexOf('이미 무엇을 알아볼지 분명한 질문이라서요') >= 0, '까닭');
  t.eq(Array.from(row.querySelectorAll('.gf-chk li')).map(li => li.textContent), ['무엇을 묻는지 분명해요', '알아볼 방법이 떠올라요'], '체크한 것');
  t.expect(t.$('#body .gh-node[data-step="refine"]').classList.contains('on'), '다듬지 않기도 다듬기 칸을 지나온 것');
});
add('나의 성장 기록 · SQL 이 아직 없으면 조용한 안내 한 줄', async t => {
  const orig = QO.mock.api.myGrowthNotes;
  QO.mock.api.myGrowthNotes = async function(){ const e = new Error('Could not find the table \'public.growth_notes\' in the schema cache'); e.code = 'PGRST205'; throw e; };
  try{
    GS.seq++; GS.notes = null; GS.loading = false; GS.loadErr = false;     // 앞서 읽던 것은 버린다
    await goGrow(t);
    await t.waitFor(() => /선생님이 준비를 마치면 쓸 수 있어요/.test((t.$('#body .gr-write') || {}).textContent || ''));
    t.expect(!t.$('#body [data-gr="frame"]'), '쓰는 칸이 없음');
    t.expect(t.$('#body .gr-card'), '나머지 구역은 그대로');
  } finally { QO.mock.api.myGrowthNotes = orig; }
});
})();
