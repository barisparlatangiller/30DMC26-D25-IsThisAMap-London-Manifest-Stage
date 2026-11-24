"""
Stage plan + positions → docs/data/stage.json for the web player.

The surveyed stage (EPSG:27700) runs west → east: platform and stairs at the back (west), main stage, runway, front block
towards the audience (east). For the map it is turned 90° clockwise (a rotation, not a mirror), so the back of the stage is
north and the audience south. Stage-left and stage-right stay as the camera sees them.

Local coordinates in metres, origin at the north-west corner of the stage, x to the east, y to the south (screen order).

  python pipeline/prepare.py
"""
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely

# data clock → video clock (see the note further down)
WARP_ = [[26, 27.5], [56, 56.5], [72, 69.5], [156, 151.5], [163, 157.5], [168, 164.5], [214, 213], [220, 222.5], [226, 228.5], [290, 294]]

D, OUT = Path("data"), Path("docs/data")
WHO = {  # dress colour in the source data → member, pastel colour
    "Siyah":   ("Hilal",        "#c9b8f5"),
    "Kizil":   ("Mina",         "#f4a3a0"),
    "Kumral":  ("Esin",         "#f3dd8e"),
    "Mavi":    ("Zeynep Oktay", "#a9cdf2"),
    "Dalgali": ("Sueda",        "#a8ddbe"),
    "Platin":  ("Lidya",        "#f3b8d6"),
}
WEIGHT = {"net": 1.0, "yaklasik": 0.6, "siluet": 0.4, "gorunmuyor": 0.0}

stage = gpd.read_file(D / "Sahne.gpkg")
plat = gpd.read_file(D / "Sahne_Merdiven.gpkg")
pts = gpd.read_file(D / "Konumlar_2SN.gpkg")
lines = gpd.read_file(D / "Konumlar_Linelar.gpkg")

allb = shapely.union_all(list(stage.geometry) + list(plat.geometry)).bounds    # minx, miny, maxx, maxy
X0, X1, Y0, Y1 = allb[0], allb[2], allb[1], allb[3]
W, H = Y1 - Y0, X1 - X0          # after the turn: width = old north–south extent, height = old west–east extent


def rot(x, y):
    """90° clockwise: old west → north (top), old north → east. Returns screen coords (x right, y down)."""
    return (np.asarray(y) - Y0, np.asarray(x) - X0)     # x' = y - Y0 ; y'(down) = x - X0


def ring(g):
    xs, ys = g.exterior.coords.xy
    a, b = rot(np.array(xs), np.array(ys))
    return [[round(float(p), 2), round(float(q), 2)] for p, q in zip(a, b)]


parts = [{"id": r.ad, "poly": ring(r.geometry), "h": float(r.yukseklik_m)} for r in stage.itertuples()] + \
        [{"id": r.ad, "poly": ring(r.geometry), "h": float(r.yukseklik_m) + float(r.taban_m)} for r in plat.itertuples()]

# the stairs end at y = 4.0 m: in the video the six reach the main-stage end of the steps there, so the last metre of the
# drawn stairs belongs to the main stage (positions there are re-zoned and set to main-stage height)
STAIR_END = 4.0
MAIN_H = next(p["h"] for p in parts if p["id"] == "ana_sahne")
# and the stairs are drawn wide (6–18 m, 5 steps): in the video all six come down side by side
for p_ in parts:
    if p_["id"] == "merdiven":
        p_["poly"] = [[6.0, STAIR_END], [18.0, STAIR_END], [18.0, 2.5], [6.0, 2.5], [6.0, STAIR_END]]

members = []
for kiz, (name, col) in WHO.items():
    p = pts[pts.kiz == kiz].sort_values("saniye")
    a, b = rot(p.geometry.x.values, p.geometry.y.values)
    s = [[int(t), round(float(x), 2), round(float(y), 2), round(float(z), 2), WEIGHT[d], d[0], zo, int(v == "gozlem")]
         for t, x, y, z, d, zo, v in zip(p.saniye, a, b, p.z_m, p.durum, p.bolge, p.veri_turu)]
    for r in s:
        if r[6] == "merdiven" and r[2] >= STAIR_END:
            r[6], r[3] = "ana_sahne_on", MAIN_H
    secs = {}
    for t, x, y, z, w, d, zo, o in s:
        if w > 0:
            secs[zo] = secs.get(zo, 0) + 2
    ln = lines[lines.kiz == kiz]
    members.append({"key": kiz, "name": name, "color": col, "s": s, "zones_s": secs,
                    "path_m": round(float(ln.uzunluk_m.iloc[0]), 1) if len(ln) else None,
                    "obs": int((p.veri_turu == "gozlem").sum())})

# corrections from the video (checked with Barış, 9 Nov):
# 1) at the start, on the platform, Esin and Lidya stand in each other's place; from 0:56 to 1:00 (data) they slip back
#    into their recorded positions, and everything after that is as recorded
# 2) after the stairs the six stand at the front edge of the main stage, not at the foot of the stairs: main-stage
#    positions move 1.5 m toward the audience (at most to 7.6 m, the stage edge is at 8 m)
byname = {m["name"]: m for m in members}
E, L = byname["Esin"]["s"], byname["Lidya"]["s"]
for k in range(len(E)):
    t = E[k][0]
    if t >= 60: break
    f = 1.0 if t <= 56 else (60 - t) / 4
    ex, lx = E[k][1], L[k][1]
    E[k][1], L[k][1] = round(f * lx + (1 - f) * ex, 2), round(f * ex + (1 - f) * lx, 2)
for m in members:
    for r in m["s"]:
        if r[6] == "ana_sahne_on" and r[0] >= 70:
            r[2] = round(min(r[2] + 1.5, 7.6), 2)

# 2b) the camera moves all the time, the six much less: small shifts in the notes (under 0.8 m) are mostly the camera, not
#     the performers. Each one holds her place until she really moves (more than 0.8 m) or changes part of the stage.
# 2a) camera continuity: when the camera cuts, the six seem to jump forward, back or sideways together. If they stood side by side
#     before the cut and side by side after it, they did not move: the whole group shifting at once between two readings is the
#     camera. So the group's centre is smoothed (median over 14 s) and each one keeps her place relative to the others; then each
#     one's own track loses single-reading spikes (median over 10 s). Real moves (a change of stage part, a swap) stay sharp.
def _med(v, k):
    h = k // 2; return [float(np.median(v[max(0, i - h):i + h + 1])) for i in range(len(v))]
NS = len(members[0]["s"])
zone_of = [max(set(z), key=z.count) for z in ([m["s"][k][6] for m in members] for k in range(NS))]
runs, a0 = [], 0
for k in range(1, NS + 1):
    if k == NS or zone_of[k] != zone_of[a0]: runs.append((a0, k)); a0 = k
