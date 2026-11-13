package th.sichomphu.scpremote.net

import kotlinx.coroutines.runBlocking
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.protocol.KvmCommand
import th.sichomphu.scpremote.protocol.KvmMessages
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** A websocket that records what is sent. [onOpen] and [onText] play the other side. */
private class Recorder(
    private val onOpen: (Recorder) -> Unit = {},
    private val onText: (Recorder, String) -> Unit = { _, _ -> },
) : SocketOpener {
    val texts = CopyOnWriteArrayList<String>()
    val binaries = CopyOnWriteArrayList<ByteArray>()
    val requests = CopyOnWriteArrayList<Request>()
    val opened = CountDownLatch(1)
    lateinit var listener: WebSocketListener
    lateinit var socket: WebSocket

    override fun open(request: Request, listener: WebSocketListener): WebSocket {
        requests.add(request); this.listener = listener
        socket = object : WebSocket {
            override fun request() = request
            override fun queueSize() = 0L
            override fun send(text: String): Boolean { texts.add(text); onText(this@Recorder, text); return true }
            override fun send(bytes: ByteString): Boolean { binaries.add(bytes.toByteArray()); return true }
            override fun close(code: Int, reason: String?) = true
            override fun cancel() {}
        }
        onOpen(this)
        opened.countDown()
        return socket
    }

    fun text(s: String) = listener.onMessage(socket, s)
    fun binary(vararg b: Int) = listener.onMessage(socket, ByteArray(b.size) { b[it].toByte() }.toByteString())
}

class RelaySessionTest {
    /** The session sends the tunnel request from a background thread just after opening the relay. */
    private fun <T> waitFor(get: () -> T?): T {
        val until = System.currentTimeMillis() + 5000
        while (System.currentTimeMillis() < until) { get()?.let { return it }; Thread.sleep(10) }
        throw AssertionError("timed out")
    }

    private val device = Device("node//pc", "PC", "g", "G", "1.2.3.4", true, emptyList(), true, true, false, false)

    // Review Focus 5: switching display on a multi-monitor computer stays in the same session.
    @Test fun choosingADisplaySendsSetDisplayThenRefreshWithoutANewTunnel() = runBlocking {
        val server = Recorder(
            onOpen = { it.text("""{"action":"serverinfo"}""") },
            onText = { r, t -> if (JSONObject(t).optString("action") == "authcookie") r.text("""{"action":"authcookie","cookie":"C","rcookie":"RC"}""") },
        )
        val control = ControlChannel("https://1.2.3.4:443", PinnedTrust("00"), server)
        assertTrue(control.signIn("u", "p").isSuccess)

        val relay = Recorder()
        val commands = CopyOnWriteArrayList<KvmCommand>()
        val session = RelaySession(control, PinnedTrust("00"), device, object : RelaySession.Listener {
            override fun onState(state: RelaySession.State) {}
            override fun onCommand(cmd: KvmCommand) { commands.add(cmd) }
        }, "https://1.2.3.4:443", opener = relay)
        session.start()
        assertTrue("relay opened", relay.opened.await(5, TimeUnit.SECONDS))
        relay.listener.onOpen(relay.socket, Response.Builder().request(relay.requests[0]).protocol(Protocol.HTTP_1_1).code(101).message("").build())
        relay.text("c")
        relay.binary(0, 0x0B, 0, 0x0C, 0, 2, 0, 1, 0, 2, 0, 1)
        assertEquals(listOf(KvmCommand.Displays(listOf(1, 2), 1)), commands)

        relay.binaries.clear()
        session.selectDisplay(2)
        assertEquals(2, relay.binaries.size)
        assertArrayEquals(KvmMessages.setDisplay(2), relay.binaries[0])
        assertArrayEquals(KvmMessages.refresh(), relay.binaries[1])
        waitFor { server.texts.firstOrNull { JSONObject(it).optString("type") == "tunnel" } }
        assertEquals("one tunnel request", 1, server.texts.count { JSONObject(it).optString("type") == "tunnel" })
        assertEquals("one relay socket", 1, relay.requests.size)
        session.close(userInitiated = true)
    }

    @Test fun openingSendsProtocolPictureSettingsRefreshAndAsksForDisplays() = runBlocking {
        val server = Recorder(
            onOpen = { it.text("""{"action":"serverinfo"}""") },
            onText = { r, t -> if (JSONObject(t).optString("action") == "authcookie") r.text("""{"action":"authcookie","cookie":"C","rcookie":"RC"}""") },
        )
        val control = ControlChannel("https://1.2.3.4:443", PinnedTrust("00"), server)
        control.signIn("u", "p")
        val relay = Recorder()
        val session = RelaySession(control, PinnedTrust("00"), device, object : RelaySession.Listener {
            override fun onState(state: RelaySession.State) {}
            override fun onCommand(cmd: KvmCommand) {}
        }, "https://1.2.3.4:443", initialQuality = intArrayOf(4, 45, 1024, 200), opener = relay)
        session.start()
        relay.opened.await(5, TimeUnit.SECONDS)
        relay.text("cr")
        assertEquals("2", relay.texts.first())
        assertArrayEquals(KvmMessages.compression(4, 45, 1024, 200), relay.binaries[0])
        assertArrayEquals(KvmMessages.refresh(), relay.binaries[1])
        assertArrayEquals(KvmMessages.getDisplays(), relay.binaries[2])
        val tunnel = JSONObject(waitFor { server.texts.firstOrNull { JSONObject(it).optString("type") == "tunnel" } })
        assertTrue(tunnel.getString("value").endsWith("&rauth=RC"))
        assertTrue(relay.requests[0].url.toString().contains("auth=C"))
        session.close(userInitiated = true)
    }
}
