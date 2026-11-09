/* Is a stage a map? Manifest at OVO Arena Wembley · #30DayMapChallenge 2026 · Day 25
   The stage is drawn in perspective, as seen from the audience. The YouTube player is the clock; every performer is a
   spotlight, and the floor keeps the colour of whoever stood there. */
const ZN = { platform: "Platform", merdiven: "Stairs", ana_sahne_on: "Main stage", runway: "Runway", on_blok: "Front block" };
const PART = { ana_sahne: "MAIN STAGE", runway: "RUNWAY", on_blok: "FRONT BLOCK" };
const CELL = 0.2, R = 3.2, TRAIL = 12, TAU = 18, FLOOR = 0.45, TPX = 28;   // heat cell (m), glow radius (m), texture px per m
const TILT = 46 * Math.PI / 180, PERSP = 2.3;                             // camera: floor tilted 52°, viewer at 1.75 × stage size
const $ = s => document.querySelector(s);
const fmt = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const VID = new URLSearchParams(location.search).has("video");
if (VID) document.body.classList.add("vid");

const S = { d: null, t: 29, dt: 26, mode: "acc", unc: true, off: 0, on: new Set(), playing: false, yt: null, ytReady: false,
  last: performance.now(), dirty: true, grids: {}, recent: {}, applied: {}, accKey: "", heatT: -99, heatKey: "" };
window.S = S;
const cv = $("#stage"), ctx = cv.getContext("2d");
const heat = document.createElement("canvas"), hx = heat.getContext("2d");      // heat grid image (1 px = CELL)
const tex = document.createElement("canvas"), tx = tex.getContext("2d");        // floor texture (TPX px per m), drawn in perspective
const PATH = {}, DISP = {};
let DPR = 1, SC = 1, CX = 0, CY = 0, P = 1000, GW = 0, GH = 0, KER = null, KR = 0, IMG = null, W = 0, H = 0;

// ── clocks: the video drives everything; the positions were noted on a clock that drifts against it ──
function toData(v) {
  const w = S.d.warp; if (!w) return v;
  if (v <= w[0][1]) return v - (w[0][1] - w[0][0]);
  for (let i = 1; i < w.length; i++) if (v <= w[i][1]) { const f = (v - w[i - 1][1]) / (w[i][1] - w[i - 1][1]); return w[i - 1][0] + f * (w[i][0] - w[i - 1][0]); }
  return v - (w[w.length - 1][1] - w[w.length - 1][0]);
}
function toVideo(d) {
  const w = S.d.warp;
  if (d <= w[0][0]) return d + (w[0][1] - w[0][0]);
  for (let i = 1; i < w.length; i++) if (d <= w[i][0]) { const f = (d - w[i - 1][0]) / (w[i][0] - w[i - 1][0]); return w[i - 1][1] + f * (w[i][1] - w[i - 1][1]); }
  return d + (w[w.length - 1][1] - w[w.length - 1][0]);
}

// ── camera: floor point (x, y) at height h (m) → screen ──
const cT = Math.cos(TILT), sT = Math.sin(TILT);
function proj(x, y, h = 0) {
  const u = (x - S.d.w / 2) * SC, v = (y - S.d.h / 2) * SC, hp = h * SC;
  const yy = v * cT - hp * sT, z = v * sT + hp * cT, k = P / (P - z);
  return [CX + u * k, CY + yy * k, k];
}
function rowToV(Y, hp) { return (Y * P - Y * hp * cT + hp * P * sT) / (P * cT + Y * sT); }   // inverse for one screen row

