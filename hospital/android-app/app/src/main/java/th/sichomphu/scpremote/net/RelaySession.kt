package th.sichomphu.scpremote.net

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.protocol.ControlMessages
import th.sichomphu.scpremote.protocol.KvmCommand
import th.sichomphu.scpremote.protocol.KvmFramer
import th.sichomphu.scpremote.protocol.KvmMessages
import java.security.SecureRandom

/**
 * One remote-desktop session through the server's relay, as the web page opens it:
 * authcookie → open meshrelay.ashx → tunnel request to the agent → on "c"/"cr" send "2", the
 * picture settings and a refresh. Keeps the link alive with an rtt message every 10 s.
 * Listener calls arrive on a background thread.
 */
class RelaySession(
    private val control: ControlChannel,
    private val trust: PinnedTrust,
    private val device: Device,
    private val listener: Listener,
    private val baseUrl: String,
    initialQuality: IntArray = intArrayOf(4, 70, 1024, 100),
    private val opener: SocketOpener = SocketOpener { r, l -> trust.clientFor(r.url.host).newWebSocket(r, l) },
) {
    enum class State { CONNECTING, WAITING_CONSENT, CONNECTED, REFUSED, CLOSED }

    interface Listener {
        fun onState(state: State)
        fun onCommand(cmd: KvmCommand)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val framer = KvmFramer(::received)
    /** Picture settings [encoding, quality, scaling, frame ms] sent when the session opens. */
    @Volatile private var quality: IntArray = initialQuality
    @Volatile private var socket: WebSocket? = null
    @Volatile private var keepAlive: Job? = null
    @Volatile var state: State = State.CONNECTING; private set
    /** A picture tile arrived: a later drop counts as a drop, not a failure to connect. */
    @Volatile var hadImage = false; private set
    @Volatile var userClosed = false; private set
    @Volatile var refused = false; private set

    fun start() {
        setState(State.CONNECTING)
        scope.launch {
            try {
                val (cookie, rcookie) = control.authCookie()
                val tunnelId = tunnelId()
                val viewOnly = device.viewOnly
                val url = ControlMessages.relayUrl(baseUrl, device.id, tunnelId, cookie, viewOnly)
                socket = opener.open(Request.Builder().url(url).build(), Relay())
                control.send(ControlMessages.tunnelRequest(device.id, tunnelId, rcookie, viewOnly))
            } catch (e: Exception) {
                setState(State.CLOSED)
            }
        }
    }

    /** Sends one desktop-channel message (input, picture settings…); dropped unless connected. */
    fun send(bytes: ByteArray) {
        if (state == State.CONNECTED) socket?.send(bytes.toByteString())
    }

    /** Changes the picture settings on the open session: compression then a full refresh. */
    fun setQuality(q: IntArray) {
        quality = q
        send(KvmMessages.compression(q[0], q[1], q[2], q[3]))
        send(KvmMessages.refresh())
    }

    fun close(userInitiated: Boolean) {
        if (userInitiated) userClosed = true
        keepAlive?.cancel()
        socket?.close(1000, null)
        socket = null
        if (state != State.REFUSED) setState(State.CLOSED)
        scope.cancel()
    }

    private fun setState(s: State) {
        if (state == s && s != State.CONNECTING) return
        if (state == State.CLOSED && s != State.CONNECTING) return
        state = s
        listener.onState(s)
    }

    private fun received(cmd: KvmCommand) {
        when (cmd) {
            is KvmCommand.ScreenSize -> {
                // As the web page: let the agent know touch is fine, and release any stuck modifiers.
                send(KvmMessages.touchInitAck())
                for (vk in intArrayOf(16, 17, 18, 91, 92, 16)) send(KvmMessages.key(false, vk))
            }
            is KvmCommand.Tile -> hadImage = true
            else -> {}
        }
        listener.onCommand(cmd)
    }

    private fun startKeepAlive(ws: WebSocket) {
        keepAlive?.cancel()
        keepAlive = scope.launch {
            while (isActive) {
                ws.send(KvmMessages.rtt(System.currentTimeMillis()))
                delay(SessionPolicy.KEEPALIVE_MS)
            }
        }
    }

    private inner class Relay : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) = startKeepAlive(webSocket)

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (state != State.CONNECTED && (text == "c" || text == "cr")) {
                webSocket.send("2")
                state = State.CONNECTED
                val q = quality
                webSocket.send(KvmMessages.compression(q[0], q[1], q[2], q[3]).toByteString())
                webSocket.send(KvmMessages.refresh().toByteString())
                listener.onState(State.CONNECTED)
                return
            }
            val m = try { JSONObject(text) } catch (e: Exception) { return }
            if (m.optString("ctrlChannel") != "102938") return
            when (m.optString("type")) {
                "console" -> when (m.optInt("msgid")) {
                    1 -> if (!hadImage) setState(State.WAITING_CONSENT)
                    2 -> { refused = true; setState(State.REFUSED) }
                }
                "ping" -> webSocket.send("{\"ctrlChannel\":\"102938\",\"type\":\"pong\"}")
            }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            if (state == State.CONNECTED) framer.feed(bytes.toByteArray())
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null) }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = ended(webSocket)
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = ended(webSocket)

        private fun ended(webSocket: WebSocket) {
            if (socket != null && socket !== webSocket) return
            keepAlive?.cancel()
            socket = null
            if (state != State.REFUSED) setState(State.CLOSED)
        }
    }

    private companion object {
        val random = SecureRandom()
        fun tunnelId(): String {
            val chars = "abcdefghijklmnopqrstuvwxyz0123456789"
            return (1..16).map { chars[random.nextInt(chars.length)] }.joinToString("")
        }
    }
}
