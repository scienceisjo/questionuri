/* 내 나무 · 우리 반 숲 — tree 모듈. 탭 둘(tree·forest)을 이 파일이 등록한다.
   내 나무: myTree()(레벨은 나무 크기로만) · 받은 꽃(receivedFlowers) · 발자국(QO.state.footprints, 숫자 없이) · 도토리(profile.seeds)
   우리 반 숲: myForest() 열린 곳 · 다음에 열릴 곳(숫자 없음) · 2D 지도 · 막힘 깃발(classmateQuestions 200, 익명 빼고) → 단서 */
(function(){
'use strict';
const QO = window.QO;
const U = QO.ui, esc = U.esc;

/* ═══════════ 상태(사람이 바뀌면 비움) ═══════════ */
const T = {treeSeq:0, forestSeq:0};
function clear(uid){
  Object.assign(T, {uid:uid || null, tree:null, flowers:null, treeErr:'', forest:null, forestErr:'', seen:{}, pick:null, kind:{}, curious:{}, flAll:false,
    shopCat:'tree', mates:null, matesErr:'', friend:null, fqs:null, fqErr:'', wtree:null, shopErr:'', ce:null, hint:null, hintSent:{}, myFruit:null, fruitLoaded:false});
}
clear(null);
const uidNow = () => (QO.state.me ? QO.state.me.id : null);
function sync(){ const u = uidNow(); if(u !== T.uid) clear(u); return T.uid; }
const COUNTED = QO.K.STEPS.filter(s => s.counted);
const PLACES = QO.K.PLACES;
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
/* 화면에 쓰는 레벨 — 서버 level, 찍어 둔 레벨이 더 크면 그것(화면에서 줄이지 않는다) */
function shownLevel(t){ const lv = Math.max(Number(t.level) || 1, Number(t.legacy_level) || 0); return Math.min(10, Math.max(1, lv)); }

const TPL_IN = '#body .tr-fq .cl-free[data-q], #body .tr-fqrow .cl-free[data-q]';   // 깃발 카드·친구 나무 카드의 자유 단서 칸
function repaint(id){
  if(QO.tabs.current() !== id) return;
  /* 단서 칸에 쓰던 글은 다시 그려도 남긴다 */
  const keep = {};
  U.$$(TPL_IN).forEach(i => { keep[i.dataset.q + ':' + i.dataset.kind] = i.value; });
  const act = document.activeElement, actKey = act && act.matches && act.matches(TPL_IN) ? act.dataset.q + ':' + act.dataset.kind : null;
  QO.tabs.rerender(id);
  U.$$(TPL_IN).forEach(i => {
    const k = i.dataset.q + ':' + i.dataset.kind;
    if(keep[k] != null){ i.value = keep[k]; const c = i.parentNode.querySelector('.cl-count'); if(c) c.textContent = Array.from(i.value).length + '/' + QO.clueFree.max; }
    if(k === actKey) try{ i.focus(); }catch(_){}
  });
}

/* ═══════════ 불러오기 ═══════════ */
/* 내 열매 종류(v2_10) — 서버 값이 먼저, 칸이 아직 없으면 이 기기에 둔 것, 그것도 없으면 사과 */
const fruitKey = () => 'qo2-fruit-' + (T.uid || uidNow() || 'x');
function localFruit(){ try{ return localStorage.getItem(fruitKey()) || null; }catch(_){ return null; } }
function myFruit(){ return QO.K.fruitOf(T.myFruit || localFruit()); }
async function loadMyFruit(){
  if(T.fruitLoaded || VIS()) return;
  const uid = T.uid;
  let v = null; try{ v = await QO.api.myFruit(); }catch(_){ v = null; }
  if(uid !== T.uid) return;
  T.fruitLoaded = true;
  if(v && QO.K.FRUIT[v]){ T.myFruit = v; try{ localStorage.setItem(fruitKey(), v); }catch(_){} }
}
async function loadTree(){
  const uid = sync(); if(!uid) return;
  const my = ++T.treeSeq;
  try{
    const r = await Promise.all([QO.api.myTree(), QO.api.receivedFlowers(), loadMyFruit()]);
    if(my !== T.treeSeq || uid !== uidNow()) return;
    const same = !T.treeErr && JSON.stringify([T.tree, T.flowers]) === JSON.stringify([r[0] || {}, r[1] || []]);
    T.tree = r[0] || {}; T.flowers = r[1] || []; T.treeErr = '';
    if(!same) repaint('tree');
  }catch(e){
    if(my !== T.treeSeq || uid !== uidNow()) return;
    const m = U.userMsg(e); if(!m) QO.err(e, 'tree');
    T.treeErr = m || '내 나무를 불러오지 못했어요.';
    repaint('tree');
  }
}
async function loadForest(){
  const uid = sync(); if(!uid) return;
  const my = ++T.forestSeq;
  try{
    const r = await Promise.all(VIS()
      ? [QO.api.visitForest(), QO.api.visitQuestions(200), QO.api.mySentClues().catch(() => []), null, null]   // 선생님: 고른 반 자료(내 나무·물 준 것 없음)
      : [QO.api.myForest(), QO.api.classmateQuestions(200, null), QO.api.mySentClues(), QO.api.myCurious().catch(() => null),
        (T.tree || T.wtree) ? null : QO.api.myTree().catch(() => null), loadMyFruit()]);   // 숲에 내 나무를 심으려고(내 나무 탭 자료와 따로 둔다)
    loadMates();
    if(my === T.forestSeq && uid === uidNow() && r[4]) T.wtree = r[4];
    if(my !== T.forestSeq || uid !== uidNow()) return;
    const seenBefore = Object.keys(T.seen).sort().join();
    (r[0] || []).forEach(u => { if(u && u.place && !T.seen[u.place]) T.seen[u.place] = true; });   // 한 번 열리면 계속
    const sent = {};
    (r[2] || []).slice().sort((a, b) => a.id - b.id).forEach(c => { if(c.question_id != null) sent[c.question_id] = c.body; });
    const next = {flags:pickFlags(r[1] || []), sent:sent};
    const same = !T.forestErr && seenBefore === Object.keys(T.seen).sort().join() && JSON.stringify(T.forest) === JSON.stringify(next);
    T.forest = next; T.forestErr = '';
    if(Array.isArray(r[3])) r[3].forEach(id => { T.curious[id] = true; });
    if(T.pick != null && !next.flags.some(f => f.id === T.pick)) T.pick = null;
    if(!same) repaint('forest');
  }catch(e){
    if(my !== T.forestSeq || uid !== uidNow()) return;
    const m = U.userMsg(e); if(!m) QO.err(e, 'forest');
    T.forestErr = m || '우리 반 숲을 불러오지 못했어요.';
    repaint('forest');
  }
}

/* 우리 반 나무 — v2_03 이 아직 없으면 조용히 안내만 */
const soonMsg = e => /classmate_trees|friend_questions|buy_item|equip_item|function|schema cache/i.test(String((e && e.message) || e || ''));
async function loadMates(){
  const uid = sync(); if(!uid) return;
  try{
    const r = VIS() ? await QO.api.visitTrees() : await QO.api.classmateTrees();
    if(uid !== uidNow()) return;
    const same = JSON.stringify(T.mates) === JSON.stringify(r);
    T.mates = r; T.matesErr = '';
    if(!same) repaint('forest');
  }catch(e){
    if(uid !== uidNow()) return;
    T.mates = []; T.matesErr = soonMsg(e) ? '우리 반 나무는 선생님이 준비를 마치면 보여요.' : (U.userMsg(e) || '우리 반 나무를 불러오지 못했어요.');
    repaint('forest');
  }
}
async function openFriend(num){
  T.friend = num; T.fqs = null; T.fqErr = ''; T.hint = null;
  repaint('forest');
  const uid = uidNow();
  try{
    const r = VIS() ? await QO.api.visitFriend(num) : await QO.api.friendQuestions(num);
    if(uid !== uidNow() || T.friend !== num) return;
    T.fqs = r;
  }catch(e){
    if(uid !== uidNow() || T.friend !== num) return;
    T.fqs = []; T.fqErr = U.userMsg(e) || '친구 질문을 불러오지 못했어요.';
  }
  repaint('forest');
  const c = U.$('#tr-friend'), w = c && c.closest('.wd'); if(c) try{ (w || c).scrollIntoView({block:'nearest', behavior:'smooth'}); }catch(_){}
}

/* ═══════════ 상점(옛 앱과 같은 물건·값 — 값은 서버가 다시 확인) ═══════════ */
const SHOP = {
  tree:[
    {id:'default', nm:'기본 나무', ic:'🌳', price:0, desc:'누구나 쓰는 기본 나무'},
    {id:'pine', nm:'소나무', ic:'🌲', price:20, desc:'사시사철 푸른 소나무'},
    {id:'cherry', nm:'벚나무', ic:'🌸', price:30, desc:'봄의 화려한 벚나무'},
    {id:'maple', nm:'단풍나무', ic:'🍁', price:40, desc:'가을빛 단풍나무'},
    {id:'palm', nm:'야자수', ic:'🌴', price:50, desc:'이국적인 야자수'},
    {id:'baobab', nm:'바오밥', ic:'🌳', price:100, desc:'거대한 바오밥나무'},
    {id:'storytree', nm:'이야기나무', ic:'📖', price:150, desc:'밤이면 별빛으로 은은하게 빛나는 나무'}
  ],
  companion:[
    {id:'butterfly', nm:'나비', ic:'🦋', price:10, desc:'나비가 춤춰요'},
    {id:'bird', nm:'파랑새', ic:'🐦', price:15, desc:'나무에 새가 날아와요'},
    {id:'squirrel', nm:'다람쥐', ic:'🐿️', price:20, desc:'다람쥐가 뛰어놀아요'},
    {id:'swing', nm:'그네', ic:'🪢', price:25, desc:'나뭇가지 그네'},
    {id:'beehive', nm:'벌집', ic:'🍯', price:30, desc:'꿀벌들의 집'},
    {id:'owl', nm:'부엉이', ic:'🦉', price:35, desc:'지혜로운 부엉이'},
    {id:'fox', nm:'여우', ic:'🦊', price:40, desc:'나무 밑을 총총 지나가는 여우'}
  ]
};
const ITEM = {}; Object.keys(SHOP).forEach(c => SHOP[c].forEach(it => { ITEM[it.id] = Object.assign({cat:c}, it); }));
const myLook = () => { const m = QO.state.me || {}; return {tree:ITEM[m.active_tree] && ITEM[m.active_tree].cat === 'tree' ? m.active_tree : 'default', comp:ITEM[m.active_companion] ? m.active_companion : null, fruit:myFruit()}; };
/* 계절(2026-11-11) — 학생이 고른다. 이 기기에만 저장(꾸미기라 서버에 안 보냄). 「오늘 계절」은 날짜로. 앱 바탕도 같은 계절로 꾸민다(season.css) */
const SEASONS = [['auto', '오늘 계절'], ['spring', '봄'], ['summer', '여름'], ['autumn', '가을'], ['winter', '겨울']];
const seasonKey = () => 'qo2-season-' + (T.uid || uidNow() || 'x');
function seasonPick(){ try{ const v = localStorage.getItem(seasonKey()); return SEASONS.some(s => s[0] === v) ? v : 'auto'; }catch(_){ return 'auto'; } }
function seasonNow(){ const m = Number(String(U.kstDay()).slice(5, 7)); return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; }
function seasonOf(){ const p = seasonPick(); return p === 'auto' ? seasonNow() : p; }
function paintSeason(){ document.documentElement.dataset.season = seasonOf(); }
const owned = id => { const m = QO.state.me || {}; return ITEM[id] && (ITEM[id].price === 0 || (m.unlocked_items || ['default']).indexOf(id) >= 0); };
function shopHTML(){
  const m = QO.state.me || {}, seeds = m.seeds || 0, look = myLook(), cat = T.shopCat;
  const tabs = '<div class="tr-shop-tabs" role="tablist">' + [['tree', '나무 종류'], ['companion', '동반자'], ['fruit', '열매']].map(c =>
    '<button type="button" role="tab" aria-selected="' + (cat === c[0]) + '" class="' + (cat === c[0] ? 'on' : '') + '" data-tr="shop-cat" data-c="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>';
  if(cat === 'fruit'){
    const cur = look.fruit;
    const fg = '<div class="tr-shop-grid tr-fruit-grid">' + QO.K.FRUITS.map(f => {
      const on = cur === f.id;
      return '<button type="button" class="tr-item own' + (on ? ' on' : '') + '" data-tr="fruit" data-id="' + f.id + '" aria-pressed="' + on + '" aria-label="' + esc(f.n + (on ? ', 쓰는 중' : ', 누르면 바꾸기')) + '">' +
        '<span class="ic fv" aria-hidden="true"><svg viewBox="-14 -14 28 28" width="44" height="44">' + fruitShape(f.id, 0, 1, 9) + '</svg></span>' +
        '<b>' + esc(f.n) + '</b><em>' + (on ? '쓰는 중' : '누르면 바꾸기') + '</em></button>';
    }).join('') + '</div>';
    return '<div class="sec">꾸미기</div><div class="card tr-shop">' + tabs + '<div class="hint tr-fruit-hint">열매는 도토리 없이 언제든 바꿀 수 있어요. 이미 맺은 열매도 같이 바뀌어요.</div>' + fg +
      '<div class="err" id="tr-se" role="alert">' + esc(T.shopErr || '') + '</div></div>';
  }
  const grid = '<div class="tr-shop-grid">' + SHOP[cat].map(it => {
    const own = owned(it.id), on = cat === 'tree' ? look.tree === it.id : look.comp === it.id, poor = !own && seeds < it.price;
    const tail = on ? (cat === 'tree' ? '쓰는 중' : '쓰는 중 · 누르면 숨김') : own ? '누르면 쓰기' : '🌰 ' + it.price;
    return '<button type="button" class="tr-item' + (on ? ' on' : '') + (own ? ' own' : '') + (poor ? ' poor' : '') + '" data-tr="item" data-id="' + it.id + '" aria-label="' + esc(it.nm + ', ' + tail) + '">' +
      '<span class="ic' + (cat === 'tree' ? ' tv' : '') + '" aria-hidden="true">' + (cat === 'tree' ? treeSVG({level:6, fruit:0}, {tree:it.id, comp:null}, it.nm) : it.ic) + '</span>' +
      '<b>' + esc(it.nm) + '</b><em>' + esc(tail) + '</em></button>';   // 나무는 이모지 대신 그 나무 그림, 꾸밈말 설명은 뺌(AI 티 W2·W4)
  }).join('') + '</div>';
  return '<div class="sec">꾸미기</div><div class="card tr-shop">' + tabs + grid + '<div class="err" id="tr-se" role="alert">' + esc(T.shopErr || '') + '</div></div>';
}
/* 안내 글은 상태에도 둔다 — 늦게 온 자료로 내 나무 탭이 다시 그려져도 남게 */
function seErr(msg){ T.shopErr = msg || ''; const e = U.$('#tr-se'); if(e) e.textContent = T.shopErr; }
async function itemTap(btn, id){
  const it = ITEM[id]; if(!it) return;
  const err = true, m = QO.state.me || {};
  seErr('');
  if(!owned(id)){
    if((m.seeds || 0) < it.price){ if(err) seErr('도토리가 ' + (it.price - (m.seeds || 0)) + '개 모자라요. 열매를 맺으면 도토리가 생겨요.'); return; }
    if(!(await U.confirm(it.nm + '을(를) 도토리 ' + it.price + '개로 살까요?', {ok:'살게요', cancel:'그만'}))) return;
    let r;
    try{ r = await QO.api.buyItem(id); }
    catch(e){ if(err) seErr(soonMsg(e) ? '상점은 선생님이 준비를 마치면 열려요.' : (U.userMsg(e) || '사지 못했어요.')); return; }
    if(!r) return;
    m.unlocked_items = r.items || (m.unlocked_items || ['default']).concat([id]);
    QO.store.setSeeds(r.seeds);
  }
  let r2;
  try{ r2 = await QO.api.equipItem(id); }
  catch(e){ if(err) seErr(soonMsg(e) ? '상점은 선생님이 준비를 마치면 열려요.' : (U.userMsg(e) || '바꾸지 못했어요.')); return; }
  if(!r2) return;
  m.active_tree = r2.active_tree; m.active_companion = r2.active_companion;
  repaint('tree');
  U.toast(it.cat === 'tree' ? it.nm + '로 바꿨어요.' : (r2.active_companion ? it.nm + '이(가) 나무에 왔어요.' : it.nm + '을(를) 숨겼어요.'));
}

/* 열매 바꾸기 — 그림은 바로 바꾸고 서버에 저장. v2_10 이 아직 없으면 이 기기에만 */
async function fruitTap(btn, id){
  if(!QO.K.FRUIT[id] || id === myFruit()) return;
  const before = T.myFruit;
  seErr('');
  T.myFruit = id; try{ localStorage.setItem(fruitKey(), id); }catch(_){}
  repaint('tree');
  try{ await QO.api.setFruit(id); }
  catch(e){
    if(soonMsg(e) || /set_fruit|active_fruit|PGRST202|schema cache/i.test(String((e && e.message) || e))){ seErr('이 기기에서만 바뀌었어요. 친구 화면에도 보이려면 선생님이 준비를 마쳐야 해요.'); return; }
    T.myFruit = before; try{ if(before) localStorage.setItem(fruitKey(), before); else localStorage.removeItem(fruitKey()); }catch(_){}
    repaint('tree'); seErr(U.userMsg(e) || '바꾸지 못했어요.'); return;
  }
  U.toast(QO.K.FRUIT[id].n + ' 열매로 바꿨어요.');
}

/* ═══════════ 내 나무 ═══════════ */
const BLOBS = [[0,-70,46,'#5FA86D'],[-40,-52,30,'#6CB57A'],[40,-56,32,'#57A065'],[-14,-98,28,'#74BC80'],[22,-92,26,'#68B275'],
  [-60,-78,22,'#62AC70'],[60,-84,22,'#6FB97C'],[4,-110,20,'#5BA469']];
const SPOTS = [[-6,-72],[24,-60],[-30,-54],[8,-96],[-22,-88],[44,-46],[-48,-44],[30,-80],[-60,-76],[60,-84],[4,-110],[-10,-48]];
const FL_SPOTS = [[-30,20],[30,22],[-52,25],[52,24],[-74,21],[74,25],[-17,29],[17,30],[-92,26],[92,27]];
/* 열매 한 알(종류마다 모양) — 가운데 (x,y), 반지름 r. 상점 그림·내 나무·친구 나무가 같이 쓴다 */
const n1 = v => Math.round(v * 10) / 10;
function fruitShape(fk, x, y, r){
  const F = QO.K.FRUIT[QO.K.fruitOf(fk)], c = F.c, c2 = F.c2, k = r / 8;
  const P = (dx, dy) => n1(x + dx * k) + ' ' + n1(y + dy * k);
  const leaf = (dx, dy, rot) => '<path transform="translate(' + P(dx, dy).replace(' ', ' ') + ') rotate(' + (rot || -30) + ') scale(' + n1(k) + ')" d="M0 0 q3 -3.4 6.4 -1.4 q-3 3.2 -6.4 1.4z" fill="#4E9A4E"/>';
  const stem = (dx, dy, h) => '<path d="M' + P(dx, dy) + ' l' + n1(0.6 * k) + ' ' + n1(-(h || 3) * k) + '" stroke="#6B4A2E" stroke-width="' + n1(1.2 * k) + '" stroke-linecap="round"/>';
  const ci = (dx, dy, rr, f) => '<circle cx="' + n1(x + dx * k) + '" cy="' + n1(y + dy * k) + '" r="' + n1(rr * k) + '" fill="' + f + '"/>';
  const el = (dx, dy, rx, ry, f, extra) => '<ellipse cx="' + n1(x + dx * k) + '" cy="' + n1(y + dy * k) + '" rx="' + n1(rx * k) + '" ry="' + n1(ry * k) + '" fill="' + f + '"' + (extra || '') + '/>';
  switch(F.id){
    case 'cherry':
      return '<path d="M' + P(-3.6, 1.5) + ' Q' + P(-2, -5) + ' ' + P(0.6, -8) + ' M' + P(3.8, 2.6) + ' Q' + P(3, -4) + ' ' + P(0.6, -8) + '" stroke="#4E7A2E" stroke-width="' + n1(1.1 * k) + '" fill="none" stroke-linecap="round"/>' +
        ci(-3.6, 2.6, 4.2, c) + ci(3.8, 3.6, 4.2, c) + ci(-5, 1.2, 1.2, c2) + ci(2.4, 2.2, 1.2, c2) + leaf(0.6, -8, -20);
    case 'grape': {
      const pts = [[-4.4, -3.4], [0, -3.8], [4.4, -3.4], [-2.2, 0.4], [2.2, 0.4], [-4, 3.6], [0, 4.2], [4, 3.6], [0, 7.8]];
      return stem(0, -6.4, 3) + pts.map(q => ci(q[0], q[1], 2.7, c)).join('') + pts.map(q => ci(q[0] - 0.9, q[1] - 0.9, 0.8, c2)).join('') + leaf(1, -7.6, -10);
    }
    case 'watermelon':
      return el(0, 0.5, 10.2, 8.2, c) +
        [-6, -2, 2, 6].map(dx => '<path d="M' + P(dx, -7) + ' Q' + P(dx + (dx < 0 ? -2.2 : 2.2), 0.5) + ' ' + P(dx, 8) + '" stroke="' + c2 + '" stroke-width="' + n1(1.6 * k) + '" fill="none"/>').join('') +
        el(-4, -3.6, 2.6, 1.4, '#9FD48A', ' opacity=".55"') + stem(0, -7.4, 2);
    case 'melon':
      return ci(0, 0.6, 8, c) +
        '<path d="M' + P(-7, -2) + ' Q' + P(0, 2) + ' ' + P(7, -2) + ' M' + P(-7.4, 2.6) + ' Q' + P(0, 6.4) + ' ' + P(7.4, 2.6) + ' M' + P(-3.6, -6.4) + ' Q' + P(-1, 0) + ' ' + P(-3.6, 7.6) + ' M' + P(3.6, -6.4) + ' Q' + P(1, 0) + ' ' + P(3.6, 7.6) + '" stroke="' + c2 + '" stroke-width="' + n1(0.9 * k) + '" fill="none" opacity=".9"/>' +
        '<path d="M' + P(-2.2, -7.6) + ' h' + n1(4.4 * k) + ' M' + P(0, -7.6) + ' v' + n1(-2.4 * k) + '" stroke="#6B8A3A" stroke-width="' + n1(1.3 * k) + '" stroke-linecap="round"/>';
    case 'chamoe':
      return el(0, 0.5, 9.6, 6.8, c) +
        [-5, -1.7, 1.7, 5].map(dx => '<path d="M' + P(dx * 0.9, -6) + ' Q' + P(dx * 1.25, 0.5) + ' ' + P(dx * 0.9, 7) + '" stroke="' + c2 + '" stroke-width="' + n1(1.2 * k) + '" fill="none"/>').join('') + stem(0, -6, 2);
    case 'mandarin':
      return el(0, 0.8, 8.2, 7.2, c) + ci(-3, -2, 1.8, c2) + ci(0, -6.2, 1.1, '#5E8A3A') + leaf(0.3, -6.4, -35);
    case 'peach':
      return ci(0, 0.8, 8, c) + '<path d="M' + P(1.6, 0.8) + 'm' + n1(-8 * k) + ' 0 a' + n1(8 * k) + ' ' + n1(8 * k) + ' 0 0 1 ' + n1(4 * k) + ' ' + n1(-6.9 * k) + ' a' + n1(8 * k) + ' ' + n1(8 * k) + ' 0 0 0 ' + n1(-0.4 * k) + ' ' + n1(13.6 * k) + 'z" fill="' + c2 + '" opacity=".55"/>' +
        '<path d="M' + P(0.6, -7) + ' Q' + P(-1.6, 0) + ' ' + P(0.6, 8.6) + '" stroke="#D9788A" stroke-width="' + n1(0.9 * k) + '" fill="none" opacity=".8"/>' + leaf(0.6, -7.2, -40);
    case 'lemon':
      return '<path d="M' + P(-10, 0.6) + ' Q' + P(-8, -6.8) + ' ' + P(0, -6.8) + ' Q' + P(8, -6.8) + ' ' + P(10, 0.6) + ' Q' + P(8, 7.8) + ' ' + P(0, 7.8) + ' Q' + P(-8, 7.8) + ' ' + P(-10, 0.6) + 'z" fill="' + c + '"/>' +
        el(-3.6, -2.6, 2.6, 1.3, c2, ' opacity=".8"') + leaf(0, -6.6, -25);
    case 'blueberry':
      return [[-3.6, 1.8], [3.6, 2.2], [0, -3.4]].map(q => ci(q[0], q[1], 4.2, c) + ci(q[0] - 1.4, q[1] - 1.4, 1.1, c2) +
        '<path d="M' + P(q[0] - 1, q[1] - 3.4) + ' l' + n1(1 * k) + ' ' + n1(0.9 * k) + ' l' + n1(1 * k) + ' ' + n1(-0.9 * k) + '" stroke="#1E2650" stroke-width="' + n1(0.8 * k) + '" fill="none"/>').join('');
    default:   // 사과
      return ci(0, 1, 8, c) + ci(-2.8, -1.8, 2, c2) + stem(0, -6.4, 2.6) + leaf(0.8, -8.4, -25);
  }
}
function fruitSVG(kind, x, y, sprout, fk){
  let s = '<g class="tr-fruit" data-kind="' + kind + '" data-fruit="' + QO.K.fruitOf(fk) + '"' + (sprout ? ' data-sprout="1"' : '') + '>';
  if(kind === 'fog') s += '<circle cx="' + x + '" cy="' + y + '" r="8" fill="#6F84A0"/><path d="M' + (x - 4.5) + ' ' + (y + 0.5) + 'h9M' + (x - 3) + ' ' + (y + 3.5) + 'h6" stroke="#E9EEF5" stroke-width="1.6" stroke-linecap="round"/>';
  else if(kind === 'group') s += [[-4.6, 2.6], [4.6, 2.6], [0, -4.8]].map(p => fruitShape(fk, x + p[0], y + p[1], 5)).join('') +
    '<path d="M' + x + ' ' + (y - 11) + ' q4 -5 9 -3 q-4 4 -9 3z" fill="#1F7A80"/>';
  else s += fruitShape(fk, x, y, 8);
  if(sprout) s += '<path transform="translate(' + x + ' ' + (y - 7) + ') scale(1.45)" d="M0 0 q-1 -6 -5 -7 q4 -1 5 3 q1 -5 6 -5 q-3 3 -6 9" fill="#8FD19A" stroke="#2C6A3A" stroke-width=".7" stroke-linejoin="round"/>';
  return s + '</g>';
}
function flowerSVG(x, y){
  return '<g class="tr-flower" transform="translate(' + x + ' ' + y + ')"><circle r="3.4" cy="-3.4" fill="#F3A8C2"/><circle r="3.4" cx="3.4" fill="#F3A8C2"/><circle r="3.4" cy="3.4" fill="#F3A8C2"/><circle r="3.4" cx="-3.4" fill="#F3A8C2"/><circle r="2.2" fill="#F7D774"/></g>';
}
/* 나무 종류마다 잎 색·모양 */
const LEAF = {
  default:['#5FA86D','#6CB57A','#57A065','#74BC80','#68B275','#62AC70','#6FB97C','#5BA469'],
  cherry:['#F2A7BE','#F6B9CB','#EE98B2','#F8C6D5','#F3ADC3','#EFA0B9','#F7BED0','#F09DB5'],
  maple:['#E07A3A','#E8904B','#D9692F','#EFA25A','#E5833F','#D86A35','#ECA060','#DB7436'],
  baobab:['#7FAF5E','#8BBA69','#76A655','#94C172','#86B464','#7BAA5A','#90BE6E','#79A858'],
  storytree:['#2F5D7C','#3A6B8C','#29546F','#45789A','#356685','#2C5876','#4A7FA0','#30607E']
};
function canopySVG(kind, nBlob){
  if(kind === 'pine'){
    /* 솔잎 덩어리(납작한 구름) — [가운데 x, y, 너비] · 레벨이 오르면 층이 늘어난다 */
    const pads = [[-40,-46,42],[38,-60,40],[-16,-78,40],[22,-96,32],[-30,-106,24],[6,-118,22]].slice(0, Math.max(3, Math.min(6, Math.ceil(nBlob * 0.7))));
    const branch = pads.map(p => '<path d="M' + (p[0] > 0 ? 4 : -4) + ' ' + (p[1] + 18) + ' Q' + (p[0] * 0.55) + ' ' + (p[1] + 12) + ' ' + (p[0] * 0.9) + ' ' + (p[1] + 4) + '" stroke="#8A4A2E" stroke-width="4" fill="none" stroke-linecap="round"/>').join('');
    const cloud = (x, y, w) => {
      const h = w * 0.34;
      return '<ellipse cx="' + x + '" cy="' + (y + 2) + '" rx="' + (w * 0.98) + '" ry="' + (h * 0.9) + '" fill="#1F4E35"/>' +
        '<ellipse cx="' + (x - w * 0.42) + '" cy="' + y + '" rx="' + (w * 0.5) + '" ry="' + (h * 0.82) + '" fill="#2B6143"/>' +
        '<ellipse cx="' + (x + w * 0.38) + '" cy="' + (y - 1) + '" rx="' + (w * 0.54) + '" ry="' + (h * 0.86) + '" fill="#2E6847"/>' +
        '<ellipse cx="' + x + '" cy="' + (y - h * 0.32) + '" rx="' + (w * 0.6) + '" ry="' + (h * 0.7) + '" fill="#3A7A52"/>' +
        '<ellipse cx="' + (x - w * 0.12) + '" cy="' + (y - h * 0.56) + '" rx="' + (w * 0.42) + '" ry="' + (h * 0.42) + '" fill="#4E9064"/>';
    };
    return branch + pads.map(p => cloud(p[0], p[1], p[2])).join('');
  }
  if(kind === 'palm') return [[-70,-50],[-50,-86],[-14,-104],[22,-102],[56,-84],[72,-46]].slice(0, Math.max(4, Math.min(6, nBlob)))
    .map(p => '<path d="M0 -70 Q' + (p[0] * 0.5) + ' ' + (p[1] - 26) + ' ' + p[0] + ' ' + p[1] + ' Q' + (p[0] * 0.45) + ' ' + (p[1] - 6) + ' 0 -64 Z" fill="#4E9A5B"/>').join('') + '<circle cx="0" cy="-68" r="8" fill="#6B8F3A"/>';
  const col = LEAF[kind] || LEAF.default;
  const blobs = kind === 'baobab' ? BLOBS.map(b => [b[0] * 1.25, -78 + (b[1] + 70) * 0.45, b[2] * 0.9]) : BLOBS;
  let s = blobs.slice(0, nBlob).map((b, i) => '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="' + col[i % col.length] + '"/>').join('');
  if(kind === 'storytree') s += [[-34,-80],[18,-112],[46,-66],[-8,-56],[-56,-60],[30,-92]].map(p => '<circle class="tr-star" cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#FFE58A"/>').join('');
  return s;
}
function trunkSVG(kind){
  if(kind === 'palm') return '<path d="M-6 20 Q-2 -20 4 -66 L10 -66 Q4 -20 6 20 Z" fill="#9C7A52"/>';
  if(kind === 'baobab') return '<path d="M-20 20 Q-14 -30 -12 -52 L12 -52 Q14 -30 20 20 Z" fill="#9A7650"/>';
  if(kind === 'pine') return '<path d="M-8 20 Q-10 -6 -2 -34 Q4 -62 0 -104 L5 -104 Q10 -62 4 -34 Q-1 -6 6 20 Z" fill="#9A5638"/><path d="M-3 16 Q-5 -8 1 -34 Q6 -60 3 -100" stroke="#C0784E" stroke-width="2" fill="none" opacity=".7"/>' +
      '<path d="M-6 6 h4 M-2 -18 h4 M1 -46 h4 M2 -74 h3" stroke="#6E3A24" stroke-width="1.4" stroke-linecap="round"/>';
  return '<path d="M-9 20 Q-6 -20 -3 -40 L3 -40 Q6 -20 9 20 Z" fill="#8B6A4A"/><path d="M-2 -30 Q-20 -46 -34 -50" stroke="#8B6A4A" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M2 -36 Q18 -50 30 -58" stroke="#8B6A4A" stroke-width="5" fill="none" stroke-linecap="round"/>';
}
/* 동반자 자리 */
const COMP_AT = {butterfly:[62,-96,18], bird:[-58,-74,20], squirrel:[46,10,22], swing:[-40,-14,22], beehive:[40,-50,18], owl:[-12,-98,20], fox:[-70,12,24]};
function compSVG(id){
  const it = ITEM[id], p = COMP_AT[id]; if(!it || !p) return '';
  return '<text class="tr-comp" data-comp="' + id + '" x="' + p[0] + '" y="' + p[1] + '" font-size="' + p[2] + '" text-anchor="middle">' + it.ic + '</text>';
}
function treeSVG(t, look, label){
  look = look || myLook();
  const lv = shownLevel(t), sc = (0.6 + lv * 0.04).toFixed(3);
  const fr = [];
  const nFruit = +t.fruit || 0, nFog = +t.fog || 0, nGroup = +t.group_fruit || 0;
  let sp = +t.sprout || 0;
  for(let i = 0; i < nFruit; i++) fr.push({k:'fruit', s:sp-- > 0});
  for(let i = 0; i < nFog; i++) fr.push({k:'fog', s:sp-- > 0});
  for(let i = 0; i < nGroup; i++) fr.push({k:'group', s:false});
  const nBlob = Math.min(BLOBS.length, Math.max(3, lv + 2));
  const fk = QO.K.fruitOf(look.fruit);
  const fruits = fr.slice(0, SPOTS.length).map((f, i) => fruitSVG(f.k, SPOTS[i][0], SPOTS[i][1], f.s, fk)).join('');
  const nFl = Math.min(+t.flowers || 0, FL_SPOTS.length);
  let flowers = ''; for(let i = 0; i < nFl; i++) flowers += flowerSVG(FL_SPOTS[i][0], FL_SPOTS[i][1]);
  const all = nFruit + nFog + nGroup;
  return '<svg viewBox="-120 -130 240 170" width="300" height="212" role="img" data-kind="' + look.tree + '" data-fruit="' + fk + '" aria-label="' + esc((label || '내 나무') + ', ' + ITEM[look.tree].nm + ', 레벨 ' + lv + ', ' + QO.K.FRUIT[fk].n + ' 열매 ' + all + '개, 꽃 ' + (+t.flowers || 0) + '개') + '">' +
    '<ellipse cx="0" cy="22" rx="105" ry="16" fill="#E2E8D6"/>' +
    '<g transform="translate(0 20) scale(' + sc + ') translate(0 -20)">' +
    trunkSVG(look.tree) + canopySVG(look.tree, nBlob) +
    fruits + '</g>' + flowers + (look.comp ? compSVG(look.comp) : '') + '</svg>';
}
function legacyNoteKey(){ return 'qo2-tree-legacy-note-' + T.uid; }
function noteSeen(){ try{ return localStorage.getItem(legacyNoteKey()) === '1'; }catch(_){ return false; } }
const FOG_SMALL = U.FOG_SVG;
const ICON_FRUIT = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="6" fill="#C9433A"/><circle cx="6" cy="7" r="1.6" fill="#F19A93"/></svg>';
function renderTree(root){
  sync();
  if(!T.uid){ root.innerHTML = ''; return; }
  const t = T.tree;
  if(!t){
    root.innerHTML = T.treeErr ? '<div class="card tr-fail"><div class="err">' + esc(T.treeErr) + '</div><button type="button" class="btn soft sm" data-tr="retry-tree">다시 불러오기</button></div>'
      : '<div class="empty tr-loading">내 나무를 불러오는 중이에요…</div>';
    return;
  }
  const lv = shownLevel(t);
  const nFruit = +t.fruit || 0, nFog = +t.fog || 0, nGroup = +t.group_fruit || 0, all = nFruit + nFog + nGroup;
  const sub = [nFog ? '안개\u00a0' + nFog : '', nGroup ? '모둠\u00a0' + nGroup : ''].filter(Boolean).join(' · ');
  const note = (t.legacy_level != null && !noteSeen()) ? '<div class="guide tr-note"><span>이제 나무는 열매로 커요. 지금 나무 크기는 그대로예요.</span><button type="button" class="link" data-tr="note-ok">알겠어요</button></div>' : '';
  const sp = seasonPick(), ss = seasonOf();
  const seasonChips = '<div class="tr-season" role="group" aria-label="계절 고르기">' + SEASONS.map(s => '<button type="button" data-tr="season" data-s="' + s[0] + '" aria-pressed="' + (sp === s[0]) + '"' + (sp === s[0] ? ' class="on"' : '') + '>' + s[1] + '</button>').join('') + '</div>';
  const treeCard = '<div class="card tr-tree" data-ready="1" data-level="' + lv + '"><div class="tr-cap"><span>내 나무</span></div>' + seasonChips +
    '<div class="tree-wrap" data-season="' + ss + '">' + treeSVG(t) + '</div>' +
    '<div class="stats"><div class="tr-st-fruit"><b>' + all + '</b><span>' + ICON_FRUIT + ' 열매</span>' + (sub ? '<small class="tr-sub">' + FOG_SMALL.replace('width="14" height="14"', 'width="12" height="12"') + ' ' + esc(sub) + '</small>' : '') + '</div>' +
    '<div class="tr-st-sprout"><b>' + (+t.sprout || 0) + '</b><span>🌱 새싹 달린 열매</span></div><div class="tr-st-flower"><b>' + (+t.flowers || 0) + '</b><span>🌸 꽃</span></div>' +
    (t.water != null ? '<div class="tr-st-water"><b>' + (+t.water || 0) + '</b><span>💧 받은 물</span></div>' : '') + '</div>' +
    '<div class="hint tr-hint">나무는 끝까지 탐구한 질문(열매)으로 자라요. 꽃은 내 단서로 친구가 한 걸음 간 흔적이에요.</div></div>';
  /* 받은 꽃 */
  const fl = (T.flowers || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id);
  const shown = T.flAll ? fl : fl.slice(0, 5);
  const flHTML = '<div class="sec">받은 꽃' + (fl.length ? ' <span class="n">' + fl.length + '</span>' : '') + '</div><div class="card tr-flowers">' +
    (fl.length ? shown.map(f => {
      const tx = String(f.thanks_text || '').trim(), line = /^덕분에/.test(tx) ? tx : '덕분에 ' + tx;
      const meta = [f.question_body ? '「' + cut(f.question_body, 26) + '」' : '', U.fmtTime(f.created_at)].filter(Boolean).join(' · ');
      return '<div class="tr-fl"><span class="e" aria-hidden="true">🌸</span><div><b>' + esc(line) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</div></div>';
    }).join('') + (fl.length > 5 ? '<button type="button" class="link tr-more" data-tr="fl-all">' + (T.flAll ? '접기' : '모두 보기') + '</button>' : '')
      : '<div class="hint">내 단서로 친구가 한 걸음 가면 여기에 꽃이 피어요.</div>') + '</div>';
  /* 발자국 — 숫자 없이, 발자국이 난 칸 종류만 */
  const fp = QO.state.footprints || [];
  const has = {}; fp.forEach(f => { has[f.step] = true; });
  const fpHTML = '<div class="sec">내 발자국</div><div class="card tr-fp">' +
    (fp.length ? '<div class="tr-fp-chips">' + COUNTED.map(s => '<span data-step="' + s.k + '"' + (has[s.k] ? ' class="on"' : '') + '>' + (has[s.k] ? '✓ ' : '') + esc(s.n) + '</span>').join('') + '</div>'
      : '') + '<div class="hint">일지 칸을 내 말로 처음 채우면 ' + (fp.length ? '그 칸에' : '여기에') + ' 발자국이 남아요.</div></div>';
  const seeds = QO.state.me ? (QO.state.me.seeds || 0) : 0;
  const acHTML = '<div class="card tr-acorn"><span class="e" aria-hidden="true">🌰</span><div><b>도토리 <span class="tr-seeds">' + seeds + '</span></b><div class="hint">도토리는 질문을 심거나 친구 질문에 물을 줄 때, 선생님이 열매를 확인할 때 받아요. 꾸미기에서 써요.</div></div></div>';
  const right = acHTML + shopHTML() + flHTML;   // 발자국·나의 성장은 「나의 성장」 탭(growth.js)으로 옮김(11-11)
  root.innerHTML = U.wide() ? '<div class="cols tr-cols"><div>' + note + treeCard + '</div><div>' + right + '</div></div>' : note + treeCard + right;
  /* 3D 나무(되면) — 안 되면 위 SVG 그대로 */
  if(QO.tree3d){
    const w = root.querySelector('.tr-tree .tree-wrap'); QO.tree3d.mount(w, Object.assign({}, t, {level:lv}), Object.assign(myLook(), {season:ss}), T.uid);
    if(T.shopCat === 'tree' && QO.tree3d.shopThumbs) QO.tree3d.shopThumbs(root);   // 상점 나무 그림 = 실제 3D 나무(그 나무의 대표 계절)
  }
  if(QO.buddy) QO.buddy.mount(root.querySelector('.tr-tree .tree-wrap'));   // 과수원 친구 말풍선(buddy.js)
}

/* ═══════════ 우리 반 숲 ═══════════ */
/* 막힘 깃발 자리(지도 좌표) — 단서가 적은 질문부터 골라, 질문 id 로 자리를 정해 다시 읽어도 그대로 */
const SLOTS = 8;   // 깃발 숲 나무 수(world.js FLAG_AT 과 같다)
/* SOS(막힘 표시) 전부 — 깃발에는 이름이 없어서 익명 질문도 싣는다(11-12). 숲 나무 깃발은 단서가 적은 것부터 8개, 나머지는 아래 목록에서 고른다 */
function pickFlags(qs){
  const flagged = qs.filter(q => q && q.flag_step).sort((a, b) => (a.clue_count || 0) - (b.clue_count || 0) || b.id - a.id);
  const used = {}, slot = {};
  flagged.slice(0, SLOTS).sort((a, b) => a.id - b.id).forEach(q => {
    let s = (Number(q.id) * 7) % SLOTS;
    while(used[s]) s = (s + 1) % SLOTS;
    used[s] = true; slot[q.id] = s;
  });
  return flagged.map(q => ({id:q.id, body:q.body, unit:q.unit || '', step:q.flag_step, tried:q.flag_tried || '', slot:slot[q.id] != null ? slot[q.id] : null}));
}
const VIS = () => !!(QO.state && QO.state.visit);   // 선생님 숲 방문(v2_08)
/* 단서 종류는 학생이 직접 고른다(2026-11-13: 「다른 종류로」를 몰라 늘 첫 종류만 보낼까 봐). 막힌 칸에 맞는 종류는 표시만 */
function kindOf(x){ return T.kind[x.id] || null; }
function friendCardHTML(x, f){
  let h = '<div class="card fq tr-fq" id="tr-fq" data-q="' + x.id + '"><div class="who">같은 반 친구 · 이름은 보이지 않아요 <span class="tag flag">' + esc(QO.journal.stepName(x.step) || '한 칸') + '에서 막힘</span></div>' +
    '<div class="qt">' + esc(x.body) + '</div>' + (x.tried ? '<div class="tried">여기까지 해 봤어요: ' + esc(x.tried) + '</div>' : '');
  if(f.sent[x.id] != null) return h + '<div class="sent">단서를 보냈어요 — 「' + esc(f.sent[x.id]) + '」</div></div>';
  const L = QO.state.live;
  if(L && L.mode === 'clue' && !VIS()) return h + '<div class="hint tr-lock">단서 시간에는 함께 탭에서 단서를 보내요.</div></div>';
  h += clueFormHTML(x) + (VIS() ? '</div>'
    : '<div class="row" style="justify-content:flex-end;flex-wrap:wrap">' +
      (T.curious[x.id] ? '<span class="hint">💧 물을 줬어요</span>' : '<button type="button" class="link" data-tr="curious" data-q="' + x.id + '">💧 물 주기</button>') + '</div></div>');
  return h;
}
/* 단서 칸(빈칸 채우기) — 깃발 카드와 친구 나무 카드가 같이 쓴다 */
function clueFormHTML(x){
  const kind = kindOf(x), K = kind ? QO.K.CLUE_KINDS[kind] : null;
  let h = '<div class="lbl" style="margin:12px 0 6px">' + (VIS() ? '선생님 단서 · 정답 말고, 찾아갈 길을 알려 줘요' : '정답 말고, 찾아갈 길을 알려 줘요') + '</div>' +
    QO.clueKindsHTML({attr:'data-tr', act:'kind', qid:x.id, cur:kind, suggest:QO.K.STUCK_KIND[x.step] || null});
  if(K) h += QO.clueFree.html(kind, 'data-q="' + x.id + '" data-kind="' + kind + '"') +
    '<div class="row" style="margin-top:10px"><button type="button" class="btn teal" style="flex:1" data-tr="send" data-q="' + x.id + '">보내기</button></div>';
  return h + '<div class="err" id="tr-ce" role="alert">' + esc(T.ce && T.ce.q === x.id ? T.ce.m : '') + '</div>';
}
/* 단서를 보낼 질문 찾기 — SOS 깃발 질문, 아니면 지금 연 친구 나무의 질문(2026-11-12 SOS 없는 질문에도 단서) */
function clueQ(qid){
  const f = T.forest;
  return (f && f.flags.find(y => y.id === qid)) || (T.fqs && T.fqs.find(y => y.id === qid)) || null;
}
function renderForest(root){
  sync();
  if(!T.uid){ root.innerHTML = ''; return; }
  const f = T.forest;
  if(!f){
    root.innerHTML = T.forestErr ? '<div class="card tr-fail"><div class="err">' + esc(T.forestErr) + '</div><button type="button" class="btn soft sm" data-tr="retry-forest">다시 불러오기</button></div>'
      : '<div class="empty tr-loading">우리 반 숲을 불러오는 중이에요…</div>';
    return;
  }
  const next = PLACES.find(p => !T.seen[p.k]);
  const places = '<div class="card tr-places" data-ready="1"><div class="tr-next">' + (next ? '다음에 열릴 곳: ' + esc(next.n) : '숲이 모두 열렸어요') + '</div>' +
    (next ? '<div class="hint" style="margin-top:2px">' + esc(next.cond) + ' 열려요.</div>' : '') +
    '<div class="places">' + PLACES.map(p => '<div class="' + (T.seen[p.k] ? 'on' : '') + '" data-place="' + p.k + '"><b>' + (T.seen[p.k] ? '✓ ' : '') + esc(p.n) + '</b><span>' + esc(p.cond) + '</span></div>').join('') + '</div></div>';
  /* 걸어 다니는 숲(world.js). 깃발 카드·친구 나무 카드는 숲 안 대화 상자에 뜬다 */
  const pins = f.flags.length ? '<div class="tr-pins">' + f.flags.map(x => {
    const sent = f.sent[x.id] != null, nm = QO.journal.stepName(x.step) || '한 칸';
    return '<button type="button" class="tr-pin" data-tr="pick" data-q="' + x.id + '"' + (sent ? ' data-sent="1"' : '') + ' aria-pressed="' + (T.pick === x.id) + '"' +
      ' aria-label="' + esc((sent ? '단서를 보낸 친구 질문 — ' : '친구 SOS — ' + nm + '에서 막힘 — ') + x.body) + '"><i aria-hidden="true"></i><span class="tr-pin-t">' + esc(cut(x.body, 22)) + '</span><small>' + esc(sent ? '단서 보냄' : nm + '에서 막힘') + '</small></button>';
  }).join('') + '</div>' : '';
  const map = '<div class="wd-slot"></div>' + pins +
    '<div class="hint tr-maphint">' + (f.flags.length ? '청록 깃발은 친구가 SOS를 보낸 질문이에요. 깃발 숲의 나무 앞에서 살펴보거나 위 목록에서 골라 찾아갈 길(단서)을 알려 줄 수 있어요. 깃발에는 이름이 없어요.'
      : '친구가 질문에 SOS를 보내면 깃발 숲에 청록 깃발이 서요.') + '</div>';
  const x = T.pick != null ? f.flags.find(y => y.id === T.pick) : null;
  const card = x ? friendCardHTML(x, f) : (T.friend != null ? friendHTML() : '');
  const mates = matesHTML();
  /* 폰: 숲 → 깃발 단추 → 장소 → 우리 반 나무 / 넓은 화면: 숲 왼쪽, 장소·우리 반 나무 오른쪽 */
  root.innerHTML = U.wide() ? '<div class="cols tr-cols"><div>' + map + '</div><div>' + places + mates + '</div></div>' : map + places + mates;
  const slot = root.querySelector('.wd-slot');
  if(slot && QO.world) QO.world.mount(slot, {
    flags:f.flags.map(y => ({id:y.id, slot:y.slot, step:y.step, sent:f.sent[y.id] != null})),
    seen:Object.assign({}, T.seen), trees:worldTrees(),
    card:card || null, cardKey:x ? 'q' + x.id : (card ? 'n' + T.friend : null),
    onFlag(qid){ T.friend = null; T.pick = qid; repaint('forest'); },
    onTree(n){ T.pick = null; if(T.friend === n) repaint('forest'); else openFriend(n); },
    onClose(){ T.pick = null; T.friend = null; repaint('forest'); }
  });
}
/* 숲에 심을 나무 — 반 친구(classmate_trees) + 내 나무(my_tree 를 읽은 뒤) */
function worldTrees(){
  const out = (T.mates || []).map(m => ({n:+m.owner_number, name:m.owner_name, type:m.active_tree || 'default', level:+m.level || 1, fruits:+m.fruits || 0, fruit:QO.K.fruitOf(m.active_fruit)}));
  const me = QO.state.me || {};
  const t = T.tree || T.wtree;
  if(t && me.number != null){
    out.push({n:+me.number, name:me.name || '나', type:myLook().tree, level:shownLevel(t), fruits:(+t.fruit || 0) + (+t.fog || 0) + (+t.group_fruit || 0), fruit:myFruit(), me:true});
  }
  return out;
}
function miniTree(m){
  return treeSVG({level:m.level, fruit:Math.min(+m.fruits || 0, SPOTS.length)}, {tree:ITEM[m.active_tree] && ITEM[m.active_tree].cat === 'tree' ? m.active_tree : 'default', comp:ITEM[m.active_companion] ? m.active_companion : null, fruit:QO.K.fruitOf(m.active_fruit)}, m.owner_name + '의 나무');
}
function matesHTML(){
  if(T.mates == null) return '<div class="sec">우리 반 나무</div><div class="empty tr-loading" style="padding-top:12px">불러오는 중이에요…</div>';
  if(T.matesErr) return '<div class="sec">우리 반 나무</div><div class="card"><div class="hint">' + esc(T.matesErr) + '</div></div>';
  if(!T.mates.length) return '';
  return '<div class="sec">우리 반 나무 <span class="n">' + T.mates.length + '</span></div><div class="tr-mates">' + T.mates.map(m =>
    '<button type="button" class="tr-mate' + (T.friend === m.owner_number ? ' on' : '') + '" data-tr="friend" data-n="' + m.owner_number + '" aria-pressed="' + (T.friend === m.owner_number) + '">' +
    '<span class="t">' + miniTree(m) + '</span><b>' + esc(m.owner_number + '번 ' + m.owner_name) + '</b><small>질문 ' + (+m.questions || 0) + ' · 열매 ' + (+m.fruits || 0) + ' · 💧 ' + (+m.water || 0) + '</small></button>').join('') + '</div>';
}
function friendHTML(){
  if(T.friend == null || !T.mates) return '';
  const m = T.mates.find(x => x.owner_number === T.friend); if(!m) return '';
  let h = '<div class="card tr-friend" id="tr-friend"><div class="tr-fr-top"><b>' + esc(m.owner_number + '번 ' + m.owner_name) + '의 나무</b><button type="button" class="link" data-tr="friend-close">닫기</button></div>' +
    '<div class="tree-wrap">' + miniTree(m) + '</div>';
  if(T.fqs == null) return h + '<div class="hint">질문을 불러오는 중이에요…</div></div>';
  if(T.fqErr) return h + '<div class="err">' + esc(T.fqErr) + '</div></div>';
  if(!T.fqs.length) return h + '<div class="hint">아직 보이는 질문이 없어요.</div></div>';
  const me = QO.state.me || {}, mine = me.number != null && +me.number === +T.friend;
  const sent = Object.assign({}, T.hintSent || {}, (T.forest && T.forest.sent) || {}), sos = new Set(((T.forest && T.forest.flags) || []).map(y => y.id));
  return h + '<div class="hint" style="margin-bottom:6px">' + (mine ? '내 질문이에요. 친구들이 보낸 단서는 탐구 일지에서 볼 수 있어요.'
      : VIS() ? '찾아갈 길이 떠오르는 질문에 선생님 단서를 보내요. 학생 일지에는 「선생님 단서」로 보여요.'
      : '궁금한 질문엔 물을 주고, 찾아갈 길이 떠오르면 단서를 보내 줘요.') + '</div>' + T.fqs.map(q => {
    const open = T.hint === q.id;
    let r = '<div class="tr-fqrow' + (open ? ' open' : '') + '" data-q="' + q.id + '"><div class="qt">' + esc(q.body) +
      (q.fruit_kind === 'fruit' ? ' <span class="tag">열매</span>' : q.fruit_kind === 'fog' ? ' <span class="tag">안개 열매</span>' : sos.has(q.id) ? ' <span class="tag flag">SOS</span>' : '') + '</div>' +
      '<div class="row">' + (VIS() ? '<span class="hint">💧 ' + (+q.water_count || 0) + '</span>'
        : q.watered ? '<span class="hint">💧 물을 줬어요 · ' + (+q.water_count || 0) + '</span>'
        : '<button type="button" class="btn soft sm" data-tr="water" data-q="' + q.id + '">💧 물 주기</button><span class="hint">💧 ' + (+q.water_count || 0) + '</span>');
    if(!mine){
      r += sent[q.id] != null ? '<span class="hint tr-hsent">💡 단서 보냄</span>'
        : '<button type="button" class="btn soft sm tr-hbtn" data-tr="hint" data-q="' + q.id + '" aria-expanded="' + open + '">💡 단서 주기</button>';
    }
    r += '</div>';
    if(sent[q.id] != null && open) r += '<div class="sent">단서를 보냈어요 — 「' + esc(sent[q.id]) + '」</div>';
    else if(open && !mine){
      const L = QO.state.live;
      r += L && L.mode === 'clue' ? '<div class="hint tr-lock">단서 시간에는 함께 탭에서 단서를 보내요.</div>'
        : '<div class="tr-hform">' + clueFormHTML(q) + '<div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button type="button" class="link" data-tr="hint" data-q="' + q.id + '">접기</button></div></div>';
    }
    return r + '</div>';
  }).join('') + '</div>';
}

/* ═══════════ 단서 보내기 ═══════════ */
/* 단서 안내 글도 상태에 둔다 — 늦게 온 자료로 숲이 다시 그려져도 남게 */
function ceErr(qid, msg){ T.ce = {q:qid, m:msg || ''}; const e = U.$('#tr-ce'); if(e) e.textContent = T.ce.m; }
async function sendClue(btn, qid){
  const f = T.forest;
  ceErr(qid, '');
  const x = clueQ(qid); if(!x) return;
  const kind = kindOf(x), K = kind ? QO.K.CLUE_KINDS[kind] : null, err = U.$('#tr-ce');
  if(!K){ ceErr(qid, '단서 종류를 먼저 골라요.'); const c = U.$('#body .ck[data-q="' + qid + '"]'); if(c) c.focus(); return; }
  const box = U.$('#body .cl-free[data-q="' + qid + '"]');
  const text = QO.clueFree.clean(box ? box.value : '');
  const bad = QO.clueFree.why(text);
  if(bad){ ceErr(qid, bad); if(box) box.focus(); return; }
  const r = await U.busy(btn, () => VIS() ? QO.api.visitAddClue(qid, kind, text) : QO.api.addClue(qid, kind, text), {errEl:err});
  if(r === undefined) return;
  if(f && T.forest === f) f.sent[qid] = text;
  T.hintSent = T.hintSent || {}; T.hintSent[qid] = text;
  delete T.kind[qid];
  repaint('forest');
  U.toast(VIS() ? '선생님 단서를 보냈어요.' : '단서를 보냈어요.');
}

/* ═══════════ 누르기(한 곳에서) ═══════════ */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tr]');
  if(!b || !document.getElementById('body').contains(b)) return;
  const act = b.dataset.tr, qid = b.dataset.q != null ? Number(b.dataset.q) : null;
  if(act === 'retry-tree'){ T.treeErr = ''; repaint('tree'); loadTree(); }
  else if(act === 'retry-forest'){ T.forestErr = ''; repaint('forest'); loadForest(); }
  else if(act === 'note-ok'){ try{ localStorage.setItem(legacyNoteKey(), '1'); }catch(_){} repaint('tree'); }
  else if(act === 'fl-all'){ T.flAll = !T.flAll; repaint('tree'); }
  else if(act === 'season'){ try{ localStorage.setItem(seasonKey(), b.dataset.s); }catch(_){} paintSeason(); repaint('tree'); }
  else if(act === 'pick'){
    T.pick = T.pick === qid ? null : qid;
    if(T.pick != null) T.friend = null;
    repaint('forest');
    if(T.pick != null && QO.world) QO.world.walkToFlag(qid);   // 숲 속 내 캐릭터가 그 깃발 나무로 걸어간다
    const w = U.$('#body .wd');
    if(w && T.pick != null){ try{ w.scrollIntoView({block:'nearest', behavior:'smooth'}); }catch(_){} }
    const pin = U.$('#body .tr-pin[data-q="' + qid + '"]'); if(pin) try{ pin.focus({preventScroll:true}); }catch(_){}
  }
  else if(act === 'kind'){
    const x = clueQ(qid); if(!x || !QO.K.CLUE_KINDS[b.dataset.k]) return;
    T.kind[qid] = b.dataset.k; ceErr(qid, '');
    repaint('forest');
    const i = U.$('#body .cl-free[data-q="' + qid + '"]');
    if(i) try{ i.focus({preventScroll:true}); }catch(_){}
  }
  else if(act === 'send') await sendClue(b, qid);
  else if(act === 'hint'){
    T.hint = T.hint === qid ? null : qid; ceErr(qid, '');
    repaint('forest');
    const i = T.hint != null && U.$('#body .tr-fqrow[data-q="' + qid + '"] .ck');
    if(i) try{ i.focus({preventScroll:true}); i.scrollIntoView({block:'nearest', behavior:'smooth'}); }catch(_){}
  }
  else if(act === 'curious' || act === 'water'){
    const r = await U.busy(b, () => QO.api.markCurious(qid));
    if(r === undefined) return;
    if(r){
      T.curious[qid] = true;
      const q = T.fqs && T.fqs.find(x => x.id === qid);
      if(q && !q.watered){ q.watered = true; q.water_count = (+q.water_count || 0) + 1; const m = T.mates && T.mates.find(x => x.owner_number === T.friend); if(m) m.water = (+m.water || 0) + 1; }
      const got = await QO.acorn('water', qid);
      repaint('forest'); U.toast('친구 질문에 물을 줬어요' + (got ? ' · 🌰 +' + got : '') + '.');
    }
    else U.toast('이 질문에는 물을 줄 수 없어요.');
  }
  else if(act === 'friend'){
    const n = Number(b.dataset.n);
    if(T.friend === n){ T.friend = null; repaint('forest'); }
    else{ T.pick = null; openFriend(n); if(QO.world) QO.world.walkToTree(n); const w = U.$('#body .wd'); if(w) try{ w.scrollIntoView({block:'nearest', behavior:'smooth'}); }catch(_){} }
  }
  else if(act === 'friend-close'){ T.friend = null; repaint('forest'); }
  else if(act === 'shop-cat'){ T.shopCat = ['companion', 'fruit'].indexOf(b.dataset.c) >= 0 ? b.dataset.c : 'tree'; T.shopErr = ''; repaint('tree'); }
  else if(act === 'item') await itemTap(b, b.dataset.id);
  else if(act === 'fruit') await fruitTap(b, b.dataset.id);
});
/* 단서 칸에서 Enter = 보내기(Shift+Enter 는 줄바꿈, 한글 조합 중에는 무시) */
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229 || e.repeat) return;
  const i = e.target.closest && e.target.closest(TPL_IN); if(!i) return;
  e.preventDefault();
  const btn = U.$('#body [data-tr="send"][data-q="' + i.dataset.q + '"]');
  if(btn) btn.click();
});

