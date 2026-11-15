package th.sichomphu.scpremote.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.data.SecureStore
import th.sichomphu.scpremote.data.ServerChoice
import th.sichomphu.scpremote.data.ServerConfig
import th.sichomphu.scpremote.net.ControlChannel
import th.sichomphu.scpremote.net.PinnedTrust

/** Sign-in with an SCP-Remote account; signs in by itself when an account is remembered. */
class LoginActivity : AppCompatActivity() {
    private lateinit var connection: View
    private lateinit var connectionMode: TextView
    private val prefs by lazy { th.sichomphu.scpremote.data.Prefs(this) }
    private lateinit var user: EditText
    private lateinit var pass: EditText
    private lateinit var remember: CheckBox
    private lateinit var error: TextView
    private lateinit var button: Button
    private lateinit var config: ServerConfig
    private lateinit var store: SecureStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (AppSession.channel != null) { openDevices(); return }
        setContentView(R.layout.activity_login)
        // The pink hero runs up under the status bar (white icons); the form stays clear of the
        // navigation bar and the keyboard.
        androidx.core.view.WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = false
        findViewById<View>(R.id.hero).padForSystemBars(top = true, bottom = false)
        findViewById<View>(R.id.loginRoot).padForSystemBars(top = false, bottom = true)
        findViewById<TextView>(R.id.footer).text = getString(R.string.footer_version, packageManager.getPackageInfo(packageName, 0).versionName)
        // On a tablet the form stays a comfortable 480 dp wide instead of spanning the screen.
        if (resources.configuration.screenWidthDp > 560) {
            findViewById<View>(R.id.loginCard).layoutParams.width = (480 * resources.displayMetrics.density).toInt()
        }
        connection = findViewById(R.id.connection); connectionMode = findViewById(R.id.connectionMode); user = findViewById(R.id.user); pass = findViewById(R.id.pass)
        remember = findViewById(R.id.remember); error = findViewById(R.id.error); button = findViewById(R.id.signIn)
        config = ServerConfig.load(this)
        store = SecureStore(this)

