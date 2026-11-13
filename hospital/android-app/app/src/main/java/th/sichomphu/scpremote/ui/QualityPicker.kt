package th.sichomphu.scpremote.ui

import android.content.Context
import androidx.appcompat.app.AlertDialog
import th.sichomphu.scpremote.R

/** Picture level and display choosers for the remote toolbar. */
object QualityPicker {
    fun names(context: Context): Array<String> = context.resources.getStringArray(R.array.quality_names)

    fun pickQuality(context: Context, current: Int, onPick: (Int) -> Unit) {
        AlertDialog.Builder(context)
            .setTitle(R.string.quality)
            .setSingleChoiceItems(names(context), current) { d, which -> d.dismiss(); onPick(which) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    fun displayName(context: Context, n: Int): String =
        if (n == 65535) context.getString(R.string.all_displays) else context.getString(R.string.display_n, n)

    fun pickDisplay(context: Context, list: List<Int>, selected: Int, onPick: (Int) -> Unit) {
        val labels = list.map { displayName(context, it) }.toTypedArray()
        AlertDialog.Builder(context)
            .setTitle(R.string.display)
            .setSingleChoiceItems(labels, list.indexOf(selected)) { d, which -> d.dismiss(); onPick(list[which]) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
