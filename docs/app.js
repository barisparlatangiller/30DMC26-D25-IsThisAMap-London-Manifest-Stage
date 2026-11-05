/* Is a stage a map? Manifest at OVO Arena Wembley · #30DayMapChallenge 2026 Day 25 */
const ZN = { platform: "Platform", merdiven: "Stairs", ana_sahne_on: "Main stage", runway: "Runway", on_blok: "Front block" };
const ZORDER = ["platform", "merdiven", "ana_sahne_on", "runway", "on_blok"];
const PART = { platform: "PLATFORM  +3.3 m", merdiven: "STAIRS", ana_sahne: "MAIN STAGE", runway: "RUNWAY", on_blok: "FRONT BLOCK" };
const CELL = 0.1, R = 2.6, TRAIL = 12;
const $ = s => document.querySelector(s);
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const S = { d: null, t: 26, mode: "acc", unc: true, off: 0, on: new Set(), playing: false, yt: null, ytReady: false,
  last: performance.now(), dirty: true, grids: {}, applied: {}, accKey: "" };
const cv = $("#stage"), ctx = cv.getContext("2d");
const heatCv = document.createElement("canvas"), hctx = heatCv.getContext("2d");
const PATH = {};
let DPR = 1, SC = 1, OX = 0, OY = 0, GW = 0, GH = 0, KER = null, KR = 0, IMG = null;

// ---------- geometry
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR);
  const pad = 10 * DPR;
  SC = Math.min((cv.width - 2 * pad) / S.d.w, (cv.height - 2 * pad) / S.d.h);
  OX = (cv.width - S.d.w * SC) / 2; OY = (cv.height - S.d.h * SC) / 2;
  S.dirty = true;
}
const X = x => OX + x * SC, Y = y => OY + y * SC;

// ---------- heat grids (0.1 m cells), smooth kernel that reaches zero at 1.8 m
function initGrids() {
  GW = Math.round(S.d.w / CELL); GH = Math.round(S.d.h / CELL);
  heatCv.width = GW; heatCv.height = GH; IMG = hctx.createImageData(GW, GH);
  KR = Math.round(R / CELL);
  KER = new Float32Array((2 * KR + 1) ** 2);
  for (let j = -KR; j <= KR; j++) for (let i = -KR; i <= KR; i++) {
    const q = (i * i + j * j) / (KR * KR);
    KER[(j + KR) * (2 * KR + 1) + (i + KR)] = q < 1 ? (1 - q) ** 2 : 0;
  }
  for (const m of S.d.members) { S.grids[m.key] = new Float32Array(GW * GH); S.applied[m.key] = 0; }
}
function stamp(g, x, y, w) {
  const ci = Math.round(x / CELL), cj = Math.round(y / CELL), kw = 2 * KR + 1;
  for (let j = -KR; j <= KR; j++) {
    const yy = cj + j; if (yy < 0 || yy >= GH) continue;
    for (let i = -KR; i <= KR; i++) {
      const xx = ci + i; if (xx < 0 || xx >= GW) continue;
      const k = KER[(j + KR) * kw + (i + KR)]; if (k) g[yy * GW + xx] += w * k;
    }
  }
}
const wOf = s => { let w = s[4]; if (!S.unc && w < 1) w = 0; return w; };

function updateGrids() {
  const t = S.t, key = `${S.mode}|${S.unc}`;
  if (S.mode === "trail") {
    for (const m of S.d.members) {
      const g = S.grids[m.key]; g.fill(0);
      for (const s of m.s) { const age = t - s[0]; if (age < 0) break; if (age > TRAIL) continue; const w = wOf(s); if (w) stamp(g, s[1], s[2], w * Math.exp(-age / 5)); }
    }
    S.accKey = ""; return;
  }
  const lim = S.mode === "all" ? Infinity : t;
  for (const m of S.d.members) {
    const g = S.grids[m.key];
    let n = 0; while (n < m.s.length && m.s[n][0] <= lim) n++;
    if (key !== S.accKey || n < S.applied[m.key]) { g.fill(0); S.applied[m.key] = 0; }
    for (let k = S.applied[m.key]; k < n; k++) { const w = wOf(m.s[k]); if (w) stamp(g, m.s[k][1], m.s[k][2], w); }
    S.applied[m.key] = n;
  }
  S.accKey = key;
}

