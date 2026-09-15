// SCP-Remote modification: restrict the hospital UI to Thai and English.
'use strict';

exports.languages = ['th', 'en'];
exports.select = function (requested) {
    for (const value of requested) {
        const code = String(value).toLowerCase().split('-')[0];
        if (exports.languages.includes(code)) return code;
    }
    return 'th';
};
