'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const assess = require('../fleet-assess');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function assessmentHardware(cpu, ram, os) {
    return {
        identifiers: { cpu_name: cpu, bios_mode: 'UEFI', storage_devices: [{ Model: 'NVMe SSD' }] },
        windows: { memory: [{ Capacity: ram * 1024 ** 3 }], osinfo: { Caption: os } },
        tpm: { SpecVersion: '2.0' }
    };
}

test('FY 2570 draft categories price replacements by type while keeping old book values and saved custom criteria', () => {
    const reference = require('../../public/scripts/scp-price-reference');
    assert.deepEqual(reference.catalog.map(p => p.price), [26000, 30000, 37000, 25000, 27000, 23000, 26000, 38000]);
    const nodes = [
        { _id: 'pc', name: 'PC', hardware: assessmentHardware('Intel Core i5-4590', 8, 'Windows 10 Pro') },
        { _id: 'aio', name: 'AiO', hardware: assessmentHardware('Intel Core i5-4590', 8, 'Windows 10 Pro') },
        { _id: 'nb', name: 'Notebook', hardware: assessmentHardware('Intel Core i5-6200U', 8, 'Windows 10 Pro') }
    ];
    const chassis = { aio: { chassis: [13] } };
    const oldSettings = { costs: { newDevice: 18000, ramUpgrade: 1400 }, referencePrices: { desktop: { 2566: 17500 }, notebook: { 2566: 16500 } } };
    const office = assess.assessFleet(nodes, [], oldSettings, null, null, chassis);
    assert.equal(office.budgetYearBE, 2570);
    assert.deepEqual(office.devices.map(d => d.replacementCost), [26000, 25000, 23000]);
    assert.equal(office.budget.currentYear.replace, 74000);
    assert.equal(office.budgetForecast[2027].cost, 74000);
    assert.equal(office.criteria.costs.ramUpgrade, 1400);
    assert.equal(office.criteria.referencePrices.desktop[2566], 17500);
    // i5-4590 dates the machine to 2556; that year's official edition (mdes-1590) has no
    // All-in-One item, so its office PC price applies -- never the 2570 draft AIO price.
    assert.equal(office.devices[1].costBasis, 14000, 'new AIO prices must not be applied retrospectively to old assets');
    const custom = { ...oldSettings, replacementProfiles: { desktop: 'desktop-processing-2', aio: 'aio-processing', notebook: 'notebook-ai' } };
    const selected = assess.assessFleet(nodes, [], custom, null, null, chassis);
    assert.deepEqual(selected.devices.map(d => d.replacementCost), [37000, 27000, 38000]);
    assert.equal(selected.budget.currentYear.replace, 102000);
    assert.ok(selected.devices.every(d => d.replacementPrice.draft && d.replaceByYear === 2027));
    const browser = { ScpCachedChassis: chassis };
    for (const file of ['scp-price-reference.js', 'scp-assess.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/scripts', file), 'utf8'), { window: browser });
    const local = browser.ScpFleetAssess.assessFleet(nodes, custom);
    assert.equal(local.budget.currentYear.replace, 102000);
    assert.deepEqual(Array.from(local.devices, d => d.replacementCost), [37000, 27000, 38000]);
    const manual = assess.assessFleet(nodes, [], { ...custom, useReferencePricesForReplacement: false, costs: { newDevice: 22000 } }, null, null, chassis);
    assert.equal(manual.budget.currentYear.replace, 66000);
    const asset = assess.assessDevice(nodes[0], nodes[0], custom, { fiscalYear: 2566, price: 12345 });
    assert.equal(asset.costBasis, 12345, 'actual purchase price is preserved');
    assert.equal(asset.replacementCost, 37000);
});

