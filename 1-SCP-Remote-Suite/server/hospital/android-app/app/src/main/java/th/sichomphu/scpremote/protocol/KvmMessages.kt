package th.sichomphu.scpremote.protocol

/** Mouse actions the agent understands (KeyAction in agent-desktop-0.0.2.js). */
enum class MouseAction { MOVE, DOWN, UP, DBLCLICK }

/**
 * Messages sent to the agent over the desktop channel, byte-for-byte as
 * public/scripts/agent-desktop-0.0.2.js builds them: a 2-byte command, a 2-byte length (whole
 * message), then the payload, all big-endian. Pure Kotlin so it can be unit-tested on the JVM.
 */
object KvmMessages {
    const val LEFT = 0x02
    const val RIGHT = 0x08
    const val MIDDLE = 0x20

    private const val KEY = 1
    private const val MOUSE = 2
    private const val CTRLALTDEL = 10
    private const val KEYUNICODE = 85

    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }
    private fun hi(v: Int) = (v shr 8) and 0xFF
    private fun lo(v: Int) = v and 0xFF

    fun mouse(action: MouseAction, button: Int, x: Int, y: Int): ByteArray {
        val b = when (action) {
            MouseAction.MOVE -> 0
            MouseAction.DOWN -> button
            MouseAction.UP -> (button * 2) and 0xFF
            MouseAction.DBLCLICK -> 0x88
        }
        return bytes(0, MOUSE, 0, 0x0A, 0, b, hi(x), lo(x), hi(y), lo(y))
    }

    /** Wheel: a negative delta is written as 255 - |delta| per byte, as the web page does. */
    fun scroll(x: Int, y: Int, delta: Int): ByteArray {
        val a = Math.abs(delta)
        val dh = if (delta < 0) 255 - (a shr 8) else (delta shr 8)
        val dl = if (delta < 0) 255 - (a and 0xFF) else (delta and 0xFF)
        return bytes(0, MOUSE, 0, 0x0C, 0, 0, hi(x), lo(x), hi(y), lo(y), dh and 0xFF, dl and 0xFF)
    }

    /** Virtual-key message; extended keys (arrows, Win, Delete…) use 4 down / 3 up. */
    fun key(down: Boolean, vk: Int, extended: Boolean = false): ByteArray {
        val flag = if (extended) (if (down) 4 else 3) else (if (down) 0 else 1)
        return bytes(0, KEY, 0, 6, flag, vk and 0xFF)
    }

    /** One UTF-16 code unit typed as text (Thai and anything the keyboard layout lacks). */
    fun unicode(down: Boolean, codeUnit: Int): ByteArray =
        bytes(0, KEYUNICODE, 0, 7, if (down) 0 else 1, hi(codeUnit), lo(codeUnit))

    fun ctrlAltDel() = bytes(0, CTRLALTDEL, 0, 4)
    fun refresh() = bytes(0, 6, 0, 4)
    fun getDisplays() = bytes(0, 0x0B, 0, 4)
    fun setDisplay(n: Int) = bytes(0, 0x0C, 0, 6, hi(n), lo(n))
    fun touchInitAck() = bytes(0, 0x0E, 0, 4)
    fun pause(on: Boolean) = bytes(0, 8, 0, 5, if (on) 1 else 0)

    /** Picture settings: encoding (1 JPEG, 2 PNG, 4 WebP), quality 1-100, scaling (1024 = full), frame gap ms. */
    fun compression(type: Int, quality: Int, scaling: Int, frameMs: Int) =
        bytes(0, 5, 0, 0x0A, type, quality, hi(scaling), lo(scaling), hi(frameMs), lo(frameMs))

    /** Keep-alive sent as text on the relay; the agent answers it, which keeps a quiet link open. */
    fun rtt(nowMs: Long) = "{\"ctrlChannel\":102938,\"type\":\"rtt\",\"time\":$nowMs}"
}
