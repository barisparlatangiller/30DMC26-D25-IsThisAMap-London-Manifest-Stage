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
    "Siyah":   ("Hilal",        "#c4afff"),
    "Kizil":   ("Mina",         "#ff8c8c"),
    "Kumral":  ("Esin",         "#ffd66b"),
    "Mavi":    ("Zeynep Oktay", "#7cc3ff"),
    "Dalgali": ("Sueda",        "#86e3a2"),
    "Platin":  ("Lidya",        "#ffb0dc"),
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

members = []
for kiz, (name, col) in WHO.items():
    p = pts[pts.kiz == kiz].sort_values("saniye")
    a, b = rot(p.geometry.x.values, p.geometry.y.values)
    s = [[int(t), round(float(x), 2), round(float(y), 2), round(float(z), 2), WEIGHT[d], d[0], zo, int(v == "gozlem")]
         for t, x, y, z, d, zo, v in zip(p.saniye, a, b, p.z_m, p.durum, p.bolge, p.veri_turu)]
    secs = {}
    for t, x, y, z, w, d, zo, o in s:
        if w > 0:
            secs[zo] = secs.get(zo, 0) + 2
    ln = lines[lines.kiz == kiz]
    members.append({"key": kiz, "name": name, "color": col, "s": s, "zones_s": secs,
                    "path_m": round(float(ln.uzunluk_m.iloc[0]), 1) if len(ln) else None,
                    "obs": int((p.veri_turu == "gozlem").sum())})

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


# ---------- moments: facts computed from the positions, each one a jump point in the video
def moments(d):
    M = d["members"]; T = [s[0] for s in M[0]["s"]]
    fm = lambda t: f"{t // 60}:{t % 60:02d}"
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
    span = (run[0] if run else T[-1]) - tl
    out.append({"t": tl + 10, "title": "The main stage",
                "text": f"For {span // 60} min {span % 60:02d} s, from {fm(tl)} to {fm(tl + span)}, the main stage is the whole world. The bright band at its front edge is where all six spend most of the song."})
    sp = np.linalg.norm(np.diff(P, axis=1), axis=2) / 2
    a, b = np.unravel_index(int(sp.argmax()), sp.shape)
    out.append({"t": run[0] if run else T[b], "title": "The run",
                "text": f"At {fm(run[0] if run else T[b])} they cross the {7.5:.1f} m runway together in a few seconds; {first(M[a])} is fastest at {sp[a, b]:.1f} m/s."})
    all6 = [t for k, t in enumerate(T) if all(Z[i][k] == "on_blok" for i in range(len(M)))]
    if all6:
        out.append({"t": all6[0], "title": "In front of the crowd",
                    "text": f"From {fm(all6[0])} all six hold the front block, closest to the audience, until the end ({all6[-1] - all6[0] + 2} s)."})
    k1 = int(np.nanargmax(spread))
    out.append({"t": T[k1], "title": "Widest formation",
                "text": f"At {fm(T[k1])} the line is at its widest: on average {spread[k1]:.1f} m from the centre, {spread[k1] / spread[k0]:.0f} times wider than at the opening."})
    walk = sorted(((m["path_m"], first(m)) for m in M), reverse=True)
    hid = sorted(((int((~V[i]).sum() * 2), first(m)) for i, m in enumerate(M)), reverse=True)
    out.append({"t": None, "title": "Who covers the most ground",
                "text": f"{walk[0][1]} walks {walk[0][0]:.0f} m, {walk[-1][1]} {walk[-1][0]:.0f} m. Over the whole song each moves at about a quarter of a metre per second."})
    out.append({"t": None, "title": "Hard to follow",
                "text": f"The camera loses {hid[0][1]} for {hid[0][0]} s, {hid[-1][1]} for only {hid[-1][0]} s. Those moments stay out of the colour map."})
    return out


out["moments"] = moments(out)
(OUT / "stage.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
for m in out["moments"]:
    print(m["t"], m["title"], "—", m["text"])
