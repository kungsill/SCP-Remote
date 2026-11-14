package th.sichomphu.scpremote.net

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.protocol.ControlMessages
import th.sichomphu.scpremote.protocol.KvmMessages
import java.security.SecureRandom

/**
 * A file channel to one computer through the relay (protocol 5), opened the way the desktop
 * session is (authcookie → relay → tunnel request → "c" → "5"), kept alive with the same rtt.
 */
class FilesSession(
    private val control: ControlChannel,
    private val trust: PinnedTrust,
    private val device: Device,
    private val baseUrl: String,
    private val opener: SocketOpener = SocketOpener { r, l -> trust.clientFor(r.url.host).newWebSocket(r, l) },
) {
    @Volatile private var socket: WebSocket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val ready = CompletableDeferred<Unit>()

    val transfer = FileTransfer(
        sendText = { socket?.send(it) },
        sendBinary = { socket?.send(it.toByteString()) },
    )

    /** Opens the channel; throws FileTransfer.TransferError("REFUSED" / "CLOSED") or a timeout. */
    suspend fun open() {
        val (cookie, rcookie) = control.authCookie()
        val tunnelId = (1..16).map { CHARS[RANDOM.nextInt(CHARS.length)] }.joinToString("")
        val url = ControlMessages.relayUrl(baseUrl, device.id, tunnelId, cookie, viewOnly = false, protocol = 5)
        socket = opener.open(Request.Builder().url(url).build(), Relay())
        control.send(ControlMessages.tunnelRequest(device.id, tunnelId, rcookie, viewOnly = false, protocol = 5))
        withTimeout(OPEN_TIMEOUT_MS) { ready.await() }
    }

    fun close() {
        socket?.close(1000, null)
        socket = null
        transfer.fail()
        scope.cancel()
    }

    private inner class Relay : WebSocketListener() {
        private var linked = false

        override fun onOpen(webSocket: WebSocket, response: Response) {
            scope.launch { while (isActive) { webSocket.send(KvmMessages.rtt(System.currentTimeMillis())); delay(SessionPolicy.KEEPALIVE_MS) } }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (!linked && (text == "c" || text == "cr")) {
                linked = true
                webSocket.send("5")
                ready.complete(Unit)
                return
            }
            val m = try { JSONObject(text) } catch (e: Exception) { null }
            if (m != null && m.optString("ctrlChannel") == "102938") {
                if (m.optString("type") == "console" && m.optInt("msgid") == 2) ready.completeExceptionally(FileTransfer.TransferError("REFUSED"))
                return
            }
            if (linked) transfer.onFrame(text.toByteArray(Charsets.UTF_8))
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            if (linked) transfer.onFrame(bytes.toByteArray())
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null) }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = ended()
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = ended()

        private fun ended() {
            ready.completeExceptionally(FileTransfer.TransferError("CLOSED"))
            transfer.fail()
        }
    }

    private companion object {
        const val OPEN_TIMEOUT_MS = 60_000L
        const val CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
        val RANDOM = SecureRandom()
    }
}