/* ═══════════ 탭 등록 · 다시 읽기 ═══════════ */
QO.tabs.register({
  id:'tree', label:'내 나무', icon:QO.ui.icons.tree,
  render:renderTree,
  onShow(){ loadTree(); }
});
QO.tabs.register({
  id:'forest', label:'우리 반 숲', icon:QO.ui.icons.forest,
  render:renderForest,
  onShow(){ loadForest(); }
});
/* 다시 들어오면(로그인·시연 학생 바꾸기) 지난 화면 자료는 버리고, 지금 탭이 나무·숲이면 새로 읽는다 */
QO.bus.on('ready', () => {
  clear(uidNow());
  paintSeason();
  const c = QO.tabs.current();
  if(c === 'tree') loadTree(); else if(c === 'forest') loadForest();
});
QO.bus.on('me:changed', () => { sync(); repaint('tree'); });
QO.bus.on('footprints:changed', () => repaint('tree'));
QO.bus.on('live:changed', () => repaint('forest'));
QO.bus.on('questions:changed', d => { if(d && d.all && QO.tabs.current() === 'tree') loadTree(); });

/* ═══════════ 스스로 시험 ═══════════ */
if(!QO.selftest) return;
const add = QO.selftest.add;
const treeReady = t => t.waitFor(() => document.querySelector('#body .tr-tree[data-ready]'));
const forestReady = t => t.waitFor(() => document.querySelector('#body .tr-places[data-ready]'));

