/* SCP-Remote: sharper picture for copies of the SCP-Remote program that are already installed.
 *
 * The program cannot update itself. Builds made before 12 Nov 2026 replace SendCompressionLevel
 * with a function that always asks for WEBP at quality 100 (4, 100, 1024, 50), whatever was
 * chosen - and WEBP, even at 100, is what left remote text soft. The program shows this page
 * from the server, so the fix can be made here: inside the program, that one pinned request is
 * sent as lossless PNG instead.
 *
 * A build with a working quality chooser sets window.scpAppQualityChooser after the page loads
 * and is left alone, as is an ordinary browser. Nothing else about the request is changed.
 */
(function (root) {
    'use strict';
    if (root.ScpAppCompat) return;
    root.ScpAppCompat = true;
    var original = root.CreateAgentRemoteDesktop;
    if (typeof original !== 'function') return;
    // remote-preload.js of the program exposes these two; a browser has neither
    function inProgram() { return !!(root.scpClipboard || root.scpSessionAPI); }
    root.CreateAgentRemoteDesktop = function () {
        var m = original.apply(this, arguments);
        var send = m && m.SendCompressionLevel;
        if (typeof send !== 'function') return m;
        m.SendCompressionLevel = function (type, level, scaling, frametimer) {
            if (inProgram() && !root.scpAppQualityChooser && type === 4 && level === 100 && scaling === 1024) { type = 2; }
            return send.call(m, type, level, scaling, frametimer);
        };
        return m;
    };
})(window);
