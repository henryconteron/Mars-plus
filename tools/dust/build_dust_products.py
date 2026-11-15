#!/usr/bin/env python3
# Build the small dust products used by the app.
# Reads public NetCDF/text sources from data/raw/dust (gitignored) and writes
# quantized, seasonal grids plus the Jezero tau table under app/data/dust.
# Nothing here is interpolated beyond the published kriging, and no value is invented:
# a bin with no observations stays a missing code.

import gzip
import hashlib
import json
import tarfile
import statistics
from pathlib import Path

import netCDF4 as nc
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "dust"
OUT = ROOT / "app" / "data" / "dust"

RETRIEVED = "2026-11-15"
BIN_DEG = 30
NBIN = 360 // BIN_DEG
VIS_FACTOR = 2.6  # Montabone et al. 2015, section 2.3.4: visible extinction ≈ 2.6 × 9.3 μm absorption
JEZERO_LAT = 18.4446
JEZERO_LON = 77.4509
GDS_YEARS = (25, 28, 34)  # planet-encircling storms excluded from the typical mean
CDOD_SCALE = 0.01  # uint8 = round(cdod610 / scale), clipped at 255 (≥ 2.55)
FREQ_MISSING = 255

MONTABONE_FILES = {
    24: "dustscenario_MY24_v2-0.nc",
    25: "dustscenario_MY25_v2-0.nc",
    26: "dustscenario_MY26_v2-0.nc",
    27: "dustscenario_MY27_v2-0.nc",
    28: "dustscenario_MY28_v2-0.nc",
    29: "dustscenario_MY29_v2-0.nc",
    30: "dustscenario_MY30_v2-0.nc",
    31: "dustscenario_MY31_v2-0.nc",
    32: "dustscenario_MY32_v2-0.nc",
    33: "dustscenario_MY33_v2-1.nc",
    34: "dustscenario_MY34_v2-5.nc",
    35: "dustscenario_MY35_v2-5.nc",
    36: "dustscenario_MY36_v2-5.nc",
}
MONTABONE_PAGE = "https://www-mars.lmd.jussieu.fr/mars/dust_climatology/"
MDAD_PAGE = "https://zenodo.org/records/7480334"
MDAD_MD5 = {
    "MY28.tar.gz": "d7286d6c242f049408b6cfa6cbdc1a63",
    "MY29.tar.gz": "cf034b22565e489b7c9b6171f9ba760f",
    "MY30.tar.gz": "edd7a0c58113efbabe1ab13b764ea63d",
    "MY31.tar.gz": "7b92f2c156ecb9287545887a85cb8dc7",
    "MY32.tar.gz": "8d5be022d5e480438e3809943f931bfe",
}
MASTCAM_SHA = {
    "m20-ztau-merged-1717.txt": "00841f90df469a1839142898c372d360251e88e4412a3d43688fd8d3f43115cf",
    "readme-m20-ztau-merged.txt": "6782cb793b69a6b5d1e0d6e28732b2cbbaa5827ebff07cd1c3b56123031f9cdd",
}

# Fixed legend stops (physical units, not stretched per frame).
CDOD_STOPS = [0, 0.1, 0.2, 0.4, 0.8, 1.5]
FREQ_STOPS = [0, 5, 10, 20, 40]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def require(cond, message):
    if not cond:
        raise SystemExit("SANITY FAIL: " + message)


def bin_index(ls):
    x = np.floor(np.mod(ls, 360.0) / BIN_DEG).astype(np.int32)
    return np.clip(x, 0, NBIN - 1)


def quantize(values):
    scaled = np.rint(values / CDOD_SCALE)
    clipped = np.clip(scaled, 0, 255).astype(np.uint8)
    return clipped, int(np.count_nonzero(scaled > 255))


def write_gz(path, blob):
    path.write_bytes(gzip.compress(blob, compresslevel=9, mtime=0))


def nearest(lat, lon, lat0, lon0, dlat, dlon, height, width):
    x = int(np.rint((lon - lon0) / dlon)) % width
    y = int(np.rint((lat0 - lat) / abs(dlat)))
    y = min(height - 1, max(0, y))
    return y, x


