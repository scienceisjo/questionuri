/* 선생님 자료 보며 질문 심기 — 옛 앱 📚 자료 탭(renderMaterials·openMatSheet)을 탐구 탭 안 카드로 옮김(2026-11-06).
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
    if(!same && QO.tabs.current() === 'explore') QO.tabs.rerender('explore');
    if(M.want && r.some(m => m.id === M.want)){ const w = M.want; M.want = null; openView(w); }
  }catch(_){ if(M.uid !== uid){ M.list = []; M.uid = uid; } }
  finally{ M.busy = false; }
}

/* ── 탐구 탭 안 카드 ── */
const myQs = id => (QO.state.questions || []).filter(q => q && Number(q.material_id) === Number(id));
function dueText(m){
  if(!m.is_homework || !m.due_date) return '';
  const d = Math.round((Date.parse(String(m.due_date).slice(0, 10)) - Date.parse(U.kstToday())) / 864e5);
  return d <= 0 ? '오늘 마감' : d + '일 남음';
}
function html(){
  const uid = QO.state.me ? QO.state.me.id : null;
  if(M.uid !== uid){ load(true); return ''; }
  if(!M.list || !M.list.length) return '';
  const show = M.more ? M.list.slice(0, 12) : M.list.slice(0, 3);
  return '<div class="sec">선생님 자료</div><div class="card qm-list">' + show.map(m => {
    const n = myQs(m.id).length, tag = m.is_homework ? '과제 · ' + dueText(m) : (m._today ? '오늘' : U.kstDay(m.created_at).slice(5).replace('-', '/'));
    return '<button type="button" class="qm-row" data-qm="open" data-id="' + m.id + '"><span class="t">' + esc(m.title || '자료') + '</span>' +
      '<span class="m">' + esc(tag) + (n ? ' · 내 질문 ' + n : '') + '</span></button>';
  }).join('') + (M.list.length > 3 ? '<button type="button" class="link qm-more" data-qm="more">' + (M.more ? '접기' : '자료 더 보기') + '</button>' : '') + '</div>';
}

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
  if(M.open === m){ const el = document.getElementById('qm-view'); const keep = el.querySelector('.qm-scroll').scrollTop; el.innerHTML = viewHTML(m); el.querySelector('.qm-scroll').scrollTop = keep; }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-qm]'); if(!b) return;
  const k = b.dataset.qm;
  if(k === 'open') openView(b.dataset.id);
  else if(k === 'more'){ M.more = !M.more; QO.tabs.rerender('explore'); }
  else if(k === 'close') closeView();
  else if(k === 'plant') plant(b);
});
document.addEventListener('keydown', e => {
  if(!M.open) return;
  if(e.key === 'Escape'){ closeView(); return; }
  if(e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && e.target && e.target.id === 'qm_inp'){ e.preventDefault(); const b = document.querySelector('#qm-view [data-qm="plant"]'); if(b) b.click(); }
});
QO.bus.on('ready', () => { M.list = null; M.uid = null; M.more = false; closeView(); });
QO.bus.on('tab:show', id => { if(id === 'explore') load(false); else closeView(); });

QO.materials = {html:html, load:load, open:openView, close:closeView, _m:M};

/* ── 스스로 시험 ── */
if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('탐구 · 선생님 자료 보며 질문 심기(우리 반만·자료·차시 연결·자료 도토리)', async t => {
  await t.click('#nav [data-t="explore"]');
  await t.waitFor('#body .qm-list');
  const ids = t.$$('#body .qm-row').map(b => Number(b.dataset.id));
  t.eq(ids, [9001, 9002], '우리 반 자료만(다른 반 9003 빠짐), 오늘 자료 먼저');
  await t.click('#body .qm-row[data-id="9001"]');
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
  await t.waitFor(() => /내 질문 1/.test((t.$('#body .qm-row[data-id="9001"]') || {}).textContent || ''));
});
})();
