'use strict';
// The /m device picker. Adapted from the Desktop App's renderer, which the hospital already
// reads comfortably, with three differences: there is no app registration step because the
// browser is already signed in, the fleet is read from /m-data over the user's own session
// rather than Electron IPC, and starting a session hands over to MeshCentral's own remote
// desktop page instead of creating a device share.
//
// It does not call the app's /scp-client-api, and must not be changed to. That endpoint
// authenticates with a token belonging to an approved installation, and refuses any request
// carrying an Origin header so that no web page can be made to use one. /m-data is the way a
// browser reads the fleet here: the signed-in user's own session, their own rights, read only.
(function () {
    const $ = id => document.getElementById(id);
    let lang = 'th';
    try { lang = localStorage.getItem('scpMobileLanguage') || 'th'; } catch (ex) { }
    let data = { rooms: [], nodes: [] }, room = '', query = '', map = false, onlineOnly = false, busy = false, loaded = false, lastUpdated = null;

    // Something to look at while the first list is on its way. A phone on mobile data can sit
    // on an empty page long enough to look broken.
    function skeleton() {
        const canvas = $('devices');
        canvas.className = 'grid';
        canvas.textContent = '';
        for (let i = 0; i < 4; i++) {
            const card = el('article', null, 'device skeleton');
            ['title', 'room', 'ip', 'action'].forEach(kind => card.appendChild(el('div', null, 'bar ' + kind)));
            canvas.appendChild(card);
        }
    }

    const t = (th, en) => (lang === 'th' ? th : en);
    function el(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
    function icon(name) { return $('icon-' + name).content.firstElementChild.cloneNode(true); }
    function updatedStatus() { if (lastUpdated) $('status').textContent = t('อัปเดตล่าสุด ', 'Updated ') + lastUpdated.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB'); }

    const messages = {
        NOT_SIGNED_IN: ['เซสชันหมดอายุ กำลังพากลับไปหน้าเข้าสู่ระบบ…', 'Session expired. Returning to the login page…'],
        RIGHTS_UNAVAILABLE: ['อ่านสิทธิ์ของบัญชีไม่ได้ กรุณาลองใหม่', 'Could not read your permissions. Try again.'],
        DEVICES_UNAVAILABLE: ['อ่านรายชื่อเครื่องไม่ได้ กรุณาลองใหม่', 'Could not read the device list. Try again.'],
        OFFLINE_FETCH: ['ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสัญญาณแล้วกดรีเฟรช', 'Cannot reach the server. Check your connection, then refresh.']
    };
    const error = code => messages[code] ? messages[code][lang === 'th' ? 0 : 1] : t('ติดต่อระบบไม่สำเร็จ: ', 'Connection failed: ') + code;

    function labels() {
        document.documentElement.lang = lang;
        $('language').value = lang;
        [['totalLabel', 'ทั้งหมด', 'Devices'],
        ['onlineLabel', 'ออนไลน์', 'Online'],
        ['roomsLabel', 'หน่วยงาน', 'Departments'],
        ['roomTitle', 'หน่วยงาน', 'Departments'],
        ['heading', 'เลือกเครื่องเพื่อรีโมต', 'Choose a device'],
        ['hint', 'ค้นหาเครื่อง เลือกหน่วยงาน แล้วขอเชื่อมต่อ', 'Find a device, choose a department, and request access'],
        ['devicesTitle', 'รายชื่อเครื่อง', 'Devices'],
        ['onlineOnlyLabel', 'ออนไลน์เท่านั้น', 'Online only'],
        ['refresh', 'รีเฟรช', 'Refresh'],
        ['listView', 'รายชื่อ', 'List'],
        ['mapView', 'ผังห้อง', 'Room map'],
        ['full', 'เว็บเต็ม', 'Full site'],
        ['consentNote', 'ทุกครั้งต้องได้รับอนุญาตจากเครื่องปลายทาง', 'Every connection needs permission on the remote computer']
        ].forEach(([id, th, en]) => { const n = $(id); if (n) { const label = n.querySelector('[data-label]') || n; label.textContent = t(th, en); if (n.tagName === 'BUTTON') { n.title = t(th, en); n.setAttribute('aria-label', t(th, en)); } } });
        // The gear is a link, so its label belongs on the title and the accessible name rather
        // than in the page text, where it would print next to the icon.
        const settings = $('settings');
        if (settings) {
            const label = t('ตั้งค่าทั้งหมด', 'All settings');
            settings.title = label;
            settings.setAttribute('aria-label', label);
            // Same reason open() works this way: this page is served at <root>m, so a bare
            // "?m=0" reloads it with the query ignored instead of leaving for the full site.
            // mobile=0 because a phone would otherwise get MeshCentral's old, unstyled mobile
            // page; the full site is the one with the hospital's look and the map.
            settings.href = siteRoot() + '?m=0&mobile=0';
        }
        $('search').placeholder = t('ค้นหาชื่อเครื่อง หรือ IP', 'Search device name or IP');
        $('search').setAttribute('aria-label', $('search').placeholder);
        document.querySelector('.view-switch').setAttribute('aria-label', t('มุมมอง', 'View'));
        $('footer').textContent = t('SCP-Remote · Hospital IT', 'SCP-Remote · Hospital IT');
        if (!$('status').classList.contains('is-error')) updatedStatus();
    }

    async function refresh() {
        if (busy) return;
        busy = true; $('refresh').disabled = true; $('refresh').classList.add('is-loading');
        try {
            const r = await fetch('m-data', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
            if (r.status === 401) { $('status').textContent = error('NOT_SIGNED_IN'); $('status').classList.add('is-error'); setTimeout(() => { location.href = siteRoot(); }, 1500); return; }
            const body = await r.json();
            if (body.error) throw Error(body.error);
            data = body;
            loaded = true;
            lastUpdated = new Date(); updatedStatus();
            $('status').classList.remove('is-error');
            render();
        } catch (e) {
            // A failed refresh must not blank a list that is still on screen and still useful.
            $('status').textContent = error(e && e.message ? e.message : 'OFFLINE_FETCH');
            $('status').classList.add('is-error');
            // But if the first one failed there is no list, and leaving the placeholders up
            // would go on promising a page that is not coming.
            if (!loaded) { $('devices').textContent = ''; $('devices').appendChild(el('p', t('ยังโหลดรายชื่อเครื่องไม่ได้ กดรีเฟรชเพื่อลองใหม่', 'The device list has not loaded. Press refresh to try again.'))); }
        } finally { busy = false; $('refresh').disabled = false; $('refresh').classList.remove('is-loading'); }
    }

    // This page is served at <root>m, and the desktop view lives at <root> itself. A bare
    // '?node=..' would be relative to /m and just reload this page with the query ignored,
    // which looks exactly like the button doing nothing. Strip the trailing 'm' instead of
    // assuming '/', so a domain served under a sub-path still works.
    const siteRoot = () => location.pathname.replace(/m$/, '') || '/';

    function open(node) {
        // MeshCentral's own desktop view, which carries the consent prompt and everything else
        // already tested. node ids are node/<domain>/<id> and the page wants the last part.
        // The server works out the link, because how a device is opened depends on which page
        // MeshCentral serves this browser and the two schemes do not overlap. See mobile.js.
        location.href = siteRoot() + node.link;
    }

    const fixNotes = {};
    async function fixPrinting(n, button, out) {
        if (!confirm(t('แก้ปริ้นไม่ออกที่เครื่อง ', 'Fix printing on ') + n.name + '?\n\n' +
            t('งานพิมพ์ที่ค้างในคิวจะถูกลบ แล้ว Print Spooler จะเริ่มใหม่ (ไม่กี่วินาที) งานที่ค้างต้องสั่งพิมพ์ใหม่',
                'Waiting print jobs are deleted and the print spooler restarts (a few seconds). Those documents need printing again.'))) return;
        button.disabled = true;
        out.textContent = fixNotes[n.id] = t('กำลังแก้… (รอเครื่องตอบ)', 'Working… (waiting for the computer)');
        let text;
        try {
            const r = await fetch(siteRoot() + 'm-fix', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-SCP-Request': '1' }, body: JSON.stringify({ nodeid: n.id, action: 'printer' }) });
            const body = await r.json().catch(() => ({}));
            if (r.ok && body.ok) text = t('✓ แก้แล้ว · งานค้าง ', '✓ Done · jobs waiting ') + body.before + ' → ' + body.after + ' · Spooler ' + body.spooler;
            else if (r.ok) text = t('✗ Spooler ยังไม่ทำงาน (', '✗ Spooler not running (') + body.spooler + ')';
            else text = '✗ ' + ({ ACCESS_DENIED: t('ไม่มีสิทธิ์สั่งงานเครื่องนี้', 'No permission on this computer'), NOT_ONLINE: t('เครื่องไม่ได้เปิดอยู่', 'The computer is not on'),
                NO_ANSWER: t('เครื่องไม่ตอบใน 90 วินาที', 'No answer in 90 seconds'), COMMAND_BUSY: t('เครื่องกำลังทำคำสั่งอื่น ลองใหม่อีกครั้ง', 'Busy with another command; try again'),
                NOT_SIGNED_IN: t('ต้องเข้าสู่ระบบใหม่', 'Please sign in again') }[body.error] || (t('ทำไม่สำเร็จ ', 'Failed ') + (body.error || r.status)));
        } catch (e) { text = t('✗ ติดต่อเซิร์ฟเวอร์ไม่ได้', '✗ Could not reach the server'); }
        out.textContent = fixNotes[n.id] = text;
        button.disabled = false;
    }

    function render() {
        $('totalCount').textContent = data.nodes.length;
        $('onlineCount').textContent = data.nodes.filter(n => n.online).length;
        $('roomsCount').textContent = data.rooms.length;

        // The count beside a ward is what tells you at a glance where the machines actually are.
        $('rooms').textContent = '';
        $('roomSelect').textContent = '';
        [{ id: '', name: t('ทุกห้อง', 'All rooms') }].concat(data.rooms).forEach(r => {
            const b = el('button');
            b.appendChild(el('b', r.name));
            const n = r.id ? data.nodes.filter(x => x.room === r.id).length : data.nodes.length;
            const choice = el('option', r.name + ' (' + n + ')'); choice.value = r.id; $('roomSelect').appendChild(choice);
            b.appendChild(el('span', String(n), 'count'));
            b.classList.toggle('active', room === r.id);
            b.setAttribute('aria-pressed', String(room === r.id));
            b.onclick = () => { room = r.id; renderFiltered(); };
            $('rooms').appendChild(b);
        });
        $('roomSelect').value = room;

        const nodes = data.nodes.slice()
            .sort((a, b) => Number(b.online) - Number(a.online) || String(a.name).localeCompare(String(b.name)))
            .filter(n => (!room || n.room === room) && (!onlineOnly || n.online) && (!query || (n.name + ' ' + n.ip).toLowerCase().includes(query)));
        $('resultCount').textContent = nodes.length + t(' เครื่อง', nodes.length === 1 ? ' device' : ' devices');

        const canvas = $('devices');
        canvas.textContent = '';
        canvas.className = map ? 'map' : 'grid';
        $('listView').setAttribute('aria-pressed', String(!map));
        $('mapView').setAttribute('aria-pressed', String(map));
        $('mapNote').hidden = !map;
        $('mapNote').textContent = t('ตำแหน่งที่ผู้ดูแลกำหนดจะแสดงตามผัง เครื่องที่ยังไม่ได้กำหนดจะต่อท้าย',
            'Configured positions follow the room map. Unplaced devices appear afterwards.');

        if (map && !room) { canvas.appendChild(el('p', t('เลือกหน่วยงานด้านบนเพื่อดูผัง', 'Choose a department above to see its map'), 'empty-state')); return; }
        if (!nodes.length) { canvas.appendChild(el('p', t('ไม่พบเครื่อง ลองเปลี่ยนคำค้นหาหรือตัวกรอง', 'No matching devices. Try another search or filter.'), 'empty-state')); return; }

        nodes.forEach(n => {
            const card = el('article', null, n.online ? 'device' : 'device is-offline');
            if (map && n.position) { card.style.gridColumn = String(n.position.x + 1); card.style.gridRow = String(n.position.y + 1); }
            const top = el('div', null, 'device-top'), mark = el('div', null, 'device-icon'), identity = el('div', null, 'device-identity');
            mark.appendChild(icon('computer')); top.appendChild(mark);
            identity.appendChild(el('h3', n.name));
            const r = data.rooms.find(x => x.id === n.room);
            identity.appendChild(el('p', r ? r.name : t('ยังไม่ระบุหน่วยงาน', 'No department'))); top.appendChild(identity);
            top.appendChild(el('span', n.online ? t('ออนไลน์', 'Online') : t('ออฟไลน์', 'Offline'), n.online ? 'online' : 'offline')); card.appendChild(top);
            const address = el('div', null, 'device-address'); address.appendChild(el('span', 'IP')); address.appendChild(el('code', n.ip || t('ยังไม่มี IP', 'IP not reported'))); card.appendChild(address);
            const actions = el('div', null, 'device-actions');
            const b = el('button', t('ขอรีโมต', 'Request access'), 'primary');
            b.appendChild(icon('arrow'));
            b.disabled = !n.online;
            b.onclick = () => open(n);
            actions.appendChild(b);
            // The call IT gets most: "it won't print". Clears stuck jobs and restarts the spooler
            // without opening the remote screen; the server checks the Run Commands right.
            if (n.online && n.canFix) {
                const fix = el('button', null, 'secondary'); fix.title = t('แก้ปริ้นไม่ออก', 'Fix printing'); fix.setAttribute('aria-label', fix.title); fix.appendChild(icon('printer'));
                fix.appendChild(el('span', t('แก้ปริ้น', 'Fix printing')));
                const out = el('small', fixNotes[n.id] || '', 'fix-result');
                out.setAttribute('role', 'status');
                fix.onclick = () => fixPrinting(n, fix, out);
                actions.appendChild(fix); card.appendChild(actions);
                card.appendChild(out);
            } else card.appendChild(actions);
            canvas.appendChild(card);
        });
    }

    function renderFiltered() {
        render();
        // A filter used halfway down a long fleet should reveal its first result.
        const heading = document.querySelector('.list-heading');
        const edge = header.getBoundingClientRect().height + document.querySelector('.filter-panel').getBoundingClientRect().height + 12;
        if (window.scrollY > 0 && heading.getBoundingClientRect().top < edge) window.scrollBy(0, heading.getBoundingClientRect().top - edge);
    }
    $('search').oninput = e => { query = e.target.value.trim().toLowerCase(); renderFiltered(); };
    $('onlineOnly').onchange = e => { onlineOnly = e.target.checked; renderFiltered(); };
    $('roomSelect').onchange = e => { room = e.target.value; renderFiltered(); };
    $('refresh').onclick = refresh;
    $('listView').onclick = () => { map = false; render(); };
    $('mapView').onclick = () => { map = true; render(); };
    $('language').onchange = e => {
        lang = e.target.value;
        try { localStorage.setItem('scpMobileLanguage', lang); } catch (ex) { }
        labels(); render();
    };

    // Keep sticky filters below the real header, including safe-area and text scaling.
    const header = document.querySelector('body > header');
    const fitHeader = () => document.documentElement.style.setProperty('--header-height', header.getBoundingClientRect().height + 'px');
    fitHeader();
    if (window.ResizeObserver) new ResizeObserver(fitHeader).observe(header);
    else window.addEventListener('resize', fitHeader);

    labels();
    skeleton();
    refresh();
    // A phone screen is usually off or on another app; refreshing then would only spend battery.
    setInterval(() => { if (!document.hidden) refresh(); }, 15000);
})();