for a, b in runs:
    if b - a < 3: continue
    for c in (1, 2):
        mean = [float(np.mean([m["s"][k][c] for m in members if m["s"][k][6] == zone_of[k]])) for k in range(a, b)]
        sm = _med(mean, 7)
        for j, k in enumerate(range(a, b)):
            for m in members:
                if m["s"][k][6] == zone_of[k]: m["s"][k][c] = round(m["s"][k][c] + sm[j] - mean[j], 2)
for m in members:
    s, k0 = m["s"], 0
    for k in range(1, NS + 1):
        if k == NS or s[k][6] != s[k0][6]:
            if k - k0 >= 3:
                for c in (1, 2):
                    sm = _med([s[i][c] for i in range(k0, k)], 5)
                    for j, i in enumerate(range(k0, k)): s[i][c] = round(sm[j], 2)
            k0 = k

HOLD = 0.8
for m in members:
    hx = hy = hz = None
    for r in m["s"]:
        if hz != r[6] or abs(r[1] - hx) > HOLD or abs(r[2] - hy) > HOLD:
            hx, hy, hz = r[1], r[2], r[6]
        else:
            r[1], r[2] = hx, hy

# 2c) left-to-right order read from the video where the notes have it differently (letters: first letter of each name, seen
#     from the audience). Inside each window the six keep the positions of the notes, but who stands where follows the video.
ORDER = [(140.8, 150.5, "ESZLHM")]
_wa0 = np.array(WARP_, dtype=float)
_ini = {m["name"][0]: m for m in members}
for va, vb, seq in ORDER:
    for k in range(len(members[0]["s"])):
        vt = float(np.interp(members[0]["s"][k][0], _wa0[:, 0], _wa0[:, 1]))
        if not (va <= vt <= vb): continue
        xs = sorted(m["s"][k][1] for m in members)
        for x, ch in zip(xs, seq):
            _ini[ch]["s"][k][1] = x

# 3) front/back: the data put all six on one line. Read again from the video (9 Nov, every 2.5 s, wide shots only): who stands
#    behind whom, as metres toward the back, by rank from the audience's left. Between readings the offset is interpolated.
#    Video seconds; the WARP below is applied to find the data time of each sample.
DEPTH = [
    (74, [0, 0, 0, 0, 0, 0]), (79, [-0.3, 0, 0, -0.6, 0, -0.5]), (81.5, [0, 0, 0, -1.0, 0, -0.8]),
    (84, [0, 0, 0, -1.0, 0, -1.0]), (86.5, [-0.4, 0, 0, -1.2, 0, 0]), (91.5, [0, 0, 0, 0, 0, -1.0]), (94, [0, 0.2, 0, 0.1, 0, -2.0]),
    (99, [0, 0, 0, 0, 0, -0.5]), (104, [0, 0, 0, 0, 0, -1.5]), (106.5, [0, 0, 0, 0, 0, -2.2]), (109, [0, 0, 0, 0, 0, -1.5]),
    (113, [0, 0, 0, 0, 0, -0.4]), (116.5, [0, 0, 0, 0, -0.5, -0.5]), (134, [0, 0, -0.2, -0.2, -0.4, -0.5]),
    (139, [0, 0, 0, 0, -0.5, -1.8]), (141.5, [0, 0, 0, 0, 0, 0]), (149, [0, 0, 0, 0, 0, 0]),
    (152, [0, -2.0, -2.5, -2.0, 0, 0]), (164, [0, -2.5, -2.5, -2.5, 0, 0]), (166.5, [0, -2.0, -2.2, -2.0, -1.0, 0]),
    (170, [0, 0, 0, 0, 0, 0]), (179, [0, 0, 0, -1.0, 0, 0]), (181.5, [-0.5, 0, 0, 0, 0, 0]), (189, [0, 0, 0, 0, 0, 0]),
    (199, [0, 0, 0, 0, 0, -0.4]), (214, [-1.0, 0, 0, 0, -0.4, 0]), (220, [0, 0, 0, 0, 0, 0]),
    (232, [0, 0, 0, 0, 0, 0]), (234, [0, 0, -0.9, 0, 0.4, 0]), (238, [0, 0, -0.5, 0, 0.2, 0]), (249, [0, 0.2, 0, -0.4, 0, 0]), (256, [0, 0, 0, 0, 0, 0]), (262, [0, 0, 0, 0, 0, 0]), (269, [0, 0, 0, 0, 0, 0]),
    (276.5, [0, 0, 0, 0, -0.3, -0.5]), (279, [0, 0, 0, 0, 0, 0]), (289, [0, 0.4, 0, -0.5, -0.7, 0.6]), (294, [0, 0, 0, 0, 0, 0]),
]
_wa = np.array(WARP_, dtype=float)
_dv = np.array([d for d, _ in DEPTH]); _dm = np.array([o for _, o in DEPTH])
for k in range(len(members[0]["s"])):
    t = members[0]["s"][k][0]; vt = float(np.interp(t, _wa[:, 0], _wa[:, 1]))
    if vt < _dv[0] or vt > _dv[-1]: continue
    off = [float(np.interp(vt, _dv, _dm[:, j])) for j in range(6)]
    rank = sorted(range(len(members)), key=lambda i: members[i]["s"][k][1])
    for j, i in enumerate(rank):
        r = members[i]["s"][k]
        if r[6] in ("ana_sahne_on", "on_blok", "runway") and off[j]:
            r[2] = round(r[2] + off[j], 2)

# 4) moments where the video shows the order differently (checked second by second, and with Barış): from 1:10 to 1:18 Hilal
#    stands centre front, and only at 1:18 does Esin take her place; Hilal stays on the left until 1:28
#    and crosses during the crowd shots, Zeynep is still the leftmost at 2:14. And two moments where the video shows the two dark-haired performers somewhere else than the notes: at 3:01 Hilal is up on the
#    bottom steps and Zeynep walks off to the right edge, at the back; at 3:09 Zeynep dances hidden right behind the line.
NAMED = [(70.5, 77.5, "Hilal", None, 0.8), (74.5, 77.5, "Hilal", 12.2, None), (74.5, 77.5, "Esin", 9.6, None),
         (83.0, 88.5, "Hilal", 8.8, None), (83.0, 88.5, "Zeynep Oktay", 9.9, None), (132.0, 135.6, "Zeynep Oktay", 9.4, None), (133.5, 135.6, "Hilal", 14.6, None), (136.4, 140.6, "Hilal", 11.9, None),
         (180.0, 183.5, "Hilal", None, -2.6), (180.0, 183.5, "Zeynep Oktay", 14.6, -2.0),
         (187.5, 191.5, "Zeynep Oktay", 12.9, -1.8), (187.5, 191.5, "Hilal", 11.3, None)]
