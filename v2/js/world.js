/* 우리 반 숲 — 걸어 다니는 도트 세계(world 모듈, 2026-11-04).
   tree.js 의 숲 탭이 QO.world.mount(자리, 자료) 로 붙인다. 이 파일은 그림·걷기·함께 걷기만 맡고, 단서·물 주기 카드는 tree.js 가 만든다.
   · 그림은 전부 이 파일이 점으로 찍는다(AI 그림·다른 게임 그림 없음). 이름표·말풍선 글꼴은 갈무리11(OFL).
   · 반 친구 나무(classmate_trees)는 번호 순서로 과수원 자리에 선다. 막힘 깃발은 이름 없는 깃발 숲(8그루)에만 선다(나무 주인이 드러나지 않게).
   · 장소 넷(샘물·다리·관측소·겨울 숲)은 열리기 전에는 막혀 있고(바위·부서진 다리·잠긴 문·얼음), 열리면 걸어 들어갈 수 있다.
   · 함께 걷기: 선생님이 반마다 열면 1.2초마다 worldTick 한 번(내 자리를 보내고 반 친구 자리를 받는다). 이름은 서버가 붙인다.
     Supabase 실시간 채널은 받는 사람 수만큼 메시지가 세어져(무료 초당 100·한 달 200만) 30명이면 곧바로 넘으므로 쓰지 않는다.
   · 말은 정해진 말 여섯과 그림 반응 여섯뿐(자유 채팅 없음). */
