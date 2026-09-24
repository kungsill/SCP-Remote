'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function setup(t){const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};Object.defineProperty(w.document,'hidden',{value:false,configurable:true});const jobs=new Map();let i=0;w.setInterval=fn=>{jobs.set(++i,fn);return i;};w.clearInterval=id=>jobs.delete(id);w.nodes=[{_id:'a',name:'A',conn:1,meshid:'g'},{_id:'b',name:'B',conn:1,meshid:'g'}];w.meshes={g:{name:'OPD'}};const sent=[];w.meshserver={send:m=>sent.push(m)};w.ScpDashboard={disksOf:()=>[{letter:'C',percent:40,free:'20'}]};w.eval(fs.readFileSync(path.join(__dirname,'../../public/scripts/scp-monitor.js'),'utf8'));return {w,sent,jobs};}
test('monitor graphs real resource replies, rejects stale device responses, and stops on close',t=>{const s=setup(t);s.w.ScpMonitor.open(s.w.nodes[0]);const req=s.sent.find(m=>m.type==='cpuinfo');s.w.ScpMonitor.receive({type:'cpuinfo',nodeid:'a',tag:req.tag,cpu:{total:34},memory:{percentConsumed:62}});assert.match(s.w.document.body.textContent,/34.0%/);assert.match(s.w.document.body.textContent,/62.0%/);const pick=s.w.document.getElementById('scpMonitorDevice');pick.value='b';pick.dispatchEvent(new s.w.Event('change'));s.w.ScpMonitor.receive({type:'cpuinfo',nodeid:'a',tag:req.tag,cpu:{total:99},memory:{percentConsumed:99}});assert.doesNotMatch(s.w.document.body.textContent,/99.0%/);s.w.document.getElementById('scpMonitor').close();assert.equal(s.jobs.size,0);});
test('process names are escaped; hidden monitor sends no requests and offers no kill action',t=>{const s=setup(t);s.w.ScpMonitor.open(s.w.nodes[0]);const req=s.sent.find(m=>m.type==='ps');s.w.ScpMonitor.receive({type:'ps',nodeid:'a',tag:req.tag,value:JSON.stringify({123:{cmd:'<img src=x>',user:'staff'}})});assert.equal(s.w.document.querySelector('img'),null);assert.match(s.w.document.body.textContent,/<img/);Object.defineProperty(s.w.document,'hidden',{value:true});const count=s.sent.length;[...s.jobs.values()][0]();assert.equal(s.sent.length,count);assert.ok(s.sent.every(m=>m.type!=='pskill'));});
test('overview uses actual online counts and department totals',t=>{const s=setup(t);s.w.nodes[1].conn=0;const panel=s.w.ScpMonitor.overview();assert.match(panel.textContent,/ออนไลน์ · 1\/2/);assert.match(panel.textContent,/OPD · 1\/2/);});

// ---- Appearance ----
// The monitor is the one screen that used to hard-code every colour and carry a single .night
// rule that changed the background and the text only, so in the dark theme its borders, table
// rules and chart gridlines stayed light. These guard the fix rather than the look.
const styles = require('fs').readFileSync(require('path').join(__dirname, '../../public/styles/scp-monitor.css'), 'utf8');
const script = require('fs').readFileSync(require('path').join(__dirname, '../../public/scripts/scp-monitor.js'), 'utf8');
// Drawn on purpose and allowed to be literal: they carry meaning, not branding.
const MEANING = ['#0b8f6f', '#168065', '#6b9f72', '#b38319', '#bc574d', '#9a8189', '#568acc', '#b02a72'];

test('the dark theme comes from the tokens, not from a single override', () => {
    assert.ok(!/\.night\s+[#.]scp/i.test(styles),
        'a .night rule here only ever repainted part of the panel; the tokens should do it');
    // A colour written inside var(--scp-x, #fallback) is the fallback and is meant to be
    // there, so those are removed before looking for colours standing on their own.
    const standalone = styles.replace(/var\([^)]*\)/g, 'TOKEN');
    const literals = [...standalone.matchAll(/[:,(\s](#[0-9a-fA-F]{6,8})\b/g)].map(m => m[1].toLowerCase());
    const unexplained = literals.filter(c => !MEANING.includes(c.slice(0, 7)) && !c.startsWith('#2a1520'));
    assert.deepEqual([...new Set(unexplained)], [],
        'these should be var(--scp-..) so the dark theme reaches them: ' + unexplained.join(', '));
});

test('the stylesheet is actually built on tokens, not on the fallbacks', () => {
    const tokens = (styles.match(/var\(--scp-[\w-]+/g) || []).length;
    assert.ok(tokens > 40, 'expected the stylesheet to be built on tokens, found ' + tokens + ' uses');
});

test('the chart furniture is styled, not painted into the SVG', () => {
    // A gridline with a fixed stroke is invisible on one theme or the other.
    for (const name of ['scp-monitor-grid', 'scp-monitor-axis', 'scp-monitor-live']) {
        assert.ok(script.includes(name), name + ' should be set as a class by the script');
        assert.ok(styles.includes('.' + name), name + ' needs a rule, or it renders unstyled');
    }
    assert.ok(!/setAttribute\('stroke','#/.test(script), 'no fixed strokes left in the chart');
});

test('the charts share the row as a grid', () => {
    // They were two inline-blocks at 49%, which left a ragged line as soon as a third was added.
    assert.ok(/\.scp-monitor-charts \{[^}]*display: grid/.test(styles));
    assert.ok(!/\.scp-monitor-chart \{[^}]*width: *49%/.test(styles), 'the old percentage layout is back');
});

test('the reading is bigger than its own label', () => {
    // The number is what someone opened this screen to see.
    const reading = /\.scp-monitor-reading \{[^}]*font-size: (\d+)px/.exec(styles);
    const label = /\.scp-monitor-chart-head span \{[^}]*font-size: (\d+)px/.exec(styles);
    assert.ok(reading && label, 'both need an explicit size for this to stay true');
    assert.ok(Number(reading[1]) >= Number(label[1]) * 2, 'the reading should dominate the card');
});