function safeRect() {
  if (VID) return [30, 400, W - 30, $("#cast").getBoundingClientRect().top - 10];
  if (W <= 900) return [8, 8, W - 8, H - 8];
  const vc = $("#vcard").getBoundingClientRect(), cast = $("#cast").getBoundingClientRect();
  return [W * 0.2, 96, W - vc.width - 40, cast.top - 14];   // between the title column, the video card and the cast
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  // the projected shape does not depend on the scale, so fit it once at SC = 1 and scale up
  const [l, t, rr, b] = safeRect();
  SC = 1; P = PERSP * S.d.w; CX = 0; CY = 0;
  const pts = []; for (const [x, y] of [[0, 0], [S.d.w, 0], [0, S.d.h], [S.d.w, S.d.h]]) for (const h of [0, 3.3 + 2.4]) pts.push(proj(x, y, h));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const s = Math.min((rr - l) / bw, (b - t) / bh) * DPR;
  SC = s; P = PERSP * S.d.w * s;
  CX = ((l + rr) / 2) * DPR - ((Math.max(...xs) + Math.min(...xs)) / 2) * s;
  CY = ((t + b) / 2) * DPR - ((Math.max(...ys) + Math.min(...ys)) / 2) * s;
  document.documentElement.style.setProperty("--vtop", `${$("#vcard").getBoundingClientRect().height + 10}px`);
  lanes(); S.heatKey = ""; S.dirty = true;
}

// ── heat grids: smooth kernel, zero at R ──
function initGrids() {
  GW = Math.round(S.d.w / CELL); GH = Math.round(S.d.h / CELL);
  heat.width = GW; heat.height = GH; IMG = hx.createImageData(GW, GH);
  KR = Math.round(R / CELL); KER = new Float32Array((2 * KR + 1) ** 2);
  for (let j = -KR; j <= KR; j++) for (let i = -KR; i <= KR; i++) { const q = (i * i + j * j) / (KR * KR); KER[(j + KR) * (2 * KR + 1) + (i + KR)] = q < 1 ? (1 - q) ** 2 : 0; }
  for (const m of S.d.members) { S.grids[m.key] = new Float32Array(GW * GH); S.recent[m.key] = new Float32Array(GW * GH); S.applied[m.key] = 0; }
  tex.width = Math.round(S.d.w * TPX); tex.height = Math.round(S.d.h * TPX);
}
function stamp(g, x, y, w) {
  const ci = Math.round(x / CELL), cj = Math.round(y / CELL), kw = 2 * KR + 1;
  for (let j = -KR; j <= KR; j++) { const yy = cj + j; if (yy < 0 || yy >= GH) continue;
    for (let i = -KR; i <= KR; i++) { const xx = ci + i; if (xx < 0 || xx >= GW) continue; const k = KER[(j + KR) * kw + (i + KR)]; if (k) g[yy * GW + xx] += w * k; } }
}
const wOf = s => { const w = s[4]; return !S.unc && w < 1 ? 0 : w; };
function updateGrids() {
  const t = S.dt, key = `${S.mode}|${S.unc}`;
  if (S.mode === "trail") {
    for (const m of S.d.members) { const g = S.grids[m.key]; g.fill(0);
      for (const s of m.s) { const age = t - s[0]; if (age < 0) break; if (age > TRAIL) continue; const w = wOf(s); if (w) stamp(g, s[1], s[2], w * Math.exp(-age / 5)); } }
    S.accKey = ""; return;
  }
  const lim = S.mode === "all" ? Infinity : t;
  for (const m of S.d.members) {
    const g = S.grids[m.key]; let n = 0; while (n < m.s.length && m.s[n][0] <= lim) n++;
    if (key !== S.accKey || n < S.applied[m.key]) { g.fill(0); S.applied[m.key] = 0; }
    for (let k = S.applied[m.key]; k < n; k++) { const w = wOf(m.s[k]); if (w) stamp(g, m.s[k][1], m.s[k][2], w); }
    S.applied[m.key] = n;
  }
  S.accKey = key;
  for (const m of S.d.members) { const g = S.recent[m.key]; g.fill(0); if (S.mode === "all") continue;
    for (const s of m.s) { const age = t - s[0]; if (age < 0) break; if (age > 4 * TAU) continue; const w = wOf(s); if (w) stamp(g, s[1], s[2], w * Math.exp(-age / TAU)); } }
}
// the performer with more presence leads (weights³), so overlaps keep a hue instead of washing out
function paintHeat() {
  const ms = S.d.members.filter(m => S.on.has(m.key)), cols = ms.map(m => hex(m.color)), gs = ms.map(m => S.grids[m.key]), rs = ms.map(m => S.recent[m.key]);
  const fl = S.mode === "acc" ? FLOOR : 1, rc = S.mode === "acc" ? 1 - FLOOR : 0, K = S.mode === "trail" ? 1.1 : S.mode === "acc" ? 3.2 : 5.5, px = IMG.data;
  for (let p = 0, q = 0; p < GW * GH; p++, q += 4) {
    let T = 0, sw = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < gs.length; i++) { const v = fl * gs[i][p] + rc * rs[i][p]; if (v <= 0) continue; T += v; const w = v * v * v; sw += w; r += cols[i][0] * w; g += cols[i][1] * w; b += cols[i][2] * w; }
    if (T < 1e-3) { px[q + 3] = 0; continue; }
    px[q] = r / sw; px[q + 1] = g / sw; px[q + 2] = b / sw; px[q + 3] = 255 * 0.95 * (1 - Math.exp(-T / K));
  }
  hx.putImageData(IMG, 0, 0);
}