add('나무 · 레벨은 서버 값(찍어 둔 레벨이 더 크면 그것)·열매 그림', async t => {
  try{ localStorage.removeItem('qo2-tree-legacy-note-u-A'); }catch(_){}
  await t.click('#nav [data-t="tree"]');
  const card = await treeReady(t);
  const srv = await t.api.myTree();
  t.eq(Number(card.dataset.level), Math.max(srv.level, srv.legacy_level || 0), '레벨(나무 크기)');
  t.expect(!/레벨/.test(U.$('#body .tr-cap').textContent) && /레벨 \d/.test(U.$('#body .tree-wrap svg').getAttribute('aria-label')), '레벨 숫자는 화면 글자에 없고 그림 설명에만');
  const kinds = U.$$('#body .tr-fruit').map(g => g.dataset.kind);
  t.eq(kinds, ['fruit', 'fruit', 'fog'], '열매 그림(열매 둘·안개 하나)');
  t.eq(U.$$('#body .tr-fruit[data-sprout]').length, srv.sprout, '새싹');
  t.eq(U.$('#body .tr-st-fruit b').textContent, String(srv.fruit + srv.fog + srv.group_fruit), '열매 수');
  t.expect(U.$('#body .tr-note'), '찍어 둔 레벨이 있으면 첫 안내');
  await t.click('#body [data-tr="note-ok"]');
  t.expect(!U.$('#body .tr-note'), '안내를 닫으면 사라짐');
  /* 서버가 레벨을 낮게 줘도 찍어 둔 레벨 아래로 그리지 않음 */
  const orig = QO.mock.api.myTree;
  QO.mock.api.myTree = async function(){ const r = await orig(); return Object.assign(r, {level:2, legacy_level:6}); };
  try{
    await t.click('#nav [data-t="explore"]'); await t.click('#nav [data-t="tree"]');
    await t.waitFor(() => { const c = U.$('#body .tr-tree'); return c && c.dataset.level === '6'; });
  } finally { QO.mock.api.myTree = orig; }
  /* 찍어 둔 레벨이 더 크면 서버도 그 값 */
  t.db.legacy_level.find(l => l.user_id === 'u-A').level = 8;
  await t.click('#nav [data-t="explore"]'); await t.click('#nav [data-t="tree"]');
  await t.waitFor(() => { const c = U.$('#body .tr-tree'); return c && c.dataset.level === '8'; });
});

