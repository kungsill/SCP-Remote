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
import th.sichomphu.scpremote.data.Prefs
import th.sichomphu.scpremote.data.Quality
import androidx.core.view.ViewCompat
import th.sichomphu.scpremote.input.DirectTouchController
import th.sichomphu.scpremote.input.InputGate
import th.sichomphu.scpremote.input.KeyboardBridge
import th.sichomphu.scpremote.input.PointerOut
import th.sichomphu.scpremote.input.RemotePoint
import th.sichomphu.scpremote.input.TouchAction
import th.sichomphu.scpremote.input.TouchSample
import th.sichomphu.scpremote.input.TouchpadController
import th.sichomphu.scpremote.protocol.KvmMessages
import th.sichomphu.scpremote.protocol.MouseAction
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
    @Volatile private var session: RelaySession? = null
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
        setUpModeToggle()
        setUpKeyboard()
        setUpPicture()
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
        // Assigned before start(): start() reports CONNECTING at once, and a fast failure reports
        // CLOSED from another thread; onState only shows states from the current session.
        val s = RelaySession(channel, trust, device, this, AppSession.server, Quality.LADDER[prefs.quality])
        session = s
        s.start()
    }

    private val prefs by lazy { Prefs(this) }
    private var displays: List<Int> = emptyList()
    private var selectedDisplay = 0

    private fun setUpPicture() {
        val q = findViewById<Button>(R.id.quality)
        fun label() { q.text = getString(R.string.quality_button, QualityPicker.names(this)[prefs.quality]) }
        label()
        q.setOnClickListener {
            QualityPicker.pickQuality(this, prefs.quality) { i ->
                prefs.quality = i; label()
                session?.setQuality(Quality.LADDER[i])
            }
        }
        findViewById<Button>(R.id.display).setOnClickListener {
            QualityPicker.pickDisplay(this, displays, selectedDisplay) { n ->
                selectedDisplay = n; showDisplays()
                session?.selectDisplay(n)
            }
        }
    }

    /** The display button appears only for a computer with more than one display. */
    private fun showDisplays() {
        val b = findViewById<Button>(R.id.display)
        b.visibility = if (displays.size > 1) View.VISIBLE else View.GONE
        b.text = getString(R.string.display_button, QualityPicker.displayName(this, selectedDisplay))
    }

    /** Back or Disconnect: end on purpose (no reconnect) and return to the computer list. */
    private fun leave() {
        leaving = true
        ui.removeCallbacksAndMessages(null)
        keys?.releaseAll()
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
            is KvmCommand.Displays -> ui.post { displays = cmd.list; selectedDisplay = cmd.selected; showDisplays() }
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

    /**
     * Touch: in touchpad mode one finger drives the cursor and two fingers scroll; in direct mode a
     * tap clicks where touched. In both, spreading or pinching two fingers zooms (and then pans).
     */
    @SuppressLint("ClickableViewAccessibility")
    private fun setUpGestures() {
        var spanStart = 0f
        var pinching = false
        var lastFx = 0f; var lastFy = 0f
        val scale = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(d: ScaleGestureDetector): Boolean { spanStart = d.currentSpan; return true }
            override fun onScale(d: ScaleGestureDetector): Boolean {
                if (!pinching && spanStart > 0 && kotlin.math.abs(d.currentSpan - spanStart) > PINCH_SLOP_PX * resources.displayMetrics.density) {
                    pinching = true
                    output(if (touchpadMode) touchpad?.cancel().orEmpty() else direct.cancel())
                }
                if (pinching) canvas.zoomBy(d.scaleFactor, d.focusX, d.focusY)
                return true
            }
        })
        canvas.setOnTouchListener { _, e ->
            scale.onTouchEvent(e)
            if (e.actionMasked == MotionEvent.ACTION_DOWN) pinching = false
            val sample = TouchSample.of(e) ?: run {
                if (e.actionMasked == MotionEvent.ACTION_CANCEL) output(if (touchpadMode) touchpad?.cancel().orEmpty() else direct.cancel())
                return@setOnTouchListener true
            }
            if (e.pointerCount >= 2 && (pinching || !touchpadMode)) {
                // Zooming (any mode) or two fingers in direct mode: move the picture.
                if (sample.action == TouchAction.MOVE) canvas.panBy(sample.x - lastFx, sample.y - lastFy)
                lastFx = sample.x; lastFy = sample.y
                if (!touchpadMode) output(direct.onTouch(sample))
                return@setOnTouchListener true
            }
            lastFx = sample.x; lastFy = sample.y
            output(if (touchpadMode) touchpad?.onTouch(sample).orEmpty() else direct.onTouch(sample))
            true
        }
        canvas.afterDraw = { c -> if (touchpadMode) touchpad?.let { drawCursor(c, it.cursorX, it.cursorY) } }
        canvas.onScreenSize = { w, h -> touchpad = TouchpadController(w, h); canvas.invalidate() }
    }

    private var touchpadMode = true
    private var touchpad: TouchpadController? = null
    private val direct by lazy { DirectTouchController { x, y -> canvas.viewToRemote(x, y).let { RemotePoint(it.x, it.y) } } }

    private fun setUpModeToggle() {
        val b = findViewById<Button>(R.id.mode)
        fun label() { b.text = getString(if (touchpadMode) R.string.mode_touchpad else R.string.mode_direct) }
        label()
        touchpadMode = prefs.touchpadMode
        label()
        b.setOnClickListener {
            output(if (touchpadMode) touchpad?.cancel().orEmpty() else direct.cancel())
            touchpadMode = !touchpadMode
            prefs.touchpadMode = touchpadMode
            label(); canvas.invalidate()
        }
        b.visibility = if (device.canControl) View.VISIBLE else View.GONE
        findViewById<View>(R.id.viewOnly).visibility = if (device.canControl) View.GONE else View.VISIBLE
        if (!device.canControl) touchpadMode = false
    }

    /** Every input message goes through here; a view-only account's input never leaves the phone. */
    private val gate by lazy { InputGate(device.canControl) { session?.send(it) } }
    private var keys: KeyboardBridge? = null

    private fun setUpKeyboard() {
        val root = findViewById<View>(R.id.root)
        // Edge-to-edge: make room for the phone keyboard ourselves, so the picture and key bar sit above it.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            v.setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
            insets
        }
        if (!device.canControl) return
        val k = KeyboardBridge(gate::send)
        keys = k
        canvas.keyboard = k
        val host = findViewById<android.widget.FrameLayout>(R.id.keybarHost)
        host.addView(KeyBar(this, host, k, canvas).view)
    }

    /** Mouse output → desktop-channel messages; nothing leaves a view-only session. */
    private fun output(events: List<PointerOut>) {
        if (events.isEmpty()) return
        var moved = false
        for (ev in events) {
            val bytes = when (ev) {
                is PointerOut.Move -> { moved = true; KvmMessages.mouse(MouseAction.MOVE, 0, ev.x, ev.y) }
                is PointerOut.Down -> KvmMessages.mouse(MouseAction.DOWN, ev.button, ev.x, ev.y)
                is PointerOut.Up -> KvmMessages.mouse(MouseAction.UP, ev.button, ev.x, ev.y)
                is PointerOut.Scroll -> KvmMessages.scroll(ev.x, ev.y, ev.delta)
            }
            gate.send(bytes)
        }
        if (moved && touchpadMode) touchpad?.let { canvas.keepVisible(it.cursorX, it.cursorY); canvas.invalidate() }
    }

    private val cursorPath = android.graphics.Path()
    private val cursorFill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE }
    private val cursorEdge = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.BLACK; style = android.graphics.Paint.Style.STROKE; strokeWidth = 2f
    }

    /** An arrow at the touchpad cursor (the remote picture does not include the mouse pointer). */
    private fun drawCursor(c: android.graphics.Canvas, rx: Int, ry: Int) {
        val (x, y) = canvas.remoteToView(rx, ry)
        val u = resources.displayMetrics.density * 1.1f
        cursorPath.reset()
        cursorPath.moveTo(x, y)
        cursorPath.lineTo(x, y + 17 * u); cursorPath.lineTo(x + 4.5f * u, y + 13 * u)
        cursorPath.lineTo(x + 7.5f * u, y + 19.5f * u); cursorPath.lineTo(x + 10 * u, y + 18.5f * u)
        cursorPath.lineTo(x + 7 * u, y + 12 * u); cursorPath.lineTo(x + 12.5f * u, y + 12 * u)
        cursorPath.close()
        c.drawPath(cursorPath, cursorFill); c.drawPath(cursorPath, cursorEdge)
    }

    companion object {
        const val EXTRA_DEVICE_ID = "deviceId"
        /** How far two fingers must spread or pinch (dp) before it counts as zooming, not scrolling. */
        private const val PINCH_SLOP_PX = 24f
    }
}
