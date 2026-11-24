"""Export the positions the map shows now (after all corrections) as one shapefile per performer, back in EPSG:27700 on the
original stage plan (Sahne.gpkg), so they can be edited in QGIS. One point per 2 s reading.
  python pipeline/export_shp.py out_dir/"""
import json, sys, numpy as np, geopandas as gpd
from pathlib import Path
from shapely.geometry import Point
D = Path("data"); out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
stage = gpd.read_file(D / "Sahne.gpkg"); plat = gpd.read_file(D / "Sahne_Merdiven.gpkg")
import shapely
X0, Y0 = shapely.union_all(list(stage.geometry) + list(plat.geometry)).bounds[:2]
d = json.load(open("docs/data/stage.json")); w = np.array(d["warp"], float)
vid = lambda t: float(np.interp(t, w[:, 0], w[:, 1], left=t + w[0, 1] - w[0, 0], right=t + w[-1, 1] - w[-1, 0]))
ZTR = {"ana_sahne_on": "ana_sahne_on", "platform": "platform", "merdiven": "merdiven", "runway": "runway", "on_blok": "on_blok"}
ST = {"n": "net", "y": "yaklasik", "s": "siluet", "g": "gorunmuyor"}
for m in d["members"]:
    rows = []
    for k, s in enumerate(m["s"]):
        t, x, y, z = s[0], s[1], s[2], s[3]
        v = vid(t)
        rows.append({"isim": m["name"], "sira": k, "veri_sn": t, "video_sn": round(v, 1), "video": f"{int(v // 60)}:{v % 60:04.1f}",
                     "bolge": ZTR.get(s[6], s[6]), "durum": ST.get(s[5], s[5]), "z_m": z, "x_yerel": x, "y_yerel": y,
                     "geometry": Point(round(X0 + y, 3), round(Y0 + x, 3))})            # inverse of prepare.rot: x' = Y - Y0, y' = X - X0
    g = gpd.GeoDataFrame(rows, crs="EPSG:27700")
    fn = m["name"].split(" ")[0]
    g.to_file(out / f"{fn}.shp", encoding="utf-8")
    print(fn, len(g))
# the 25 cm grid every place is snapped to (multiples of 0.25 m in EPSG:27700), and a 1 m grid to read it
from shapely.geometry import LineString
bx = shapely.union_all(list(stage.geometry) + list(plat.geometry)).bounds
for step, fn in ((0.25, "Grid_25cm"), (1.0, "Grid_1m")):
    a0, a1 = np.floor(bx[0] / step) * step, np.ceil(bx[2] / step) * step; b0, b1 = np.floor(bx[1] / step) * step, np.ceil(bx[3] / step) * step
    ls = [LineString([(x, b0), (x, b1)]) for x in np.arange(a0, a1 + step / 2, step)] + [LineString([(a0, y), (a1, y)]) for y in np.arange(b0, b1 + step / 2, step)]
    gpd.GeoDataFrame({"adim_m": [step] * len(ls)}, geometry=ls, crs="EPSG:27700").to_file(out / f"{fn}.shp", encoding="utf-8")
stage.to_file(out / "Sahne.shp", encoding="utf-8"); plat.to_file(out / "Sahne_Merdiven.shp", encoding="utf-8")
