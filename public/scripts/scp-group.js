/* SCP-Remote: the device group page (p20), made plain and easy to use.
 *
 * MeshCentral draws this page as rows of grey tables. After its own p20updateMesh() has filled
 * the page, this rearranges the same elements: a summary line (how many computers, how many on),
 * the group's details as a card, the add-user / add-computer links as buttons, the people and the
 * computers as clean lists with an on/off mark and a Remote button for each computer that is on,
 * and Delete group set apart at the bottom. Intel AMT is hidden: the hospital does not use it.
 *
 * Every control is the page's own element with its own onclick; nothing is rewritten and no
 * MeshCentral function changes. The page redraws itself often, so this runs again each time.
 */
(function (root) {
    'use strict';
    if (root.ScpGroup) return;
    var doc = root.document;
    var thai = function () { return (doc.documentElement.lang || '').indexOf('th') === 0; };
    var t = function (en, th) { return thai() ? th : en; };
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function allNodes() { var l = root.nodes; if (!l) return []; return Array.isArray(l) ? l : Object.keys(l).map(function (k) { return l[k]; }); }
    function nodeById(id) { return allNodes().filter(function (n) { return n && n._id === id; })[0] || null; }

    function tidy(info, info2) {
        if (!info || !info2) return;
        doc.body.classList.add('scp-group-page');

        // 1. The details: MeshCentral's one-row tables, gathered into one card.
        var props = el('section', 'scp-grp-card scp-grp-props');
        props.appendChild(el('h3', '', t('Group details', 'รายละเอียดกลุ่ม')));
        var actions = el('div', 'scp-grp-actions');
        var kids = Array.prototype.slice.call(info.childNodes);
        var firstList = null;
        kids.forEach(function (n) {
            if (n.nodeType !== 1) { if (n.nodeType === 3 && !n.textContent.trim()) return; return; }
            if (n.tagName === 'TABLE' && !n.getAttribute('style')) {
                if (n.querySelector('[onclick*="p20editMeshAmt"]')) { n.classList.add('scp-grp-hidden'); return; } // Intel AMT: not used here
                n.classList.add('scp-grp-prop'); props.appendChild(n); return;
            }
            // SCP-Remote: no "Add Agent" button on the group page. The administrator enrolls
            // computers from the agent test page, and a new computer is added from the dashboard,
            // so this link only sat in the row where people go to add a user.
            if (n.getAttribute && (n.getAttribute('onclick') || '').indexOf('addAgentToMesh') >= 0) { n.classList.add('scp-grp-hidden'); return; }
            if (n.tagName === 'INPUT' || (n.tagName === 'A' && n.getAttribute('onclick'))) { n.classList.add('scp-grp-btn'); actions.appendChild(n); return; }
            if (n.tagName === 'TABLE') { n.classList.add('scp-grp-list'); if (!firstList) firstList = n; return; }
            if (n.tagName === 'BR' || n.tagName === 'P') n.classList.add('scp-grp-hidden');
        });
        info.insertBefore(props, info.firstChild);
        if (actions.children.length) info.insertBefore(actions, props.nextSibling);
        // the add links carry a tiny "+" image; the button says it in words
        Array.prototype.forEach.call(actions.querySelectorAll('img'), function (img) { img.remove(); });

        // 2. The computers: an on/off mark, and Remote for those that are on.
        var list = info2.querySelector('table');
        var total = 0, on = 0;
        if (list) {
            list.classList.add('scp-grp-list', 'scp-grp-devices');
            Array.prototype.forEach.call(list.querySelectorAll('tr'), function (tr, i) {
                if (i === 0) { tr.classList.add('scp-grp-head'); return; }
                var go = tr.querySelector('a[onclick*="gotoDevice("]');
                if (!go) return;
                var m = /gotoDevice\("([^"]+)"/.exec(go.getAttribute('onclick') || '');
                var node = m ? nodeById(m[1]) : null;
                var online = node ? ((node.conn & 1) !== 0) : !tr.querySelector('.gray');
                total++; if (online) on++;
                tr.classList.add(online ? 'scp-grp-on' : 'scp-grp-off');
                var cell = tr.lastElementChild;
                if (node && online && root.ScpDashboard && typeof root.ScpDashboard.openRemote === 'function') {
                    var btn = el('button', 'scp-grp-remote', t('Remote', 'รีโมต'));
                    btn.type = 'button';
                    btn.addEventListener('click', function (e) { e.stopPropagation(); root.ScpDashboard.openRemote(node); });
                    cell.insertBefore(btn, cell.firstChild);
                }
            });
        }

        // 3. A line on top: how many computers, how many are on.
        var summary = el('div', 'scp-grp-summary');
        summary.appendChild(el('span', 'scp-grp-chip', total + t(' computers', ' เครื่อง')));
        summary.appendChild(el('span', 'scp-grp-chip on', t('On ', 'เปิดอยู่ ') + on));
        summary.appendChild(el('span', 'scp-grp-chip off', t('Off ', 'ปิดอยู่ ') + (total - on)));
        info.insertBefore(summary, info.firstChild);

        // 4. Delete group, apart from everything else.
        var del = info2.querySelector('[onclick*="p20showDeleteMeshDialog"]');
        if (del) {
            var zone = del.closest('div') || del.parentNode;
            zone.classList.add('scp-grp-danger');
            del.classList.add('scp-grp-delete');
            del.textContent = t('Delete this group…', 'ลบกลุ่มนี้…');
            del.title = t('The computers in it are removed from SCP-Remote. You will be asked to confirm.', 'เครื่องในกลุ่มจะถูกเอาออกจาก SCP-Remote ระบบจะถามยืนยันก่อน');
        }
        if (firstList) firstList.parentNode.insertBefore(el('h3', 'scp-grp-h', t('People who can use this group', 'ผู้มีสิทธิ์ในกลุ่มนี้')), firstList);
        if (list) list.parentNode.insertBefore(el('h3', 'scp-grp-h', t('Computers', 'เครื่องในกลุ่ม')), list);
    }

    function hook() {
        var original = root.p20updateMesh;
        if (typeof original !== 'function' || original.scpGroup) return false;
        root.p20updateMesh = function () {
            var r = original.apply(this, arguments);
            try { tidy(doc.getElementById('p20info'), doc.getElementById('p20info2')); } catch (e) { /* the page as MeshCentral drew it stays */ }
            return r;
        };
        root.p20updateMesh.scpGroup = true;
        return true;
    }
    (function wait(n) { if (!hook() && !(root.p20updateMesh && root.p20updateMesh.scpGroup) && n < 80) setTimeout(function () { wait(n + 1); }, 250); })(0);
    root.ScpGroup = { tidy: tidy, hook: hook };
})(window);
