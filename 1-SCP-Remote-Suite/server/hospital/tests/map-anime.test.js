'use strict';
// The cartoon style of the hospital map lives in its own script, which only adds drawing to
// the map engine. It must load after the engine, and it must never move anything for someone
// who asked their system for less motion.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the cartoon style loads after the map engine', () => {
    const view = read('views/default.handlebars');
    const engine = view.indexOf('scripts/scp-map.js');
    const anime = view.indexOf('scripts/scp-map-anime.js');
    assert.ok(engine > 0 && anime > engine, 'scp-map-anime.js must come after scp-map.js');
});

test('everything the cartoon style animates is switched off by reduced motion', () => {
    const engine = read('public/scripts/scp-map.js');
    // the per-frame ambient step only runs through _ambientOn, which checks REDUCED_MOTION
    assert.match(engine, /_ambientOn = function \(\) \{\s*return this\.anime && !REDUCED_MOTION/);
    assert.match(engine, /if \(ambient\) this\._stepAmbient\(dt\)/);
    // smooth zoom, flick-glide and the floor fade-in fall back to instant
    assert.match(engine, /if \(REDUCED_MOTION\) \{ this\._zoomAt\(factor, cx, cy\)/);
    assert.match(engine, /if \(changed && !REDUCED_MOTION\) this\._enterAt/);
});

test('the cartoon style draws only through hooks the engine guards', () => {
    const anime = read('public/scripts/scp-map-anime.js');
    for (const hook of ['_drawAmbientUnder', '_drawAmbientOver', '_drawFaces', '_stepAmbient', '_buildDecor',
        '_placeDecor', '_drawTree', '_drawChibi', '_toon', '_pastel', '_slabStyle', '_drawGround', '_drawDayWindows',
        '_drawSunTint', '_drawRoofTrim']) {
        assert.ok(anime.includes('P.' + hook + ' = function'), hook + ' is defined');
    }
    // and the map still works without it: setAnime refuses when the style script is missing
    assert.match(read('public/scripts/scp-map.js'), /this\.anime = !!on && typeof this\._drawAmbientUnder === 'function'/);
});