add('나무 · 받은 꽃(덕분에 __)이 목록·그림·수에 나온다', async t => {
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  t.expect(/여기에 꽃이 피어요/.test(U.$('#body .tr-flowers').textContent), '꽃이 없을 때 안내');
  t.eq(U.$$('#body .tr-flower').length, 0, '꽃 그림 없음');
  t.as('B');
  await t.api.saveJournal(121, {method:{kind:'exp', plan:'전구 하나를 빼 보고 다른 전구가 켜지는지 보기'}});
  t.eq(await t.api.thankClue(502, '덕분에 실험 방법을 정했어요'), true, '나래가 고마움');
  await t.loginAs('A');
  await t.click('#nav [data-t="tree"]');
  await t.waitFor(() => /실험 방법을 정했어요/.test((U.$('#body .tr-flowers') || {}).textContent || ''));
  const row = U.$('#body .tr-fl');
  t.expect(/^덕분에 실험 방법을 정했어요/.test(row.querySelector('b').textContent), '「덕분에 __」 한 줄');
  t.expect(/전구 두 개를 병렬로/.test(row.textContent), '어느 질문인지');
  t.eq(U.$$('#body .tr-flower').length, 1, '꽃 그림 하나');
  t.eq(U.$('#body .tr-st-flower b').textContent, '1', '꽃 수');
  const mine = await t.api.receivedFlowers();
  t.eq(mine.length, 1, '받은 꽃 함수');
  t.as('B'); t.eq((await t.api.receivedFlowers()).length, 0, '준 사람에게는 받은 꽃 없음'); t.as('A');
});

