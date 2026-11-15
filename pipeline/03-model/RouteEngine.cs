// MARS+ official route engine (pipeline side). Mirrors app/src/domain/terrain/cost.js and routing/astar.js.
// Cost of a cell = time to cross it: directional slope (Tobler, scaled), roughness, sand (Stack et al. 2020)
// and rocks (shadow fraction in 25 cm HiRISE). Blocked: no data, slope > SlopeBlockDeg, rocks > RockBlock.
// Parameters are injected from config/model-parameters.json (single source of truth).
// AI-assisted (Claude). Reviewed by the MARS+ team.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

public class RouteEngine
{
    // --- parameters (set from config before constructing) ---
    public static double ToblerFactor = 0.5, SlopeBlockDeg = 20.0, RoughRefM = 0.25;
    public static double LargeDuneExtra = 1.0, SmallDuneExtra = 0.3, RockMult = 6.0, RockBlock = 0.12;
    // Loaded from config/model-parameters.json before BestWorkspace (no hardcoded fallback).
    public static double WorkspaceMaxSlopeDeg = double.NaN, WorkspaceMaxLargeDune = double.NaN;

    public int NR, NC; public double Res, X0, Y0, R;
    public float[] Z, Slope, Rough, Rock, DuneL, DuneS;
    static readonly CultureInfo IC = CultureInfo.InvariantCulture;

    public static float[] LoadFloat(string path, int n) { byte[] b = System.IO.File.ReadAllBytes(path); float[] f = new float[n]; Buffer.BlockCopy(b, 0, f, 0, Math.Min(b.Length, n * 4)); return f; }

    public static float[] Roughness1m(float[] z, int nr, int nc)
    {
        float[] o = new float[z.Length];
        for (int r = 1; r < nr - 1; r++) for (int c = 1; c < nc - 1; c++)
        { double s = 0; for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += z[(r + i) * nc + c + j]; o[r * nc + c] = (float)Math.Abs(z[r * nc + c] - s / 9.0); }
        return o;
    }

    // Shadow fraction per 1 m cell from the 25 cm orthoimage: a pixel is "shadow" if darker than threshold x local mean.
    public static float[] RocksFromOrtho(byte[] img, int H, int W, int window, double threshold, int pxPerM)
    {
        double[] I = new double[(W + 1) * (H + 1)]; int[] N = new int[(W + 1) * (H + 1)];
        for (int y = 0; y < H; y++) { double s = 0; int n = 0; for (int x = 0; x < W; x++) { byte v = img[y * W + x]; if (v > 0) { s += v; n++; } I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; N[(y + 1) * (W + 1) + x + 1] = N[y * (W + 1) + x + 1] + n; } }
        int nr = H / pxPerM, nc = W / pxPerM, h = window / 2; float[] cnt = new float[nr * nc], sh = new float[nr * nc];
        for (int y = 0; y < nr * pxPerM; y++) for (int x = 0; x < nc * pxPerM; x++)
        {
            byte v = img[y * W + x]; if (v == 0) continue;
            int xa = Math.Max(0, x - h), xb = Math.Min(W, x + h + 1), ya = Math.Max(0, y - h), yb = Math.Min(H, y + h + 1);
            double s = I[yb * (W + 1) + xb] - I[ya * (W + 1) + xb] - I[yb * (W + 1) + xa] + I[ya * (W + 1) + xa];
            int n = N[yb * (W + 1) + xb] - N[ya * (W + 1) + xb] - N[yb * (W + 1) + xa] + N[ya * (W + 1) + xa];
            int c = (y / pxPerM) * nc + x / pxPerM; cnt[c]++; if (n > 0 && v < threshold * s / n) sh[c]++;
        }
        for (int i = 0; i < sh.Length; i++) sh[i] = cnt[i] > 0 ? sh[i] / cnt[i] : 0f;
        return sh;
    }

