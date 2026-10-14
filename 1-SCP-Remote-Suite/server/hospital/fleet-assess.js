'use strict';
const priceReference = require('../public/scripts/scp-price-reference');
// SCP-Remote: Hardware assessment and upgrade planning engine.
// Evaluates Windows 11 readiness, lifespan health, yearly upgrade forecasts, and custom criteria.

const DEFAULT_CRITERIA = {
    useReferencePricesForReplacement: true,
    replacementProfiles: priceReference.profiles,
    priceReferenceSource: priceReference.source,
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
    // Book value: straight-line over this many years down to 1 baht (government practice;
    // the Comptroller General allows 3-5 years for computers, MDES replaces after 5).
    usefulLifeYears: 5,
    // MDES reference prices (ราคากลาง) by Buddhist-era year. Only the years confirmed from
    // the published criteria are filled in; the rest are entered on the criteria screen.
    // official MDES prices by year (+ the 2570 draft), shared with the browser
    referencePrices: priceReference.history,
    defaultPrice: { desktop: 17000, notebook: 16000 }
};

// Check whether CPU model is officially compatible with Windows 11.
function evaluateCpu(cpuName) {
    if (!cpuName || typeof cpuName !== 'string') {
        return { supported: false, gen: null, reason: 'ไม่ทราบข้อมูล CPU' };
    }
    const name = cpuName.trim();
    // Intel checks
    // Supported: 8th Gen Core and newer (e.g. i3-8xxx, i5-8xxx ... i3-10xxx, i5-12xxx, i3-13xxx), Core Ultra, Celeron/Pentium Gold (G6xxx, G7xxx)
    // Unsupported: 7th Gen and older (i3/i5/i7-2xxx, 3xxx, 4xxx, 6xxx, 7xxx), Pentium G4xxx, G5400 (mostly unsupported or 8th gen budget)
    if (/Intel/i.test(name)) {
        const intelNthMatch = name.match(/(\d{1,2})(?:th|st|nd|rd)\s+Gen/i);
        if (intelNthMatch) {
            const gen = parseInt(intelNthMatch[1], 10);
            if (gen >= 8) {
                return { supported: true, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (รองรับอย่างเป็นทางการ)' };
            } else {
                return { supported: false, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (เก่ากว่าเกณฑ์ Gen 8)' };
            }
        }
        const intelCoreMatch = name.match(/i[3579]-(\d{4,5})/i);
        if (intelCoreMatch) {
            const modelNum = parseInt(intelCoreMatch[1], 10);
            let gen = Math.floor(modelNum / 1000);
            if (modelNum >= 10000) gen = Math.floor(modelNum / 1000);
            else if (modelNum >= 1000 && modelNum <= 1999) gen = Math.floor(modelNum / 100);
            if (gen >= 8) {
                return { supported: true, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (รองรับอย่างเป็นทางการ)' };
            } else {
                return { supported: false, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (เก่ากว่าเกณฑ์ Gen 8)' };
            }
        }
        if (/G6400|G7400|G5905|G5925|G6900|Pentium.*Gold.*G[67]|Celeron.*G59/i.test(name)) {
            return { supported: true, brand: 'Intel', gen: 10, reason: 'Intel 10th Gen+ (รองรับอย่างเป็นทางการ)' };
        }
        if (/G4400|G5400|Pentium|Celeron/i.test(name)) {
            return { supported: false, brand: 'Intel', gen: null, reason: 'Intel รุ่นประหยัดรุ่นเก่า (ไม่ผ่านเกณฑ์)' };
        }
    }

    // AMD checks
    // Supported: Ryzen 200 series (Zen 4, 2025/2568 e.g. Ryzen 5 220 w/ Radeon 740M), Ryzen 2000 (Zen+ 2600/2700), Ryzen 3000-9000, Ryzen AI
    // Specifically excluded by MS: Ryzen 3 2200G, Ryzen 5 2400G, Ryzen 3 Pro 2200G (Zen 1 14nm), older A-series
    if (/AMD|Ryzen/i.test(name)) {
        if (/2200G|2400G|A\d-\d+|FX-\d+/i.test(name)) {
            return { supported: false, brand: 'AMD', gen: 'Zen 1', reason: 'AMD Ryzen G-series รุ่นแรก (สถาปัตยกรรม Zen 14nm ไม่ผ่านเกณฑ์)' };
        }
        // The 2000-numbered laptop chips (2300U, 2500U, 2700U, 2800H...) are Raven Ridge, Zen 1 like
        // the 2200G/2400G, and are not on Microsoft's list; neither is any Ryzen 1000.
        if (/Ryzen\s+[3579]\s+(PRO\s+)?2\d{3}(U|H)\b/i.test(name)) {
            return { supported: false, brand: 'AMD', gen: 'Zen 1', reason: 'AMD Ryzen 2000 รุ่นโน้ตบุ๊ก (U/H) เป็น Zen รุ่นแรก ไม่อยู่ในรายชื่อที่ Microsoft รองรับ' };
        }
        if (/Ryzen\s+[3579]\s+(PRO\s+)?1\d{3}/i.test(name)) {
            return { supported: false, brand: 'AMD', gen: 'Zen 1', reason: 'AMD Ryzen 1000 (Zen รุ่นแรก) ไม่ผ่านเกณฑ์ Windows 11' };
        }
        // Modern Ryzen 200 Series (Ryzen 5 220, Ryzen 7 250 w/ Radeon 740M/760M) - Zen 4, launched 2024/2025 (พ.ศ. 2568)
        if (/Ryzen\s+[3579]\s+2\d{2}\b/i.test(name) || /740M|760M|780M|840M|880M/i.test(name)) {
            return { supported: true, brand: 'AMD', gen: 'Zen 4', reason: 'AMD Ryzen 200 Series (ปี 2568 / สถาปัตยกรรม Zen 4 รองรับอย่างเป็นทางการ)' };
        }
        // Ryzen AI series (Zen 5)
        if (/Ryzen\s+AI/i.test(name)) {
            return { supported: true, brand: 'AMD', gen: 'Zen 5', reason: 'AMD Ryzen AI Series (Zen 5 รองรับอย่างเป็นทางการ)' };
        }
        const ryzenMatch = name.match(/Ryzen\s+[3579]\s+(PRO\s+)?(\d{4})/i);
        if (ryzenMatch) {
            const series = parseInt(ryzenMatch[2], 10);
            if (series >= 3000 || (series >= 2000 && !/2200|2400/.test(ryzenMatch[2]))) {
                return { supported: true, brand: 'AMD', gen: 'Zen+/Zen2+', reason: 'AMD Ryzen ' + series + ' (รองรับอย่างเป็นทางการ)' };
            }
        }
        if (/5500U|7520U|4300G|3200G|1220P/i.test(name)) {
            return { supported: true, brand: 'AMD', gen: 'Zen2/3', reason: 'AMD Ryzen ยุคใหม่ (รองรับ)' };
        }
        if (/Athlon\s+Silver\s+3050U/i.test(name)) {
            return { supported: false, brand: 'AMD', gen: 'Zen 14nm', reason: 'AMD Athlon Silver 3050U (สถาปัตยกรรม Zen 14nm ไม่ผ่านเกณฑ์)' };
        }
    }

    return { supported: false, brand: 'Other', gen: null, reason: 'CPU รุ่นนี้ไม่อยู่ในรายชื่อที่รองรับ' };
}

// Check if drive model indicates SSD or HDD
function isSsd(modelOrCaption) {
    if (!modelOrCaption) return false;
    const str = String(modelOrCaption).toUpperCase();
    if (str.includes('SSD') || str.includes('NVME') || str.includes('S270') || str.includes('AS350') ||
        str.includes('SN530') || str.includes('SN740') || str.includes('SN520') || str.includes('SN5000') ||
        str.includes('NM620') || str.includes('WDS250') || str.includes('WD GREEN') || str.includes('BC901') ||
        str.includes('MZVL') || str.includes('KBG40') || str.includes('GETRICH')) {
        return true;
    }
    if (str.includes('ST1000') || str.includes('WD10EZEX') || str.includes('WD5000') || str.includes('DT01ACA') || str.includes('ST500')) {
        return false;
    }
    return false;
}

// Calculate total RAM in GB
function getTotalRamGb(memoryArray) {
    if (!Array.isArray(memoryArray) || !memoryArray.length) return 0;
    const bytes = memoryArray.reduce((acc, m) => acc + Number(m.Capacity || 0), 0);
    return Math.round(bytes / (1024 * 1024 * 1024));
}

// Explain clearly what device is and why it passed/failed assessment
function getDeviceInsight(d) {
    const cpu = (d.cpu || d.cpuName || '').trim();
    const os = (d.os || d.osCaption || '').replace('Microsoft ', '').trim();
    const isWin11 = /Windows 11/i.test(os);
    const age = d.ageYears;
    const yr = d.fiscalYear ? ('พ.ศ. ' + d.fiscalYear) : (d.biosYear ? ('พ.ศ. ' + (d.biosYear + 543)) : null);

    let what = '';
    let why = '';
    let summary = '';

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
        let gen = null;
        const nth = cpu.match(/(\d{1,2})(?:th|st|nd|rd)\s+Gen/i);
        if (nth) gen = parseInt(nth[1], 10);
        else {
            const cm = cpu.match(/i[3579]-(\d{4,5})/i);
            const num = parseInt(cm[1], 10);
            if (num >= 10000) gen = Math.floor(num / 1000);
            else if (num >= 1000 && num <= 1999) gen = Math.floor(num / 100);
            else gen = Math.floor(num / 1000);
        }

        const genYears = {
            2: '2554 (อายุ ~15 ปี)', 3: '2555 (อายุ ~14 ปี)', 4: '2557 (อายุ ~12 ปี)',
            6: '2559 (อายุ ~10 ปี)', 7: '2560 (อายุ ~9 ปี)', 8: '2561 (อายุ ~8 ปี)',
            9: '2562 (อายุ ~7 ปี)', 10: '2563 (อายุ ~6 ปี)', 11: '2564 (อายุ ~5 ปี)',
            12: '2565 (อายุ ~4 ปี)', 13: '2566 (อายุ ~3 ปี)', 14: '2567 (อายุ ~2 ปี)'
        };
        const genInfo = genYears[gen] || ('Gen ' + gen);

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
        why = d.cpuReason || 'ตรวจสอบจากฐานข้อมูลคุณสมบัติฮาร์ดแวร์';
        summary = d.cpuSupported ? 'สเปกฮาร์ดแวร์ผ่านเกณฑ์' : 'สเปกไม่ผ่านเกณฑ์ทางการ';
    }

    return { what, why, summary };
}

// Assess single device
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

function assessDevice(node, sysinfo, customCriteria, assetData, probe) {
    const criteria = priceReference.resolveCriteria(DEFAULT_CRITERIA, customCriteria);
    const nowYear = new Date().getFullYear();
    // Plan years are fiscal years (as A.D.), counted from the budget year, not the calendar year.
    const planYear = criteria.budgetYearBE - 543;

    const hw = (sysinfo && sysinfo.hardware) || {};
    const win = hw.windows || {};
    const id = hw.identifiers || {};
    const osinfo = win.osinfo || {};

    let biosYearStr = (id.bios_date || (node && (node.bios_date || node.biosDate)) || '').slice(0, 4);
    let biosYear = parseInt(biosYearStr, 10) || null;

    // Custom asset information (เลขครุภัณฑ์, ปีงบประมาณ พ.ศ., ราคาจัดซื้อ)
    const assetNumber = (assetData && assetData.assetNumber) ? String(assetData.assetNumber).trim() : '';
    const fiscalYear = (assetData && assetData.fiscalYear) ? parseInt(assetData.fiscalYear, 10) : null;
    const purchasePrice = (assetData && assetData.price) ? Number(assetData.price) : null;
    const assetNote = (assetData && assetData.note) ? String(assetData.note).trim() : '';

    const cpuName = (id.cpu_name || (node && (node.cpu || node.cpuName)) || '').trim();

    // When was it acquired? The fiscal year typed into the asset record wins; otherwise the
    // year its processor went on sale; the BIOS date only as a last resort, since a BIOS
    // update moves it forward.
    const cpuYear = cpuLaunchYear(cpuName);
    const biosDateYear = biosYear;
    let yearSource = null, acquiredAt = null, acquiredYearBE = null;
    if (fiscalYear) {
        const fyBE = fiscalYear > 2400 ? fiscalYear : fiscalYear + 543;
        biosYear = fyBE - 543;
        yearSource = 'asset';
        acquiredYearBE = fyBE;
        acquiredAt = Date.UTC(fyBE - 543, 3, 1); // middle of that fiscal year (1 April)
    } else if (cpuYear) {
        biosYear = cpuYear;
        yearSource = 'cpu';
        acquiredAt = Date.UTC(cpuYear, 6, 1);   // middle of the year it went on sale
        acquiredYearBE = cpuYear + 543;         // July falls in fiscal year (year + 543)
    } else if (biosYear) {
        yearSource = 'bios';
        acquiredAt = Date.UTC(biosYear, 6, 1);
        acquiredYearBE = biosYear + 543;
    }
    const ageYears = biosYear ? Math.max(0, nowYear - biosYear) : null;
    const devType = deviceTypeOf(cpuName, id.product_name, probe);
    const deviceClass = devType.type;
    const replacementPrice = priceReference.replacementPrice(criteria, deviceClass);
    const ref = referencePrice(criteria, deviceClass, acquiredYearBE);
    const costBasis = purchasePrice > 0 ? purchasePrice : ref.price;
    const book = depreciate(costBasis, acquiredAt, criteria.usefulLifeYears, Date.now());
    const cpuEval = evaluateCpu(cpuName);

    const ramGb = getTotalRamGb(win.memory);

    // Primary system drive analysis
    const storageDevices = id.storage_devices || [];
    let hasSsd = false;
    let driveModels = [];
    for (const d of storageDevices) {
        driveModels.push(d.Model || d.Caption || '');
        if (isSsd(d.Model || d.Caption)) hasSsd = true;
    }
    // What the computer itself reported (disk holding C:) beats guessing from the model name.
    const sysDisk = priceReference.systemDiskOf(probe);
    let diskSource = 'model';
    if (sysDisk && (/^(SSD|HDD)$/i.test(sysDisk.media || '') || /NVMe/i.test(sysDisk.bus || ''))) {
        hasSsd = /SSD/i.test(sysDisk.media || '') || /NVMe/i.test(sysDisk.bus || '');
        diskSource = 'probe';
    }

    // Disk volumes & space
    const volumes = win.volumes || {};
    let cDrive = volumes.C || null;
    let cFreePercent = 100;
    let cFreeGb = 0;
    let cTotalGb = 0;
    if (cDrive && cDrive.size > 0) {
        cTotalGb = Math.round(cDrive.size / (1024 * 1024 * 1024));
        cFreeGb = Math.round((cDrive.sizeremaining || 0) / (1024 * 1024 * 1024));
        cFreePercent = Math.round(((cDrive.sizeremaining || 0) / cDrive.size) * 100);
    }

    const biosMode = id.bios_mode || 'Unknown';
    const hasTpm2 = !!(hw.tpm && hw.tpm.SpecVersion === '2.0');
    const osCaption = osinfo.Caption || 'Unknown OS';
    const isWin11 = /Windows 11/i.test(osCaption);
    const isWin10 = /Windows 10/i.test(osCaption);
    const isWin7 = /Windows 7/i.test(osCaption);

    // Windows 11 compatibility determination
    // Requirements: CPU supported, RAM >= 4GB, UEFI mode, TPM 2.0 (or upgradable)
    let win11Status = 'eligible'; // 'eligible' | 'upgradable' | 'ineligible' | 'already_win11'
    const win11Blockers = [];
    const upgradeSuggestions = [];

    // A processor that runs Windows 11 with too little memory is an upgrade, not a
    // replacement: adding RAM costs a fraction of a new computer.
    const ramLow = ramGb > 0 && ramGb < criteria.recommendedRamGb;
    const ramSuggestion = { type: 'ram', cost: criteria.costs.ramUpgrade, note: 'เพิ่ม RAM เป็น ' + criteria.recommendedRamGb + ' GB' };
    if (isWin11) {
        if (!cpuEval.supported) {
            // Windows 11 forced onto a processor it does not support: no security updates guaranteed.
            win11Status = 'ineligible';
            win11Blockers.push('ติดตั้ง Windows 11 แบบข้ามข้อกำหนด — CPU ไม่รองรับ: ' + cpuEval.reason);
        } else if (ramLow) {
            win11Status = 'upgradable';
            win11Blockers.push('RAM น้อย: มี ' + ramGb + ' GB (แนะนำ ' + criteria.recommendedRamGb + ' GB) — เพิ่ม RAM ก็ใช้งานต่อได้');
            upgradeSuggestions.push(ramSuggestion);
        } else {
            win11Status = 'already_win11';
        }
    } else {
        if (!cpuEval.supported) {
            win11Blockers.push('CPU ไม่รองรับ: ' + cpuEval.reason);
        }
        if (ramGb > 0 && ramGb < criteria.minRamGb) {
            win11Blockers.push('RAM ไม่พอ: มี ' + ramGb + ' GB (ต้องการอย่างน้อย ' + criteria.minRamGb + ' GB)');
        } else if (ramLow) {
            win11Blockers.push('RAM น้อย: มี ' + ramGb + ' GB (แนะนำ ' + criteria.recommendedRamGb + ' GB)');
        }
        if (ramLow) upgradeSuggestions.push(ramSuggestion);
        if (biosMode.toLowerCase() === 'legacy') {
            win11Blockers.push('BIOS โหมด Legacy (ต้องแปลงเป็น UEFI/GPT)');
            upgradeSuggestions.push({ type: 'bios', cost: 0, note: 'เปิดใช้งาน UEFI และ Secure Boot ใน BIOS' });
        }
        if (!hasTpm2) {
            win11Blockers.push('ไม่พบ TPM 2.0 (อาจต้องเปิด fTPM/PTT ใน BIOS)');
            upgradeSuggestions.push({ type: 'tpm', cost: 0, note: 'เปิดใช้งาน TPM 2.0 / fTPM ใน BIOS' });
        }

        if (win11Blockers.length === 0) {
            win11Status = 'eligible';
        } else if (!cpuEval.supported) {
            win11Status = 'ineligible';
        } else {
            win11Status = 'upgradable';
        }
    }

    // SSD upgrade recommendation
    if (criteria.requireSsd && !hasSsd) {
        upgradeSuggestions.push({ type: 'ssd', cost: criteria.costs.ssdUpgrade, note: 'เปลี่ยนฮาร์ดดิสก์เป็น SSD เพื่อความเร็ว' });
    }

    // Health Score (0 - 100)
    let score = 100;
    // 1. Age penalty (weight: criteria.weights.age)
    if (ageYears !== null) {
        const agePenaltyRate = Math.min(1, ageYears / criteria.maxAgeYears);
        score -= Math.round(agePenaltyRate * criteria.weights.age);
    } else {
        score -= Math.round(criteria.weights.age * 0.5); // unknown age penalty
    }

    // 2. CPU penalty (weight: criteria.weights.cpu)
    if (!cpuEval.supported && !isWin11) {
        score -= criteria.weights.cpu;
    } else if (!cpuEval.supported && isWin11) {
        score -= Math.round(criteria.weights.cpu * 0.5); // running win11 bypass
    }

    // 3. RAM penalty (weight: criteria.weights.ram)
    if (ramGb < criteria.minRamGb) {
        score -= criteria.weights.ram;
    } else if (ramGb < criteria.recommendedRamGb) {
        score -= Math.round(criteria.weights.ram * 0.4);
    }

    // 4. Disk penalty (weight: criteria.weights.disk)
    if (criteria.requireSsd && !hasSsd) {
        score -= Math.round(criteria.weights.disk * 0.6);
    }
    if (cFreePercent < criteria.minDiskFreePercent) {
        score -= Math.round(criteria.weights.disk * 0.4);
    }

    // 5. OS Support penalty (weight: criteria.weights.os)
    if (isWin7) {
        score -= criteria.weights.os;
    } else if (isWin10) {
        score -= Math.round(criteria.weights.os * 0.8); // Win 10 ESU ending
    }

    score = Math.max(5, Math.min(100, score));

    // Survival Probability & Forecast
    // Probability of system continuing safely over the next 1-5 years
    const pYearCurrent = Math.round(score);
    const pYear1 = Math.max(0, Math.round(score * (ageYears >= criteria.maxAgeYears ? 0.65 : 0.85)));
    const pYear2 = Math.max(0, Math.round(score * (ageYears >= criteria.maxAgeYears ? 0.40 : 0.70)));
    const pYear3 = Math.max(0, Math.round(score * (ageYears >= criteria.maxAgeYears ? 0.20 : 0.55)));

    // Recommendation category: 'keep' | 'upgrade' | 'replace'
    let recommendation = 'keep';
    let replaceByYear = planYear + 3;
    let estimatedCost = 0;

    // Age still affects health and forecasts, but does not alone justify buying a new PC.
    // A supported processor can be kept or upgraded, including machines on older Windows.
    if (!cpuEval.supported) {
        recommendation = 'replace';
        replaceByYear = planYear;
        estimatedCost = replacementPrice.price;
    } else if (win11Status === 'upgradable' || (!hasSsd && criteria.requireSsd) || ramLow) {
        recommendation = 'upgrade';
        replaceByYear = planYear + 2;
        estimatedCost = upgradeSuggestions.reduce((sum, s) => sum + (s.cost || 0), 0);
    } else {
        recommendation = 'keep';
        replaceByYear = planYear + Math.max(1, criteria.maxAgeYears - (ageYears || 3));
        estimatedCost = 0;
    }

    // Spare parts the check found a need for (disk, BIOS battery, fan, UPS).
    const maintenance = priceReference.maintenanceFor(probe, deviceClass, criteria.costs);
    const maintenanceCost = maintenance.filter(m => !m.optional).reduce((sum, m) => sum + (m.cost || 0), 0);
    const healthStatus = score >= 80 ? 'good' : (score >= 60 ? 'fair' : (score >= 40 ? 'poor' : 'critical'));
    const upgCost = upgradeSuggestions.reduce((sum, s) => sum + (s.cost || 0), 0);

    return {
        nodeid: node._id,
        nodeId: node._id,
        name: node.name || node._id,
        room: node.meshName || node.room || node.meshid || 'Unassigned',
        ageYears: ageYears,
        biosYear: biosYear,
        biosMode: biosMode,
        cpu: cpuName || '-',
        cpuName: cpuName || '-',
        cpuSupported: cpuEval.supported,
        cpuReason: cpuEval.reason,
        cpuEval: cpuEval,
        ramGb: ramGb,
        hasSsd: hasSsd,
        diskHasSsd: hasSsd,
        driveModels: driveModels,
        cFreePercent: cFreePercent,
        cDriveFreePct: cFreePercent,
        cFreeGb: cFreeGb,
        cTotalGb: cTotalGb,
        hasTpm2: hasTpm2,
        os: osCaption,
        osCaption: osCaption,
        isWin11: isWin11,
        isWin10: isWin10,
        isWin7: isWin7,
        win11Status: win11Status,
        win11Blockers: win11Blockers,
        upgradeSuggestions: upgradeSuggestions,
        upgradeActions: upgradeSuggestions,
        upgradeCost: upgCost,
        score: score,
        healthScore: score,
        healthStatus: healthStatus,
        probabilities: {
            current: pYearCurrent,
            year1: pYear1,
            year2: pYear2,
            year3: pYear3
        },
        survival: {
            [String(planYear)]: Math.round(pYearCurrent) / 100,
            [String(planYear + 1)]: Math.round(pYear1) / 100,
            [String(planYear + 2)]: Math.round(pYear2) / 100,
            [String(planYear + 3)]: Math.round(pYear3) / 100,
            [String(planYear + 4)]: Math.max(0.1, Math.round(pYear3 * 0.7)) / 100
        },
        recommendation: recommendation,
        replaceByYear: replaceByYear,
        replacementYear: replaceByYear,
        estimatedCost: estimatedCost,
        replacementCost: replacementPrice.price,
        replacementPrice: replacementPrice,
        replacementBudgetYearBE: criteria.budgetYearBE,
        assetNumber: assetNumber,
        fiscalYear: fiscalYear,
        purchasePrice: purchasePrice,
        price: purchasePrice,
        assetNote: assetNote,
        cpuYear: cpuYear,
        biosDateYear: biosDateYear,
        yearSource: yearSource,
        acquiredYearBE: acquiredYearBE,
        deviceClass: deviceClass,
        deviceTypeSource: devType.source,
        diskSource: diskSource,
        maintenance: maintenance,
        maintenanceCost: maintenanceCost,
        modelName: (probe && probe.model) || '',
        costBasis: costBasis,
        costSource: purchasePrice > 0 ? 'asset' : 'reference',
        referencePriceYearBE: ref.year,
        depreciation: book ? book.depreciation : null,
        bookValue: book ? book.bookValue : null,
        depreciationPercent: book ? book.percent : null,
        fullyDepreciated: book ? book.fullyDepreciated : null,
        usefulLifeYears: book ? book.lifeYears : null,
        insight: getDeviceInsight({
            cpu: cpuName,
            cpuName: cpuName,
            os: osCaption,
            osCaption: osCaption,
            ageYears: ageYears,
            biosYear: biosYear,
            fiscalYear: fiscalYear,
            cpuReason: cpuEval.reason,
            cpuSupported: cpuEval.supported
        })
    };
}

// Fleet assessment summarizer
function assessFleet(nodes, sysinfos, customCriteria, meshMap, assetMap, probeMap) {
    const criteria = priceReference.resolveCriteria(DEFAULT_CRITERIA, customCriteria);
    const sysMap = new Map();
    if (Array.isArray(sysinfos)) {
        for (const si of sysinfos) {
            if (si && si._id) sysMap.set(si._id.replace(/^si/, ''), si);
        }
    }

    const list = [];
    for (const node of nodes) {
        const si = sysMap.get(node._id) || (node.hardware ? node : null);
        if (meshMap && node.meshid && meshMap[node.meshid]) {
            node.meshName = meshMap[node.meshid];
        }
        const assetData = (assetMap && assetMap[node._id]) || null;
        list.push(assessDevice(node, si, criteria, assetData, (probeMap && probeMap[node._id]) || null));
    }

    const summary = {
        total: list.length,
        budgetYearBE: criteria.budgetYearBE,
        win11Ready: 0,
        win11Already: 0,
        win11Upgradable: 0,
        win11Ineligible: 0,
        win10Devices: 0,
        win7Devices: 0,
        recommendKeep: 0,
        recommendUpgrade: 0,
        recommendReplace: 0,
        budgetForecast: {}, // year -> total cost
        byRoom: {},
        devices: list,
        criteria: criteria
    };

    const currentYear = criteria.budgetYearBE - 543;
    for (let y = currentYear; y <= currentYear + 5; y++) {
        summary.budgetForecast[y] = { count: 0, cost: 0, replaceCount: 0, upgradeCount: 0, replaceCost: 0, upgradeCost: 0 };
    }

    for (const item of list) {
        if (item.win11Status === 'already_win11') summary.win11Already++;
        if (item.win11Status === 'eligible') summary.win11Ready++;
        if (item.win11Status === 'upgradable') summary.win11Upgradable++;
        if (item.win11Status === 'ineligible') summary.win11Ineligible++;
        if (item.isWin10) summary.win10Devices++;
        if (item.isWin7) summary.win7Devices++;

        if (item.recommendation === 'keep') summary.recommendKeep++;
        if (item.recommendation === 'upgrade') summary.recommendUpgrade++;
        if (item.recommendation === 'replace') summary.recommendReplace++;

        // Budget year assignment
        const targetYear = item.recommendation === 'upgrade' ? currentYear : item.replaceByYear;
        if (summary.budgetForecast[targetYear]) {
            summary.budgetForecast[targetYear].count++;
            summary.budgetForecast[targetYear].cost += item.estimatedCost;
            if (item.recommendation === 'replace') { summary.budgetForecast[targetYear].replaceCount++; summary.budgetForecast[targetYear].replaceCost += item.estimatedCost; }
            if (item.recommendation === 'upgrade') { summary.budgetForecast[targetYear].upgradeCount++; summary.budgetForecast[targetYear].upgradeCost += item.estimatedCost; }
        }

        // Room grouping
        const r = item.room || 'Unassigned';
        if (!summary.byRoom[r]) {
            summary.byRoom[r] = { name: r, total: 0, keep: 0, upgrade: 0, replace: 0, win10: 0, win7: 0, estimatedCost: 0, devices: [] };
        }
        summary.byRoom[r].total++;
        summary.byRoom[r][item.recommendation]++;
        if (item.isWin10) summary.byRoom[r].win10++;
        if (item.isWin7) summary.byRoom[r].win7++;
        summary.byRoom[r].estimatedCost += item.estimatedCost;
        summary.byRoom[r].cost = summary.byRoom[r].estimatedCost;
        summary.byRoom[r].replaceNow = summary.byRoom[r].replace;
        summary.byRoom[r].upgradable = summary.byRoom[r].upgrade;
        summary.byRoom[r].devices.push(item);
    }

    // Readiness has three exclusive groups. Critical/replace is a separate health flag
    // and can overlap them; it must use the same predicate as the dashboard filter.
    // Spare parts across the fleet, by kind, with the cost of the ones that are needed now.
    summary.maintenance = { disk: 0, cmos: 0, fan: 0, ups: 0, cost: 0, upsCost: 0 };
    for (const d of list) {
        for (const m of (d.maintenance || [])) {
            summary.maintenance[m.type] = (summary.maintenance[m.type] || 0) + 1;
            if (m.optional) summary.maintenance.upsCost += m.cost || 0; else summary.maintenance.cost += m.cost || 0;
        }
    }
    const upgradableList = list.filter(d => d.win11Status === 'upgradable');
    summary.win11 = {
        eligible: list.filter(d => d.win11Status === 'eligible' || d.win11Status === 'already_win11').length,
        upgradable: upgradableList.length,
        ineligible: list.filter(d => d.win11Status === 'ineligible').length,
        already_win11: summary.win11Already,
        critical: list.filter(d => d.healthStatus === 'critical' || d.recommendation === 'replace').length,
        // what upgrading the upgradable ones costs, against buying them new
        upgradeCost: upgradableList.reduce((sum, d) => sum + (d.upgradeCost || 0), 0),
        replaceCostIfNew: upgradableList.reduce((sum, d) => sum + d.replacementCost, 0)
    };
    summary.health = {
        good: summary.devices.filter(d => d.healthStatus === 'good').length,
        fair: summary.devices.filter(d => d.healthStatus === 'fair').length,
        poor: summary.devices.filter(d => d.healthStatus === 'poor').length,
        critical: summary.devices.filter(d => d.healthStatus === 'critical').length,
        averageScore: summary.devices.length ? Math.round(summary.devices.reduce((s, d) => s + (d.healthScore || 0), 0) / summary.devices.length) : 0
    };
    summary.forecast = {
        currentYear: summary.budgetForecast[currentYear] ? summary.budgetForecast[currentYear].replaceCount : 0,
        nextYear: summary.budgetForecast[currentYear + 1] ? summary.budgetForecast[currentYear + 1].replaceCount : 0,
        year2to3: ((summary.budgetForecast[currentYear + 2] ? summary.budgetForecast[currentYear + 2].replaceCount : 0) + (summary.budgetForecast[currentYear + 3] ? summary.budgetForecast[currentYear + 3].replaceCount : 0)),
        year4to5: ((summary.budgetForecast[currentYear + 4] ? summary.budgetForecast[currentYear + 4].replaceCount : 0) + (summary.budgetForecast[currentYear + 5] ? summary.budgetForecast[currentYear + 5].replaceCount : 0))
    };
    const sumBudget = (years) => years.reduce((total, year) => {
        const row = summary.budgetForecast[year] || {};
        total.replace += row.replaceCost || 0;
        total.upgrade += row.upgradeCost || 0;
        total.total += row.cost || 0;
        return total;
    }, { replace: 0, upgrade: 0, total: 0 });
    summary.budget = {
        currentYear: sumBudget([currentYear]),
        nextYear: sumBudget([currentYear + 1]),
        year2to3: sumBudget([currentYear + 2, currentYear + 3]),
        year4to5: sumBudget([currentYear + 4, currentYear + 5]),
        fiveYearTotal: Object.values(summary.budgetForecast).reduce((sum, row) => sum + row.cost, 0)
    };

    return summary;
}

module.exports = {
    DEFAULT_CRITERIA,
    evaluateCpu,
    isSsd,
    getTotalRamGb,
    assessDevice,
    assessFleet,
    cpuLaunchYear,
    deviceClassOf,
    deviceTypeOf,
    referencePrice,
    depreciate
};
