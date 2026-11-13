/* Server overview. Reads the existing serverstats feed; retains original actions and details. */
(function (root) {
    'use strict';
    if (root.ScpServer) return;
    var doc = root.document, last = null, received = 0;
    function t(en, th) { return (doc.documentElement.lang || '').indexOf('th') === 0 ? th : en; }
    function el(tag, cls, text) { var e = doc.createElement(tag); e.className = cls || ''; if (text != null) e.textContent = text; return e; }
    function number(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
    function count(v) { return number(v) ? v.toLocaleString() : '—'; }
    function gb(v) { return (v / 1073741824).toFixed(1) + ' GB'; }
    function card(label, value, hint) {
        var c = el('section', 'scp-srv-card');
        c.appendChild(el('h3', '', label)); c.appendChild(el('div', 'scp-srv-number', value));
        c.appendChild(el('p', '', hint)); return c;
    }
    function build() {
        var info = doc.getElementById('p6info'), stats = doc.getElementById('serverStats');
        if (!info || !stats) return false;
        if (doc.getElementById('scpServerOverview')) return true;
        info.classList.add('scp-server-page');
        var title = doc.querySelector('#p6title h1');
        if (title) title.textContent = t('Server overview', 'ภาพรวมเซิร์ฟเวอร์');
        var overview = el('div'); overview.id = 'scpServerOverview';
        var titleBox = doc.getElementById('p6title');
        info.insertBefore(overview, titleBox ? titleBox.nextSibling : info.firstChild);
        var warnings = doc.getElementById('serverWarningsDiv');
        if (warnings) { warnings.classList.add('scp-srv-warnings'); info.insertBefore(warnings, overview.nextSibling); }
        var actions = doc.getElementById('p2ServerActions');
        if (actions) { actions.classList.add('scp-srv-actions'); info.appendChild(actions); }
        var details = el('details', 'scp-srv-details');
        details.appendChild(el('summary', '', t('Technical details', 'รายละเอียดทางเทคนิค')));
        details.appendChild(stats); info.appendChild(details);
        return true;
    }
    function freshness() {
        var badge = doc.getElementById('scpServerFresh'), stamp = doc.getElementById('scpServerStamp');
        if (!badge) return;
        var disconnected = root.meshserver && root.meshserver.State !== 2;
        var stale = received && Date.now() - received > 30000;
        badge.className = 'scp-srv-badge ' + (!received || disconnected || stale ? 'waiting' : 'live');
        badge.textContent = !received ? t('Waiting for data', 'รอข้อมูลจากเซิร์ฟเวอร์') : disconnected ? t('Disconnected', 'ขาดการเชื่อมต่อ') : stale ? t('Data is delayed', 'ข้อมูลยังไม่อัปเดต') : t('Receiving data', 'รับข้อมูลได้');
        stamp.textContent = received ? t('Last received ', 'รับข้อมูลล่าสุด ') + new Date(received).toLocaleTimeString() + t(' · refreshes about every 10 seconds', ' · อัปเดตประมาณทุก 10 วินาที') : t('Values will appear when the server responds.', 'ตัวเลขจะแสดงเมื่อเซิร์ฟเวอร์ส่งข้อมูลมา');
    }
    function render(message) {
        if (message) { last = message; received = Date.now(); }
        if (!build()) return;
        var host = doc.getElementById('scpServerOverview'); host.textContent = '';
        var status = el('div', 'scp-srv-status'), badge = el('span'); badge.id = 'scpServerFresh';
        var stamp = el('span', 'scp-srv-stamp'); stamp.id = 'scpServerStamp';
        status.setAttribute('role', 'status'); status.appendChild(badge); status.appendChild(stamp); host.appendChild(status);
        var m = last || {}, state = (m.values || {}).ServerState || {};
        var grid = el('div', 'scp-srv-grid');
        grid.appendChild(card(t('Computer connections', 'เครื่องลูกที่เชื่อมต่อ'), count(state.AgentSessions), t('Agent connections to this server', 'จำนวนการเชื่อมต่อของเอเจนต์มายังเซิร์ฟเวอร์')));
        grid.appendChild(card(t('Connected users', 'ผู้ใช้ที่เชื่อมต่อ'), count(state.ConnectedUsers), t('Users currently connected', 'ผู้ใช้ที่กำลังเชื่อมต่อระบบ')));
        grid.appendChild(card(t('Device groups', 'กลุ่มเครื่อง'), count(state.DeviceGroups), t('Groups configured on the server', 'กลุ่มเครื่องที่ตั้งไว้บนเซิร์ฟเวอร์')));
        grid.appendChild(card(t('Data channels', 'ช่องทางรับส่งข้อมูล'), count(state.RelaySessions), t('Includes desktop and file channels', 'รวมช่องทางรีโมตหน้าจอและรับส่งไฟล์')));
        host.appendChild(grid);
        host.appendChild(el('h2', 'scp-srv-heading', t('Server resources', 'ทรัพยากรเซิร์ฟเวอร์')));
        var resources = el('div', 'scp-srv-resources');
        var free = number(m.availablemem) ? m.availablemem : m.freemem;
        var validMemory = number(m.totalmem) && m.totalmem > 0 && number(free) && free <= m.totalmem;
        var used = validMemory ? Math.round((m.totalmem - free) / m.totalmem * 100) : null;
        var ram = card(t('Memory (RAM)', 'หน่วยความจำ (RAM)'), validMemory ? used + '%' : '—', validMemory ? t('Free ', 'เหลือ ') + gb(free) + t(' of ', ' จากทั้งหมด ') + gb(m.totalmem) : t('No memory data yet', 'ยังไม่มีข้อมูลหน่วยความจำ'));
        if (validMemory) {
            var meter = el('meter', 'scp-srv-meter'); meter.min = 0; meter.max = 100; meter.value = used;
            meter.setAttribute('aria-label', t('Memory used (%)', 'หน่วยความจำที่ใช้ (%)')); ram.appendChild(meter);
            ram.appendChild(el('span', 'scp-srv-note', used >= 90 ? t('High usage · check running programs', 'ใช้สูง · ควรตรวจโปรแกรมที่กำลังทำงาน') : t('Current memory usage', 'สัดส่วนหน่วยความจำที่ใช้อยู่')));
        }
        resources.appendChild(ram);
        var load = Array.isArray(m.cpuavg) && number(m.cpuavg[0]) ? m.cpuavg[0].toFixed(2) : '—';
        resources.appendChild(card(t('CPU load · 1 minute', 'ภาระ CPU · เฉลี่ย 1 นาที'), load, t('Load average, not CPU %. Zero can mean the OS does not report this metric.', 'เป็นค่า load ไม่ใช่เปอร์เซ็นต์ CPU ค่า 0 อาจเกิดจากระบบปฏิบัติการไม่รายงานค่านี้')));
        host.appendChild(resources);
        var attention = el('section', 'scp-srv-attention');
        attention.appendChild(el('h2', '', t('Recorded connection errors', 'ข้อผิดพลาดการเชื่อมต่อที่บันทึกไว้')));
        var errors = (m.values || {}).AgentErrorCounters;
        var keys = Object.keys(errors || {}).filter(function (k) { return number(errors[k]) && errors[k] > 0; });
        var names = {
            InvalidPKCSsignature: t('Agent signature verification failed (PKCS)', 'ตรวจลายเซ็นเอเจนต์ไม่ผ่าน (PKCS)'),
            InvalidRSAsignature: t('Agent signature verification failed (RSA)', 'ตรวจลายเซ็นเอเจนต์ไม่ผ่าน (RSA)'),
            BadSignature: t('Signature verification failed', 'ตรวจลายเซ็นไม่ผ่าน'),
            BadWebCertificate: t('Server certificate verification failed', 'ตรวจใบรับรองเซิร์ฟเวอร์ไม่ผ่าน'),
            UnknownGroup: t('Unknown device group', 'ไม่รู้จักกลุ่มเครื่อง'),
            DuplicateAgent: t('Duplicate agent connection', 'เอเจนต์เชื่อมต่อซ้ำ')
        };
        if (keys.length) {
            attention.classList.add('has-records');
            attention.appendChild(el('p', '', t('Cumulative counters, not proof of a current outage. Check the error log if they keep increasing.', 'เป็นตัวนับสะสม ไม่ได้ยืนยันว่าระบบกำลังขัดข้อง หากตัวเลขเพิ่มต่อเนื่องให้ตรวจบันทึกข้อผิดพลาด')));
            var list = el('ul'); keys.forEach(function (k) { var li = el('li'); li.appendChild(el('span', '', names[k] || k)); li.appendChild(el('strong', '', count(errors[k]) + t(' times', ' ครั้ง'))); list.appendChild(li); }); attention.appendChild(list);
        } else attention.appendChild(el('p', '', last ? t('No positive error counters in the latest report.', 'ไม่พบตัวนับข้อผิดพลาดที่มากกว่า 0 ในข้อมูลล่าสุด') : t('Waiting for the first report.', 'รอข้อมูลรอบแรก')));
        host.appendChild(attention); freshness();
    }
    function hook() {
        var original = root.updateGeneralServerStats;
        if (typeof original !== 'function' || original.scpServer) return;
        root.updateGeneralServerStats = function (message) {
            var result = original.apply(this, arguments);
            render(message); return result;
        };
        root.updateGeneralServerStats.scpServer = true;
    }
    function start() { hook(); render(root.lastServerStats); }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
    root.setInterval(freshness, 5000);
    root.ScpServer = { build: build, render: render, freshness: freshness };
})(window);
