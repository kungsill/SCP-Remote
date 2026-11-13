package th.sichomphu.scpremote.ui

import android.content.Context
import android.graphics.Color
import android.view.Gravity
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
 * The row of keys under the remote picture: ⌨ opens the phone keyboard, then modifiers (toggles),
 * Esc Tab Enter ⌫ Del, arrows, Home End, F1–F12 and Ctrl+Alt+Del.
 */
class KeyBar(context: Context, parent: ViewGroup, private val keys: KeyboardBridge, private val target: View) {
    val view: View = LayoutInflater.from(context).inflate(R.layout.view_keybar, parent, false)
    private val row: LinearLayout = view.findViewById(R.id.keys)
    private val modifierViews = mutableMapOf<Modifier, TextView>()
    private val density = context.resources.displayMetrics.density

    init {
        add("⌨") { showKeyboard() }
        for ((m, label) in listOf(Modifier.CTRL to "Ctrl", Modifier.ALT to "Alt", Modifier.SHIFT to "Shift", Modifier.WIN to "⊞ Win")) {
            modifierViews[m] = add(label) { keys.setModifier(m, !keys.isHeld(m)); paint() }
        }
        val specials = listOf(
            SpecialKey.ESC to "Esc", SpecialKey.TAB to "Tab", SpecialKey.ENTER to "Enter", SpecialKey.BACKSPACE to "⌫",
            SpecialKey.DELETE to "Del", SpecialKey.LEFT to "←", SpecialKey.UP to "↑", SpecialKey.DOWN to "↓", SpecialKey.RIGHT to "→",
            SpecialKey.HOME to "Home", SpecialKey.END to "End",
        ) + (1..12).map { SpecialKey.valueOf("F$it") to "F$it" } + listOf(SpecialKey.CTRL_ALT_DEL to "Ctrl+Alt+Del")
        for ((k, label) in specials) add(label) { keys.special(k) }
        // One key with a modifier, then the modifiers let go (as a phone keyboard's Shift does).
        keys.afterModifiedKey = { keys.releaseAll(); paint() }
    }

    private fun add(label: String, onTap: () -> Unit): TextView {
        val v = TextView(view.context).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            minWidth = (44 * density).toInt()
            setPadding((10 * density).toInt(), 0, (10 * density).toInt(), 0)
            setBackgroundResource(android.R.drawable.list_selector_background)
            isClickable = true
            setOnClickListener { onTap() }
        }
        row.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return v
    }

    private fun paint() {
        for ((m, v) in modifierViews) v.setBackgroundColor(if (keys.isHeld(m)) 0xFFB02A72.toInt() else Color.TRANSPARENT)
    }

    fun showKeyboard() {
        target.requestFocus()
        val imm = view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.restartInput(target)
        imm.showSoftInput(target, InputMethodManager.SHOW_IMPLICIT)
    }
}
