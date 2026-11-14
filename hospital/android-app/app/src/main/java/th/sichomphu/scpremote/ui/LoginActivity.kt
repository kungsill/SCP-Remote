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
import th.sichomphu.scpremote.data.ServerConfig
import th.sichomphu.scpremote.net.ControlChannel
import th.sichomphu.scpremote.net.PinnedTrust

/** Sign-in with an SCP-Remote account; signs in by itself when an account is remembered. */
class LoginActivity : AppCompatActivity() {
    private lateinit var server: EditText
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
        // Light page: dark status-bar icons, and keep the form clear of the bars and the keyboard.
        @Suppress("DEPRECATION") // ignored on Android 15+, where the page already runs under the bar
        window.statusBarColor = androidx.core.content.ContextCompat.getColor(this, R.color.background)
        androidx.core.view.WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = true
        findViewById<View>(R.id.loginRoot).padForSystemBars(top = true, bottom = true)
        server = findViewById(R.id.server); user = findViewById(R.id.user); pass = findViewById(R.id.pass)
        remember = findViewById(R.id.remember); error = findViewById(R.id.error); button = findViewById(R.id.signIn)
        config = ServerConfig.load(this)
        store = SecureStore(this)

        val saved = store.load()
        server.setText(saved?.server?.ifEmpty { null } ?: config.url)
        intent.getStringExtra(EXTRA_MESSAGE)?.let { show(it) }
        if (saved != null) {
            user.setText(saved.user); pass.setText(saved.pass)
            if (savedInstanceState == null && !intent.getBooleanExtra(EXTRA_NO_AUTO, false)) signIn()
        }
        button.setOnClickListener { signIn() }
        pass.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_DONE) { signIn(); true } else false }
    }

    private fun normalized(): String {
        var s = server.text.toString().trim().trimEnd('/')
        if (!s.startsWith("https://") && !s.startsWith("http://")) s = "https://$s"
        return s.replaceFirst("http://", "https://")
    }

    private fun signIn() {
        val u = user.text.toString().trim()
        val p = pass.text.toString()
        if (u.isEmpty() || p.isEmpty()) { show(getString(R.string.fill_in)); return }
        val url = normalized()
        busy(true)
        lifecycleScope.launch {
            val trust = PinnedTrust(config.certificateSha256)
            val channel = ControlChannel(url, trust)
            val result = channel.signIn(u, p)
            if (result.isSuccess) {
                if (remember.isChecked) store.save(url, u, p) else store.clear()
                AppSession.server = url; AppSession.trust = trust; AppSession.channel = channel
                openDevices()
            } else {
                busy(false)
                show(errorText(result.exceptionOrNull()))
            }
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