def accumulate_year(path, into_sum, into_count, jezero_sum, jezero_count, daily_means):
    ds = nc.Dataset(path)
    copyright_text = str(getattr(ds, "copyright", ""))
    require("Creative Commons Attribution-ShareAlike 3.0" in copyright_text, f"{path.name} is not CC BY-SA 3.0")
    lat = np.array(ds.variables["latitude"][:], dtype=np.float64)
    lon = np.array(ds.variables["longitude"][:], dtype=np.float64)
    require(lat.shape == (60,) and lon.shape == (120,), f"{path.name} grid is not 120×60")
    require(abs(lat[0] - 88.5) < 1e-3 and abs(lon[0] + 180) < 1e-3, f"{path.name} axes are not north-first, lon -180")
    ls = np.array(ds.variables["Ls"][:], dtype=np.float64)
    bins = bin_index(ls)
    cdod = np.array(ds.variables["cdod610"][:], dtype=np.float64)  # time, lat, lon
    require(np.isfinite(cdod).all(), f"{path.name} has non-finite cdod610")
    jy, jx = nearest(JEZERO_LAT, JEZERO_LON, lat[0], lon[0], lat[0] - lat[1], lon[1] - lon[0], 60, 120)
    for b in range(NBIN):
        sel = bins == b
        if not np.any(sel):
            continue
        block = cdod[sel]
        into_sum[b] += block.sum(axis=0)
        into_count[b] += int(sel.sum())
        jezero_sum[b] += block[:, jy, jx].sum()
        jezero_count[b] += int(sel.sum())
        daily_means.extend(block.mean(axis=(1, 2)).tolist())
    version = str(getattr(ds, "version", ""))
    ds.close()
    return {"file": path.name, "sha256": sha256(path), "bytes": path.stat().st_size, "version": version, "jezeroCell": [int(jy), int(jx)]}


def mean_grid(total, count):
    require(bool(np.all(count > 0)), "a climatology Ls bin has no sols")
    return total / count.reshape(-1, 1, 1)


