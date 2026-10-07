/* SCP-Remote: Client-side hardware assessment and upgrade planning engine.
   Exposes window.ScpFleetAssess for real-time assessment, filtering, and forecast calculations. */
(function (root) {
    'use strict';

    var DEFAULT_CRITERIA = {
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
                var g = modelNum >= 10000 ? Math.floor(modelNum / 1000) : Math.floor(modelNum / 1000);
                if (g >= 8) {
                    return { supported: true, brand: 'Intel', gen: g, reason: 'Intel Core Gen ' + g + ' (รองรับ)' };
                } else {
                    return { supported: false, brand: 'Intel', gen: g, reason: 'Intel Core Gen ' + g + ' (ต่ำกว่า Gen 8)' };
                }
            }
            if (/G6400|G7400|Pentium.*Gold.*G6/i.test(name)) {
                return { supported: true, brand: 'Intel', gen: 10, reason: 'Intel Pentium Gold (รองรับ)' };
            }
            if (/G4400|G5400|Pentium|Celeron/i.test(name)) {
                return { supported: false, brand: 'Intel', gen: null, reason: 'Intel Pentium/Celeron รุ่นเก่า (ไม่ผ่านเกณฑ์)' };
            }
        }

        if (/AMD|Ryzen/i.test(name)) {
            if (/2200G|2400G/i.test(name)) {
                return { supported: false, brand: 'AMD', gen: 'Zen 1', reason: 'AMD Ryzen 2000G (Zen 14nm ไม่ผ่านเกณฑ์ Win 11)' };
            }
            var ryzenMatch = name.match(/Ryzen\s+[3579]\s+(PRO\s+)?(\d{4})/i);
            if (ryzenMatch) {
                var series = parseInt(ryzenMatch[2], 10);
                if (series >= 3000 || (series >= 2000 && !/2200|2400/.test(ryzenMatch[2]))) {
                    return { supported: true, brand: 'AMD', gen: 'Zen+/Zen2+', reason: 'AMD Ryzen ' + series + ' (รองรับ)' };
                }
            }
            if (/5500U|7520U|4300G|1220P/i.test(name)) {
                return { supported: true, brand: 'AMD', gen: 'Zen2/3', reason: 'AMD Ryzen ยุคใหม่ (รองรับ)' };
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

    function assessDevice(node, customCriteria) {
        if (!node) return null;
        var nid = node._id || node.id || node.nodeid || node.nodeId;
        if (root.ScpCachedDeviceAssessments && nid && root.ScpCachedDeviceAssessments[nid]) {
            return root.ScpCachedDeviceAssessments[nid];
        }
        var criteria = Object.assign({}, DEFAULT_CRITERIA, customCriteria || {});
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
        var ageYears = biosYear ? Math.max(0, currentYear - biosYear) : 4;

        var cpuName = (id.cpu_name) || (s && s.cpu && (s.cpu.model || s.cpu.name || s.cpu.brand)) || (node && node.cpu) || '';
        var cpuEval = evaluateCpu(cpuName);

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

        if (isWin11) {
            win11Eligible = true;
        } else {
            if (!cpuEval.supported) {
                win11Blockers.push(cpuEval.reason);
            }
            if (ageYears > criteria.maxAgeYears) {
                win11Blockers.push('อายุเครื่อง ' + ageYears + ' ปี เกินเกณฑ์สูงสุด (' + criteria.maxAgeYears + ' ปี)');
            }
            if (criteria.requireSsd && !diskHasSsd) {
                upgradeActions.push('เพิ่ม/เปลี่ยน SSD ความเร็วสูง (~' + criteria.costs.ssdUpgrade + ' บาท)');
                upgradeCost += criteria.costs.ssdUpgrade;
            }
            if (!hasMinRam || !hasRecRam) {
                var neededGb = (criteria.recommendedRamGb || 8) - ramGb;
                upgradeActions.push('เพิ่ม RAM อย่างน้อย ' + Math.max(4, neededGb) + ' GB (~' + criteria.costs.ramUpgrade + ' บาท)');
                upgradeCost += criteria.costs.ramUpgrade;
            }

            if (cpuEval.supported && ageYears <= criteria.maxAgeYears) {
                if (upgradeActions.length > 0) {
                    win11Upgradable = true;
                } else {
                    win11Eligible = true;
                }
            } else {
                win11Ineligible = true;
            }
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
            var y = currentYear + i;
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

        var replacementYear = currentYear;
        if (healthScore >= 75 && !win11Ineligible) replacementYear = currentYear + 4;
        else if (healthScore >= 60 && !win11Ineligible) replacementYear = currentYear + 3;
        else if (win11Upgradable) replacementYear = currentYear + 2;
        else if (win11Ineligible && (ageYears >= 6 || isWin7)) replacementYear = currentYear;
        else replacementYear = currentYear + 1;

        var rec = 'keep';
        if (win11Ineligible || healthScore < 45 || ageYears >= criteria.maxAgeYears) {
            rec = 'replace';
        } else if (win11Upgradable || upgradeActions.length > 0) {
            rec = 'upgrade';
        }

        return {
            nodeid: node._id || node.id,
            name: node.name || node.rname || '',
            room: node.room || (node.meshid && root.meshes && root.meshes[node.meshid] ? root.meshes[node.meshid].name : '') || 'General',
            ageYears: ageYears,
            biosYear: biosYear,
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
            win11Status: win11Eligible ? 'eligible' : (win11Upgradable ? 'upgradable' : 'ineligible'),
            win11Blockers: win11Blockers,
            upgradeActions: upgradeActions,
            upgradeCost: upgradeCost,
            healthScore: healthScore,
            healthStatus: healthStatus,
            survival: survival,
            replacementYear: replacementYear,
            recommendation: rec,
            estimatedCost: rec === 'replace' ? criteria.costs.newDevice : (rec === 'upgrade' ? upgradeCost : 0)
        };
    }

    function assessFleet(nodes, customCriteria) {
        var criteria = Object.assign({}, DEFAULT_CRITERIA, customCriteria || {});
        if (root.ScpCachedFleetAssessment && !customCriteria) {
            if (!Array.isArray(nodes) || !nodes.length || nodes.length === (root.ScpCachedFleetAssessment.devices || []).length) {
                return root.ScpCachedFleetAssessment;
            }
        }
        var list = Array.isArray(nodes) ? nodes : (nodes ? Object.values(nodes) : []);
        var currentYear = new Date().getFullYear();

        var summary = {
            total: list.length,
            win11: { eligible: 0, upgradable: 0, ineligible: 0 },
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

            summary.win11[a.win11Status]++;
            summary.health[a.healthStatus]++;
            totalScore += a.healthScore;

            if (a.replacementYear <= currentYear) {
                summary.forecast.currentYear++;
                summary.budget.currentYear.replace += criteria.costs.newDevice;
            } else if (a.replacementYear === currentYear + 1) {
                summary.forecast.nextYear++;
                summary.budget.nextYear.replace += criteria.costs.newDevice;
            } else if (a.replacementYear <= currentYear + 3) {
                summary.forecast.year2to3++;
                summary.budget.year2to3.replace += criteria.costs.newDevice;
            } else {
                summary.forecast.year4to5++;
                summary.budget.year4to5.replace += criteria.costs.newDevice;
            }

            if (a.recommendation === 'upgrade') {
                summary.budget.currentYear.upgrade += a.upgradeCost;
            }

            var r = a.room || 'General';
            if (!summary.byRoom[r]) {
                summary.byRoom[r] = { name: r, total: 0, eligible: 0, upgradable: 0, ineligible: 0, replaceNow: 0, cost: 0, devices: [] };
            }
            summary.byRoom[r].total++;
            summary.byRoom[r][a.win11Status]++;
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
        isSsd: isSsd,
        getTotalRamGb: getTotalRamGb,
        assessDevice: assessDevice,
        assessFleet: assessFleet
    };
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