test('RAM upgrades on Windows 10 and 11 are counted with costs, while installed unsupported Windows 11 is not ready', () => {
    const browser = { ScpCachedAssets: { old: { fiscalYear: new Date().getFullYear() - 12 + 543 } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-price-reference.js'), 'utf8'), { window: browser });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-assess.js'), 'utf8'), { window: browser });
    const fixtures = [
        ['ready11', 'Intel Core i3-10100', 8, 'Windows 11 Pro', 'already_win11', 'keep'],
        ['low11', 'Intel Core i3-10100', 4, 'Windows 11 Pro', 'upgradable', 'upgrade'],
        ['low10', 'Intel Core i3-10100', 2, 'Windows 10 Pro', 'upgradable', 'upgrade'],
        ['ready10', 'Intel Core i3-10100', 8, 'Windows 10 Pro', 'eligible', 'keep'],
        ['bypass', 'Intel Core i5-4590', 4, 'Windows 11 Pro', 'ineligible', 'replace'],
        ['old', 'Intel Core i3-10100', 4, 'Windows 11 Pro', 'upgradable', 'upgrade']
    ];
    const nodes = fixtures.map(([id, cpu, ram, os]) => ({ _id: id, name: id, hardware: assessmentHardware(cpu, ram, os) }));
    nodes.forEach((node, i) => {
        const asset = browser.ScpCachedAssets[node._id];
        const server = assess.assessDevice(node, node, null, asset);
        const local = browser.ScpFleetAssess.assessDevice(node);
        for (const result of [server, local]) {
            assert.equal(result.win11Status, fixtures[i][4], node.name);
            assert.equal(result.recommendation, fixtures[i][5], node.name);
            if (result.win11Status === 'upgradable') {
                assert.equal(result.upgradeCost, 1200, node.name);
                assert.match(JSON.stringify(result.upgradeActions), /RAM/);
            }
        }
    });
    const server = assess.assessFleet(nodes, [], null, null, browser.ScpCachedAssets);
    const local = browser.ScpFleetAssess.assessFleet(nodes);
    for (const summary of [server, local]) {
        assert.equal(summary.win11.eligible, 2);
        assert.equal(summary.win11.upgradable, 3);
        assert.equal(summary.win11.ineligible, 1);
        assert.equal(summary.win11.critical, summary.devices.filter(d => d.healthStatus === 'critical' || d.recommendation === 'replace').length);
        assert.equal(summary.win11.eligible + summary.win11.upgradable + summary.win11.ineligible, summary.total);
        assert.equal(summary.win11.upgradeCost, 3600);
        assert.equal(summary.win11.replaceCostIfNew, 78000);
    }
    assert.equal(server.win11Already, 1, 'only ready installed Windows 11 devices enter the ready subtotal');
});

test('evaluateCpu detects officially supported and unsupported CPUs correctly', () => {
    // Unsupported CPUs (older than 8th gen, or Ryzen 1st gen)
    const i5_4590 = assess.evaluateCpu('Intel(R) Core(TM) i5-4590S CPU @ 3.00GHz');
    assert.equal(i5_4590.supported, false);
    assert.match(i5_4590.reason, /เก่ากว่าเกณฑ์ Gen 8/);

    const i5_6400 = assess.evaluateCpu('Intel(R) Core(TM) i5-6400 CPU @ 2.70GHz');
    assert.equal(i5_6400.supported, false);

    const ryzen2400g = assess.evaluateCpu('AMD Ryzen 5 2400G with Radeon Vega Graphics');
    assert.equal(ryzen2400g.supported, false);
    assert.match(ryzen2400g.reason, /Zen 14nm/);

    const ryzen2200g = assess.evaluateCpu('AMD Ryzen 3 PRO 2200G with Radeon Vega Graphics');
    assert.equal(ryzen2200g.supported, false);

    // Supported CPUs
    const i3_10100 = assess.evaluateCpu('Intel(R) Core(TM) i3-10100T CPU @ 3.00GHz');
    assert.equal(i3_10100.supported, true);
    assert.equal(i3_10100.gen, 10);

    const i3_1315u = assess.evaluateCpu('13th Gen Intel(R) Core(TM) i3-1315U');
    assert.equal(i3_1315u.supported, true);

    const ryzen5500u = assess.evaluateCpu('AMD Ryzen 5 5500U with Radeon Graphics');
    assert.equal(ryzen5500u.supported, true);
});

test('isSsd identifies SSD models and spinning HDDs', () => {
    assert.equal(assess.isSsd('MSI S270 240GB'), true);
    assert.equal(assess.isSsd('WD PC SN740 SDDQNQD-512G-1201'), true);
    assert.equal(assess.isSsd('Apacer AS350 256GB'), true);
    assert.equal(assess.isSsd('NVMe SAMSUNG MZVL4256HBJD-00BL7'), true);
    assert.equal(assess.isSsd('ST1000DM010-2EP102'), false);
    assert.equal(assess.isSsd('WDC WD10EZEX-60WN4A0'), false);
});

