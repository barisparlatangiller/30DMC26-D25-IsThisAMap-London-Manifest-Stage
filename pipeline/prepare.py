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
