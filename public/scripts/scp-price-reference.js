/* User-supplied draft reference prices, assigned to FY 2570 by the administrator.
   The PDF leaves its publication month/date blank. These are planning prices. */
(function (root) {
    'use strict';
    var catalog = [
        { id: 'desktop-office', type: 'desktop', label: 'PC งานสำนักงาน (จอ 23 นิ้ว)', price: 26000, item: 4, page: 4 },
        { id: 'desktop-processing-1', type: 'desktop', label: 'PC งานประมวลผล แบบที่ 1 (จอ 23 นิ้ว)', price: 30000, item: 5, page: 5 },
        { id: 'desktop-processing-2', type: 'desktop', label: 'PC งานประมวลผล แบบที่ 2 (จอ 27 นิ้ว)', price: 37000, item: 6, page: 5 },
        { id: 'aio-office', type: 'aio', label: 'All-in-One งานสำนักงาน', price: 25000, item: 7, page: 6 },
        { id: 'aio-processing', type: 'aio', label: 'All-in-One งานประมวลผล', price: 27000, item: 8, page: 7 },
        { id: 'notebook-office', type: 'notebook', label: 'Notebook งานสำนักงาน', price: 23000, item: 9, page: 7 },
        { id: 'notebook-processing', type: 'notebook', label: 'Notebook งานประมวลผล', price: 26000, item: 10, page: 8 },
        { id: 'notebook-ai', type: 'notebook', label: 'Notebook งานปัญญาประดิษฐ์ (AI)', price: 38000, item: 11, page: 8 }
    ];
    var source = { yearBE: 2570, status: 'draft', name: '(ร่าง) เกณฑ์ราคากลางและคุณลักษณะพื้นฐานการจัดหาอุปกรณ์และระบบคอมพิวเตอร์', date: null };
    /* Office-grade reference prices by Buddhist-era year, read from the official MDES/ICT
       editions archived in public/data/reference-prices (catalog.json, built by
       scripts/build-price-archive.py). Keyed by the year an edition was published; a machine
       acquired in a year without its own edition takes the nearest earlier one. 2570 is the
       draft above. Used for book value of existing computers, not for new purchases. */
    var history = {
        desktop: { 2553: 20000, 2555: 15000, 2556: 14000, 2557: 15000, 2558: 16000, 2559: 16000, 2560: 16000, 2561: 16000, 2562: 17000, 2563: 17000, 2564: 17000, 2566: 20000, 2568: 20000, 2569: 23000, 2570: 26000 },
        notebook: { 2553: 23000, 2555: 19000, 2556: 19000, 2557: 18000, 2558: 17000, 2559: 16000, 2560: 16000, 2561: 16000, 2562: 16000, 2563: 16000, 2564: 16000, 2566: 19000, 2568: 19000, 2569: 21000, 2570: 23000 },
        aio: { 2561: 17000, 2562: 17000, 2563: 17000, 2564: 17000, 2566: 20000, 2568: 20000, 2569: 22000, 2570: 25000 }
    };
    var historySources = {"desktop:2553":"ict-2553 p.3 #7","notebook:2553":"ict-2553 p.5 #11","desktop:2555":"ict-2555 p.3 #7","notebook:2555":"ict-2555 p.5 #11","desktop:2556":"mdes-1590 p.3 #7","notebook:2556":"mdes-1590 p.4 #10","desktop:2557":"mdes-1592 p.3 #7","notebook:2557":"mdes-1592 p.4 #10","desktop:2558":"mdes-1593 p.3 #7","notebook:2558":"mdes-1593 p.5 #10","desktop:2559":"mdes-1595 p.4 #7","notebook:2559":"mdes-1595 p.5 #10","desktop:2560":"mdes-1596 p.4 #7","notebook:2560":"mdes-1596 p.6 #10","desktop:2561":"mdes-1597 p.3 #7","aio:2561":"mdes-1597 p.5 #10","notebook:2561":"mdes-1597 p.6 #12","desktop:2562":"mdes-1598 p.3 #7","aio:2562":"mdes-1598 p.5 #10","notebook:2562":"mdes-1598 p.6 #12","desktop:2563":"mdes-2564 p.3 #6","aio:2563":"mdes-2564 p.4 #9","notebook:2563":"mdes-2564 p.5 #11","desktop:2564":"mdes-5121 p.4 #6","aio:2564":"mdes-5121 p.6 #9","notebook:2564":"mdes-5121 p.8 #11","desktop:2566":"mdes-6650 p.4 #6","aio:2566":"mdes-6650 p.5 #9","notebook:2566":"mdes-6650 p.6 #11","desktop:2568":"mdes-10282 p.4 #4","aio:2568":"mdes-10282 p.6 #7","notebook:2568":"mdes-10282 p.7 #9","desktop:2569":"mdes-10933 p.4 #4","aio:2569":"mdes-10933 p.6 #7","notebook:2569":"mdes-10933 p.7 #9"};
    var profiles = { desktop: 'desktop-office', aio: 'aio-office', notebook: 'notebook-office' };
    // Thai government fiscal year (B.E.): it starts on 1 October, so October 2026 is FY 2570.
    function fiscalYearBE(date) {
        var d = date || new Date();
        return d.getFullYear() + (d.getMonth() >= 9 ? 1 : 0) + 543;
    }
    function resolveCriteria(defaults, custom) {
        custom = custom || {};
        var c = Object.assign({}, defaults, custom);
        var partPrices = {};
        Object.keys(parts).forEach(function (k) { partPrices[k] = parts[k].price; });
        c.costs = Object.assign(partPrices, defaults.costs, custom.costs);
        c.weights = Object.assign({}, defaults.weights, custom.weights);
        // Plans count from the budget year: one the administrator saved, else the current fiscal
        // year. A saved year that has already passed is stale (saved last year), so it moves on.
        var thisFY = fiscalYearBE();
        c.budgetYearBE = Number(custom.budgetYearBE || thisFY);
        if (!Number.isInteger(c.budgetYearBE) || c.budgetYearBE < thisFY || c.budgetYearBE > 2700) c.budgetYearBE = thisFY;
        c.useReferencePricesForReplacement = custom.useReferencePricesForReplacement !== false;
        c.replacementProfiles = Object.assign({}, profiles, custom.replacementProfiles);
        c.referencePrices = {};
        ['desktop', 'aio', 'notebook'].forEach(function (cls) {
            c.referencePrices[cls] = Object.assign({}, (defaults.referencePrices || {})[cls], (custom.referencePrices || {})[cls]);
            if (!catalog.some(function (p) { return p.id === c.replacementProfiles[cls] && p.type === cls; })) c.replacementProfiles[cls] = profiles[cls];
        });
        c.priceReferenceSource = source;
        return c;
    }
    function replacementPrice(criteria, cls) {
        cls = profiles[cls] ? cls : 'desktop';
        var profile = catalog.find(function (p) { return p.id === ((criteria.replacementProfiles || profiles)[cls]); });
        if (criteria.useReferencePricesForReplacement !== false) {
            if (criteria.budgetYearBE === 2570 && profile) return { price: profile.price, yearBE: 2570, profile: profile.id, label: profile.label, draft: true, page: profile.page };
            var price = Number((criteria.referencePrices[cls] || {})[criteria.budgetYearBE]);
            if (price > 0) return { price: price, yearBE: criteria.budgetYearBE, draft: false };
        }
        return { price: Number(criteria.costs.newDevice) || 26000, yearBE: criteria.budgetYearBE, draft: false, label: 'ราคาประมาณที่ตั้งเอง' };
    }
    /* Spare parts. Only the UPS has a government reference price (MDES lists it as equipment);
       RAM, SSD, CPU, fans and BIOS batteries are supplies with no MDES price, so these are
       market estimates the administrator can change on the criteria screen. */
    var parts = {
        ramUpgrade: { price: 1200, label: 'RAM 8 GB (DDR4)', source: 'ราคาตลาดโดยประมาณ' },
        ssdUpgrade: { price: 1500, label: 'SSD 512 GB (SATA)', source: 'ราคาตลาดโดยประมาณ' },
        cpuUpgrade: { price: 3500, label: 'CPU (รุ่นที่ใส่แทนได้ใน socket เดิม)', source: 'ราคาตลาดโดยประมาณ' },
        upsUnit: { price: 2500, label: 'เครื่องสำรองไฟฟ้า (UPS) 800 VA', source: 'ราคากลาง MDES ฉบับ ธ.ค. 2568 หน้า 28' },
        fanUnit: { price: 350, label: 'พัดลมระบายความร้อน CPU + ซิลิโคน', source: 'ราคาตลาดโดยประมาณ' },
        cmosBattery: { price: 50, label: 'ถ่าน BIOS (CR2032)', source: 'ราคาตลาดโดยประมาณ' }
    };

    // The disk Windows runs from, from what the computer reported when checked.
    function systemDiskOf(probe) {
        var disks = (probe && Array.isArray(probe.disks)) ? probe.disks : [];
        if (!disks.length) return null;
        for (var i = 0; i < disks.length; i++) if (disks[i] && disks[i].system) return disks[i];
        return disks[0];
    }

    // Parts a computer needs, judged from the read-only check: a failing disk, a flat BIOS
    // battery (clock reset to an old year at boot), heat throttling (fan), and no UPS on USB.
    // The UPS is optional: a UPS without a USB cable cannot be seen from Windows.
    function maintenanceFor(probe, deviceClass, costs) {
        var out = [];
        if (!probe) return out;
        var cost = function (key) { return Number((costs || {})[key]) || parts[key].price; };
        var disk = systemDiskOf(probe);
        if (disk && disk.health && !/^Healthy$/i.test(disk.health) && !/^$|Unknown/i.test(disk.health)) {
            out.push({ type: 'disk', cost: cost('ssdUpgrade'), urgent: true, note: 'ดิสก์ที่ลง Windows เริ่มเสีย (สถานะ ' + disk.health + ') — สำรองข้อมูลแล้วเปลี่ยนเป็น SSD โดยด่วน' });
        }
        if (Number(probe.cmosResets) > 0) {
            out.push({ type: 'cmos', cost: cost('cmosBattery'), note: 'เปลี่ยนถ่าน BIOS (CR2032) — เวลาเครื่องรีเซ็ตกลับปีเก่าตอนเปิดเครื่อง ' + probe.cmosResets + ' ครั้งใน 6 เดือน' });
        }
        if (Number(probe.throttle) >= 5) {
            out.push({ type: 'fan', cost: cost('fanUnit'), note: 'ทำความสะอาด/เปลี่ยนพัดลม CPU — ซีพียูถูกลดความเร็ว ' + probe.throttle + ' ครั้งใน 30 วัน (มักเกิดจากความร้อน)' });
        }
        if (deviceClass !== 'notebook' && Array.isArray(probe.batteries) && !probe.batteries.length) {
            out.push({ type: 'ups', cost: cost('upsUnit'), optional: true, note: 'ไม่พบ UPS ที่ต่อสาย USB — ถ้ายังไม่มี UPS ควรมี (800 VA ราคากลาง ' + cost('upsUnit').toLocaleString() + ' บาท)' });
        }
        return out;
    }

    var api = { catalog: catalog, fiscalYearBE: fiscalYearBE, source: source, profiles: profiles, history: history, historySources: historySources, parts: parts,
        systemDiskOf: systemDiskOf, maintenanceFor: maintenanceFor, resolveCriteria: resolveCriteria, replacementPrice: replacementPrice };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ScpPriceReference = api;
}(typeof window !== 'undefined' ? window : globalThis));
