/* 선생님 자료 보며 질문 심기 — 옛 앱 📚 자료 탭(renderMaterials·openMatSheet)을 탐구 탭 안 카드로 옮겼다가(2026-11-06)
   「선생님 자료」 탭으로 따로 뺌(2026-11-12, 사용자 「선생님 자료는 선생님 자료 탭에 따로」).
   · 자료는 선생님이 옛 대시보드 「수업 자료」에서 올린다(lesson_materials 표 그대로, 새 SQL 없음).
   · 우리 반·내가 참여한 선생님 자료만(옛 앱과 같은 거르기). 오늘 자료·마감 전 과제를 먼저.
   · 자료 화면: 유튜브 구간·사진·영상·링크·본문·출처를 보며 그 자리에서 질문을 심는다 → 질문에 material_id·차시가 붙고
     심기 도토리 + 자료 질문 도토리(옛 앱 「자료 질문 +1 추가」, 하루 상한 안). */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const M = {list:null, uid:null, busy:false, at:0, more:false, open:null,
  want:Number(new URLSearchParams(location.search).get('mat')) || null};   // ?mat=자료번호 → 그 자료 화면을 바로 연다(선생님이 보내는 링크)

/* ── 데이터 ── */
QO.api.myMaterials = async function(){
  const cl = await QO.sbClient();
  const r = await cl.from('lesson_materials').select('*').eq('is_active', true).order('created_at', {ascending:false}).limit(60);
  if(r.error){ const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; }
  return r.data || [];
};
if(QO.mock){
  const day = 864e5, iso = ms => new Date(Date.now() - ms).toISOString();
  const SEED = [
    {id:9001, title:'오늘 자료 · 전자석 만들기 영상 보기', teacher_id:1, teacher_name:'과학', subject_label:'과학', unit:'Ⅴ-3. 전류의 자기 작용', target_grade:2, target_class:null,
      description:'영상을 보며 궁금한 것을 하나 심어요.', body_text:'## 볼 것\n못에 도선을 감고 전류를 흘리면 클립이 붙는다.\n전류를 끊으면 어떻게 될까?', source_note:'교과서 214쪽', files:[], is_homework:false, created_at:iso(60 * 6e4)},
    {id:9002, title:'주말 과제 · 집에 있는 자석 찾기', teacher_id:1, teacher_name:'과학', subject_label:'과학', unit:null, target_grade:2, target_class:11,
      description:'냉장고·필통·가방에서 자석을 찾아 사진으로 남겨요.', body_text:'', source_note:'', files:[{kind:'link', name:'자석 안전 안내', url:'https://scienceisjo.github.io/'}], is_homework:true, due_date:new Date(Date.now() + 2 * day).toISOString().slice(0, 10), created_at:iso(1 * day)},
    {id:9004, title:'별빛은 얼마나 먼 길을 왔을까 (기사 발췌)', teacher_id:1, teacher_name:'과학', subject_label:'과학', unit:'별의 밝기와 등급', target_grade:2, target_class:null,
      description:'종이로 나눠 준 글을 읽고, 갸우뚱한 곳·중요해 보인 곳·모르는 낱말에서 질문을 심어요.', body_text:'', source_note:'', files:[], is_homework:false,
      reading:{unit:'para', need:['says']}, created_at:iso(2 * day)},
    {id:9003, title:'다른 반 자료', teacher_id:1, teacher_name:'과학', subject_label:'과학', unit:null, target_grade:2, target_class:5, description:'', files:[], is_homework:false, created_at:iso(2 * day)}
  ];
  QO.mock.api.myMaterials = async function(){ await new Promise(r => setTimeout(r, 30)); return JSON.parse(JSON.stringify(SEED)); };
}

/* 우리 반·내 선생님 자료만, 오늘 자료 → 마감 전 과제 → 나머지 */
function mine(list){
  const me = QO.state.me || {}, tids = (me.teacher_ids || []).map(Number).concat(me.teacher_id != null ? [Number(me.teacher_id)] : []);
  const today = U.kstToday();
  return (list || []).filter(m => (!m.target_grade || Number(m.target_grade) === Number(me.grade)) &&
      (!m.target_class || Number(m.target_class) === Number(me.class_no)) &&
      (!tids.length || tids.indexOf(Number(m.teacher_id)) >= 0) &&
      !(m.is_homework && m.due_date && String(m.due_date).slice(0, 10) < today))
    .map(m => Object.assign(m, {_today:U.kstDay(m.created_at) === today}))
    .sort((a, b) => (b._today - a._today) || ((b.is_homework ? 1 : 0) - (a.is_homework ? 1 : 0)) || String(b.created_at).localeCompare(String(a.created_at)));
}
async function load(force){
  const uid = QO.state.me ? QO.state.me.id : null; if(!uid) return;
  if(M.busy || (!force && M.uid === uid && Date.now() - M.at < 60000)) return;
  M.busy = true;
  try{
    const r = mine(await QO.api.myMaterials());
    const same = M.uid === uid && JSON.stringify((M.list || []).map(m => m.id)) === JSON.stringify(r.map(m => m.id));
    M.list = r; M.uid = uid; M.at = Date.now();
    if(!same && QO.tabs.current() === 'mat') QO.tabs.rerender('mat');
    if(QO.tabs.current() === 'mat') markSeen();
    QO.tabs.paintBadges();
    if(M.want && r.some(m => m.id === M.want)){ const w = M.want; M.want = null; const wm = r.find(m => m.id === w); if(wm.reading && QO.read) QO.read.open(w); else openView(w); }
  }catch(_){ if(M.uid !== uid){ M.list = []; M.uid = uid; } }
  finally{ M.busy = false; }
}

