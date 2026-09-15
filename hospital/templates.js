// SCP-Remote modification: the templates that npm run build:hospital translates,
// each paired with the Thai file it produces. Shared by the build, the launcher
// and the tests so the three never disagree about what must be generated.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
exports.pairs = function () {
    return ['views', 'emails'].flatMap(dir => fs.readdirSync(path.join(root, dir))
        .filter(file => /\.(handlebars|html|txt)$/.test(file))
        .map(file => ({
            source: path.join(root, dir, file),
            output: path.join(root, dir, 'translations', path.basename(file, path.extname(file)) + '_th' + path.extname(file))
        })));
};
// Templates edited after their Thai file was generated. Editing a template without
// rebuilding leaves the Thai page on the previous version, so report those instead
// of serving a stale page. Minified pages come from the same build step.
exports.stale = function () {
    return exports.pairs()
        .filter(pair => !fs.existsSync(pair.output) || fs.statSync(pair.source).mtimeMs > fs.statSync(pair.output).mtimeMs)
        .map(pair => path.relative(root, pair.source).split(path.sep).join('/'));
};
