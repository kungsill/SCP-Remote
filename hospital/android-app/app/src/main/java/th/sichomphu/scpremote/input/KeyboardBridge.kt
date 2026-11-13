package th.sichomphu.scpremote.input

import th.sichomphu.scpremote.protocol.KvmMessages

enum class Modifier(val vk: Int, val extended: Boolean = false) {
    CTRL(0x11), ALT(0x12), SHIFT(0x10), WIN(0x5B, extended = true)
}

enum class SpecialKey(val vk: Int, val extended: Boolean = false) {
    ESC(0x1B), TAB(0x09), ENTER(0x0D), BACKSPACE(0x08), DELETE(0x2E, true),
    LEFT(0x25, true), UP(0x26, true), RIGHT(0x27, true), DOWN(0x28, true), HOME(0x24, true), END(0x23, true),
    F1(0x70), F2(0x71), F3(0x72), F4(0x73), F5(0x74), F6(0x75), F7(0x76), F8(0x77), F9(0x78), F10(0x79), F11(0x7A), F12(0x7B),
    CTRL_ALT_DEL(0),
}

/**
 * The phone keyboard → the remote computer. Text goes as Unicode (Thai and any language, whatever
 * the computer's keyboard layout); while Ctrl/Alt/Win/Shift is held, letters and digits go as keys
 * so shortcuts like Ctrl+C work. Text a keyboard is still composing is sent as it changes, and
 * corrected with Backspace, so the computer always shows what the phone shows.
 */
class KeyboardBridge(private val out: (ByteArray) -> Unit) {
    private val held = linkedSetOf<Modifier>()
    private var composing = ""

    /** Called after a non-modifier key went out while a modifier was held (the key bar releases them). */
    var afterModifiedKey: (() -> Unit)? = null

    fun commitText(text: CharSequence) {
        val s = text.toString()
        if (composing.isNotEmpty()) { replaceComposing(s); composing = ""; return }
        type(s)
    }

    fun setComposingText(text: CharSequence) {
        replaceComposing(text.toString())
        composing = text.toString()
    }

    /** The keyboard accepted what it was composing; it stays typed. */
    fun finishComposing() { composing = "" }

    fun delete(count: Int) {
        repeat(count.coerceAtLeast(0)) { tap(SpecialKey.BACKSPACE.vk, false) }
        if (count > 0) composing = ""
        if (count > 0) modifiedKeySent()
    }

    fun special(key: SpecialKey) {
        if (key == SpecialKey.CTRL_ALT_DEL) out(KvmMessages.ctrlAltDel()) else tap(key.vk, key.extended)
        modifiedKeySent()
    }

    fun setModifier(mod: Modifier, on: Boolean) {
        if (on == mod in held) return
        if (on) held.add(mod) else held.remove(mod)
        out(KvmMessages.key(on, mod.vk, mod.extended))
    }

    fun isHeld(mod: Modifier) = mod in held

    /** Lets go of every held modifier (leaving the screen, key bar reset). */
    fun releaseAll() { held.toList().forEach { setModifier(it, false) } }

    private fun replaceComposing(next: String) {
        val prefix = commonPrefix(composing, next)
        val removed = composing.substring(prefix).let { it.codePointCount(0, it.length) }
        repeat(removed) { tap(SpecialKey.BACKSPACE.vk, false) }
        type(next.substring(prefix))
    }

    private fun type(s: String) {
        for (c in s) {
            when {
                c == '\n' || c == '\r' -> { tap(SpecialKey.ENTER.vk, false); modifiedKeySent() }
                c == '\t' -> { tap(SpecialKey.TAB.vk, false); modifiedKeySent() }
                held.isNotEmpty() && (c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9') -> {
                    tap(c.uppercaseChar().code, false); modifiedKeySent()
                }
                else -> { out(KvmMessages.unicode(true, c.code)); out(KvmMessages.unicode(false, c.code)) }
            }
        }
    }

    private fun tap(vk: Int, extended: Boolean) {
        out(KvmMessages.key(true, vk, extended))
        out(KvmMessages.key(false, vk, extended))
    }

    private fun modifiedKeySent() { if (held.isNotEmpty()) afterModifiedKey?.invoke() }

    /** Common prefix length that does not split a surrogate pair. */
    private fun commonPrefix(a: String, b: String): Int {
        var i = 0
        while (i < a.length && i < b.length && a[i] == b[i]) i++
        if (i > 0 && i < a.length && Character.isLowSurrogate(a[i]) && Character.isHighSurrogate(a[i - 1])) i--
        return i
    }
}
