/* SCP-Remote hospital map: cartoon (2.5D anime) style.

   Adds to the isometric map in scp-map.js, which calls into it only while map.anime is on:
   pastel cel-shaded buildings with violet outlines, glass windows by day, a grass island with
   flowers, trees that sway (green, pink ชมพูพันธุ์ทิพย์ and yellow ราชพฤกษ์), drifting clouds
   and their shadows, falling petals, birds, fireflies and stars at night, sunbeams indoors,
   and a little face on every computer screen: smiling when on, concentrating when in use,
   asleep when off, sweating when it has a serious problem.

   Everything here is either drawn once into the cached layer (when the view changes) or is
   cheap per-frame drawing; nothing moves for someone who asked their system for less motion. */
(function () {
    'use strict';
    var H = window.ScpHosMap;
    if (!H || !H.util) return;
    var P = H.IsoMap.prototype, U = H.util;
    var pointInPoly = U.pointInPoly, roundRectPath = U.roundRectPath;

    var INK = 'rgba(67, 45, 110, 0.55)'; // outlines are a deep violet, never black
    var INK_SOLID = '#43306e';
    var SHADOW_TONE = '#8f7cc8';

    /* ---------- colour helpers (hex in, hex out) ---------- */

    function rgbOf(hex) {
        var n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function hexOf(c) {
        return '#' + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
    }
    var mixCache = new Map();
    function mix(a, b, t) {
        var key = a + b + t.toFixed(3);
        var out = mixCache.get(key);
        if (out) return out;
        if (mixCache.size > 4000) mixCache.clear();
        var x = rgbOf(a), y = rgbOf(b);
        out = hexOf([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
        mixCache.set(key, out);
        return out;
    }
    function isHex(c) { return /^#[0-9a-f]{6}$/i.test(c || ''); }

    // Seeded random, so the trees and flowers stand in the same places every time.
    function rng(seed) {
        var s = (seed >>> 0) || 1;
        return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    }
    function segDist(px, py, a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
        var t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
        return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
    }

    /* ---------- the look of solid things ---------- */

    // Buildings keep their colour but lighter and softer.
    P._pastel = function (hex) { return isHex(hex) ? mix(hex, '#ffffff', 0.34) : hex; };

    // Cel shading: two flat tones. Faces towards the light are bright, faces away take a violet shadow.
    P._toon = function (color, light) {
        if (!isHex(color)) return color;
        if (light > 0.05) return mix(color, '#ffffff', 0.06 + 0.06 * light);
        return mix(color, SHADOW_TONE, 0.3 - 0.08 * light);
    };

    P._slabStyle = function (campus) {
        return campus
            ? { side: '#c0916a', top: this.night ? '#a9d39a' : '#c3e8ad', edge: INK }
            : { side: '#d8cfee', top: '#fbf9ff', edge: INK };
    };

    // A heavier outline round each roof, then the thin white highlight on its edge again.
    P._drawRoofTrim = function (ctx, poly, z) {
        this._polyPath(ctx, poly, z);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
    };

    /* ---------- decor: trees, flowers, clouds (campus) ---------- */

    var TREE_KINDS = [
        { lit: '#93d68b', dark: '#5ea67b', weight: 6 },               // shade tree
        { lit: '#f9b8d6', dark: '#d98ab8', weight: 3, blossom: true }, // ชมพูพันธุ์ทิพย์, the pink of Si Chomphu
        { lit: '#f7dc72', dark: '#d6ae4f', weight: 1, blossom: true }, // ราชพฤกษ์
        { lit: '#86d68c', dark: '#4f9e72', weight: 0, palm: true }     // coconut palm, along the roads
    ];
    var PALM = TREE_KINDS[3];
    var FLOWER_COLORS = ['#ffffff', '#f9a8cf', '#fde68a', '#e9d5ff'];
    var PETAL_COLORS = ['#f9a8cf', '#fbcfe8', '#ffffff', '#fde68a'];

    // Where trees and flowers can stand: on grass, clear of buildings, grounds, roads and paths.
    P._buildDecor = function () {
        var f = this.floors && this.floors.flr_campus;
        if (!f) { this._decor = null; return; }
        var self = this;
        var blocks = (this.doc.rooms || []).filter(function (r) { return r.floor_id === 'flr_campus' && self._geom.has(r); });
        var edges = (this._paths && this._paths.edges) || [];
        var clear = function (x, y, pad) {
            if (x < 4 || y < 4 || x > f.width - 4 || y > f.height - 4) return false;
            for (var i = 0; i < blocks.length; i++) {
                var b = self._geom.get(blocks[i]).b;
                if (x < b.x1 - pad || x > b.x2 + pad || y < b.y1 - pad || y > b.y2 + pad) continue;
                var poly = blocks[i].polygon;
                if (pointInPoly(x, y, poly) || pointInPoly(x + pad, y, poly) || pointInPoly(x - pad, y, poly) ||
                    pointInPoly(x, y + pad, poly) || pointInPoly(x, y - pad, poly)) return false;
            }
            for (var k = 0; k < edges.length; k++) {
                var half = edges[k].kind === 'road' ? U.ROAD_W / 2 : U.PATH_W / 2;
                if (segDist(x, y, edges[k].a, edges[k].b) < half + pad) return false;
            }
            return true;
        };
        var rand = rng(20251012);
        var weightSum = TREE_KINDS.reduce(function (s, k) { return s + k.weight; }, 0);
        var trees = [];
        for (var gy = 6; gy < f.height - 4; gy += 8.5) {
            for (var gx = 6; gx < f.width - 4; gx += 8.5) {
                var x = gx + (rand() - 0.5) * 5, y = gy + (rand() - 0.5) * 5;
                if (rand() < 0.35 || !clear(x, y, 2.6)) continue;
                var roll = rand() * weightSum, kind = TREE_KINDS[0];
                for (var t = 0; t < TREE_KINDS.length; t++) { roll -= TREE_KINDS[t].weight; if (roll <= 0) { kind = TREE_KINDS[t]; break; } }
                trees.push({ x: x, y: y, h: 2.2 + rand() * 1.4, r: 1.5 + rand() * 0.8, kind: kind, seed: rand() * 100 });
                if (trees.length >= 110) break;
            }
            if (trees.length >= 110) break;
        }
        // avenue trees on both sides of each road, palms and pink trees taking turns
        var roads = edges.filter(function (e) { return e.kind === 'road'; }), avenue = 0;
        roads.forEach(function (e) {
            var dx = (e.b.x - e.a.x) / e.len, dy = (e.b.y - e.a.y) / e.len, side = U.ROAD_W / 2 + 3;
            for (var u = 6; u < e.len - 6; u += 11) {
                [-1, 1].forEach(function (k) {
                    var x = e.a.x + dx * u - dy * side * k, y = e.a.y + dy * u + dx * side * k;
                    if (avenue >= 70 || !clear(x, y, 1.6)) return;
                    var kind = (avenue++ % 3) ? PALM : TREE_KINDS[1];
                    trees.push({ x: x, y: y, h: kind === PALM ? 4 + rand() * 1.2 : 2.6 + rand() * 0.8, r: kind === PALM ? 1.9 : 1.7 + rand() * 0.5, kind: kind, seed: rand() * 100 });
                });
            }
        });
        var flowers = [];
        for (var n = 0; n < 900 && flowers.length < 320; n++) {
            var fx = 4 + rand() * (f.width - 8), fy = 4 + rand() * (f.height - 8);
            if (!clear(fx, fy, 0.8)) continue;
            flowers.push({ x: fx, y: fy, color: FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)], tuft: rand() < 0.55 });
        }
        var clouds = [];
        for (var c = 0; c < 6; c++) {
            clouds.push({ x: rand() * f.width, y: rand() * f.height, size: 7 + rand() * 6, speed: 1.6 + rand() * 1.8, puffs: 4 + Math.floor(rand() * 3), seed: rand() * 10 });
        }
        this._decor = { trees: trees, flowers: flowers, clouds: clouds, w: f.width, h: f.height, grounds: this._buildGrounds(rand) };
        this._petals = [];
        this._birds = null;
        this._nextBirds = 6;
    };

    // Grass tufts and small flowers, drawn once into the cached layer.
    P._drawGround = function (ctx) {
        this._fx = []; // landmarks drawn in this redraw that also animate (flag, statue glow)
        if (this.floorId !== 'flr_campus' || !this._decor || this.scale < 1.2) return;
        var s = this.scale, list = this._decor.flowers;
        ctx.save();
        ctx.lineCap = 'round';
        for (var i = 0; i < list.length; i++) {
            var fl = list[i], p = this.project(fl.x, fl.y, 0.02);
            if (p[0] < -10 || p[1] < -10 || p[0] > this.w + 10 || p[1] > this.h + 10) continue;
            if (fl.tuft) {
                var t = Math.max(2, s * 0.6);
                ctx.strokeStyle = this.night ? '#6c9a73' : '#7cc47a';
                ctx.lineWidth = Math.max(0.8, s * 0.12);
                ctx.beginPath();
                ctx.moveTo(p[0] - t * 0.5, p[1]); ctx.lineTo(p[0] - t * 0.7, p[1] - t);
                ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - t * 1.2);
                ctx.moveTo(p[0] + t * 0.5, p[1]); ctx.lineTo(p[0] + t * 0.7, p[1] - t);
                ctx.stroke();
            } else {
                var r = Math.max(1, s * 0.22);
                ctx.fillStyle = fl.color;
                ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.4, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    };

    // Glass windows by day, a row per storey, with a white glint.
    P._drawDayWindows = function (ctx, rooms) {
        if (this.scale < 1.6) return;
        var self = this, c = this._c, s = this._s;
        ctx.save();
        rooms.forEach(function (r) {
            if (r.kind !== 'building' || U.LANDMARKS.test(r.id)) return;
            var g = self._geom.get(r);
            if (g.h < 1.2) return;
            var levels = g.levels || Math.max(1, Math.round(g.h / 2.6));
            var poly = r.polygon, n = poly.length, h = self._roofOf(r);
            for (var i = 0; i < n; i++) {
                var a = poly[i], b = poly[(i + 1) % n];
                var nx = (b[1] - a[1]) * g.sign, ny = -(b[0] - a[0]) * g.sign;
                var rnx = nx * c - ny * s, rny = nx * s + ny * c;
                if (rnx + rny <= 0.0001) continue;
                var light = (rny - rnx) / (Math.hypot(rnx, rny) || 1);
                var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                var cols = Math.max(1, Math.floor(len / 3.2));
                for (var lv = 0; lv < levels; lv++) {
                    var z0 = h * (lv + 0.32) / levels, z1 = h * (lv + 0.72) / levels;
                    for (var k = 0; k < cols; k++) {
                        var u0 = (k + 0.28) / cols, u1 = (k + 0.72) / cols;
                        var q0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0];
                        var q1 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
                        var p1 = self.project(q0[0], q0[1], z0), p2 = self.project(q1[0], q1[1], z0);
                        var p3 = self.project(q1[0], q1[1], z1), p4 = self.project(q0[0], q0[1], z1);
                        ctx.beginPath();
                        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
                        ctx.closePath();
                        ctx.fillStyle = light > 0.05 ? '#e3edff' : '#c4c9f0';
                        ctx.fill();
                        ctx.strokeStyle = INK;
                        ctx.lineWidth = 0.7;
                        ctx.stroke();
                        if (self.scale >= 3) {
                            // the glint: a short white stroke across the pane
                            ctx.beginPath();
                            ctx.moveTo(p1[0] + (p4[0] - p1[0]) * 0.25 + (p2[0] - p1[0]) * 0.2, p1[1] + (p4[1] - p1[1]) * 0.25 + (p2[1] - p1[1]) * 0.2);
                            ctx.lineTo(p1[0] + (p4[0] - p1[0]) * 0.75 + (p2[0] - p1[0]) * 0.45, p1[1] + (p4[1] - p1[1]) * 0.75 + (p2[1] - p1[1]) * 0.45);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                            ctx.lineWidth = 1.1;
                            ctx.stroke();
                        }
                    }
                }
            }
        });
        ctx.restore();
    };

    // Warm light early in the morning and late in the afternoon.
    P._drawSunTint = function (ctx) {
        var hr = new Date().getHours() + new Date().getMinutes() / 60;
        var tint = hr >= 16 && hr < 18.5 ? 'rgba(255, 160, 110, ' + (0.05 + 0.07 * (hr - 16) / 2.5).toFixed(3) + ')'
            : hr >= 6 && hr < 8 ? 'rgba(255, 214, 170, 0.08)' : null;
        if (!tint) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, this._layer.width, this._layer.height);
        ctx.restore();
    };

    // After each redraw of the cached layer: which trees are on screen and not hidden by a building.
    P._placeDecor = function () {
        var d = this._decor;
        if (!d || this.floorId !== 'flr_campus') { this._treeVis = null; return; }
        var vis = [], m = 60;
        for (var i = 0; i < d.trees.length; i++) {
            var t = d.trees[i], p = this.project(t.x, t.y, 0);
            if (p[0] < -m || p[0] > this.w + m || p[1] < -m || p[1] > this.h + m * 2) continue;
            if (this._occluded(t.x, t.y, 0.3) || this._occluded(t.x, t.y, t.h)) continue;
            vis.push({ tree: t, sx: p[0], sy: p[1], depth: this._depth(t.x, t.y) });
        }
        this._treeVis = vis;
    };

    // A round cartoon tree: thick outline round the whole crown, a shadow tone, a lit tone and a shine.
    P._drawTree = function (ctx, v) {
        var t = v.tree, s = this.scale;
        var stem = t.h * s * 1.5 * 0.5, r = t.r * s * 0.95;
        var x = v.sx, y = v.sy;
        var night = this.night;
        var lit = night ? mix(t.kind.lit, '#1d1645', 0.55) : t.kind.lit;
        var dark = night ? mix(t.kind.dark, '#1d1645', 0.55) : t.kind.dark;
        if (r < 2.2) {
            ctx.fillStyle = dark;
            ctx.beginPath(); ctx.arc(x, y - stem, Math.max(1.4, r), 0, Math.PI * 2); ctx.fill();
            return;
        }
        var live = this._ambientOn(), time = this._t;
        // a gust of wind rolls slowly across the campus, so neighbouring trees bend together
        var gust = live ? 0.5 + 1.1 * Math.max(0, Math.sin(time * 0.45 - t.x * 0.035 - t.y * 0.02)) : 0;
        var sway = live ? Math.sin(time * 1.6 + t.seed) * r * 0.08 * gust : 0;
        if (t.kind.palm) { this._drawPalm(ctx, v, sway, gust); return; }
        var cx = x + sway, cy = y - stem - r * 0.5;
        ctx.fillStyle = 'rgba(59, 42, 102, 0.16)';
        ctx.beginPath(); ctx.ellipse(x + r * 0.35, y + r * 0.08, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        // trunk
        ctx.fillStyle = night ? '#5a4057' : '#a8754f';
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(0.8, r * 0.07);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.14, y); ctx.lineTo(x - r * 0.1 + sway * 0.4, cy + r * 0.3);
        ctx.lineTo(x + r * 0.1 + sway * 0.4, cy + r * 0.3); ctx.lineTo(x + r * 0.14, y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        var blobs = [[-0.48, 0.12, 0.62], [0.48, 0.12, 0.62], [0, -0.32, 0.74], [0, 0.22, 0.6]];
        var wob = blobs.map(function (b, i) {
            return live ? [Math.sin(time * 2.3 + t.seed + i * 1.7) * r * 0.045 * gust, Math.cos(time * 1.9 + t.seed + i * 2.3) * r * 0.03 * gust] : [0, 0];
        });
        var circle = function (b, k, ox, oy) {
            var w = wob[blobs.indexOf(b)];
            ctx.moveTo(cx + b[0] * r + ox + w[0] + b[2] * r * k, cy + b[1] * r + oy + w[1]);
            ctx.arc(cx + b[0] * r + ox + w[0], cy + b[1] * r + oy + w[1], b[2] * r * k, 0, Math.PI * 2);
        };
        ctx.beginPath();
        blobs.forEach(function (b) { circle(b, 1, 0, 0); });
        ctx.lineWidth = Math.max(1.4, r * 0.14);
        ctx.strokeStyle = INK_SOLID;
        ctx.stroke();
        ctx.fillStyle = dark;
        ctx.fill();
        ctx.beginPath();
        blobs.forEach(function (b) { circle(b, 0.78, -r * 0.1, -r * 0.12); });
        ctx.fillStyle = lit;
        ctx.fill();
        if (t.kind.blossom && r > 5) {
            ctx.fillStyle = night ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.8)';
            for (var i = 0; i < 6; i++) {
                var a = t.seed + i * 2.1, d = r * (0.25 + (i % 3) * 0.2);
                ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy - r * 0.1 + Math.sin(a) * d * 0.8, Math.max(0.8, r * 0.07), 0, Math.PI * 2); ctx.fill();
            }
        }
        if (!night) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.55, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
        }
    };

    // A coconut palm: a curved trunk and fronds that flutter at their tips.
    P._drawPalm = function (ctx, v, sway, gust) {
        var t = v.tree, s = this.scale, x = v.sx, y = v.sy, night = this.night;
        var H = t.h * s * 1.5, r = t.r * s;
        var tx = x + r * 0.35 + sway * 1.6, ty = y - H;
        ctx.fillStyle = 'rgba(59, 42, 102, 0.14)';
        ctx.beginPath(); ctx.ellipse(x + r * 0.6, y + r * 0.1, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK_SOLID;
        ctx.lineWidth = Math.max(2.2, r * 0.3);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - r * 0.15, y - H * 0.55, tx, ty); ctx.stroke();
        ctx.strokeStyle = night ? '#6b5560' : '#c9a079';
        ctx.lineWidth = Math.max(1.2, r * 0.2);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - r * 0.15, y - H * 0.55, tx, ty); ctx.stroke();
        var live = this._ambientOn(), time = this._t;
        var lit = night ? mix(PALM.lit, '#1d1645', 0.55) : PALM.lit, dark = night ? mix(PALM.dark, '#1d1645', 0.55) : PALM.dark;
        for (var pass = 0; pass < 2; pass++) {
            for (var i = 0; i < 7; i++) {
                var a = -Math.PI / 2 + (i - 3) * 0.55 + (i > 3 ? 0.25 : -0.25);
                var flap = live ? Math.sin(time * 3 + t.seed + i) * 0.12 * gust : 0;
                var len = r * (1.7 + (i % 2) * 0.3), droop = len * 0.55;
                var ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.55 + droop * (0.6 + flap);
                var mx = tx + Math.cos(a) * len * 0.5, my = ty + Math.sin(a) * len * 0.5 - len * 0.12;
                ctx.strokeStyle = pass ? (i % 2 ? lit : dark) : INK_SOLID;
                ctx.lineWidth = pass ? Math.max(1.6, r * 0.32) : Math.max(2.6, r * 0.46);
                ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
            }
        }
        ctx.fillStyle = '#8a5a3c';
        ctx.beginPath(); ctx.arc(tx - r * 0.12, ty + r * 0.15, Math.max(1, r * 0.13), 0, Math.PI * 2); ctx.arc(tx + r * 0.12, ty + r * 0.17, Math.max(1, r * 0.13), 0, Math.PI * 2); ctx.fill();
    };

    /* ---------- moving things ---------- */

    // Patients waiting in a floor plan's waiting areas: a few per area, more when the area is bigger.
    P._buildIndoor = function () {
        var self = this, people = [];
        var rand = rng(U.stableIndex(this.floorId) || 3);
        (this._floorRooms || []).forEach(function (r) {
            if (r.kind !== 'waiting') return;
            var b = self._geom.get(r).b, area = (b.x2 - b.x1) * (b.y2 - b.y1);
            var n = Math.max(1, Math.min(7, Math.round(area / 40)));
            for (var i = 0; i < n; i++) {
                var spot = self._spotIn(r, rand);
                if (!spot) continue;
                people.push({ room: r, x: spot[0], y: spot[1], tx: spot[0], ty: spot[1], wait: rand() * 6, phase: rand() * 6,
                    speed: 0.9 + rand() * 0.6, path: null, role: rand() < 0.15 ? 'nurse' : (rand() < 0.2 ? 'kid' : 'visitor'),
                    hair: HAIR[Math.floor(rand() * HAIR.length)], color: rand() < 0.5 ? '#f9a8cf' : '#c4b5fd' });
            }
        });
        this._indoor = { floor: this.floorId, people: people };
    };

    P._spotIn = function (r, rand) {
        var b = this._geom.get(r).b;
        for (var k = 0; k < 12; k++) {
            var x = b.x1 + 0.8 + rand() * Math.max(0.1, b.x2 - b.x1 - 1.6), y = b.y1 + 0.8 + rand() * Math.max(0.1, b.y2 - b.y1 - 1.6);
            if (pointInPoly(x, y, r.polygon)) return [x, y];
        }
        return null;
    };

    P._stepIndoor = function (dt) {
        if (!this._indoor || this._indoor.floor !== this.floorId) this._buildIndoor();
        var list = this._indoor.people;
        for (var i = 0; i < list.length; i++) {
            var pp = list[i];
            pp.phase += dt * (pp.path ? 9 : 2);
            if (!pp.path) {
                if ((pp.wait -= dt) > 0) continue;
                var spot = this._spotIn(pp.room, Math.random);
                if (!spot) { pp.wait = 3; continue; }
                pp.tx = spot[0]; pp.ty = spot[1]; pp.path = true;
                continue;
            }
            var dx = pp.tx - pp.x, dy = pp.ty - pp.y, dd = Math.hypot(dx, dy), step = pp.speed * dt;
            if (dd <= step) { pp.x = pp.tx; pp.y = pp.ty; pp.path = null; pp.wait = 4 + Math.random() * 9; }
            else { pp.x += dx / dd * step; pp.y += dy / dd * step; }
        }
    };

    P._drawIndoor = function (ctx) {
        if (!this._indoor || this._indoor.floor !== this.floorId) return;
        var self = this;
        this._indoor.people.slice().sort(function (a, b) { return self._depth(a.x, a.y) - self._depth(b.x, b.y); })
            .forEach(function (pp) { self._drawChibi(ctx, pp, { x: pp.x, y: pp.y }); });
    };

    P._stepAmbient = function (dt) {
        if (this.floorId !== 'flr_campus') { this._stepIndoor(dt); return; }
        var d = this._decor;
        if (!d) return;
        this._stepPlayers(dt);
        d.clouds.forEach(function (c) {
            c.x += c.speed * dt;
            c.y += c.speed * dt * 0.35;
            if (c.x > d.w + 40) c.x = -40;
            if (c.y > d.h + 40) c.y = -40;
        });
        if (this.night) return;
        // petals from the pink trees, blown across the screen
        var petals = this._petals || (this._petals = []);
        var want = this.w > 0 ? Math.min(26, Math.round(this.w / 50)) : 0;
        for (var i = 0; i < petals.length; i++) {
            var p = petals[i];
            p.t += dt;
            p.x += (p.vx + Math.sin(p.t * 1.8 + p.seed) * 14) * dt;
            p.y += p.vy * dt;
            p.rot += p.spin * dt;
            if (p.x > this.w + 20 || p.y > this.h + 20) { petals.splice(i, 1); i--; }
        }
        // now and then a leaf or blossom blows off a tree in a gust
        var vis = this._treeVis;
        if (vis && vis.length && petals.length < want + 14 && Math.random() < dt * 3) {
            var src = vis[Math.floor(Math.random() * vis.length)], tr = src.tree;
            if (!tr.kind.palm) {
                petals.push({ x: src.sx, y: src.sy - tr.h * this.scale * 1.5 * 0.6, vx: 12 + Math.random() * 14, vy: 8 + Math.random() * 10, t: 0,
                    seed: Math.random() * 6, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 5, size: 1.8 + Math.random() * 1.4, color: tr.kind.lit, life: 3 + Math.random() * 2 });
            }
        }
        for (var q = 0; q < petals.length; q++) if (petals[q].life && petals[q].t > petals[q].life) { petals.splice(q, 1); q--; }
        while (petals.length < want) {
            var fromTop = Math.random() < 0.7;
            petals.push({
                x: fromTop ? Math.random() * this.w * 0.9 - this.w * 0.1 : -10,
                y: fromTop ? -10 - Math.random() * 40 : Math.random() * this.h * 0.6,
                vx: 16 + Math.random() * 22, vy: 18 + Math.random() * 20, t: 0, seed: Math.random() * 6,
                rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4, size: 2.2 + Math.random() * 1.8,
                color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)]
            });
        }
        // now and then a few birds cross the sky
        if (this._birds) {
            var gone = true;
            this._birds.forEach(function (b) { b.x += b.vx * dt; b.flap += dt * 9; if (b.x < 0 || b.x < b.limit) gone = false; });
            if (gone) this._birds = null;
        } else if ((this._nextBirds -= dt) <= 0) {
            this._nextBirds = 18 + Math.random() * 20;
            var n = 3 + Math.floor(Math.random() * 3), y0 = this.h * (0.08 + Math.random() * 0.3), list = [];
            for (var k = 0; k < n; k++) list.push({ x: -30 - k * 18, y: y0 + (k % 2 ? 1 : -1) * k * 7, vx: 60 + Math.random() * 10, flap: Math.random() * 6, limit: this.w + 40 });
            this._birds = list;
        }
    };

    // Under the computers and people: cloud shadows on the ground, and stars behind the island at night.
    P._drawAmbientUnder = function (ctx) {
        var d = this._decor;
        if (this.night) { this._drawStars(ctx); }
        if (this.floorId !== 'flr_campus') {
            if (!this._indoor || this._indoor.floor !== this.floorId) this._buildIndoor();
            this._drawIndoor(ctx);
            return;
        }
        if (!d || this.floorId !== 'flr_campus' || this.night) return;
        ctx.save();
        ctx.fillStyle = 'rgba(59, 42, 102, 0.045)';
        var s = this.scale;
        for (var i = 0; i < d.clouds.length; i++) {
            var c = d.clouds[i], p = this.project(c.x + 8, c.y + 8, 0);
            ctx.beginPath();
            ctx.ellipse(p[0], p[1], c.size * s * 0.9, c.size * s * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    };

    P._drawStars = function (ctx) {
        var stars = this._stars;
        if (!stars || stars.w !== this.w || stars.h !== this.h) {
            var rand = rng(7), list = [];
            for (var i = 0; i < 90; i++) list.push({ x: rand() * this.w, y: rand() * this.h * 0.75, r: 0.5 + rand() * 1.2, ph: rand() * 6 });
            stars = this._stars = { w: this.w, h: this.h, list: list };
        }
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over'; // only where the island is not
        var t = this._t;
        for (var k = 0; k < stars.list.length; k++) {
            var st = stars.list[k], a = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9 + st.ph));
            ctx.fillStyle = 'rgba(255, 250, 225, ' + a.toFixed(2) + ')';
            ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    };

    // Over everything but the name labels: fireflies, clouds, birds, petals; sunbeams indoors.
    P._drawAmbientOver = function (ctx) {
        if (this.floorId !== 'flr_campus') { if (!this.night) this._drawSunbeams(ctx); return; }
        var d = this._decor;
        if (!d) return;
        var t = this._t, s = this.scale, i;
        if (this.night && this._treeVis) {
            // fireflies round the trees
            ctx.save();
            for (i = 0; i < this._treeVis.length && i < 40; i += 2) {
                var tr = this._treeVis[i].tree;
                var fx = tr.x + Math.sin(t * 0.6 + tr.seed) * 2.6, fy = tr.y + Math.cos(t * 0.8 + tr.seed * 1.3) * 2.6;
                var p = this.project(fx, fy, 1 + Math.sin(t * 1.1 + tr.seed) * 0.6);
                var glow = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.3 + tr.seed * 3));
                ctx.fillStyle = 'rgba(253, 246, 160, ' + (0.18 * glow).toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(254, 249, 195, ' + glow.toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        // Clouds float high over the island and thin out as you zoom in, so they never hide work.
        var fade = Math.max(0, Math.min(1, (1.35 - s / (this._fitScale || s)) / 0.35));
        if (fade > 0.02) {
            ctx.save();
            ctx.globalAlpha = (this.night ? 0.3 : 0.55) * fade;
            for (i = 0; i < d.clouds.length; i++) {
                var c = d.clouds[i], cp = this.project(c.x, c.y, 26), R = c.size * s * 0.55;
                var puffs = [];
                for (var k = 0; k < c.puffs; k++) {
                    var u = k / (c.puffs - 1) - 0.5;
                    puffs.push([cp[0] + u * R * 2.6, cp[1] - Math.cos(u * Math.PI) * R * 0.45, R * (0.55 + 0.4 * Math.cos(u * Math.PI))]);
                }
                ctx.beginPath();
                puffs.forEach(function (q) { ctx.moveTo(q[0] + q[2], q[1] + q[2] * 0.25); ctx.arc(q[0], q[1] + q[2] * 0.25, q[2], 0, Math.PI * 2); });
                ctx.fillStyle = this.night ? '#3b3466' : '#dcd3f7';
                ctx.fill();
                ctx.beginPath();
                puffs.forEach(function (q) { ctx.moveTo(q[0] + q[2] * 0.92, q[1]); ctx.arc(q[0], q[1], q[2] * 0.92, 0, Math.PI * 2); });
                ctx.fillStyle = this.night ? '#4c4580' : '#ffffff';
                ctx.fill();
            }
            ctx.restore();
        }
        if (this.night) return;
        if (this._birds) {
            ctx.save();
            ctx.strokeStyle = INK_SOLID;
            ctx.lineWidth = 1.6;
            ctx.lineCap = 'round';
            this._birds.forEach(function (b) {
                var y = b.y + Math.sin(b.x / 40) * 4, w = 6, lift = Math.sin(b.flap) * 4;
                ctx.beginPath();
                ctx.moveTo(b.x - w, y - lift); ctx.quadraticCurveTo(b.x - w * 0.4, y - 2 - lift * 0.3, b.x, y);
                ctx.quadraticCurveTo(b.x + w * 0.4, y - 2 - lift * 0.3, b.x + w, y - lift);
                ctx.stroke();
            });
            ctx.restore();
        }
        var petals = this._petals || [];
        ctx.save();
        for (i = 0; i < petals.length; i++) {
            var pt = petals[i];
            ctx.setTransform(this.dpr, 0, 0, this.dpr, pt.x * this.dpr, pt.y * this.dpr);
            ctx.rotate(pt.rot);
            ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(pt.t * 3 + pt.seed))); // fluttering
            ctx.fillStyle = pt.color;
            ctx.beginPath(); ctx.ellipse(0, 0, pt.size, pt.size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(217, 138, 184, 0.6)';
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }
        ctx.restore();
    };

    // Indoors by day: slow diagonal shafts of light across the floor plan.
    P._drawSunbeams = function (ctx) {
        var t = this._t, w = this.w, h = this.h;
        ctx.save();
        for (var i = 0; i < 3; i++) {
            var x = ((i * 0.37 + t * 0.012) % 1.4 - 0.2) * w, bw = w * (0.08 + i * 0.03);
            var g = ctx.createLinearGradient(x, 0, x + bw, 0);
            g.addColorStop(0, 'rgba(255, 244, 214, 0)');
            g.addColorStop(0.5, 'rgba(255, 244, 214, 0.13)');
            g.addColorStop(1, 'rgba(255, 244, 214, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x + bw, 0); ctx.lineTo(x + bw - h * 0.5, h); ctx.lineTo(x - h * 0.5, h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    };

    /* ---------- faces on the computer screens ---------- */

    P._drawFaces = function (ctx) {
        var faces = this._faces;
        if (!faces || !faces.length) return;
        var t = this._ambientOn() ? this._t : 0;
        ctx.save();
        var base = ctx.getTransform();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (var i = 0; i < faces.length; i++) {
            var f = faces[i], ph = (f.seed % 1000) / 159;
            // drawn about (0, 0) at the desk's own scale
            ctx.setTransform(base.a * f.k, 0, 0, base.d * f.k, base.e + f.x * base.a, base.f + f.y * base.d);
            var x = 0, y = 0;
            if (!f.online) {
                // asleep: closed eyes, and z's floating up
                ctx.strokeStyle = '#cfc6f2';
                ctx.lineWidth = 1.1;
                ctx.beginPath();
                ctx.moveTo(x - 4.6, y - 1); ctx.quadraticCurveTo(x - 3, y + 0.2, x - 1.4, y - 1);
                ctx.moveTo(x + 1.4, y - 1); ctx.quadraticCurveTo(x + 3, y + 0.2, x + 4.6, y - 1);
                ctx.stroke();
                if (t) {
                    ctx.font = '700 7px sans-serif';
                    ctx.textAlign = 'center';
                    for (var z = 0; z < 2; z++) {
                        var q = (t * 0.45 + ph + z * 0.5) % 1;
                        ctx.fillStyle = 'rgba(167, 139, 250, ' + Math.sin(q * Math.PI).toFixed(2) + ')';
                        ctx.fillText('z', x + 12 + q * 5, y - 1 - q * 9);
                    }
                }
            } else if (f.busy) {
                // in use: eyes glancing across the screen, a small determined mouth
                var look = Math.sin(t * 1.6 + ph) * 0.9;
                ctx.fillStyle = INK_SOLID;
                ctx.beginPath();
                ctx.arc(x - 2.8 + look, y - 1, 1.15, 0, Math.PI * 2);
                ctx.arc(x + 2.8 + look, y - 1, 1.15, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = INK_SOLID;
                ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.moveTo(x - 1.2, y + 2.2); ctx.lineTo(x + 1.2, y + 2.2); ctx.stroke();
                if (t) {
                    // typing dots in a little bubble
                    var bx = x + 15, by = y - 1; // beside the screen, clear of the name label
                    roundRectPath(ctx, bx - 6, by - 3.5, 12, 7, 3.5);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.strokeStyle = INK;
                    ctx.lineWidth = 0.7;
                    ctx.stroke();
                    for (var k = 0; k < 3; k++) {
                        var hop = Math.max(0, Math.sin(t * 6 + ph - k * 0.9)) * 1.4;
                        ctx.fillStyle = '#b02a72';
                        ctx.beginPath(); ctx.arc(bx - 3 + k * 3, by - hop, 0.9, 0, Math.PI * 2); ctx.fill();
                    }
                }
            } else {
                // on and free: happy eyes that blink now and then, rosy cheeks, a smile
                var blink = t && ((t + ph * 3) % 4.3) < 0.14;
                ctx.strokeStyle = INK_SOLID;
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (blink) {
                    ctx.moveTo(x - 4.4, y - 0.8); ctx.lineTo(x - 1.6, y - 0.8);
                    ctx.moveTo(x + 1.6, y - 0.8); ctx.lineTo(x + 4.4, y - 0.8);
                } else {
                    ctx.moveTo(x - 4.4, y - 0.2); ctx.lineTo(x - 3, y - 1.8); ctx.lineTo(x - 1.6, y - 0.2);
                    ctx.moveTo(x + 1.6, y - 0.2); ctx.lineTo(x + 3, y - 1.8); ctx.lineTo(x + 4.4, y - 0.2);
                }
                ctx.moveTo(x - 1.5, y + 1.6); ctx.quadraticCurveTo(x, y + 3.2, x + 1.5, y + 1.6);
                ctx.stroke();
                ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
                ctx.beginPath();
                ctx.ellipse(x - 5, y + 1.4, 1.4, 0.8, 0, 0, Math.PI * 2);
                ctx.ellipse(x + 5, y + 1.4, 1.4, 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (f.risk === 'high') {
                // a worried sweat drop sliding down the side of the screen
                var sd = t ? (t * 0.7 + ph) % 1 : 0.3;
                var dx = x + 7.5, dy = y - 4 + sd * 6;
                ctx.globalAlpha = t ? Math.min(1, (1 - sd) * 2) : 1;
                ctx.fillStyle = '#a5c8f5';
                ctx.strokeStyle = INK;
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(dx, dy - 3);
                ctx.quadraticCurveTo(dx + 2.2, dy, dx, dy + 1.6);
                ctx.quadraticCurveTo(dx - 2.2, dy, dx, dy - 3);
                ctx.fill(); ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
        ctx.restore();
    };

    /* ---------- chibi people ---------- */

    var HAIR = ['#3b2a2a', '#2d2440', '#6b4430', '#c98c52', '#1f1b2e'];
    var ROLES = ['nurse', 'nurse', 'doctor', 'visitor', 'visitor', 'visitor', 'kid'];

    P._drawChibi = function (ctx, ag, pos) {
        if (!ag.role) {
            ag.role = ROLES[Math.floor(Math.random() * ROLES.length)];
            ag.hair = HAIR[Math.floor(Math.random() * HAIR.length)];
        }
        var p = this.project(pos.x, pos.y, 0);
        var Hh = Math.max(7, Math.min(24, this.scale * 2.5)) * (ag.role === 'kid' ? 0.78 : 1);
        var moving = !!ag.path;
        var bob = moving ? Math.abs(Math.sin(ag.phase)) * Hh * 0.08 : 0;
        var x = p[0], y = p[1] - bob;
        var body = ag.role === 'nurse' || ag.role === 'doctor' ? '#ffffff' : mix(isHex(ag.color) ? ag.color : '#f9a8cf', '#ffffff', 0.15);
        ctx.fillStyle = 'rgba(59, 42, 102, 0.2)';
        ctx.beginPath(); ctx.ellipse(p[0], p[1], Hh * 0.3, Hh * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (Hh >= 10) {
            var swing = moving ? Math.sin(ag.phase) * Hh * 0.13 : 0;
            ctx.strokeStyle = INK_SOLID;
            ctx.lineWidth = Math.max(1.4, Hh * 0.1);
            ctx.beginPath();
            ctx.moveTo(x - Hh * 0.08, y - Hh * 0.3); ctx.lineTo(x - Hh * 0.08 + swing, y);
            ctx.moveTo(x + Hh * 0.08, y - Hh * 0.3); ctx.lineTo(x + Hh * 0.08 - swing, y);
            ctx.stroke();
        }
        // body
        roundRectPath(ctx, x - Hh * 0.2, y - Hh * 0.66, Hh * 0.4, Hh * 0.42, Hh * 0.14);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(0.8, Hh * 0.05);
        ctx.stroke();
        if (ag.role === 'doctor') {
            ctx.fillStyle = '#9db8f0';
            ctx.fillRect(x - Hh * 0.05, y - Hh * 0.64, Hh * 0.1, Hh * 0.38);
        }
        if (Hh >= 10) {
            // arms swinging opposite the legs
            var arm = moving ? Math.sin(ag.phase) * Hh * 0.1 : 0;
            ctx.strokeStyle = body === '#ffffff' ? '#e9e3f7' : body;
            ctx.lineWidth = Math.max(1.4, Hh * 0.09);
            ctx.beginPath();
            ctx.moveTo(x - Hh * 0.2, y - Hh * 0.6); ctx.lineTo(x - Hh * 0.26 - arm, y - Hh * 0.36);
            ctx.moveTo(x + Hh * 0.2, y - Hh * 0.6); ctx.lineTo(x + Hh * 0.26 + arm, y - Hh * 0.36);
            ctx.stroke();
        }
        // a big round head
        var hr = Hh * 0.27, hy = y - Hh * 0.66 - hr * 0.85;
        ctx.beginPath(); ctx.arc(x, hy, hr, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe1cc';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(0.8, Hh * 0.05);
        ctx.stroke();
        // hair cap
        ctx.beginPath();
        ctx.arc(x, hy - hr * 0.08, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98);
        ctx.quadraticCurveTo(x + hr * 0.4, hy - hr * 0.2, x, hy - hr * 0.35);
        ctx.quadraticCurveTo(x - hr * 0.5, hy - hr * 0.1, x - hr * 1.0, hy);
        ctx.fillStyle = ag.hair;
        ctx.fill();
        if (ag.role === 'nurse') {
            ctx.fillStyle = '#f9a8cf';
            ctx.fillRect(x - hr * 0.45, hy - hr * 1.25, hr * 0.9, hr * 0.32);
        }
        if (Hh >= 12) {
            ctx.fillStyle = INK_SOLID;
            ctx.beginPath();
            ctx.arc(x - hr * 0.35, hy + hr * 0.15, Math.max(0.8, hr * 0.12), 0, Math.PI * 2);
            ctx.arc(x + hr * 0.35, hy + hr * 0.15, Math.max(0.8, hr * 0.12), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(244, 114, 182, 0.5)';
            ctx.beginPath();
            ctx.ellipse(x - hr * 0.6, hy + hr * 0.45, hr * 0.18, hr * 0.1, 0, 0, Math.PI * 2);
            ctx.ellipse(x + hr * 0.6, hy + hr * 0.45, hr * 0.18, hr * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    /* ---------- car parks, sports grounds and landmarks (campus) ---------- */

    var CAR_PAINT = ['#f9a8cf', '#c4b5fd', '#fde68a', '#ffffff', '#fca5a5', '#a5b4fc', '#d9d4ea', '#fbcfe8'];
    var TEAM = ['#f472b6', '#a5b4fc'];

    function quad(cx, cy, l, w, dx, dy) {
        var hx = dx * l / 2, hy = dy * l / 2, wx = -dy * w / 2, wy = dx * w / 2;
        return [[cx - hx - wx, cy - hy - wy], [cx + hx - wx, cy + hy - wy], [cx + hx + wx, cy + hy + wy], [cx - hx + wx, cy - hy + wy]];
    }
    function rectPoly(x1, y1, x2, y2) { return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]; }
    function ringPoly(cx, cy, r, from, to, n) {
        var out = [];
        for (var i = 0; i <= n; i++) { var a = from + (to - from) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        return out;
    }

    // Bays and parked cars for each car park; players for the pitch and the court.
    P._buildGrounds = function (rand) {
        var self = this, parking = {}, players = [], balls = [];
        (this._campusBuildings || []).forEach(function (r) {
            var g = self._geom.get(r), b = g.b;
            if (/^c_park/.test(r.id)) {
                var rows = [], cars = [];
                // back-to-back rows of bays 5 deep, then a 6-wide aisle, along the lot
                var y = b.y1 + 1.5;
                while (y + 5 <= b.y2 - 1) {
                    rows.push(y);
                    for (var x = b.x1 + 1.5; x + 2.7 <= b.x2 - 1; x += 2.7) {
                        if (rand() < 0.42 && pointInPoly(x + 1.35, y + 2.5, r.polygon)) {
                            cars.push({ x: x + 1.35, y: y + 2.5, color: CAR_PAINT[Math.floor(rand() * CAR_PAINT.length)], flip: rand() < 0.5 });
                        }
                    }
                    y += rows.length % 2 ? 5 : 11;
                }
                parking[r.id] = { rows: rows, cars: cars };
            } else if (r.id === 'c_field' || r.id === 'c_court') {
                var court = r.id === 'c_court', n = court ? 4 : 10;
                var ball = { room: r, x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2, to: null, speed: court ? 7 : 11, court: court, z: 0 };
                for (var i = 0; i < n; i++) {
                    var team = i % 2, hx = b.x1 + 3 + rand() * (b.x2 - b.x1 - 6), hy = b.y1 + 3 + rand() * (b.y2 - b.y1 - 6);
                    players.push({ room: r, ball: ball, hx: hx, hy: hy, x: hx, y: hy, tx: hx, ty: hy, speed: 2.2 + rand() * 1.6, phase: rand() * 6,
                        path: null, role: 'player', color: TEAM[team], hair: HAIR[Math.floor(rand() * HAIR.length)], think: rand() * 2 });
                }
                ball.to = players[players.length - 1];
                balls.push(ball);
            }
        });
        return { parking: parking, players: players, balls: balls };
    };

    P._drawGroundDetail = function (ctx, r, g) {
        if (/^c_park/.test(r.id)) this._drawParking(ctx, r, g);
        else if (r.id === 'c_field') this._drawPitch(ctx, r, g);
        else if (r.id === 'c_court') this._drawCourt(ctx, r, g);
    };

    P._line = function (ctx, pts, z, close) {
        ctx.beginPath();
        for (var i = 0; i < pts.length; i++) {
            var p = this.project(pts[i][0], pts[i][1], z);
            if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        }
        if (close) ctx.closePath();
        ctx.stroke();
    };

    P._drawParking = function (ctx, r, g) {
        var lot = this._decor && this._decor.grounds && this._decor.grounds.parking[r.id];
        if (!lot) return;
        var b = g.b, z = g.h + 0.01, s = this.scale, self = this;
        this._polyPath(ctx, r.polygon, z);
        ctx.fillStyle = this.night ? '#4b4766' : '#aaa6bd'; // pastel asphalt
        ctx.fill();
        ctx.strokeStyle = '#efeaf8';
        ctx.lineWidth = Math.max(1, s * 0.35);
        ctx.stroke();
        if (s >= 0.9) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = Math.max(0.6, s * 0.12);
            lot.rows.forEach(function (y) {
                self._line(ctx, [[b.x1 + 1.5, y], [b.x2 - 1, y]], z);
                for (var x = b.x1 + 1.5; x <= b.x2 - 1; x += 2.7) self._line(ctx, [[x, y], [x, y + 5]], z);
            });
        }
        // parked cars, far ones first
        var cars = lot.cars.slice().sort(function (a, c) { return self._depth(a.x, a.y) - self._depth(c.x, c.y); });
        cars.forEach(function (c) {
            var dir = c.flip ? -1 : 1;
            if (s < 2.2) {
                self._polyPath(ctx, quad(c.x, c.y, 4, 1.9, 0, 1), z + 0.02);
                ctx.fillStyle = c.color;
                ctx.fill();
                return;
            }
            var body = quad(c.x, c.y, 4, 1.9, 0, dir), sign = U.signedArea(body) >= 0 ? 1 : -1;
            self._polyPath(ctx, quad(c.x + 0.25, c.y, 4.3, 2.2, 0, 1), z + 0.02);
            ctx.fillStyle = 'rgba(59, 42, 102, 0.2)';
            ctx.fill();
            self._drawPrism(ctx, body, sign, z + 0.2, z + 1, c.color, { top: mix(c.color, '#ffffff', 0.25), edge: INK });
            var cab = quad(c.x, c.y + dir * 0.35, 2, 1.65, 0, dir);
            self._drawPrism(ctx, cab, sign, z + 1, z + 1.6, '#dfe8ff', { top: mix(c.color, '#ffffff', 0.4), edge: INK });
        });
        // the blue P sign on a post at the front corner
        var corner = [b.x2 - 1.2, b.y2 - 1.2], foot = this.project(corner[0], corner[1], z), top = this.project(corner[0], corner[1], z + 3.2);
        ctx.strokeStyle = '#e5e1ef';
        ctx.lineWidth = Math.max(1.2, s * 0.22);
        ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
        var sz = Math.max(9, Math.min(28, s * 2.4));
        roundRectPath(ctx, top[0] - sz / 2, top[1] - sz, sz, sz, sz * 0.2);
        ctx.fillStyle = '#5b6fd8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, sz * 0.08);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 ' + Math.round(sz * 0.72) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', top[0], top[1] - sz / 2 + 0.5);
    };

    P._drawPitch = function (ctx, r, g) {
        var b = g.b, z = g.h + 0.01, s = this.scale, self = this;
        var w = b.x2 - b.x1, n = 10;
        // mown stripes
        for (var i = 0; i < n; i++) {
            this._polyPath(ctx, rectPoly(b.x1 + w * i / n, b.y1, b.x1 + w * (i + 1) / n, b.y2), z);
            ctx.fillStyle = this.night ? (i % 2 ? '#5d8a63' : '#557f5c') : (i % 2 ? '#a6dd90' : '#93d07f');
            ctx.fill();
        }
        if (s < 0.8) return;
        var x1 = b.x1 + 2, x2 = b.x2 - 2, y1 = b.y1 + 2, y2 = b.y2 - 2, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = Math.max(0.8, s * 0.18);
        this._line(ctx, rectPoly(x1, y1, x2, y2), z, true);
        this._line(ctx, [[cx, y1], [cx, y2]], z);
        this._line(ctx, ringPoly(cx, cy, 5, 0, Math.PI * 2, 28), z, true);
        [[x1, 1], [x2, -1]].forEach(function (end) {
            var ex = end[0], d = end[1];
            self._line(ctx, [[ex, cy - 11], [ex + d * 9, cy - 11], [ex + d * 9, cy + 11], [ex, cy + 11]], z);
            self._line(ctx, [[ex, cy - 5], [ex + d * 3, cy - 5], [ex + d * 3, cy + 5], [ex, cy + 5]], z);
            // goal: two posts, a crossbar and a hint of net
            var gp = [[ex, cy - 3.6], [ex, cy + 3.6]].map(function (q) { return [self.project(q[0], q[1], z), self.project(q[0], q[1], z + 1.8), self.project(q[0] - d * 1.2, q[1], z)]; });
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = Math.max(0.5, s * 0.06);
            ctx.beginPath();
            gp.forEach(function (q) { ctx.moveTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); });
            ctx.moveTo(gp[0][2][0], gp[0][2][1]); ctx.lineTo(gp[1][2][0], gp[1][2][1]);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, s * 0.22);
            ctx.beginPath();
            ctx.moveTo(gp[0][0][0], gp[0][0][1]); ctx.lineTo(gp[0][1][0], gp[0][1][1]);
            ctx.lineTo(gp[1][1][0], gp[1][1][1]); ctx.lineTo(gp[1][0][0], gp[1][0][1]);
            ctx.stroke();
            ctx.restore();
        });
    };

    P._drawCourt = function (ctx, r, g) {
        var b = g.b, z = g.h + 0.01, s = this.scale, self = this;
        this._polyPath(ctx, r.polygon, z);
        ctx.fillStyle = this.night ? '#7a5a63' : '#f2b38f';
        ctx.fill();
        var x1 = b.x1 + 1.5, x2 = b.x2 - 1.5, y1 = b.y1 + 1.5, y2 = b.y2 - 1.5, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        this._polyPath(ctx, rectPoly(x1, y1, x2, y2), z);
        ctx.fillStyle = this.night ? '#6c4f62' : '#e6967a';
        ctx.fill();
        if (s < 0.8) return;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = Math.max(0.8, s * 0.15);
        this._line(ctx, rectPoly(x1, y1, x2, y2), z, true);
        this._line(ctx, [[x1, cy], [x2, cy]], z);
        this._line(ctx, ringPoly(cx, cy, 2.2, 0, Math.PI * 2, 20), z, true);
        [[y1, 1], [y2, -1]].forEach(function (end) {
            var ey = end[0], d = end[1];
            self._line(ctx, [[cx - 2.4, ey], [cx - 2.4, ey + d * 5.5], [cx + 2.4, ey + d * 5.5], [cx + 2.4, ey]], z);
            self._line(ctx, ringPoly(cx, ey + d * 5.5, 2.4, d > 0 ? 0 : Math.PI, d > 0 ? Math.PI : Math.PI * 2, 12), z);
            // hoop: post, board and orange rim
            var foot = self.project(cx, ey - d * 0.6, z), top = self.project(cx, ey - d * 0.6, z + 3.4), rim = self.project(cx, ey + d * 0.8, z + 3);
            ctx.save();
            ctx.strokeStyle = '#6b6488';
            ctx.lineWidth = Math.max(1, s * 0.2);
            ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
            var bw = s * 2.2, bh = s * 1.5;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.fillRect(top[0] - bw / 2, top[1] - bh * 0.6, bw, bh);
            ctx.strokeRect(top[0] - bw / 2, top[1] - bh * 0.6, bw, bh);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = Math.max(1, s * 0.15);
            ctx.beginPath(); ctx.ellipse(rim[0], rim[1], s * 0.6, s * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        });
    };

    /* Landmarks drawn as themselves. Returns true when handled. */
    P._drawLandmark = function (ctx, r, g, top) {
        if (r.id === 'c_buddha') { this._drawBuddha(ctx, r, g); return true; }
        if (r.id === 'c_flag') { this._drawFlagpole(ctx, r, g); return true; }
        if (r.id === 'c_sign') { this._drawHospitalSign(ctx, r, g); return true; }
        return false;
    };

    // After the night shade: draw the sign again so it shines, with a warm glow.
    P._relight = function (ctx, rooms) {
        for (var i = 0; i < rooms.length; i++) {
            if (rooms[i].id === 'c_sign') this._drawHospitalSign(ctx, rooms[i], this._geom.get(rooms[i]));
        }
    };

    /* The hospital's name sign: a white board in a pink frame on a low plinth, with a bed of
       pink flowers in front. The lettering is laid onto whichever face of the board looks
       towards the viewer, and always reads left to right however the map is turned. */
    P._drawHospitalSign = function (ctx, r, g) {
        var b = g.b, s = this.scale;
        var alongX = (b.x2 - b.x1) >= (b.y2 - b.y1);
        var cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
        var len = (alongX ? b.x2 - b.x1 : b.y2 - b.y1) - 1.6, depth = 0.7, z0 = 0.45, z1 = 3.1;
        var board = alongX ? rectPoly(cx - len / 2, cy - depth / 2, cx + len / 2, cy + depth / 2)
            : rectPoly(cx - depth / 2, cy - len / 2, cx + depth / 2, cy + len / 2);
        // plinth and flower bed
        this._drawPrism(ctx, rectPoly(b.x1 + 0.3, b.y1 + 0.3, b.x2 - 0.3, b.y2 - 0.3), g.sign, 0, z0, '#f4f0e6', { top: '#fffaf0', edge: INK });
        // which long face looks at the viewer
        var c = this._c, sn = this._s, nx = alongX ? 0 : 1, ny = alongX ? 1 : 0;
        var face = (nx * c - ny * sn) + (nx * sn + ny * c) > 0 ? 1 : -1;
        var bedOff = depth / 2 + 0.9, self = this;
        var drawBed = function () {
            self._polyPath(ctx, alongX ? rectPoly(cx - len / 2, cy + face * bedOff - 0.6, cx + len / 2, cy + face * bedOff + 0.6)
                : rectPoly(cx + face * bedOff - 0.6, cy - len / 2, cx + face * bedOff + 0.6, cy + len / 2), z0 + 0.01);
            ctx.fillStyle = '#8fcf7c';
            ctx.fill();
            if (s >= 2) {
                for (var k = 0; k < 14; k++) {
                    var u = (k + 0.5) / 14 - 0.5;
                    var fp = alongX ? self.project(cx + u * len, cy + face * bedOff + ((k % 2) - 0.5) * 0.6, z0 + 0.25)
                        : self.project(cx + face * bedOff + ((k % 2) - 0.5) * 0.6, cy + u * len, z0 + 0.25);
                    ctx.fillStyle = k % 3 ? '#f9a8cf' : '#ffffff';
                    ctx.beginPath(); ctx.arc(fp[0], fp[1], Math.max(1, s * 0.22), 0, Math.PI * 2); ctx.fill();
                }
            }
        };
        // the board itself, then a pink cap along its top
        var sign = U.signedArea(board) >= 0 ? 1 : -1;
        this._drawPrism(ctx, board, sign, z0, z1, '#ffffff', { top: '#f9a8cf', edge: INK });
        // the face's two bottom corners, ordered so the text runs left to right on screen
        var fy = alongX ? cy + face * depth / 2 : null, fx = alongX ? null : cx + face * depth / 2;
        var A = alongX ? [cx - len / 2, fy] : [fx, cy - len / 2], B = alongX ? [cx + len / 2, fy] : [fx, cy + len / 2];
        var pa = this.project(A[0], A[1], z1), pb = this.project(B[0], B[1], z1);
        if (pa[0] > pb[0]) { var tmp = pa; pa = pb; pb = tmp; }
        var faceH = (z1 - z0) * s * 1.5;
        if (Math.abs(pb[0] - pa[0]) < 18 || faceH < 6) { drawBed(); return; } // seen edge-on or too far away to read
        ctx.save();
        // local units: 100 across the board, 100 * height/length down
        var W = 100, Hl = 100 * (z1 - z0) / len;
        ctx.transform((pb[0] - pa[0]) / W, (pb[1] - pa[1]) / W, 0, faceH / Hl, pa[0], pa[1]);
        ctx.strokeStyle = '#b02a72';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(2.5, 2.5, W - 5, Hl - 5);
        ctx.fillStyle = this.night ? '#fff4d6' : '#ffffff';
        ctx.fillRect(3.6, 3.6, W - 7.2, Hl - 7.2);
        // logo: a pink heart-cross
        var lx = 12, ly = Hl / 2, lr = Hl * 0.3;
        ctx.fillStyle = '#b02a72';
        ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(lx - lr * 0.18, ly - lr * 0.62, lr * 0.36, lr * 1.24);
        ctx.fillRect(lx - lr * 0.62, ly - lr * 0.18, lr * 1.24, lr * 0.36);
        // the name, in Thai, with the English underneath
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#8c1d5a';
        ctx.font = '700 ' + (Hl * 0.36).toFixed(2) + 'px "IBM Plex Sans Thai", "Noto Sans Thai", sans-serif';
        ctx.fillText('โรงพยาบาลสีชมพู', 57, Hl * 0.43, 80);
        ctx.fillStyle = '#6b5a8a';
        ctx.font = '600 ' + (Hl * 0.15).toFixed(2) + 'px sans-serif';
        ctx.fillText('SICHOMPHU HOSPITAL', 57, Hl * 0.76, 70);
        ctx.restore();
        drawBed(); // in front of the board
        if (this.night) {
            // lit at night
            var mid = this.project(cx, cy, (z0 + z1) / 2), rad = Math.max(20, len * s * 0.8);
            var gl = ctx.createRadialGradient(mid[0], mid[1], 0, mid[0], mid[1], rad);
            gl.addColorStop(0, 'rgba(255, 240, 200, 0.35)');
            gl.addColorStop(1, 'rgba(255, 240, 200, 0)');
            ctx.fillStyle = gl;
            ctx.beginPath(); ctx.arc(mid[0], mid[1], rad, 0, Math.PI * 2); ctx.fill();
        }
    };

    // A golden seated Buddha on a two-tier white and gold base, on a lotus.
    P._drawBuddha = function (ctx, r, g) {
        var b = g.b, cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2, s = this.scale;
        var inset = function (d) { return rectPoly(b.x1 + d, b.y1 + d, b.x2 - d, b.y2 - d); };
        this._drawPrism(ctx, inset(0), g.sign, 0, 0.5, '#f4f0e6', { top: '#fffaf0', edge: INK });
        this._drawPrism(ctx, inset(1.4), g.sign, 0.5, 1.3, '#e9c46a', { top: '#f6dc8c', edge: INK });
        var base = this.project(cx, cy, 1.3), px = 5.6 * s * 1.5; // statue height on screen
        this._fx = this._fx || [];
        this._fx.push({ type: 'buddha', x: cx, y: cy, sx: base[0], sy: base[1], px: px });
        if (px < 10) {
            ctx.fillStyle = '#e9b949';
            ctx.beginPath(); ctx.arc(base[0], base[1] - px * 0.4, Math.max(2, px * 0.25), 0, Math.PI * 2); ctx.fill();
            return;
        }
        var x = base[0], y = base[1];
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK_SOLID;
        ctx.lineWidth = Math.max(1, px * 0.022);
        // halo behind the head
        ctx.fillStyle = 'rgba(255, 226, 140, 0.55)';
        ctx.beginPath(); ctx.arc(x, y - px * 0.74, px * 0.24, 0, Math.PI * 2); ctx.fill();
        // lotus throne
        ctx.fillStyle = '#f9b8d6';
        for (var k = -3; k <= 3; k++) {
            ctx.beginPath();
            ctx.ellipse(x + k * px * 0.075, y - px * 0.05, px * 0.07, px * 0.09, k * 0.12, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        }
        // crossed legs and robe
        ctx.fillStyle = '#e9b949';
        ctx.beginPath(); ctx.ellipse(x, y - px * 0.16, px * 0.36, px * 0.11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - px * 0.25, y - px * 0.18);
        ctx.quadraticCurveTo(x - px * 0.27, y - px * 0.5, x - px * 0.15, y - px * 0.6);
        ctx.lineTo(x + px * 0.15, y - px * 0.6);
        ctx.quadraticCurveTo(x + px * 0.27, y - px * 0.5, x + px * 0.25, y - px * 0.18);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // shade on the right side of the robe
        ctx.fillStyle = 'rgba(176, 120, 40, 0.35)';
        ctx.beginPath();
        ctx.moveTo(x + px * 0.05, y - px * 0.6); ctx.lineTo(x + px * 0.15, y - px * 0.6);
        ctx.quadraticCurveTo(x + px * 0.27, y - px * 0.5, x + px * 0.25, y - px * 0.18); ctx.lineTo(x + px * 0.08, y - px * 0.2);
        ctx.closePath(); ctx.fill();
        // hands resting in the lap
        ctx.fillStyle = '#f2c95c';
        ctx.beginPath(); ctx.ellipse(x, y - px * 0.24, px * 0.09, px * 0.045, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // head, ears and the topknot
        ctx.fillStyle = '#f0c454';
        ctx.beginPath(); ctx.ellipse(x - px * 0.115, y - px * 0.72, px * 0.03, px * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x + px * 0.115, y - px * 0.72, px * 0.03, px * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - px * 0.73, px * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d9a63a';
        ctx.beginPath(); ctx.arc(x, y - px * 0.85, px * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - px * 0.015, y - px * 0.9); ctx.lineTo(x, y - px * 0.97); ctx.lineTo(x + px * 0.015, y - px * 0.9);
        ctx.fill(); ctx.stroke();
        // calm closed eyes
        ctx.strokeStyle = '#8a5a1c';
        ctx.lineWidth = Math.max(0.8, px * 0.012);
        ctx.beginPath();
        ctx.moveTo(x - px * 0.06, y - px * 0.73); ctx.quadraticCurveTo(x - px * 0.035, y - px * 0.715, x - px * 0.015, y - px * 0.73);
        ctx.moveTo(x + px * 0.015, y - px * 0.73); ctx.quadraticCurveTo(x + px * 0.035, y - px * 0.715, x + px * 0.06, y - px * 0.73);
        ctx.stroke();
        ctx.restore();
    };

    // A white plinth and a tall pole; the flag itself waves per frame (and comes down at night).
    P._drawFlagpole = function (ctx, r, g) {
        var b = g.b, cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2, s = this.scale;
        var inset = function (d) { return rectPoly(b.x1 + d, b.y1 + d, b.x2 - d, b.y2 - d); };
        this._drawPrism(ctx, inset(0.5), g.sign, 0, 0.35, '#f4f0e6', { top: '#fffaf0', edge: INK });
        this._drawPrism(ctx, inset(2.8), g.sign, 0.35, 0.75, '#f4f0e6', { top: '#ffffff', edge: INK });
        var foot = this.project(cx, cy, 0.75), top = this.project(cx, cy, 11);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK_SOLID;
        ctx.lineWidth = Math.max(2.2, s * 0.42);
        ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
        ctx.strokeStyle = '#f3f1f8';
        ctx.lineWidth = Math.max(1.2, s * 0.26);
        ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath(); ctx.arc(top[0], top[1] - 1, Math.max(2, s * 0.4), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        this._fx = this._fx || [];
        this._fx.push({ type: 'flag', x: cx, y: cy, sx: top[0], sy: top[1] });
    };

    // Thai flag: red, white, blue (double), white, red, waving in the wind.
    var FLAG_STRIPES = [[0, 1 / 6, '#c8102e'], [1 / 6, 2 / 6, '#ffffff'], [2 / 6, 4 / 6, '#2d2a6e'], [4 / 6, 5 / 6, '#ffffff'], [5 / 6, 1, '#c8102e']];
    P._drawFlag = function (ctx, fx) {
        var s = this.scale, fw = Math.max(16, s * 4.4), fh = fw * 2 / 3, t = this._ambientOn() ? this._t : 0;
        var x0 = fx.sx, y0 = fx.sy + Math.max(1, s * 0.2), n = 14, off = [];
        for (var i = 0; i <= n; i++) {
            var u = i / n;
            off.push(Math.sin(t * 4.2 - u * 5.5) * fh * 0.1 * u + u * fh * 0.06);
        }
        ctx.save();
        ctx.lineJoin = 'round';
        FLAG_STRIPES.forEach(function (st) {
            ctx.beginPath();
            for (var i = 0; i <= n; i++) ctx.lineTo(x0 + fw * i / n, y0 + st[0] * fh + off[i]);
            for (var j = n; j >= 0; j--) ctx.lineTo(x0 + fw * j / n, y0 + st[1] * fh + off[j]);
            ctx.closePath();
            ctx.fillStyle = st[2];
            ctx.fill();
        });
        // folds: darker where the cloth turns away from the light
        for (var k = 0; k < n; k++) {
            var shadeA = Math.cos(t * 4.2 - (k + 0.5) / n * 5.5) * 0.14 * (k / n);
            if (shadeA <= 0) continue;
            ctx.fillStyle = 'rgba(30, 20, 60, ' + shadeA.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(x0 + fw * k / n, y0 + off[k]); ctx.lineTo(x0 + fw * (k + 1) / n, y0 + off[k + 1]);
            ctx.lineTo(x0 + fw * (k + 1) / n, y0 + fh + off[k + 1]); ctx.lineTo(x0 + fw * k / n, y0 + fh + off[k]);
            ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (var a = 0; a <= n; a++) ctx.lineTo(x0 + fw * a / n, y0 + off[a]);
        for (var c = n; c >= 0; c--) ctx.lineTo(x0 + fw * c / n, y0 + fh + off[c]);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    };

    // A soft golden glow that breathes, and sparkles round the statue.
    P._drawBuddhaGlow = function (ctx, fx) {
        var t = this._ambientOn() ? this._t : 0, px = fx.px;
        if (px < 10) return;
        var hx = fx.sx, hy = fx.sy - px * 0.62, rad = px * (0.75 + 0.06 * Math.sin(t * 1.4));
        var gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad);
        gr.addColorStop(0, 'rgba(255, 228, 150, ' + (this.night ? 0.42 : 0.26).toFixed(2) + ')');
        gr.addColorStop(1, 'rgba(255, 228, 150, 0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(hx, hy, rad, 0, Math.PI * 2); ctx.fill();
        for (var i = 0; i < 4; i++) {
            var ph = (t * 0.6 + i * 0.25) % 1, a = Math.sin(ph * Math.PI);
            var ang = i * 1.7 + 0.6, d = px * (0.45 + 0.1 * i);
            var sx = hx + Math.cos(ang) * d, sy = hy + Math.sin(ang) * d * 0.7 - ph * px * 0.15, k = px * 0.05 * a + 1;
            ctx.fillStyle = 'rgba(255, 244, 190, ' + a.toFixed(2) + ')';
            ctx.beginPath();
            ctx.moveTo(sx, sy - k * 2); ctx.lineTo(sx + k * 0.5, sy - k * 0.5); ctx.lineTo(sx + k * 2, sy);
            ctx.lineTo(sx + k * 0.5, sy + k * 0.5); ctx.lineTo(sx, sy + k * 2); ctx.lineTo(sx - k * 0.5, sy + k * 0.5);
            ctx.lineTo(sx - k * 2, sy); ctx.lineTo(sx - k * 0.5, sy - k * 0.5);
            ctx.closePath(); ctx.fill();
        }
    };

    /* ---------- players on the pitch and the court ---------- */

    P._stepPlayers = function (dt) {
        var gr = this._decor && this._decor.grounds;
        if (!gr) return;
        gr.balls.forEach(function (ball) {
            var to = ball.to;
            if (!to) return;
            var dx = to.x - ball.x, dy = to.y - ball.y, d = Math.hypot(dx, dy);
            if (d < 0.7) {
                // caught: pass to someone else on the same ground
                var mates = gr.players.filter(function (p) { return p.ball === ball && p !== to; });
                ball.to = mates[Math.floor(Math.random() * mates.length)];
                ball.from = to;
            } else {
                var step = Math.min(d, ball.speed * dt);
                ball.x += dx / d * step; ball.y += dy / d * step;
            }
            ball.hop = (ball.hop || 0) + dt * (ball.court ? 7 : 5);
        });
        gr.players.forEach(function (p) {
            p.phase += dt * (p.path ? 10 : 2);
            if ((p.think -= dt) <= 0) {
                // drift towards the ball, staying near home
                var b = p.ball, room = p.room.polygon;
                var tx = p.hx + (b.x - p.hx) * 0.45 + (Math.random() - 0.5) * 4, ty = p.hy + (b.y - p.hy) * 0.45 + (Math.random() - 0.5) * 4;
                if (b.to === p) { tx = p.x; ty = p.y; }
                if (pointInPoly(tx, ty, room)) { p.tx = tx; p.ty = ty; }
                p.think = 0.8 + Math.random() * 1.5;
            }
            var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
            if (d > 0.15) { var st = Math.min(d, p.speed * dt); p.x += dx / d * st; p.y += dy / d * st; p.path = true; }
            else p.path = null;
        });
    };

    // People, the ball, the flag and the statue's glow join the depth-sorted list of trees and traffic.
    P._extraActors = function (list) {
        if (this.floorId !== 'flr_campus') return;
        var self = this, m = 80;
        var onScreen = function (x, y, z) { var p = self.project(x, y, z || 0); return p[0] > -m && p[0] < self.w + m && p[1] > -m && p[1] < self.h + m * 2; };
        var gr = this._decor && this._decor.grounds;
        if (gr && !this.night) {
            gr.players.forEach(function (p) {
                if (onScreen(p.x, p.y)) list.push({ depth: self._depth(p.x, p.y), draw: function (ctx) { self._drawChibi(ctx, p, p); } });
            });
            gr.balls.forEach(function (b) {
                if (!onScreen(b.x, b.y)) return;
                list.push({ depth: self._depth(b.x, b.y) + 0.01, draw: function (ctx) { self._drawBall(ctx, b); } });
            });
        }
        (this._fx || []).forEach(function (fx) {
            if (fx.type === 'flag' && !self.night) list.push({ depth: 1e9, draw: function (ctx) { self._drawFlag(ctx, fx); } });
            if (fx.type === 'buddha') list.push({ depth: self._depth(fx.x, fx.y) + 0.5, draw: function (ctx) { self._drawBuddhaGlow(ctx, fx); } });
        });
    };

    P._drawBall = function (ctx, b) {
        var hop = Math.abs(Math.sin(b.hop || 0)) * (b.court ? 1.1 : 0.5);
        var g = this.project(b.x, b.y, 0.15), p = this.project(b.x, b.y, 0.35 + hop), r = Math.max(1.6, this.scale * (b.court ? 0.3 : 0.26));
        ctx.fillStyle = 'rgba(59, 42, 102, 0.22)';
        ctx.beginPath(); ctx.ellipse(g[0], g[1], r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = b.court ? '#f97316' : '#ffffff';
        ctx.strokeStyle = INK_SOLID;
        ctx.lineWidth = Math.max(0.7, r * 0.18);
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (!b.court && r > 2.5) {
            ctx.fillStyle = INK_SOLID;
            ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.35, 0, Math.PI * 2); ctx.fill();
        }
    };
})();
