package th.sichomphu.scpremote.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.net.RelaySession
import th.sichomphu.scpremote.net.RelaySession.State
import th.sichomphu.scpremote.net.SessionPolicy
import th.sichomphu.scpremote.protocol.KvmCommand

/**
 * Full-screen remote session. Rotation does not restart it (configChanges in the manifest); it is
 * closed on Back / Disconnect and when the app stays hidden for 30 s, and reopened by itself after a
 * drop (2, 5, 10 s), as the web page does.
 */
class RemoteActivity : AppCompatActivity(), RelaySession.Listener {
    private lateinit var device: Device
    private lateinit var canvas: RemoteCanvas
    private lateinit var overlay: View
    private lateinit var stateText: TextView
    private lateinit var spinner: ProgressBar
    private lateinit var retry: Button
    private lateinit var barScroll: View
    private val ui = Handler(Looper.getMainLooper())
    private var session: RelaySession? = null
    private var attempts = 0
    private var hiddenClosed = false
    private var leaving = false
    private val closeHidden = Runnable { hiddenClosed = true; session?.close(userInitiated = true) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra(EXTRA_DEVICE_ID)
        val found = AppSession.devices?.devices?.firstOrNull { it.id == id }
        if (AppSession.channel == null || found == null) { finish(); return }
        device = found
        setContentView(R.layout.activity_remote)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        immersive()

        canvas = findViewById(R.id.canvas)
        overlay = findViewById(R.id.overlay); stateText = findViewById(R.id.stateText)
        spinner = findViewById(R.id.spinner); retry = findViewById(R.id.retry)
        barScroll = findViewById(R.id.barScroll)
        findViewById<TextView>(R.id.title).text = device.name
        findViewById<Button>(R.id.disconnect).setOnClickListener { leave() }
        val toggle = findViewById<Button>(R.id.barToggle)
        toggle.setOnClickListener {
            val show = barScroll.visibility != View.VISIBLE
            barScroll.visibility = if (show) View.VISIBLE else View.GONE
            toggle.text = if (show) "▴" else "▾"
        }
        retry.setOnClickListener { attempts = 0; connect() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = leave()
        })
        setUpGestures()
        connect()
    }

    private fun immersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun connect() {
        val channel = AppSession.channel ?: return finish()
        val trust = AppSession.trust ?: return finish()
        session?.close(userInitiated = true)
        session = RelaySession(channel, trust, device, this, AppSession.server).also { it.start() }
    }

    /** Back or Disconnect: end on purpose (no reconnect) and return to the computer list. */
    private fun leave() {
        leaving = true
        ui.removeCallbacksAndMessages(null)
        session?.close(userInitiated = true)
        session = null
        finish()
    }

    override fun onStop() {
        super.onStop()
        if (!leaving) ui.postDelayed(closeHidden, SessionPolicy.BACKGROUND_CLOSE_MS)
    }

    override fun onStart() {
        super.onStart()
        ui.removeCallbacks(closeHidden)
        if (hiddenClosed && !leaving) { hiddenClosed = false; attempts = 0; connect() }
    }

    override fun onDestroy() {
        super.onDestroy()
        ui.removeCallbacksAndMessages(null)
        session?.close(userInitiated = true)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    // RelaySession.Listener — called on a background thread.

    override fun onState(state: State) {
        val from = session
        ui.post { if (from === session) showState(state, from) }
    }

    override fun onCommand(cmd: KvmCommand) {
        when (cmd) {
            is KvmCommand.ScreenSize -> canvas.setScreenSize(cmd.w, cmd.h)
            is KvmCommand.Tile -> {
                canvas.drawTile(cmd.x, cmd.y, cmd.image)
                ui.post { if (overlay.visibility == View.VISIBLE && session?.state == State.CONNECTED) { attempts = 0; overlay.visibility = View.GONE } }
            }
            else -> {}
        }
    }

    private fun showState(state: State, s: RelaySession?) {
        when (state) {
            State.CONNECTING -> status(getString(R.string.st_connecting), busy = true)
            State.WAITING_CONSENT -> status(getString(R.string.st_consent), busy = true)
            State.CONNECTED -> if (s?.hadImage == true) overlay.visibility = View.GONE else status(getString(R.string.st_image), busy = true)
            State.REFUSED -> status(getString(R.string.st_refused), busy = false)
            State.CLOSED -> {
                if (leaving || hiddenClosed) return
                val wait = SessionPolicy.reconnectDelay(s?.hadImage == true, s?.userClosed == true, s?.refused == true, onScreen = !isFinishing, attempts = attempts)
                if (wait != null) {
                    attempts++
                    status(getString(R.string.st_reconnecting, attempts), busy = true)
                    ui.postDelayed({ if (!leaving && session === s) connect() }, wait)
                } else {
                    status(getString(R.string.st_closed), busy = false)
                }
            }
        }
    }

    private fun status(text: String, busy: Boolean) {
        overlay.visibility = View.VISIBLE
        stateText.text = text
        spinner.visibility = if (busy) View.VISIBLE else View.GONE
        retry.visibility = if (busy) View.GONE else View.VISIBLE
    }

    /** Two fingers: pinch to zoom, move to pan. (One-finger mouse arrives with the input controllers.) */
    @SuppressLint("ClickableViewAccessibility")
    private fun setUpGestures() {
        val scale = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: ScaleGestureDetector): Boolean { canvas.zoomBy(d.scaleFactor, d.focusX, d.focusY); return true }
        })
        var lastX = 0f; var lastY = 0f
        canvas.setOnTouchListener { _, e ->
            scale.onTouchEvent(e)
            if (e.pointerCount >= 2) {
                val fx = (e.getX(0) + e.getX(1)) / 2; val fy = (e.getY(0) + e.getY(1)) / 2
                if (e.actionMasked == MotionEvent.ACTION_MOVE) canvas.panBy(fx - lastX, fy - lastY)
                lastX = fx; lastY = fy
            }
            true
        }
    }

    companion object {
        const val EXTRA_DEVICE_ID = "deviceId"
    }
}
