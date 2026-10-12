/* SCP-Remote: Client-side hardware assessment and upgrade planning engine.
   Exposes window.ScpFleetAssess for real-time assessment, filtering, and forecast calculations. */
(function (root) {
    'use strict';

    var DEFAULT_CRITERIA = {
        useReferencePricesForReplacement: true,
        replacementProfiles: root.ScpPriceReference.profiles,
        priceReferenceSource: root.ScpPriceReference.source,
        maxAgeYears: 7,
        minRamGb: 4,
        recommendedRamGb: 8,
        requireSsd: true,
        minDiskFreePercent: 15,
        requireWin11: true,
        weights: {
            age: 30,
            cpu: 25,
            ram: 15,
            disk: 15,
            os: 15
        },
        costs: {
            newDevice: 26000,
            ramUpgrade: 1200,
            ssdUpgrade: 1500
        },
        // Same book-value rules as the server (hospital/fleet-assess.js).
        usefulLifeYears: 5,
        // official MDES prices by year (+ the 2570 draft), shared with the browser
        referencePrices: root.ScpPriceReference.history,
        defaultPrice: { desktop: 17000, notebook: 16000 }
    };

    // The year a processor went on sale, from its model name. A computer cannot be older than
    // its processor, and unlike the BIOS date (which moves forward with every BIOS update) the
    // model never changes, so this is the better guess of when a machine was bought.
    function cpuLaunchYear(cpuName) {
        var s = String(cpuName || '');
        if (!s) return null;
        var m;
        // Intel Core Ultra: series 1 (Meteor Lake, Dec 2023), 2 (2024), 3 (2025)
        if ((m = s.match(/Core\s*(?:\(TM\)\s*)?Ultra\s*[3579]\s*(\d)\d{2}/i))) return { 1: 2023, 2: 2024, 3: 2025 }[m[1]] || null;
        var INTEL_GEN = { 1: 2010, 2: 2011, 3: 2012, 4: 2013, 5: 2015, 6: 2015, 7: 2017, 8: 2017, 9: 2018, 10: 2020, 11: 2021, 12: 2022, 13: 2023, 14: 2024 };
        if ((m = s.match(/(\d{1,2})(?:th|st|nd|rd)\s+Gen/i)) && INTEL_GEN[+m[1]]) return INTEL_GEN[+m[1]];
        if ((m = s.match(/\bi[3579]-(\d{3,5})/i))) {
            var num = m[1], gen;
            if (num.length === 5) gen = +num.slice(0, 2);                       // i5-12400, i7-13700
            else if (num.length === 4 && num[0] === '1') gen = +num.slice(0, 2); // i5-1135G7, i5-1235U
            else if (num.length === 4) gen = +num[0];                             // i5-4590, i3-7100
            else gen = 1;                                                         // i5-650
            return INTEL_GEN[gen] || null;
        }
        if (/Core\s*(?:\(TM\)\s*)?2|Pentium\(R\)\s*Dual|Pentium\s*D\b/i.test(s)) return 2008;
        if ((m = s.match(/\bG(\d{4})/i)) && /Pentium|Celeron/i.test(s)) {           // desktop Pentium/Celeron G
            var g = +m[1];
            if (g >= 7000) return 2022; if (g >= 6000) return 2020; if (g >= 5900) return 2020;
            if (g >= 5400) return 2018; if (g >= 4500) return 2017; if (g >= 4400) return 2015;
            if (g >= 3200) return 2014; if (g >= 2000) return 2012; return 2010;
        }
        if ((m = s.match(/\b([JN])(\d{4})\b/))) {                                   // low-power Pentium/Celeron
            var n = +m[2];
            if (n >= 6000) return 2021; if (n >= 5000) return 2017; if (n >= 4100) return 2019;
            if (n >= 4000) return 2017; if (n >= 3000) return 2016; if (n >= 2000) return 2013; return 2013;
        }
        if (/Intel\(R\)\s*N\d{2,3}\b|\bN[12]\d{2}\b/.test(s)) return 2023;          // Intel N100 / N200
        if (/\bAtom\b/i.test(s)) return 2010;
        if ((m = s.match(/Xeon.*E3-12\d\d\s*v(\d)/i))) return { 1: 2011, 2: 2012, 3: 2013, 4: 2015, 5: 2015, 6: 2017 }[m[1]] || null;
        // AMD
        if (/Ryzen\s+AI/i.test(s)) return 2024;
        if ((m = s.match(/Ryzen\s+[3579]\s+(?:PRO\s+)?(\d{3,4})/i))) {
            var r = m[1];
            if (r.length === 3) return 2025;                                        // Ryzen 5 220 (200 series)
            return { 1: 2017, 2: 2018, 3: 2019, 4: 2020, 5: 2021, 6: 2022, 7: 2023, 8: 2024, 9: 2024 }[r[0]] || null;
        }
        if ((m = s.match(/Athlon\s+(?:Silver|Gold)?\s*(\d{4})/i))) return +m[1] >= 7000 ? 2022 : +m[1] >= 3000 ? 2020 : 2018;
        if (/Athlon\s+\d{3}GE/i.test(s)) return 2018;
        if ((m = s.match(/\bA(?:4|6|8|9|10|12)-(\d)\d{3}/i))) return { 5: 2012, 6: 2013, 7: 2015, 9: 2016 }[m[1]] || 2014;
        if (/\bFX-\d{4}/i.test(s)) return 2012;
        if (/\bE[12]-\d{4}/i.test(s)) return 2013;
        if (/Phenom|Athlon\s*(II|64|X2)/i.test(s)) return 2009;
        return null;
    }

    // Laptop processors carry a mobile suffix (U, H, HS, HX, P, Y, or G1-G7 on Ice/Tiger Lake).
    function deviceClassOf(cpuName) {
        var s = String(cpuName || '');
        if (/\bi[3579]-\d{4,5}(U|H|HS|HX|HK|HQ|P|Y|G\d)\b/i.test(s)) return 'notebook';
        if (/Core\s*(?:\(TM\)\s*)?Ultra\s*[3579]\s*\d{3}(U|H|V|HX)\b/i.test(s)) return 'notebook';
        if (/Ryzen\s+[3579]\s+(?:PRO\s+)?\d{4}(U|H|HS|HX)\b/i.test(s)) return 'notebook';
        if (/Athlon\s+(?:Silver|Gold)\s+\d{4}U/i.test(s)) return 'notebook';
        return 'desktop';
    }

    // What kind of computer this is: 'desktop' (PC with a separate screen), 'aio' (All-in-One)
    // or 'notebook'. Best is what the computer itself said when asked (chassis type 13 is
    // All-in-One; a built-in screen on a non-laptop is too); then the model name, which HP and
    // Acer spell out; the CPU's mobile suffix comes last, because All-in-Ones often use laptop
    // processors.
    var AIO_NAME = /all[\s-]?in[\s-]?one|\bAiO\b|ProOne|Aspire\s*C2\d|\bC2[2-7]-\d|IdeaCentre\s*AIO|neo\s*[35]0a|ThinkCentre\s*M\d{2,3}[az]\b|Veriton\s*Z|OptiPlex\s*\d{4}\s*All/i;
    var NOTEBOOK_NAME = /laptop|notebook|ThinkPad|ThinkBook|IdeaPad|Aspire\s*[A3-7]\d{2}|Aspire\s*A\d|Vivobook|Zenbook|Inspiron\s*1[3-6]|Latitude|Vostro\s*1[45]|ProBook|EliteBook|Pavilion\s*(x360|Laptop|\d{2}-)|Swift|TravelMate/i;
    var NOTEBOOK_CHASSIS = [8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32];

    function deviceTypeOf(cpuName, productName, probe) {
        if (probe) {
            var ch = Array.isArray(probe.chassis) ? probe.chassis.map(Number) : [];
            var named = [probe.model, probe.system, probe.name].join(' ');
            if (ch.indexOf(13) >= 0 || AIO_NAME.test(named)) return { type: 'aio', source: 'probe' };
            if (ch.some(function (c) { return NOTEBOOK_CHASSIS.indexOf(c) >= 0; }) || Number(probe.pcType) === 2 || NOTEBOOK_NAME.test(named)) return { type: 'notebook', source: 'probe' };
            if (Number(probe.internal) > 0) return { type: 'aio', source: 'probe' };
            return { type: 'desktop', source: 'probe' };
        }
        var name = String(productName || '');
        if (AIO_NAME.test(name)) return { type: 'aio', source: 'model' };
        if (NOTEBOOK_NAME.test(name)) return { type: 'notebook', source: 'model' };
        if (deviceClassOf(cpuName) === 'notebook') return { type: 'notebook', source: 'cpu' };
        return { type: 'desktop', source: 'guess' };
    }

    // Government reference price for that class of computer in that Buddhist-era year: the
    // exact year if listed, else the nearest earlier year, else the nearest later, else a default.
    function referencePrice(criteria, cls, yearBE) {
        var table = (criteria.referencePrices && criteria.referencePrices[cls]) || {};
        // No All-in-One prices entered yet: price it as a desktop PC of that year.
        if (cls === 'aio' && !Object.keys(table).some(function (y) { return table[y] > 0 && Number(y) <= yearBE; })) return referencePrice(criteria, 'desktop', yearBE);
        var years = Object.keys(table).map(Number).filter(function (y) { return table[y] > 0; }).sort(function (a, b) { return a - b; });
        if (yearBE && table[yearBE] > 0) return { price: Number(table[yearBE]), year: yearBE };
        var before = years.filter(function (y) { return y <= yearBE; }).pop();
        if (before) return { price: Number(table[before]), year: before };
        if (years.length) return { price: Number(table[years[0]]), year: years[0] };
        var fallback = (criteria.defaultPrice && criteria.defaultPrice[cls]) || 17000;
        return { price: Number(fallback), year: null };
    }

    // Straight-line depreciation over the useful life, down to a salvage value of 1 baht, the way
    // government asset registers keep a fully depreciated item on the books.
    function depreciate(cost, acquiredAt, lifeYears, now) {
        if (!(cost > 0) || !acquiredAt) return null;
        var life = Math.max(1, Number(lifeYears) || 5);
        var days = Math.max(0, (now - acquiredAt) / 86400000);
        var fraction = Math.min(1, days / (life * 365.25));
        var depreciation = Math.round((cost - 1) * fraction * 100) / 100;
        return { depreciation: depreciation, bookValue: Math.max(1, Math.round((cost - depreciation) * 100) / 100), percent: Math.round(fraction * 100), fullyDepreciated: fraction >= 1, lifeYears: life };
    }


    function evaluateCpu(cpuName) {
        if (!cpuName || typeof cpuName !== 'string') {
            return { supported: false, gen: null, reason: 'ไม่ทราบข้อมูล CPU' };
        }
        var name = cpuName.trim();
        if (/Intel/i.test(name)) {
            var intelNthMatch = name.match(/(\d{1,2})(?:th|st|nd|rd)\s+Gen/i);
            if (intelNthMatch) {
                var gen = parseInt(intelNthMatch[1], 10);
                if (gen >= 8) {
                    return { supported: true, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (รองรับ)' };
                } else {
                    return { supported: false, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (ต่ำกว่า Gen 8)' };
                }
            }
            var intelCoreMatch = name.match(/i[3579]-(\d{4,5})/i);
            if (intelCoreMatch) {
                var modelNum = parseInt(intelCoreMatch[1], 10);
                var g = Math.floor(modelNum / 1000);
                if (modelNum >= 10000) g = Math.floor(modelNum / 1000);
                else if (modelNum >= 1000 && modelNum <= 1999) g = Math.floor(modelNum / 100);
                if (g >= 8) {
                    return { supported: true, brand: 'Intel', gen: g, reason: 'Intel Core Gen ' + g + ' (รองรับ)' };
                } else {
                    return { supported: false, brand: 'Intel', gen: g, reason: 'Intel Core Gen ' + g + ' (ต่ำกว่า Gen 8)' };
                }
            }
            if (/G6400|G7400|G5905|G5925|G6900|Pentium.*Gold.*G[67]|Celeron.*G59/i.test(name)) {
                return { supported: true, brand: 'Intel', gen: 10, reason: 'Intel 10th Gen+ (รองรับ)' };
            }
            if (/G4400|G5400|Pentium|Celeron/i.test(name)) {
                return { supported: false, brand: 'Intel', gen: null, reason: 'Intel Pentium/Celeron รุ่นเก่า (ไม่ผ่านเกณฑ์)' };
            }
        }

        if (/AMD|Ryzen/i.test(name)) {
            if (/2200G|2400G|A\d-\d+|FX-\d+/i.test(name)) {
                return { supported: false, brand: 'AMD', gen: 'Zen 1', reason: 'AMD Ryzen 2000G/Zen 1 (ไม่ผ่านเกณฑ์ Win 11)' };
            }
            // Modern Ryzen 200 Series (Ryzen 5 220, Ryzen 7 250 w/ Radeon 740M/760M) - Zen 4, 2025 (พ.ศ. 2568)
            if (/Ryzen\s+[3579]\s+2\d{2}\b/i.test(name) || /740M|760M|780M|840M|880M/i.test(name)) {
                return { supported: true, brand: 'AMD', gen: 'Zen 4', reason: 'AMD Ryzen 200 Series (ปี 2568 / สถาปัตยกรรม Zen 4 รองรับ)' };
            }
            // Ryzen AI series (Zen 5)
            if (/Ryzen\s+AI/i.test(name)) {
                return { supported: true, brand: 'AMD', gen: 'Zen 5', reason: 'AMD Ryzen AI Series (Zen 5 รองรับ)' };
            }
            var ryzenMatch = name.match(/Ryzen\s+[3579]\s+(PRO\s+)?(\d{4})/i);
            if (ryzenMatch) {
                var series = parseInt(ryzenMatch[2], 10);
                if (series >= 3000 || (series >= 2000 && !/2200|2400/.test(ryzenMatch[2]))) {
                    return { supported: true, brand: 'AMD', gen: 'Zen+/Zen2+', reason: 'AMD Ryzen ' + series + ' (รองรับ)' };
                }
            }
            if (/5500U|7520U|4300G|3200G|1220P/i.test(name)) {
                return { supported: true, brand: 'AMD', gen: 'Zen2/3', reason: 'AMD Ryzen ยุคใหม่ (รองรับ)' };
            }
            if (/Athlon\s+Silver\s+3050U/i.test(name)) {
                return { supported: false, brand: 'AMD', gen: 'Zen 14nm', reason: 'AMD Athlon Silver 3050U (สถาปัตยกรรม Zen 14nm ไม่ผ่านเกณฑ์)' };
            }
        }

        return { supported: false, brand: 'Other', gen: null, reason: 'CPU รุ่นเก่าหรือไม่อยู่ในรายการที่รองรับ' };
    }

    function isSsd(modelOrCaption) {
        if (!modelOrCaption) return false;
        var str = String(modelOrCaption).toUpperCase();
        if (str.indexOf('SSD') >= 0 || str.indexOf('NVME') >= 0 || str.indexOf('S270') >= 0 || str.indexOf('AS350') >= 0 ||
            str.indexOf('SN530') >= 0 || str.indexOf('SN740') >= 0 || str.indexOf('SN520') >= 0 || str.indexOf('SN5000') >= 0 ||
            str.indexOf('NM620') >= 0 || str.indexOf('WDS250') >= 0 || str.indexOf('WD GREEN') >= 0 || str.indexOf('BC901') >= 0 ||
            str.indexOf('MZVL') >= 0 || str.indexOf('KBG40') >= 0 || str.indexOf('GETRICH') >= 0) {
            return true;
        }
        return false;
    }

    function getTotalRamGb(nodeOrSysinfo) {
        if (!nodeOrSysinfo) return 0;
        var s = nodeOrSysinfo.sysinfo || nodeOrSysinfo;
        if (s && s.memory && Array.isArray(s.memory.devices)) {
            var totalBytes = s.memory.devices.reduce(function (sum, d) { return sum + (Number(d.size) || 0); }, 0);
            if (totalBytes > 0) return Math.round(totalBytes / (1024 * 1024 * 1024));
        }
        if (s && s.memory && typeof s.memory.total === 'number') {
            return Math.round(s.memory.total / (1024 * 1024 * 1024));
        }
        var raw = String(nodeOrSysinfo.ram || (s && s.ram) || '');
        var m = raw.match(/(\d+)\s*GB/i);
        if (m) return parseInt(m[1], 10);
        return 0;
    }

    // Explain clearly what device is and why it passed/failed assessment
    function getDeviceInsight(d) {
        if (!d) return { what: '', why: '', summary: '' };
        var cpu = String(d.cpu || d.cpuName || '').trim();
        var os = String(d.os || d.osCaption || '').replace('Microsoft ', '').trim();
        var isWin11 = /Windows 11/i.test(os);
        var age = d.ageYears;
        var yr = d.fiscalYear ? ('พ.ศ. ' + d.fiscalYear) : (d.biosYear ? ('พ.ศ. ' + (d.biosYear + 543)) : null);

        var what = '';
        var why = '';
        var summary = '';

        if (/Ryzen\s+[3579]\s+2\d{2}\b/i.test(cpu) || /740M|760M|780M/i.test(cpu)) {
            what = 'AMD Ryzen 200 Series (Zen 4, กราฟิก RDNA 3) ผลิตปี 2568' + (yr ? ' (' + yr + ')' : '');
            why = 'เครื่องใหม่เอี่ยม สถาปัตยกรรมยุคใหม่ 4nm รองรับ Windows 11 และมาตรฐานความปลอดภัย TPM 2.0 ครบถ้วน';
            summary = 'เครื่องใหม่ปี 2568 (Zen 4) รองรับ Win 11 เต็มรูปแบบ';
        } else if (/2200G|2400G/i.test(cpu)) {
            what = 'AMD Ryzen G-Series ยุคแรก (Zen 1 14nm) สร้างราวปี 2561' + (age ? ' (อายุ ~' + age + ' ปี)' : '');
            if (isWin11) {
                why = 'เครื่องนี้ติดตั้ง Windows 11 ใช้งานได้ (ผ่าน TPM 2.0 / Bypass) แต่รหัส CPU รุ่นนี้ไม่อยู่ในลิสต์รับรองทางการของ Microsoft เนื่องจากเป็นแกน Zen 14nm';
                summary = 'ติดตั้ง Win 11 แล้ว (CPU Zen 1 อยู่นอกลิสต์ทางการ)';
            } else {
                why = 'Microsoft ไม่รองรับ Windows 11 เนื่องจากชิป Zen 1st Gen ขาดคำสั่งความปลอดภัยฮาร์ดแวร์ MBEC/HVCI';
                summary = 'สถาปัตยกรรม Zen 1 (14nm) Microsoft ไม่รองรับ';
            }
        } else if (/Athlon\s+Silver\s+3050U/i.test(cpu)) {
            what = 'AMD Athlon Silver 3050U (เปิดตัวปี 2563)' + (yr ? ' (' + yr + ')' : '');
            if (isWin11) {
                why = 'เครื่องนี้ติดตั้ง Windows 11 ใช้งานได้จริงเพราะมี TPM 2.0 และ UEFI รองรับ แต่รหัส CPU รุ่นนี้ไม่อยู่ในลิสต์รับรองทางการของ Microsoft (เนื่องจากแกนภายในเป็น Zen 14nm 2-Core)';
                summary = 'ติดตั้ง Win 11 แล้ว (CPU อยู่นอกลิสต์ทางการของ MS)';
            } else {
                why = 'แม้จำหน่ายปี 2563 แต่ภายในใช้โครงสร้าง Zen 1st Gen (14nm) 2-Core จึงไม่ผ่านเกณฑ์ความปลอดภัยอย่างเป็นทางการของ Windows 11';
                summary = 'โครงสร้าง Zen 1 14nm อยู่นอกลิสต์ทางการ';
            }
        } else if (/G5905|G5925|G6900|Celeron.*G59/i.test(cpu)) {
            what = 'Intel Celeron Gen 10 (Comet Lake) ผลิตปี 2563' + (yr ? ' (' + yr + ')' : '');
            why = 'เป็นชิปตระกูล 10th Gen ขึ้นไปที่ Microsoft บรรจุไว้ในรายการรองรับ Windows 11 อย่างเป็นทางการ';
            summary = 'Celeron Gen 10 รองรับ Windows 11 อย่างเป็นทางการ';
        } else if (/G4400|G5400/i.test(cpu)) {
            what = 'Intel Pentium ตระกูลเก่า (Skylake/Gen 6-8) สร้างปี 2558-2561' + (age ? ' (อายุ ~' + age + ' ปี)' : '');
            why = 'รุ่นประหยัดสถาปัตยกรรมเก่า ต่ำกว่าเกณฑ์ขั้นต่ำ Gen 8 ขาดฟังก์ชันความปลอดภัยระดับฮาร์ดแวร์';
            summary = 'รุ่นเก่าต่ำกว่าเกณฑ์ Gen 8 ขาดชิปความปลอดภัย';
        } else if (/i[3579]-(\d{4,5})/i.test(cpu) || /(\d{1,2})(?:th|st|nd|rd)\s+Gen/i.test(cpu)) {
            var gen = null;
            var nth = cpu.match(/(\d{1,2})(?:th|st|nd|rd)\s+Gen/i);
            if (nth) gen = parseInt(nth[1], 10);
            else {
                var cm = cpu.match(/i[3579]-(\d{4,5})/i);
                var num = parseInt(cm[1], 10);
                if (num >= 10000) gen = Math.floor(num / 1000);
                else if (num >= 1000 && num <= 1999) gen = Math.floor(num / 100);
                else gen = Math.floor(num / 1000);
            }

            var genYears = {
                2: '2554 (อายุ ~15 ปี)', 3: '2555 (อายุ ~14 ปี)', 4: '2557 (อายุ ~12 ปี)',
                6: '2559 (อายุ ~10 ปี)', 7: '2560 (อายุ ~9 ปี)', 8: '2561 (อายุ ~8 ปี)',
                9: '2562 (อายุ ~7 ปี)', 10: '2563 (อายุ ~6 ปี)', 11: '2564 (อายุ ~5 ปี)',
                12: '2565 (อายุ ~4 ปี)', 13: '2566 (อายุ ~3 ปี)', 14: '2567 (อายุ ~2 ปี)'
            };
            var genInfo = genYears[gen] || ('Gen ' + gen);

            what = 'Intel Core Gen ' + gen + ' (เปิดตัวราวปี ' + genInfo + ')' + (yr ? ' จัดซื้อ ' + yr : '');
            if (gen >= 8) {
                why = 'สถาปัตยกรรม Intel Gen ' + gen + ' รองรับชุดคำสั่งความปลอดภัย MBEC/VBS และ TPM 2.0 ครบถ้วนตามมาตรฐาน Windows 11';
                summary = 'Intel Gen ' + gen + ' รองรับ Windows 11 แท้ตามเกณฑ์มาตรฐาน';
            } else {
                if (isWin11) {
                    why = 'ฮาร์ดแวร์จริงเป็น Gen ' + gen + ' เก่ากว่าเกณฑ์ขั้นต่ำ (ต้องการ Gen 8+) ที่ติดตั้ง Windows 11 ได้เกิดจากการ Bypass ข้อกำหนดความปลอดภัย';
                    summary = 'เครื่อง Gen ' + gen + ' รัน Win 11 แบบ Bypass ข้อกำหนด';
                } else {
                    why = 'สถาปัตยกรรม Gen ' + gen + ' เก่ากว่าเกณฑ์ขั้นต่ำของ Microsoft (Gen 8) จึงไม่สามารถอัปเกรดเป็น Windows 11 ได้';
                    summary = 'เครื่อง Gen ' + gen + ' เก่ากว่าเกณฑ์ขั้นต่ำ (ต้องการ Gen 8+)';
                }
            }
        } else if (/Ryzen/i.test(cpu)) {
            what = 'AMD Ryzen ตระกูลใหม่';
            why = 'สถาปัตยกรรม Zen รองรับระบบความปลอดภัยระดับฮาร์ดแวร์และ fTPM ของ Windows 11';
            summary = 'AMD Ryzen ยุคใหม่ ผ่านเกณฑ์รองรับ Windows 11';
        } else {
            what = cpu || 'เครื่องคอมพิวเตอร์ทั่วไป';
            why = (d.cpuEval && d.cpuEval.reason) || d.cpuReason || 'ตรวจสอบจากฐานข้อมูลคุณสมบัติฮาร์ดแวร์';
            summary = (d.cpuEval && d.cpuEval.supported) || d.cpuSupported ? 'สเปกฮาร์ดแวร์ผ่านเกณฑ์' : 'สเปกไม่ผ่านเกณฑ์ทางการ';
        }

        return { what: what, why: why, summary: summary };
    }

    function assessDevice(node, customCriteria) {
        if (!node) return null;
        var nid = node._id || node.id || node.nodeid || node.nodeId;
        if (root.ScpCachedDeviceAssessments && nid && root.ScpCachedDeviceAssessments[nid]) {
            return root.ScpCachedDeviceAssessments[nid];
        }
        var criteria = root.ScpPriceReference.resolveCriteria(DEFAULT_CRITERIA, customCriteria);
        var s = (node && node.sysinfo) ? node.sysinfo : {};
        var hw = (node && node.hardware) || (s && s.hardware) || (root.__scpSpecs && root.__scpSpecs[nid] && root.__scpSpecs[nid].hardware) || null;
        var win = (hw && hw.windows) || {};
        var id = (hw && hw.identifiers) || {};
        var osName = String((win.osinfo && win.osinfo.Caption) || (node && (node.osdesc || node.os)) || (s && s.os && s.os.name) || '');
        var isWin11 = /Windows\s*11/i.test(osName);
        var isWin10 = /Windows\s*10/i.test(osName);
        var isWin7 = /Windows\s*7/i.test(osName);

        var biosDateStr = String(id.bios_date || (s && s.bios && (s.bios.releaseDate || s.bios.date || s.bios.version)) || '');
        var biosYear = null;
        var yearMatch = biosDateStr.match(/(?:19|20)\d{2}/);
        if (yearMatch) {
            biosYear = parseInt(yearMatch[0], 10);
        }

        var currentYear = new Date().getFullYear();
        // Plan years are fiscal years (as A.D.), counted from the budget year, not the calendar year.
        var planYear = criteria.budgetYearBE - 543;
        var ageYears = biosYear ? Math.max(0, currentYear - biosYear) : 4;

        var cpuName = (id.cpu_name) || (s && s.cpu && (s.cpu.model || s.cpu.name || s.cpu.brand)) || (node && node.cpu) || '';
        var cpuEval = evaluateCpu(cpuName);

        // Acquisition year: the asset record's fiscal year, else the CPU's launch year,
        // else the BIOS date -- the same order the server uses.
        var biosDateYear = biosYear;
        var asset = (root.ScpCachedAssets && nid && root.ScpCachedAssets[nid]) || {};
        var fy = asset.fiscalYear ? parseInt(asset.fiscalYear, 10) : null;
        var cpuYear = cpuLaunchYear(cpuName);
        var yearSource = null, acquiredAt = null, acquiredYearBE = null;
        if (fy) {
            var fyBE = fy > 2400 ? fy : fy + 543;
            biosYear = fyBE - 543; yearSource = 'asset'; acquiredYearBE = fyBE; acquiredAt = Date.UTC(fyBE - 543, 3, 1);
        } else if (cpuYear) {
            biosYear = cpuYear; yearSource = 'cpu'; acquiredYearBE = cpuYear + 543; acquiredAt = Date.UTC(cpuYear, 6, 1);
        } else if (biosYear) {
            yearSource = 'bios'; acquiredYearBE = biosYear + 543; acquiredAt = Date.UTC(biosYear, 6, 1);
        }
        if (yearSource) ageYears = Math.max(0, currentYear - biosYear);
        var probe = (root.ScpCachedChassis && nid && root.ScpCachedChassis[nid]) || null;
        var devType = deviceTypeOf(cpuName, id.product_name, probe);
        var deviceClass = devType.type;
        var replacementPrice = root.ScpPriceReference.replacementPrice(criteria, deviceClass);
        var ref = referencePrice(criteria, deviceClass, acquiredYearBE);
        var purchasePrice = Number(asset.price) > 0 ? Number(asset.price) : null;
        var costBasis = purchasePrice || ref.price;
        var book = depreciate(costBasis, acquiredAt, criteria.usefulLifeYears, Date.now());

        var ramGb = 0;
        if (Array.isArray(win.memory) && win.memory.length) {
            var mBytes = win.memory.reduce(function (sum, m) { return sum + (Number(m.Capacity) || 0); }, 0);
            ramGb = Math.round(mBytes / (1024 * 1024 * 1024));
        } else {
            ramGb = getTotalRamGb(node);
        }
        var hasMinRam = ramGb >= (criteria.minRamGb || 4);
        var hasRecRam = ramGb >= (criteria.recommendedRamGb || 8);

        var disks = (s && s.storage && Array.isArray(s.storage.drives)) ? s.storage.drives : [];
        var mainDisk = disks[0] || {};
        var diskHasSsd = isSsd(mainDisk.model || mainDisk.caption || mainDisk.name) ||
                         disks.some(function (d) { return isSsd(d.model || d.caption || d.name); });
        if (!diskHasSsd && Array.isArray(id.storage_devices)) {
            diskHasSsd = id.storage_devices.some(function (d) { return isSsd(d.Model || d.Caption); });
        }
        // the computer's own answer about the disk holding C: beats the model-name guess
        var probed = (root.ScpCachedChassis && nid && root.ScpCachedChassis[nid]) || null;
        var sysDisk = root.ScpPriceReference.systemDiskOf(probed), diskSource = 'model';
        if (sysDisk && (/^(SSD|HDD)$/i.test(sysDisk.media || '') || /NVMe/i.test(sysDisk.bus || ''))) {
            diskHasSsd = /SSD/i.test(sysDisk.media || '') || /NVMe/i.test(sysDisk.bus || '');
            diskSource = 'probe';
        }

        var cDriveFreePct = 100;
        if (win.volumes && win.volumes.C && win.volumes.C.size) {
            cDriveFreePct = Math.round(((Number(win.volumes.C.sizeremaining) || 0) / Number(win.volumes.C.size)) * 100);
        } else {
            var fsList = (s && s.storage && Array.isArray(s.storage.fileSystems)) ? s.storage.fileSystems : [];
            var cDrive = fsList.find(function (f) { return /c:/i.test(f.mount || f.fs || f.name); });
            if (cDrive && cDrive.size && cDrive.used != null) {
                cDriveFreePct = Math.round(((cDrive.size - cDrive.used) / cDrive.size) * 100);
            }
        }

        var biosMode = id.bios_mode || (s && s.bios && s.bios.mode) || (s && s.os && s.os.uefi ? 'UEFI' : 'Legacy');
        var isUefi = /UEFI/i.test(biosMode);
        var tpmVersion = (s && s.security && s.security.tpm) ? String(s.security.tpm.version || '') : '';
        var hasTpm2 = (tpmVersion.indexOf('2.0') >= 0) || !!(hw && hw.tpm && hw.tpm.SpecVersion === '2.0');

        var win11Eligible = false;
        var win11Upgradable = false;
        var win11Ineligible = false;
        var win11Blockers = [];
        var upgradeActions = [];
        var upgradeCost = 0;

        var ramLow = ramGb > 0 && !hasRecRam;
        if (!cpuEval.supported) {
            win11Blockers.push((isWin11 ? 'ติดตั้ง Windows 11 แบบข้ามข้อกำหนด — CPU ไม่รองรับ: ' : 'CPU ไม่รองรับ: ') + cpuEval.reason);
        }
        if (ramLow) {
            win11Blockers.push('RAM น้อย: มี ' + ramGb + ' GB (แนะนำ ' + criteria.recommendedRamGb + ' GB)');
            upgradeActions.push('เพิ่ม RAM เป็น ' + criteria.recommendedRamGb + ' GB (~' + criteria.costs.ramUpgrade + ' บาท)');
            upgradeCost += criteria.costs.ramUpgrade;
        }
        if (!isWin11) {
            if (/Legacy/i.test(biosMode)) {
                win11Blockers.push('BIOS โหมด Legacy (ต้องแปลงเป็น UEFI/GPT)');
                upgradeActions.push('เปิดใช้งาน UEFI และ Secure Boot ใน BIOS');
            }
            if (!hasTpm2) {
                win11Blockers.push('ไม่พบ TPM 2.0 (อาจต้องเปิด fTPM/PTT ใน BIOS)');
                upgradeActions.push('เปิดใช้งาน TPM 2.0 / fTPM ใน BIOS');
            }
        }
        win11Ineligible = !cpuEval.supported;
        win11Upgradable = cpuEval.supported && win11Blockers.length > 0;
        win11Eligible = cpuEval.supported && !win11Upgradable;
        if (criteria.requireSsd && !diskHasSsd) {
            upgradeActions.push('เพิ่ม/เปลี่ยน SSD ความเร็วสูง (~' + criteria.costs.ssdUpgrade + ' บาท)');
            upgradeCost += criteria.costs.ssdUpgrade;
        }

        var healthScore = 100;
        if (ageYears > criteria.maxAgeYears) healthScore -= 30;
        else if (ageYears >= 5) healthScore -= 20;
        else if (ageYears >= 3) healthScore -= 10;

        if (!cpuEval.supported) healthScore -= 25;
        if (!diskHasSsd) healthScore -= 15;
        if (ramGb < 4) healthScore -= 20;
        else if (ramGb < 8) healthScore -= 10;

        if (cDriveFreePct < 10) healthScore -= 15;
        else if (cDriveFreePct < 20) healthScore -= 8;

        if (isWin7) healthScore -= 20;
        else if (isWin10) healthScore -= 10;

        healthScore = Math.max(10, Math.min(100, healthScore));

        var healthStatus = 'good';
        if (healthScore < 40) healthStatus = 'critical';
        else if (healthScore < 60) healthStatus = 'poor';
        else if (healthScore < 80) healthStatus = 'fair';

        var survival = {};
        for (var i = 0; i <= 5; i++) {
            var y = planYear + i;
            var projectedAge = ageYears + i;
            var prob = 1.0;
            if (projectedAge > criteria.maxAgeYears + 2) prob = 0.15;
            else if (projectedAge > criteria.maxAgeYears) prob = 0.40;
            else if (projectedAge >= 5) prob = 0.65;
            else if (projectedAge >= 3) prob = 0.85;
            if (!diskHasSsd) prob *= 0.85;
            if (win11Ineligible && i >= 1) prob *= 0.70;
            survival[String(y)] = Math.max(0.1, Math.min(1.0, Math.round(prob * 100) / 100));
        }

        var replacementYear = planYear;
        if (healthScore >= 75 && !win11Ineligible) replacementYear = planYear + 4;
        else if (healthScore >= 60 && !win11Ineligible) replacementYear = planYear + 3;
        else if (win11Upgradable) replacementYear = planYear + 2;
        else if (win11Ineligible && (ageYears >= 6 || isWin7)) replacementYear = planYear;
        else replacementYear = planYear + 1;

        var rec = 'keep';
        if (win11Ineligible) {
            rec = 'replace';
            replacementYear = planYear;
        } else if (win11Upgradable || upgradeActions.length > 0) {
            rec = 'upgrade';
        }

        return {
            nodeid: node._id || node.id,
            name: node.name || node.rname || '',
            room: node.room || (node.meshid && root.meshes && root.meshes[node.meshid] ? root.meshes[node.meshid].name : '') || 'General',
            ageYears: ageYears,
            biosYear: yearSource ? biosYear : null,
            cpuYear: cpuYear,
            biosDateYear: biosDateYear,
            yearSource: yearSource,
            acquiredYearBE: acquiredYearBE,
            fiscalYear: fy,
            deviceClass: deviceClass,
            deviceTypeSource: devType.source,
            diskSource: diskSource,
            maintenance: root.ScpPriceReference.maintenanceFor(probed, deviceClass, criteria.costs),
            maintenanceCost: root.ScpPriceReference.maintenanceFor(probed, deviceClass, criteria.costs).filter(function (m) { return !m.optional; }).reduce(function (s, m) { return s + (m.cost || 0); }, 0),
            modelName: (probe && probe.model) || '',
            costBasis: costBasis,
            costSource: purchasePrice ? 'asset' : 'reference',
            referencePriceYearBE: ref.year,
            depreciation: book ? book.depreciation : null,
            bookValue: book ? book.bookValue : null,
            depreciationPercent: book ? book.percent : null,
            fullyDepreciated: book ? book.fullyDepreciated : null,
            usefulLifeYears: book ? book.lifeYears : null,
            cpu: cpuName,
            cpuEval: cpuEval,
            ramGb: ramGb,
            diskHasSsd: diskHasSsd,
            cDriveFreePct: cDriveFreePct,
            biosMode: biosMode,
            hasTpm2: hasTpm2,
            os: osName,
            isWin11: isWin11,
            isWin10: isWin10,
            isWin7: isWin7,
            win11Status: win11Eligible ? (isWin11 ? 'already_win11' : 'eligible') : (win11Upgradable ? 'upgradable' : 'ineligible'),
            win11Blockers: win11Blockers,
            upgradeActions: upgradeActions,
            upgradeCost: upgradeCost,
            healthScore: healthScore,
            healthStatus: healthStatus,
            survival: survival,
            replacementYear: replacementYear,
            recommendation: rec,
            estimatedCost: rec === 'replace' ? replacementPrice.price : (rec === 'upgrade' ? upgradeCost : 0),
            replacementCost: replacementPrice.price,
            replacementPrice: replacementPrice,
            replacementBudgetYearBE: criteria.budgetYearBE,
            insight: getDeviceInsight({
                cpu: cpuName,
                cpuName: cpuName,
                os: osName,
                osCaption: osName,
                ageYears: ageYears,
                biosYear: biosYear,
                fiscalYear: node && node.fiscalYear,
                cpuReason: cpuEval.reason,
                cpuSupported: cpuEval.supported
            })
        };
    }

    function assessFleet(nodes, customCriteria) {
        var criteria = root.ScpPriceReference.resolveCriteria(DEFAULT_CRITERIA, customCriteria);
        if (root.ScpCachedFleetAssessment && !customCriteria) {
            if (!Array.isArray(nodes) || !nodes.length || nodes.length === (root.ScpCachedFleetAssessment.devices || []).length) {
                return root.ScpCachedFleetAssessment;
            }
        }
        var list = Array.isArray(nodes) ? nodes : (nodes ? Object.values(nodes) : []);
        var currentYear = criteria.budgetYearBE - 543;

        var summary = {
            total: list.length,
            budgetYearBE: criteria.budgetYearBE,
            win11: { eligible: 0, upgradable: 0, ineligible: 0, already_win11: 0, critical: 0, upgradeCost: 0, replaceCostIfNew: 0 },
            health: { good: 0, fair: 0, poor: 0, critical: 0, averageScore: 0 },
            forecast: {
                currentYear: 0,
                nextYear: 0,
                year2to3: 0,
                year4to5: 0
            },
            budget: {
                currentYear: { replace: 0, upgrade: 0, total: 0 },
                nextYear: { replace: 0, upgrade: 0, total: 0 },
                year2to3: { replace: 0, upgrade: 0, total: 0 },
                year4to5: { replace: 0, upgrade: 0, total: 0 },
                fiveYearTotal: 0
            },
            byRoom: {},
            devices: [],
            criteria: criteria
        };

        var totalScore = 0;

        list.forEach(function (node) {
            var a = assessDevice(node, criteria);
            summary.devices.push(a);

            if (a.win11Status === 'already_win11') summary.win11.already_win11++;
            if (a.win11Status === 'eligible' || a.win11Status === 'already_win11') summary.win11.eligible++;
            else summary.win11[a.win11Status]++;
            if (a.healthStatus === 'critical' || a.recommendation === 'replace') summary.win11.critical++;
            if (a.win11Status === 'upgradable') {
                summary.win11.upgradeCost += a.upgradeCost;
                summary.win11.replaceCostIfNew += a.replacementCost;
            }
            summary.health[a.healthStatus]++;
            totalScore += a.healthScore;

            if (a.recommendation === 'replace' && a.replacementYear <= currentYear) {
                summary.forecast.currentYear++;
                summary.budget.currentYear.replace += a.replacementCost;
            } else if (a.recommendation === 'replace' && a.replacementYear === currentYear + 1) {
                summary.forecast.nextYear++;
                summary.budget.nextYear.replace += a.replacementCost;
            } else if (a.recommendation === 'replace' && a.replacementYear <= currentYear + 3) {
                summary.forecast.year2to3++;
                summary.budget.year2to3.replace += a.replacementCost;
            } else if (a.recommendation === 'replace') {
                summary.forecast.year4to5++;
                summary.budget.year4to5.replace += a.replacementCost;
            }

            if (a.recommendation === 'upgrade') {
                summary.budget.currentYear.upgrade += a.upgradeCost;
            }

            var r = a.room || 'General';
            if (!summary.byRoom[r]) {
                summary.byRoom[r] = { name: r, total: 0, eligible: 0, upgradable: 0, ineligible: 0, replaceNow: 0, cost: 0, devices: [] };
            }
            summary.byRoom[r].total++;
            summary.byRoom[r][a.win11Status === 'already_win11' ? 'eligible' : a.win11Status]++;
            if (a.replacementYear <= currentYear) summary.byRoom[r].replaceNow++;
            summary.byRoom[r].cost += a.estimatedCost;
            summary.byRoom[r].devices.push(a);
        });

        summary.health.averageScore = list.length ? Math.round(totalScore / list.length) : 0;
        summary.budget.currentYear.total = summary.budget.currentYear.replace + summary.budget.currentYear.upgrade;
        summary.budget.nextYear.total = summary.budget.nextYear.replace;
        summary.budget.year2to3.total = summary.budget.year2to3.replace;
        summary.budget.year4to5.total = summary.budget.year4to5.replace;
        summary.budget.fiveYearTotal = summary.budget.currentYear.total + summary.budget.nextYear.total + summary.budget.year2to3.total + summary.budget.year4to5.total;

        return summary;
    }

    root.ScpFleetAssess = {
        DEFAULT_CRITERIA: DEFAULT_CRITERIA,
        evaluateCpu: evaluateCpu,
        getDeviceInsight: getDeviceInsight,
        isSsd: isSsd,
        getTotalRamGb: getTotalRamGb,
        assessDevice: assessDevice,
        assessFleet: assessFleet,
        cpuLaunchYear: cpuLaunchYear,
        deviceClassOf: deviceClassOf,
        deviceTypeOf: deviceTypeOf,
        referencePrice: referencePrice,
        depreciate: depreciate
    };
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