def build_cdod():
    base = RAW / "montabone"
    clim_sum = np.zeros((NBIN, 60, 120), dtype=np.float64)
    clim_n = np.zeros(NBIN, dtype=np.int32)
    my34_sum = np.zeros((NBIN, 60, 120), dtype=np.float64)
    my34_n = np.zeros(NBIN, dtype=np.int32)
    jez_clim = np.zeros(NBIN)
    jez_clim_n = np.zeros(NBIN, dtype=np.int32)
    jez_my34 = np.zeros(NBIN)
    jez_my34_n = np.zeros(NBIN, dtype=np.int32)
    files = []
    year_daily_max = {}
    for year, name in MONTABONE_FILES.items():
        path = base / name
        require(path.is_file(), f"missing {path}")
        daily = []
        if year in GDS_YEARS and year != 34:
            # Still read, so the sanity check can see the storm, but do not mix it into the typical mean.
            info = accumulate_year(path, np.zeros_like(clim_sum), np.zeros_like(clim_n), np.zeros(NBIN), np.zeros(NBIN, dtype=np.int32), daily)
        elif year == 34:
            info = accumulate_year(path, my34_sum, my34_n, jez_my34, jez_my34_n, daily)
        else:
            info = accumulate_year(path, clim_sum, clim_n, jez_clim, jez_clim_n, daily)
        info["marsYear"] = year
        info["inTypicalMean"] = year not in GDS_YEARS
        info["dailyGlobalMeanMax"] = round(float(max(daily)), 4)
        year_daily_max[year] = info["dailyGlobalMeanMax"]
        files.append(info)
        print(f"MY{year} daily-global-mean max cdod610 {info['dailyGlobalMeanMax']:.3f} typical={info['inTypicalMean']}")

    # Recompute excluded-year storm windows directly for the sanity check.
    storm_means = {}
    storm_max = {}
    for year, window in ((25, (180, 240)), (28, (240, 300)), (34, (180, 240))):
        path = base / MONTABONE_FILES[year]
        ds = nc.Dataset(path)
        ls = np.array(ds.variables["Ls"][:])
        cd = np.array(ds.variables["cdod610"][:], dtype=np.float64)
        sel = (ls >= window[0]) & (ls < window[1])
        storm_means[year] = float(cd[sel].mean())
        storm_max[year] = float(cd[sel].max())
        ds.close()
        print(f"MY{year} Ls {window[0]}-{window[1]} mean cdod610 {storm_means[year]:.3f} max {storm_max[year]:.2f}")

    clim = mean_grid(clim_sum, clim_n)
    my34 = mean_grid(my34_sum, my34_n)
    # Global means of the seasonal grids.
    clim_global = clim.mean(axis=(1, 2))
    my34_global = my34.mean(axis=(1, 2))
    require(0.05 <= clim_global[2] <= 0.15, f"aphelion climatology {clim_global[2]:.3f} is outside 0.05-0.15")
    require(clim_global[8] > clim_global[2], "perihelion climatology is not dustier than aphelion")
    require(storm_means[34] > 0.40 and storm_means[34] > 2.5 * float(clim[6:8].mean()), "MY34 storm window is not elevated")
    require(storm_means[25] > 0.40 and storm_max[25] > 2, "MY25 storm window is not elevated")
    require(storm_max[34] > 2, "MY34 storm core is not elevated")
    require(year_daily_max[28] > 0.40 and storm_max[28] > 1.5, "MY28 never shows the 2007 dust storm")
    # A planet-encircling storm raises the global mean above every year that was kept in the typical map.
    # The peak daily global mean can stay under 1: the core is much higher, and the rest of the planet is not.
    typical_peak = max(year_daily_max[year] for year in year_daily_max if year not in GDS_YEARS)
    require(year_daily_max[34] > typical_peak and year_daily_max[25] > typical_peak, "global-storm years are not the dustiest")

    clim_u8, clim_clip = quantize(clim)
    my34_u8, my34_clip = quantize(my34)
    jy, jx = files[0]["jezeroCell"]
    # Confirm every year agreed on the cell.
    require(all(info["jezeroCell"] == [jy, jx] for info in files), "Jezero cell changed between years")
    jez_clim_mean = (jez_clim / jez_clim_n).tolist()
    jez_my34_mean = (jez_my34 / jez_my34_n).tolist()
    # Quantization at Jezero must round-trip except where the value itself exceeds the scale.
    for b in range(NBIN):
        expect = int(np.clip(np.rint(jez_clim_mean[b] / CDOD_SCALE), 0, 255))
        require(int(clim_u8[b, jy, jx]) == expect, f"climatology quantize mismatch bin {b}")
        expect = int(np.clip(np.rint(jez_my34_mean[b] / CDOD_SCALE), 0, 255))
        require(int(my34_u8[b, jy, jx]) == expect, f"MY34 quantize mismatch bin {b}")

    write_gz(OUT / "cdod-climatology.u8.gz", clim_u8.tobytes())
    write_gz(OUT / "cdod-my34.u8.gz", my34_u8.tobytes())
    return {
        "files": files,
        "stormWindowMean": {str(k): round(v, 4) for k, v in storm_means.items()},
        "stormWindowMax": {str(k): round(v, 3) for k, v in storm_max.items()},
        "climatologyGlobalMean": [round(float(v), 4) for v in clim_global],
        "my34GlobalMean": [round(float(v), 4) for v in my34_global],
        "clippedCells": {"climatology": clim_clip, "my34": my34_clip},
        "jezero": {
            "latIndex": jy,
            "lonIndex": jx,
            "lat": 88.5 - 3 * jy,
            "lon": -180 + 3 * jx,
            "climatologyCdod610": [round(float(v), 4) for v in jez_clim_mean],
            "my34Cdod610": [round(float(v), 4) for v in jez_my34_mean],
        },
        "grid": {"width": 120, "height": 60, "lon0": -180.0, "lat0": 88.5, "dlon": 3.0, "dlat": -3.0},
    }