/* ── 선생님 자료 탭 ── */
const myQs = id => (QO.state.questions || []).filter(q => q && Number(q.material_id) === Number(id));
function dueText(m){
  if(!m.is_homework || !m.due_date) return '';
  const d = Math.round((Date.parse(String(m.due_date).slice(0, 10)) - Date.parse(U.kstToday())) / 864e5);
  return d <= 0 ? '오늘 마감' : d + '일 남음';
}
/* 오늘 올라온 자료 중 아직 안 본 것이 있으면 탭에 점(이 기기에서 본 것만 기억) */
const seenKey = () => 'qo2-matseen-' + ((QO.state.me || {}).id || 'x');
function seenIds(){ try{ return JSON.parse(localStorage.getItem(seenKey()) || '[]'); }catch(_){ return []; } }
function markSeen(){
  const ids = (M.list || []).filter(m => m._today).map(m => m.id); if(!ids.length) return;
  const s = seenIds(), add = ids.filter(id => s.indexOf(id) < 0); if(!add.length) return;
  try{ localStorage.setItem(seenKey(), JSON.stringify(s.concat(add).slice(-200))); }catch(_){}
  QO.tabs.paintBadges();
}
function cardHTML(m){
  const n = myQs(m.id).length, tag = m.is_homework ? '과제 · ' + dueText(m) : (m._today ? '오늘' : U.kstDay(m.created_at).slice(5).replace('-', '/'));
  /* 읽기자료(lesson_materials.reading)는 본문 없이 「책 보며 심기」로 연다(read.js) */
  const rd = !!(m.reading && QO.read);
  const desc = String(m.description || '').trim();
  return '<button type="button" class="qm-card" ' + (rd ? 'data-rd="open" data-mat="' : 'data-qm="open" data-id="') + m.id + '">' +
    '<span class="t">' + (rd ? '<span class="rd-tag">읽기</span>' : '') + esc(m.title || '자료') + '</span>' +
    '<span class="m">' + esc([tag, m.unit].filter(Boolean).join(' · ')) + '</span>' +
    (desc ? '<span class="d">' + esc(Array.from(desc).length > 70 ? Array.from(desc).slice(0, 70).join('') + '…' : desc) + '</span>' : '') +
    '<span class="n">' + (n ? '이 자료로 심은 질문 ' + n + '개' : '아직 심은 질문 없음') + '</span></button>';
}
function render(root){
  const uid = QO.state.me ? QO.state.me.id : null;
  if(M.uid !== uid || !M.list){ load(true); root.innerHTML = '<div class="empty">선생님 자료를 불러오는 중이에요.</div>'; return; }
  if(!M.list.length){ root.innerHTML = '<div class="empty">아직 선생님이 올린 자료가 없어요.</div>'; return; }
  const today = M.list.filter(m => m._today), hw = M.list.filter(m => !m._today && m.is_homework), rest = M.list.filter(m => !m._today && !m.is_homework);
  const sec = (name, list) => list.length ? '<div class="sec">' + name + ' <span class="n">' + list.length + '</span></div><div class="qm-cards">' + list.map(cardHTML).join('') + '</div>' : '';
  root.innerHTML = '<div class="hint qm-top">자료를 열어 보며 궁금한 것을 심어요. 심은 질문은 탐구 탭에서 이어서 해요.</div>' +
    sec('오늘 자료', today) + sec('과제', hw) + sec('지난 자료', rest);
}
function html(){ return ''; }   // 예전 탐구 탭 자리(지금은 탭으로)