add('나무 · 발자국은 숫자 없이 칸 종류만(나의 성장 탭), 도토리는 머리글과 같다', async t => {
  await t.click('#nav [data-t="grow"]');
  await t.waitFor(() => t.state.footprints.length > 0 && U.$('#body .tr-fp-chips'));
  const has = {}; t.state.footprints.forEach(f => { has[f.step] = true; });
  for(const s of ['predict', 'method', 'find', 'wrap', 'extend']) t.eq(U.$('#body .tr-fp-chips [data-step="' + s + '"]').classList.contains('on'), !!has[s], '발자국 ' + s);
  t.expect(!/[0-9]/.test(U.$('#body .tr-fp').textContent), '발자국에 숫자가 없음');
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  t.eq(U.$('#body .tr-seeds').textContent, document.getElementById('acorn').textContent, '도토리 = 머리글');
  t.eq(U.$('#body .tr-seeds').textContent, String(t.state.me.seeds), '도토리 = profile.seeds');
  t.expect(U.$('#body .tr-shop'), '꾸미기 있음');
  /* 도토리가 바뀌면 함께 바뀜 */
  QO.store.setSeeds(31);
  t.eq(U.$('#body .tr-seeds').textContent, '31', '도토리 다시 그림');
});

add('나무 · 숲 장소 열림·잠김과 다음에 열릴 곳(숫자 없음)', async t => {
  await t.click('#nav [data-t="forest"]');
  const pc = await forestReady(t);
  t.expect(U.$('#body .places [data-place="spring"]').classList.contains('on'), '샘물 열림');
  t.expect(!U.$('#body .places [data-place="bridge"]').classList.contains('on'), '다리 잠김');
  t.eq(U.$('#body .tr-next').textContent, '다음에 열릴 곳: 다리', '다음에 열릴 곳');
  t.expect(pc.textContent.indexOf('친구 단서로 막힌 칸이 처음 풀린 날 열려요.') >= 0, '열리는 조건 문구');
  t.expect(U.$('#body .wd-sr [data-place="spring"]') && !U.$('#body .wd-sr [data-place="bridge"]'), '숲에는 열린 곳만');
  const noDigit = () => {
    t.expect(!/[0-9]/.test(U.$('#body .tr-places').textContent), '장소 카드에 숫자');
    t.expect(!/[0-9]/.test(U.$('#body .wd-sr').textContent), '숲 장소 글자에 숫자');
    t.expect(!U.$$('#body .tr-pin').some(x => /[0-9]/.test(x.getAttribute('aria-label'))), '깃발 이름에 숫자');
  };
  noDigit();
  /* 친구 단서로 막힌 칸이 풀리면 다리 */
  t.as('B');
  await t.api.saveJournal(121, {method:{kind:'exp', plan:'전구 하나를 빼 보고 다른 전구가 켜지는지 보기'}});
  await t.api.thankClue(502, '덕분에 실험 방법을 정했어요');
  await t.loginAs('A');
  await t.click('#nav [data-t="forest"]');
  await t.waitFor(() => U.$('#body .wd-sr [data-place="bridge"]'));
  t.eq(U.$('#body .tr-next').textContent, '다음에 열릴 곳: 관측소', '다음은 관측소');
  t.expect(U.$('#body .tr-places').textContent.indexOf('모든 모둠 일지가 정리까지 간 날 열려요.') >= 0, '관측소 조건');
  noDigit();
  /* 순서와 다르게 열려도(겨울 숲 먼저) 다음은 앞에서부터, 모두 열리면 끝 문구 */
  const y = U.schoolYear();
  t.db.class_forest_unlocks.push({school_year:y, grade:2, class_no:11, place:'winter', unlocked_at:new Date().toISOString()});
  await t.click('#nav [data-t="tree"]'); await t.click('#nav [data-t="forest"]');
  await t.waitFor(() => U.$('#body .wd-sr [data-place="winter"]'));
  t.eq(U.$('#body .tr-next').textContent, '다음에 열릴 곳: 관측소', '겨울 숲이 먼저 열려도 다음은 관측소');
  t.db.class_forest_unlocks.push({school_year:y, grade:2, class_no:11, place:'obs', unlocked_at:new Date().toISOString()});
  await t.click('#nav [data-t="tree"]'); await t.click('#nav [data-t="forest"]');
  await t.waitFor(() => /숲이 모두 열렸어요/.test(U.$('#body .tr-next').textContent));
  t.eq(U.$$('#body .wd-sr [data-place]').length, 4, '네 곳 모두 숲에');
  noDigit();
  /* 한 번 열린 곳은 서버가 빠뜨려도 그대로 */
  t.db.class_forest_unlocks = t.db.class_forest_unlocks.filter(u => u.place !== 'obs');
  await t.click('#nav [data-t="tree"]'); await t.click('#nav [data-t="forest"]');
  await t.wait(200);
  t.expect(U.$('#body .wd-sr [data-place="obs"]'), '열린 곳은 다시 잠기지 않음');
});

