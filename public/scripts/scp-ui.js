/* SCP-Remote interface enhancements. Local assets, native application actions. */
(function () {
    'use strict';
    var th = document.documentElement.lang === 'th';
    function text(en, thai) { return th ? thai : en; }
    function el(tag, className, value) {
        var node = document.createElement(tag); node.className = className;
        if (value) node.textContent = value;
        return node;
    }
    function init() {
        var login = document.getElementById('loginpanel');
        document.body.classList.add('scp-ui', login ? 'scp-signin' : 'scp-workspace');
        if (login) {
            var welcome = document.getElementById('welcomeimage');
            if (welcome) {
                var intro = el('div', 'scp-intro');
                intro.appendChild(el('span', 'scp-eyebrow', 'SCP-REMOTE / HOSPITAL IT'));
                intro.appendChild(el('h2', '', text('IT support. Closer to care.', 'ดูแลทุกเครื่อง\nเพื่อทุกการดูแล')));
                intro.appendChild(el('p', '', text('One workspace for hospital computers, remote support and your files.', 'พื้นที่ทำงานเดียวสำหรับดูแลคอมพิวเตอร์\nช่วยเหลือระยะไกล และจัดการไฟล์ของโรงพยาบาล')));
                var tags = el('div', 'scp-intro-tags');
                [text('Remote support', 'ช่วยเหลือระยะไกล'), text('File management', 'จัดการไฟล์'), text('Hospital network', 'เครือข่ายโรงพยาบาล')].forEach(function (value) { tags.appendChild(el('span', '', value)); });
                intro.appendChild(tags); welcome.appendChild(intro);
                var column = document.getElementById('column_l');
                if (column) column.classList.add('scp-signin-column');
            }
            // Give existing controls accessible labels without replacing authentication forms.
            [['username', text('Username', 'ชื่อผู้ใช้')], ['password', text('Password', 'รหัสผ่าน')]].forEach(function (entry) {
                var input = document.getElementById(entry[0]);
                if (input) {
                    input.setAttribute('aria-label', entry[1]); input.placeholder = entry[1];
                    var table = input.closest('table'); if (table) table.classList.add('scp-login-fields');
                }
            });
            var userpass = document.getElementById('loginuserpassdiv');
            if (userpass) {
                var heading = el('div', 'scp-signin-heading');
                heading.appendChild(el('h2', '', text('Welcome back', 'ยินดีต้อนรับ')));
                heading.appendChild(el('p', '', text('Sign in to your hospital workspace', 'เข้าสู่พื้นที่ทำงานของโรงพยาบาล')));
                userpass.insertBefore(heading, userpass.firstChild);
            }
            return;
        }
        var paths = {
            LeftMenuMyDevices: 'M3 4h18v12H3z M8 21h8 M12 16v5',
            LeftMenuMyAccount: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 6 0 0 1 16 0v3',
            LeftMenuMyEvents: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',
            LeftMenuMyFiles: 'M3 7V4h7l2 3h9v13H3z',
            LeftMenuMyUsers: 'M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M14 4a3 3 0 1 1 0 6 M2 21v-4a5 5 0 0 1 10 0v4 M16 13a5 5 0 0 1 5 5v3',
            LeftMenuMyServer: 'M3 3h18v7H3z M3 14h18v7H3z M6 6h1 M6 17h1'
        };
        Object.keys(paths).forEach(function (id) {
            var item = document.getElementById(id); if (!item || !item.classList.contains('lbbutton')) return;
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('scp-nav-icon');
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[id]); svg.appendChild(path);
            item.appendChild(svg); item.appendChild(el('span', 'scp-nav-label', item.title));
            item.setAttribute('role', 'button'); item.setAttribute('aria-label', item.title);
        });
        var devices = document.getElementById('p1');
        if (devices) {
            var heading = el('section', 'scp-workspace-heading');
            heading.appendChild(el('span', 'scp-eyebrow', 'SCP-REMOTE / WORKSPACE'));
            heading.appendChild(el('h2', '', text('Your hospital workspace', 'พื้นที่ทำงานของคุณ')));
            heading.appendChild(el('p', '', text('Find a computer, check its status, and start helping.', 'ค้นหาคอมพิวเตอร์ ตรวจสอบสถานะ แล้วเริ่มช่วยเหลือได้เลย')));
            devices.insertBefore(heading, devices.firstChild);
        }
        var search = document.getElementById('SearchInput');
        if (search) {
            var label = text('Search devices by name, IP or group', 'ค้นหาเครื่องด้วยชื่อ, IP หรือกลุ่ม');
            search.placeholder = label; search.setAttribute('aria-label', label);
        }
        var alternate = document.getElementById('textnewui');
        if (alternate) alternate.textContent = text('Switch interface style', 'เปลี่ยนรูปแบบหน้าจอ');
        // Upstream uses fixed toolbar offsets. Measure the visible shell so the
        // new heading and wrapped buttons cannot hide the bottom of a file/device list.
        if (document.getElementById('column_l')) {
            var pending = false;
            function resizeLists() {
                if (pending) return; pending = true;
                requestAnimationFrame(function () {
                    pending = false;
                    var footer = document.getElementById('footer');
                    var bottom = footer && footer.getClientRects().length ? Math.min(innerHeight, footer.getBoundingClientRect().top) : innerHeight;
                    ['xdevices', 'p5filetable'].forEach(function (id) {
                        var node = document.getElementById(id);
                        if (!node || !node.getClientRects().length) return;
                        var height = Math.max(80, bottom - node.getBoundingClientRect().top - 12) + 'px';
                        if (node.style.getPropertyValue('max-height') !== height) node.style.setProperty('max-height', height, 'important');
                    });
                });
            }
            if (window.ResizeObserver) {
                var observer = new ResizeObserver(resizeLists);
                ['column_l', 'p5toolbar', 'devListToolbarSpan'].forEach(function (id) { var node = document.getElementById(id); if (node) observer.observe(node); });
            }
            var panels = new MutationObserver(resizeLists);
            ['p1', 'p5'].forEach(function (id) { var node = document.getElementById(id); if (node) panels.observe(node, { attributes: true, attributeFilter: ['style'] }); });
            window.addEventListener('resize', resizeLists); window.addEventListener('load', resizeLists); resizeLists();
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
