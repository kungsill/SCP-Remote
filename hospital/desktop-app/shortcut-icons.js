'use strict';
/* Points this program's desktop and Start-menu shortcuts at the current logo.
 *
 * Shortcuts take their picture from SCP-Remote.exe, and an update replaces only the program's
 * inner files, never the .exe. So when the logo changes, every shortcut keeps the old picture
 * until someone reinstalls. On start the program copies its icon to a lasting place (its data
 * folder, not the versioned update folder, which a later update removes) and points its own
 * shortcuts there. Only the icon changes; target and arguments stay. A shortcut it may not
 * change, such as one on the all-users desktop, is skipped.
 */
const fs = require('fs');
const path = require('path');

const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** True when [link] starts this program and does not already show [icon]. */
function needsIcon(link, exe, icon) {
    if (!link || !same(link.target, exe)) return false;
    return !same(link.icon, icon);
}

/** Returns the shortcuts it changed. */
function refresh({ shell, dirs, exe, iconSource, stableIcon }) {
    if (!fs.existsSync(iconSource)) return [];
    try {
        const fresh = fs.readFileSync(iconSource);
        if (!fs.existsSync(stableIcon) || !fresh.equals(fs.readFileSync(stableIcon))) fs.writeFileSync(stableIcon, fresh);
    } catch (e) { return []; }
    const fixed = [];
    for (const dir of dirs) {
        let names;
        try { names = fs.readdirSync(dir); } catch (e) { continue; }
        for (const name of names) {
            if (!/\.lnk$/i.test(name)) continue;
            const file = path.join(dir, name);
            try {
                if (!needsIcon(shell.readShortcutLink(file), exe, stableIcon)) continue;
                if (shell.writeShortcutLink(file, 'update', { icon: stableIcon, iconIndex: 0 })) fixed.push(file);
            } catch (e) { /* not a shortcut, or not ours to change */ }
        }
    }
    return fixed;
}

module.exports = { needsIcon, refresh };