test('assessDevice flags Windows 10/7 devices needing replacement or upgrade', () => {
    // Old Win7 machine
    const nodeOld = { _id: 'node//old', name: 'PC-OLD', meshid: 'mesh//ward1' };
    const sysOld = {
        _id: 'sinode//old',
        hardware: {
            identifiers: {
                bios_date: '20140501000000.000000+000',
                bios_mode: 'Legacy',
                cpu_name: 'Intel(R) Core(TM) i5-4590S CPU @ 3.00GHz',
                storage_devices: [{ Model: 'ST1000DM010-2EP102' }]
            },
            windows: {
                memory: [{ Capacity: '4294967296' }], // 4 GB
                osinfo: { Caption: 'Microsoft Windows 7 Ultimate ' },
                volumes: { C: { size: 100000000000, sizeremaining: 10000000000 } }
            }
        }
    };
    const resOld = assess.assessDevice(nodeOld, sysOld);
    assert.equal(resOld.isWin7, true);
    assert.equal(resOld.recommendation, 'replace');
    assert.equal(resOld.win11Status, 'ineligible');
    assert.ok(resOld.score < 50);

    // Modern Win11 machine
    const nodeNew = { _id: 'node//new', name: 'PC-NEW', meshid: 'mesh//ward2' };
    const sysNew = {
        _id: 'sinode//new',
        hardware: {
            identifiers: {
                bios_date: '20240101000000.000000+000',
                bios_mode: 'UEFI',
                cpu_name: '13th Gen Intel(R) Core(TM) i3-1315U',
                storage_devices: [{ Model: 'WD PC SN740 SDDQNQD-512G-1201' }]
            },
            windows: {
                memory: [{ Capacity: '17179869184' }], // 16 GB
                osinfo: { Caption: 'Microsoft Windows 11 Pro' },
                volumes: { C: { size: 500000000000, sizeremaining: 350000000000 } }
            },
            tpm: { SpecVersion: '2.0' }
        }
    };
    const resNew = assess.assessDevice(nodeNew, sysNew);
    assert.equal(resNew.isWin11, true);
    assert.equal(resNew.recommendation, 'keep');
    assert.equal(resNew.win11Status, 'already_win11');
    assert.ok(resNew.score >= 80);
});

test('assessFleet builds comprehensive hospital fleet summaries and budget forecast', () => {
    const nodes = [
        { _id: 'n1', name: 'N1', meshid: 'ER' },
        { _id: 'n2', name: 'N2', meshid: 'ER' },
        { _id: 'n3', name: 'N3', meshid: 'OPD' }
    ];
    const sysinfos = [
        {
            _id: 'sin1',
            hardware: {
                identifiers: { bios_date: '20140101', cpu_name: 'i5-4590S' },
                windows: { memory: [{ Capacity: 4 * 1024 ** 3 }], osinfo: { Caption: 'Windows 10 Pro' } }
            }
        },
        {
            _id: 'sin2',
            hardware: {
                identifiers: { bios_date: '20230101', cpu_name: '13th Gen Intel i3-1315U' },
                windows: { memory: [{ Capacity: 8 * 1024 ** 3 }], osinfo: { Caption: 'Windows 11 Pro' } }
            }
        },
        {
            _id: 'sin3',
            hardware: {
                identifiers: { bios_date: '20210101', cpu_name: 'Intel i3-10100T' },
                windows: { memory: [{ Capacity: 4 * 1024 ** 3 }], osinfo: { Caption: 'Windows 10 Home' } }
            }
        }
    ];

    const fleet = assess.assessFleet(nodes, sysinfos);
    assert.equal(fleet.total, 3);
    assert.equal(fleet.win10Devices, 2);
    assert.equal(fleet.win11Already, 1);
    assert.ok(fleet.byRoom['ER']);
    assert.ok(fleet.byRoom['OPD']);
    assert.ok(Object.keys(fleet.budgetForecast).length >= 5);
});