// colour: the performer with more presence leads (weights ^3), so overlaps keep a hue instead of turning white
function paintHeat() {
  const ms = S.d.members.filter(m => S.on.has(m.key));
  const cols = ms.map(m => hex(m.color)), gs = ms.map(m => S.grids[m.key]);
  const K = S.mode === "trail" ? 1.1 : 5.5;
  const px = IMG.data;
  for (let p = 0, q = 0; p < GW * GH; p++, q += 4) {
    let T = 0, sw = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < gs.length; i++) {
      const v = gs[i][p]; if (v <= 0) continue;
      T += v; const w = v * v * v; sw += w; r += cols[i][0] * w; g += cols[i][1] * w; b += cols[i][2] * w;
    }
    if (T < 1e-3) { px[q + 3] = 0; continue; }
    px[q] = r / sw; px[q + 1] = g / sw; px[q + 2] = b / sw;
    px[q + 3] = 255 * 0.92 * (1 - Math.exp(-T / K));
  }
  hctx.putImageData(IMG, 0, 0);
}

// ---------- positions: Catmull-Rom through the 2 s samples
function pos(m, t) {
  const s = m.s, t0 = s[0][0];
  if (t < t0 || t > s[s.length - 1][0]) return null;
  const f = (t - t0) / 2, i = Math.min(Math.floor(f), s.length - 2), u = f - i;
  const p = k => s[Math.max(0, Math.min(s.length - 1, k))];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  const P0 = p(i - 1), P1 = p(i), P2 = p(i + 1), P3 = p(i + 2), near = u < 0.5 ? P1 : P2;
  return { x: cr(P0[1], P1[1], P2[1], P3[1]), y: cr(P0[2], P1[2], P2[2], P3[2]), z: P1[3] + (P2[3] - P1[3]) * u, state: near[5], zone: near[6] };
}

// ---------- drawing
function poly(p) { ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); }
function drawStage() {
  ctx.fillStyle = "#0b0b0b"; ctx.fillRect(0, 0, cv.width, cv.height);
  const parts = Object.fromEntries(S.d.parts.map(p => [p.id, p]));
  for (const id of ["ana_sahne", "runway", "on_blok"]) { poly(parts[id].poly); ctx.fillStyle = "#000"; ctx.fill(); }
  // 1 m floor grid, very faint
  ctx.save(); for (const id of ["ana_sahne", "runway", "on_blok"]) { poly(parts[id].poly); } ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.045)"; ctx.lineWidth = 1;
  for (let x = 0; x <= S.d.w; x++) { ctx.beginPath(); ctx.moveTo(X(x), Y(0)); ctx.lineTo(X(x), Y(S.d.h)); ctx.stroke(); }
  for (let y = 0; y <= S.d.h; y++) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(S.d.w), Y(y)); ctx.stroke(); }
  ctx.restore();
  // raised platform + stairs
  poly(parts.platform.poly); ctx.fillStyle = "#121212"; ctx.fill();
  poly(parts.merdiven.poly); ctx.fillStyle = "#0e0e0e"; ctx.fill();
  const xs = parts.merdiven.poly.map(q => q[0]), ys = parts.merdiven.poly.map(q => q[1]);
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = DPR;
  for (let k = 1; k < 6; k++) { const yy = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * k / 6; ctx.beginPath(); ctx.moveTo(X(Math.min(...xs)), Y(yy)); ctx.lineTo(X(Math.max(...xs)), Y(yy)); ctx.stroke(); }
}
function drawOutlines() {
  ctx.strokeStyle = "rgba(255,255,255,.32)"; ctx.lineWidth = 1.2 * DPR; ctx.lineJoin = "round";
  for (const p of S.d.parts) { poly(p.poly); ctx.stroke(); }
  ctx.font = `600 ${10 * DPR}px "Inter Tight"`; ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.textAlign = "left";
  ctx.letterSpacing = `${1.5 * DPR}px`;
  const lab = (id, x, y) => ctx.fillText(PART[id], X(x), Y(y));
  lab("platform", 0.35, 1.45); lab("ana_sahne", 0.35, 7.55); lab("runway", 8.6, 15.55); lab("on_blok", 3.35, 23.55);
  ctx.letterSpacing = "0px";
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(X(19.5), Y(23.4)); ctx.lineTo(X(20.5), Y(23.4)); ctx.stroke();
  for (let k = 0; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(X(19.5 + k), Y(23.25)); ctx.lineTo(X(19.5 + k), Y(23.55)); ctx.stroke(); }
  ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.textAlign = "right"; ctx.fillText("1 m", X(20.75) + 22 * DPR, Y(23.55));
}

