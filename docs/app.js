/* Is a stage a map? Manifest at OVO Arena Wembley · #30DayMapChallenge 2026 Day 25 */
const ZONES = { platform: ["Platform", "#6f6496"], merdiven: ["Stairs", "#8a7fb3"], ana_sahne_on: ["Main stage", "#4e4a72"],
  runway: ["Runway", "#5f6f98"], on_blok: ["Front block", "#3f5a78"] };
const PART = { platform: ["PLATFORM · +3.3 m", "#2d2747"], merdiven: ["STAIRS", "#2a2442"], ana_sahne: ["MAIN STAGE", "#1d1a31"],
  runway: ["RUNWAY", "#211d38"], on_blok: ["FRONT BLOCK", "#1d1a31"] };
const R_HEAT = 1.8;           // m: where a sample's glow fades to nothing
const TRAIL = 12;             // s, for the trail mode
const $ = s => document.querySelector(s);
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

const S = { d: null, t: 26, mode: "acc", unc: true, off: 0, on: new Set(), playing: false, yt: null, ytReady: false,
  last: performance.now(), dirty: true, heat: {}, heatKey: "" };

const cv = $("#stage"), ctx = cv.getContext("2d");
let DPR = 1, SC = 1, OX = 0, OY = 0;

function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR);
  const pad = 14 * DPR;
  SC = Math.min((cv.width - 2 * pad) / S.d.w, (cv.height - 2 * pad) / S.d.h);
  OX = (cv.width - S.d.w * SC) / 2; OY = (cv.height - S.d.h * SC) / 2;
  for (const m of S.d.members) {
    const c = S.heat[m.key] || (S.heat[m.key] = document.createElement("canvas"));
    c.width = cv.width; c.height = cv.height;
  }
  S.heatKey = ""; S.dirty = true;
}
const X = x => OX + x * SC, Y = y => OY + y * SC;

// ---------- position at time t: Catmull-Rom through the 2 s samples
function pos(m, t) {
  const s = m.s, t0 = s[0][0], st = 2;
  if (t < t0 || t > s[s.length - 1][0]) return null;
  const f = (t - t0) / st, i = Math.min(Math.floor(f), s.length - 2), u = f - i;
  const p = k => s[Math.max(0, Math.min(s.length - 1, k))];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  const P0 = p(i - 1), P1 = p(i), P2 = p(i + 1), P3 = p(i + 2);
  const near = u < 0.5 ? P1 : P2;
  return { x: cr(P0[1], P1[1], P2[1], P3[1]), y: cr(P0[2], P1[2], P2[2], P3[2]), z: P1[3] + (P2[3] - P1[3]) * u,
    state: near[5], w: near[4], zone: near[6] };
}

