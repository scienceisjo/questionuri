/* 내 나무 3D — tree.js 의 「내 나무」 칸 위에 three.js(r128, lib/three.min.js)로 그린다(2026-11-08 처음, 11-11 다시 그림).
   · 11-11: 사용자 「이전 나무가 더 예쁘다 — 3D 로 할 수 있는 걸 다 안 해서」 → 갈라지는 가지(되풀이), 울퉁불퉁한 잎 덩어리(정점 흔들기 +
     위는 밝고 아래는 어두운 정점 색), 작은 잎 수백 장(InstancedMesh), 부드러운 그림자, 떠 있는 섬 땅(풀·흙 층·돌), 계절 넷.
   · 계절: 봄(연두·꽃잎 날림) · 여름(짙은 초록) · 가을(노랑·주황·빨강, 낙엽) · 겨울(잎 지는 나무는 맨가지+눈, 늘푸른 나무는 눈 덮임, 눈 내림).
     학생이 고른 계절은 tree.js 가 look.season 으로 넘긴다. 나무 모양(가지)은 계절이 바뀌어도 그대로(아이디 씨앗).
   · 상점 나무 그림도 이 코드로 그린다(shopThumbs) — 산 나무가 그림과 똑같게. 그림마다 그 나무의 대표 계절(벚나무 봄, 단풍나무 가을 …).
   · 열매(빨강)·안개 열매(파란 회색+구름)·모둠 열매(셋)·새싹·받은 꽃(땅)·동반자는 그대로.
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
const n3 = (x, y, z) => Math.sin(x * 3.1 + y * 1.7) * 0.5 + Math.sin(y * 2.3 + z * 3.7) * 0.3 + Math.sin(z * 2.9 + x * 1.3) * 0.2;

/* ── 계절 · 나무 종류별 색 ── */
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SIG = {default:'summer', cherry:'spring', maple:'autumn', baobab:'summer', pine:'winter', palm:'summer', storytree:'summer'};   // 상점 그림 계절
const EVERGREEN = {pine:1, palm:1, storytree:1};
const GREEN = {
  spring:[0x9CD27A, 0xB2DE8C, 0x86C467, 0xC4E6A0],
  summer:[0x4C9A4E, 0x5BA85A, 0x3E8945, 0x6BB667],
  autumn:[0xE8A93E, 0xDB7A30, 0xC85A2C, 0xEFC458]
};
function leafColors(kind, season){
  if(kind === 'pine') return [0x2F6B48, 0x37794F, 0x2A5F40, 0x3F8457];
  if(kind === 'palm') return [0x4E9A5B, 0x5DAA68, 0x3F8A4D, 0x6CB474];
  if(kind === 'storytree') return [0x2F5D7C, 0x3A6B8C, 0x244C66, 0x4A7FA0];
  if(season === 'winter') return null;                                   // 잎 지는 나무는 맨가지
  if(kind === 'cherry'){
    if(season === 'spring') return [0xF5B8CB, 0xF9CAD8, 0xEFA3BC, 0xFBDDE6];
    if(season === 'autumn') return [0xD8643A, 0xC9503A, 0xE38A4A, 0xB8453A];
  }
  if(kind === 'maple' && season === 'autumn') return [0xD9452E, 0xE0622F, 0xC53A2A, 0xEE8A3A];
  if(kind === 'baobab' && season === 'autumn') return [0xC9B24A, 0xB7A543, 0xD8C25C, 0xA79A3E];
  return GREEN[season] || GREEN.summer;
}
const GROUND = {
  spring:{top:0x9FD27F, top2:0xB6DE92},
  summer:{top:0x7DBE63, top2:0x93CB72},
  autumn:{top:0xB9C46A, top2:0xCFC071},
  winter:{top:0xF4F7FA, top2:0xE4ECF3}
};
const COMP_IC = {butterfly:'🦋', bird:'🐦', squirrel:'🐿️', swing:'', beehive:'🍯', owl:'🦉', fox:'🦊'};

const S = {renderer:null, scene:null, camera:null, root:null, host:null, raf:0, key:'', angle:0.5, auto:true, lastTouch:0, drag:null, visible:true, io:null, anim:[], t0:0};

function lam(color, extra){ return new THREE.MeshLambertMaterial(Object.assign({color:color}, extra || {})); }
function std(color, extra){ return new THREE.MeshStandardMaterial(Object.assign({color:color, roughness:0.45, metalness:0}, extra || {})); }
function shadowy(m, cast, recv){ m.castShadow = !!cast; m.receiveShadow = !!recv; return m; }
function emojiSprite(ch, size){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 72);
  const tx = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tx, transparent:true, depthWrite:false}));
  sp.scale.set(size, size, size);
  return sp;
}

