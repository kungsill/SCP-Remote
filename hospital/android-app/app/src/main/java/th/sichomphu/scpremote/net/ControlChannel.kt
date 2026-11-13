package th.sichomphu.scpremote.net

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import th.sichomphu.scpremote.model.DeviceList
import th.sichomphu.scpremote.model.FixResult
import th.sichomphu.scpremote.protocol.ControlMessages
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * A failure the app shows to the person: BAD_LOGIN, CERT_MISMATCH, UNREACHABLE, DISCONNECTED,
 * TIMEOUT, or a server operation's own code.
 */
class ControlError(val code: String) : Exception(code)

/** Opens a websocket; tests pass a fake, the app uses the pinned OkHttp client for the host. */
fun interface SocketOpener {
    fun open(request: Request, listener: WebSocketListener): WebSocket
}

/** The signed-in connection to the server's control.ashx: device list, cookies, printer fix. */
class ControlChannel(
    private val baseUrl: String,
    private val trust: PinnedTrust,
    private val opener: SocketOpener = SocketOpener { r, l -> trust.clientFor(r.url.host).newWebSocket(r, l) },
) {
    private val tags = AtomicInteger(0)
    private val pending = ConcurrentHashMap<Int, CompletableDeferred<JSONObject>>()
    private val cookieWaiters = java.util.concurrent.ConcurrentLinkedQueue<CompletableDeferred<JSONObject>>()
    @Volatile private var socket: WebSocket? = null
    @Volatile private var signedIn: CompletableDeferred<Unit>? = null

    /** Called when an open connection drops after sign-in (to return to the sign-in screen). */
    @Volatile var onDisconnected: (() -> Unit)? = null

    suspend fun signIn(user: String, pass: String): Result<Unit> {
        close()
        val ready = CompletableDeferred<Unit>()
        signedIn = ready
        val request = Request.Builder()
            .url(baseUrl.trimEnd('/') + "/control.ashx")
            .header("x-meshauth", ControlMessages.authHeader(user, pass))
            .build()
        try {
            socket = opener.open(request, Listener(ready))
        } catch (e: Exception) {
            return Result.failure(ControlError(failureCode(e)))
        }
        return try {
            withTimeout(SIGN_IN_TIMEOUT_MS) { ready.await() }
            Result.success(Unit)
        } catch (e: ControlError) {
            close(); Result.failure(e)
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            close(); Result.failure(ControlError("UNREACHABLE"))
        }
    }

    suspend fun devices(): DeviceList =
        ControlMessages.parseDevices(request("appDevices", emptyMap(), OP_TIMEOUT_MS).getJSONObject("result").toString())

    /** (cookie, rcookie) for opening a relay as this account. */
    suspend fun authCookie(): Pair<String, String> {
        val waiter = CompletableDeferred<JSONObject>()
        cookieWaiters.add(waiter)
        sendOrFail(ControlMessages.authCookieRequest()) { cookieWaiters.remove(waiter) }
        val r = try { withTimeout(OP_TIMEOUT_MS) { waiter.await() } } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            cookieWaiters.remove(waiter); throw ControlError("TIMEOUT")
        }
        return r.optString("cookie") to r.optString("rcookie")
    }

    /** Runs the server's fixed printer fix on [nodeId]; the server allows up to 75 s for the answer. */
    suspend fun fixPrinter(nodeId: String): FixResult {
        val r = try {
            request("fixPrinter", mapOf("nodeid" to nodeId), FIX_TIMEOUT_MS)
        } catch (e: ControlError) {
            return FixResult(false, null, null, null, if (e.code == "TIMEOUT") "NO_ANSWER" else e.code)
        }
        if (r.has("error")) return FixResult(false, null, null, null, r.optString("error"))
        val res = r.optJSONObject("result") ?: return FixResult(false, null, null, null, "NO_RESULT")
        fun int(k: String) = if (res.has(k) && !res.isNull(k)) res.optInt(k) else null
        return FixResult(res.optBoolean("ok"), int("before"), int("after"), res.optString("spooler").ifEmpty { null }, null)
    }

    fun send(json: String) { socket?.send(json) }

    fun close() {
        val s = socket
        socket = null
        signedIn = null
        s?.close(1000, null)
        failAll(ControlError("DISCONNECTED"))
    }

    private suspend fun request(op: String, extra: Map<String, Any?>, timeoutMs: Long): JSONObject {
        val tag = tags.incrementAndGet()
        val waiter = CompletableDeferred<JSONObject>()
        pending[tag] = waiter
        sendOrFail(ControlMessages.scpops(tag, op, extra)) { pending.remove(tag) }
        val r = try { withTimeout(timeoutMs) { waiter.await() } } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            pending.remove(tag); throw ControlError("TIMEOUT")
        }
        if (op != "fixPrinter" && r.has("error")) throw ControlError(r.optString("error"))
        return r
    }

    private inline fun sendOrFail(json: String, undo: () -> Unit) {
        val s = socket
        if (s == null || !s.send(json)) { undo(); throw ControlError("DISCONNECTED") }
    }

    private fun failAll(e: ControlError) {
        pending.values.forEach { it.completeExceptionally(e) }; pending.clear()
        while (true) { (cookieWaiters.poll() ?: break).completeExceptionally(e) }
    }

    private fun failureCode(t: Throwable): String {
        var c: Throwable? = t
        while (c != null) { if (c is CertMismatch) return "CERT_MISMATCH"; c = c.cause }
        return "UNREACHABLE"
    }

    /** One sign-in attempt; callbacks from an older attempt's socket are ignored. */
    private inner class Listener(private val ready: CompletableDeferred<Unit>) : WebSocketListener() {
        @Volatile private var welcomed = false
        private fun current() = signedIn === ready
        private fun welcome() { if (ready.complete(Unit)) welcomed = true }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (!current()) return
            val m = try { JSONObject(text) } catch (e: Exception) { return }
            when (m.optString("action")) {
                "close" -> ready.completeExceptionally(ControlError("BAD_LOGIN"))
                "scpops" -> { welcome(); pending.remove(m.optInt("tag", -1))?.complete(m) }
                "authcookie" -> { welcome(); cookieWaiters.poll()?.complete(m) }
                else -> welcome()
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = ended(ControlError(failureCode(t)))
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = ended(ControlError("UNREACHABLE"))

        private fun ended(e: ControlError) {
            if (!current()) return
            ready.completeExceptionally(e)
            socket = null
            failAll(ControlError("DISCONNECTED"))
            if (welcomed) onDisconnected?.invoke()
        }
    }

    private companion object {
        const val SIGN_IN_TIMEOUT_MS = 15_000L
        const val OP_TIMEOUT_MS = 30_000L
        const val FIX_TIMEOUT_MS = 90_000L
    }
}
