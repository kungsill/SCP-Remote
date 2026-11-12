/* SCP-Remote: draw the remote picture on whole pixels.
 *
 * The page's own deskAdjust() stretches the remote screen to fill the window, and its 1:1 mode
 * ignores Windows display scaling (125%, 150%). Either way one remote pixel is spread over a
 * fraction of a real one and text turns soft, however good the image the agent sent. This
 * runs after deskAdjust() and sizes the picture so that:
 *   - it is shown at a whole number of real pixels per remote pixel whenever that fits;
 *   - it is only shrunk when the remote screen is larger than the window.
 * Only the size this browser draws the picture at changes. Nothing is sent to the remote
 * computer, and the mouse is still placed from the picture's displayed size.
 */
(function (root) {
    'use strict';
    function ratio(dpr) { return (typeof dpr === 'number' && isFinite(dpr) && dpr > 0) ? dpr : 1; }
    function ok(n) { return typeof n === 'number' && isFinite(n) && n > 0; }

    // Size in CSS pixels for a deskW x deskH remote screen inside a parentW x parentH area.
    // scale is real pixels per remote pixel: a whole number when the picture fits, below 1 when
    // it had to be shrunk.
    function fitSize(deskW, deskH, parentW, parentH, dpr) {
        if (!ok(deskW) || !ok(deskH) || !ok(parentW) || !ok(parentH)) return null;
        dpr = ratio(dpr);
        var realW = parentW * dpr, realH = parentH * dpr;
        var room = Math.min(realW / deskW, realH / deskH);
        var scale = room >= 1 ? Math.floor(room + 1e-9) : room;
        var w = Math.round(deskW * scale), h = Math.round(deskH * scale);
        if (scale < 1) {
            // shrunk: stay on whole real pixels without spilling out of the area
            w = Math.max(1, Math.min(w, Math.floor(realW + 1e-9)));
            h = Math.max(1, Math.min(h, Math.floor(realH + 1e-9)));
        }
        return { width: w / dpr, height: h / dpr, scale: scale };
    }

    // The page's 1:1 mode: one remote pixel on one real pixel, scrolling if it does not fit.
    function actualSize(deskW, deskH, dpr) {
        if (!ok(deskW) || !ok(deskH)) return null;
        dpr = ratio(dpr);
        return { width: deskW / dpr, height: deskH / dpr, scale: 1 };
    }

    if (typeof module !== 'undefined' && module.exports) { module.exports = { fitSize: fitSize, actualSize: actualSize }; return; }
    if (root.ScpRemoteFit) return;

    function apply() {
        var parent = document.getElementById('DeskParent'), desk = document.getElementById('Desk');
        if (!parent || !desk || desk.offsetParent === null) return;
        var mode = parseInt(root.deskAspectRatio, 10) || 0;
        if (mode===2) { desk.style.marginLeft = ''; desk.style.setProperty('image-rendering', 'auto', 'important'); return; } // stretch to fill: the page's own choice
        if (parent.classList.contains('scp-zoomed')) return; // a pinch zoom is in charge of the size
        var dpr = root.devicePixelRatio;
        var size = mode === 1 ? actualSize(desk.width, desk.height, dpr) : fitSize(desk.width, desk.height, parent.clientWidth, parent.clientHeight, dpr);
        if (!size) return;
        desk.style.width = size.width + 'px';
        desk.style.height = size.height + 'px';
        // whole multiples are drawn pixel for pixel; a shrunk picture is smoothed
        desk.style.setProperty('image-rendering', size.scale > 1 ? 'pixelated' : 'auto', 'important');
        if (mode === 1) { desk.style.marginLeft = ''; return; }
        // centre it, wherever this page's layout happened to put it
        desk.style.marginLeft = '0px'; desk.style.marginTop = '0px';
        var p = parent.getBoundingClientRect(), d = desk.getBoundingClientRect();
        var dx = Math.round(p.left + parent.clientLeft + (parent.clientWidth - size.width) / 2 - d.left);
        var dy = Math.round(p.top + parent.clientTop + (parent.clientHeight - size.height) / 2 - d.top);
        if (dx) desk.style.marginLeft = dx + 'px';
        if (dy) desk.style.marginTop = dy + 'px';
    }

    function install() {
        var original = root.deskAdjust;
        if (typeof original !== 'function' || original.scpFit) return false;
        root.deskAdjust = function () { var out = original.apply(this, arguments); try { apply(); } catch (e) { /* the page's own size stays */ } return out; };
        root.deskAdjust.scpFit = true;
        return true;
    }
    // The page keeps its first deskAdjust in window.onresize, so listen for ourselves as well.
    function again() { if (typeof root.deskAdjust === 'function' && root.deskAdjust.scpFit) { try { apply(); } catch (e) { } } }
    root.addEventListener('resize', again);
    // Moving the window to a monitor with another scaling changes the pixel ratio without a resize.
    (function watchRatio() {
        if (!root.matchMedia) return;
        try { root.matchMedia('(resolution: ' + (root.devicePixelRatio || 1) + 'dppx)').addEventListener('change', function () { again(); watchRatio(); }, { once: true }); } catch (e) { }
    })();
    (function wait(n) { if (!install() && !(root.deskAdjust && root.deskAdjust.scpFit) && n < 120) setTimeout(function () { wait(n + 1); }, 250); else again(); })(0);
    root.ScpRemoteFit = { fitSize: fitSize, actualSize: actualSize, apply: apply };
})(typeof window === 'undefined' ? globalThis : window);
