/* Versioned government reference prices and centrally saved repair estimates. */
(function (root) {
    'use strict';
    var categories = { desktop: 'PC / เครื่องตั้งโต๊ะ', aio: 'All-in-One', notebook: 'Notebook', tablet: 'แท็บเล็ต', server: 'แม่ข่าย', printer: 'เครื่องพิมพ์ / Plotter', monitor: 'จอภาพ', scanner: 'สแกนเนอร์', ups: 'UPS', storage: 'ระบบจัดเก็บข้อมูล', network: 'เครือข่าย / ความปลอดภัย', software: 'ซอฟต์แวร์', peripheral: 'อุปกรณ์ / บริการอื่น' };
    function sourcesById(data) { return Object.fromEntries(data.sources.map(function (s) { return [s.id, s]; })); }
    function effectiveItems(data, year) {
        year = Number(year);
        if (!Number.isInteger(year) || year < data.fiscalYearStart || year > data.fiscalYearEnd) return [];
        var cutoff = String(year - 543) + '-09-30';
        if (data.checkedAt < cutoff) cutoff = data.checkedAt;
        var sources = data.sources.filter(function (s) { return s.status === 'official' && s.publishedAt && s.publishedAt <= cutoff && s.scope !== 'gis'; }).sort(function (a, b) { return a.publishedAt.localeCompare(b.publishedAt); });
        var base = sources.filter(function (s) { return s.scope === 'full'; }).pop();
        if (!base) return [];
        var rows = data.items.filter(function (r) { return r.sourceId === base.id; });
        sources.filter(function (s) { return s.publishedAt > base.publishedAt; }).forEach(function (s) {
            var extra = data.items.filter(function (r) { return r.sourceId === s.id; });
            if (s.scope === 'replace-first-11') rows = rows.filter(function (r) { return Number(r.item) > 11; }).concat(extra).sort(function (a, b) { return Number(a.item) - Number(b.item); });
            else if (s.scope === 'supplement') rows = rows.concat(extra);
        });
        return rows;
    }
    function filterItems(rows, category, query) {
        var terms = String(query || '').normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean);
        return rows.filter(function (r) {
            var text = (r.name + ' ' + r.specs).normalize('NFC').toLowerCase();
            return (!category || r.category === category) && terms.every(function (term) { return text.indexOf(term) >= 0; });
        });
    }
    function number(value, minimum) {
        var n = Number(value);
        if (!Number.isFinite(n) || n < minimum || n > 1000000000) throw Error('กรอกจำนวนและราคาเป็นตัวเลขที่ถูกต้อง');
        return n;
    }
    function total(lines) { return Math.round(lines.reduce(function (sum, line) { return sum + Math.round(number(line.quantity, 0.01) * number(line.unitPrice, 0) * 100) / 100; }, 0) * 100) / 100; }
    function csv(rows, data) {
        var sources = sourcesById(data);
        function cell(v) {
            var s = String(v == null ? '' : v);
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
        }
        var header = ['รายการ', 'ชื่อ', 'หมวด', 'ราคา (บาท)', 'หน่วยตามเอกสาร', 'ฉบับ', 'วันที่ประกาศ', 'สถานะ', 'หน้า PDF', 'คุณลักษณะ', 'ต้นฉบับ'];
        return '\ufeff' + [header].concat(rows.map(function (r) { var s = sources[r.sourceId]; return [r.item, r.name, categories[r.category], r.price, r.unit, s.title, s.publishedAt, s.status, r.page, r.specs, s.url || 'ร่างที่ผู้ดูแลแนบ']; })).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    }
    var api = { effectiveItems: effectiveItems, filterItems: filterItems, total: total, csv: csv, categories: categories };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

    var script = document.currentScript;
    var baseUrl = new URL('../', script ? script.src : location.href);
    var dialog, data, loading, results, note, count, yearSelect, sourceSelect, categorySelect, search, basketBox, basket = [], subject, memo;
    var shown = [], pageSize = 40, limit = pageSize;
    var ticketRows = [], ticketId = '', currentTicket = null, dirty = false, busy = false, estimateStatus;
    function request(op, args) {
        if (!root.ScpOperations) return Promise.reject(Error('ยังเชื่อมต่อระบบใบแจ้งซ่อมไม่ได้'));
        return root.ScpOperations.request(op, args);
    }
    function ticketLabel(row) {
        var nodes = Array.isArray(root.nodes) ? root.nodes : Object.values(root.nodes || {});
        var node = nodes.find(function (n) { return n._id === row.nodeid; });
        return (node ? node.name : row.nodeid) + ' • ' + row.title + ' • ' + row._id.split('/').pop();
    }
    function statusText(message) {
        if (estimateStatus) estimateStatus.textContent = message || (dirty ? 'มีการแก้ไขที่ยังไม่บันทึกกลาง • สำรองร่างไว้ในเบราว์เซอร์' : currentTicket && currentTicket.estimate ? 'บันทึกกลางแล้ว • ฉบับที่ ' + currentTicket.estimate.revision + ' • ' + new Date(currentTicket.estimate.updated).toLocaleString('th-TH') : 'ร่างประมาณการ • เลือกใบแจ้งซ่อมแล้วกดบันทึกกลาง');
    }
    function failure(ex) {
        statusText(ex.message === 'CONFLICT' ? 'มีผู้อื่นแก้ไขใบแจ้งซ่อมแล้ว ร่างของคุณยังอยู่ กรุณาเปิดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง' : ex.message === 'ACCESS_DENIED' ? 'ไม่มีสิทธิ์เข้าถึงใบแจ้งซ่อมนี้ ร่างของคุณยังอยู่' : 'ดำเนินการไม่สำเร็จ ร่างของคุณยังอยู่ (' + ex.message + ')');
    }
    async function refreshTickets() {
        try { ticketRows = await request('tickets'); renderBasket(); } catch (ex) { failure(ex); }
    }
    async function loadTicket(id) {
        if (busy || !id) return;
        if (dirty && !root.confirm('เปิดประมาณการกลางของใบแจ้งซ่อมนี้แทนร่างที่ยังไม่บันทึกหรือไม่?')) return;
        busy = true; renderBasket(); statusText('กำลังเปิดข้อมูลกลาง…');
        try {
            var row = await request('getTicketEstimate', { id: id });
            ticketId = row._id; currentTicket = row;
            var estimate = row.estimate || {};
            subject.value = estimate.subject || ticketLabel(row); memo.value = estimate.memo || '';
            basket = (estimate.lines || []).map(function (line) { return Object.assign({}, line); });
            dirty = false; saveBasket(true);
        } catch (ex) { failure(ex); busy = false; renderBasket(); failure(ex); return; }
        busy = false; renderBasket();
    }
    async function saveCentral() {
        if (busy || !ticketId || !basket.length) return;
        if (basket.some(function (line) { return !line.name.trim(); })) { statusText('กรุณาระบุชื่อทุกรายการก่อนบันทึกกลาง'); return; }
        busy = true; renderBasket(); statusText('กำลังบันทึกกลาง…');
        try {
            // A new draft first reads the selected ticket's current revision.
            var row = currentTicket && currentTicket._id === ticketId ? currentTicket : await request('getTicketEstimate', { id: ticketId });
            if (row.estimate && (!currentTicket || currentTicket._id !== ticketId)) throw Error('CONFLICT');
            currentTicket = await request('saveTicketEstimate', { id: ticketId, revision: row.revision, estimate: { subject: subject.value, memo: memo.value, lines: basket } });
            basket = currentTicket.estimate.lines.map(function (line) { return Object.assign({}, line); });
            dirty = false; saveBasket(true);
        } catch (ex) { busy = false; renderBasket(); failure(ex); return; }
        busy = false; renderBasket();
    }
    function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
    function button(text, fn) { var n = el('button', text); n.type = 'button'; n.addEventListener('click', fn); return n; }
    function money(n) { return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
    function setMode(estimate) {
        results.hidden = estimate; basketBox.hidden = !estimate;
        dialog.classList.toggle('scp-pa-estimate-mode', estimate);
        document.getElementById('scp-pa-title').textContent = estimate ? 'ใบประมาณการจัดหา / ซ่อม' : 'คลังราคากลางคอมพิวเตอร์';
    }
    function option(select, value, text) { var o = el('option', text); o.value = value; select.appendChild(o); }
    function link(text, url) { var a = el('a', text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; }
    function dateLabel(s) { return s.publishedAt ? new Date(s.publishedAt + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ฉบับร่าง • ยังไม่ประกาศ'; }
    function sourceLabel(s) { return (s.status === 'draft' ? 'ร่าง • ' : '') + s.title; }
    function selectedRows() {
        var source = sourceSelect.value;
        var rows = source === 'effective' ? effectiveItems(data, yearSelect.value) : data.items.filter(function (r) { return source === 'all' || r.sourceId === source; });
        return filterItems(rows, categorySelect.value, search.value);
    }
    function scopeText() { return 'ปีงบ ' + yearSelect.value + ' • ' + sourceSelect.selectedOptions[0].textContent + ' • ' + (categorySelect.value ? categories[categorySelect.value] : 'ทุกหมวด') + (search.value ? ' • ค้นหา: ' + search.value : ''); }
    function renderPrices() {
        if (!data) return;
        shown = selectedRows();
        yearSelect.disabled = sourceSelect.value !== 'effective';
        var used = Array.from(new Set(shown.map(function (r) { return r.sourceId; }))), byId = sourcesById(data);
        count.textContent = money(shown.length) + ' รายการ';
        note.textContent = sourceSelect.value === 'effective'
            ? 'อ้างอิงฉบับที่ประกาศแล้วไม่เกินสิ้นปีงบที่เลือก และเท่าที่พบถึง ' + data.checkedAt + ' ปีที่ไม่มีฉบับใหม่ใช้ฉบับก่อนหน้า ไม่ใช่ราคาที่ประกาศใหม่ทุกปี'
            : 'เลือกดูฉบับเอกสารโดยตรง ปีงบไม่กรองในโหมดนี้ • ร่างและเกณฑ์ GIS แยกจากชุดเกณฑ์ทั่วไป';
        if (Number(yearSelect.value) <= 2552 && sourceSelect.value === 'effective') note.textContent = 'ยังไม่พบเอกสารต้นฉบับปี 2551–2552 ในแหล่งที่ตรวจสอบ จึงไม่มีราคายืนยันสำหรับปีนี้';
        if (Number(yearSelect.value) === 2554 && sourceSelect.value === 'effective') note.textContent += ' • ปี 2554 ยังไม่ยืนยัน PDF เกณฑ์ทั่วไป จึงแสดงฉบับปี 2553 ก่อนหน้า; ฉบับ GIS เลือกดูแยกได้';
        results.textContent = '';
        var sourceNote = el('details', null, 'scp-pa-sources');
        sourceNote.appendChild(el('summary', 'เอกสารที่ใช้ (' + used.length + ' ฉบับ) / ขอบเขตข้อมูล'));
        sourceNote.appendChild(el('p', 'คลังมี ' + data.sources.length + ' ฉบับ ครอบคลุมรายการที่พบตั้งแต่ 2553 ถึง 2569 และร่างสำหรับวางแผนงบ 2570 ยังขาดต้นฉบับ 2551–2552 ส่วนปี 2554 พบเกณฑ์ GIS แยกต่างหาก'));
        if (data.historicalResearch) {
            var research = el('details'); research.appendChild(el('summary', 'ผลค้นหาต้นฉบับที่ยังขาด • ตรวจ ' + data.historicalResearch.checkedAt));
            data.historicalResearch.findings.forEach(function (finding) { var p = el('p', 'ปี ' + finding.yearBE + ' — ' + finding.note + ' '); p.appendChild(link('แหล่งที่ตรวจสอบ', finding.url)); research.appendChild(p); });
            sourceNote.appendChild(research);
        }
        used.forEach(function (id) { var s = byId[id], p = el('p'); p.appendChild(link(sourceLabel(s) + ' • ' + dateLabel(s), new URL(s.localPath, baseUrl).href)); if (s.url) { p.appendChild(document.createTextNode(' · ')); p.appendChild(link('เว็บไซต์ต้นทาง', s.indexUrl || s.url)); } sourceNote.appendChild(p); if (s.notes) { var d = el('details'); d.appendChild(el('summary', 'หมายเหตุของเอกสาร')); d.appendChild(el('pre', s.notes)); sourceNote.appendChild(d); } });
        results.appendChild(sourceNote);
        if (!shown.length) results.appendChild(el('p', 'ไม่พบรายการตามเงื่อนไขนี้ ลองเลือกฉบับอื่นหรือเปลี่ยนคำค้น'));
        shown.slice(0, limit).forEach(function (r) {
            var s = byId[r.sourceId], card = el('article', null, 'scp-pa-card');
            var head = el('div', null, 'scp-pa-card-head'), title = el('div');
            title.appendChild(el('small', categories[r.category] + ' • รายการ ' + (r.item || 'เพิ่มเติม')));
            title.appendChild(el('h3', r.name));
            title.appendChild(el('p', dateLabel(s) + ' • หน้า ' + r.page + (s.scope === 'gis' ? ' • เกณฑ์ GIS' : '')));
            head.appendChild(title);
            var price = el('div', null, 'scp-pa-price'); price.appendChild(el('strong', money(r.price) + ' บาท')); price.appendChild(el('small', r.unit));
            head.appendChild(price); card.appendChild(head);
            var actions = el('div', null, 'scp-pa-actions');
            actions.appendChild(button('เพิ่มในประมาณการ', function () { if (busy) return; basket.push({ name: r.name, quantity: 1, unitPrice: r.price, referenceId: r.id }); saveBasket(); renderBasket(); setMode(true); basketBox.scrollIntoView({ block: 'start' }); }));
            actions.appendChild(link('PDF ต้นฉบับ · หน้า ' + r.page, new URL(s.localPath, baseUrl).href + '#page=' + r.page));
            card.appendChild(actions);
            var details = el('details'); details.appendChild(el('summary', 'คุณลักษณะและแหล่งอ้างอิง')); details.appendChild(el('p', sourceLabel(s)));
            details.appendChild(el('pre', r.specs || 'โปรดดูคุณลักษณะใน PDF ต้นฉบับ')); card.appendChild(details); results.appendChild(card);
        });
        if (shown.length > limit) results.appendChild(button('แสดงเพิ่มอีก ' + Math.min(pageSize, shown.length - limit) + ' รายการ', function () { limit += pageSize; renderPrices(); }));
    }
    function saveBasket(clean) { if (clean !== true) dirty = true; try { localStorage.setItem('scpPriceEstimateV1', JSON.stringify({ subject: subject.value, memo: memo.value, lines: basket, ticketId: ticketId, dirty: dirty })); } catch (ex) { } statusText(); }
    function field(label, value, type, change) { var l = el('label', label), input = el('input'); input.type = type || 'text'; input.value = value; if (type === 'number') { input.min = 0; input.step = 'any'; } input.addEventListener('change', function () { change(input); }); l.appendChild(input); return l; }
    function renderBasket() {
        basketBox.textContent = ''; basketBox.appendChild(el('h2', 'ประมาณการจัดหา / ซ่อม'));
        basketBox.appendChild(el('p', 'ราคาจากคลังเป็นเกณฑ์จัดหาอุปกรณ์ทั้งรายการ ส่วนค่าอะไหล่และค่าซ่อมให้กรอกตามใบเสนอราคา บันทึกกลางโดยผูกกับใบแจ้งซ่อม เพื่อเปิดต่อจากเครื่องอื่นตามสิทธิ์เข้าถึงเครื่อง'));
        var ticketLabelBox = el('label', 'ใบแจ้งซ่อมที่ผูกประมาณการ'), ticketSelect = el('select'); ticketSelect.id = 'scp-pa-ticket';
        option(ticketSelect, '', 'เลือกใบแจ้งซ่อม');
        ticketRows.forEach(function (row) { option(ticketSelect, row._id, ticketLabel(row) + (row.estimate ? ' • มีประมาณการแล้ว' : '')); });
        ticketSelect.value = ticketId;
        ticketSelect.onchange = function () { ticketId = ticketSelect.value; currentTicket = null; saveBasket(); renderBasket(); };
        ticketLabelBox.appendChild(ticketSelect); basketBox.appendChild(ticketLabelBox);
        var centralActions = el('div', null, 'scp-pa-actions');
        var load = button('เปิดข้อมูลกลางล่าสุด', function () { loadTicket(ticketId); }); load.disabled = !ticketId; centralActions.appendChild(load);
        var save = button('บันทึกกลาง / ผูกใบแจ้งซ่อม', saveCentral); save.id = 'scp-pa-save-central'; save.disabled = !ticketId || !basket.length; centralActions.appendChild(save);
        centralActions.appendChild(button('รีเฟรชใบแจ้งซ่อม', refreshTickets));
        centralActions.appendChild(button('สร้างใบแจ้งซ่อม / ดูประวัติ', function () { if (root.ScpOperations) { dialog.close(); root.ScpOperations.open('tickets'); } }));
        basketBox.appendChild(centralActions);
        estimateStatus = el('p', null, 'scp-pa-estimate-status'); estimateStatus.setAttribute('role', 'status'); basketBox.appendChild(estimateStatus); statusText();
        if (currentTicket) basketBox.appendChild(el('p', 'ใบแจ้งซ่อม: ' + ticketLabel(currentTicket) + ' • ' + currentTicket.department + ' • ' + currentTicket.contact));
        var idLabel = el('label', 'เครื่อง / แผนก / งาน'); idLabel.appendChild(subject); basketBox.appendChild(idLabel);
        var memoLabel = el('label', 'หมายเหตุ / แหล่งใบเสนอราคา'); memoLabel.appendChild(memo); basketBox.appendChild(memoLabel);
        basket.forEach(function (line, index) {
            var row = el('div', null, 'scp-pa-estimate-row');
            row.appendChild(field('รายการ', line.name, 'text', function (input) { line.name = input.value; saveBasket(); }));
            var update = function (key, input) { try { line[key] = number(input.value, key === 'quantity' ? 0.01 : 0); input.setCustomValidity(''); saveBasket(); renderBasket(); } catch (e) { input.setCustomValidity(e.message); input.reportValidity(); } };
            row.appendChild(field('จำนวน', line.quantity, 'number', function (input) { update('quantity', input); }));
            row.appendChild(field('ราคาต่อหน่วย (บาท)', line.unitPrice, 'number', function (input) { update('unitPrice', input); }));
            row.appendChild(el('strong', money(line.quantity * line.unitPrice) + ' บาท'));
            row.appendChild(button('ลบ', function () { basket.splice(index, 1); saveBasket(); renderBasket(); }));
            var ref = data && data.items.find(function (r) { return r.id === line.referenceId; });
            row.appendChild(el('small', line.reference ? 'เกณฑ์จัดหาเดิม ' + money(line.reference.price) + ' บาท • ' + line.reference.title + ' • หน้า ' + line.reference.page : ref ? 'เกณฑ์จัดหาเดิม ' + money(ref.price) + ' บาท • ' + dateLabel(sourcesById(data)[ref.sourceId]) + ' • หน้า ' + ref.page : 'ราคาที่กรอกเอง / ใบเสนอราคา'));
            basketBox.appendChild(row);
        });
        if (!basket.length) basketBox.appendChild(el('p', 'ยังไม่มีรายการ เลือกจากคลังหรือเพิ่มอะไหล่เอง'));
        basketBox.appendChild(el('p', 'รวมประมาณการ ' + money(total(basket)) + ' บาท', 'scp-pa-total'));
        var actions = el('div', null, 'scp-pa-actions');
        actions.appendChild(button('เพิ่มอะไหล่ / ค่าซ่อมเอง', function () { basket.push({ name: '', quantity: 1, unitPrice: 0 }); saveBasket(); renderBasket(); basketBox.lastElementChild.previousElementSibling.scrollIntoView({ block: 'nearest' }); }));
        var print = button('พิมพ์ประมาณการ / PDF', function () { printContent(true); }); print.disabled = !basket.length; actions.appendChild(print); basketBox.appendChild(actions);
        if (busy) basketBox.querySelectorAll('input,textarea,select,button').forEach(function (n) { n.disabled = true; });
        else { subject.disabled = false; memo.disabled = false; }
    }
    function printContent(estimate) {
        if (!data) return;
        if (estimate) { var invalid = Array.from(basketBox.querySelectorAll('input')).find(function (input) { return !input.checkValidity(); }); if (invalid) { invalid.reportValidity(); return; } }
        var area = el('div', null, 'scp-pa-print-root');
        area.appendChild(el('h1', estimate ? 'SCP-Remote — ประมาณการจัดหา / ซ่อม' : 'SCP-Remote — รายการราคากลางคอมพิวเตอร์'));
        area.appendChild(el('p', estimate ? subject.value : scopeText()));
        area.appendChild(el('p', 'จัดทำ ' + new Date().toLocaleString('th-TH') + ' • ตรวจสอบแหล่งข้อมูลถึง ' + data.checkedAt));
        if (estimate) {
            area.appendChild(el('p', currentTicket ? 'ใบแจ้งซ่อม: ' + ticketLabel(currentTicket) + ' • ' + currentTicket.department + ' • ผู้ติดต่อ: ' + currentTicket.contact : ticketId ? 'ใบแจ้งซ่อม: ' + ticketId : 'ร่างประมาณการ — ยังไม่ผูกใบแจ้งซ่อม'));
            area.appendChild(el('p', dirty || !currentTicket || !currentTicket.estimate ? 'ร่าง / มีการแก้ไขที่ยังไม่บันทึกกลาง' : 'บันทึกกลางฉบับที่ ' + currentTicket.estimate.revision + ' • ผู้บันทึก ' + currentTicket.estimate.updatedBy));
            area.appendChild(el('p', memo.value));
            area.appendChild(el('p', 'ประมาณการเพื่อวางแผน ราคาจัดหาอุปกรณ์และราคาที่กรอกเองแสดงแหล่งแยกกัน'));
            var table = el('table'), head = el('tr'); ['รายการ', 'จำนวน', 'บาท/หน่วย', 'รวม (บาท)', 'อ้างอิง'].forEach(function (text) { head.appendChild(el('th', text)); }); var thead = el('thead'); thead.appendChild(head); table.appendChild(thead); var tbody = el('tbody');
            basket.forEach(function (line) { var tr = el('tr'), r = data.items.find(function (r) { return r.id === line.referenceId; }), s = r && sourcesById(data)[r.sourceId], ref = line.reference; [line.name || 'รายการที่ยังไม่ระบุชื่อ', line.quantity, money(line.unitPrice), money(line.quantity * line.unitPrice), ref ? (ref.status === 'draft' ? 'ร่าง • ' : '') + ref.title + ' • หน้า ' + ref.page + ' • เกณฑ์เดิม ' + money(ref.price) : r ? sourceLabel(s) + ' • หน้า ' + r.page + ' • เกณฑ์เดิม ' + money(r.price) : 'ราคาใบเสนอ / กรอกเอง'].forEach(function (value) { tr.appendChild(el('td', value)); }); tbody.appendChild(tr); }); table.appendChild(tbody); area.appendChild(table); area.appendChild(el('h2', 'รวม ' + money(total(basket)) + ' บาท'));
        } else {
            area.appendChild(el('p', note.textContent + ' • ' + shown.length + ' รายการ'));
            shown.forEach(function (r) { var s = sourcesById(data)[r.sourceId], card = el('article'); card.appendChild(el('h2', (r.item ? r.item + '. ' : '') + r.name + ' — ' + money(r.price) + ' บาท')); card.appendChild(el('p', r.unit + ' • ' + sourceLabel(s) + ' • ' + dateLabel(s) + ' • หน้า ' + r.page)); card.appendChild(el('pre', r.specs)); area.appendChild(card); });
            Array.from(new Set(shown.map(function (r) { return r.sourceId; }))).forEach(function (id) { var s = sourcesById(data)[id]; if (s.notes) { area.appendChild(el('h2', 'หมายเหตุของเอกสาร — ' + sourceLabel(s))); area.appendChild(el('pre', s.notes)); } });
        }
        var printDialog = el('dialog', null, 'scp-pa-print-dialog'); printDialog.appendChild(area); document.body.appendChild(printDialog);
        // A modal dialog's top layer otherwise covers the report in Chrome print.
        printDialog.showModal(); document.documentElement.classList.add('scp-pa-printing');
        var clean = function () { document.documentElement.classList.remove('scp-pa-printing'); printDialog.close(); printDialog.remove(); root.removeEventListener('afterprint', clean); };
        root.addEventListener('afterprint', clean); root.requestAnimationFrame(function () { root.print(); });
    }
    function create() {
        dialog = el('dialog', null, 'scp-price-archive'); dialog.id = 'scpPriceArchive'; dialog.setAttribute('aria-labelledby', 'scp-pa-title');
        var head = el('header'), title = el('h2', 'คลังราคากลางคอมพิวเตอร์'); title.id = 'scp-pa-title'; head.appendChild(title); head.appendChild(button('ปิด', function () { dialog.close(); })); dialog.appendChild(head);
        var toolbar = el('div', null, 'scp-pa-toolbar');
        yearSelect = el('select'); for (var y = 2570; y >= 2551; y--) option(yearSelect, y, 'ปีงบ ' + y);
        sourceSelect = el('select'); option(sourceSelect, 'effective', 'เกณฑ์ทั่วไปที่ใช้ได้ถึงปีงบนี้'); option(sourceSelect, 'all', 'ทุกฉบับ รวมร่าง / GIS');
        categorySelect = el('select'); option(categorySelect, '', 'ทุกอุปกรณ์ / ทุกหมวด'); Object.keys(categories).forEach(function (key) { option(categorySelect, key, categories[key]); });
        [[yearSelect, 'ปีงบประมาณ'], [sourceSelect, 'ฉบับอ้างอิง'], [categorySelect, 'ประเภทอุปกรณ์']].forEach(function (pair) { var label = el('label', pair[1]); label.appendChild(pair[0]); toolbar.appendChild(label); pair[0].addEventListener('change', function () { limit = pageSize; renderPrices(); }); });
        search = el('input'); search.type = 'search'; search.placeholder = 'ค้นชื่อหรือสเปก เช่น All In One, RAM, UPS'; search.setAttribute('aria-label', 'ค้นชื่อหรือสเปก'); search.addEventListener('input', function () { limit = pageSize; renderPrices(); }); toolbar.appendChild(search); dialog.appendChild(toolbar);
        note = el('p', 'กำลังโหลดคลัง…', 'scp-pa-note'); note.setAttribute('role', 'status'); dialog.appendChild(note);
        var actions = el('nav', null, 'scp-pa-actions'); count = el('strong', ''); actions.appendChild(count);
        count.className = 'scp-pa-prices-only';
        actions.appendChild(button('รายการราคากลาง', function () { setMode(false); }));
        actions.appendChild(button('ประมาณการจัดหา / ซ่อม', function () { setMode(true); renderBasket(); }));
        actions.appendChild(button('ส่งออก CSV', function () { if (!data) return; var url = URL.createObjectURL(new Blob([csv(shown, data)], { type: 'text/csv;charset=utf-8' })); var a = el('a'); a.href = url; a.download = 'ราคากลาง-' + yearSelect.value + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }));
        actions.lastElementChild.className = 'scp-pa-prices-only';
        actions.appendChild(button('พิมพ์รายการพร้อมสเปก / PDF', function () { printContent(false); })); actions.lastElementChild.className = 'scp-pa-prices-only'; dialog.appendChild(actions);
        var body = el('section', null, 'scp-pa-body'); results = el('div'); basketBox = el('section'); basketBox.hidden = true; subject = el('input'); memo = el('textarea'); subject.addEventListener('input', saveBasket); memo.addEventListener('input', saveBasket);
        try { var saved = JSON.parse(localStorage.getItem('scpPriceEstimateV1') || '{}'); subject.value = String(saved.subject || ''); memo.value = String(saved.memo || ''); ticketId = String(saved.ticketId || ''); if (Array.isArray(saved.lines)) basket = saved.lines.map(function (l) { return { name: String(l.name || ''), quantity: number(l.quantity, 0.01), unitPrice: number(l.unitPrice, 0), referenceId: String(l.referenceId || ''), reference: l.reference }; }); dirty = saved.dirty !== false && basket.length > 0; } catch (ex) { basket = []; }
        body.appendChild(results); body.appendChild(basketBox); dialog.appendChild(body); document.body.appendChild(dialog); renderBasket();
    }
    async function open(options) {
        if (!dialog) create();
        if (!dialog.open) dialog.showModal();
        await refreshTickets();
        if (options && options.ticketId) { setMode(true); await loadTicket(options.ticketId); }
        else setMode(false);
        if (data) { renderPrices(); return; }
        if (loading) return;
        loading = true; note.textContent = 'กำลังโหลดคลัง…';
        try {
            var response = await fetch(new URL('data/reference-prices/catalog.json', baseUrl), { credentials: 'same-origin' });
            if (!response.ok) throw Error('HTTP ' + response.status);
            data = await response.json();
            data.sources.forEach(function (s) { option(sourceSelect, s.id, sourceLabel(s)); }); renderPrices(); renderBasket();
        } catch (ex) { note.textContent = 'โหลดคลังไม่สำเร็จ กดปิดแล้วเปิดใหม่เพื่อลองอีกครั้ง (' + ex.message + ')'; }
        finally { loading = false; }
    }
    api.open = open; root.ScpPriceArchive = api;
}(typeof window !== 'undefined' ? window : globalThis));
