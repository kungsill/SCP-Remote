/* SCP-Remote: a computer's General page (p10), made easy to read.
 *
 * MeshCentral writes this page as one long two-column table followed by a row of small buttons.
 * Each time it does, this regroups the same rows into three cards - the computer, its security,
 * and who is using it - under a line that says at a glance whether it is on, its IP, who is
 * signed in, with Remote and Files buttons. A security row reporting something switched off
 * (MeshCentral colours it red) is marked so it stands out. The page's own buttons are kept, in a
 * card of their own.
 *
 * Nothing is rewritten: the rows and buttons are the page's own elements, moved, with their own
 * onclick. The page redraws this panel whenever the computer changes, so it is watched and
 * tidied again each time.
 */
(function (root) {
    'use strict';
    if (root.ScpDevice) return;
    var doc = root.document;
    var thai = function () { return (doc.documentElement.lang || '').indexOf('th') === 0; };
    var t = function (en, th) { return thai() ? th : en; };
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    var SECURITY = /ความปลอดภัย|Security|Defender|Antivirus|แอนตี้ไวรัส|รอรีสตาร์ต|Pending Reboot|Firewall|BitLocker|TPM/i;
    var USAGE = /ผู้ใช้|User|ไม่ใช้งาน|Idle|ความยินยอม|Consent|แจ้งเตือน|Notif|แท็ก|Tags|เซสชัน|Session|Logged/i;

    function isRed(node) {
        var bad = node.querySelectorAll('[style*="red"], [color="red"], font[color]');
        for (var i = 0; i < bad.length; i++) {
            var s = (bad[i].getAttribute('style') || '') + ' ' + (bad[i].getAttribute('color') || '');
            if (/red|#f00|#ff0000|#c00/i.test(s)) return true;
        }
        return false;
    }

    function tidy(box) {
        // the page replaces the panel's contents each time it draws it, so 'already tidied' is read from the contents
        if (!box || box.querySelector('.scp-dev-top')) return;
        var table = box.querySelector('table');
        if (!table) return;
        doc.body.classList.add('scp-device-page');

        var cards = {
            info: { title: t('This computer', 'ข้อมูลเครื่อง'), rows: [] },
            security: { title: t('Security', 'ความปลอดภัย'), rows: [] },
            usage: { title: t('In use', 'การใช้งาน'), rows: [] }
        };
        Array.prototype.slice.call(table.querySelectorAll('tr')).forEach(function (tr) {
            var cells = tr.children;
            if (cells.length < 2) return;
            var label = (cells[0].textContent || '').trim();
            var which = SECURITY.test(label) ? 'security' : (USAGE.test(label) ? 'usage' : 'info');
            if (which === 'security' && isRed(cells[1])) tr.classList.add('scp-dev-warn');
            cards[which].rows.push(tr);
        });

        // the summary line: on or off, IP, who is signed in, and the two things people come for
        var node = root.currentNode || null;
        var online = !!(node && (node.conn & 1));
        var top = el('div', 'scp-dev-top');
        var state = el('span', 'scp-dev-state ' + (online ? 'on' : 'off'), online ? t('On', 'เปิดอยู่') : t('Off / not connected', 'ปิดอยู่ / ไม่ได้เชื่อมต่อ'));
        top.appendChild(state);
        if (node && (node.ip || node.host)) top.appendChild(el('span', 'scp-dev-fact', 'IP ' + (node.ip || node.host)));
        var user = node && node.users && node.users.length ? String(node.users[0]).split('\\').pop() : '';
        if (user) top.appendChild(el('span', 'scp-dev-fact', t('User ', 'ผู้ใช้ ') + user));
        var warn = cards.security.rows.filter(function (r) { return r.classList.contains('scp-dev-warn'); }).length;
        if (warn) top.appendChild(el('span', 'scp-dev-fact warn', t('Security: ' + warn + ' to check', 'ความปลอดภัย: ต้องตรวจ ' + warn + ' รายการ')));
        var go = el('div', 'scp-dev-go');
        if (node && online && root.ScpDashboard && typeof root.ScpDashboard.openRemote === 'function') {
            var remote = el('button', 'scp-dev-btn primary', t('Remote', 'รีโมต'));
            remote.type = 'button';
            remote.addEventListener('click', function () { root.ScpDashboard.openRemote(node); });
            go.appendChild(remote);
        }
        if (node && online && typeof root.gotoDevice === 'function') {
            var files = el('button', 'scp-dev-btn', t('Files', 'ไฟล์'));
            files.type = 'button';
            files.addEventListener('click', function () { root.gotoDevice(node._id, 13); });
            go.appendChild(files);
        }
        top.appendChild(go);

        var grid = el('div', 'scp-dev-grid');
        ['info', 'security', 'usage'].forEach(function (k) {
            if (!cards[k].rows.length) return;
            var card = el('section', 'scp-dev-card scp-dev-' + k);
            card.appendChild(el('h3', '', cards[k].title));
            var tbl = el('table', 'scp-dev-rows');
            var body = el('tbody');
            cards[k].rows.forEach(function (r) { body.appendChild(r); });
            tbl.appendChild(body);
            card.appendChild(tbl);
            grid.appendChild(card);
        });

        // the page's own buttons (Actions, Notes, Log Event, Run, Message, Chat, Share)
        var buttons = Array.prototype.slice.call(box.querySelectorAll('input[type=button], button')).filter(function (b) { return !top.contains(b); });
        var acts = null;
        if (buttons.length) {
            acts = el('section', 'scp-dev-card scp-dev-actions');
            acts.appendChild(el('h3', '', t('More', 'คำสั่งเพิ่มเติม')));
            var row = el('div', 'scp-dev-actrow');
            buttons.forEach(function (b) { row.appendChild(b); });
            acts.appendChild(row);
        }
        table.classList.add('scp-dev-hidden');
        Array.prototype.forEach.call(box.querySelectorAll('br'), function (br) { br.classList.add('scp-dev-hidden'); });
        box.insertBefore(top, box.firstChild);
        box.insertBefore(grid, top.nextSibling);
        if (acts) box.insertBefore(acts, grid.nextSibling);
    }

    function watch() {
        var box = doc.getElementById('p10html');
        if (!box) return false;
        if (box.scpWatched) return true;
        box.scpWatched = true;
        // MeshCentral replaces the whole panel (innerHTML); our own moves happen after the flag is set
        var observer = new root.MutationObserver(function () { try { tidy(box); } catch (e) { /* the page as MeshCentral drew it stays */ } });
        observer.observe(box, { childList: true });
        tidy(box);
        return true;
    }
    (function wait(n) { if (!watch() && n < 80) setTimeout(function () { wait(n + 1); }, 250); })(0);
    root.ScpDevice = { tidy: tidy, watch: watch };
})(window);
