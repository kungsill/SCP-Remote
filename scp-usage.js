/**
* @description SCP-Remote active use recorder
* @author Sichomphu Hospital IT
* @copyright Intel Corporation 2018-2022
* @license Apache-2.0
* @version v0.0.1
*/

/*jslint node: true */
/*jshint node: true */
/*jshint strict:false */
/*jshint -W097 */
/*jshint esversion: 6 */
'use strict';

/*
A computer left switched on overnight and a computer somebody is working at look exactly
the same to a power log: both are "on". This tells them apart.

The agent already reports how many seconds it has been since the last key press or mouse
movement, once every five minutes, and the server already saves the device record on that
same beat. So the tally is kept on the device record itself and rides along with a write
that was happening anyway: no second database, no extra writes, no new command for the
browser to call, and it is carried by the existing backup and restore without change.
*/
module.exports.CreateScpUsage = function (parent) {
    const obj = {};
    obj.parent = parent;

    // How often the agent reports, and therefore how much time one sample speaks for.
    const expectedGapSeconds = 300;

    // The most any single sample may claim. An agent that was switched off over the weekend
    // reports again on Monday with a three-day gap behind it; without this, that whole gap
    // would be credited as time somebody spent working.
    const mostGapCredited = 900;

    // A fortnight. The dashboard looks back a week; the rest is headroom for a report run
    // late, and it keeps the device record small — fourteen numbers.
    const daysKept = 14;

    function pad(value) { return (value < 10 ? '0' : '') + value; }

    // A local date, because a hospital day is a local day. Tallies are compared against
    // wards and shifts, not against UTC.
    obj.dayKey = function (when) {
        const day = new Date(when);
        return '' + day.getFullYear() + pad(day.getMonth() + 1) + pad(day.getDate());
    };

    /*
    Fold one idle-time report into the device's daily tally. Returns true when the record
    was touched, so the caller can mark the device as changed.
    */
    obj.sample = function (device, idleSeconds, now) {
        if ((device == null) || (typeof device !== 'object')) return false;
        if ((typeof idleSeconds !== 'number') || !isFinite(idleSeconds) || (idleSeconds < 0)) return false;
        if (now == null) { now = Date.now(); }

        var record = device.scpuse;
        if ((record == null) || (typeof record !== 'object') || (typeof record.days !== 'object') || (record.days == null)) {
            record = { at: 0, days: {} };
        }

        // How much time this report speaks for. The first report after a restart has no
        // predecessor, so assume one reporting interval rather than crediting nothing.
        var gap = (record.at > 0) ? ((now - record.at) / 1000) : expectedGapSeconds;
        if (!(gap > 0)) return false;   // the clock moved backwards, or two reports landed together
        if (gap > mostGapCredited) { gap = mostGapCredited; }

        // The agent says the last key press or mouse movement was idleSeconds ago. Everything
        // in this window before that moment was time somebody was at the machine.
        var active = gap - idleSeconds;
        if (active < 0) { active = 0; }
        if (active > gap) { active = gap; }

        // Credited to the day the activity ended. A stretch running over midnight lands on
        // the later day — wrong by at most one interval, and it keeps the arithmetic plain
        // enough to explain to somebody reading the dashboard.
        const key = obj.dayKey(now);
        record.days[key] = Math.round((record.days[key] || 0) + active);
        record.at = now;

        const days = Object.keys(record.days);
        if (days.length > daysKept) {
            days.sort();   // day keys are YYYYMMDD, so this is chronological
            days.slice(0, days.length - daysKept).forEach(function (old) { delete record.days[old]; });
        }

        device.scpuse = record;
        return true;
    };

    /*
    Hours somebody was actually at this machine over the last few days, counting whole days
    back from today. Null when nothing has been recorded yet, which reads differently from
    zero: one means "not measured", the other means "nobody touched it".
    */
    obj.activeHours = function (device, days, now) {
        if ((device == null) || (device.scpuse == null) || (device.scpuse.days == null)) return null;
        if (now == null) { now = Date.now(); }
        const wanted = {};
        for (var back = 0; back < days; back++) { wanted[obj.dayKey(now - (back * 86400000))] = true; }
        var seconds = 0, found = false;
        Object.keys(device.scpuse.days).forEach(function (key) {
            if (wanted[key] !== true) return;
            found = true;
            seconds += Number(device.scpuse.days[key]) || 0;
        });
        return found ? (seconds / 3600) : null;
    };

    return obj;
};