for va, vb, nm, nx, dy in NAMED:
    m = byname[nm]
    for r in m["s"]:
        vt = float(np.interp(r[0], _wa[:, 0], _wa[:, 1]))
        if va <= vt <= vb:
            if nx is not None: r[1] = nx
            if dy is not None: r[2] = round(r[2] + dy, 2)

# 5) 4:21-4:39: the notes had the six rushing to the front edge and back. Seen again from all angles (side camera at 4:21-4:24,
#    from behind at 4:29, wide at 4:30-4:31, front at 4:32), they only settle into one line and drift slightly back. So between
#    the last sample before 4:21 and the first one after 4:39 each glides on a straight line.
_vts = [float(np.interp(r[0], _wa[:, 0], _wa[:, 1])) for r in members[0]["s"]]
k0 = max(k for k, v in enumerate(_vts) if v <= 261.5); k1 = min(k for k, v in enumerate(_vts) if v >= 279.0)
for m in members:
    a0, a1 = m["s"][k0], m["s"][k1]
    for k in range(k0 + 1, k1):
        f = (_vts[k] - _vts[k0]) / (_vts[k1] - _vts[k0]); r = m["s"][k]
        r[1] = round(a0[1] + f * (a1[1] - a0[1]), 2); r[2] = round(a0[2] + f * (a1[2] - a0[2]), 2); r[6] = "on_blok"

_vt = [float(np.interp(r[0], _wa[:, 0], _wa[:, 1])) for r in members[0]["s"]]
# 5b) steadiness pass (24 Nov, with Barış): a performer only moves when she really moves. Camera changes made the notes
#    drift by a metre or so; those drifts are dropped. A new place counts only if it is more than 1.3 m away and she stays
#    there for at least two readings (4 s); a change of stage part (stairs, runway, front block) always counts.
#    While the camera does not show her ("not visible"), she keeps her last seen place.
STEADY, STAY = 1.3, 0.9
RUNWIN = (221.9, 228.6)
for m in members:
    s = m["s"]; n = len(s); hx, hy, hz = s[0][1], s[0][2], s[0][6]
    k = 0
    while k < n:
        r = s[k]; v = _vt[k]
        if v < 60 or RUNWIN[0] <= v <= RUNWIN[1] or r[6] in ("platform", "merdiven", "runway"):
            hx, hy, hz = r[1], r[2], r[6]; k += 1; continue
        if r[6] != hz:
            hx, hy, hz = r[1], r[2], r[6]; k += 1; continue
        if r[5] == "g":
            r[1], r[2] = hx, hy; k += 1; continue
        if abs(r[1] - hx) > STEADY or abs(r[2] - hy) > STEADY:
            nxt = [s[j] for j in range(k, min(n, k + 3)) if s[j][6] == hz and s[j][5] != "g"]
            if len(nxt) >= 2 and all(abs(q[1] - r[1]) <= STAY and abs(q[2] - r[2]) <= STAY for q in nxt[:2]):
                hx = round(sum(q[1] for q in nxt[:2]) / 2, 2); hy = round(sum(q[2] for q in nxt[:2]) / 2, 2)
        r[1], r[2] = hx, hy; k += 1

# 7) the descent, 0:55-1:05, step by step with Barış (24 Nov, video at ¼ speed): Lidya and Sueda go first, Lidya leading and Sueda
#    behind her, down the centre towards the front of the main stage. Esin and Mina follow, then Zeynep, then Hilal; Mina is the
#    slowest of the four. At 1:04 the six stand as an arrow: Lidya at the tip, Sueda right behind her, Zeynep and Hilal a step
#    back, Esin and Mina at the back corners. Keyframes in video seconds: (t, x, y).
DESC = {
    "Lidya":        [(56.0, 8.6, 1.6), (56.8, 10.0, 2.7), (58.0, 11.2, 3.8), (59.5, 12.0, 5.0), (61.0, 12.0, 6.0), (64.0, 12.0, 7.0)],
    "Sueda":        [(56.0, 15.6, 1.6), (56.8, 14.0, 2.7), (58.0, 12.8, 3.6), (59.5, 12.0, 4.3), (61.0, 12.0, 5.1), (64.0, 12.0, 6.1)],
    "Esin":         [(59.5, 9.8, 1.6), (60.0, 10.0, 2.7), (61.0, 9.4, 4.3), (64.0, 8.6, 4.6)],
    "Mina":         [(59.5, 14.1, 1.6), (60.2, 14.0, 2.7), (61.5, 14.3, 3.4), (62.5, 14.8, 4.3), (64.0, 15.4, 4.6)],
    "Zeynep Oktay": [(60.0, 11.3, 1.6), (60.5, 11.0, 2.7), (61.0, 10.9, 3.6), (62.0, 10.5, 4.5), (64.0, 10.3, 5.4)],
    "Hilal":        [(60.5, 12.6, 1.6), (61.0, 12.9, 2.7), (62.0, 13.5, 4.2), (64.0, 13.7, 5.4)],
}
for nm, ks in DESC.items():
    kt = np.array([k[0] for k in ks]); kx = np.array([k[1] for k in ks]); ky = np.array([k[2] for k in ks])
    for r, v in zip(byname[nm]["s"], _vt):
        if not (55.5 <= v <= 67.0): continue
        r[1] = round(float(np.interp(v, kt, kx)), 2); r[2] = round(float(np.interp(v, kt, ky)), 2)
        r[6] = "platform" if r[2] < 2.5 else "merdiven" if r[2] < 4.0 else "ana_sahne_on"
        r[3] = 3.3 if r[6] == "platform" else round(1.8 + (4.0 - r[2]), 2) if r[6] == "merdiven" else 1.8