    public RouteEngine(float[] z1, float[] rough1, float[] rock1, byte[] geo1, int nr1, int nc1, double x0, double y0, double r, int k)
    {
        Res = k; R = r; X0 = x0; Y0 = y0; NR = nr1 / k; NC = nc1 / k; int N = NR * NC;
        Z = new float[N]; Rough = new float[N]; Rock = new float[N]; DuneL = new float[N]; DuneS = new float[N];
        for (int rr = 0; rr < NR; rr++) for (int cc = 0; cc < NC; cc++)
        {
            double s = 0, rk = 0; float mx = 0, rkmax = 0; int n = 0, dl = 0, ds = 0;
            for (int i = 0; i < k; i++) for (int j = 0; j < k; j++)
            {
                int idx = (rr * k + i) * nc1 + cc * k + j; float v = z1[idx];
                if (v > -1e6) { s += v; n++; }
                if (rough1[idx] > mx) mx = rough1[idx];
                rk += rock1[idx]; if (rock1[idx] > rkmax) rkmax = rock1[idx];
                if (geo1[idx] == 1) dl++; else if (geo1[idx] == 2) ds++;
            }
            int o = rr * NC + cc; double kk = k * k;
            Z[o] = n > 0 ? (float)(s / n) : float.NaN; Rough[o] = mx;
            Rock[o] = (float)Math.Max(rk / kk, 0.5 * rkmax);   // keep obstacles visible when aggregating
            DuneL[o] = (float)(dl / kk); DuneS[o] = (float)(ds / kk);
        }
        Slope = new float[N]; double dxm = Res * CosLat(), dym = Res;
        for (int rr = 1; rr < NR - 1; rr++) for (int cc = 1; cc < NC - 1; cc++)
        {
            double gx = (Z[rr * NC + cc + 1] - Z[rr * NC + cc - 1]) / (2 * dxm), gy = (Z[(rr + 1) * NC + cc] - Z[(rr - 1) * NC + cc]) / (2 * dym);
            Slope[rr * NC + cc] = (float)(Math.Atan(Math.Sqrt(gx * gx + gy * gy)) * 180 / Math.PI);
        }
    }

    public double CosLat() { return Math.Cos((Y0 - NR * Res / 2) / R); }
    public double Lon(int c) { return (X0 + (c + 0.5) * Res) / R * 180 / Math.PI; }
    public double Lat(int r) { return (Y0 - (r + 0.5) * Res) / R * 180 / Math.PI; }
    public int Col(double lon) { return (int)Math.Floor((lon * Math.PI / 180 * R - X0) / Res); }
    public int Row(double lat) { return (int)Math.Floor((Y0 - lat * Math.PI / 180 * R) / Res); }
    public int Cell(double lon, double lat) { return Row(lat) * NC + Col(lon); }

    public static double Speed(double grade) { return ToblerFactor * 6.0 * Math.Exp(-3.5 * Math.Abs(grade + 0.05)) / 3.6; }
    public bool Blocked(int i) { return float.IsNaN(Z[i]) || Slope[i] > SlopeBlockDeg || Rock[i] > RockBlock; }
    public double Mult(int i) { return (1 + Rough[i] / RoughRefM) * (1 + LargeDuneExtra * DuneL[i] + SmallDuneExtra * DuneS[i]) * (1 + RockMult * Rock[i]); }
    double EdgeTime(int a, int b, double len) { double grade = (Z[b] - Z[a]) / len; return len / Speed(grade) * 0.5 * (Mult(a) + Mult(b)); }

    static readonly int[] DR = { -1, -1, -1, 0, 0, 1, 1, 1 }, DC = { -1, 0, 1, -1, 1, -1, 0, 1 };

    // Dijkstra from a source (forward edges): minimum time (s) to every cell.
    public double[] TimeFrom(int s, out int[] prev)
    {
        int N = NR * NC; double cl = CosLat(); double[] g = new double[N]; prev = new int[N]; bool[] done = new bool[N];
        for (int i = 0; i < N; i++) { g[i] = double.MaxValue; prev[i] = -1; }
        var open = new SortedSet<Tuple<double, int>>(); g[s] = 0; open.Add(Tuple.Create(0.0, s));
        while (open.Count > 0)
        {
            var t = open.Min; open.Remove(t); int u = t.Item2; if (done[u]) continue; done[u] = true;
            int ur = u / NC, uc = u % NC;
            for (int q = 0; q < 8; q++)
            {
                int vr = ur + DR[q], vc = uc + DC[q]; if (vr < 1 || vc < 1 || vr >= NR - 1 || vc >= NC - 1) continue;
                int v = vr * NC + vc; if (done[v] || Blocked(v)) continue;
                if (DR[q] != 0 && DC[q] != 0 && (Blocked(ur * NC + vc) || Blocked(vr * NC + uc))) continue;
                double len = Math.Sqrt(Math.Pow(DC[q] * Res * cl, 2) + Math.Pow(DR[q] * Res, 2));
                double ng = g[u] + EdgeTime(u, v, len); if (ng < g[v]) { g[v] = ng; prev[v] = u; open.Add(Tuple.Create(ng, v)); }
            }
        }
        return g;
    }

