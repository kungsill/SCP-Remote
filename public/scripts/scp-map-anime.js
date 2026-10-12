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
        { lit: '#f7dc72', dark: '#d6ae4f', weight: 1, blossom: true }  // ราชพฤกษ์
    ];
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
        this._decor = { trees: trees, flowers: flowers, clouds: clouds, w: f.width, h: f.height };
        this._petals = [];
        this._birds = null;
        this._nextBirds = 6;
    };

    // Grass tufts and small flowers, drawn once into the cached layer.
    P._drawGround = function (ctx) {
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
            if (r.kind !== 'building') return;
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
        var sway = this._ambientOn() ? Math.sin(this._t * 1.3 + t.seed) * r * 0.07 : 0;
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
        var circle = function (b, k, ox, oy) { ctx.moveTo(cx + b[0] * r + ox + b[2] * r * k, cy + b[1] * r + oy); ctx.arc(cx + b[0] * r + ox, cy + b[1] * r + oy, b[2] * r * k, 0, Math.PI * 2); };
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
})();