# 6) formations read from the video by Barış (24 Nov), seen from the audience: x left → right, y toward the crowd.
#    Inside each window (video seconds) the six stand as listed; 1 s at each edge blends from and back to the notes.
F = {
    "v_0109": ((67.0, 69.5), {"Sueda": (12.0, 7.3), "Zeynep Oktay": (10.2, 6.3), "Hilal": (13.8, 6.3), "Esin": (8.6, 5.3), "Lidya": (12.0, 4.4), "Mina": (15.4, 5.3)}),   # from 1:06 Lidya walks to the very back, Sueda to the tip
    "l_0110": ((70.5, 77.5), {"Esin": (7.6, 6.6), "Zeynep Oktay": (9.8, 6.6), "Hilal": (12.0, 7.4), "Sueda": (14.2, 6.6), "Mina": (16.4, 6.6), "Lidya": (12.0, 5.6)}),   # 1:10-1:13: Hilal steps out in front, Lidya hidden right behind her (with Barış)
    "r_0122": ((78.5, 87.5), {"Hilal": (7.0, 6.6), "Zeynep Oktay": (9.0, 5.8), "Esin": (11.0, 7.4), "Mina": (13.0, 5.8), "Lidya": (15.0, 6.6), "Sueda": (17.0, 5.8)}),   # 1:18-1:25: Esin in front, Hilal and Lidya one row back, Zeynep, Mina, Sueda at the back (with Barış)
    "f_0129": ((89.0, 106.0), {"Zeynep Oktay": (7.5, 7.0), "Mina": (10.5, 7.0), "Sueda": (13.5, 7.0), "Hilal": (16.5, 7.0), "Lidya": (12.0, 5.9), "Esin": (12.0, 4.7)}),   # 1:29-1:46: four in front, Lidya behind the gap between Mina and Sueda, Esin behind her (with Barış)
    "w_0231": ((150.5, 162.5), {"Zeynep Oktay": (4.6, 6.8), "Sueda": (6.6, 6.8), "Hilal": (12.0, 7.3), "Esin": (12.0, 5.2), "Lidya": (17.4, 6.8), "Mina": (19.4, 6.8)}),
    "l_0244": ((167.5, 170.0), {"Hilal": (12.0, 7.3), "Esin": (7.4, 5.2), "Zeynep Oktay": (9.2, 5.2), "Sueda": (11.0, 5.2), "Lidya": (13.9, 5.2), "Mina": (15.7, 5.2)}),
    "final":  ((289.5, 296.0), {"Esin": (8.5, 19.2), "Lidya": (9.9, 19.2), "Mina": (11.3, 19.2), "Sueda": (12.7, 19.2), "Zeynep Oktay": (14.1, 19.2), "Hilal": (15.5, 19.2)}),
    "w_0333": ((210.5, 221.9), {"Lidya": (8.6, 7.3), "Zeynep Oktay": (12.0, 7.4), "Hilal": (15.4, 7.3), "Esin": (10.3, 5.9), "Mina": (12.0, 5.9), "Sueda": (13.7, 5.9)}),
}
RUN = {"Lidya": (12.0, 10.6), "Mina": (10.7, 9.3), "Sueda": (12.5, 9.3), "Zeynep Oktay": (13.9, 9.3), "Esin": (9.7, 8.1), "Hilal": (14.5, 8.1)}   # 3:42, three rows
_vt = [float(np.interp(r[0], _wa[:, 0], _wa[:, 1])) for r in members[0]["s"]]
for key, ((va, vb), pos_) in F.items():
    for nm, (fx, fy) in pos_.items():
        m = byname[nm]
        for k, r in enumerate(m["s"]):
            v = _vt[k]
            if v < va - 1 or v > vb + 1: continue
            a = 1.0 if va <= v <= vb else max(0.0, 1 - min(abs(v - va), abs(v - vb)))
            r[1] = round(r[1] + a * (fx - r[1]), 2); r[2] = round(r[2] + a * (fy - r[2]), 2)
            if a > 0.5 and key != "final" and r[6] != "ana_sahne_on": r[6] = "ana_sahne_on"
# the run: from 3:42 the six move down the runway in three rows and reach the front block at 3:48
kr = [k for k, v in enumerate(_vt) if 222.0 <= v < 228.4]
for nm, (fx, fy) in RUN.items():
    m = byname[nm]
    for j, k in enumerate(kr):
        f = j / max(1, len(kr)); r = m["s"][k]
        r[1] = round(fx, 2); r[2] = round(min(15.8, fy + f * 7.0), 2); r[6] = "runway"
# the opening (checked frame by frame on 24 Nov): the lights come on at 26.05 s with the six in a tight group; they hold still
# until 31.5 s and by 33 s stand in one evenly spaced line across the platform, about 7 m wide, in the same order.
_order = sorted(members, key=lambda m: next(r[1] for r, v in zip(m["s"], _vt) if v >= 30))
for j, m in enumerate(_order):
    tx, ty = 12.0 + (j - 2.5) * 1.4, 1.6
    for r, v in zip(m["s"], _vt):
        if 31.5 <= v < 55.5 and r[6] == "platform":
            a = min(1.0, (v - 31.5) / 1.5)
            r[1] = round(r[1] + a * (tx - r[1]), 2); r[2] = round(r[2] + a * (ty - r[2]), 2)
# wide lines seen on the wide shots: the notes squeeze them. In these windows the six stand evenly spaced across the width the
# video shows, around the line's own centre and in the same left-to-right order.
SPREAD = []     # 1:29-1:46 is now the formation f_0129
for va, vb, span in SPREAD:
    for k, v in enumerate(_vt):
        if not (va - 1 <= v <= vb + 1): continue
        a = 1.0 if va <= v <= vb else max(0.0, 1 - min(abs(v - va), abs(v - vb)))
        xs = [m["s"][k][1] for m in members]; c = (max(xs) + min(xs)) / 2
        for j, m in enumerate(sorted(members, key=lambda m: m["s"][k][1])):
            r = m["s"][k]; tx = min(23.0, max(1.0, c + (j - 2.5) * span / 5)); r[1] = round(r[1] + a * (tx - r[1]), 2)

# 7b) 1:46-2:06, step by step with Barış (24 Nov): Zeynep alone at the left end, Sueda and Hilal at the right end, the trio
#    Mina, Lidya, Esin in the middle. 1:50 Mina steps in front of Lidya (a column), Sueda in front of Hilal; 1:52 the trio opens
#    into a row Mina · Lidya · Esin; 1:58 Lidya and Esin swap; 2:02 Lidya and Mina swap. Keyframes (video s, x, y), symmetric.
K2 = {
    "Zeynep Oktay": [(107.5, 4.0, 6.6), (126.0, 4.0, 6.6)],
    "Hilal":        [(107.5, 20.0, 7.0), (109.5, 20.0, 7.0), (110.5, 20.0, 5.8), (126.0, 20.0, 5.8)],
    "Sueda":        [(107.5, 20.0, 5.8), (109.5, 20.0, 5.8), (110.5, 20.0, 7.0), (126.0, 20.0, 7.0)],
    "Lidya":        [(107.5, 12.0, 7.0), (109.5, 12.0, 7.0), (110.5, 12.0, 6.0), (112.5, 12.0, 6.6), (118.0, 12.0, 6.6), (119.0, 13.4, 6.6), (121.5, 13.4, 6.6), (122.5, 10.6, 6.6), (126.0, 10.6, 6.6)],
    "Mina":         [(107.5, 11.0, 6.0), (109.5, 11.0, 6.0), (110.5, 12.0, 7.2), (112.5, 10.6, 6.6), (121.5, 10.6, 6.6), (122.5, 13.4, 6.6), (126.0, 13.4, 6.6)],
    "Esin":         [(107.5, 13.0, 6.0), (109.5, 13.0, 6.0), (110.5, 12.0, 4.8), (112.5, 13.4, 6.6), (118.0, 13.4, 6.6), (119.0, 12.0, 6.6), (126.0, 12.0, 6.6)],
}
for nm, ks in K2.items():
    kt = np.array([k[0] for k in ks]); kx = np.array([k[1] for k in ks]); ky = np.array([k[2] for k in ks])
    for r, v in zip(byname[nm]["s"], _vt):
        if not (106.5 <= v <= 126.5): continue
        a = min(1.0, (v - 106.5) / 1.0)                       # one second to leave the 1:29 formation
        r[1] = round(r[1] + a * (float(np.interp(v, kt, kx)) - r[1]), 2); r[2] = round(r[2] + a * (float(np.interp(v, kt, ky)) - r[2]), 2)
        r[6] = "ana_sahne_on"

