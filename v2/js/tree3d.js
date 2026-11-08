/* 내 나무 3D — tree.js 의 「내 나무」 칸 위에 three.js(r128, lib/three.min.js)로 그린다(2026-11-08).
   · 손가락·마우스로 끌어 돌려 본다. 가만두면 천천히 돈다. 잎이 살랑, 벚꽃·단풍은 잎이 떨어지고 이야기나무는 별빛이 반짝인다.
   · 열매(빨강)·안개 열매(파란 회색+구름)·모둠 열매(셋)·새싹·받은 꽃·동반자(나비·파랑새…)를 그대로 단다.
   · 나무 모양은 학생마다 다르게(아이디로 씨앗) — 같은 학생은 늘 같은 모양.
   · WebGL 이 안 되거나 three 를 못 불러오면 원래 SVG 그대로. 화면에 안 보이면 그리기를 멈춘다(태블릿 배터리). */
(function(){
'use strict';
const QO = window.QO;
let THREE = null, loading = null;
function loadThree(){
  if(window.THREE) return Promise.resolve(THREE = window.THREE);
  if(loading) return loading;
  loading = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'lib/three.min.js'; s.async = true;
    s.onload = () => { THREE = window.THREE; THREE ? ok(THREE) : no(new Error('three')); };
    s.onerror = () => no(new Error('three'));
    document.head.appendChild(s);
  });
  return loading;
}
function webglOK(){ try{ const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); }catch(_){ return false; } }

/* 씨앗 난수 — 같은 학생은 같은 모양 */
function rng(seed){
  let h = 2166136261; const s = String(seed || 'tree');
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const LEAF = {
  default:[0x5FA86D, 0x6CB57A, 0x4F9A5E, 0x7DC08A],
  cherry:[0xF2A7BE, 0xF6B9CB, 0xEE98B2, 0xFAD0DD],
  maple:[0xE07A3A, 0xE8904B, 0xD0582A, 0xF0A85C],
  baobab:[0x7FAF5E, 0x8BBA69, 0x6E9F50, 0x99C474],
  storytree:[0x2F5D7C, 0x3A6B8C, 0x244C66, 0x4A7FA0],
  pine:[0x2E6B45, 0x357A4F, 0x3F8A5A],
  palm:[0x4E9A5B, 0x5DAA68, 0x3F8A4D]
};
const COMP_IC = {butterfly:'🦋', bird:'🐦', squirrel:'🐿️', swing:'', beehive:'🍯', owl:'🦉', fox:'🦊'};

const S = {renderer:null, scene:null, camera:null, root:null, host:null, raf:0, key:'', angle:0.5, auto:true, lastTouch:0, drag:null, visible:true, io:null, anim:[], t0:0};

function mat(color, extra){ return new THREE.MeshStandardMaterial(Object.assign({color:color, flatShading:true, roughness:0.85, metalness:0}, extra || {})); }
function emojiSprite(ch, size){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 72);
  const tx = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tx, transparent:true, depthWrite:false}));
  sp.scale.set(size, size, size);
  return sp;
}

