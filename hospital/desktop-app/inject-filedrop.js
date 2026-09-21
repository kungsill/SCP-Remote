// SCP-Remote desktop app: drag a file onto the remote screen and it lands on the far desktop.
//
// The app's session holds desktop+files rights but no command rights, so a dropped file cannot
// be "run" and is not meant to be -- it is carried over the same file channel the Files tab uses.
// On a drop we open that channel, move it to the Public Desktop (which shows on the person who is
// sitting there), and hand the files to the page's own chunked uploader, which already handles
// large files a piece at a time. The first drop of a session may raise the file-access consent on
// the remote computer; that is intended -- the person still agrees before anything is written.
//
// This lives in the app, not in MeshCentral's sharing page: every name it uses (files,
// connectFiles, p13doUploadFiles, p13gotFiles, p13filetree, p13targetpath) is a page global, so
// nothing here edits an upstream file. If the channel cannot be reached it says so and points the
// operator back to the Files tab, which is always the reliable path.
(function () {
    'use strict';
    if (window.__scpFileDrop) { return; }
    window.__scpFileDrop = true;

    // Public Desktop shows on the desktop of whoever is logged in, so a file dropped here appears
    // on the screen the operator is looking at without needing to know the user's name. The agent
    // runs as SYSTEM, so it can write there.
    var TARGET = 'C:/Users/Public/Desktop';
    var pending = null, navTimer = null;

    function note(msg) {
        if (!document.getElementById('scp-ui-drop-style')) {
            var st = document.createElement('style'); st.id = 'scp-ui-drop-style';
            st.textContent = '.scp-ui-toast{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483600;display:flex;align-items:center;gap:10px;max-width:80vw;padding:11px 18px;border:1px solid #cfe8ea;border-radius:14px;background:rgba(255,255,255,.97);color:#14434c;font:13px/1.4 Sarabun,"Segoe UI",system-ui,sans-serif;box-shadow:0 12px 30px rgba(21,60,73,.22);pointer-events:none}'
                + '.scp-ui-toast .scp-ui-drop-dot{width:9px;height:9px;border-radius:50%;background:#0e8ba0;flex:0 0 auto}';
            document.head.appendChild(st);
        }
        var b = document.getElementById('scpDropNote');
        if (!b) {
            b = document.createElement('div');
            b.id = 'scpDropNote'; b.className = 'scp-ui-toast';
            var d = document.createElement('span'); d.className = 'scp-ui-drop-dot';
            var t = document.createElement('span'); t.className = 'scp-ui-drop-text';
            b.append(d, t);
            document.body.appendChild(b);
        }
        b.querySelector('.scp-ui-drop-text').textContent = msg;
        b.style.display = 'flex';
        clearTimeout(b._t);
        b._t = setTimeout(function () { b.style.display = 'none'; }, 6000);
    }

    function norm(p) { return String(p == null ? '' : p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }

    function connected() {
        // The file redirect reports State 3 when the tunnel is up, the same as the desktop one.
        return window.files && (window.files.State === 3);
    }

    // Once the Public Desktop listing arrives, the page has made it the current folder, so the
    // uploader will place the files there. Hook the page's folder-arrival callback to fire the
    // upload at exactly that moment rather than guessing with a fixed delay.
    if (window.p13gotFiles && !window.__scpDropHook) {
        window.__scpDropHook = true;
        var origGotFiles = window.p13gotFiles;
        window.p13gotFiles = function () {
            var r = origGotFiles.apply(this, arguments);
            try {
                if (pending && window.p13filetree && (norm(window.p13filetree.path) === norm(TARGET))) {
                    var f = pending; pending = null;
                    clearTimeout(navTimer);
                    window.p13doUploadFiles(f);
                    note('กำลังส่ง ' + f.length + ' ไฟล์ ไปที่เดสก์ท็อปเครื่องปลายทาง…');
                }
            } catch (e) { }
            return r;
        };
    }

    function gotoTargetAndUpload() {
        try {
            window.p13targetpath = TARGET;
            window.files.sendText({ action: 'ls', reqid: 1, path: TARGET });
            clearTimeout(navTimer);
            navTimer = setTimeout(function () {
                if (pending) { pending = null; note('ส่งไฟล์ไม่สำเร็จ — ลองใช้แท็บ “ไฟล์” แทนครับ'); }
            }, 20000);
        } catch (e) { pending = null; note('เปิดโฟลเดอร์เดสก์ท็อปปลายทางไม่ได้ — ลองใช้แท็บ “ไฟล์”'); }
    }

    function waitConnectedThenUpload() {
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            if (connected()) { clearInterval(t); gotoTargetAndUpload(); }
            else if (tries >= 40) { clearInterval(t); if (pending) { pending = null; note('เชื่อมช่องไฟล์ไม่ได้ — ลองใช้แท็บ “ไฟล์”'); } }
        }, 500);
    }

    function handleDrop(list) {
        var files = [];
        for (var i = 0; i < list.length; i++) { if (list[i] && list[i].size) { files.push(list[i]); } }
        if (!files.length) { return; }
        pending = files;
        note('กำลังเตรียมส่ง ' + files.length + ' ไฟล์…');
        if (!window.files) {
            try { window.connectFiles(); } catch (e) { }
            waitConnectedThenUpload();
        } else if (connected()) {
            gotoTargetAndUpload();
        } else {
            waitConnectedThenUpload();
        }
    }

    var area = document.getElementById('deskarea0') || document.body;
    area.addEventListener('dragover', function (e) {
        if (e.dataTransfer) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (x) { } }
    }, false);
    area.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            e.preventDefault(); e.stopPropagation();
            handleDrop(e.dataTransfer.files);
        }
    }, true);
})();
