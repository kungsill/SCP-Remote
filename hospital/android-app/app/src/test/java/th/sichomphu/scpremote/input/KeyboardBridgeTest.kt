package th.sichomphu.scpremote.input

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import th.sichomphu.scpremote.protocol.KvmMessages

class KeyboardBridgeTest {
    private val sent = mutableListOf<ByteArray>()
    private val k = KeyboardBridge { sent.add(it) }

    private fun typed(s: String): List<ByteArray> = s.flatMap { listOf(KvmMessages.unicode(true, it.code), KvmMessages.unicode(false, it.code)) }
    private fun backspaces(n: Int) = (1..n).flatMap { listOf(KvmMessages.key(true, 0x08), KvmMessages.key(false, 0x08)) }
    private fun assertSent(expected: List<ByteArray>) {
        assertEquals(expected.size, sent.size)
        expected.forEachIndexed { i, b -> assertArrayEquals("message $i", b, sent[i]) }
    }

    // Samsung Keyboard checks Thai order (WTT): an above/below vowel or tone mark is only allowed
    // after a consonant, which it looks for with getTextBeforeCursor. With nothing reported, "ทำ"
    // and "งั้น" lost their marks. The bridge remembers what it typed so it can answer.
    @Test fun remembersWhatWasTypedForTheKeyboardToCheck() {
        k.commitText("ง")
        assertEquals("ง", k.textBeforeCursor(10))
        k.setComposingText("ั")
        assertEquals("งั", k.textBeforeCursor(10))
        k.commitText("ั")
        k.commitText("้")
        assertEquals("งั้", k.textBeforeCursor(10))
        assertEquals("ั้", k.textBeforeCursor(2))
    }

    @Test fun backspaceAndDeleteForgetTheLastLetters() {
        k.commitText("งาน")
        k.delete(1)
        assertEquals("งา", k.textBeforeCursor(10))
        k.backspaceKey()
        assertEquals("ง", k.textBeforeCursor(10))
    }

    // Samsung Keyboard can re-open the letter before the cursor (setComposingRegion) and then send
    // it again with the mark added. Only the mark may go to the computer, not the letter twice.
    @Test fun reopenedLetterGetsOnlyTheMarkAdded() {
        k.commitText("ท")
        sent.clear()
        k.setComposingRegion(0, 1)
        k.setComposingText("ทำ")
        k.finishComposing()
        assertSent(typed("ำ"))
        assertEquals("ทำ", k.textBeforeCursor(10))
    }

    @Test fun reopenedRegionOutsideWhatWasTypedIsIgnored() {
        k.commitText("ก")
        sent.clear()
        k.setComposingRegion(0, 5)
        k.setComposingText("ข")
        assertSent(typed("ข"))
    }

    @Test fun rememberedTextStaysShort() {
        repeat(600) { k.commitText("ก") }
        assertEquals(KeyboardBridge.MEMORY, k.textBeforeCursor(10_000).length)
    }

    @Test fun thaiTextIsSentAsUnicodeDownUpPerCodeUnit() {
        k.commitText("สวัสดี")
        assertEquals(12, sent.size)
        assertSent(typed("สวัสดี"))
    }

    @Test fun emojiSendsBothSurrogates() {
        k.commitText("😀")
        assertSent(typed("😀"))
    }

    @Test fun deleteSendsBackspaces() {
        k.delete(2)
        assertSent(backspaces(2))
    }

    @Test fun ctrlHeldTurnsLettersIntoKeys() {
        k.setModifier(Modifier.CTRL, true)
        k.commitText("c")
        assertSent(listOf(KvmMessages.key(true, 0x11), KvmMessages.key(true, 0x43), KvmMessages.key(false, 0x43)))
        sent.clear()
        k.setModifier(Modifier.CTRL, false)
        assertSent(listOf(KvmMessages.key(false, 0x11)))
    }

    @Test fun winIsAnExtendedKey() {
        k.setModifier(Modifier.WIN, true)
        assertSent(listOf(KvmMessages.key(true, 0x5B, extended = true)))
    }

    @Test fun specialKeysUseTheirCodesAndExtendedFlag() {
        k.special(SpecialKey.LEFT)
        k.special(SpecialKey.ESC)
        assertSent(listOf(
            KvmMessages.key(true, 0x25, extended = true), KvmMessages.key(false, 0x25, extended = true),
            KvmMessages.key(true, 0x1B), KvmMessages.key(false, 0x1B),
        ))
    }

    @Test fun ctrlAltDelUsesItsOwnMessage() {
        k.special(SpecialKey.CTRL_ALT_DEL)
        assertSent(listOf(KvmMessages.ctrlAltDel()))
    }

    @Test fun newlineIsEnter() {
        k.commitText("\n")
        assertSent(listOf(KvmMessages.key(true, 0x0D), KvmMessages.key(false, 0x0D)))
    }

    @Test fun afterKeyIsCalledOnceAModifiedKeyIsSent() {
        var calls = 0
        k.afterModifiedKey = { calls++ }
        k.commitText("a"); assertEquals(0, calls)
        k.setModifier(Modifier.CTRL, true)
        k.special(SpecialKey.F5); assertEquals(1, calls)
    }

    // Review Focus 4: keyboards that compose (Gboard suggestions) send the word growing, shrinking,
    // then committed; only the difference reaches the computer.
    @Test fun composingTextSendsOnlyTheDifference() {
        k.setComposingText("ส")
        k.setComposingText("สว")
        k.commitText("สวัสดี")
        assertSent(typed("ส") + typed("ว") + typed("ัสดี"))
    }

    @Test fun composingThatShrinksSendsBackspaces() {
        k.setComposingText("abc")
        sent.clear()
        k.setComposingText("ab")
        assertSent(backspaces(1))
        sent.clear()
        k.commitText("abd")
        assertSent(typed("d"))
    }

    @Test fun finishedComposingIsKept() {
        k.setComposingText("ok")
        k.finishComposing()
        sent.clear()
        k.commitText("!")
        assertSent(typed("!"))
    }

    @Test fun replacedSurrogatePairCountsAsOneBackspace() {
        k.setComposingText("a😀")
        sent.clear()
        k.setComposingText("a")
        assertSent(backspaces(1))
    }
}