// ── the floor texture: dark glossy stage, faint grid, the colour map, LED edges ──
function polyT(p) { tx.beginPath(); p.forEach(([x, y], i) => i ? tx.lineTo(x * TPX, y * TPX) : tx.moveTo(x * TPX, y * TPX)); tx.closePath(); }
function buildTexture() {
  const parts = Object.fromEntries(S.d.parts.map(p => [p.id, p])), floor = ["ana_sahne", "runway", "on_blok"];
  tx.clearRect(0, 0, tex.width, tex.height);
  tx.save(); for (const id of floor) polyT(parts[id].poly); tx.clip();
  const g = tx.createLinearGradient(0, 0, 0, tex.height); g.addColorStop(0, "#1c1338"); g.addColorStop(1, "#0d0920");
  tx.fillStyle = g; tx.fillRect(0, 0, tex.width, tex.height);
  tx.strokeStyle = "rgba(220,205,255,.07)"; tx.lineWidth = 1;
  for (let x = 0; x <= S.d.w; x++) { tx.beginPath(); tx.moveTo(x * TPX, 0); tx.lineTo(x * TPX, tex.height); tx.stroke(); }
  for (let y = 0; y <= S.d.h; y++) { tx.beginPath(); tx.moveTo(0, y * TPX); tx.lineTo(tex.width, y * TPX); tx.stroke(); }
  tx.restore();
  // the colour map, softened
  tx.save(); tx.globalCompositeOperation = "screen"; tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
  tx.filter = "blur(3px) saturate(1.25)"; tx.drawImage(heat, 0, 0, tex.width, tex.height); tx.filter = "none";
  tx.globalAlpha = 0.55; tx.drawImage(heat, 0, 0, tex.width, tex.height); tx.restore();
  // LED edges
  tx.save(); tx.lineJoin = "round"; tx.shadowColor = "rgba(214,196,255,.9)"; tx.shadowBlur = 10; tx.strokeStyle = "rgba(236,226,255,.8)"; tx.lineWidth = 2;
  for (const id of floor) { polyT(parts[id].poly); tx.stroke(); } tx.restore();
  tx.font = `800 ${0.42 * TPX}px Manrope`; tx.fillStyle = "rgba(230,220,255,.28)"; tx.letterSpacing = `${0.12 * TPX}px`;
  tx.fillText(PART.ana_sahne, 0.4 * TPX, 7.55 * TPX); tx.fillText(PART.runway, 8.55 * TPX, 15.55 * TPX); tx.fillText(PART.on_blok, 3.4 * TPX, 23.55 * TPX);
  tx.letterSpacing = "0px";
}
// draw texture rows y0..y1 (m) of the floor at height h, row by row in perspective
function drawPlane(y0, y1, h) {
  const a = proj(0, y0, h)[1], b = proj(0, y1, h)[1], hp = h * SC;
  for (let Y = Math.floor(a); Y < Math.ceil(b); Y++) {
    const v = rowToV(Y - CY, hp), v2 = rowToV(Y + 1 - CY, hp), ym = v / SC + S.d.h / 2, ym2 = v2 / SC + S.d.h / 2; if (ym2 < y0 || ym > y1) continue;
    const k = P / (P - ((v + v2) / 2 * sT + hp * cT)), half = S.d.w / 2 * SC * k, a0 = Math.max(ym, y0), a1 = Math.min(ym2, y1);
    if (a1 <= a0) continue;
    ctx.drawImage(tex, 0, a0 * TPX, tex.width, Math.max(0.5, (a1 - a0) * TPX), CX - half, Y + (a0 - ym) / (ym2 - ym), 2 * half, (a1 - a0) / (ym2 - ym) + 0.02);
  }
}
function polyP(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }

// ── positions: Catmull-Rom through the 2 s samples ──
function pos(m, t) {
  const s = m.s, t0 = s[0][0]; if (t < t0 || t > s[s.length - 1][0]) return null;
  const f = (t - t0) / 2, i = Math.min(Math.floor(f), s.length - 2), u = f - i, p = k => s[Math.max(0, Math.min(s.length - 1, k))];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  const P0 = p(i - 1), P1 = p(i), P2 = p(i + 1), P3 = p(i + 2), near = u < 0.5 ? P1 : P2;
  return { x: cr(P0[1], P1[1], P2[1], P3[1]), y: cr(P0[2], P1[2], P2[2], P3[2]), z: P1[3] + (P2[3] - P1[3]) * u, state: near[5], zone: near[6] };
}

// ── one frame ──
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  const key = `${S.mode}|${S.unc}|${[...S.on].join()}`;
  if (Math.abs(S.dt - S.heatT) > 0.08 || key !== S.heatKey) { updateGrids(); paintHeat(); buildTexture(); S.heatT = S.dt; S.heatKey = key; }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const parts = Object.fromEntries(S.d.parts.map(p => [p.id, p]));
  // floor glow under the stage
  const c0 = proj(S.d.w / 2, S.d.h * 0.55), gl = ctx.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], S.d.w * SC * 0.9);
  gl.addColorStop(0, "rgba(140,110,230,.20)"); gl.addColorStop(1, "rgba(140,110,230,0)"); ctx.fillStyle = gl; ctx.fillRect(0, 0, cv.width, cv.height);
  drawPlane(2.5, S.d.h, 0);
  // raised platform: front face, then its top (the same texture, lifted 3.3 m)
  const pf = parts.platform.poly, ph = parts.platform.h;
  const fy = Math.max(...pf.map(q => q[1])), fx0 = Math.min(...pf.map(q => q[0])), fx1 = Math.max(...pf.map(q => q[0]));
  polyP([proj(fx0, fy, 0), proj(fx1, fy, 0), proj(fx1, fy, ph), proj(fx0, fy, ph)]);
  const fg = ctx.createLinearGradient(0, proj(0, fy, ph)[1], 0, proj(0, fy, 0)[1]); fg.addColorStop(0, "#2a1d52"); fg.addColorStop(1, "#110b24");
  ctx.fillStyle = fg; ctx.fill();
  drawPlane(0, fy, ph);
  ctx.save(); ctx.shadowColor = "rgba(214,196,255,.9)"; ctx.shadowBlur = 10 * DPR; ctx.strokeStyle = "rgba(236,226,255,.85)"; ctx.lineWidth = 1.6 * DPR;
  polyP([proj(fx0, 0, ph), proj(fx1, 0, ph), proj(fx1, fy, ph), proj(fx0, fy, ph)]); ctx.stroke();
  ctx.beginPath(); const a1 = proj(fx0, fy, 0), a2 = proj(fx1, fy, 0); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); ctx.restore();
  // stairs: from the platform edge down to the main stage
  const st = parts.merdiven.poly, sx0 = Math.min(...st.map(q => q[0])), sx1 = Math.max(...st.map(q => q[0])), sy0 = Math.min(...st.map(q => q[1])), sy1 = Math.max(...st.map(q => q[1]));
  ctx.save(); polyP([proj(sx0, sy0, ph), proj(sx1, sy0, ph), proj(sx1, sy1, 0), proj(sx0, sy1, 0)]); ctx.fillStyle = "rgba(34,24,66,.82)"; ctx.fill();
  ctx.strokeStyle = "rgba(236,226,255,.38)"; ctx.lineWidth = 1 * DPR;
  for (let k = 0; k <= 8; k++) { const yy = sy0 + (sy1 - sy0) * k / 8, hh = ph * (1 - k / 8), p1 = proj(sx0, yy, hh), p2 = proj(sx1, yy, hh); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
  ctx.restore();
  ctx.font = `800 ${10.5 * DPR}px Manrope`; ctx.fillStyle = "rgba(230,220,255,.4)"; const pl = proj(0.5, 1.3, ph); ctx.fillText("PLATFORM  +3.3 m", pl[0], pl[1]);
  // soft roads walked so far, on the floor
  const tEnd = S.mode === "all" ? S.d.t1 : S.dt;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.globalCompositeOperation = "screen";
  for (const m of S.d.members) { if (!S.on.has(m.key)) continue;
    ctx.beginPath(); let n = 0; for (const [t, x, y, z] of PATH[m.key]) { if (t > tEnd) break; const q = proj(x, y, z); n++ ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.strokeStyle = rgba(m.color, S.mode === "trail" ? 0.1 : 0.2); ctx.lineWidth = 0.16 * SC; ctx.stroke(); }
  ctx.restore();
  if (S.mode === "all") { drawCrowd(); return; }

  // performers: a beam from the rig, a pool of light, a glowing figure and her name
  const live = S.d.members.filter(m => S.on.has(m.key)).map(m => ({ m, p: pos(m, S.dt) })).filter(o => o.p && (S.unc || o.p.state !== "g"));
  live.sort((a, b) => a.p.y - b.p.y);
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.filter = `blur(${Math.round(5 * DPR)}px)`;
  for (const { m, p } of live) {
    if (p.state === "g") continue;
    const f = proj(p.x, p.y, p.z), top = proj(p.x, p.y, p.z + 11), al = p.state === "n" ? 1 : 0.7;
    const wb = 1.15 * SC * f[2], wt = 0.22 * SC * top[2];
    const bg = ctx.createLinearGradient(0, top[1], 0, f[1]); bg.addColorStop(0, rgba(m.color, 0)); bg.addColorStop(0.7, rgba(m.color, 0.08 * al)); bg.addColorStop(1, rgba(m.color, 0.2 * al));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(top[0] - wt, top[1]); ctx.lineTo(top[0] + wt, top[1]); ctx.lineTo(f[0] + wb, f[1]); ctx.lineTo(f[0] - wb, f[1]); ctx.closePath(); ctx.fill();
    ctx.filter = "none"; ctx.save(); ctx.translate(f[0], f[1]); ctx.scale(1, cT * 0.95); const rp = 1.5 * SC * f[2];
    const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, rp); pg.addColorStop(0, rgba(m.color, 0.75 * al)); pg.addColorStop(0.45, rgba(m.color, 0.25 * al)); pg.addColorStop(1, rgba(m.color, 0));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, rp, 0, 7); ctx.fill(); ctx.restore(); ctx.filter = `blur(${Math.round(5 * DPR)}px)`;
  }
  ctx.restore();
  // figures
  const LBL = [];
  for (const { m, p } of live) {
    const f = proj(p.x, p.y, p.z), hd = proj(p.x, p.y, p.z + 1.65), hidden = p.state === "g", w = 0.42 * SC * f[2];
    if (hidden) {
      ctx.save(); ctx.translate(f[0], f[1]); ctx.scale(1, cT); ctx.setLineDash([3 * DPR, 3 * DPR]); ctx.strokeStyle = rgba(m.color, 0.7); ctx.lineWidth = 1.4 * DPR / cT * 0.7;
      ctx.beginPath(); ctx.arc(0, 0, 0.8 * SC * f[2], 0, 7); ctx.stroke(); ctx.restore();
    } else {
      ctx.save(); ctx.lineCap = "round"; ctx.shadowColor = m.color; ctx.shadowBlur = 16 * DPR;
      const fg2 = ctx.createLinearGradient(0, hd[1], 0, f[1]); fg2.addColorStop(0, "#fff"); fg2.addColorStop(0.35, m.color); fg2.addColorStop(1, rgba(m.color, 0.55));
      ctx.strokeStyle = fg2; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(f[0], f[1] - w * 0.5); ctx.lineTo(hd[0], hd[1] + w * 0.5); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hd[0], hd[1] - w * 0.15, w * 0.48, 0, 7); ctx.fill(); ctx.restore();
    }
    const lp = proj(p.x, p.y, p.z + 2.35);
    LBL.push({ m, hidden, x: lp[0], y: lp[1], x0: lp[0], k: f[2] });
  }
  // name pills, nudged sideways where they would overlap (a line stays a line)
  ctx.font = `800 ${12 * DPR}px Manrope`;
  for (const L of LBL) L.w = ctx.measureText(L.m.name.split(" ")[0]).width + 16 * DPR;
  for (let it = 0; it < 30; it++) { let mv = false;
    for (let i = 0; i < LBL.length; i++) for (let j = i + 1; j < LBL.length; j++) { const a = LBL[i], b = LBL[j], dx = b.x - a.x, need = (a.w + b.w) / 2 + 3 * DPR;
      if (Math.abs(b.y - a.y) < 20 * DPR && Math.abs(dx) < need) { const dir = Math.abs(dx) > 0.5 ? Math.sign(dx) : Math.sign(b.x0 - a.x0) || 1, push = (need - Math.abs(dx)) / 2; a.x -= dir * push; b.x += dir * push; mv = true; } }
    if (!mv) break; }
  for (const L of LBL) { const pr = DISP[L.m.key]; if (pr && Math.abs(pr - L.x) < 60 * DPR && !VID) L.x = pr + (L.x - pr) * 0.3; DISP[L.m.key] = L.x;
    const h = 22 * DPR, x = L.x - L.w / 2, y = L.y - h;
    ctx.save(); ctx.globalAlpha = L.hidden ? 0.45 : 1; ctx.fillStyle = L.hidden ? "rgba(20,14,40,.75)" : L.m.color; ctx.shadowColor = rgba(L.m.color, 0.8); ctx.shadowBlur = L.hidden ? 0 : 14 * DPR;
    ctx.beginPath(); ctx.roundRect(x, y, L.w, h, h / 2); ctx.fill(); ctx.shadowBlur = 0;
    if (L.hidden) { ctx.strokeStyle = L.m.color; ctx.setLineDash([3 * DPR, 2 * DPR]); ctx.lineWidth = 1.2 * DPR; ctx.stroke(); }
    ctx.fillStyle = L.hidden ? L.m.color : "#160e2c"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(L.m.name.split(" ")[0], L.x, y + h / 2 + 0.5 * DPR); ctx.restore(); }
  drawCrowd();
}
// the first rows of the audience: phone lights in front of the stage
const CROWD = Array.from({ length: 170 }, (_, i) => ({ x: Math.random() * 30 - 3, y: 24.6 + Math.random() * 3.2, ph: Math.random() * 6.3, c: i % 7 }));
function drawCrowd() {
  ctx.save(); ctx.globalCompositeOperation = "lighter"; const now = VID ? S.t * 1000 : performance.now();
  for (const c of CROWD) { const q = proj(c.x, c.y, 1.4); if (q[1] > cv.height || q[0] < 0 || q[0] > cv.width) continue;
    const a = 0.25 + 0.25 * Math.sin(now / 900 + c.ph); ctx.fillStyle = c.c === 0 ? `rgba(255,214,140,${a})` : `rgba(220,210,255,${a * 0.8})`;
    ctx.beginPath(); ctx.arc(q[0], q[1], 1.3 * DPR * q[2], 0, 7); ctx.fill(); }
  ctx.restore();
}