/* ── 나무 만들기 ── */
function build(t, look, seed){
  const R = rng(seed + ':' + look.tree);
  const kind = look.tree || 'default';
  const lv = Math.max(1, Math.min(10, Math.max(+t.level || 1, +t.legacy_level || 0)));
  const G = new THREE.Group();
  const leafCol = LEAF[kind] || LEAF.default;
  const H = (kind === 'palm' ? 1.7 : kind === 'pine' ? 1.0 : 0.95) + lv * (kind === 'palm' ? 0.14 : 0.09);   // 줄기 높이
  const thick = (kind === 'baobab' ? 0.46 : kind === 'palm' ? 0.14 : 0.2) + lv * 0.014;

  /* 땅 */
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.18, 40), mat(0x9CCB7E));
  ground.position.y = -0.09; G.add(ground);
  const grassTop = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.02, 40), mat(0xAED68F));
  grassTop.position.y = 0.005; G.add(grassTop);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.2 + lv * 0.06, 32), new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.12}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; G.add(shadow);
  /* 풀 몇 포기 */
  for(let i = 0; i < 26; i++){
    const a = R() * Math.PI * 2, r = 1.0 + R() * 1.45;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18 + R() * 0.12, 4), mat(R() < 0.5 ? 0x6FAE57 : 0x83BE66));
    b.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r); b.rotation.z = (R() - 0.5) * 0.5; G.add(b);
  }

  const sway = new THREE.Group(); G.add(sway);      // 줄기 위쪽이 살랑
  const trunkMat = mat(kind === 'storytree' ? 0x5B4A3A : 0x8B6A4A);
  const tips = [];                                  // 잎이 달릴 자리
  /* 줄기: 마디를 쌓아 살짝 휜다 */
  const segs = kind === 'palm' ? 9 : 5;
  let p = new THREE.Vector3(0, 0, 0), dir = new THREE.Vector3(0, 1, 0);
  const bendX = (R() - 0.5) * (kind === 'palm' ? 0.5 : 0.18), bendZ = (R() - 0.5) * (kind === 'palm' ? 0.5 : 0.18);
  for(let i = 0; i < segs; i++){
    const len = H / segs, r0 = thick * (1 - i / segs * (kind === 'baobab' ? 0.35 : 0.55)), r1 = thick * (1 - (i + 1) / segs * (kind === 'baobab' ? 0.35 : 0.55));
    const d = dir.clone().add(new THREE.Vector3(bendX * (i / segs), 0, bendZ * (i / segs))).normalize();
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len * 1.04, 8), trunkMat);
    const mid = p.clone().add(d.clone().multiplyScalar(len / 2));
    seg.position.copy(mid); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    (i < 2 ? G : sway).add(seg);
    p = p.clone().add(d.clone().multiplyScalar(len)); dir = d;
  }
  const top = p.clone();

  if(kind === 'pine'){
    const n = Math.max(3, Math.min(6, 2 + Math.ceil(lv / 2)));
    for(let i = 0; i < n; i++){
      const r = (1.25 - i * 0.18) * (0.8 + lv * 0.03), h = 0.9 - i * 0.05;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat(leafCol[i % leafCol.length]));
      cone.position.set(0, H * 0.45 + i * (H * 0.55 / n) + 0.25, 0); sway.add(cone);
      for(let k = 0; k < 3; k++){ const a = R() * Math.PI * 2; tips.push(new THREE.Vector3(Math.cos(a) * r * 0.75, cone.position.y - h * 0.25, Math.sin(a) * r * 0.75)); }
    }
  } else if(kind === 'palm'){
    const n = 6 + Math.min(4, Math.floor(lv / 3));
    for(let i = 0; i < n; i++){
      const a = i / n * Math.PI * 2 + R() * 0.3;
      const frond = new THREE.Group();
      for(let k = 0; k < 6; k++){
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), mat(leafCol[k % leafCol.length]));
        leaf.scale.set(1.6, 0.25, 0.7);
        const u = (k + 1) / 6;
        leaf.position.set(u * 1.25, Math.sin(u * Math.PI) * 0.35 - u * u * 0.7, 0);
        leaf.rotation.z = -u * 0.9;
        frond.add(leaf);
      }
      frond.position.copy(top); frond.rotation.y = a; sway.add(frond);
    }
    for(let k = 0; k < 6; k++){ const a = R() * Math.PI * 2; tips.push(top.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, -0.18, Math.sin(a) * 0.3))); }
  } else {
    /* 가지 + 잎 뭉치 */
    const nBranch = 3 + Math.min(4, Math.floor(lv / 2));
    const crownY = top.y;
    for(let i = 0; i < nBranch; i++){
      const a = i / nBranch * Math.PI * 2 + R() * 0.6;
      const up = kind === 'baobab' ? 0.25 : 0.55 + R() * 0.25;
      const bl = (kind === 'baobab' ? 1.0 : 0.7) + lv * 0.05 + R() * 0.2;
      const start = new THREE.Vector3(0, crownY - H * (0.08 + R() * 0.22), 0);
      const d = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
      const br = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.28, thick * 0.5, bl, 6), trunkMat);
      br.position.copy(start.clone().add(d.clone().multiplyScalar(bl / 2)));
      br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); sway.add(br);
      tips.push(start.clone().add(d.clone().multiplyScalar(bl)));
    }
    tips.push(top.clone().add(new THREE.Vector3(0, 0.2, 0)));
    const nBlob = Math.min(30, 12 + lv * 2);
    for(let i = 0; i < nBlob; i++){
      const base = tips[i % tips.length];
      const r = (kind === 'baobab' ? 0.5 : 0.46) + R() * 0.26 + lv * 0.02;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(leafCol[Math.floor(R() * leafCol.length)], kind === 'storytree' ? {emissive:0x0E2233, emissiveIntensity:0.6} : null));
      blob.position.set(base.x * 1.05 + (R() - 0.5) * 0.7, base.y + 0.15 + (R() - 0.35) * 0.55, base.z * 1.05 + (R() - 0.5) * 0.7);
      if(kind === 'baobab') blob.scale.y = 0.62;
      blob.rotation.set(R() * 3, R() * 3, R() * 3);
      sway.add(blob);
    }
  }

  /* 열매 */
  const fr = [];
  const nF = +t.fruit || 0, nFog = +t.fog || 0, nGr = +t.group_fruit || 0; let sp = +t.sprout || 0;
  for(let i = 0; i < nF; i++) fr.push({k:'fruit', s:sp-- > 0});
  for(let i = 0; i < nFog; i++) fr.push({k:'fog', s:sp-- > 0});
  for(let i = 0; i < nGr; i++) fr.push({k:'group', s:false});
  fr.slice(0, 30).forEach((f, i) => {
    const base = tips[i % tips.length];
    const a = R() * Math.PI * 2, rr = kind === 'pine' ? 0.12 : 0.42 + R() * 0.22;
    const pos = new THREE.Vector3(base.x + Math.cos(a) * rr, base.y - 0.12 - R() * 0.3, base.z + Math.sin(a) * rr);
    const g = new THREE.Group(); g.position.copy(pos);
    if(f.k === 'fog'){
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(0x6F84A0, {flatShading:false, roughness:0.5})));
      for(let k = 0; k < 3; k++){ const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xE9EEF5)); c.position.set(-0.07 + k * 0.07, 0.09, 0.08); g.add(c); }
    } else if(f.k === 'group'){
      [[-0.07, 0, 0], [0.07, 0, 0], [0, 0.1, 0]].forEach(q => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), mat(0xC9433A, {flatShading:false, roughness:0.35})); m.position.set(q[0], q[1], q[2]); g.add(m); });
    } else {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), mat(0xD2413A, {flatShading:false, roughness:0.3})));
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({color:0xFFD2CC})); hl.position.set(-0.05, 0.05, 0.1); g.add(hl);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4), mat(0x5A4630)); stem.position.y = 0.15; g.add(stem);
    if(f.s){ const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), mat(0x8FD19A)); leaf.position.set(0.04, 0.22, 0); leaf.rotation.z = -0.6; g.add(leaf); }
    sway.add(g);
  });

  /* 받은 꽃(땅) */
  const nFl = Math.min(+t.flowers || 0, 14);
  for(let i = 0; i < nFl; i++){
    const a = i / Math.max(1, nFl) * Math.PI * 2 + 0.4, r = 1.3 + R() * 0.9;
    const fl = new THREE.Group(); fl.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), mat(0x5E9E4E)); st.position.y = -0.08; fl.add(st);
    for(let k = 0; k < 5; k++){ const pe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xF3A8C2)); pe.position.set(Math.cos(k / 5 * 6.283) * 0.05, 0, Math.sin(k / 5 * 6.283) * 0.05); fl.add(pe); }
    const ce = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xF7D774)); ce.position.y = 0.01; fl.add(ce);
    G.add(fl);
  }

  /* 동반자 */
  const anim = [];
  const comp = look.comp;
  if(comp === 'swing'){
    const b = tips[0] || top;
    const sw = new THREE.Group(); sw.position.set(b.x * 0.8, b.y - 0.05, b.z * 0.8);
    const L = Math.max(0.6, b.y - 0.45);
    [-0.14, 0.14].forEach(x => { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, L, 4), mat(0xC9A46A)); rope.position.set(x, -L / 2, 0); sw.add(rope); });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.14), mat(0x9C6B3C)); seat.position.y = -L; sw.add(seat);
    sway.add(sw); anim.push(tm => { sw.rotation.x = Math.sin(tm * 1.6) * 0.35; });
  } else if(comp && COMP_IC[comp]){
    const s = emojiSprite(COMP_IC[comp], comp === 'fox' || comp === 'squirrel' ? 0.55 : 0.42);
    if(comp === 'fox'){ s.position.set(1.4, 0.28, 0.6); anim.push(tm => { const a = tm * 0.35; s.position.set(Math.cos(a) * 1.6, 0.28, Math.sin(a) * 1.6); }); }
    else if(comp === 'squirrel'){ s.position.set(0.45, 0.28, 0.35); anim.push(tm => { s.position.y = 0.28 + Math.abs(Math.sin(tm * 3)) * 0.12; }); }
    else if(comp === 'butterfly'){ anim.push(tm => { const a = tm * 0.8; s.position.set(Math.cos(a) * 1.3, top.y - 0.2 + Math.sin(tm * 2.3) * 0.25, Math.sin(a) * 1.3); }); }
    else { const b = tips[1] || top; s.position.set(b.x, b.y + 0.18, b.z); if(comp === 'beehive') s.position.y = b.y - 0.35; }
    G.add(s);
  }

  /* 떨어지는 잎·별빛 */
  if(kind === 'cherry' || kind === 'maple'){
    const col = kind === 'cherry' ? 0xF6B9CB : 0xE8904B, petals = [];
    for(let i = 0; i < 18; i++){
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.045, 5), new THREE.MeshBasicMaterial({color:col, side:THREE.DoubleSide}));
      m.userData = {a:R() * 6.28, r:0.3 + R() * 1.4, sp:0.25 + R() * 0.3, ph:R() * 10};
      petals.push(m); G.add(m);
    }
    anim.push(tm => petals.forEach(m => { const u = m.userData, y = (top.y + 0.4) - ((tm * u.sp + u.ph) % (top.y + 0.4));
      m.position.set(Math.cos(u.a + tm * 0.3) * u.r, y, Math.sin(u.a + tm * 0.3) * u.r); m.rotation.set(tm * 2 + u.ph, tm + u.ph, 0); }));
  }
  if(kind === 'storytree'){
    const geo = new THREE.BufferGeometry(), n = 60, arr = new Float32Array(n * 3);
    for(let i = 0; i < n; i++){ const b = tips[i % tips.length]; arr[i * 3] = b.x + (R() - 0.5) * 1.6; arr[i * 3 + 1] = b.y + (R() - 0.5) * 1.1; arr[i * 3 + 2] = b.z + (R() - 0.5) * 1.6; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pm = new THREE.PointsMaterial({color:0xFFE58A, size:0.07, transparent:true});
    sway.add(new THREE.Points(geo, pm)); anim.push(tm => { pm.opacity = 0.55 + Math.sin(tm * 2.2) * 0.4; });
  }
  anim.push(tm => { sway.rotation.z = Math.sin(tm * 0.9) * 0.025; sway.rotation.x = Math.sin(tm * 0.7 + 1) * 0.018; });
  return {group:G, anim:anim, height:Math.max(top.y + 1.2, 2.6)};
}