    // Dijkstra towards a target (reverse edges): minimum time (s) from every cell to the target.
    public double[] TimeTo(int target, out int[] next)
    {
        int N = NR * NC; double cl = CosLat(); double[] g = new double[N]; next = new int[N]; bool[] done = new bool[N];
        for (int i = 0; i < N; i++) { g[i] = double.MaxValue; next[i] = -1; }
        var open = new SortedSet<Tuple<double, int>>(); g[target] = 0; open.Add(Tuple.Create(0.0, target));
        while (open.Count > 0)
        {
            var t = open.Min; open.Remove(t); int v = t.Item2; if (done[v]) continue; done[v] = true;
            int vr = v / NC, vc = v % NC;
            for (int q = 0; q < 8; q++)
            {
                int ur = vr + DR[q], uc = vc + DC[q]; if (ur < 1 || uc < 1 || ur >= NR - 1 || uc >= NC - 1) continue;
                int u = ur * NC + uc; if (done[u] || Blocked(u)) continue;
                if (DR[q] != 0 && DC[q] != 0 && (Blocked(ur * NC + vc) || Blocked(vr * NC + uc))) continue;
                double len = Math.Sqrt(Math.Pow(DC[q] * Res * cl, 2) + Math.Pow(DR[q] * Res, 2));
                double ng = g[v] + EdgeTime(u, v, len); if (ng < g[u]) { g[u] = ng; next[u] = v; open.Add(Tuple.Create(ng, u)); }
            }
        }
        return g;
    }

    public static List<int> PathFrom(int[] prev, int target) { var p = new List<int>(); for (int c = target; c != -1; c = prev[c]) p.Add(c); p.Reverse(); return p; }
    public static List<int> PathTo(int[] next, int origin) { var p = new List<int>(); for (int c = origin; c != -1; c = next[c]) p.Add(c); return p; }

    public List<int> StraightLine(int s, int g)
    {
        var p = new List<int>(); int sr = s / NC, sc = s % NC, gr = g / NC, gc = g % NC, n = Math.Max(Math.Abs(gr - sr), Math.Abs(gc - sc));
        for (int i = 0; i <= n; i++) { int id = (int)Math.Round(sr + (gr - sr) * (double)i / n) * NC + (int)Math.Round(sc + (gc - sc) * (double)i / n); if (p.Count == 0 || p[p.Count - 1] != id) p.Add(id); }
        return p;
    }

    // Best workspace near (lat,lon): slope <= WorkspaceMaxSlopeDeg (inclusive), large-dune
    // fraction <= WorkspaceMaxLargeDune (inclusive), no blocked cells, within radius.
    public int BestWorkspace(double lat, double lon, double radius, double platformRadius, out string why)
    {
        if (double.IsNaN(WorkspaceMaxSlopeDeg) || double.IsNaN(WorkspaceMaxLargeDune))
            throw new InvalidOperationException("Workspace thresholds must be loaded from config/model-parameters.json");
        int r0 = Row(lat), c0 = Col(lon), rad = (int)Math.Ceiling(radius / Res), pr = Math.Max(1, (int)Math.Ceiling(platformRadius / Res));
        int best = -1; double bestScore = double.MaxValue; why = "";
        for (int r = r0 - rad; r <= r0 + rad; r++) for (int c = c0 - rad; c <= c0 + rad; c++)
        {
            if (r < pr || c < pr || r >= NR - pr || c >= NC - pr) continue;
            double d = Math.Sqrt(Math.Pow((r - r0) * Res, 2) + Math.Pow((c - c0) * Res * CosLat(), 2)); if (d > radius) continue;
            double smax = 0, rk = 0, dl = 0; bool ok = true;
            for (int i = -pr; i <= pr && ok; i++) for (int j = -pr; j <= pr; j++) { int q = (r + i) * NC + c + j; if (Blocked(q)) { ok = false; break; } smax = Math.Max(smax, Slope[q]); rk = Math.Max(rk, Rock[q]); dl = Math.Max(dl, DuneL[q]); }
            if (!ok || smax > WorkspaceMaxSlopeDeg || dl > WorkspaceMaxLargeDune) continue;
            double score = smax + 50 * rk + 0.5 * d;
            if (score < bestScore) { bestScore = score; best = r * NC + c; why = "{" + string.Format(IC, "\"maxSlopeDeg\":{0:F1},\"rockFraction\":{1:F3},\"largeDuneFraction\":{2:F3},\"distanceToTargetM\":{3:F1}", smax, rk, dl, d) + "}"; }
        }
        return best;
    }

