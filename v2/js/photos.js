/* 탐구 일지에 사진 붙이기 — 옛 앱 💬 답변 달기의 첨부(uploadFileToStorage → questions.answer_files)를 일지 끝 칸으로 옮김(2026-11-06).
   · 저장소·칸은 옛 앱과 같다: Storage 버킷 attachments(경로 내 uid/…), questions.answer_files [{url,name,type,path,kind}]
     → 옛 앱에서 붙인 사진도 여기 보이고, 선생님 대시보드에서도 그대로 본다. 새 SQL 없음.
   · 올리기 전에 긴 변 1600px·JPEG 로 줄인다. 한 질문에 6장까지. 지우기는 목록에서만 뺀다(파일은 남김). */
(function(){
'use strict';
const QO = window.QO, U = QO.ui, esc = U.esc;
const MAX = 6, BUCKET = 'attachments';

/* ── 데이터(진짜) ── */
QO.api.uploadPhoto = async function(blob, name){
  const cl = await QO.sbClient();
  const s = await cl.auth.getSession(), uid = s.data && s.data.session ? s.data.session.user.id : null;
  if(!uid) throw QO.userError('로그인이 필요해요');
  const path = uid + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.jpg';
  const r = await cl.storage.from(BUCKET).upload(path, blob, {cacheControl:'3600', upsert:false, contentType:'image/jpeg'});
  if(r.error){ const e = new Error(r.error.message || String(r.error)); e.code = r.error.statusCode || r.error.code; throw e; }
  const u = cl.storage.from(BUCKET).getPublicUrl(r.data.path);
  return {url:u.data.publicUrl, name:name || '사진.jpg', type:'image/jpeg', path:r.data.path, kind:'image'};
};
QO.api.setAnswerFiles = async function(qid, files){
  const cl = await QO.sbClient();
  const r = await cl.from('questions').update({answer_files:files}).eq('id', qid).select('id,answer_files').single();
  if(r.error){ const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; }
  return r.data;
};
/* ── 흉내 ── */
if(QO.mock){
  const blobURL = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  /* 사진(Blob)은 흉내 DB 감싸개(인자를 JSON 으로 복사)를 거치면 빈 객체가 되므로 직접 둔다 */
  QO.mock.api.uploadPhoto = async function(blob, name){
    await new Promise(r => setTimeout(r, 30));
    QO.mock.h.needMe();
    return {url:await blobURL(blob), name:name || '사진.jpg', type:'image/jpeg', path:'mock/' + Date.now() + '.jpg', kind:'image'};
  };
  QO.mock.extend({
    setAnswerFiles(qid, files){
      const h = QO.mock.h, me = h.needMe(), q = h.qById(qid);
      if(!q || q.user_id !== me) throw h.userErr('내 질문에만 붙일 수 있어요');
      q.answer_files = JSON.parse(JSON.stringify(files || []));
      return {id:q.id, answer_files:q.answer_files};
    }
  });
}

/* ── 줄이기(긴 변 1600px, JPEG 0.82) ── */
function shrink(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('사진을 줄이지 못했어요')), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(QO.userError('사진 파일을 열 수 없어요')); };
    img.src = url;
  });
}