# 7c) 2:06-2:46, step by step with Barış (24 Nov). 2:06 a triangle opening to the back: Mina at the tip, Esin · Lidya · Sueda
#    behind her, Zeynep and Hilal at the back corners. 2:08 Mina and Sueda swap. 2:11 Lidya drops back between Esin and Sueda.
#    2:16 Zeynep behind Esin, Hilal behind Mina, Lidya behind Sueda. 2:18-2:20 an arrow: Lidya at the tip, Zeynep and Hilal
#    behind her, Esin one more back on the left, Sueda and Mina in the back corners. 2:30 pairs on the sides, Hilal in front of
#    Esin in the middle. 2:32 Hilal walks to the far left end of the line, Esin stays alone in the middle until 2:40. 2:41 Hilal
#    takes the middle, Esin goes to the front of the left group (Zeynep and Sueda behind her), Lidya and Mina on the right.
K3 = {
    "Mina":         [(126.5, 12.0, 7.4), (127.5, 12.0, 7.4), (128.5, 13.2, 6.4), (135.5, 13.2, 6.4), (136.5, 13.6, 6.6), (138.0, 13.6, 6.6), (140.0, 15.6, 5.0), (146.0, 15.6, 5.0), (150.0, 19.4, 6.8), (160.0, 19.4, 6.8), (161.5, 15.0, 6.0)],
    "Sueda":        [(126.5, 13.2, 6.4), (127.5, 13.2, 6.4), (128.5, 12.0, 7.4), (138.0, 12.0, 7.4), (140.0, 8.4, 5.0), (146.0, 8.4, 5.0), (150.0, 6.6, 6.8), (160.0, 6.6, 6.8), (161.5, 9.0, 5.0)],
    "Esin":         [(126.5, 10.8, 6.4), (135.5, 10.8, 6.4), (136.5, 10.4, 6.6), (138.0, 10.4, 6.6), (140.0, 9.6, 5.8), (146.0, 9.6, 5.8), (150.0, 12.0, 5.2), (151.5, 12.0, 5.2), (152.5, 12.0, 6.2), (160.0, 12.0, 6.2), (161.5, 9.0, 7.0)],
    "Lidya":        [(126.5, 12.0, 6.4), (130.5, 12.0, 6.4), (131.5, 11.4, 5.6), (135.5, 11.4, 5.6), (136.5, 12.0, 6.0), (138.0, 12.0, 6.0), (140.0, 12.0, 7.4), (146.0, 12.0, 7.4), (150.0, 17.4, 6.8), (160.0, 17.4, 6.8), (161.5, 15.0, 7.0)],
    "Zeynep Oktay": [(126.5, 9.6, 5.2), (135.5, 9.6, 5.2), (136.5, 10.4, 5.4), (138.0, 10.4, 5.4), (140.0, 10.8, 6.6), (146.0, 10.8, 6.6), (150.0, 4.6, 6.8), (160.0, 4.6, 6.8), (161.5, 9.0, 6.0)],
    "Hilal":        [(126.5, 14.4, 5.2), (135.5, 14.4, 5.2), (136.5, 13.6, 5.4), (138.0, 13.6, 5.4), (140.0, 13.2, 6.6), (146.0, 13.2, 6.6), (150.0, 12.0, 7.3), (151.5, 12.0, 7.3), (153.0, 2.6, 6.8), (160.0, 2.6, 6.8), (161.5, 12.0, 7.3)],
}
for nm, ks in K3.items():
    kt = np.array([k[0] for k in ks]); kx = np.array([k[1] for k in ks]); ky = np.array([k[2] for k in ks])
    for r, v in zip(byname[nm]["s"], _vt):
        if not (124.5 <= v <= 166.5): continue
        a = min(1.0, (v - 124.5) / 2.0)                       # two seconds from the 2:02 row into the 2:06 triangle
        r[1] = round(r[1] + a * (float(np.interp(v, kt, kx)) - r[1]), 2); r[2] = round(r[2] + a * (float(np.interp(v, kt, ky)) - r[2]), 2)
        r[6] = "ana_sahne_on"

# 7d) 2:46-2:59, with Barış (24 Nov): 2:46 a diagonal arrow, Hilal at the tip, Zeynep · Sueda · Esin going back to the left,
#    Lidya and Mina back to the right. 2:50 Zeynep takes the tip, Hilal and Sueda behind her to the left, Esin last. 2:55 Lidya
#    and Esin swap; Sueda goes to the very back, behind Zeynep.
K4 = {   # (video s, x, y); the first key is where 7c leaves them
    "Hilal":        [(166.5, 12.0, 7.3), (167.5, 12.0, 7.4), (169.5, 12.0, 7.4), (171.0, 10.6, 6.8)],
    "Zeynep Oktay": [(166.5, 9.0, 6.0), (167.5, 10.6, 6.8), (169.5, 10.6, 6.8), (171.0, 12.0, 7.4)],
    "Sueda":        [(166.5, 9.0, 5.0), (167.5, 9.2, 6.2), (174.5, 9.2, 6.2), (176.0, 12.0, 5.4)],
    "Esin":         [(166.5, 9.0, 7.0), (167.5, 7.8, 5.6), (174.5, 7.8, 5.6), (176.0, 13.4, 6.8)],
    "Lidya":        [(166.5, 15.0, 7.0), (167.5, 13.4, 6.8), (174.5, 13.4, 6.8), (176.0, 7.8, 5.6)],
    "Mina":         [(166.5, 15.0, 6.0), (167.5, 14.8, 6.2)],
}
for nm, ks in K4.items():
    kt = np.array([k[0] for k in ks]); kx = np.array([k[1] for k in ks]); ky = np.array([k[2] for k in ks])
    for r, v in zip(byname[nm]["s"], _vt):
        if not (166.5 <= v <= 179.5): continue
        r[1] = round(float(np.interp(v, kt, kx)), 2); r[2] = round(float(np.interp(v, kt, ky)), 2); r[6] = "ana_sahne_on"