// ── cast chips ──
function cast() {
  $("#cast").innerHTML = S.d.members.map(m => `<div class="chip" data-k="${m.key}" style="--c:${m.color}" title="${m.path_m} m walked${m.rel ? ` · mostly stage ${m.rel.side} · next to ${m.rel.neighbour} ${m.rel.neighbour_pct}% of the time` : ""}">
    <span class="dot"></span><span class="nm">${m.name.split(" ")[0]}</span><span class="zn" id="zn-${m.key}"></span></div>`).join("");
  $("#cast").querySelectorAll(".chip").forEach(c => c.onclick = () => {
    const k = c.dataset.k, all = S.on.size === S.d.members.length;
    if (all) S.on = new Set([k]); else if (S.on.has(k)) { S.on.delete(k); if (!S.on.size) S.on = new Set(S.d.members.map(m => m.key)); } else S.on.add(k);
    $("#cast").querySelectorAll(".chip").forEach(x => { x.classList.toggle("off", !S.on.has(x.dataset.k)); x.classList.toggle("solo", S.on.size < S.d.members.length && S.on.has(x.dataset.k)); });
    S.dirty = true;
  });
}
function nowZones() { for (const m of S.d.members) { const p = pos(m, S.dt), el = document.getElementById(`zn-${m.key}`); if (el) el.textContent = !p ? "" : p.state === "g" ? "out of frame" : (ZN[p.zone] || ""); } }