function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function draw() {
  drawStage();
  updateGrids(); paintHeat();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(heatCv, X(0), Y(0), S.d.w * SC, S.d.h * SC);
  drawOutlines();
  // choreography texture: every path walked so far, thin, in her colour
  const tEnd = S.mode === "all" ? S.d.t1 : S.t;
  ctx.lineWidth = 1.3 * DPR; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const m of S.d.members) {
    if (!S.on.has(m.key)) continue;
    const pts = PATH[m.key]; ctx.beginPath(); let n = 0;
    for (const [t, x, y] of pts) { if (t > tEnd) break; n++ ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }
    ctx.strokeStyle = m.color; ctx.globalAlpha = S.mode === "trail" ? 0.18 : 0.5; ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (S.mode === "all") return;

  const live = S.d.members.filter(m => S.on.has(m.key)).map(m => ({ m, p: pos(m, S.t) })).filter(o => o.p && (S.unc || o.p.state !== "g"));
  // short motion trail
  for (const { m } of live) {
    ctx.beginPath(); let first = true;
    for (let tt = Math.max(S.d.t0, S.t - 4); tt <= S.t; tt += 0.2) { const p = pos(m, tt); if (!p) continue; first ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y)); first = false; }
    ctx.strokeStyle = m.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 2.2 * DPR; ctx.lineCap = "round"; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // dots: solid colour, black outline, own-colour halo — no white
  const rad = p => (9 + (p.z - 1.8) * 1.4) * DPR;
  for (const { m, p } of live) {               // halos first, so no halo ever covers another performer's dot
    if (p.state === "g") continue;
    const x = X(p.x), y = Y(p.y), r = rad(p), g = ctx.createRadialGradient(x, y, r, x, y, r * 2.4);
    g.addColorStop(0, m.color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = p.state === "n" ? 0.5 : 0.3; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const { m, p } of live) {
    const x = X(p.x), y = Y(p.y), r = rad(p);
    if (p.state === "g") {
      ctx.setLineDash([3 * DPR, 3 * DPR]); ctx.strokeStyle = m.color; ctx.lineWidth = 2 * DPR; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; continue;
    }
    ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5 * DPR; ctx.stroke();
  }
  // name pills, placed so they never overlap each other or a dot; leader line when moved away
  ctx.font = `700 ${12.5 * DPR}px "Inter Tight"`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const boxes = live.map(({ p }) => { const r = rad(p) + 2 * DPR; return [X(p.x) - r, Y(p.y) - r, 2 * r, 2 * r]; });
  const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const order = live.slice().sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  for (const { m, p } of order) {
    const name = m.name.split(" ")[0], tw = ctx.measureText(name).width, w = tw + 14 * DPR, h = 21 * DPR;
    const x = X(p.x), y = Y(p.y), r = rad(p);
    let best = null;
    for (const d of [0, 1, 2, 3, 4, 5]) {
      const dd = r + 6 * DPR + d * 15 * DPR;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]) {
        const bx = ax > 0 ? x + dd : ax < 0 ? x - dd - w : x - w / 2;
        const by = ay > 0 ? y + dd : ay < 0 ? y - dd - h : y - h / 2;
        const b = [bx, by, w, h];
        if (bx < 2 || by < 2 || bx + w > cv.width - 2 || by + h > cv.height - 2) continue;
        if (!boxes.some(o => hit(o, b))) { best = b; break; }
      }
      if (best) break;
    }
    if (!best) best = [x + r + 6 * DPR, y - h / 2, w, h];
    boxes.push(best);
    const cx = best[0] + best[2] / 2, cy = best[1] + best[3] / 2;
    if (Math.hypot(cx - x, cy - y) > r + 30 * DPR) {
      ctx.strokeStyle = m.color; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.max(best[0], Math.min(x, best[0] + best[2])), Math.max(best[1], Math.min(y, best[1] + best[3]))); ctx.stroke(); ctx.globalAlpha = 1;
    }
    rrect(best[0], best[1], best[2], best[3], h / 2); ctx.fillStyle = p.state === "g" ? "#1a1a1a" : m.color; ctx.fill();
    if (p.state === "g") { ctx.strokeStyle = m.color; ctx.lineWidth = 1.2 * DPR; ctx.stroke(); }
    ctx.fillStyle = p.state === "g" ? m.color : "#0b0b0b"; ctx.fillText(name, best[0] + 7 * DPR, best[1] + h / 2 + 0.5 * DPR);
  }
  ctx.textBaseline = "alphabetic";
}

