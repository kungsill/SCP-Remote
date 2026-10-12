'use strict';
// SCP-Remote: Hardware assessment and upgrade planning engine.
// Evaluates Windows 11 readiness, lifespan health, yearly upgrade forecasts, and custom criteria.

const DEFAULT_CRITERIA = {
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
        newDevice: 18000,
        ramUpgrade: 1200,
        ssdUpgrade: 1500
    }
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
function assessDevice(node, sysinfo, customCriteria, assetData) {
    const criteria = Object.assign({}, DEFAULT_CRITERIA, customCriteria);
    const nowYear = new Date().getFullYear();

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

    if (fiscalYear) {
        const adYear = fiscalYear > 2400 ? fiscalYear - 543 : fiscalYear;
        biosYear = adYear;
    }
    const ageYears = biosYear ? Math.max(0, nowYear - biosYear) : null;

    const cpuName = (id.cpu_name || (node && (node.cpu || node.cpuName)) || '').trim();
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

    if (isWin11) {
        win11Status = 'already_win11';
    } else {
        if (!cpuEval.supported) {
            win11Blockers.push('CPU ไม่รองรับ: ' + cpuEval.reason);
        }
        if (ramGb < criteria.minRamGb) {
            win11Blockers.push('RAM ไม่พอ: มี ' + ramGb + ' GB (ต้องการอย่างน้อย ' + criteria.minRamGb + ' GB)');
            upgradeSuggestions.push({ type: 'ram', cost: criteria.costs.ramUpgrade, note: 'เพิ่ม RAM เป็น ' + criteria.recommendedRamGb + ' GB' });
        }
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
    let replaceByYear = nowYear + 3;
    let estimatedCost = 0;

    if (ageYears !== null && ageYears >= criteria.maxAgeYears || !cpuEval.supported || isWin7) {
        recommendation = 'replace';
        replaceByYear = nowYear; // Replace this year or next
        estimatedCost = criteria.costs.newDevice;
    } else if (win11Status === 'upgradable' || (!hasSsd && criteria.requireSsd) || (ramGb < criteria.recommendedRamGb)) {
        recommendation = 'upgrade';
        replaceByYear = nowYear + 2;
        estimatedCost = upgradeSuggestions.reduce((sum, s) => sum + (s.cost || 0), 0);
    } else {
        recommendation = 'keep';
        replaceByYear = nowYear + Math.max(1, criteria.maxAgeYears - (ageYears || 3));
        estimatedCost = 0;
    }

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
            [String(nowYear)]: Math.round(pYearCurrent) / 100,
            [String(nowYear + 1)]: Math.round(pYear1) / 100,
            [String(nowYear + 2)]: Math.round(pYear2) / 100,
            [String(nowYear + 3)]: Math.round(pYear3) / 100,
            [String(nowYear + 4)]: Math.max(0.1, Math.round(pYear3 * 0.7)) / 100
        },
        recommendation: recommendation,
        replaceByYear: replaceByYear,
        replacementYear: replaceByYear,
        estimatedCost: estimatedCost,
        assetNumber: assetNumber,
        fiscalYear: fiscalYear,
        purchasePrice: purchasePrice,
        price: purchasePrice,
        assetNote: assetNote,
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
function assessFleet(nodes, sysinfos, customCriteria, meshMap, assetMap) {
    const criteria = Object.assign({}, DEFAULT_CRITERIA, customCriteria);
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
        list.push(assessDevice(node, si, criteria, assetData));
    }

    const summary = {
        total: list.length,
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

    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y <= currentYear + 5; y++) {
        summary.budgetForecast[y] = { count: 0, cost: 0, replaceCount: 0, upgradeCount: 0 };
    }

    for (const item of list) {
        if (item.isWin11) summary.win11Already++;
        if (item.win11Status === 'eligible') summary.win11Ready++;
        if (item.win11Status === 'upgradable') summary.win11Upgradable++;
        if (item.win11Status === 'ineligible') summary.win11Ineligible++;
        if (item.isWin10) summary.win10Devices++;
        if (item.isWin7) summary.win7Devices++;

        if (item.recommendation === 'keep') summary.recommendKeep++;
        if (item.recommendation === 'upgrade') summary.recommendUpgrade++;
        if (item.recommendation === 'replace') summary.recommendReplace++;

        // Budget year assignment
        const targetYear = item.replaceByYear;
        if (summary.budgetForecast[targetYear]) {
            summary.budgetForecast[targetYear].count++;
            summary.budgetForecast[targetYear].cost += item.estimatedCost;
            if (item.recommendation === 'replace') summary.budgetForecast[targetYear].replaceCount++;
            if (item.recommendation === 'upgrade') summary.budgetForecast[targetYear].upgradeCount++;
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

    summary.win11 = {
        eligible: summary.win11Ready + summary.win11Already,
        upgradable: summary.win11Upgradable,
        ineligible: summary.win11Ineligible
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
    summary.budget = {
        currentYear: {
            replace: summary.budgetForecast[currentYear] ? (summary.budgetForecast[currentYear].replaceCount * criteria.costs.newDevice) : 0,
            upgrade: summary.budgetForecast[currentYear] ? Math.max(0, summary.budgetForecast[currentYear].cost - summary.budgetForecast[currentYear].replaceCount * criteria.costs.newDevice) : 0,
            total: summary.budgetForecast[currentYear] ? summary.budgetForecast[currentYear].cost : 0
        },
        nextYear: {
            replace: summary.budgetForecast[currentYear + 1] ? (summary.budgetForecast[currentYear + 1].replaceCount * criteria.costs.newDevice) : 0,
            upgrade: 0,
            total: summary.budgetForecast[currentYear + 1] ? summary.budgetForecast[currentYear + 1].cost : 0
        },
        year2to3: {
            replace: ((summary.budgetForecast[currentYear + 2] ? summary.budgetForecast[currentYear + 2].replaceCount : 0) + (summary.budgetForecast[currentYear + 3] ? summary.budgetForecast[currentYear + 3].replaceCount : 0)) * criteria.costs.newDevice,
            upgrade: ((summary.budgetForecast[currentYear + 2] ? summary.budgetForecast[currentYear + 2].upgradeCount : 0) + (summary.budgetForecast[currentYear + 3] ? summary.budgetForecast[currentYear + 3].upgradeCount : 0)) * criteria.costs.ramUpgrade,
            total: (summary.budgetForecast[currentYear + 2] ? summary.budgetForecast[currentYear + 2].cost : 0) + (summary.budgetForecast[currentYear + 3] ? summary.budgetForecast[currentYear + 3].cost : 0)
        },
        year4to5: {
            replace: ((summary.budgetForecast[currentYear + 4] ? summary.budgetForecast[currentYear + 4].replaceCount : 0) + (summary.budgetForecast[currentYear + 5] ? summary.budgetForecast[currentYear + 5].replaceCount : 0)) * criteria.costs.newDevice,
            upgrade: 0,
            total: (summary.budgetForecast[currentYear + 4] ? summary.budgetForecast[currentYear + 4].cost : 0) + (summary.budgetForecast[currentYear + 5] ? summary.budgetForecast[currentYear + 5].cost : 0)
        },
        fiveYearTotal: Object.values(summary.budgetForecast).reduce((sum, b) => sum + (b.cost || 0), 0)
    };

    return summary;
}

module.exports = {
    DEFAULT_CRITERIA,
    evaluateCpu,
    isSsd,
    getTotalRamGb,
    assessDevice,
    assessFleet
};