        val saved = store.load()
        showConnection()
        connection.setOnClickListener { chooseConnection() }
        intent.getStringExtra(EXTRA_MESSAGE)?.let { show(it) }
        if (saved != null) {
            user.setText(saved.user); pass.setText(saved.pass)
            if (savedInstanceState == null && !intent.getBooleanExtra(EXTRA_NO_AUTO, false)) signIn()
        }
        button.setOnClickListener { signIn() }
        findViewById<android.widget.ImageButton>(R.id.showPass).setOnClickListener { eye ->
            val hidden = pass.transformationMethod is android.text.method.PasswordTransformationMethod
            pass.transformationMethod = if (hidden) null else android.text.method.PasswordTransformationMethod.getInstance()
            pass.setSelection(pass.text.length)
            eye.alpha = if (hidden) 1f else 0.6f
            (eye as android.widget.ImageButton).imageTintList = android.content.res.ColorStateList.valueOf(
                androidx.core.content.ContextCompat.getColor(this, if (hidden) R.color.accent else R.color.text_muted))
        }
        pass.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_DONE) { signIn(); true } else false }
    }

    private fun modeLabel(m: ServerChoice.Mode) = getString(when (m) {
        ServerChoice.Mode.AUTO -> R.string.conn_auto
        ServerChoice.Mode.HOSPITAL -> R.string.conn_hospital
        ServerChoice.Mode.INTERNET -> R.string.conn_internet
        ServerChoice.Mode.CUSTOM -> R.string.conn_custom
    })

    /** One quiet line under the button: how the app will connect, as a small pill. */
    private fun showConnection() {
        val m = prefs.connectionMode
        connectionMode.text = when (m) {
            ServerChoice.Mode.AUTO -> getString(R.string.conn_short_auto)
            ServerChoice.Mode.HOSPITAL -> getString(R.string.conn_short_hospital)
            ServerChoice.Mode.INTERNET -> getString(R.string.conn_short_internet)
            ServerChoice.Mode.CUSTOM -> prefs.customServer.removePrefix("https://").ifBlank { getString(R.string.conn_custom) }
        }
        connection.contentDescription = getString(R.string.conn_line, connectionMode.text)
    }

    /** Connection setting: automatic (recommended), hospital only, internet only, or an address. */
    private fun chooseConnection() {
        val modes = ServerChoice.Mode.values()
        val labels = modes.map { modeLabel(it) + "\n" + getString(when (it) {
            ServerChoice.Mode.AUTO -> R.string.conn_auto_detail
            ServerChoice.Mode.HOSPITAL -> R.string.conn_hospital_detail
            ServerChoice.Mode.INTERNET -> R.string.conn_internet_detail
            ServerChoice.Mode.CUSTOM -> R.string.conn_custom_detail
        }, config.url.removePrefix("https://"), config.internetUrl.removePrefix("https://")) }.toTypedArray()
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle(R.string.conn_title)
            .setSingleChoiceItems(labels, modes.indexOf(prefs.connectionMode)) { d, i ->
                d.dismiss()
                if (modes[i] == ServerChoice.Mode.CUSTOM) askCustom() else { prefs.connectionMode = modes[i]; showConnection() }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun askCustom() {
        val input = EditText(this).apply {
            setText(prefs.customServer); hint = "https://"; inputType = android.text.InputType.TYPE_TEXT_VARIATION_URI or android.text.InputType.TYPE_CLASS_TEXT
        }
        val pad = (20 * resources.displayMetrics.density).toInt()
        val box = android.widget.FrameLayout(this).apply { setPadding(pad, pad / 2, pad, 0); addView(input) }
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle(R.string.conn_custom)
            .setView(box)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.ok) { _, _ ->
                val url = ServerChoice.normalize(input.text.toString())
                if (url != null) { prefs.customServer = url; prefs.connectionMode = ServerChoice.Mode.CUSTOM }
                showConnection()
            }
            .show()
    }

    private fun signIn() {
        val u = user.text.toString().trim()
        val p = pass.text.toString()
        if (u.isEmpty() || p.isEmpty()) { show(getString(R.string.fill_in)); return }
        busy(true)
        lifecycleScope.launch {
            val trust = PinnedTrust(config.certificateSha256)
            // Automatic: the last address that worked first; if it cannot be reached — e.g. the phone
            // is not on the hospital Wi-Fi — the other known address (internet / hospital).
            var last: Throwable? = null
            for ((i, url) in ServerChoice.forMode(prefs.connectionMode, prefs.lastServer.ifEmpty { null }, prefs.customServer, config).withIndex()) {
                if (i > 0) show(getString(if (ServerChoice.isInternet(url, config)) R.string.trying_internet else R.string.trying_hospital))
                val channel = ControlChannel(url, trust)
                val result = channel.signIn(u, p)
                if (result.isSuccess) {
                    if (remember.isChecked) store.save(url, u, p) else store.clear()
                    prefs.lastServer = url
                    AppSession.server = url; AppSession.trust = trust; AppSession.channel = channel
                    AppSession.viaInternet = ServerChoice.isInternet(url, config)
                    openDevices()
                    return@launch
                }
                last = result.exceptionOrNull()
                if (!ServerChoice.tryNext((last as? th.sichomphu.scpremote.net.ControlError)?.code)) break
            }
            busy(false)
            show(errorText(last))
        }
    }

    private fun busy(on: Boolean) {
        button.isEnabled = !on
        button.text = getString(if (on) R.string.signing_in else R.string.sign_in)
        if (on) error.visibility = View.GONE
    }

    private fun show(text: String) { error.text = text; error.visibility = View.VISIBLE }

    private fun openDevices() {
        startActivity(Intent(this, DevicesActivity::class.java))
        finish()
    }

    companion object {
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_NO_AUTO = "noAuto"
    }
}
