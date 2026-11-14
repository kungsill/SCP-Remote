package th.sichomphu.scpremote.net

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/**
 * A stand-in for the agent's side of the file channel (agents/meshcore.js: ls, download, upload),
 * replying the way it does: JSON as binary frames, download blocks with a 4-byte header.
 */
private class FakeAgent {
    lateinit var transfer: FileTransfer
    val files = mutableMapOf<String, ByteArray>()
    val uploaded = ByteArrayOutputStream()
    var uploadPath = ""
    var download: Pair<Int, ByteArrayInputStream>? = null
    val texts = mutableListOf<JSONObject>()

    private fun reply(json: String) = transfer.onFrame(json.toByteArray())

    fun onText(text: String) {
        val cmd = JSONObject(text); texts.add(cmd)
        when (cmd.getString("action")) {
            "ls" -> reply("""{"path":${JSONObject.quote(cmd.getString("path"))},"reqid":${cmd.getInt("reqid")},"dir":[{"n":"Desktop","t":2,"d":"2026-11-14T03:00:00.000Z"},{"n":"report.pdf","t":3,"s":5120,"d":"2026-11-13T03:00:00.000Z"}]}""")
            "download" -> when (cmd.getString("sub")) {
                "start" -> {
                    val data = files[cmd.getString("path")]
                    if (data == null) reply("""{"action":"download","sub":"cancel","id":${cmd.getInt("id")}}""")
                    else { download = cmd.getInt("id") to ByteArrayInputStream(data); reply("""{"action":"download","sub":"start","id":${cmd.getInt("id")}}""") }
                }
                "startack", "ack" -> sendBlock()
            }
            "upload" -> { uploadPath = cmd.getString("path") + "\\" + cmd.getString("name"); reply("""{"action":"uploadstart","reqid":${cmd.getInt("reqid")}}""") }
            "uploaddone" -> reply("""{"action":"uploaddone","reqid":${cmd.getInt("reqid")}}""")
        }
    }

    fun onBinary(data: ByteArray) {
        // As the agent: a leading 0 is an escape byte and is dropped.
        if (data[0].toInt() == 0) uploaded.write(data, 1, data.size - 1) else uploaded.write(data)
        reply("""{"action":"uploadack","reqid":1}""")
    }

    private fun sendBlock() {
        val (_, input) = download ?: return
        val buf = ByteArray(16380)
        val n = input.read(buf).coerceAtLeast(0)
        val last = n < 16380
        val frame = ByteArray(4 + n)
        frame[0] = 1; frame[3] = if (last) 1 else 0
        System.arraycopy(buf, 0, frame, 4, n)
        if (last) download = null
        transfer.onFrame(frame)
    }
}

class FileTransferTest {
    private fun setUp(): FakeAgent {
        val agent = FakeAgent()
        agent.transfer = FileTransfer(sendText = agent::onText, sendBinary = agent::onBinary)
        return agent
    }

    @Test fun listsAFolder() = runBlocking {
        val agent = setUp()
        val l = agent.transfer.ls("C:\\Users\\nurse")
        assertEquals("C:\\Users\\nurse", l.path)
        assertEquals(listOf("Desktop", "report.pdf"), l.entries.map { it.name })
        assertTrue(l.entries[0].isFolder)
        assertEquals(5120L, l.entries[1].size)
    }

    @Test fun downloadsAFileSpanningSeveralBlocks() = runBlocking {
        val agent = setUp()
        val content = ByteArray(40_000) { (it % 251).toByte() }
        agent.files["C:\\a.bin"] = content
        val out = ByteArrayOutputStream()
        var progress = 0L
        val n = agent.transfer.download("C:\\a.bin", out) { progress = it }
        assertEquals(40_000L, n)
        assertEquals(40_000L, progress)
        assertArrayEquals(content, out.toByteArray())
        // The agent sends one block per ack: start, startack, then an ack per further block.
        assertEquals(listOf("start", "startack", "ack", "ack"), agent.texts.filter { it.getString("action") == "download" }.map { it.getString("sub") })
    }

    @Test fun downloadOfAMissingFileFails() = runBlocking {
        val agent = setUp()
        try { agent.transfer.download("C:\\nope.txt", ByteArrayOutputStream()) {}; fail() } catch (e: FileTransfer.TransferError) { }
    }

    @Test fun uploadsExactBytesEvenWhenChunksStartLikeJson() = runBlocking {
        val agent = setUp()
        // 150 000 bytes: three chunks; the first byte is '{', which must be escaped.
        val content = ByteArray(150_000) { if (it == 0) '{'.code.toByte() else (it % 7).toByte() }
        var progress = 0L
        agent.transfer.upload("C:\\Users\\nurse\\Desktop", "scan.jpg", ByteArrayInputStream(content), content.size.toLong()) { progress = it }
        assertArrayEquals(content, agent.uploaded.toByteArray())
        assertEquals("C:\\Users\\nurse\\Desktop\\scan.jpg", agent.uploadPath)
        assertEquals(150_000L, progress)
        assertEquals("uploaddone", agent.texts.last().getString("action"))
    }

    @Test fun pathsJoinWithBackslashAndDrivesGetTheirRoot() {
        assertEquals("C:\\Users", FileTransfer.join("C:\\", "Users"))
        assertEquals("C:\\Users\\nurse", FileTransfer.join("C:\\Users", "nurse"))
        assertEquals("D:\\", FileTransfer.join("", "D:"))
        assertEquals("C:\\Users", FileTransfer.parent("C:\\Users\\nurse"))
        assertEquals("C:\\", FileTransfer.parent("C:\\Users"))
        assertEquals("", FileTransfer.parent("C:\\"))
    }
}