/* ── 화면 ── */
function ensure(host){
  if(!S.renderer){
    S.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    S.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    S.scene = new THREE.Scene();
    S.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    S.scene.add(new THREE.HemisphereLight(0xFFFBEA, 0x6E8B5A, 1.05));
    const sun = new THREE.DirectionalLight(0xFFF4DD, 0.9); sun.position.set(3, 6, 4); S.scene.add(sun);
    const cv = S.renderer.domElement; cv.className = 'tr3d-cv'; cv.setAttribute('aria-hidden', 'true');
    /* 끌어서 돌리기 */
    cv.addEventListener('pointerdown', e => { S.drag = {x:e.clientX, a:S.angle}; S.auto = false; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
    cv.addEventListener('pointermove', e => { if(!S.drag) return; S.angle = S.drag.a + (e.clientX - S.drag.x) * 0.012; });
    const up = () => { S.drag = null; S.lastTouch = performance.now(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    S.io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { S.visible = es.some(x => x.isIntersecting); if(S.visible) loop(); }) : null;
    document.addEventListener('visibilitychange', () => { if(!document.hidden) loop(); });
  }
  if(S.host !== host){
    S.host = host;
    host.classList.add('tr3d-on');
    host.appendChild(S.renderer.domElement);
    if(S.io){ S.io.disconnect(); S.io.observe(host); }
  }
  resize();
}
function resize(){
  if(!S.host) return;
  const w = Math.max(200, S.host.clientWidth || 300), h = Math.round(Math.min(380, Math.max(240, w * 0.78)));
  S.renderer.setSize(w, h, false);
  S.renderer.domElement.style.width = w + 'px'; S.renderer.domElement.style.height = h + 'px';
  S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { if(S.renderer) resize(); });
function loop(){
  if(S.raf || !S.renderer) return;
  const step = now => {
    S.raf = 0;
    if(!S.host || !document.body.contains(S.host) || document.hidden || !S.visible) return;   // 안 보이면 멈춤
    const tm = (now - S.t0) / 1000;
    if(!S.auto && !S.drag && now - S.lastTouch > 4000) S.auto = true;
    if(S.auto) S.angle += 0.004;
    const d = S.dist;
    S.camera.position.set(Math.sin(S.angle) * d, S.camY, Math.cos(S.angle) * d);
    S.camera.lookAt(0, S.lookY, 0);
    S.anim.forEach(f => f(tm));
    S.renderer.render(S.scene, S.camera);
    S.raf = requestAnimationFrame(step);
  };
  S.raf = requestAnimationFrame(step);
}
function dispose(obj){
  obj.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if(m.map) m.map.dispose(); m.dispose(); }); } });
}

