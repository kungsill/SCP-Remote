/* SCP-Remote My Files: persistent upload queue, server acknowledgement and immediate listing. */
(function () {
    'use strict';
    var thai = document.documentElement.lang === 'th';
    var texts = {
        help: ['Files stored on the SCP-Remote server. Upload, download, organize folders, or prepare files for IT support.', 'พื้นที่เก็บไฟล์บนเซิร์ฟเวอร์ SCP-Remote สำหรับอัปโหลด ดาวน์โหลด จัดโฟลเดอร์ และเตรียมไฟล์งานไอที'],
        refresh: ['Refresh files', 'รีเฟรชรายการ'], clear: ['Clear finished statuses', 'ล้างสถานะที่เสร็จแล้ว'],
        empty: ['This folder is empty. Upload files or drag and drop them here.', 'โฟลเดอร์นี้ยังว่าง อัปโหลดหรือลากไฟล์มาวางที่นี่ได้เลย'],
        root: ['Open My Files or a device-group folder to upload files.', 'เปิดโฟลเดอร์ไฟล์ของฉันหรือโฟลเดอร์กลุ่มอุปกรณ์เพื่ออัปโหลด'],
        queued: ['Queued', 'รออัปโหลด'], uploading: ['Uploading', 'กำลังอัปโหลด'], saving: ['Saving on server…', 'กำลังบันทึกบนเซิร์ฟเวอร์…'],
        success: ['Uploaded', 'อัปโหลดสำเร็จ'], error: ['Upload failed', 'อัปโหลดไม่สำเร็จ'],
        retry: ['Retry', 'ลองใหม่'], open: ['Open destination folder', 'เปิดโฟลเดอร์ปลายทาง'],
        replace: ['Some files already exist. Replace these files?', 'มีไฟล์ชื่อซ้ำอยู่แล้ว ต้องการเขียนทับไฟล์เหล่านี้หรือไม่?'],
        conflict: ['A file with this name already exists. Retry and confirm replacement if intended.', 'มีไฟล์ชื่อนี้อยู่แล้ว กดลองใหม่และยืนยันหากต้องการเขียนทับ'],
        session_expired: ['Session expired. Sign in again.', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'],
        access_denied: ['You do not have permission to upload to this folder.', 'คุณไม่มีสิทธิ์อัปโหลดในโฟลเดอร์นี้'],
        quota_exceeded: ['Not enough storage space. Free space or contact your administrator.', 'พื้นที่ไม่พอ กรุณาลบไฟล์ที่ไม่ใช้หรือติดต่อผู้ดูแลระบบ'],
        invalid_path: ['The destination folder no longer exists or is unavailable.', 'โฟลเดอร์ปลายทางไม่มีอยู่แล้วหรือไม่พร้อมใช้งาน'],
        invalid_name: ['Invalid filename. Rename the file and try again.', 'ชื่อไฟล์ใช้ไม่ได้ กรุณาเปลี่ยนชื่อแล้วลองใหม่'],
        invalid_upload: ['Invalid upload. Select files again.', 'ข้อมูลอัปโหลดไม่ถูกต้อง กรุณาเลือกไฟล์ใหม่'],
        storage_error: ['The server could not save this file.', 'เซิร์ฟเวอร์บันทึกไฟล์นี้ไม่ได้'],
        network: ['Connection interrupted. Refresh the folder before retrying; the file may already be saved.', 'การเชื่อมต่อขัดข้อง รีเฟรชโฟลเดอร์ก่อนลองใหม่ เพราะไฟล์อาจบันทึกแล้ว'],
        folder: ['Drag the folder into the upload window instead, or use Upload folder.', 'ลากโฟลเดอร์มาวางที่หน้าต่างอัปโหลด หรือกดปุ่มอัปโหลดโฟลเดอร์'],
        uploadFolder: ['Upload folder', 'อัปโหลดโฟลเดอร์'],
        creating: ['Creating folders on the server…', 'กำลังสร้างโฟลเดอร์บนเซิร์ฟเวอร์…'],
        folderReplace: ['Files with the same name will be replaced. Continue?', 'ไฟล์ที่ชื่อซ้ำจะถูกเขียนทับ ต้องการดำเนินการต่อหรือไม่?'],
        folderUnsupported: ['This browser cannot select a whole folder. Select the files instead.', 'เบราว์เซอร์นี้เลือกทั้งโฟลเดอร์ไม่ได้ กรุณาเลือกเป็นไฟล์แทน'],
        waiting: ['Waiting for the file list…', 'กำลังรอรายการไฟล์…'],
        hide: ['Hide this panel', 'ซ่อนแผงนี้']
    };
    function t(key) { return (texts[key] || texts.storage_error)[thai ? 1 : 0]; }
    var queue = [], active = false, opened = false, list, summary, picker, panel;
    var hiddenKey = 'scpFilesPanelHidden';
    // Closing the panel is remembered, but any upload brings it straight back so the
    // person uploading always sees progress, errors and the retry button.
    function setPanelVisible(visible) {
        if (!panel) return;
        panel.hidden = !visible;
        try { window.localStorage.setItem(hiddenKey, visible ? '0' : '1'); } catch (error) { /* storage can be blocked */ }
    }
    function panelStartsHidden() {
        try { return window.localStorage.getItem(hiddenKey) === '1'; } catch (error) { return false; }
    }
    function element(tag, className, text) {
        var item = document.createElement(tag);
        if (className) item.className = className;
        if (text != null) item.textContent = text;
        return item;
    }
    function button(label, click) {
        var item = element('button', '', label); item.type = 'button'; item.addEventListener('click', click); return item;
    }
    function currentFolder(location) {
        var folder = window.filetree;
        for (var i = 0; i < location.length; i++) {
            if (!folder || !folder.f || !folder.f[location[i]]) return null;
            folder = folder.f[location[i]];
        }
        return folder;
    }
    function refresh() {
        try { if (window.meshserver) window.meshserver.send({ action: 'files' }); }
        catch (error) { /* A reconnect will fetch the canonical tree; keep completed uploads visible. */ }
    }
    function updateRow(item) {
        item.row.dataset.state = item.state;
        item.status.textContent = t(item.state) + (item.state === 'uploading' ? ' ' + item.percent + '%' : '') + (item.reason ? ' — ' + item.reason : '');
        item.progress.hidden = ['queued', 'success', 'error'].indexOf(item.state) >= 0;
        if (item.state === 'saving') item.progress.removeAttribute('value');
        else item.progress.value = item.percent;
        item.retry.hidden = item.state !== 'error';
        if (summary) {
            var done = queue.filter(function (row) { return row.state === 'success'; }).length;
            var errors = queue.filter(function (row) { return row.state === 'error'; }).length;
            summary.textContent = t('success') + ': ' + done + '/' + queue.length + (errors ? ' · ' + t('error') + ': ' + errors : '');
        }
    }
    function makeRow(file, destination, overwrite) {
        var item = { file: file, name: file.name, destination: destination.slice(), link: destination.join('/'), overwrite: overwrite, state: 'queued', percent: 0 };
        item.row = element('div', 'scp-upload-row');
        var heading = element('div', 'scp-upload-heading');
        heading.appendChild(element('strong', '', file.name));
        heading.appendChild(element('span', '', new Intl.NumberFormat(thai ? 'th-TH' : 'en').format(file.size) + ' B'));
        item.row.appendChild(heading);
        item.status = element('div', 'scp-upload-status');
        item.status.setAttribute('role', 'status');
        item.row.appendChild(item.status);
        item.progress = element('progress'); item.progress.max = 100;
        item.progress.setAttribute('aria-label', file.name); item.row.appendChild(item.progress);
        var actions = element('div', 'scp-upload-actions');
        actions.appendChild(button(t('open'), function () {
            window.filetreelocation = item.destination.slice(); window.updateFiles(); refresh();
        }));
        item.retry = button(t('retry'), function () {
            if (item.code === 'file_exists') {
                if (!window.confirm(t('replace') + '\n' + item.name)) return;
                item.overwrite = true;
            }
            item.reason = ''; item.state = 'queued'; item.percent = 0; updateRow(item); pump();
        });
        actions.appendChild(item.retry); item.row.appendChild(actions);
        list.appendChild(item.row); return item;
    }
    function showSaved(item, data) {
        // Only insert into the visible model after a successful server disk-write acknowledgement.
        var folder = currentFolder(item.destination);
        if (folder) {
            if (!folder.f) folder.f = {};
            folder.f[data.file.name] = { t: 3, s: data.file.size, d: data.file.modified };
            if (window.setupBackPointers) window.setupBackPointers(window.filetree);
            window.updateFiles();
            if (window.filetreelocation.join('/') === item.link) {
                document.querySelectorAll('#p5files input[name="fc"]').forEach(function (input) {
                    if (input.value === item.name) {
                        var row = input.closest('.filelist');
                        if (row) { row.classList.add('scp-file-new'); setTimeout(function () { row.classList.remove('scp-file-new'); }, 5000); }
                    }
                });
            }
        }
        refresh();
    }
    function pump() {
        if (active) return;
        var item = queue.find(function (row) { return row.state === 'queued'; });
        if (!item) return;
        active = true; item.state = 'uploading'; updateRow(item);
        var xhr = new XMLHttpRequest();
        var settled = false;
        function finish(ok, data, code) {
            if (settled) return; settled = true; active = false;
            item.state = ok ? 'success' : 'error'; item.code = code;
            item.reason = ok ? '' : t(code === 'file_exists' ? 'conflict' : code);
            item.percent = ok ? 100 : item.percent;
            try { if (ok) showSaved(item, data); }
            finally { updateRow(item); pump(); }
        }
        xhr.open('POST', (window.domainUrl || '/') + 'uploadfile.ashx?link=' + encodeURIComponent(item.link));
        xhr.setRequestHeader('X-SCP-Upload', '1'); xhr.setRequestHeader('Accept', 'application/json');
        xhr.timeout = 15 * 60 * 1000;
        xhr.upload.onprogress = function (event) {
            if (settled) return;
            if (event.lengthComputable) item.percent = Math.round(event.loaded / event.total * 100);
            if (item.percent >= 100) item.state = 'saving';
            updateRow(item);
        };
        xhr.upload.onload = function () { if (!settled) { item.state = 'saving'; updateRow(item); } };
        xhr.onload = function () {
            var data;
            try { data = JSON.parse(xhr.responseText); } catch (error) { finish(false, null, xhr.status === 401 ? 'session_expired' : 'network'); return; }
            if (xhr.status === 200 && data && data.ok === true && data.path === item.link && data.file && data.file.name === item.name && data.file.size === item.file.size) finish(true, data);
            else finish(false, null, (data && data.error) || 'storage_error');
        };
        xhr.onerror = xhr.ontimeout = xhr.onabort = function () { finish(false, null, 'network'); };
        var data = new FormData(); data.append('overwrite', item.overwrite ? '1' : '0'); data.append('files', item.file, item.name);
        try { xhr.send(data); } catch (error) { finish(false, null, 'network'); }
    }
    function enqueue(files, location) {
        setPanelVisible(true);
        location = location || window.filetreelocation || [];
        if (!location.length) { summary.textContent = t('root'); return; }
        var selected = Array.from(files || []);
        if (!selected.length) return;
        var folder = currentFolder(location);
        var names = Object.keys(folder && folder.f || {}).map(function (name) { return name.toLowerCase(); });
        var conflicts = selected.filter(function (file) { return names.indexOf(file.name.toLowerCase()) >= 0; });
        var overwrite = conflicts.length > 0 && window.confirm(t('replace') + '\n' + conflicts.map(function (file) { return file.name; }).join('\n'));
        if (conflicts.length && !overwrite) return;
        selected.forEach(function (file) { var item = makeRow(file, location, overwrite && conflicts.indexOf(file) >= 0); queue.push(item); updateRow(item); });
        pump();
    }
    function choose() {
        if (!(window.filetreelocation || []).length) { summary.textContent = t('root'); return; }
        var destination = window.filetreelocation.slice();
        picker.onchange = function () { enqueue(picker.files, destination); picker.value = ''; };
        picker.click();
    }
    // Folders are created over the control connection while files travel over HTTP, so
    // the structure has to exist in the listing before the first file is sent.
    function waitForFolders(base, folders, done) {
        var attempts = 0;
        function check() {
            var ready = folders.every(function (path) { return currentFolder(base.concat(path.split('/'))) != null; });
            if (ready) { done(true); return; }
            if (attempts >= 25) { done(false); return; }
            attempts++;
            refresh();
            window.setTimeout(check, 400);
        }
        check();
    }
    function enqueueFolder(files) {
        setPanelVisible(true);
        var base = (window.filetreelocation || []).slice();
        if (!base.length) { summary.textContent = t('root'); return; }
        var selected = Array.from(files || []).filter(function (file) { return file.webkitRelativePath; });
        if (!selected.length) return;
        if (!window.confirm(t('folderReplace'))) return;

        // Every folder level the selection needs, shallowest first so each parent is
        // created before its children.
        var needed = {};
        selected.forEach(function (file) {
            var parts = file.webkitRelativePath.split('/');
            parts.pop();
            for (var i = 1; i <= parts.length; i++) { needed[parts.slice(0, i).join('/')] = true; }
        });
        var folders = Object.keys(needed).sort(function (a, b) { return a.split('/').length - b.split('/').length; });

        summary.textContent = t('creating');
        folders.forEach(function (path) {
            var parts = path.split('/');
            var name = parts.pop();
            try { window.meshserver.send({ action: 'fileoperation', fileop: 'createfolder', path: base.concat(parts), newfolder: name }); }
            catch (error) { /* the wait below reports a failure */ }
        });
        waitForFolders(base, folders, function (ready) {
            if (!ready) { summary.textContent = t('invalid_path'); return; }
            selected.forEach(function (file) {
                var parts = file.webkitRelativePath.split('/');
                parts.pop();
                var item = makeRow(file, base.concat(parts), true);
                queue.push(item); updateRow(item);
            });
            pump();
        });
    }
    function chooseFolder() {
        if (!(window.filetreelocation || []).length) { summary.textContent = t('root'); return; }
        var folderPicker = element('input');
        folderPicker.type = 'file';
        folderPicker.multiple = true;
        folderPicker.hidden = true;
        folderPicker.webkitdirectory = true;
        if (!('webkitdirectory' in folderPicker)) { summary.textContent = t('folderUnsupported'); return; }
        folderPicker.onchange = function () { enqueueFolder(folderPicker.files); folderPicker.remove(); };
        panel.appendChild(folderPicker);
        folderPicker.click();
    }
    function drop(event) {
        event.preventDefault(); event.stopPropagation();
        ['bigok', 'bigfail'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
        if (!event.dataTransfer) return;
        var directory = Array.from(event.dataTransfer.items || []).some(function (item) {
            var entry = item.webkitGetAsEntry && item.webkitGetAsEntry(); return entry && entry.isDirectory;
        });
        if (directory) { summary.textContent = t('folder'); return; }
        enqueue(event.dataTransfer.files);
    }
    function beforeRender() {
        if (!opened && window.userinfo && window.filetree && window.filetree.f && window.filetree.f[window.userinfo._id]) {
            window.filetreelocation = [window.userinfo._id]; opened = true;
        }
    }
    // Give each row an icon that says what the file is, the way a file manager does.
    var kinds = [
        ['image', ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'heic']],
        ['pdf', ['pdf']],
        ['doc', ['doc', 'docx', 'rtf', 'odt', 'txt', 'md']],
        ['sheet', ['xls', 'xlsx', 'csv', 'ods']],
        ['slide', ['ppt', 'pptx', 'odp']],
        ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'cab']],
        ['audio', ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'wma']],
        ['video', ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'mpg']],
        ['app', ['exe', 'msi', 'bat', 'cmd', 'ps1', 'sh', 'apk']],
        ['code', ['js', 'json', 'xml', 'html', 'htm', 'css', 'sql', 'py', 'ini', 'log']]
    ];
    // Thumbnails download the real file, so only preview images small enough that the
    // listing still opens quickly on a hospital network.
    var thumbnailLimit = 3 * 1024 * 1024;
    var thumbnailTypes = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
    function extensionOf(name) {
        var dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(dot + 1).toLowerCase() : '';
    }
    function kindOf(extension) {
        for (var i = 0; i < kinds.length; i++) { if (kinds[i][1].indexOf(extension) >= 0) return kinds[i][0]; }
        return 'file';
    }
    function decorate() {
        var container = document.getElementById('p5files');
        if (!container) return;
        var folder = currentFolder(window.filetreelocation || []);
        var rows = container.querySelectorAll('.filelist');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.dataset.scpKind) continue;
            var icon = row.querySelector('div[class^="fileIcon"]');
            if (!icon) continue;
            // Folders keep the icons the page already gives them; only files are typed.
            if (row.getAttribute('file') !== '3') { row.dataset.scpKind = 'folder'; continue; }
            var link = row.querySelector('a');
            var name = link ? link.textContent : '';
            var extension = extensionOf(name);
            var kind = kindOf(extension);
            row.dataset.scpKind = kind;
            icon.classList.add('scp-file-icon', 'scp-file-' + kind);
            icon.dataset.label = extension ? extension.toUpperCase().substring(0, 4) : '';
            var info = folder && folder.f ? folder.f[name] : null;
            if (thumbnailTypes.indexOf(extension) >= 0 && info && info.s > 0 && info.s <= thumbnailLimit && window.filetreelinkpath) {
                icon.style.backgroundImage = 'url("downloadfile.ashx?link=' + encodeURIComponent(window.filetreelinkpath + '/' + name) + '")';
                icon.classList.add('scp-file-thumb');
            }
        }
    }
    function afterRender() {
        var files = document.getElementById('p5files');
        if (files && !files.children.length) files.appendChild(element('div', 'scp-files-empty', t((window.filetreelocation || []).length ? 'empty' : 'root')));
        decorate();
    }
    function init() {
        var files = document.getElementById('p5files'); if (!files) return;
        panel = element('section', 'scp-files-panel'); panel.id = 'scpFilesPanel';
        var close = button('×', function () { setPanelVisible(false); });
        close.className = 'scp-files-close';
        close.title = t('hide');
        close.setAttribute('aria-label', t('hide'));
        panel.appendChild(close);
        panel.appendChild(element('p', 'scp-files-help', t('help')));
        var controls = element('div', 'scp-files-controls');
        controls.appendChild(button(t('uploadFolder'), chooseFolder));
        controls.appendChild(button(t('refresh'), refresh));
        controls.appendChild(button(t('clear'), function () {
            queue = queue.filter(function (item) { if (item.state === 'success' || item.state === 'error') { item.row.remove(); return false; } return true; });
            summary.textContent = '';
        }));
        panel.appendChild(controls);
        summary = element('div', 'scp-files-summary'); summary.setAttribute('role', 'status'); panel.appendChild(summary);
        list = element('div', 'scp-upload-list'); panel.appendChild(list);
        picker = element('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true; panel.appendChild(picker);
        files.parentElement.insertBefore(panel, files);
        if (panelStartsHidden()) panel.hidden = true;
        window.p5uploadFile = choose;
        window.p5uploadFileEx = function () { var input = document.getElementById('p5uploadinput'); if (input) enqueue(input.files); };
        window.p5PerformUpload = function (buttonCode, selected) { enqueue(selected); };
        window.p5fileDragDrop = drop;
        window.addEventListener('beforeunload', function (event) {
            if (active || queue.some(function (item) { return item.state === 'queued'; })) { event.preventDefault(); event.returnValue = ''; }
        });
    }
    window.ScpFiles = { beforeRender: beforeRender, afterRender: afterRender, enqueue: enqueue, enqueueFolder: enqueueFolder };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