test('acquisition year comes from the asset record, else the CPU launch year, and book value follows government straight-line to 1 baht', () => {
    const fa = require('../fleet-assess');
    assert.equal(fa.cpuLaunchYear('13th Gen Intel(R) Core(TM) i5-13420H'), 2023);
    assert.equal(fa.cpuLaunchYear('Intel(R) Core(TM) i3-4160 CPU @ 3.60GHz'), 2013);
    assert.equal(fa.cpuLaunchYear('Intel(R) Core(TM) i5-1135G7 @ 2.40GHz'), 2021);
    assert.equal(fa.cpuLaunchYear('AMD Ryzen 5 2400G with Radeon Vega Graphics'), 2018);
    assert.equal(fa.cpuLaunchYear('Intel(R) Core(TM)2 Duo CPU E7500'), 2008);
    assert.equal(fa.cpuLaunchYear('Something unknown'), null);
    assert.equal(fa.deviceClassOf('13th Gen Intel(R) Core(TM) i5-13420H'), 'notebook');
    assert.equal(fa.deviceClassOf('Intel(R) Core(TM) i5-10400 CPU'), 'desktop');
    const full = fa.depreciate(17000, Date.UTC(2015, 6, 1), 5, Date.UTC(2026, 0, 1));
    assert.equal(full.bookValue, 1);
    assert.equal(full.fullyDepreciated, true);
    const half = fa.depreciate(17001, Date.UTC(2020, 0, 1), 5, Date.UTC(2020, 0, 1) + 2.5 * 365.25 * 86400000);
    assert.equal(half.bookValue, 8501);
    const node = { _id: 'node//x', name: 'PC' };
    const si = { hardware: { identifiers: { cpu_name: 'Intel(R) Core(TM) i5-10400 CPU', bios_date: '20250101' }, windows: { memory: [{ Capacity: 8 * 1024 ** 3 }], osinfo: { Caption: 'Microsoft Windows 11 Pro' } } } };
    const byCpu = fa.assessDevice(node, si, null, null);
    assert.equal(byCpu.yearSource, 'cpu');
    assert.equal(byCpu.acquiredYearBE, 2563);
    assert.equal(byCpu.costSource, 'reference');
    const byAsset = fa.assessDevice(node, si, null, { fiscalYear: 2567, price: 21000 });
    assert.equal(byAsset.yearSource, 'asset');
    assert.equal(byAsset.acquiredYearBE, 2567);
    assert.equal(byAsset.costBasis, 21000);
    assert.equal(byAsset.costSource, 'asset');
});

test('book value uses the official MDES office price of the year a computer was acquired', () => {
    const fa = require('../fleet-assess');
    const ref = require('../../public/scripts/scp-price-reference');
    const c = fa.DEFAULT_CRITERIA;
    // figures read from the archived editions (catalog.json)
    assert.equal(ref.history.desktop[2564], 17000);
    assert.equal(ref.history.desktop[2566], 20000);
    assert.equal(ref.history.notebook[2566], 19000);
    assert.equal(ref.history.aio[2569], 22000);
    assert.equal(fa.referencePrice(c, 'desktop', 2565).price, 17000, '2565 has no edition of its own: December 2564 applies');
    assert.equal(fa.referencePrice(c, 'desktop', 2567).price, 20000, '2567 falls back to March 2566');
    assert.equal(fa.referencePrice(c, 'aio', 2558).price, 16000, 'no All-in-One item before 2561: office PC price of that year');
    assert.ok(ref.historySources['desktop:2566'].startsWith('mdes-6650'));
});

test('the read-only check drives SSD detection and spare-part advice with prices', () => {
    const fa = require('../fleet-assess');
    const node = { _id: 'n', name: 'PC' };
    const si = { hardware: { identifiers: { cpu_name: 'Intel(R) Core(TM) i5-10400 CPU', storage_devices: [{ Model: 'KINGSTON SA400S37240G' }] }, windows: { memory: [{ Capacity: 8 * 1024 ** 3 }], osinfo: { Caption: 'Microsoft Windows 11 Pro' } } } };
    // the model name alone does not say SSD; the computer's own answer does
    assert.equal(fa.assessDevice(node, si, null, null, null).diskHasSsd, false);
    const probe = { chassis: [3], disks: [{ model: 'KINGSTON SA400S37240G', media: 'SSD', bus: 'SATA', health: 'Healthy', system: true }], batteries: [], cmosResets: 2, throttle: 9 };
    const a = fa.assessDevice(node, si, null, null, probe);
    assert.equal(a.diskHasSsd, true);
    assert.equal(a.diskSource, 'probe');
    assert.deepEqual(a.maintenance.map(m => m.type), ['cmos', 'fan', 'ups']);
    assert.equal(a.maintenanceCost, 50 + 350, 'the optional UPS is not counted as needed');
    const failing = fa.assessDevice(node, si, { costs: { ssdUpgrade: 1800 } }, null, Object.assign({}, probe, { disks: [{ media: 'HDD', health: 'Warning', system: true }], cmosResets: 0, throttle: 0 }));
    assert.equal(failing.diskHasSsd, false);
    assert.equal(failing.maintenance[0].type, 'disk');
    assert.equal(failing.maintenance[0].cost, 1800);
    const fleet = fa.assessFleet([node], [Object.assign({ _id: 'sin' }, si)], null, null, null, { n: probe });
    assert.equal(fleet.maintenance.cmos, 1);
    assert.equal(fleet.maintenance.ups, 1);
    assert.equal(fleet.maintenance.upsCost, 2500);
});