/* ── 자료 화면 ── */
function ytId(url){
  const s = String(url || '').trim(); if(/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/); return m ? m[1] : '';
}
function ytFrame(id, start, end){
  const p = ['rel=0', 'modestbranding=1', 'playsinline=1', 'iv_load_policy=3'], s = Number(start), e = Number(end);
  if(s > 0) p.push('start=' + Math.floor(s)); if(e > 0) p.push('end=' + Math.floor(e));
  return '<div class="qm-yt"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(id) + '?' + p.join('&') + '" title="유튜브 영상" loading="lazy" allowfullscreen allow="encrypted-media; picture-in-picture"></iframe></div>';
}
function bodyHTML(s){
  const out = [];
  String(s || '').replace(/\r/g, '').split('\n\n').forEach(block => {
    let buf = [];
    const flush = () => { if(buf.length){ out.push('<p>' + buf.map(esc).join('<br>') + '</p>'); buf = []; } };
    block.split('\n').forEach(line => { line = line.trim(); if(!line) return; if(line.indexOf('##') === 0){ flush(); out.push('<div class="h2">' + esc(line.slice(2).trim()) + '</div>'); } else buf.push(line); });
    flush();
  });
  return out.join('');
}
function viewHTML(m){
  const parts = ['<div class="qm-meta">' + esc([m.teacher_name || '선생님', m.subject_label, m.unit, m.is_homework ? '과제 · ' + dueText(m) : ''].filter(Boolean).join(' · ')) + '</div>'];
  if(m.description) parts.push('<p>' + esc(m.description) + '</p>');
  const vid = ytId(m.video_url || '');
  if(vid) parts.push(ytFrame(vid, m.yt_start, m.yt_end));
  (m.files || []).forEach(f => {
    if(f.kind === 'youtube' && f.videoId){ if(!vid) parts.push(ytFrame(f.videoId, m.yt_start, m.yt_end)); }
    else if(f.kind === 'link') parts.push('<a class="btn line qm-link" href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' + esc(f.name || '링크') + ' 열기</a>');
    else if(f.kind === 'video' || String(f.type || '').indexOf('video/') === 0) parts.push('<video controls playsinline class="qm-media" src="' + esc(f.url) + '"></video>');
    else if(f.url) parts.push('<img class="qm-media" src="' + esc(f.url) + '" alt="' + esc(f.name || '') + '" loading="lazy">');
  });
  if(m.body_text) parts.push('<div class="qm-body">' + bodyHTML(m.body_text) + '</div>');
  if(m.source_note) parts.push('<div class="qm-src">출처 · ' + esc(m.source_note) + '</div>');
  const mineQ = myQs(m.id);
  return '<div class="qm-head"><h2>' + esc(m.title || '자료') + '</h2><button type="button" class="qm-x" data-qm="close" aria-label="닫기"></button></div>' +
    '<div class="qm-scroll">' + parts.join('') + '</div>' +
    '<div class="qm-plant"><label for="qm_inp">이 자료를 보며 궁금해진 것</label><div class="row"><input class="inp" id="qm_inp" maxlength="200" autocomplete="off" placeholder="궁금한 걸 한 줄로 적어요">' +
    '<button type="button" class="btn" data-qm="plant">심기</button></div><div class="err" id="qm_err" role="alert"></div>' +
    (mineQ.length ? '<div class="qm-mine"><b>이 자료로 심은 질문</b>' + mineQ.map(q => '<div>· ' + esc(q.refined_text || q.text) + '</div>').join('') + '</div>' : '') + '</div>';
}
function openView(id){
  const m = (M.list || []).find(x => x.id === Number(id)); if(!m) return;
  M.open = m;
  let el = document.getElementById('qm-view');
  if(!el){ el = document.createElement('section'); el.id = 'qm-view'; el.className = 'qm-view'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.getElementById('app').appendChild(el); }
  el.setAttribute('aria-label', m.title || '자료');
  el.innerHTML = viewHTML(m); el.hidden = false;
  document.documentElement.classList.add('qm-on');
}
function closeView(){ const el = document.getElementById('qm-view'); if(el){ el.hidden = true; el.innerHTML = ''; } M.open = null; document.documentElement.classList.remove('qm-on'); }
async function plant(btn){
  const m = M.open; if(!m) return;
  const inp = document.getElementById('qm_inp'), err = document.getElementById('qm_err');
  if(inp && QO.ime && QO.ime.ask(inp)){ err.textContent = '글자가 영어로 쳐진 것 같아요. 아래에서 골라 주세요.'; return; }
  const v = (inp && inp.value || '').trim();
  if(Array.from(v).length < 5){ err.textContent = '한 마디만 더 붙여 볼까요? 다섯 글자 넘게 적어요.'; if(inp) inp.focus(); return; }
  const jw = QO.check.junkWhy(v); if(jw){ err.textContent = jw; inp.focus(); return; }
  const input = {text:v, material_id:m.id};
  if(m.unit) input.unit = m.unit;
  const row = await U.busy(btn, async () => { const r = await QO.api.plantQuestion(input); QO.store.upsertQuestion(r); await QO.store.refreshQuestion(r.id); return r; }, {errEl:err});
  if(!row) return;
  const got = (await QO.acorn('plant', row.id)) + (await QO.acorn('material', row.id));
  U.toast('🌱 자료를 보며 질문을 심었어요' + (got ? ' · 🌰 +' + got : '') + '.');
  QO.tabs.rerender('mat');
  if(M.open === m){ const el = document.getElementById('qm-view'); const keep = el.querySelector('.qm-scroll').scrollTop; el.innerHTML = viewHTML(m); el.querySelector('.qm-scroll').scrollTop = keep; }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-qm]'); if(!b) return;
  const k = b.dataset.qm;
  if(k === 'open') openView(b.dataset.id);
  else if(k === 'close') closeView();
  else if(k === 'plant') plant(b);
});
document.addEventListener('keydown', e => {
  if(!M.open) return;
  if(e.key === 'Escape'){ closeView(); return; }
  if(e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && e.target && e.target.id === 'qm_inp'){ e.preventDefault(); const b = document.querySelector('#qm-view [data-qm="plant"]'); if(b) b.click(); }
});
QO.bus.on('ready', e => { M.list = null; M.uid = null; M.more = false; closeView(); if(e && e.page === 'visit') return; setTimeout(() => load(true), 0); });   // 선생님 숲 방문엔 자료 탭이 없다   // 탭 점·?mat= 링크 때문에 바로 읽는다
QO.bus.on('tab:show', id => { if(id === 'explore' || id === 'mat') load(false); if(id !== 'mat') closeView(); });

