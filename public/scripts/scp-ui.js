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
    // The 2FA code entry. MeshCentral asks for the code in one wide text box; on a phone that
    // is an awkward way to type six digits, and it is the last thing standing between someone
    // with a stolen password and every computer in the hospital, so it is worth making plain.
    //
    // These six boxes drive MeshCentral's own input rather than replacing it. The original keeps
    // its name=token, keeps its value, and is told to run the page's own checkToken after every
    // change, so nothing about how this form validates or submits is different. That matters
    // more than the look: a mistake here locks the hospital out of its own server.
    //
    // Backup codes are eight digits, not six, so the boxes are deliberately not the only way in.
    // The link underneath hands the original input straight back, pasting eight digits switches
    // to it on its own, and if any of this throws, the catch leaves the original exactly as
    // MeshCentral shipped it.
    function segmentToken(inputId, panelId) {
        try {
            var input = document.getElementById(inputId);
            var panel = document.getElementById(panelId);
            if (!input || !panel || input.getAttribute('data-scp-otp')) return;
            input.setAttribute('data-scp-otp', '1');

            var boxes = [], wrap = el('div', 'scp-otp');
            // Announced as one field, because six unlabelled boxes are unreadable aloud.
            wrap.setAttribute('role', 'group');
            wrap.setAttribute('aria-label', text('Six digit verification code', 'รหัสยืนยัน 6 หลัก'));

            function publish() {
                var code = '';
                for (var i = 0; i < boxes.length; i++) { code += boxes[i].value; }
                input.value = code;
                // checkToken is bound with an inline onkeyup/onchange attribute, so a dispatched
                // event reaches it without this needing to know the function's name.
                input.dispatchEvent(new Event('keyup', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            var link = el('button', 'scp-otp-alt', text('Use a backup code instead', 'ใช้รหัสสำรอง 8 หลักแทน'));
            link.type = 'button';

            // Falls back to the box MeshCentral shipped: for a backup code, and for anything
            // the boxes turn out not to handle.
            function plain(seed) {
                wrap.hidden = true;
                link.hidden = true;
                input.classList.remove('scp-otp-source');
                if (seed) { input.value = seed; }
                input.focus();
                input.dispatchEvent(new Event('keyup', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Autofill and paste both arrive as more than one character at once.
            function spread(from, value) {
                var digits = String(value).replace(/\D/g, '');
                if (!digits) return;
                if (digits.length > boxes.length) { plain(digits); return; } // an 8 digit backup code
                for (var i = from, d = 0; i < boxes.length && d < digits.length; i++, d++) { boxes[i].value = digits.charAt(d); }
                var next = Math.min(from + digits.length, boxes.length - 1);
                boxes[next].focus(); boxes[next].select();
                publish();
            }

            for (var i = 0; i < 6; i++) {
                var box = document.createElement('input');
                box.type = 'text'; box.inputMode = 'numeric'; box.maxLength = 1;
                box.className = 'scp-otp-box'; box.setAttribute('aria-label', String(i + 1));
                // Only the first is offered the code by the phone, or every box fills with it.
                box.setAttribute('autocomplete', i === 0 ? 'one-time-code' : 'off');
                boxes.push(box); wrap.appendChild(box);
            }

            boxes.forEach(function (box, index) {
                box.addEventListener('input', function () {
                    if (box.value.length > 1) { spread(index, box.value); return; }
                    box.value = box.value.replace(/\D/g, '');
                    if (box.value && index < boxes.length - 1) { boxes[index + 1].focus(); }
                    publish();
                });
                box.addEventListener('keydown', function (e) {
                    // Backspace in an empty box should go back, or a mistyped digit is
                    // unreachable without the mouse.
                    if (e.key === 'Backspace' && !box.value && index > 0) { boxes[index - 1].focus(); e.preventDefault(); }
                    else if (e.key === 'ArrowLeft' && index > 0) { boxes[index - 1].focus(); e.preventDefault(); }
                    else if (e.key === 'ArrowRight' && index < boxes.length - 1) { boxes[index + 1].focus(); e.preventDefault(); }
                    else if (e.key === 'Enter') { publish(); }
                });
                box.addEventListener('paste', function (e) {
                    e.preventDefault();
                    spread(index, (e.clipboardData || window.clipboardData).getData('text'));
                });
                box.addEventListener('focus', function () { box.select(); });
            });

            link.addEventListener('click', function () { plain(''); });

            var heading = el('div', 'scp-signin-heading scp-otp-heading');
            heading.appendChild(el('h2', '', text('Verify your login', 'ยืนยันการเข้าสู่ระบบ')));
            heading.appendChild(el('p', '', text('Enter the six digit code from your authenticator app.', 'กรอกรหัส 6 หลักจากแอป Authenticator ของคุณ')));

            var row = input.parentNode;
            row.insertBefore(wrap, input);
            row.insertBefore(link, input);
            input.classList.add('scp-otp-source');
            var form = panel.querySelector('form');
            if (form) { form.insertBefore(heading, form.firstChild); }

            // The panel starts hidden and MeshCentral shows it when a code is actually wanted.
            // Putting the cursor in the first box at that moment saves a tap on a phone.
            if (window.MutationObserver) {
                new MutationObserver(function () {
                    if (panel.style.display !== 'none' && !wrap.hidden && !boxes[0].value) { boxes[0].focus(); }
                }).observe(panel, { attributes: true, attributeFilter: ['style'] });
            }
        } catch (ex) {
            // Leave MeshCentral's own field exactly as it was. Signing in matters more than
            // this looking nice, so take the half-built boxes back out rather than showing
            // both and leaving someone guessing which one the server reads.
            var fallback = document.getElementById(inputId);
            if (fallback) {
                fallback.classList.remove('scp-otp-source');
                var parent = fallback.parentNode;
                if (parent) {
                    var stale = parent.querySelectorAll('.scp-otp, .scp-otp-alt');
                    for (var s = 0; s < stale.length; s++) { stale[s].parentNode.removeChild(stale[s]); }
                }
            }
        }
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
            segmentToken('tokenInput', 'tokenpanel');
            segmentToken('resetTokenInput', 'resettokenpanel');
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

        // The way back to the device list. Arriving on the full site pins the session to it, so
        // without this the gear on /m is a one-way door: everything still works, but the page
        // people actually use is only reachable by typing its URL.
        //
        // It goes in the masthead rather than the left bar. The left bar is the obvious home
        // for navigation, but it is not always on the page - hide=16 takes it away, and a
        // narrow window does too - and a way out that is sometimes missing is not a way out.
        // The masthead's own title and subtitle float left, so this lands beside them.
        if (!document.getElementById('scp-back-to-devices')) {
            var back = document.createElement('a');
            back.id = 'scp-back-to-devices';
            back.href = 'm';
            back.title = text('Back to the remote device list', 'กลับไปหน้าเลือกเครื่อง');
            var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('aria-hidden', 'true');
            var line = document.createElementNS(arrow.namespaceURI, 'path');
            line.setAttribute('d', 'M19 12H5 M12 19l-7-7 7-7');
            arrow.appendChild(line); back.appendChild(arrow);
            back.appendChild(el('span', '', text('Remote', 'หน้ารีโมต')));
            var home = document.getElementById('masthead') || document.getElementById('page_leftbar');
            if (home) { home.appendChild(back); }
        }
        // On a phone the left menu folds away behind a ☰ button in the masthead, so the page
        // gets the whole width. It opens as a drawer over the page; choosing an item, tapping
        // outside it or the button again folds it back. Only shown on narrow screens (CSS).
        var leftbar = document.getElementById('page_leftbar'), mast = document.getElementById('masthead');
        if (leftbar && mast && !document.getElementById('scp-nav-toggle')) {
            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.id = 'scp-nav-toggle';
            toggle.setAttribute('aria-controls', 'page_leftbar');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', text('Menu', 'เมนู'));
            toggle.title = text('Menu', 'เมนู');
            toggle.innerHTML = '<span></span><span></span><span></span>';
            var scrim = document.createElement('div');
            scrim.id = 'scp-nav-scrim';
            var setOpen = function (open) {
                document.body.classList.toggle('scp-nav-open', open);
                toggle.setAttribute('aria-expanded', String(open));
            };
            toggle.onclick = function () { setOpen(!document.body.classList.contains('scp-nav-open')); };
            scrim.onclick = function () { setOpen(false); };
            leftbar.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('.lbbutton')) setOpen(false);
            });
            document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
            mast.insertBefore(toggle, mast.firstChild);
            document.body.appendChild(scrim);
        }
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
