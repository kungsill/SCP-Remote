package th.sichomphu.scpremote.protocol

/** A command the agent sent over the desktop channel (layouts from agent-desktop-0.0.2.js). */
sealed class KvmCommand {
    /** A picture tile; [image] is the encoded picture (PNG/JPEG/WebP) to draw at x,y. */
    class Tile(val x: Int, val y: Int, val image: ByteArray) : KvmCommand()
    data class ScreenSize(val w: Int, val h: Int) : KvmCommand()
    /** Display numbers (65535 = all displays) and the one being shown. */
    data class Displays(val list: List<Int>, val selected: Int) : KvmCommand()
    /** 1 = NumLock, 2 = ScrollLock, 4 = CapsLock. */
    data class KeyState(val bits: Int) : KvmCommand()
    data class Alert(val text: String) : KvmCommand()
    object TouchEnabled : KvmCommand() { override fun toString() = "TouchEnabled" }
    data class Other(val cmd: Int) : KvmCommand()
}

/**
 * Turns relay binary messages into [KvmCommand]s, the way agent-redir-ws-0.1.1.js does: a frame
 * whose declared size is larger than the message is collected over the next messages, and a
 * "jumbo" frame (cmd 27, size 8) carries the real command and a 24-bit size in its first 8 bytes.
 */
class KvmFramer(private val onCommand: (KvmCommand) -> Unit) {
    private var accCmd = 0
    private var accSize = 0
    private var acc: java.io.ByteArrayOutputStream? = null

    fun feed(chunk: ByteArray) {
        val pending = acc
        if (pending != null) {
            pending.write(chunk)
            if (pending.size() >= accSize) {
                val all = pending.toByteArray()
                acc = null
                emit(accCmd, all.copyOf(accSize))
            }
            return
        }
        if (chunk.size < 4) return
        var view = chunk
        var cmd = u16(view, 0)
        var size = u16(view, 2)
        if (cmd == 27 && size == 8 && view.size >= 10) {
            cmd = u16(view, 8)
            size = ((view[5].toInt() and 0xFF) shl 16) or u16(view, 6)
            view = view.copyOfRange(8, view.size)
        }
        if (size != view.size) {
            if (size < view.size) { emit(cmd, view.copyOf(size.coerceAtLeast(4))); return }
            accCmd = cmd; accSize = size
            acc = java.io.ByteArrayOutputStream(size).also { it.write(view) }
        } else {
            emit(cmd, view)
        }
    }

    private fun emit(cmd: Int, v: ByteArray) {
        onCommand(parse(cmd, v) ?: return)
    }

    private fun parse(cmd: Int, v: ByteArray): KvmCommand? = when (cmd) {
        3 -> if (v.size >= 8) KvmCommand.Tile(u16(v, 4), u16(v, 6), v.copyOfRange(8, v.size)) else null
        7 -> if (v.size >= 8) KvmCommand.ScreenSize(u16(v, 4), u16(v, 6)) else null
        11 -> parseDisplays(v)
        14 -> KvmCommand.TouchEnabled
        18 -> if (v.size == 5) KvmCommand.KeyState(v[4].toInt() and 0xFF) else null
        65 -> KvmCommand.Alert(String(v, 4, v.size - 4, Charsets.ISO_8859_1))
        else -> KvmCommand.Other(cmd)
    }

    private fun parseDisplays(v: ByteArray): KvmCommand? {
        if (v.size < 6) return null
        val count = u16(v, 4)
        if (count == 0) return KvmCommand.Displays(emptyList(), 0)
        if (v.size < 8 + count * 2) return null
        val list = (0 until count).map { u16(v, 6 + it * 2) }
        return KvmCommand.Displays(list, u16(v, 6 + count * 2))
    }

    private fun u16(v: ByteArray, at: Int) = ((v[at].toInt() and 0xFF) shl 8) or (v[at + 1].toInt() and 0xFF)
}