# 7e) 2:59-3:42, with Barış (24 Nov). 3:00 Esin takes Zeynep's place at the tip, Sueda behind her to the right; by 3:04
#    Zeynep is at the back behind Esin. 3:08 Hilal passes behind Lidya and comes out at the tip between Lidya and Esin. 3:13
#    Esin drops back to Lidya's left, Mina passes behind Hilal to the tip with Zeynep behind her; Hilal and Sueda to the right.
#    3:24 Mina and Zeynep swap, Zeynep at the tip until 3:33. 3:34 Esin · Mina · Lidya (tip) · Sueda · Zeynep · Hilal.
#    3:37 all six step forward into one straight line at the front of the main stage; at 3:42 they walk down the runway.
K5 = {
    "Lidya":        [(179.5, 7.8, 5.6), (186.0, 7.8, 5.6), (188.0, 10.4, 6.6), (192.0, 10.4, 6.6), (194.0, 10.4, 6.4), (212.5, 10.4, 6.4), (214.0, 12.0, 7.4), (216.0, 12.0, 7.4), (217.5, 11.0, 7.6)],
    "Hilal":        [(179.5, 10.6, 6.8), (186.5, 10.6, 6.8), (187.5, 8.6, 5.0), (189.0, 12.0, 7.4), (192.0, 12.0, 7.4), (194.0, 13.6, 6.6), (212.5, 13.6, 6.6), (214.0, 17.4, 4.8), (216.0, 17.4, 4.8), (217.5, 17.0, 7.6)],
    "Esin":         [(179.5, 13.4, 6.8), (180.5, 12.0, 7.4), (188.0, 12.0, 7.4), (189.0, 13.6, 6.6), (192.0, 13.6, 6.6), (194.0, 8.8, 5.6), (212.5, 8.8, 5.6), (214.0, 8.4, 5.6), (216.0, 8.4, 5.6), (217.5, 7.0, 7.6)],
    "Zeynep Oktay": [(179.5, 12.0, 7.4), (180.5, 12.0, 6.6), (183.0, 12.0, 6.6), (184.0, 12.0, 5.6), (188.0, 12.0, 5.6), (189.0, 13.6, 5.6), (192.0, 13.6, 5.6), (194.0, 12.0, 6.2), (203.5, 12.0, 6.2), (204.5, 12.0, 7.4), (212.5, 12.0, 7.4), (214.0, 15.6, 5.6), (216.0, 15.6, 5.6), (217.5, 15.0, 7.6)],
    "Sueda":        [(179.5, 12.0, 5.4), (180.5, 13.2, 6.6), (188.0, 13.2, 6.6), (189.0, 15.2, 5.8), (212.5, 15.2, 5.8), (214.0, 13.8, 6.5), (216.0, 13.8, 6.5), (217.5, 13.0, 7.6)],
    "Mina":         [(179.5, 14.8, 6.2), (188.0, 14.8, 6.2), (189.0, 16.8, 5.0), (192.0, 16.8, 5.0), (194.0, 12.0, 7.4), (203.5, 12.0, 7.4), (204.5, 12.0, 6.2), (212.5, 12.0, 6.2), (214.0, 10.2, 6.5), (216.0, 10.2, 6.5), (217.5, 9.0, 7.6)],
}
for nm, ks in K5.items():
    kt = np.array([k[0] for k in ks]); kx = np.array([k[1] for k in ks]); ky = np.array([k[2] for k in ks])
    for r, v in zip(byname[nm]["s"], _vt):
        if not (179.5 < v < 222.0): continue
        r[1] = round(float(np.interp(v, kt, kx)), 2); r[2] = round(float(np.interp(v, kt, ky)), 2); r[6] = "ana_sahne_on"

# 7f) the front block, 3:48-4:56, with Barış (24 Nov): one line Esin · Mina · Lidya · Sueda · Zeynep · Hilal that slowly moves
#    forward at 3:51 to near the front edge (Mina and Lidya swap at 3:58); 4:25-4:46 a zigzag, Esin, Mina, Zeynep in front and Lidya, Sueda, Hilal
#    one row back; 4:46 one line again, 4:48 close together around the centre for the final pose.
XS = {"Esin": 7.0, "Lidya": 9.0, "Mina": 11.0, "Sueda": 13.0, "Zeynep Oktay": 15.0, "Hilal": 17.0}
FIN = {"Esin": 10.0, "Lidya": 10.8, "Mina": 11.6, "Sueda": 12.4, "Zeynep Oktay": 13.2, "Hilal": 14.0}     # shoulder to shoulder
ZZ = {"Esin": 22.4, "Mina": 22.4, "Zeynep Oktay": 22.4, "Lidya": 21.4, "Sueda": 21.4, "Hilal": 21.4}
for nm in XS:
    x0 = {"Mina": 9.0, "Lidya": 11.0}.get(nm, XS[nm])           # before the 3:58 swap
    ks = [(228.5, x0, 17.0), (231.0, x0, 17.0), (234.0, x0, 22.0), (237.5, x0, 22.0), (238.5, XS[nm], 22.0),     # 3:51 they walk on to near the front edge
          (265.0, XS[nm], 22.0), (266.5, XS[nm], ZZ[nm]), (286.0, XS[nm], ZZ[nm]), (287.0, XS[nm], 22.0), (288.5, FIN[nm], 22.0), (296.0, FIN[nm], 22.0)]
    kt = np.array([k[0] for k in ks]); kx = np.array([k[1] for k in ks]); ky = np.array([k[2] for k in ks])
    for r, v in zip(byname[nm]["s"], _vt):
        if v < 228.45: continue
        r[1] = round(float(np.interp(v, kt, kx)), 2); r[2] = round(float(np.interp(v, kt, ky)), 2); r[6] = "on_blok"

# 7g) every place from 0:45 on was read with Barış from the video, so none counts as "not visible" any more: footprints,
#    paths and the colour map use them all (24 Nov; Esin's run down the runway had no footprints).
for m in members:
    for r, v in zip(m["s"], _vt):
        if v >= 45.3 and r[5] == "g": r[5] = "y"; r[4] = max(r[4], 0.6)