add('나무 · 숲 깃발(익명 SOS 도 이름 없이) → 단서 보내기·다른 종류·나도 궁금해요', async t => {
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  const ids = U.$$('#body .tr-pin').map(g => Number(g.dataset.q)).sort((a, b) => a - b);
  t.eq(ids, [121, 123, 131, 141], 'SOS 깃발(익명 123 도 — 깃발엔 이름이 없음)');
  t.eq(U.$$('#body .tr-pin').length, 4, '누를 곳');
  t.expect(U.$$('#body .tr-pin').every(b => b.offsetWidth >= 44 && b.offsetHeight >= 44), '누를 곳 44px');
  /* 이미 단서를 보낸 질문 */
  await t.click('#body .tr-pin[data-q="121"]');
  await t.waitFor('#tr-fq[data-q="121"]');
  t.expect(/단서를 보냈어요/.test(U.$('#tr-fq').textContent), '보낸 단서 표시');
  t.expect(!/나래/.test(U.$('#tr-fq').textContent), '이름은 안 보임');
  /* 찾기에서 막힌 질문 → 종류 넷이 처음부터 보이고, 고르기 전엔 빈칸이 없음. 막힌 칸에 맞는 종류엔 표시 */
  await t.click('#body .tr-pin[data-q="131"]');
  await t.waitFor('#tr-fq[data-q="131"]');
  t.eq(U.$$('#body .ck[data-q="131"]').length, 4, '단서 종류 넷이 처음부터 보임');
  t.expect(!U.$('#body .cl-free[data-q="131"]'), '고르기 전엔 글칸 없음');
  t.expect(/막힌 칸에 맞아요/.test(U.$('#body .ck[data-q="131"][data-k="where"]').textContent), '막힌 칸에 맞는 종류 표시');
  t.expect(U.$$('#body .ck[data-q="131"]').every(b => b.offsetHeight >= 44), '종류 단추 44px');
  await t.click('#body .ck[data-q="131"][data-k="test"]');
  t.eq(U.$('#body .cl-free[data-q="131"]').dataset.kind, 'test', '고른 종류(해 볼 실험)');
  t.expect(/전지를 반대로/.test(U.$('#body .cl-free[data-q="131"]').placeholder), '종류마다 예시 글');
  t.expect(!U.$('#body .tpl[data-q="131"]'), '빈칸 틀은 없음(자유롭게 쓰기)');
  t.eq(U.$('#body .ck[data-q="131"][data-k="test"]').getAttribute('aria-checked'), 'true', '고른 표시');
  await t.click('#body .ck[data-q="131"][data-k="where"]');
  t.eq(U.$('#body .cl-free[data-q="131"]').dataset.kind, 'where', '다른 종류로 바로 바꿈');
  await t.click('#body [data-tr="send"][data-q="131"]');
  t.eq(U.$('#tr-ce').textContent, '다섯 글자 넘게 적어 주세요.', '빈 글 검사');
  await t.type('#body .cl-free[data-q="131"]', 'ㅋㅋㅋㅋㅋ');
  await t.click('#body [data-tr="send"][data-q="131"]');
  t.eq(U.$('#tr-ce').textContent, '장난 글자는 보낼 수 없어요.', '장난 글자 검사');
  await t.type('#body .cl-free[data-q="131"]', '  교과서 111쪽 코일 그림을 봐.   「자기장」으로 찾아봐  ');
  t.eq(U.$('#body .cl-count').textContent, Array.from(U.$('#body .cl-free[data-q="131"]').value).length + '/80', '글자 수 표시');
  await t.click('#body [data-tr="send"][data-q="131"]');
  await t.waitFor(() => /단서를 보냈어요/.test((U.$('#tr-fq') || {}).textContent || ''));
  const c = t.db.clues.find(x => x.question_id === 131 && x.author_id === 'u-A');
  t.expect(c && c.kind === 'where' && c.body === '교과서 111쪽 코일 그림을 봐. 「자기장」으로 찾아봐', '보낸 단서(쓴 그대로, 빈칸만 정리) — ' + (c && c.body));
  t.expect(U.$('#body .tr-pin[data-q="131"][data-sent]'), '깃발 대신 보냄 표시');
  /* 나도 궁금해요 */
  await t.click('#body .tr-pin[data-q="141"]');
  await t.waitFor('#tr-fq[data-q="141"]');
  await t.click('#body [data-tr="curious"][data-q="141"]');
  await t.waitFor(() => t.db.curious_marks.some(m => m.question_id === 141 && m.user_id === 'u-A'));
  await t.waitFor(() => !U.$('#body [data-tr="curious"][data-q="141"]'));
  /* 쓰던 글은 다시 그려도 남음 */
  await t.click('#body .ck[data-q="141"][data-k="where"]');
  await t.type('#body .cl-free[data-q="141"]', '교과서 120쪽을 봐');
  repaint('forest');
  t.eq(U.$('#body .cl-free[data-q="141"]').value, '교과서 120쪽을 봐', '다시 그려도 쓰던 글 그대로');
});

