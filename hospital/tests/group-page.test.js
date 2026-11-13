'use strict';
// The device group page rearranged after MeshCentral draws it. The HTML fed in below is what
// p20updateMesh() writes, built from the same strings as in views/default.handlebars.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const view = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
const prop = (k, v) => '<table><td style=width:120px>' + k + '<td><b>' + v + '</b></table>';
const link = (txt, f) => '<span tabindex=0 style=cursor:pointer onclick=\'' + f + '\'>' + txt + ' <img class=hoverButton src=images/link5.png></span>';
const info =
    prop('คำอธิบาย', link('การเงิน', 'p20editmesh(2)')) + prop('ประเภท', 'จัดการด้วยเอเจนต์ซอฟต์แวร์') + prop('Intel® AMT', link('ไม่มีนโยบาย', 'p20editMeshAmt()')) +
    '<br><input type=button value=บันทึก onclick=showNotes(false,"x") /><br style=clear:both><br>' +
    '<a href=# onclick="return p20showAddMeshUserDialog()"><img src=images/icon-addnew.png> เพิ่มผู้ใช้</a>' +
    '<a href=# onclick=\'return addAgentToMesh("mesh//f")\'><img src=images/icon-addnew.png> เพิ่มเอเจนต์</a>' +
    '<table style="color:black;background-color:#EEE" border=0><tbody><tr style=background-color:#AAAAAA><th>สิทธิ์อนุญาตผู้ใช้</th></tr><tr><td>admin</td><td>สิทธิ์ทั้งหมด</td></tr></tbody></table>';
const row = (id, name, gray) => '<tr><td style=width:30%><div class="j1' + (gray ? ' gray' : '') + '"></div>&nbsp;<a onclick=\'gotoDevice("' + id + '",10);haltEvent(event);\'>' + name + '</a></td><td style=width:70%><div style=float:right>มีไฟเลี้ยง&nbsp;</div><div>Windows 10</div></td></tr>';
const info2 = '<table style="color:black;background-color:#EEE" border=0><tbody><tr style=background-color:#AAAAAA><th>อุปกรณ์</th><th></th></tr>' +
    row('node//1', 'การเงิน 1', true) + row('node//3', 'การเงิน 3', false) + '</tbody></table>' +
    '<div style=font-size:small;text-align:right><span><a href=# onclick=p20showDeleteMeshDialog()>ลบกลุ่ม</a></span></div>';

function page(t) {
    const dom = new JSDOM('<html lang="th"><body><p id=p20info></p><p id=p20info2></p></body></html>', { runScripts: 'outside-only' });
    const w = dom.window, opened = [];
    t.after(() => w.close());
    w.nodes = [{ _id: 'node//1', conn: 0 }, { _id: 'node//3', conn: 1 }];
    w.ScpDashboard = { openRemote: n => opened.push(n._id) };
    w.setTimeout = () => 0;
    // the page sets these with innerHTML (QH), which keeps the tables and divs inside the <p>
    w.document.getElementById('p20info').innerHTML = info;
    w.document.getElementById('p20info2').innerHTML = info2;
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-group.js'), 'utf8'));
    w.ScpGroup.tidy(w.document.getElementById('p20info'), w.document.getElementById('p20info2'));
    return { w, doc: w.document, opened };
}
const visible = el => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (n.classList.contains('scp-grp-hidden')) return false; return true; };

test('a summary says how many computers there are and how many are on', (t) => {
    const { doc } = page(t);
    assert.deepEqual([...doc.querySelectorAll('.scp-grp-chip')].map(c => c.textContent), ['2 เครื่อง', 'เปิดอยู่ 1', 'ปิดอยู่ 1']);
});

test('the details are one card, without Intel AMT', (t) => {
    const { doc } = page(t);
    const card = doc.querySelector('.scp-grp-props');
    assert.match(card.textContent, /คำอธิบาย/);
    assert.match(card.textContent, /ประเภท/);
    const amt = doc.querySelector('[onclick*="p20editMeshAmt"]');
    assert.ok(amt, 'still in the page');
    assert.equal(visible(amt), false);
    assert.ok(card.querySelector('[onclick="p20editmesh(2)"]'), 'editing the description still works from the card');
});

test('add-user, add-computer and notes are buttons that keep their own actions', (t) => {
    const { doc } = page(t);
    const btns = [...doc.querySelectorAll('.scp-grp-actions .scp-grp-btn')];
    assert.equal(btns.length, 3);
    assert.ok(btns.some(b => /p20showAddMeshUserDialog/.test(b.getAttribute('onclick'))));
    assert.ok(btns.some(b => /addAgentToMesh/.test(b.getAttribute('onclick'))));
    assert.equal(doc.querySelector('.scp-grp-actions img'), null);
});

test('each computer that is on has Remote; one that is off does not', (t) => {
    const { doc, opened } = page(t);
    const rows = [...doc.querySelectorAll('.scp-grp-devices tr')].slice(1);
    assert.ok(rows[0].classList.contains('scp-grp-off'));
    assert.equal(rows[0].querySelector('.scp-grp-remote'), null);
    assert.ok(rows[1].classList.contains('scp-grp-on'));
    rows[1].querySelector('.scp-grp-remote').click();
    assert.deepEqual(opened, ['node//3']);
});

test('Delete group is set apart and still asks through the page\'s own dialog', (t) => {
    const { doc } = page(t);
    const del = doc.querySelector('.scp-grp-delete');
    assert.equal(del.getAttribute('onclick'), 'p20showDeleteMeshDialog()');
    assert.ok(del.closest('.scp-grp-danger'));
    assert.match(del.textContent, /ลบกลุ่มนี้/);
});

test('it runs after the page draws the group, and the page loads it', () => {
    const src = fs.readFileSync(path.join(root, 'public/scripts/scp-group.js'), 'utf8');
    assert.match(src, /root\.p20updateMesh = function \(\) \{\s*var r = original\.apply\(this, arguments\);/);
    assert.match(view, /scripts\/scp-group\.js\?v=/);
    assert.match(view, /styles\/scp-group\.css\?v=/);
});