def build_frequency():
    # 2° cells. Row 0 is north. A sol counts only when at least half the source pixels were observed.
    width, height = 180, 90
    lon0, dlon = -179.0, 2.0
    lat0, dlat = 89.0, -2.0
    storm_n = np.zeros((NBIN, height, width), dtype=np.int32)
    obs_n = np.zeros((NBIN, height, width), dtype=np.int32)
    years = []
    lon_s = np.linspace(-180.0, 179.9, 3600)
    lat_s = np.linspace(-90.0, 90.0, 1801)
    ix = np.clip(np.floor((lon_s + 180.0) / 2.0).astype(np.int32), 0, width - 1)
    iy = np.clip(np.floor((90.0 - lat_s) / 2.0).astype(np.int32), 0, height - 1)
    flat = (iy[None, :] * width + ix[:, None]).ravel()
    pix_per_cell = np.bincount(flat, minlength=width * height)

    for year in range(28, 33):
        archive = RAW / "mdad" / f"MY{year}.tar.gz"
        require(archive.is_file(), f"missing {archive}")
        digest = md5(archive)
        require(digest == MDAD_MD5[archive.name], f"{archive.name} md5 {digest}")
        member = f"MY{year}/MDADMY{year}.nc"
        extracted = RAW / "mdad" / f"MDADMY{year}.nc"
        print(f"extract {member}")
        with tarfile.open(archive, "r:gz") as tar:
            src = tar.extractfile(member)
            require(src is not None, f"{member} not in {archive.name}")
            with open(extracted, "wb") as out:
                while True:
                    chunk = src.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
        ds = nc.Dataset(extracted)
        lat = np.array(ds.variables["lat"][:])
        lon = np.array(ds.variables["lon"][:])
        require(abs(lat[0] + 90) < 1e-2 and abs(lon[0] + 180) < 1e-2, f"MY{year} axes differ from the v1.1 description")
        ls = np.array(ds.variables["timeList"][:, 6], dtype=np.float64)  # mean Ls
        bins = bin_index(ls)
        mask_var = ds.variables["MDAD"]
        ntime = mask_var.shape[0]
        year_obs = np.zeros(NBIN, dtype=np.int32)
        for t in range(ntime):
            slab = np.array(mask_var[t], dtype=np.uint8)  # lon, lat
            valid = slab != 255
            storm = (slab >= 1) & (slab <= 250)
            n_valid = np.bincount(flat, weights=valid.ravel(), minlength=width * height)
            n_storm = np.bincount(flat, weights=storm.ravel(), minlength=width * height)
            observed = n_valid >= (0.5 * pix_per_cell)
            b = int(bins[t])
            obs_n[b].reshape(-1)[observed] += 1
            storm_n[b].reshape(-1)[observed & (n_storm > 0)] += 1
            year_obs[b] += 1
        ds.close()
        extracted.unlink()
        years.append({"marsYear": year, "sols": int(ntime), "lsBinCounts": year_obs.tolist(), "md5": digest, "bytes": archive.stat().st_size})
        print(f"MY{year} sols {ntime} Ls bins {year_obs.tolist()}")

    percent = np.full((NBIN, height, width), FREQ_MISSING, dtype=np.uint8)
    seen = obs_n > 0
    percent[seen] = np.rint(100.0 * storm_n[seen] / obs_n[seen]).astype(np.uint8)
    require(int(percent.max()) > 0, "storm frequency is empty")
    # Dust-storm season in the southern mid-latitudes should exceed the aphelion tropics,
    # where MDAD actually has observations. Bins with no sols stay missing and are ignored.
    def region_mean(bin_slice, row_slice):
        block = percent[bin_slice, row_slice, :]
        good = block != FREQ_MISSING
        require(int(good.sum()) > 100, "not enough observed cells for the frequency sanity check")
        return float(block[good].mean())

    # rows: lat center 89 - 2*j. Southern mid-latitudes (-60 to -30) → j for centers -31 to -59.
    # j = (89 - lat) / 2. lat -30 → j 59.5, lat -60 → j 74.5.
    south = region_mean(slice(7, 10), slice(60, 75))  # Ls 210-300, about 30°S-60°S
    # Aphelion tropics where any year observed them (Ls 30-90 is bins 1-2). MY28 starts at Ls 133,
    # later years fill the earlier season. Use bins 4-5 (Ls 120-180) tropics as the quieter comparison
    # only if the classic dust-season contrast holds against Ls 120-180.
    quiet = region_mean(slice(4, 6), slice(30, 45))  # Ls 120-180, about 0-30°N
    print(f"frequency south dust-season mean {south:.2f}% vs quiet tropics {quiet:.2f}%")
    require(south > quiet, "southern dust-season storm frequency is not above the quieter tropics")

    write_gz(OUT / "storm-frequency.u8.gz", percent.tobytes())
    jy, jx = nearest(JEZERO_LAT, JEZERO_LON, lat0, lon0, dlat, dlon, height, width)
    return {
        "years": years,
        "grid": {"width": width, "height": height, "lon0": lon0, "lat0": lat0, "dlon": dlon, "dlat": dlat},
        "jezero": {
            "latIndex": jy,
            "lonIndex": jx,
            "percent": [None if int(percent[b, jy, jx]) == FREQ_MISSING else int(percent[b, jy, jx]) for b in range(NBIN)],
            "observedSols": [int(obs_n[b, jy, jx]) for b in range(NBIN)],
        },
        "southDustSeasonMeanPercent": round(south, 2),
        "quietTropicsMeanPercent": round(quiet, 2),
    }


