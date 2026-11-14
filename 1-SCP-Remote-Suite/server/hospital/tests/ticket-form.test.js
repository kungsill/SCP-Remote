'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('Garuda assets exist on disk for official Thai document printing', () => {
    const svgPath = path.join(__dirname, '../../public/images/garuda.svg');
    const pngPath = path.join(__dirname, '../../public/images/garuda.png');
    assert.ok(fs.existsSync(svgPath), 'garuda.svg must exist');
    assert.ok(fs.existsSync(pngPath), 'garuda.png fallback must exist');
    assert.ok(fs.statSync(svgPath).size > 1000, 'garuda.svg must not be empty');
});

test('Hospital departments list contains Sichomphu hospital departments and clinical units (ER, OPD, OR, LR, ARI, IPD)', () => {
    const presetsModule = require('../../public/scripts/scp-ticket-presets');
    assert.ok(presetsModule.departments, 'Departments array must exist');
    assert.ok(presetsModule.departments.length >= 23, 'Must have at least 23 departments including clinical units');

    // Check requested clinical units
    const requestedUnits = ['ER', 'OPD', 'OR', 'LR', 'ARI', 'IPD'];
    for (const u of requestedUnits) {
        assert.ok(
            presetsModule.departments.some(d => d.startsWith(u) || d.includes(u)),
            `Departments must include clinical unit ${u}`
        );
    }

    assert.ok(Array.isArray(presetsModule.quickUnits), 'quickUnits array must exist');
    for (const u of requestedUnits) {
        assert.ok(presetsModule.quickUnits.includes(u), `quickUnits must include ${u}`);
    }

    const expectedDepts = [
        'กลุ่มงานการพยาบาล',
        'กลุ่มงานบริหารทั่วไป',
        'กลุ่มงานทันตกรรม',
        'กลุ่มงานทางการแพทย์',
        'กลุ่มงานเภสัชกรรมและคุ้มครองผู้บริโภค',
        'งานสุขาภิบาลป้องกันควบคุมโรค',
        'กลุ่มงานเทคนิคการแพทย์',
        'งานประกันสุขภาพยุทธศาสตร์',
        'งานส่งเสริมสุขภาพ',
        'กลุ่มงานโภชนศาสตร์',
        'กลุ่มงานจิตเวชและยาเสพติด',
        'งานไฟฟ้าและอาคารสถานที่',
        'กลุ่มงานการแพทย์แผนไทย',
        'กลุ่มงานเวชกรรมฟื้นฟู',
        'กลุ่มงานสุขภาพดิจิทัล',
        'งานพยาบาลชุมชน',
        'กลุ่มงานทางรังสีวิทยา'
    ];
    for (const d of expectedDepts) {
        assert.ok(presetsModule.departments.includes(d), `Department list must include ${d}`);
    }
});

test('Common repair presets include clock/time desync and technical descriptions', () => {
    const presetsModule = require('../../public/scripts/scp-ticket-presets');
    assert.ok(Array.isArray(presetsModule.presets), 'Presets array must exist');
    assert.ok(presetsModule.presets.length >= 20, 'Must have at least 20 presets');

    const clockPreset = presetsModule.presets.find(p => p.title.includes('นาฬิกาไม่ตรง') || p.title.includes('เวลาไม่ตรง'));
    assert.ok(clockPreset, 'Must have preset for clock/time desync');
    assert.ok(clockPreset.description.includes('CR2032'), 'Clock preset must describe BIOS CR2032 battery');
    assert.ok(clockPreset.description.includes('ถ่าน'), 'Clock preset must mention battery');

    // Check all presets have title and description
    for (const p of presetsModule.presets) {
        assert.ok(p.title && p.title.length > 0, 'Preset must have title');
        assert.ok(p.description && p.description.length > 20, 'Preset must have detailed description');
        assert.ok(p.category && p.category.length > 0, 'Preset must have category');
    }
});

