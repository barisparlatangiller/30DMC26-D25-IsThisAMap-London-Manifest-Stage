// LinkedIn video v2 (1080 × 1350, 26 s): the story layer — who owns the stage.
//   LOCAL=1 THREE=/path/to/three/ node pipeline/video2.mjs → media/day25_who_owns_the_stage.mp4 + cover2.png
import { chromium } from "playwright";
import fs from "node:fs"; import http from "node:http"; import path from "node:path"; import { execFileSync, spawn } from "node:child_process";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
http.createServer((q, r) => { const u = decodeURIComponent(new globalThis.URL(q.url, "http://x").pathname); const f = path.join("docs", u.endsWith("/") ? u + "index.html" : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(8127);
const OUT = "media", FPS = 30, DUR = 26; fs.mkdirSync(OUT, { recursive: true });
const br = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await br.newPage({ viewport: { width: 1080, height: 1350 } });
if (process.env.LOCAL) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => { const m = r.request().url().match(/three@0\.160\.0\/(.*)$/); r.fulfill({ path: (process.env.THREE || "node_modules/three/") + m[1], contentType: "application/javascript" }); });
p.on("pageerror", e => console.log("pageerror", e.message));
await p.goto("http://localhost:8127/index.html?video=1"); await p.waitForFunction(() => window.S && S.ready, null, { timeout: 90000 }); await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
const CAM = { close: { p: [-7, 4.2, 4], t: [0, 1.6, -10] }, front: { p: [0, 15, 31], t: [0, -0.5, -1] }, plan: { p: [0, 42, -1.4], t: [0, 0, -2.6] }, crowd: { p: [6, 9, 30], t: [0, 0, 6] } };
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k), camAt = (A, B, k) => ({ p: lerp(A.p, B.p, k), t: lerp(A.t, B.t, k) });
const e = k => k * k * (3 - 2 * k), cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
await p.evaluate(() => {
  const M = n => S.d.members.find(m => m.name.startsWith(n)); const su = M("Sueda"), hi = M("Hilal");
  const o = document.createElement("div"); o.id = "outro"; document.body.appendChild(o);
  o.innerHTML = `<h2>Who owns the stage?</h2>
    <div class="r"><i style="background:${su.color};color:${su.color}"></i><span><b>Sueda</b>holds the centre most</span><em style="color:${su.color}">46%</em></div>
    <div class="r"><i style="background:${hi.color};color:${hi.color}"></i><span><b>Hilal</b>stands closest to the crowd</span><em style="color:${hi.color}">41%</em></div>
    <div class="r"><i style="background:${su.color};color:${su.color}"></i><span><b>Sueda</b>covers the most ground</span><em style="color:${su.color}">79 m</em></div>
    <p>Manifest · Intro &amp; Hileli · OVO Arena Wembley. One position every 2 s, read from the concert video. Interactive map: link in the post.</p>`;
  window.KEYS = { su: su.key, hi: hi.key };
});
const capSet = (k, title, text) => p.evaluate(([k, title, text]) => { const el = document.getElementById("cap"); if (!title) { el.classList.remove("on"); el.dataset.t = ""; return; }
  el.dataset.t = title; el.innerHTML = `<div class="k">${k}</div><b>${title}</b><span>${text}</span>`; el.classList.add("on"); }, [k, title, text]);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/day25.tmp.mp4`]);
let lastOn = ""; let CAP = [];
const FRAMES = process.env.TEST ? process.env.TEST.split(",").map(v => Math.round(+v * FPS)) : [...Array(DUR * FPS).keys()];
for (const n of FRAMES) {
  const s = n / FPS; let t, cam, view = "top", mode = "acc", on = "all";
  if (s < 4) { t = 29 + s * 2.5; cam = camAt(CAM.close, CAM.front, e(cl(s, 1.2, 4))); view = "audience";
    CAP = ["0:27", "Six on the platform", "Manifest, a six-member Turkish girl group, live at Wembley. Every 2 s of the song became a position on the stage."]; }
  else if (s < 11) { t = 80 + (s - 4) * 18; cam = camAt(CAM.front, CAM.plan, e(cl(s, 4, 5.5))); on = "su";
    CAP = ["1:05 – 3:42 · main stage", "Centre stage: Sueda", "With all six in view, she is closest to the centre line 46% of the time. She also walks the most: 79 m."]; }
  else if (s < 17.5) { t = 222 + (s - 11) * 7; cam = camAt(CAM.plan, CAM.front, e(cl(s, 11, 12.5)) * 0.45); on = "hi";
    CAP = ["3:42 · the run to the front", "Closest to the crowd: Hilal", "After the run down the 7.5 m runway, she is the one nearest the audience, 41% of the song."]; }
  else if (s < 21.5) { t = 296; mode = "all"; cam = camAt(camAt(CAM.plan, CAM.front, 0.45), CAM.plan, e(cl(s, 17.5, 18.8))); 
    CAP = ["0:27 – 4:56", "The whole song, as a map", "Each circle is a stop, bigger when she stood longer. The floor takes the colour of whoever stood there longest."]; }
  else { t = 296; mode = "all"; cam = CAM.plan; CAP = []; }
  const onKey = on;
  if (onKey !== lastOn) { await p.evaluate(k => APP25.setOn(k === "all" ? null : [KEYS[k]]), onKey); lastOn = onKey; }
  await p.evaluate(([t, mode, cam, view, s]) => { if (S.mode !== mode) { S.mode = mode; S.heatKey = ""; } G.view = view; renderAt(t, cam);
    const o = document.getElementById("outro"), k = Math.max(0, Math.min(1, (s - 21.6) / 0.7)); o.style.opacity = k; o.style.transform = `translateY(${(1 - k) * 30}px)`; }, [t, mode, cam, view, s]);
  await capSet(...CAP);
  const buf = await p.screenshot({ type: "jpeg", quality: 92 });
  if (process.env.TEST) { fs.writeFileSync(`${OUT}/test_${s.toFixed(1)}.jpg`, buf); continue; }
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if (n === Math.round(8 * FPS)) fs.writeFileSync(`${OUT}/cover2.jpg`, buf);
  if (n % 60 === 0) { console.log("frame", n); fs.writeFileSync(`${OUT}/log.txt`, `frame ${n}\n`); }
}
ff.stdin.end(); await new Promise(r => ff.on("close", r));
fs.renameSync(`${OUT}/day25.tmp.mp4`, `${OUT}/day25_who_owns_the_stage.mp4`); fs.writeFileSync(`${OUT}/log.txt`, "done\n");
await br.close(); process.exit(0);
