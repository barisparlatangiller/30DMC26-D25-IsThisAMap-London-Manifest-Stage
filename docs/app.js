/* Is a stage a map? Manifest at OVO Arena Wembley · #30DayMapChallenge 2026 · Day 25
   The stage in 3D (three.js): turn it to any angle. The YouTube player is the clock; every performer is a spotlight with
   her name standing above her, and the floor keeps the colour of whoever stood there. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const ZN = { platform: "Platform", merdiven: "Stairs", ana_sahne_on: "Main stage", runway: "Runway", on_blok: "Front block" };
const CELL = 0.2, R = 3.2, TRAIL = 12, TAU = 18, FLOOR = 0.45, HPX = 10;     // heat cell (m), glow radius (m), heat texture px per m
const $ = s => document.querySelector(s);
const fmt = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const VID = new URLSearchParams(location.search).has("video");
if (VID) document.body.classList.add("vid");

const S = { d: null, t: 29, dt: 26, mode: "acc", unc: true, off: 0, on: new Set(), playing: false, yt: null, ytReady: false,
  last: performance.now(), dirty: true, grids: {}, recent: {}, applied: {}, accKey: "", heatT: -99, heatKey: "" };
window.S = S;
let GW = 0, GH = 0, KER = null, KR = 0, IMG = null, BASE = 0;     // BASE: main-stage height; the 3D scene puts the main stage at y = 0
const heat = document.createElement("canvas"), hx = heat.getContext("2d");
const htex = document.createElement("canvas"), tx = htex.getContext("2d");

// ── clocks: the video drives everything; the positions were noted on a clock that runs unevenly against it ──
function toData(v) {
  const w = S.d.warp; if (v <= w[0][1]) return v - (w[0][1] - w[0][0]);
  for (let i = 1; i < w.length; i++) if (v <= w[i][1]) { const f = (v - w[i - 1][1]) / (w[i][1] - w[i - 1][1]); return w[i - 1][0] + f * (w[i][0] - w[i - 1][0]); }
  return v - (w[w.length - 1][1] - w[w.length - 1][0]);
}
function toVideo(d) {
  const w = S.d.warp; if (d <= w[0][0]) return d + (w[0][1] - w[0][0]);
  for (let i = 1; i < w.length; i++) if (d <= w[i][0]) { const f = (d - w[i - 1][0]) / (w[i][0] - w[i - 1][0]); return w[i - 1][1] + f * (w[i][1] - w[i - 1][1]); }
  return d + (w[w.length - 1][1] - w[w.length - 1][0]);
}

// ── heat grids (smooth kernel, zero at R) ──
function initGrids() {
  GW = Math.round(S.d.w / CELL); GH = Math.round(S.d.h / CELL);
  heat.width = GW; heat.height = GH; IMG = hx.createImageData(GW, GH);
  KR = Math.round(R / CELL); KER = new Float32Array((2 * KR + 1) ** 2);
  for (let j = -KR; j <= KR; j++) for (let i = -KR; i <= KR; i++) { const q = (i * i + j * j) / (KR * KR); KER[(j + KR) * (2 * KR + 1) + (i + KR)] = q < 1 ? (1 - q) ** 2 : 0; }
  for (const m of S.d.members) { S.grids[m.key] = new Float32Array(GW * GH); S.recent[m.key] = new Float32Array(GW * GH); S.applied[m.key] = 0; }
  htex.width = Math.round(S.d.w * HPX); htex.height = Math.round(S.d.h * HPX);
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
function paintHeat() {     // the performer with more presence leads (weights³), so overlaps keep a hue
  const ms = S.d.members.filter(m => S.on.has(m.key)), cols = ms.map(m => hex(m.color)), gs = ms.map(m => S.grids[m.key]), rs = ms.map(m => S.recent[m.key]);
  const fl = S.mode === "acc" ? FLOOR : 1, rc = S.mode === "acc" ? 1 - FLOOR : 0, K = S.mode === "trail" ? 1.1 : S.mode === "acc" ? 3.2 : 5.5, px = IMG.data;
  for (let p = 0, q = 0; p < GW * GH; p++, q += 4) {
    let T = 0, sw = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < gs.length; i++) { const v = fl * gs[i][p] + rc * rs[i][p]; if (v <= 0) continue; T += v; const w = v * v * v; sw += w; r += cols[i][0] * w; g += cols[i][1] * w; b += cols[i][2] * w; }
    if (T < 1e-3) { px[q + 3] = 0; continue; }
    px[q] = r / sw; px[q + 1] = g / sw; px[q + 2] = b / sw; px[q + 3] = 255 * 0.95 * (1 - Math.exp(-T / K));
  }
  hx.putImageData(IMG, 0, 0);
  // the floor texture: soft colour, only on the stage (a faint grid underneath)
  tx.clearRect(0, 0, htex.width, htex.height);
  tx.lineWidth = 1;                                        // a very light 1 m grid, just enough to read distances
  for (let x = 0; x <= S.d.w; x++) { tx.strokeStyle = x % 4 ? "rgba(220,205,255,.018)" : "rgba(220,205,255,.032)"; tx.beginPath(); tx.moveTo(x * HPX + 0.5, 0); tx.lineTo(x * HPX + 0.5, htex.height); tx.stroke(); }
  for (let y = 0; y <= S.d.h; y++) { tx.strokeStyle = y % 4 ? "rgba(220,205,255,.018)" : "rgba(220,205,255,.032)"; tx.beginPath(); tx.moveTo(0, y * HPX + 0.5); tx.lineTo(htex.width, y * HPX + 0.5); tx.stroke(); }
  tx.imageSmoothingEnabled = true; tx.filter = "blur(2px)"; tx.drawImage(heat, 0, 0, htex.width, htex.height); tx.filter = "none";
  tx.globalAlpha = 0.6; tx.drawImage(heat, 0, 0, htex.width, htex.height); tx.globalAlpha = 1;
  tx.globalCompositeOperation = "destination-in"; tx.fillStyle = "#fff";
  tx.beginPath();                                          // one path for all parts: destination-in keeps their union
  for (const p of S.d.parts) if (["ana_sahne", "runway", "on_blok", "platform"].includes(p.id)) { p.poly.forEach(([x, y], i) => i ? tx.lineTo(x * HPX, y * HPX) : tx.moveTo(x * HPX, y * HPX)); tx.closePath(); }
  tx.fill("nonzero");
  tx.globalCompositeOperation = "source-over";
  G.floorTex.needsUpdate = true; G.platTex.needsUpdate = true;
}

// ── positions: Catmull-Rom through the 2 s samples; everyone stays on stage from the first to the last sample ──
function pos(m, t) {
  const s = m.s; t = Math.max(s[0][0], Math.min(s[s.length - 1][0], t));
  const f = (t - s[0][0]) / 2, i = Math.min(Math.floor(f), s.length - 2), u = f - i, p = k => s[Math.max(0, Math.min(s.length - 1, k))];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  const P0 = p(i - 1), P1 = p(i), P2 = p(i + 1), P3 = p(i + 2), near = u < 0.5 ? P1 : P2;
  return { x: cr(P0[1], P1[1], P2[1], P3[1]), y: cr(P0[2], P1[2], P2[2], P3[2]), z: P1[3] + (P2[3] - P1[3]) * u, state: near[5], zone: near[6] };
}
const W3 = (x, y, h = 0) => new THREE.Vector3(x - S.d.w / 2, h, y - S.d.h / 2);     // data (x right, y toward the crowd) → three (y up)

// ── the 3D scene ──
const G = {}; window.G = G;
function shape(poly) { const sh = new THREE.Shape(); poly.forEach(([x, y], i) => i ? sh.lineTo(x - S.d.w / 2, y - S.d.h / 2) : sh.moveTo(x - S.d.w / 2, y - S.d.h / 2)); return sh; }
function box(poly, top, bottom, mat) {        // an extruded stage part: polygon in data metres, top/bottom heights in scene metres
  const g = new THREE.ExtrudeGeometry(shape(poly), { depth: top - bottom, bevelEnabled: false });
  g.rotateX(Math.PI / 2); g.translate(0, top, 0);           // shape (x, y) → (x, ·, y), extruded downward from `top`
  return new THREE.Mesh(g, mat);
}
function edges(poly, h, col = 0xece2ff, op = 0.9) {
  const pts = poly.map(([x, y]) => W3(x, y, h + 0.02)); const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }));
}
function labelSprite(name, color) {           // the name stands upright above her, read bottom to top
  const c = document.createElement("canvas"), k = 4, w = 34 * k, h = 30 + name.length * 13; c.width = w; c.height = h * k;
  const g = c.getContext("2d"); g.scale(k, k);
  g.fillStyle = color; g.beginPath(); g.roundRect(2, 2, w / k - 4, h - 4, (w / k - 4) / 2); g.fill();
  g.translate(w / k / 2, h / 2); g.rotate(-Math.PI / 2); g.fillStyle = "#160e2c"; g.font = "800 17px Manrope, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 0, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(0.62 * (w / k) / 34, 0.62 * h / 34, 1); sp.center.set(0.5, 0); sp.renderOrder = 10; return sp;
}
function glowTex(inner = 1) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(255,255,255,${inner})`); gr.addColorStop(0.35, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
function beamTex() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d");
  const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, "rgba(255,255,255,0)"); v.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = v; g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = "destination-in"; const hgr = g.createLinearGradient(0, 0, 64, 0); hgr.addColorStop(0, "rgba(0,0,0,0)"); hgr.addColorStop(0.5, "rgba(0,0,0,1)"); hgr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = hgr; g.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c);
}
function buildScene() {
  const el = $("#stage");
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: VID });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(r.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x0a0716, 0.012);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.dampingFactor = 0.08; ctl.maxPolarAngle = Math.PI * 0.49; ctl.minDistance = 8; ctl.maxDistance = 80;
  ctl.target.set(0, 0, 2); ctl.addEventListener("start", () => setView(null));
  scene.add(new THREE.HemisphereLight(0xd6c8ff, 0x140c2b, 0.9)); const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(-8, 20, 14); scene.add(dl);
  Object.assign(G, { r, scene, cam, ctl, el });

  const parts = Object.fromEntries(S.d.parts.map(p => [p.id, p])); BASE = parts.ana_sahne.h;
  const deck = new THREE.MeshStandardMaterial({ color: 0x221a42, roughness: 0.38, metalness: 0.35 });
  const side = new THREE.MeshStandardMaterial({ color: 0x120c26, roughness: 0.8, emissive: 0x0d0820 });
  const floorH = -BASE;                                                    // the arena floor
  for (const id of ["ana_sahne", "runway", "on_blok"]) { scene.add(box(parts[id].poly, 0, floorH, [deck, side])); scene.add(edges(parts[id].poly, 0)); }
  const ph = parts.platform.h - BASE; scene.add(box(parts.platform.poly, ph, 0, [deck, side])); scene.add(edges(parts.platform.poly, ph));
  // stairs: 5 wide steps from the platform down to the main stage
  const st = parts.merdiven.poly, sx0 = Math.min(...st.map(q => q[0])), sx1 = Math.max(...st.map(q => q[0])), sy0 = Math.min(...st.map(q => q[1])), sy1 = Math.max(...st.map(q => q[1]));
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x2a1d52, roughness: 0.5, metalness: 0.2 }), edgeMat = new THREE.LineBasicMaterial({ color: 0xece2ff, transparent: true, opacity: 0.5 });
  const NS = 5; for (let k = 0; k < NS; k++) { const y0 = sy0 + (sy1 - sy0) * k / NS, y1 = sy0 + (sy1 - sy0) * (k + 1) / NS, h = ph * (1 - (k + 0.5) / NS);
    const g = new THREE.BoxGeometry(sx1 - sx0, h, y1 - y0); const m = new THREE.Mesh(g, stepMat); m.position.copy(W3((sx0 + sx1) / 2, (y0 + y1) / 2, h / 2)); scene.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat); e.position.copy(m.position); scene.add(e); }
  // backdrop: a lilac arch screen behind the platform, as on the night, with the band's name (set in our own type, not their logo)
  { const c = document.createElement("canvas"); c.width = 2048; c.height = 900; const g = c.getContext("2d");
    const gr = g.createRadialGradient(1024, 900, 80, 1024, 900, 980); gr.addColorStop(0, "#f1e4fb"); gr.addColorStop(0.55, "#d9c3f2"); gr.addColorStop(0.9, "rgba(185,150,230,.55)"); gr.addColorStop(1, "rgba(185,150,230,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(1024, 900, 900, 860, 0, Math.PI, 2 * Math.PI); g.fill();
    g.font = "800 190px Manrope, sans-serif"; g.textAlign = "center"; g.letterSpacing = "38px"; g.fillStyle = "rgba(40,22,70,.82)"; g.fillText("MANIFEST", 1044, 470);
    g.letterSpacing = "0px"; g.strokeStyle = "rgba(40,22,70,.5)"; g.lineWidth = 6; g.beginPath(); g.moveTo(560, 520); g.quadraticCurveTo(1024, 560, 1490, 515); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; G.backTex = t; G.backCanvas = c;
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(22, 22 * 900 / 2048), new THREE.MeshBasicMaterial({ map: t, color: 0x6f5f8c, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    bd.position.set(0, ph + 22 * 900 / 2048 / 2 - 0.2, -S.d.h / 2 - 0.6); bd.renderOrder = -1; scene.add(bd); G.backdrop = bd; }
  // the colour map, on the stage and on the platform
  G.floorTex = new THREE.CanvasTexture(htex); G.floorTex.colorSpace = THREE.SRGBColorSpace;
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(S.d.w, S.d.h), new THREE.MeshBasicMaterial({ map: G.floorTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  fm.rotation.x = -Math.PI / 2; fm.position.y = 0.012; scene.add(fm);
  const pd = Math.max(...parts.platform.poly.map(q => q[1]));
  G.platTex = new THREE.CanvasTexture(htex); G.platTex.colorSpace = THREE.SRGBColorSpace; G.platTex.repeat.set(1, pd / S.d.h); G.platTex.offset.set(0, 1 - pd / S.d.h);
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(S.d.w, pd), new THREE.MeshBasicMaterial({ map: G.platTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  pm.rotation.x = -Math.PI / 2; pm.position.set(0, ph + 0.012, pd / 2 - S.d.h / 2); scene.add(pm);
  // arena floor and the crowd's phone lights
  const af = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x0b0718, roughness: 1 })); af.rotation.x = -Math.PI / 2; af.position.y = floorH - 0.01; scene.add(af);
  const N = 900, cp = new Float32Array(N * 3), cc = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { let x, y; do { x = Math.random() * 46 - 23; y = Math.random() * 30 - 4; } while (y < 25 && (x > -12 && x < 12 && y < 13) || (y < 25 && x > -9 && x < 9));
    cp.set([x, floorH + 1.5 + Math.random() * 0.3, y], i * 3); const warm = Math.random() < 0.18; cc.set(warm ? [1, 0.84, 0.55] : [0.86, 0.82, 1], i * 3); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.BufferAttribute(cp, 3)); cg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  G.crowd = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex() }));
  scene.add(G.crowd);
  // performers
  const gt = glowTex(), bt = beamTex(); G.p = {};
  for (const m of S.d.members) {
    const col = new THREE.Color(m.color), grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 6, 14), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.85, roughness: 0.4 }));
    body.position.y = 0.73; grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 }));
    head.position.y = 1.52; grp.add(head);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: gt, color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03; grp.add(pool);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.15, 10, 24, 1, true), new THREE.MeshBasicMaterial({ map: bt, color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 5; grp.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; grp.add(ring);
    const lbl = labelSprite(m.name.split(" ")[0], m.color); lbl.position.y = 2.05; grp.add(lbl);
    scene.add(grp); G.p[m.key] = { grp, body, head, pool, beam, ring, lbl };
  }
  // walked paths, thin lines on the stage
  G.paths = {};
  for (const m of S.d.members) { const geo = new THREE.BufferGeometry(); const arr = new Float32Array(S.PATH[m.key].length * 3); geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    S.PATH[m.key].forEach(([t, x, y, z], i) => { const v = W3(x, y, z - BASE + 0.05); arr.set([v.x, v.y, v.z], i * 3); }); geo.setDrawRange(0, 0);
    const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: m.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(ln); G.paths[m.key] = ln; }
  // bloom
  const comp = new EffectComposer(r); comp.addPass(new RenderPass(scene, cam));
  G.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.7); comp.addPass(G.bloom); comp.addPass(new OutputPass()); G.comp = comp;
  setView("audience", true);
}

// ── camera views ──
const VIEWS = { audience: { p: [0, 15, 33], t: [0, -0.5, -1] }, top: { p: [0, 50, 3.2], t: [0, 0, 0.6] }, side: { p: [-36, 15, 12], t: [0, 0, 2.5] }, orbit: null };
function setView(v, now) {
  document.querySelectorAll(".views button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  G.view = v; G.ctl.autoRotate = v === "orbit"; G.ctl.autoRotateSpeed = 0.7;
  if (!v || v === "orbit") { G.fly = null; if (v === "orbit" && G.cam.position.y > 20) G.fly = { from: G.cam.position.clone(), ft: G.ctl.target.clone(), to: new THREE.Vector3(...VIEWS.audience.p), tt: new THREE.Vector3(...VIEWS.audience.t), t0: performance.now() }; return; }
  const to = new THREE.Vector3(...VIEWS[v].p), tt = new THREE.Vector3(...VIEWS[v].t);
  if (now) { G.cam.position.copy(to); G.ctl.target.copy(tt); G.ctl.update(); return; }
  G.fly = { from: G.cam.position.clone(), ft: G.ctl.target.clone(), to, tt, t0: performance.now() };
}
function stepFly(now) {
  if (!G.fly) return; const k = Math.min(1, (now - G.fly.t0) / 1100), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  G.cam.position.lerpVectors(G.fly.from, G.fly.to, e); G.ctl.target.lerpVectors(G.fly.ft, G.fly.tt, e); if (k >= 1) G.fly = null;
}
function resize() {
  const r = G.el.getBoundingClientRect(); G.r.setSize(r.width, r.height, false); G.comp.setSize(r.width, r.height);
  G.cam.aspect = r.width / r.height;
  // keep the whole stage in view: wider lens on narrow screens, and leave room for the panels on desktop
  G.cam.fov = r.width / r.height < 1 ? 52 : 38; G.cam.setViewOffset(r.width, r.height, (VID || r.width <= 900) ? 0 : r.width * 0.06, (VID || r.width <= 900) ? 0 : r.height * 0.04, r.width, r.height);
  G.cam.updateProjectionMatrix();
  document.documentElement.style.setProperty("--vtop", `${$("#vcard").getBoundingClientRect().height + 10}px`);
  lanes(); S.dirty = true;
}

// ── one frame ──
function update(now) {
  const key = `${S.mode}|${S.unc}|${[...S.on].join()}`;
  if (Math.abs(S.dt - S.heatT) > 0.08 || key !== S.heatKey) { updateGrids(); paintHeat(); S.heatT = S.dt; S.heatKey = key; }
  const tEnd = S.mode === "all" ? S.d.t1 : S.dt;
  for (const m of S.d.members) {
    const P = G.p[m.key], on = S.on.has(m.key), p = pos(m, S.dt), hidden = p.state === "g";
    P.grp.visible = on; G.paths[m.key].visible = on;
    if (!on) continue;
    P.grp.position.copy(W3(p.x, p.y, p.z - BASE));
    const full = S.mode !== "all", vis = hidden ? 0.35 : 1;
    P.body.material.opacity = vis; P.body.material.transparent = hidden; P.body.material.emissiveIntensity = hidden ? 0.25 : 0.85;
    P.head.material.opacity = vis; P.head.material.transparent = hidden;
    P.beam.visible = full && !hidden; P.pool.visible = full && !hidden; P.ring.visible = hidden; P.lbl.material.opacity = hidden ? 0.6 : 1;
    P.body.visible = P.head.visible = full || true;
    let n = 0; const arr = S.PATH[m.key]; while (n < arr.length && arr[n][0] <= tEnd) n++; G.paths[m.key].geometry.setDrawRange(0, n);
  }
  // spread the upright names a little where two would overlap on screen
  const L = S.d.members.filter(m => S.on.has(m.key)).map(m => { const P = G.p[m.key]; const v = P.grp.position.clone(); v.y += 2.1; v.project(G.cam); return { P, x: v.x, y: v.y, dx: 0 }; });
  const minDx = 0.062 * (G.el.clientHeight / G.el.clientWidth) * 1.4;
  // keep the left-to-right order: sweep sorted by screen x, then re-centre each pushed cluster on its own centre
  L.sort((a, b) => a.x - b.x); const nx = L.map(o => o.x);
  for (let i = 1; i < L.length; i++) if (Math.abs(L[i].y - L[i - 1].y) < 0.25 && nx[i] < nx[i - 1] + minDx) nx[i] = nx[i - 1] + minDx;
  for (let i = 0; i < L.length;) { let j = i; while (j + 1 < L.length && nx[j + 1] - nx[j] <= minDx + 1e-9 && Math.abs(L[j + 1].y - L[j].y) < 0.25) j++;
    let sh = 0; for (let k = i; k <= j; k++) sh += L[k].x - nx[k]; sh /= (j - i + 1); for (let k = i; k <= j; k++) L[k].dx = nx[k] + sh - L[k].x; i = j + 1; }
  for (const o of L) { const tgt = o.dx * G.cam.position.distanceTo(o.P.grp.position) * 0.55; o.P.lx = o.P.lx == null || VID ? tgt : o.P.lx + (tgt - o.P.lx) * 0.2;
    const right = new THREE.Vector3().setFromMatrixColumn(G.cam.matrixWorld, 0); o.P.lbl.position.set(right.x * o.P.lx, 2.05, right.z * o.P.lx); }
  // phone lights twinkle
  G.crowd.material.opacity = 0.55 + 0.15 * Math.sin((VID ? S.t * 1000 : now) / 700);
}
function render(now) { stepFly(now); G.ctl.update(); update(now); G.comp.render(); drawPlan(); }
// the flat plan (top view), drawn next to the 3D stage
function drawPlan() {
  const c = $("#plan"); if (!c || !c.offsetWidth) return; const d = Math.min(2, window.devicePixelRatio || 1), W = c.offsetWidth * d, H = c.offsetHeight * d;
  if (c.width !== W) { c.width = W; c.height = H; } const g = c.getContext("2d"), pad = 10 * d, k = Math.min((W - 2 * pad) / S.d.w, (H - 2 * pad) / S.d.h), ox = (W - S.d.w * k) / 2, oy = (H - S.d.h * k) / 2;
  g.clearRect(0, 0, W, H); g.save(); g.translate(ox, oy);
  for (const p of S.d.parts) { g.beginPath(); p.poly.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath();
    g.fillStyle = p.id === "platform" ? "rgba(60,44,110,.55)" : p.id === "merdiven" ? "rgba(80,60,140,.5)" : "rgba(30,20,62,.7)"; g.fill(); g.strokeStyle = "rgba(236,226,255,.45)"; g.lineWidth = 1 * d; g.stroke(); }
  g.globalCompositeOperation = "screen"; g.drawImage(htex, 0, 0, S.d.w * k, S.d.h * k); g.globalCompositeOperation = "source-over";
  for (const m of S.d.members) { if (!S.on.has(m.key)) continue; const p = pos(m, S.dt), hidden = p.state === "g";
    g.beginPath(); g.arc(p.x * k, p.y * k, 4.2 * d, 0, 7); g.fillStyle = hidden ? "rgba(20,14,40,.8)" : m.color; g.fill(); g.lineWidth = 1.4 * d; g.strokeStyle = hidden ? m.color : "#fff"; g.stroke(); }
  g.restore();
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
function nowZones() { for (const m of S.d.members) { const p = pos(m, S.dt), el = document.getElementById(`zn-${m.key}`); if (el) el.textContent = (ZN[p.zone] || "") + (p.state === "g" ? " · off camera" : ""); } }

// ── the song as six lanes ──
const T0 = 20, T1 = 300;
function lanes() {
  const c = $("#lanes"), r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); if (!r.width) return;
  c.width = r.width * d; c.height = r.height * d; const g = c.getContext("2d"), n = S.d.members.length, lh = c.height / n, X = t => (t - T0) / (T1 - T0) * c.width;
  g.clearRect(0, 0, c.width, c.height); g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(0, 0, c.width, c.height);
  S.d.members.forEach((m, i) => { for (const s of m.s) { const a = s[5] === "n" ? 0.95 : s[5] === "y" ? 0.6 : s[5] === "s" ? 0.38 : 0.12;
    const x0 = X(toVideo(s[0] - 1)), x1 = X(toVideo(s[0] + 1)); g.fillStyle = rgba(m.color, a); g.fillRect(x0, i * lh + lh * 0.18, x1 - x0 + 0.6, lh * 0.64); } });
  $("#marks").innerHTML = (S.d.moments || []).filter(m => m.t != null).map(m => `<span data-t="${m.t}" style="left:${(100 * (m.t - T0) / (T1 - T0)).toFixed(2)}%">${m.title}</span>`).join("");
  let prev = null; for (const el of $("#marks").children) { const b = el.getBoundingClientRect(); if (prev && b.left < prev.r + 8 && !prev.lo) { el.classList.add("lo"); prev = { r: b.right, lo: true }; } else prev = { r: b.right, lo: false }; }
}
function nowMoment() {
  const ms = (S.d.moments || []).filter(m => m.t != null); let cur = null; for (const m of ms) if (m.t <= S.t + 0.5) cur = m;
  const el = $("#cap");
  if (!cur || S.t > 302) el.classList.remove("on");
  else { if (el.dataset.t !== String(cur.t)) { el.dataset.t = cur.t; el.classList.remove("on"); void el.offsetWidth; el.innerHTML = `<div class="k">${fmt(cur.t)}</div><b>${cur.title}</b><span>${cur.text}</span>`; } el.classList.add("on"); }
  document.querySelectorAll("#marks span").forEach(s => s.classList.toggle("cur", cur && +s.dataset.t === cur.t));
}

// ── YouTube: the video is the clock ──
window.onYouTubeIframeAPIReady = () => {
  S.yt = new YT.Player("yt", { videoId: S.d.video, playerVars: { start: 20, playsinline: 1, rel: 0, modestbranding: 1 },
    events: { onReady: () => { S.ytReady = true; $("#clockNote").textContent = "In sync: drag the timeline or tap a moment."; },
      onStateChange: e => { S.playing = e.data === 1; playIcon(); if (e.data === 1) S.anchor = null; },
      onError: () => { S.ytReady = false; $("#clockNote").textContent = "Video unavailable here: the map runs on its own clock."; } } });
};
function playIcon() { $("#playIcon").setAttribute("d", S.playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M8 5v14l11-7z"); }
function setT(t, seek) { S.t = Math.max(T0, Math.min(T1, t)); S.dirty = true; S.anchor = null; if (seek && S.ytReady) S.yt.seekTo(Math.max(0, S.t - S.off), true); }
function frameUI(now) {
  S.dt = toData(S.t); render(now); nowZones(); nowMoment();
  $("#time").value = S.t; $("#clock").textContent = fmt(S.t); $("#head").style.left = `${(100 * (S.t - T0) / (T1 - T0)).toFixed(3)}%`;
}
function loop(now) {
  const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
  if (S.ytReady && S.yt.getPlayerState && S.yt.getPlayerState() === 1) {
    // the player reports its time in coarse steps: run our own clock between reports, re-anchor on real jumps
    const vt = S.yt.getCurrentTime(), rate = S.yt.getPlaybackRate ? S.yt.getPlaybackRate() : 1;
    if (vt < T0 - 1 && S.t > T0 + 4) { frameUI(now); if (!VID) requestAnimationFrame(loop); return; }   // an ad (or the intro): hold the map
    if (vt !== S.rawVt || !S.anchor) { const pred = S.anchor ? S.anchor.vt + (now - S.anchor.pf) / 1000 * rate : vt;
      if (!S.anchor || Math.abs(pred - vt) > 0.25) S.anchor = { vt, pf: now }; else S.anchor = { vt: pred + (vt - pred) * 0.15, pf: now }; S.rawVt = vt; }
    S.t = S.anchor.vt + (now - S.anchor.pf) / 1000 * rate + S.off;
  } else if (S.ytReady && S.yt.getCurrentTime && !S.scrubbing) {
    const vt = S.yt.getCurrentTime() + S.off; if (Math.abs(vt - S.t) > 0.3 && S.yt.getPlayerState() === 2 && vt > T0 - 1) S.t = vt;   // paused: follow the player's position
    S.anchor = null;
  } else if (!S.ytReady && S.playing) { S.t += dt; if (S.t >= T1) { S.playing = false; playIcon(); } }
  frameUI(now);
  if (!VID) requestAnimationFrame(loop);
}
window.renderAt = (t, cam) => { S.t = t; if (cam) { G.fly = null; G.ctl.autoRotate = false; G.cam.position.set(...cam.p); G.ctl.target.set(...cam.t); } frameUI(t * 1000); };

async function init() {
  S.d = await fetch("data/stage.json?v=9").then(r => r.json());
  S.on = new Set(S.d.members.map(m => m.key));
  $("#nObs").textContent = S.d.kinds.gozlem;
  S.PATH = {}; for (const m of S.d.members) { S.PATH[m.key] = []; for (let t = S.d.t0; t <= S.d.t1 + 0.01; t += 0.25) { const p = pos(m, t); S.PATH[m.key].push([t, p.x, p.y, p.z]); } }
  $("#facts").innerHTML = S.d.moments.filter(m => m.t == null).map(m => `<div class="fact"><b>${m.title}</b><span>${m.text}</span></div>`).join("");
  initGrids(); cast(); buildScene(); resize();
  new ResizeObserver(resize).observe(G.el);
  if (!VID) { const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag); }
  $("#play").onclick = () => {
    if (S.ytReady) { S.playing ? S.yt.pauseVideo() : (S.yt.seekTo(Math.max(0, S.t - S.off), true), S.yt.playVideo()); }
    else { S.playing = !S.playing; if (S.t >= T1 - 1) S.t = 27; playIcon(); }
  };
  $("#time").oninput = e => { S.scrubbing = true; setT(+e.target.value, true); }; $("#time").onchange = () => { S.scrubbing = false; };
  $("#marks").onclick = e => { const t = e.target.dataset?.t; if (t) setT(+t - 0.5, true); };
  document.querySelectorAll(".modes button").forEach(b => b.onclick = () => { document.querySelectorAll(".modes button").forEach(x => x.classList.toggle("on", x === b)); S.mode = b.dataset.mode; S.dirty = true; });
  document.querySelectorAll(".views button").forEach(b => b.onclick = () => setView(b.dataset.view));
  $("#unc").onchange = e => { S.unc = e.target.checked; S.dirty = true; };
  const setOff = v => { S.off = Math.max(-6, Math.min(6, v)); $("#offv").textContent = `${S.off > 0 ? "+" : ""}${S.off.toFixed(1)} s`; S.anchor = null; };
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
  document.fonts?.ready.then(() => { for (const m of S.d.members) { const P = G.p[m.key], o = P.lbl; P.grp.remove(o); P.lbl = labelSprite(m.name.split(" ")[0], m.color); P.lbl.position.copy(o.position); P.grp.add(P.lbl); } lanes(); });
  S.ready = true;
  if (VID) frameUI(0); else requestAnimationFrame(loop);
}
init();
