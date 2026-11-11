/* Margin figures: small gravity and entanglement diagrams that sit in the page
   margins beside the text and scroll with it. Each figure's "time" is set by
   scroll position (0 when it enters at the bottom of the screen, or at the top
   of the page; 1 when it leaves at the top, or at the end of the page), so
   reading down the page plays it forward.
   Screens at least 980px wide only (the margins need room).

   Figures, top to bottom
     right  Penrose diagram of the eternal AdS black hole; the ER bridge grows
     left   {5,4} tiling; a boundary interval grows and its entanglement wedge fills in
     right  mixed-state holographic secret sharing (three regions, purifier in the gaps)
     left   Page curve of an evaporating black hole, with the replica saddles switching
     right  corotating m = 2 mode on a finite-element mesh around a rotating black hole
     left   light bending around a Schwarzschild black hole
     right  MERA; the causal cone of a growing interval
     left   double trumpet wormhole and the ramp of the spectral form factor        */
(function () {
  "use strict";
  if (!window.matchMedia || !window.Path2D) return;

  var TAU = Math.PI * 2;
  var wide = window.matchMedia("(min-width: 980px)");
  var HOLE = "rgb(8,10,9)";

  /* ------------------------------------------------------------ utilities */
  var C = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["accent", "muted", "text", "bg"].forEach(function (k) {
      var h = cs.getPropertyValue("--" + k).trim().replace("#", "");
      if (h.length === 3) h = h.replace(/./g, "$&$&");
      var n = parseInt(h, 16);
      C[k] = [n >> 16 & 255, n >> 8 & 255, n & 255];
    });
  }
  function col(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")"; }
  function wrapPi(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function polyline(ctx, pts, n) {
    n = n == null ? pts.length : n;
    if (n < 2) return;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  // RK4 for the orbit equation u'' = f(u) in the angle phi; state [u, du/dphi].
  function rk4(s, h, f) {
    function d(x) { return [x[1], f(x[0])]; }
    var k1 = d(s), k2 = d([s[0] + h / 2 * k1[0], s[1] + h / 2 * k1[1]]);
    var k3 = d([s[0] + h / 2 * k2[0], s[1] + h / 2 * k2[1]]), k4 = d([s[0] + h * k3[0], s[1] + h * k3[1]]);
    return [s[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), s[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
  }

  /* -------------------------------------------- Poincaré disk geometry */
  // Geodesic ending on boundary angles t1 -> t2 (increasing canvas angle):
  // a circle around the shorter arc, or a line through the origin.
  // flip = the t1 -> t2 arc is the longer one.
  function boundaryGeodesic(t1, t2) {
    var d = ((t2 - t1) % TAU + TAU) % TAU, mid = t1 + d / 2, flip = d > Math.PI;
    var h = flip ? TAU - d : d, m = flip ? mid + Math.PI : mid, r = Math.tan(h / 2);
    if (!(r < 60)) return { line: true, nx: Math.cos(mid), ny: Math.sin(mid), t1: t1, t2: t2 };
    var dist = 1 / Math.cos(h / 2);
    return { cx: dist * Math.cos(m), cy: dist * Math.sin(m), r: r, flip: flip, t1: t1, t2: t2 };
  }
  function onArcSide(g, x, y) {
    if (g.line) return x * g.nx + y * g.ny > 0;
    var inside = (x - g.cx) * (x - g.cx) + (y - g.cy) * (y - g.cy) < g.r * g.r;
    return g.flip ? !inside : inside;
  }
  function geodesicPath(ctx, g, X, Y, R) {
    var ax = X + R * Math.cos(g.t1), ay = Y + R * Math.sin(g.t1);
    var bx = X + R * Math.cos(g.t2), by = Y + R * Math.sin(g.t2);
    ctx.moveTo(ax, ay);
    if (g.line) { ctx.lineTo(bx, by); return; }
    var cx = X + R * g.cx, cy = Y + R * g.cy;
    var a1 = Math.atan2(ay - cy, ax - cx), d = wrapPi(Math.atan2(by - cy, bx - cx) - a1);
    ctx.arc(cx, cy, R * g.r, a1, a1 + d, d < 0);
  }
  // Clip to the region on (onSide) or off the t1 -> t2 side of g.
  function clipSide(ctx, g, X, Y, R, S, onSide) {
    var p = new Path2D();
    if (g.line) {
      var s = onSide ? 1 : -1, nx = g.nx * s, ny = g.ny * s, big = 4 * S;
      p.moveTo(X - ny * big, Y + nx * big);
      p.lineTo(X - ny * big + nx * big, Y + nx * big + ny * big);
      p.lineTo(X + ny * big + nx * big, Y - nx * big + ny * big);
      p.lineTo(X + ny * big, Y - nx * big);
      p.closePath();
      ctx.clip(p);
      return;
    }
    p.arc(X + R * g.cx, Y + R * g.cy, R * g.r, 0, TAU);
    if (onSide !== g.flip) { ctx.clip(p); return; }
    p.rect(-S, -S, 3 * S, 3 * S);
    ctx.clip(p, "evenodd");
  }
  function geodesicThrough(a, b) {
    var cr = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(cr) < 1e-10) {
      var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      return { line: true, nx: -dy / l, ny: dx / l };
    }
    var s = a[0] * a[0] + a[1] * a[1], c = [a[0] / s, a[1] / s];
    var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    var b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    var ux = (s * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    var uy = (s * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { cx: ux, cy: uy, r: Math.hypot(a[0] - ux, a[1] - uy) };
  }
  function reflect(z, g) {
    if (g.line) {
      var d = z[0] * g.nx + z[1] * g.ny;
      return [z[0] - 2 * d * g.nx, z[1] - 2 * d * g.ny];
    }
    var dx = z[0] - g.cx, dy = z[1] - g.cy, k = g.r * g.r / (dx * dx + dy * dy);
    return [g.cx + k * dx, g.cy + k * dy];
  }
  // Regular {p,q} tiling by repeated reflection of the central p-gon in its edges.
  function buildTiling(p, q, minSize, maxTiles) {
    var rv = Math.sqrt(Math.cos(Math.PI / p + Math.PI / q) / Math.cos(Math.PI / p - Math.PI / q));
    var v0 = [];
    for (var k = 0; k < p; k++) {
      var a = -Math.PI / 2 + TAU * (k + 0.5) / p;
      v0.push([rv * Math.cos(a), rv * Math.sin(a)]);
    }
    function centroid(v) {
      var x = 0, y = 0;
      for (var i = 0; i < v.length; i++) { x += v[i][0]; y += v[i][1]; }
      return [x / v.length, y / v.length];
    }
    function keyOf(c) { return Math.round(c[0] * 4000) + "," + Math.round(c[1] * 4000); }
    function extent(v) {
      var m = 0;
      for (var i = 1; i < v.length; i++) m = Math.max(m, Math.hypot(v[i][0] - v[0][0], v[i][1] - v[0][1]));
      return m;
    }
    var first = { v: v0, c: centroid(v0), par: 0 }, tiles = [first], seen = {}, queue = [first];
    seen[keyOf(first.c)] = 1;
    while (queue.length && tiles.length < maxTiles) {
      var t = queue.shift();
      for (var e = 0; e < p; e++) {
        var g = geodesicThrough(t.v[e], t.v[(e + 1) % p]);
        var nv = t.v.map(function (z) { return reflect(z, g); });
        var c = centroid(nv), key = keyOf(c);
        if (seen[key]) continue;
        seen[key] = 1;
        if (extent(nv) < minSize) continue;
        var nt = { v: nv, c: c, par: 1 - t.par };
        tiles.push(nt);
        queue.push(nt);
      }
    }
    return tiles;
  }

  /* ================================================================ figures
     Each figure is { draw(ctx, S, p) } with S the canvas size in CSS px and
     p in [0, 1] the scroll-driven time.                                      */

  // Two-sided AdS black hole. Slices anchored at t_L = t_R = t move up the
  // diagram; their interior part grows and hugs the final slice.
  function Penrose() {
    return {
      draw: function (ctx, S, p) {
        var m = 5, W = S - 2 * m;
        function px(x) { return m + (x + 1) / 2 * W; }
        function py(y) { return m + (1 - y) / 2 * W; }
        ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]); ctx.strokeStyle = col(C.muted, 0.8);
        ctx.beginPath();
        ctx.moveTo(px(-1), py(-1)); ctx.lineTo(px(1), py(1));
        ctx.moveTo(px(-1), py(1)); ctx.lineTo(px(1), py(-1));
        ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 1.2; ctx.strokeStyle = col(C.text, 0.7);
        ctx.beginPath();
        ctx.moveTo(px(-1), py(-1)); ctx.lineTo(px(-1), py(1));
        ctx.moveTo(px(1), py(-1)); ctx.lineTo(px(1), py(1));
        ctx.stroke();
        ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.text, 0.55);
        [1, -1].forEach(function (yy) {
          ctx.beginPath();
          for (var k = 0; k <= 14; k++) {
            var x = px(-1 + 2 * k / 14), y = py(yy) + (k % 2 ? 1.4 : -1.4);
            if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.stroke();
        });
        var tau = -2.8 + 5.6 * p;
        for (var k = 5; k >= 0; k--) {
          var tk = tau - k * 0.42;
          if (tk < -3.2) continue;
          var h = 0.97 * Math.tanh(0.6 * tk), ym = 0.62 * Math.tanh(0.6 * tk);
          ctx.beginPath();
          ctx.moveTo(px(-1), py(h));
          ctx.quadraticCurveTo(px(0), py(2 * ym - h), px(1), py(h));
          ctx.lineWidth = k ? 0.8 : 1.6;
          ctx.strokeStyle = col(C.accent, k ? 0.4 * (1 - k / 6) : 1);
          ctx.stroke();
        }
        h = 0.97 * Math.tanh(0.6 * tau);
        ctx.fillStyle = col(C.accent);
        ctx.beginPath(); ctx.arc(px(-1), py(h), 2, 0, TAU); ctx.arc(px(1), py(h), 2, 0, TAU); ctx.fill();
      }
    };
  }

  // {5,4} tiling (the HaPPY-code tiling). A boundary interval grows; the tiles
  // of its entanglement wedge fill in, reaching the centre once it passes half the boundary.
  function Tiling() {
    var tiles = buildTiling(5, 4, 0.03, 1500), cache = null;
    function paths(S) {
      var X = S / 2, Y = S / 2, R = S / 2 - 2, all = new Path2D();
      var list = tiles.map(function (t) {
        var pa = new Path2D(), v = t.v, n = v.length;
        pa.moveTo(X + R * v[0][0], Y + R * v[0][1]);
        for (var e = 0; e < n; e++) {
          var a = v[e], b = v[(e + 1) % n], g = geodesicThrough(a, b);
          if (g.line || g.r > 50) { pa.lineTo(X + R * b[0], Y + R * b[1]); continue; }
          var a1 = Math.atan2(a[1] - g.cy, a[0] - g.cx), d = wrapPi(Math.atan2(b[1] - g.cy, b[0] - g.cx) - a1);
          pa.arc(X + R * g.cx, Y + R * g.cy, R * g.r, a1, a1 + d, d < 0);
        }
        pa.closePath();
        all.addPath(pa);
        return pa;
      });
      return { S: S, all: all, list: list };
    }
    return {
      draw: function (ctx, S, p) {
        if (!cache || cache.S !== S) cache = paths(S);
        var X = S / 2, Y = S / 2, R = S / 2 - 2;
        var mid = -Math.PI / 2 + 0.5 * p, span = Math.PI * (0.18 + 1.5 * p);
        var g = boundaryGeodesic(mid - span / 2, mid + span / 2);
        for (var i = 0; i < tiles.length; i++) {
          var tl = tiles[i];
          if (onArcSide(g, tl.c[0], tl.c[1])) { ctx.fillStyle = col(C.accent, tl.par ? 0.38 : 0.22); ctx.fill(cache.list[i]); }
          else if (!tl.par) { ctx.fillStyle = col(C.text, 0.05); ctx.fill(cache.list[i]); }
        }
        ctx.lineWidth = 0.45; ctx.strokeStyle = col(C.muted, 0.5); ctx.stroke(cache.all);
        ctx.beginPath(); ctx.arc(X, Y, R, 0, TAU); ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.muted, 0.85); ctx.stroke();
        ctx.beginPath(); ctx.arc(X, Y, R, g.t1, g.t2); ctx.lineWidth = 2.4; ctx.strokeStyle = col(C.accent); ctx.stroke();
        ctx.beginPath(); geodesicPath(ctx, g, X, Y, R); ctx.lineWidth = 1.3; ctx.stroke();
      }
    };
  }

  // Page curve. Hawking's radiation entropy keeps rising (dashed); the black
  // hole's Bekenstein-Hawking entropy falls as it evaporates (M^3 ~ t_evap - t);
  // the fine-grained entropy follows the smaller of the two.
  // Inset: the two saddles of the replica computation (n = 2 copies of the black
  // hole). Before the Page time the disconnected (Hawking) saddle dominates;
  // after it the replica wormhole, which joins the copies' interiors and gives
  // the island, takes over. The subdominant connection is drawn faintly.
  function PageCurve() {
    var k = 1.4, tPage = 1 - Math.pow(k / (1 + k), 1.5);
    function sbh(t) { return Math.pow(Math.max(0, 1 - t), 2 / 3); }
    function shaw(t) { return k * (1 - sbh(t)); }
    function replicas(ctx, cx, cy, t) {
      var w = clamp01((t - tPage) / 0.035 + 0.5); w = w * w * (3 - 2 * w);
      var d = 14, R0 = 9, nh = 3.8, a = Math.asin(nh / R0), ox = R0 * Math.cos(a);
      var Lx = cx - d, Rx = cx + d;
      var joined = new Path2D();
      joined.arc(Lx, cy, R0, -a, a, true);
      joined.quadraticCurveTo(cx, cy + 0.4 * nh, Rx - ox, cy + nh);
      joined.arc(Rx, cy, R0, Math.PI - a, Math.PI + a, true);
      joined.quadraticCurveTo(cx, cy - 0.4 * nh, Lx + ox, cy - nh);
      joined.closePath();
      var apart = new Path2D();
      apart.arc(Lx, cy, R0, 0, TAU); apart.moveTo(Rx + R0, cy); apart.arc(Rx, cy, R0, 0, TAU);
      if (w < 1) { ctx.fillStyle = col(C.accent, 0.28 * (1 - w)); ctx.fill(apart); }
      if (w > 0) { ctx.fillStyle = col(C.accent, 0.28 * w); ctx.fill(joined); }
      ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.muted, 0.9); ctx.stroke(apart);
      ctx.beginPath();
      ctx.moveTo(Lx + ox, cy + nh); ctx.quadraticCurveTo(cx, cy + 0.4 * nh, Rx - ox, cy + nh);
      ctx.moveTo(Lx + ox, cy - nh); ctx.quadraticCurveTo(cx, cy - 0.4 * nh, Rx - ox, cy - nh);
      ctx.setLineDash(w < 0.5 ? [1.2, 1.6] : []);
      ctx.strokeStyle = col(w < 0.5 ? C.muted : C.accent, 0.35 + 0.65 * w);
      ctx.stroke(); ctx.setLineDash([]);
    }
    function curve(f, t0, t1, X, Y) {
      var pts = [];
      for (var i = 0; i <= 80; i++) { var t = t0 + (t1 - t0) * i / 80; pts.push([X(t), Y(f(t))]); }
      return pts;
    }
    return {
      draw: function (ctx, S, p) {
        var l = 7, r = S - 5, b = S - 7, tp = 6, ymax = 1.45;
        function X(t) { return l + (r - l) * t; }
        function Y(s) { return b - (b - tp) * s / ymax; }
        ctx.lineWidth = 0.9; ctx.strokeStyle = col(C.muted, 0.9);
        ctx.beginPath(); ctx.moveTo(l, tp); ctx.lineTo(l, b); ctx.lineTo(r, b); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = col(C.muted, 0.75);
        polyline(ctx, curve(sbh, 0, 1, X, Y));
        ctx.setLineDash([2, 2]); polyline(ctx, curve(shaw, 0, 1, X, Y)); ctx.setLineDash([]);
        var tn = 0.015 + 0.975 * p;
        ctx.lineWidth = 1.8; ctx.strokeStyle = col(C.accent);
        var pc = curve(function (t) { return Math.min(sbh(t), shaw(t)); }, 0, tn, X, Y);
        polyline(ctx, pc);
        var end = pc[pc.length - 1];
        ctx.fillStyle = col(C.accent); ctx.beginPath(); ctx.arc(end[0], end[1], 2.3, 0, TAU); ctx.fill();
        replicas(ctx, X(0.31), Y(1.2), tn);
      }
    };
  }

  // Finite-element mesh outside a rotating black hole with a corotating m = 2
  // mode, Re psi = R(r) cos(m phi - omega t); scrolling advances the phase.
  function BlackHoleMode() {
    var rh = 0.28, re = 0.38, Nr = 6, Nt = 28, m = 2, nodes = [], tris = [], cache = null;
    for (var i = 0; i <= Nr; i++) {
      var r = rh + (1 - rh) * Math.pow(i / Nr, 1.25), off = (i % 2) * 0.5;
      for (var j = 0; j < Nt; j++) { var th = TAU * (j + off) / Nt; nodes.push([r * Math.cos(th), r * Math.sin(th)]); }
    }
    function id(a, b) { return a * Nt + ((b % Nt) + Nt) % Nt; }
    for (i = 0; i < Nr; i++) for (j = 0; j < Nt; j++) {
      var q = i % 2 === 0
        ? [[id(i, j), id(i, j + 1), id(i + 1, j)], [id(i, j + 1), id(i + 1, j + 1), id(i + 1, j)]]
        : [[id(i, j), id(i, j + 1), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i + 1, j)]];
      q.forEach(function (tri) {
        var cx = 0, cy = 0;
        tri.forEach(function (n) { cx += nodes[n][0] / 3; cy += nodes[n][1] / 3; });
        var x = (Math.hypot(cx, cy) - rh) / (1 - rh);
        tris.push({ v: tri, phi: Math.atan2(cy, cx), amp: Math.sin(Math.PI * x) * Math.exp(-1.4 * x) / 0.547 });
      });
    }
    function paths(S) {
      var X = S / 2, Y = S / 2, R = S / 2 - 2, mesh = new Path2D();
      tris.forEach(function (tr) {
        var pa = new Path2D();
        tr.v.forEach(function (n, k) { var x = X + R * nodes[n][0], y = Y + R * nodes[n][1]; if (k) pa.lineTo(x, y); else pa.moveTo(x, y); });
        pa.closePath(); tr.p = pa; mesh.addPath(pa);
      });
      return { S: S, mesh: mesh };
    }
    return {
      draw: function (ctx, S, p) {
        if (!cache || cache.S !== S) cache = paths(S);
        var X = S / 2, Y = S / 2, R = S / 2 - 2, phase = 10 * p;
        tris.forEach(function (tr) {
          var v = tr.amp * Math.cos(m * tr.phi - phase);
          ctx.fillStyle = v > 0 ? col(C.accent, 0.78 * v) : col(C.text, 0.4 * -v);
          ctx.fill(tr.p);
        });
        ctx.lineWidth = 0.4; ctx.strokeStyle = col(C.muted, 0.45); ctx.stroke(cache.mesh);
        ctx.beginPath(); ctx.arc(X, Y, R, 0, TAU); ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.muted, 0.85); ctx.stroke();
        ctx.setLineDash([1.5, 2.5]);
        ctx.beginPath(); ctx.arc(X, Y, R * re, 0, TAU); ctx.strokeStyle = col(C.text, 0.55); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(X, Y, R * rh, 0, TAU); ctx.fillStyle = HOLE; ctx.fill();
        ctx.strokeStyle = col(C.muted, 0.9); ctx.stroke();
      }
    };
  }

  // Null geodesics of Schwarzschild (G = c = M = 1): u'' = 3u^2 - u with u = 1/r.
  // Rays with impact parameter below 3*sqrt(3) are captured; the rest are bent.
  function Lensing() {
    var view = 12, rays = [];
    function trace(b) {
      var u0 = 1 / 40, phi = Math.PI - Math.asin(b * u0), st = [u0, Math.cos(phi) / b];
      var h = -0.0025, pts = [], s = 0, prev = null, peri = false;
      for (var n = 0; n < 40000; n++) {
        var x = Math.cos(phi) / st[0], y = -Math.sin(phi) / st[0];
        if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
        pts.push([x, y, s]); prev = [x, y];
        if (st[0] >= 0.5) break;
        if (st[1] * h < 0) peri = true;                 // u now decreasing: past closest approach
        if (peri && st[0] < u0) break;
        st = rk4(st, h, function (u) { return 3 * u * u - u; });
        phi += h;
      }
      return pts;
    }
    [3.8, 5.3, 6.2, 7.8, 10.2].forEach(function (b) {
      var pts = trace(b);
      rays.push(pts);
      rays.push(pts.map(function (q) { return [q[0], -q[1], q[2]]; }));
    });
    return {
      draw: function (ctx, S, p) {
        var X = S / 2, Y = S / 2, sc = (S / 2) / view, front = 27 + 48 * p;
        ctx.setLineDash([1.5, 2.5]); ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.muted, 0.9);
        ctx.beginPath(); ctx.arc(X, Y, 3 * sc, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 1; ctx.strokeStyle = col(C.accent, 0.85); ctx.fillStyle = col(C.accent);
        rays.forEach(function (pts) {
          var n = 0;
          while (n < pts.length && pts[n][2] <= front) n++;
          if (n < 2) return;
          ctx.beginPath(); ctx.moveTo(X + sc * pts[0][0], Y + sc * pts[0][1]);
          for (var i = 1; i < n; i++) ctx.lineTo(X + sc * pts[i][0], Y + sc * pts[i][1]);
          ctx.stroke();
          if (n < pts.length) { ctx.beginPath(); ctx.arc(X + sc * pts[n - 1][0], Y + sc * pts[n - 1][1], 1.3, 0, TAU); ctx.fill(); }
        });
        ctx.beginPath(); ctx.arc(X, Y, 2 * sc, 0, TAU); ctx.fillStyle = HOLE; ctx.fill();
      }
    };
  }

  // Bao-Furuya-March, arXiv:2607.16110: three boundary regions A1, A2, A3 of size phi,
  // evenly spaced; the gaps form the purifier O (mixed state for phi < 2 pi / 3).
  // RT surfaces of every union are drawn. The centre point is
  //   phi < pi/3          in no wedge (it belongs to O): unrecoverable;
  //   pi/3 <= phi < 1.318 only EW(A1A2A3) is connected: all three regions needed;
  //   phi >= 1.318        the pairwise wedges connect too (darker cell): any two suffice,
  // reaching the pure-state ADH three-region code at phi = 2 pi / 3.
  function MixedSharing() {
    var phi0 = Math.PI / 3, phiPure = 2 * Math.PI / 3, phi1;
    (function () {
      var f = function (q) { return Math.sin(Math.PI / 3 - q / 2) * Math.sin(2 * Math.PI / 3 - q / 2) - Math.pow(Math.sin(q / 2), 2); };
      var a = 1.05, b = 2.0;
      for (var i = 0; i < 60; i++) { var m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
      phi1 = (a + b) / 2;
    })();
    function phiOf(p) { // a third of the scroll in each phase
      var k = [0.72, phi0 + 0.03, phi1 + 0.03, phiPure - 0.001], u = Math.min(2.9999, 3 * clamp01(p)), i = Math.floor(u);
      return k[i] + (k[i + 1] - k[i]) * (u - i);
    }
    return {
      draw: function (ctx, S, p) {
        var X = S / 2, Y = S / 2, R = S / 2 - 3, phi = phiOf(p), g = phiPure - phi;
        var c = [0, 1, 2].map(function (i) { return -Math.PI / 2 + i * TAU / 3; });
        var G = c.map(function (ci) { return boundaryGeodesic(ci - phi / 2, ci + phi / 2); });
        var H = c.map(function (ci, i) { return boundaryGeodesic(ci + phi / 2, c[(i + 1) % 3] - phi / 2 + (i === 2 ? TAU : 0)); });
        var K = c.map(function (ci, i) { return boundaryGeodesic(c[(i + 1) % 3] + phi / 2, ci - phi / 2 + TAU); });
        var tri = g < phi, bi = Math.sin(g / 2) * Math.sin((2 * g + phi) / 2) < Math.pow(Math.sin(phi / 2), 2);
        var disk = new Path2D(); disk.arc(X, Y, R, 0, TAU);
        ctx.fillStyle = col(C.accent, 0.18);
        if (tri) {
          ctx.save(); ctx.clip(disk); H.forEach(function (h) { clipSide(ctx, h, X, Y, R, S, false); }); ctx.fill(disk); ctx.restore();
        } else {
          G.forEach(function (gg) { ctx.save(); ctx.clip(disk); clipSide(ctx, gg, X, Y, R, S, true); ctx.fill(disk); ctx.restore(); });
        }
        if (bi) {
          ctx.fillStyle = col(C.accent, 0.26);
          ctx.save(); ctx.clip(disk);
          H.forEach(function (h) { clipSide(ctx, h, X, Y, R, S, false); });
          K.forEach(function (k) { clipSide(ctx, k, X, Y, R, S, false); });
          ctx.fill(disk); ctx.restore();
        }
        ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.muted, 0.85); ctx.stroke(disk);
        ctx.lineWidth = 1; ctx.strokeStyle = col(C.text, 0.72);
        ctx.beginPath();
        G.forEach(function (gg) { geodesicPath(ctx, gg, X, Y, R); });
        if (tri) H.forEach(function (h) { geodesicPath(ctx, h, X, Y, R); });
        if (bi) K.forEach(function (k) { geodesicPath(ctx, k, X, Y, R); });
        ctx.stroke();
        ctx.lineWidth = 2.6; ctx.strokeStyle = col(C.accent);
        c.forEach(function (ci) { ctx.beginPath(); ctx.arc(X, Y, R, ci - phi / 2, ci + phi / 2); ctx.stroke(); });
        ctx.lineWidth = 1.1; ctx.strokeStyle = col(C.text, 0.85); ctx.fillStyle = tri ? col(C.accent) : col(C.bg);
        ctx.beginPath(); ctx.arc(X, Y, 3.2, 0, TAU); ctx.fill(); ctx.stroke();
      }
    };
  }

  // Binary MERA on 16 sites: disentanglers (squares) and isometries (triangles).
  // As the interval A grows, its causal cone (green tensors) climbs the network;
  // only O(1) bonds leave the cone per layer, so S_A ~ log l.
  function MERA() {
    var n0 = 16, L = 4;
    function cone(a, b) {
      var out = [], n = n0;
      for (var t = 0; t < L; t++) {
        var lo = a, hi = b;
        if (a % 2 === 0 && a >= 2) lo = a - 1;
        if (b % 2 === 1 && b + 1 <= n - 2) hi = b + 1;
        out.push({ a: a, b: b, lo: lo, hi: hi, n: n });
        a = Math.floor(lo / 2); b = Math.floor(hi / 2); n = n / 2;
      }
      out.push({ a: a, b: b, lo: a, hi: b, n: n });
      return out;
    }
    return {
      draw: function (ctx, S, p) {
        var pad = 6, W = S - 2 * pad, top = 10, bot = S - 10, h = (bot - top) / L;
        var ell = 2 + Math.round(12 * p), a = Math.floor((n0 - ell) / 2), b = a + ell - 1, cn = cone(a, b);
        function x(t, j) { var n = n0 >> t; return pad + W * (j + 0.5) / n; }
        function y(t) { return bot - t * h; }
        var yD = function (t) { return y(t) - h * 0.3; }, yI = function (t) { return y(t) - h * 0.68; };
        for (var t = 0; t < L; t++) {
          var n = n0 >> t;
          for (var s = 0; s < n; s++) {
            var hasD = s >= 1 && s <= n - 2, d0 = s % 2 === 1 ? s : s - 1;
            var inCone = s >= cn[t].lo && s <= cn[t].hi;
            ctx.strokeStyle = inCone ? col(C.accent, 0.9) : col(C.muted, 0.45); ctx.lineWidth = inCone ? 1.1 : 0.7;
            ctx.beginPath(); ctx.moveTo(x(t, s), y(t));
            var xi = (x(t, 2 * Math.floor(s / 2)) + x(t, 2 * Math.floor(s / 2) + 1)) / 2;
            if (hasD) { var xd = (x(t, d0) + x(t, d0 + 1)) / 2; ctx.lineTo(x(t, s) + (xd - x(t, s)) * 0.35, yD(t)); }
            ctx.lineTo(xi, yI(t));
            ctx.stroke();
          }
          for (var j = 0; j < n / 2; j++) {
            var xi2 = x(t + 1, j), ic = j >= cn[t + 1].a && j <= cn[t + 1].b;
            ctx.strokeStyle = ic ? col(C.accent, 0.9) : col(C.muted, 0.45); ctx.lineWidth = ic ? 1.1 : 0.7;
            ctx.beginPath(); ctx.moveTo(xi2, yI(t)); ctx.lineTo(xi2, y(t + 1)); ctx.stroke();
          }
          for (s = 1; s + 1 <= n - 2; s += 2) {
            var xd2 = (x(t, s) + x(t, s + 1)) / 2, dc = s + 1 >= cn[t].a && s <= cn[t].b, sz = Math.min(5, W / n * 0.7);
            ctx.fillStyle = dc ? col(C.accent) : col(C.bg); ctx.strokeStyle = dc ? col(C.accent) : col(C.muted, 0.8); ctx.lineWidth = 0.8;
            ctx.fillRect(xd2 - sz / 2, yD(t) - sz / 2, sz, sz); ctx.strokeRect(xd2 - sz / 2, yD(t) - sz / 2, sz, sz);
          }
          for (j = 0; j < n / 2; j++) {
            var xc = x(t + 1, j), ic2 = j >= cn[t + 1].a && j <= cn[t + 1].b, tw = Math.min(7, W / n * 1.1), th = tw * 0.8;
            ctx.beginPath(); ctx.moveTo(xc - tw / 2, yI(t) + th / 2); ctx.lineTo(xc + tw / 2, yI(t) + th / 2); ctx.lineTo(xc, yI(t) - th / 2); ctx.closePath();
            ctx.fillStyle = ic2 ? col(C.accent) : col(C.bg); ctx.fill();
            ctx.strokeStyle = ic2 ? col(C.accent) : col(C.muted, 0.8); ctx.lineWidth = 0.8; ctx.stroke();
          }
        }
        ctx.beginPath(); ctx.arc(x(L, 0), y(L) - 3, 3.2, 0, TAU); ctx.fillStyle = col(C.muted, 0.7); ctx.fill();
        ctx.lineWidth = 2.6; ctx.strokeStyle = col(C.accent); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x(0, a) - 2, bot + 4); ctx.lineTo(x(0, b) + 2, bot + 4); ctx.stroke(); ctx.lineCap = "butt";
        ctx.fillStyle = col(C.text, 0.75);
        for (s = 0; s < n0; s++) { ctx.beginPath(); ctx.arc(x(0, s), bot, 1.3, 0, TAU); ctx.fill(); }
      }
    };
  }

  // 3D wireframe helper. Points are [x, y, z] with y up; the view yaws by psi
  // about y, then pitches by chi about x. Segments facing the viewer are drawn
  // solid, those behind faint, so the surfaces read as see-through shells.
  function View(cx, cy, psi, chi) {
    var cp = Math.cos(psi), sp = Math.sin(psi), cc = Math.cos(chi), sc = Math.sin(chi);
    return function (P) {
      var x1 = P[0] * cp + P[2] * sp, z1 = -P[0] * sp + P[2] * cp, y1 = P[1];
      var y2 = y1 * cc - z1 * sc, z2 = y1 * sc + z1 * cc;
      return [cx + x1, cy - y2, z2];
    };
  }
  // axial: surfaces of revolution about the x-axis judge front/back against the
  // axis point at the same x, not the origin, so off-centre parts shade correctly.
  function wire(ctx, lines, proj, front, back, axial) {
    var pf = new Path2D(), pb = new Path2D();
    lines.forEach(function (pts) {
      var q = pts.map(function (P) { var a = proj(P); if (axial) a[2] -= proj([P[0], 0, 0])[2]; return a; });
      for (var i = 1; i < q.length; i++) {
        var p = (q[i][2] + q[i - 1][2]) / 2 >= 0 ? pf : pb;
        p.moveTo(q[i - 1][0], q[i - 1][1]); p.lineTo(q[i][0], q[i][1]);
      }
    });
    ctx.strokeStyle = back[0]; ctx.lineWidth = back[1]; ctx.stroke(pb);
    ctx.strokeStyle = front[0]; ctx.lineWidth = front[1]; ctx.stroke(pf);
  }

  // The JT double trumpet: two asymptotic boundaries joined by a neck, a closed
  // geodesic of length b. In the spectral form factor |Z(beta + iT)|^2 it gives
  // the linear ramp between the dip and the plateau (Saad-Shenker-Stanford).
  // Scrolling advances T along the form factor (inset, log-log); the neck glows
  // while the ramp dominates, and the two halves twist against each other.
  function DoubleTrumpet() {
    function sff(T) { return 1 / (1 + Math.pow(T / 2, 3)) + 0.01 * Math.min(T / 160, 1); }
    var Tdip = 19, TH = 160;
    return {
      draw: function (ctx, S, p) {
        var L = 0.37 * S, r0 = 0.085 * S, a = L / 1.82, cy = 0.33 * S;
        var logT = 3 * p, T = Math.pow(10, logT), tw = 1.3 * Math.PI * p;
        var ramp = smooth((logT - Math.log10(Tdip) + 0.15) / 0.3) * (1 - smooth((logT - Math.log10(TH)) / 0.3));
        function r(x) { return r0 * Math.cosh(x / a); }
        var proj = View(S / 2, cy, 0.42, 0.12), rings = [], mer = [];
        for (var i = -5; i <= 5; i++) {
          var x = L * i / 5, ring = [];
          for (var k = 0; k <= 48; k++) { var th = TAU * k / 48; ring.push([x, r(x) * Math.cos(th), r(x) * Math.sin(th)]); }
          rings.push(ring);
        }
        for (var j = 0; j < 14; j++) {
          var m = [];
          for (var s = 0; s <= 50; s++) {
            var xx = -L + 2 * L * s / 50, t2 = TAU * j / 14 + tw * Math.tanh(xx / (0.3 * L));
            m.push([xx, r(xx) * Math.cos(t2), r(xx) * Math.sin(t2)]);
          }
          mer.push(m);
        }
        wire(ctx, mer.concat(rings.slice(1, -1).filter(function (_, i) { return i !== 4; })), proj, [col(C.muted, 0.75), 0.7], [col(C.muted, 0.25), 0.6], true);
        wire(ctx, [rings[0], rings[10]], proj, [col(C.accent), 1.8], [col(C.accent, 0.45), 1.2], true);
        wire(ctx, [rings[5]], proj, [col(C.accent, 0.45 + 0.55 * ramp), 1.4 + 1.2 * ramp], [col(C.accent, 0.3 + 0.4 * ramp), 1 + 0.8 * ramp], true);
        // form factor inset
        var x0 = 0.08 * S, x1 = 0.95 * S, yt = 0.68 * S, yb = 0.96 * S, lo = -3.2;
        function X(lt) { return x0 + (x1 - x0) * lt / 3; }
        function Y(v) { return yt + (yb - yt) * (Math.log10(v) / lo); }
        ctx.lineWidth = 0.8; ctx.strokeStyle = col(C.muted, 0.9);
        ctx.beginPath(); ctx.moveTo(x0, yt - 2); ctx.lineTo(x0, yb); ctx.lineTo(x1, yb); ctx.stroke();
        ctx.lineWidth = 0.9; ctx.strokeStyle = col(C.muted, 0.4); ctx.setLineDash([1.5, 2]);
        ctx.beginPath();
        for (var q = 0; q <= 90; q++) { var lt = 3 * q / 90, v = sff(Math.pow(10, lt)); if (q) ctx.lineTo(X(lt), Y(v)); else ctx.moveTo(X(lt), Y(v)); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 1.6; ctx.strokeStyle = col(C.accent);
        ctx.beginPath();
        for (q = 0; q <= 90; q++) { lt = logT * q / 90; v = sff(Math.pow(10, lt)); if (q) ctx.lineTo(X(lt), Y(v)); else ctx.moveTo(X(lt), Y(v)); }
        ctx.stroke();
        ctx.fillStyle = col(C.accent); ctx.beginPath(); ctx.arc(X(logT), Y(sff(T)), 2.2, 0, TAU); ctx.fill();
      }
    };
  }

  /* =============================================================== driver */
  var page = document.querySelector(".page");
  if (!page) return;
  // [anchor element, vertical offset, side, figure], in page order. Sides alternate
  // right, left, right, ...; the first sits just below the Research heading.
  var specs = [
    ["#research > p", 0, "right", Penrose],
    ["#research > p:last-of-type", 0, "left", Tiling],
    ["#papers", 0, "right", MixedSharing],
    ["#papers .pubs li:nth-child(2)", 0, "left", PageCurve],
    ["#papers .pubs li:nth-child(4)", 0, "right", BlackHoleMode],
    ["#teaching", 0, "left", Lensing],
    ["#teaching .plain li:nth-child(3)", 0, "right", MERA],
    ["#background", 10, "left", DoubleTrumpet]
  ];
  var figs = specs.map(function (sp) {
    var anchor = document.querySelector(sp[0]);
    if (!anchor) return null;
    var fig = document.createElement("div"), cv = document.createElement("canvas");
    fig.className = "mfig " + sp[2];
    fig.setAttribute("aria-hidden", "true");
    fig.appendChild(cv);
    page.appendChild(fig);
    return { anchor: anchor, dy: sp[1], fig: fig, cv: cv, ctx: cv.getContext("2d"), scene: sp[3](), S: 0, dpr: 0, p: -1 };
  }).filter(Boolean);

  // Each figure goes beside its anchor, but never above the previous figure (so
  // the sides keep alternating top to bottom) and never overlapping the last
  // figure on its own side, whatever the text wrapping at this width.
  function place() {
    var top = page.getBoundingClientRect().top, prev = -Infinity, sideEnd = {};
    figs.forEach(function (f) {
      var y = f.anchor.getBoundingClientRect().top - top + f.dy, side = f.fig.classList.contains("left") ? "left" : "right";
      y = Math.max(y, prev + 60, (sideEnd[side] == null ? -Infinity : sideEnd[side] + 24));
      f.fig.style.top = Math.round(y) + "px";
      prev = y;
      sideEnd[side] = y + f.fig.offsetHeight;
      f.docTop = f.fig.getBoundingClientRect().top + window.scrollY;
    });
  }
  function fit(f) {
    var S = Math.round(f.cv.getBoundingClientRect().width), dpr = window.devicePixelRatio || 1;
    if (S === f.S && dpr === f.dpr) return;
    f.S = S; f.dpr = dpr;
    f.cv.width = Math.round(S * dpr); f.cv.height = Math.round(S * dpr);
    f.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.p = -1;
  }
  function render(force) {
    if (!wide.matches) return;
    var vh = window.innerHeight;
    figs.forEach(function (f) {
      var r = f.cv.getBoundingClientRect();
      if (r.bottom < -40 || r.top > vh + 40) return;
      fit(f);
      if (!f.S) return;
      // Scroll range over which this figure is on screen, clipped to the
      // scrolling actually possible, so every figure plays from 0 to 1.
      var maxS = document.documentElement.scrollHeight - vh;
      var s0 = Math.max(0, f.docTop - vh), s1 = Math.min(maxS, f.docTop + r.height);
      var p = s1 > s0 ? clamp01((window.scrollY - s0) / (s1 - s0)) : 1;
      if (!force && Math.abs(p - f.p) < 0.0005) return;
      f.p = p;
      f.ctx.clearRect(0, 0, f.S, f.S);
      f.ctx.save(); f.scene.draw(f.ctx, f.S, p); f.ctx.restore();
    });
  }
  var queued = false;
  function schedule(force) {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; render(force); });
  }
  function relayout() { place(); schedule(true); }

  readColors();
  relayout();
  window.addEventListener("scroll", function () { schedule(false); }, { passive: true });
  window.addEventListener("resize", relayout);
  window.addEventListener("load", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  [wide, window.matchMedia("(prefers-color-scheme: dark)")].forEach(function (mq) {
    var cb = function () { readColors(); relayout(); };
    if (mq.addEventListener) mq.addEventListener("change", cb); else mq.addListener(cb);
  });
  var toggle = document.querySelector(".theme-toggle");
  if (toggle) toggle.addEventListener("click", function () { setTimeout(function () { readColors(); schedule(true); }, 0); });
})();
