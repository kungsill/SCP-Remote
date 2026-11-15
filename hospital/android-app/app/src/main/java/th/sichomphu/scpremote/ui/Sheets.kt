package th.sichomphu.scpremote.ui

import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.model.Device

/** Bottom sheets of the 1.3.0 look: confirm (with a warning box) and a computer's action list. */
object Sheets {
    data class Action(val icon: Int, val tint: Look.Tint, val label: String, val run: () -> Unit)

    fun where(d: Device) = listOf(d.ip, d.groupName).filter { it.isNotBlank() }.joinToString(" · ").let {
        if (it.isEmpty()) d.name else "${d.name} · $it"
    }

    /** A sheet that opens fully expanded (no half-open step). */
    fun open(activity: AppCompatActivity, content: View): BottomSheetDialog =
        BottomSheetDialog(activity).apply {
            setContentView(content)
            behavior.state = BottomSheetBehavior.STATE_EXPANDED
            behavior.skipCollapsed = true
        }

    fun tint(view: ImageView, icon: Int, tint: Look.Tint) {
        val ctx = view.context
        view.setImageResource(icon)
        view.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(ctx, tint.bg))
        view.imageTintList = ColorStateList.valueOf(ContextCompat.getColor(ctx, tint.icon))
    }

    /**
     * Asks before something that cannot be undone. The confirm button is outlined red; Cancel is
     * the filled, focused choice, so a stray tap does nothing harmful.
     */
    fun confirm(
        activity: AppCompatActivity, icon: Int, tint: Look.Tint, title: String, subtitle: String,
        warning: String, confirm: String, onConfirm: () -> Unit,
    ) {
        val v = LayoutInflater.from(activity).inflate(R.layout.sheet_confirm, null)
        tint(v.findViewById(R.id.sheetIcon), icon, tint)
        v.findViewById<TextView>(R.id.sheetTitle).text = title
        v.findViewById<TextView>(R.id.sheetSubtitle).text = subtitle
        v.findViewById<TextView>(R.id.sheetWarning).text = warning
        val dialog = open(activity, v)
        v.findViewById<TextView>(R.id.sheetConfirm).apply {
            text = confirm
            setOnClickListener { dialog.dismiss(); onConfirm() }
        }
        v.findViewById<View>(R.id.sheetCancel).apply {
            setOnClickListener { dialog.dismiss() }
            requestFocus()
        }
        dialog.show()
    }

    /** A computer's actions as a list of coloured rows under its name. */
    fun actions(activity: AppCompatActivity, d: Device, items: List<Action>) {
        val v = LayoutInflater.from(activity).inflate(R.layout.sheet_actions, null)
        val t = Look.tileTint(d.groupId, d.online)
        tint(v.findViewById(R.id.sheetTile), R.drawable.ic_monitor, t)
        v.findViewById<TextView>(R.id.sheetTitle).text = d.name
        v.findViewById<TextView>(R.id.sheetSubtitle).text =
            listOf(d.ip, d.groupName, activity.getString(if (d.online) R.string.online else R.string.offline)).filter { it.isNotBlank() }.joinToString(" · ")
        val dialog = open(activity, v)
        val list = v.findViewById<LinearLayout>(R.id.sheetItems)
        for (a in items) {
            val row = LayoutInflater.from(activity).inflate(R.layout.item_action_row, list, false)
            tint(row.findViewById(R.id.rowIcon), a.icon, a.tint)
            row.findViewById<TextView>(R.id.rowLabel).apply {
                text = a.label
                if (a.tint == Look.Tint.RED) setTextColor(ContextCompat.getColor(activity, R.color.danger))
            }
            row.setOnClickListener { dialog.dismiss(); a.run() }
            list.addView(row)
        }
        dialog.show()
    }
}
