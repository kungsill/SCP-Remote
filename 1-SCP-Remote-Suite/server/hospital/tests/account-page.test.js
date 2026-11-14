'use strict';
// The My Account page laid out as cards, with the unused controls hidden. Driven against the
// real page markup taken from views/default.handlebars.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const view = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
const markup = view.slice(view.indexOf('<div id=p2 '), view.indexOf('<div id=p3 '));

function page(t, extra) {
    const dom = new JSDOM('<html lang="th"><body>' + markup + '</body></html>', { runScripts: 'outside-only' });
    const w = dom.window, calls = [];
    t.after(() => w.close());
    w.setInterval = () => 1;
    w.userinfo = { name: 'admin', realname: 'IT รพ.สีชมพู', email: 'it@example.org', siteadmin: 0xFFFFFFFF };
    w.meshes = { 'mesh//er': { _id: 'mesh//er', name: 'ER' }, 'mesh//ari': { _id: 'mesh//ari', name: 'ARI' }, 'mesh//old': { _id: 'mesh//old', name: 'old', deleted: true } };
    w.nodes = [{ _id: 'n1', meshid: 'mesh//er', conn: 1 }, { _id: 'n2', meshid: 'mesh//er', conn: 0 }, { _id: 'n3', meshid: 'mesh//ari', conn: 1 }];
    w.GetMeshRights = () => 0xFFFFFFFF;
    for (const f of ['gotoMesh', 'account_showChangePassword', 'account_viewPreviousLogins', 'account_createMesh', 'account_showDeleteAccount', 'account_createLoginToken']) w[f] = arg => calls.push([f, arg]);
    w.updateMeshes = () => calls.push(['updateMeshes']);
    Object.assign(w, extra || {});
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-account.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    return { w, doc: w.document, calls };
}
const visible = el => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (n.classList.contains('scp-acct-hidden')) return false; return true; };
const link = (doc, fn) => [...doc.querySelectorAll('a[onclick]')].find(a => (a.getAttribute('onclick') || '').includes(fn));

test('delete account, login tokens and the 2FA controls are hidden; the page\'s own elements are kept', (t) => {
    const { doc } = page(t);
    assert.equal(visible(link(doc, 'account_showDeleteAccount')), false);
    assert.equal(visible(doc.getElementById('accountCreateLoginTokenSpan')), false);
    assert.equal(visible(doc.getElementById('p2AccountSecurity')), false);
    // still in the document, so the page can keep showing and hiding them by id
    for (const id of ['p2AccountSecurity', 'accountCreateLoginTokenSpan', 'p2meshes', 'p2noMeshFound', 'verifyEmailId', 'accountEnableNotificationsSpan']) assert.ok(doc.getElementById(id), id);
});

test('what is used stays reachable', (t) => {
    const { doc } = page(t);
    for (const fn of ['account_showChangePassword', 'account_viewPreviousLogins', 'account_showLocalizationSettings', 'account_showAccountNotifySettings']) assert.equal(visible(link(doc, fn)), true, fn);
    assert.equal(visible(doc.getElementById('p2AccountImage')), true);
});

test('the top card says who is signed in, with password and login history one press away', (t) => {
    const { doc, calls } = page(t);
    const me = doc.querySelector('.scp-acct-me');
    assert.match(me.textContent, /IT รพ\.สีชมพู/);
    assert.match(me.textContent, /it@example\.org/);
    assert.match(me.textContent, /ผู้ดูแลระบบ/);
    [...me.querySelectorAll('button')].find(b => b.textContent === 'เปลี่ยนรหัสผ่าน').click();
    [...me.querySelectorAll('button')].find(b => b.textContent === 'ดูการเข้าสู่ระบบก่อนหน้า').click();
    assert.deepEqual(calls.map(c => c[0]), ['account_showChangePassword', 'account_viewPreviousLogins']);
});

test('departments are cards with how many computers are on, sorted, searchable, and open the group', (t) => {
    const { doc, calls } = page(t);
    const cards = () => [...doc.querySelectorAll('.scp-acct-group')];
    assert.deepEqual(cards().map(c => c.querySelector('strong').textContent), ['ARI', 'ER'], 'sorted, deleted groups left out');
    assert.match(cards()[1].textContent, /1 \/ 2 ออนไลน์/);
    assert.match(doc.getElementById('scpAcctGroupCount').textContent, /2 กลุ่ม/);
    const find = doc.querySelector('.scp-acct-find');
    find.value = 'er'; find.dispatchEvent(new doc.defaultView.Event('input'));
    assert.deepEqual(cards().map(c => c.querySelector('strong').textContent), ['ER']);
    cards()[0].click();
    assert.deepEqual(calls.at(-1), ['gotoMesh', 'mesh//er']);
    find.value = 'zzz'; find.dispatchEvent(new doc.defaultView.Event('input'));
    assert.match(doc.querySelector('.scp-acct-empty').textContent, /ไม่พบกลุ่ม/);
});

test('when the page redraws its own list, the cards follow', (t) => {
    const { w, doc, calls } = page(t);
    w.meshes['mesh//lab'] = { _id: 'mesh//lab', name: 'Lab' };
    w.updateMeshes();
    assert.ok(calls.some(c => c[0] === 'updateMeshes'), 'the page\'s own function still runs');
    assert.ok([...doc.querySelectorAll('.scp-acct-group strong')].some(s => s.textContent === 'Lab'));
});

test('the page loads it, and nothing is drawn twice', (t) => {
    assert.match(view, /scripts\/scp-account\.js\?v=/);
    assert.match(view, /styles\/scp-account\.css\?v=/);
    const { w, doc } = page(t);
    w.ScpAccount.build();
    assert.equal(doc.querySelectorAll('.scp-acct-top').length, 1);
});
