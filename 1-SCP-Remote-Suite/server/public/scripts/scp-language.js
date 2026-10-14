/* SCP-Remote modification: a two-language switch that preserves the current URL. */
(function () {
    'use strict';
    function init() {
        var current = document.documentElement.lang === 'en' ? 'en' : 'th';
        var nav = document.createElement('nav');
        nav.className = 'scp-language';
        nav.setAttribute('aria-label', current === 'th' ? 'เลือกภาษา' : 'Language');
        var brand = document.createElement('span');
        brand.className = 'scp-brand';
        brand.textContent = 'SCP-Remote';
        nav.appendChild(brand);
        [['th', 'ไทย'], ['en', 'English']].forEach(function (item) {
            var link = document.createElement('a');
            var url = new URL(window.location.href);
            url.searchParams.set('lang', item[0]);
            link.href = url.toString();
            link.lang = item[0];
            link.hreflang = item[0];
            link.textContent = item[1];
            link.setAttribute('aria-current', String(current === item[0]));
            nav.appendChild(link);
        });
        // Login templates only. The main UI uses its native account language setting.
        var top = document.getElementById('topbar');
        if (top) {
            brand.style.display = 'none';
            nav.classList.add('scp-language-inbar');
            top.appendChild(nav);
        } else {
            // Mobile has an absolutely positioned content panel: stay in its
            // content flow instead of pushing the header below a new body row.
            brand.style.display = 'none';
            var panel = document.getElementById('column_l') ||
                (document.getElementById('loginpanel') && document.getElementById('loginpanel').parentElement) || document.body;
            panel.insertBefore(nav, panel.firstChild);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
