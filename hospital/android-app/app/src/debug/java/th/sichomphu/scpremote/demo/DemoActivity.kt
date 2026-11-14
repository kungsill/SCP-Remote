package th.sichomphu.scpremote.demo

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.net.ControlChannel
import th.sichomphu.scpremote.net.PinnedTrust
import th.sichomphu.scpremote.net.SocketOpener
import th.sichomphu.scpremote.ui.DevicesActivity
import java.io.ByteArrayOutputStream

/**
 * DEBUG BUILDS ONLY — a preview of every screen with made-up computers and a drawn Windows desktop,
 * for reviewing the design without signing in to the real server. Nothing here reaches a network.
 *
 *     adb shell am start -n th.sichomphu.scpremote/.demo.DemoActivity
 */
class DemoActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            val trust = PinnedTrust("00")
            val channel = ControlChannel("https://192.168.2.25:8443", trust, FakeSocket.opener(::controlReply, welcome = true))
            channel.signIn("demo", "demo")
            AppSession.server = "https://192.168.2.25:8443"
            AppSession.trust = trust
            AppSession.channel = channel
            AppSession.updateChecked = true
            // The fake computer echoes the keep-alive ~45 ms later, like an agent on the LAN.
            AppSession.relayOpener = FakeSocket.opener({ m -> if (m.optString("type") == "rtt") { Thread.sleep(45); m.toString() } else null }, welcome = false, relay = true)
            startActivity(Intent(this@DemoActivity, DevicesActivity::class.java))
            finish()
        }
    }

    private fun controlReply(m: JSONObject): String? = when {
        m.optString("action") == "authcookie" -> """{"action":"authcookie","cookie":"C","rcookie":"R"}"""
        m.optString("op") == "appDevices" -> JSONObject().put("action", "scpops").put("tag", m.optString("tag")).put("result", JSONObject(DEVICES)).toString()
        m.optString("op") == "fixPrinter" -> {
            Thread.sleep(1500)
            """{"action":"scpops","tag":"${m.optString("tag")}","result":{"ok":true,"before":3,"after":0,"spooler":"Running"}}"""
        }
        else -> null
    }

    private companion object {
        val DEVICES = """{"user":{"name":"it-somchai"},"groups":[
            {"id":"g1","name":"ห้องฉุกเฉิน (ER)"},{"id":"g2","name":"ห้องยา"},{"id":"g3","name":"OPD"},{"id":"g4","name":"การเงิน"}],
          "devices":[
            {"id":"n1","name":"ER-PC01","groupId":"g1","ip":"192.168.2.41","online":true,"users":["ER\\nurse1"],"canView":true,"canControl":true,"viewOnly":false,"canFixPrinter":true,"rights":4294967295},
            {"id":"n2","name":"ER-PC02","groupId":"g1","ip":"192.168.2.42","online":true,"users":[],"canView":true,"canControl":true,"viewOnly":false,"canFixPrinter":true,"rights":4294967295},
            {"id":"n3","name":"ห้องยา-เครื่อง1","groupId":"g2","ip":"192.168.2.50","online":true,"users":["PHAR\\pharm01"],"canView":true,"canControl":false,"viewOnly":true,"canFixPrinter":false},
            {"id":"n4","name":"OPD-จุดซักประวัติ","groupId":"g3","ip":"192.168.3.12","online":false,"users":[],"canView":true,"canControl":true,"viewOnly":false,"canFixPrinter":true,"rights":4294967295},
            {"id":"n5","name":"FIN-PC03","groupId":"g4","ip":"192.168.4.20","online":true,"users":["FIN\\acc2"],"canView":false,"canControl":false,"viewOnly":false,"canFixPrinter":true},
            {"id":"n6","name":"test01","groupId":"g3","ip":"192.168.2.99","online":true,"users":["test"],"canView":true,"canControl":true,"viewOnly":false,"canFixPrinter":true,"rights":4294967295}]}"""
    }
}

/** An in-memory websocket that answers like the server (control) or like an agent showing a desktop (relay). */
private class FakeSocket(private val request: Request, private val listener: WebSocketListener, private val reply: (JSONObject) -> String?) : WebSocket {
    override fun request() = request
    override fun queueSize() = 0L
    override fun send(text: String): Boolean {
        val m = try { JSONObject(text) } catch (e: Exception) { return true }
        Thread { reply(m)?.let { listener.onMessage(this, it) } }.start()
        return true
    }
    override fun send(bytes: ByteString) = true
    override fun close(code: Int, reason: String?) = true
    override fun cancel() {}

