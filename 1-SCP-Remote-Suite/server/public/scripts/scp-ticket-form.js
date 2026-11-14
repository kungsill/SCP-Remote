// SCP-Remote: Official Thai Government Maintenance Request Form (บันทึกแจ้งซ่อม)
// Laid out to match the hospital's printed A4 repair ticket. Every row is a
// fixed-height line and every label sits at a fixed column ("tab stop") measured
// from the original document, so screen and print look the same.
(function (root) {
    'use strict';

    var thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    function formatThaiDate(date) {
        var d = date ? new Date(date) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        var day = d.getDate();
        var month = thaiMonths[d.getMonth()];
        var year = d.getFullYear() + 543;
        return day + ' ' + month + ' ' + year;
    }

    function formatThaiTime(date) {
        var d = date ? new Date(date) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        var h = String(d.getHours()).padStart(2, '0');
        var m = String(d.getMinutes()).padStart(2, '0');
        return h + ':' + m + ' น.';
    }

    function deriveTicketNo(ticket) {
        if (!ticket) return 'C70-00006';
        if (ticket.ticketNo) return ticket.ticketNo;
        var id = ticket._id || '';
        var parts = id.split('/');
        var last = parts.pop() || '';
        var num = 1;
        if (last) {
            var sum = 0;
            for (var i = 0; i < last.length; i++) sum = (sum * 31 + last.charCodeAt(i)) >>> 0;
            num = (sum % 90000) + 1;
        }
        var yearBE = (new Date(ticket.created || Date.now()).getFullYear() + 543) % 100;
        return 'C' + yearBE + '-' + String(num).padStart(5, '0');
    }

    function findNode(nodeid) {
        if (!nodeid) return null;
        var nodes = Array.isArray(root.nodes) ? root.nodes : Object.values(root.nodes || {});
        return nodes.find(function (n) { return n._id === nodeid; }) || null;
    }

    function getDeviceName(nodeid) {
        var found = findNode(nodeid);
        return found ? (found.name || nodeid) : (nodeid || '');
    }

    function getDeviceModel(nodeid) {
        var found = findNode(nodeid);
        return (found && (found.modelName || found.model)) || 'รุ่น';
    }

    function getAssetNumber(nodeid) {
        if (!nodeid) return '';
        var cached = (root.ScpCachedAssets && root.ScpCachedAssets[nodeid]) || {};
        if (cached.assetNumber) return cached.assetNumber;
        var found = findNode(nodeid);
        return (found && found.assetNumber) || '';
    }

    function el(tag, text, cls) {
        var n = document.createElement(tag);
        if (text != null) n.textContent = text;
        if (cls) n.className = cls;
        return n;
    }

    function button(text, cls, fn) {
        var b = el('button', text, cls);
        b.type = 'button';
        if (fn) b.onclick = fn;
        return b;
    }

    function makeCheckbox(label, isChecked, groupName) {
        var wrap = el('span', null, 'scp-rf-chk');
        wrap.setAttribute('role', 'checkbox');
        wrap.setAttribute('aria-checked', isChecked ? 'true' : 'false');
        if (groupName) wrap.setAttribute('data-group', groupName);

        var box = el('span', null, 'scp-rf-box' + (isChecked ? ' checked' : ''));
        wrap.appendChild(box);
        if (label) wrap.appendChild(document.createTextNode(label));

        wrap.onclick = function (e) {
            e.stopPropagation();
            var willCheck = !box.classList.contains('checked');
            if (groupName) {
                var parent = wrap.closest('.scp-repair-paper');
                if (parent) {
                    parent.querySelectorAll('.scp-rf-chk[data-group="' + groupName + '"]').forEach(function (sib) {
                        sib.setAttribute('aria-checked', 'false');
                        var b = sib.querySelector('.scp-rf-box');
                        if (b) b.classList.remove('checked');
                    });
                }
            }
            box.classList.toggle('checked', willCheck);
            wrap.setAttribute('aria-checked', willCheck ? 'true' : 'false');
        };

        return wrap;
    }

    // --- Layout primitives -------------------------------------------------

    // A run of dots. Without a width it stretches to fill the rest of its cell.
    function fill(widthMm) {
        var f = el('span', new Array(401).join('.'), 'scp-rf-fill');
        if (widthMm) f.style.flex = '0 0 ' + widthMm + 'mm';
        return f;
    }

    // An editable value printed in the form.
    function val(field, text) {
        var v = el('span', text || '', 'scp-rf-val');
        v.contentEditable = 'true';
        v.setAttribute('data-field', field);
        v.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); v.blur(); }
        });
        v.addEventListener('paste', function (e) {
            var text = e.clipboardData && e.clipboardData.getData('text/plain');
            if (text == null) return;
            e.preventDefault();
            document.execCommand('insertText', false, text.replace(/\s+/g, ' '));
        });
        return v;
    }

    // A cell placed at a column, given as a percentage of the content width.
    // opts.to: right edge (%) so dots can stretch to it; opts.center centres the text.
    function cell(at, parts, opts) {
        opts = opts || {};
        var c = el('span', null, 'scp-rf-cell' + (opts.to != null ? ' scp-rf-span' : '') +
            (opts.center ? ' scp-rf-center' : '') + (opts.bold ? ' scp-rf-b' : ''));
        c.style.left = at + '%';
        if (opts.to != null) c.style.right = (100 - opts.to) + '%';
        (Array.isArray(parts) ? parts : [parts]).forEach(function (p) {
            if (p == null) return;
            c.appendChild(typeof p === 'string' ? el('span', p, 'scp-rf-t') : p);
        });
        return c;
    }

    // One printed line. gap adds blank space above it, in lines.
    function row(cells, gap) {
        var r = el('div', null, 'scp-rf-row');
        if (gap) r.style.marginTop = 'calc(' + gap + ' * var(--scp-rf-line))';
        cells.forEach(function (c) { r.appendChild(c); });
        return r;
    }

    function rule() {
        return el('div', null, 'scp-rf-rule');
    }

    // Header row shared by sections 1 and 2: title, number, date, time.
    // dateAt/timeAt let section 2 make room for its longer number label.
    function sectionHeader(title, noLabel, data, ticketNo, dateAt, timeAt) {
        return row([
            cell(0, title, { bold: true }),
            cell(16.5, [noLabel + ' : ', val('ticketNo', ticketNo)]),
            cell(dateAt || 34.9, ['วันที่ : ', val('date', data.date || formatThaiDate(data.rawDate))]),
            cell(timeAt || 53.9, ['เวลา : ', val('time', data.time || formatThaiTime(data.rawDate))])
        ]);
    }

    function fieldText(paper, field) {
        var f = paper.querySelector('[data-field="' + field + '"]');
        return f ? f.textContent.trim() : '';
    }

    // Scannable summary of the ticket, drawn as SVG so it prints sharply and
    // survives being copied into the print frame. Empty when qrcode.min.js is absent.
    function qrSvg(text) {
        if (!root.QRCode || !text) return null;
        var model;
        try {
            var q = new root.QRCode(document.createElement('div'), { text: text, useSVG: true, correctLevel: root.QRCode.CorrectLevel.L });
            model = q._oQRCode;
        } catch (e) { return null; }
        if (!model) return null;
        var n = model.getModuleCount(), d = '';
        for (var r = 0; r < n; r++) {
            for (var c = 0; c < n; c++) if (model.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
        }
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '-1 -1 ' + (n + 2) + ' ' + (n + 2));
        svg.setAttribute('shape-rendering', 'crispEdges');
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        return svg;
    }

    function updateQr(paper) {
        var box = paper.querySelector('.scp-rf-qr');
        if (!box) return;
        var no = fieldText(paper, 'ticketNo');
        var lines = [
            'บันทึกแจ้งซ่อม รพ.สีชมพู',
            'เลขที่: ' + no,
            'วันที่: ' + fieldText(paper, 'date') + ' ' + fieldText(paper, 'time'),
            'หน่วยงาน: ' + fieldText(paper, 'department')
        ];
        var asset = fieldText(paper, 'assetNumber');
        if (asset) lines.push('ครุภัณฑ์: ' + asset);
        box.textContent = '';
        var svg = no ? qrSvg(lines.join('\n')) : null;
        if (svg) box.appendChild(svg);
    }

    function renderPaper(data) {
        data = data || {};
        ensureStyles();
        var ticketNo = data.ticketNo || 'C70-00006';
        var paper = el('div', null, 'scp-repair-paper');

        // ---- Header: Garuda, title and agency, picture box -----------------
        var header = el('div', null, 'scp-rf-header');
        var garudaWrap = el('div', null, 'scp-rf-garuda');
        var garudaImg = document.createElement('img');
        garudaImg.src = 'images/garuda.svg';
        garudaImg.alt = 'ตราครุฑ';
        garudaImg.onerror = function () { this.onerror = null; this.src = 'images/garuda.png'; };
        garudaWrap.appendChild(garudaImg);
        header.appendChild(garudaWrap);

        var headText = el('div', null, 'scp-rf-head-text');
        headText.appendChild(el('div', 'บันทึกแจ้งซ่อม', 'scp-rf-title'));
        headText.appendChild(el('div', 'ส่วนราชการ โรงพยาบาลสีชมพู อำเภอ สีชมพู จังหวัด ขอนแก่น', 'scp-rf-agency'));
        header.appendChild(headText);
        header.appendChild(el('div', null, 'scp-rf-qr'));
        paper.appendChild(header);

        var dept = el('div', null, 'scp-rf-dept');
        dept.appendChild(document.createTextNode('หน่วยงานผู้แจ้งซ่อม : '));
        dept.appendChild(val('department', data.department == null ? 'งานสุขภาพดิจิทัล' : data.department));
        dept.appendChild(document.createTextNode(' เบอร์โทร : '));
        dept.appendChild(val('contact', data.contact == null ? '0930946817' : data.contact));
        paper.appendChild(dept);

        paper.appendChild(rule());

        // ---- ส่วนที่ 1 ผู้แจ้ง ------------------------------------------------
        var s1 = el('div', null, 'scp-rf-sec scp-rf-s1');
        s1.appendChild(sectionHeader('ส่วนที่ 1 ผู้แจ้ง', 'เลขที่', data, ticketNo));
        s1.appendChild(row([
            cell(0, ['แจ้งซ่อม : ', val('title', data.title == null ? 'แบตสำรองไม่เก็บไฟ ตู้เก็บเงิน' : data.title)], { to: 50 }),
            cell(50.7, ['ยี่ห้อ/รุ่น : ', val('model', data.model == null ? 'รุ่น' : data.model)], { to: 100 })
        ]));
        s1.appendChild(row([cell(0, ['หมายเลขครุภัณฑ์ : ', val('assetNumber', data.assetNumber)], { to: 100 })]));
        s1.appendChild(row([cell(0, ['อาการ : ', val('description', data.description == null ? 'แบตสำรองไม่เก็บไฟ ตู้เก็บเงิน OPD' : data.description)], { to: 100 })]));
        s1.appendChild(row([
            cell(15.2, [fill(31), 'ผู้แจ้งซ่อม']),
            cell(51.4, [fill(31), 'หัวหน้าหน่วยงาน'])
        ], 1));
        s1.appendChild(row([
            cell(15.2, ['( ', val('requesterName', data.requesterName || 'นาย ชัยรัตน์ ประภัยวงษ์'), ' )']),
            cell(51.4, ['( ', val('headName', data.headName || 'นายชวลิต  โพธิ์หล้า'), ' )'])
        ]));
        paper.appendChild(s1);

        paper.appendChild(rule());

        // ---- ส่วนที่ 2 ช่าง --------------------------------------------------
        var s2 = el('div', null, 'scp-rf-sec scp-rf-s2');
        s2.appendChild(sectionHeader('ส่วนที่ 2 ช่าง', 'เลขที่ใบแจ้งซ่อม', data, ticketNo, 37.2, 55.5));

        var urgent = data.urgency;
        s2.appendChild(row([
            cell(15.8, 'ความเร่งด่วน'),
            cell(31.4, makeCheckbox('ด่วนที่สุด', urgent === 'highest', 'urgency')),
            cell(44.5, makeCheckbox('ด่วนมาก', urgent === 'high', 'urgency')),
            cell(59.1, makeCheckbox('ด่วน', urgent === 'urgent', 'urgency')),
            cell(73.9, makeCheckbox('ปกติ', urgent !== 'highest' && urgent !== 'high' && urgent !== 'urgent', 'urgency'))
        ], 0.6));

        s2.appendChild(row([cell(0, ['รายละเอียดการตรวจซ่อมที่พบ/ความเห็นของช่าง : ', val('findings', data.findings)], { to: 100 })], 0.3));
        s2.appendChild(row([cell(0, ['รายการวัสดุอุปกรณ์ที่ใช้ :', data.partsUsed ? val('partsUsed', ' ' + data.partsUsed) : null, fill()], { to: 100 })]));

        s2.appendChild(row([
            cell(0, 'ผลการตรวจสอบ'),
            cell(20.8, ['1. ', makeCheckbox('ซ่อมได้พร้อมส่งคืนหน่วยงาน วันที่ :', false, 'result'), fill()], { to: 59.5 }),
            cell(63, ['ผู้รับของ :', fill()], { to: 93.8 })
        ], 0.9));
        s2.appendChild(row([
            cell(20.8, ['2. ', makeCheckbox('ส่งซ่อมภายนอก ชื่อร้าน/บริษัท :', false, 'result'), fill()], { to: 93.8 })
        ], 1));
        s2.appendChild(row([cell(23.3, 'รายการอุปกาณ์ที่ต้องส่ง')]));
        s2.appendChild(row([cell(23.3, 'วันที่ :'), cell(63, 'ผู้รับ :')]));
        s2.appendChild(row([
            cell(20.8, ['3. ', makeCheckbox('รออะไหล่ :', false, 'result'), fill()], { to: 93.8 })
        ], 0.9));
        s2.appendChild(row([
            cell(20.8, ['4. ', makeCheckbox('รอจำหน่ายเนื่องจาก :', false, 'result'), fill()], { to: 93.8 })
        ], 1));
        s2.appendChild(row([
            cell(0, ['แจ้งหน่วยงานที่แจ้ง :', fill()], { to: 65 }),
            cell(65.5, ['ผู้รับเรื่อง :', fill()], { to: 93.8 })
        ]));
        s2.appendChild(row([cell(0, 'ช่าง'), cell(35.4, 'เจ้าที่พัสดุ'), cell(62.6, 'ผู้อนุมัติ')]));
        s2.appendChild(row([
            cell(7.7, fill(), { to: 24.6 }),
            cell(35.4, fill(), { to: 54.1 }),
            cell(71.6, makeCheckbox('อนุมัติ', false, 'approval2')),
            cell(84.4, makeCheckbox('ไม่อนุมัติ', false, 'approval2'))
        ], 1));
        s2.appendChild(row([
            cell(0, ['( ', val('technicianName', data.technicianName || 'นาย ชัยรัตน์ ประภัยวงษ์'), ' )'], { to: 30, center: true }),
            cell(35.2, ['(', fill(), ')'], { to: 59.5 }),
            cell(71.6, ['(', fill(), ')'], { to: 97.8 })
        ], 0.2));
        paper.appendChild(s2);

        paper.appendChild(rule());

        // ---- ส่วนที่ 3 สั่งพัสดุเพิ่ม -------------------------------------------
        var s3 = el('div', null, 'scp-rf-sec scp-rf-s3');
        s3.appendChild(row([cell(0, 'ส่วนที่ 3 ส่วนสั่งพัสดุเพิ่ม กรณี ส่งซ่อมภายนอกผลการตรวจประเมินส่งภายนอก', { bold: true })]));
        s3.appendChild(row([cell(0, 'ผลการตรวจประเมินของช่าง บริษัท')]));
        s3.appendChild(row([cell(0, [makeCheckbox('รายการอุปกรณ์ใหม่ฯเพิ่มเติม', false), fill()], { to: 52.6 })], 0.6));
        s3.appendChild(row([
            cell(0, [makeCheckbox('รวมราคาประเมิน', false), fill(19.5), 'รายการ ราคา', fill(13), 'บาท']),
            cell(62.6, makeCheckbox('อนุมัติ', false, 'approval3')),
            cell(71.6, [makeCheckbox('ไม่อนุมัติ', false, 'approval3'), fill()], { to: 100 })
        ], 1));
        s3.appendChild(row([cell(77.6, ['( ', fill(), ')'], { to: 100 })], 0.35));
        paper.appendChild(s3);

        paper.appendChild(rule());

        // ---- ส่วนที่ 4 ส่งมอบงาน ---------------------------------------------
        var s4 = el('div', null, 'scp-rf-sec scp-rf-s4');
        s4.appendChild(row([cell(0, 'ส่วนที่ 4 ส่วนส่งมอบงาน กรณีส่งซ่อมภายใน(2) และรออะไหล่(3)', { bold: true })]));
        s4.appendChild(row([cell(11.5, ['ช่างได้รับเครื่อง/อุปกรณ์/อะไหล่ พร้อมทำการตรวจซ่อมและส่งคืนหน่วยงาน', fill()], { to: 100 })]));
        s4.appendChild(row([cell(11.5, ['วันที่ ', fill(30.5), 'ผู้รับเครื่องอุปกรณ์คืน', fill()], { to: 100 })]));
        s4.appendChild(row([cell(0, [el('b', 'หมายเหตุ'), ' เครื่อง/อุปกรณ์/อะไหล่ ที่รอจำหน่าย(4) ได้ส่งมอบให้งานพัสดุแล้ว'])]));
        s4.appendChild(row([cell(0, ['วันที่ ', fill(31), 'ผู้รับ', fill(43), 'ทราบ'])]));
        s4.appendChild(row([
            cell(28.9, fill(), { to: 52.6 }),
            cell(65.1, ['(', fill(), ')'], { to: 93.8 })
        ], 0.75));
        s4.appendChild(row([
            cell(28.9, 'ช่างผู้ทำการตรวจสอบ', { to: 52.6, center: true }),
            cell(63, ['(', fill(), ')'], { to: 94 })
        ]));
        paper.appendChild(s4);

        updateQr(paper);
        var qrTimer = null;
        paper.addEventListener('input', function () {
            clearTimeout(qrTimer);
            qrTimer = setTimeout(function () { updateQr(paper); }, 300);
        });
        return paper;
    }

    function buildDataFromTicket(ticket) {
        if (!ticket) {
            // Default sample data matching the user's scan
            return {
                ticketNo: 'C70-00006',
                date: '14 ต.ค. 2569',
                time: '15:45 น.',
                department: 'งานสุขภาพดิจิทัล',
                contact: '0930946817',
                title: 'แบตสำรองไม่เก็บไฟ ตู้เก็บเงิน',
                model: 'รุ่น',
                assetNumber: '',
                description: 'แบตสำรองไม่เก็บไฟ ตู้เก็บเงิน OPD',
                requesterName: 'นาย ชัยรัตน์ ประภัยวงษ์',
                headName: 'นายชวลิต  โพธิ์หล้า',
                technicianName: 'นาย ชัยรัตน์ ประภัยวงษ์',
                urgency: 'normal'
            };
        }

        var nodeid = ticket.nodeid;
        var rawDate = ticket.created || ticket.updated || Date.now();
        var model = getDeviceModel(nodeid);
        var assetNo = getAssetNumber(nodeid);
        var deviceName = getDeviceName(nodeid);

        var partsUsed = '';
        if (ticket.estimate && Array.isArray(ticket.estimate.lines) && ticket.estimate.lines.length) {
            partsUsed = ticket.estimate.lines.map(function (l) {
                return l.name + ' (' + l.quantity + ' รายการ ' + Number(l.amount || (l.quantity * l.unitPrice)).toLocaleString('th-TH') + ' บ.)';
            }).join(', ');
        }

        return {
            ticketNo: deriveTicketNo(ticket),
            rawDate: rawDate,
            date: formatThaiDate(rawDate),
            time: formatThaiTime(rawDate),
            department: ticket.department || 'งานสุขภาพดิจิทัล',
            contact: ticket.contact || '0930946817',
            title: ticket.title || (deviceName ? ('แจ้งซ่อมเครื่อง ' + deviceName) : 'แจ้งซ่อมอุปกรณ์'),
            model: model || 'รุ่น',
            assetNumber: assetNo || '',
            description: ticket.description || ticket.title || (deviceName ? ('อาการผิดปกติที่ตรวจพบในเครื่อง ' + deviceName) : ''),
            requesterName: ticket.requesterName || (root.userinfo && root.userinfo.fullname) || 'นาย ชัยรัตน์ ประภัยวงษ์',
            headName: ticket.departmentHead || 'นายชวลิต  โพธิ์หล้า',
            technicianName: ticket.assigneeName || (root.userinfo && root.userinfo.fullname) || 'นาย ชัยรัตน์ ประภัยวงษ์',
            urgency: ticket.urgency || 'normal',
            partsUsed: partsUsed
        };
    }

    // The paper's own look, shared by the on-screen preview and the print frame.
    // Columns are percentages of the content width; rows are one --scp-rf-line high.
    var FORM_CSS = [
        '.scp-repair-paper{--scp-rf-line:3.85mm;width:210mm;min-height:297mm;box-sizing:border-box;padding:5mm 10mm 10mm 17.5mm;background:#fff;color:#000;font-family:Tahoma,"Leelawadee UI","Sarabun",sans-serif;font-size:10.6px;line-height:var(--scp-rf-line);text-align:left}',
        '.scp-repair-paper *{box-sizing:border-box}',
        '.scp-rf-header{display:flex;align-items:flex-start;height:17mm}',
        '.scp-rf-garuda{width:15mm;height:17mm;flex-shrink:0}',
        '.scp-rf-garuda img{width:100%;height:100%;object-fit:contain;display:block}',
        '.scp-rf-head-text{flex:1;padding-left:6.4mm;padding-top:1mm}',
        '.scp-rf-title{font-size:17.5px;font-weight:700;line-height:1.4}',
        '.scp-rf-agency{font-size:14px;line-height:1.5;margin-top:1.5mm}',
        '.scp-rf-qr{width:16mm;height:16mm;border:0.3mm solid #000;flex-shrink:0;margin-top:0.5mm;padding:0.4mm;background:#fff}',
        '.scp-rf-qr svg{display:block;width:100%;height:100%}',
        '.scp-rf-dept{margin-top:3.5mm;white-space:nowrap}',
        '.scp-rf-rule{border-top:0.6mm solid #555;margin:4mm 0 1.4mm}',
        '.scp-rf-sec{display:block}',
        '.scp-rf-row{position:relative;height:var(--scp-rf-line);white-space:nowrap}',
        '.scp-rf-cell{position:absolute;top:0;display:inline-flex;align-items:baseline;white-space:nowrap}',
        '.scp-rf-span{display:flex;overflow:hidden}',
        '.scp-rf-center{justify-content:center}',
        '.scp-rf-b{font-weight:700}',
        '.scp-rf-fill{flex:1 1 0;min-width:0;overflow:hidden;white-space:nowrap;letter-spacing:0.25px}',
        '.scp-rf-val,.scp-rf-t{outline:none;white-space:pre}',
        '.scp-rf-val:empty{display:inline-block;min-width:25mm}',
        '.scp-rf-chk{display:inline-flex;align-items:center;cursor:pointer;user-select:none;white-space:nowrap}',
        '.scp-rf-box{position:relative;display:inline-block;width:3mm;height:3mm;border:0.25mm solid #000;margin-right:2mm;flex-shrink:0;background:#fff}',
        '.scp-rf-box.checked::after{content:"";position:absolute;left:0.85mm;top:0.15mm;width:0.8mm;height:1.7mm;border:solid #000;border-width:0 0.35mm 0.35mm 0;transform:rotate(45deg)}'
    ].join('\n');

    var PRINT_CSS = [
        '@page{size:A4 portrait;margin:0}',
        '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
        'html,body{margin:0;padding:0;background:#fff}',
        '.scp-repair-paper{height:297mm;overflow:hidden;box-shadow:none;margin:0;page-break-after:avoid;break-inside:avoid}',
        '.scp-rf-val{background:transparent!important;box-shadow:none!important}'
    ].join('\n');

    function ensureStyles() {
        if (typeof document === 'undefined' || document.getElementById('scpTicketFormCss')) return;
        var style = el('style', FORM_CSS);
        style.id = 'scpTicketFormCss';
        (document.head || document.documentElement).appendChild(style);
    }

    function print(paperEl) {
        var sourcePaper = paperEl || (paperBox && paperBox.querySelector('.scp-repair-paper'));
        if (!sourcePaper) return;

        // Isolated iframe print: completely bypasses modal dialog top-layer trapping and parent DOM hiding
        try {
            var oldFrame = document.getElementById('scpTicketPrintFrame');
            if (oldFrame && oldFrame.parentNode) oldFrame.parentNode.removeChild(oldFrame);

            var iframe = document.createElement('iframe');
            iframe.id = 'scpTicketPrintFrame';
            iframe.style.position = 'fixed';
            iframe.style.left = '-9999px';
            iframe.style.top = '0';
            iframe.style.width = '210mm';
            iframe.style.height = '297mm';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            var baseHref = (root.location && root.location.href) ? root.location.href : '/';
            var frameDoc = iframe.contentWindow.document;
            frameDoc.open();
            frameDoc.write('<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">');
            frameDoc.write('<base href="' + baseHref + '">');
            frameDoc.write('<title>บันทึกแจ้งซ่อม - โรงพยาบาลสีชมพู</title>');
            frameDoc.write('<style>' + FORM_CSS + '\n' + PRINT_CSS + '</style>');
            frameDoc.write('</head><body>');
            frameDoc.write(sourcePaper.outerHTML);
            frameDoc.write('</body></html>');
            frameDoc.close();

            var printed = false;
            function triggerPrint() {
                if (printed) return;
                printed = true;
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    directPrint(sourcePaper);
                }
                setTimeout(function () {
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                }, 60000);
            }

            var img = frameDoc.querySelector('img');
            if (img && !img.complete) {
                img.onload = function () { setTimeout(triggerPrint, 50); };
                img.onerror = function () { triggerPrint(); };
                setTimeout(triggerPrint, 400);
            } else {
                setTimeout(triggerPrint, 100);
            }
            return;
        } catch (err) {
            directPrint(sourcePaper);
        }
    }

    function printDirect(ticketData) {
        print(renderPaper(buildDataFromTicket(ticketData)));
    }

    function directPrint(sourcePaper) {
        var printRoot = el('div', null, 'scp-repair-ticket-print-root');
        printRoot.appendChild(sourcePaper.cloneNode(true));
        document.body.appendChild(printRoot);
        document.documentElement.classList.add('scp-ticket-printing');

        var cleaned = false;
        function clean() {
            if (cleaned) return;
            cleaned = true;
            document.documentElement.classList.remove('scp-ticket-printing');
            if (printRoot.parentNode) printRoot.parentNode.removeChild(printRoot);
            root.removeEventListener('afterprint', clean);
        }

        root.addEventListener('afterprint', clean);
        root.setTimeout(clean, 60000);
        try { root.print(); } catch (err) { clean(); }
    }

    var dialog = null;
    var paperBox = null;

    function draw(data) {
        paperBox.textContent = '';
        paperBox.appendChild(renderPaper(data));
    }

    function open(ticket) {
        if (!dialog) {
            dialog = el('dialog', null, 'scp-repair-form-dialog');
            dialog.id = 'scpRepairTicketDialog';

            var toolbar = el('div', null, 'scp-repair-form-toolbar');
            var toolLeft = el('div', null, 'scp-rf-tool-left');
            toolLeft.appendChild(el('strong', 'แบบฟอร์มบันทึกแจ้งซ่อม (ราชการ A4)'));
            toolbar.appendChild(toolLeft);

            var toolRight = el('div', null, 'scp-rf-tool-right');

            // Quick problem preset select
            var presets = root.ScpRepairPresets || [];
            if (presets.length) {
                var pSelect = el('select', null, 'scp-rf-preset-select');
                pSelect.appendChild(el('option', '⚡ เลือกอาการพบบ่อย (ดึงลงฟอร์ม)...'));
                presets.forEach(function (p, i) {
                    var o = el('option', (p.icon || '🔧') + ' ' + p.title);
                    o.value = String(i);
                    pSelect.appendChild(o);
                });
                pSelect.onchange = function () {
                    var sel = presets[this.value];
                    if (sel && paperBox) {
                        var titleVal = paperBox.querySelector('[data-field="title"]');
                        var descVal = paperBox.querySelector('[data-field="description"]');
                        if (titleVal) titleVal.textContent = sel.title;
                        if (descVal) descVal.textContent = sel.description;
                    }
                };
                toolRight.appendChild(pSelect);
            }

            var depts = root.ScpHospitalDepartments || [];
            if (depts.length) {
                var dSelect = el('select', null, 'scp-rf-preset-select');
                dSelect.appendChild(el('option', '🏥 เลือกหน่วยงาน...'));
                depts.forEach(function (d) {
                    var o = el('option', d);
                    o.value = d;
                    dSelect.appendChild(o);
                });
                dSelect.onchange = function () {
                    var f = paperBox && paperBox.querySelector('[data-field="department"]');
                    if (!f || !this.value || this.selectedIndex === 0) return;
                    f.textContent = this.value;
                    updateQr(paperBox.querySelector('.scp-repair-paper'));
                    this.selectedIndex = 0;
                };
                toolRight.appendChild(dSelect);
            }

            toolRight.appendChild(button('พิมพ์ / บันทึก PDF', 'scp-btn-primary', function () { print(); }));
            toolRight.appendChild(button('โหลดข้อมูลตัวอย่าง (รูป)', 'scp-btn-sample', function () {
                draw(buildDataFromTicket(null));
            }));
            toolRight.appendChild(button('แบบฟอร์มเปล่า', 'scp-btn-blank', function () {
                draw({
                    ticketNo: '',
                    date: '',
                    time: '',
                    department: '',
                    contact: '',
                    title: '',
                    model: '',
                    assetNumber: '',
                    description: '',
                    requesterName: '............................................',
                    headName: '............................................',
                    technicianName: '............................................',
                    urgency: 'normal'
                });
            }));
            toolRight.appendChild(button('ปิด', 'scp-btn-close', function () { dialog.close(); }));
            toolbar.appendChild(toolRight);
            dialog.appendChild(toolbar);

            paperBox = el('div', null, 'scp-repair-form-scroll');
            dialog.appendChild(paperBox);

            document.body.appendChild(dialog);

            // MeshCentral's document key handlers turn typing on the device page into
            // search input; keep keystrokes inside the form so its fields can be typed in.
            ['keydown', 'keypress', 'keyup'].forEach(function (type) {
                dialog.addEventListener(type, function (e) { e.stopPropagation(); });
            });

            dialog.addEventListener('cancel', function (e) {
                e.preventDefault();
                dialog.close();
            });
        }

        draw(buildDataFromTicket(ticket));
        try {
            if (dialog.open) dialog.close();
            dialog.showModal();
        } catch (e) {
            dialog.setAttribute('open', '');
        }
    }

    root.ScpTicketForm = {
        open: open,
        print: print,
        printDirect: printDirect,
        renderPaper: renderPaper,
        buildDataFromTicket: buildDataFromTicket
    };

}(typeof window !== 'undefined' ? window : globalThis));
