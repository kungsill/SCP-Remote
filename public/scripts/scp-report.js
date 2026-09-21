// SCP-Remote: a status report for the whole fleet, made to be read on screen, printed, or
// saved as a PDF for a meeting or a handover.
//
// It invents no numbers of its own. Every computer, every online/offline count and every
// "needs attention" line comes straight from ScpDashboard.snapshot(), which is the same
// reading the dashboard panel shows -- so the paper in someone's hand always matches the
// screen it was printed from. The summarise step below is a plain function with no page in
// it, which is what the tests exercise; the drawing around it only turns that result into
// rows and a print layout.
(function (root) {
    'use strict';
    var thai = (typeof document !== 'undefined') && document.documentElement.lang === 'th';
    function t(en, th) { return thai ? th : en; }
    function el(tag, text, className) {
        var n = document.createElement(tag);
        if (text != null) { n.textContent = text; }
        if (className) { n.className = className; }
        return n;
    }
    function button(text, className, fn) { var b = el('button', text, className); b.type = 'button'; b.onclick = fn; return b; }

    // Turn a fleet snapshot into the report's sections. Pure: give it the same input and it
    // gives the same output, with no reference to the document, so it can be tested directly.
    // watchedIds may be null when the watch list has not been loaded (or the operator has no
    // access); the watched section is then simply left out rather than shown empty.
    function summarize(snap, watchedIds) {
        snap = snap || {};
        var nodes = Array.isArray(snap.nodes) ? snap.nodes : [];
        var groups = Array.isArray(snap.groups) ? snap.groups : [];
        var attention = nodes.filter(function (node) { return node.risks && node.risks.length; })
            .sort(function (a, b) {
                if ((b.high || 0) !== (a.high || 0)) { return (b.high || 0) - (a.high || 0); }
                if ((b.warn || 0) !== (a.warn || 0)) { return (b.warn || 0) - (a.warn || 0); }
                return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en');
            });
        // Offline computers, worst-forgotten first: one that has never connected since it was
        // added (away === -1), then the longest-absent, then by name. A null away means the
        // last-seen list has not arrived yet, so it sorts after the known ones.
        var away = nodes.filter(function (node) { return !node.online; })
            .sort(function (a, b) {
                var aa = a.away == null ? -2 : a.away, bb = b.away == null ? -2 : b.away;
                var ar = aa === -1 ? Infinity : aa, br = bb === -1 ? Infinity : bb;
                if (br !== ar) { return br - ar; }
                return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en');
            });
        var watched = null;
        if (Array.isArray(watchedIds)) {
            var set = {};
            watchedIds.forEach(function (id) { set[id] = true; });
            watched = nodes.filter(function (node) { return set[node.id]; })
                .sort(function (a, b) {
                    if (a.online !== b.online) { return a.online ? 1 : -1; }
                    return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en');
                });
        }
        var total = typeof snap.total === 'number' ? snap.total : nodes.length;
        var online = typeof snap.online === 'number' ? snap.online : nodes.filter(function (n) { return n.online; }).length;
        return {
            at: snap.at || Date.now(),
            total: total, online: online, offline: total - online,
            highCount: attention.filter(function (n) { return n.high; }).length,
            attentionCount: attention.length,
            departments: groups, attention: attention, away: away, watched: watched
        };
    }

    function whenText(at) {
        var d = new Date(at);
        if (isNaN(d.getTime())) { return ''; }
        try { return d.toLocaleString(thai ? 'th-TH' : 'en-GB'); } catch (error) { return d.toISOString(); }
    }

    function awayText(days) {
        if (days == null) { return t('offline', 'ออฟไลน์'); }
        if (days === -1) { return t('never connected', 'ไม่เคยเชื่อมต่อเลย'); }
        if (days === 0) { return t('offline today', 'ออฟไลน์วันนี้'); }
        return t('away {0} days', 'หายไป {0} วัน').replace('{0}', days);
    }

    function statCard(number, label, tone) {
        var card = el('div', null, 'scp-report-stat' + (tone ? ' scp-report-stat-' + tone : ''));
        card.appendChild(el('strong', String(number)));
        card.appendChild(el('span', label));
        return card;
    }

    function riskLine(node) {
        var line = el('li', null, node.high ? 'scp-report-high' : 'scp-report-warn');
        var head = el('div', null, 'scp-report-risk-head');
        head.appendChild(el('strong', node.name || t('(no name)', '(ไม่มีชื่อ)')));
        head.appendChild(el('span', node.room || ''));
        if (!node.online) { head.appendChild(el('span', t('offline', 'ออฟไลน์'), 'scp-report-off')); }
        line.appendChild(head);
        var reasons = el('ul', null, 'scp-report-reasons');
        (node.risks || []).forEach(function (risk) {
            reasons.appendChild(el('li', risk.text, risk.level === 'high' ? 'scp-report-r-high' : 'scp-report-r-warn'));
        });
        line.appendChild(reasons);
        return line;
    }

    // Build the whole report body from a summarised result. Used for the on-screen dialog and,
    // rebuilt fresh, for the print copy -- one drawing path, so the two can never drift.
    function buildBody(data) {
        var body = el('div', null, 'scp-report-body');

        var when = el('p', t('Generated ', 'ออกรายงานเมื่อ ') + whenText(data.at), 'scp-report-when');
        body.appendChild(when);

        var stats = el('div', null, 'scp-report-stats');
        stats.appendChild(statCard(data.total, t('computers', 'เครื่องทั้งหมด')));
        stats.appendChild(statCard(data.online, t('online', 'ออนไลน์'), 'ok'));
        stats.appendChild(statCard(data.offline, t('offline', 'ออฟไลน์'), data.offline ? 'off' : ''));
        stats.appendChild(statCard(data.attentionCount, t('need attention', 'ต้องดูแล'), data.attentionCount ? 'warn' : ''));
        body.appendChild(stats);

        // By department.
        body.appendChild(el('h3', t('By department', 'แยกตามหน่วยงาน')));
        var table = el('table', null, 'scp-report-table');
        var thead = el('thead'), htr = el('tr');
        [t('Department', 'หน่วยงาน'), t('Total', 'ทั้งหมด'), t('Online', 'ออนไลน์'), t('Offline', 'ออฟไลน์'), t('Attention', 'ต้องดูแล')]
            .forEach(function (h) { htr.appendChild(el('th', h)); });
        thead.appendChild(htr); table.appendChild(thead);
        var tbody = el('tbody');
        if (!data.departments.length) { var er = el('tr'); var ec = el('td', t('No computers.', 'ไม่มีเครื่อง')); ec.colSpan = 5; er.appendChild(ec); tbody.appendChild(er); }
        data.departments.forEach(function (group) {
            var tr = el('tr');
            tr.appendChild(el('td', group.name));
            tr.appendChild(el('td', String(group.total)));
            tr.appendChild(el('td', String(group.online)));
            var off = el('td', String(group.offline)); if (group.offline) { off.className = 'scp-report-off'; } tr.appendChild(off);
            var att = el('td', String(group.attention)); if (group.attention) { att.className = 'scp-report-warn'; } tr.appendChild(att);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody); body.appendChild(table);

        // Needs attention.
        body.appendChild(el('h3', t('Needs attention', 'ต้องดูแล') + ' (' + data.attentionCount + ')'));
        if (!data.attention.length) {
            body.appendChild(el('p', t('Nothing needs attention right now.', 'ตอนนี้ไม่มีเรื่องต้องดูแล'), 'scp-report-clear'));
        } else {
            var list = el('ul', null, 'scp-report-list');
            data.attention.forEach(function (node) { list.appendChild(riskLine(node)); });
            body.appendChild(list);
        }

        // Watched computers, when the list was available.
        if (data.watched) {
            body.appendChild(el('h3', t('Watched computers', 'เครื่องที่เฝ้าระวัง') + ' (' + data.watched.length + ')'));
            if (!data.watched.length) {
                body.appendChild(el('p', t('No computers are flagged to be watched.', 'ยังไม่ได้ติดธงเฝ้าระวังเครื่องใด'), 'scp-report-clear'));
            } else {
                var wl = el('ul', null, 'scp-report-plain');
                data.watched.forEach(function (node) {
                    var li = el('li');
                    li.appendChild(el('strong', node.name || ''));
                    li.appendChild(el('span', ' · ' + (node.room || '')));
                    li.appendChild(el('span', ' · ' + (node.online ? t('online', 'ออนไลน์') : awayText(node.away)),
                        node.online ? 'scp-report-ok' : 'scp-report-off'));
                    wl.appendChild(li);
                });
                body.appendChild(wl);
            }
        }

        // Offline / away.
        body.appendChild(el('h3', t('Offline', 'ออฟไลน์') + ' (' + data.away.length + ')'));
        if (!data.away.length) {
            body.appendChild(el('p', t('Every computer is online.', 'ทุกเครื่องออนไลน์'), 'scp-report-clear'));
        } else {
            var ol = el('ul', null, 'scp-report-plain');
            data.away.forEach(function (node) {
                var li = el('li');
                li.appendChild(el('strong', node.name || ''));
                li.appendChild(el('span', ' · ' + (node.room || '')));
                li.appendChild(el('span', ' · ' + awayText(node.away), 'scp-report-off'));
                ol.appendChild(li);
            });
            body.appendChild(ol);
        }

        return body;
    }

    var dialog, bodyBox, lastData = null;

    function draw() {
        if (!bodyBox || !lastData) { return; }
        bodyBox.textContent = '';
        bodyBox.appendChild(buildBody(lastData));
    }

    // Print / save as PDF. The dialog lives in the browser's top layer, which prints
    // unevenly across browsers, so a fresh copy of the report is dropped into an ordinary
    // element and everything else on the page is hidden for the print only.
    function printReport() {
        if (!lastData) { return; }
        var printRoot = el('div', null, 'scp-print-root');
        var title = el('h1', t('SCP-Remote — fleet report', 'SCP-Remote — รายงานสถานะเครื่อง'), 'scp-report-title');
        printRoot.appendChild(title);
        printRoot.appendChild(buildBody(lastData));
        document.body.appendChild(printRoot);
        document.documentElement.classList.add('scp-printing');
        var cleaned = false;
        function clean() {
            if (cleaned) { return; } cleaned = true;
            document.documentElement.classList.remove('scp-printing');
            if (printRoot.parentNode) { printRoot.parentNode.removeChild(printRoot); }
            root.removeEventListener('afterprint', clean);
        }
        root.addEventListener('afterprint', clean);
        // A guard in case afterprint never fires (some environments do not raise it).
        root.setTimeout(clean, 60000);
        try { root.print(); } catch (error) { clean(); }
    }

    function refresh() {
        var snap = (root.ScpDashboard && root.ScpDashboard.snapshot) ? root.ScpDashboard.snapshot() : { nodes: [], groups: [] };
        // The watch list is an extra, not a requirement: if the operation is missing or
        // fails, the report still renders with everything else.
        var watchedIds;
        var render = function () { lastData = summarize(snap, watchedIds); draw(); };
        if (root.ScpOperations && root.ScpOperations.request) {
            root.ScpOperations.request('alertWatch').then(function (ids) {
                watchedIds = Array.isArray(ids) ? ids : [];
                render();
            }).catch(function () { render(); });
        }
        // Draw immediately with what we already have; the watch section fills in when it
        // arrives (or stays out if it does not).
        render();
    }

    function open() {
        if (!dialog) {
            dialog = el('dialog'); dialog.id = 'scpReport';
            var head = el('header');
            head.appendChild(el('h2', t('Fleet report', 'รายงานสถานะเครื่อง')));
            head.appendChild(button(t('Print / Save PDF', 'พิมพ์ / บันทึก PDF'), 'scp-report-print-btn', printReport));
            head.appendChild(button(t('Refresh', 'รีเฟรช'), '', refresh));
            head.appendChild(button(t('Close', 'ปิด'), '', function () { dialog.close(); }));
            dialog.appendChild(head);
            bodyBox = el('div', null, 'scp-report-scroll');
            dialog.appendChild(bodyBox);
            document.body.appendChild(dialog);
        }
        if (!dialog.open) { dialog.showModal(); }
        refresh();
    }

    root.ScpReport = { open: open, summarize: summarize, _buildBody: buildBody };
}(typeof window === 'undefined' ? globalThis : window));
