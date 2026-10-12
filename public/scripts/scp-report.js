// SCP-Remote: IT Hardware Assessment & Fleet Report System.
// Supports 4 comprehensive report formats with vector SVG charts:
// 1. Overall hospital fleet overview (ภาพรวมทั้งโรงพยาบาล)
// 2. Department / ward breakdown (แยกตามหน่วยงาน / แผนก)
// 3. Individual device fact sheet (ใบประเมินรายเครื่อง)
// 4. 5-year budget & upgrade forecast (แผนงบประมาณ 1-5 ปี)
(function (root) {
    'use strict';
    var thai = (typeof document !== 'undefined') && document.documentElement.lang === 'th';
    function t(en, th) { return thai ? th : en; }
    // The fiscal year (B.E.) the assessment planned for; Thai fiscal years start on 1 October.
    function budgetYearBEOf(assess) {
        if (assess && assess.budgetYearBE) return Number(assess.budgetYearBE);
        if (window.ScpPriceReference && window.ScpPriceReference.fiscalYearBE) return window.ScpPriceReference.fiscalYearBE();
        var d = new Date();
        return d.getFullYear() + (d.getMonth() >= 9 ? 1 : 0) + 543;
    }
    function el(tag, text, className) {
        var n = document.createElement(tag);
        if (text != null) { n.textContent = text; }
        if (className) { n.className = className; }
        return n;
    }
    function button(text, className, fn) { var b = el('button', text, className); b.type = 'button'; b.onclick = fn; return b; }

    var currentReportMode = 'overview'; // 'overview', 'department', 'device', 'budget'
    var selectedDeviceId = '';

    // Pure summarize function maintaining backwards compatibility with tests.
    function summarize(snap, watchedIds) {
        snap = snap || {};
        var nodes = Array.isArray(snap.nodes) ? snap.nodes : [];
        var groups = Array.isArray(snap.groups) ? snap.groups : [];
        var attention = nodes.filter(function (node) { return node.risks && node.risks.length; })
            .sort(function (a, b) {
                if ((b.high || 0) !== (a.high || 0)) { return (b.high || 0) - (a.high || 0); }
                if ((b.warn || 0) !== (a.warn || 0)) { return (b.warn || 0) - (a.warn || 0); }
                return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en');
            });
        var away = nodes.filter(function (node) { return !node.online; })
            .sort(function (a, b) {
                var aa = a.away == null ? -2 : a.away, bb = b.away == null ? -2 : b.away;
                var ar = aa === -1 ? Infinity : aa, br = bb === -1 ? Infinity : bb;
                if (br !== ar) { return br - ar; }
                return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en');
            });
        var watched = null;
        if (Array.isArray(watchedIds)) {
            var set = {};
            watchedIds.forEach(function (id) { set[id] = true; });
            watched = nodes.filter(function (node) { return set[node.id]; })
                .sort(function (a, b) {
                    if (a.online !== b.online) { return a.online ? 1 : -1; }
                    return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en');
                });
        }
        var total = typeof snap.total === 'number' ? snap.total : nodes.length;
        var online = typeof snap.online === 'number' ? snap.online : nodes.filter(function (n) { return n.online; }).length;

        // Perform or attach fleet assessment
        var assess = null;
        if (root.ScpCachedFleetAssessment) {
            assess = root.ScpCachedFleetAssessment;
        } else if (root.ScpFleetAssess && root.ScpFleetAssess.assessFleet) {
            assess = root.ScpFleetAssess.assessFleet(nodes);
        }

        return {
            at: snap.at || Date.now(),
            total: total, online: online, offline: total - online,
            highCount: attention.filter(function (n) { return n.high; }).length,
            attentionCount: attention.length,
            departments: groups, attention: attention, away: away, watched: watched,
            nodes: nodes,
            assess: assess
        };
    }

    function whenText(at) {
        var d = new Date(at);
        if (isNaN(d.getTime())) { return ''; }
        try { return d.toLocaleString(thai ? 'th-TH' : 'en-GB'); } catch (error) { return d.toISOString(); }
    }

    function awayText(days) {
        if (days == null) { return t('offline', 'ออฟไลน์'); }
        if (days === -1) { return t('never connected', 'ไม่เคยเชื่อมต่อเลย'); }
        if (days === 0) { return t('offline today', 'ออฟไลน์วันนี้'); }
        return t('away {0} days', 'หายไป {0} วัน').replace('{0}', days);
    }

    function statCard(number, label, tone) {
        var card = el('div', null, 'scp-report-stat' + (tone ? ' scp-report-stat-' + tone : ''));
        card.appendChild(el('strong', String(number)));
        card.appendChild(el('span', label));
        return card;
    }

    function riskLine(node) {
        var line = el('li', null, node.high ? 'scp-report-high' : 'scp-report-warn');
        var head = el('div', null, 'scp-report-risk-head');
        head.appendChild(el('strong', node.name || t('(no name)', '(ไม่มีชื่อ)')));
        head.appendChild(el('span', node.room || ''));
        if (!node.online) { head.appendChild(el('span', t('offline', 'ออฟไลน์'), 'scp-report-off')); }
        line.appendChild(head);
        var reasons = el('ul', null, 'scp-report-reasons');
        (node.risks || []).forEach(function (risk) {
            reasons.appendChild(el('li', risk.text, risk.level === 'high' ? 'scp-report-r-high' : 'scp-report-r-warn'));
        });
        line.appendChild(reasons);
        return line;
    }

    // --- SVG Charts Builders ---
    function createDonutChart(slices, width, height) {
        var total = slices.reduce(function (sum, s) { return sum + (s.value || 0); }, 0);
        if (!total) total = 1;
        var r = 55, cx = 85, cy = 80, c = 2 * Math.PI * r;
        var acc = 0;
        var circles = slices.map(function (s) {
            var pct = (s.value || 0) / total;
            var dash = (pct * c) + ' ' + (c * (1 - pct));
            var offset = -acc * c;
            acc += pct;
            return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="transparent" stroke="' + s.color + '" stroke-width="24" stroke-dasharray="' + dash + '" stroke-dashoffset="' + offset + '"></circle>';
        }).join('');

        var legend = slices.map(function (s, idx) {
            var y = 35 + idx * 28;
            var pct = Math.round(((s.value || 0) / total) * 100);
            return '<g transform="translate(180,' + y + ')">' +
                '<rect width="14" height="14" rx="3" fill="' + s.color + '"/>' +
                '<text x="22" y="11" font-size="12" fill="currentColor">' + s.label + ': ' + s.value + ' (' + pct + '%)</text>' +
                '</g>';
        }).join('');

        var wrap = el('div', null, 'scp-chart-container');
        wrap.innerHTML = '<svg viewBox="0 0 ' + (width || 420) + ' ' + (height || 160) + '" class="scp-svg-chart">' +
            '<g transform="rotate(-90 ' + cx + ' ' + cy + ')">' + circles + '</g>' +
            '<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="18" font-weight="bold" fill="currentColor">' + total + '</text>' +
            legend +
            '</svg>';
        return wrap;
    }

    function createBarChart(bars, width, height, unit) {
        width = width || 500; height = height || 190;
        var maxVal = Math.max.apply(null, bars.map(function (b) { return (b.value || 0) + (b.secondary || 0); }));
        if (maxVal <= 0) maxVal = 1;
        var pad = 40, bottom = height - 32;
        var barWidth = Math.floor((width - pad * 2) / bars.length) - 18;

        var elements = bars.map(function (b, idx) {
            var x = pad + idx * (barWidth + 18) + 9;
            var totalH = Math.round(((b.value + (b.secondary || 0)) / maxVal) * (height - 65));
            var h1 = Math.round((b.value / maxVal) * (height - 65));
            var h2 = totalH - h1;
            var y1 = bottom - h1;
            var y2 = y1 - h2;
            var txtVal = ((b.value + (b.secondary || 0))).toLocaleString() + (unit ? ' ' + unit : '');

            var res = '';
            if (h1 > 0) res += '<rect x="' + x + '" y="' + y1 + '" width="' + barWidth + '" height="' + h1 + '" fill="' + b.color + '" rx="3"/>';
            if (h2 > 0) res += '<rect x="' + x + '" y="' + y2 + '" width="' + barWidth + '" height="' + h2 + '" fill="' + (b.secondaryColor || '#818cf8') + '" rx="3"/>';
            res += '<text x="' + (x + barWidth / 2) + '" y="' + (y2 - 6) + '" font-size="11" font-weight="bold" text-anchor="middle" fill="currentColor">' + txtVal + '</text>';
            res += '<text x="' + (x + barWidth / 2) + '" y="' + (bottom + 18) + '" font-size="11" text-anchor="middle" fill="currentColor">' + b.label + '</text>';
            return res;
        }).join('');

        var wrap = el('div', null, 'scp-chart-container');
        wrap.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" class="scp-svg-chart">' +
            '<line x1="' + pad + '" y1="' + bottom + '" x2="' + (width - pad) + '" y2="' + bottom + '" stroke="currentColor" stroke-opacity="0.25"/>' +
            elements +
            '</svg>';
        return wrap;
    }

    function createSparkline(survival, width, height) {
        width = width || 320; height = height || 75;
        var years = Object.keys(survival || {}).sort();
        if (!years.length) return el('div');
        var pad = 24, bottom = height - 20, top = 16;
        var stepX = (width - pad * 2) / (years.length - 1 || 1);
        var points = years.map(function (y, i) {
            var val = survival[y];
            var x = pad + i * stepX;
            var yPos = bottom - val * (bottom - top);
            return { x: x, y: yPos, val: val, year: y };
        });

        var ptsStr = points.map(function (p) { return p.x + ',' + p.y; }).join(' ');
        var dots = points.map(function (p) {
            var pct = Math.round(p.val * 100) + '%';
            var col = p.val >= 0.7 ? '#1f8a5b' : (p.val >= 0.4 ? '#b07d17' : '#c0392b');
            return '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="' + col + '"/>' +
                '<text x="' + p.x + '" y="' + (p.y - 6) + '" font-size="10" font-weight="bold" text-anchor="middle" fill="' + col + '">' + pct + '</text>' +
                '<text x="' + p.x + '" y="' + (height - 4) + '" font-size="10" text-anchor="middle" fill="currentColor">' + p.year + '</text>';
        }).join('');

        var wrap = el('div', null, 'scp-sparkline-wrap');
        wrap.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" class="scp-svg-chart">' +
            '<polyline fill="none" stroke="#2563eb" stroke-width="2" points="' + ptsStr + '"/>' +
            dots +
            '</svg>';
        return wrap;
    }

    function assessCard(number, label, tone) {
        var card = el('div', null, 'scp-assess-stat' + (tone ? ' scp-assess-stat-' + tone : ''));
        card.appendChild(el('strong', String(number)));
        card.appendChild(el('span', label));
        return card;
    }

    // --- Report View 1: Hospital Fleet Overview ---
    function renderOverview(data, body) {
        var assess = data.assess || { win11: {}, health: {}, forecast: {}, budget: {} };

        // Top 4 stats (matching existing unit tests)
        var stats = el('div', null, 'scp-report-stats');
        stats.appendChild(statCard(data.total, t('computers', 'เครื่องทั้งหมด')));
        stats.appendChild(statCard(data.online, t('online', 'ออนไลน์'), 'ok'));
        stats.appendChild(statCard(data.offline, t('offline', 'ออฟไลน์'), data.offline ? 'off' : ''));
        stats.appendChild(statCard(data.attentionCount, t('need attention', 'ต้องดูแล'), data.attentionCount ? 'warn' : ''));
        body.appendChild(stats);

        // Hardware Assessment Highlight Stats
        var hStats = el('div', null, 'scp-report-stats scp-report-assess-stats');
        hStats.appendChild(assessCard(assess.win11.eligible || 0, t('Win 11 ready', 'พร้อมใช้ Win 11'), 'ok'));
        hStats.appendChild(assessCard(assess.win11.upgradable || 0, t('Win 11 upgradable', 'อัปเกรดเพื่อรองรับ Win 11'), 'warn'));
        hStats.appendChild(assessCard(assess.win11.ineligible || 0, t('Win 11 unsupported', 'ไม่รองรับ Win 11 / ปลดระวาง'), 'off'));
        hStats.appendChild(assessCard((assess.health.averageScore || 0) + ' / 100', t('Average fleet health', 'คะแนนสุขภาพเฉลี่ย'), 'busy'));
        body.appendChild(hStats);

        // SVG Visual Charts Row
        var chartsRow = el('div', null, 'scp-report-charts-grid');

        var c1 = el('div', null, 'scp-report-chart-box');
        c1.appendChild(el('h4', t('Windows 11 Readiness', 'สัดส่วนความพร้อม Windows 11')));
        c1.appendChild(createDonutChart([
            { label: t('Ready', 'พร้อมใช้งาน'), value: assess.win11.eligible || 0, color: '#1f8a5b' },
            { label: t('Upgradable', 'อัปเกรดได้'), value: assess.win11.upgradable || 0, color: '#f59e0b' },
            { label: t('Unsupported', 'ไม่รองรับ'), value: assess.win11.ineligible || 0, color: '#ef4444' }
        ]));
        chartsRow.appendChild(c1);

        var c2 = el('div', null, 'scp-report-chart-box');
        c2.appendChild(el('h4', t('Lifespan & Replacement Timeline', 'ระยะเวลาคงเหลือ / แผนปลดระวาง')));
        c2.appendChild(createBarChart([
            { label: t('Budget FY ' + budgetYearBEOf(assess), 'งบ ' + budgetYearBEOf(assess)), value: assess.forecast.currentYear || 0, color: '#ef4444' },
            { label: t('Next fiscal year', 'ปีงบถัดไป'), value: assess.forecast.nextYear || 0, color: '#f59e0b' },
            { label: t('2-3 Yrs', '2-3 ปี'), value: assess.forecast.year2to3 || 0, color: '#3b82f6' },
            { label: t('4-5 Yrs', '4-5 ปี+'), value: assess.forecast.year4to5 || 0, color: '#10b981' }
        ], 380, 160, t('pcs', 'เครื่อง')));
        chartsRow.appendChild(c2);
        body.appendChild(chartsRow);

        // By department table
        body.appendChild(el('h3', t('By department', 'แยกตามหน่วยงาน')));
        var table = el('table', null, 'scp-report-table');
        var thead = el('thead'), htr = el('tr');
        [t('Department', 'หน่วยงาน'), t('Total', 'ทั้งหมด'), t('Win 11 Ready', 'พร้อม Win 11'), t('Upgradable', 'อัปเกรดได้'), t('Ineligible', 'ไม่รองรับ'), t('Replace this year', 'ต้องเปลี่ยนปีนี้')]
            .forEach(function (h) { htr.appendChild(el('th', h)); });
        thead.appendChild(htr); table.appendChild(thead);
        var tbody = el('tbody');

        var roomKeys = assess.byRoom ? Object.keys(assess.byRoom) : [];
        if (!roomKeys.length) {
            var er = el('tr'); var ec = el('td', t('No computers.', 'ไม่มีเครื่อง')); ec.colSpan = 6; er.appendChild(ec); tbody.appendChild(er);
        } else {
            roomKeys.sort().forEach(function (rName) {
                var rData = assess.byRoom[rName];
                var tr = el('tr');
                tr.appendChild(el('td', rName));
                tr.appendChild(el('td', String(rData.total)));
                tr.appendChild(el('td', String(rData.eligible || 0)));
                tr.appendChild(el('td', String(rData.upgradable || 0)));
                var inel = el('td', String(rData.ineligible || 0)); if (rData.ineligible) inel.className = 'scp-report-off'; tr.appendChild(inel);
                var rep = el('td', String(rData.replaceNow || 0)); if (rData.replaceNow) rep.className = 'scp-report-warn'; tr.appendChild(rep);
                tbody.appendChild(tr);
            });
        }
        table.appendChild(tbody); body.appendChild(table);

        // Needs attention
        body.appendChild(el('h3', t('Needs attention', 'ต้องดูแล') + ' (' + data.attentionCount + ')'));
        if (!data.attention.length) {
            body.appendChild(el('p', t('Nothing needs attention right now.', 'ตอนนี้ไม่มีเรื่องต้องดูแล'), 'scp-report-clear'));
        } else {
            var list = el('ul', null, 'scp-report-list');
            data.attention.forEach(function (node) { list.appendChild(riskLine(node)); });
            body.appendChild(list);
        }

        // Watched computers
        if (data.watched) {
            body.appendChild(el('h3', t('Watched computers', 'เครื่องที่เฝ้าระวัง') + ' (' + data.watched.length + ')'));
            if (!data.watched.length) {
                body.appendChild(el('p', t('No computers are flagged to be watched.', 'ยังไม่ได้ติดธงเฝ้าระวังเครื่องใด'), 'scp-report-clear'));
            } else {
                var wl = el('ul', null, 'scp-report-plain');
                data.watched.forEach(function (node) {
                    var li = el('li');
                    li.appendChild(el('strong', node.name || ''));
                    li.appendChild(el('span', ' · ' + (node.room || '')));
                    li.appendChild(el('span', ' · ' + (node.online ? t('online', 'ออนไลน์') : awayText(node.away)),
                        node.online ? 'scp-report-ok' : 'scp-report-off'));
                    wl.appendChild(li);
                });
                body.appendChild(wl);
            }
        }

        // Offline / away
        body.appendChild(el('h3', t('Offline', 'ออฟไลน์') + ' (' + data.away.length + ')'));
        if (!data.away.length) {
            body.appendChild(el('p', t('Every computer is online.', 'ทุกเครื่องออนไลน์'), 'scp-report-clear'));
        } else {
            var ol = el('ul', null, 'scp-report-plain');
            data.away.forEach(function (node) {
                var li = el('li');
                li.appendChild(el('strong', node.name || ''));
                li.appendChild(el('span', ' · ' + (node.room || '')));
                li.appendChild(el('span', ' · ' + awayText(node.away), 'scp-report-off'));
                ol.appendChild(li);
            });
            body.appendChild(ol);
        }
    }

    // --- Report View 2: By Department / Ward ---
    function renderDepartment(data, body) {
        var assess = data.assess || { byRoom: {} };
        body.appendChild(el('h3', t('Department / Ward Hardware Audit', 'รายงานผลการประเมินแยกตามหน่วยงาน / วอร์ด')));

        var roomKeys = Object.keys(assess.byRoom || {}).sort();
        if (!roomKeys.length) {
            body.appendChild(el('p', t('No department data available.', 'ไม่มีข้อมูลหน่วยงาน'), 'scp-report-clear'));
            return;
        }

        // Chart comparing departments by replacement need
        var topRooms = roomKeys.map(function (k) { return assess.byRoom[k]; })
            .filter(function (r) { return r.replaceNow > 0 || r.upgradable > 0; })
            .sort(function (a, b) { return (b.replaceNow + b.upgradable) - (a.replaceNow + a.upgradable); })
            .slice(0, 6);

        if (topRooms.length) {
            var chartBox = el('div', null, 'scp-report-chart-box');
            chartBox.appendChild(el('h4', t('Departments requiring urgent replacement/upgrade', 'แผนกที่มีความจำเป็นต้องเปลี่ยนหรืออัปเกรดเครื่องสูงสุด')));
            chartBox.appendChild(createBarChart(topRooms.map(function (r) {
                return {
                    label: r.name,
                    value: r.replaceNow || 0,
                    color: '#ef4444',
                    secondary: r.upgradable || 0,
                    secondaryColor: '#f59e0b'
                };
            }), 520, 180, t('pcs', 'เครื่อง')));
            body.appendChild(chartBox);
        }

        roomKeys.forEach(function (rName) {
            var r = assess.byRoom[rName];
            var sec = el('div', null, 'scp-report-dept-sec');
            var h = el('div', null, 'scp-report-dept-head');
            h.appendChild(el('h4', rName));
            h.appendChild(el('span', t('Total: ', 'จำนวน: ') + r.total + ' ' + t('devices', 'เครื่อง') +
                ' · ' + t('Replace: ', 'ต้องเปลี่ยน: ') + (r.replaceNow || 0) +
                ' · ' + t('Upgrade: ', 'อัปเกรด: ') + (r.upgradable || 0) +
                ' · ' + t('Ready: ', 'พร้อม: ') + (r.eligible || 0)));
            sec.appendChild(h);

            var tbl = el('table', null, 'scp-report-table');
            var thd = el('thead'), trh = el('tr');
            [t('Computer', 'ชื่อเครื่อง'), t('OS', 'ระบบปฏิบัติการ'), t('CPU', 'ซีพียู'), t('RAM', 'แรม'), t('Disk', 'ดิสก์'), t('Win 11 Status', 'สถานะ Win 11'), t('Health', 'คะแนนสุขภาพ'), t('Recommendation', 'ข้อเสนอแนะ')]
                .forEach(function (hdr) { trh.appendChild(el('th', hdr)); });
            thd.appendChild(trh); tbl.appendChild(thd);
            var tb = el('tbody');

            (r.devices || []).forEach(function (dev) {
                var row = el('tr');
                row.appendChild(el('td', dev.name));
                row.appendChild(el('td', (dev.os || '').replace('Microsoft ', '')));
                row.appendChild(el('td', dev.cpu || '-'));
                row.appendChild(el('td', dev.ramGb ? dev.ramGb + ' GB' : '-'));
                row.appendChild(el('td', dev.diskHasSsd ? 'SSD' : 'HDD'));

                var wTd = el('td');
                var wBadge = el('span', (dev.win11Status === 'eligible' || dev.win11Status === 'already_win11') ? t('Eligible', 'พร้อมใช้งาน') : (dev.win11Status === 'upgradable' ? t('Upgradable', 'อัปเกรดได้') : t('Ineligible', 'ไม่รองรับ')),
                    'scp-badge-' + dev.win11Status);
                wTd.appendChild(wBadge);
                row.appendChild(wTd);

                var hTd = el('td', dev.healthScore + '/100', 'scp-health-' + dev.healthStatus);
                row.appendChild(hTd);

                var recTd = el('td', dev.recommendation === 'replace' ? t('Replace', 'ควรจัดซื้อใหม่') : (dev.recommendation === 'upgrade' ? t('Upgrade (SSD/RAM)', 'อัปเกรด RAM/SSD') : t('Keep', 'ใช้งานต่อได้')));
                row.appendChild(recTd);
                tb.appendChild(row);
            });
            tbl.appendChild(tb);
            sec.appendChild(tbl);
            body.appendChild(sec);
        });
    }

    // --- Report View 3: Individual Device Fact Sheet ---
    function renderDeviceFactSheet(data, body, device) {
        var assess = data.assess || { devices: [] };
        var devicesList = assess.devices || [];

        var picker = el('div', null, 'scp-report-device-picker');
        picker.appendChild(el('label', t('Select computer: ', 'เลือกเครื่องคอมพิวเตอร์: ')));
        var sel = el('select');
        devicesList.forEach(function (d) {
            var opt = el('option', d.name + ' (' + (d.room || 'General') + ')');
            opt.value = d.nodeid;
            sel.appendChild(opt);
        });
        if (selectedDeviceId) sel.value = selectedDeviceId;
        else if (devicesList[0]) selectedDeviceId = devicesList[0].nodeid;

        sel.onchange = function () {
            selectedDeviceId = sel.value;
            draw();
        };
        picker.appendChild(sel);
        if (!device) body.appendChild(picker);

        var cur = device || devicesList.find(function (d) { return d.nodeid === selectedDeviceId; }) || devicesList[0];
        if (!cur) {
            body.appendChild(el('p', t('No device selected.', 'ยังไม่ได้เลือกเครื่อง'), 'scp-report-clear'));
            return;
        }

        var asset = (window.ScpCachedAssets && window.ScpCachedAssets[cur.nodeid]) || {};
        var details = cur.reportDetails || {};
        var assetNo = asset.assetNumber || cur.assetNumber || '';
        var fy = asset.fiscalYear || cur.fiscalYear;
        var pr = asset.price != null ? asset.price : cur.purchasePrice;

        var sheet = el('div', null, 'scp-device-sheet');
        var head = el('div', null, 'scp-device-sheet-head');
        head.appendChild(el('h3', cur.name + (assetNo ? (' (เลขครุภัณฑ์: ' + assetNo + ')') : '')));
        var subText = cur.room + ' · ' + (cur.os || '');
        if (fy) subText += ' · ' + t('Fiscal Year: B.E. ', 'ปีงบประมาณ: พ.ศ. ') + fy;
        if (pr) subText += ' · ' + t('Purchase Price: ', 'ราคาจัดซื้อ: ') + Number(pr).toLocaleString('th-TH') + ' ' + t('THB', 'บาท');
        head.appendChild(el('span', subText));
        sheet.appendChild(head);

        var specGrid = el('div', null, 'scp-device-spec-grid');

        function addSpec(label, val, note) {
            var b = el('div', null, 'scp-device-spec-item');
            b.appendChild(el('strong', label));
            b.appendChild(el('p', val || '-'));
            if (note) b.appendChild(el('small', note));
            specGrid.appendChild(b);
        }

        addSpec(t('Asset Tag & Procurement', 'เลขครุภัณฑ์และปีงบจัดซื้อ'), assetNo || t('Not specified', 'ยังไม่ระบุเลขครุภัณฑ์'), (fy ? (t('B.E. ', 'พ.ศ. ') + fy) : '') + (pr ? (' · ' + Number(pr).toLocaleString('th-TH') + ' ' + t('THB', 'บาท')) : ''));
        addSpec(t('Processor (CPU)', 'หน่วยประมวลผล (CPU)'), cur.cpu, cur.cpuEval ? cur.cpuEval.reason : '');
        var recommendedRam = (assess.criteria && assess.criteria.recommendedRamGb) || 8;
        addSpec(t('System Memory (RAM)', 'หน่วยความจำ (RAM)'), cur.ramGb ? cur.ramGb + ' GB' : t('Unknown', 'ไม่ทราบ'), t('Recommended ', 'แนะนำ ') + recommendedRam + ' GB');
        var freePct = cur.cFreePercent == null ? cur.cDriveFreePct : cur.cFreePercent;
        addSpec(t('Storage Drive', 'ฮาร์ดดิสก์ / พื้นที่จัดเก็บ'), ((cur.diskHasSsd || cur.hasSsd) ? 'SSD ความเร็วสูง' : 'HDD จานหมุน (ควรเปลี่ยน)'), freePct == null ? '' : 'พื้นที่ C: เหลือ ' + freePct + '%');
        addSpec(t('Motherboard & BIOS', 'ระบบไบออส / เฟิร์มแวร์'), cur.biosMode || t('Unknown', 'ไม่ทราบ'), 'ปีที่จัดซื้อ/ผลิต: ' + (fy ? ('พ.ศ. ' + fy) : (cur.biosYear ? ('พ.ศ. ' + (cur.biosYear + 543)) : 'ไม่ระบุ')) + (cur.ageYears == null ? '' : ' (อายุ ' + cur.ageYears + ' ปี)'));
        addSpec(t('TPM Security Module', 'ระบบความปลอดภัย TPM'), cur.hasTpm2 ? 'TPM 2.0 พร้อมใช้งาน' : 'ไม่พบ TPM 2.0');
        addSpec(t('Windows 11 Compatibility', 'ความพร้อม Windows 11'), (cur.win11Status === 'eligible' || cur.win11Status === 'already_win11') ? 'พร้อมใช้งาน (Eligible)' : (cur.win11Status === 'upgradable' ? 'สามารถอัปเกรดได้' : 'ไม่ผ่านเกณฑ์ (Ineligible)'));
        if (cur.replacementPrice) addSpec(t('Replacement budget / category', 'ราคาซื้อทดแทน / ประเภทงาน'), cur.replacementPrice.price.toLocaleString() + ' บาท', (cur.replacementPrice.label || '') + ' · งบ ' + cur.replacementBudgetYearBE + (cur.replacementPrice.draft ? ' · ฉบับร่าง หน้า ' + cur.replacementPrice.page : ''));
        addSpec(t('Operating system', 'ระบบปฏิบัติการ'), cur.os || cur.osCaption);
        addSpec(t('Device type / model', 'ชนิดเครื่อง / รุ่น'), ({ desktop: 'PC', aio: 'All-in-One', notebook: 'Notebook' })[cur.deviceClass] || '-', cur.modelName || '');
        if (details.ip || details.host) addSpec(t('IP / hostname', 'IP / ชื่อโฮสต์'), details.ip || '-', details.host);
        if (details.online !== undefined) addSpec(t('Connection / user', 'การเชื่อมต่อ / ผู้ใช้งาน'), details.online ? t('Online', 'ออนไลน์') : t('Offline', 'ออฟไลน์'), details.user || t('No user reported', 'ไม่มีข้อมูลผู้ใช้งาน'));
        if (cur.driveModels && cur.driveModels.length) addSpec(t('Drive models', 'รุ่นดิสก์'), cur.driveModels.join(' / '));
        if (cur.cTotalGb) addSpec(t('C: capacity / free', 'ความจุ / พื้นที่ว่างไดรฟ์ C:'), cur.cTotalGb + ' GB / ' + (cur.cFreeGb || 0) + ' GB', (cur.cFreePercent == null ? cur.cDriveFreePct : cur.cFreePercent) + '% ' + t('free', 'ว่าง'));
        if (details.windowsLicense) addSpec(t('Windows activation', 'สิทธิ์ Windows / Activate'), details.windowsLicense);
        if (details.officeLicense) addSpec(t('Microsoft Office licence', 'สิทธิ์ Microsoft Office'), details.officeLicense);
        if (cur.acquiredYearBE) addSpec(t('Acquisition year / source', 'ปีจัดซื้อหรือปีประมาณ / ที่มา'), 'พ.ศ. ' + cur.acquiredYearBE, ({ asset: t('Asset record', 'ทะเบียนครุภัณฑ์'), cpu: t('Estimated from CPU', 'ประมาณจากรุ่น CPU'), bios: t('Estimated from BIOS', 'ประมาณจาก BIOS') })[cur.yearSource] || '');
        if (cur.costBasis != null) addSpec(t('Cost basis', 'มูลค่าตั้งต้น'), Number(cur.costBasis).toLocaleString() + ' บาท', cur.costSource === 'asset' ? t('Purchase price', 'ราคาจัดซื้อ') : t('Configured reference price', 'ราคากลางที่ตั้งไว้'));
        if (cur.bookValue != null) addSpec(t('Book value / depreciation', 'มูลค่าคงเหลือ / ค่าเสื่อมสะสม'), Number(cur.bookValue).toLocaleString() + ' / ' + Number(cur.depreciation || 0).toLocaleString() + ' บาท', (cur.depreciationPercent || 0) + '% · ' + t('Useful life ', 'อายุค่าเสื่อม ') + (cur.usefulLifeYears || '-') + t(' years', ' ปี'));
        if (cur.assetNote || asset.note) addSpec(t('Asset note', 'หมายเหตุครุภัณฑ์'), asset.note || cur.assetNote);

        sheet.appendChild(specGrid);

        // Evaluation Summary Box
        var evalBox = el('div', null, 'scp-device-eval-box');
        evalBox.appendChild(el('h4', t('Health Score & Lifespan Prognosis', 'คะแนนสุขภาพและการประเมินอายุการใช้งาน')));

        var scoreBar = el('div', null, 'scp-health-bar-wrap');
        var scoreFill = el('div', null, 'scp-health-bar-fill scp-fill-' + cur.healthStatus);
        scoreFill.style.width = cur.healthScore + '%';
        scoreBar.appendChild(scoreFill);
        evalBox.appendChild(scoreBar);
        evalBox.appendChild(el('p', t('Health Score: ', 'คะแนนสุขภาพ: ') + cur.healthScore + ' / 100 (' + cur.healthStatus.toUpperCase() + ')'));

        var repIns = cur.insight || (window.ScpFleetAssess && window.ScpFleetAssess.getDeviceInsight && window.ScpFleetAssess.getDeviceInsight(cur));
        if (repIns && (repIns.what || repIns.why)) {
            var bannerCls = 'scp-bulb-banner' + ((cur.win11Status === 'eligible' || cur.win11Status === 'already_win11') ? ' scp-bulb-banner-good' : (cur.win11Status === 'upgradable' ? ' scp-bulb-banner-warn' : ' scp-bulb-banner-danger'));
            var bulbBanner = el('div', null, bannerCls);
            var bIcon = el('span', '💡', null);
            bIcon.style.fontSize = '18px';
            bIcon.style.lineHeight = '1';
            bulbBanner.appendChild(bIcon);
            var bBody = el('div', null, null);
            bBody.appendChild(el('strong', repIns.what || t('Hardware Insight', 'วิเคราะห์เครื่องและสาเหตุ')));
            bBody.appendChild(el('div', repIns.why || ''));
            bulbBanner.appendChild(bBody);
            evalBox.appendChild(bulbBanner);
        }

        if (cur.win11Blockers && cur.win11Blockers.length) {
            evalBox.appendChild(el('h5', t('Windows 11 Blockers:', 'ข้อจำกัดสำหรับ Windows 11:')));
            var bUl = el('ul', null, 'scp-report-reasons');
            cur.win11Blockers.forEach(function (bTxt) { bUl.appendChild(el('li', bTxt, 'scp-report-r-high')); });
            evalBox.appendChild(bUl);
        }

        if (cur.upgradeActions && cur.upgradeActions.length) {
            evalBox.appendChild(el('h5', t('Upgrade Advice:', 'คำแนะนำในการปรับปรุง:')));
            var aUl = el('ul', null, 'scp-report-reasons');
            cur.upgradeActions.forEach(function (action) { aUl.appendChild(el('li', typeof action === 'string' ? action : action.note, 'scp-report-r-warn')); });
            evalBox.appendChild(aUl);
        }
        if (details.risks && details.risks.length) {
            evalBox.appendChild(el('h5', t('Other issues reported:', 'ประเด็นที่ระบบตรวจพบเพิ่มเติม:')));
            var risks = el('ul', null, 'scp-report-reasons');
            details.risks.forEach(function (risk) { risks.appendChild(el('li', risk)); });
            evalBox.appendChild(risks);
        }

        // Survival curve sparkline
        evalBox.appendChild(el('h5', t('1-5 Year Survival Probability Forecast:', 'โอกาสใช้งานได้ต่อเนื่อง 1–5 ปี ข้างหน้า:')));
        evalBox.appendChild(createSparkline(cur.survival, 360, 80));

        var planYear = cur.replacementYear || cur.replaceByYear;
        var planYearText = planYear ? String(thai ? Number(planYear) + 543 : planYear) : '-';
        var budgetYearText = String(thai ? budgetYearBEOf(assess) : budgetYearBEOf(assess) - 543);
        var recMsg = cur.recommendation === 'replace'
            ? t('Recommended: Plan replacement in FY ', 'ข้อเสนอแนะ: วางแผนจัดซื้อเครื่องใหม่ในปีงบประมาณ ') + planYearText + ' (ประมาณการงบ ~' + (cur.estimatedCost || 18000).toLocaleString() + ' บาท)'
            : (cur.recommendation === 'upgrade'
                ? t('Recommended: Upgrade hardware in FY ' + budgetYearText + ' for ~', 'ข้อเสนอแนะ: อัปเกรดเครื่องเดิมในปีงบประมาณ ' + budgetYearText + ' งบประมาณ ~') + (cur.upgradeCost || cur.estimatedCost || 0).toLocaleString() + t(' THB · expected replacement around FY ', ' บาท · คาดว่าจะต้องเปลี่ยนเครื่องใหม่ราวปีงบประมาณ ') + planYearText
                : t('Recommended: Maintain this device. Expected replacement around FY ', 'ข้อเสนอแนะ: ใช้งานและดูแลเครื่องเดิม คาดว่าจะต้องเปลี่ยนเครื่องใหม่ราวปีงบประมาณ ') + planYearText);

        evalBox.appendChild(el('div', recMsg, 'scp-device-rec-callout scp-rec-' + cur.recommendation));
        sheet.appendChild(evalBox);

        body.appendChild(sheet);
    }

    // --- Report View 4: 5-Year Budget Forecast ---
    function renderBudgetForecast(data, body) {
        var assess = data.assess || { budget: {}, forecast: {}, criteria: {} };
        var b = assess.budget || {};
        var currentYear = budgetYearBEOf(assess) - 543;

        body.appendChild(el('h3', t('Multi-Year IT Hardware Budget & Upgrade Forecast', 'แผนงบประมาณและประมาณการค่าใช้จ่ายครุภัณฑ์คอมพิวเตอร์ 1-5 ปี')));
        if (assess.criteria && assess.criteria.useReferencePricesForReplacement && assess.budgetYearBE === 2570) body.appendChild(el('p', t('FY 2570 planning prices are from the supplied draft, whose publication date is blank. Replacement costs follow the selected device type / workload category.', 'ราคางบ 2570 อ้างอิงฉบับร่างที่แนบ ซึ่งยังเว้นวันที่ประกาศไว้ ราคาซื้อทดแทนใช้ชนิดเครื่องและประเภทงานที่เลือกในเกณฑ์ประเมิน')));
        body.appendChild(el('p', t('Projections based on device age, Windows 11 end-of-life compatibility, and hardware degradation modeling.', 'คำนวณจากอายุเครื่อง สภาพฮาร์ดแวร์ การสิ้นสุดระยะสนับสนุน Windows 10 และเกณฑ์มาตรฐานของโรงพยาบาล')));

        // Budget summary cards
        var stats = el('div', null, 'scp-report-stats');
        stats.appendChild(statCard((b.currentYear ? b.currentYear.total : 0).toLocaleString() + ' ฿', t('This year budget (' + currentYear + ')', 'งบประมาณปีนี้ (' + (currentYear + 543) + ')'), 'warn'));
        stats.appendChild(statCard((b.nextYear ? b.nextYear.total : 0).toLocaleString() + ' ฿', t('Next year budget (' + (currentYear + 1) + ')', 'งบประมาณปีหน้า (' + (currentYear + 544) + ')'), 'idle'));
        stats.appendChild(statCard((b.fiveYearTotal || 0).toLocaleString() + ' ฿', t('5-Year Total Budget', 'งบประมาณรวม 5 ปี'), 'ok'));
        body.appendChild(stats);

        // Budget SVG Bar Chart
        var chartBox = el('div', null, 'scp-report-chart-box');
        chartBox.appendChild(el('h4', t('Yearly Budget Allocation (THB)', 'ประมาณการงบประมาณรายปี (บาท)')));
        chartBox.appendChild(createBarChart([
            { label: String(currentYear + 543), value: (b.currentYear ? (b.currentYear.replace || b.currentYear.total || 0) : 0), color: '#ef4444', secondary: (b.currentYear ? b.currentYear.upgrade : 0), secondaryColor: '#f59e0b' },
            { label: String(currentYear + 544), value: (b.nextYear ? (b.nextYear.replace || b.nextYear.total || 0) : 0), color: '#3b82f6' },
            { label: (currentYear + 545) + '-' + (currentYear + 546), value: (b.year2to3 ? (b.year2to3.replace || b.year2to3.total || 0) : 0), color: '#6366f1' },
            { label: (currentYear + 547) + '-' + (currentYear + 548), value: (b.year4to5 ? (b.year4to5.replace || b.year4to5.total || 0) : 0), color: '#10b981' }
        ], 520, 190, '฿'));
        body.appendChild(chartBox);

        // Detailed Budget Table
        var table = el('table', null, 'scp-report-table');
        var thead = el('thead'), htr = el('tr');
        [t('Budget Year', 'ปีงบประมาณ'), t('Replace Devices', 'จัดซื้อเครื่องใหม่ (เครื่อง)'), t('Replacement Budget', 'งบจัดซื้อใหม่ (บาท)'), t('Upgrade Devices', 'อัปเกรด SSD/RAM (เครื่อง)'), t('Upgrade Budget', 'งบอัปเกรด (บาท)'), t('Total Budget', 'รวมงบประมาณ (บาท)')]
            .forEach(function (h) { htr.appendChild(el('th', h)); });
        thead.appendChild(htr); table.appendChild(thead);
        var tbody = el('tbody');

        function addBudgetRow(label, repCount, repCost, upgCount, upgCost, totCost) {
            var tr = el('tr');
            tr.appendChild(el('td', label));
            tr.appendChild(el('td', String(repCount)));
            tr.appendChild(el('td', (repCost || 0).toLocaleString() + ' ฿'));
            tr.appendChild(el('td', String(upgCount)));
            tr.appendChild(el('td', (upgCost || 0).toLocaleString() + ' ฿'));
            var totTd = el('td', (totCost || 0).toLocaleString() + ' ฿');
            totTd.className = 'scp-report-warn';
            tr.appendChild(totTd);
            tbody.appendChild(tr);
        }

        var f = assess.forecast || {};
        var upgTotalCount = (assess.devices || []).filter(function (d) { return d.recommendation === 'upgrade'; }).length;

        addBudgetRow(t('Year ' + currentYear, 'ปี ' + (currentYear + 543) + ' (ปีนี้)'), f.currentYear || 0, (b.currentYear ? b.currentYear.replace : 0), upgTotalCount, (b.currentYear ? b.currentYear.upgrade : 0), (b.currentYear ? b.currentYear.total : 0));
        addBudgetRow(t('Year ' + (currentYear + 1), 'ปี ' + (currentYear + 544) + ' (ปีหน้า)'), f.nextYear || 0, (b.nextYear ? b.nextYear.replace : 0), 0, 0, (b.nextYear ? b.nextYear.total : 0));
        addBudgetRow(t('Years ' + (currentYear + 2) + '-' + (currentYear + 3), 'ปี ' + (currentYear + 545) + '-' + (currentYear + 546)), f.year2to3 || 0, (b.year2to3 ? b.year2to3.replace : 0), 0, 0, (b.year2to3 ? b.year2to3.total : 0));
        addBudgetRow(t('Years ' + (currentYear + 4) + '-' + (currentYear + 5), 'ปี ' + (currentYear + 547) + '-' + (currentYear + 548)), f.year4to5 || 0, (b.year4to5 ? b.year4to5.replace : 0), 0, 0, (b.year4to5 ? b.year4to5.total : 0));

        table.appendChild(tbody);
        body.appendChild(table);

        // List of urgent machines to be replaced this year
        var urgentDevices = (assess.devices || []).filter(function (d) { return d.replacementYear <= currentYear; });
        if (urgentDevices.length) {
            body.appendChild(el('h4', t('Urgent devices scheduled for replacement this year (' + urgentDevices.length + ')', 'รายชื่อเครื่องที่มีความจำเป็นต้องเปลี่ยนในปีนี้ (' + urgentDevices.length + ' เครื่อง)')));
            var ul = el('ul', null, 'scp-report-plain');
            urgentDevices.forEach(function (d) {
                var li = el('li');
                li.appendChild(el('strong', d.name));
                li.appendChild(el('span', ' · ' + d.room + ' · ' + (d.os || '') + ' · ' + (d.cpu || '')));
                li.appendChild(el('span', ' · ' + (d.win11Blockers[0] || 'เครื่องเก่า/ไม่รองรับ'), 'scp-report-off'));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
    }

    // Main body builder dispatching to active mode
    function buildBody(data) {
        var body = el('div', null, 'scp-report-body');

        // Navigation bar for switching among the 4 reports
        var nav = el('nav', null, 'scp-report-nav');
        [
            ['overview', t('Fleet Overview', 'ภาพรวมทั้ง รพ.')],
            ['department', t('By Department', 'แยกตามแผนก/วอร์ด')],
            ['device', t('Device Fact Sheet', 'ใบประเมินรายเครื่อง')],
            ['budget', t('5-Year Budget', 'แผนงบประมาณ 5 ปี')]
        ].forEach(function (item) {
            var b = button(item[1], 'scp-report-tab' + (currentReportMode === item[0] ? ' active' : ''), function () {
                currentReportMode = item[0];
                draw();
            });
            nav.appendChild(b);
        });
        body.appendChild(nav);

        var when = el('p', t('Generated ', 'ออกรายงานเมื่อ ') + whenText(data.at), 'scp-report-when');
        body.appendChild(when);

        if (currentReportMode === 'overview') {
            renderOverview(data, body);
        } else if (currentReportMode === 'department') {
            renderDepartment(data, body);
        } else if (currentReportMode === 'device') {
            renderDeviceFactSheet(data, body);
        } else if (currentReportMode === 'budget') {
            renderBudgetForecast(data, body);
        }

        return body;
    }

    var dialog, bodyBox, lastData = null;

    function draw() {
        if (!bodyBox || !lastData) { return; }
        bodyBox.textContent = '';
        bodyBox.appendChild(buildBody(lastData));
    }

    function printReport() {
        if (!lastData) { return; }
        var printRoot = el('div', null, 'scp-print-root');
        var titles = {
            overview: t('SCP-Remote — Hospital Fleet Overview', 'SCP-Remote — รายงานภาพรวมครุภัณฑ์คอมพิวเตอร์ทั้งโรงพยาบาล'),
            department: t('SCP-Remote — Department / Ward Hardware Audit', 'SCP-Remote — รายงานการประเมินสภาพเครื่องแยกตามหน่วยงาน'),
            device: t('SCP-Remote — Device Assessment Fact Sheet', 'SCP-Remote — ใบรายงานผลการประเมินสภาพเครื่องรายบุคคล'),
            budget: t('SCP-Remote — 5-Year Hardware Budget Forecast', 'SCP-Remote — แผนประมาณการงบประมาณจัดซื้อและอัปเกรด 1-5 ปี')
        };
        var title = el('h1', titles[currentReportMode] || titles.overview, 'scp-report-title');
        printRoot.appendChild(title);
        printRoot.appendChild(buildBody(lastData));
        printContent(printRoot);
    }

    function printContent(printRoot) {
        document.body.appendChild(printRoot);
        document.documentElement.classList.add('scp-printing');
        var cleaned = false;
        function clean() {
            if (cleaned) { return; } cleaned = true;
            document.documentElement.classList.remove('scp-printing');
            if (printRoot.parentNode) { printRoot.parentNode.removeChild(printRoot); }
            root.removeEventListener('afterprint', clean);
        }
        root.addEventListener('afterprint', clean);
        root.setTimeout(clean, 60000);
        try { root.print(); } catch (error) { clean(); }
    }

    function printAssessment(devices, options) {
        if (!Array.isArray(devices) || !devices.length) return;
        options = options || {};
        var printRoot = el('div', null, 'scp-print-root scp-assessment-report');
        var data = { assess: { devices: devices, criteria: options.criteria || {} } };
        devices.forEach(function (device) { renderDeviceFactSheet(data, printRoot, device); });
        printContent(printRoot);
    }

    function refresh() {
        var snap = (root.ScpDashboard && root.ScpDashboard.snapshot) ? root.ScpDashboard.snapshot() : { nodes: [], groups: [] };
        var watchedIds;
        var render = function () { lastData = summarize(snap, watchedIds); draw(); };
        if (root.ScpOperations && root.ScpOperations.request) {
            root.ScpOperations.request('alertWatch').then(function (ids) {
                watchedIds = Array.isArray(ids) ? ids : [];
                render();
            }).catch(function () { render(); });
        }
        render();
    }

    function close() {
        if (dialog) {
            try { dialog.close(); } catch (e) {}
            dialog.removeAttribute('open');
        }
    }

    function open(mode, deviceId) {
        if (mode) currentReportMode = mode;
        if (deviceId) selectedDeviceId = deviceId;
        if (!dialog) {
            dialog = el('dialog'); dialog.id = 'scpReport';
            var head = el('header');
            head.appendChild(el('h2', t('Hardware Assessment & Fleet Report', 'รายงานและประเมินสภาพคอมพิวเตอร์')));
            head.appendChild(button(t('Print / Save PDF', 'พิมพ์ / บันทึก PDF'), 'scp-report-print-btn', printReport));
            head.appendChild(button(t('Refresh', 'รีเฟรช'), '', refresh));
            head.appendChild(button(t('Close', 'ปิด'), '', function () { close(); }));
            dialog.appendChild(head);
            bodyBox = el('div', null, 'scp-report-scroll');
            dialog.appendChild(bodyBox);
            document.body.appendChild(dialog);

            dialog.addEventListener('click', function (e) {
                if (e.target === dialog) { close(); }
            });
            dialog.addEventListener('cancel', function (e) {
                e.preventDefault();
                close();
            });
        }
        if (!dialog.open) { dialog.showModal(); }
        refresh();
    }

    root.ScpReport = {
        open: open,
        close: close,
        printAssessment: printAssessment,
        summarize: summarize,
        _buildBody: buildBody,
        createBarChart: createBarChart,
        createDonutChart: createDonutChart,
        setMode: function (m) { currentReportMode = m; draw(); }
    };
}(typeof window === 'undefined' ? globalThis : window));