test('plans count in Thai fiscal years, which start on 1 October', () => {
    const reference = require('../../public/scripts/scp-price-reference');
    assert.equal(reference.fiscalYearBE(new Date(2026, 8, 30)), 2569);
    assert.equal(reference.fiscalYearBE(new Date(2026, 9, 1)), 2570);
    assert.equal(reference.fiscalYearBE(new Date(2027, 8, 30)), 2570);
    const thisFY = reference.fiscalYearBE();
    // A budget year saved in an earlier fiscal year is stale and moves on to the current one.
    assert.equal(reference.resolveCriteria({}, { budgetYearBE: thisFY - 1 }).budgetYearBE, thisFY);
    assert.equal(reference.resolveCriteria({}, { budgetYearBE: thisFY + 1 }).budgetYearBE, thisFY + 1);
    assert.equal(reference.resolveCriteria({}, {}).budgetYearBE, thisFY);
    // Supported CPU, 4 GB RAM: an upgrade paid from this fiscal year's budget, and the
    // long-term replacement counted from the fiscal year, not the calendar year.
    const nodes = [{ _id: 'up', name: 'Upgrade', hardware: assessmentHardware('12th Gen Intel Core i3-1215U', 4, 'Windows 10 Pro') }];
    const fleet = assess.assessFleet(nodes, [], {});
    assert.equal(fleet.budgetYearBE, thisFY);
    assert.equal(fleet.devices[0].recommendation, 'upgrade');
    assert.equal(fleet.devices[0].replaceByYear, thisFY - 543 + 2);
    assert.ok(fleet.budget.currentYear.upgrade > 0, 'the upgrade is budgeted in the current fiscal year');
    const browser = {};
    for (const file of ['scp-price-reference.js', 'scp-assess.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/scripts', file), 'utf8'), { window: browser });
    const local = browser.ScpFleetAssess.assessFleet(nodes, {});
    assert.equal(local.budgetYearBE, thisFY);
    assert.ok(local.devices[0].replacementYear >= thisFY - 543, 'no plan year falls before the current fiscal year');
    assert.ok(Object.keys(local.devices[0].survival).includes(String(thisFY - 543)));
});

test('AMD Ryzen 2000: only the Zen+ desktop chips run Windows 11', () => {
    const cases = {
        'AMD Ryzen 5 2600 Six-Core Processor': true,
        'AMD Ryzen 7 2700X Eight-Core Processor': true,
        'AMD Ryzen 3 2300X Quad-Core Processor': true,
        'AMD Ryzen 5 2400G with Radeon Vega Graphics': false,
        'AMD Ryzen 3 2200G with Radeon Vega Graphics': false,
        'AMD Ryzen 5 PRO 2400GE w/ Radeon Vega Graphics': false,
        'AMD Ryzen 5 2500U with Radeon Vega Mobile Gfx': false,
        'AMD Ryzen 7 2700U with Radeon Vega Mobile Gfx': false,
        'AMD Ryzen 5 1600 Six-Core Processor': false,
        'AMD Ryzen 5 3500U with Radeon Vega Mobile Gfx': true,
        'AMD Ryzen 5 3400G with Radeon Vega Graphics': true
    };
    for (const [name, ok] of Object.entries(cases)) {
        assert.equal(assess.evaluateCpu(name).supported, ok, name);
    }
    const window = { ScpPriceReference: require('../../public/scripts/scp-price-reference') };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-assess.js'), 'utf8'), { window });
    for (const [name, ok] of Object.entries(cases)) {
        const n = { _id: 'x', name: 'x', hardware: assessmentHardware(name, 8, 'Windows 10 Pro') };
        assert.equal(window.ScpFleetAssess.assessDevice(n).cpuEval.supported, ok, 'browser: ' + name);
    }
});
