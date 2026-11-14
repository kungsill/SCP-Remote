package th.sichomphu.scpremote.ui

import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Android 15+ draws every app under the status and navigation bars. Pads this view by those bars
 * (and the keyboard, for [bottom]) on top of its own padding, so nothing sits under the clock.
 */
fun View.padForSystemBars(top: Boolean, bottom: Boolean) {
    val l = paddingLeft; val t = paddingTop; val r = paddingRight; val b = paddingBottom
    ViewCompat.setOnApplyWindowInsetsListener(this) { v, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        v.setPadding(l + bars.left, t + (if (top) bars.top else 0), r + bars.right, b + (if (bottom) maxOf(bars.bottom, ime.bottom) else 0))
        insets
    }
    ViewCompat.requestApplyInsets(this)
}
