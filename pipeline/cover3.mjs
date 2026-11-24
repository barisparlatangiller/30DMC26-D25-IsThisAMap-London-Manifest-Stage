// Cover (1080 × 1350): the whole song as footprints, big, with the three findings.
import { chromium } from "playwright";
import fs from "node:fs"; import http from "node:http"; import path from "node:path";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
http.createServer((q, r) => { const u = decodeURIComponent(new globalThis.URL(q.url, "http://x").pathname); const f = path.join("docs", u.endsWith("/") ? u + "index.html" : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(8128);
const br = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await br.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
if (process.env.LOCAL) await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => { const m = r.request().url().match(/three@0\.160\.0\/(.*)$/); r.fulfill({ path: (process.env.THREE || "node_modules/three/") + m[1], contentType: "application/javascript" }); });
p.on("pageerror", e => console.log("pageerror", e.message));
await p.goto("http://localhost:8128/index.html?video=1"); await p.waitForFunction(() => window.S && S.ready, null, { timeout: 90000 }); await p.evaluate(() => document.fonts.ready);
await p.addStyleTag({ content: `.dock, .cast, .lower3, .fpkey, .plancard { display: none !important; }
  body.vid .brand { top: 54px; } body.vid h1 { font-size: 104px; }
  #cv { position: fixed; left: 56px; right: 56px; bottom: 56px; z-index: 30; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  #cv .q { grid-column: 1 / -1; font: 800 48px/1 Manrope; letter-spacing: -.02em; margin: 0 0 4px; }
  #cv .c { background: rgba(20,12,43,.9); border: 1px solid var(--edge); border-radius: 22px; padding: 18px 20px 16px; }
  #cv .l { display: block; font: 700 15px Manrope; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); }
  #cv .n { display: block; font: 800 30px Manrope; margin-top: 4px; } #cv .n i { display: inline-block; width: 16px; height: 16px; border-radius: 50%; margin-right: 9px; box-shadow: 0 0 14px currentColor; background: currentColor; }
  #cv b { display: block; font: 800 60px/1.05 Manrope; letter-spacing: -.02em; color: #fff; }` });
await p.evaluate(() => {
  const M = n => S.d.members.find(m => m.name.startsWith(n)), su = M("Sueda"), hi = M("Hilal"), es = M("Esin");
  const d = document.createElement("div"); d.id = "cv"; document.body.appendChild(d);
  d.innerHTML = `<div class="q">How do six people share one stage?</div>
    <div class="c"><span class="l">In front, in turns</span><span class="n">${S.d.members.map(m => `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:5px;background:${m.color};box-shadow:0 0 10px ${m.color}"></i>`).join("")}</span><b>14×</b></div>
    <div class="c"><span class="l">Walked together</span><span class="n">${S.d.members.map(m => `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:5px;background:${m.color};box-shadow:0 0 10px ${m.color}"></i>`).join("")}</span><b>430 m</b></div>
    <div class="c"><span class="l">New formations</span><span class="n">${S.d.members.map(m => `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:5px;background:${m.color};box-shadow:0 0 10px ${m.color}"></i>`).join("")}</span><b>21×</b></div>`;
  S.mode = "all"; S.heatKey = ""; G.view = "top";
  renderAt(296, { p: [0, 41, 0.2], t: [0, 0, -1.4] });
});
await p.waitForTimeout(800);
await p.screenshot({ path: "media/Day25_cover_v4.png" });
await br.close(); process.exit(0);
