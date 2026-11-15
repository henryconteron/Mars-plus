#!/usr/bin/env python3
# Crop the CC BY 4.0 THEMIS thermal-inertia mosaic to the Issole window.
# The raw GeoTIFF stays in data/raw/thermal (gitignored). This writes the small JSON the app loads.
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "thermal" / "Jezero_Thermal_Inertia_v1.tiff"
OUT = ROOT / "app" / "data" / "sites" / "jezero-issole" / "thermal-inertia.json"
EXPECTED_MD5 = "53fec7c990a90629e98c871a7a0da474"
R = 3396190.0
X0, Y0, SCALE = 4564100.0, 1141100.0, 100.0
WEST, EAST = 77.438488795243572, 77.454009751713031
SOUTH, NORTH = 18.430511595111128, 18.447011046662364


def main():
    blob = RAW.read_bytes()
    digest = hashlib.md5(blob).hexdigest()
    if digest != EXPECTED_MD5:
        raise SystemExit(f"md5 {digest} != {EXPECTED_MD5}")
    arr = tifffile.TiffFile(RAW).pages[0].asarray()

    def xm(lon):
        return lon * math.pi / 180 * R

    def ym(lat):
        return lat * math.pi / 180 * R

    c0, c1 = int(np.floor((xm(WEST) - X0) / SCALE)), int(np.ceil((xm(EAST) - X0) / SCALE))
    r0, r1 = int(np.floor((Y0 - ym(NORTH)) / SCALE)), int(np.ceil((Y0 - ym(SOUTH)) / SCALE))
    sub = arr[r0:r1, c0:c1]
    if np.any(sub <= 0):
        raise SystemExit("crop contains null thermal inertia")

    def lon(x):
        return x / R * 180 / math.pi

    def lat(y):
        return y / R * 180 / math.pi

    out = {
        "retrieved": "2026-11-15",
        "title": "THEMIS-derived Thermal Inertia of Jezero Crater, Mars",
        "doi": "10.5281/zenodo.4931348",
        "url": "https://doi.org/10.5281/zenodo.4931348",
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "sourceMd5": digest,
        "sourceBytes": len(blob),
        "unit": "J m-2 K-1 s-0.5",
        "pixelM": 100,
        "nullValue": 0,
        "papers": [
            "Edwards et al. methods as described on the Zenodo record (Edwards et al. 2011, 2018; Piqueux et al. 2019).",
            "Fergason, R.L., Christensen, P.R. and Kieffer, H.H. (2006). JGR 111, E12004. doi:10.1029/2006JE002735. Used only as a sanity check.",
        ],
        "changes": "Cropped to the Issole traverse window. Values rounded to 0.1, below the ~20 unit mosaicking uncertainty stated by the authors. Not resampled onto the 2 m route grid.",
        "cost": "Display only. No published suited-walking multiplier maps thermal inertia onto time, so the route cost is unchanged.",
        "bounds": {
            "west": lon(X0 + c0 * SCALE),
            "east": lon(X0 + c1 * SCALE),
            "north": lat(Y0 - r0 * SCALE),
            "south": lat(Y0 - r1 * SCALE),
        },
        "width": int(sub.shape[1]),
        "height": int(sub.shape[0]),
        "values": [[round(float(v), 1) for v in row] for row in sub],
    }
    text = json.dumps(out, indent=2) + "\n"
    if text.startswith("\ufeff"):
        raise SystemExit("BOM")
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} {OUT.stat().st_size} bytes, median {float(np.median(sub)):.1f}")


if __name__ == "__main__":
    main()
