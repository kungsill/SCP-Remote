'use strict';
// The new-repair form: the men's and women's inpatient wards are departments (and are chosen from
// the computer's name), and IT staff can add their own common problems and departments, which
// the server keeps for everyone (hospital/operations.js ticketLists / ticketListsSave).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const script = name => fs.readFileSync(path.join(__dirname, '../../public/scripts', name), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 5)); };

function page(t, opts = {}) {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window, sent = [];
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.nodes = opts.nodes || [{ _id: 'node//1', name: 'ตึกหญิง ฝั่ง1 เครื่องกลาง', conn: 1 }];
    w.userinfo = { _id: 'user//tech', siteadmin: 0 };
    w.users = { 'user//tech': { _id: 'user//tech', name: 'tech' } };
    w.confirm = () => true;
    w.prompt = () => opts.promptAnswer || null;
    const lists = opts.lists || { symptoms: [], departments: [] };
    w.meshserver = { send: c => { sent.push(c); setTimeout(() => {
        if ((c.op === 'ticketLists' || c.op === 'ticketListsSave') && opts.oldServer) { w.ScpOperations.receive({ tag: c.tag, error: 'UNKNOWN_OPERATION' }); return; }
        let result;
        if (c.op === 'tickets') result = [];
        else if (c.op === 'ticketLists') result = lists;
        else if (c.op === 'ticketListsSave') {
            const key = c.kind === 'symptoms' ? 'title' : 'name';
            lists[c.kind] = lists[c.kind].filter(x => x[key] !== (c.title || c.name));
            if (c.action === 'add') lists[c.kind].push(c.kind === 'symptoms' ? { title: c.title.trim(), description: c.description, icon: '📝' } : { name: c.name.trim() });
            result = JSON.parse(JSON.stringify(lists));
        }
        w.ScpOperations.receive({ tag: c.tag, result });
    }, 0); } };
    w.eval(script('scp-ticket-presets.js'));
    w.eval(script('scp-operations.js'));
    return { w, sent, doc: w.document };
}
async function newForm(p) {
    p.w.ScpOperations.open();
    await settle();
    [...p.doc.querySelectorAll('button')].find(b => b.textContent === 'แจ้งซ่อมใหม่').click();
    await settle();
    const doc = p.doc, selects = [...doc.querySelectorAll('#scpOperations select')];
    const labelled = text => [...doc.querySelectorAll('#scpOperations label')].find(l => l.textContent.trim().startsWith(text));
    return {
        presets: selects[1], department: selects[2],
        title: labelled('หัวข้อปัญหา').querySelector('input'),
        description: doc.querySelector('#scpOperations textarea'),
        button: text => [...doc.querySelectorAll('#scpOperations button')].find(b => b.textContent.includes(text)),
    };
}
const options = select => [...select.options].map(o => o.value);

test('the inpatient wards for men and women are departments', async t => {
    const f = await newForm(page(t));
    assert.ok(options(f.department).includes('ตึกผู้ป่วยในชาย'));
    assert.ok(options(f.department).includes('ตึกผู้ป่วยในหญิง'));
});

test('a computer on the women\'s ward gets that department by itself', async t => {
    const f = await newForm(page(t));
    assert.equal(f.department.value, 'ตึกผู้ป่วยในหญิง');
});

test('and one on the men\'s ward the men\'s', async t => {
    const f = await newForm(page(t, { nodes: [{ _id: 'node//2', name: 'ตึกชาย เคาน์เตอร์', conn: 1 }] }));
    assert.equal(f.department.value, 'ตึกผู้ป่วยในชาย');
});

test('problems added earlier are in the list and fill the form', async t => {
    const f = await newForm(page(t, { lists: { symptoms: [{ title: 'จอทัชไม่ตอบสนอง', description: 'Calibrate ใหม่', icon: '📝' }], departments: [] } }));
    const opt = [...f.presets.options].find(o => o.textContent.includes('จอทัชไม่ตอบสนอง'));
    assert.ok(opt, 'the added problem is offered');
    f.presets.value = opt.value;
    f.presets.dispatchEvent(new f.presets.ownerDocument.defaultView.Event('change'));
    assert.equal(f.title.value, 'จอทัชไม่ตอบสนอง');
    assert.equal(f.description.value, 'Calibrate ใหม่');
});

test('what was typed can be kept as a common problem for next time', async t => {
    const p = page(t);
    const f = await newForm(p);
    f.title.value = 'สแกนนิ้วไม่ติด';
    f.description.value = 'เช็ดหัวอ่าน เสียบ USB ใหม่';
    f.button('บันทึกเป็นอาการพบบ่อย').click();
    await settle();
    const save = p.sent.find(c => c.op === 'ticketListsSave');
    assert.deepEqual({ kind: save.kind, action: save.action, title: save.title, description: save.description },
        { kind: 'symptoms', action: 'add', title: 'สแกนนิ้วไม่ติด', description: 'เช็ดหัวอ่าน เสียบ USB ใหม่' });
    assert.ok([...f.presets.options].some(o => o.textContent.includes('สแกนนิ้วไม่ติด')));
});

test('without a problem typed nothing is saved', async t => {
    const p = page(t);
    const f = await newForm(p);
    f.button('บันทึกเป็นอาการพบบ่อย').click();
    await settle();
    assert.equal(p.sent.some(c => c.op === 'ticketListsSave'), false);
});

test('only an added problem can be removed', async t => {
    const p = page(t, { lists: { symptoms: [{ title: 'ของเพิ่มเอง', description: '', icon: '📝' }], departments: [] } });
    const f = await newForm(p);
    const remove = f.button('ลบอาการนี้');
    const Event = p.w.Event;
    f.presets.value = '0';
    f.presets.dispatchEvent(new Event('change'));
    assert.equal(remove.hidden, true, 'a built-in problem has no remove');
    f.presets.value = [...f.presets.options].find(o => o.textContent.includes('ของเพิ่มเอง')).value;
    f.presets.dispatchEvent(new Event('change'));
    assert.equal(remove.hidden, false);
    remove.click();
    await settle();
    const del = p.sent.find(c => c.op === 'ticketListsSave' && c.action === 'remove');
    assert.equal(del.title, 'ของเพิ่มเอง');
    assert.ok(![...f.presets.options].some(o => o.textContent.includes('ของเพิ่มเอง')));
});

test('a department can be added and is then chosen', async t => {
    const p = page(t, { promptAnswer: 'ห้องแยกโรค' });
    const f = await newForm(p);
    f.button('เพิ่มหน่วยงาน').click();
    await settle();
    assert.ok(p.sent.some(c => c.op === 'ticketListsSave' && c.kind === 'departments' && c.name === 'ห้องแยกโรค'));
    assert.equal(f.department.value, 'ห้องแยกโรค');
});

test('before the server knows the lists, the form still works with the built-in ones', async t => {
    const p = page(t, { oldServer: true });
    const f = await newForm(p);
    assert.ok(f.presets.options.length > 10);
    assert.equal(f.department.value, 'ตึกผู้ป่วยในหญิง');
});
