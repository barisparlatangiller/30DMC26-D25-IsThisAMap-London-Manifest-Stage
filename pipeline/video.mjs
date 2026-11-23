// LinkedIn video (1080 × 1350, 12 s) and three stills, rendered from the page in video mode (?video=1; no YouTube player).
//   node pipeline/video.mjs        → media/day25_stage_map.mp4, media/post1_opening.png, post2_run.png, post3_song_map.png
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
http.createServer((q, r) => { const u = decodeURIComponent(new globalThis.URL(q.url, "http://x").pathname); const f = path.join("docs", u.endsWith("/") ? u + "index.html" : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(8125);
const OUT = "media", FR = "media/frames", FPS = 30; fs.mkdirSync(FR, { recursive: true });
const br = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await br.newPage({ viewport: { width: 1080, height: 1350 } });
if (process.env.LOCAL) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => { const m = r.request().url().match(/three@0\.160\.0\/(.*)$/); r.fulfill({ path: (process.env.THREE || "node_modules/three/") + m[1], contentType: "application/javascript" }); });
p.on("pageerror", e => console.log("pageerror", e.message));
await p.goto("http://localhost:8125/index.html?video=1"); await p.waitForFunction(() => window.S && S.ready, null, { timeout: 90000 }); await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
const cap = (title, text, k = "") => p.evaluate(([title, text, k]) => { const el = document.getElementById("cap"); el.dataset.t = "x"; el.innerHTML = `<div class="k">${k}</div><b>${title}</b><span>${text}</span>`; el.classList.add("on"); }, [title, text, k]);
const at = async (t, mode = "acc", cam = CAM.front, view = "audience") => { await p.evaluate(([t, mode, cam, view]) => { if (S.mode !== mode) { S.mode = mode; S.heatKey = ""; } G.view = view; renderAt(t, cam); }, [t, mode, cam, view]); };
// camera keyframes (scene metres; the main stage top is y = 0, the crowd is toward +z)
const CAM = { close: { p: [-7, 4.2, 4], t: [0, 1.6, -10] }, front: { p: [0, 15, 31], t: [0, -0.5, -1] }, high: { p: [14, 22, 24], t: [0, 0, 0] },
  side: { p: [-24, 9, 14], t: [0, 0, 1] }, crowd: { p: [6, 5, 26], t: [0, 0.5, 4] }, top: { p: [0, 46, 6], t: [0, 0, 0.6] },
  plan: { p: [0, 42, -1.4], t: [0, 0, -2.6] } };
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const camAt = (A, B, k) => ({ p: lerp(A.p, B.p, k), t: lerp(A.t, B.t, k) });

// stills
for (const [name, t, mode, cam, view] of [["post1_opening", 36, "acc", CAM.close, "audience"], ["post2_footprints", 250, "acc", CAM.plan, "top"], ["post3_song_map", 296, "all", CAM.plan, "top"]]) {
  await at(t, mode, cam, view); if (mode === "all") await cap("The whole song, as footprints", "Every circle is a stop: where she stood, and for how long. The floor takes the colour of whoever stood there longest.");
  else if (view === "top") await cap("Footprints", "Each circle is a stop. The longer she stood there, the bigger it gets.");
  await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("still", name);
  await p.evaluate(() => { const el = document.getElementById("cap"); el.classList.remove("on"); el.dataset.t = ""; });
}
if (process.env.STILLS_ONLY) process.exit(0);

// 12 s: platform → stairs → the main stage (fast) → the run and the front block → the whole song
const keys = [[0, 29], [1.5, 40], [3.5, 80], [6.5, 205], [9.5, 293]];
const ease = k => k * k * (3 - 2 * k);
const vt = s => { for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) { const [a, ta] = keys[i - 1], [b, tb] = keys[i], k = (s - a) / (b - a); return ta + (tb - ta) * (0.25 * k + 0.75 * ease(k)); } return keys.at(-1)[1]; };
const N = 12 * FPS;
await p.evaluate(() => { S.mode = "acc"; S.heatKey = ""; S.applied = {}; for (const m of S.d.members) S.applied[m.key] = 0; S.accKey = ""; });
for (let n = 0; n < N; n++) {
  const s = n / FPS;
  const e = k => k * k * (3 - 2 * k);
  const k = s < 1.5 ? 0 : e(Math.min(1, (s - 1.5) / 2.2)), cam = camAt(CAM.close, CAM.plan, k), view = k > 0.55 ? "top" : "audience";
  if (s < 9.5) await at(vt(s), "acc", cam, view); else { await at(296, "all", CAM.plan, "top"); await cap("The whole song, as footprints", "Every circle is a stop: where she stood, and for how long. The floor takes the colour of whoever stood there longest."); }
  await p.screenshot({ path: `${FR}/f${String(n).padStart(4, "0")}.png` });
  if (n % 60 === 0) console.log("frame", n);
}
await br.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${FR}/f%04d.png`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/day25_stage_map.mp4`]);
fs.copyFileSync(`${FR}/f${String(Math.round(8 * FPS)).padStart(4, "0")}.png`, `${OUT}/cover.png`);
fs.rmSync(FR, { recursive: true }); console.log("done", (fs.statSync(`${OUT}/day25_stage_map.mp4`).size / 1e6).toFixed(1), "MB");
process.exit(0);