/* 울퉁불퉁한 잎 덩어리 — 정점을 흔들고, 위는 밝게 아래는 어둡게. 눈이면 윗면을 하얗게 */
function blob(r, hex, R, snow, squash){
  const geo = new THREE.SphereGeometry(r, 18, 13);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(hex), dark = base.clone().multiplyScalar(0.58), light = base.clone().lerp(new THREE.Color(0xFFFFF0), 0.22);
  const white = new THREE.Color(0xF7FAFD), ox = R() * 10, oy = R() * 10, oz = R() * 10, c = new THREE.Color();
  for(let i = 0; i < pos.count; i++){
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.16 * n3(x / r * 1.6 + ox, y / r * 1.6 + oy, z / r * 1.6 + oz);
    x *= k; y *= k * (squash || 1); z *= k;
    pos.setXYZ(i, x, y, z);
    const t = Math.max(0, Math.min(1, (y / (r * (squash || 1)) + 1) / 2));
    c.copy(dark).lerp(light, Math.pow(t, 0.85));
    const j = 0.94 + 0.12 * (n3(x * 4 + ox, y * 4, z * 4) * 0.5 + 0.5); c.multiplyScalar(j);
    if(snow && y > r * 0.35) c.lerp(white, Math.min(1, (y / r - 0.35) * 2.4));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return shadowy(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({vertexColors:true})), true, true);
}
/* 길이·방향에 맞춘 가지 토막 */
const UP = () => new THREE.Vector3(0, 1, 0);
function limb(p, d, len, r0, r1, matl){
  const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len * 1.02, 9, 1), matl), true, false);
  m.position.copy(p.clone().add(d.clone().multiplyScalar(len / 2)));
  m.quaternion.setFromUnitVectors(UP(), d.clone().normalize());
  return m;
}
function bend(d, R, tilt){
  /* d 에 수직인 방향 하나를 골라 tilt 만큼 기울이고, 살짝 위로 */
  const a = new THREE.Vector3(1, 0, 0); if(Math.abs(d.x) > 0.9) a.set(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(d, a).normalize(), v = new THREE.Vector3().crossVectors(d, u).normalize();
  const ang = R() * Math.PI * 2;
  const side = u.multiplyScalar(Math.cos(ang)).add(v.multiplyScalar(Math.sin(ang)));
  return d.clone().multiplyScalar(Math.cos(tilt)).add(side.multiplyScalar(Math.sin(tilt))).add(new THREE.Vector3(0, 0.18, 0)).normalize();
}
function grow(par, p, d, len, rad, depth, R, matl, tips, flat){
  const end = p.clone().add(d.clone().multiplyScalar(len));
  par.add(limb(p, d, len, rad, rad * 0.68, matl));
  const j = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.68, 8, 6), matl); j.position.copy(end); par.add(j);
  if(depth <= 0){ tips.push(end); return; }
  const n = depth >= 2 ? 3 : 2;
  for(let i = 0; i < n; i++){
    let nd = bend(d, R, 0.45 + R() * 0.45);
    if(flat) nd = new THREE.Vector3(nd.x, nd.y * 0.35, nd.z).normalize();
    grow(par, end, nd, len * (0.66 + R() * 0.12), rad * 0.64, depth - 1, R, matl, tips, flat);
  }
}


/* ── 과수원 친구(캐릭터, 2026-11-11) — 동그란 몸에 새싹 두 잎이 난 씨앗 친구. 나무 옆 섬 위에 서서 사진기 쪽을 본다.
   숨쉬듯 들썩·눈 깜빡·말풍선이 바뀌면 깡충(cheer). 겨울엔 목도리, 봄엔 새싹에 꽃 한 송이, 가을엔 잎이 물든다.
   말풍선(글)은 buddy.js 가 HTML 로 띄우고, 머리 위치는 loop 에서 --bx·--by 로 넘긴다. */
