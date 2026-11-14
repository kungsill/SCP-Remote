package th.sichomphu.scpremote.ui

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.PopupMenu
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.launch
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.data.SecureStore
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.model.DeviceList
import th.sichomphu.scpremote.model.FixResult
import th.sichomphu.scpremote.update.AppUpdater
import th.sichomphu.scpremote.update.UpdateManifest

/** The computers this account may see, with search, a department filter, Connect and Fix printing. */
class DevicesActivity : AppCompatActivity() {
    private lateinit var adapter: DeviceAdapter
    private lateinit var search: EditText
    private lateinit var group: Spinner
    private lateinit var status: TextView
    private var groupIds: List<String?> = listOf(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (AppSession.channel == null) { backToLogin(null); return }
        setContentView(R.layout.activity_devices)
        // The pink header runs up under the status bar; the list stops above the navigation bar.
        findViewById<View>(R.id.header).padForSystemBars(top = true, bottom = false)
        findViewById<View>(R.id.root).padForSystemBars(top = false, bottom = true)
        search = findViewById(R.id.search); group = findViewById(R.id.group); status = findViewById(R.id.status)
        adapter = DeviceAdapter(onConnect = ::openRemote, onFix = ::confirmFix)
        findViewById<RecyclerView>(R.id.list).apply { layoutManager = LinearLayoutManager(this@DevicesActivity); adapter = this@DevicesActivity.adapter }
        findViewById<Button>(R.id.refresh).setOnClickListener { load() }
        findViewById<Button>(R.id.more).setOnClickListener { menu(it) }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) = render()
        })
        group.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) = render()
            override fun onNothingSelected(p: AdapterView<*>?) {}
        }
        AppSession.channel?.onDisconnected = { runOnUiThread { backToLogin(getString(R.string.err_DISCONNECTED)) } }
        AppSession.devices?.let { show(it) }
        load()
    }

    override fun onResume() {
        super.onResume()
        if (AppSession.channel == null) backToLogin(null)
    }

    private fun load() {
        val channel = AppSession.channel ?: return
        status.text = getString(R.string.loading)
        lifecycleScope.launch {
            try {
                val list = channel.devices()
                AppSession.devices = list
                show(list)
                checkUpdate(manual = false)
            } catch (e: Exception) {
                status.text = errorText(e)
            }
        }
    }

    private fun show(list: DeviceList) {
        findViewById<TextView>(R.id.who).text = list.userName
        val selected = groupIds.getOrNull(group.selectedItemPosition)
        val groups = list.groups.filter { g -> list.devices.any { it.groupId == g.id } }
        groupIds = listOf<String?>(null) + groups.map { it.id }
        val names = listOf(getString(R.string.all_groups)) + groups.map { it.name }
        group.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
        group.setSelection(groupIds.indexOf(selected).coerceAtLeast(0))
        render()
    }

    private fun render() {
        val list = AppSession.devices ?: return
        val shown = DeviceFilter.apply(list.devices, search.text.toString(), groupIds.getOrNull(group.selectedItemPosition))
        adapter.submit(shown)
        status.text = if (shown.isEmpty()) getString(R.string.no_devices)
        else getString(R.string.count, shown.size, shown.count { it.online })
    }

    private fun openRemote(d: Device) {
        startActivity(Intent(this, RemoteActivity::class.java).putExtra(RemoteActivity.EXTRA_DEVICE_ID, d.id))
    }

    /** Asks first (Cancel is the safe, focused choice): the fix deletes waiting print jobs. */
    private fun confirmFix(d: Device) {
        val where = listOf(d.name, d.ip, d.groupName).filter { it.isNotBlank() }.joinToString(" · ")
        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.fix_title)
            .setMessage(where + "\n\n" + getString(R.string.fix_warning))
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.fix_go) { _, _ -> runFix(d) }
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(ContextCompat.getColor(this, R.color.danger))
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).requestFocus()
        }
        dialog.show()
    }

    private fun runFix(d: Device) {
        val channel = AppSession.channel ?: return
        adapter.setFix(d.id, getString(R.string.fix_working), busy = true)
        lifecycleScope.launch {
            val r = channel.fixPrinter(d.id)
            adapter.setFix(d.id, fixText(r), busy = false)
        }
    }

    private fun fixText(r: FixResult): String = when {
        r.error == null && r.ok -> getString(R.string.fix_done, r.before?.toString() ?: "?", r.after?.toString() ?: "?", r.spooler ?: "?")
        r.error == null -> getString(R.string.fix_spooler_down, r.spooler ?: "?")
        r.error == "ACCESS_DENIED" -> getString(R.string.fix_ACCESS_DENIED)
        r.error == "NOT_ONLINE" -> getString(R.string.fix_NOT_ONLINE)
        r.error == "NO_ANSWER" -> getString(R.string.fix_NO_ANSWER)
        r.error == "COMMAND_BUSY" -> getString(R.string.fix_COMMAND_BUSY)
        else -> getString(R.string.fix_failed, r.error)
    }

    private fun menu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(R.string.update).setOnMenuItemClickListener { checkUpdate(manual = true); true }
            menu.add(R.string.sign_out).setOnMenuItemClickListener { confirmSignOut(); true }
            menu.add(getString(R.string.version, packageManager.getPackageInfo(packageName, 0).versionName)).isEnabled = false
            show()
        }
    }

    private fun updater(): AppUpdater? = AppSession.trust?.let { AppUpdater(applicationContext, AppSession.server, it) }

    /** Once per sign-in (and from the menu): offer a newer app published on the server. */
    private fun checkUpdate(manual: Boolean) {
        val u = updater() ?: return
        if (!manual && AppSession.updateChecked) return
        AppSession.updateChecked = true
        lifecycleScope.launch {
            val m = u.check()
            if (m == null) {
                if (manual) android.widget.Toast.makeText(this@DevicesActivity, R.string.update_none, android.widget.Toast.LENGTH_SHORT).show()
                return@launch
            }
            AlertDialog.Builder(this@DevicesActivity)
                .setTitle(getString(R.string.update_available, m.versionName))
                .setMessage(R.string.update_message)
                .setNegativeButton(R.string.later, null)
                .setPositiveButton(R.string.update) { _, _ -> runUpdate(u, m) }
                .show()
        }
    }

    private fun runUpdate(u: AppUpdater, m: UpdateManifest) {
        if (!u.canInstall()) {
            android.widget.Toast.makeText(this, R.string.update_allow, android.widget.Toast.LENGTH_LONG).show()
            u.openInstallPermission()
            return
        }
        status.text = getString(R.string.update_downloading)
        lifecycleScope.launch {
            val apk = u.download(m)
            if (apk == null) { status.text = getString(R.string.update_failed); return@launch }
            render()
            u.install(apk)
        }
    }

    private fun confirmSignOut() {
        AlertDialog.Builder(this)
            .setMessage(R.string.sign_out_confirm)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.sign_out) { _, _ ->
                SecureStore(this).clear()
                AppSession.signOut()
                startActivity(Intent(this, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_NO_AUTO, true))
                finish()
            }
            .show()
    }

    private fun backToLogin(message: String?) {
        AppSession.signOut()
        startActivity(Intent(this, LoginActivity::class.java).apply { message?.let { putExtra(LoginActivity.EXTRA_MESSAGE, it) } })
        finish()
    }
}