def build_jezero_tau():
    path = RAW / "mastcamz" / "m20-ztau-merged-1717.txt"
    require(path.is_file(), f"missing {path}")
    digest = sha256(path)
    require(digest == MASTCAM_SHA[path.name], f"Mastcam-Z sha256 {digest}")
    readme = RAW / "mastcamz" / "readme-m20-ztau-merged.txt"
    require(sha256(readme) == MASTCAM_SHA[readme.name], "Mastcam-Z readme sha256 mismatch")
    by_sol = {}
    with open(path, encoding="utf-8", newline="") as f:
        for line in f:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 14 or not parts[2].isdigit():
                continue
            sol = int(parts[2])
            tau = float(parts[12])  # tau-I, 880 nm
            if tau < 0:
                continue
            milli = int(round(tau * 1000))
            ls = float(parts[8])
            slot = by_sol.setdefault(sol, {"milli": [], "ls": []})
            slot["milli"].append(milli)
            slot["ls"].append(ls)
    sols, taus, lss, counts = [], [], [], []
    for sol in sorted(by_sol):
        millis = by_sol[sol]["milli"]
        # Median. Even counts use the mean of the two central samples, then round half to even
        # via Python round(), which is at most 0.0005 from the unrounded median.
        med = statistics.median(millis)
        sols.append(sol)
        taus.append(int(round(med)))
        lss.append(round(statistics.median(by_sol[sol]["ls"]), 2))
        counts.append(len(millis))
    require(313 not in by_sol, "sol 313 unexpectedly gained a Mastcam-Z tau")
    require(taus[sols.index(316)] == 1376, "sol 316 tau changed")
    require(taus[sols.index(314)] == 639, "sol 314 tau changed")
    require(taus[sols.index(317)] == 1342, "sol 317 median changed")
    # Background vs storm in the Issole window, using the same rules as the app.
    background, storm = [], []
    for sol, tau in zip(sols, taus):
        if 313 <= sol <= 317:
            storm.append(tau)
        elif 286 <= sol <= 339:
            background.append(tau)
    require(background and storm, "Issole window is empty")
    background_median = int(round(statistics.median(background)))
    storm_max = max(storm)
    require(400 <= background_median <= 600, f"background median {background_median}")
    require(max(background) < 1000 <= storm_max, "threshold 1.0 would not separate this window")
    print(f"Jezero background median {background_median} max {max(background)} n {len(background)}; storm max {storm_max} n {len(storm)}")
    return {
        "sha256": digest,
        "bytes": path.stat().st_size,
        "rows": len(sols),
        "sol": sols,
        "tau880milli": taus,
        "ls": lss,
        "n": counts,
        "backgroundMedianMilli": background_median,
        "backgroundMaxMilli": max(background),
        "backgroundSols": len(background),
        "stormMaxMilli": storm_max,
        "stormSols": len(storm),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("column dust optical depth")
    cdod = build_cdod()
    print("storm frequency")
    freq = build_frequency()
    print("Jezero Mastcam-Z")
    jezero = build_jezero_tau()

    products = {
        "cdodClimatology": "cdod-climatology.u8.gz",
        "cdodMy34": "cdod-my34.u8.gz",
        "stormFrequency": "storm-frequency.u8.gz",
    }
    hashes = {key: {"file": name, "sha256": sha256(OUT / name), "bytes": (OUT / name).stat().st_size} for key, name in products.items()}

    catalog = {
        "retrieved": RETRIEVED,
        "lsBinDeg": BIN_DEG,
        "lsBinStarts": list(range(0, 360, BIN_DEG)),
        "cdod": {
            "quantity": "9.3 um absorption column dust optical depth normalized to 610 Pa",
            "variable": "cdod610",
            "scale": CDOD_SCALE,
            "clippedAt": round(255 * CDOD_SCALE, 2),
            "visibleExtinctionFactor": VIS_FACTOR,
            "visibleFactorSource": "Montabone et al. 2015, Icarus, section 2.3.4, doi:10.1016/j.icarus.2014.12.034",
            "typicalYearsExcluded": list(GDS_YEARS),
            "exclusionReason": "MY25, MY28 and MY34 contain planet-encircling dust events. The typical map is the mean of the other Mars years 24-36.",
            "colorStops": CDOD_STOPS,
            "grid": cdod["grid"],
            "jezero": cdod["jezero"],
            "globalMeanByBin": {"climatology": cdod["climatologyGlobalMean"], "my34": cdod["my34GlobalMean"]},
            "clippedCells": cdod["clippedCells"],
            "stormWindowMean": cdod["stormWindowMean"],
            "stormWindowMax": cdod["stormWindowMax"],
            "files": hashes["cdodClimatology"] | {"product": "climatology"},
        },
        "my34": hashes["cdodMy34"],
        "frequency": {
            "quantity": "percent of observed sols with a dust-storm instance",
            "missing": FREQ_MISSING,
            "observedFractionRequired": 0.5,
            "colorStops": FREQ_STOPS,
            "grid": freq["grid"],
            "jezero": freq["jezero"],
            "years": freq["years"],
            "southDustSeasonMeanPercent": freq["southDustSeasonMeanPercent"],
            "quietTropicsMeanPercent": freq["quietTropicsMeanPercent"],
            "file": hashes["stormFrequency"],
            "resolutionNote": "Masks are 0.1 degree. This grid is 2 degrees, about 120 km at the equator. It does not separate routes inside Jezero.",
        },
        "jezeroTau": {
            "lat": JEZERO_LAT,
            "lon": JEZERO_LON,
            "wavelengthNm": 880,
            "sol": jezero["sol"],
            "tau880milli": jezero["tau880milli"],
            "ls": jezero["ls"],
            "n": jezero["n"],
            "backgroundMedianMilli": jezero["backgroundMedianMilli"],
            "backgroundMaxMilli": jezero["backgroundMaxMilli"],
            "backgroundSols": jezero["backgroundSols"],
            "stormMaxMilli": jezero["stormMaxMilli"],
            "stormSolsMeasured": jezero["stormSols"],
            "header": "The source file is marked PRELIMINARY by the author.",
        },
        "provenance": [
            {
                "id": "montabone-cdod",
                "used": True,
                "title": "Gridded and kriged column dust optical depth, Mars years 24-36, version 2.x",
                "authors": "Montabone et al.",
                "papers": [
                    {"citation": "Montabone, L. et al. (2015). Eight-year climatology of dust optical depth on Mars. Icarus 251, 65-95.", "doi": "10.1016/j.icarus.2014.12.034"},
                    {"citation": "Montabone, L. et al. (2020). Martian year 34 column dust climatology from Mars Climate Sounder observations. JGR Planets 125, e2019JE006111.", "doi": "10.1029/2019JE006111"},
                ],
                "url": MONTABONE_PAGE,
                "retrieved": RETRIEVED,
                "format": "NetCDF-3 classic, daily kriged maps, 3 degree, variable cdod610",
                "license": "CC BY-SA 3.0",
                "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/",
                "licenseEvidence": "Global attribute 'copyright' inside each dustscenario_MY*.nc file.",
                "files": cdod["files"],
                "changes": "Seasonal mean in 30-degree Ls bins. Typical map averages every year except MY25, MY28 and MY34. Stored as uint8 with scale 0.01 and a clip at 2.55. Original NetCDF files are not redistributed.",
            },
            {
                "id": "mdad",
                "used": True,
                "title": "Mars Dust Activity Database v1.1",
                "authors": "Battalio, Wang, Richardson, Toigo and Saidel",
                "papers": [
                    {"citation": "Battalio, M. and Wang, H. (2021). The Mars Dust Activity Database (MDAD). Icarus 354, 114059.", "doi": "10.1016/j.icarus.2020.114059"},
                ],
                "datasetDoi": "10.5281/zenodo.7480334",
                "url": MDAD_PAGE,
                "retrieved": RETRIEVED,
                "format": "NetCDF mask uint8, 0.1 degree, MY28-MY32",
                "license": "CC BY 4.0",
                "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
                "licenseEvidence": "Zenodo record 7480334 metadata license id cc-by-4.0, confirmed on retrieval.",
                "years": freq["years"],
                "changes": "Per 2-degree cell and 30-degree Ls bin, percent of sols with any storm pixel among sols where at least half the 0.1-degree pixels were observed. 255 means no observed sol. Outlines and the original masks are not redistributed.",
            },
            {
                "id": "mastcamz-tau",
                "used": True,
                "title": "Perseverance Mastcam-Z visible aerosol optical depth record, version 2",
                "authors": "Mark Lemmon",
                "papers": [
                    {"citation": "Lemmon, M.T. et al. (2022). Dust, sand, and winds within an active Martian storm in Jezero crater. Geophys. Res. Lett. 49, e2022GL100126.", "doi": "10.1029/2022GL100126"},
                ],
                "datasetDoi": "10.17632/gktjp9jptb.2",
                "url": "https://data.mendeley.com/datasets/gktjp9jptb/2",
                "retrieved": RETRIEVED,
                "format": "ASCII table m20-ztau-merged-1717.txt, generated 27 Feb 2026, marked PRELIMINARY in the file header",
                "sha256": jezero["sha256"],
                "bytes": jezero["bytes"],
                "license": "CC BY 4.0",
                "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
                "licenseEvidence": "Mendeley Data public API field data_licence.short_name on dataset gktjp9jptb version 2.",
                "changes": "Kept the median 880 nm optical depth (tau-I) of the valid samples on each sol. Dropped other wavelengths, geometry and the image metadata.",
            },
            {
                "id": "mcd-dust-scenarios",
                "used": False,
                "reason": "The public dust_clim/dust_cold/dust_warm files are synthetic (the cold case is a minimum reduced by 50 percent, the warm case a maximum increased by 50 percent). The Mars Climate Database full-version terms require the recipient not to transmit the database, in part or in whole, to a third party (https://www-mars.lmd.jussieu.fr/MCD_pro/mcd_pro.html). Those scenarios are not redistributed. The typical map here is the mean of the observational kriged years instead.",
            },
            {
                "id": "meda-derived-opacity",
                "used": False,
                "reason": "The derived MEDA products already in this project (TIRS, wind, pressure, humidity) do not contain dust opacity. RDS optical depth is a radiative-transfer retrieval, not a column in those files. Lemmon et al. 2022 quote an RDS visible peak near 1.7 on the storm, which is not a row in the Mastcam-Z table, so it is cited and not copied in as a measurement.",
            },
        ],
    }
    # Attach file hashes that were not nested yet.
    catalog["cdod"]["file"] = hashes["cdodClimatology"]
    text = json.dumps(catalog, ensure_ascii=True, indent=2) + "\n"
    require(not text.startswith("\ufeff"), "catalog would be written with a BOM")
    (OUT / "catalog.json").write_text(text, encoding="utf-8")
    print("wrote", OUT / "catalog.json", "bytes", (OUT / "catalog.json").stat().st_size)
    for item in hashes.values():
        print(item)


if __name__ == "__main__":
    main()
