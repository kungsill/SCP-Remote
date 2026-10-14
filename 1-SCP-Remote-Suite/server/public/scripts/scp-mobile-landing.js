/* Fallback for a directly rendered legacy mobile page after form login.
   It runs in the head so the old fleet/dialog never flashes on the screen. */
(function (root) {
    'use strict';
    function landingUrl(currentUrl, domainPath) {
        var url = new URL(currentUrl);
        var target = new URL(domainPath || '/', url.origin);
        if (target.origin !== url.origin) return null;
        var q = url.searchParams;
        var aimed = ['node', 'gotonode', 'gotodevicename', 'gotodevicername', 'gotodeviceip', 'gotomesh', 'gotouser', 'gotougrp', 'key', 'scpnode'].some(function (key) { return q.has(key); });
        if (q.get('m') === '0' || aimed) {
            q.set('mobile', '0');
            q.delete('user'); q.delete('pass');
            return url.href;
        }
        target.pathname = target.pathname.replace(/\/?$/, '/') + 'm';
        target.search = ''; target.hash = '';
        return target.href;
    }
    if (typeof module !== 'undefined' && module.exports) { module.exports = { landingUrl: landingUrl }; return; }
    var script = document.currentScript;
    var domainPath = script && script.getAttribute('data-domainurl');
    // The hospital /m routes are installed only for MeshCentral's default domain.
    if (domainPath && domainPath !== '/') return;
    var target = landingUrl(root.location.href, domainPath);
    if (target) {
        root.ScpMobileLandingRedirect = true;
        var style = document.createElement('style');
        style.textContent = 'body{display:none!important}';
        document.head.appendChild(style);
        root.location.replace(target);
    }
}(typeof window !== 'undefined' ? window : globalThis));