// ── the song as six lanes: where each performer was visible, brighter when clearly seen ──
const T0 = 20, T1 = 300, tX = (t, w) => (t - T0) / (T1 - T0) * w;
function lanes() {
  const c = $("#lanes"), r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); if (!r.width) return;
  c.width = r.width * d; c.height = r.height * d; const g = c.getContext("2d"), n = S.d.members.length, lh = c.height / n;
  g.clearRect(0, 0, c.width, c.height); g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(0, 0, c.width, c.height);
  S.d.members.forEach((m, i) => { for (const s of m.s) { const a = s[5] === "n" ? 0.95 : s[5] === "y" ? 0.6 : s[5] === "s" ? 0.38 : 0;
    if (!a) continue; const x0 = tX(toVideo(s[0] - 1), c.width), x1 = tX(toVideo(s[0] + 1), c.width);
    g.fillStyle = rgba(m.color, a); g.fillRect(x0, i * lh + lh * 0.18, x1 - x0 + 0.6, lh * 0.64); } });
  $("#marks").innerHTML = (S.d.moments || []).filter(m => m.t != null).map(m => `<span data-t="${m.t}" style="left:${(100 * (m.t - T0) / (T1 - T0)).toFixed(2)}%">${m.title}</span>`).join("");
  const sp = [...$("#marks").children]; let prev = null;                 // alternate rows where labels would collide
  for (const el of sp) { const b = el.getBoundingClientRect(); if (prev && b.left < prev.r + 8 && !prev.lo) { el.classList.add("lo"); prev = { r: b.right, lo: true }; } else prev = { r: b.right, lo: false }; }
}