// ---------- people list
function people() {
  const tot = m => Object.values(m.zones_s).reduce((a, b) => a + b, 0);
  $("#people").innerHTML = S.d.members.map(m => `<li data-k="${m.key}" style="--c:${m.color}">
      <span class="sw"></span><span class="nm">${m.name}</span><span class="now" id="now-${m.key}"></span>
      <div class="bar">${ZORDER.filter(z => m.zones_s[z]).map(z => `<b style="width:${(100 * m.zones_s[z] / tot(m)).toFixed(1)}%" title="${ZN[z]} ${m.zones_s[z]} s"></b>`).join("")}</div>
      <div class="meta">${m.path_m} m walked · ${ZORDER.filter(z => m.zones_s[z]).map(z => `${ZN[z].toLowerCase()} ${m.zones_s[z]} s`).join(" · ")}</div></li>`).join("");
  $("#people").insertAdjacentHTML("afterend", `<p class="hint">Click a name to see her alone; click others to add them.</p>`);
  $("#people").querySelectorAll("li").forEach(li => li.onclick = () => {
    const k = li.dataset.k;
    if (S.on.has(k) && S.on.size === S.d.members.length) S.on = new Set([k]);
    else if (S.on.has(k)) { S.on.delete(k); if (!S.on.size) S.on = new Set(S.d.members.map(m => m.key)); }
    else S.on.add(k);
    $("#people").querySelectorAll("li").forEach(l => l.classList.toggle("off", !S.on.has(l.dataset.k)));
    S.dirty = true;
  });
}
function nowZones() {
  for (const m of S.d.members) {
    const p = pos(m, S.t), el = document.getElementById(`now-${m.key}`);
    if (el) el.textContent = !p ? "" : p.state === "g" ? "out of frame" : (ZN[p.zone] || "");
  }
}

