/* SCP-Remote: the My Events page (p3) as "what happened", not one line per log record.
 *
 * One remote session leaves six or seven records (consent asked, desktop started, files started,
 * connection bar, file access, desktop ended, files ended) full of session ids. Here they become
 * one line: who remoted which computer, for how long, through the program or the website, with
 * file transfer, and whether the person at the computer closed it or refused. Failed sign-ins
 * and those refusals are marked in red. "Device powered on" records, which are most of the log,
 * are folded into one line a day.
 *
 * The records themselves are untouched: this reads the page's own `events` after its own
 * eventsUpdate() has run, each line opens to show the records it was made from, and
 * "Detailed log" shows MeshCentral's own list again. That list is the evidence of who viewed
 * which screen and when, so it must stay one press away.
 */
(function (root) {
    'use strict';
    if (root.ScpEvents) return;
    var doc = root.document;
    var thai = function () { return (doc.documentElement.lang || '').indexOf('th') === 0; };
    var t = function (en, th) { return thai() ? th : en; };
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    // MeshCentral message ids (eventsMessageId in views/default.handlebars)
    var START_DESKTOP = 15, END_DESKTOP = 11, START_FILES = 16, END_FILES = 12;
    var FORCED_CLOSE = [29, 33, 39], REJECTED = [34, 41], POWER_ON = 159;
    var LOGIN = 107, LOGOUT = 2, FAILED_LOGIN = [108, 109, 110];
    var NEAR = 15000; // records of one session arrive within a few seconds of its start and end

    function when(e) { var d = new Date(e.time); return isNaN(d) ? 0 : d.getTime(); }
    function arg(e, i) { return e.msgArgs && e.msgArgs[i] != null ? e.msgArgs[i] : null; }

    // Turn the page's newest-first records into items, oldest first.
    function build(events) {
        var list = (events || []).filter(function (e) { return e && e.msg; }).slice().sort(function (a, b) { return when(a) - when(b); });
        var items = [], sessions = Object.create(null), open = [];
        var powerByDay = {};
        function sessionFor(e) {
            var at = when(e), best = null;
            for (var i = open.length - 1; i >= 0; i--) {
                var s = open[i];
                if (s.nodeid !== e.nodeid) continue;
                if (e.username && s.user !== e.username) continue;
                if (e.guestname && s.guest !== e.guestname) continue;
                var end = s.end == null ? Infinity : s.end;
                if (at >= s.start - NEAR && at <= end + NEAR) {
                    // Without a session id, overlapping sessions cannot be attributed safely.
                    if (best) return null;
                    best = s;
                }
            }
            return best;
        }
        // pass 1: desktop sessions
        list.forEach(function (e) {
            if (e.msgid === START_DESKTOP) {
                var s = { kind: 'remote', id: arg(e, 0), nodeid: e.nodeid, user: e.username || '', via: (e.guestname && /^SCP-App:/.test(e.guestname)) ? 'app' : (e.guestname ? 'share' : 'web'), start: when(e), end: null, secs: null, files: false, forced: false, rejected: false, records: [e] };
                s.guest = e.guestname || '';
                sessions[s.id] = s; open.push(s); items.push(s);
            }
        });
        list.forEach(function (e) {
            if (e.msgid === END_DESKTOP && sessions[arg(e, 0)]) { var s = sessions[arg(e, 0)]; s.end = when(e); s.secs = typeof arg(e, 3) === 'number' ? arg(e, 3) : Math.round((s.end - s.start) / 1000); s.records.push(e); }
        });
        // pass 2: everything else, attached to a session where it belongs
        list.forEach(function (e) {
            if (e.msgid === START_DESKTOP || (e.msgid === END_DESKTOP && sessions[arg(e, 0)])) return;
            var at = when(e);
            if (e.msgid === POWER_ON) {
                var day = new Date(at); day.setHours(0, 0, 0, 0);
                var k = day.getTime();
                if (!powerByDay[k]) { powerByDay[k] = { kind: 'power', start: at, nodes: {}, records: [] }; items.push(powerByDay[k]); }
                powerByDay[k].nodes[e.nodeid] = true; powerByDay[k].records.push(e); powerByDay[k].start = Math.max(powerByDay[k].start, at);
                return;
            }
            var related = e.msgid === START_FILES || e.msgid === END_FILES ||
                (e.msgid >= 29 && e.msgid <= 43 && e.action === 'agentlog') ||
                (e.action === 'addedDeviceShare' && /^SCP-Remote app requested consent:/.test(e.msg));
            if (e.nodeid && related) {
                var s = sessionFor(e);
                if (s) {
                    s.records.push(e);
                    if (e.msgid === START_FILES || e.msgid === END_FILES) s.files = true;
                    if (FORCED_CLOSE.indexOf(e.msgid) >= 0) s.forced = true;
                    if (REJECTED.indexOf(e.msgid) >= 0) s.rejected = true;
                    return;
                }
            }
            var item = { kind: 'other', nodeid: e.nodeid || null, user: e.username || '', start: at, records: [e] };
            if (e.msgid === LOGIN) item.kind = 'login';
            else if (e.msgid === LOGOUT) item.kind = 'logout';
            else if (FAILED_LOGIN.indexOf(e.msgid) >= 0 || e.action === 'authfail') item.kind = 'fail';
            else if (REJECTED.indexOf(e.msgid) >= 0) item.kind = 'rejected';
            else if (e.msgid === START_FILES || e.msgid === END_FILES) item.kind = 'files';
            if (item.kind === 'login' || item.kind === 'fail') { item.from = arg(e, 0); item.agent = arg(e, 1); }
            items.push(item);
        });
        items.forEach(function (it) { it.warn = it.kind === 'fail' || it.kind === 'rejected' || it.forced === true || it.rejected === true; });
        return items.sort(function (a, b) { return b.start - a.start; });
    }

    function nodeName(id) {
        if (!id) return '';
        var n = typeof root.getNodeFromId === 'function' ? root.getNodeFromId(id) : null;
        if (!n && root.nodes) { var l = Array.isArray(root.nodes) ? root.nodes : Object.keys(root.nodes).map(function (k) { return root.nodes[k]; }); n = l.filter(function (x) { return x && x._id === id; })[0]; }
        return n ? n.name : t('(computer no longer listed)', '(เครื่องที่ไม่อยู่ในรายการแล้ว)');
    }
    function duration(secs) {
        if (secs == null) return t('no end record in this list', 'ไม่พบบันทึกจบในรายการนี้');
        if (secs < 60) return secs + t(' s', ' วินาที');
        var m = Math.round(secs / 60);
        return m < 60 ? m + t(' min', ' นาที') : Math.floor(m / 60) + t(' h ', ' ชม. ') + (m % 60) + t(' min', ' นาที');
    }
    function browser(ua) { ua = String(ua || ''); return /Edge?\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua.split(',')[0]; }
    function place(ip) { ip = String(ip || ''); if (!ip) return ''; if (ip === '::1' || ip === '127.0.0.1') return t('local server or proxy ', 'ผ่านเครื่องเซิร์ฟเวอร์หรือพร็อกซี ') + ip; if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return t('private network ', 'เครือข่ายภายใน ') + ip; return ip; }
    function hhmm(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function dayLabel(ms) {
        var d = new Date(ms); d.setHours(0, 0, 0, 0);
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var diff = Math.round((today - d) / 86400000);
        if (diff === 0) return t('Today', 'วันนี้');
        if (diff === 1) return t('Yesterday', 'เมื่อวาน');
        return d.toLocaleDateString(thai() ? 'th-TH' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    function raw(e) {
        var msg = String(e.msg || '');
        var table = root.eventsMessageId;
        if (table && e.msgid != null && table[e.msgid]) {
            msg = String(table[e.msgid]);
            (e.msgArgs || []).forEach(function (a, i) { msg = msg.split('{' + i + '}').join(Array.isArray(a) ? a.join(', ') : String(a)); });
        }
        return hhmm(when(e)) + ':' + ('0' + new Date(when(e)).getSeconds()).slice(-2) + '  ' + (e.username ? e.username + (e.guestname ? ' / ' + e.guestname : '') + ' → ' : '') + (e.nodeid ? nodeName(e.nodeid) + ' → ' : '') + msg + (e.remoteaddr ? ' (' + e.remoteaddr + ')' : '');
    }

    function describe(it) {
        var who = it.user || '';
        switch (it.kind) {
            case 'remote': {
                var chips = [duration(it.secs), it.via === 'app' ? t('SCP-Remote program', 'ผ่านโปรแกรม') : it.via === 'share' ? t('shared link', 'ผ่านลิงก์แชร์') : t('website', 'ผ่านเว็บ')];
                if (it.files) chips.push(t('file channel opened', 'เปิดช่องทางรับส่งไฟล์'));
                if (it.forced) chips.push(t('the person there closed it', 'ผู้ใช้กดปิดการเชื่อมต่อเอง'));
                if (it.rejected) chips.push(t('the person there refused', 'ผู้ใช้กดปฏิเสธ'));
                return { icon: 'remote', title: [who, t('remoted', 'รีโมต'), nodeName(it.nodeid)], node: it.nodeid, chips: chips };
            }
            case 'login': return { icon: 'login', title: [who, t('signed in', 'เข้าสู่ระบบ')], chips: [browser(it.agent), place(it.from)].filter(Boolean) };
            case 'logout': return { icon: 'logout', title: [who, t('signed out', 'ออกจากระบบ')], chips: [] };
            case 'fail': return { icon: 'fail', title: [who || t('someone', 'มีคน'), t('failed to sign in', 'เข้าสู่ระบบไม่สำเร็จ')], chips: [browser(it.agent), place(it.from)].filter(Boolean) };
            case 'rejected': return { icon: 'fail', title: [nodeName(it.nodeid), t('— the person there refused remote access', '— ผู้ใช้ปฏิเสธการรีโมต')], node: it.nodeid, chips: [] };
            case 'files': return { icon: 'files', title: [who, t('opened files on', 'เปิดไฟล์ของ'), nodeName(it.nodeid)], node: it.nodeid, chips: [] };
            case 'power': return { icon: 'power', title: [Object.keys(it.nodes).length + t(' computers switched on', ' เครื่องถูกเปิดขึ้น')], chips: [] };
            default: {
                var e = it.records[0];
                var text = raw(e).replace(/^\d\d:\d\d:\d\d\s+/, '');
                return { icon: 'other', title: [text], chips: [] };
            }
        }
    }

    var filter = 'all', search = '', open = {};
    function readPref(k, d) { try { var v = root.localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
    function writePref(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { } }
    var showRaw = readPref('scpEventsRaw', '0') === '1';

    function matches(it, d) {
        if (filter === 'remote' && it.kind !== 'remote' && it.kind !== 'files') return false;
        if (filter === 'login' && ['login', 'logout', 'fail'].indexOf(it.kind) < 0) return false;
        if (filter === 'warn' && !it.warn) return false;
        if (!search) return true;
        var hay = (d.title.join(' ') + ' ' + d.chips.join(' ') + ' ' + it.records.map(raw).join(' ')).toLowerCase();
        return hay.indexOf(search) >= 0;
    }

    function draw() {
        var host = doc.getElementById('scpEventsView'), page = doc.getElementById('p3events');
        if (!host || !page) return;
        page.classList.toggle('scp-ev-hidden', !showRaw);
        host.classList.toggle('scp-ev-hidden', showRaw);
        var rawBtn = doc.getElementById('scpEventsRaw');
        if (rawBtn) rawBtn.textContent = showRaw ? t('Show summary', 'ดูแบบสรุป') : t('Detailed log', 'ดูแบบละเอียด');
        if (showRaw) return;
        var items = build(root.events);
        host.textContent = '';

        // today in one line
        var midnight = new Date(); midnight.setHours(0, 0, 0, 0);
        var today = items.filter(function (i) { return i.start >= midnight.getTime(); });
        var remotes = today.filter(function (i) { return i.kind === 'remote'; });
        var computers = {}; remotes.forEach(function (r) { computers[r.nodeid] = true; });
        var fails = today.filter(function (i) { return i.kind === 'fail'; }).length;
        var sum = el('div', 'scp-ev-summary');
        sum.appendChild(el('span', 'scp-ev-stat', t('Today (loaded records): ', 'วันนี้ (จากบันทึกที่โหลด): ') + remotes.length + t(' remote sessions', ' ครั้งที่รีโมต')));
        sum.appendChild(el('span', 'scp-ev-stat', Object.keys(computers).length + t(' computers', ' เครื่อง')));
        sum.appendChild(el('span', 'scp-ev-stat' + (fails ? ' warn' : ''), t('Failed sign-ins ', 'เข้าสู่ระบบไม่สำเร็จ ') + fails));
        host.appendChild(sum);

        var shown = 0, lastDay = null, box = null;
        items.forEach(function (it, index) {
            var d = describe(it);
            if (!matches(it, d)) return;
            shown++;
            var day = dayLabel(it.start);
            if (day !== lastDay) { lastDay = day; host.appendChild(el('h3', 'scp-ev-day', day)); box = el('div', 'scp-ev-list'); host.appendChild(box); }
            var key = it.kind + ':' + it.start + ':' + (it.nodeid || '') + ':' + index;
            var row = el('div', 'scp-ev-row scp-ev-' + d.icon + (it.warn ? ' warn' : ''));
            var line = el('button', 'scp-ev-line');
            line.type = 'button';
            line.setAttribute('aria-expanded', String(!!open[key]));
            line.appendChild(el('span', 'scp-ev-time', hhmm(it.start)));
            line.appendChild(el('span', 'scp-ev-icon'));
            var text = el('span', 'scp-ev-text');
            d.title.forEach(function (part, i) { text.appendChild(el(i === 2 || (i === 0 && (it.kind === 'rejected' || it.kind === 'power')) ? 'strong' : 'span', '', part + ' ')); });
            if (d.chips.length) { var chips = el('span', 'scp-ev-chips'); d.chips.forEach(function (c) { chips.appendChild(el('span', 'scp-ev-chip', c)); }); text.appendChild(chips); }
            line.appendChild(text);
            line.appendChild(el('span', 'scp-ev-more', it.records.length > 1 ? it.records.length + t(' records', ' บันทึก') : ''));
            line.addEventListener('click', function () { open[key] = !open[key]; draw(); });
            row.appendChild(line);
            if (open[key]) {
                var detail = el('div', 'scp-ev-detail');
                it.records.slice().sort(function (a, b) { return when(a) - when(b); }).forEach(function (e) {
                    var r = el('button', 'scp-ev-rec', raw(e));
                    r.type = 'button';
                    if (typeof root.showEventDetails === 'function' && e.h != null) { r.title = t('Full record', 'ดูบันทึกเต็ม'); r.addEventListener('click', function () { root.showEventDetails(e.h, 2); }); }
                    detail.appendChild(r);
                });
                if (d.node && typeof root.gotoDevice === 'function') {
                    var go = el('button', 'scp-ev-go', t('Open this computer', 'เปิดหน้าเครื่องนี้'));
                    go.type = 'button';
                    go.addEventListener('click', function () { root.gotoDevice(d.node, 10); });
                    detail.appendChild(go);
                }
                row.appendChild(detail);
            }
            box.appendChild(row);
        });
        if (!shown) host.appendChild(el('p', 'scp-ev-empty', items.length ? t('Nothing matches.', 'ไม่พบรายการที่ตรงกับตัวกรอง') : t('No events yet.', 'ยังไม่มีเหตุการณ์')));
        var more = doc.getElementById('p3limitdropdown');
        if (more && more.value && more.selectedIndex < more.options.length - 1) host.appendChild(el('p', 'scp-ev-hint', t('Showing the latest records only. Choose more under "Show" to look further back.', 'แสดงเฉพาะบันทึกล่าสุด ถ้าต้องการย้อนหลังมากขึ้น เลือกจำนวนที่ช่อง "แสดง" ด้านบน')));
    }

    function build_ui() {
        var page = doc.getElementById('p3events');
        if (!page || doc.getElementById('scpEventsView')) return !!page;
        doc.body.classList.add('scp-events-page');
        var bar = el('div', 'scp-ev-bar');
        [['all', t('All', 'ทั้งหมด')], ['remote', t('Remote', 'รีโมต')], ['login', t('Sign-ins', 'เข้าสู่ระบบ')], ['warn', t('Needs a look', 'ต้องดู')]].forEach(function (f) {
            var b = el('button', 'scp-ev-filter' + (filter === f[0] ? ' on' : ''), f[1]);
            b.type = 'button'; b.dataset.filter = f[0];
            b.addEventListener('click', function () {
                filter = f[0];
                Array.prototype.forEach.call(bar.querySelectorAll('.scp-ev-filter'), function (x) { x.classList.toggle('on', x.dataset.filter === filter); });
                draw();
            });
            bar.appendChild(b);
        });
        var find = el('input', 'scp-ev-find');
        find.type = 'search';
        find.placeholder = t('Find a computer, user or IP', 'ค้นหาเครื่อง ผู้ใช้ หรือ IP');
        find.setAttribute('aria-label', find.placeholder);
        find.addEventListener('input', function () { search = find.value.trim().toLowerCase(); draw(); });
        bar.appendChild(find);
        var rawBtn = el('button', 'scp-ev-filter scp-ev-raw');
        rawBtn.type = 'button'; rawBtn.id = 'scpEventsRaw';
        rawBtn.addEventListener('click', function () { showRaw = !showRaw; writePref('scpEventsRaw', showRaw ? '1' : '0'); draw(); });
        bar.appendChild(rawBtn);
        var view = el('div', 'scp-ev-view'); view.id = 'scpEventsView';
        page.parentNode.insertBefore(bar, page);
        page.parentNode.insertBefore(view, page);
        return true;
    }

    function hook() {
        var original = root.eventsUpdate;
        if (typeof original !== 'function' || original.scpEvents) return false;
        root.eventsUpdate = function () { var r = original.apply(this, arguments); try { if (build_ui()) draw(); } catch (e) {
            var page = doc.getElementById('p3events'), view = doc.getElementById('scpEventsView');
            if (page) page.classList.remove('scp-ev-hidden');
            if (view) view.classList.add('scp-ev-hidden');
        } return r; };
        root.eventsUpdate.scpEvents = true;
        return true;
    }
    (function wait(n) { if (!hook() && n < 80) setTimeout(function () { wait(n + 1); }, 250); else if (build_ui()) draw(); })(0);
    root.ScpEvents = { build: build, draw: draw, hook: hook, ui: build_ui };
})(window);