    companion object {
        fun opener(reply: (JSONObject) -> String?, welcome: Boolean, relay: Boolean = false) = SocketOpener { r, l ->
            // The file channel (p=5): answer folder listings like an agent would.
            if (relay && r.url.queryParameter("p") == "5") {
                val s = FakeSocket(r, l) { m ->
                    if (m.optString("action") == "ls") JSONObject().put("path", m.optString("path")).put("reqid", m.optInt("reqid")).put("dir", org.json.JSONArray(FILES)).toString() else null
                }
                Thread { Thread.sleep(300); l.onMessage(s, "c") }.start()
                return@SocketOpener s
            }
            val s = FakeSocket(r, l, reply)
            if (welcome) l.onMessage(s, """{"action":"serverinfo"}""")
            if (relay) Thread {
                Thread.sleep(400)
                l.onOpen(s, Response.Builder().request(r).protocol(Protocol.HTTP_1_1).code(101).message("").build())
                l.onMessage(s, "c")
                Thread.sleep(300)
                l.onMessage(s, byteArrayOf(0, 7, 0, 8, 0x05, 0x00, 0x03, 0x20).toByteString()) // 1280 × 800
                l.onMessage(s, byteArrayOf(0, 11, 0, 12, 0, 2, 0, 1, 0, 2, 0, 1).toByteString()) // two displays
                l.onMessage(s, jumboTile(desktopPng()).toByteString())
            }.start()
            s
        }

        const val FILES = """[{"n":"แบบฟอร์ม","t":2,"d":"2026-11-12T08:00:00.000Z"},{"n":"รูปภาพ","t":2,"d":"2026-11-10T08:00:00.000Z"},
            {"n":"ใบสั่งยา-14-11.pdf","t":3,"s":284512,"d":"2026-11-14T02:15:00.000Z"},{"n":"รายงานเวร.xlsx","t":3,"s":48210,"d":"2026-11-13T09:30:00.000Z"},
            {"n":"HOSxP.lnk","t":3,"s":1342,"d":"2026-10-01T01:00:00.000Z"}]"""

        fun jumboTile(png: ByteArray): ByteArray {
            val size = 8 + png.size
            val head = byteArrayOf(0, 27, 0, 8, 0, (size shr 16).toByte(), (size shr 8).toByte(), size.toByte(), 0, 3, 0, 0, 0, 0, 0, 0)
            return head + png
        }

        /** A Windows-like desktop with Notepad open, drawn for the preview. */
        fun desktopPng(): ByteArray {
            val w = 1280; val h = 800
            val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val c = Canvas(b)
            val p = Paint(Paint.ANTI_ALIAS_FLAG)
            c.drawColor(Color.rgb(0, 84, 147))
            p.color = Color.rgb(32, 32, 36); c.drawRect(0f, h - 48f, w.toFloat(), h.toFloat(), p)
            p.color = Color.rgb(0, 120, 215); c.drawRect(14f, h - 38f, 42f, h - 10f, p)
            p.color = Color.WHITE; p.textSize = 15f; c.drawText("14/11/2569  10:24", w - 150f, h - 18f, p)
            for (i in 0 until 4) {
                p.color = Color.argb(200, 255, 255, 255); c.drawRoundRect(RectF(24f, 24f + i * 96, 84f, 84f + i * 96), 8f, 8f, p)
                p.color = Color.WHITE; p.textSize = 13f
                c.drawText(listOf("This PC", "HOSxP", "เอกสาร", "ถังขยะ")[i], 22f, 104f + i * 96, p)
            }
            p.color = Color.WHITE; c.drawRect(260f, 110f, 1040f, 600f, p)
            p.color = Color.rgb(243, 243, 243); c.drawRect(260f, 110f, 1040f, 150f, p)
            p.color = Color.BLACK; p.textSize = 16f; c.drawText("ไม่มีชื่อ - Notepad", 280f, 136f, p)
            p.textSize = 22f; c.drawText("ทดสอบพิมพ์ภาษาไทยจากมือถือ สวัสดีครับ", 290f, 200f, p)
            c.drawText("Hello from SCP-Remote on Android", 290f, 240f, p)
            val out = ByteArrayOutputStream()
            b.compress(Bitmap.CompressFormat.PNG, 100, out)
            return out.toByteArray()
        }
    }
}