test('ScpTicketForm builds complete Thai government maintenance form', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const window = dom.window;
    global.window = window;
    global.document = window.document;

    const presetsCode = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ticket-presets.js'), 'utf8');
    dom.window.eval(presetsCode);

    const scriptCode = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ticket-form.js'), 'utf8');
    dom.window.eval(scriptCode);

    const ScpTicketForm = window.ScpTicketForm;
    assert.ok(ScpTicketForm, 'ScpTicketForm must be defined on window');

    // 1. Test buildDataFromTicket with null (sample data from scanned form)
    const sample = ScpTicketForm.buildDataFromTicket(null);
    assert.equal(sample.ticketNo, 'C70-00006');
    assert.equal(sample.department, 'งานสุขภาพดิจิทัล');
    assert.equal(sample.contact, '0930946817');
    assert.equal(sample.title, 'แบตสำรองไม่เก็บไฟ ตู้เก็บเงิน');
    assert.equal(sample.requesterName, 'นาย ชัยรัตน์ ประภัยวงษ์');
    assert.equal(sample.headName, 'นายชวลิต  โพธิ์หล้า');

    // 2. Test buildDataFromTicket with ticket object
    window.nodes = [{ _id: 'node/test-pc', name: 'PC-OPD-01', model: 'Dell OptiPlex 7070', assetNumber: '7440-001-0001' }];
    const ticketData = ScpTicketForm.buildDataFromTicket({
        _id: 'ticket/12345',
        nodeid: 'node/test-pc',
        department: 'กลุ่มงานผู้ป่วยนอก',
        contact: '1102',
        title: 'จอภาพไม่ติด',
        estimate: { lines: [{ name: 'สาย DisplayPort', quantity: 1, unitPrice: 250, amount: 250 }] }
    });
    assert.equal(ticketData.department, 'กลุ่มงานผู้ป่วยนอก');
    assert.equal(ticketData.contact, '1102');
    assert.equal(ticketData.model, 'Dell OptiPlex 7070');
    assert.equal(ticketData.assetNumber, '7440-001-0001');
    assert.ok(ticketData.partsUsed.includes('สาย DisplayPort'));

    // 3. Test renderPaper DOM structure
    const paper = ScpTicketForm.renderPaper(sample);
    assert.ok(paper.classList.contains('scp-repair-paper'));

    // Check Header & Garuda
    const garuda = paper.querySelector('.scp-rf-garuda img');
    assert.ok(garuda, 'Garuda image must be present');
    assert.equal(garuda.getAttribute('alt'), 'ตราครุฑ');
    assert.ok(paper.textContent.includes('บันทึกแจ้งซ่อม'));
    assert.ok(paper.textContent.includes('ส่วนราชการ โรงพยาบาลสีชมพู อำเภอ สีชมพู จังหวัด ขอนแก่น'));
    assert.ok(paper.textContent.includes('งานสุขภาพดิจิทัล'));
    assert.ok(paper.textContent.includes('0930946817'));

    // Check 4 Sections
    assert.ok(paper.textContent.includes('ส่วนที่ 1 ผู้แจ้ง'));
    assert.ok(paper.textContent.includes('ส่วนที่ 2 ช่าง'));
    assert.ok(paper.textContent.includes('ส่วนที่ 3 ส่วนสั่งพัสดุเพิ่ม'));
    assert.ok(paper.textContent.includes('ส่วนที่ 4 ส่วนส่งมอบงาน'));

    // Check custom checkboxes
    const checkboxes = paper.querySelectorAll('.scp-rf-chk');
    assert.ok(checkboxes.length >= 8, 'Must have at least 8 custom checkboxes');
    const checkedBox = paper.querySelector('.scp-rf-box.checked');
    assert.ok(checkedBox, 'Default urgency checked box must exist');

    // Test checkbox toggle
    const chk = checkboxes[0];
    const initialChecked = chk.getAttribute('aria-checked') === 'true';
    chk.click();
    assert.notEqual(chk.getAttribute('aria-checked') === 'true', initialChecked, 'Click should toggle checkbox state');

    // Check Signatures
    assert.ok(paper.textContent.includes('ผู้แจ้งซ่อม'));
    assert.ok(paper.textContent.includes('หัวหน้าหน่วยงาน'));
    assert.ok(paper.textContent.includes('เจ้าที่พัสดุ'));
    assert.ok(paper.textContent.includes('ผู้อนุมัติ'));
    assert.ok(paper.textContent.includes('ช่างผู้ทำการตรวจสอบ'));
});

