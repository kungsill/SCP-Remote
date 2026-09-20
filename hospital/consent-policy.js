'use strict';
// A server-owned allowlist; role names and client-provided options never grant this exception.
exports.canConnectUnattended = function (domain, user) {
    return !!(domain && user && user.siteadmin === 0xFFFFFFFF && user.domain === domain.id &&
        Array.isArray(domain.unattendedadmins) && domain.unattendedadmins.indexOf(user._id) !== -1);
};
exports.apply = function (command, domain, user) {
    if (!command || command.type !== 'tunnel') return;
    if (command.soptions) delete command.soptions.scpUnattended;
    if (typeof command.guestname === 'string' && command.guestname.indexOf('SCP-App: ') === 0) {
        command.consent = (command.consent || 0) | 8 | 32 | 1 | 4 | 64;
        command.soptions = command.soptions || {};
        Object.keys(command.soptions).forEach(function(key){if(key.indexOf('consentAutoAccept')===0)command.soptions[key]=false;});
        command.soptions.consentTimeout = 60;
        command.soptions.oldStyle = false;
        if(typeof command.value==='string'&&command.value.indexOf('scpnomux=')===-1)command.value+='&scpnomux=1';
        return;
    }
    if (!exports.canConnectUnattended(domain, user) || command.guestname != null || command.guestuserid != null) return;
    command.consent = (command.consent || 0) & ~(8 | 16 | 32);
    if (!command.soptions) command.soptions = {};
    command.soptions.scpUnattended = true;
};
