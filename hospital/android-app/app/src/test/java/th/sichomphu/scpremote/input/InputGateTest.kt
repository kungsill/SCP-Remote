package th.sichomphu.scpremote.input

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import th.sichomphu.scpremote.protocol.KvmMessages
import th.sichomphu.scpremote.protocol.MouseAction

// Review Focus 3: a view-only session never sends mouse, keyboard, touch or Ctrl+Alt+Del.
class InputGateTest {
    private val input = listOf(
        KvmMessages.mouse(MouseAction.DOWN, KvmMessages.LEFT, 1, 1),
        KvmMessages.scroll(1, 1, 120),
        KvmMessages.key(true, 0x41),
        KvmMessages.unicode(true, 0x0E01),
        KvmMessages.ctrlAltDel(),
        byteArrayOf(0, 15, 0, 4), // touch
    )

    @Test fun viewOnlyDropsEveryInputMessage() {
        val sent = mutableListOf<ByteArray>()
        val gate = InputGate(false) { sent.add(it) }
        input.forEach(gate::send)
        assertEquals(0, sent.size)
    }

    @Test fun viewOnlyStillPassesPictureMessages() {
        val sent = mutableListOf<ByteArray>()
        val gate = InputGate(false) { sent.add(it) }
        val refresh = KvmMessages.refresh()
        gate.send(refresh); gate.send(KvmMessages.compression(4, 70, 1024, 100)); gate.send(KvmMessages.setDisplay(1))
        assertEquals(3, sent.size)
        assertSame(refresh, sent[0])
    }

    @Test fun fullControlPassesInput() {
        val sent = mutableListOf<ByteArray>()
        val gate = InputGate(true) { sent.add(it) }
        input.forEach(gate::send)
        assertEquals(input.size, sent.size)
    }

    @Test fun tooShortMessageIsDropped() {
        val sent = mutableListOf<ByteArray>()
        InputGate(true) { sent.add(it) }.send(byteArrayOf(0))
        assertEquals(0, sent.size)
    }
}
