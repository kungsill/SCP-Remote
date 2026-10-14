'use strict';
require('../translate/translate.js').startEx([
    process.execPath, 'translate.js', 'translate', 'th',
    ...process.argv.slice(2), '--subdir:translations'
]).catch(error => { console.error(error); process.exitCode = 1; });
