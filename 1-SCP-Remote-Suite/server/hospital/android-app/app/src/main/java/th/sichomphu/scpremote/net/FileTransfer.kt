package th.sichomphu.scpremote.net

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream

/**
 * MeshCentral's file channel (relay protocol 5), as the web page's Files tab and the agent
 * (agents/meshcore.js) speak it. Commands go out as JSON text; the agent answers with JSON in
 * binary frames, and sends a download as 16 KB blocks whose 4-byte header marks the last one.
 * One operation at a time.
 */
class FileTransfer(private val sendText: (String) -> Unit, private val sendBinary: (ByteArray) -> Unit) {
    class TransferError(message: String) : Exception(message)

    data class Entry(val name: String, val type: Int, val size: Long, val modified: String) {
        val isDrive get() = type == 1
        val isFolder get() = type == 1 || type == 2
    }

    data class Listing(val path: String, val entries: List<Entry>)

    private val lock = Mutex()
    private var serial = 0
    /** JSON replies for the operation in progress. */
    private var replies = Channel<JSONObject>(Channel.UNLIMITED)
    /** Download blocks for the download in progress. */
    private var blocks = Channel<ByteArray>(Channel.UNLIMITED)
    private var listing: CompletableDeferred<JSONObject>? = null

    /** Every frame the agent sends after the channel opened (text frames as their UTF-8 bytes). */
    fun onFrame(frame: ByteArray) {
        if (frame.isEmpty()) return
        if (frame[0] == '{'.code.toByte()) {
            val j = try { JSONObject(String(frame, Charsets.UTF_8)) } catch (e: Exception) { return }
            // A folder listing has no "action"; everything else does.
            if (!j.has("action") && j.has("dir")) listing?.complete(j) else replies.trySend(j)
        } else if (frame.size >= 4 && frame[0].toInt() == 1) {
            blocks.trySend(frame)
        }
    }

    /** The channel closed: whatever is waiting fails. */
    fun fail() {
        listing?.completeExceptionally(TransferError("CLOSED"))
        replies.close(TransferError("CLOSED"))
        blocks.close(TransferError("CLOSED"))
    }

    suspend fun ls(path: String): Listing = lock.withLock {
        val waiter = CompletableDeferred<JSONObject>()
        listing = waiter
        sendText(JSONObject().put("action", "ls").put("reqid", ++serial).put("path", path).toString())
        val j = withTimeout(TIMEOUT_MS) { waiter.await() }
        listing = null
        val dir = j.optJSONArray("dir")
        val entries = if (dir == null) emptyList() else (0 until dir.length()).mapNotNull { i ->
            dir.optJSONObject(i)?.let { Entry(it.optString("n"), it.optInt("t"), it.optLong("s"), it.optString("d")) }
        }
        Listing(j.optString("path", path), entries.sortedWith(compareBy<Entry>({ !it.isFolder }, { it.name.lowercase() })))
    }

    /** Copies the computer's file at [path] into [out]; returns the number of bytes. */
    suspend fun download(path: String, out: OutputStream, onProgress: (Long) -> Unit): Long = lock.withLock {
        fresh()
        val id = ++serial
        sendText(JSONObject().put("action", "download").put("sub", "start").put("id", id).put("path", path).toString())
        val start = withTimeout(TIMEOUT_MS) { replies.receive() }
        if (start.optString("sub") != "start") throw TransferError("CANNOT_READ")
        sendText(JSONObject().put("action", "download").put("sub", "startack").put("id", id).toString())
        var total = 0L
        while (true) {
            val block = withTimeout(TIMEOUT_MS) { blocks.receive() }
            out.write(block, 4, block.size - 4)
            total += block.size - 4
            onProgress(total)
            if ((block[3].toInt() and 1) != 0) break
            sendText(JSONObject().put("action", "download").put("sub", "ack").put("id", id).toString())
        }
        total
    }

    /** Sends [input] ([size] bytes) to the computer as [dir]\[name]. */
    suspend fun upload(dir: String, name: String, input: InputStream, size: Long, onProgress: (Long) -> Unit) = lock.withLock {
        fresh()
        val id = ++serial
        sendText(JSONObject().put("action", "upload").put("reqid", id).put("path", dir).put("name", name).put("size", size).toString())
        val start = withTimeout(TIMEOUT_MS) { replies.receive() }
        if (start.optString("action") != "uploadstart") throw TransferError("CANNOT_WRITE")
        // As the web page: 8 chunks in flight, then one more for each acknowledgement.
        var sent = 0L
        var inFlight = 0
        val buf = ByteArray(CHUNK)
        var done = false
        while (!done || inFlight > 0) {
            while (!done && inFlight < WINDOW) {
                val n = input.read(buf)
                if (n <= 0) { done = true; break }
                // A leading 0 tells the agent this is file data, never a JSON command.
                val frame = ByteArray(n + 1)
                System.arraycopy(buf, 0, frame, 1, n)
                sendBinary(frame)
                inFlight++
                sent += n
                onProgress(sent)
            }
            if (inFlight == 0) break
            val r = withTimeout(TIMEOUT_MS) { replies.receive() }
            when (r.optString("action")) {
                "uploadack" -> inFlight--
                "uploaderror" -> throw TransferError("CANNOT_WRITE")
            }
        }
        sendText(JSONObject().put("action", "uploaddone").put("reqid", id).toString())
        while (true) {
            val r = withTimeout(TIMEOUT_MS) { replies.receive() }
            if (r.optString("action") == "uploaddone") break
            if (r.optString("action") == "uploaderror") throw TransferError("CANNOT_WRITE")
        }
    }

    private fun fresh() {
        while (replies.tryReceive().isSuccess) { /* drop leftovers of an earlier operation */ }
        while (blocks.tryReceive().isSuccess) { }
    }

    companion object {
        private const val CHUNK = 65536
        private const val WINDOW = 8
        private const val TIMEOUT_MS = 30_000L

        /** Windows path joining as the agent does; a drive name ("C:") becomes its root. */
        fun join(dir: String, name: String): String = when {
            dir.isEmpty() -> if (name.endsWith(":")) "$name\\" else name
            dir.endsWith("\\") || dir.endsWith("/") -> dir + name
            else -> "$dir\\$name"
        }

        /** The folder above [path]; "" (the drive list) above a drive root. */
        fun parent(path: String): String {
            val p = path.trimEnd('\\', '/')
            val i = p.lastIndexOfAny(charArrayOf('\\', '/'))
            return when {
                p.length <= 2 && p.endsWith(":") -> ""
                i < 0 -> ""
                i == 2 && p[1] == ':' -> p.substring(0, 3)
                else -> p.substring(0, i)
            }
        }
    }
}
