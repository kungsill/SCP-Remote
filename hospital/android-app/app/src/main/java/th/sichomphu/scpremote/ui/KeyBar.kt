package th.sichomphu.scpremote.ui

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.TextView
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.input.KeyboardBridge
import th.sichomphu.scpremote.input.Modifier
import th.sichomphu.scpremote.input.SpecialKey

/**
 * Keys a phone keyboard lacks, shown just above it while it is open (like AnyDesk). One row of
 * equal-width keys that always fits the screen; ⋯ turns to the next page:
 * modifiers and editing keys → arrows → F1–F6 → F7–F12. Ctrl+Alt+Del is in the floating menu.
 */
class KeyBar(context: Context, parent: ViewGroup, private val keys: KeyboardBridge, private val target: View) {
    val view: View = LayoutInflater.from(context).inflate(R.layout.view_keybar, parent, false)
    private val row: LinearLayout = view.findViewById(R.id.keys)
    private val modifierViews = mutableMapOf<Modifier, TextView>()
    private var page = 0

    private sealed class Key(val label: String) {
        class Mod(label: String, val m: Modifier) : Key(label)
        class Special(label: String, val k: SpecialKey) : Key(label)
    }

    private val pages: List<List<Key>> = listOf(
        listOf(
            Key.Mod("Ctrl", Modifier.CTRL), Key.Mod("Alt", Modifier.ALT), Key.Mod("Shift", Modifier.SHIFT), Key.Mod("Win", Modifier.WIN),
            Key.Special("Esc", SpecialKey.ESC), Key.Special("Tab", SpecialKey.TAB), Key.Special("⏎", SpecialKey.ENTER), Key.Special("⌫", SpecialKey.BACKSPACE),
        ),
        listOf(
            Key.Special("←", SpecialKey.LEFT), Key.Special("↑", SpecialKey.UP), Key.Special("↓", SpecialKey.DOWN), Key.Special("→", SpecialKey.RIGHT),
            Key.Special("Home", SpecialKey.HOME), Key.Special("End", SpecialKey.END), Key.Special("Del", SpecialKey.DELETE),
        ),
        (1..6).map { Key.Special("F$it", SpecialKey.valueOf("F$it")) },
        (7..12).map { Key.Special("F$it", SpecialKey.valueOf("F$it")) },
    )

    init {
        // One key with a modifier, then the modifiers let go (as a phone keyboard's Shift does).
        keys.afterModifiedKey = { keys.releaseAll(); paint() }
        show(0)
    }

    private fun show(p: Int) {
        page = p
        row.removeAllViews()
        modifierViews.clear()
        for (k in pages[p]) {
            val v = add(k.label) {
                when (k) {
                    is Key.Mod -> { keys.setModifier(k.m, !keys.isHeld(k.m)); paint() }
                    is Key.Special -> keys.special(k.k)
                }
            }
            if (k is Key.Mod) modifierViews[k.m] = v
        }
        // ⋯ shows which page is next.
        add("⋯ " + (p + 2).let { if (it > pages.size) 1 else it } + "/" + pages.size) { show((page + 1) % pages.size) }
            .apply { setTextColor(0xFFE8A9C9.toInt()) }
        paint()
    }

    private fun add(label: String, onTap: () -> Unit): TextView {
        val v = TextView(view.context).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 15f
            gravity = Gravity.CENTER
            maxLines = 1
            setBackgroundResource(android.R.drawable.list_selector_background)
            isClickable = true
            setOnClickListener { performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onTap() }
        }
        // Equal widths that always fit: no scrolling, no key cut in half at the edge.
        row.addView(v, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        return v
    }

    private fun paint() {
        for ((m, v) in modifierViews) v.setBackgroundColor(if (keys.isHeld(m)) 0xFFB02A72.toInt() else Color.TRANSPARENT)
    }

    /** The keyboard went away: let go of held modifiers and start from the first page next time. */
    fun hidden() {
        keys.releaseAll()
        if (page != 0) show(0) else paint()
    }

    /** Opens the phone keyboard on the remote picture (a moment after a menu closes, so focus is back). */
    fun showKeyboard() {
        target.postDelayed({
            target.requestFocus()
            val imm = view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.restartInput(target)
            androidx.core.view.ViewCompat.getWindowInsetsController(target)?.show(androidx.core.view.WindowInsetsCompat.Type.ime())
                ?: imm.showSoftInput(target, InputMethodManager.SHOW_IMPLICIT)
        }, 250)
    }
}