add('나무 · 상점: 못 사면 그대로, 사면 원장에서 빠지고 바로 씀, 동반자는 한 번 더 누르면 숨김', async t => {
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  const pA = () => t.db.profiles.find(p => p.id === 'u-A');
  pA().seeds = 25; QO.store.setSeeds(25);
  await t.click('#body [data-tr="item"][data-id="maple"]');
  t.expect(/모자라요/.test(U.$('#tr-se').textContent), '도토리 모자람 안내');
  t.eq(pA().seeds, 25, '못 사면 그대로');
  t.click('#body [data-tr="item"][data-id="pine"]');
  await t.waitFor('.qo-dialog [data-dlg="ok"]');
  await t.click('.qo-dialog [data-dlg="ok"]');
  await t.waitFor(() => (U.$('#body .tree-wrap svg') || {}).dataset && U.$('#body .tree-wrap svg').dataset.kind === 'pine');
  t.eq(pA().seeds, 5, '20 빠짐');
  t.eq(U.$('#body .tr-seeds').textContent, '5', '화면 도토리');
  t.expect(t.db.acorn_ledger.some(l => l.user_id === 'u-A' && l.reason === 'buy' && l.ref_id === 'pine' && l.delta === -20), '원장 한 줄');
  t.expect(U.$('#body [data-tr="item"][data-id="pine"]').classList.contains('on'), '쓰는 중 표시');
  await t.click('#body [data-tr="item"][data-id="default"]');
  await t.waitFor(() => U.$('#body .tree-wrap svg').dataset.kind === 'default');
  t.eq(pA().seeds, 5, '산 것으로 돌아가도 도토리 그대로');
  pA().seeds = 15; QO.store.setSeeds(15);
  await t.click('#body [data-tr="shop-cat"][data-c="companion"]');
  t.click('#body [data-tr="item"][data-id="butterfly"]');
  await t.waitFor('.qo-dialog [data-dlg="ok"]');
  await t.click('.qo-dialog [data-dlg="ok"]');
  await t.waitFor('#body .tree-wrap .tr-comp[data-comp="butterfly"]');
  await t.click('#body [data-tr="item"][data-id="butterfly"]');
  await t.waitFor(() => !U.$('#body .tree-wrap .tr-comp'));
});

