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
    let data = { rooms: [], nodes: [] }, room = '', query = '', map = false, busy = false;

    const t = (th, en) => (lang === 'th' ? th : en);
    function el(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }

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
        [['totalLabel', 'เครื่องทั้งหมด', 'Total devices'],
        ['onlineLabel', 'ออนไลน์', 'Online'],
        ['roomsLabel', 'ห้อง / หน่วยงาน', 'Rooms'],
        ['roomTitle', 'ห้อง / หน่วยงาน', 'Rooms / departments'],
        ['heading', 'เลือกเครื่องที่ต้องการรีโมต', 'Choose a device'],
        ['hint', 'ค้นหาตามชื่อเครื่องหรือ IP แล้วส่งคำขออนุญาต', 'Find a device by name or IP, then request access'],
        ['refresh', 'รีเฟรช', 'Refresh'],
        ['listView', 'รายชื่อ', 'List'],
        ['mapView', 'ผังห้อง', 'Room map'],
        ['full', 'เว็บเต็ม', 'Full site'],
        ['consentNote', 'ทุกครั้งต้องได้รับอนุญาตจากเครื่องปลายทาง', 'Every connection needs permission on the remote computer']
        ].forEach(([id, th, en]) => { const n = $(id); if (n) n.textContent = t(th, en); });
        $('search').placeholder = t('ค้นหาชื่อเครื่อง หรือ IP', 'Search device name or IP');
        $('footer').textContent = t('SCP-Remote · Hospital IT', 'SCP-Remote · Hospital IT');
    }

    async function refresh() {
        if (busy) return;
        busy = true; $('refresh').disabled = true;
        try {
            const r = await fetch('m-data', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
            if (r.status === 401) { $('status').textContent = error('NOT_SIGNED_IN'); setTimeout(() => { location.href = siteRoot(); }, 1500); return; }
            const body = await r.json();
            if (body.error) throw Error(body.error);
            data = body;
            $('status').textContent = t('อัปเดตล่าสุด ', 'Updated ') + new Date().toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB');
            render();
        } catch (e) {
            // A failed refresh must not blank a list that is still on screen and still useful.
            $('status').textContent = error(e && e.message ? e.message : 'OFFLINE_FETCH');
        } finally { busy = false; $('refresh').disabled = false; }
    }

    // This page is served at <root>m, and the desktop view lives at <root> itself. A bare
    // '?node=..' would be relative to /m and just reload this page with the query ignored,
    // which looks exactly like the button doing nothing. Strip the trailing 'm' instead of
    // assuming '/', so a domain served under a sub-path still works.
    const siteRoot = () => location.pathname.replace(/m$/, '') || '/';

    function open(node) {
        // MeshCentral's own desktop view, which carries the consent prompt and everything else
        // already tested. node ids are node/<domain>/<id> and the page wants the last part.
        const short = String(node.id).split('/').pop();
        location.href = siteRoot() + '?node=' + encodeURIComponent(short) + '&viewmode=10&hide=16';
    }

    function render() {
        $('totalCount').textContent = data.nodes.length;
        $('onlineCount').textContent = data.nodes.filter(n => n.online).length;
        $('roomsCount').textContent = data.rooms.length;

        $('rooms').textContent = '';
        [{ id: '', name: t('ทุกห้อง', 'All rooms') }].concat(data.rooms).forEach(r => {
            const b = el('button', r.name);
            b.classList.toggle('active', room === r.id);
            b.onclick = () => { room = r.id; render(); };
            $('rooms').appendChild(b);
        });

        const nodes = data.nodes.slice()
            .sort((a, b) => Number(b.online) - Number(a.online) || String(a.name).localeCompare(String(b.name)))
            .filter(n => (!room || n.room === room) && (!query || (n.name + ' ' + n.ip).toLowerCase().includes(query)));

        const canvas = $('devices');
        canvas.textContent = '';
        canvas.className = map ? 'map' : 'grid';
        $('listView').setAttribute('aria-pressed', String(!map));
        $('mapView').setAttribute('aria-pressed', String(map));
        $('mapNote').hidden = !map;
        $('mapNote').textContent = t('ตำแหน่งที่ผู้ดูแลกำหนดจะแสดงตามผัง เครื่องที่ยังไม่ได้กำหนดจะต่อท้าย',
            'Configured positions follow the room map. Unplaced devices appear afterwards.');

        if (map && !room) { canvas.appendChild(el('p', t('เลือกห้องด้านบนเพื่อดูผัง', 'Choose a room above to see its map'))); return; }
        if (!nodes.length) { canvas.appendChild(el('p', t('ไม่พบเครื่องในรายการนี้', 'No matching devices'))); return; }

        nodes.forEach(n => {
            const card = el('article', null, 'device');
            if (map && n.position) { card.style.gridColumn = String(n.position.x + 1); card.style.gridRow = String(n.position.y + 1); }
            card.appendChild(el('span', n.online ? t('ออนไลน์', 'Online') : t('ออฟไลน์', 'Offline'), n.online ? 'online' : 'offline'));
            card.appendChild(el('h3', n.name));
            const r = data.rooms.find(x => x.id === n.room);
            card.appendChild(el('p', r ? r.name : ''));
            card.appendChild(el('code', n.ip || t('ยังไม่มี IP', 'IP not reported')));
            const b = el('button', t('ขอรีโมต', 'Request access'), 'primary');
            b.disabled = !n.online;
            b.onclick = () => open(n);
            card.appendChild(b);
            canvas.appendChild(card);
        });
    }

    $('search').oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
    $('refresh').onclick = refresh;
    $('listView').onclick = () => { map = false; render(); };
    $('mapView').onclick = () => { map = true; render(); };
    $('language').onchange = e => {
        lang = e.target.value;
        try { localStorage.setItem('scpMobileLanguage', lang); } catch (ex) { }
        labels(); render();
    };

    labels();
    refresh();
    // A phone screen is usually off or on another app; refreshing then would only spend battery.
    setInterval(() => { if (!document.hidden) refresh(); }, 15000);
})();
