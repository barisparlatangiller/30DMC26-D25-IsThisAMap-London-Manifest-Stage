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
# 1) on the platform the line is, left to right from the audience, Mina, Sueda, Zeynep, Hilal, Esin, Lidya
#    (Esin and Lidya on the right, not the left); from 0:56 to 1:04 (data) they blend into the recorded stair positions
# 2) after the stairs the six stand at the front edge of the main stage, not at the foot of the stairs: main-stage
#    positions move 1.5 m toward the audience (at most to 7.6 m, the stage edge is at 8 m)
ORDER0 = ["Mina", "Sueda", "Zeynep Oktay", "Hilal", "Esin", "Lidya"]
byname = {m["name"]: m for m in members}
for k in range(len(members[0]["s"])):
    t = members[0]["s"][k][0]
    if t > 64: break
    xs = sorted(m["s"][k][1] for m in members)
    f = 1.0 if t <= 56 else max(0.0, 1 - (t - 56) / 8)
    for slot, nm in enumerate(ORDER0):
        r = byname[nm]["s"][k]
        r[1] = round(f * xs[slot] + (1 - f) * r[1], 2)
for m in members:
    for r in m["s"]:
        if r[6] == "ana_sahne_on" and r[0] >= 70:
            r[2] = round(min(r[2] + 1.5, 7.6), 2)

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
# platform, first steps onto the stairs (0:58), all six on the main stage (1:11), the wide line and solo at 2:31–2:42,
# regrouping (2:44), the move to the front from 3:49, arrival at the front block (3:57), the end of the song (4:53).
# All anchors sit 1.5 s earlier than the first check: the map ran that much behind the video.
WARP = [[26, 27.5], [56, 56.5], [72, 69.5], [156, 151.5], [163, 157.5], [168, 164.5], [220, 228.5], [230, 236.5], [290, 293.5]]


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
                "text": f"{first(m1)} is the first to step down, at {fm(t1)}. By {fm(tl)} the platform is empty."})
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
    out.append({"t": None, "title": "Who covers the most ground",
                "text": f"{walk[0][1]} walks {walk[0][0]:.0f} m, {walk[-1][1]} {walk[-1][0]:.0f} m."})
    out.append({"t": None, "title": "Hard to follow",
                "text": f"The camera loses {hid[0][1]} for {hid[0][0]} s, {hid[-1][1]} for only {hid[-1][0]} s. Those moments stay out of the colour map."})
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
    allv = V.all(0)
    front = np.zeros(n); centre = np.zeros(n); nb = np.zeros((n, n)); side = np.zeros(n); cnt = 0
    for k in np.where(allv)[0]:
        cnt += 1
        front[np.argmax(P[:, k, 1])] += 1
        centre[np.argmin(np.abs(P[:, k, 0] - d["w"] / 2))] += 1
        D = np.linalg.norm(P[:, None, k] - P[None, :, k], axis=2); np.fill_diagonal(D, 1e9)
        for i in range(n): nb[i, np.argmin(D[i])] += 1
        order = np.argsort(P[:, k, 0]); side[order] += np.arange(n)
    side /= max(cnt, 1)
    for i, m in enumerate(M):
        j = int(np.argmax(nb[i])); lr = side[i] / (n - 1)
        m["rel"] = {"front_pct": round(100 * front[i] / cnt), "centre_pct": round(100 * centre[i] / cnt),
                    "neighbour": first(M[j]), "neighbour_pct": round(100 * nb[i, j] / cnt),
                    "side": "left" if lr < 0.4 else "right" if lr > 0.6 else "centre", "lr": round(float(lr), 2)}
    f = max(M, key=lambda m: m["rel"]["front_pct"]); c = max(M, key=lambda m: m["rel"]["centre_pct"])
    pairs = sorted({tuple(sorted((first(m), m["rel"]["neighbour"]))) for m in M if
                    next(x for x in M if first(x) == m["rel"]["neighbour"])["rel"]["neighbour"] == first(m)})
    lineup = " · ".join(first(m) for m in sorted(M, key=lambda m: m["rel"]["lr"]))
    facts = [
        {"t": None, "title": "The line-up", "text": f"Seen from the audience, left to right, the usual order is {lineup}. It hardly changes all song."},
        {"t": None, "title": "Centre stage", "text": f"{first(c)} is the one closest to the centre line in {c['rel']['centre_pct']}% of the moments when all six are visible."},
        {"t": None, "title": "Closest to the crowd", "text": f"{first(f)} is the one nearest the audience {f['rel']['front_pct']}% of the time."},
    ]
    if pairs:
        facts.append({"t": None, "title": "Always side by side",
                      "text": " and ".join(f"{a} & {b}" for a, b in pairs) + " are each other's nearest neighbour most of the song."})
    return facts, cnt


out["moments"] = moments(out)
rel, ncnt = relations(out)
out["moments"] += rel
out["rel_samples"] = ncnt
(OUT / "stage.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
for m in out["moments"]:
    print(m["t"], m["title"], "—", m["text"])
