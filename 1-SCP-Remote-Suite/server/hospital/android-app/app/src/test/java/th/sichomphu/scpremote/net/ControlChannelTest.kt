package th.sichomphu.scpremote.net

import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import th.sichomphu.scpremote.model.FixResult
import java.io.IOException
import javax.net.ssl.SSLHandshakeException

/** A control.ashx stand-in: [onOpen] plays the server's side of the connection, [reply] answers sends. */
private class FakeServer(
    val onOpen: (WebSocket, WebSocketListener) -> Unit,
    val reply: (JSONObject) -> String? = { null }
) : SocketOpener {
    val requests = mutableListOf<Request>()
    val sent = mutableListOf<String>()
    lateinit var listener: WebSocketListener
    lateinit var socket: WebSocket

    override fun open(request: Request, listener: WebSocketListener): WebSocket {
        requests.add(request); this.listener = listener
        val req = request
        socket = object : WebSocket {
            override fun request() = req
            override fun queueSize() = 0L
            override fun send(text: String): Boolean {
                sent.add(text); reply(JSONObject(text))?.let { listener.onMessage(this, it) }; return true
            }
            override fun send(bytes: ByteString) = true
            override fun close(code: Int, reason: String?) = true
            override fun cancel() {}
        }
        onOpen(socket, listener)
        return socket
    }
}

class ControlChannelTest {
    private val trust = PinnedTrust("00")
    private val welcome: (WebSocket, WebSocketListener) -> Unit = { ws, l -> l.onMessage(ws, """{"action":"serverinfo","serverinfo":{}}""") }

    private fun codeOf(r: Result<Unit>) = (r.exceptionOrNull() as ControlError).code

    @Test fun signInOpensControlAshxWithTheAuthHeader() = runBlocking {
        val fake = FakeServer(welcome)
        val ch = ControlChannel("https://192.168.2.25:8443", trust, fake)
        assertTrue(ch.signIn("admin", "p@ss").isSuccess)
        assertEquals("https://192.168.2.25:8443/control.ashx", fake.requests[0].url.toString())
        assertEquals("YWRtaW4=,cEBzcw==", fake.requests[0].header("x-meshauth"))
    }

    // Review Focus 2: a certificate that is not the pinned one ends sign-in as CERT_MISMATCH, with no
    // second attempt through any other client (the pinned trust manager stops the handshake before
    // the upgrade request is written — see PinnedTrustTest).
    @Test fun certificateMismatchIsReportedAndNotRetried() = runBlocking {
        val fake = FakeServer({ ws, l -> l.onFailure(ws, SSLHandshakeException("x").apply { initCause(CertMismatch()) }, null) })
        val r = ControlChannel("https://192.168.2.25:8443", trust, fake).signIn("admin", "p@ss")
        assertEquals("CERT_MISMATCH", codeOf(r))
        assertEquals(1, fake.requests.size)
    }

    @Test fun wrongPasswordIsBadLogin() = runBlocking {
        val fake = FakeServer({ ws, l -> l.onMessage(ws, """{"action":"close","cause":"noauth","msg":"noauth"}"""); l.onClosed(ws, 1000, "") })
        assertEquals("BAD_LOGIN", codeOf(ControlChannel("https://h:1", trust, fake).signIn("a", "b")))
    }

    @Test fun networkFailureIsUnreachable() = runBlocking {
        val fake = FakeServer({ ws, l -> l.onFailure(ws, IOException("no route"), null) })
        assertEquals("UNREACHABLE", codeOf(ControlChannel("https://h:1", trust, fake).signIn("a", "b")))
    }