# 8) every place sits on a corner of a 25 cm grid (24 Nov, with Barış). The grid is aligned with the national grid (EPSG:27700,
#    multiples of 0.25 m), so the same corners can be snapped to in QGIS (layer › Digitizing › geometry precision 0.25).
G25 = 0.25
for m in members:
    for r in m["s"]:
        X = round((X0 + r[2]) / G25) * G25; Y = round((Y0 + r[1]) / G25) * G25      # local → EPSG:27700, snapped
        r[1], r[2] = round(Y - Y0, 3), round(X - X0, 3)

for m in members:     # walked distance on the stage plan, from the shown positions (from 0:45, when they can be told apart)
    pts_ = [(r[1], r[2]) for r, v in zip(m["s"], _vt) if v >= 45.3]
    m["path_m"] = round(float(sum(np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts_, pts_[1:]))), 1)
out = {"w": round(W, 2), "h": round(H, 2), "parts": parts, "members": members,
       "t0": int(pts.saniye.min()), "t1": int(pts.saniye.max()), "step": 2,
       "video": "YGtNsXgYqjo", "states": {"n": "clear", "y": "approximate", "s": "silhouette", "g": "not visible"},
       "counts": pts.durum.value_counts().to_dict(), "kinds": pts.veri_turu.value_counts().to_dict()}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "stage.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(json.dumps({k: out[k] for k in ("w", "h", "t0", "t1", "counts", "kinds")}, ensure_ascii=False))
for m in members:
    print(m["name"], m["path_m"], m["zones_s"], m["s"][0])
for p in parts:
    print(p["id"], p["poly"][:3])


# data clock → video clock. Re-checked frame by frame against the official video (9 Nov) and with Barış: silhouettes on the
# platform, first steps onto the stairs (0:56), all six on the main stage (1:10), the wide line and solo at 2:31–2:44,
# regrouping (2:44), the six at the front edge of the main stage under the big screen (3:52–4:20), the run over the
# runway (4:20–4:28), the front block until the end of the song (4:54). Anchors sit 1.5 s earlier than the first check.
WARP = WARP_


def vw(t):
    a = np.array(WARP, dtype=float)
    return float(np.interp(t, a[:, 0], a[:, 1], left=t + a[0, 1] - a[0, 0], right=t + a[-1, 1] - a[-1, 0]))


# ---------- moments: facts computed from the positions, each one a jump point in the video
def moments(d):
    M = d["members"]; T = [s[0] for s in M[0]["s"]]
    fm = lambda t: (lambda v: f"{v // 60}:{v % 60:02d}")(int(round(vw(t))))
    dur = lambda a, b: int(round(vw(b) - vw(a)))
    P = np.array([[[s[1], s[2]] for s in m["s"]] for m in M]); V = np.array([[s[5] != "g" for s in m["s"]] for m in M])
    Z = [[s[6] for s in m["s"]] for m in M]; first = lambda m: m["name"].split(" ")[0]
    out = []
    spread = np.array([np.linalg.norm(P[V[:, k], k] - P[V[:, k], k].mean(0), axis=1).mean() if V[:, k].sum() >= 5 else np.nan
                       for k in range(len(T))])
    k0 = int(np.nanargmin(spread))
    out.append({"t": T[k0], "title": "Six on the platform",
                "text": f"The song opens with all six on the raised platform, 3.3 m above the floor, on average {spread[k0]:.1f} m from their centre: the tightest formation of the song."})
    leave = [(next(t for t, z in zip(T, zz) if z != "platform"), m) for m, zz in zip(M, Z)]
    t1, m1 = min(leave, key=lambda x: x[0]); tl = max(t for t, _ in leave)
    out.append({"t": t1, "title": "Down the stairs",
                "text": " and ".join(first(m) for m in [m for t, m in leave if t == t1][::-1]) + f" lead the way down, at {fm(t1)}. By {fm(tl)} the platform is empty."
                        if sum(t == t1 for t, _ in leave) > 1 else f"{first(m1)} is the first to step down, at {fm(t1)}. By {fm(tl)} the platform is empty."})
    run = [t for t, z in zip(T, Z[0]) if z == "runway"]
    tm = next(t for k, t in enumerate(T) if all(zz[k] == "ana_sahne_on" for zz in Z))     # all six down on the main stage
    span = dur(tm, run[0] if run else T[-1])
    out.append({"t": tm, "title": "The main stage",
                "text": f"For {span // 60} min {span % 60:02d} s, from {fm(tm)} to {fm(run[0] if run else T[-1])}, the main stage is the whole world. The bright band at its front edge is where all six spend most of the song."})
    dts = np.array([vw(b_) - vw(a_) for a_, b_ in zip(T, T[1:])])
    sp = np.linalg.norm(np.diff(P, axis=1), axis=2) / dts
    a, b = np.unravel_index(int(sp.argmax()), sp.shape)
    out.append({"t": run[0] if run else T[b], "title": "The run",
                "text": f"At {fm(run[0] if run else T[b])} all six cross the 7.5 m runway together, in about {dur(run[0], run[-1] + 4)} seconds."})
    all6 = [t for k, t in enumerate(T) if all(Z[i][k] == "on_blok" for i in range(len(M)))]
    if all6:
        out.append({"t": all6[0], "title": "In front of the crowd",
                    "text": f"From {fm(all6[0])} all six hold the front block, closest to the audience, until the end ({dur(all6[0], all6[-1]) + 2} s)."})
    k1 = int(np.nanargmax(spread))
    out.append({"t": T[k1], "title": "Widest formation",
                "text": f"At {fm(T[k1])} the line is at its widest: on average {spread[k1]:.1f} m from the centre, {spread[k1] / spread[k0]:.0f} times wider than at the opening."})
    walk = sorted(((m["path_m"], first(m)) for m in M), reverse=True)
    hid = sorted(((int((~V[i]).sum() * 2), first(m)) for i, m in enumerate(M)), reverse=True)
    out.append({"t": None, "title": "Walked together",
                "text": f"Together the six walk {sum(w for w, _ in walk):.0f} m in one song."})
    for o in out:
        if o["t"] is not None:
            o["t"] = round(vw(o["t"]), 1)
    return out


# data clock → video clock: the positions were read on a clock that does not run evenly against the published video
# (the long main-stage hold before the run is much longer in the video). WARP anchors are listed above.
out["warp"] = WARP


