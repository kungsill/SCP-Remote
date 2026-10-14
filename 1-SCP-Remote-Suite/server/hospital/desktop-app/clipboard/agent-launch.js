// Executed by win-dispatcher in the interactive Windows user's session.
module.exports = { launch: function (payload, expectedHash) {
    var fs = require('fs'), bytes = Buffer.from(payload, 'base64');
    if (require('SHA256Stream').create().syncHash(bytes).toString('hex').toLowerCase() !== expectedHash) { throw new Error('HELPER_HASH_MISMATCH'); }
    var root = process.env.LOCALAPPDATA + '\\SCP-Remote';
    if (!fs.existsSync(root)) { fs.mkdirSync(root); }
    var dir = root + '\\ClipboardHost';
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir); }
    // Content-addressed filename allows an in-flight old helper to finish.
    var exe = dir + '\\ClipboardHost-' + expectedHash + '.exe';
    if (!fs.existsSync(exe) || require('SHA256Stream').create().syncHash(fs.readFileSync(exe)).toString('hex').toLowerCase() !== expectedHash) { fs.writeFileSync(exe, bytes); }
    // Use an explicit duplex named pipe. The legacy agent's child stdin does
    // not reliably deliver subsequent writes to a managed Console.ReadLine.
    var name = 'scp-clipboard-' + process.pid + '-';
    for (var i = 0; i < 8; i++) { name += require('tls').generateRandomInteger('1000', '9999'); }
    var bridge = new (require('stream').Duplex)({ write: function (chunk, flush) { flush(); return true; } });
    bridge.server = require('net').createServer();
    bridge.server.listen({ path: '\\\\.\\pipe\\' + name });
    bridge.server.once('connection', function (socket) {
        bridge.socket = socket; bridge.server.close();
        socket.on('data', function (data) { bridge.push(data); });
        socket.on('end', function () { bridge.push(null); });
        socket.on('error', function () { bridge.push(null); });
    });
    bridge.send = function (line) { if (!bridge.socket) { throw new Error('HELPER_NOT_READY'); } bridge.socket.write(line + '\n'); };
    bridge.child = require('child_process').execFile(exe, [exe, '--pipe', name], { windowsHide: true });
    bridge.child.stderr.on('data', function () {});
    bridge.child.stdout.on('data', function () {});
    return bridge;
} };
