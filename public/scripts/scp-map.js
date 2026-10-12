/* SCP-Remote Hospital 3D Isometric Map Component
   Renders Sichomphu Hospital campus and department buildings in interactive 3D Isometric Canvas.
   Displays real-time computer workstation positions, online/busy/offline status, and diagnostic cards.

   Rendering is on demand: the map is drawn into an off-screen layer only when the view
   changes (pan, zoom, rotate, hover, floor, data), and each frame just copies that layer
   and draws the status LEDs on top. The loop stops by itself when the canvas leaves the
   page or the tab is hidden, so rebuilding the panel never leaves old loops running. */
(function () {
    'use strict';

    var COS30 = Math.cos(Math.PI / 6);
    var SIN30 = 0.5;
    var WALL_H = 1.1; // cut-away room walls on floor plans
    var PULSE_INTERVAL = 66; // ~15 fps is plenty for a slow LED pulse
    var FULL_DETAIL_SCALE = 5; // below this, computers are drawn as dots
    var TRAFFIC_INTERVAL = 33; // ~30 fps while people and cars are moving
    // Someone who asked their system for less motion gets the roads without anything moving on them.
    var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var thai = document.documentElement.lang === 'th';

    var PALETTE = {
        accent: '#b02a72',
        accentRing: '#d1428c',
        statusBusy: '#2563eb',
        statusOk: '#168065',
        statusIdle: '#f59e0b',
        statusOff: '#94a3b8',
        white: '#ffffff',
        slate900: '#0f172a',
        slate800: '#1e293b',
        slate700: '#334155',
        slate600: '#475569',
        slate500: '#64748b',
        slate400: '#94a3b8',
        slate200: '#e2e8f0',
        slate100: '#f1f5f9',
        slate50: '#f8fafc'
    };

    /* Which campus building a department (mesh) name belongs to. Most specific first:
       a plain substring test such as /er/ would also match "Server" or "Center".
       An optional third entry names the floor plan when it is not the building's link_floor. */
    var BUILDING_RULES = [
        // Particular computers, by their own name, whose group does not say where they are
        // (e.g. still in the test group). The group name is checked first, so a computer
        // in a real department group still follows that group.
        [/จ่ายกลาง|\bCSSD\b/i, 'c_b_a'],
        // Offices in the OPD building; listed first so "พยาบาล" never reads as a ward.
        [/กลุ่มการพยาบาล|ฝ่ายการพยาบาล|การพยาบาล|nursing/i, 'c_opd'],
        [/ประกัน|insurance/i, 'c_opd'],
        // Back offices upstairs in the dental building. The patients' cashier (เก็บเงิน)
        // stays in OPD; only the finance office (การเงิน) goes up here.
        [/เก็บเงิน|ชำระเงิน|cashier/i, 'c_opd'],
        [/ธุรการ|สารบรรณ/i, 'c_dent', 'flr_dental_2'],
        [/การเงิน|บัญชี|finance/i, 'c_dent', 'flr_dental_2'],
        [/งานพัสดุ|^พัสดุ|ห้องพัสดุ/i, 'c_dent', 'flr_dental_2'],
        [/โสต/i, 'c_dent', 'flr_dental_2'],
        [/พขร|ขับรถ|ยานพาหนะ|driver/i, 'c_dent', 'flr_dental_2'],
        // Community health and the ward office are in the general-practice building.
        [/ชุมชน|เวชกรรมสังคม|community/i, 'c_genprac'],
        [/ตึกเวช(?!เก่า)/i, 'c_genprac'],
        // The emergency room itself is in the OPD building; the building named
        // "ER · ห้องคลอด · ผ่าตัดเล็ก" holds only the delivery (LR) and operating (OR) rooms.
        [/\bER\b|\bEMS\b|ฉุกเฉิน|อุบัติเหตุ|หัตถการ/i, 'c_opd'],
        [/ห้องคลอด|คลอด|\bLR\d*\b|ผ่าตัด|\bOR\b/i, 'c_er'],
        [/ทันต|dent/i, 'c_dent'],
        [/กายภาพ|physio|\bPT\b/i, 'c_dent', 'flr_physio_1'],
        [/ไตเทียม|ฟอกไต|dialys|\bHD\b/i, 'c_dial'],
        [/\bARI\b|ทางเดินหายใจ|หวัด/i, 'c_ari'],
        [/หญิง|ipd\s*-?\s*f|female/i, 'c_ipdf'],
        [/ชาย|ipd\s*-?\s*m|\bmale\b/i, 'c_ipdm'],
        [/จิตเวช|ยาเสพติด|psych|\bpsy\b/i, 'c_psy'],
        [/แผนไทย|thai\s*med|\bTTM\b/i, 'c_ttm'],
        [/คลินิกพิเศษ|special|\bNCD\b|คลินิก/i, 'c_clinic'],
        [/เวชปฏิบัติ|ส่งเสริม|\bPCU\b|\bPCC\b|ฝากครรภ์|\bANC\b|วัคซีน|\bEPI\b|promo/i, 'c_genprac'],
        [/\bIT\b|คอมพิว|สารสนเทศ|ไฟฟ้า|server/i, 'c_b_c'],
        [/คลังยา|พัสดุ|supply|store/i, 'c_b_b'],
        [/\bCT\b/i, 'c_ct'],
        [/OPD|ผู้ป่วยนอก|ห้องยา|เภสัช|\bLAB\b|ชันสูตร|x-?ray|เอกซเรย์|เวชระเบียน|ซักประวัติ|คัดกรอง|ตรวจ/i, 'c_opd']
    ];
    var DEFAULT_BUILDING = 'c_opd';
    // Other names people give the same office, by room id, for groups whose name is not the room's.
    var ROOM_ALIASES = {
        r_nurse: /พยาบาล|nursing/i,
        r_insure: /ประกัน|insurance/i,
        r_proc: /หัตถการ/i,
        r_xray: /x-?ray|เอกซ์?เรย์|เอ็กซ์?เรย์/i,
        r_fin: /เก็บเงิน|เก็บงิน|ชำระเงิน|cashier/i,
        r_screen: /คัดกรอ/i,
        r_card: /ห้องบัตร|เวชระเบียน/i,
        r_queue: /บัตรคิว/i,
        r_er: /\bER\b|ฉุกเฉิน|\bEMS\b|อุบัติเหตุ/i,
        lr_lr: /ห้องคลอด|คลอด|\bLR\d*\b/i,
        lr_or: /ผ่าตัด|\bOR\b/i,
        d2_admin: /ธุรการ|สารบรรณ/i,
        d2_fin: /การเงิน|บัญชี|finance/i,
        d2_supply: /พัสดุ|supply/i,
        d2_av: /โสต/i,
        d2_driver: /พขร|ขับรถ|ยานพาหนะ|driver/i,
        pm_comm: /ชุมชน|เวชกรรมสังคม|community/i,
        pm_ward: /ตึกเวช|เวชปฏิบัติ/i
    };
    var PC_ROOM_KINDS = { service: 1, counter: 1, window: 1 };

    // Room floor colours on floor plans: each kind gets its own clear tint.
    var ROOM_COLOR = {
        service: '#dbeafe',
        counter: '#fce7f3',
        window: '#fef3c7',
        waiting: '#dcfce7'
    };
    var ROOM_COLOR_OTHER = '#eef2f6';

    /* Building heights in map units, so the campus reads as a real place: grounds lie
       flat, houses are low, the flats stand tall, clinical buildings sit in between. */
    // The current Thai fiscal year as A.D. (it starts on 1 October), which plan years count in.
    function fiscalYearAD() {
        if (window.ScpPriceReference && window.ScpPriceReference.fiscalYearBE) return window.ScpPriceReference.fiscalYearBE() - 543;
        var d = new Date();
        return d.getFullYear() + (d.getMonth() >= 9 ? 1 : 0);
    }
    function heightOf(r) {
        if (r.kind !== 'building') return 0;
        var id = String(r.id || '');
        if (/^c_(field|court|park)/.test(id)) return 0.12;
        if (id === 'c_flag') return 0.6;
        if (/^c_(sign|wc2?|buddha|o2)$/.test(id)) return 1.5;
        if (id === 'c_water') return 2.2;
        if (id === 'c_flat6') return 8;
        if (/^c_flat/.test(id)) return 5;
        if (/^c_(h\d+|e\d+|director|pchr)$/.test(id)) return 2.2;
        if (id === 'c_carport') return 1.8;
        if (id === 'c_opd') return 5.2;
        if (r.link_floor) return 4.2;
        return 3.2;
    }

    var shadeCache = new Map();
    // Darken (f < 1) or lighten (f > 1) a #rrggbb colour.
    function shade(hex, f) {
        var key = hex + f.toFixed(3);
        var out = shadeCache.get(key);
        if (out) return out;
        var m = /^#?([0-9a-f]{6})$/i.exec(hex);
        if (!m) return hex;
        var n = parseInt(m[1], 16);
        var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
            return Math.round(f <= 1 ? c * f : c + (255 - c) * (f - 1));
        });
        out = 'rgb(' + ch.join(',') + ')';
        shadeCache.set(key, out);
        return out;
    }

    function centroid(poly) {
        var x = 0, y = 0;
        for (var i = 0; i < poly.length; i++) { x += poly[i][0]; y += poly[i][1]; }
        return [x / poly.length, y / poly.length];
    }

    function pointInPoly(x, y, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    function bbox(poly) {
        var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        for (var i = 0; i < poly.length; i++) {
            if (poly[i][0] < b.x1) b.x1 = poly[i][0];
            if (poly[i][0] > b.x2) b.x2 = poly[i][0];
            if (poly[i][1] < b.y1) b.y1 = poly[i][1];
            if (poly[i][1] > b.y2) b.y2 = poly[i][1];
        }
        return b;
    }

    function signedArea(poly) {
        var a = 0;
        for (var i = 0; i < poly.length; i++) {
            var p = poly[i], q = poly[(i + 1) % poly.length];
            a += p[0] * q[1] - q[0] * p[1];
        }
        return a / 2;
    }

    // Same number for the same computer every time, so automatic spots never shuffle
    // when another computer is moved, added or removed.
    function stableIndex(text) {
        var h = 0;
        text = String(text || '');
        for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    function newStat() { return { total: 0, online: 0, busy: 0, risky: 0, warn: 0, due: 0 }; }

    // Mix two #rrggbb colours; t = 0 gives a, t = 1 gives b.
    function mix(a, b, t) {
        var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        var ch = [16, 8, 0].map(function (sh) {
            var x = (pa >> sh) & 255, y = (pb >> sh) & 255;
            return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
        });
        return '#' + ch.join('');
    }

    function dist(p1, p2) {
        return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
        else ctx.rect(x, y, w, h);
    }

    function IsoMap(canvas, opts) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.opts = opts || {};
        this.doc = null;
        this.floorId = 'flr_campus';
        this.angle = 0;
        this.targetAngle = 0;
        this._c = 1;
        this._s = 0;
        this.scale = 10;
        this.pan = [0, 0];
        this.center = [0, 0];
        this.w = 0;
        this.h = 0;
        this.dpr = window.devicePixelRatio || 1;
        this.nodes = [];
        this.nodeSpots = [];
        this.hoverNode = null;
        this.hoverRoom = null;
        this.dirty = true;
        this._staticDirty = true;
        this._needFit = false;
        this._pointers = new Map();
        this._lastTime = 0;
        this._pulsePhase = 0;
        this._raf = 0;
        this._pulseTimer = 0;
        this._destroyed = false;
        this._screenHits = [];
        this._floorRooms = [];
        this._geom = new Map();
        this._textWidths = new Map();
        this.placements = {};
        this.traffic = true;
        this._agents = [];
        this.viewMode = 'status'; // 'status' | 'heat' (risk) | 'plan' (replacement year)
        this.night = false;
        this._pings = {};
        this._fly = null;
        this._busyByStop = {};
        this.editMode = false;
        this._drag = null;
        this._floorBuilding = {};
        this._layer = document.createElement('canvas');
        this._layerCtx = this._layer.getContext('2d');
        // Name labels live on their own layer above the pulsing status LEDs.
        this._labels = document.createElement('canvas');
        this._labelsCtx = this._labels.getContext('2d');
        this._shadow = document.createElement('canvas');
        this._shadowCtx = this._shadow.getContext('2d');

        this._bindEvents();
        this.resize();
    }

    /* ---------- status helpers (supplied by the dashboard, with safe fallbacks) ---------- */

    IsoMap.prototype._isOnline = function (node) {
        var fn = this.opts.isOnline || window.isOnline;
        return fn ? !!fn(node) : (node.conn & 1) !== 0;
    };
    IsoMap.prototype._isBusy = function (node) {
        var fn = this.opts.isBusy || window.isBusy;
        return fn ? !!fn(node) : false;
    };
    IsoMap.prototype._userOf = function (node) {
        var fn = this.opts.signedInUser || window.signedInUser;
        return fn ? String(fn(node) || '') : '';
    };
    // 'high' | 'warn' | null -- the worst risk the dashboard knows about for this computer.
    IsoMap.prototype._riskOf = function (node) {
        var fn = this.opts.riskLevel;
        return fn ? (fn(node) || null) : null;
    };

    IsoMap.prototype._roomOf = function (node) {
        var fn = this.opts.roomOf || window.roomOf;
        return String((fn && fn(node)) || node.meshName || '');
    };

    /* ---------- lifecycle ---------- */

    IsoMap.prototype.destroy = function () {
        this._destroyed = true;
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this._pulseTimer) clearTimeout(this._pulseTimer);
        this._raf = 0;
        this._pulseTimer = 0;
        if (this._ro) this._ro.disconnect();
        window.removeEventListener('resize', this._onWindowResize);
        document.removeEventListener('visibilitychange', this._onVisibility);
    };

    IsoMap.prototype.invalidate = function (staticToo) {
        this.dirty = true;
        if (staticToo !== false) this._staticDirty = true;
        this._kick();
    };

    IsoMap.prototype._kick = function () {
        if (this._destroyed || this._raf) return;
        if (this._pulseTimer) { clearTimeout(this._pulseTimer); this._pulseTimer = 0; }
        var self = this;
        this._raf = requestAnimationFrame(function (t) { self._frame(t); });
    };

    IsoMap.prototype.resize = function () {
        var rect = this.canvas.getBoundingClientRect();
        var w = Math.round(rect.width), h = Math.round(rect.height);
        var dpr = window.devicePixelRatio || 1;
        if (w === this.w && h === this.h && dpr === this.dpr && this.canvas.width) {
            this.invalidate();
            return;
        }
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        if (w > 0 && h > 0) {
            this.canvas.width = this._layer.width = this._labels.width = this._shadow.width = Math.round(w * dpr);
            this.canvas.height = this._layer.height = this._labels.height = this._shadow.height = Math.round(h * dpr);
            if (this._needFit) this.fit();
        }
        this.invalidate();
    };

    /* ---------- data ---------- */

    IsoMap.prototype.setMap = function (doc) {
        this.doc = doc;
        this.floors = {};
        this.rooms = {};
        this._geom.clear();
        var self = this;
        (doc.floors || []).forEach(function (f) { self.floors[f.id] = f; });
        (doc.rooms || []).forEach(function (r) {
            self.rooms[r.id] = r;
            if (r.polygon && r.polygon.length > 2) {
                self._geom.set(r, {
                    c: centroid(r.polygon),
                    b: bbox(r.polygon),
                    sign: signedArea(r.polygon) >= 0 ? 1 : -1,
                    h: heightOf(r)
                });
            }
        });
        this._campusBuildings = (doc.rooms || []).filter(function (r) {
            return r.floor_id === 'flr_campus' && r.kind === 'building' && self._geom.has(r);
        });
        // Which campus building each floor plan belongs to (for computers placed on a floor).
        this._floorBuilding = {};
        this._campusBuildings.forEach(function (b) { if (b.link_floor) self._floorBuilding[b.link_floor] = b; });
        BUILDING_RULES.forEach(function (rule) {
            if (rule[2] && !self._floorBuilding[rule[2]] && self.rooms[rule[1]]) self._floorBuilding[rule[2]] = self.rooms[rule[1]];
        });
        // Buildings with more than one floor plan stand taller, one storey per floor.
        this._campusBuildings.forEach(function (b) {
            var first = b.link_floor && self.floors[b.link_floor];
            if (!first) return;
            var levels = self.floorsOf(first.id).length;
            if (levels > 1) {
                var g = self._geom.get(b);
                g.levels = levels;
                g.h = heightOf(b) + (levels - 1) * 2.6;
            }
        });
        if (!this.floors[this.floorId]) {
            this.floorId = (doc.floors && doc.floors[0]) ? doc.floors[0].id : 'flr_campus';
        }
        this._buildPaths(doc);
        this.setFloor(this.floorId);
    };

    // Every floor plan of the building this floor belongs to, lowest first.
    IsoMap.prototype.floorsOf = function (floorId) {
        var f = this.floors && this.floors[floorId];
        if (!f || !f.building_id || floorId === 'flr_campus') return f ? [f] : [];
        var list = [];
        for (var id in this.floors) {
            if (this.floors[id].building_id === f.building_id) list.push(this.floors[id]);
        }
        list.sort(function (a, b) { return (a.level || 0) - (b.level || 0); });
        return list;
    };

    IsoMap.prototype.setFloor = function (id) {
        if (!id || !this.floors || !this.floors[id]) return;
        var changed = id !== this.floorId || !this._floorRooms.length;
        this.floorId = id;
        var f = this.floors[id];
        var self = this;
        this.center = [f.width / 2, f.height / 2];
        this._floorRooms = (this.doc.rooms || []).filter(function (r) {
            return r.floor_id === id && self._geom.has(r);
        });
        this.hoverRoom = null;
        this.hoverNode = null;
        this.fit();
        this._updateNodePositions();
        this.invalidate();
        if (changed && typeof this.opts.onFloorChange === 'function') {
            this.opts.onFloorChange(id);
        }
    };

    // Fit the whole floor slab into the canvas at the current rotation.
    IsoMap.prototype.fit = function () {
        var f = this.floors ? this.floors[this.floorId] : null;
        if (!f) return;
        if (!this.w || !this.h) { this._needFit = true; return; }
        this._needFit = false;
        var c = Math.cos(this.targetAngle), s = Math.sin(this.targetAngle);
        var hw = f.width / 2, hh = f.height / 2;
        var corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
        if (this.floorId === 'flr_campus' && this._campusBuildings) {
            // Frame the buildings, not the whole plot: the fields and car parks around
            // them are empty and would leave the hospital small in the middle.
            // Only the buildings that serve patients or hold computers; staff houses and
            // flats along the edge are still there to pan or zoom out to.
            var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }, self = this;
            var stats = this._roomStats || new Map();
            var core = this._campusBuildings.filter(function (r) { return r.link_floor || stats.has(r); });
            (core.length >= 3 ? core : this._campusBuildings).forEach(function (r) {
                var g = self._geom.get(r);
                if (g.h < 0.5) return;
                b.x1 = Math.min(b.x1, g.b.x1); b.y1 = Math.min(b.y1, g.b.y1);
                b.x2 = Math.max(b.x2, g.b.x2); b.y2 = Math.max(b.y2, g.b.y2);
            });
            if (b.x1 < b.x2) {
                var pad = 6, cx = this.center[0], cy = this.center[1];
                corners = [[b.x1 - pad, b.y1 - pad], [b.x2 + pad, b.y1 - pad], [b.x2 + pad, b.y2 + pad], [b.x1 - pad, b.y2 + pad]]
                    .map(function (p) { return [p[0] - cx, p[1] - cy]; });
            }
        }
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < 4; i++) {
            var rx = corners[i][0] * c - corners[i][1] * s;
            var ry = corners[i][0] * s + corners[i][1] * c;
            var px = (rx - ry) * COS30, py = (rx + ry) * SIN30;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        var sx = (this.w * 0.9) / Math.max(1, maxX - minX);
        var sy = (this.h * 0.82) / Math.max(1, maxY - minY);
        this.scale = Math.max(0.5, Math.min(40, Math.min(sx, sy)));
        this.pan = [-(minX + maxX) / 2 * this.scale, -(minY + maxY) / 2 * this.scale];
        this.invalidate();
    };

    IsoMap.prototype.setNodes = function (nodes) {
        this.nodes = Array.isArray(nodes) ? nodes : [];
        this._updateNodePositions();
        this._updateActivity();
        if (this.hoverNode && this.nodes.indexOf(this.hoverNode) < 0) this.hoverNode = null;
        this.invalidate();
    };

    // Positions people dragged computers to: { nodeid: { floor, x, y } }; x/y null = auto in that building.
    IsoMap.prototype.setPlacements = function (map) {
        this.placements = map && typeof map === 'object' ? map : {};
        this._updateNodePositions();
        this.invalidate();
    };

    IsoMap.prototype.setEditMode = function (on) {
        this.editMode = !!on;
        this._drag = null;
        this.canvas.style.cursor = '';
        this.invalidate();
    };

    // The campus building standing at a ground point, if any (front-most wins).
    IsoMap.prototype._buildingAt = function (x, y) {
        var list = this._campusBuildings || [];
        var hit = null;
        for (var i = 0; i < list.length; i++) {
            if (this._geom.get(list[i]).h > 0.5 && pointInPoly(x, y, list[i].polygon)) hit = list[i];
        }
        return hit;
    };

    IsoMap.prototype._buildingFor = function (node) {
        var list = this._campusBuildings || [];
        if (!list.length) return null;
        var names = [this._roomOf(node), String(node.name || '')];
        for (var n = 0; n < names.length; n++) {
            var name = names[n];
            if (!name) continue;
            for (var i = 0; i < BUILDING_RULES.length; i++) {
                if (BUILDING_RULES[i][0].test(name)) {
                    var hit = this.rooms[BUILDING_RULES[i][1]];
                    if (hit && this._geom.has(hit)) return { building: hit, floor: BUILDING_RULES[i][2] || hit.link_floor };
                }
            }
            if (n === 0 && name.length >= 3) {
                var lower = name.toLowerCase();
                for (var j = 0; j < list.length; j++) {
                    var bn = String(list[j].name || '').toLowerCase();
                    if (bn.length >= 3 && (bn.indexOf(lower) >= 0 || lower.indexOf(bn) >= 0)) return { building: list[j], floor: list[j].link_floor };
                }
            }
        }
        var fallback = this.rooms[DEFAULT_BUILDING] || list[0];
        return { building: fallback, floor: fallback.link_floor };
    };

    IsoMap.prototype._roomOnFloor = function (node, rooms, fallbackIndex) {
        // On a floor plan the computer's own name ("ห้องหัตถการ 1") says more than its group ("ER").
        // So every way of matching is tried on the computer's name before the group's is used.
        var names = [String(node.name || '').toLowerCase(), this._roomOf(node).toLowerCase()];
        for (var n = 0; n < names.length; n++) {
            var name = names[n];
            if (name.length < 2) continue;
            for (var i = 0; i < rooms.length; i++) {
                var rn = String(rooms[i].name || '').toLowerCase();
                if (rn.length >= 2 && (name.indexOf(rn) >= 0 || rn.indexOf(name) >= 0)) return rooms[i];
            }
            for (var q = 0; q < rooms.length; q++) {
                var alias = ROOM_ALIASES[rooms[q].id];
                if (alias && alias.test(name)) return rooms[q];
            }
            // the room's short name inside the name, e.g. "งานประกันสุขภาพ" -> "ประกัน"
            for (var k = 0; k < rooms.length; k++) {
                var sn = String(rooms[k].short_name || '').toLowerCase();
                if (sn.length >= 3 && name.indexOf(sn) >= 0) return rooms[k];
            }
        }
        var pcRooms = rooms.filter(function (r) { return PC_ROOM_KINDS[r.kind]; });
        var pool = pcRooms.length ? pcRooms : rooms;
        return pool.length ? pool[fallbackIndex % pool.length] : null;
    };

    IsoMap.prototype._updateNodePositions = function () {
        if (!this.doc) return;
        var self = this;
        var onCampus = this.floorId === 'flr_campus';
        var groups = new Map();

        var exact = [];
        this.nodes.forEach(function (node) {
            // A position someone dragged the computer to wins over the automatic guess.
            var pl = self.placements[node._id];
            var place = pl ? { building: self._floorBuilding[pl.floor] || null, floor: pl.floor } : self._buildingFor(node);
            if (!place) return;
            var room = null;
            if (onCampus) {
                if (pl && pl.floor === 'flr_campus') {
                    exact.push({ node: node, x: pl.x, y: pl.y, room: self._buildingAt(pl.x, pl.y) });
                    return;
                }
                room = place.building;
            } else if (place.floor === self.floorId) {
                if (pl && pl.x !== null && pl.x !== undefined) {
                    exact.push({ node: node, x: pl.x, y: pl.y, room: null });
                    return;
                }
                // Only computers that belong to this building are shown on its floor plan.
                room = self._roomOnFloor(node, self._floorRooms, stableIndex(node._id || node.name));
            }
            if (!room) return;
            if (!groups.has(room)) groups.set(room, []);
            groups.get(room).push(node);
        });

        var spots = [];
        var stats = new Map();
        exact.forEach(function (e) {
            if (!e.room && !onCampus) e.room = self._roomAt(e.x, e.y);
            var g = e.room ? self._geom.get(e.room) : null;
            var risk = self._riskOf(e.node);
            spots.push({ node: e.node, room: e.room, x: e.x, y: e.y, z: g ? g.h + 0.2 : (onCampus ? 0.2 : 0.05), exact: true, risk: risk });
            if (e.room) {
                var st = stats.get(e.room) || newStat();
                st.total++;
                if (risk === 'high') st.risky++; else if (risk === 'warn') st.warn++;
                if (self._isDue(e.node)) st.due++;
                if (self._isOnline(e.node)) { st.online++; if (self._isBusy(e.node)) st.busy++; }
                stats.set(e.room, st);
            }
        });
        groups.forEach(function (list, room) {
            var g = self._geom.get(room);
            if (!g) return;
            var st = stats.get(room) || newStat();
            st.total += list.length;
            var risks = new Map();
            list.forEach(function (node) {
                if (self._isOnline(node)) { st.online++; if (self._isBusy(node)) st.busy++; }
                var rk = self._riskOf(node);
                risks.set(node, rk);
                if (rk === 'high') st.risky++; else if (rk === 'warn') st.warn++;
                if (self._isDue(node)) st.due++;
            });
            stats.set(room, st);
            list.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
            var w = g.b.x2 - g.b.x1, h = g.b.y2 - g.b.y1;
            var cols = Math.ceil(Math.sqrt(list.length));
            var rows = Math.ceil(list.length / cols);
            var stepX = Math.min(onCampus ? 3 : 3.4, w / (cols + 1));
            var stepY = Math.min(onCampus ? 3 : 3.4, h / (rows + 1));
            var z = room.kind === 'building' ? g.h + 0.2 : 0.05;
            list.forEach(function (node, i) {
                var col = i % cols, row = Math.floor(i / cols);
                var x = g.c[0] + (col - (cols - 1) / 2) * stepX;
                var y = g.c[1] + (row - (rows - 1) / 2) * stepY;
                if (!pointInPoly(x, y, room.polygon)) { x = g.c[0]; y = g.c[1]; }
                spots.push({ node: node, room: room, x: x, y: y, z: z, risk: risks.get(node) });
            });
        });
        this.nodeSpots = spots;
        this._roomStats = stats;
    };

    /* ---------- camera ---------- */

    IsoMap.prototype.project = function (x, y, z) {
        var dx = x - this.center[0], dy = y - this.center[1];
        var rx = dx * this._c - dy * this._s;
        var ry = dx * this._s + dy * this._c;
        return [
            (rx - ry) * COS30 * this.scale + this.w / 2 + this.pan[0],
            (rx + ry) * SIN30 * this.scale - (z || 0) * this.scale * 1.5 + this.h / 2 + this.pan[1]
        ];
    };

    IsoMap.prototype.unproject = function (sx, sy, z) {
        var px = sx - (this.w / 2 + this.pan[0]);
        var py = sy - (this.h / 2 + this.pan[1]) + (z || 0) * this.scale * 1.5;
        var rx = (px / (COS30 * this.scale) + py / (SIN30 * this.scale)) / 2;
        var ry = (py / (SIN30 * this.scale) - px / (COS30 * this.scale)) / 2;
        var c = this._c, s = -this._s;
        return [
            rx * c - ry * s + this.center[0],
            rx * s + ry * c + this.center[1]
        ];
    };

    IsoMap.prototype._depth = function (x, y) {
        var dx = x - this.center[0], dy = y - this.center[1];
        return dx * (this._c + this._s) + dy * (this._c - this._s);
    };

    IsoMap.prototype.zoomBy = function (factor, cx, cy) {
        var oldScale = this.scale;
        this.scale = Math.max(0.4, Math.min(60, this.scale * factor));
        if (cx === undefined || cy === undefined) { cx = this.w / 2; cy = this.h / 2; }
        var ratio = this.scale / oldScale;
        var dx = cx - (this.w / 2 + this.pan[0]);
        var dy = cy - (this.h / 2 + this.pan[1]);
        this.pan[0] -= dx * (ratio - 1);
        this.pan[1] -= dy * (ratio - 1);
        this.invalidate();
    };

    IsoMap.prototype.rotate = function (deltaAngle) {
        this.targetAngle += deltaAngle;
        this.invalidate();
    };

    /* ---------- input ---------- */

    IsoMap.prototype._bindEvents = function () {
        var c = this.canvas;
        c.style.touchAction = 'none';
        var self = this;
        var downAt = null, moved = 0, pinch = null;
        var hoverPending = null;

        c.addEventListener('pointerdown', function (e) {
            try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            self._pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
            downAt = [e.offsetX, e.offsetY];
            if (typeof self.opts.onHoverNode === 'function') self.opts.onHoverNode(null);
            moved = 0;
            // Edit mode: pressing on a computer picks it up instead of panning the map.
            if (self.editMode && self._pointers.size === 1 && e.button === 0) {
                var picked = self._hitNode(e.offsetX, e.offsetY);
                if (picked) {
                    self._drag = { node: picked, id: picked._id, x: e.offsetX, y: e.offsetY, moved: 0, target: null };
                    self.hoverNode = null;
                    c.style.cursor = 'grabbing';
                    self.invalidate();
                    return;
                }
            }
            if (self._pointers.size === 2) {
                if (self._drag) { self._drag = null; self.invalidate(); }
                var pts = Array.from(self._pointers.values());
                pinch = { d: Math.max(1, dist(pts[0], pts[1])), s: self.scale };
            }
        });

        c.addEventListener('pointermove', function (e) {
            var prev = self._pointers.get(e.pointerId);
            if (!prev) {
                // Hover hit-testing at most once per frame, not once per mouse event.
                if (e.pointerType === 'mouse') {
                    var first = !hoverPending;
                    hoverPending = [e.offsetX, e.offsetY];
                    if (first) {
                        requestAnimationFrame(function () {
                            var p = hoverPending; hoverPending = null;
                            if (p && !self._destroyed) self._onHover(p[0], p[1]);
                        });
                    }
                }
                return;
            }
            var cur = [e.offsetX, e.offsetY];
            self._pointers.set(e.pointerId, cur);

            if (self._drag) {
                self._drag.moved += Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1]);
                self._drag.x = cur[0];
                self._drag.y = cur[1];
                var target = self._dropTarget(cur[0], cur[1]);
                var changed = !self._drag.target || target.room !== self._drag.target.room;
                self._drag.target = target;
                if (changed) self.hoverRoom = target.room;
                self.invalidate(changed);
                return;
            }

            if (self._pointers.size === 2 && pinch) {
                var pts = Array.from(self._pointers.values());
                var currentDist = dist(pts[0], pts[1]);
                self.zoomBy((pinch.s * (currentDist / pinch.d)) / self.scale, (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
                moved += 10;
                return;
            }

            self.pan[0] += cur[0] - prev[0];
            self.pan[1] += cur[1] - prev[1];
            moved += Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1]);
            self.invalidate();
        });

        function onUp(e) {
            var wasDown = self._pointers.has(e.pointerId);
            self._pointers.delete(e.pointerId);
            if (self._pointers.size < 2) pinch = null;
            if (self._drag) {
                var drag = self._drag;
                self._drag = null;
                self.hoverRoom = null;
                c.style.cursor = '';
                if (e.type === 'pointerup' && drag.moved >= 6) self._drop(drag, e.offsetX, e.offsetY);
                else if (e.type === 'pointerup' && typeof self.opts.onNodeClick === 'function') self.opts.onNodeClick(drag.node);
                self.invalidate();
                downAt = null;
                return;
            }
            if (wasDown && e.type === 'pointerup' && downAt && moved < 8 && self._pointers.size === 0) {
                self._onClick(e.offsetX, e.offsetY);
            }
            if (self._pointers.size === 0) downAt = null;
        }

        c.addEventListener('pointerup', onUp);
        c.addEventListener('pointercancel', onUp);
        c.addEventListener('pointerleave', function () {
            hoverPending = null;
            if (self.hoverNode || self.hoverRoom) {
                self.hoverNode = null;
                self._emitHover();
                self.hoverRoom = null;
                c.style.cursor = '';
                self.invalidate();
            }
        });

        // Edit mode: right-click a computer to give it back its automatic position.
        c.addEventListener('contextmenu', function (e) {
            if (!self.editMode) return;
            var node = self._hitNode(e.offsetX, e.offsetY);
            if (!node) return;
            e.preventDefault();
            var prev = self.placements[node._id];
            if (!prev) return;
            delete self.placements[node._id];
            self._updateNodePositions();
            self.invalidate();
            if (typeof self.opts.onPlace === 'function') self.opts.onPlace(node, null, prev);
        });

        c.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (self.hoverNode) { self.hoverNode = null; self._emitHover(); }
            var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            self.zoomBy(Math.exp(-dy * 0.0018), e.offsetX, e.offsetY);
        }, { passive: false });

        this._onWindowResize = function () { self.resize(); };
        this._onVisibility = function () { if (!document.hidden) self.invalidate(false); };
        if (typeof ResizeObserver === 'function') {
            // Also fires when the canvas is re-attached or its panel is shown again,
            // which restarts the (stopped) render loop.
            this._ro = new ResizeObserver(function () { self.resize(); });
            this._ro.observe(c);
        }
        window.addEventListener('resize', this._onWindowResize);
        document.addEventListener('visibilitychange', this._onVisibility);
    };

    IsoMap.prototype._hitNode = function (sx, sy) {
        var radius = this.scale >= FULL_DETAIL_SCALE ? 16 : 8;
        var best = null, bestD = radius;
        // Last drawn is on top, so later hits win ties.
        for (var i = this._screenHits.length - 1; i >= 0; i--) {
            var hit = this._screenHits[i];
            var d = Math.hypot(hit.sx - sx, hit.sy - sy);
            if (d <= bestD) { best = hit; bestD = d; }
        }
        return best ? best.spot.node : null;
    };

    IsoMap.prototype._hitRoom = function (sx, sy) {
        var rooms = this._drawOrder || this._floorRooms;
        var ground = null;
        // Front-most first, testing buildings at roof height where they are drawn.
        for (var i = rooms.length - 1; i >= 0; i--) {
            var r = rooms[i];
            var p = this.unproject(sx, sy, this._roofOf(r));
            if (pointInPoly(p[0], p[1], r.polygon)) {
                if (r.kind === 'building') return r;
                if (!ground) ground = r;
            }
        }
        return ground;
    };

    // Height a room's top is drawn at; a hovered building that opens a floor plan lifts a little.
    IsoMap.prototype._roofOf = function (r) {
        var g = this._geom.get(r);
        if (!g || r.kind !== 'building') return 0;
        return g.h + (this.hoverRoom === r && r.link_floor ? 0.6 : 0);
    };

    /* Where a dragged computer would land. On the campus, dropping on a building that has
       a floor plan moves the computer into that building (placed automatically inside);
       anywhere else it stays exactly where it was dropped. On a floor plan it is exact. */
    IsoMap.prototype._dropTarget = function (sx, sy) {
        var f = this.floors[this.floorId];
        var r = this._hitRoom(sx, sy);
        var z = 0.05, floor = this.floorId;
        if (this.floorId === 'flr_campus') {
            if (r && r.kind === 'building' && this._geom.get(r).h > 0.5) {
                if (r.link_floor && this.floors[r.link_floor]) {
                    return { room: r, floor: r.link_floor, x: null, y: null, label: r.name, into: true };
                }
                z = this._roofOf(r);
            } else {
                z = 0;
            }
        }
        var p = this.unproject(sx, sy, z);
        var x = Math.max(0.3, Math.min(f.width - 0.3, p[0]));
        var y = Math.max(0.3, Math.min(f.height - 0.3, p[1]));
        var label = r ? r.name : (thai ? 'พื้นที่ว่าง' : 'Open area');
        return { room: r, floor: floor, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, label: label, into: false };
    };

    IsoMap.prototype._drop = function (drag, sx, sy) {
        var t = this._dropTarget(sx, sy);
        var pl = { floor: t.floor, x: t.x, y: t.y };
        var prev = this.placements[drag.id];
        this.placements[drag.id] = pl;
        this._updateNodePositions();
        this.invalidate();
        if (typeof this.opts.onPlace === 'function') this.opts.onPlace(drag.node, pl, prev);
    };

    // The computer being dragged, drawn above everything with where it will land.
    IsoMap.prototype._drawDrag = function (ctx) {
        var d = this._drag;
        if (!d) return;
        var t = d.target || this._dropTarget(d.x, d.y);
        var sx = d.x, sy = d.y;
        ctx.save();
        ctx.globalAlpha = 0.95;
        // landing marker
        ctx.strokeStyle = PALETTE.accentRing;
        ctx.fillStyle = 'rgba(209, 66, 140, 0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        var top;
        if (this.scale >= FULL_DETAIL_SCALE) {
            top = this._drawDesk(ctx, sx, sy - 6, this._isOnline(d.node), this._isBusy(d.node), true) - 5;
        } else {
            ctx.fillStyle = PALETTE.accent;
            ctx.beginPath();
            ctx.arc(sx, sy - 6, 6, 0, Math.PI * 2);
            ctx.fill();
            top = sy - 14;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';
        var name = String(d.node.name || d.node.rname || 'PC');
        var text = name + '  →  ' + (t.into ? (thai ? 'ย้ายเข้า ' : 'into ') : '') + t.label;
        var w = this._measure(ctx, text) + 20, h = 22;
        roundRectPath(ctx, sx - w / 2, top - h, w, h, 11);
        ctx.fillStyle = PALETTE.accent;
        ctx.fill();
        ctx.fillStyle = PALETTE.white;
        ctx.fillText(text, sx, top - h / 2);
        ctx.restore();
    };

    // Tell the page which computer the mouse is on, and where, for its spec card.
    IsoMap.prototype._emitHover = function () {
        if (typeof this.opts.onHoverNode !== 'function') return;
        var node = this.hoverNode, at = null;
        if (node) {
            for (var i = 0; i < this._screenHits.length; i++) {
                if (this._screenHits[i].spot.node === node) at = this._screenHits[i];
            }
        }
        this.opts.onHoverNode(at ? node : null, at ? at.sx : 0, at ? at.sy : 0);
    };

    // Fly to a computer (switching floor if needed) and ring it for a few seconds.
    IsoMap.prototype.focusNode = function (id) {
        var node = null;
        for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i]._id === id) node = this.nodes[i];
        if (!node || !this.doc) return false;
        var pl = this.placements[id];
        var floor = pl ? pl.floor : ((this._buildingFor(node) || {}).floor);
        if (!floor || !this.floors[floor]) floor = 'flr_campus';
        var self = this;
        var find = function () {
            for (var j = 0; j < self.nodeSpots.length; j++) if (self.nodeSpots[j].node._id === id) return self.nodeSpots[j];
            return null;
        };
        if (floor !== this.floorId) this.setFloor(floor);
        var spot = find();
        if (!spot && this.floorId !== 'flr_campus') { this.setFloor('flr_campus'); spot = find(); }
        if (!spot) return false;
        var z = spot.room && spot.room.kind === 'building' ? this._roofOf(spot.room) + 0.2 : spot.z;
        this.flyTo(spot.x, spot.y, z, Math.max(this.scale, 6), 800);
        this._focus = { id: id, until: performance.now() + 5000 };
        return true;
    };

    IsoMap.prototype._onHover = function (sx, sy) {
        var prevNode = this.hoverNode;
        var prevRoom = this.hoverRoom;
        this.hoverNode = this._hitNode(sx, sy);
        if (this.hoverNode !== prevNode) this._emitHover();
        this.hoverRoom = (!this.hoverNode && this.doc) ? this._hitRoom(sx, sy) : null;
        if (this.hoverNode !== prevNode || this.hoverRoom !== prevRoom) {
            var clickable = this.hoverNode || (this.hoverRoom && this.hoverRoom.link_floor);
            this.canvas.style.cursor = (this.editMode && this.hoverNode) ? 'grab' : clickable ? 'pointer' : '';
            this.invalidate();
        }
    };

    IsoMap.prototype._onClick = function (sx, sy) {
        var node = this._hitNode(sx, sy);
        if (node) {
            if (typeof this.opts.onNodeClick === 'function') this.opts.onNodeClick(node);
            return;
        }
        if (!this.doc) return;
        var r = this._hitRoom(sx, sy);
        if (r && this.floorId === 'flr_campus' && r.link_floor && this.floors[r.link_floor]) {
            this.setFloor(r.link_floor);
        }
    };

    /* ---------- render loop ---------- */

    IsoMap.prototype._frame = function (t) {
        this._raf = 0;
        if (this._destroyed) return;
        // Stop when off-page or hidden; ResizeObserver / visibilitychange restart us.
        if (!this.canvas.isConnected || document.hidden || !this.w || !this.h) return;

        var dt = this._lastTime ? Math.min(0.1, (t - this._lastTime) / 1000) : 0.016;
        this._lastTime = t;

        var rotating = false;
        if (Math.abs(this.targetAngle - this.angle) > 0.001) {
            this.angle += (this.targetAngle - this.angle) * Math.min(1, dt * 9);
            if (Math.abs(this.targetAngle - this.angle) < 0.002) this.angle = this.targetAngle;
            else rotating = true;
            this._staticDirty = true;
        }
        this._c = Math.cos(this.angle);
        this._s = Math.sin(this.angle);
        if (this._stepFly()) rotating = true;

        this._pulsePhase = (this._pulsePhase + dt * 3.5) % (Math.PI * 2);
        var traffic = this._trafficOn();
        if (traffic) this._stepAgents(dt);

        this.render();
        this.dirty = false;

        var self = this;
        if (rotating) {
            this._kick();
        } else if (traffic || this._hasOnline || this._focus || this._hasPings()) {
            // Moving people and cars at ~30 fps, otherwise just a gentle LED pulse; any
            // interaction kicks a real frame sooner.
            this._pulseTimer = setTimeout(function () {
                self._pulseTimer = 0;
                self._kick();
            }, traffic ? TRAFFIC_INTERVAL : PULSE_INTERVAL);
        } else {
            this._lastTime = 0;
        }
    };

    IsoMap.prototype.render = function () {
        var ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.doc || !this.floors || !this.floors[this.floorId]) return;

        if (this._staticDirty) {
            this._renderStatic();
            this._staticDirty = false;
        }
        ctx.drawImage(this._layer, 0, 0);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this._drawLeds(ctx);
        this._drawAgents(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._labels, 0, 0);
        if (this._drag) {
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this._drawDrag(ctx);
        }
    };

    IsoMap.prototype._renderStatic = function () {
        var ctx = this._layerCtx;
        var f = this.floors[this.floorId];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this._layer.width, this._layer.height);
        var lctx = this._labelsCtx;
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, this._labels.width, this._labels.height);
        lctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Painter's order: rooms further away first, so near ones cover far ones.
        // Flat grounds (fields, car parks) always go underneath everything standing.
        var self = this;
        var order = this._floorRooms.slice();
        order.sort(function (a, b) {
            var ga = self._geom.get(a), gb = self._geom.get(b);
            var ta = ga.h > 0.5 ? 1 : 0, tb = gb.h > 0.5 ? 1 : 0;
            if (ta !== tb) return ta - tb;
            return self._depth(ga.c[0], ga.c[1]) - self._depth(gb.c[0], gb.c[1]);
        });
        this._drawOrder = order;

        this._drawSlab(ctx, f);
        if (this.floorId === 'flr_campus') this._drawPaths(ctx);
        this._drawShadows(ctx, order);
        this._drawRooms(ctx, order);
        if (this.night) this._drawNight(ctx, order);
        this._drawLabels(ctx, lctx, order);
        this._drawWorkstations(ctx, lctx);
    };

    // The floor sits on a thick base, like an architectural model.
    IsoMap.prototype._drawSlab = function (ctx, f) {
        var W = f.width, H = f.height;
        var campus = f.style === 'campus';
        var poly = [[0, 0], [W, 0], [W, H], [0, H]];
        var depth = campus ? 4 : 1.2;
        this._drawPrism(ctx, poly, 1, -depth, 0, campus ? '#8fb08a' : '#cbd5e1', {
            top: campus ? '#d3e8cf' : '#f1f5f9',
            edge: campus ? 'rgba(74, 110, 70, 0.35)' : 'rgba(100, 116, 139, 0.35)'
        });
        if (!campus) {
            // A faint tile grid helps the eye judge distance across the floor.
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            var step = Math.max(2, Math.round(Math.max(W, H) / 24));
            for (var x = step; x < W; x += step) {
                var a = this.project(x, 0, 0), b = this.project(x, H, 0);
                ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
            }
            for (var y = step; y < H; y += step) {
                var c = this.project(0, y, 0), d = this.project(W, y, 0);
                ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
            }
            ctx.stroke();
        }
    };

    /* Soft shadows cast to the lower right. Each building's footprint is swept along the
       light direction; drawn opaque on a scratch canvas and then laid down once at low
       opacity, so overlapping shadows do not get darker where they meet. */
    IsoMap.prototype._drawShadows = function (ctx, rooms) {
        var sc = this._shadowCtx;
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.clearRect(0, 0, this._shadow.width, this._shadow.height);
        sc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        sc.fillStyle = '#0f172a';
        var any = false;
        for (var i = 0; i < rooms.length; i++) {
            var r = rooms[i];
            var h = r.kind === 'building' ? this._roofOf(r) : 0;
            if (h < 0.5) continue;
            any = true;
            var ox = h * this.scale * 0.75, oy = h * this.scale * 0.32;
            var poly = r.polygon, n = poly.length;
            var pts = poly.map(function (p) { return this.project(p[0], p[1], 0); }, this);
            for (var k = 0; k < n; k++) {
                var a = pts[k], b = pts[(k + 1) % n];
                sc.beginPath();
                sc.moveTo(a[0], a[1]);
                sc.lineTo(b[0], b[1]);
                sc.lineTo(b[0] + ox, b[1] + oy);
                sc.lineTo(a[0] + ox, a[1] + oy);
                sc.closePath();
                sc.fill();
            }
            sc.beginPath();
            for (var j = 0; j < n; j++) {
                if (j === 0) sc.moveTo(pts[j][0] + ox, pts[j][1] + oy);
                else sc.lineTo(pts[j][0] + ox, pts[j][1] + oy);
            }
            sc.closePath();
            sc.fill();
        }
        if (!any) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.14;
        ctx.drawImage(this._shadow, 0, 0);
        ctx.restore();
    };

    IsoMap.prototype._drawRooms = function (ctx, rooms) {
        for (var i = 0; i < rooms.length; i++) {
            var r = rooms[i];
            var g = this._geom.get(r);
            var isHover = this.hoverRoom === r;
            if (r.kind === 'building') {
                var base = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#e2e8f0';
                var tint = this._tintFor(r);
                if (tint && g.h >= 0.5) base = tint;
                var top = this._roofOf(r);
                if (g.h < 0.5) {
                    // Grounds: just a coloured patch with a border.
                    if (r.id === 'c_field') base = '#7cc36b';
                    else if (r.id === 'c_court') base = '#e59a5c';
                    this._polyPath(ctx, r.polygon, g.h);
                    ctx.fillStyle = shade(base, 1.25);
                    ctx.fill();
                    ctx.strokeStyle = shade(base, 0.8);
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    this._drawPrism(ctx, r.polygon, g.sign, 0, top, base, {
                        top: shade(base, isHover ? 1.28 : 1.12),
                        edge: 'rgba(15, 23, 42, 0.22)',
                        levels: g.levels || 1
                    });
                }
                if (isHover) {
                    this._polyPath(ctx, r.polygon, top);
                    ctx.strokeStyle = PALETTE.accentRing;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                }
                continue;
            }

            var color = this._tintFor(r) || ROOM_COLOR[r.kind] || ROOM_COLOR_OTHER;
            this._polyPath(ctx, r.polygon, 0);
            ctx.fillStyle = isHover ? shade(color, 0.94) : color;
            ctx.fill();
            if (r.kind === 'waiting') {
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'rgba(22, 128, 101, 0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]);
            } else if (PC_ROOM_KINDS[r.kind]) {
                this._drawWalls(ctx, r, g, color);
            } else {
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            if (isHover) {
                this._polyPath(ctx, r.polygon, 0.02);
                ctx.strokeStyle = PALETTE.accentRing;
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }
    };

    /* Cut-away rooms, like a doll's house: only the walls at the back are raised, so
       nothing inside is hidden; the front walls are drawn as a low kerb. */
    IsoMap.prototype._drawWalls = function (ctx, r, g, color) {
        var poly = r.polygon, n = poly.length;
        var c = this._c, s = this._s;
        for (var i = 0; i < n; i++) {
            var a = poly[i], b = poly[(i + 1) % n];
            var nx = (b[1] - a[1]) * g.sign, ny = -(b[0] - a[0]) * g.sign;
            var rnx = nx * c - ny * s, rny = nx * s + ny * c;
            var facing = rnx + rny > 0.0001;
            var h = facing ? 0.22 : WALL_H;
            var len = Math.hypot(rnx, rny) || 1;
            var light = (rny - rnx) / len; // +1 faces screen-left (lit), -1 screen-right
            var p1 = this.project(a[0], a[1], 0), p2 = this.project(b[0], b[1], 0);
            var p3 = this.project(b[0], b[1], h), p4 = this.project(a[0], a[1], h);
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
            ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
            ctx.closePath();
            // Back walls are seen from inside, so they take the opposite light.
            ctx.fillStyle = shade('#f8fafc', facing ? 0.8 + 0.08 * light : 0.9 - 0.06 * light);
            ctx.fill();
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
            ctx.strokeStyle = shade(color, 0.6);
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }
    };

    /* An extruded polygon lit from the upper left: faces turned towards the light are
       brighter, faces turned away darker, so every corner of a building is readable. */
    IsoMap.prototype._drawPrism = function (ctx, poly, sign, z0, z1, color, style) {
        var n = poly.length;
        var c = this._c, s = this._s;
        var lo = Math.min(z0, z1), hi = Math.max(z0, z1);
        ctx.strokeStyle = style.edge;
        ctx.lineWidth = 0.8;
        for (var i = 0; i < n; i++) {
            var a = poly[i], b = poly[(i + 1) % n];
            // Outward normal; the sign corrects for polygons wound either way.
            var nx = (b[1] - a[1]) * sign, ny = -(b[0] - a[0]) * sign;
            var rnx = nx * c - ny * s, rny = nx * s + ny * c;
            if (rnx + rny <= 0.0001) continue; // back-face culling
            var len = Math.hypot(rnx, rny) || 1;
            var light = (rny - rnx) / len;
            var p1 = this.project(a[0], a[1], lo);
            var p2 = this.project(b[0], b[1], lo);
            var p3 = this.project(b[0], b[1], hi);
            var p4 = this.project(a[0], a[1], hi);
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.lineTo(p3[0], p3[1]);
            ctx.lineTo(p4[0], p4[1]);
            ctx.closePath();
            ctx.fillStyle = shade(color, 0.8 + 0.13 * light);
            ctx.fill();
            ctx.stroke();
            if (style.levels > 1) {
                // a line between storeys, so a two-floor building reads as two floors
                for (var lv = 1; lv < style.levels; lv++) {
                    var zl = lo + (hi - lo) * lv / style.levels;
                    var q1 = this.project(a[0], a[1], zl), q2 = this.project(b[0], b[1], zl);
                    ctx.beginPath();
                    ctx.moveTo(q1[0], q1[1]);
                    ctx.lineTo(q2[0], q2[1]);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.lineWidth = 1.6;
                    ctx.stroke();
                }
                ctx.strokeStyle = style.edge;
                ctx.lineWidth = 0.8;
            }
        }
        this._polyPath(ctx, poly, hi);
        ctx.fillStyle = style.top;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    IsoMap.prototype._measure = function (ctx, text) {
        var key = ctx.font + '|' + text;
        var w = this._textWidths.get(key);
        if (w === undefined) {
            if (this._textWidths.size > 2000) this._textWidths.clear();
            w = ctx.measureText(text).width;
            this._textWidths.set(key, w);
        }
        return w;
    };

    // Drawn into the cached layer, so it only runs when the view or data changes.
    IsoMap.prototype._drawWorkstations = function (ctx, lctx) {
        var self = this;
        var hits = [];
        var full = this.scale >= FULL_DETAIL_SCALE;
        var margin = 80;
        var hasOnline = false;

        var spots = [];
        for (var i = 0; i < this.nodeSpots.length; i++) {
            var spot = this.nodeSpots[i];
            if (this._drag && spot.node._id === this._drag.id) continue;
            var z = spot.room && spot.room.kind === 'building' ? this._roofOf(spot.room) + 0.2 : spot.z;
            var p = this.project(spot.x, spot.y, z);
            if (p[0] < -margin || p[0] > this.w + margin || p[1] < -margin || p[1] > this.h + margin) continue;
            spots.push({ spot: spot, sx: p[0], sy: p[1] });
        }
        spots.sort(function (a, b) { return a.sy - b.sy; });

        var hovered = null;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';

        spots.forEach(function (item) {
            var node = item.spot.node;
            var sx = item.sx, sy = item.sy;
            var online = self._isOnline(node);
            var busy = online && self._isBusy(node);
            var statusColor = online ? (busy ? PALETTE.statusBusy : PALETTE.statusOk) : PALETTE.statusOff;
            var isHover = self.hoverNode === node;
            if (online) hasOnline = true;

            var led;
            if (self.editMode) {
                // dashed ring: this one can be picked up and moved
                ctx.strokeStyle = 'rgba(176, 42, 114, 0.7)';
                ctx.lineWidth = 1.3;
                ctx.setLineDash([3, 2]);
                ctx.beginPath();
                ctx.ellipse(sx, full ? sy + 3 : sy, full ? 16 : 7, full ? 8 : 3.5, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (full) {
                var monY = self._drawDesk(ctx, sx, sy, online, busy, isHover);
                led = { x: sx + 7, y: monY - 2, r: 4 };
                hits.push({ spot: item.spot, sx: sx, sy: sy - 12 });
                if (isHover) hovered = item;
                item.top = monY - 5;
            } else {
                // Zoomed out: a small upright pin, so the status still reads at a glance.
                ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx, sy - 6);
                ctx.stroke();
                led = { x: sx, y: sy - 7, r: 3.5 };
                hits.push({ spot: item.spot, sx: sx, sy: sy - 6 });
                if (isHover) hovered = item;
                item.top = sy - 12;
            }
            led.color = statusColor;
            led.online = online;
            item.led = led;
        });

        // Names go on the label layer, nearest first, skipping any that would cover one
        // already shown (hover a computer to see its name). Hovered label last, on top.
        ctx = lctx;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';
        if (full) {
            var placed = (this._roomLabelBoxes || []).slice();
            for (var j = spots.length - 1; j >= 0; j--) {
                var it = spots[j];
                if (it === hovered) continue;
                var box = this._pillBox(ctx, it.spot.node, it.sx, it.top, false);
                if (overlaps(box, placed)) continue;
                placed.push(box);
                this._drawPill(ctx, box, false);
            }
        }
        if (hovered) this._drawPill(ctx, this._pillBox(ctx, hovered.spot.node, hovered.sx, hovered.top, true), true);

        // Risk badges on top of everything: red ! for a serious problem (low RAM, very old
        // CPU or machine, unprotected), amber for a lesser one (only when zoomed in).
        var thisYear = fiscalYearAD();
        spots.forEach(function (it) {
            if (self.viewMode === 'plan') {
                // replacement plan: the Buddhist-era year this computer should be replaced
                var py = self._planYear(it.spot.node);
                if (py === null || (!full && py > thisYear + 1)) return;
                var label = String(py + 543), bw = full ? 30 : 24, bh = full ? 14 : 11;
                var cx = full ? it.sx - 12 : it.sx - 6, cy = full ? it.top + 5 : it.sy - 11;
                roundRectPath(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
                ctx.fillStyle = py <= thisYear ? '#b91c1c' : py === thisYear + 1 ? '#ea580c' : '#16a34a';
                ctx.fill();
                ctx.strokeStyle = PALETTE.white; ctx.lineWidth = 1.2; ctx.stroke();
                ctx.fillStyle = PALETTE.white;
                ctx.font = '700 ' + (full ? 9.5 : 8) + 'px sans-serif';
                ctx.fillText(label, cx, cy + 0.5);
                return;
            }
            var rk = it.spot.risk;
            if (!rk || (rk === 'warn' && !full)) return;
            var bx = full ? it.sx - 10 : it.sx - 6, by = full ? it.top + 5 : it.sy - 11;
            var r = full ? 6.5 : 5;
            ctx.beginPath();
            if (rk === 'high') {
                ctx.arc(bx, by, r, 0, Math.PI * 2);
                ctx.fillStyle = '#dc2626';
            } else {
                ctx.moveTo(bx, by - r); ctx.lineTo(bx + r, by + r * 0.8); ctx.lineTo(bx - r, by + r * 0.8); ctx.closePath();
                ctx.fillStyle = '#f59e0b';
            }
            ctx.fill();
            ctx.strokeStyle = PALETTE.white;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = PALETTE.white;
            ctx.font = '800 ' + (full ? 10 : 8) + 'px sans-serif';
            ctx.fillText('!', bx, by + (rk === 'high' ? 0.5 : 1.5));
        });

        this._leds = spots.map(function (s) { return s.led; });
        this._screenHits = hits;
        this._hasOnline = hasOnline;
    };

    // A small desk with a monitor, drawn as a lit isometric box. Returns the monitor's top y.
    IsoMap.prototype._drawDesk = function (ctx, sx, sy, online, busy, isHover) {
        var hw = 11, hh = 5.5, d = 5;
        // contact shadow
        ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
        ctx.beginPath();
        ctx.ellipse(sx + 2, sy + d + 1, hw + 2, hh + 1, 0, 0, Math.PI * 2);
        ctx.fill();
        // left face (lit)
        ctx.fillStyle = '#c9a46b';
        ctx.beginPath();
        ctx.moveTo(sx - hw, sy); ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx, sy + hh + d); ctx.lineTo(sx - hw, sy + d);
        ctx.closePath();
        ctx.fill();
        // right face (shade)
        ctx.fillStyle = '#a5824c';
        ctx.beginPath();
        ctx.moveTo(sx, sy + hh); ctx.lineTo(sx + hw, sy);
        ctx.lineTo(sx + hw, sy + d); ctx.lineTo(sx, sy + hh + d);
        ctx.closePath();
        ctx.fill();
        // top
        ctx.fillStyle = isHover ? '#f3dcb4' : '#e6c792';
        ctx.beginPath();
        ctx.moveTo(sx, sy - hh); ctx.lineTo(sx + hw, sy);
        ctx.lineTo(sx, sy + hh); ctx.lineTo(sx - hw, sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 85, 40, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // monitor
        var monW = 18, monH = 13, monY = sy - 19;
        ctx.fillStyle = PALETTE.slate700;
        ctx.fillRect(sx - 1.5, sy - 6, 3, 5);
        ctx.fillRect(sx - 4, sy - 2, 8, 2);
        // monitor depth (back edge) for a little thickness
        ctx.fillStyle = PALETTE.slate600;
        roundRectPath(ctx, sx - monW / 2 + 2, monY - 1.5, monW, monH, 2.5);
        ctx.fill();
        roundRectPath(ctx, sx - monW / 2, monY, monW, monH, 2.5);
        ctx.fillStyle = isHover ? PALETTE.slate900 : PALETTE.slate800;
        ctx.fill();
        ctx.strokeStyle = isHover ? PALETTE.accentRing : PALETTE.slate600;
        ctx.lineWidth = isHover ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = online ? (busy ? 'rgba(59, 130, 246, 0.6)' : 'rgba(34, 197, 94, 0.45)') : 'rgba(51, 65, 85, 0.85)';
        ctx.fillRect(sx - monW / 2 + 2, monY + 2, monW - 4, monH - 4);
        if (online) {
            // screen glare
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.beginPath();
            ctx.moveTo(sx - monW / 2 + 2, monY + 2);
            ctx.lineTo(sx, monY + 2);
            ctx.lineTo(sx - monW / 2 + 2, monY + monH - 4);
            ctx.closePath();
            ctx.fill();
        }
        return monY;
    };
    // Where a computer's name label goes. The signed-in user is added only on hover.
    IsoMap.prototype._pillBox = function (ctx, node, cx, bottom, isHover) {
        var name = String(node.name || node.rname || 'PC');
        var user = isHover ? this._userOf(node) : '';
        var text = user ? (name + ' · ' + user) : name;
        var w = this._measure(ctx, text) + 16, h = 18;
        var x = cx - w / 2, y = bottom - h;
        return { text: text, cx: cx, x: x, y: y, w: w, h: h, x1: x - 2, y1: y - 2, x2: x + w + 2, y2: y + h + 2 };
    };

    IsoMap.prototype._drawPill = function (ctx, box, isHover) {
        var labelText = box.text, cx = box.cx;
        var pillW = box.w, pillH = box.h;
        var pillX = box.x, pillY = box.y;

        if (isHover) {
            ctx.save();
            ctx.shadowColor = 'rgba(176, 42, 114, 0.4)';
            ctx.shadowBlur = 8;
        } else {
            // Cheap fake shadow instead of shadowBlur, which is very slow on many labels.
            ctx.fillStyle = 'rgba(15, 23, 42, 0.10)';
            roundRectPath(ctx, pillX, pillY + 1.5, pillW, pillH, 9);
            ctx.fill();
        }
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 9);
        ctx.fillStyle = isHover ? PALETTE.accent : 'rgba(255, 255, 255, 0.94)';
        ctx.fill();
        if (isHover) ctx.restore();
        ctx.strokeStyle = isHover ? PALETTE.accentRing : PALETTE.slate200;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isHover ? PALETTE.white : PALETTE.slate800;
        ctx.fillText(labelText, cx, pillY + pillH / 2);
    };

    // The only per-frame drawing: status LEDs over the cached layer.
    IsoMap.prototype._drawLeds = function (ctx) {
        var leds = this._leds || [];
        // alert pings: red rings on computers that just went offline
        if (this._hasPings()) {
            var nowP = performance.now();
            for (var hp = 0; hp < this._screenHits.length; hp++) {
                var hh = this._screenHits[hp];
                if (!this._pings[hh.spot.node._id]) continue;
                for (var pr = 0; pr < 2; pr++) {
                    var phs = ((nowP / 700) + pr * 0.5) % 1;
                    ctx.beginPath();
                    ctx.arc(hh.sx, hh.sy, 8 + phs * 28, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(220, 38, 38, ' + (0.9 * (1 - phs)).toFixed(3) + ')';
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                }
            }
        }
        var f = this._focus;
        if (f) {
            var left = f.until - performance.now();
            var hit = null;
            for (var k = 0; k < this._screenHits.length; k++) if (this._screenHits[k].spot.node._id === f.id) hit = this._screenHits[k];
            if (left <= 0 || !hit) {
                if (left <= 0) this._focus = null;
            } else {
                // expanding rings so the eye finds the computer that was picked from the list
                for (var ring = 0; ring < 2; ring++) {
                    var ph = ((performance.now() / 900) + ring * 0.5) % 1;
                    ctx.beginPath();
                    ctx.arc(hit.sx, hit.sy, 10 + ph * 34, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(220, 38, 38, ' + (0.85 * (1 - ph)).toFixed(3) + ')';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }
            }
        }
        var pulse = 1 + 0.25 * Math.sin(this._pulsePhase);
        ctx.strokeStyle = PALETTE.white;
        ctx.lineWidth = 1.2;
        for (var i = 0; i < leds.length; i++) {
            var l = leds[i];
            ctx.beginPath();
            ctx.arc(l.x, l.y, l.r * (l.online ? pulse : 1), 0, Math.PI * 2);
            ctx.fillStyle = l.color;
            ctx.fill();
            ctx.stroke();
        }
    };

    function overlaps(box, placed) {
        for (var i = 0; i < placed.length; i++) {
            var p = placed[i];
            if (box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1) return true;
        }
        return false;
    }

    IsoMap.prototype._drawLabels = function (roomCtx, labelCtx, rooms) {
        var campus = this.floorId === 'flr_campus';
        var compact = campus && this.scale < 3;
        var stats = this._roomStats || new Map();
        var self = this;

        // Collect, then place the most useful labels first and drop any that would
        // overlap one already placed: hovered > has computers > opens a floor > the rest.
        var items = [];
        for (var i = 0; i < rooms.length; i++) {
            var r = rooms[i];
            if (!r.name || r.kind === 'corridor') continue;
            var g = this._geom.get(r);
            var isBuilding = r.kind === 'building';
            var st = stats.get(r);
            var at = g.c;
            if (!isBuilding) {
                // Room names sit towards the back wall, leaving the middle for the computers.
                var back = r.polygon[0], bd = Infinity;
                for (var k = 0; k < r.polygon.length; k++) {
                    var dk = this._depth(r.polygon[k][0], r.polygon[k][1]);
                    if (dk < bd) { bd = dk; back = r.polygon[k]; }
                }
                at = [g.c[0] + (back[0] - g.c[0]) * 0.72, g.c[1] + (back[1] - g.c[1]) * 0.72];
            }
            var proj = this.project(at[0], at[1], isBuilding ? this._roofOf(r) + 0.3 : 0.1);
            if (proj[0] < -150 || proj[0] > this.w + 150 || proj[1] < -30 || proj[1] > this.h + 30) continue;
            var hover = this.hoverRoom === r;
            items.push({
                r: r, x: proj[0], y: proj[1], st: st, building: isBuilding, hover: hover,
                rank: hover ? 0 : st ? 1 : r.link_floor ? 2 : isBuilding ? 3 : 4
            });
        }
        items.sort(function (a, b) { return a.rank - b.rank; });

        var placed = [];
        var draws = [];
        items.forEach(function (it) {
            var r = it.r;
            if (it.building) {
                // Houses, stores and the like only get a name tag when zoomed right in or hovered.
                if (campus && self.scale < 6 && !it.hover && !it.st && !r.link_floor) return;
                var ctx = labelCtx;
                var text = (compact && !it.hover ? (r.short_name || r.name) : r.name);
                ctx.font = '700 11.5px "IBM Plex Sans Thai", sans-serif';
                var tw = self._measure(ctx, text);
                var chipText = it.st ? (it.st.online + '/' + it.st.total) : '';
                ctx.font = '700 10.5px "IBM Plex Sans Thai", sans-serif';
                var cw = chipText ? self._measure(ctx, '🖥 ' + chipText) + 12 : 0;
                var riskText = it.st && it.st.risky ? '⚠ ' + it.st.risky : '';
                var rw = riskText ? self._measure(ctx, riskText) + 12 : 0;
                var w = tw + 18 + (cw ? cw + 4 : 0) + (rw ? rw + 4 : 0), h = 22;
                var x = it.x - w / 2, y = 0, box = null;
                // Clear of the computer pins on the roof; climb if the spot is taken.
                var base = it.y - h - (it.st ? 18 : 6);
                for (var lift = 0; lift <= 3; lift++) {
                    y = base - lift * 26;
                    var cand = { x1: x - 2, y1: y - 2, x2: x + w + 2, y2: y + h + 2 };
                    if (!overlaps(cand, placed)) { box = cand; break; }
                }
                if (!box) {
                    if (!it.hover) return;
                    y = base;
                    box = { x1: x - 2, y1: y - 2, x2: x + w + 2, y2: y + h + 2 };
                }
                placed.push(box);
                var hint = (it.hover && r.link_floor && campus) ? (thai ? 'คลิกเพื่อดูภายในอาคาร →' : 'Click to look inside →') : '';
                var hintW = 0;
                if (hint) {
                    ctx.font = '600 10.5px "IBM Plex Sans Thai", sans-serif';
                    hintW = self._measure(ctx, hint) + 14;
                    placed.push({ x1: it.x - hintW / 2, y1: y - 22, x2: it.x + hintW / 2, y2: y - 2 });
                }

                draws.push({ hover: it.hover, fn: function () {
                    // pin stem from roof to label
                    ctx.strokeStyle = it.hover ? PALETTE.accentRing : 'rgba(176, 42, 114, 0.45)';
                    ctx.lineWidth = it.hover ? 1.5 : 1;
                    ctx.beginPath();
                    ctx.moveTo(it.x, it.y);
                    ctx.lineTo(it.x, y + h);
                    ctx.stroke();

                    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
                    roundRectPath(ctx, x, y + 2, w, h, 8);
                    ctx.fill();
                    roundRectPath(ctx, x, y, w, h, 8);
                    ctx.fillStyle = it.hover ? PALETTE.accent : 'rgba(255, 255, 255, 0.96)';
                    ctx.fill();
                    ctx.strokeStyle = it.hover ? PALETTE.accentRing : 'rgba(176, 42, 114, 0.35)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.font = '700 11.5px "IBM Plex Sans Thai", sans-serif';
                    ctx.fillStyle = it.hover ? PALETTE.white : PALETTE.accent;
                    ctx.fillText(text, x + 9 + tw / 2, y + h / 2 + 0.5);

                    if (cw) {
                        var st = it.st;
                        var chipColor = st.online === 0 ? PALETTE.statusOff : st.online < st.total ? '#d97706' : PALETTE.statusOk;
                        roundRectPath(ctx, x + w - cw - 4, y + 4, cw, h - 8, 7);
                        ctx.fillStyle = chipColor;
                        ctx.fill();
                        ctx.font = '700 10.5px "IBM Plex Sans Thai", sans-serif';
                        ctx.fillStyle = PALETTE.white;
                        ctx.fillText('🖥 ' + chipText, x + w - 4 - cw / 2, y + h / 2 + 0.5);
                    }
                    if (rw) {
                        var rx = x + w - 4 - (cw ? cw + 4 : 0) - rw;
                        roundRectPath(ctx, rx, y + 4, rw, h - 8, 7);
                        ctx.fillStyle = '#dc2626';
                        ctx.fill();
                        ctx.font = '700 10.5px "IBM Plex Sans Thai", sans-serif';
                        ctx.fillStyle = PALETTE.white;
                        ctx.fillText(riskText, rx + rw / 2, y + h / 2 + 0.5);
                    }

                    if (hint) {
                        roundRectPath(ctx, it.x - hintW / 2, y - 21, hintW, 17, 8);
                        ctx.fillStyle = PALETTE.slate900;
                        ctx.fill();
                        ctx.font = '600 10.5px "IBM Plex Sans Thai", sans-serif';
                        ctx.fillStyle = PALETTE.white;
                        ctx.fillText(hint, it.x, y - 12.5);
                    }
                } });
            } else {
                var rctx = roomCtx;
                rctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';
                var rw = self._measure(rctx, r.name);
                var rb = { x1: it.x - rw / 2 - 3, y1: it.y - 8, x2: it.x + rw / 2 + 3, y2: it.y + 8 };
                if (!it.hover && overlaps(rb, placed)) return;
                placed.push(rb);
                draws.push({ hover: it.hover, fn: function () {
                    rctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';
                    // white halo keeps the name readable over walls and tiles
                    rctx.lineJoin = 'round';
                    rctx.lineWidth = 3.5;
                    rctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                    rctx.strokeText(r.name, it.x, it.y);
                    rctx.fillStyle = it.hover ? PALETTE.accent : PALETTE.slate600;
                    rctx.fillText(r.name, it.x, it.y);
                } });
            }
        });

        // Room names keep their place: computer name labels skip anything that would cover them.
        this._roomLabelBoxes = placed.slice();
        roomCtx.save();
        labelCtx.save();
        roomCtx.textAlign = labelCtx.textAlign = 'center';
        roomCtx.textBaseline = labelCtx.textBaseline = 'middle';
        // Placed by priority, painted so the hovered label ends up on top.
        draws.filter(function (d) { return !d.hover; }).forEach(function (d) { d.fn(); });
        draws.filter(function (d) { return d.hover; }).forEach(function (d) { d.fn(); });
        roomCtx.restore();
        labelCtx.restore();
    };

    IsoMap.prototype._polyPath = function (ctx, poly, z) {
        ctx.beginPath();
        for (var i = 0; i < poly.length; i++) {
            var p = this.project(poly[i][0], poly[i][1], z);
            if (i === 0) ctx.moveTo(p[0], p[1]);
            else ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
    };

    /* ---------- view modes, night, pings, flying the camera ---------- */

    // The floor room a free-standing spot lies in (PC rooms before waiting areas).
    IsoMap.prototype._roomAt = function (x, y) {
        var hit = null;
        for (var i = 0; i < this._floorRooms.length; i++) {
            var r = this._floorRooms[i];
            if (r.kind === 'building' || !pointInPoly(x, y, r.polygon)) continue;
            if (PC_ROOM_KINDS[r.kind]) return r;
            if (!hit) hit = r;
        }
        return hit;
    };

    // The calendar year this computer should be replaced, if the assessment knows it.
    IsoMap.prototype._planYear = function (node) {
        var fn = this.opts.planYear;
        var y = fn ? Number(fn(node)) : NaN;
        return y > 2000 && y < 2200 ? y : null;
    };
    // Due means this year or next: the ones a budget request has to cover now.
    IsoMap.prototype._isDue = function (node) {
        var y = this._planYear(node);
        return y !== null && y <= fiscalYearAD() + 1;
    };

    IsoMap.prototype.setViewMode = function (mode) {
        this.viewMode = (mode === 'heat' || mode === 'plan') ? mode : 'status';
        this.invalidate();
    };

    IsoMap.prototype.setNight = function (on) {
        this.night = !!on;
        this.invalidate();
    };

    // The colour a room or building takes in the risk or replacement view; null = keep its own.
    IsoMap.prototype._tintFor = function (r) {
        if (this.viewMode === 'status') return null;
        var st = this._roomStats && this._roomStats.get(r);
        if (!st || !st.total) return r.kind === 'building' ? '#cbd5e1' : null;
        if (this.viewMode === 'heat') {
            if (st.risky) return mix('#fca5a5', '#b91c1c', Math.min(1, st.risky / st.total * 1.5));
            if (st.warn) return mix('#fde68a', '#d97706', Math.min(1, st.warn / st.total));
            return '#4ade80';
        }
        if (st.due) return mix('#fdba74', '#c2410c', Math.min(1, st.due / st.total * 1.5));
        return '#86efac';
    };

    // Draw attention to one computer for a while without moving the camera.
    IsoMap.prototype.pingNode = function (id, ms) {
        this._pings[id] = performance.now() + (ms || 8000);
        this.invalidate(false);
    };
    IsoMap.prototype._hasPings = function () {
        var now = performance.now(), any = false;
        for (var id in this._pings) { if (this._pings[id] > now) any = true; else delete this._pings[id]; }
        return any;
    };

    // Glide the camera so map point (x, y, z) ends up centred at the given scale.
    IsoMap.prototype.flyTo = function (x, y, z, scale, ms) {
        var keepScale = this.scale, keepPan = this.pan;
        this.scale = Math.max(0.4, Math.min(60, scale || this.scale));
        this.pan = [0, 0];
        var p = this.project(x, y, z || 0);
        var target = { scale: this.scale, pan: [this.w / 2 - p[0], this.h / 2 - p[1] + 20] };
        this.scale = keepScale; this.pan = keepPan;
        if (REDUCED_MOTION || !ms) {
            this.scale = target.scale; this.pan = target.pan; this._fly = null;
        } else {
            this._fly = { from: { scale: this.scale, pan: this.pan.slice() }, to: target, t0: performance.now(), ms: ms };
        }
        this.invalidate();
    };

    IsoMap.prototype._stepFly = function () {
        var f = this._fly;
        if (!f) return false;
        var t = Math.min(1, (performance.now() - f.t0) / f.ms);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
        // zoom in logarithmic space so it feels even
        this.scale = Math.exp(Math.log(f.from.scale) + (Math.log(f.to.scale) - Math.log(f.from.scale)) * e);
        this.pan = [f.from.pan[0] + (f.to.pan[0] - f.from.pan[0]) * e, f.from.pan[1] + (f.to.pan[1] - f.from.pan[1]) * e];
        this._staticDirty = true;
        if (t >= 1) this._fly = null;
        return true;
    };

    // Fly to a room or building by id, switching floor first if it is on another one.
    IsoMap.prototype.focusRoom = function (id, ms) {
        var r = this.rooms && this.rooms[id];
        if (!r || !this._geom.get(r)) return false;
        if (r.floor_id !== this.floorId) this.setFloor(r.floor_id);
        var g = this._geom.get(r);
        var size = Math.max(g.b.x2 - g.b.x1, g.b.y2 - g.b.y1, 6);
        var scale = Math.max(3, Math.min(22, Math.min(this.w, this.h) * 0.45 / size));
        this.flyTo(g.c[0], g.c[1], r.kind === 'building' ? g.h : 0, scale, ms === undefined ? 900 : ms);
        return true;
    };

    // Night: everything darkened on the cached layer, then windows, room glows and street
    // lamps lit -- brighter where more computers are switched on.
    IsoMap.prototype._drawNight = function (ctx, rooms) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(6, 12, 32, 0.66)';
        ctx.fillRect(0, 0, this._layer.width, this._layer.height);
        ctx.restore();
        var self = this, stats = this._roomStats || new Map();
        var c = this._c, s = this._s;
        var hash = function (str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h) % 100; };
        ctx.save();
        rooms.forEach(function (r) {
            var g = self._geom.get(r), st = stats.get(r);
            if (r.kind !== 'building') {
                // floor plan: a warm glow in rooms where computers are on
                if (!st || !st.online) return;
                var p = self.project(g.c[0], g.c[1], 0.1);
                var rad = Math.max(12, Math.min(140, Math.max(g.b.x2 - g.b.x1, g.b.y2 - g.b.y1) * self.scale * 0.6));
                var grad = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
                grad.addColorStop(0, 'rgba(253, 230, 138, ' + (0.25 + 0.35 * st.online / st.total).toFixed(2) + ')');
                grad.addColorStop(1, 'rgba(253, 230, 138, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
                return;
            }
            if (g.h < 0.5) return;
            var lit = st && st.total ? 10 + Math.round(85 * st.online / st.total) : 22;
            var levels = g.levels || Math.max(1, Math.round(g.h / 2.6));
            var poly = r.polygon, n = poly.length, h = self._roofOf(r);
            for (var i = 0; i < n; i++) {
                var a = poly[i], b = poly[(i + 1) % n];
                var nx = (b[1] - a[1]) * g.sign, ny = -(b[0] - a[0]) * g.sign;
                if ((nx * c - ny * s) + (nx * s + ny * c) <= 0.0001) continue;
                var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                var cols = Math.max(1, Math.floor(len / 3));
                for (var lv = 0; lv < levels; lv++) {
                    var z0 = h * (lv + 0.3) / levels, z1 = h * (lv + 0.7) / levels;
                    for (var k = 0; k < cols; k++) {
                        var u0 = (k + 0.25) / cols, u1 = (k + 0.75) / cols;
                        var q0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0];
                        var q1 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
                        var on = hash(r.id + ':' + i + ':' + lv + ':' + k) < lit;
                        var p1 = self.project(q0[0], q0[1], z0), p2 = self.project(q1[0], q1[1], z0);
                        var p3 = self.project(q1[0], q1[1], z1), p4 = self.project(q0[0], q0[1], z1);
                        ctx.beginPath();
                        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]);
                        ctx.closePath();
                        ctx.fillStyle = on ? '#fde68a' : 'rgba(30, 41, 59, 0.9)';
                        ctx.fill();
                    }
                }
            }
        });
        // street lamps along the roads
        var P = this._paths;
        if (P && this.floorId === 'flr_campus') {
            P.edges.forEach(function (e) {
                if (e.kind !== 'road') return;
                var steps = Math.max(1, Math.floor(e.len / 22));
                for (var k = 0; k <= steps; k++) {
                    var t = k / steps, x = e.a.x + (e.b.x - e.a.x) * t, y = e.a.y + (e.b.y - e.a.y) * t;
                    var p = self.project(x, y, 0.1), rad = Math.max(8, self.scale * 5);
                    var grad = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
                    grad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
                    grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
                }
            });
        }
        ctx.restore();
    };

    // How many people walk, and where to, follows how many computers are in use.
    IsoMap.prototype._updateActivity = function () {
        var P = this._paths;
        if (!P || !P.stops.length) return;
        var self = this, busyTotal = 0, byBuilding = new Map();
        this.nodes.forEach(function (node) {
            if (!self._isBusy(node)) return;
            busyTotal++;
            var pl = self.placements[node._id];
            var b = pl ? (pl.floor === 'flr_campus' ? self._buildingAt(pl.x, pl.y) : self._floorBuilding[pl.floor]) : (self._buildingFor(node) || {}).building;
            if (b) byBuilding.set(b, (byBuilding.get(b) || 0) + 1);
        });
        // each building front draws walkers in proportion to the people working inside
        var weights = {};
        P.stops.forEach(function (id) {
            var n = P.nodes[id], best = null, bestD = 30;
            byBuilding.forEach(function (count, b) {
                var g = self._geom.get(b), d = Math.hypot(g.c[0] - n.x, g.c[1] - n.y);
                if (d < bestD) { bestD = d; best = b; }
            });
            weights[id] = 1 + (best ? byBuilding.get(best) * 2 : 0);
        });
        this._busyByStop = weights;
        var target = Math.max(6, Math.min(32, 6 + busyTotal));
        var walkers = this._agents.filter(function (a) { return a.type === 'walker' && !a.leaving; });
        var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
        for (var i = walkers.length; i < target; i++) {
            this._agents.push({ type: 'walker', at: pick(P.stops), wait: Math.random() * 4, speed: 1.8 + Math.random() * 1.2,
                color: pick(WALKER_COLORS), side: (Math.random() - 0.5) * 1.2, phase: Math.random() * 6 });
        }
        for (var j = target; j < walkers.length; j++) walkers[j].leaving = true;
    };

    /* ---------- roads, paths and the people and cars moving on them (campus only) ---------- */

    var ROAD_W = 7, PATH_W = 2.4;
    var WALKER_COLORS = ['#60a5fa', '#34d399', '#f9a8d4', '#f8fafc', '#a78bfa', '#fbbf24', '#fb923c'];
    var CAR_COLORS = ['#e5e7eb', '#ef4444', '#3b82f6', '#4b5563', '#f59e0b', '#10b981'];

    // The campus walking and road network from the map data: nodes, edges and who may use them.
    IsoMap.prototype._buildPaths = function (doc) {
        var nodes = {}, edges = [], adj = {};
        (doc.nodes || []).forEach(function (n) {
            if (n.floor_id === 'flr_campus') { nodes[n.id] = n; adj[n.id] = []; }
        });
        (doc.edges || []).forEach(function (e) {
            var a = nodes[e.node_a], b = nodes[e.node_b];
            if (!a || !b) return;
            var len = Math.hypot(b.x - a.x, b.y - a.y);
            if (len < 0.01) return;
            var edge = { a: a, b: b, kind: e.kind || 'walk', len: len };
            edges.push(edge);
            adj[a.id].push({ to: b.id, kind: edge.kind, len: len });
            adj[b.id].push({ to: a.id, kind: edge.kind, len: len });
        });
        var roadDeg = {};
        edges.forEach(function (e) {
            if (e.kind !== 'road') return;
            roadDeg[e.a.id] = (roadDeg[e.a.id] || 0) + 1;
            roadDeg[e.b.id] = (roadDeg[e.b.id] || 0) + 1;
        });
        var self = this;
        this._paths = {
            nodes: nodes, edges: edges, adj: adj,
            // where cars appear and leave: the open ends of the public roads
            roadEnds: Object.keys(roadDeg).filter(function (id) { return roadDeg[id] === 1; }),
            // where people come and go: building fronts, the gate, and a few junctions
            stops: Object.keys(nodes).filter(function (id) { return /portal|gate/.test(nodes[id].kind); }),
            er: nodes.c_d_lr ? 'c_d_lr' : null
        };
        this._agents = [];
        if (edges.length) this._spawnAgents();
        // a building's footprint, for hiding anyone who walks behind or under it
        this._occluders = (this._campusBuildings || []).filter(function (r) { return self._geom.get(r).h > 0.5; });
    };

    // Shortest route over the edges a kind of traveller may use (a small graph, so plain Dijkstra).
    IsoMap.prototype._route = function (from, to, kinds) {
        var P = this._paths;
        if (!P || !P.nodes[from] || !P.nodes[to]) return null;
        var dist = {}, prev = {}, open = {};
        dist[from] = 0; open[from] = true;
        while (true) {
            var u = null;
            for (var k in open) if (u === null || dist[k] < dist[u]) u = k;
            if (u === null) return null;
            if (u === to) break;
            delete open[u];
            P.adj[u].forEach(function (e) {
                if (kinds.indexOf(e.kind) < 0) return;
                var d = dist[u] + e.len;
                if (dist[e.to] === undefined || d < dist[e.to]) { dist[e.to] = d; prev[e.to] = u; open[e.to] = true; }
            });
        }
        var path = [to];
        while (path[0] !== from) path.unshift(prev[path[0]]);
        return path.length > 1 ? path : null;
    };

    IsoMap.prototype._spawnAgents = function () {
        var P = this._paths, i;
        var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
        for (i = 0; i < 16 && P.stops.length > 1; i++) {
            this._agents.push({ type: 'walker', at: pick(P.stops), wait: Math.random() * 6, speed: 1.8 + Math.random() * 1.2,
                color: pick(WALKER_COLORS), side: (Math.random() - 0.5) * 1.2, phase: Math.random() * 6 });
        }
        for (i = 0; i < 5 && P.roadEnds.length > 1; i++) {
            this._agents.push({ type: 'car', at: pick(P.roadEnds), wait: Math.random() * 8, speed: 9 + Math.random() * 5,
                color: pick(CAR_COLORS), hidden: true, phase: 0 });
        }
        if (P.er && P.roadEnds.length) {
            this._agents.push({ type: 'ambulance', at: pick(P.roadEnds), wait: 3, speed: 9, color: '#f8fafc', hidden: true, toEr: true, phase: 0 });
        }
    };

    // Give an agent that has arrived its next trip.
    IsoMap.prototype._nextTrip = function (ag) {
        var P = this._paths;
        var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
        var dest, kinds;
        if (ag.type === 'walker') {
            var w = this._busyByStop || {}, total = 0;
            P.stops.forEach(function (id) { total += w[id] || 1; });
            var roll = Math.random() * total;
            dest = P.stops[0];
            for (var k = 0; k < P.stops.length; k++) { roll -= w[P.stops[k]] || 1; if (roll <= 0) { dest = P.stops[k]; break; } }
            kinds = ['walk', 'path'];
        } else if (ag.type === 'car') {
            dest = pick(P.roadEnds);
            kinds = ['road'];
        } else {
            dest = ag.toEr ? P.er : pick(P.roadEnds);
            kinds = ['road', 'walk', 'path'];
        }
        if (dest === ag.at) return false;
        var path = this._route(ag.at, dest, kinds);
        if (!path) return false;
        ag.path = path; ag.i = 0; ag.d = 0; ag.hidden = false;
        return true;
    };

    IsoMap.prototype._stepAgents = function (dt) {
        var P = this._paths;
        if (!P) return;
        for (var n = 0; n < this._agents.length; n++) {
            var ag = this._agents[n];
            ag.phase += dt * (ag.type === 'walker' ? 9 : 14);
            if (!ag.path) {
                ag.wait -= dt;
                if (ag.wait <= 0 && !this._nextTrip(ag)) ag.wait = 0.5;
                continue;
            }
            ag.d += ag.speed * dt;
            while (ag.path) {
                var a = P.nodes[ag.path[ag.i]], b = P.nodes[ag.path[ag.i + 1]];
                var len = Math.hypot(b.x - a.x, b.y - a.y);
                if (ag.d < len) break;
                ag.d -= len;
                ag.i++;
                if (ag.i >= ag.path.length - 1) {
                    // arrived: people go inside for a while, cars leave the map, the ambulance waits at ER
                    ag.at = ag.path[ag.path.length - 1];
                    ag.path = null;
                    if (ag.type === 'walker') {
                        ag.wait = 2 + Math.random() * 7; ag.hidden = true;
                        if (ag.leaving) { this._agents.splice(n, 1); n--; break; }
                    }
                    else if (ag.type === 'car') { ag.wait = 1 + Math.random() * 6; ag.hidden = true; }
                    else { ag.wait = ag.toEr ? 6 : 4 + Math.random() * 8; ag.hidden = !ag.toEr; ag.toEr = !ag.toEr; }
                }
            }
        }
    };

    // Where an agent is now, in map units, and which way it faces.
    IsoMap.prototype._agentPos = function (ag) {
        var P = this._paths;
        if (!ag.path) {
            var at = P.nodes[ag.at];
            return { x: at.x, y: at.y, dx: 1, dy: 0 };
        }
        var a = P.nodes[ag.path[ag.i]], b = P.nodes[ag.path[ag.i + 1]];
        var len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        var dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
        var t = Math.min(1, ag.d / len);
        var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        // Thailand drives on the left; people keep a little to one side of the path.
        var off = ag.type === 'walker' ? ag.side : 1.7;
        return { x: x + dy * off, y: y - dx * off, dx: dx, dy: dy };
    };

    // Hidden when a building stands between the viewer and this point, or over it.
    IsoMap.prototype._occluded = function (x, y, z) {
        var list = this._occluders || [];
        var p = this.project(x, y, z);
        for (var i = 0; i < list.length; i++) {
            var r = list[i], g = this._geom.get(r), h = this._roofOf(r);
            var samples = [z, (z + h) / 2, h];
            for (var s = 0; s < samples.length; s++) {
                if (samples[s] < z) continue;
                var w = this.unproject(p[0], p[1], samples[s]);
                if (w[0] < g.b.x1 || w[0] > g.b.x2 || w[1] < g.b.y1 || w[1] > g.b.y2) continue;
                if (pointInPoly(w[0], w[1], r.polygon)) return true;
            }
        }
        return false;
    };

    IsoMap.prototype._trafficOn = function () {
        return this.floorId === 'flr_campus' && this.traffic !== false && this._agents && this._agents.length > 0 && !REDUCED_MOTION;
    };

    IsoMap.prototype.setTraffic = function (on) {
        this.traffic = !!on;
        this.invalidate(false);
    };

    // A strip of road or path between two points, drawn flat on the ground.
    IsoMap.prototype._strip = function (ctx, a, b, w, z) {
        var len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        var nx = -(b.y - a.y) / len * w / 2, ny = (b.x - a.x) / len * w / 2;
        var pts = [[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]];
        this._polyPath(ctx, pts, z);
        ctx.fill();
    };

    IsoMap.prototype._disc = function (ctx, c, r, z) {
        var pts = [];
        for (var i = 0; i < 12; i++) pts.push([c.x + Math.cos(i * Math.PI / 6) * r, c.y + Math.sin(i * Math.PI / 6) * r]);
        this._polyPath(ctx, pts, z);
        ctx.fill();
    };

    // Static: drawn into the cached layer, under the buildings.
    IsoMap.prototype._drawPaths = function (ctx) {
        var P = this._paths;
        if (!P || !P.edges.length) return;
        var self = this;
        var walks = P.edges.filter(function (e) { return e.kind !== 'road'; });
        var roads = P.edges.filter(function (e) { return e.kind === 'road'; });
        var ends = function (list) {
            var seen = {}, out = [];
            list.forEach(function (e) { [e.a, e.b].forEach(function (n) { if (!seen[n.id]) { seen[n.id] = true; out.push(n); } }); });
            return out;
        };
        // paved walkways: a kerb, then the paving
        ctx.fillStyle = '#cfc6b0';
        walks.forEach(function (e) { self._strip(ctx, e.a, e.b, PATH_W + 0.7, 0.02); });
        ends(walks).forEach(function (n) { self._disc(ctx, n, (PATH_W + 0.7) / 2, 0.02); });
        ctx.fillStyle = '#efe9da';
        walks.forEach(function (e) { self._strip(ctx, e.a, e.b, PATH_W, 0.03); });
        ends(walks).forEach(function (n) { self._disc(ctx, n, PATH_W / 2, 0.03); });
        // roads: a pale shoulder, the asphalt, then the dashed centre line
        ctx.fillStyle = '#b8bfc7';
        roads.forEach(function (e) { self._strip(ctx, e.a, e.b, ROAD_W + 1.2, 0.04); });
        ends(roads).forEach(function (n) { self._disc(ctx, n, (ROAD_W + 1.2) / 2, 0.04); });
        ctx.fillStyle = '#5b6470';
        roads.forEach(function (e) { self._strip(ctx, e.a, e.b, ROAD_W, 0.05); });
        ends(roads).forEach(function (n) { self._disc(ctx, n, ROAD_W / 2, 0.05); });
        ctx.save();
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
        ctx.lineWidth = Math.max(1, this.scale * 0.25);
        ctx.setLineDash([Math.max(3, this.scale * 2), Math.max(3, this.scale * 2)]);
        roads.forEach(function (e) {
            var p1 = self.project(e.a.x, e.a.y, 0.06), p2 = self.project(e.b.x, e.b.y, 0.06);
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.stroke();
        });
        ctx.restore();
        // where the public roads lead
        ctx.save();
        ctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        P.roadEnds.forEach(function (id) {
            var n = P.nodes[id];
            if (!n.name) return;
            var p = self.project(n.x, n.y, 0.1);
            ctx.lineWidth = 3.5;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeText(n.name, p[0], p[1] - 12);
            ctx.fillStyle = PALETTE.slate600;
            ctx.fillText(n.name, p[0], p[1] - 12);
        });
        ctx.restore();
    };

    // Per frame: the people and cars, in depth order, hidden where a building is in the way.
    IsoMap.prototype._drawAgents = function (ctx) {
        if (!this._trafficOn()) return;
        var self = this, list = [];
        this._agents.forEach(function (ag) {
            if (ag.hidden) return;
            var pos = self._agentPos(ag);
            if (self._occluded(pos.x, pos.y, ag.type === 'walker' ? 0.4 : 0.6)) return;
            list.push({ ag: ag, pos: pos, depth: self._depth(pos.x, pos.y) });
        });
        list.sort(function (a, b) { return a.depth - b.depth; });
        list.forEach(function (it) {
            if (it.ag.type === 'walker') self._drawWalker(ctx, it.ag, it.pos);
            else self._drawCar(ctx, it.ag, it.pos);
        });
    };

    IsoMap.prototype._drawWalker = function (ctx, ag, pos) {
        var p = this.project(pos.x, pos.y, 0);
        var H = Math.max(6, Math.min(18, this.scale * 2.2));
        var moving = !!ag.path;
        var bob = moving ? Math.abs(Math.sin(ag.phase)) * H * 0.06 : 0;
        var x = p[0], y = p[1] - bob;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.beginPath();
        ctx.ellipse(p[0], p[1], H * 0.28, H * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        if (H >= 9) {
            // legs swinging
            var swing = moving ? Math.sin(ag.phase) * H * 0.12 : 0;
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = Math.max(1.2, H * 0.09);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - H * 0.06, y - H * 0.42); ctx.lineTo(x - H * 0.06 + swing, y);
            ctx.moveTo(x + H * 0.06, y - H * 0.42); ctx.lineTo(x + H * 0.06 - swing, y);
            ctx.stroke();
        }
        roundRectPath(ctx, x - H * 0.18, y - H * 0.82, H * 0.36, H * (H >= 9 ? 0.45 : 0.8), H * 0.12);
        ctx.fillStyle = ag.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y - H * 0.92, H * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#f1c7a5';
        ctx.fill();
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(x, y - H * 0.96, H * 0.15, Math.PI, Math.PI * 2);
        ctx.fill();
    };

    IsoMap.prototype._drawCar = function (ctx, ag, pos) {
        var L = 4.4, W = 2.1, dx = pos.dx, dy = pos.dy;
        var box = function (cx, cy, l, w) {
            var hx = dx * l / 2, hy = dy * l / 2, wx = -dy * w / 2, wy = dx * w / 2;
            return [[cx - hx - wx, cy - hy - wy], [cx + hx - wx, cy + hy - wy], [cx + hx + wx, cy + hy + wy], [cx - hx + wx, cy - hy + wy]];
        };
        // ground shadow
        var base = box(pos.x, pos.y, L + 0.4, W + 0.4);
        this._polyPath(ctx, base, 0.07);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.fill();
        var body = box(pos.x, pos.y, L, W);
        var sign = signedArea(body) >= 0 ? 1 : -1;
        this._drawPrism(ctx, body, sign, 0.25, 1.15, ag.color, { top: shade(ag.color, 1.12), edge: 'rgba(15, 23, 42, 0.3)' });
        var cab = box(pos.x - dx * 0.35, pos.y - dy * 0.35, L * 0.5, W * 0.86);
        this._drawPrism(ctx, cab, sign, 1.15, 1.85, ag.type === 'ambulance' ? '#f8fafc' : '#cbd5e1', { top: ag.type === 'ambulance' ? '#ffffff' : shade(ag.color, 1.2), edge: 'rgba(15, 23, 42, 0.3)' });
        if (ag.type === 'ambulance') {
            var top = this.project(pos.x - dx * 0.35, pos.y - dy * 0.35, 1.9);
            var s = Math.max(4, this.scale * 0.8);
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(top[0] - s / 2, top[1] - s / 6, s, s / 3);
            ctx.fillRect(top[0] - s / 6, top[1] - s / 2, s / 3, s);
            // flashing light bar
            var lamp = this.project(pos.x + dx * 0.4, pos.y + dy * 0.4, 1.95);
            var on = Math.floor(ag.phase / 3) % 2 === 0;
            ctx.beginPath();
            ctx.arc(lamp[0], lamp[1], Math.max(2.5, this.scale * 0.45), 0, Math.PI * 2);
            ctx.fillStyle = on ? '#ef4444' : '#3b82f6';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(lamp[0], lamp[1], Math.max(5, this.scale * 1.1), 0, Math.PI * 2);
            ctx.fillStyle = on ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)';
            ctx.fill();
        }
    };

    // Public API
    var pendingLoad = null;
    window.ScpHosMap = {
        IsoMap: IsoMap,
        loadMapData: function (callback) {
            if (window.__scpHosMapData) {
                callback(null, window.__scpHosMapData);
                return;
            }
            // Share one request between callers that ask before it finishes.
            if (!pendingLoad) {
                pendingLoad = fetch('maps/sichomphu_map.json')
                    .then(function (res) {
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        return res.json();
                    })
                    .then(function (data) {
                        window.__scpHosMapData = data;
                        return data;
                    })
                    .catch(function (err) { pendingLoad = null; throw err; });
            }
            pendingLoad.then(function (data) { callback(null, data); }, function (err) { callback(err, null); });
        }
    };
})();