function buildBuddy(season){
  const g = new THREE.Group(), anim = [];
  const skin = std(0xF4E4C4, {roughness:0.62}), belly = std(0xFFF6E4, {roughness:0.7}), ink = std(0x2B2622, {roughness:0.3});
  const body = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.27, 28, 20), skin), true, false); body.scale.set(1, 1.08, 0.96); body.position.y = 0.33; g.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.19, 22, 16), belly); bel.scale.set(1, 1, 0.45); bel.position.set(0, 0.28, 0.17); g.add(bel);
  const eyes = [];
  [-0.085, 0.085].forEach(x => {
    const e = new THREE.Group(); e.position.set(x, 0.39, 0.235);
    e.add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), ink));
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({color:0xFFFFFF})); hl.position.set(0.012, 0.014, 0.03); e.add(hl);
    g.add(e); eyes.push(e);
  });
  [-0.15, 0.15].forEach(x => { const c = new THREE.Mesh(new THREE.CircleGeometry(0.036, 18), new THREE.MeshBasicMaterial({color:0xF4A7A0, transparent:true, opacity:0.75})); c.position.set(x, 0.34, 0.247); c.rotation.y = x * 1.6; g.add(c); });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 14, Math.PI), ink); mouth.position.set(0, 0.335, 0.262); mouth.rotation.z = Math.PI; g.add(mouth);
  const arms = [-1, 1].map(sd => { const a = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin), true, false); a.scale.set(0.8, 1.15, 0.8); a.position.set(sd * 0.27, 0.27, 0.03); g.add(a); return a; });
  [-0.1, 0.1].forEach(x => { const f = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), std(0xD8B585, {roughness:0.7})), true, false); f.scale.set(1, 0.5, 1.25); f.position.set(x, 0.04, 0.05); g.add(f); });
  /* 새싹 */
  const sprout = new THREE.Group(); sprout.position.y = 0.6; g.add(sprout);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.13, 6), lam(0x5E9E4E)); stem.position.y = 0.04; sprout.add(stem);
  const lc = season === 'autumn' ? 0xE39A3B : season === 'spring' ? 0x9FD67E : 0x6DBA5E;
  [-1, 1].forEach(sd => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), std(lc, {roughness:0.6})); l.scale.set(1.6, 0.32, 0.85); l.position.set(sd * 0.08, 0.12, 0); l.rotation.z = sd * 0.55; sprout.add(l); });
  if(season === 'spring'){ const fl = new THREE.Group(); fl.position.set(0, 0.16, 0.02); for(let k = 0; k < 5; k++){ const pe = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), lam(0xF7B6CA)); pe.position.set(Math.cos(k / 5 * 6.283) * 0.026, Math.sin(k / 5 * 6.283) * 0.026, 0); fl.add(pe); } const ce = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), lam(0xF7D774)); ce.position.z = 0.01; fl.add(ce); sprout.add(fl); }
  if(season === 'winter'){
    const red = std(0xC9433A, {roughness:0.8});
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.05, 10, 28), red); sc.rotation.x = Math.PI / 2; sc.position.y = 0.2; sc.scale.set(1, 1, 0.8); g.add(sc);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.035), red); tail.position.set(0.11, 0.13, 0.2); tail.rotation.z = 0.25; g.add(tail);
  }
  /* 움직임 */
  const B = {hop:-9, blinkAt:2.5};
  anim.push(tm => {
    const breath = Math.sin(tm * 2.1) * 0.012;
    let y = 0, k = (tm - B.hop) / 0.55;
    if(k >= 0 && k <= 1) y = Math.sin(k * Math.PI) * 0.16;
    g.position.y = y; body.scale.y = 1.08 + breath; sprout.rotation.z = Math.sin(tm * 1.7) * 0.12;
    arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * (k >= 0 && k <= 1 ? 0.9 * Math.sin(k * Math.PI) : 0.12 + Math.sin(tm * 2.1 + i) * 0.05); });
    if(tm > B.blinkAt){ const u = tm - B.blinkAt; eyes.forEach(e => { e.scale.y = u < 0.12 ? 0.15 : 1; }); if(u > 0.12) B.blinkAt = tm + 2.6 + Math.random() * 2.4; }
  });
  g.userData.cheer = tm => { B.hop = tm; };
  return {group:g, anim:anim, headY:0.82};
}

