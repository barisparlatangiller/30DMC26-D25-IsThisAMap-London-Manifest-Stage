// LinkedIn video v3 (1080 × 1350, 41 s): all six together at 3× speed in three passages, then the whole song as one map.
//   Turkish version, with a hook title in the first 3 s: LOCAL=1 THREE=/path/to/three/ node pipeline/video3_tr.mjs → media/day25_sahne_kimin_TR.mp4
import { chromium } from "playwright";
import fs from "node:fs"; import http from "node:http"; import path from "node:path"; import { execFileSync, spawn } from "node:child_process";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
http.createServer((q, r) => { const u = decodeURIComponent(new globalThis.URL(q.url, "http://x").pathname); const f = path.join("docs", u.endsWith("/") ? u + "index.html" : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(8127);
const OUT = "media", FPS = 30, DUR = 41; fs.mkdirSync(OUT, { recursive: true });
const br = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await br.newPage({ viewport: { width: 1080, height: 1350 } });
if (process.env.LOCAL) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => { const m = r.request().url().match(/three@0\.160\.0\/(.*)$/); r.fulfill({ path: (process.env.THREE || "node_modules/three/") + m[1], contentType: "application/javascript" }); });
p.on("pageerror", e => console.log("pageerror", e.message));
await p.goto("http://localhost:8127/tr/index.html?video=1"); await p.waitForFunction(() => window.S && S.ready, null, { timeout: 90000 }); await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
const CAM = { close: { p: [-7, 4.2, 4], t: [0, 1.6, -10] }, front: { p: [0, 15, 31], t: [0, -0.5, -1] }, plan: { p: [0, 42, -1.4], t: [0, 0, -2.6] }, crowd: { p: [6, 9, 30], t: [0, 0, 6] } };
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k), camAt = (A, B, k) => ({ p: lerp(A.p, B.p, k), t: lerp(A.t, B.t, k) });
const e = k => k * k * (3 - 2 * k), cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
await p.evaluate(() => {
  const M = n => S.d.members.find(m => m.name.startsWith(n)); const su = M("Sueda"), hi = M("Hilal"), es = M("Esin");
  const o = document.createElement("div"); o.id = "outro"; document.body.appendChild(o);
  o.innerHTML = `<h2>Sahne kimin?</h2><p style="margin:-6px 0 14px;font-size:1.15em;color:#fff"><b>Tek bir kişinin değil.</b> Liderlik el değiştiriyor, altısı da sırayla öne geçiyor.</p>
    <div class="r"><i style="background:${su.color};color:${su.color}"></i><span><b>Sueda</b>en sık önde</span><em style="color:${su.color}">%18</em></div>
    <div class="r"><i style="background:${hi.color};color:${hi.color}"></i><span><b>Hilal</b>en çok yol yürüyen</span><em style="color:${hi.color}">93 m</em></div>
    <div class="r"><i style="background:${es.color};color:${es.color}"></i><span><b>Esin &amp; Lidya</b>en çok yan yana</span><em style="color:${es.color}">%57</em></div>
    <p>Manifest · Intro &amp; Hileli · OVO Arena Wembley. Konumlar konser videosundan okundu. İnteraktif harita: linki postta.</p>`;
  const b = document.createElement("div"); b.id = "tipb";
  b.style.cssText = "position:fixed;right:44px;top:372px;z-index:50;font:800 30px Manrope;padding:10px 20px;border-radius:999px;background:rgba(14,9,32,.82);border:1px solid rgba(255,255,255,.16);opacity:0;transition:opacity .25s";
  document.body.appendChild(b);
  const hk = document.createElement("div"); hk.id = "hook";
  hk.style.cssText = "position:fixed;left:60px;right:60px;top:300px;z-index:60;text-align:center;padding:34px 10px 40px;border-radius:36px;background:rgba(10,7,22,.72);backdrop-filter:blur(10px);font:800 92px/1.04 Manrope;letter-spacing:-.03em;color:#fff;text-shadow:0 6px 40px rgba(0,0,0,.8)";
  hk.innerHTML = `Manifest<br>sahnedeyken<br><span style="background:linear-gradient(90deg,#9b6bff,#ff5fb4,#ffc928,#21c47a,#3d8bff);-webkit-background-clip:text;color:transparent">liderlik kimde?</span>`;
  document.body.appendChild(hk);
  window.tipAt = () => { const dt = toData(S.t), ps = S.d.members.map(m => [m, pos(m, dt)]).sort((a, c) => c[1].y - a[1].y);
    return ps[0][1].y - ps[1][1].y > 0.3 ? ps[0][0] : null; };
  window.showTip = on => { const m = on ? tipAt() : null; b.style.opacity = m ? 1 : 0; if (m) { b.innerHTML = `<span style="color:#cfc6e6;font-weight:600;font-size:24px">önde </span><span style="color:${m.color}">▲ ${m.name.split(" ")[0]}</span>`; } };
});
const capSet = (k, title, text) => p.evaluate(([k, title, text]) => { const el = document.getElementById("cap"); if (!title) { el.classList.remove("on"); el.dataset.t = ""; return; }
  el.dataset.t = title; el.innerHTML = `<div class="k">${k}</div><b>${title}</b><span>${text}</span>`; el.classList.add("on"); }, [k, title, text]);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/day25.tmp.mp4`]);
let lastOn = ""; let CAP = [];
const FRAMES = process.env.TEST ? process.env.TEST.split(",").map(v => Math.round(+v * FPS)) : [...Array(DUR * FPS).keys()];
CAM.tilt = { p: [0, 33, 15], t: [0, 0, -0.5] };
const SEG = [[5.5, 10.5, 55, "0:55 – 1:10", "Merdivenden V'ye", "Önce Lidya ve Sueda iniyor; 1:06'da V'nin ucuna Sueda geçiyor."],
  [10.5, 23.8, 126, "2:06 – 2:46", "Uç el değiştiriyor", "Üçgen, ok, kenarlarda çiftler. 2:32'de Hilal sol uca gidip geri dönüyor."],
  [23.8, 31.1, 210, "3:30 – 3:52", "Tek sıra, sonra koşu", "Uçta önce Zeynep, sonra Lidya; 3:37'de tek düz sıra, 3:42'de ön bloğa koşu."]];
for (const n of FRAMES) {
  const s = n / FPS; let t, cam, view = "top", mode = "acc", tip = false;
  const sg = SEG.find(q => s >= q[0] && s < q[1]);
  if (s < 1.6) { t = 24 + s * 2; cam = CAM.close; view = "audience";
    CAP = []; }
  else if (s < 5.5) { t = 41 + (s - 1.6) * 1.6; cam = camAt(CAM.close, CAM.tilt, e(cl(s, 3.6, 5.5))); view = s < 4.6 ? "audience" : "top";
    CAP = s < 3.2 ? [] : ["0:45", "Işıklar yanıyor: kim kim?", "Her renk bir üye; durduğu yerde bir daire büyüyor."]; }
  else if (sg) { t = sg[2] + (s - sg[0]) * 3; cam = CAM.tilt; tip = true; CAP = [sg[3], sg[4], sg[5]]; }
  else if (s < 36.5) { t = 296; mode = "all"; cam = camAt(CAM.tilt, CAM.plan, e(cl(s, 31.1, 32.6)));
    CAP = ["0:27 – 4:56", "Bütün şarkı, tek harita", "Her daire bir durak; ne kadar uzun durduysa o kadar büyük. Zemin, orada en uzun duranın renginde."]; }
  else { t = 296; mode = "all"; cam = CAM.plan; CAP = []; }
  await p.evaluate(([t, mode, cam, view, s, tip]) => { if (S.mode !== mode) { S.mode = mode; S.heatKey = ""; } G.view = view; renderAt(t, cam); showTip(tip); const hk = document.getElementById("hook"), kh = 1 - Math.max(0, Math.min(1, (s - 2.9) / 0.4)); hk.style.opacity = kh; hk.style.transform = `scale(${1 + 0.04 * s})`;
    const o = document.getElementById("outro"), k = Math.max(0, Math.min(1, (s - 36.6) / 0.7)); o.style.opacity = k; o.style.transform = `translateY(${(1 - k) * 30}px)`; }, [t, mode, cam, view, s, tip]);
  await capSet(...CAP);
  const buf = await p.screenshot({ type: "jpeg", quality: 92 });
  if (process.env.TEST) { fs.writeFileSync(`${OUT}/test_${s.toFixed(1)}.jpg`, buf); continue; }
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if (n % 60 === 0) { console.log("frame", n); fs.writeFileSync(`${OUT}/log.txt`, `frame ${n}\n`); }
}
ff.stdin.end(); await new Promise(r => ff.on("close", r));
fs.renameSync(`${OUT}/day25.tmp.mp4`, `${OUT}/day25_sahne_kimin_TR.mp4`); fs.writeFileSync(`${OUT}/log.txt`, "done\n");
await br.close(); process.exit(0);