    @Test fun devicesAsksForAppDevicesAndParsesTheReply() = runBlocking {
        val fake = FakeServer(welcome) { m ->
            if (m.optString("op") == "appDevices")
                """{"action":"scpops","tag":${m.getInt("tag")},"result":{"user":{"name":"n"},"groups":[],"devices":[]}}"""
            else null
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals("n", ch.devices().userName)
    }

    // The real server (meshuser.js:777-779) only answers string tags, and echoes them back as strings.
    @Test fun worksAgainstAServerThatOnlyAcceptsStringTags() = runBlocking {
        val fake = FakeServer(welcome) { m ->
            val tag = m.opt("tag")
            if (tag !is String) null
            else """{"action":"scpops","tag":${JSONObject.quote(tag)},"result":{"user":{"name":"n"},"groups":[],"devices":[]}}"""
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals("n", ch.devices().userName)
    }

    @Test fun repliesAreMatchedByTag() = runBlocking {
        // The server answers with a different tag first; only the matching one completes the call.
        val fake = FakeServer(welcome) { m ->
            val tag = m.getInt("tag")
            """{"action":"scpops","tag":${tag + 100},"result":{"ok":false}}"""
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        val call = async { ch.fixPrinter("node//x") }
        delay(100)
        assertTrue(call.isActive)
        val tag = JSONObject(fake.sent.last()).getInt("tag")
        fake.listener.onMessage(fake.socket, """{"action":"scpops","tag":$tag,"result":{"ok":true,"before":2,"after":0,"spooler":"Running"}}""")
        assertEquals(FixResult(true, 2, 0, "Running", null), call.await())
    }

    @Test fun fixPrinterErrorIsReported() = runBlocking {
        val fake = FakeServer(welcome) { m -> """{"action":"scpops","tag":${m.getInt("tag")},"error":"ACCESS_DENIED"}""" }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals(FixResult(false, null, null, null, "ACCESS_DENIED"), ch.fixPrinter("node//x"))
        val req = JSONObject(fake.sent.last())
        assertEquals("fixPrinter", req.getString("op")); assertEquals("node//x", req.getString("nodeid"))
    }

    @Test fun clipboardTextComesBackForThatComputer() = runBlocking {
        val fake = FakeServer(welcome) { m ->
            if (m.optString("type") == "getclip")
                """{"action":"msg","type":"getclip","nodeid":"${m.getString("nodeid")}","tag":${m.getInt("tag")},"data":"ข้อความจากคอม"}"""
            else null
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals("ข้อความจากคอม", ch.getClipboard("node//x"))
    }

    // The hospital blocks restarting computers marked critical (meshuser.js MAINTENANCE_WORKFLOW_REQUIRED).
    @Test fun powerActionReportsTheServersRefusal() = runBlocking {
        val fake = FakeServer(welcome) { m ->
            if (m.optString("action") == "poweraction")
                """{"action":"poweraction","responseid":"${m.getString("responseid")}","nodeid":"node//x","result":"MAINTENANCE_WORKFLOW_REQUIRED"}"""
            else null
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals("MAINTENANCE_WORKFLOW_REQUIRED", ch.power("node//x", 3, quietMs = 2000))
    }

    @Test fun powerActionWithNoReplyCountsAsSent() = runBlocking {
        val fake = FakeServer(welcome)
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals(null, ch.power("node//x", 3, quietMs = 50))
        assertEquals("poweraction", JSONObject(fake.sent.last()).getString("action"))
    }

    @Test fun wakeReturnsTheServersAnswer() = runBlocking {
        val fake = FakeServer(welcome) { m ->
            if (m.optString("action") == "wakedevices") """{"action":"wakedevices","responseid":"${m.getString("responseid")}","result":"Used 2 device(s) to send wake packets."}""" else null
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals("Used 2 device(s) to send wake packets.", ch.wake("node//x"))
    }

    @Test fun authCookieReturnsBothCookies() = runBlocking {
        val fake = FakeServer(welcome) { m ->
            if (m.getString("action") == "authcookie") """{"action":"authcookie","cookie":"C","rcookie":"RC"}""" else null
        }
        val ch = ControlChannel("https://h:1", trust, fake)
        ch.signIn("a", "b")
        assertEquals("C" to "RC", ch.authCookie())
    }
}