# ---------- who is where: relations computed from the visible samples
def relations(d):
    M = d["members"]; n = len(M); first = lambda m: m["name"].split(" ")[0]
    P = np.array([[[s[1], s[2]] for s in m["s"]] for m in M]); V = np.array([[s[5] != "g" for s in m["s"]] for m in M])
    allv = np.array([vw(t) >= 45.3 for t in (s[0] for s in M[0]["s"])])     # every position is now read from the video: use them all
    lead = np.zeros(n); nl = 0; seq = []
    for k, t in enumerate(s[0] for s in M[0]["s"]):           # the tip of the formation on the main stage, 1:04-3:42
        if not (64 <= vw(t) <= 222): continue
        nl += 1; y = np.sort(P[:, k, 1])
        if y[-1] - y[-2] > 0.3:
            i_ = int(np.argmax(P[:, k, 1])); lead[i_] += 1
            if not seq or seq[-1] != i_: seq.append(i_)
    nchg = len(seq) - 1
    front = np.zeros(n); centre = np.zeros(n); nb = np.zeros((n, n)); side = np.zeros(n); cnt = 0
    for k in np.where(allv)[0]:
        cnt += 1
        fy = np.sort(P[:, k, 1]); cx = np.sort(np.abs(P[:, k, 0] - d["w"] / 2))
        if fy[-1] - fy[-2] > 0.3: front[np.argmax(P[:, k, 1])] += 1           # a clear front-runner only, not a tie on one line
        if cx[1] - cx[0] > 0.3: centre[np.argmin(np.abs(P[:, k, 0] - d["w"] / 2))] += 1
        D = np.linalg.norm(P[:, None, k] - P[None, :, k], axis=2); np.fill_diagonal(D, 1e9)
        for i in range(n): nb[i, np.argmin(D[i])] += 1
        order = np.argsort(P[:, k, 0]); side[order] += np.arange(n)
    side /= max(cnt, 1)
    for i, m in enumerate(M):
        j = int(np.argmax(nb[i])); lr = side[i] / (n - 1)
        m["rel"] = {"lead_pct": round(100 * lead[i] / nl), "front_pct": round(100 * front[i] / cnt), "centre_pct": round(100 * centre[i] / cnt),
                    "neighbour": first(M[j]), "neighbour_pct": round(100 * nb[i, j] / cnt),
                    "side": "left" if lr < 0.4 else "right" if lr > 0.6 else "centre", "lr": round(float(lr), 2)}
    f = max(M, key=lambda m: m["rel"]["front_pct"]); c = max(M, key=lambda m: m["rel"]["centre_pct"])
    pairs = sorted({tuple(sorted((first(m), m["rel"]["neighbour"]))) for m in M if
                    next(x for x in M if first(x) == m["rel"]["neighbour"])["rel"]["neighbour"] == first(m)})
    lineup = " · ".join(first(m) for m in sorted(M, key=lambda m: m["rel"]["lr"]))
    facts = [
        {"t": None, "title": "The line-up", "text": f"Seen from the audience, left to right, the average order is {lineup}; the formations reshuffle it all the time."},
        {"t": None, "title": "In front, in turns", "text": f"On the main stage the one in front changes {nchg} times, and all six take their turn. Nobody owns the stage; they share it."},
    ]
    if pairs:
        facts.append({"t": None, "title": "Always side by side",
                      "text": " and ".join(f"{a} & {b}" for a, b in pairs) + " are each other's nearest neighbour most of the song."})
    return facts, cnt


out["moments"] = moments(out)
rel, ncnt = relations(out)
out["moments"] += rel


def _loc(tm, abl=False):
    """Turkish locative/ablative suffix for a clock time like 2:33 → 2:33'te, 3:48 → 3:48'den"""
    d = tm[-1]; one = {"1": "de", "2": "de", "3": "te", "4": "te", "5": "te", "6": "da", "7": "de", "8": "de", "9": "da"}
    ten = {"1": "da", "2": "de", "3": "da", "4": "ta", "5": "de", "0": "da"}
    sx = one[d] if d != "0" else ten[tm[-2]]
    return f"{tm}'{sx}{'n' if abl else ''}"


def to_tr(m):
    """the Turkish page reads the same moments; numbers and names come from the English text"""
    import re
    t, x = m["title"], m["text"]; n = re.findall(r"\d+(?:\.\d+)?(?::\d\d)?", x)
    if t == "Six on the platform":
        return "Platformda altı kişi", f"Şarkı altı üyeyle, zeminden {n[0]} m yüksekteki platformda açılıyor; merkezlerine ortalama {n[1]} m uzaklıktalar: şarkının en sıkı dizilimi."
    if t == "Down the stairs":
        who = x.split(" lead the way")[0].replace(" and ", " ve ") if "lead the way" in x else x.split(" is the first")[0]
        return "Merdivenden iniş", f"{who} {_loc(n[0])} ilk inenler. {_loc(n[1])} platform boşalıyor."
    if t == "The main stage":
        return "Ana sahne", f"{n[0]} dk {n[1]} sn boyunca, {n[2]} ile {n[3]} arasında, ana sahne bütün dünya. Ön kenarındaki parlak bant altısının şarkının çoğunu geçirdiği yer."
    if t == "The run":
        return "Koşu", f"{_loc(n[0])} altısı birlikte {n[1]} m'lik runway'i yaklaşık {n[2]} saniyede geçiyor."
    if t == "In front of the crowd":
        return "Seyircinin önünde", f"{_loc(n[0], True)} sona kadar altısı seyirciye en yakın ön blokta ({n[1]} sn)."
    if t == "Widest formation":
        return "En geniş dizilim", f"{_loc(n[0])} sıra en geniş halinde: merkezden ortalama {n[1]} m, açılıştakinden {n[2]} kat geniş."
    if t == "Walked together":
        return "Birlikte yürüdükleri", f"Altısı tek şarkıda birlikte {n[0]} m yürüyor."
    if t == "The line-up":
        return "Sıralama", "Seyirciden bakınca soldan sağa ortalama sıra " + x.split("order is ")[1].split(";")[0] + "; dizilimler bu sırayı sürekli karıştırıyor."
    if t == "In front, in turns":
        return "Sırayla önde", f"Ana sahnede öndeki kişi {n[0]} kez değişiyor; altısı da sırayla öne çıkıyor. Sahne kimsenin değil, paylaşılıyor."
    if t == "Always side by side":
        return "Hep yan yana", x.split(" are each other")[0].replace(" and ", " ve ") + " şarkının çoğunda birbirinin en yakın komşusu."
    return t, x
import re as _re
for m_ in out["moments"]:
    a_, b_ = to_tr(m_)
    b_ = _re.sub(r"(\d+)%", r"%\1", b_); b_ = _re.sub(r"(\d)\.(\d)", r"\1,\2", b_)      # %18, 3,3 m
    m_["title_tr"], m_["text_tr"] = a_, b_
out["rel_samples"] = ncnt
(OUT / "stage.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
for m in out["moments"]:
    print(m["t"], m["title"], "—", m["text"])
