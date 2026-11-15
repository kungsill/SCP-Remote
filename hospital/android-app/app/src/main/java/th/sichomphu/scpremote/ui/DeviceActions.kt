package th.sichomphu.scpremote.ui

import android.content.Intent
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.protocol.ControlMessages

/** Restart, shut down, wake and the long-press menu of a computer card. */
object DeviceActions {
    /** Asks first (Cancel is the focused, safe choice): unsaved work on the computer is lost. */
    fun confirmPower(activity: AppCompatActivity, d: Device, actionType: Int) {
        val restart = actionType == ControlMessages.RESTART
        Sheets.confirm(
            activity, icon = if (restart) R.drawable.ic_restart else R.drawable.ic_power, tint = Look.Tint.RED,
            title = activity.getString(if (restart) R.string.restart_title else R.string.shutdown_title),
            subtitle = Sheets.where(d), warning = activity.getString(R.string.power_warning),
            confirm = activity.getString(if (restart) R.string.restart else R.string.shutdown),
        ) { power(activity, d, actionType) }
    }

    private fun power(activity: AppCompatActivity, d: Device, actionType: Int) {
        val channel = AppSession.channel ?: return
        activity.lifecycleScope.launch {
            val refusal = try { channel.power(d.id, actionType) } catch (e: Exception) { "DISCONNECTED" }
            val text = when (refusal) {
                null -> activity.getString(if (actionType == ControlMessages.RESTART) R.string.restart_sent else R.string.shutdown_sent, d.name)
                "MAINTENANCE_WORKFLOW_REQUIRED" -> activity.getString(R.string.power_critical)
                else -> activity.getString(R.string.err_other, refusal)
            }
            Toast.makeText(activity, text, Toast.LENGTH_LONG).show()
        }
    }

    /** Wake-on-LAN through another computer that is on in the same network. */
    fun wake(activity: AppCompatActivity, d: Device) {
        val channel = AppSession.channel ?: return
        Toast.makeText(activity, activity.getString(R.string.wake_sending, d.name), Toast.LENGTH_SHORT).show()
        activity.lifecycleScope.launch {
            val r = try { channel.wake(d.id) } catch (e: Exception) { null }
            val text = when {
                r == null -> activity.getString(R.string.wake_no_answer)
                r.startsWith("Used") -> activity.getString(R.string.wake_sent, d.name)
                r.contains("MAC") -> activity.getString(R.string.wake_no_mac)
                else -> activity.getString(R.string.err_other, r)
            }
            Toast.makeText(activity, text, Toast.LENGTH_LONG).show()
        }
    }

    /** ⋮ or long-press on a card: everything that can be done to this computer, as a sheet. */
    fun menu(activity: AppCompatActivity, d: Device, onConnect: (Device) -> Unit, onFix: (Device) -> Unit) {
        val items = mutableListOf<Sheets.Action>()
        fun add(icon: Int, tint: Look.Tint, label: Int, run: () -> Unit) { items += Sheets.Action(icon, tint, activity.getString(label), run) }
        if (d.online && d.canView) add(if (d.viewOnly) R.drawable.ic_visibility else R.drawable.ic_monitor, Look.Tint.PINK,
            if (d.viewOnly) R.string.view_only else R.string.connect) { onConnect(d) }
        if (d.online && d.canFiles) add(R.drawable.ic_folder, Look.Tint.AMBER, R.string.files) {
            activity.startActivity(Intent(activity, FilesActivity::class.java).putExtra(FilesActivity.EXTRA_DEVICE_ID, d.id))
        }
        if (d.online && d.canFixPrinter) add(R.drawable.ic_print, Look.Tint.CYAN, R.string.fix_printer) { onFix(d) }
        if (d.online && d.canPower) {
            add(R.drawable.ic_restart, Look.Tint.RED, R.string.restart) { confirmPower(activity, d, ControlMessages.RESTART) }
            add(R.drawable.ic_power, Look.Tint.RED, R.string.shutdown) { confirmPower(activity, d, ControlMessages.SHUTDOWN) }
        }
        if (!d.online && d.canWake) add(R.drawable.ic_wake, Look.Tint.GREEN, R.string.wake) { wake(activity, d) }
        if (items.isEmpty()) return
        Sheets.actions(activity, d, items)
    }
}