/* ── 일지 끝 칸 ── */
const filesOf = id => { const q = QO.store.question(id); return q && Array.isArray(q.answer_files) ? q.answer_files : []; };
/* 질문 행의 사진 목록만 바꿔 넣는다(refreshQuestion 은 칸 표시·단서만 다시 읽는다) */
function setLocal(qid, files){ const q = QO.store.question(qid); if(q) QO.store.upsertQuestion(Object.assign({}, q, {answer_files:files})); }
const isImg = f => f && (f.kind === 'image' || String(f.type || '').indexOf('image/') === 0 || /\.(jpe?g|png|gif|webp)$/i.test(f.url || ''));
function html(v){
  const files = filesOf(v.id), mine = v.status === 'open' || v.status === 'wait' || v.status === 'fruit' || v.status === 'fog';
  const imgs = files.filter(isImg), other = files.filter(f => !isImg(f));
  if(!files.length && v.legacyHarvest) return '';
  let h = '<div class="ph-box" id="x_photos"><div class="nm">사진<span>실험·관찰한 것을 찍어 남겨요(' + MAX + '장까지)</span></div>';
  if(imgs.length) h += '<div class="ph-grid">' + imgs.map(f => '<figure><a href="' + esc(f.url) + '" target="_blank" rel="noopener"><img src="' + esc(f.url) + '" alt="' + esc(f.name || '사진') + '" loading="lazy"></a>' +
    (mine ? '<button type="button" class="ph-del" data-ph="del" data-q="' + v.id + '" data-url="' + esc(f.url) + '" aria-label="이 사진 빼기"></button>' : '') + '</figure>').join('') + '</div>';
  if(other.length) h += '<div class="ph-files">' + other.map(f => '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name || '첨부 파일') + '</a>').join('') + '</div>';
  if(mine && files.length < MAX) h += '<label class="btn line sm ph-add">사진 붙이기<input type="file" accept="image/*" data-ph="add" data-q="' + v.id + '" hidden></label>';
  return h + '<div class="err" id="x_ph_err" role="alert"></div></div>';
}
async function add(qid, file){
  const err = document.getElementById('x_ph_err'); if(err) err.textContent = '';
  if(!file || String(file.type || '').indexOf('image/') !== 0){ if(err) err.textContent = '사진 파일만 붙일 수 있어요.'; return false; }
  const files = filesOf(qid); if(files.length >= MAX){ if(err) err.textContent = '사진은 ' + MAX + '장까지예요.'; return false; }
  U.toast('사진을 올리는 중이에요…', 8000);
  try{
    const blob = await shrink(file);
    const f = await QO.api.uploadPhoto(blob, file.name);
    const r = await QO.api.setAnswerFiles(qid, filesOf(qid).concat([f]));
    setLocal(qid, r.answer_files || []);
    U.toast('사진을 붙였어요.');
    return true;
  }catch(e){ const m = U.userMsg(e); if(err) err.textContent = m || '사진을 올리지 못했어요. 잠시 뒤에 다시 해 봐요.'; if(!m) QO.err(e, 'photos'); return false; }
}
async function del(qid, url){
  if(!(await U.confirm('이 사진을 일지에서 뺄까요?', {ok:'빼기', cancel:'그대로'}))) return;
  try{ const r = await QO.api.setAnswerFiles(qid, filesOf(qid).filter(f => f.url !== url)); setLocal(qid, r.answer_files || []); U.toast('사진을 뺐어요.'); }
  catch(e){ U.toast(U.userMsg(e) || '사진을 빼지 못했어요.'); }
}
document.addEventListener('change', e => {
  const i = e.target.closest && e.target.closest('input[data-ph="add"]'); if(!i) return;
  const f = i.files && i.files[0]; i.value = '';
  if(f) add(Number(i.dataset.q), f);
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-ph="del"]'); if(!b) return;
  e.preventDefault(); del(Number(b.dataset.q), b.dataset.url);
});
QO.photos = {html:html, add:add};

/* ── 스스로 시험 ── */
if(!QO.selftest || QO.cfg.page !== 'student') return;
QO.selftest.add('탐구 · 일지에 사진 붙이기·빼기(answer_files)', async t => {
  const q = t.db.questions.find(x => x.user_id === 'u-A' && !x.fruit_kind && !x.resolved && !x.parent_id);
  t.expect(q, '가람의 탐구 중 질문');
  q.answer_files = [];
  const c = document.createElement('canvas'); c.width = 40; c.height = 30; const x = c.getContext('2d'); x.fillStyle = '#3F8B4F'; x.fillRect(0, 0, 40, 30);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], '실험.png', {type:'image/png'});
  t.eq(await add(q.id, file), true, '붙이기');
  t.eq(t.db.questions.find(y => y.id === q.id).answer_files.length, 1, 'answer_files 한 장');
  t.eq(t.db.questions.find(y => y.id === q.id).answer_files[0].type, 'image/jpeg', '줄여서 JPEG');
  const h = html({id:q.id, status:'open'});
  t.expect(/<img /.test(h) && /data-ph="del"/.test(h) && /사진 붙이기/.test(h), '사진·빼기·붙이기 단추');
  t.eq(await add(q.id, new File(['x'], 'a.txt', {type:'text/plain'})), false, '사진이 아니면 안 붙임');
});
})();