// ---------- moments: facts from the positions, each a jump point in the video
function moments() {
  const ms = S.d.moments || [];
  $("#moments").innerHTML = ms.map((m, i) => `<li data-i="${i}">${m.t != null ? `<button class="tchip" data-t="${m.t}">${fmt(m.t)}</button>` : `<span class="tchip dim">all</span>`}
    <div><b>${m.title}</b><p>${m.text}</p></div></li>`).join("");
  $("#moments").querySelectorAll(".tchip[data-t]").forEach(b => b.onclick = () => {
    setT(+b.dataset.t - 1, true);
    if (S.mode === "all") document.querySelector('.seg [data-mode=acc]').click();
  });
}
function nowMoment() {
  const ms = (S.d.moments || []).filter(m => m.t != null);
  let cur = null; for (const m of ms) if (m.t <= S.t + 0.5) cur = m;
  const el = $("#cap");
  if (!cur || S.t > S.d.t1 + 6) { el.classList.remove("on"); return; }
  if (el.dataset.t !== String(cur.t)) { el.dataset.t = cur.t; el.innerHTML = `<b>${cur.title}</b><span>${cur.text}</span>`; }
  el.classList.add("on");
  document.querySelectorAll("#moments li").forEach(li => li.classList.toggle("cur", S.d.moments[+li.dataset.i] === cur));
}

// ---------- YouTube: the video is the clock
window.onYouTubeIframeAPIReady = () => {
  S.yt = new YT.Player("yt", {
    videoId: S.d.video, playerVars: { start: 20, playsinline: 1, rel: 0, modestbranding: 1 },
    events: {
      onReady: () => { S.ytReady = true; $("#clockNote").textContent = "synced to the video"; },
      onStateChange: e => { S.playing = e.data === 1; $("#play").textContent = S.playing ? "❚❚" : "▶"; },
      onError: () => { S.ytReady = false; $("#clockNote").textContent = "video unavailable · own clock"; },
    },
  });
};
function setT(t, seek) { S.t = Math.max(0, Math.min(310, t)); S.dirty = true; if (seek && S.ytReady) S.yt.seekTo(Math.max(0, S.t - S.off), true); }

function loop(now) {
  const dt = (now - S.last) / 1000; S.last = now;
  if (S.ytReady && S.yt.getPlayerState && S.yt.getPlayerState() === 1) { S.t = S.yt.getCurrentTime() + S.off; S.dirty = true; }
  else if (!S.ytReady && S.playing) { S.t += dt; if (S.t > S.d.t1 + 4) S.playing = false; S.dirty = true; }
  if (S.dirty) {
    draw(); nowZones(); nowMoment(); S.dirty = false;
    $("#time").value = S.t; $("#tlabel").textContent = fmt(S.t); $("#clock").textContent = fmt(S.t);
  }
  requestAnimationFrame(loop);
}

async function init() {
  S.d = await fetch("data/stage.json?v=5").then(r => r.json());
  S.on = new Set(S.d.members.map(m => m.key));
  $("#nObs").textContent = S.d.kinds.gozlem;
  for (const m of S.d.members) { PATH[m.key] = []; for (let t = S.d.t0; t <= S.d.t1; t += 0.4) { const p = pos(m, t); if (p) PATH[m.key].push([t, p.x, p.y]); } }
  initGrids(); resize(); people(); moments();
  new ResizeObserver(resize).observe(cv);
  const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag);
  $("#play").onclick = () => {
    if (S.ytReady) { S.playing ? S.yt.pauseVideo() : (S.yt.seekTo(Math.max(0, S.t - S.off), true), S.yt.playVideo()); }
    else { S.playing = !S.playing; if (S.t >= S.d.t1) S.t = S.d.t0 - 2; $("#play").textContent = S.playing ? "❚❚" : "▶"; }
  };
  $("#time").oninput = e => setT(+e.target.value, true);
  document.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b)); S.mode = b.dataset.mode; S.dirty = true;
  });
  $("#unc").onchange = e => { S.unc = e.target.checked; S.dirty = true; };
  $("#offset").oninput = e => { S.off = +e.target.value; $("#offv").textContent = `${S.off > 0 ? "+" : ""}${S.off.toFixed(2)} s`; S.dirty = true; };
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); $("#play").click(); }
    if (e.key === "ArrowRight") setT(S.t + 2, true);
    if (e.key === "ArrowLeft") setT(S.t - 2, true);
  });
  document.fonts?.ready.then(() => (S.dirty = true));
  requestAnimationFrame(loop);
}
init();
