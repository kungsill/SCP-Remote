package th.sichomphu.scpremote.ui

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.EditText
import android.widget.PopupMenu
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import th.sichomphu.scpremote.data.Prefs
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
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

/**
 * The computers this account may see: recent ones first, a department chip row, search, pull to
 * refresh (and a quiet refresh every 30 s), Connect and Fix printing.
 */
class DevicesActivity : AppCompatActivity() {
    private lateinit var adapter: DeviceAdapter
    private lateinit var search: EditText
    private lateinit var groups: ChipGroup
    private lateinit var status: TextView
    private lateinit var swipe: SwipeRefreshLayout
    private val prefs by lazy { Prefs(this) }
    /** Selected department, null = all. */
    private var groupId: String? = null
    private var loading = false
    private val autoRefresh = object : Runnable {
        override fun run() { load(quiet = true); swipe.postDelayed(this, AUTO_REFRESH_MS) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (AppSession.channel == null) { backToLogin(null); return }
        setContentView(R.layout.activity_devices)
        // The pink header runs up under the status bar; the list stops above the navigation bar.
        findViewById<View>(R.id.header).padForSystemBars(top = true, bottom = false)
        findViewById<View>(R.id.root).padForSystemBars(top = false, bottom = true)
        search = findViewById(R.id.search); groups = findViewById(R.id.groups); status = findViewById(R.id.status)
        swipe = findViewById(R.id.swipe)
        swipe.setColorSchemeColors(ContextCompat.getColor(this, R.color.accent))
        swipe.setOnRefreshListener { load(quiet = false) }
        adapter = DeviceAdapter(onConnect = ::openRemote, onFix = ::confirmFix)
        // One column on a phone; on a tablet or a phone held sideways, as many ~400 dp columns as fit.
        val columns = (resources.configuration.screenWidthDp / 400).coerceIn(1, 3)
        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = if (columns == 1) LinearLayoutManager(this@DevicesActivity)
            else GridLayoutManager(this@DevicesActivity, columns).apply {
                // Section headings span the full width.
                spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
                    override fun getSpanSize(position: Int) = if (this@DevicesActivity.adapter.isHeader(position)) columns else 1
                }
            }
            adapter = this@DevicesActivity.adapter
        }
        findViewById<View>(R.id.more).setOnClickListener { menu(it) }
        val clear = findViewById<View>(R.id.clearSearch)
        clear.setOnClickListener { search.setText("") }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                clear.visibility = if (s.isNullOrEmpty()) View.GONE else View.VISIBLE
                render()
            }
        })
        AppSession.channel?.onDisconnected = { runOnUiThread { backToLogin(getString(R.string.err_DISCONNECTED)) } }
        AppSession.devices?.let { show(it) }
        load(quiet = false)
    }

    override fun onResume() {
        super.onResume()
        if (AppSession.channel == null) { backToLogin(null); return }
        // Back from a remote session: the recent row may have changed.
        render()
        swipe.removeCallbacks(autoRefresh)
        swipe.postDelayed(autoRefresh, AUTO_REFRESH_MS)
    }

    override fun onPause() {
        super.onPause()
        if (::swipe.isInitialized) swipe.removeCallbacks(autoRefresh)
    }

    /** [quiet]: the 30-second refresh, which changes nothing on screen unless the list did. */
    private fun load(quiet: Boolean) {
        val channel = AppSession.channel ?: return
        if (loading) { swipe.isRefreshing = false; return }
        loading = true
        if (!quiet && AppSession.devices == null) status.text = getString(R.string.loading)
        lifecycleScope.launch {
            try {
                val list = channel.devices()
                if (list != AppSession.devices) { AppSession.devices = list; show(list) }
                checkUpdate(manual = false)
            } catch (e: Exception) {
                if (!quiet) status.text = errorText(e)
            } finally {
                loading = false
                swipe.isRefreshing = false
            }
        }
    }

    private fun show(list: DeviceList) {
        findViewById<TextView>(R.id.who).text = list.userName
        val present = list.groups.filter { g -> list.devices.any { it.groupId == g.id } }
        if (groupId != null && present.none { it.id == groupId }) groupId = null
        groups.setOnCheckedStateChangeListener(null)
        groups.removeAllViews()
        fun chip(id: String?, label: String, count: Int) = Chip(this).apply {
            text = getString(R.string.chip_label, label, count)
            isCheckable = true
            isCheckedIconVisible = false
            tag = id
            this.id = View.generateViewId()
            groups.addView(this)
            if (id == groupId) isChecked = true
        }
        chip(null, getString(R.string.all_groups), list.devices.size)
        present.forEach { g -> chip(g.id, g.name, list.devices.count { it.groupId == g.id }) }
        groups.setOnCheckedStateChangeListener { group, checked ->
            groupId = checked.firstOrNull()?.let { group.findViewById<View>(it)?.tag as String? }
            render()
        }
        render()
    }

    private fun render() {
        val list = AppSession.devices ?: return
        val query = search.text.toString()
        val shown = DeviceFilter.apply(list.devices, query, groupId)
        adapter.submit(DeviceSections.build(shown, prefs.recent, showRecent = query.isBlank() && groupId == null))
        status.text = if (shown.isEmpty()) getString(R.string.no_devices)
        else getString(R.string.count, shown.size, shown.count { it.online })
    }

    private fun openRemote(d: Device) {
        prefs.recent = DeviceSections.pushRecent(prefs.recent, d.id)
        startActivity(Intent(this, RemoteActivity::class.java).putExtra(RemoteActivity.EXTRA_DEVICE_ID, d.id))
    }

    /** Asks first (Cancel is the safe, focused choice): the fix deletes waiting print jobs. */
    private fun confirmFix(d: Device) {
        val where = listOf(d.name, d.ip, d.groupName).filter { it.isNotBlank() }.joinToString(" · ")
        val dialog = MaterialAlertDialogBuilder(this)
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
        adapter.setFix(d.id, getString(R.string.fix_working), DeviceAdapter.FixState.BUSY)
        lifecycleScope.launch {
            val r = channel.fixPrinter(d.id)
            adapter.setFix(d.id, fixText(r), if (r.error == null && r.ok) DeviceAdapter.FixState.OK else DeviceAdapter.FixState.FAILED)
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
            menu.add(R.string.refresh).setOnMenuItemClickListener { swipe.isRefreshing = true; load(quiet = false); true }
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
            MaterialAlertDialogBuilder(this@DevicesActivity)
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
        MaterialAlertDialogBuilder(this)
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

    private companion object { const val AUTO_REFRESH_MS = 30_000L }
}