// ── moments: lower third ──
function nowMoment() {
  const ms = (S.d.moments || []).filter(m => m.t != null); let cur = null; for (const m of ms) if (m.t <= S.t + 0.5) cur = m;
  const el = $("#cap");
  if (!cur || S.t > 302) { el.classList.remove("on"); }
  else { if (el.dataset.t !== String(cur.t)) { el.dataset.t = cur.t; el.classList.remove("on"); void el.offsetWidth; el.innerHTML = `<div class="k">${fmt(cur.t)}</div><b>${cur.title}</b><span>${cur.text}</span>`; } el.classList.add("on"); }
  document.querySelectorAll("#marks span").forEach(s => s.classList.toggle("cur", cur && +s.dataset.t === cur.t));
}

// ── YouTube: the video is the clock ──
window.onYouTubeIframeAPIReady = () => {
  S.yt = new YT.Player("yt", { videoId: S.d.video, playerVars: { start: 20, playsinline: 1, rel: 0, modestbranding: 1 },
    events: { onReady: () => { S.ytReady = true; $("#clockNote").textContent = "In sync: drag the timeline or tap a moment."; },
      onStateChange: e => { S.playing = e.data === 1; playIcon(); },
      onError: () => { S.ytReady = false; $("#clockNote").textContent = "Video unavailable here: the map runs on its own clock."; } } });
};
function playIcon() { $("#playIcon").setAttribute("d", S.playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M8 5v14l11-7z"); }
function setT(t, seek) { S.t = Math.max(T0, Math.min(T1, t)); S.dirty = true; S.anchor = null; if (seek && S.ytReady) S.yt.seekTo(Math.max(0, S.t - S.off), true); }

function frameUI() {
  S.dt = toData(S.t); draw(); nowZones(); nowMoment();
  $("#time").value = S.t; $("#clock").textContent = fmt(S.t); $("#head").style.left = `${(100 * (S.t - T0) / (T1 - T0)).toFixed(3)}%`;
}
function loop(now) {
  const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
  if (S.ytReady && S.yt.getPlayerState && S.yt.getPlayerState() === 1) {
    // the player reports its time in coarse steps: run our own clock between reports, re-anchor only on real jumps
    const vt = S.yt.getCurrentTime(), rate = S.yt.getPlaybackRate ? S.yt.getPlaybackRate() : 1;
    if (vt !== S.rawVt || !S.anchor) { const pred = S.anchor ? S.anchor.vt + (now - S.anchor.pf) / 1000 * rate : vt;
      if (!S.anchor || Math.abs(pred - vt) > 0.25) S.anchor = { vt, pf: now }; else S.anchor = { vt: pred + (vt - pred) * 0.1, pf: now }; S.rawVt = vt; }
    S.t = S.anchor.vt + (now - S.anchor.pf) / 1000 * rate + S.off; S.dirty = true;
  } else if (!S.ytReady && S.playing) { S.t += dt; if (S.t >= T1) { S.playing = false; playIcon(); } S.dirty = true; }
  else S.anchor = null;
  if (S.mode !== "all") S.dirty = true;                      // the crowd lights twinkle
  if (S.dirty) { frameUI(); S.dirty = false; }
  if (!VID) requestAnimationFrame(loop);
}
window.renderAt = t => { S.t = t; frameUI(); };             // used by the video renderer

async function init() {
  S.d = await fetch("data/stage.json?v=6").then(r => r.json());
  S.on = new Set(S.d.members.map(m => m.key));
  $("#nObs").textContent = S.d.kinds.gozlem;
  for (const m of S.d.members) { PATH[m.key] = []; for (let t = S.d.t0; t <= S.d.t1 + 0.01; t += 0.25) { const p = pos(m, t); if (p) PATH[m.key].push([t, p.x, p.y, p.z]); } }
  $("#facts").innerHTML = S.d.moments.filter(m => m.t == null).map(m => `<div class="fact"><b>${m.title}</b><span>${m.text}</span></div>`).join("");
  initGrids(); cast(); resize();
  new ResizeObserver(resize).observe(cv);
  if (!VID) { const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag); }
  $("#play").onclick = () => {
    if (S.ytReady) { S.playing ? S.yt.pauseVideo() : (S.yt.seekTo(Math.max(0, S.t - S.off), true), S.yt.playVideo()); }
    else { S.playing = !S.playing; if (S.t >= T1 - 1) S.t = 27; playIcon(); }
  };
  $("#time").oninput = e => setT(+e.target.value, true);
  $("#marks").onclick = e => { const t = e.target.dataset?.t; if (t) setT(+t - 0.5, true); };
  document.querySelectorAll(".modes button").forEach(b => b.onclick = () => { document.querySelectorAll(".modes button").forEach(x => x.classList.toggle("on", x === b)); S.mode = b.dataset.mode; S.dirty = true; });
  $("#unc").onchange = e => { S.unc = e.target.checked; S.dirty = true; };
  const setOff = v => { S.off = Math.max(-6, Math.min(6, v)); $("#offv").textContent = `${S.off > 0 ? "+" : ""}${S.off.toFixed(1)} s`; S.dirty = true; };
  $("#nudgeM").onclick = () => setOff(S.off - 0.5); $("#nudgeP").onclick = () => setOff(S.off + 0.5);
  $("#vmin").onclick = () => { $("#vcard").classList.toggle("min"); $("#vmin").textContent = $("#vcard").classList.contains("min") ? "+" : "–"; };
  $("#about").onclick = () => { $("#drawer").hidden = false; }; $("#dclose").onclick = () => { $("#drawer").hidden = true; };
  $("#drawer").onclick = e => { if (e.target.id === "drawer") $("#drawer").hidden = true; };
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); $("#play").click(); }
    if (e.key === "ArrowRight") setT(S.t + 2, true); if (e.key === "ArrowLeft") setT(S.t - 2, true);
    if (e.key === ",") $("#nudgeM").click(); if (e.key === ".") $("#nudgeP").click(); if (e.key === "Escape") $("#drawer").hidden = true;
  });
  document.fonts?.ready.then(() => { lanes(); S.heatKey = ""; S.dirty = true; });
  S.ready = true;
  requestAnimationFrame(loop);
}
init();