    public string StatsJson(List<int> p, string id)
    {
        double cl = CosLat(), L = 0, T = 0, up = 0, dn = 0, mxs = 0, dune = 0, rkmax = 0;
        for (int i = 1; i < p.Count; i++)
        {
            int a = p[i - 1], b = p[i]; double dx = (b % NC - a % NC) * Res * cl, dy = (b / NC - a / NC) * Res, len = Math.Sqrt(dx * dx + dy * dy);
            L += len; T += EdgeTime(a, b, len); double dz = Z[b] - Z[a]; if (dz > 0) up += dz; else dn -= dz;
            mxs = Math.Max(mxs, Slope[b]); dune += len * DuneL[b]; rkmax = Math.Max(rkmax, Rock[b]);
        }
        var sb = new StringBuilder();
        sb.AppendFormat(IC, "{{\"id\":\"{0}\",\"resM\":{1},\"distanceM\":{2:F1},\"timeMin\":{3:F2},\"climbM\":{4:F1},\"descentM\":{5:F1},\"maxSlopeDeg\":{6:F1},\"largeDuneM\":{7:F0},\"maxRockFraction\":{8:F3},\"blockedCells\":{9},\"coords\":[",
            id, Res, L, T / 60, up, dn, mxs, dune, rkmax, CountBlocked(p));
        for (int i = 0; i < p.Count; i++) { if (i > 0) sb.Append(','); sb.AppendFormat(IC, "[{0:F7},{1:F7},{2:F2}]", Lon(p[i] % NC), Lat(p[i] / NC), Z[p[i]]); }
        sb.Append("]}"); return sb.ToString();
    }

    int CountBlocked(List<int> p) { int n = 0; foreach (int i in p) if (Blocked(i)) n++; return n; }

    // Band-sequential export for the browser (see STACK_Y_ARQUITECTURA.md, section 4).
    public byte[] ExportBands(out double zMin)
    {
        int N = NR * NC; zMin = double.MaxValue;
        for (int i = 0; i < N; i++) if (!float.IsNaN(Z[i]) && Z[i] < zMin) zMin = Z[i];
        byte[] o = new byte[N * 2 + N * 5];
        for (int i = 0; i < N; i++)
        {
            ushort zq = float.IsNaN(Z[i]) ? (ushort)65535 : (ushort)Math.Min(65534, Math.Round((Z[i] - zMin) * 100));
            o[2 * i] = (byte)(zq & 0xFF); o[2 * i + 1] = (byte)(zq >> 8);
            o[2 * N + i] = Q(Slope[i] * 4);
            o[3 * N + i] = Q(Rough[i] * 200);
            o[4 * N + i] = Q(DuneL[i] * 255);
            o[5 * N + i] = Q(DuneS[i] * 255);
            o[6 * N + i] = Q(Rock[i] * 255);
        }
        return o;
    }
    static byte Q(double v) { return (byte)Math.Max(0, Math.Min(255, Math.Round(v))); }
}

public static class ImageWriter
{
    public static void SaveRgba(int[] argb, int w, int h, string path)
    {
        using (var bmp = new System.Drawing.Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            var data = bmp.LockBits(new System.Drawing.Rectangle(0, 0, w, h), System.Drawing.Imaging.ImageLockMode.WriteOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++) System.Runtime.InteropServices.Marshal.Copy(argb, y * w, data.Scan0 + y * data.Stride, w);
            bmp.UnlockBits(data); bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
        }
    }

    public static int[] CostOverlay(RouteEngine e)
    {
        int N = e.NR * e.NC; int[] px = new int[N];
        for (int i = 0; i < N; i++)
        {
            if (e.Blocked(i)) { px[i] = Argb(210, 20, 20, 20); continue; }
            double m = Math.Min(1, (e.Mult(i) - 1) / 3);
            px[i] = Argb((int)(50 + 130 * m), (int)(70 + 180 * m), (int)(190 - 110 * m), 40);
        }
        return px;
    }

    public static int[] SlopeOverlay(RouteEngine e)
    {
        int N = e.NR * e.NC; int[] px = new int[N];
        for (int i = 0; i < N; i++)
        {
            double s = e.Slope[i];
            px[i] = s < 5 ? 0 : s < 10 ? Argb(110, 250, 204, 21) : s < 15 ? Argb(150, 249, 115, 22) : s < 20 ? Argb(180, 220, 38, 38) : Argb(210, 127, 29, 29);
        }
        return px;
    }

    // Downsample the 25 cm orthoimage to 1 m (4x4 mean) as an offline base layer.
    public static int[] OrthoBase(byte[] img, int H, int W, int f)
    {
        int h = H / f, w = W / f; int[] px = new int[h * w];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
        {
            int s = 0, n = 0; for (int i = 0; i < f; i++) for (int j = 0; j < f; j++) { byte v = img[(y * f + i) * W + x * f + j]; if (v > 0) { s += v; n++; } }
            int g = n > 0 ? s / n : 0; px[y * w + x] = n > 0 ? Argb(255, g, g, g) : 0;
        }
        return px;
    }

    static int Argb(int a, int r, int g, int b) { return (a << 24) | (r << 16) | (g << 8) | b; }
}