/* ── 나무 만들기 ── */
function build(t, look, seed){
  const kind = look.tree || 'default', season = SEASONS.indexOf(look.season) >= 0 ? look.season : SIG[kind] || 'summer';
  const R = rng(seed + ':' + kind), Rs = rng(seed + ':' + kind + ':' + season);   // 모양은 R, 계절 꾸밈은 Rs
  const lv = Math.max(1, Math.min(10, Math.max(+t.level || 1, +t.legacy_level || 0)));
  const winter = season === 'winter', bare = winter && !EVERGREEN[kind];
  const G = new THREE.Group();
  const leafCol = leafColors(kind, season);
  const H = (kind === 'palm' ? 1.7 : kind === 'pine' ? 1.0 : 0.95) + lv * (kind === 'palm' ? 0.14 : 0.09);   // 줄기 높이
  const thick = (kind === 'baobab' ? 0.46 : kind === 'palm' ? 0.14 : 0.2) + lv * 0.014;
  const anim = [];

  /* 땅 — 떠 있는 섬: 풀(또는 눈) 윗면 + 흙 층 + 아래 뾰족 */
  const gc = GROUND[season];
  const topGeo = new THREE.CylinderGeometry(2.6, 2.62, 0.14, 56, 1);
  { const pos = topGeo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), a = new THREE.Color(gc.top), b = new THREE.Color(gc.top2);
    for(let i = 0; i < pos.count; i++){ const x = pos.getX(i), z = pos.getZ(i); c.copy(a).lerp(b, n3(x * 1.3, 0.5, z * 1.3) * 0.5 + 0.5); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    topGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const top = shadowy(new THREE.Mesh(topGeo, new THREE.MeshLambertMaterial({vertexColors:true})), false, true); top.position.y = -0.07; G.add(top);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.62, 2.1, 0.5, 56, 1), lam(winter ? 0x8C7360 : 0x9B7552)); soil.position.y = -0.39; G.add(soil);
  const soil2 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.75, 56, 1), lam(0x7E5E43)); soil2.rotation.x = Math.PI; soil2.position.y = -1.0; G.add(soil2);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.035, 6, 64), new THREE.MeshLambertMaterial({color:new THREE.Color(gc.top).multiplyScalar(0.86)})); rim.rotation.x = Math.PI / 2; rim.position.y = -0.005; G.add(rim);
  for(let i = 0; i < 6; i++){                                   // 돌
    const a = R() * Math.PI * 2, r = 1.5 + R() * 0.95;
    const st = shadowy(new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + R() * 0.09, 0), lam(winter ? 0xC9D2DA : 0x9AA0A6)), true, true);
    st.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r); st.rotation.set(R() * 3, R() * 3, R() * 3); st.scale.y = 0.6; G.add(st);
  }
  if(!winter){                                                  // 풀 포기
    const n = 70, bl = new THREE.InstancedMesh(new THREE.ConeGeometry(0.026, 0.2, 4), lam(season === 'autumn' ? 0xA9B04F : 0x5E9F48), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for(let i = 0; i < n; i++){
      const a = R() * Math.PI * 2, r = 0.65 + R() * 1.85, h = 0.6 + R() * 0.8;
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5)); sc.set(1, h, 1);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.08 * h, Math.sin(a) * r), q, sc); bl.setMatrixAt(i, m4);
    }
    G.add(bl);
  }
  if(season === 'autumn' && !EVERGREEN[kind]){                  // 땅의 낙엽
    const lc = leafCol || GREEN.autumn, n = 46, lf = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 4), lam(0xFFFFFF, {side:THREE.DoubleSide}), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1.4, 1, 1), c = new THREE.Color();
    for(let i = 0; i < n; i++){
      const a = Rs() * Math.PI * 2, r = 0.3 + Rs() * 1.9;
      q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (Rs() - 0.5) * 0.3, 0, Rs() * 6));
      m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.006, Math.sin(a) * r), q, one); lf.setMatrixAt(i, m4);
      if(lf.setColorAt) lf.setColorAt(i, c.setHex(lc[i % lc.length]));
    }
    G.add(lf);
  }

  const sway = new THREE.Group(); G.add(sway);      // 줄기 위쪽이 살랑
  const bark = lam(kind === 'storytree' ? 0x584634 : kind === 'baobab' ? 0x9A7A5C : 0x7B5A3E);
  const tips = [];                                  // 잎·열매가 달릴 자리
  /* 줄기: 마디를 쌓아 살짝 휜다 */
  const segs = kind === 'palm' ? 10 : 6;
  let p = new THREE.Vector3(0, 0, 0), dir = UP();
  const bendX = (R() - 0.5) * (kind === 'palm' ? 0.55 : 0.2), bendZ = (R() - 0.5) * (kind === 'palm' ? 0.55 : 0.2);
  for(let i = 0; i < segs; i++){
    const len = H / segs, f0 = i / segs, f1 = (i + 1) / segs;
    const prof = f => kind === 'baobab' ? (1.05 + Math.sin(f * Math.PI) * 0.25 - f * 0.45) : kind === 'palm' ? (1 - f * 0.35) : (1 - f * 0.55) * (f < 0.12 ? 1.25 - f * 2 : 1);
    const d = dir.clone().add(new THREE.Vector3(bendX * f0, 0, bendZ * f0)).normalize();
    const seg = limb(p, d, len, thick * prof(f0), thick * prof(f1), bark);
    if(kind === 'palm' && i % 2) seg.scale.set(1.06, 1, 1.06);
    (i < 2 ? G : sway).add(seg);
    p = p.clone().add(d.clone().multiplyScalar(len)); dir = d;
  }
  const crown = p.clone();
  if(kind !== 'palm'){                              // 뿌리 몇 갈래
    for(let i = 0; i < 4; i++){
      const a = i / 4 * Math.PI * 2 + R(), d = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a)).normalize();
      G.add(limb(new THREE.Vector3(0, 0.12, 0), d, thick * 1.6, thick * 0.55, thick * 0.12, bark));
    }
  }

  if(kind === 'pine'){
    const n = Math.max(3, Math.min(6, 2 + Math.ceil(lv / 2)));
    for(let i = 0; i < n; i++){
      const r = (1.25 - i * 0.18) * (0.8 + lv * 0.03), h = 0.95 - i * 0.05;
      const geo = new THREE.ConeGeometry(r, h, 16, 4, true);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), base = new THREE.Color(leafCol[i % leafCol.length]), c = new THREE.Color(), white = new THREE.Color(0xF7FAFD);
      for(let k = 0; k < pos.count; k++){
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k), ang = Math.atan2(z, x), j = 1 + 0.14 * Math.sin(ang * 8 + i) * (0.5 - y / h);
        pos.setXYZ(k, x * j, y, z * j);
        const tt = (y / h + 0.5); c.copy(base).multiplyScalar(0.6 + tt * 0.5);
        if(winter && tt > 0.25) c.lerp(white, Math.min(0.85, (tt - 0.25) * 1.3));
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
      const cone = shadowy(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({vertexColors:true, side:THREE.DoubleSide})), true, true);
      cone.position.set(0, H * 0.45 + i * (H * 0.55 / n) + 0.3, 0); sway.add(cone);
      for(let k = 0; k < 3; k++){ const a = R() * Math.PI * 2; tips.push(new THREE.Vector3(Math.cos(a) * r * 0.75, cone.position.y - h * 0.25, Math.sin(a) * r * 0.75)); }
    }
  } else if(kind === 'palm'){
    const n = 7 + Math.min(4, Math.floor(lv / 3));
    const leaflet = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.07), lam(0xFFFFFF, {side:THREE.DoubleSide}), n * 22);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    let idx = 0;
    for(let i = 0; i < n; i++){
      const a = i / n * Math.PI * 2 + R() * 0.3, droop = 0.55 + R() * 0.35;
      for(let k = 0; k < 11; k++){
        const u = (k + 1) / 11, along = new THREE.Vector3(u * 1.35, Math.sin(u * Math.PI * 0.8) * 0.32 - u * u * droop, 0);
        const w = (1 - Math.abs(u - 0.45)) * 0.9;
        [-1, 1].forEach(s => {
          const off = new THREE.Vector3(0.06 * u, -0.03, s * 0.17 * w).applyAxisAngle(UP(), a);
          const pos = along.clone().applyAxisAngle(UP(), a).add(crown).add(off);
          q.setFromEuler(new THREE.Euler(s * 0.5, -a + s * 0.9, -u * 0.8 - 0.2));
          m4.compose(pos, q, new THREE.Vector3(0.6 + w * 0.6, 1, 1)); leaflet.setMatrixAt(idx, m4);
          if(leaflet.setColorAt) leaflet.setColorAt(idx, c.setHex(leafCol[(k + i) % leafCol.length]).multiplyScalar(0.8 + u * 0.3));
          idx++;
        });
      }
    }
    leaflet.count = idx; leaflet.castShadow = true; sway.add(leaflet);
    const nut = std(0x8A6A3A);
    for(let k = 0; k < 4; k++){ const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), nut); const a = k / 4 * 6.28; m.position.set(crown.x + Math.cos(a) * 0.12, crown.y - 0.1, crown.z + Math.sin(a) * 0.12); sway.add(m); }
    for(let k = 0; k < 6; k++){ const a = R() * Math.PI * 2; tips.push(crown.clone().add(new THREE.Vector3(Math.cos(a) * 0.32, -0.2, Math.sin(a) * 0.32))); }
  } else {
    /* 가지가 갈라진다(되풀이). 바오밥은 납작하게 퍼짐 */
    const flat = kind === 'baobab';
    const nLimb = 3 + Math.min(3, Math.floor(lv / 3));
    const depth = lv >= 5 ? 3 : 2;
    for(let i = 0; i < nLimb; i++){
      const a = i / nLimb * Math.PI * 2 + R() * 0.6;
      const up = flat ? 0.22 : 0.85 + R() * 0.45;
      const start = new THREE.Vector3(0, crown.y - H * (0.05 + R() * 0.2), 0);
      const d = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
      grow(sway, start, d, (flat ? 0.62 : 0.5) + lv * 0.028, thick * 0.5, depth, R, bark, tips, flat);
    }
    grow(sway, crown.clone(), UP(), 0.35 + lv * 0.02, thick * 0.55, depth - 1, R, bark, tips, flat);
    if(!bare){
      /* 잎 덩어리 — 가지 끝마다 하나, 가운데를 메우는 큰 것 몇 */
      const blobs = [];
      const rr = (flat ? 0.42 : 0.36) + lv * 0.018;
      tips.forEach((tp, i) => { if(i % (lv >= 5 ? 2 : 1)) return; blobs.push({p:tp.clone().add(new THREE.Vector3(0, 0.08, 0)), r:rr * (0.85 + R() * 0.4)}); });
      const cen = tips.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, tips.length));
      for(let i = 0; i < 3 + Math.floor(lv / 3); i++) blobs.push({p:cen.clone().add(new THREE.Vector3((R() - 0.5) * 0.8, (R() - 0.2) * 0.5, (R() - 0.5) * 0.8)), r:rr * (1.3 + R() * 0.4)});
      const leafGeo = new THREE.CircleGeometry(0.075, 5);
      const leaves = new THREE.InstancedMesh(leafGeo, lam(0xFFFFFF, {side:THREE.DoubleSide}, null), blobs.length * 16);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1.5, 1, 1), c = new THREE.Color(), dirv = new THREE.Vector3();
      let li = 0;
      blobs.forEach(b => {
        const hex = leafCol[Math.floor(R() * leafCol.length)];
        const m = blob(b.r, hex, R, winter, flat ? 0.62 : 1);
        if(kind === 'storytree') m.material = new THREE.MeshLambertMaterial({vertexColors:true, emissive:0x0E2233});
        m.position.copy(b.p); m.rotation.y = R() * 6; sway.add(m);
        for(let k = 0; k < 16; k++){
          dirv.set(R() - 0.5, R() - 0.25, R() - 0.5).normalize();
          q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6));
          m4.compose(b.p.clone().add(dirv.multiplyScalar(b.r * (0.95 + R() * 0.15)).multiply(new THREE.Vector3(1, flat ? 0.62 : 1, 1))), q, one);
          leaves.setMatrixAt(li, m4);
          if(leaves.setColorAt) leaves.setColorAt(li, c.setHex(leafCol[(k + li) % leafCol.length]).multiplyScalar(0.85 + R() * 0.3));
          li++;
        }
      });
      leaves.count = li; leaves.castShadow = true; sway.add(leaves);
      /* 봄: 기본 나무에 흰 꽃 점 */
      if(season === 'spring' && kind === 'default'){
        const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), lam(0xFFF4F7), 40), m5 = new THREE.Matrix4();
        for(let i = 0; i < 40; i++){ const b = blobs[i % blobs.length]; dirv.set(Rs() - 0.5, Rs() - 0.1, Rs() - 0.5).normalize(); m5.makeTranslation(b.p.x + dirv.x * b.r, b.p.y + dirv.y * b.r, b.p.z + dirv.z * b.r); fl.setMatrixAt(i, m5); }
        sway.add(fl);
      }
    } else {
      /* 겨울 맨가지 — 가지 끝에 눈 */
      const sn = lam(0xF7FAFD);
      tips.forEach((tp, i) => { if(i % 2) return; const s = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Rs() * 0.04, 8, 6), sn); s.position.copy(tp).add(new THREE.Vector3(0, 0.04, 0)); s.scale.y = 0.55; sway.add(s); });
    }
  }

  /* 열매 */
  const fr = [];
  const nF = +t.fruit || 0, nFog = +t.fog || 0, nGr = +t.group_fruit || 0; let sp = +t.sprout || 0;
  for(let i = 0; i < nF; i++) fr.push({k:'fruit', s:sp-- > 0});
  for(let i = 0; i < nFog; i++) fr.push({k:'fog', s:sp-- > 0});
  for(let i = 0; i < nGr; i++) fr.push({k:'group', s:false});
  const ftips = tips.length ? tips : [crown];
  fr.slice(0, 30).forEach((f, i) => {
    const base = ftips[(i * 3) % ftips.length];
    const a = R() * Math.PI * 2, rr = kind === 'pine' ? 0.12 : bare ? 0.04 : 0.3 + R() * 0.18;
    const pos = new THREE.Vector3(base.x + Math.cos(a) * rr, base.y - (bare ? 0.12 : 0.18 + R() * 0.22), base.z + Math.sin(a) * rr);
    const g = new THREE.Group(); g.position.copy(pos);
    if(f.k === 'fog'){
      g.add(shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), std(0x6F84A0, {roughness:0.5})), true, false));
      for(let k = 0; k < 3; k++){ const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lam(0xE9EEF5)); c.position.set(-0.07 + k * 0.07, 0.09, 0.08); g.add(c); }
    } else if(f.k === 'group'){
      [[-0.07, 0, 0], [0.07, 0, 0], [0, 0.1, 0]].forEach(q => { const m = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), std(0xC9433A, {roughness:0.35})), true, false); m.position.set(q[0], q[1], q[2]); g.add(m); });
    } else {
      g.add(shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), std(0xD2413A, {roughness:0.28})), true, false));
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({color:0xFFD2CC})); hl.position.set(-0.05, 0.05, 0.1); g.add(hl);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4), lam(0x5A4630)); stem.position.y = 0.15; g.add(stem);
    if(f.s){ const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), lam(0x8FD19A)); leaf.position.set(0.04, 0.22, 0); leaf.rotation.z = -0.6; g.add(leaf); }
    sway.add(g);
  });

  /* 받은 꽃(땅) — 꽃은 「내 단서로 친구가 한 걸음 간 흔적」이라 꾸밈 꽃은 따로 두지 않는다 */
  const nFl = Math.min(+t.flowers || 0, 14);
  for(let i = 0; i < nFl; i++){
    const a = i / Math.max(1, nFl) * Math.PI * 2 + 0.4, r = 1.3 + R() * 0.9;
    const fl = new THREE.Group(); fl.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), lam(0x5E9E4E)); st.position.y = -0.08; fl.add(st);
    for(let k = 0; k < 5; k++){ const pe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lam(0xF3A8C2)); pe.position.set(Math.cos(k / 5 * 6.283) * 0.05, 0, Math.sin(k / 5 * 6.283) * 0.05); fl.add(pe); }
    const ce = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lam(0xF7D774)); ce.position.y = 0.01; fl.add(ce);
    G.add(fl);
  }

  /* 동반자 */
  const comp = look.comp, topY = crown.y;
  if(comp === 'swing'){
    const b = ftips[0];
    const sw = new THREE.Group(); sw.position.set(b.x * 0.8, b.y - 0.05, b.z * 0.8);
    const L = Math.max(0.6, b.y - 0.45);
    [-0.14, 0.14].forEach(x => { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, L, 4), lam(0xC9A46A)); rope.position.set(x, -L / 2, 0); sw.add(rope); });
    const seat = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.14), lam(0x9C6B3C)), true, false); seat.position.y = -L; sw.add(seat);
    sway.add(sw); anim.push(tm => { sw.rotation.x = Math.sin(tm * 1.6) * 0.35; });
  } else if(comp && COMP_IC[comp]){
    const s = emojiSprite(COMP_IC[comp], comp === 'fox' || comp === 'squirrel' ? 0.55 : 0.42);
    if(comp === 'fox'){ s.position.set(1.4, 0.28, 0.6); anim.push(tm => { const a = tm * 0.35; s.position.set(Math.cos(a) * 1.6, 0.28, Math.sin(a) * 1.6); }); }
    else if(comp === 'squirrel'){ s.position.set(0.45, 0.28, 0.35); anim.push(tm => { s.position.y = 0.28 + Math.abs(Math.sin(tm * 3)) * 0.12; }); }
    else if(comp === 'butterfly'){ anim.push(tm => { const a = tm * 0.8; s.position.set(Math.cos(a) * 1.3, topY - 0.2 + Math.sin(tm * 2.3) * 0.25, Math.sin(a) * 1.3); }); }
    else { const b = ftips[1 % ftips.length]; s.position.set(b.x, b.y + 0.18, b.z); if(comp === 'beehive') s.position.y = b.y - 0.35; }
    G.add(s);
  }

  /* 날리는 것 — 봄 꽃잎 · 가을 잎 · 겨울 눈 · 이야기나무 별빛 */
  const skyH = topY + 1.2;
  if((season === 'spring' && (kind === 'cherry' || kind === 'default')) || (season === 'autumn' && !EVERGREEN[kind])){
    const cols = season === 'spring' ? [0xF8C6D4, 0xFFFFFF, 0xF4AFC4] : (leafCol || GREEN.autumn), petals = [];
    for(let i = 0; i < 22; i++){
      const m = new THREE.Mesh(new THREE.CircleGeometry(season === 'spring' ? 0.04 : 0.055, 5), new THREE.MeshLambertMaterial({color:cols[i % cols.length], side:THREE.DoubleSide}));
      m.userData = {a:Rs() * 6.28, r:0.3 + Rs() * 1.6, sp:0.22 + Rs() * 0.28, ph:Rs() * 10};
      petals.push(m); G.add(m);
    }
    anim.push(tm => petals.forEach(m => { const u = m.userData, y = skyH - ((tm * u.sp + u.ph) % skyH);
      m.position.set(Math.cos(u.a + tm * 0.3) * u.r, y, Math.sin(u.a + tm * 0.3) * u.r); m.rotation.set(tm * 2 + u.ph, tm + u.ph, 0); }));
  }
  if(winter){
    const n = 140, arr = new Float32Array(n * 3), sd = [];
    for(let i = 0; i < n; i++){ sd.push({x:(Rs() - 0.5) * 5.4, z:(Rs() - 0.5) * 5.4, sp:0.25 + Rs() * 0.3, ph:Rs() * 10}); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({color:0xFFFFFF, size:0.055, transparent:true, opacity:0.9, depthWrite:false}));
    G.add(pts);
    anim.push(tm => { for(let i = 0; i < n; i++){ const d = sd[i]; arr[i * 3] = d.x + Math.sin(tm * 0.6 + d.ph) * 0.15; arr[i * 3 + 1] = (skyH + 0.3) - ((tm * d.sp + d.ph) % (skyH + 0.3)); arr[i * 3 + 2] = d.z; } geo.attributes.position.needsUpdate = true; });
  }
  if(kind === 'storytree'){
    const geo = new THREE.BufferGeometry(), n = 70, arr = new Float32Array(n * 3);
    for(let i = 0; i < n; i++){ const b = ftips[i % ftips.length]; arr[i * 3] = b.x + (R() - 0.5) * 1.6; arr[i * 3 + 1] = b.y + (R() - 0.5) * 1.1; arr[i * 3 + 2] = b.z + (R() - 0.5) * 1.6; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pm = new THREE.PointsMaterial({color:0xFFE58A, size:0.07, transparent:true});
    sway.add(new THREE.Points(geo, pm)); anim.push(tm => { pm.opacity = 0.55 + Math.sin(tm * 2.2) * 0.4; });
  }
  anim.push(tm => { sway.rotation.z = Math.sin(tm * 0.9) * 0.022; sway.rotation.x = Math.sin(tm * 0.7 + 1) * 0.016; });
  let buddy = null;
  if(look.buddy !== false){
    const bd = buildBuddy(season), sc = 1.3; buddy = bd.group; buddy.userData.headY = bd.headY * sc;
    buddy.scale.setScalar(sc); buddy.position.set(1.36, 0, 1.06); G.add(buddy); bd.anim.forEach(f => anim.push(f));
  }
  return {group:G, anim:anim, buddy:buddy};
}

