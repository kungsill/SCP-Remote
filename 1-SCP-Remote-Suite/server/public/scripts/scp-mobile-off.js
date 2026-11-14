/* SCP-Remote: the /m page ("choose a computer to remote") is retired.
 *
 * The Remote page on the full site does the same job, with fix-printing on each card, and is
 * the one being developed. This runs in the head of the old page and sends whoever arrives -
 * an old bookmark, a home-screen icon, the server's own redirect after signing in - straight
 * on to it, before any of the old page is drawn.
 *
 * m=0 is what tells the server (hospital/mobile.js) to serve the full site and remember that
 * choice, so it does not send the visitor back here. scppage=remote opens the Remote page
 * rather than the dashboard (scp-dashboard.js).
 *
 * To bring /m back, remove this script's tag from hospital/mobile.html.
 */
(function (root) {
    'use strict';
    function target(currentUrl) {
        var url = new URL(currentUrl);
        url.pathname = url.pathname.replace(/m\/?$/, '');
        url.search = '?m=0&scppage=remote';
        url.hash = '';
        return url.href;
    }
    if (typeof module !== 'undefined' && module.exports) { module.exports = { target: target }; return; }
    try { document.documentElement.style.visibility = 'hidden'; } catch (e) { }
    root.location.replace(target(root.location.href));
}(typeof window !== 'undefined' ? window : globalThis));