const MAT_IC = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8"/></svg>';
QO.tabs.register({id:'mat', label:'선생님 자료', icon:MAT_IC, render:render, onShow(){ markSeen(); },
  badge(){ const s = seenIds(); return !!(M.list && M.list.some(m => m._today && s.indexOf(m.id) < 0)); }});

QO.materials = {html:html, load:load, open:openView, close:closeView, render:render, _m:M};

/* ── 스스로 시험 ── */
if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('선생님 자료 탭 · 자료 보며 질문 심기(우리 반만·자료·차시 연결·자료 도토리)', async t => {
  await t.click('#nav [data-t="explore"]');
  t.expect(!t.$('#body .qm-card'), '탐구 탭에는 자료 목록이 없음');
  try{ localStorage.removeItem('qo2-matseen-' + t.state.me.id); }catch(_){}
  await QO.materials.load(true);
  await t.waitFor(() => !document.querySelector('#nav [data-t="mat"] .dot').hidden);
  await t.click('#nav [data-t="mat"]');
  await t.waitFor('#body .qm-cards');
  t.expect(document.querySelector('#nav [data-t="mat"] .dot').hidden, '열어 보면 점이 꺼짐');
  const ids = t.$$('#body .qm-card[data-qm]').map(b => Number(b.dataset.id));
  t.eq(ids, [9001, 9002], '우리 반 자료만(다른 반 9003 빠짐), 오늘 자료 먼저 — 읽기자료 9004 는 「책 보며 심기」로 열려서 따로');
  t.expect(t.$('#body .qm-card[data-mat="9004"] .rd-tag'), '읽기자료는 「읽기」 표시');
  t.expect(/오늘 자료/.test(t.$('#body').textContent) && /과제/.test(t.$('#body').textContent), '오늘 자료·과제 묶음');
  await t.click('#body .qm-card[data-id="9001"]');
  await t.waitFor('#qm-view:not([hidden]) #qm_inp');
  t.expect(/못에 도선을 감고/.test(t.$('#qm-view .qm-body').textContent) && t.$('#qm-view .qm-body .h2'), '본문·소제목');
  const s0 = t.state.me.seeds, n0 = t.db.questions.length;
  await t.type('#qm_inp', '전류를 끊으면 클립이 왜 떨어질까?');
  await t.click('#qm-view [data-qm="plant"]');
  await t.waitFor(() => t.db.questions.length === n0 + 1);
  const q = t.db.questions.slice().sort((a, b) => b.id - a.id)[0];
  t.eq([q.material_id, q.unit], [9001, 'Ⅴ-3. 전류의 자기 작용'], '자료·차시가 붙음');
  await t.waitFor(() => t.state.me.seeds === s0 + 2);
  await t.waitFor(() => /이 자료로 심은 질문/.test((t.$('#qm-view .qm-mine') || {}).textContent || ''));
  await t.click('#qm-view [data-qm="close"]');
  t.expect(t.$('#qm-view').hidden, '닫힘');
  await t.waitFor(() => /심은 질문 1개/.test((t.$('#body .qm-card[data-id="9001"]') || {}).textContent || ''));
});
})();
