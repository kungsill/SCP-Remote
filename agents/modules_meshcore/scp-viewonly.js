// SCP-Remote: permit only display configuration on a picture-only tunnel.
// Input, remote locking, unknown commands and malformed/concatenated payloads fail closed.
module.exports.isDisplayPacket = function (data) {
    if (!Buffer.isBuffer(data) || data.length < 4) return false;
    var sizes = { 5: 10, 6: 4, 8: 5, 11: 4, 12: 6, 14: 4, 82: 4 };
    var offset = 0;
    while (offset < data.length) {
        if ((data.length - offset) < 4) return false;
        var command = data.readUInt16BE(offset), size = data.readUInt16BE(offset + 2);
        if (sizes[command] !== size || offset + size > data.length) return false;
        offset += size;
    }
    return true;
};
