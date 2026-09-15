/* SCP-Remote: explicit two-way text and file transfer using existing session permissions. */
(function () {
    'use strict';
    var th = document.documentElement.lang === 'th', pending = null, sequence = 0, dialogNode = null;
    function t(en, thai) { return th ? thai : en; }
    function node(id) { return document.getElementById(id); }
    function status(message, error) { var s = node('scpTransferStatus'); if (s) { s.textContent = message; s.dataset.error = error ? 'true' : 'false'; } }
    function connected() {
        return window.currentNode && window.desktop && window.desktop.State === 3 && window.desktop.viewonly !== true && (!window.desktop.contype || window.desktop.contype === 1);
    }
    function valid() { return connected() && window.currentNode._id === dialogNode && window.xxdialogTag === 'scp-transfer' && node('scpTransferText'); }
    function permitted(type) { return ((window.features2 || 0) & (type === 'getclip' ? 0x0800 : 0x1000)) === 0; }
    function busy(value) {
        ['scpTransferSend', 'scpTransferGet', 'scpTransferRead', 'scpTransferCopy'].forEach(function (id) {
            var item = node(id); if (item) item.disabled = value || (id === 'scpTransferSend' && !permitted('setclip')) || (id === 'scpTransferGet' && !permitted('getclip'));
        });
    }
    function finish(message, error) {
        if (pending) clearTimeout(pending.timer); pending = null; busy(false); status(message, error);
    }
    function request(type, value, verify) {
        if (!valid()) { finish(t('The remote session changed or disconnected. Open this panel again.', 'การเชื่อมต่อเปลี่ยนหรือหลุด กรุณาเปิดหน้าต่างนี้ใหม่'), true); return; }
        if (!permitted(type)) { status(t('This direction is disabled by the administrator.', 'ผู้ดูแลปิดการรับ–ส่งในทิศทางนี้ไว้'), true); return; }
        if (pending) return;
        var tag = 'scp-transfer-' + Date.now() + '-' + (++sequence);
        pending = { type: type, tag: tag, nodeid: dialogNode, expected: verify, value: value };
        pending.timer = setTimeout(function () { finish(t('No confirmation from the remote computer. Check the connection before retrying.', 'ยังไม่ได้รับการยืนยันจากเครื่องรีโมต ตรวจการเชื่อมต่อก่อนลองใหม่'), true); }, 15000);
        var command = { action: 'msg', type: type, nodeid: dialogNode, tag: tag };
        if (type === 'setclip') command.data = value;
        busy(true); status(t('Waiting for the remote computer…', 'กำลังรอเครื่องรีโมต…'));
        try { window.meshserver.send(command); } catch (error) { finish(t('Connection failed.', 'ส่งคำขอไม่ได้ การเชื่อมต่อขัดข้อง'), true); }
    }
    function handle(message) {
        if (typeof message.tag !== 'string' || message.tag.indexOf('scp-transfer-') !== 0 || ['getclip', 'setclip'].indexOf(message.type) < 0) return false;
        if (!pending || message.tag !== pending.tag || message.nodeid !== pending.nodeid) return true;
        if (!valid()) { finish(t('Session changed; response ignored.', 'เปลี่ยนเครื่องหรือยุติการเชื่อมต่อแล้ว ไม่ได้นำข้อมูลไปใช้'), true); return true; }
        var work = pending;
        clearTimeout(work.timer); pending = null;
        if (message.success === false) { finish(t('The remote computer could not access its clipboard.', 'เครื่องรีโมตอ่านหรือเขียนคลิปบอร์ดไม่ได้ กรุณาลองใหม่'), true); return true; }
        if (message.type === 'setclip') {
            if (message.success !== true) { finish(t('No write confirmation received.', 'ยังไม่ได้รับการยืนยันว่าเขียนสำเร็จ'), true); return true; }
            if (permitted('getclip')) request('getclip', null, work.value);
            else finish(t('Remote computer reported the text was sent. Press Ctrl+V there to paste.', 'เครื่องรีโมตแจ้งว่าส่งข้อความแล้ว กด Ctrl+V ที่เครื่องรีโมตเพื่อวาง'));
        } else if (typeof message.data === 'string') {
            if (typeof work.expected === 'string') {
                var same = message.data.replace(/\r\n/g, '\n') === work.expected.replace(/\r\n/g, '\n');
                finish(same ? t('Sent and verified. Press Ctrl+V on the remote computer.', 'ส่งข้อความและตรวจสอบแล้ว กด Ctrl+V บนเครื่องรีโมตเพื่อวาง') : t('The clipboard changed before verification. Try again.', 'คลิปบอร์ดเปลี่ยนก่อนตรวจสอบ กรุณาลองส่งอีกครั้ง'), !same);
            } else {
                node('scpTransferText').value = message.data;
                finish(message.data ? t('Received. Click “Copy to this computer”, then paste locally.', 'รับข้อความแล้ว กด “คัดลอกเข้าเครื่องเรา” แล้ววางในโปรแกรมที่ต้องการ') : t('The remote clipboard has no text.', 'คลิปบอร์ดเครื่องรีโมตไม่มีข้อความ'));
            }
        } else finish(t('The remote computer returned no text.', 'เครื่องรีโมตไม่ได้ส่งข้อความกลับมา'), true);
        return true;
    }
    function localClipboard(read) {
        var field = node('scpTransferText'); if (!field || !valid()) return;
        if (!navigator.clipboard || typeof navigator.clipboard[read ? 'readText' : 'writeText'] !== 'function') {
            field.focus(); field.select(); status(t('Use Ctrl+V to paste here, or Ctrl+C to copy selected text.', 'ใช้ Ctrl+V เพื่อวางในช่องนี้ หรือ Ctrl+C เพื่อคัดลอกข้อความที่เลือก'), true); return;
        }
        var target = dialogNode;
        var operation = read ? navigator.clipboard.readText() : navigator.clipboard.writeText(field.value);
        operation.then(function (value) {
            if (!valid() || target !== dialogNode || field !== node('scpTransferText')) return;
            if (read) {
                if (value.length > 65535) { status(t('Text exceeds 65,535 characters.', 'ข้อความเกิน 65,535 ตัวอักษร กรุณาแบ่งส่ง'), true); return; }
                field.value = value;
            }
            status(read ? t('Text loaded. Check it, then send to the remote computer.', 'นำข้อความมาแล้ว ตรวจข้อความก่อนกดส่งไปเครื่องรีโมต') : t('Copied. Paste into an application on this computer.', 'คัดลอกแล้ว วางในโปรแกรมบนเครื่องเราได้เลย'));
        }).catch(function () { if (valid() && field === node('scpTransferText')) { field.focus(); field.select(); status(t('Browser clipboard access was denied. Use Ctrl+V / Ctrl+C in this box.', 'เบราว์เซอร์ไม่อนุญาตคลิปบอร์ด ใช้ Ctrl+V / Ctrl+C ในช่องข้อความนี้แทน'), true); } });
    }
    function filePage() {
        if (!window.currentNode || typeof window.go !== 'function') return;
        if (window.xxdialogTag === 'scp-transfer') window.dialogclose(0);
        if (pending) { clearTimeout(pending.timer); pending = null; }
        window.go(13);
        // Keep the native Connect button and its consent flow; opening a panel alone never starts a file session.
        var connect = node('p13Connect'); if (connect && connect.getClientRects().length) connect.focus();
    }
    function show() {
        if (window.xxdialogMode || !connected()) return;
        if (pending) { clearTimeout(pending.timer); pending = null; }
        dialogNode = window.currentNode._id;
        var html = '<div class="scp-transfer"><p id="scpTransferTarget"></p><p>' + t('Text: this computer ⇄ remote computer', 'ข้อความ: เครื่องเรา ⇄ เครื่องรีโมต') + '</p>' +
            '<textarea id="scpTransferText" maxlength="65535" aria-label="' + t('Text to transfer', 'ข้อความสำหรับรับ–ส่ง') + '"></textarea>' +
            '<div class="scp-transfer-actions"><button type="button" id="scpTransferRead">' + t('Read this computer’s clipboard', 'อ่านคลิปบอร์ดเครื่องเรา') + '</button><button type="button" id="scpTransferSend">' + t('Send → remote computer', 'ส่ง → เครื่องรีโมต') + '</button></div>' +
            '<div class="scp-transfer-actions"><button type="button" id="scpTransferGet">' + t('Receive ← remote computer', 'รับ ← เครื่องรีโมต') + '</button><button type="button" id="scpTransferCopy">' + t('Copy to this computer', 'คัดลอกเข้าเครื่องเรา') + '</button></div>' +
            '<p id="scpTransferStatus" role="status" aria-live="polite"></p><hr><p>' + t('Files use a separate connection. The remote user may need to grant file access.', 'ไฟล์ใช้การเชื่อมต่อแยก เครื่องปลายทางอาจต้องอนุญาตเข้าถึงไฟล์') + '</p><button type="button" id="scpTransferFiles">' + t('Open two-way file transfer', 'เปิดหน้ารับ–ส่งไฟล์สองทาง') + '</button></div>';
        window.setDialogMode(2, t('Transfer text and files', 'รับ–ส่งข้อความและไฟล์'), 1, null, html, 'scp-transfer');
        node('scpTransferTarget').textContent = t('Remote computer: ', 'เครื่องรีโมต: ') + (window.currentNode.name || dialogNode);
        node('scpTransferRead').onclick = function () { localClipboard(true); };
        node('scpTransferCopy').onclick = function () { localClipboard(false); };
        node('scpTransferGet').onclick = function () { request('getclip'); };
        node('scpTransferSend').onclick = function () {
            var value = node('scpTransferText').value;
            if (!value && !window.confirm(t('Clear the remote clipboard?', 'ต้องการล้างข้อความในคลิปบอร์ดเครื่องรีโมตหรือไม่?'))) return;
            request('setclip', value);
        };
        node('scpTransferFiles').onclick = filePage; busy(false);
        node('scpTransferText').focus();
    }

    /* Dropping a file on the remote screen showed a green marker and then did nothing
       at all unless it was a script or a text file. A PDF, a photo, a zip — gone without
       a word, which reads as "sent" to whoever dropped it. These now go to that
       computer through the file page, which is where the permission for files belongs. */
    var typesTheDesktopHandles = /\.(bat|ps1|sh|agentconsole|txt)$/i;
    var toastTimer = null;

    function toast(message, isError) {
        var box = node('scpTransferToast');
        if (!message) { if (box && box.parentElement) { box.parentElement.removeChild(box); } return; }
        if (!box) {
            box = document.createElement('div');
            box.id = 'scpTransferToast';
            box.className = 'scp-toast';
            document.body.appendChild(box);
        }
        box.textContent = message;
        box.dataset.error = isError ? 'true' : 'false';
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(function () { toast(''); toastTimer = null; }, isError ? 12000 : 6000);
    }

    function bytes(value) {
        if (value >= 1073741824) { return (value / 1073741824).toFixed(1) + ' GB'; }
        if (value >= 1048576) { return (value / 1048576).toFixed(1) + ' MB'; }
        if (value >= 1024) { return Math.round(value / 1024) + ' KB'; }
        return value + ' B';
    }

    // The upload dialog shows a bar and a file name but no number, so a large file that
    // is moving looks the same as one that has stalled. Add the percentage, the bytes and
    // which file of how many, alongside the dialog rather than inside its code.
    function watchUploadProgress() {
        if (watchUploadProgress.timer) { return; }
        watchUploadProgress.timer = setInterval(function () {
            var bar = node('d2progressBar'), label = node('p13dfileName');
            if (!bar || !label) {
                clearInterval(watchUploadProgress.timer);
                watchUploadProgress.timer = null;
                return;
            }
            var line = node('scpUploadPercent');
            if (!line) {
                line = document.createElement('div');
                line.id = 'scpUploadPercent';
                line.className = 'scp-upload-percent';
                bar.parentElement.insertBefore(line, bar.nextSibling);
            }
            var max = Number(bar.max) || 0, value = Number(bar.value) || 0;
            var parts = [(max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0) + '%'];
            if (max > 0) { parts.push(bytes(value) + ' / ' + bytes(max)); }
            var queue = window.uploadFile;
            if (queue && queue.xfiles && (queue.xfiles.length > 1)) {
                parts.push(t('file ', 'ไฟล์ที่ ') + Math.max(1, (queue.xfilePtr | 0) + 1) + t(' of ', ' จาก ') + queue.xfiles.length);
            }
            line.textContent = parts.join('   ·   ');
        }, 200);
    }

    // Windows has no single place called the root: a computer opened for the first time
    // shows its drive list, and a file cannot be put in a drive list. The page remembers
    // the last folder per computer, so this only happens once each — but failing into
    // nothing that once is exactly how a transfer goes missing. Wait for a folder to be
    // opened and send the moment there is one.
    function atAFolder() {
        var where = window.p13filetreelocation;
        return (where != null) && (where.length > 0) && (where.join('') !== '');
    }

    function sendOnceAFolderIsOpen(files, target) {
        if (atAFolder()) {
            toast('');
            window.p13doUploadFiles(files);
            watchUploadProgress();
            return;
        }
        toast(t('Open the folder on that computer where these should go — they will be sent as soon as you do.', 'เปิดโฟลเดอร์ปลายทางบนเครื่องนั้น แล้วไฟล์จะถูกส่งทันที'));
        var waited = 0;
        var timer = setInterval(function () {
            waited += 500;
            if (!window.currentNode || (window.currentNode._id !== target) || (window.p13filetree == null)) {
                clearInterval(timer);
                toast(t('Stopped: that computer is no longer open.', 'หยุดส่ง เพราะออกจากเครื่องนั้นแล้ว'), true);
                return;
            }
            if (atAFolder()) {
                if (window.xxdialogMode) { return; } // something else is open; wait for it
                clearInterval(timer);
                toast('');
                window.p13doUploadFiles(files);
                watchUploadProgress();
                return;
            }
            if (waited >= 300000) {
                clearInterval(timer);
                toast(t('Cancelled: no folder was opened on that computer.', 'ยกเลิกการส่ง เพราะยังไม่ได้เปิดโฟลเดอร์ปลายทาง'), true);
            }
        }, 500);
    }

    function sendDroppedFiles(files) {
        var device = window.currentNode;
        if (!device) { return; }
        var target = device._id;
        toast(t('Received ', 'รับไฟล์ ') + files.length + t(' file(s). Opening the file page…', ' รายการแล้ว กำลังเปิดหน้ารับส่งไฟล์…'));
        if (typeof window.gotoDevice === 'function') { window.gotoDevice(target, 13); }

        // The file page has its own connection and the person at that computer has to
        // allow it, so wait for the folder listing rather than assuming it is there.
        var waited = 0, pressedConnect = false;
        var timer = setInterval(function () {
            waited += 400;
            if (!window.currentNode || (window.currentNode._id !== target)) {
                clearInterval(timer);
                toast(t('Stopped: the page moved to another computer.', 'หยุดส่ง เพราะเปลี่ยนไปเครื่องอื่นแล้ว'), true);
                return;
            }
            if (window.p13filetree != null) {
                clearInterval(timer);
                if (window.xxdialogMode) {
                    toast(t('Close the open window first, then drop the files again.', 'ปิดหน้าต่างที่เปิดอยู่ก่อน แล้วลากไฟล์มาวางใหม่'), true);
                    return;
                }
                sendOnceAFolderIsOpen(files, target);
                return;
            }
            if (!pressedConnect) {
                // The page hides this button once connected, by setting display:none.
                // Checking that rather than the rendered box keeps this testable.
                var connect = node('p13Connect');
                if (connect && !connect.hidden && (connect.style.display !== 'none') && !connect.disabled) {
                    connect.click();
                    pressedConnect = true;
                    toast(t('Asking that computer to allow file access…', 'กำลังขออนุญาตเข้าถึงไฟล์จากเครื่องปลายทาง…'));
                }
            }
            if (waited >= 90000) {
                clearInterval(timer);
                toast(t('No answer from that computer. Press Connect on the file page, then drop the files again.', 'เครื่องปลายทางยังไม่ตอบ กดเชื่อมต่อในหน้ารับส่งไฟล์ แล้วลากไฟล์มาวางใหม่'), true);
            }
        }, 400);
    }

    function desktopDrop(event) {
        if (!event.dataTransfer || !event.dataTransfer.files || (event.dataTransfer.files.length === 0)) { return; }
        var dropped = Array.prototype.slice.call(event.dataTransfer.files).filter(function (file) { return file && (file.size > 0); });
        // Scripts and text files already do something useful here; leave those alone.
        var forUpload = dropped.filter(function (file) { return !typesTheDesktopHandles.test(file.name); });
        if (forUpload.length === 0) { return; }
        event.preventDefault();
        event.stopPropagation();
        if (!window.currentNode) { return; }
        if (!window.desktop || (window.desktop.State !== 3)) {
            toast(t('Connect to this computer first.', 'เชื่อมต่อหน้าจอเครื่องนี้ก่อน'), true);
            return;
        }
        sendDroppedFiles(forUpload);
    }

    function init() {
        var clip = node('DeskClip');
        if (clip) {
            clip.value = t('Transfer text', 'รับ–ส่งข้อความ'); window.showDeskClip = show;
            var filesButton = document.createElement('input'); filesButton.type = 'button';
            filesButton.id = 'scpDesktopFiles'; filesButton.className = clip.className;
            filesButton.value = t('Send / receive files', 'ส่ง / รับไฟล์');
            filesButton.title = t('Choose files to upload, or download files from the remote computer', 'เลือกไฟล์เพื่อส่งไปเครื่องรีโมต หรือดาวน์โหลดกลับเครื่องเรา');
            filesButton.onclick = filePage; clip.insertAdjacentElement('afterend', filesButton);
        }
        var panel = node('p13filetable');
        if (panel) {
            var help = document.createElement('div'); help.className = 'scp-transfer-file-help';
            help.textContent = t('1. Connect. 2. Open the remote destination folder. Upload sends files from this computer; select remote files and Download to receive them here. Copying a file in Windows does not transfer it through the browser clipboard.', '1. กดเชื่อมต่อ  2. เปิดโฟลเดอร์ปลายทางบนเครื่องรีโมต  •  อัปโหลด = ส่งไฟล์จากเครื่องเรา  •  เลือกไฟล์แล้วดาวน์โหลด = รับกลับเครื่องเรา  •  การก๊อปไฟล์ใน Windows ยังไม่ส่งไฟล์ข้ามเครื่อง ต้องอัปโหลดหรือลากไฟล์มาวางในหน้านี้');
            panel.insertBefore(help, panel.firstChild);
        }
        [['p13UploadButton', t('Upload → remote', 'อัปโหลด → เครื่องรีโมต')], ['p13DownloadButton', t('Download → this computer', 'ดาวน์โหลด → เครื่องเรา')]].forEach(function (item) { var button = node(item[0]); if (button) { button.value = item[1]; button.title = item[1]; } });

        // Take dropped files that the remote screen would otherwise swallow. The page's
        // own handler stays in place and still deals with scripts and text files.
        var screen = node('deskarea0');
        if (screen) { screen.addEventListener('drop', desktopDrop, false); }
        // Uploads started any other way get the percentage too.
        ['p13UploadButton', 'p13filetable'].forEach(function (id) {
            var item = node(id);
            if (item) { item.addEventListener(id === 'p13filetable' ? 'drop' : 'click', function () { setTimeout(watchUploadProgress, 300); }, false); }
        });
    }
    window.ScpTransfer = { handle: handle, show: show, filePage: filePage, desktopDrop: desktopDrop, watchUploadProgress: watchUploadProgress, atAFolder: atAFolder };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
