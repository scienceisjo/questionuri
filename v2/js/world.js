/* 우리 반 숲 — 걸어 다니는 도트 세계(world 모듈, 2026-11-04).
   tree.js 의 숲 탭이 QO.world.mount(자리, 자료) 로 붙인다. 이 파일은 그림·걷기·함께 걷기만 맡고, 단서·물 주기 카드는 tree.js 가 만든다.
   · 그림은 전부 이 파일이 점으로 찍는다(AI 그림·다른 게임 그림 없음). 이름표·말풍선 글꼴은 갈무리11(OFL).
   · 반 친구 나무(classmate_trees)는 번호 순서로 과수원 자리에 선다. 막힘 깃발은 이름 없는 깃발 숲(8그루)에만 선다(나무 주인이 드러나지 않게).
   · 장소 넷(샘물·다리·관측소·겨울 숲)은 열리기 전에는 막혀 있고(바위·부서진 다리·잠긴 문·얼음), 열리면 걸어 들어갈 수 있다.
   · 함께 걷기: 선생님이 반마다 열면 1.2초마다 worldTick 한 번(내 자리를 보내고 반 친구 자리를 받는다). 이름은 서버가 붙인다.
     Supabase 실시간 채널은 받는 사람 수만큼 메시지가 세어져(무료 초당 100·한 달 200만) 30명이면 곧바로 넘으므로 쓰지 않는다.
   · 말은 정해진 말 여섯과 그림 반응 여섯뿐(자유 채팅 없음).
   · 2026-11-13: 한 화면 칸 수를 늘림(좁은 화면 약 17~18 · 중간 약 21 · 넓은 화면 약 25, 정수 배율이 안 맞으면 큰 정수로 그린 뒤 줄여 붙임),
     과수원 울타리(둘레 + 나무 사이 토막, 문은 가운데 길)·갈아 놓은 흙, 분수·가로등·텃밭·소풍 자리·들판 꾸밈·나비,
     선생님 숲 방문(QO.state.visit) 때 내 아바타는 선생님 그림, 함께 걷기에서 번호 0 이하는 선생님. */
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
/* 빈 칸에만 찍기(그림자를 나중에 깔 때) */
PB.prototype.u = function(x, y, c){ x = Math.round(x); y = Math.round(y); if(x >= 0 && y >= 0 && x < this.w && y < this.h && !(this.d[y * this.w + x] >>> 24)) this.d[y * this.w + x] = c; };
/* 타원 채우기 */
PB.prototype.e = function(cx, cy, rx, ry, c){
  for(let y = Math.floor(cy - ry); y <= cy + ry; y++) for(let x = Math.floor(cx - rx); x <= cx + rx; x++){
    const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if(dx * dx + dy * dy <= 1) this.p(x, y, c);
  }
};
/* 테두리 — 불투명 칸 중 투명 칸과 맞닿은 칸을 진하게 */
PB.prototype.ol = function(c){
  const w = this.w, h = this.h, d = this.d, src = d.slice(), op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (src[y * w + x] >>> 24) > 200;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) if(op(x, y) && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) d[y * w + x] = c;
};
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
function shadowU(pb, cx, cy, rx, ry, a){
  const c = c32('#1E3A1E', a == null ? .26 : a);
  for(let y = -ry; y <= ry; y++) for(let x = -rx; x <= rx; x++) if((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) pb.u(cx + x, cy + y, c);
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
  /* 흙길 변화: 자갈 몇 개 · 바퀴 자국처럼 옅은 띠 */
  if(kind === 'p'){
    const n = hash(tx, ty, 34) < .45 ? 1 + ((hash(tx, ty, 35) * 3) | 0) : 0;
    for(let m = 0; m < n; m++){
      const sx = ox + 3 + ((hash(tx, ty, 36 + m) * 10) | 0), sy = oy + 3 + ((hash(tx, ty, 39 + m) * 10) | 0);
      pb.p(sx, sy, c32('#A89A84')); pb.p(sx + 1, sy, c32('#C9BCA6')); pb.p(sx, sy + 1, c32('#8E8070')); pb.p(sx + 1, sy + 1, c32('#A89A84'));
    }
    if(hash(tx, ty, 44) < .3){ const sy = oy + 4 + ((hash(tx, ty, 45) * 8) | 0); for(let i = 2; i < 14; i++) if(hash(ox + i, sy, 46) < .7) pb.p(ox + i, sy, l); }
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
/* 바닥에 바로 그리는 것들(밟고 지나가도 되는 납작한 그림) */
function soilPatch(pb, cx, cy, hw, hh){
  /* 갈아 놓은 흙: 둥근 둔덕 + 흙 부스러기(가장자리는 풀과 섞인다) */
  for(let y = -hh; y <= hh; y++) for(let x = -hw; x <= hw; x++){
    const dx = (x + .5) / (hw + .5), dy = (y + .5) / (hh + .5), d = dx * dx + dy * dy;
    if(d > 1) continue;
    const r = hash(cx + x, cy + y, 47);
    if(d > .82 && r < .35) continue;
    let c = d > .78 ? '#6E4528' : (dy < -.35 && dx < .3) ? '#A8764C' : dy > .45 ? '#7A4E2E' : '#8E5E3A';
    if(d <= .78){ if(r < .1) c = '#5E3A20'; else if(r > .92) c = '#C08D5E'; }
    if(d <= .6 && (y === -1 || y === 2) && ((x + y * 3) % 4 === 0)) c = '#6E4528';
    pb.p(cx + x, cy + y, c32(c));
  }
}
function bedRow(pb, x0, y0, w){
  /* 텃밭 이랑(가로로 긴 흙 두둑) — 위는 밝고 아래는 그늘, 흙 부스러기 */
  for(let y = 0; y < 11; y++) for(let x = 0; x < w; x++){
    const ex = Math.min(x, w - 1 - x), r = hash(x0 + x, y0 + y, 49);
    if(ex === 0 && (y < 2 || y > 8)) continue;
    if(ex === 1 && (y === 0 || y === 10)) continue;
    let c = (y === 0 || y === 10 || ex === 0) ? '#5E3A20' : y < 3 ? '#A8764C' : y > 7 ? '#6E4528' : '#8E5E3A';
    if(y > 0 && y < 10 && ex > 0){ if(r < .08) c = '#5E3A20'; else if(r > .93) c = '#C08D5E'; }
    pb.p(x0 + x, y0 + y, c32(c));
  }
  for(let x = 1; x < w - 1; x++) pb.p(x0 + x, y0 + 11, c32('#1E3A1E', .22));
}
function blanket(pb, x0, y0, w, h){
  /* 소풍 돗자리(빨강·흰 체크) */
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const a = ((x >> 2) & 1), b = ((y >> 2) & 1);
    let c = a && b ? '#C9413A' : a || b ? '#E98A80' : '#FFF4EC';
    if(x === 0 || y === 0 || x === w - 1 || y === h - 1) c = '#8E2A26';
    pb.p(x0 + x, y0 + y, c32(c));
  }
  for(let x = 1; x < w - 1; x += 2){ pb.p(x0 + x, y0 + h, c32('#E98A80')); }
  for(let x = 0; x < w; x++) pb.p(x0 + x, y0 + h + 1, c32('#1E3A1E', .22));
}
function lilyPad(pb, cx, cy, r, flower){
  const D = c32('#2F7A3B'), M = c32('#4FA04A'), L = c32('#7CC46A');
  for(let y = -r; y <= r; y++) for(let x = -r - 1; x <= r + 1; x++){
    const dx = x / (r + 1.2), dy = y / r; if(dx * dx + dy * dy > 1) continue;
    if(x > 0 && Math.abs(y) <= (x > r * .5 ? 1 : 0) && y <= 0) continue;   // 갈라진 틈
    pb.p(cx + x, cy + y, (dx * dx + dy * dy > .62) ? D : (x + y < -1 ? L : M));
  }
  for(let x = -r; x <= r; x++) pb.p(cx + x, cy + r + 1, c32('#3D8CC4'));
  if(flower){ pb.p(cx - 1, cy - 1, c32('#F7A8C8')); pb.p(cx, cy - 2, c32('#FBD3E3')); pb.p(cx + 1, cy - 1, c32('#F7A8C8')); pb.p(cx, cy - 1, c32('#FFE07A')); pb.p(cx, cy, c32('#E27AA6')); }
}
function riverStone(pb, cx, cy, rx, ry){
  for(let y = -ry; y <= ry; y++) for(let x = -rx; x <= rx; x++){
    const dx = (x + .5) / rx, dy = (y + .5) / ry; if(dx * dx + dy * dy > 1) continue;
    pb.p(cx + x, cy + y, c32(dx * dx + dy * dy > .6 ? '#5E676E' : (y < 0 && x < 1) ? '#C9CED2' : '#959DA4'));
  }
  for(let x = -rx; x <= rx; x++) if(hash(cx + x, cy, 48) < .8) pb.p(cx + x, cy + ry + 1, c32('#E2F5FC'));
}
function paintDeco(pb, d, fr){
  if(d.k === 'soil') soilPatch(pb, d.x, d.y, d.w, d.h);
  else if(d.k === 'bed') bedRow(pb, d.x, d.y, d.w);
  else if(d.k === 'blanket') blanket(pb, d.x, d.y, d.w, d.h);
  else if(d.k === 'lily') lilyPad(pb, d.x + (fr && d.drift ? 1 : 0), d.y, d.r, d.fl);
  else if(d.k === 'stone') riverStone(pb, d.x, d.y, d.rx, d.ry);
}
function groundCanvas(G, fr, seen, deco){
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
  (deco || []).forEach(d => paintDeco(pb, d, fr));
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
/* ─── 꾸밈 그림(2026-11-13): 울타리 · 분수 · 가로등 · 과수원 살림 · 들판 ─── */
const WD = {o:'#4A3220', l:'#E0B074', m:'#C68E57', d:'#9C6B3A', k:'#6B4224', h:'#F2CC94'};
/* 울타리 한 칸. m: 1 위 · 2 아래 · 4 왼 · 8 오른 으로 이어짐 */
function fenceSpr(m){
  return spr('fen|' + m, 16, 17, 8, 14, pb => {
    const O = c32(WD.o), L = c32(WD.l), M = c32(WD.m), D = c32(WD.k), H = c32(WD.h), sh = c32('#1E3A1E', .24);
    const x0 = (m & 4) ? 0 : 7, x1 = (m & 8) ? 15 : 8;
    if(m & 1) for(let y = 0; y <= 8; y++){ pb.p(7, y, L); pb.p(8, y, D); pb.p(9, y, sh); }
    if(m & 2) for(let y = 8; y <= 15; y++){ pb.p(7, y, L); pb.p(8, y, D); pb.p(9, y, sh); }
    if(m & 12) for(let x = x0; x <= x1; x++){
      pb.p(x, 7, O); pb.p(x, 8, L); pb.p(x, 9, D);
      pb.p(x, 11, O); pb.p(x, 12, L); pb.p(x, 13, D);
    }
    /* 기둥 */
    pb.r(6, 5, 4, 10, O); pb.r(7, 6, 1, 8, L); pb.r(8, 6, 1, 8, M); pb.p(7, 6, H); pb.p(8, 13, D);
    if(m & 12) for(let x = x0; x <= x1; x++){ pb.u(x + 1, 14, sh); pb.u(x + 1, 15, sh); }
    shadowU(pb, 8, 15, 3, 1, .24);
  });
}
/* 나무와 나무 사이 울타리 토막(양쪽 나무 줄기까지 난간이 닿는다) */
function fenceGapSpr(eL, eR){
  return spr('fgap|' + eL + '|' + eR, 16 + eL + eR, 17, 8 + eL, 14, pb => {
    const O = c32(WD.o), L = c32(WD.l), M = c32(WD.m), D = c32(WD.k), H = c32(WD.h), sh = c32('#1E3A1E', .24);
    const w = 16 + eL + eR;
    for(let x = 0; x < w; x++){ pb.p(x, 7, O); pb.p(x, 8, L); pb.p(x, 9, D); pb.p(x, 11, O); pb.p(x, 12, L); pb.p(x, 13, D); }
    [eL + 1, eL + 11].forEach(px => { pb.r(px, 5, 4, 10, O); pb.p(px + 1, 6, H); pb.r(px + 1, 7, 1, 7, L); pb.r(px + 2, 6, 1, 8, M); });
    for(let x = 0; x < w; x++){ pb.u(x + 1, 14, sh); pb.u(x + 1, 15, sh); }
  });
}
/* 과수원 문(기둥 둘 + 가로대 + 사과 표시). 22·25 칸에 기둥 */
function orchardGateSpr(){
  return spr('ogate', 64, 34, 32, 30, pb => {
    const O = c32(WD.o), L = c32(WD.l), M = c32(WD.m), D = c32(WD.d), K2 = c32(WD.k), H = c32(WD.h);
    [5, 53].forEach(px => {
      pb.r(px, 5, 6, 26, O); pb.r(px + 1, 6, 1, 24, L); pb.r(px + 2, 6, 2, 24, M); pb.r(px + 4, 6, 1, 24, D);
      pb.r(px - 1, 3, 8, 3, O); pb.r(px, 4, 6, 1, H);
      for(let y = 9; y < 30; y += 6) pb.p(px + 2, y, K2);
    });
    pb.r(1, 7, 62, 5, O); pb.r(2, 8, 60, 1, H); pb.r(2, 9, 60, 1, M); pb.r(2, 10, 60, 1, D);
    /* 가운데 둥근 판 + 사과 */
    pb.e(32, 9.5, 7.5, 6.5, O); pb.e(32, 9.5, 6.5, 5.5, c32('#F3DDAE'));
    pb.e(32, 10.5, 3.2, 3, c32('#D93B30')); pb.p(31, 9, c32('#FF9A8A')); pb.p(33, 12, c32('#A8261F'));
    pb.p(32, 6, c32('#6B4224')); pb.p(33, 6, c32('#4FA84A')); pb.p(34, 5, c32('#4FA84A'));
    shadowU(pb, 8, 31, 5, 1); shadowU(pb, 56, 31, 5, 1);
  });
}
function lampSpr(){
  return spr('lamp', 16, 32, 8, 30, pb => {
    const O = c32('#2A2633'), M = c32('#4E565E'), L = c32('#7D868F');
    pb.r(5, 26, 6, 5, O); pb.r(6, 27, 4, 3, M); pb.p(6, 27, L);
    pb.r(6, 10, 4, 17, O); pb.r(7, 10, 1, 16, L); pb.r(8, 10, 1, 16, M);
    pb.r(4, 9, 8, 2, O);
    pb.r(4, 3, 8, 7, O); pb.r(5, 4, 6, 5, c32('#FFE48A')); pb.r(6, 5, 2, 2, c32('#FFF8D8')); pb.p(9, 7, c32('#F2C230'));
    pb.r(3, 2, 10, 2, O); pb.r(5, 1, 6, 1, O); pb.r(7, 0, 2, 1, O); pb.r(4, 2, 8, 1, M);
    shadowU(pb, 8, 30, 5, 1);
  });
}
/* 분수(물 두 장면) */
function fountainSpr(fr){
  return spr('fount|' + fr, 40, 44, 20, 41, pb => {
    const cx = 20, cy = 27, RX = 17, RY = 9;
    for(let t = 5; t >= 1; t--) pb.e(cx, cy + t, RX, RY, c32(t > 3 ? '#9E968A' : '#B9B1A3'));
    for(let x = 0; x < 40; x++) for(let y = cy; y < 44; y++) if(pb.a(x, y) && ((x + (y > cy + 7 ? 3 : 0)) % 7 === 0) && y > cy + 2) pb.p(x, y, c32('#8E8678'));
    pb.e(cx, cy, RX, RY, c32('#E6E0D2'));
    pb.e(cx, cy + .5, RX - 2.5, RY - 2.2, c32('#CFC7B6'));
    pb.e(cx, cy + 1, RX - 3.5, RY - 3.2, c32('#4CA2D8'));
    for(let i = 0; i < 9; i++){
      const a = (i / 9) * 6.28 + fr * .35, r1 = 5 + (i % 3) * 3;
      const x = Math.round(cx + Math.cos(a) * r1 * 1.6), y = Math.round(cy + 1 + Math.sin(a) * r1 * .55);
      if(pb.a(x, y) && pb.a(x + 2, y)){ pb.p(x, y, c32('#9ED8F4')); pb.p(x + 1, y, c32('#9ED8F4')); }
    }
    /* 가운데 기둥 · 위 그릇 */
    pb.r(17, 12, 7, 16, c32('#B9B1A3')); pb.r(17, 12, 2, 16, c32('#E6E0D2')); pb.r(22, 12, 2, 16, c32('#9E968A'));
    pb.e(cx, 12, 8, 3.2, c32('#E6E0D2')); pb.e(cx, 12.5, 6, 2, c32('#4CA2D8'));
    /* 물줄기 */
    const W1 = c32('#E2F5FC'), W2 = c32('#9ED8F4');
    for(let y = 2; y <= 11; y++){ pb.p(19, y, W2); pb.p(20, y, W1); pb.p(21, y, W2); }
    pb.r(18, 1, 5, 2, W1);
    pb.ol(c32('#5E5A52'));
    for(let s = -1; s <= 1; s += 2) for(let i = 0; i <= 12; i++){
      const x = cx + s * (2 + i * .55 + i * i * .02), y = 2 + i * 0.5 + i * i * .085;
      pb.p(x, y, ((i + fr) & 1) ? W2 : W1);
    }
    for(let s = -1; s <= 1; s += 2) for(let i = 0; i <= 9; i++){
      const x = cx + s * (8 + i * .25), y = 13 + i * 1.3;
      if(((i + fr) % 3) !== 0) pb.p(x, y, i & 1 ? W2 : W1);
    }
    /* 물 위 반짝임(테두리 뒤에) */
    [[12, 27], [27, 29], [16, 31], [24, 25]].forEach((p, i) => { if(((i + fr) & 1) === 0){ pb.p(p[0], p[1], c32('#FFFFFF')); pb.p(p[0] + 1, p[1], c32('#E2F5FC')); } });
    shadowU(pb, cx, 40, 19, 3);
  });
}
function potSpr(v){
  return spr('pot|' + v, 16, 18, 8, 16, pb => {
    blob(pb, [[8, 7, 5], [4.5, 9, 3.5], [11.5, 9, 3.5]], BUSH);
    const fc = [['#F7A8C8', '#FBD3E3'], ['#FFE07A', '#FFF3B8'], ['#FF9C8A', '#FFD0C6']][v % 3];
    [[6, 5], [10, 6], [8, 9], [4, 8], [12, 9]].forEach((p, i) => { if(i < 4 || v){ pb.p(p[0], p[1], c32(fc[0])); pb.p(p[0], p[1] - 1, c32(fc[1])); } });
    const O = c32('#5E2E1A');
    for(let y = 11; y <= 16; y++){
      const hw = y === 11 ? 6 : 5 - (y > 14 ? 1 : 0);
      for(let x = -hw; x <= hw; x++) pb.p(8 + x, y, Math.abs(x) === hw || y === 16 ? O : c32(y === 12 ? '#E8955E' : x < -1 ? '#D9804A' : x > 2 ? '#A85530' : '#C96B3C'));
    }
    pb.r(2, 11, 13, 1, O); pb.r(3, 12, 11, 1, c32('#E8955E'));
    shadowU(pb, 8, 16, 6, 1);
  });
}
function appleAt(pb, x, y){
  pb.r(x - 1, y - 1, 3, 3, c32('#D93B30')); pb.p(x - 1, y - 1, c32('#FF9A8A')); pb.p(x + 1, y + 1, c32('#A8261F'));
}
function crateSpr(v){
  return spr('crate|' + v, 16, 17, 8, 15, pb => {
    const O = c32(WD.o);
    pb.r(1, 4, 14, 3, O); pb.r(2, 5, 12, 2, c32('#5E3B1E'));
    if(v !== 2) [[3, 5], [6, 4], [9, 5], [12, 4], [4.5, 3], [10.5, 3], [7.5, 2]].forEach((p, i) => { if(v === 1 && i > 3) return; appleAt(pb, Math.round(p[0]), Math.round(p[1])); });
    pb.r(1, 7, 14, 9, O);
    for(let y = 8; y < 15; y++) for(let x = 2; x < 14; x++) pb.p(x, y, c32(y === 11 ? WD.k : y === 8 || y === 12 ? WD.l : (x === 2 || x === 13) ? WD.d : WD.m));
    shadowU(pb, 8, 16, 7, 1);
  });
}
function basketSpr(cloth){
  return spr('basket|' + (cloth ? 1 : 0), 16, 16, 8, 14, pb => {
    const O = c32('#5E3B1E');
    for(let t = 0; t <= 6; t++){ const a = Math.PI * t / 6; pb.p(Math.round(8 - Math.cos(a) * 5.5), Math.round(6 - Math.sin(a) * 5), O); }
    if(cloth){ pb.r(3, 6, 10, 3, c32('#FFF4EC')); pb.r(3, 6, 2, 3, c32('#C9413A')); pb.r(7, 6, 2, 3, c32('#C9413A')); pb.r(11, 6, 2, 3, c32('#C9413A')); }
    else [[5, 7], [8, 6], [11, 7]].forEach(p => appleAt(pb, p[0], p[1]));
    for(let y = 8; y <= 14; y++){
      const hw = y < 10 ? 6 : y < 13 ? 5 : 4;
      for(let x = -hw; x <= hw; x++) pb.p(8 + x, y, Math.abs(x) === hw || y === 14 || y === 8 ? O : c32(((x + y) & 1) ? '#D4A15E' : '#B5823F'));
    }
    shadowU(pb, 8, 14, 6, 1);
  });
}
function cartSpr(){
  return spr('cart', 34, 26, 17, 23, pb => {
    const O = c32(WD.o);
    /* 사과 더미 */
    [[9, 7], [12, 6], [15, 7], [18, 6], [21, 7], [24, 6], [27, 7], [11, 4], [14, 3], [17, 4], [20, 3], [23, 4], [16, 1], [19, 1]].forEach(p => appleAt(pb, p[0], p[1] + 2));
    pb.r(6, 9, 25, 9, O);
    for(let y = 10; y < 17; y++) for(let x = 7; x < 30; x++) pb.p(x, y, c32(y === 13 ? WD.k : y === 10 || y === 14 ? WD.l : (x % 6 === 1) ? WD.d : WD.m));
    /* 손잡이 */
    pb.r(0, 11, 7, 2, O); pb.r(1, 11, 5, 1, c32(WD.l)); pb.r(0, 10, 2, 4, O);
    /* 바퀴 */
    [11, 25].forEach(wx => {
      pb.e(wx, 19.5, 4.5, 4.5, O); pb.e(wx, 19.5, 3.4, 3.4, c32('#8A5A34')); pb.e(wx, 19.5, 1.6, 1.6, c32(WD.l));
      pb.p(wx, 16, O); pb.p(wx, 23, O); pb.p(wx - 3, 19, O); pb.p(wx + 3, 20, O);
    });
    shadowU(pb, 18, 24, 14, 2);
  });
}
function haySpr(){
  return spr('hay', 16, 16, 8, 14, pb => {
    const O = c32('#7A5A1E');
    pb.r(1, 3, 14, 12, O);
    for(let y = 4; y < 14; y++) for(let x = 2; x < 14; x++){
      let c = y < 7 ? (hash(x, y, 150) < .3 ? '#FFF0B0' : '#F2D77E') : (hash(x, y, 151) < .3 ? '#C9A040' : hash(x, y, 152) < .2 ? '#F2D77E' : '#E2BE5C');
      if(x === 4 || x === 11) c = '#8C5E2E';
      pb.p(x, y, c32(c));
    }
    pb.r(2, 7, 12, 1, c32('#C9A040'));
    [[0, 6], [15, 9], [3, 2], [12, 2]].forEach(p => pb.p(p[0], p[1], c32('#E2BE5C')));
    shadowU(pb, 8, 15, 7, 1);
  });
}
function scarecrowSpr(){
  return spr('scare', 20, 32, 10, 30, pb => {
    const O = c32('#3A2A1A');
    pb.r(9, 12, 2, 19, O); pb.p(9, 14, c32(WD.m));
    pb.r(1, 13, 18, 3, O); pb.r(2, 14, 16, 1, c32(WD.m));
    /* 옷 */
    pb.r(5, 12, 10, 10, O); pb.r(6, 13, 8, 8, c32('#3E6FB0')); pb.r(6, 13, 2, 8, c32('#5C8CD0'));
    pb.r(10, 16, 3, 3, c32('#D2483C')); pb.p(11, 17, c32('#F08A7A'));
    pb.r(2, 13, 4, 3, O); pb.r(3, 14, 3, 1, c32('#3E6FB0')); pb.r(14, 13, 4, 3, O); pb.r(14, 14, 3, 1, c32('#3E6FB0'));
    [[0, 13], [0, 15], [1, 16], [19, 13], [19, 15], [18, 16], [7, 22], [9, 22], [12, 22]].forEach(p => pb.p(p[0], p[1], c32('#E2BE5C')));
    /* 얼굴 · 모자 */
    pb.e(10, 8.5, 4, 3.8, O); pb.e(10, 8.5, 3, 2.8, c32('#E8D3A0'));
    pb.p(8, 8, c32('#3A2A1A')); pb.p(12, 8, c32('#3A2A1A')); pb.r(8, 10, 5, 1, c32('#B08A50'));
    pb.r(3, 5, 14, 2, O); pb.r(4, 5, 12, 1, c32('#F0CF74'));
    pb.r(6, 1, 8, 5, O); pb.r(7, 2, 6, 3, c32('#D4A94D')); pb.r(7, 4, 6, 1, c32('#D2483C'));
    shadowU(pb, 10, 30, 5, 1);
  });
}
function logSpr(){
  return spr('log', 32, 16, 16, 14, pb => {
    pb.e(16, 8.5, 13.5, 5, c32('#8A5A34'));
    pb.r(5, 4, 23, 10, c32('#8A5A34'));
    for(let x = 5; x < 29; x++){ pb.p(x, 5, c32('#A8744A')); pb.p(x, 6, c32(hash(x, 6, 152) < .5 ? '#A8744A' : '#8A5A34')); if(hash(x, 9, 153) < .3) pb.p(x, 9, c32('#6B4224')); if(hash(x, 11, 154) < .4) pb.p(x, 11, c32('#6B4224')); }
    pb.ol(c32('#3E2614'));
    pb.e(5, 9, 3.2, 5, c32('#3E2614')); pb.e(5, 9, 2.4, 4.1, c32('#E0B074')); pb.e(5, 9, 1.2, 2.2, c32('#C68E57')); pb.p(5, 9, c32('#9C6B3A'));
    pb.p(18, 3, c32('#4FA84A')); pb.p(19, 2, c32('#7ED36F')); pb.p(19, 3, c32('#4FA84A'));
    shadowU(pb, 16, 14, 14, 2);
  });
}
function stumpSpr(){
  return spr('stump', 16, 15, 8, 13, pb => {
    pb.r(3, 6, 10, 7, c32('#8A5A34')); pb.r(3, 6, 3, 7, c32('#A8744A')); pb.r(11, 6, 2, 7, c32('#6B4224'));
    pb.r(1, 11, 3, 2, c32('#8A5A34')); pb.r(12, 11, 3, 2, c32('#6B4224'));
    pb.e(8, 6, 5.5, 2.6, c32('#E0B074')); pb.e(8, 6, 3.4, 1.5, c32('#C68E57')); pb.p(8, 6, c32('#E0B074'));
    pb.ol(c32('#3E2614'));
    shadowU(pb, 8, 13, 7, 1);
  });
}
function mushSpr(v){
  return spr('mush|' + v, 16, 12, 8, 11, pb => {
    const cap = v ? ['#C98A3E', '#E8B060'] : ['#D24B3E', '#F07A6A'];
    [[5, 7, 3], [10, 8, 2.4], [8, 4.5, 2]].forEach((m, i) => {
      if(v && i === 2) return;
      pb.r(m[0] - 1, m[1], 2, 3, c32('#F2E8D5'));
      for(let y = -Math.ceil(m[2]); y <= 0; y++) for(let x = -Math.ceil(m[2]); x <= Math.ceil(m[2]); x++) if((x * x) / (m[2] * m[2]) + (y * y) / (m[2] * m[2] * .7) <= 1) pb.p(m[0] + x - .5, m[1] + y, c32(y < -1 && x < 0 ? cap[1] : cap[0]));
      if(!v){ pb.p(m[0] - 1, m[1] - 1, c32('#FFFFFF')); pb.p(m[0] + 1, m[1] - 2, c32('#FFFFFF')); }
    });
    pb.ol(c32('#3A2A1A'));
    shadowU(pb, 8, 11, 6, 1, .2);
  });
}
/* 키 큰 풀(밟고 지나가면 발이 가려진다) */
function tallGrassSpr(v){
  return spr('tg|' + v, 16, 12, 8, 11, pb => {
    const cols = v === 1 ? ['#3E7A34', '#5C9A3A', '#9CC860'] : ['#2F6E2E', '#4E9A42', '#86C86E'];
    for(let b = 0; b < 7; b++){
      const bx = 2 + b * 2 + ((hash(b, v, 160) * 2) | 0), h = 5 + ((hash(b, v, 161) * 5) | 0), lean = hash(b, v, 162) < .5 ? -1 : 1;
      for(let i = 0; i < h; i++){
        const x = bx + (i > h * .6 ? lean : 0), y = 11 - i;
        pb.p(x, y, c32(i < 2 ? cols[0] : i < h - 2 ? cols[1] : cols[2]));
      }
    }
  });
}
function reedSpr(v){
  return spr('reed|' + v, 16, 24, 8, 22, pb => {
    const G1 = c32('#3E7A34'), G2 = c32('#6CAF4E');
    [[4, 7, 0], [7, 4, 1], [10, 8, 1], [12, 11, 0], [6, 10, 0]].forEach((s, i) => {
      if(v && i === 4) return;
      for(let y = s[1]; y <= 22; y++) pb.p(s[0] + (y < s[1] + 4 && i === 3 ? 1 : 0), y, (y & 3) ? G1 : G2);
      if(s[2]){ pb.r(s[0] - 1, s[1], 3, 5, c32('#3E2614')); pb.r(s[0], s[1] + 1, 1, 3, c32('#8A5A34')); pb.p(s[0], s[1] - 1, G1); }
    });
    for(let i = 0; i < 6; i++){ pb.p(3 - (i >> 1), 22 - i, G2); pb.p(13 + (i >> 1), 21 - i, G1); }
    shadowU(pb, 8, 22, 6, 1, .2);
  });
}
function cropSpr(v){
  return spr('crop|' + v, 16, 13, 8, 11, pb => {
    if(v === 0){
      blob(pb, [[8, 7, 4.6], [5, 8, 3], [11, 8, 3]], {ol:'#2E6B2E', lo:'#6FAE4E', mid:'#93CC6A', hi:'#C4E89A'});
      pb.p(8, 7, c32('#E4F5C8')); pb.p(7, 6, c32('#E4F5C8'));
    }else{
      [[5, 9], [8, 9], [11, 9]].forEach((p, i) => {
        const L = c32('#4FA84A'), H = c32('#86C86E');
        pb.p(p[0], p[1], L); pb.p(p[0], p[1] - 1, L); pb.p(p[0] - 1, p[1] - 2, H); pb.p(p[0] + 1, p[1] - 2, H); pb.p(p[0] - 1, p[1] - 3, L); pb.p(p[0] + 1, p[1] - 4 + (i & 1), L);
        pb.p(p[0], p[1] + 1, c32('#F08A30'));
      });
    }
    shadowU(pb, 8, 11, 6, 1, .18);
  });
}
function canSpr(){
  return spr('can', 16, 12, 8, 11, pb => {
    pb.r(4, 4, 7, 7, c32('#3A6F8E')); pb.r(5, 5, 5, 5, c32('#6BA6C8')); pb.r(5, 5, 2, 5, c32('#9CCBE4'));
    for(let i = 0; i < 4; i++) pb.p(11 + i, 7 - i, c32('#3A6F8E'));
    pb.r(14, 2, 2, 2, c32('#3A6F8E'));
    pb.r(5, 2, 5, 1, c32('#3A6F8E')); pb.p(4, 3, c32('#3A6F8E')); pb.p(10, 3, c32('#3A6F8E'));
    shadowU(pb, 8, 11, 5, 1, .2);
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
/* 선생님(흰 실험 가운 · 짙은 바지 · 안경). 학생 꾸미기에는 없는 모습 */
const T_HEAD = {
  down:['................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhho...', '...ohhshhshho...', '...ohgeggegho...', '...ohssssssho...', '....orssssro....'],
  up:  HEAD.up,
  left:['................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '...ohhhhhhhho...', '...oshhhhhhho...', '...ogegshhhho...', '...osssshhhho...', '....orsssHho....']
};
const T_TORSO = {
  down:['....owwttwwo....', '...oswwttwWso...', '...oowwwwwWoo...', '....owwwwwWo....'],
  up:  ['....owwwwwwo....', '...oswwwwwWso...', '...oowwwwwWoo...', '....owwwwwWo....'],
  left:['.....owwwwo.....', '.....owswwo.....', '.....owwwWo.....', '.....owwwWo.....']
};
function teacherSpr(dir, fr){
  return spr('tav|' + dir + '|' + fr, 16, 20, 8, 19, pb => {
    const d = dir === 'right' ? 'left' : dir, flip = dir === 'right';
    const pal = {o:'#2A2633', h:'#3A3236', H:'#28222A', s:'#F7D2AE', S:'#E5B08A', e:'#2A2633', r:'#F2A08F', g:'#8E98AA',
      w:'#F7F9FB', W:'#C9D2DA', t:'#2F8F86', p:'#353B4A', P:'#262B36', f:'#1E1E24'};
    const body = T_HEAD[d].concat(T_TORSO[d], LEGS[d][fr], ['................']);
    rows(pb, 0, 4, body, pal, flip);
  });
}
const avSpr = (a, dir, fr) => a.teacher ? teacherSpr(dir, fr) : avatarSpr(a.look, dir, fr);

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
  fill(2, 1, 6, 38, 'f'); fill(11, 36, 36, 38, 'f'); fill(13, 20, 21, 20, 'f'); fill(26, 20, 34, 20, 'f');
  fill(12, 4, 15, 6, 'f'); fill(31, 3, 33, 5, 'f'); fill(39, 33, 44, 36, 'f');   // 북서·북동 풀밭, 동남 꽃밭
  fill(18, 1, 29, 7, 'h'); fill(18, 8, 29, 8, 'c'); set(23, 8, 't'); set(24, 8, 't');
  fill(36, 1, 45, 10, 's'); fill(35, 0, 35, 11, 'i'); fill(36, 11, 45, 11, 'i');
  if(seen.winter){ set(40, 11, 's'); set(41, 11, 's'); }
  for(let y = 0; y < MH; y++){ const rx = (y >= 11 && y <= 20) ? 7 : 7 + Math.round(Math.sin(y * 0.5) * 0.9); fill(rx, y, rx + 2, y, 'w'); }
  fill(7, 15, 9, 16, 'b');
  fill(10, 15, 45, 16, 'p'); fill(23, 9, 24, 36, 'p'); fill(40, 12, 41, 14, 'p'); fill(41, 17, 42, 22, 'p');
  fill(19, 12, 28, 19, 'q'); [[19, 12], [28, 12], [19, 19], [28, 19]].forEach(p => set(p[0], p[1], 'g'));
  fill(39, 23, 45, 31, 'f'); fill(41, 25, 44, 28, 'w'); [[41, 25], [44, 25], [41, 28], [44, 28]].forEach(p => set(p[0], p[1], 'f'));
  return G;
}
/* 과수원 울타리 자리 — 둘레(위 21줄 · 아래 37줄 · 서 10열 · 동 37열)와 나무 사이 토막 */
const ORCH = {x0:10, x1:37, y0:21, y1:37, gate:[23, 24]};
const GAP_X = [13, 16, 19, 28, 31, 34];
function buildWorld(seen, trees){
  const G = buildGround(seen);
  const block = new Uint8Array(MW * MH), act = new Map(), objs = [], deco = [], occ = new Uint8Array(MW * MH);
  for(let y = 0; y < MH; y++) for(let x = 0; x < MW; x++){
    const c = G[y][x];
    if(c === 'w' || c === 'c' || c === 'i' || (c === 'b' && !seen.bridge)) block[y * MW + x] = 1;
  }
  const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const B = (x, y) => { if(inMap(x, y)){ block[y * MW + x] = 1; occ[y * MW + x] = 1; } };
  const A = (x, y, a) => { if(inMap(x, y)) act.set(y * MW + x, a); };
  const put = (s, footX, footY, a, extra) => { const o = Object.assign({s:s, x:footX - s.fx, y:footY - s.fy, base:footY, a:a || null}, extra || {}); objs.push(o); return o; };
  const tree2 = (tx, ty, s, a, extra) => { put(s, tx * TS + 16, (ty + 1) * TS + 14, a, extra); B(tx, ty + 1); B(tx + 1, ty + 1); if(a){ A(tx, ty + 1, a); A(tx + 1, ty + 1, a); } };
  const one = (tx, ty, s, a, walk) => { put(s, tx * TS + 8, ty * TS + 14, a); if(!walk) B(tx, ty); else if(inMap(tx, ty)) occ[ty * MW + tx] = 1; if(a) A(tx, ty, a); };
  const two = (tx, ty, s) => { put(s, tx * TS + 16, ty * TS + 14); B(tx, ty); B(tx + 1, ty); };   // 가로 두 칸 물건(통나무·수레)
  /* 밟고 지나가는 풀: 사람 발이 풀에 가려지게 기준선을 칸 맨 아래로 */
  const grass = (tx, ty, v) => { if(!inMap(tx, ty) || occ[ty * MW + tx] || block[ty * MW + tx]) return; occ[ty * MW + tx] = 1; put(tallGrassSpr(v | 0), tx * TS + 8, ty * TS + 15, null, {base:ty * TS + 15.8}); };
  const flat = (tx, ty, s) => { if(inMap(tx, ty)) occ[ty * MW + tx] = 1; put(s, tx * TS + 8, ty * TS + 14, null, {base:ty * TS + 6}); };   // 버섯처럼 낮은 것
  const scatter = (x0, y0, x1, y1, p, salt) => { for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++){ const c = at(G, x, y); if((c === 'g' || c === 'f') && hash(x, y, salt) < p) grass(x, y, hash(x, y, salt + 1) < .5 ? 0 : 1); } };

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
  [[20, 3], [26, 2], [21, 5]].forEach((p, i) => flat(p[0], p[1], mushSpr(i & 1)));

  /* 북서 풀밭(강과 언덕 사이): 그루터기·통나무·버섯 */
  tree2(14, 0, treeSpr('border', 6, 0)); tree2(11, 6, treeSpr('border', 5, 0));
  two(13, 3, logSpr()); one(16, 5, stumpSpr()); one(11, 2, reedSpr(0)); one(11, 4, reedSpr(1));
  flat(15, 3, mushSpr(0)); flat(12, 4, mushSpr(1));
  scatter(11, 1, 16, 7, .28, 170);
  /* 북동 풀밭(언덕과 얼음 벽 사이) */
  one(32, 2, rockSpr()); one(34, 6, bushSpr(1)); one(31, 6, stumpSpr()); one(34, 2, bushSpr(0));
  flat(33, 4, mushSpr(0));
  scatter(31, 1, 34, 7, .28, 172);

  /* 겨울 숲 */
  [[37, 2], [39, 1], [43, 2], [37, 6], [44, 6], [42, 8], [38, 9], [44, 9], [36, 4]].forEach((p, i) => one(p[0], p[1], treeSpr('pine', 6 + (i % 4), 0, true)));
  one(39, 5, bushSpr(2)); one(43, 4, bushSpr(2));
  one(41, 5, snowmanSpr(), seen.winter ? {k:'text', title:'겨울 숲', body:'눈사람이 서 있어요. ' + placeText('winter', true).body} : null);
  if(!seen.winter){ const wa = {k:'place', p:'winter'}; one(40, 11, crystalSpr(), wa); one(41, 11, crystalSpr(), wa); }
  one(39, 13, signSpr(), {k:'place', p:'winter'});

  /* 샘물(서쪽은 과수원 울타리가 막는다) */
  for(let x = 38; x <= 45; x++){ if(x !== 41 && x !== 42) one(x, 22, bushSpr(x % 3 === 0 ? 1 : 0)); one(x, 32, bushSpr(0)); }
  if(!seen.spring){ const sa = {k:'place', p:'spring'}; put(rockPileSpr(), 42 * TS, 22 * TS + 14, sa); B(41, 22); B(42, 22); A(41, 22, sa); A(42, 22, sa); }
  one(40, 19, signSpr(), {k:'place', p:'spring'});
  if(seen.spring){ const pa = {k:'text', title:'샘물', body:'맑은 물이 솟아요. ' + placeText('spring', true).body}; for(let x = 41; x <= 44; x++) for(let y = 25; y <= 28; y++) A(x, y, pa); }
  one(40, 26, rockSpr()); one(45, 24, rockSpr()); one(39, 29, bushSpr(1)); one(39, 24, reedSpr(1));
  deco.push({k:'lily', x:42 * TS + 10, y:26 * TS + 6, r:3, fl:true, drift:true}, {k:'lily', x:43 * TS + 8, y:27 * TS + 10, r:2});
  scatter(39, 23, 45, 31, .18, 174);
  /* 동남 꽃밭(울타리 너머 — 눈으로만) */
  one(40, 34, bushSpr(1)); one(44, 35, rockSpr()); one(42, 36, haySpr());
  scatter(38, 33, 45, 37, .3, 176);
  /* 동쪽 길가 풀숲 */
  one(44, 13, bushSpr(0)); one(45, 18, rockSpr()); one(44, 20, bushSpr(1));
  scatter(42, 12, 45, 21, .22, 178);

  /* 다리 · 건너편 들판(통나무·그루터기·버섯·풀숲) */
  const ba = {k:'place', p:'bridge'};
  for(let x = 7; x <= 9; x++){ A(x, 15, ba); A(x, 16, ba); }
  one(10, 14, signSpr(), ba);
  one(5, 13, signSpr(), {k:'text', title:'다리 건너 들판', body:'다리를 건너온 사람만 볼 수 있는 꽃밭이에요.'});
  [[3, 6], [4, 20], [3, 28], [5, 34]].forEach(p => one(p[0], p[1], bushSpr(1)));
  [[2, 10], [3, 24]].forEach(p => one(p[0], p[1], rockSpr()));
  two(2, 18, logSpr()); two(3, 31, logSpr()); one(5, 8, stumpSpr()); one(2, 36, stumpSpr()); one(4, 2, stumpSpr());
  [[3, 12], [5, 22], [2, 27], [4, 37], [5, 4]].forEach((p, i) => flat(p[0], p[1], mushSpr(i % 2)));
  one(6, 25, reedSpr(0)); one(6, 31, reedSpr(1)); one(5, 10, reedSpr(1)); one(7, 2, reedSpr(0));
  scatter(2, 1, 6, 38, .2, 180);
  /* 강: 연잎 · 돌 · 물가 갈대 */
  [[8, 3, 3, true], [9, 12, 2, false], [8, 21, 3, false], [7, 26, 3, true], [8, 34, 2, false], [9, 7, 2, false]].forEach(l => {
    const tx = l[0], ty = l[1]; if(at(G, tx, ty) === 'w') deco.push({k:'lily', x:tx * TS + 8, y:ty * TS + 8, r:l[2], fl:l[3], drift:l[3]});
  });
  [[8, 10, 3, 2], [9, 29, 2, 2], [7, 37, 3, 2], [8, 18, 2, 1]].forEach(s => { if(at(G, s[0], s[1]) === 'w') deco.push({k:'stone', x:s[0] * TS + 8, y:s[1] * TS + 8, rx:s[2], ry:s[3]}); });
  one(10, 19, reedSpr(0)); one(10, 20, reedSpr(1));

  /* 광장: 가운데 분수 · 모서리 가로등 · 드나드는 곳 꽃 화분 */
  const board = {k:'text', title:'우리 반 숲', body:'청록 깃발이 선 나무는 친구가 막혀 있는 질문이에요. 나무 앞에서 살펴보기를 누르면 찾아갈 길을 알려 줄 수 있어요. 아래 과수원에는 우리 반 나무가 번호 순서로 서 있어요.'};
  put(boardSpr(), 21 * TS, 12 * TS + 15, board); B(20, 12); B(21, 12); A(20, 12, board); A(21, 12, board);
  put(fountainSpr(0), 24 * TS, 17 * TS - 3, null, {fr:[fountainSpr(0), fountainSpr(1)], per:380});
  for(let x = 23; x <= 24; x++) for(let y = 15; y <= 16; y++) B(x, y);
  one(20, 18, benchSpr()); one(27, 18, benchSpr()); one(27, 13, benchSpr());
  [[19, 13], [28, 13], [19, 18], [28, 18]].forEach(p => one(p[0], p[1], lampSpr()));
  [[22, 12, 0], [25, 12, 1]].forEach(p => one(p[0], p[1], potSpr(p[2])));
  /* 길가 가로등 */
  [[11, 17], [36, 14], [25, 10], [39, 17]].forEach(p => one(p[0], p[1], lampSpr()));

  /* 깃발 숲(이름 없음) */
  FLAG_AT.forEach((p, i) => tree2(p[0], p[1], treeSpr('default', 7, 3), {k:'flag', slot:i}, {flagSlot:i}));

  /* 광장 서쪽 소풍 자리 */
  deco.push({k:'blanket', x:13 * TS + 2, y:18 * TS + 3, w:28, h:22});
  one(15, 19, basketSpr(true)); tree2(16, 17, treeSpr('border', 6, 0));
  scatter(11, 17, 18, 21, .16, 182);
  /* 광장 동쪽 텃밭(이랑 둘 · 허수아비 · 물뿌리개) */
  [17, 19].forEach((y, j) => {
    deco.push({k:'bed', x:31 * TS, y:y * TS + 3, w:6 * TS});
    for(let x = 31; x <= 36; x++) one(x, y, cropSpr((x + j) % 3 === 0 ? 0 : 1));
  });
  one(37, 18, scarecrowSpr()); one(30, 18, canSpr());

  /* 우리 반 과수원(번호 순서) — 울타리 · 갈아 놓은 흙 · 문 앞 살림 */
  for(let n = 1; n <= 40; n++){ const p = plotAt(n); deco.push({k:'soil', x:p[0] * TS + 16, y:(p[1] + 1) * TS + 10, w:12, h:5}); occ[(p[1] + 1) * MW + p[0]] = occ[(p[1] + 1) * MW + p[0] + 1] = 1; }
  const F = new Set(), FC = new Set(), key = (x, y) => y * MW + x;
  for(let x = ORCH.x0; x <= ORCH.x1; x++){ if(ORCH.gate.indexOf(x) < 0 && x !== ORCH.gate[0] - 1 && x !== ORCH.gate[1] + 1) F.add(key(x, ORCH.y0)); F.add(key(x, ORCH.y1)); }
  for(let y = ORCH.y0; y <= ORCH.y1; y++){ if(at(G, ORCH.x0, y) !== 'w') F.add(key(ORCH.x0, y)); F.add(key(ORCH.x1, y)); }
  FC.add(key(ORCH.gate[0] - 1, ORCH.y0)); FC.add(key(ORCH.gate[1] + 1, ORCH.y0));   // 문 기둥과도 이어짐
  F.forEach(k2 => {
    const x = k2 % MW, y = (k2 / MW) | 0, on = (dx, dy) => F.has(key(x + dx, y + dy)) || FC.has(key(x + dx, y + dy));
    const m = (on(0, -1) ? 1 : 0) | (on(0, 1) ? 2 : 0) | (on(-1, 0) ? 4 : 0) | (on(1, 0) ? 8 : 0);
    put(fenceSpr(m), x * TS + 8, y * TS + 14, null, {base:y * TS + 13}); B(x, y);
  });
  put(orchardGateSpr(), (ORCH.gate[0] + 1) * TS, ORCH.y0 * TS + 14, null, {base:ORCH.y0 * TS + 13});
  B(ORCH.gate[0] - 1, ORCH.y0); B(ORCH.gate[1] + 1, ORCH.y0);
  const has = new Set((trees || []).map(t => t.n));
  PLOT_Y.forEach((py, r) => GAP_X.forEach(gx => {
    const i = PLOT_X.indexOf(gx - 2), nL = r * 8 + i + 1, nR = nL + 1;
    put(fenceGapSpr(has.has(nL) ? 13 : 0, has.has(nR) ? 13 : 0), gx * TS + 8, (py + 1) * TS + 14, null, {base:(py + 1) * TS + 13}); B(gx, py + 1);
  }));
  one(21, 20, signSpr(), {k:'text', title:'우리 반 과수원', body:'우리 반 나무가 번호 순서로 서 있어요. 친구 나무 앞에서 살펴보기를 누르면 그 친구 질문에 물을 줄 수 있어요.'});
  /* 문 앞: 사과 상자 · 바구니 · 수레 · 건초 더미 */
  one(20, 20, crateSpr(0)); one(19, 20, crateSpr(1)); one(26, 20, basketSpr(false)); one(27, 20, crateSpr(2));
  two(29, 20, cartSpr()); one(16, 20, haySpr()); one(17, 20, haySpr()); one(32, 20, haySpr());
  (trees || []).forEach(t => {
    const p = plotAt(t.n); if(!p) return;
    const a = {k:'tree', n:t.n, me:!!t.me, name:t.name};
    tree2(p[0], p[1], treeSpr(t.type, t.level, t.fruits), a, {plate:t.name, plateMe:!!t.me, plateN:t.n});
  });
  scatter(11, 20, 36, 20, .14, 184);
  scatter(11, 22, 36, 36, .05, 186);
  return {G:G, block:block, act:act, objs:objs, deco:deco};
}
/* 걸어서 닿는지 검사(시험용): 시작 자리에서 BFS 로 닿는 칸을 세고, 살펴볼 것마다 옆 칸에 닿는지 본다 */
function reachReport(wd, opts){
  opts = opts || {};
  const ok = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && !wd.block[y * MW + x];
  const seen = new Uint8Array(MW * MH), q = [SPAWN[1] * MW + SPAWN[0]];
  const out = {spawn:ok(SPAWN[0], SPAWN[1]), bad:[]};
  if(!out.spawn) return out;
  seen[q[0]] = 1;
  for(let i = 0; i < q.length; i++){
    const c = q[i], x = c % MW, y = (c / MW) | 0;
    for(const s of SIDES){ const nx = x + s[0], ny = y + s[1]; if(!ok(nx, ny)) continue; const ni = ny * MW + nx; if(!seen[ni]){ seen[ni] = 1; q.push(ni); } }
  }
  out.reach = q.length;
  const R = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && !!seen[y * MW + x];
  /* 살펴볼 것: 옆 칸 하나라도 닿으면 된다 */
  const groups = new Map();
  wd.act.forEach((a, k) => { if(!groups.has(a)) groups.set(a, []); groups.get(a).push(k); });
  groups.forEach((ks, a) => {
    if(opts.skipText && a.k === 'text' && !/우리 반/.test(a.title || '')) return;
    const near = ks.some(k => { const x = k % MW, y = (k / MW) | 0; return SIDES.some(s => R(x + s[0], y + s[1])); });
    if(!near) out.bad.push((a.k === 'tree' ? 'tree ' + a.n : a.k === 'flag' ? 'flag ' + a.slot : a.k === 'place' ? 'place ' + a.p : 'text ' + a.title) + ' @' + ks.map(k => (k % MW) + ',' + ((k / MW) | 0)).join(' '));
  });
  /* 나무 앞(아래) 칸 · 깃발 나무 앞 칸 */
  out.trees = 0; out.flags = 0;
  wd.act.forEach((a, k) => {
    const x = k % MW, y = (k / MW) | 0;
    if(a.k === 'tree' && R(x, y + 1) && !a._f){ a._f = 1; out.trees++; }
    if(a.k === 'flag' && R(x, y + 1) && !a._f){ a._f = 1; out.flags++; }
  });
  wd.act.forEach(a => { delete a._f; });
  return out;
}

/* ═══════════ 상태 ═══════════ */
const W = {root:null, cv:null, ctx:null, k:3, K:3, sharp:false, off:null, offCtx:null, vw:200, vh:200, dpr:1, raf:0, last:0, t:0,
  data:{flags:[], seen:{}, trees:[]}, sig:'', world:null, ground:[null, null],
  me:null, uid:null, held:[], pad:null, route:null, pend:null, dlg:null, cardKey:null, fontOk:false};
function newAvatar(x, y, dir, look, name){
  return {x:x, y:y, fx:x, fy:y, px:x * TS, py:y * TS, t:1, moving:false, dir:dir || 'down', par:false, look:look | 0, name:name || '',
    n:0, trail:[[x, y]], q:[], face:null, emo:0, emoN:0, emoUntil:0, say:0, sayN:0, sayUntil:0};
}
const visitOn = () => !!(QO.state && QO.state.visit);   // 선생님 숲 방문(visit.js) — 내 아바타가 선생님
const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const still = () => !!(RM && RM.matches);   // 움직임 줄이기: 분수 물·나비는 멈춘 그림으로
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
  const tv = visitOn();
  W.me = newAvatar(SPAWN[0], SPAWN[1], 'down', myLookNum(), tv ? '선생님' : (m.name || '나'));
  W.me.teacher = tv;
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
  /* 한 화면에 보이는 칸: 좁은 화면 약 17~18 · 중간 약 21 · 넓은 화면 약 25.
     정수 배율로 그 언저리(약 ±10%)에 들면 그대로 또렷하게, 아니면 한 단계 큰 정수 배율로 따로 그린 뒤 부드럽게 줄인다(점 크기가 들쭉날쭉하지 않게) */
  const across = r.width < 520 ? 17.5 : r.width < 900 ? 21 : 25;
  const ideal = cw / (across * TS), ki = Math.max(1, Math.round(ideal)), ratio = ideal / ki;
  const k = (ideal <= 1 || (ratio >= 0.9 && ratio <= 1.12)) ? ki : ideal;
  W.k = k; W.K = Math.max(1, Math.ceil(k - 1e-6)); W.sharp = W.K !== k;
  W.vw = cw / k; W.vh = ch / k; W.dpr = dpr;
  if(W.sharp){
    if(!W.off){ W.off = document.createElement('canvas'); W.offCtx = W.off.getContext('2d'); }
    const ow = (Math.ceil(W.vw) + 2) * W.K, oh = (Math.ceil(W.vh) + 2) * W.K;
    if(W.off.width !== ow || W.off.height !== oh){ W.off.width = ow; W.off.height = oh; }
  }else if(W.off){ W.off.width = W.off.height = 1; }
  W.ctx.imageSmoothingEnabled = false;
}
function sigOf(d){ return JSON.stringify([d.seen || {}, (d.trees || []).map(t => [t.n, t.name, t.type, t.level, t.fruits, t.me ? 1 : 0])]); }
function rebuild(){
  const d = W.data, seen = d.seen || {};
  W.world = buildWorld(seen, d.trees);
  W.ground = [groundCanvas(W.world.G, 0, seen, W.world.deco), groundCanvas(W.world.G, 1, seen, W.world.deco)];
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
  /* 선생님 방문이 켜지고 꺼질 때(같은 계정이어도) 아바타 모습·이름표를 바꾸고, 꾸미기 단추는 숨긴다 */
  const tv = visitOn();
  if(!!W.me.teacher !== tv){ W.me.teacher = tv; W.me.name = tv ? '선생님' : ((QO.state.me || {}).name || '나'); NET.dirty = true; }
  const lb = W.root.querySelector('.wd-lookb'); if(lb && lb.hidden !== tv){ lb.hidden = tv; if(tv) closePops(); }
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
function belowAct(a){ return (x, y) => W.world.act.get((y - 1) * MW + x) === a; }
function faceAct(a){
  const me = W.me;
  for(const d of DIRS){ const v = DV[d]; if(W.world.act.get((me.y + v[1]) * MW + (me.x + v[0])) === a){ me.dir = d; return true; } }
  return false;
}
function goToAct(a, andAct){
  if(!a || !W.world) return false;
  if(nextToAct(a)(W.me.x, W.me.y) && !W.me.moving){ faceAct(a); if(andAct) interact(a); return true; }
  /* 나무·깃발 나무는 앞(아래) 칸을 먼저 찾는다 — 나무 뒤 칸에 서면 잎에 가려 내가 안 보인다 */
  const path = ((a.k === 'tree' || a.k === 'flag') && bfs(W.me.x, W.me.y, belowAct(a))) || bfs(W.me.x, W.me.y, nextToAct(a));
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
    else if(k === 'status'){ if(!NET.open) U.toast(NET.state === 'off' ? '함께 걷기는 아직 준비 중이에요. 지금은 혼자 걸을 수 있어요.' : visitOn() ? '이 반의 함께 걷기가 열리면 학생들이 보여요.' : '선생님이 함께 걷기를 열면 반 친구들이 보여요.'); }
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
  const main = W.ctx, k = W.k, K = W.K, me = W.me, wd = W.world;
  if(!wd) return;
  const mapW = MW * TS, mapH = MH * TS;
  let cx = Math.round(me.px + 8 - W.vw / 2), cy = Math.round(me.py + 8 - W.vh / 2);
  cx = W.vw >= mapW ? Math.round((mapW - W.vw) / 2) : Math.max(0, Math.min(mapW - W.vw, cx));
  cy = W.vh >= mapH ? Math.round((mapH - W.vh) / 2) : Math.max(0, Math.min(mapH - W.vh, cy));
  cx = Math.floor(cx); cy = Math.floor(cy);
  W.cam = [cx, cy];
  /* 장면은 정수 배율 K 로 그린다(배율이 정수가 아니면 따로 그린 뒤 줄여서 붙임) */
  const ctx = W.sharp ? W.offCtx : main;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2E6B3A'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const g = W.ground[((W.t / 650) | 0) & 1];
  const sw = Math.min(Math.ceil(W.vw) + 1, mapW - Math.max(0, cx)), sh = Math.min(Math.ceil(W.vh) + 1, mapH - Math.max(0, cy));
  ctx.drawImage(g, Math.max(0, cx), Math.max(0, cy), sw, sh, (Math.max(0, cx) - cx) * K, (Math.max(0, cy) - cy) * K, sw * K, sh * K);
  const S = (o, x, y) => ctx.drawImage(o.c, 0, 0, o.w, o.h, Math.round(x - cx) * K, Math.round(y - cy) * K, o.w * K, o.h * K);
  const inView = (x, y, w, h) => x + w >= cx && y + h >= cy && x <= cx + W.vw && y <= cy + W.vh;
  const list = [];
  const af = still() ? 0 : ((W.t / 380) | 0) & 1;
  wd.objs.forEach(o => { if(inView(o.x, o.y, o.s.w, o.s.h)) list.push(o.fr ? {s:o.fr[af], x:o.x, y:o.y, base:o.base} : o); });
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
    list.push({av:a, s:avSpr(a, a.dir, fr2), x:x, y:y - 4 - (a.moving && a.t < .5 ? 1 : 0), base:y + 15 + (a === me ? .5 : 0)});
  });
  list.sort((a, b) => a.base - b.base);
  const sh0 = avShadow();
  list.forEach(o => { if(o.av) S(sh0, o.av.px + 8 - sh0.fx, o.av.py + 15 - sh0.fy); S(o.s, o.x, o.y); });
  effects(ctx, cx, cy, K);
  people.forEach(a => { if(a.emoUntil > W.t && a.emo){ const x = Math.round(a.px), y = Math.round(a.py); if(inView(x - 4, y - 24, 24, 30)) S(bubbleSpr(a.emo - 1), x + 1, y - 20); } });
  if(W.sharp){
    main.imageSmoothingEnabled = true; main.imageSmoothingQuality = 'low';
    main.drawImage(W.off, 0, 0, W.off.width, W.off.height, 0, 0, W.off.width * k / K, W.off.height * k / K);
    main.imageSmoothingEnabled = false;
  }
  /* 말풍선 · 이름표(기기 화소로 또렷하게, 최소 11px) */
  const fs = Math.max(11, Math.round(11 * W.dpr));
  main.font = 'bold ' + fs + 'px ' + GAL; main.textAlign = 'center'; main.textBaseline = 'middle';   // 굵게 — 작은 화면에서 「라」·「리」가 헷갈리지 않게
  wd.objs.forEach(o => {
    if(!o.plate || !inView(o.x, o.y, o.s.w, o.s.h + 16)) return;
    const tx = (o.x + o.s.fx - cx) * k, ty = (o.base + 10 - cy) * k;
    tag(main, tx, ty, (o.plateN ? o.plateN + ' ' : '') + o.plate, fs, o.plateMe ? '#FFE27A' : '#F7EBD0', '#4A3220', o.plateMe ? '#2B3A2C' : '#4A3220');
  });
  people.forEach(a => {
    const x = Math.round(a.px), y = Math.round(a.py);
    if(!inView(x - 30, y - 30, 76, 70)) return;
    const tx = (x + 8 - cx) * k, ty = (y + 21 - cy) * k;
    if(a === me) tag(main, tx, ty, a.name || '나', fs, '#FFE27A', 'rgba(32,40,34,.78)', null);
    else if(a.teacher) tag(main, tx, ty, '선생님', fs, '#FFFFFF', '#1F6B3A', '#0F3D20');
    else tag(main, tx, ty, a.name, fs, '#FFFFFF', 'rgba(32,40,34,.78)', null);
    if(!(a.emoUntil > W.t && a.emo) && a.sayUntil > W.t && a.say) say(main, tx, (y - 8 - cy) * k, PHRASES[a.say - 1] || '', fs);
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
  /* 나비: 꽃이 있는 곳 둘레를 팔랑팔랑(날개 두 장면) */
  BUTTERFLY.forEach((b, i) => {
    const rm = still(), ax = b[0] * TS, ay = b[1] * TS, tt = (rm ? 0 : t / 1000) + i * 2.3;
    const x = ax + Math.sin(tt * .7) * 26 + Math.sin(tt * 1.9) * 6, y = ay + Math.sin(tt * .53 + 1) * 14 + Math.sin(tt * 2.6) * 3;
    if(x < cx - 4 || y < cy - 4 || x > cx + W.vw + 4 || y > cy + W.vh + 4) return;
    const X = Math.round(x - cx) * k, Y = Math.round(y - cy) * k, open = rm ? 1 : ((t / 110 + i * 3) | 0) & 1;
    ctx.fillStyle = 'rgba(30,58,30,.2)'; ctx.fillRect(X - k, Y + 6 * k, k * 3, k);
    ctx.fillStyle = b[2];
    if(open){ ctx.fillRect(X - 2 * k, Y - k, 2 * k, 2 * k); ctx.fillRect(X + k, Y - k, 2 * k, 2 * k); ctx.fillStyle = b[3]; ctx.fillRect(X - 2 * k, Y + k, k, k); ctx.fillRect(X + 2 * k, Y + k, k, k); }
    else{ ctx.fillRect(X - k, Y - 2 * k, k, 2 * k); ctx.fillRect(X + k, Y - 2 * k, k, 2 * k); }
    ctx.fillStyle = '#2A2633'; ctx.fillRect(X, Y - k, k, 2 * k);
  });
}
const BUTTERFLY = [[4, 7, '#FFFFFF', '#F7A8C8'], [3, 27, '#FFE07A', '#F2B53B'], [14, 5, '#F7A8C8', '#FFFFFF'], [17, 36, '#FFFFFF', '#B9A6F2'],
  [30, 36, '#FFE07A', '#FF9C8A'], [33, 19, '#FFFFFF', '#FFE07A'], [14, 20, '#B9A6F2', '#FFFFFF'], [41, 35, '#FF9C8A', '#FFE07A'], [43, 15, '#FFFFFF', '#F7A8C8']];

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
  if(leave && NET.open){ const lv = visitOn() && typeof QO.api.visitLeave === 'function' ? QO.api.visitLeave : QO.api.worldLeave; Promise.resolve().then(() => lv()).catch(() => {}); }
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
    const r = await (QO.state && QO.state.visit && typeof QO.api.visitTick === 'function' ? QO.api.visitTick(st) : QO.api.worldTick(st));
    NET.fails = 0;
    applyNet(r);
    next = NET.open ? TICK_OPEN : TICK_SHUT;
  }catch(e){
    NET.fails++;
    const msg = String((e && e.message) || e || '');
    /* SQL: visit.js 가 SQL 이 없을 때 「v2_08 SQL 을 실행한 뒤에」로 바꿔 던진다 */
    if(/world_tick|visit_tick|function|schema cache|PGRST202|404|SQL/i.test(msg)){ NET.state = 'off'; NET.open = false; NET.others.clear(); next = TICK_OFF; }
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
  if(!o){ o = newAvatar(x, y, d, look, name); o.teacher = k <= 0; o.n = n; o.emoN = emoN; o.sayN = sayN; NET.others.set(k, o); return; }   // 번호 0 이하 = 선생님
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
  let kids = 0, tch = false;
  NET.others.forEach(o => { if(o.teacher) tch = true; else kids++; });
  if(W.me && W.me.teacher){
    if(NET.open) t = '숲 방문 · 학생 ' + kids + '명';
    else if(NET.state === 'lost') t = '연결을 다시 잇는 중';
    else t = '숲 방문 중';
  }
  else if(NET.open) t = '함께 걷기 · ' + (tch ? (kids ? '친구 ' + kids + '명과 선생님' : '선생님이 있어요') : '친구 ' + kids + '명');   // 선생님은 친구 수에 넣지 않는다
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
  /* 걸어서 닿는지: 지금 지도 · 40자리 다 찬 지도(장소 다 열림/다 닫힘) */
  _check(){
    const all = {spring:true, bridge:true, obs:true, winter:true}, full = [];
    for(let n = 1; n <= 40; n++) full.push({n:n, name:'n' + n, type:'default', level:6, fruits:0});
    return {now:W.world ? reachReport(W.world) : null, open40:reachReport(buildWorld(all, full)), shut40:reachReport(buildWorld({}, full), {skipText:true})};
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
add('숲 · 울타리·꾸밈이 있어도 40자리·깃발·장소에 걸어서 닿고, 한 화면 칸 수·누른 곳 좌표가 맞음', async t => {
  const r = QO.world._check();
  t.expect(r.open40.spawn && r.shut40.spawn, '시작 자리는 걸을 수 있음');
  t.eq(r.open40.bad, [], '장소가 다 열린 40자리 숲: 못 닿는 살펴보기 없음');
  t.eq(r.open40.trees, 40, '40자리 나무 앞(아래) 칸에 모두 닿음');
  t.eq(r.open40.flags, 8, '깃발 숲 8그루 앞 칸에 닿음');
  t.eq(r.shut40.bad, [], '장소가 다 닫힌 숲: 안내판·잠긴 문·과수원까지는 닿음');
  t.eq(r.shut40.trees, 40, '닫힌 숲에서도 40자리 앞 칸에 닿음');
  await t.click('#nav [data-t="forest"]');
  await worldReady(t);
  fit();
  const rw = W.root.getBoundingClientRect().width, across = W.vw / TS;
  if(rw < 520) t.expect(across > 15.5 && across < 20, '좁은 화면 한 줄 칸 수 ' + across.toFixed(1));
  else t.expect(across > 18 && across < 28, '넓은 화면 한 줄 칸 수 ' + across.toFixed(1));
  /* 화면을 누르면 그 칸으로 걷는다(배율이 정수가 아니어도 좌표가 맞게) */
  if(W.dlg) hideDlg();
  place(W.me, SPAWN[0], SPAWN[1], 'down'); W.route = null; W.pend = null;
  draw();
  const tx = SPAWN[0] + 3, ty = SPAWN[1];
  t.expect(walkable(tx, ty), '누를 칸은 걸을 수 있음');
  const cr = W.cv.getBoundingClientRect();
  const ex = cr.left + ((tx * TS + 8) - W.cam[0]) * W.k / W.dpr, ey = cr.top + ((ty * TS + 8) - W.cam[1]) * W.k / W.dpr;
  W.cv.dispatchEvent(new PointerEvent('pointerdown', {clientX:ex, clientY:ey, pointerId:9, bubbles:true}));
  W.cv.dispatchEvent(new PointerEvent('pointerup', {clientX:ex, clientY:ey, pointerId:9, bubbles:true}));
  t.expect(W.route && W.route.length, '누른 곳까지 길이 생김');
  t.eq(W.route[W.route.length - 1], [tx, ty], '누른 칸이 길 끝');
  W.route = null; W.pend = null;
  /* 친구 나무로 걸어가면 나무 뒤가 아니라 앞(아래) 칸에 선다 */
  const tr0 = (W.data.trees || [])[0];
  if(tr0){
    const pp = plotAt(tr0.n);
    place(W.me, 23, pp[1], 'down');
    t.expect(goToAct(findTreeAct(tr0.n), false), '친구 나무까지 길이 있음');
    t.eq(W.route[W.route.length - 1][1], pp[1] + 2, '나무 앞(아래) 칸에 섬');
    W.route = null; W.pend = null; place(W.me, SPAWN[0], SPAWN[1], 'down');
  }
  /* 함께 걷기에 선생님(번호 0 이하)이 있으면 친구 수에서 빼고 따로 알린다 */
  const keep = [NET.open, NET.state];
  NET.open = true; NET.others.clear();
  upsert([0, 25, 17, 0, 1, [25, 17], 0, 0, 0, 0, 0, '선생']); upsert([2, 21, 17, 0, 1, [21, 17], 5, 0, 0, 0, 0, '나래']);
  status();
  t.expect(NET.others.get(0).teacher && !NET.others.get(2).teacher, '번호 0 은 선생님');
  t.eq(W.stEl.textContent, '함께 걷기 · 친구 1명과 선생님', '상태 글(선생님은 친구 수에서 뺌)');
  NET.others.clear(); NET.open = keep[0]; NET.state = keep[1]; status();
  /* 선생님 숲 방문: 내 아바타가 선생님, 꾸미기 단추 숨김 → 끄면 돌아옴 */
  const was = QO.state.visit;
  try{
    QO.state.visit = {grade:2, class_no:11};
    mount(W.root.parentNode, W.data);
    t.expect(W.me.teacher && W.me.name === '선생님', '선생님 아바타 · 이름표');
    t.expect(W.root.querySelector('.wd-lookb').hidden, '꾸미기 단추 숨김');
    t.expect(avSpr(W.me, 'down', 0) === teacherSpr('down', 0), '선생님 그림');
  }finally{
    QO.state.visit = was || null;
    mount(W.root.parentNode, W.data);
  }
  t.expect(!W.me.teacher && !W.root.querySelector('.wd-lookb').hidden, '방문을 끄면 내 모습으로');
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