(function(){
'use strict';
const QO = window.QO, cfg = QO.cfg, U = QO.ui, esc = U.esc;
const TS = 16, MW = 48, MH = 40;
const DV = {down:[0, 1], left:[-1, 0], right:[1, 0], up:[0, -1]};
const DIRS = ['down', 'left', 'right', 'up'];
const STEP_S = 0.2;                       // 한 칸 걷는 시간(초)
const TICK_OPEN = 1200, TICK_SHUT = 20000, TICK_OFF = 60000;
const GAL = '"Galmuri11","Noto Sans KR",sans-serif';
const PHRASES = ['안녕!', '같이 찾아볼래?', '이쪽으로 와!', '깃발 찾았어!', '단서 보냈어!', '고마워!'];
const EMO_NAMES = ['새싹', '물방울', '사과', '꽃', '물음표', '느낌표'];

/* ═══════════ 점 찍기 도구 ═══════════ */
function hash(x, y, s){
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function PB(w, h){ this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
PB.prototype.p = function(x, y, c){ x = Math.round(x); y = Math.round(y); if(x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; };
PB.prototype.r = function(x, y, w, h, c){ for(let j = 0; j < h; j++) for(let i = 0; i < w; i++) this.p(x + i, y + j, c); };
PB.prototype.a = function(x, y){ x = Math.floor(x); y = Math.floor(y); return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? (this.d[y * this.w + x] >>> 24) : 0; };
PB.prototype.canvas = function(){
  const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
  const x = c.getContext('2d'), im = x.createImageData(this.w, this.h);
  new Uint32Array(im.data.buffer).set(this.d); x.putImageData(im, 0, 0);
  return c;
};
const C32 = {};
function c32(hex, a){
  const k = hex + '/' + (a == null ? 1 : a); if(C32[k] != null) return C32[k];
  const n = parseInt(hex.slice(1), 16), al = Math.round((a == null ? 1 : a) * 255);
  return (C32[k] = ((al << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0);
}
function shade(hex, f){
  const n = parseInt(hex.slice(1), 16), m = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + [m(n >> 16 & 255), m(n >> 8 & 255), m(n & 255)].map(v => ('0' + v.toString(16)).slice(-2)).join('');
}
function rows(pb, ox, oy, R, pal, flip){
  R.forEach((r, j) => { for(let i = 0; i < r.length; i++){ const col = pal[r[i]]; if(col) pb.p(ox + (flip ? r.length - 1 - i : i), oy + j, c32(col)); } });
}
/* 동그라미 여럿을 합친 덩어리 — 왼쪽 위에서 빛, 테두리는 진하게 */
function blob(pb, circles, pal){
  const inside = (x, y) => { for(const c of circles){ const dx = x + .5 - c[0], dy = y + .5 - c[1]; if(dx * dx + dy * dy <= c[2] * c[2]) return true; } return false; };
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  circles.forEach(c => { x0 = Math.min(x0, c[0] - c[2]); y0 = Math.min(y0, c[1] - c[2]); x1 = Math.max(x1, c[0] + c[2]); y1 = Math.max(y1, c[1] + c[2]); });
  for(let y = Math.floor(y0) - 1; y <= y1 + 1; y++) for(let x = Math.floor(x0) - 1; x <= x1 + 1; x++){
    if(!inside(x, y)) continue;
    let col;
    if(!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) col = pal.ol;
    else{
      let bd = -1e9, nx = 0, ny = 0;
      for(const c of circles){ const dx = x + .5 - c[0], dy = y + .5 - c[1], d = c[2] - Math.sqrt(dx * dx + dy * dy); if(d > bd){ bd = d; nx = dx / c[2]; ny = dy / c[2]; } }
      const l = -0.55 * nx - 0.8 * ny, dz = ((x + y) & 1) === 0;
      col = (l > .5 || (l > .36 && dz)) ? pal.hi : (l < -.42 || (l < -.28 && dz)) ? pal.lo : pal.mid;
    }
    pb.p(x, y, c32(col));
  }
}
function shadow(pb, cx, cy, rx, ry){
  const c = c32('#1E3A1E', .26);
  for(let y = -ry; y <= ry; y++) for(let x = -rx; x <= rx; x++) if((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) pb.p(cx + x, cy + y, c);
}
const SPR = {};
function spr(key, w, h, fx, fy, draw){
  if(SPR[key]) return SPR[key];
  const pb = new PB(w, h); draw(pb);
  return (SPR[key] = {c:pb.canvas(), pb:pb, fx:fx, fy:fy, w:w, h:h});
}

/* ═══════════ 바닥 ═══════════ */
const GC = {
  g:['#7CC46A', '#6CB45B', '#93D47F', '#5A9F4C'],
  h:['#8ACB75', '#79BA65', '#A2DA8C', '#68A957'],
  s:['#EEF5F9', '#DCE8F0', '#FFFFFF', '#C8D9E6'],
  p:['#E3C690', '#D3B27B', '#F0D9AA', '#B89660'],
  q:['#E4DCCB', '#D2C8B4', '#F2ECE0', '#BDB29C']
};
const FLW = ['#FFFFFF', '#F7A8C8', '#B9A6F2', '#FFE07A', '#FF9C8A'];
const pathish = c => c === 'p' || c === 'q' || c === 't' || c === 'b';
const baseOf = c => c === 'h' ? GC.h[0] : c === 's' || c === 'i' ? GC.s[0] : GC.g[0];
const at = (G, x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? 'X' : G[y][x];
const edgePx = (si, m, q) => si === 0 ? [m, q] : si === 1 ? [m, 15 - q] : si === 2 ? [q, m] : [15 - q, m];
const SIDES = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function grassTile(pb, ox, oy, tx, ty, P, flowers, noTuft){
  const b = c32(P[0]), d = c32(P[1]), l = c32(P[2]), t = c32(P[3]);
  for(let j = 0; j < 16; j++) for(let i = 0; i < 16; i++){ const r = hash(ox + i, oy + j, 3); pb.p(ox + i, oy + j, r < .05 ? d : r > .978 ? l : b); }
  if(!noTuft && hash(tx, ty, 5) < .35){
    const ax = ox + 2 + ((hash(tx, ty, 6) * 10) | 0), ay = oy + 3 + ((hash(tx, ty, 7) * 10) | 0);
    pb.p(ax, ay + 1, t); pb.p(ax + 1, ay, t); pb.p(ax + 2, ay + 1, t); pb.p(ax + 3, ay, t);
  }
  if(flowers){
    const n = hash(tx, ty, 8) < .55 ? 2 : 1;
    for(let m = 0; m < n; m++){
      const fx = ox + 3 + ((hash(tx, ty, 9 + m) * 10) | 0), fy = oy + 3 + ((hash(tx, ty, 11 + m) * 10) | 0);
      const pc = c32(FLW[(hash(tx, ty, 13 + m) * FLW.length) | 0]);
      pb.p(fx, fy - 1, pc); pb.p(fx - 1, fy, pc); pb.p(fx + 1, fy, pc); pb.p(fx, fy + 1, pc); pb.p(fx, fy, c32('#EBA93A'));
    }
  }
}
function pathTile(pb, G, ox, oy, tx, ty, kind){
  const P = GC[kind], b = c32(P[0]), d = c32(P[1]), l = c32(P[2]), e = c32(P[3]);
  for(let j = 0; j < 16; j++) for(let i = 0; i < 16; i++){
    const r = hash(ox + i, oy + j, 31);
    if(kind === 'q'){ const brick = (j % 8 === 0) || ((((j >> 3) & 1) ? i + 4 : i) % 8 === 0); pb.p(ox + i, oy + j, brick ? d : r < .03 ? l : b); }
    else pb.p(ox + i, oy + j, r < .07 ? d : r > .985 ? e : r > .96 ? l : b);
  }
  const off = SIDES.map(s => { const n = at(G, tx + s[0], ty + s[1]); return !(pathish(n) || n === 'X') ? n : null; });
  off.forEach((n, si) => {
    if(n == null) return;
    const nb = c32(baseOf(n));
    for(let m = 0; m < 16; m++){
      const deep = 1 + (hash(ox + m, oy + m, 40 + si) < .5 ? 1 : 0);
      for(let q = 0; q < deep; q++){ const p = edgePx(si, m, q); pb.p(ox + p[0], oy + p[1], nb); }
      const s = edgePx(si, m, deep); pb.p(ox + s[0], oy + s[1], e);
    }
  });
  /* 바깥 모서리 둥글게 */
  [[0, 2, 0, 0], [0, 3, 15, 0], [1, 2, 0, 15], [1, 3, 15, 15]].forEach(k => {
    if(off[k[0]] == null || off[k[1]] == null) return;
    const nb = c32(baseOf(off[k[0]]));
    for(let j = 0; j < 4; j++) for(let i = 0; i < 4 - j; i++) pb.p(ox + Math.abs(k[2] - i), oy + Math.abs(k[3] - j), nb);
  });
}
function waterTile(pb, G, ox, oy, tx, ty, fr){
  const b = c32('#4CA2D8'), l = c32('#7AC8EF'), d = c32('#3D8CC4'), f = c32('#E2F5FC');
  for(let j = 0; j < 16; j++) for(let i = 0; i < 16; i++) pb.p(ox + i, oy + j, hash(ox + i, oy + j, 21) < .04 ? d : b);
  for(let m = 0; m < 2; m++){
    if(hash(tx, ty, 22 + m) < .75){
      const rx = ((hash(tx, ty, 24 + m) * 12) | 0) + (fr ? 2 : 0), ry = 2 + ((hash(tx, ty, 26 + m) * 12) | 0);
      for(let q = 0; q < 4; q++) pb.p(ox + (rx + q) % 16, oy + ry, l);
    }
  }
  SIDES.forEach((s, si) => {
    const n = at(G, tx + s[0], ty + s[1]); if(n === 'w' || n === 'b' || n === 'X') return;
    for(let m = 0; m < 16; m++){
      const p = edgePx(si, m, 0); pb.p(ox + p[0], oy + p[1], f);
      if(hash(ox + m, oy + m, 30 + si + fr * 7) < .55){ const p2 = edgePx(si, m, 1); pb.p(ox + p2[0], oy + p2[1], l); }
    }
  });
}
function bridgeTile(pb, G, ox, oy, tx, ty, fr, open){
  waterTile(pb, G, ox, oy, tx, ty, fr);
  const wood = c32('#C68E57'), dk = c32('#8F5E33'), lt = c32('#E0AE74'), rail = c32('#6B4224'), rail2 = c32('#A06A3C');
  const up = at(G, tx, ty - 1) !== 'b', dn = at(G, tx, ty + 1) !== 'b';
  const lb = !/[wb]/.test(at(G, tx - 1, ty)), rb = !/[wb]/.test(at(G, tx + 1, ty));
  let x0 = 0, x1 = 15;
  if(!open){
    if(lb) x1 = 5 + ((hash(tx, ty, 50) * 3) | 0);
    else if(rb) x0 = 10 - ((hash(tx, ty, 51) * 3) | 0);
    else return;
  }
  for(let i = x0; i <= x1; i++) for(let j = 0; j < 16; j++){
    if(!open && (i === x0 || i === x1) && hash(i, j + ty * 16, 52) < .5) continue;
    let c = i % 4 === 3 ? dk : i % 4 === 0 ? lt : wood;
    if(up && j < 3) c = j === 1 ? rail2 : rail;
    if(dn && j > 12) c = j === 14 ? rail2 : rail;
    pb.p(ox + i, oy + j, c);
  }
  if(open) [1, 9].forEach(px => { if(up) pb.r(ox + px, oy, 2, 4, rail); if(dn) pb.r(ox + px, oy + 12, 2, 4, rail); });
}
function cliffTile(pb, G, ox, oy, tx, ty){
  const H = GC.h;
  for(let j = 0; j < 16; j++) for(let i = 0; i < 16; i++){
    let c;
    if(j < 3) c = hash(ox + i, oy + j, 3) < .06 ? H[1] : H[0];
    else if(j === 3) c = '#5E8A3E';
    else if(j === 4) c = '#D4AC7E';
    else c = ((j + ((i >> 2) & 1) * 2) % 5 === 0) ? '#9C7550' : hash(ox + i, oy + j, 60) < .06 ? '#A88158' : '#B98E62';
    pb.p(ox + i, oy + j, c32(c));
  }
  const dk = c32('#7E5B3C');
  for(let i = 0; i < 16; i++) pb.p(ox + i, oy + 15, dk);
  if(at(G, tx - 1, ty) !== 'c') for(let j = 3; j < 16; j++) pb.p(ox, oy + j, dk);
  if(at(G, tx + 1, ty) !== 'c') for(let j = 3; j < 16; j++) pb.p(ox + 15, oy + j, dk);
}
function stairTile(pb, G, ox, oy, tx, ty){
  for(let j = 0; j < 16; j++) for(let i = 0; i < 16; i++){
    const s = j % 4; let c = s === 0 ? '#EDE6D8' : s === 3 ? '#9E9384' : '#CFC5B4';
    if((i === 0 && at(G, tx - 1, ty) !== 't') || (i === 15 && at(G, tx + 1, ty) !== 't')) c = '#7E5B3C';
    pb.p(ox + i, oy + j, c32(c));
  }
}
function iceTile(pb, ox, oy){
  for(let j = 0; j < 16; j++) for(let i = 0; i < 16; i++){
    const off = ((j >> 3) & 1) ? 4 : 0, mortar = (j % 8 === 7) || ((i + off) % 8 === 7), li = (j % 8 < 2) || ((i + off) % 8 < 1);
    pb.p(ox + i, oy + j, c32(mortar ? '#7FB4CC' : li ? '#EAF8FD' : hash(ox + i, oy + j, 70) < .08 ? '#A9D8EC' : '#C3E6F4'));
  }
}
function groundCanvas(G, fr, seen){
  const pb = new PB(MW * TS, MH * TS);
  for(let ty = 0; ty < MH; ty++) for(let tx = 0; tx < MW; tx++){
    const c = G[ty][tx], ox = tx * TS, oy = ty * TS;
    if(c === 'g') grassTile(pb, ox, oy, tx, ty, GC.g, false);
    else if(c === 'f') grassTile(pb, ox, oy, tx, ty, GC.g, true);
    else if(c === 'h') grassTile(pb, ox, oy, tx, ty, GC.h, hash(tx, ty, 90) < .14);
    else if(c === 's') grassTile(pb, ox, oy, tx, ty, GC.s, false);
    else if(c === 'p' || c === 'q') pathTile(pb, G, ox, oy, tx, ty, c);
    else if(c === 'w') waterTile(pb, G, ox, oy, tx, ty, fr);
    else if(c === 'b') bridgeTile(pb, G, ox, oy, tx, ty, fr, !!seen.bridge);
    else if(c === 'c') cliffTile(pb, G, ox, oy, tx, ty);
    else if(c === 't') stairTile(pb, G, ox, oy, tx, ty);
    else if(c === 'i') iceTile(pb, ox, oy);
  }
  return pb.canvas();
}

/* ═══════════ 물건 그림 ═══════════ */
const TREE_PAL = {
  default:  {ol:'#22562C', lo:'#2E7A3B', mid:'#43A04E', hi:'#6CC06F', fr:'#D93B30', fh:'#FF9A8A'},
  border:   {ol:'#1D4A28', lo:'#265F33', mid:'#347A40', hi:'#4E9A57'},
  cherry:   {ol:'#8A3A5A', lo:'#DD7AA2', mid:'#F2A2C2', hi:'#FBD3E3', fr:'#C8283C', fh:'#FF8A9A'},
  maple:    {ol:'#6E2A16', lo:'#C2461F', mid:'#E36A2E', hi:'#F7A64E'},
  baobab:   {ol:'#3A4E1E', lo:'#5E7A2C', mid:'#7C9C3A', hi:'#A6C45C'},
  storytree:{ol:'#26365C', lo:'#3D5A9A', mid:'#5A7CC6', hi:'#93B4EC', fr:'#F2D25A', fh:'#FFF6C2'},
  palm:     {ol:'#2B5A2A', lo:'#3C7A36', mid:'#55A04A', hi:'#7CC46A', fr:'#7A4E26', fh:'#B07A44'},
  pine:     {ol:'#1F4A3C', lo:'#2B6450', mid:'#3A7F64', hi:'#56A080'}
};
const FRUIT_AT = [[-6, -2], [6, -6], [9, 2], [-3, 4], [1, -11], [-9, -7], [11, -3], [-1, -2]];
function trunk(pb, fx, fy, tw, h){
  const x0 = Math.round(fx - tw / 2), ol = c32('#4A2E18');
  for(let y = fy - h; y < fy; y++){
    pb.p(x0 - 1, y, ol); pb.p(x0 + tw, y, ol);
    for(let i = 0; i < tw; i++) pb.p(x0 + i, y, c32(i === 0 ? '#A8744A' : i === tw - 1 ? '#6B4224' : '#8A5A34'));
  }
  pb.p(x0 - 2, fy - 1, ol); pb.p(x0 + tw + 1, fy - 1, ol); pb.r(x0 - 1, fy - 1, tw + 2, 1, c32('#6B4224'));
}
function pineInto(pb, fx, fy, s, P, snow){
  const th = Math.round(3 + 3 * s); trunk(pb, fx, fy, 4, th + 3);
  const H = Math.round(32 * s), bottom = fy - th, top = bottom - H;
  for(let L = 2; L >= 0; L--){
    const lt = top + Math.round(L * H * 0.27), lb = top + Math.round(H * (0.44 + L * 0.28)), hw = Math.round((5 + L * 3.4) * s + 1);
    for(let y = lt; y <= lb; y++){
      const w = Math.max(1, Math.round(hw * (y - lt + 1) / (lb - lt + 1)));
      for(let x = -w; x <= w; x++){
        let c = x < -w * .3 ? P.hi : x > w * .35 ? P.lo : P.mid;
        if(x === -w || x === w || y === lb) c = P.ol;
        if(snow && y - lt < 2 + (L === 0 ? 1 : 0) && Math.abs(x) < w) c = '#FFFFFF';
        if(snow && y === lb - 1 && Math.abs(x) < w && hash(x, y, 77) < .4) c = '#F4FAFD';
        pb.p(fx + x, y, c32(c));
      }
    }
  }
}
function palmInto(pb, fx, fy, s, P, fruits){
  const h = Math.round(26 * s);
  for(let k = 0; k <= h; k++){
    const t = k / h, x = Math.round(fx + 4 * s * t * t), y = fy - k;
    pb.p(x - 2, y, c32('#4A2E18')); pb.p(x + 2, y, c32('#4A2E18'));
    const ring = (k % 4) === 0;
    pb.p(x - 1, y, c32(ring ? '#7A5230' : '#B98A56')); pb.p(x, y, c32(ring ? '#7A5230' : '#A0703F')); pb.p(x + 1, y, c32('#7A5230'));
  }
  const tx = fx + 4 * s, ty = fy - h, C = [];
  [[-1, -0.3], [1, -0.25], [-0.85, 0.3], [0.9, 0.32], [0.1, -0.95]].forEach(v => {
    for(let u = 1; u <= 4; u++) C.push([tx + v[0] * u * 3.4 * s, ty + v[1] * u * 3.4 * s + u * u * 0.45 * s, (4.4 - u * 0.65) * s]);
  });
  C.push([tx, ty, 4 * s]);
  blob(pb, C, P);
  for(let i = 0; i < Math.min(fruits, 3); i++){ const cx = Math.round(tx - 2 + i * 2.5), cy = Math.round(ty + 3); pb.r(cx, cy, 2, 2, c32(P.fr)); pb.p(cx, cy, c32(P.fh)); }
}
function treeSpr(type, lv, fruits, snow){
  type = TREE_PAL[type] ? type : 'default';
  lv = Math.max(1, Math.min(10, lv | 0)); fruits = Math.max(0, Math.min(8, fruits | 0));
  return spr('tree|' + type + '|' + lv + '|' + fruits + '|' + (snow ? 1 : 0), 44, 56, 22, 54, pb => {
    const fx = 22, fy = 54, s = 0.5 + 0.055 * lv, P = TREE_PAL[type];
    shadow(pb, fx, fy - 1, Math.round(8 + 6 * s), 3);
    if(type === 'pine'){ pineInto(pb, fx, fy, s, P, snow); return; }
    if(type === 'palm'){ palmInto(pb, fx, fy, s, P, fruits); return; }
    const th = Math.round(5 + 7 * s), tw = type === 'baobab' ? Math.round(6 + 6 * s) : (s > .8 ? 6 : 4);
    trunk(pb, fx, fy, tw, th + 4);
    const cy = fy - th - Math.round(9 * s);
    const C0 = type === 'baobab' ? [[0, 1, 7], [-10, 3, 6.5], [10, 3, 6.5], [-5, -3, 6], [5, -3, 6]]
      : [[0, 0, 11], [-8, 4, 7.5], [8, 4, 7.5], [0, -7, 8], [-7, -3, 6.5], [7, -3, 6.5]];
    const circles = C0.map(c => [fx + c[0] * s, cy + c[1] * s, c[2] * s]);
    blob(pb, circles, P);
    if(type === 'cherry' || type === 'maple'){
      for(let i = 0; i < 10; i++){ const a = hash(i, lv, 101) * 6.28, r = hash(i, lv, 102) * 9 * s; pb.p(fx + Math.cos(a) * r, cy + Math.sin(a) * r, c32(P.hi)); }
    }
    if(P.fr) FRUIT_AT.slice(0, fruits).forEach(f => {
      const x = Math.round(fx + f[0] * s), y = Math.round(cy + f[1] * s);
      if(pb.a(x, y) < 255 || pb.a(x + 1, y + 1) < 255) return;
      if(s > .85){ pb.r(x - 1, y - 1, 3, 3, c32(P.fr)); pb.p(x - 1, y - 1, c32(P.fh)); pb.p(x + 1, y + 1, c32(shade(P.fr, .7))); }
      else{ pb.r(x, y, 2, 2, c32(P.fr)); pb.p(x, y, c32(P.fh)); }
    });
  });
}
const BUSH = {ol:'#22562C', lo:'#2F7A3B', mid:'#44A04F', hi:'#6DC170'};
const BUSH_SNOW = {ol:'#3E5E6C', lo:'#A9C3D2', mid:'#DCE9F1', hi:'#FFFFFF'};
function bushSpr(v){
  return spr('bush|' + v, 16, 16, 8, 14, pb => {
    shadow(pb, 8, 14, 7, 2);
    blob(pb, [[8, 9.5, 5.8], [4.5, 11, 4], [11.5, 11, 4], [8, 6, 4.4]], v === 2 ? BUSH_SNOW : BUSH);
    if(v === 1) [[5, 8], [10, 7], [8, 11], [12, 10]].forEach(p => { pb.p(p[0], p[1], c32('#E2483B')); });
  });
}
function rockSpr(){
  return spr('rock', 16, 14, 8, 12, pb => {
    shadow(pb, 8, 12, 7, 2);
    blob(pb, [[8, 8.5, 5.2], [5, 9.5, 3.6], [11, 10, 3.2]], {ol:'#4E555C', lo:'#868D94', mid:'#A3A9AF', hi:'#C9CED2'});
  });
}
function rockPileSpr(){
  return spr('rockpile', 34, 22, 17, 20, pb => {
    shadow(pb, 17, 20, 15, 2);
    const P = {ol:'#4E555C', lo:'#7E858C', mid:'#9EA4AA', hi:'#C6CBCF'};
    blob(pb, [[9, 14, 6.5], [6, 16, 4.5]], P); blob(pb, [[24, 14, 7], [28, 16, 4.5]], P); blob(pb, [[16.5, 9, 6.5], [13, 12, 4]], P);
  });
}
const SIGN = ['................', '..oooooooooooo..', '.owwwwwwwwwwwwo.', '.owllllllllllwo.', '.owwwwwwwwwwwwo.', '.owlllllllwwwwo.',
  '.oWWWWWWWWWWWWo.', '..oooooooooooo..', '......oppo......', '......oppo......', '......oppo......', '.....oooooo.....'];
function signSpr(){ return spr('sign', 16, 13, 8, 12, pb => { shadow(pb, 8, 11, 5, 1); rows(pb, 0, 0, SIGN, {o:'#4A3220', w:'#D8A762', W:'#B5823F', l:'#8C5E2E', p:'#9C6B3A'}); }); }
const BENCH = ['................', '.oooooooooooooo.', '.owwwwwwwwwwwwo.', '.oWWWWWWWWWWWWo.', '.oooooooooooooo.', '.owwwwwwwwwwwwo.', '.oWWWWWWWWWWWWo.', '.oooooooooooooo.', '..oo........oo..', '..oo........oo..'];
function benchSpr(){ return spr('bench', 16, 11, 8, 10, pb => { shadow(pb, 8, 10, 7, 1); rows(pb, 0, 0, BENCH, {o:'#4A3220', w:'#D8A762', W:'#B5823F'}); }); }
function boardSpr(){
  return spr('board', 32, 27, 16, 25, pb => {
    shadow(pb, 16, 25, 14, 2);
    const ol = c32('#4A3220');
    [5, 25].forEach(x => { pb.r(x - 1, 14, 4, 12, ol); pb.r(x, 14, 2, 11, c32('#9C6B3A')); });
    pb.r(1, 2, 30, 16, ol); pb.r(2, 3, 28, 14, c32('#C99A62'));
    for(let i = 0; i < 40; i++) pb.p(2 + hash(i, 1, 120) * 28, 3 + hash(i, 2, 121) * 14, c32('#B5844F'));
    [[4, 5, '#FFFFFF', '#1F9AA0'], [12, 6, '#FFF3B8', '#D2483C'], [20, 4, '#DDF1F2', '#1F9AA0'], [22, 11, '#FFFFFF', '#E8B93C']].forEach(n => {
      pb.r(n[0], n[1], 7, 6, c32(n[2])); pb.r(n[0] + 1, n[1] + 2, 5, 1, c32('#B9B1A3')); pb.r(n[0] + 1, n[1] + 4, 3, 1, c32('#B9B1A3')); pb.p(n[0] + 3, n[1], c32(n[3]));
    });
  });
}
function gateSpr(){
  return spr('gate', 32, 22, 16, 21, pb => {
    const ol = c32('#3A3F45');
    [0, 26].forEach(x => { pb.r(x, 3, 6, 19, ol); pb.r(x + 1, 4, 4, 17, c32('#9AA0A6')); pb.r(x + 1, 4, 4, 2, c32('#C4C9CE')); });
    for(let x = 6; x < 26; x++) for(let y = 6; y < 22; y++){
      let c = (x - 6) % 4 === 3 ? '#7A5230' : (x - 6) % 4 === 0 ? '#C99A62' : '#B07A44';
      if(y === 6 || y === 21) c = '#4A3220';
      if(y === 10 || y === 17) c = '#6B4224';
      pb.p(x, y, c32(c));
    }
    pb.r(13, 9, 6, 1, ol); pb.r(13, 9, 1, 3, ol); pb.r(18, 9, 1, 3, ol);
    pb.r(12, 12, 8, 6, ol); pb.r(13, 13, 6, 4, c32('#E8B93C')); pb.p(13, 13, c32('#FFE48A')); pb.p(16, 14, ol); pb.p(16, 15, ol);
  });
}
function crystalSpr(){
  return spr('crystal', 16, 24, 8, 22, pb => {
    shadow(pb, 8, 22, 6, 2);
    for(let y = 2; y <= 22; y++){
      const w = y < 7 ? y - 1 : 6;
      for(let x = -w; x <= w; x++){
        let c = x < -2 ? '#EAF8FD' : x > 2 ? '#8CC8E2' : '#BFE6F5';
        if(x === -w || x === w || y === 22) c = '#4E86A0';
        pb.p(8 + x, y, c32(c));
      }
    }
    pb.p(6, 8, c32('#FFFFFF')); pb.p(6, 9, c32('#FFFFFF')); pb.p(5, 12, c32('#FFFFFF'));
  });
}
function snowmanSpr(){
  return spr('snowman', 18, 26, 9, 24, pb => {
    shadow(pb, 9, 24, 7, 2);
    const P = {ol:'#5A6B7A', lo:'#C8D8E6', mid:'#EEF5FA', hi:'#FFFFFF'};
    blob(pb, [[9, 18, 6.5]], P); blob(pb, [[9, 9, 4.8]], P);
    pb.p(7, 8, c32('#2A2633')); pb.p(11, 8, c32('#2A2633')); pb.r(9, 10, 3, 1, c32('#F08A30'));
    [[3, 14], [2, 13], [1, 12], [15, 14], [16, 13], [17, 12]].forEach(p => pb.p(p[0], p[1], c32('#6B4224')));
    pb.r(5, 3, 9, 1, c32('#2A2633')); pb.r(6, 0, 7, 3, c32('#2A2633')); pb.r(6, 2, 7, 1, c32('#D2483C'));
  });
}
function obsSpr(){
  return spr('obs', 48, 60, 24, 58, pb => {
    shadow(pb, 24, 57, 22, 3);
    const ol = c32('#3A4350');
    pb.r(5, 28, 38, 30, ol); pb.r(6, 29, 36, 28, c32('#EEF0F3'));
    for(let y = 33; y < 57; y += 5) for(let x = 6; x < 42; x++) if(hash(x, y, 81) < .8) pb.p(x, y, c32('#D9DEE4'));
    pb.r(19, 42, 10, 16, ol); pb.r(20, 43, 8, 15, c32('#8A5A34')); pb.r(21, 44, 6, 13, c32('#A36D40')); pb.p(26, 50, c32('#F2C230'));
    [[10, 35], [33, 35]].forEach(w => { pb.r(w[0] - 1, w[1] - 1, 7, 7, ol); pb.r(w[0], w[1], 5, 5, c32('#86C3E6')); pb.p(w[0], w[1], c32('#D8F0FC')); pb.p(w[0] + 1, w[1], c32('#D8F0FC')); });
    pb.r(3, 26, 42, 3, ol); pb.r(4, 27, 40, 1, c32('#8E9DAE'));
    const R = 17, in_ = (x, y) => { const dx = x + .5 - 24, dy = y + .5 - 27; return dy <= 0 && dx * dx + dy * dy <= R * R; };
    for(let y = 8; y < 27; y++) for(let x = 6; x < 42; x++){
      if(!in_(x, y)) continue;
      const edge = !in_(x - 1, y) || !in_(x + 1, y) || !in_(x, y - 1);
      const dx = x + .5 - 24;
      pb.p(x, y, edge ? ol : c32(dx < -7 ? '#DCE5EE' : dx > 6 ? '#8E9DAE' : '#B8C5D3'));
    }
    for(let y = 11; y < 26; y++) pb.r(22, y, 4, 1, c32('#2E3742'));
    for(let t = 0; t <= 1; t += 1 / 40){ const x = Math.round(24 + 15 * t), y = Math.round(19 - 13 * t); pb.r(x - 1, y - 1, 3, 3, ol); }
    for(let t = 0; t <= 1; t += 1 / 40){ const x = Math.round(24 + 15 * t), y = Math.round(19 - 13 * t); pb.p(x, y, c32('#7D8A98')); pb.p(x, y - 1, c32('#A9B4C0')); }
  });
}
/* 깃발(두 장면) · 단서 보냄 표시 */
function flagSpr(fr){
  return spr('flag|' + fr, 14, 26, 1, 25, pb => {
    const ol = c32('#2A2633');
    pb.r(0, 2, 3, 24, ol); pb.r(1, 3, 1, 22, c32('#7A7F86')); pb.r(0, 0, 3, 3, ol); pb.p(1, 1, c32('#F2C230'));
    for(let x = 0; x < 10; x++){
      const wv = Math.round(Math.sin((x + fr * 2.5) * 0.8) * 1.2);
      for(let y = 0; y < 7; y++){
        let c = y === 0 ? '#5CC4C8' : x > 7 ? '#14747A' : '#1F9AA0';
        if(y === 6 || x === 9) c = '#0E5A5F';
        pb.p(3 + x, 3 + y + wv, c32(c));
      }
    }
  });
}
function sentSpr(){
  return spr('sent', 14, 14, 7, 13, pb => {
    blob(pb, [[7, 7, 6]], {ol:'#0E5A5F', lo:'#14747A', mid:'#1F9AA0', hi:'#3FB5BA'});
    [[4, 7], [5, 8], [6, 9], [7, 8], [8, 7], [9, 6], [10, 5]].forEach(p => pb.p(p[0], p[1], c32('#FFFFFF')));
  });
}
/* 그림 반응 8×8 */
const EMO_ROWS = [
  ['........', 'LL....LL', 'LlL..LlL', '.LlLLlL.', '...dd...', '...dd...', '...dd...', '........'],
  ['...b....', '..bb....', '..bBb...', '.bBBBb..', '.bwBBb..', '.bBBBb..', '..bbb...', '........'],
  ['....d...', '...dl...', '.rrrrr..', 'rwRRRRr.', 'rRRRRRr.', 'rRRRRRr.', '.rRRRr..', '..rrr...'],
  ['...pp...', '..pPPp..', '.ppyypp.', '.pPyyPp.', '..ppPp..', '...pp...', '...g....', '..gg....'],
  ['..ooo...', '.o...o..', '.....o..', '....o...', '...o....', '...o....', '........', '...o....'],
  ['...xx...', '...xx...', '...xx...', '...xx...', '...xx...', '........', '...xx...', '........']
];
const EMO_PAL = {L:'#3E8E45', l:'#7ED36F', d:'#4E7A2E', b:'#2E7FC0', B:'#5FB3EA', w:'#FFFFFF', r:'#A8261F', R:'#E04438', p:'#D85A93', P:'#F7B5CF', y:'#F2C230', g:'#4FA84A', o:'#2B3A2C', x:'#D24B3E'};
function emoIcon(i){ return spr('emo|' + i, 8, 8, 0, 0, pb => rows(pb, 0, 0, EMO_ROWS[i], EMO_PAL)); }
function bubbleSpr(i){
  return spr('bub|' + i, 14, 15, 7, 14, pb => {
    const ol = c32('#2B3A2C'), wh = c32('#FFFFFF');
    pb.r(1, 0, 12, 12, ol); pb.r(0, 1, 14, 10, ol); pb.r(1, 1, 12, 10, wh);
    pb.r(5, 12, 4, 1, ol); pb.r(6, 12, 2, 1, wh); pb.r(6, 13, 2, 1, ol); pb.p(6, 14, ol);
    rows(pb, 3, 2, EMO_ROWS[i], EMO_PAL);
  });
}

/* ═══════════ 캐릭터(16×20, 위 네 줄은 꾸미기 자리) ═══════════ */
const HAIR = ['#2E2A2E', '#5B3A24', '#8E5B33', '#C9973F'];
const SHIRT = ['#E25141', '#3E86C9', '#F1B53B', '#53A85A', '#9269C4', '#EE8DB0'];
const ACC = ['없음', '새싹', '밀짚모자'];
const LOOKS = HAIR.length * SHIRT.length * ACC.length;
const lookOf = l => { l = ((l | 0) % LOOKS + LOOKS) % LOOKS; return {hair:l % 4, shirt:((l / 4) | 0) % 6, acc:(l / 24) | 0}; };
const lookNum = o => o.hair + 4 * o.shirt + 24 * o.acc;
const HEAD = {
  down:['................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhshhshho...', '...ohsessesho...', '...ohsessesho...', '....orssssro....'],
  up:  ['................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhhhhhhho...', '...oHhhhhhhHo...', '....oHHHHHHo....'],
  left:['................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhho...', '...oshhhhhhho...', '...osesshhhho...', '...osesshhhho...', '....orsssHho....']
};
const TORSO = {
  down:['....occcccco....', '...oscccccCso...', '...oocccccCoo...', '....oppppppo....'],
  up:  ['....occcccco....', '...oscccccCso...', '...oocccccCoo...', '....oppppppo....'],
  left:['.....occcco.....', '.....ocscco.....', '.....occcCo.....', '.....oppppo.....']
};
const LEGS = {
  down:[['....oppooppo....', '....offooffo....'], ['....oppooffo....', '....offo.oo.....'], ['....offooppo....', '.....oo.offo....']],
  up:  [['....oppooppo....', '....offooffo....'], ['....oppooffo....', '....offo.oo.....'], ['....offooppo....', '.....oo.offo....']],
  left:[['.....oppPo......', '.....offfo......'], ['....opo.opo.....', '...ofo...ofo....'], ['....opo.opo.....', '...ofo...ofo....']]
};
const SPROUT = ['................', '.....LL..LL.....', '.....LlLLlL.....', '......LllL......', '.......dd.......', '.......dd.......'];
const HAT = ['................', '................', '......oooo......', '.....oyyyyo.....', '.....oyyyyo.....', '....oRRRRRRo....', '..ooyyyyyyyyoo..', '.oYYYYYYYYYYYYo.', '..oooooooooooo..'];
function avatarSpr(look, dir, fr){
  const L = lookOf(look), key = 'av|' + lookNum(L) + '|' + dir + '|' + fr;
  return spr(key, 16, 20, 8, 19, pb => {
    const d = dir === 'right' ? 'left' : dir, flip = dir === 'right';
    const hair = HAIR[L.hair], shirt = SHIRT[L.shirt];
    const pal = {o:'#2A2633', h:hair, H:shade(hair, .72), s:'#F7D2AE', S:'#E5B08A', e:'#2A2633', r:'#F2A08F', c:shirt, C:shade(shirt, .76), p:'#3E4F7C', P:'#2E3B60', f:'#5A3A28'};
    const body = HEAD[d].concat(TORSO[d], LEGS[d][fr], ['................']);
    rows(pb, 0, 4, body, pal, flip);
    if(L.acc === 1) rows(pb, 0, 0, SPROUT, {L:'#3E8E45', l:'#7ED36F', d:'#4E7A2E'}, flip);
    if(L.acc === 2) rows(pb, 0, 0, HAT, {o:'#2A2633', y:'#F0CF74', Y:'#D4A94D', R:'#D2483C'}, flip);
  });
}
function avShadow(){ return spr('avsh', 14, 5, 7, 2, pb => shadow(pb, 7, 2, 6, 2)); }

/* ═══════════ 지도 만들기 ═══════════ */
const SPAWN = [23, 17];
const FLAG_AT = [[12, 9], [15, 12], [30, 9], [33, 12], [15, 9], [12, 12], [33, 9], [30, 12]];   // 깃발 숲(2×2 왼쪽 위)
const PLOT_X = [11, 14, 17, 20, 26, 29, 32, 35], PLOT_Y = [22, 25, 28, 31, 34];
const plotAt = n => { const i = n - 1; return i >= 0 && i < 40 ? [PLOT_X[i % 8], PLOT_Y[(i / 8) | 0]] : null; };
function placeText(k, open){
  const p = (QO.K.PLACES || []).find(x => x.k === k) || {n:k, cond:''};
  return {title:p.n, body:open ? p.cond + ' 열렸어요.' : p.cond + ' 열려요.'};
}
function buildGround(seen){
  const G = []; for(let y = 0; y < MH; y++) G.push(new Array(MW).fill('g'));
  const set = (x, y, c) => { if(x >= 0 && y >= 0 && x < MW && y < MH) G[y][x] = c; };
  const fill = (x0, y0, x1, y1, c) => { for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++) set(x, y, c); };
  fill(2, 1, 6, 38, 'f'); fill(11, 36, 36, 38, 'f'); fill(13, 20, 21, 21, 'f'); fill(26, 20, 34, 21, 'f');
  fill(18, 1, 29, 7, 'h'); fill(18, 8, 29, 8, 'c'); set(23, 8, 't'); set(24, 8, 't');
  fill(36, 1, 45, 10, 's'); fill(35, 0, 35, 11, 'i'); fill(36, 11, 45, 11, 'i');
  if(seen.winter){ set(40, 11, 's'); set(41, 11, 's'); }
  for(let y = 0; y < MH; y++){ const rx = (y >= 11 && y <= 20) ? 7 : 7 + Math.round(Math.sin(y * 0.5) * 0.9); fill(rx, y, rx + 2, y, 'w'); }
  fill(7, 15, 9, 16, 'b');
  fill(10, 15, 45, 16, 'p'); fill(23, 9, 24, 38, 'p'); fill(40, 12, 41, 14, 'p'); fill(41, 17, 42, 22, 'p');
  fill(19, 12, 28, 19, 'q'); [[19, 12], [28, 12], [19, 19], [28, 19]].forEach(p => set(p[0], p[1], 'g'));
  fill(39, 23, 45, 31, 'f'); fill(41, 25, 44, 28, 'w'); [[41, 25], [44, 25], [41, 28], [44, 28]].forEach(p => set(p[0], p[1], 'f'));
  return G;
}
function buildWorld(seen, trees){
  const G = buildGround(seen);
  const block = new Uint8Array(MW * MH), act = new Map(), objs = [];
  for(let y = 0; y < MH; y++) for(let x = 0; x < MW; x++){
    const c = G[y][x];
    if(c === 'w' || c === 'c' || c === 'i' || (c === 'b' && !seen.bridge)) block[y * MW + x] = 1;
  }
  const B = (x, y) => { if(x >= 0 && y >= 0 && x < MW && y < MH) block[y * MW + x] = 1; };
  const A = (x, y, a) => { if(x >= 0 && y >= 0 && x < MW && y < MH) act.set(y * MW + x, a); };
  const put = (s, footX, footY, a, extra) => { const o = Object.assign({s:s, x:footX - s.fx, y:footY - s.fy, base:footY, a:a || null}, extra || {}); objs.push(o); return o; };
  const tree2 = (tx, ty, s, a, extra) => { put(s, tx * TS + 16, (ty + 1) * TS + 14, a, extra); B(tx, ty + 1); B(tx + 1, ty + 1); if(a){ A(tx, ty + 1, a); A(tx + 1, ty + 1, a); } };
  const one = (tx, ty, s, a, walk) => { put(s, tx * TS + 8, ty * TS + 14, a); if(!walk) B(tx, ty); if(a) A(tx, ty, a); };

  /* 가장자리 숲 */
  for(let x = 0; x < MW; x += 2){
    if(x >= 34) one(x, 0, treeSpr('pine', 7 + (hash(x, 0, 140) * 3 | 0), 0, true)), one(x + 1, 0, treeSpr('pine', 6 + (hash(x, 1, 141) * 3 | 0), 0, true));
    else tree2(x, -1, treeSpr('border', 7 + (hash(x, 0, 142) * 4 | 0), 0));
    tree2(x, 38, treeSpr('border', 7 + (hash(x, 9, 143) * 4 | 0), 0));
  }
  for(let y = 1; y < MH - 1; y += 2){ tree2(0, y - 1, treeSpr('border', 7 + (hash(0, y, 144) * 4 | 0), 0)); tree2(46, y - 1, treeSpr(y < 12 ? 'pine' : 'border', 7 + (hash(1, y, 145) * 4 | 0), 0, y < 12)); }

  /* 언덕 · 관측소 */
  for(let y = 1; y <= 7; y++){ one(17, y, bushSpr(0)); one(30, y, bushSpr(y % 3 === 0 ? 1 : 0)); }
  one(19, 2, rockSpr()); one(28, 3, rockSpr()); one(20, 6, bushSpr(1)); one(27, 6, bushSpr(0));
  const obsA = seen.obs ? {k:'text', title:'관측소', body:'망원경이 밤하늘 쪽을 보고 있어요. ' + placeText('obs', true).body} : null;
  put(obsSpr(), 24 * TS, 6 * TS - 2, obsA);
  for(let x = 22; x <= 25; x++) for(let y = 3; y <= 5; y++) B(x, y);
  if(obsA) for(let x = 22; x <= 25; x++) A(x, 5, obsA);
  if(!seen.obs){ const ga = {k:'place', p:'obs'}; put(gateSpr(), 24 * TS, 8 * TS + 15, ga); B(23, 8); B(24, 8); A(23, 8, ga); A(24, 8, ga); }
  one(22, 9, signSpr(), {k:'place', p:'obs'});

  /* 겨울 숲 */
  [[37, 2], [39, 1], [43, 2], [37, 6], [44, 6], [42, 8], [38, 9], [44, 9], [36, 4]].forEach((p, i) => one(p[0], p[1], treeSpr('pine', 6 + (i % 4), 0, true)));
  one(39, 5, bushSpr(2)); one(43, 4, bushSpr(2));
  one(41, 5, snowmanSpr(), seen.winter ? {k:'text', title:'겨울 숲', body:'눈사람이 서 있어요. ' + placeText('winter', true).body} : null);
  if(!seen.winter){ const wa = {k:'place', p:'winter'}; one(40, 11, crystalSpr(), wa); one(41, 11, crystalSpr(), wa); }
  one(39, 13, signSpr(), {k:'place', p:'winter'});

  /* 샘물 */
  for(let x = 38; x <= 45; x++){ if(x !== 41 && x !== 42) one(x, 22, bushSpr(x % 3 === 0 ? 1 : 0)); one(x, 32, bushSpr(0)); }
  for(let y = 23; y <= 31; y++) one(38, y, bushSpr(y % 4 === 0 ? 1 : 0));
  if(!seen.spring){ const sa = {k:'place', p:'spring'}; put(rockPileSpr(), 42 * TS, 22 * TS + 14, sa); B(41, 22); B(42, 22); A(41, 22, sa); A(42, 22, sa); }
  one(40, 19, signSpr(), {k:'place', p:'spring'});
  if(seen.spring){ const pa = {k:'text', title:'샘물', body:'맑은 물이 솟아요. ' + placeText('spring', true).body}; for(let x = 41; x <= 44; x++) for(let y = 25; y <= 28; y++) A(x, y, pa); }
  one(40, 26, rockSpr()); one(45, 24, rockSpr());

  /* 다리 · 건너편 들판 */
  const ba = {k:'place', p:'bridge'};
  for(let x = 7; x <= 9; x++){ A(x, 15, ba); A(x, 16, ba); }
  one(10, 14, signSpr(), ba);
  one(5, 13, signSpr(), {k:'text', title:'다리 건너 들판', body:'다리를 건너온 사람만 볼 수 있는 꽃밭이에요.'});
  [[3, 6], [4, 20], [3, 28], [5, 34]].forEach(p => one(p[0], p[1], bushSpr(1)));
  [[2, 10], [3, 24]].forEach(p => one(p[0], p[1], rockSpr()));

  /* 광장 */
  const board = {k:'text', title:'우리 반 숲', body:'청록 깃발이 선 나무는 친구가 막혀 있는 질문이에요. 나무 앞에서 살펴보기를 누르면 찾아갈 길을 알려 줄 수 있어요. 아래 과수원에는 우리 반 나무가 번호 순서로 서 있어요.'};
  put(boardSpr(), 21 * TS, 12 * TS + 15, board); B(20, 12); B(21, 12); A(20, 12, board); A(21, 12, board);
  one(20, 18, benchSpr()); one(27, 18, benchSpr()); one(27, 13, bushSpr(1)); one(20, 15, bushSpr(0));

  /* 깃발 숲(이름 없음) */
  FLAG_AT.forEach((p, i) => tree2(p[0], p[1], treeSpr('default', 7, 3), {k:'flag', slot:i}, {flagSlot:i}));

  /* 우리 반 과수원(번호 순서) */
  one(22, 21, signSpr(), {k:'text', title:'우리 반 과수원', body:'우리 반 나무가 번호 순서로 서 있어요. 친구 나무 앞에서 살펴보기를 누르면 그 친구 질문에 물을 줄 수 있어요.'});
  (trees || []).forEach(t => {
    const p = plotAt(t.n); if(!p) return;
    const a = {k:'tree', n:t.n, me:!!t.me, name:t.name};
    tree2(p[0], p[1], treeSpr(t.type, t.level, t.fruits), a, {plate:t.name, plateMe:!!t.me, plateN:t.n});
  });
  return {G:G, block:block, act:act, objs:objs};
}

/* ═══════════ 상태 ═══════════ */
const W = {root:null, cv:null, ctx:null, k:3, vw:200, vh:200, dpr:1, raf:0, last:0, t:0,
  data:{flags:[], seen:{}, trees:[]}, sig:'', world:null, ground:[null, null],
  me:null, uid:null, held:[], pad:null, route:null, pend:null, dlg:null, cardKey:null, fontOk:false};
function newAvatar(x, y, dir, look, name){
  return {x:x, y:y, fx:x, fy:y, px:x * TS, py:y * TS, t:1, moving:false, dir:dir || 'down', par:false, look:look | 0, name:name || '',
    n:0, trail:[[x, y]], q:[], face:null, emo:0, emoN:0, emoUntil:0, say:0, sayN:0, sayUntil:0};
}
const walkable = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && W.world && !W.world.block[y * MW + x];
function lookKey(){ return 'qo2-world-look-' + (W.uid || 'x'); }
function posKey(){ return 'qo2-world-pos-' + (W.uid || 'x'); }
function myLookNum(){
  try{ const v = localStorage.getItem(lookKey()); if(v != null && /^\d+$/.test(v)) return Number(v) % LOOKS; }catch(_){}
  const m = QO.state.me || {}; return ((Number(m.number) || 1) * 7 + 3) % (LOOKS / 3);   // 처음엔 꾸미기 없이
}
function savePos(){ try{ sessionStorage.setItem(posKey(), JSON.stringify([W.me.x, W.me.y, W.me.dir])); }catch(_){} }
function resetMe(){
  const m = QO.state.me || {};
  W.uid = m.id || null;
  let p = null; try{ p = JSON.parse(sessionStorage.getItem(posKey()) || 'null'); }catch(_){}
  W.me = newAvatar(SPAWN[0], SPAWN[1], 'down', myLookNum(), m.name || '나');
  W.me.spawn = p && Array.isArray(p) ? p : null;
  W.route = null; W.pend = null; W.held = []; W.pad = null;
  NET.others.clear(); NET.since = null;
}

/* ═══════════ 붙이기 ═══════════ */
function ensureRoot(){
  if(W.root) return;
  const r = document.createElement('div');
  r.className = 'wd'; r.tabIndex = 0; r.setAttribute('role', 'region');
  r.setAttribute('aria-label', '우리 반 숲. 방향키로 걷고 스페이스나 엔터로 살펴봐요. 화면을 누르면 그곳으로 걸어가요.');
  r.innerHTML =
    '<canvas class="wd-cv" aria-hidden="true"></canvas>' +
    '<div class="wd-top"><button type="button" class="wd-ib wd-lookb" data-wd="look" aria-label="내 모습 바꾸기" aria-expanded="false"><canvas width="16" height="20" aria-hidden="true"></canvas></button>' +
    '<button type="button" class="wd-st" data-wd="status" aria-live="polite"></button>' +
    '<button type="button" class="wd-ib wd-emob" data-wd="emo" aria-label="말풍선 보내기" aria-expanded="false"><svg width="22" height="20" viewBox="0 0 11 10" aria-hidden="true" shape-rendering="crispEdges"><path d="M1 0h9v1h1v6h-1v1H5v1H4v1H3V8H1V7H0V1h1z" fill="#2B3A2C"/><path d="M1 1h9v6H3v1H1z" fill="#fff"/><path d="M3 3h1v1H3zM5 3h1v1H5zM7 3h1v1H7z" fill="#2B3A2C"/></svg></button></div>' +
    '<div class="wd-pad" aria-hidden="true"><button type="button" tabindex="-1" data-dir="up"></button><button type="button" tabindex="-1" data-dir="left"></button><button type="button" tabindex="-1" data-dir="right"></button><button type="button" tabindex="-1" data-dir="down"></button></div>' +
    '<button type="button" class="wd-a" data-wd="act">살펴<br>보기</button>' +
    '<div class="wd-pop wd-emo" hidden></div>' +
    '<div class="wd-pop wd-look" hidden></div>' +
    '<div class="wd-dlg" role="dialog" aria-label="살펴보기" hidden><button type="button" class="wd-x" data-wd="close" aria-label="닫기"></button><div class="wd-in"></div></div>' +
    '<ul class="wd-sr"></ul>';
  W.root = r; W.cv = r.querySelector('.wd-cv'); W.ctx = W.cv.getContext('2d');
  W.dlgEl = r.querySelector('.wd-dlg'); W.dlgIn = r.querySelector('.wd-in');
  W.stEl = r.querySelector('.wd-st'); W.emoEl = r.querySelector('.wd-emo'); W.lookEl = r.querySelector('.wd-look');
  wireInput(r);
  if(window.ResizeObserver) new ResizeObserver(() => fit()).observe(r);
  if(document.fonts && document.fonts.load) document.fonts.load('11px Galmuri11', '가나다').then(() => { W.fontOk = true; }, () => {});
}
function fit(){
  if(!W.root || !W.root.isConnected) return;
  const r = W.root.getBoundingClientRect(); if(!r.width || !r.height) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
  if(W.cv.width !== cw || W.cv.height !== ch){ W.cv.width = cw; W.cv.height = ch; }
  const across = r.width < 520 ? 11 : r.width < 900 ? 14 : 17;
  W.k = Math.max(1, Math.round(cw / (across * TS)));
  W.vw = cw / W.k; W.vh = ch / W.k; W.dpr = dpr;
  W.ctx.imageSmoothingEnabled = false;
}
function sigOf(d){ return JSON.stringify([d.seen || {}, (d.trees || []).map(t => [t.n, t.name, t.type, t.level, t.fruits, t.me ? 1 : 0])]); }
function rebuild(){
  const d = W.data, seen = d.seen || {};
  W.world = buildWorld(seen, d.trees);
  W.ground = [groundCanvas(W.world.G, 0, seen), groundCanvas(W.world.G, 1, seen)];
  W.flagTree = {}; W.world.objs.forEach(o => { if(o.flagSlot != null) W.flagTree[o.flagSlot] = o; });
  const me = W.me;
  if(me.spawn){ const p = me.spawn; me.spawn = null; if(walkable(p[0], p[1])) place(me, p[0], p[1], DIRS.indexOf(p[2]) >= 0 ? p[2] : 'down'); }
  if(!walkable(me.x, me.y)) place(me, SPAWN[0], SPAWN[1], 'down');
}
function place(a, x, y, dir){ a.x = a.fx = x; a.y = a.fy = y; a.px = x * TS; a.py = y * TS; a.t = 1; a.moving = false; if(dir) a.dir = dir; a.q = []; }
function srList(){
  const ul = W.root.querySelector('.wd-sr'), seen = W.data.seen || {};
  ul.innerHTML = (QO.K.PLACES || []).filter(p => seen[p.k]).map(p => '<li data-place="' + p.k + '">' + esc(p.n) + ' 열림</li>').join('');
}
function mount(slot, d){
  ensureRoot();
  const uid = QO.state.me ? QO.state.me.id : null;
  if(!W.me || uid !== W.uid){ resetMe(); W.sig = ''; }
  W.data = d || {flags:[], seen:{}, trees:[]};
  if(W.root.parentNode !== slot) slot.appendChild(W.root);
  const sig = sigOf(W.data);
  if(sig !== W.sig || !W.world){ W.sig = sig; rebuild(); }
  /* 카드(단서·친구 나무)는 tree.js 가 만든다. 같은 카드면 스크롤을 지킨다 */
  if(W.data.card){
    const st = W.dlg === 'card' && W.cardKey === W.data.cardKey ? W.dlgEl.scrollTop : 0;
    W.dlg = 'card'; W.cardKey = W.data.cardKey; W.dlgIn.innerHTML = W.data.card; showDlg(); W.dlgEl.scrollTop = st;
  }else if(W.dlg === 'card') hideDlg();
  srList(); fit(); status(); paintLookCanvases(); startLoop(); netStart();
}

/* ═══════════ 대화 상자 ═══════════ */
function showDlg(){ W.dlgEl.hidden = false; W.root.classList.add('dlg-on'); closePops(); }
function hideDlg(){ W.dlg = null; W.cardKey = null; W.dlgEl.hidden = true; W.dlgIn.innerHTML = ''; W.root.classList.remove('dlg-on'); }
function closeDlg(){ const was = W.dlg; hideDlg(); if(was === 'card' && W.data.onClose) W.data.onClose(); }
function textDlg(title, body){ W.dlg = 'text'; W.cardKey = null; W.dlgIn.innerHTML = '<div class="wd-tt">' + esc(title) + '</div><p class="wd-tx">' + esc(body) + '</p><div class="wd-more" aria-hidden="true"></div>'; showDlg(); }
function interact(a){
  if(!a) return;
  if(a.k === 'flag'){
    const f = (W.data.flags || []).find(x => x.slot === a.slot);
    if(f && W.data.onFlag) W.data.onFlag(f.id);
    else textDlg('사과나무', '아직 깃발이 없는 나무예요. 친구가 질문에 막힘 표시를 하면 이 나무들에 청록 깃발이 서요.');
  }
  else if(a.k === 'tree'){
    if(a.me) textDlg('내 나무', '내 나무예요. 「내 나무」 탭에서 열매와 꽃을 볼 수 있어요.');
    else if(W.data.onTree) W.data.onTree(a.n);
  }
  else if(a.k === 'place'){ const t = placeText(a.p, !!(W.data.seen || {})[a.p]); textDlg(t.title, t.body); }
  else if(a.k === 'text') textDlg(a.title, a.body);
}
function frontAct(){ const v = DV[W.me.dir], x = W.me.x + v[0], y = W.me.y + v[1]; return W.world.act.get(y * MW + x) || null; }
function pressAct(){
  if(W.dlg){ closeDlg(); return; }
  if(!W.world || W.me.moving) return;
  const a = frontAct();
  if(a) interact(a);
}

/* ═══════════ 길 찾기 ═══════════ */
function bfs(sx, sy, goal, limit){
  const prev = new Int32Array(MW * MH).fill(-1), st = sy * MW + sx, q = [st];
  prev[st] = st;
  for(let i = 0; i < q.length && i < (limit || 4000); i++){
    const c = q[i], x = c % MW, y = (c / MW) | 0;
    if(c !== st && goal(x, y)){
      const path = []; let k = c; while(k !== st){ path.push([k % MW, (k / MW) | 0]); k = prev[k]; }
      return path.reverse();
    }
    for(const s of SIDES){
      const nx = x + s[0], ny = y + s[1]; if(!walkable(nx, ny)) continue;
      const ni = ny * MW + nx; if(prev[ni] !== -1) continue;
      prev[ni] = c; q.push(ni);
    }
  }
  return null;
}
function nextToAct(a){ return (x, y) => SIDES.some(s => W.world.act.get((y + s[1]) * MW + (x + s[0])) === a); }
function faceAct(a){
  const me = W.me;
  for(const d of DIRS){ const v = DV[d]; if(W.world.act.get((me.y + v[1]) * MW + (me.x + v[0])) === a){ me.dir = d; return true; } }
  return false;
}
function goToAct(a, andAct){
  if(!a || !W.world) return false;
  if(nextToAct(a)(W.me.x, W.me.y) && !W.me.moving){ faceAct(a); if(andAct) interact(a); return true; }
  const path = bfs(W.me.x, W.me.y, nextToAct(a));
  if(!path) return false;
  W.route = path; W.pend = {a:a, act:!!andAct};
  return true;
}
function goToTile(tx, ty){
  if(!walkable(tx, ty)){
    /* 막힌 곳이면 가장 가까운 걸을 수 있는 칸으로 */
    const path = bfs(W.me.x, W.me.y, (x, y) => Math.abs(x - tx) + Math.abs(y - ty) <= 1);
    if(path){ W.route = path; W.pend = null; }
    return;
  }
  if(tx === W.me.x && ty === W.me.y) return;
  const path = bfs(W.me.x, W.me.y, (x, y) => x === tx && y === ty);
  if(path){ W.route = path; W.pend = null; }
}
function findTreeAct(n){ for(const v of W.world.act.values()) if(v.k === 'tree' && v.n === n) return v; return null; }
function findFlagAct(slot){ for(const v of W.world.act.values()) if(v.k === 'flag' && v.slot === slot) return v; return null; }

/* ═══════════ 입력 ═══════════ */
const KEYMAP = {ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right'};
function forestOn(){ return W.root && W.root.isConnected && QO.tabs.current() === 'forest'; }
function typing(el){ return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
document.addEventListener('keydown', e => {
  if(!forestOn() || e.isComposing || e.keyCode === 229) return;
  const t = e.target;
  if(typing(t) || (t.closest && t.closest('[aria-modal="true"]'))) return;
  const inWorld = t === W.root || (t.closest && t.closest('.wd'));
  if(e.key === 'Escape'){ if(W.dlg){ closeDlg(); e.preventDefault(); } else if(!W.emoEl.hidden || !W.lookEl.hidden){ closePops(); e.preventDefault(); } return; }
  const d = KEYMAP[e.key];
  if(d){
    if(!inWorld && /^[wasdWASD]$/.test(e.key)) return;   // 다른 곳에서는 글자 그대로
    e.preventDefault();
    if(W.held.indexOf(d) < 0) W.held.push(d);
    return;
  }
  if((e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'Z') && (t === W.root || t === document.body)){
    e.preventDefault(); if(!e.repeat) pressAct();
  }
});
document.addEventListener('keyup', e => { const d = KEYMAP[e.key]; if(d) W.held = W.held.filter(x => x !== d); });
window.addEventListener('blur', () => { W.held = []; W.pad = null; });
function toGame(ev){
  const r = W.cv.getBoundingClientRect();
  return [W.cam[0] + (ev.clientX - r.left) / r.width * W.vw, W.cam[1] + (ev.clientY - r.top) / r.height * W.vh];
}
function tapAt(gx, gy){
  if(!W.world) return;
  if(W.dlg) closeDlg();
  /* 그림을 먼저(나무 잎을 눌러도 그 나무로) — 앞에 있는 것부터 */
  const hit = W.world.objs.filter(o => o.a && gx >= o.x && gy >= o.y && gx < o.x + o.s.w && gy < o.y + o.s.h && o.s.pb.a(gx - o.x, gy - o.y) > 120)
    .sort((a, b) => b.base - a.base)[0];
  if(hit){ goToAct(hit.a, true); return; }
  const tx = Math.floor(gx / TS), ty = Math.floor(gy / TS);
  const a = W.world.act.get(ty * MW + tx);
  if(a){ goToAct(a, true); return; }
  goToTile(tx, ty);
}
function wireInput(r){
  let down = null;
  W.cv.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY, t:Date.now(), id:e.pointerId}; try{ r.focus({preventScroll:true}); }catch(_){} });
  W.cv.addEventListener('pointerup', e => {
    if(!down || down.id !== e.pointerId) return;
    const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y), long = Date.now() - down.t;
    down = null;
    if(moved < 12 && long < 600){ const g = toGame(e); closePops(); tapAt(g[0], g[1]); }
  });
  W.cv.addEventListener('pointercancel', () => { down = null; });
  r.querySelectorAll('.wd-pad button').forEach(b => {
    const dir = b.dataset.dir;
    const on = e => { e.preventDefault(); W.pad = dir; W.route = null; W.pend = null; try{ b.setPointerCapture(e.pointerId); }catch(_){} b.classList.add('on'); };
    const off = () => { if(W.pad === dir) W.pad = null; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  r.addEventListener('click', e => {
    const b = e.target.closest('[data-wd]'); if(!b || !r.contains(b)) return;
    const k = b.dataset.wd;
    if(k === 'act') pressAct();
    else if(k === 'close') closeDlg();
    else if(k === 'emo') togglePop(W.emoEl, b, emoHTML);
    else if(k === 'look') togglePop(W.lookEl, b, lookHTML);
    else if(k === 'status'){ if(!NET.open) U.toast(NET.state === 'off' ? '함께 걷기는 아직 준비 중이에요. 지금은 혼자 걸을 수 있어요.' : '선생님이 함께 걷기를 열면 반 친구들이 보여요.'); }
    else if(k === 'e'){ sendEmo(Number(b.dataset.i)); closePops(); }
    else if(k === 'p'){ sendSay(Number(b.dataset.i)); closePops(); }
    else if(k === 'hair' || k === 'shirt' || k === 'acc'){ const L = lookOf(W.me.look); L[k] = Number(b.dataset.i); setLook(lookNum(L)); W.lookEl.innerHTML = lookHTML(); paintLookCanvases(); }
    else if(k === 'look-done') closePops();
  });
}
function closePops(){
  [W.emoEl, W.lookEl].forEach(p => { if(p) p.hidden = true; });
  if(W.root) W.root.querySelectorAll('[data-wd="emo"],[data-wd="look"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function togglePop(el, btn, html){
  const open = el.hidden;
  closePops();
  if(!open) return;
  if(W.dlg) closeDlg();
  el.innerHTML = html(); el.hidden = false; btn.setAttribute('aria-expanded', 'true');
  paintLookCanvases();
  const f = el.querySelector('button'); if(f) try{ f.focus({preventScroll:true}); }catch(_){}
}
function emoHTML(){
  return '<div class="wd-pt">그림으로 반응하기</div><div class="wd-emos">' + EMO_NAMES.map((n, i) => '<button type="button" data-wd="e" data-i="' + (i + 1) + '" aria-label="' + n + '"><canvas width="8" height="8" data-emo="' + i + '" aria-hidden="true"></canvas></button>').join('') + '</div>' +
    '<div class="wd-pt">말풍선</div><div class="wd-says">' + PHRASES.map((p, i) => '<button type="button" data-wd="p" data-i="' + (i + 1) + '">' + esc(p) + '</button>').join('') + '</div>';
}
function lookHTML(){
  const L = lookOf(W.me.look);
  const sw = (k, list, cur) => list.map((c, i) => '<button type="button" class="wd-sw' + (i === cur ? ' on' : '') + '" data-wd="' + k + '" data-i="' + i + '" aria-pressed="' + (i === cur) + '" aria-label="' + (k === 'hair' ? '머리색 ' : '옷 색 ') + (i + 1) + '" style="background:' + c + '"></button>').join('');
  return '<div class="wd-pt">내 모습</div><div class="wd-lk"><canvas width="16" height="20" class="wd-lk-pv" data-av="1" aria-hidden="true"></canvas><div>' +
    '<div class="wd-lr"><span>머리</span>' + sw('hair', HAIR, L.hair) + '</div>' +
    '<div class="wd-lr"><span>옷</span>' + sw('shirt', SHIRT, L.shirt) + '</div>' +
    '<div class="wd-lr"><span>꾸미기</span>' + ACC.map((n, i) => '<button type="button" class="wd-acc' + (i === L.acc ? ' on' : '') + '" data-wd="acc" data-i="' + i + '" aria-pressed="' + (i === L.acc) + '">' + n + '</button>').join('') + '</div>' +
    '</div></div><button type="button" class="wd-done" data-wd="look-done">다 골랐어요</button>';
}
function paintLookCanvases(){
  if(!W.root) return;
  W.root.querySelectorAll('canvas[data-emo]').forEach(c => { const x = c.getContext('2d'); x.clearRect(0, 0, 8, 8); x.drawImage(emoIcon(Number(c.dataset.emo)).c, 0, 0); });
  W.root.querySelectorAll('canvas[data-av], .wd-lookb canvas').forEach(c => { const x = c.getContext('2d'); x.clearRect(0, 0, 16, 20); x.drawImage(avatarSpr(W.me.look, 'down', 0).c, 0, 0); });
}
function setLook(n){ W.me.look = n; try{ localStorage.setItem(lookKey(), String(n)); }catch(_){} NET.dirty = true; }
function sendEmo(i){ const me = W.me; me.emo = i; me.emoN++; me.emoUntil = W.t + 3200; me.sayUntil = 0; NET.dirty = true; netSoon(); }
function sendSay(i){ const me = W.me; me.say = i; me.sayN++; me.sayUntil = W.t + 3800; me.emoUntil = 0; NET.dirty = true; netSoon(); }

/* ═══════════ 움직임 ═══════════ */
function dirTo(a, p){ const dx = p[0] - a.x, dy = p[1] - a.y; return dx === 1 && !dy ? 'right' : dx === -1 && !dy ? 'left' : dy === 1 && !dx ? 'down' : dy === -1 && !dx ? 'up' : null; }
function startStep(a, dir, check){
  a.dir = dir;
  const v = DV[dir], nx = a.x + v[0], ny = a.y + v[1];
  if(check && !walkable(nx, ny)) return false;
  a.fx = a.x; a.fy = a.y; a.x = nx; a.y = ny; a.t = 0; a.moving = true; a.par = !a.par;
  return true;
}
function advance(a, dt, mul){
  a.t = Math.min(1, a.t + dt / STEP_S * mul);
  a.px = (a.fx + (a.x - a.fx) * a.t) * TS; a.py = (a.fy + (a.y - a.fy) * a.t) * TS;
  if(a.t >= 1){
    a.moving = false;
    if(a === W.me){ a.n++; a.trail.push([a.x, a.y]); if(a.trail.length > 10) a.trail.shift(); savePos(); NET.dirty = true; }
  }
}
function update(dt){
  const me = W.me;
  if(me.moving) advance(me, dt, 1);
  if(!me.moving){
    const dir = W.held.length ? W.held[W.held.length - 1] : W.pad;
    if(dir){
      W.route = null; W.pend = null;
      if(W.dlg) closeDlg();
      if(!W.emoEl.hidden || !W.lookEl.hidden) closePops();
      if(!startStep(me, dir, true)) NET.dirty = true;
    }else if(W.route && W.route.length){
      const n = W.route.shift(), d = dirTo(me, n);
      if(!d || !startStep(me, d, true)){ W.route = null; W.pend = null; }
    }else if(W.route){
      W.route = null;
      if(W.pend){ const p = W.pend; W.pend = null; faceAct(p.a); if(p.act) interact(p.a); }
    }
  }
  NET.others.forEach(o => {
    if(o.moving) advance(o, dt, o.q.length > 3 ? 2.2 : 1);
    if(!o.moving){
      while(o.q.length && o.q[0][0] === o.x && o.q[0][1] === o.y) o.q.shift();
      if(o.q.length){
        const n = o.q.shift(), d = dirTo(o, n);
        if(d) startStep(o, d, false); else place(o, n[0], n[1], o.dir);
      }else if(o.face) o.dir = o.face;
    }
  });
}

/* ═══════════ 그리기 ═══════════ */
function draw(){
  const ctx = W.ctx, k = W.k, me = W.me, wd = W.world;
  if(!wd) return;
  const mapW = MW * TS, mapH = MH * TS;
  let cx = Math.round(me.px + 8 - W.vw / 2), cy = Math.round(me.py + 8 - W.vh / 2);
  cx = W.vw >= mapW ? Math.round((mapW - W.vw) / 2) : Math.max(0, Math.min(mapW - W.vw, cx));
  cy = W.vh >= mapH ? Math.round((mapH - W.vh) / 2) : Math.max(0, Math.min(mapH - W.vh, cy));
  cx = Math.floor(cx); cy = Math.floor(cy);
  W.cam = [cx, cy];
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2E6B3A'; ctx.fillRect(0, 0, W.cv.width, W.cv.height);
  const g = W.ground[((W.t / 650) | 0) & 1];
  const sw = Math.min(Math.ceil(W.vw) + 1, mapW - Math.max(0, cx)), sh = Math.min(Math.ceil(W.vh) + 1, mapH - Math.max(0, cy));
  ctx.drawImage(g, Math.max(0, cx), Math.max(0, cy), sw, sh, (Math.max(0, cx) - cx) * k, (Math.max(0, cy) - cy) * k, sw * k, sh * k);
  const S = (o, x, y) => ctx.drawImage(o.c, 0, 0, o.w, o.h, Math.round(x - cx) * k, Math.round(y - cy) * k, o.w * k, o.h * k);
  const inView = (x, y, w, h) => x + w >= cx && y + h >= cy && x <= cx + W.vw && y <= cy + W.vh;
  const list = [];
  wd.objs.forEach(o => { if(inView(o.x, o.y, o.s.w, o.s.h)) list.push(o); });
  /* 깃발 */
  const fr = ((W.t / 420) | 0) & 1;
  (W.data.flags || []).forEach(f => {
    const tr = W.flagTree[f.slot]; if(!tr) return;
    const fx = tr.x + 30, fy = tr.base - 2;
    const s = f.sent ? sentSpr() : flagSpr(fr);
    if(inView(fx - s.fx, fy - s.fy - (f.sent ? 18 : 0), s.w, s.h)) list.push({s:s, x:fx - s.fx, y:fy - s.fy - (f.sent ? 18 : 0), base:tr.base + 1});
  });
  /* 사람 */
  const people = [];
  NET.others.forEach(o => people.push(o));
  people.push(me);
  people.forEach(a => {
    const x = Math.round(a.px), y = Math.round(a.py);
    if(!inView(x - 4, y - 8, 24, 32)) return;
    const fr2 = a.moving && a.t < .5 ? (a.par ? 1 : 2) : 0;
    list.push({av:a, s:avatarSpr(a.look, a.dir, fr2), x:x, y:y - 4 - (a.moving && a.t < .5 ? 1 : 0), base:y + 15 + (a === me ? .5 : 0)});
  });
  list.sort((a, b) => a.base - b.base);
  const sh0 = avShadow();
  list.forEach(o => { if(o.av) S(sh0, o.av.px + 8 - sh0.fx, o.av.py + 15 - sh0.fy); S(o.s, o.x, o.y); });
  effects(ctx, cx, cy, k);
  /* 말풍선 · 이름표(기기 화소로 또렷하게) */
  const fs = Math.max(11, Math.round(11 * Math.max(1, Math.round(W.dpr))));
  ctx.font = 'bold ' + fs + 'px ' + GAL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';   // 굵게 — 작은 화면에서 「라」·「리」가 헷갈리지 않게
  wd.objs.forEach(o => {
    if(!o.plate || !inView(o.x, o.y, o.s.w, o.s.h + 16)) return;
    const tx = (o.x + o.s.fx - cx) * k, ty = (o.base + 10 - cy) * k;
    tag(ctx, tx, ty, (o.plateN ? o.plateN + ' ' : '') + o.plate, fs, o.plateMe ? '#FFE27A' : '#F7EBD0', '#4A3220', o.plateMe ? '#2B3A2C' : '#4A3220');
  });
  people.forEach(a => {
    const x = Math.round(a.px), y = Math.round(a.py);
    if(!inView(x - 30, y - 30, 76, 70)) return;
    tag(ctx, (x + 8 - cx) * k, (y + 21 - cy) * k, a === me ? (a.name || '나') : a.name, fs, a === me ? '#FFE27A' : '#FFFFFF', 'rgba(32,40,34,.78)', null);
    if(a.emoUntil > W.t && a.emo) S(bubbleSpr(a.emo - 1), x + 1, y - 20);
    else if(a.sayUntil > W.t && a.say) say(ctx, (x + 8 - cx) * k, (y - 8 - cy) * k, PHRASES[a.say - 1] || '', fs);
  });
}
function tag(ctx, x, y, text, fs, fg, bg, border){
  if(!text) return;
  const w = Math.ceil(ctx.measureText(text).width) + fs * .8, h = Math.round(fs * 1.45);
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  ctx.fillStyle = bg; ctx.fillRect(x0, y0, w, h);
  if(border){ ctx.fillStyle = border; ctx.fillRect(x0, y0 + h - Math.max(1, fs / 11 | 0), w, Math.max(1, fs / 11 | 0)); }
  ctx.fillStyle = fg; ctx.fillText(text, Math.round(x), Math.round(y) + 1);
}
function say(ctx, x, y, text, fs){
  const pad = fs * .7, w = Math.ceil(ctx.measureText(text).width) + pad * 2, h = Math.round(fs * 2), b = Math.max(2, Math.round(fs / 6));
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
  ctx.fillStyle = '#2B3A2C'; ctx.fillRect(x0 - b, y0 - b, w + b * 2, h + b * 2);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x0, y0, w, h);
  const t = Math.round(fs * .45);
  ctx.fillStyle = '#2B3A2C'; ctx.fillRect(Math.round(x - t), y0 + h + b - 1, t * 2, b + t / 2);
  ctx.fillStyle = '#2B3A2C'; ctx.fillText(text, Math.round(x), Math.round(y0 + h / 2) + 1);
}
function effects(ctx, cx, cy, k){
  const seen = W.data.seen || {}, t = W.t;
  /* 겨울 숲 눈 */
  const wx = 36 * TS, wy = 1 * TS, ww = 10 * TS, wh = 10 * TS;
  if(wx + ww >= cx && wy + wh >= cy && wx <= cx + W.vw && wy <= cy + W.vh){
    ctx.fillStyle = '#FFFFFF';
    for(let i = 0; i < 30; i++){
      const x = wx + ((hash(i, 0, 91) * ww + t * 0.004 * (1 + hash(i, 2, 93)) + Math.sin(t / 700 + i) * 4) % ww + ww) % ww;
      const y = wy + ((hash(i, 1, 92) * wh + t * 0.02 * (0.6 + hash(i, 3, 94))) % wh);
      ctx.fillRect(Math.round(x - cx) * k, Math.round(y - cy) * k, k, k);
    }
  }
  /* 샘물 반짝임 */
  if(seen.spring){
    for(let i = 0; i < 10; i++){
      const ph = ((t / 300) + i * 1.7) % 6; if(ph > 2) continue;
      const x = 41 * TS + 3 + hash(i, (t / 1800) | 0, 95) * 58, y = 25 * TS + 3 + hash(i, (t / 1800) | 0, 96) * 58;
      ctx.fillStyle = ph < 1 ? '#FFFFFF' : '#CFF0FB';
      const X = Math.round(x - cx) * k, Y = Math.round(y - cy) * k;
      ctx.fillRect(X, Y - k, k, k * 3); ctx.fillRect(X - k, Y, k * 3, k);
    }
  }
}

/* ═══════════ 돌리기 ═══════════ */
function loop(ts){
  W.raf = 0;
  if(!W.root || !W.root.isConnected || document.hidden){ netStop(true); return; }
  const dt = W.last ? Math.min(0.05, (ts - W.last) / 1000) : 0;
  W.last = ts; W.t = ts;
  update(dt); draw();
  W.raf = requestAnimationFrame(loop);
}
function startLoop(){ if(W.raf) return; W.last = 0; W.raf = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if(!document.hidden && W.root && W.root.isConnected){ startLoop(); netStart(); } });

/* ═══════════ 함께 걷기 ═══════════ */
const NET = {run:false, timer:0, busy:false, open:false, until:null, since:null, state:'idle', others:new Map(), dirty:false, fails:0, lastSent:0};
function netStart(){ if(NET.run || !W.me) return; NET.run = true; netLater(0); }
function netStop(leave){
  if(!NET.run) return;
  NET.run = false; clearTimeout(NET.timer);
  if(leave && NET.open) QO.api.worldLeave().catch(() => {});
  NET.others.clear(); NET.since = null; NET.open = false;
}
function netLater(ms){ clearTimeout(NET.timer); NET.timer = setTimeout(netTick, ms); }
function netSoon(){ if(NET.run && NET.open && !NET.busy){ const wait = Math.max(0, 450 - (Date.now() - NET.lastSent)); netLater(wait); } }
function flatTrail(){ const out = []; W.me.trail.forEach(p => { out.push(p[0], p[1]); }); return out; }
async function netTick(){
  if(!NET.run) return;
  if(NET.busy){ netLater(300); return; }
  NET.busy = true;
  const me = W.me;
  const st = {x:me.x, y:me.y, d:DIRS.indexOf(me.dir), n:me.n, path:flatTrail(), look:me.look, emo:me.emo, emo_n:me.emoN, say:me.say, say_n:me.sayN, since:NET.since};
  let next = TICK_OPEN;
  try{
    NET.lastSent = Date.now(); NET.dirty = false;
    const r = await QO.api.worldTick(st);
    NET.fails = 0;
    applyNet(r);
    next = NET.open ? TICK_OPEN : TICK_SHUT;
  }catch(e){
    NET.fails++;
    const msg = String((e && e.message) || e || '');
    if(/world_tick|function|schema cache|PGRST202|404/i.test(msg)){ NET.state = 'off'; NET.open = false; NET.others.clear(); next = TICK_OFF; }
    else{ NET.state = NET.fails >= 3 ? 'lost' : NET.state; next = Math.min(15000, 1500 * NET.fails); }
  }
  NET.busy = false;
  status();
  if(NET.run) netLater(next);
}
function applyNet(r){
  if(!r || !r.open){ NET.open = false; NET.state = 'shut'; NET.until = null; NET.since = null; NET.others.clear(); return; }
  NET.open = true; NET.state = 'open'; NET.until = r.until || null; NET.since = r.now || null;
  const keys = new Set((r.keys || []).map(Number));
  Array.from(NET.others.keys()).forEach(k => { if(!keys.has(k)) NET.others.delete(k); });
  (r.ps || []).forEach(upsert);
  keys.forEach(k => { if(!NET.others.has(k)) NET.since = null; });   // 모르는 사람이 있으면 다음에 다 받기
}
function upsert(a){
  if(!Array.isArray(a)) return;
  const k = Number(a[0]), x = a[1] | 0, y = a[2] | 0, d = DIRS[a[3]] || 'down', n = a[4] | 0, path = Array.isArray(a[5]) ? a[5] : [];
  const look = a[6] | 0, emo = a[7] | 0, emoN = a[8] | 0, say = a[9] | 0, sayN = a[10] | 0, name = a[11] || '';
  let o = NET.others.get(k);
  if(!o){ o = newAvatar(x, y, d, look, name); o.n = n; o.emoN = emoN; o.sayN = sayN; NET.others.set(k, o); return; }
  if(name) o.name = name;
  o.look = look; o.face = d;
  if(n < o.n){ place(o, x, y, d); }
  else if(n > o.n){
    const steps = []; for(let i = 0; i + 1 < path.length; i += 2) steps.push([path[i] | 0, path[i + 1] | 0]);
    const m = n - o.n, take = steps.slice(Math.max(0, steps.length - m));
    if(take.length < m && !(take.length && Math.abs(take[0][0] - o.x) + Math.abs(take[0][1] - o.y) <= 1)) place(o, x, y, d);
    else o.q = o.q.concat(take);
    if(o.q.length > 14){ o.q = []; place(o, x, y, d); }
  }else if(!o.moving && !o.q.length && (o.x !== x || o.y !== y)) place(o, x, y, d);
  o.n = n;
  if(emoN > o.emoN){ o.emoN = emoN; if(emo){ o.emo = emo; o.emoUntil = W.t + 3200; o.sayUntil = 0; } }
  else if(emoN < o.emoN) o.emoN = emoN;
  if(sayN > o.sayN){ o.sayN = sayN; if(say){ o.say = say; o.sayUntil = W.t + 3800; o.emoUntil = 0; } }
  else if(sayN < o.sayN) o.sayN = sayN;
}
function status(){
  if(!W.stEl) return;
  let t;
  if(NET.open) t = '함께 걷기 · 친구 ' + NET.others.size + '명';
  else if(NET.state === 'lost') t = '연결을 다시 잇는 중';
  else t = '혼자 걷는 중';
  if(W.stEl.textContent !== t) W.stEl.textContent = t;
  W.root.classList.toggle('net-open', !!NET.open);
}

/* ═══════════ 데이터 함수(진짜 · 흉내) ═══════════ */
async function rpcW(name, args){
  const c = await QO.sbClient();
  const r = await c.rpc(name, args || {});
  if(r.error){ const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; }
  return r.data;
}
QO.api.worldTick = function(p){ return rpcW('world_tick', {p_state:p}); };
QO.api.worldLeave = function(){ return rpcW('world_leave'); };
QO.api.worldStatus = function(g, c){ return rpcW('teacher_world_status', {p_grade:g, p_class:c}); };
QO.api.worldOpen = function(g, c, minutes){ return rpcW('teacher_world_open', {p_grade:g, p_class:c, p_minutes:minutes}); };
QO.api.worldClose = function(g, c){ return rpcW('teacher_world_close', {p_grade:g, p_class:c}); };

if(QO.mock){
  /* 흉내: 같은 브라우저의 다른 탭(다른 학생)끼리 localStorage 로 만나고, 반 친구 몇 명은 스스로 걷는다(시연·시험 아님 때만) */
  const WK = cfg.selftest ? 'qo2-world-mock-test' : 'qo2-world-mock-v1';   // 자동 시험은 시연 기록을 건드리지 않는다
  if(cfg.selftest) try{ localStorage.removeItem(WK); }catch(_){}
  const ld = () => { try{ const s = JSON.parse(localStorage.getItem(WK) || 'null'); if(s && s.open && s.ps) return s; }catch(_){} return {open:{}, ps:{}}; };
  const sv = s => { try{ localStorage.setItem(WK, JSON.stringify(s)); }catch(_){} };
  const nap = () => new Promise(r => setTimeout(r, cfg.selftest ? 10 : 40 + Math.random() * 80));
  const H = () => QO.mock.h;
  const BOTS = {list:null, ck:null};
  function bots(pr, realKeys){
    const ck = pr.grade + '-' + pr.class_no;
    if(BOTS.ck !== ck || !BOTS.list){
      BOTS.ck = ck;
      const mates = QO.mock.db.profiles.filter(p => p.grade === pr.grade && p.class_no === pr.class_no && p.id !== pr.id && p.number != null && !H().isTeacher(p.id)).slice(0, 6);
      BOTS.list = mates.map((p, i) => {
        const s = [[21 + i, 14], [26, 17], [22, 20], [18, 15], [29, 15], [24, 13]][i % 6];
        return {k:p.number, name:p.name, look:(p.number * 11 + 5) % LOOKS, x:s[0], y:s[1], d:0, n:0, trail:[[s[0], s[1]]], route:[], emo:0, emo_n:0, say:0, say_n:0, at:Date.now()};
      });
    }
    const now = Date.now();
    BOTS.list.forEach(b => {
      if(realKeys.has(b.k)) return;
      if(!W.world || !walkable(b.x, b.y)){ b.x = SPAWN[0]; b.y = SPAWN[1]; }
      let moved = false;
      if(Math.random() < .68){
        if(!b.route.length){
          let tx, ty, tries = 0;
          do{
            if(Math.random() < .25 && W.me){ tx = W.me.x + ((Math.random() * 5) | 0) - 2; ty = W.me.y + ((Math.random() * 5) | 0) - 2; }
            else{ tx = 11 + ((Math.random() * 26) | 0); ty = 10 + ((Math.random() * 26) | 0); }
            tries++;
          }while(!walkable(tx, ty) && tries < 20);
          if(walkable(tx, ty)){ const path = bfsFrom(b.x, b.y, tx, ty); if(path) b.route = path.slice(0, 18); }
        }
        const steps = Math.min(b.route.length, 5 + ((Math.random() * 2) | 0));
        for(let i = 0; i < steps; i++){
          const p = b.route.shift(), dx = p[0] - b.x, dy = p[1] - b.y;
          b.d = dy > 0 ? 0 : dx < 0 ? 1 : dx > 0 ? 2 : 3;
          b.x = p[0]; b.y = p[1]; b.n++; b.trail.push([b.x, b.y]); if(b.trail.length > 10) b.trail.shift();
          moved = true;
        }
      }
      if(Math.random() < .05){ b.emo = 1 + ((Math.random() * 6) | 0); b.emo_n++; moved = true; }
      else if(Math.random() < .035){ b.say = 1 + ((Math.random() * PHRASES.length) | 0); b.say_n++; moved = true; }
      if(moved) b.at = now;
    });
    return BOTS.list.filter(b => !realKeys.has(b.k));
  }
  function bfsFrom(sx, sy, tx, ty){
    const prev = new Int32Array(MW * MH).fill(-1), st = sy * MW + sx, q = [st]; prev[st] = st;
    for(let i = 0; i < q.length; i++){
      const c = q[i], x = c % MW, y = (c / MW) | 0;
      if(x === tx && y === ty){ const out = []; let k = c; while(k !== st){ out.push([k % MW, (k / MW) | 0]); k = prev[k]; } return out.reverse(); }
      for(const s of SIDES){ const nx = x + s[0], ny = y + s[1]; if(!walkable(nx, ny)) continue; const ni = ny * MW + nx; if(prev[ni] !== -1) continue; prev[ni] = c; q.push(ni); }
    }
    return null;
  }
  const arr = (r, name) => [r.k, r.x, r.y, r.d, r.n, (r.trail || []).reduce((a, p) => a.concat(p), []), r.look, r.emo, r.emo_n, r.say, r.say_n, name || r.name];
  const ckOf = (g, c) => g + '-' + c;
  QO.mock.api.worldTick = async function(p){
    await nap();
    const h = H(), uid = h.needMe(), pr = h.prof(uid);
    if(!pr || h.isTeacher(uid)) throw h.userErr('학생만 들어올 수 있어요');
    const ck = ckOf(pr.grade, pr.class_no), s = ld(), now = Date.now();
    if(s.open[ck] == null){ s.open[ck] = cfg.selftest ? 0 : now + 45 * 6e4; }
    if(!(s.open[ck] > now)){ delete s.ps[uid]; sv(s); return {open:false, until:null, now:new Date(now).toISOString(), ps:[], keys:[]}; }
    const prev = s.ps[uid];
    const st = {k:pr.number, ck:ck, name:pr.name, x:p.x | 0, y:p.y | 0, d:p.d | 0, n:p.n | 0, trail:[], look:p.look | 0, emo:p.emo | 0, emo_n:p.emo_n | 0, say:p.say | 0, say_n:p.say_n | 0, seen:now};
    const pa = Array.isArray(p.path) ? p.path.slice(-20) : []; for(let i = 0; i + 1 < pa.length; i += 2) st.trail.push([pa[i] | 0, pa[i + 1] | 0]);
    const changed = !prev || now - prev.seen > 15000 || ['x', 'y', 'd', 'n', 'look', 'emo_n', 'say_n'].some(k2 => prev[k2] !== st[k2]);
    st.at = changed ? now : prev.at;
    s.ps[uid] = st;
    Object.keys(s.ps).forEach(u => { if(now - s.ps[u].seen > 60000) delete s.ps[u]; });
    sv(s);
    const since = p.since ? Date.parse(p.since) - 2000 : 0;
    const real = Object.keys(s.ps).filter(u => u !== uid && s.ps[u].ck === ck && now - s.ps[u].seen < 15000).map(u => s.ps[u]);
    const realKeys = new Set(real.map(r => r.k)); realKeys.add(pr.number);
    const bs = cfg.selftest ? [] : bots(pr, realKeys);
    const all = real.concat(bs);
    return {open:true, until:new Date(s.open[ck]).toISOString(), now:new Date(now).toISOString(),
      ps:all.filter(r => r.at > since).map(r => arr(r)), keys:all.map(r => r.k)};
  };
  QO.mock.api.worldLeave = async function(){
    await nap();
    const uid = H().me(); if(!uid) return true;
    const s = ld(); delete s.ps[uid]; sv(s); return true;
  };
  const needT = () => { const h = H(), uid = h.needMe(); if(!h.isTeacher(uid)) throw h.userErr('선생님만 할 수 있어요'); };
  QO.mock.api.worldStatus = async function(g, c){
    await nap(); needT();
    const s = ld(), now = Date.now(), ck = ckOf(g, c), until = s.open[ck] > now ? s.open[ck] : null;
    return {open:!!until, until:until ? new Date(until).toISOString() : null, people:Object.values(s.ps).filter(r => r.ck === ck && now - r.seen < 15000).length};
  };
  QO.mock.api.worldOpen = async function(g, c, minutes){
    await nap(); needT();
    const m = Math.max(5, Math.min(120, Number(minutes) || 45)), s = ld(); s.open[ckOf(g, c)] = Date.now() + m * 6e4; sv(s);
    return {open:true, until:new Date(s.open[ckOf(g, c)]).toISOString(), people:0};
  };
  QO.mock.api.worldClose = async function(g, c){
    await nap(); needT();
    const s = ld(), ck = ckOf(g, c); s.open[ck] = 0; Object.keys(s.ps).forEach(u => { if(s.ps[u].ck === ck) delete s.ps[u]; }); sv(s);
    return {open:false, until:null, people:0};
  };
}

/* ═══════════ 밖으로 ═══════════ */
QO.world = {
  mount:mount,
  /* 깃발·친구 나무 단추를 누르면 그 나무 앞으로 걸어간다(카드는 tree.js 가 연다) */
  walkToFlag(qid){ if(!W.world) return; const f = (W.data.flags || []).find(x => x.id === qid); const a = f && findFlagAct(f.slot); if(a) goToAct(a, false); },
  walkToTree(n){ if(!W.world) return; const a = findTreeAct(n); if(a) goToAct(a, false); },
  /* 시험용 */
  _overview(){
    if(!W.world) return null;
    const c = document.createElement('canvas'); c.width = MW * TS; c.height = MH * TS;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(W.ground[0], 0, 0);
    W.world.objs.slice().sort((a, b) => a.base - b.base).forEach(o => x.drawImage(o.s.c, Math.round(o.x), Math.round(o.y)));
    (W.data.flags || []).forEach(f => { const tr = W.flagTree[f.slot]; if(!tr) return; const s = f.sent ? sentSpr() : flagSpr(0); x.drawImage(s.c, tr.x + 30 - s.fx, tr.base - 2 - s.fy - (f.sent ? 18 : 0)); });
    return c;
  },
  _w:W, _net:NET, _walkable:walkable, _interact:interact, _press:pressAct, _tap:tapAt, _plotAt:plotAt, MW:MW, MH:MH
};
QO.bus.on('tab:show', id => { if(id !== 'forest'){ netStop(true); closePops(); } });
QO.bus.on('ready', () => { netStop(true); W.me = null; W.uid = null; if(W.dlg) hideDlg(); });

/* ═══════════ 스스로 시험(학생 화면) ═══════════ */
if(!QO.selftest || cfg.page !== 'student') return;
const add = QO.selftest.add;
const worldReady = t => t.waitFor(() => W.root && W.root.isConnected && W.world && document.querySelector('#body .tr-places[data-ready]'));
add('숲 · 걷기·막힌 곳·살펴보기(표지판·잠긴 다리)', async t => {
  await t.click('#nav [data-t="forest"]');
  await worldReady(t);
  t.expect(walkable(SPAWN[0], SPAWN[1]), '시작 자리는 걸을 수 있음');
  t.expect(!walkable(8, 15), '다리가 열리기 전에는 강을 못 건넘');
  t.expect(!walkable(23, 8), '관측소 문이 잠겨 있으면 계단을 못 오름');
  t.expect(walkable(41, 22), '샘물이 열렸으면 바위가 없음');
  /* 광장에서 서쪽 다리 표지판 앞까지 길 찾기 → 살펴보기 */
  const sign = W.world.act.get(14 * MW + 10);
  t.expect(sign && sign.k === 'place' && sign.p === 'bridge', '다리 표지판 자리');
  place(W.me, 11, 14, 'left'); W.route = null; W.pend = null;
  pressAct();
  await t.waitFor(() => W.dlg === 'text' && /다리/.test(W.dlgIn.textContent) && /열려요/.test(W.dlgIn.textContent));
  pressAct();
  t.expect(!W.dlg, '한 번 더 누르면 닫힘');
  /* 깃발 숲 나무에서 살펴보기 → 단서 카드(tree.js) */
  const f = (W.data.flags || []).find(x => !x.sent);
  t.expect(f, '단서를 아직 안 보낸 깃발');
  t.expect(goToAct(findFlagAct(f.slot), true), '깃발 나무까지 길이 있음');
  for(let i = 0; i < 400 && W.route; i++) update(0.05);   // 화면이 가려져도(rAF 멈춤) 걸음은 직접 흘려서
  await t.waitFor(() => document.querySelector('#body .wd-in #tr-fq[data-q="' + f.id + '"]'), 3000);
  t.expect(document.querySelector('#body .wd-dlg:not([hidden]) #tr-fq'), '카드는 숲 안 대화 상자에');
  await t.click('#body .wd [data-wd="close"]');
  await t.waitFor(() => !document.querySelector('#body #tr-fq'));
  /* 우리 반 과수원: 반 친구 나무 + 내 나무가 번호 자리에 */
  await t.waitFor(() => (W.data.trees || []).some(x => x.me));
  const mine = W.data.trees.find(x => x.me), p = plotAt(mine.n);
  t.eq(W.world.act.get((p[1] + 1) * MW + p[0]).k, 'tree', '내 번호 자리에 내 나무');
});
add('숲 · 함께 걷기(선생님이 열면 같은 반만, 닫으면 혼자)', async t => {
  t.as('A');
  let r = await t.api.worldTick({x:23, y:17, d:0, n:0, path:[23, 17], look:1, emo:0, emo_n:0, say:0, say_n:0, since:null});
  t.eq(r.open, false, '열기 전에는 닫힘');
  await t.rejects(() => t.api.worldOpen(2, 11, 20), '선생님만 할 수 있어요');
  t.as('T'); r = await t.api.worldOpen(2, 11, 20); t.eq(r.open, true, '선생님이 엶');
  t.as('B'); await t.api.worldTick({x:25, y:18, d:0, n:0, path:[25, 18], look:7, emo:1, emo_n:1, say:0, say_n:0, since:null});
  t.as('A'); r = await t.api.worldTick({x:23, y:17, d:0, n:0, path:[23, 17], look:1, emo:0, emo_n:0, say:0, say_n:0, since:null});
  t.eq(r.ps.map(x => [x[0], x[1], x[2], x[11]]), [[2, 25, 18, '나래']], '가람에게 나래(2번)가 보임');
  t.as('E'); r = await t.api.worldTick({x:23, y:17, d:0, n:0, path:[], look:0, emo:0, emo_n:0, say:0, say_n:0, since:null});
  t.eq(r.open, false, '다른 반은 닫힘');
  t.as('T'); r = await t.api.worldClose(2, 11); t.eq(r.open, false, '선생님이 닫음');
  t.as('A'); r = await t.api.worldTick({x:23, y:17, d:0, n:0, path:[], look:0, emo:0, emo_n:0, say:0, say_n:0, since:null});
  t.eq(r.open, false, '닫힌 뒤 혼자');
  /* 화면: 들어오면 상태 띠가 「혼자 걷는 중」 */
  await t.loginAs('A');
  await t.click('#nav [data-t="forest"]');
  await worldReady(t);
  await t.waitFor(() => /혼자 걷는 중/.test(W.stEl.textContent));
});
})();
