// A clipboard helper belongs to one consented file tunnel. Never shared between guests.
module.exports = { create: function (ws) {
    var payload = require('win-scp-clipboard-payload');
    var sessions = require('user-sessions');
    var uid = (typeof ws.tsid === 'number') ? ws.tsid : sessions.consoleUid();
    var username = sessions.getUsername(uid), domain = sessions.getDomain(uid);
    if (!username) { throw new Error('NO_INTERACTIVE_USER'); }
    var state = { socket: null, queue: [], pending: {}, closed: false, buffer: '' };
    function respond(data) { if (!state.closed) { data.action = 'scpclip'; ws.write(JSON.stringify(data)); } }
    function fail(reason) {
        for (var id in state.pending) { respond({ id: Number(id), ok: false, error: reason }); }
        state.close();
    }
    state.close = function () {
        if (state.closed) { return; } state.closed = true;
        clearTimeout(state.timer);
        if (state.socket) { try { state.socket.end(); } catch (e) {} }
        if (state.dispatcher) { try { state.dispatcher.close(); } catch (e) {} }
        state.queue = []; state.pending = {};
    };
    state.send = function (cmd) {
        if (state.closed) { throw new Error('HELPER_CLOSED'); }
        if (typeof cmd.id !== 'number' || cmd.id < 1 || cmd.id > 2147483647 || state.pending[cmd.id]) { throw new Error('INVALID_REQUEST'); }
        if (['state', 'snapshot', 'read', 'prepare', 'write', 'commit', 'abort', 'text'].indexOf(cmd.op) < 0) { throw new Error('INVALID_OPERATION'); }
        var line = JSON.stringify(cmd);
        if (line.length > 4194304 || Object.keys(state.pending).length >= 4) { throw new Error('REQUEST_TOO_LARGE'); }
        state.pending[cmd.id] = true;
        if (state.ready) { state.dispatcher.invoke('send', [line]); } else { state.queue.push(line); }
    };
    state.dispatcher = require('win-dispatcher').dispatch({ user: domain + '\\' + username,
        modules: [{ name: 'scp-clipboard-launch', script: payload.launch }],
        launch: { module: 'scp-clipboard-launch', method: 'launch', args: [payload.payload, payload.sha256] } });
    state.timer = setTimeout(function () { fail('HELPER_START_TIMEOUT'); }, 30000);
    state.dispatcher.on('connection', function (socket) {
        if (state.closed) { socket.end(); return; }
        state.socket = socket;
        socket.on('data', function (data) {
            state.buffer += data.toString();
            if (state.buffer.length > 4194304) { fail('HELPER_RESPONSE_TOO_LARGE'); return; }
            var end;
            while ((end = state.buffer.indexOf('\n')) >= 0) {
                var line = state.buffer.substring(0, end); state.buffer = state.buffer.substring(end + 1);
                try {
                    var reply = JSON.parse(line);
                    if (reply.ready === true && !state.ready) {
                        clearTimeout(state.timer); state.ready = true;
                        for (var i = 0; i < state.queue.length; i++) { state.dispatcher.invoke('send', [state.queue[i]]); } state.queue = [];
                    } else if (state.pending[reply.id]) { delete state.pending[reply.id]; respond(reply); }
                } catch (e) { fail('HELPER_INVALID_RESPONSE'); return; }
            }
        });
        socket.on('end', function () { fail('HELPER_DISCONNECTED'); });
        socket.on('error', function () { fail('HELPER_FAILED'); });
    });
    return state;
} };