/* ── 빛 · 그림자 ── */
function lights(scene){
  scene.add(new THREE.HemisphereLight(0xFFFBEA, 0x5E7A4E, 0.8));
  const sun = new THREE.DirectionalLight(0xFFF1D6, 0.78); sun.position.set(3.2, 7, 4.2);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const c = sun.shadow.camera; c.left = -4; c.right = 4; c.top = 6; c.bottom = -3; c.near = 1; c.far = 20;
  sun.shadow.bias = -0.0006; sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xDDE8FF, 0.25); fill.position.set(-4, 3, -3); scene.add(fill);
}
function fit(root, cam){
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const lo = Math.max(box.min.y, -1.4), hh = Math.max(box.max.y - lo, 2.6), ww = Math.max(size.x, size.z, 3);
  return {lookY:lo + hh * 0.47, camY:lo + hh * 0.7, dist:Math.max(hh / (2 * Math.tan(cam.fov / 2 * Math.PI / 180)) * 1.1, ww * 1.22)};
}

/* ── 화면 ── */
function ensure(host){
  if(!S.renderer){
    S.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    S.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.scene = new THREE.Scene();
    S.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    lights(S.scene);
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
    S.host = host; S.bx = S.by = null;                  // 새 칸이면 말풍선 자리를 다시 넘긴다
    host.classList.add('tr3d-on');
    host.appendChild(S.renderer.domElement);
    if(S.io){ S.io.disconnect(); S.io.observe(host); }
  }
  resize();
}
function resize(){
  if(!S.host) return;
  const wide = document.documentElement.classList.contains('wide');
  const w = Math.max(200, S.host.clientWidth || 300), h = Math.round(Math.min(wide ? 560 : 400, Math.max(260, w * (wide ? 0.82 : 0.86))));
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
    S.camera.position.set(Math.sin(S.angle) * S.dist, S.camY, Math.cos(S.angle) * S.dist);
    S.camera.lookAt(0, S.lookY, 0);
    S.anim.forEach(f => f(tm)); S.tm = tm;
    if(S.buddy){
      const bp = S.buddy.position, wx = bp.x, wz = bp.z;
      S.buddy.rotation.y = Math.atan2(S.camera.position.x - wx, S.camera.position.z - wz);
      const v = new THREE.Vector3(wx, S.buddy.position.y + S.buddy.userData.headY, wz); S.root.localToWorld(v); v.project(S.camera);
      const w = S.host.clientWidth, h = S.renderer.domElement.clientHeight;
      const x = Math.max(110, Math.min(w - 110, (v.x + 1) / 2 * w)), y = Math.max(70, (1 - v.y) / 2 * h);
      if(Math.abs(x - (S.bx || 0)) > 0.5 || Math.abs(y - (S.by || 0)) > 0.5){ S.bx = x; S.by = y; S.host.style.setProperty('--bx', x.toFixed(1) + 'px'); S.host.style.setProperty('--by', y.toFixed(1) + 'px'); }
    }
    S.renderer.render(S.scene, S.camera);
    S.raf = requestAnimationFrame(step);
  };
  S.raf = requestAnimationFrame(step);
}
function dispose(obj){
  obj.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if(m.map) m.map.dispose(); m.dispose(); }); } });
}

