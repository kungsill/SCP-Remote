package th.sichomphu.scpremote.ui

import android.content.Intent
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
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
        val where = listOf(d.name, d.ip, d.groupName).filter { it.isNotBlank() }.joinToString(" · ")
        val dialog = MaterialAlertDialogBuilder(activity)
            .setTitle(if (restart) R.string.restart_title else R.string.shutdown_title)
            .setMessage(where + "\n\n" + activity.getString(R.string.power_warning))
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(if (restart) R.string.restart else R.string.shutdown) { _, _ -> power(activity, d, actionType) }
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(ContextCompat.getColor(activity, R.color.danger))
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).requestFocus()
        }
        dialog.show()
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

    /** Long-press on a card: everything that can be done to this computer, as a list. */
    fun menu(activity: AppCompatActivity, d: Device, onConnect: (Device) -> Unit, onFix: (Device) -> Unit) {
        val items = mutableListOf<Pair<String, () -> Unit>>()
        if (d.online && d.canView) items += activity.getString(if (d.viewOnly) R.string.view_only else R.string.connect) to { onConnect(d) }
        if (d.online && d.canFiles) items += activity.getString(R.string.files) to {
            activity.startActivity(Intent(activity, FilesActivity::class.java).putExtra(FilesActivity.EXTRA_DEVICE_ID, d.id))
        }
        if (d.online && d.canFixPrinter) items += activity.getString(R.string.fix_printer) to { onFix(d) }
        if (d.online && d.canPower) {
            items += activity.getString(R.string.restart) to { confirmPower(activity, d, ControlMessages.RESTART) }
            items += activity.getString(R.string.shutdown) to { confirmPower(activity, d, ControlMessages.SHUTDOWN) }
        }
        if (!d.online && d.canWake) items += activity.getString(R.string.wake) to { wake(activity, d) }
        if (items.isEmpty()) return
        MaterialAlertDialogBuilder(activity)
            .setTitle(d.name)
            .setItems(items.map { it.first }.toTypedArray()) { _, i -> items[i].second() }
            .setNegativeButton(R.string.close, null)
            .show()
    }
}
