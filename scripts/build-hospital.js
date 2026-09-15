// SCP-Remote build: validate the maintained dictionary, then use MeshCentral's
// existing HTML/JavaScript translator. No network calls or runtime data writes.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const translations = require('../hospital/th.json');
const retained = new Set(require('../hospital/retained-en.json'));
const source = require('../translate/translate.json').strings;
const templates = require('../hospital/templates');
const tokens = text => (text.match(/\{\d+\}|\[\[\[[A-Z0-9_]+\]\]\]|\[\[\d+\]\]/g) || []).sort();
for (const item of source) {
    if (!(item.en in translations) && !retained.has(item.en)) throw new Error('Unreviewed source string: ' + item.en);
}
for (const [en, th] of Object.entries(translations)) {
    if (!th.trim()) throw new Error('Empty Thai translation: ' + en);
    if (JSON.stringify(tokens(en)) !== JSON.stringify(tokens(th))) throw new Error('Placeholder mismatch: ' + en);
}
const buildDir = path.join(root, '.local', 'build');
fs.mkdirSync(buildDir, { recursive: true });
const dictionary = path.join(buildDir, 'scp-translations.json');
fs.writeFileSync(dictionary, JSON.stringify({ strings: Object.entries(translations).map(([en, th]) => ({ en, th })) }));
const pairs = templates.pairs();
const result = spawnSync(process.execPath, [path.join(__dirname, 'translate-hospital.js'), dictionary, ...pairs.map(pair => pair.source)], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
for (const pair of pairs) {
    if (!fs.existsSync(pair.output)) throw new Error('Translation output missing: ' + pair.output);
}
const stale = templates.stale();
if (stale.length > 0) throw new Error('Templates left without an up-to-date Thai page: ' + stale.join(', '));
console.log('SCP-Remote build complete: Thai + English; ' + Object.keys(translations).length + ' translated strings.');
