package th.sichomphu.scpremote.input

/**
 * The one way input reaches the session. When the account may only view this computer, every
 * input message (key 1, mouse 2, Ctrl+Alt+Del 10, touch 15, text 85) is dropped here; picture
 * messages (refresh, compression, display) still pass. The server enforces view-only as well.
 */
class InputGate(private val allowed: Boolean, private val send: (ByteArray) -> Unit) {
    fun send(bytes: ByteArray) {
        if (bytes.size < 4) return
        val cmd = ((bytes[0].toInt() and 0xFF) shl 8) or (bytes[1].toInt() and 0xFF)
        if (!allowed && cmd in INPUT) return
        send.invoke(bytes)
    }

    private companion object { val INPUT = setOf(1, 2, 10, 15, 85) }
}
