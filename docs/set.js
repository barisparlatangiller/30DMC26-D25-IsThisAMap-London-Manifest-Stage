// The stage set around the map, built after the concert video: LED walls, truss and moving heads, edge light strips,
// wedges and line arrays, live close-up screens (IMAG), CO₂ jets at the moments they fire, haze and a crowd.
// Nothing here is data: it only makes the stage look like the night. The map (colours, paths, positions) is in app.js.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();   // stable "random"

// ── performers: stylised figures in each one's look (hair, costume) as seen in the video ──
const LOOK = {
  Hilal:  { hair: 0x1b1310, skin: 0xc8977a, top: 0xc8977a, band: 0xc9b38c, skirt: 0xb9a07a, jacket: 0x6e5a40, curls: 1.35, txt: "#120a26" },
  Zeynep: { hair: 0x1d1f3a, streak: 0x2f62e6, skin: 0xe2c0a6, top: 0x6a4630, band: 0x6a4630, skirt: 0x8e7358, jacket: 0xcdb99c, curls: 1.1, txt: "#ffffff" },
  Esin:   { hair: 0x8c4a2b, skin: 0xe8c6ad, top: 0xcdb894, band: 0xcdb894, skirt: 0xc4ae88, jacket: 0xd3c09e, curls: 1.15, txt: "#120a26" },
  Lidya:  { hair: 0xf1e7cc, skin: 0xedd2bf, top: 0xf3f0ea, band: 0xf3f0ea, skirt: 0xece7de, jacket: null, curls: 1.2, txt: "#120a26" },
  Mina:   { hair: 0xd7a253, skin: 0xebcbb5, top: 0xf1ebdf, band: 0xf1ebdf, skirt: 0xebe2d2, jacket: null, curls: 1.1, txt: "#120a26" },
  Sueda:  { hair: 0xe4cf94, skin: 0xeccbb3, top: 0xd8c6a2, band: 0xd8c6a2, skirt: 0xd2bf9b, jacket: 0xdccaa6, curls: 1.25, txt: "#120a26" },
};
export function lookOf(name) { return LOOK[name.split(" ")[0]] || LOOK.Lidya; }

// One smooth silhouette per performer (a turned profile, like a statuette), lit by a rim of her colour.
// Costume zones follow the height: boots, skirt, top, skin, hair. No limbs to wave: she sways, she does not flail.
const PROF = [[0, 0], [0.085, 0], [0.09, 0.06], [0.075, 0.36], [0.085, 0.5], [0.1, 0.64], [0.15, 0.74], [0.25, 0.8], [0.27, 0.83], [0.21, 0.88],
  [0.135, 0.99], [0.128, 1.04], [0.15, 1.13], [0.175, 1.24], [0.19, 1.3], [0.165, 1.36], [0.06, 1.41], [0.052, 1.45], [0.085, 1.49], [0.1, 1.55],
  [0.098, 1.61], [0.07, 1.67], [0.03, 1.7], [0, 1.705]];