/* tree.js 가 부른다: 내 나무 칸(.tree-wrap) · 나무 자료 · 모양(나무 종류·동반자·계절) */
function mount(host, t, look, seed){
  if(!host || !t) return;
  if(QO.cfg && QO.cfg.selftest) return;                 // 스스로 시험은 SVG 로
  if(!webglOK()) return;
  loadThree().then(() => {
    if(!document.body.contains(host)) return;
    ensure(host);
    const key = JSON.stringify([t.level, t.legacy_level, t.fruit, t.fog, t.group_fruit, t.sprout, t.flowers, look.tree, look.comp, look.season, seed]);
    if(key !== S.key){
      if(S.root){ S.scene.remove(S.root); dispose(S.root); }
      const b = build(t, look, seed);
      S.root = b.group; S.anim = b.anim; S.buddy = b.buddy; S.scene.add(S.root);
      Object.assign(S, fit(S.root, S.camera));             // 나무가 잘리지 않게 사진기 자리
      S.key = key; S.t0 = performance.now();
    }
    loop();
  }).catch(() => { /* SVG 그대로 */ });
}

/* 상점 나무 그림 — 실제 3D 나무를 한 장씩 찍어 둔다(그 나무의 대표 계절). 한 번 찍으면 다시 안 찍는다 */
const THUMB = {}, TH = {renderer:null, scene:null, camera:null, busy:false};
function thumbOf(kind){
  if(THUMB[kind]) return THUMB[kind];
  if(!TH.renderer){
    TH.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
    TH.renderer.setPixelRatio(1); TH.renderer.setSize(220, 200, false);
    TH.renderer.shadowMap.enabled = true; TH.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    TH.scene = new THREE.Scene(); lights(TH.scene);
    TH.camera = new THREE.PerspectiveCamera(34, 220 / 200, 0.1, 100);
  }
  const b = build({level:6, fruit:0}, {tree:kind, comp:null, season:SIG[kind], buddy:false}, 'shop');
  TH.scene.add(b.group);
  b.anim.forEach(f => f(1.3));
  const f = fit(b.group, TH.camera), a = 0.55;
  TH.camera.position.set(Math.sin(a) * f.dist, f.camY, Math.cos(a) * f.dist); TH.camera.lookAt(0, f.lookY, 0);
  TH.renderer.render(TH.scene, TH.camera);
  THUMB[kind] = TH.renderer.domElement.toDataURL('image/png');
  TH.scene.remove(b.group); dispose(b.group);
  return THUMB[kind];
}
function shopThumbs(root){
  if(QO.cfg && QO.cfg.selftest) return;
  if(!webglOK()) return;
  loadThree().then(() => {
    const items = Array.from((root || document).querySelectorAll('.tr-shop .tr-item[data-id] .ic.tv'));
    let i = 0;
    const next = () => {
      if(i >= items.length) return;
      const ic = items[i++], kind = ic.closest('.tr-item').dataset.id;
      if(document.body.contains(ic) && !ic.querySelector('img')){
        try{ const url = thumbOf(kind); ic.innerHTML = '<img src="' + url + '" alt="" width="110" height="100">'; }catch(_){ /* SVG 그대로 */ }
      }
      requestAnimationFrame(next);                          // 한 장씩 — 화면이 멈추지 않게
    };
    next();
  }).catch(() => {});
}
function cheer(){ if(S.buddy && S.buddy.userData.cheer) S.buddy.userData.cheer(S.tm || 0); }
function on3d(){ return !!(S.host && S.buddy && document.body.contains(S.host)); }
QO.tree3d = {mount:mount, shopThumbs:shopThumbs, cheer:cheer, on:on3d, SIG:SIG};
})();