test('ScpTicketForm draws a QR code of the ticket and keeps typing inside the dialog', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const window = dom.window;
    global.window = window;
    global.document = window.document;
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };

    for (const f of ['qrcode.min.js', 'scp-ticket-presets.js', 'scp-ticket-form.js']) {
        dom.window.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts', f), 'utf8'));
    }

    const paper = window.ScpTicketForm.renderPaper(window.ScpTicketForm.buildDataFromTicket(null));
    const qrPath = paper.querySelector('.scp-rf-qr svg path');
    assert.ok(qrPath && qrPath.getAttribute('d').length > 100, 'QR code must be drawn in the top-right box');

    // Empty fields still get a clickable area to type into
    assert.ok(paper.querySelector('[data-field="findings"]').isContentEditable !== false);

    // The page's own key handlers (device search) must not see keystrokes from the form
    let leaked = 0;
    window.document.addEventListener('keypress', () => { leaked++; });
    window.ScpTicketForm.open(null);
    const field = window.document.querySelector('#scpRepairTicketDialog [data-field="title"]');
    field.dispatchEvent(new window.KeyboardEvent('keypress', { key: 'a', bubbles: true }));
    assert.equal(leaked, 0, 'Typing in the form must not reach document key handlers');

    // Department picker fills the department on the paper
    const deptSelect = Array.from(window.document.querySelectorAll('#scpRepairTicketDialog select'))
        .find(s => s.options[0].textContent.includes('หน่วยงาน'));
    assert.ok(deptSelect, 'Department picker must exist');
    assert.ok(deptSelect.querySelectorAll('option').length >= 24);
    deptSelect.value = 'กลุ่มงานทางรังสีวิทยา';
    deptSelect.dispatchEvent(new window.Event('change'));
    assert.equal(window.document.querySelector('#scpRepairTicketDialog [data-field="department"]').textContent, 'กลุ่มงานทางรังสีวิทยา');
});

test('ScpTicketForm print lifecycle mounts iframe or print root', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const window = dom.window;
    global.window = window;
    global.document = window.document;

    let printed = false;
    window.print = () => { printed = true; };

    const presetsCode = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ticket-presets.js'), 'utf8');
    dom.window.eval(presetsCode);

    const scriptCode = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ticket-form.js'), 'utf8');
    dom.window.eval(scriptCode);

    const paper = window.ScpTicketForm.renderPaper();
    window.ScpTicketForm.print(paper);

    const iframe = window.document.querySelector('#scpTicketPrintFrame');
    const printRoot = window.document.querySelector('.scp-repair-ticket-print-root');
    assert.ok(iframe || printRoot || printed, 'Print method must initiate printing');
});

test('ScpTicketForm printDirect triggers direct print with self-contained styles', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'dangerously' });
    const window = dom.window;
    global.window = window;
    global.document = window.document;

    let printed = false;
    window.print = () => { printed = true; };

    const presetsCode = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ticket-presets.js'), 'utf8');
    dom.window.eval(presetsCode);

    const scriptCode = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ticket-form.js'), 'utf8');
    dom.window.eval(scriptCode);

    assert.equal(typeof window.ScpTicketForm.printDirect, 'function', 'printDirect must be a function');

    window.ScpTicketForm.printDirect({
        ticketNo: 'C70-99999',
        department: 'ER',
        title: 'นาฬิกาไม่ตรง / เวลาไม่ตรง',
        description: 'เปลี่ยนถ่าน BIOS CR2032'
    });

    const iframe = window.document.querySelector('#scpTicketPrintFrame');
    assert.ok(iframe, 'printDirect must mount the print iframe');
});
