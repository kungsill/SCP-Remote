/* SCP-Remote: the My Account page (p2), made plain and easy to use.
 *
 * MeshCentral's page is a column of small links over a grid of grey bars, and some of those links
 * are for features this hospital does not use. This lays the same controls out as two cards
 * (who you are, and settings) over a grid of department cards, and hides what is not used:
 *
 *   - Security keys and the other 2FA controls: the head of IT decided sign-in is password only
 *     (13 Nov 2026), and every 2FA method is off on the server.
 *   - Delete account: on a server with one administrator, one press locks everyone out.
 *   - Create login token: nothing in the hospital uses login tokens.
 *
 * Nothing is removed from the page and no MeshCentral function is changed: the existing elements
 * are moved into the cards (they keep their ids, so the page still shows and hides them as before)
 * and the department grid is drawn from the same window.meshes the page uses, after the page's own
 * updateMeshes() has run. Every link still calls the page's own account_* function.
 */
(function (root) {
    'use strict';
    if (root.ScpAccount) return;
    var doc = root.document;
    var thai = function () { return (doc.documentElement.lang || '').indexOf('th') === 0; };
    var t = function (en, th) { return thai() ? th : en; };
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function byId(id) { return doc.getElementById(id); }

    // Links that are not used here. Matched by the function they call, which does not change with
    // the language the page is shown in.
    var UNUSED = ['account_showDeleteAccount', 'account_createLoginToken'];
    function hideUnused(scope) {
        var links = scope.querySelectorAll('a[onclick]');
        for (var i = 0; i < links.length; i++) {
            var call = links[i].getAttribute('onclick') || '';
            if (UNUSED.some(function (n) { return call.indexOf(n) >= 0; })) {
                links[i].classList.add('scp-acct-hidden');
                var next = links[i].nextElementSibling;
                if (next && next.tagName === 'BR') next.classList.add('scp-acct-hidden');
            }
        }
        var token = byId('accountCreateLoginTokenSpan'); if (token) token.classList.add('scp-acct-hidden');
        var security = byId('p2AccountSecurity'); if (security) security.classList.add('scp-acct-hidden');
    }

    function nodesIn(meshid) {
        var list = root.nodes, out = [];
        if (!list) return out;
        var all = Array.isArray(list) ? list : Object.keys(list).map(function (k) { return list[k]; });
        for (var i = 0; i < all.length; i++) if (all[i] && all[i].meshid === meshid) out.push(all[i]);
        return out;
    }

    var groupFilter = '';
    function drawGroups() {
        var host = byId('scpAcctGroups');
        if (!host) return;
        var meshes = root.meshes || {};
        var list = Object.keys(meshes).map(function (k) { return meshes[k]; }).filter(function (m) { return m && m.name && !m.deleted; });
        list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); });
        var count = byId('scpAcctGroupCount');
        if (count) count.textContent = list.length + t(' groups', ' กลุ่ม');
        host.textContent = '';
        var shown = list.filter(function (m) { return !groupFilter || String(m.name).toLowerCase().indexOf(groupFilter) >= 0; });
        if (!shown.length) { host.appendChild(el('p', 'scp-acct-empty', list.length ? t('No group matches.', 'ไม่พบกลุ่มที่ตรงกับคำค้น') : t('No device groups yet.', 'ยังไม่มีกลุ่มอุปกรณ์'))); return; }
        shown.forEach(function (m) {
            var nodes = nodesIn(m._id);
            var online = nodes.filter(function (n) { return (n.conn & 1) !== 0; }).length;
            var card = el('button', 'scp-acct-group');
            card.type = 'button';
            card.title = t('Open this group: its computers, who may use them, and installers', 'เปิดกลุ่มนี้: เครื่องในกลุ่ม ผู้มีสิทธิ์ และตัวติดตั้ง');
            card.appendChild(el('strong', '', m.name));
            var line = el('span', 'scp-acct-group-count');
            line.appendChild(el('b', online ? 'on' : 'off', String(online)));
            line.appendChild(doc.createTextNode(' / ' + nodes.length + t(' online', ' ออนไลน์')));
            card.appendChild(line);
            var rights = typeof root.GetMeshRights === 'function' ? root.GetMeshRights(m) : null;
            if (rights != null && rights !== 0xFFFFFFFF) card.appendChild(el('small', '', rights === 0 ? t('No rights', 'ไม่มีสิทธิ์') : t('Partial rights', 'สิทธิ์บางส่วน')));
            card.addEventListener('click', function () { if (typeof root.gotoMesh === 'function') root.gotoMesh(m._id); });
            host.appendChild(card);
        });
    }

    function build() {
        var info = byId('p2info');
        if (!info || info.dataset.scpAccount) return !!info;
        info.dataset.scpAccount = '1';
        doc.body.classList.add('scp-account-page');
        hideUnused(info);

        var frame = byId('p2AccountImageFrame'), actions = byId('p2AccountActions');
        var top = el('div', 'scp-acct-top');

        // Who you are: picture, name, and the two things people come here for.
        var me = el('section', 'scp-acct-card scp-acct-me');
        if (frame) me.appendChild(frame);
        var who = el('div', 'scp-acct-who');
        var u = root.userinfo || {};
        who.appendChild(el('h2', '', u.realname || u.name || ''));
        if (u.email) who.appendChild(el('span', 'scp-acct-email', u.email));
        who.appendChild(el('span', 'scp-acct-role', u.siteadmin === 0xFFFFFFFF ? t('Administrator', 'ผู้ดูแลระบบ') : t('Technician', 'ช่าง IT')));
        var quick = el('div', 'scp-acct-quick');
        var pass = el('button', 'scp-acct-btn primary', t('Change password', 'เปลี่ยนรหัสผ่าน'));
        pass.type = 'button';
        pass.addEventListener('click', function () { if (typeof root.account_showChangePassword === 'function') root.account_showChangePassword(); });
        var logins = el('button', 'scp-acct-btn', t('Previous logins', 'ดูการเข้าสู่ระบบก่อนหน้า'));
        logins.type = 'button';
        logins.addEventListener('click', function () { if (typeof root.account_viewPreviousLogins === 'function') root.account_viewPreviousLogins(); });
        quick.appendChild(pass); quick.appendChild(logins);
        who.appendChild(quick);
        me.appendChild(who);
        top.appendChild(me);

        // Everything else MeshCentral offers here, as a tidy list.
        var more = el('section', 'scp-acct-card scp-acct-more');
        more.appendChild(el('h3', '', t('Settings', 'การตั้งค่า')));
        if (actions) more.appendChild(actions);
        top.appendChild(more);

        info.insertBefore(top, info.firstChild);

        // Departments: a searchable grid of cards in place of the grey bars.
        var groups = el('section', 'scp-acct-card scp-acct-groups');
        var head = el('div', 'scp-acct-groups-head');
        var h = el('h3', '', t('Device groups (departments)', 'กลุ่มอุปกรณ์ (หน่วยงาน)'));
        head.appendChild(h);
        head.appendChild(el('span', 'scp-acct-muted', '')).id = 'scpAcctGroupCount';
        var find = el('input', 'scp-acct-find');
        find.type = 'search';
        find.placeholder = t('Find a group', 'ค้นหากลุ่ม');
        find.setAttribute('aria-label', find.placeholder);
        find.addEventListener('input', function () { groupFilter = find.value.trim().toLowerCase(); drawGroups(); });
        head.appendChild(find);
        if (typeof root.account_createMesh === 'function' && byId('p2createMeshLink1') && byId('p2createMeshLink1').style.display !== 'none') {
            var add = el('button', 'scp-acct-btn', t('+ New group', '+ เพิ่มกลุ่ม'));
            add.type = 'button';
            add.addEventListener('click', function () { root.account_createMesh(); });
            head.appendChild(add);
        }
        groups.appendChild(head);
        var grid = el('div', 'scp-acct-grid'); grid.id = 'scpAcctGroups';
        groups.appendChild(grid);
        // The page's own heading, link and grey bars stay in the document (hidden), so nothing
        // that writes to them breaks.
        Array.prototype.slice.call(info.childNodes).forEach(function (n) {
            if (n === top || n.nodeType !== 1) return;
            if (n.id === 'p2logintokens') return;
            n.classList.add('scp-acct-hidden');
        });
        info.appendChild(groups);
        drawGroups();
        return true;
    }

    // Redraw the department cards whenever the page redraws its own list.
    function hook() {
        var original = root.updateMeshes;
        if (typeof original !== 'function' || original.scpAccount) return false;
        root.updateMeshes = function () { var r = original.apply(this, arguments); try { drawGroups(); } catch (e) { } return r; };
        root.updateMeshes.scpAccount = true;
        return true;
    }

    function start() { build(); hook(); }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
    // Online counts change all the time; keep them current while the page is open.
    if (typeof root.setInterval === 'function') root.setInterval(function () { var p = byId('p2'); if (p && p.style.display !== 'none') drawGroups(); }, 10000);

    root.ScpAccount = { build: build, drawGroups: drawGroups, hook: hook };
})(window);
