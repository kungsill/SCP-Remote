'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const assess = require('../fleet-assess');

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
