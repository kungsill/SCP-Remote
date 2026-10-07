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
            const gen = modelNum >= 10000 ? Math.floor(modelNum / 1000) : Math.floor(modelNum / 1000);
            if (gen >= 8) {
                return { supported: true, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (รองรับอย่างเป็นทางการ)' };
            } else {
                return { supported: false, brand: 'Intel', gen: gen, reason: 'Intel Core Gen ' + gen + ' (เก่ากว่าเกณฑ์ Gen 8)' };
            }
        }
        if (/G6400|G7400|Pentium.*Gold.*G6/i.test(name)) {
            return { supported: true, brand: 'Intel', gen: 10, reason: 'Intel Pentium Gold (รองรับอย่างเป็นทางการ)' };
        }
        if (/G4400|G5400|Pentium|Celeron/i.test(name)) {
            return { supported: false, brand: 'Intel', gen: null, reason: 'Intel รุ่นประหยัดรุ่นเก่า (ไม่ผ่านเกณฑ์)' };
        }
    }

    // AMD checks
    // Supported: Ryzen 2000 series (Zen+ e.g. 2600, 2700, NOT 2200G/2400G which are Zen 1st gen 14nm), Ryzen 3000, 4000, 5000, 7000, 8000
    // Specifically excluded by MS: Ryzen 3 2200G, Ryzen 5 2400G, Ryzen 3 Pro 2200G
    if (/AMD|Ryzen/i.test(name)) {
        if (/2200G|2400G/i.test(name)) {
            return { supported: false, brand: 'AMD', gen: 'Zen 1', reason: 'AMD Ryzen G-series รุ่นแรก (สถาปัตยกรรม Zen 14nm ไม่ผ่านเกณฑ์)' };
        }
        const ryzenMatch = name.match(/Ryzen\s+[3579]\s+(PRO\s+)?(\d{4})/i);
        if (ryzenMatch) {
            const series = parseInt(ryzenMatch[2], 10);
            if (series >= 3000 || (series >= 2000 && !/2200|2400/.test(ryzenMatch[2]))) {
                return { supported: true, brand: 'AMD', gen: 'Zen+/Zen2+', reason: 'AMD Ryzen ' + series + ' (รองรับอย่างเป็นทางการ)' };
            }
        }
        if (/5500U|7520U|4300G|1220P/i.test(name)) {
            return { supported: true, brand: 'AMD', gen: 'Zen2/3', reason: 'AMD Ryzen ยุคใหม่ (รองรับ)' };
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

// Assess single device
function assessDevice(node, sysinfo, customCriteria, assetData) {
    const criteria = Object.assign({}, DEFAULT_CRITERIA, customCriteria);
    const nowYear = new Date().getFullYear();

    const hw = (sysinfo && sysinfo.hardware) || {};
    const win = hw.windows || {};
    const id = hw.identifiers || {};
    const osinfo = win.osinfo || {};

    let biosYearStr = (id.bios_date || '').slice(0, 4);
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

    const cpuName = (id.cpu_name || '').trim();
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
        assetNote: assetNote
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