const VS = `varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){ vec4 wp = modelMatrix*vec4(position,1.); vY = position.y; vN = normalize(normalMatrix*normal);
    vec4 mv = viewMatrix*wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const FS = `uniform vec3 uBoot, uSkirt, uTop, uSkin, uAcc; uniform float uOp, uHair; varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){
    vec3 c = uHair > .5 ? uTop : (vY < .74 ? uBoot : vY < .985 ? uSkirt : vY < 1.405 ? uTop : uSkin);
    if (uHair < .5 && vY < .5 && vY > .44) c = uSkin;                          // a sliver of knee above the boots
    float lam = .55 + .45*max(dot(vN, normalize(vec3(.3,.8,.6))), 0.);       // soft key light from the front-top
    float fr = pow(1. - max(dot(vN, vV), 0.), 2.4);                            // rim in her colour
    vec3 col = c*lam*.95 + uAcc*fr*1.35 + vec3(1.)*pow(fr, 6.)*.25;
    gl_FragColor = vec4(col, uOp); }`;
const hex = h => new THREE.Color(h);
export function makeFigure(name, accent) {
  const L = lookOf(name), acc = new THREE.Color(accent), mats = [];
  const mk = (hair) => { const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: false,
    uniforms: { uBoot: { value: hex(0xeeeae4) }, uSkirt: { value: hex(L.skirt) }, uTop: { value: hex(hair ? L.hair : L.top) }, uSkin: { value: hex(L.skin) },
      uAcc: { value: acc }, uOp: { value: 1 }, uHair: { value: hair ? 1 : 0 } } }); mats.push(m); return m; };
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const geo = new THREE.LatheGeometry(PROF.map(([r, y]) => new THREE.Vector2(r, y)), 40); geo.scale(1, 1, 0.74);
  const body = new THREE.Mesh(geo, mk(false)); root.add(body);
  // hair: a cap and a long fall down the back (wider for the curly heads)
  const hm = mk(true), cu = L.curls;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hm); cap.position.y = 1.585; cap.scale.set(cu, 1.06, cu * 0.95); root.add(cap);
  const fallG = new THREE.LatheGeometry([[0.1, 0], [0.12 * cu, 0.12], [0.135 * cu, 0.3], [0.12 * cu, 0.42], [0.085, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 28, Math.PI * 0.55, Math.PI * 0.9);
  const fall = new THREE.Mesh(fallG, hm); fall.position.y = 1.1 + (cu > 1.2 ? 0 : 0.05); fall.rotation.y = Math.PI * 0.72 + Math.PI; hm.side = THREE.DoubleSide; root.add(fall);
  return { g, root, mats, txt: L.txt };
}
// a sway on the beat, nothing more
export function poseFigure(F, t, i) {
  const b = (t * 2.05 + i * 0.37) * Math.PI * 2;
  F.root.rotation.y = 0.12 * Math.sin(b / 4 + i); F.root.rotation.z = 0.025 * Math.sin(b / 2); F.root.position.y = 0.012 * Math.abs(Math.sin(b / 2));
  for (const m of F.mats) { m.uniforms.uOp.value = m.opacity; }
}

// ── LED wall: a red kaleidoscope, like the visuals on the night ──
function ledCanvas() { const c = document.createElement("canvas"); c.width = 512; c.height = 256; return c; }
function drawLED(c, t, look) {
  const g = c.getContext("2d"), W = c.width, H = c.height; g.globalCompositeOperation = "source-over"; g.fillStyle = "#050208"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const hue = look === 1 ? [255, 120, 40] : look === 2 ? [230, 70, 200] : [255, 40, 50];
  for (const cx of [W * 0.22, W * 0.78]) {
    for (let ring = 0; ring < 5; ring++) {
      const n = 8 + ring * 4, rr = 18 + ring * 22 + 6 * Math.sin(t * 1.3 + ring), rot = t * (ring % 2 ? 0.35 : -0.28);
      for (let k = 0; k < n; k++) {
        const an = rot + k * Math.PI * 2 / n, x = cx + Math.cos(an) * rr, y = H / 2 + Math.sin(an) * rr * 0.92;
        const s = 7 + 5 * Math.sin(t * 2.1 + k + ring), al = 0.35 + 0.3 * Math.sin(t * 3 + k * 0.7);
        g.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${al.toFixed(2)})`; g.beginPath(); g.ellipse(x, y, s, s * 0.45, an, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // fine lace lines across the wall
  g.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},.22)`; g.lineWidth = 1.2;
  for (let k = 0; k < 14; k++) { g.beginPath(); for (let x = 0; x <= W; x += 16) { const y = H / 2 + Math.sin(x / 40 + t * 0.8 + k) * (20 + k * 7); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.globalCompositeOperation = "source-over";
}

export function buildSet({ r, scene, cam, S, W3, parts, BASE, glowTex }) {
  const X = {}, floorH = -BASE, ph = parts.platform.h - BASE;
  // reflections for the glossy deck and the figures
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.12;

  // LED wall behind the arch, wider than the stage, and a header band above it
  X.led = ledCanvas(); X.ledTex = new THREE.CanvasTexture(X.led); X.ledTex.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(36, 13), new THREE.MeshBasicMaterial({ map: X.ledTex, color: 0xd8d8d8, fog: false }));
  wall.position.set(0, ph + 6.2, -S.d.h / 2 - 1.4); wall.renderOrder = -2; scene.add(wall);
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(37, 14), new THREE.MeshBasicMaterial({ color: 0x07040d, fog: false })); frame.position.set(0, ph + 6.2, -S.d.h / 2 - 1.45); scene.add(frame);

  // truss over the stage and moving-head beams
  const trussM = new THREE.MeshStandardMaterial({ color: 0x2a2833, metalness: 0.8, roughness: 0.35 }), TY = 11.5;
  const bar = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.42, 0.42), trussM);
    m.position.set((x0 + x1) / 2, TY, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); scene.add(m); };
  bar(-14, -11, 14, -11); bar(-14, -3, 14, -3); bar(-14, -11, -14, -3); bar(14, -11, 14, -3); bar(-6, 5, 6, 5); bar(-6, -3, -6, 5); bar(6, -3, 6, 5);
  const fixM = new THREE.MeshStandardMaterial({ color: 0x15131c, metalness: 0.6, roughness: 0.4 });
  X.heads = [];
  const beamT = (() => { const c = document.createElement("canvas"); c.width = 32; c.height = 256; const g = c.getContext("2d"), v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,1)"); v.addColorStop(0.5, "rgba(255,255,255,.35)"); v.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = v; g.fillRect(0, 0, 32, 256); return new THREE.CanvasTexture(c); })();
  const spots = [...[-12, -8, -4, 0, 4, 8, 12].map(x => [x, -11]), ...[-12, -6, 6, 12].map(x => [x, -3]), [-6, 5], [6, 5]];
  spots.forEach(([x, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, TY - 0.45, z); scene.add(pivot);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), fixM); pivot.add(body);
    const len = 16, cone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 1.5, len, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: beamT, color: 0xffa040, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    cone.position.y = -len / 2; pivot.add(cone);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); lens.rotation.x = Math.PI / 2; lens.position.y = -0.26; pivot.add(lens);
    X.heads.push({ pivot, cone, lens, i, x, z });
  });

  // light strips along the stage edges (white, as on the night)
  const stripM = new THREE.MeshBasicMaterial({ color: 0xfff6ee }); const strip = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0) || 0.1;
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.05), stripM); m.position.set((x0 + x1) / 2, -0.05, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); scene.add(m); };
  strip(-12, -4, -3.75, -4); strip(3.75, -4, 12, -4); strip(-3.75, -4, -3.75, 4); strip(3.75, -4, 3.75, 4);
  strip(-9, 4, -3.75, 4); strip(3.75, 4, 9, 4); strip(-9, 4, -9, 12); strip(9, 4, 9, 12); strip(-9, 12, 9, 12);
  // wedges on the main-stage front and line arrays at the sides
  const blk = new THREE.MeshStandardMaterial({ color: 0x0c0b10, roughness: 0.5, metalness: 0.4 }), grill = new THREE.MeshBasicMaterial({ color: 0x2b2836 });
  for (const x of [-10.5, -6.8, 6.8, 10.5]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.6), blk); w.position.set(x, 0.2, -4.45); w.rotation.x = -0.35; scene.add(w);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), grill); f.position.set(x, 0.24, -4.13); f.rotation.x = -0.35 - Math.PI / 2 + Math.PI / 2; scene.add(f); }
  for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.75), blk); b.position.set(sx * 15.6, 9.6 - k * 0.45, -3.2); b.rotation.x = 0.03 * k; scene.add(b); }

  // IMAG: two screens beside the stage showing a live close-up camera on the performers
  X.rt = new THREE.WebGLRenderTarget(640, 360, { colorSpace: THREE.SRGBColorSpace }); X.icam = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 120);
  X.screens = [-1, 1].map(sx => { const g = new THREE.Group(); g.position.set(sx * 16.8, 7.4, -8.5); g.rotation.y = -sx * 0.3;
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 5.5), new THREE.MeshBasicMaterial({ color: 0x050308, fog: false })); g.add(fr);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.06), new THREE.MeshBasicMaterial({ map: X.rt.texture, fog: false, toneMapped: false })); sc.position.z = 0.02; g.add(sc);
    scene.add(g); return g; });

  // CO₂ jets along the main-stage front, at the moments they fire in the video
  X.jets = { at: [[95, 96.9], [129.8, 131.6], [146.8, 148.6], [272.6, 274.6]], xs: [-10, -5.5, 5.5, 10], z: -4.4, N: 70 };
  const jp = new Float32Array(X.jets.xs.length * X.jets.N * 3), ja = new Float32Array(X.jets.xs.length * X.jets.N);
  const jg = new THREE.BufferGeometry(); jg.setAttribute("position", new THREE.BufferAttribute(jp, 3)); jg.setAttribute("alpha", new THREE.BufferAttribute(ja, 1));
  X.jetMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: glowTex(0.9) }, scale: { value: 900 } },
    vertexShader: "attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = scale*(0.6+alpha)/-mv.z; gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform sampler2D map; varying float vA; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.95,0.95,1.0), c.a*vA*0.9); }" });
  X.jetPts = new THREE.Points(jg, X.jetMat); X.jetPts.frustumCulled = false; scene.add(X.jetPts);
  X.seed = Array.from({ length: X.jets.xs.length * X.jets.N }, () => [rnd(), rnd(), rnd()]);

  // haze: soft veils drifting through the light
  const hz = document.createElement("canvas"); hz.width = hz.height = 256; { const g = hz.getContext("2d");
    for (let k = 0; k < 60; k++) { const x = rnd() * 256, y = rnd() * 256, rr = 30 + rnd() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, "rgba(255,255,255,.10)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); } }
  const hzT = new THREE.CanvasTexture(hz); hzT.wrapS = hzT.wrapT = THREE.RepeatWrapping;
  X.haze = [0, 1, 2].map(k => { const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshBasicMaterial({ map: hzT.clone(), color: 0xb9a8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping; m.position.set(0, 3.2 + k * 1.6, -9 + k * 5); scene.add(m); return m; });

  // the crowd: heads and shoulders in the dark, some hands up
  const crowdM = new THREE.MeshStandardMaterial({ color: 0x06040b, roughness: 1, envMapIntensity: 0 }), cGeo = new THREE.CapsuleGeometry(0.16, 0.26, 3, 8);
  const pts = []; for (let i = 0; i < 6000 && pts.length < 1800; i++) { const x = rnd() * 52 - 26, z = rnd() * 30 - 6;
    if ((z < 13.2 && Math.abs(x) < 9.6) || (z < -3.4 && Math.abs(x) < 12.6) || (z < 4.6 && Math.abs(x) < 4.4) || Math.hypot(x, z - 4) > 30) continue; pts.push([x, z]); }
  const inst = new THREE.InstancedMesh(cGeo, crowdM, pts.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  pts.forEach(([x, z], i) => { const h = 1.2 + rnd() * 0.25; sc.set(1, 1 + rnd() * 0.25, 1); m4.compose(new THREE.Vector3(x, floorH + h - 0.35, z), q, sc); inst.setMatrixAt(i, m4); });
  scene.add(inst); X.crowd = inst;
  return X;
}

const look = t => t < 69 ? 2 : (t > 228 && t < 262) ? 1 : 0;                       // magenta at the start, warm on the front block, red otherwise
export function updateSet(X, { r, scene, S, t, now, G, pos, W3, BASE }) {
  // LED wall
  if (!X.ledN || (X.ledN++ % 2 === 0)) { drawLED(X.led, t, look(t)); X.ledTex.needsUpdate = true; } X.ledN = X.ledN || 1;
  // moving heads: slow sweeps that cross into X shapes, warmer or cooler with the song
  const col = look(t) === 2 ? 0xd890ff : look(t) === 1 ? 0xffc070 : 0xff8a40;
  for (const h of X.heads) {
    const ph = t * 0.55 + h.i * 0.8, side = h.x < 0 ? 1 : -1;
    h.pivot.rotation.z = side * (0.35 + 0.25 * Math.sin(ph)); h.pivot.rotation.x = 0.25 * Math.sin(ph * 0.7 + h.i);
    h.cone.material.color.setHex(col); h.cone.material.opacity = 0.11 + 0.05 * Math.sin(ph * 1.7);
  }
  // haze drift
  X.haze.forEach((m, k) => { m.material.map.offset.x = (t * 0.008 * (k + 1)) % 1; m.material.map.offset.y = (t * 0.003 * (k + 1)) % 1; });
  // CO₂ jets: deterministic in time, so scrubbing and the video render show the same plume
  const pa = X.jetPts.geometry.attributes.position, al = X.jetPts.geometry.attributes.alpha; let any = false;
  const win = X.jets.at.find(([a, b]) => t >= a - 0.05 && t <= b + 1.8);
  for (let e = 0; e < X.jets.xs.length; e++) for (let k = 0; k < X.jets.N; k++) {
    const i = e * X.jets.N + k, [s1, s2, s3] = X.seed[i];
    let a = 0, x = 0, y = -50, z = 0;
    if (win) { const born = win[0] + s1 * (win[1] - win[0]), age = t - born, life = 1.7;
      if (age > 0 && age < life) { const f = age / life; a = (1 - f) * Math.min(1, age * 6); y = age * 6.5 * (1 - 0.3 * f); x = X.jets.xs[e] + (s2 - 0.5) * (0.3 + f * 2.2); z = X.jets.z + (s3 - 0.5) * (0.3 + f * 1.8); any = true; } }
    pa.setXYZ(i, x, y, z); al.setX(i, a);
  }
  pa.needsUpdate = al.needsUpdate = true; X.jetPts.visible = any;
  // IMAG close-up camera: follows the performers seen on stage
  let cx = 0, cz = 0, cy = 0, n = 0;
  for (const m of S.d.members) { if (!S.on.has(m.key)) continue; const p = pos(m, S.dt); if (p.state === "g") continue; const v = W3(p.x, p.y, p.z - BASE); cx += v.x; cy += v.y; cz += v.z; n++; }
  if (n) { cx /= n; cy /= n; cz /= n; }
  const tgt = new THREE.Vector3(cx, cy + 1.2, cz); X.icamT = X.icamT ? X.icamT.lerp(tgt, 0.08) : tgt.clone();
  X.icam.position.set(X.icamT.x + 3 * Math.sin(t * 0.13), X.icamT.y + 0.4, X.icamT.z + 9.5); X.icam.lookAt(X.icamT);
  X.screens.forEach(s => s.visible = false); const fogD = scene.fog.density; scene.fog.density = 0.004;
  r.setRenderTarget(X.rt); r.render(scene, X.icam); r.setRenderTarget(null);
  scene.fog.density = fogD; X.screens.forEach(s => s.visible = true);
}