/* tree.js 가 부른다: 내 나무 칸(.tree-wrap) · 나무 자료 · 모양(나무 종류·동반자) */
function mount(host, t, look, seed){
  if(!host || !t) return;
  if(QO.cfg && QO.cfg.selftest) return;                 // 스스로 시험은 SVG 로
  if(!webglOK()) return;
  loadThree().then(() => {
    if(!document.body.contains(host)) return;
    ensure(host);
    const key = JSON.stringify([t.level, t.legacy_level, t.fruit, t.fog, t.group_fruit, t.sprout, t.flowers, look.tree, look.comp, seed]);
    if(key !== S.key){
      if(S.root){ S.scene.remove(S.root); dispose(S.root); }
      const b = build(t, look, seed);
      S.root = b.group; S.anim = b.anim; S.scene.add(S.root);
      /* 실제 크기에 맞춰 사진기 자리 — 나무가 잘리지 않게 */
      const box = new THREE.Box3().setFromObject(S.root), size = box.getSize(new THREE.Vector3());
      const hh = Math.max(size.y, 2.4), ww = Math.max(size.x, size.z, 3);
      S.lookY = box.min.y + hh * 0.46; S.camY = box.min.y + hh * 0.66;
      S.dist = Math.max(hh / (2 * Math.tan(18 * Math.PI / 180)) * 1.08, ww * 1.25);
      S.key = key; S.t0 = performance.now();
    }
    loop();
  }).catch(() => { /* SVG 그대로 */ });
}
QO.tree3d = {mount:mount};
})();