add('나무 · 열매 종류 10가지 — 꾸미기 「열매」에서 바꾸면 그림이 바로 바뀌고 저장, 열매를 맺은 뒤에도 바꿈', async t => {
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  t.eq(U.$('#body .tree-wrap svg').dataset.fruit, 'apple', '처음은 사과');
  await t.click('#body [data-tr="shop-cat"][data-c="fruit"]');
  await t.waitFor('#body .tr-fruit-grid');
  t.eq(U.$$('#body [data-tr="fruit"]').map(b => b.dataset.id), QO.K.FRUITS.map(f => f.id), '열매 10가지');
  t.expect(['수박', '메론', '참외', '사과', '체리', '포도'].every(n => U.$$('#body [data-tr="fruit"] b').some(b => b.textContent === n)), '수박·메론·참외·사과·체리·포도 포함');
  t.expect(U.$$('#body [data-tr="fruit"] svg').length === 10, '열매마다 그림');
  t.expect(U.$$('#body [data-tr="fruit"]').every(b => b.offsetHeight >= 44), '누를 곳 44px');
  const pA = () => t.db.profiles.find(p => p.id === 'u-A');
  const seeds = pA().seeds;
  await t.click('#body [data-tr="fruit"][data-id="watermelon"]');
  await t.waitFor(() => pA().active_fruit === 'watermelon');
  t.eq(U.$('#body .tree-wrap svg').dataset.fruit, 'watermelon', '내 나무 그림이 수박으로');
  t.expect(U.$$('#body .tree-wrap .tr-fruit').every(g => g.dataset.fruit === 'watermelon'), '달린 열매가 모두 수박');
  t.eq(U.$('#body [data-tr="fruit"][data-id="watermelon"]').getAttribute('aria-pressed'), 'true', '쓰는 중 표시');
  t.eq(pA().seeds, seeds, '도토리는 그대로');
  t.expect(U.$$('#body .tree-wrap .tr-fruit').length > 0, '(가람은 이미 열매를 맺음)');
  await t.click('#body [data-tr="fruit"][data-id="grape"]');
  await t.waitFor(() => pA().active_fruit === 'grape');
  t.eq(U.$('#body .tree-wrap svg').dataset.fruit, 'grape', '열매를 맺은 뒤에도 다시 바꿈(포도)');
  await t.rejects(t.api.setFruit('banana'), '없는 열매예요');
  /* 다시 들어와도 고른 열매 그대로 */
  await t.loginAs('A');
  await t.click('#nav [data-t="tree"]');
  await treeReady(t);
  await t.waitFor(() => U.$('#body .tree-wrap svg').dataset.fruit === 'grape');
});

add('나무 · 친구 나무에도 그 친구가 고른 열매', async t => {
  t.db.profiles.find(p => p.id === 'u-B').active_fruit = 'chamoe';
  t.db.questions.push(Object.assign({}, t.db.questions.find(q => q.user_id === 'u-B'), {id:9901, fruit_kind:'fruit', created_at:new Date().toISOString()}));
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  await t.waitFor('#body .tr-mate[data-n="2"] svg');
  t.eq(U.$('#body .tr-mate[data-n="2"] svg').dataset.fruit, 'chamoe', '나래 나무 = 참외');
  t.expect(U.$$('#body .tr-mate[data-n="2"] .tr-fruit').every(g => g.dataset.fruit === 'chamoe'), '나래 나무 열매가 참외');
  t.eq(U.$('#body .tr-mate[data-n="3"] svg').dataset.fruit, 'apple', '안 고른 친구는 사과');
});

add('나무 · 우리 반 나무 → 친구 질문 → 물 주기(한 번만, 수가 늘어남)', async t => {
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  await t.waitFor('#body .tr-mate');
  const names = U.$$('#body .tr-mate b').map(b => b.textContent);
  t.expect(names.length > 0 && names.every(n => !/가람/.test(n)), '나는 빠짐 — ' + names.join(','));
  await t.click('#body .tr-mate[data-n="2"]');
  await t.waitFor('#tr-friend .tr-fqrow');
  t.expect(!U.$$('#tr-friend .tr-fqrow').some(r => Number(r.dataset.q) === 123), '익명 질문은 안 보임');
  const btn = U.$('#tr-friend [data-tr="water"]');
  t.expect(btn, '물 주기 단추');
  const qid = Number(btn.dataset.q), before = (t.db.questions.find(q => q.id === qid).watered_by || []).length;
  await t.click(btn);
  await t.waitFor(() => !U.$('#tr-friend [data-tr="water"][data-q="' + qid + '"]'));
  const q = t.db.questions.find(x => x.id === qid);
  t.eq((q.watered_by || []).length, before + 1, '물 한 번');
  t.eq(q.water_count, before + 1, '물 수');
  await t.api.markCurious(qid);
  t.eq(t.db.questions.find(x => x.id === qid).water_count, before + 1, '두 번 줘도 한 번');
  await t.click('#body [data-tr="friend-close"]');
  await t.waitFor(() => !U.$('#tr-friend'));
});

add('나무 · 친구 나무의 SOS 없는 질문에도 단서 주기(열매 질문도)', async t => {
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  await t.waitFor('#body .tr-mate');
  await t.click('#body .tr-mate[data-n="2"]');
  await t.waitFor('#tr-friend .tr-fqrow');
  const sos = new Set(T.forest.flags.map(y => y.id));
  const row = U.$$('#tr-friend .tr-fqrow').find(r => !sos.has(Number(r.dataset.q)) && r.querySelector('[data-tr="hint"]'));
  t.expect(row, 'SOS 아닌 질문에 단서 주기 단추');
  t.eq(U.$$('#tr-friend .tr-fqrow').filter(r => !r.querySelector('[data-tr="hint"], .tr-hsent')).length, 0, '모든 질문(열매 포함)에 단서 주기');
  const qid = Number(row.dataset.q);
  await t.click('#tr-friend [data-tr="hint"][data-q="' + qid + '"]');
  await t.waitFor('#tr-friend .ck[data-q="' + qid + '"]');
  t.eq(U.$$('#tr-friend .ck[data-q="' + qid + '"]').length, 4, '종류 넷이 처음부터');
  t.expect(!U.$('#tr-friend [data-tr="send"][data-q="' + qid + '"]'), '고르기 전엔 보내기 없음');
  await t.click('#tr-friend .ck[data-q="' + qid + '"][data-k="ask"]');
  t.eq(U.$('#tr-friend .cl-free[data-q="' + qid + '"]').dataset.kind, 'ask', '되묻기 고름');
  await t.click('#tr-friend .ck[data-q="' + qid + '"][data-k="where"]');
  t.eq(U.$('#tr-friend .cl-free[data-q="' + qid + '"]').dataset.kind, 'where', '찾아볼 곳으로 바꿈');
  await t.click('#body [data-tr="send"][data-q="' + qid + '"]');
  t.eq(U.$('#tr-ce').textContent, '다섯 글자 넘게 적어 주세요.', '빈 글 검사');
  await t.type('#tr-friend .cl-free[data-q="' + qid + '"]', '자석 세기로 검색해 봐');
  repaint('forest');
  t.eq(U.$('#tr-friend .cl-free[data-q="' + qid + '"]').value, '자석 세기로 검색해 봐', '다시 그려도 쓰던 글 그대로');
  await t.click('#body [data-tr="send"][data-q="' + qid + '"]');
  await t.waitFor(() => U.$('#tr-friend .tr-fqrow[data-q="' + qid + '"] .tr-hsent'));
  const c = t.db.clues.find(x => x.question_id === qid && x.author_id === 'u-A');
  t.expect(c && c.kind === 'where' && c.body === '자석 세기로 검색해 봐', '보낸 단서 — ' + (c && c.body));
  t.expect(/단서를 보냈어요/.test(U.$('#tr-friend .tr-fqrow[data-q="' + qid + '"]').textContent), '보낸 단서 글');
  t.expect(!U.$('#tr-friend [data-tr="hint"][data-q="' + qid + '"]'), '보낸 뒤엔 단추 대신 보냄 표시');
});

add('나무 · 선생님 숲 방문: 숲 탭만 · 그 반 깃발·나무 · 선생님 단서 · 반 바꾸기', async t => {
  await t.waitFor(() => document.documentElement.classList.contains('visit'));
  t.eq(U.$$('#nav button').map(b => b.dataset.t), ['forest'], '숲 탭만');
  t.eq(QO.state.visit && QO.state.visit.grade + '-' + QO.state.visit.class_no, '2-11', '옮긴 반(2-11)으로');
  t.expect(!U.$('#visitCls').hidden && /2학년 11반 숲/.test(U.$('#visitCls').textContent), '머리글에 지금 반');
  t.expect(U.$('#acorn').parentNode.hidden, '도토리는 숨김');
  await forestReady(t);
  t.eq(U.$$('#body .tr-pin').map(g => Number(g.dataset.q)).sort((a, b) => a - b), [103, 121, 123, 131, 141], '그 반 SOS 깃발(가람 103 도 — 선생님은 반 전체)');
  await t.waitFor('#body .tr-mate');
  t.expect(U.$$('#body .tr-mate b').some(b => /가람/.test(b.textContent)), '반 나무에 가람도 있음');
  await t.click('#body .tr-pin[data-q="131"]');
  await t.waitFor('#tr-fq[data-q="131"] .ck');
  t.expect(!U.$('#tr-fq [data-tr="curious"]'), '선생님은 물 주기 없음');
  t.expect(/선생님 단서/.test(U.$('#tr-fq').textContent), '선생님 단서 머리글');
  await t.click('#body .ck[data-q="131"][data-k="test"]');
  await t.type('#body .cl-free[data-q="131"]', '자석 두 개를 붙였다 떼어 보면 어떨까?');
  await t.click('#body [data-tr="send"][data-q="131"]');
  await t.waitFor(() => t.db.clues.some(c => c.question_id === 131 && c.author_id === 'u-T'));
  const c = t.db.clues.find(x => x.question_id === 131 && x.author_id === 'u-T');
  t.expect(c.by_teacher === true && c.kind === 'test' && c.grade === 2 && c.class_no === 11, '선생님 단서 줄(by_teacher·반)');
  await t.waitFor(() => /단서를 보냈어요/.test((U.$('#tr-fq') || {}).textContent || ''));
  await t.click('#body .tr-mate[data-n="2"]');
  await t.waitFor('#tr-friend .tr-fqrow');
  t.expect(!U.$('#tr-friend [data-tr="water"]'), '친구 나무에도 물 주기 없음');
  t.expect(U.$('#tr-friend [data-tr="hint"]'), '친구 질문에 단서 주기');
  QO.app.setVisitClass(2, 5);
  await t.waitFor(() => /2학년 5반 숲/.test(U.$('#visitCls').textContent));
  await forestReady(t);
  await t.waitFor('#body .tr-mate');
  t.eq(U.$$('#body .tr-mate b').map(b => b.textContent), ['1번 마루'], '2-5 반 나무');
  t.eq(U.$$('#nav button').length, 1, '반을 바꿔도 숲 탭만');
}, {as:'T'});

add('나무 · 단서 시간에는 숲에서 단서를 보내지 않고 함께 탭으로', async t => {
  const row = {id:QO.mock.h.seq('lesson_live'), teacher_id:1, grade:2, class_no:11, mode:'clue', stage:2, stage_started_at:new Date().toISOString(), active:true, created_at:new Date().toISOString()};
  t.db.lesson_live.push(row);
  await QO.live.refresh();
  await t.click('#nav [data-t="forest"]');
  await forestReady(t);
  await t.click('#body .tr-pin[data-q="131"]');
  await t.waitFor('#tr-fq[data-q="131"] .tr-lock');
  t.expect(!U.$('#body [data-tr="send"]'), '보내기 단추 없음');
  row.active = false; await QO.live.refresh();
  await t.waitFor('#body .ck[data-q="131"]');
});
})();