// ---------- heat: one canvas per performer, white glow accumulated, then tinted with her colour
function buildHeat() {
  const t = S.t, key = `${S.mode}|${S.unc}|${S.mode === "all" ? "" : Math.round(t * 4)}|${cv.width}`;
  if (key === S.heatKey) return;
  S.heatKey = key;
  const r = R_HEAT * SC;
  for (const m of S.d.members) {
    const c = S.heat[m.key], g = c.getContext("2d");
    g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "lighter";
    for (const [ts, x, y, , w0] of m.s) {
      if (S.mode !== "all" && ts > t) break;
      let w = w0;
      if (!S.unc && w < 1) w = w >= 0.6 ? w : 0;
      if (w <= 0) continue;
      if (S.mode === "trail") { const age = t - ts; if (age > TRAIL) continue; w *= Math.exp(-age / (TRAIL / 2.2)); }
      const k = S.mode === "trail" ? 0.5 : 0.11;
      const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r);
      gr.addColorStop(0, `rgba(255,255,255,${(k * w).toFixed(3)})`);
      gr.addColorStop(0.45, `rgba(255,255,255,${(k * w * 0.45).toFixed(3)})`);
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(X(x), Y(y), r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "source-in";
    g.fillStyle = m.color; g.fillRect(0, 0, c.width, c.height);
  }
}

function drawStage() {
  ctx.fillStyle = "#0f0d18"; ctx.fillRect(0, 0, cv.width, cv.height);
  // 1 m dot grid
  ctx.fillStyle = "rgba(255,255,255,.07)";
  for (let x = 0; x <= S.d.w; x++) for (let y = 0; y <= S.d.h; y++) { ctx.fillRect(X(x) - DPR / 2, Y(y) - DPR / 2, DPR, DPR); }
  const order = ["ana_sahne", "runway", "on_blok", "platform", "merdiven"];
  for (const id of order) {
    const p = S.d.parts.find(q => q.id === id); if (!p) continue;
    ctx.beginPath(); p.poly.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath();
    ctx.fillStyle = PART[id][1]; ctx.fill();
    ctx.strokeStyle = "rgba(220,210,255,.28)"; ctx.lineWidth = 1.2 * DPR; ctx.stroke();
    if (id === "merdiven") {               // steps
      const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      ctx.strokeStyle = "rgba(220,210,255,.18)";
      for (let k = 1; k < 6; k++) { const yy = y0 + (y1 - y0) * k / 6; ctx.beginPath(); ctx.moveTo(X(x0), Y(yy)); ctx.lineTo(X(x1), Y(yy)); ctx.stroke(); }
    }
  }
  // labels
  ctx.font = `${10.5 * DPR}px "Space Grotesk"`; ctx.fillStyle = "rgba(200,190,235,.38)"; ctx.textAlign = "left";
  const lab = (id, x, y) => ctx.fillText(PART[id][0], X(x), Y(y));
  lab("platform", 0.4, 1.5); lab("ana_sahne", 0.4, 7.4); lab("runway", 8.6, 15.4); lab("on_blok", 3.4, 23.4);
  // scale bar
  ctx.strokeStyle = "rgba(200,190,235,.45)"; ctx.lineWidth = 1.2 * DPR;
  ctx.beginPath(); ctx.moveTo(X(19), Y(23.3)); ctx.lineTo(X(24), Y(23.3)); ctx.stroke();
  ctx.fillStyle = "rgba(200,190,235,.55)"; ctx.textAlign = "right"; ctx.fillText("5 m", X(24), Y(22.85));
}

function draw() {
  drawStage();
  buildHeat();
  ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.82;
  for (const m of S.d.members) if (S.on.has(m.key)) ctx.drawImage(S.heat[m.key], 0, 0);
  ctx.restore();
  if (S.mode === "all") return;
  // short trail line + performers
  for (const m of S.d.members) {
    if (!S.on.has(m.key)) continue;
    ctx.beginPath();
    let first = true;
    for (let tt = Math.max(S.d.t0, S.t - 5); tt <= S.t; tt += 0.2) {
      const p = pos(m, tt); if (!p) continue;
      first ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y)); first = false;
    }
    ctx.strokeStyle = m.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6 * DPR; ctx.lineCap = "round"; ctx.stroke(); ctx.globalAlpha = 1;
  }
  const placed = [];
  for (const m of S.d.members) {
    if (!S.on.has(m.key)) continue;
    const p = pos(m, S.t); if (!p) continue;
    const hidden = p.state === "g";
    if (hidden && !S.unc) continue;
    const r = (5.5 + (p.z - 1.8) * 1.6) * DPR;
    const x = X(p.x), y = Y(p.y);
    if (!hidden) {
      const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      gl.addColorStop(0, m.color); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = p.state === "n" ? 0.85 : 0.5; ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, 7); ctx.fill();
    } else {
      ctx.setLineDash([3 * DPR, 3 * DPR]); ctx.strokeStyle = m.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.font = `600 ${11 * DPR}px "Space Grotesk"`; ctx.textAlign = "left";
    ctx.fillStyle = hidden ? "rgba(239,234,247,.45)" : "rgba(239,234,247,.92)";
    let ly = y - r * 0.4; const lx = x + r + 4 * DPR, lh = 12 * DPR;
    while (placed.some(([a, b]) => Math.abs(a - lx) < 46 * DPR && Math.abs(b - ly) < lh)) ly += lh;
    placed.push([lx, ly]);
    ctx.fillText(m.name.split(" ")[0], lx, ly);
  }
}

