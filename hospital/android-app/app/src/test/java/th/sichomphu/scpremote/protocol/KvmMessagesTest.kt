package th.sichomphu.scpremote.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

// Every message must be byte-for-byte what public/scripts/agent-desktop-0.0.2.js sends, because
// the agent on the computer only understands that.
class KvmMessagesTest {
    private fun b(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    @Test fun mouseDownLeft() =
        assertArrayEquals(b(0, 2, 0, 0x0A, 0, 0x02, 0x01, 0x2C, 0, 0x02), KvmMessages.mouse(MouseAction.DOWN, KvmMessages.LEFT, 300, 2))

    @Test fun mouseUpRightDoublesTheButton() =
        assertEquals(0x10, KvmMessages.mouse(MouseAction.UP, KvmMessages.RIGHT, 1, 1)[5].toInt() and 0xFF)

    @Test fun mouseMoveHasNoButton() =
        assertArrayEquals(b(0, 2, 0, 0x0A, 0, 0, 0, 5, 0, 6), KvmMessages.mouse(MouseAction.MOVE, 0, 5, 6))

    @Test fun mouseDoubleClick() =
        assertEquals(0x88, KvmMessages.mouse(MouseAction.DBLCLICK, KvmMessages.LEFT, 1, 1)[5].toInt() and 0xFF)

    @Test fun scrollNegative() {
        val m = KvmMessages.scroll(10, 10, -120)
        assertArrayEquals(b(0, 2, 0, 0x0C, 0, 0, 0, 10, 0, 10, 0xFF, 0x87), m)
    }

    @Test fun scrollPositive() =
        assertArrayEquals(b(0, 2, 0, 0x0C, 0, 0, 0, 1, 0, 1, 0, 120), KvmMessages.scroll(1, 1, 120))

    @Test fun keyDownAndUp() {
        assertArrayEquals(b(0, 1, 0, 6, 0, 0x41), KvmMessages.key(true, 0x41))
        assertArrayEquals(b(0, 1, 0, 6, 1, 0x41), KvmMessages.key(false, 0x41))
    }

    @Test fun extendedKey() {
        assertEquals(4, KvmMessages.key(true, 0x5B, extended = true)[4].toInt())
        assertEquals(3, KvmMessages.key(false, 0x5B, extended = true)[4].toInt())
    }

    @Test fun unicodeThai() =
        assertArrayEquals(b(0, 0x55, 0, 7, 0, 0x0E, 0x01), KvmMessages.unicode(true, 0x0E01))

    @Test fun unicodeUp() = assertEquals(1, KvmMessages.unicode(false, 0x41)[4].toInt())

    @Test fun fixedCommands() {
        assertArrayEquals(b(0, 0x0A, 0, 4), KvmMessages.ctrlAltDel())
        assertArrayEquals(b(0, 6, 0, 4), KvmMessages.refresh())
        assertArrayEquals(b(0, 0x0B, 0, 4), KvmMessages.getDisplays())
        assertArrayEquals(b(0, 0x0E, 0, 4), KvmMessages.touchInitAck())
        assertArrayEquals(b(0, 8, 0, 5, 1), KvmMessages.pause(true))
        assertArrayEquals(b(0, 8, 0, 5, 0), KvmMessages.pause(false))
    }

    @Test fun compression() =
        assertArrayEquals(b(0, 5, 0, 0x0A, 2, 0x64, 4, 0, 0, 0x32), KvmMessages.compression(2, 100, 1024, 50))

    @Test fun setDisplayAll() =
        assertArrayEquals(b(0, 0x0C, 0, 6, 0xFF, 0xFF), KvmMessages.setDisplay(65535))

    @Test fun rttKeepAlive() =
        assertEquals("{\"ctrlChannel\":102938,\"type\":\"rtt\",\"time\":5}", KvmMessages.rtt(5))
}