// ---------- people cards
function people() {
  const total = m => Object.values(m.zones_s).reduce((a, b) => a + b, 0);
  const zk = ["platform", "merdiven", "ana_sahne_on", "runway", "on_blok"];
  $("#people").innerHTML = S.d.members.map(m => `<li data-k="${m.key}" style="--c:${m.color}">
      <div class="nm"><i></i>${m.name}<span>${m.path_m} m</span></div>
      <div class="zb">${zk.map(z => m.zones_s[z] ? `<b style="width:${(100 * m.zones_s[z] / total(m)).toFixed(1)}%;background:${ZONES[z][1]}" title="${ZONES[z][0]} ${m.zones_s[z]} s"></b>` : "").join("")}</div>
      <div class="zl">${zk.filter(z => m.zones_s[z]).map(z => `${ZONES[z][0].toLowerCase()} ${m.zones_s[z]} s`).join(" · ")}</div></li>`).join("")
    + `<div class="zkey">${zk.map(z => `<span style="--z:${ZONES[z][1]}">${ZONES[z][0]}</span>`).join("")}<span style="--z:transparent">· seconds seen in each zone · path length</span></div>`;
  $("#people").querySelectorAll("li").forEach(li => li.onclick = () => {
    const k = li.dataset.k;
    if (S.on.has(k) && S.on.size === S.d.members.length) { S.on = new Set([k]); }       // first click: solo
    else if (S.on.has(k)) { S.on.delete(k); if (!S.on.size) S.on = new Set(S.d.members.map(m => m.key)); }
    else S.on.add(k);
    $("#people").querySelectorAll("li").forEach(l => l.classList.toggle("off", !S.on.has(l.dataset.k)));
    S.dirty = true;
  });
}

// ---------- YouTube player: the video is the clock
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

function setT(t, seek) {
  S.t = Math.max(0, Math.min(300, t)); S.dirty = true;
  if (seek && S.ytReady) S.yt.seekTo(Math.max(0, S.t - S.off), true);
}

function loop(now) {
  const dt = (now - S.last) / 1000; S.last = now;
  if (S.ytReady && S.yt.getPlayerState && S.yt.getPlayerState() === 1) { S.t = S.yt.getCurrentTime() + S.off; S.dirty = true; }
  else if (!S.ytReady && S.playing) { S.t += dt; if (S.t > S.d.t1 + 4) S.playing = false; S.dirty = true; }
  if (S.dirty) {
    draw(); S.dirty = false;
    $("#time").value = S.t; $("#tlabel").textContent = fmt(S.t); $("#clock").textContent = fmt(S.t);
  }
  requestAnimationFrame(loop);
}

async function init() {
  S.d = await fetch("data/stage.json?v=1").then(r => r.json());
  S.on = new Set(S.d.members.map(m => m.key));
  $("#nObs").textContent = S.d.kinds.gozlem;
  resize(); people();
  new ResizeObserver(resize).observe(cv);
  const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag);

  $("#play").onclick = () => {
    if (S.ytReady) { S.playing ? S.yt.pauseVideo() : (S.yt.seekTo(Math.max(0, S.t - S.off), true), S.yt.playVideo()); }
    else { S.playing = !S.playing; if (S.t >= S.d.t1) S.t = S.d.t0 - 2; $("#play").textContent = S.playing ? "❚❚" : "▶"; }
  };
  $("#time").oninput = e => setT(+e.target.value, true);
  document.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b));
    S.mode = b.dataset.mode; S.dirty = true;
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
