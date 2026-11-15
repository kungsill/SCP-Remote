package th.sichomphu.scpremote.ui

import android.annotation.SuppressLint
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.data.Prefs
import th.sichomphu.scpremote.data.Quality
import th.sichomphu.scpremote.input.DirectTouchController
import th.sichomphu.scpremote.input.InputGate
import th.sichomphu.scpremote.input.KeyboardBridge
import th.sichomphu.scpremote.input.PointerOut
import th.sichomphu.scpremote.input.RemotePoint
import th.sichomphu.scpremote.input.SpecialKey
import th.sichomphu.scpremote.input.TouchAction
import th.sichomphu.scpremote.input.TouchSample
import th.sichomphu.scpremote.input.TouchpadController
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.net.RelaySession
import th.sichomphu.scpremote.net.RelaySession.State
import th.sichomphu.scpremote.net.SessionPolicy
import th.sichomphu.scpremote.net.Signal
import th.sichomphu.scpremote.protocol.KvmCommand
import th.sichomphu.scpremote.protocol.KvmMessages
import th.sichomphu.scpremote.protocol.MouseAction

/**
 * Full-screen remote session. Rotation does not restart it (configChanges in the manifest); it is
 * closed on Back / Disconnect and when the app stays hidden for 30 s, and reopened by itself after a
 * drop (2, 5, 10 s), as the web page does. Everything else sits behind one floating button.
 */
class RemoteActivity : AppCompatActivity(), RelaySession.Listener {
    private lateinit var device: Device
    private lateinit var canvas: RemoteCanvas
    private lateinit var overlay: View
    private lateinit var stateText: TextView
    private lateinit var spinner: ProgressBar
    private lateinit var retry: Button
    private lateinit var fab: View
    private lateinit var signalDot: View
    private val ui = Handler(Looper.getMainLooper())
    private val prefs by lazy { Prefs(this) }
    @Volatile private var session: RelaySession? = null
    private var attempts = 0
    private var hiddenClosed = false
    private var leaving = false
    private val closeHidden = Runnable { hiddenClosed = true; session?.close(userInitiated = true) }
    private var displays: List<Int> = emptyList()
    private var selectedDisplay = 0
    /** Last keep-alive round trip (ms), null until the first one. */
    private var latency: Long? = null
    private var slowHintShown = false

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
        fab = findViewById(R.id.fab); signalDot = findViewById(R.id.signalDot)
        retry.setOnClickListener { attempts = 0; connect() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = leave()
        })
        touchpadMode = device.canControl && prefs.touchpadMode
        setUpGestures()
        setUpKeyboard()
        setUpFab()
        showSignal()
        if (!device.canControl) Toast.makeText(this, R.string.st_view_only, Toast.LENGTH_LONG).show()
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
        latency = null; showSignal()
        // Assigned before start(): start() reports CONNECTING at once, and a fast failure reports
        // CLOSED from another thread; onState only shows states from the current session.
        val q = Quality.LADDER[prefs.quality]
        val s = AppSession.relayOpener?.let { RelaySession(channel, trust, device, this, AppSession.server, q, it) }
            ?: RelaySession(channel, trust, device, this, AppSession.server, q)
        session = s
        s.start()
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
            is KvmCommand.Displays -> ui.post { displays = cmd.list; selectedDisplay = cmd.selected }
            is KvmCommand.Tile -> {
                canvas.drawTile(cmd.x, cmd.y, cmd.image)
                ui.post {
                    if (overlay.visibility == View.VISIBLE && session?.state == State.CONNECTED) {
                        attempts = 0; overlay.visibility = View.GONE
                        firstPicture()
                    }
                }
            }
            else -> {}
        }
    }

    override fun onLatency(ms: Long) {
        ui.post { latency = ms; showSignal() }
    }

    private fun showState(state: State, s: RelaySession?) {
        when (state) {
            State.CONNECTING -> status(getString(R.string.st_connecting), busy = true)
            State.WAITING_CONSENT -> status(getString(R.string.st_consent), busy = true)
            State.CONNECTED -> if (s?.hadImage == true) overlay.visibility = View.GONE else status(getString(R.string.st_image), busy = true)
            State.REFUSED -> status(getString(R.string.st_refused), busy = false)
            State.CLOSED -> {
                if (leaving || hiddenClosed) return
                latency = null; showSignal()
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

    /** The first picture of this screen: show the gesture guide once per mouse mode. */
    private fun firstPicture() {
        if (!prefs.guideSeen(touchpadMode)) showGuide()
    }

    // --- Floating button and its menu ------------------------------------------------------------

    /** Drag to move it out of the way; tap to open the menu. */
    @SuppressLint("ClickableViewAccessibility")
    private fun setUpFab() {
        val button = findViewById<View>(R.id.fabButton)
        val slop = 10 * resources.displayMetrics.density
        var downX = 0f; var downY = 0f; var startX = 0f; var startY = 0f; var dragging = false
        button.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = fab.translationX; startY = fab.translationY; dragging = false }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (!dragging && (kotlin.math.abs(dx) > slop || kotlin.math.abs(dy) > slop)) dragging = true
                    if (dragging) {
                        val parent = fab.parent as View
                        // Keep the whole button on screen.
                        fab.translationX = (startX + dx).coerceIn(-(fab.left).toFloat(), (parent.width - fab.right).toFloat())
                        fab.translationY = (startY + dy).coerceIn(-(fab.top).toFloat(), (parent.height - fab.bottom).toFloat())
                    }
                }
                MotionEvent.ACTION_UP -> if (!dragging) { button.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY); openMenu() }
            }
            true
        }
    }

    private fun signalColor() = when (Signal.level(latency)) {
        Signal.Level.GOOD -> R.color.signal_good
        Signal.Level.FAIR -> R.color.signal_fair
        Signal.Level.POOR -> R.color.signal_poor
        Signal.Level.UNKNOWN -> R.color.signal_unknown
    }

    private fun showSignal() {
        val level = Signal.level(latency)
        signalDot.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, signalColor()))
        // A slow connection: suggest Low bandwidth once, unless it is already chosen.
        if (level == Signal.Level.POOR && !slowHintShown && prefs.quality < Quality.LADDER.size - 1) {
            slowHintShown = true
            Toast.makeText(this, R.string.signal_slow_hint, Toast.LENGTH_LONG).show()
        }
    }

    private fun signalText(): String {
        val ms = latency ?: return getString(R.string.signal_unknown)
        return getString(
            when (Signal.level(ms)) {
                Signal.Level.GOOD -> R.string.signal_good
                Signal.Level.FAIR -> R.string.signal_fair
                else -> R.string.signal_poor
            }, ms,
        )
    }

    /** Signal pill: soft colour by level, e.g. "ดี · 47 ms". */
    private fun paintSignal(pill: TextView) {
        val ms = latency
        val (fg, bg) = when (Signal.level(ms)) {
            Signal.Level.GOOD -> R.color.tint_green to R.color.tint_green_bg
            Signal.Level.FAIR -> R.color.fix_busy_fg to R.color.tint_amber_bg
            Signal.Level.POOR -> R.color.tint_red to R.color.tint_red_bg
            Signal.Level.UNKNOWN -> R.color.tint_gray to R.color.tint_gray_bg
        }
        pill.text = if (ms == null) getString(R.string.sig_unknown) else getString(
            when (Signal.level(ms)) { Signal.Level.GOOD -> R.string.sig_good; Signal.Level.FAIR -> R.string.sig_fair; else -> R.string.sig_poor }, ms,
        )
        pill.contentDescription = signalText()
        val c = ContextCompat.getColor(this, fg)
        pill.setTextColor(c)
        pill.compoundDrawableTintList = ColorStateList.valueOf(c)
        pill.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, bg))
    }

    /** Bottom sheet with big coloured buttons for everything that is not the picture itself. */
    private fun openMenu() {
        val v = layoutInflater.inflate(R.layout.sheet_remote_menu, null)
        Sheets.tint(v.findViewById(R.id.menuTile), R.drawable.ic_monitor, Look.tileTint(device.groupId, true))
        v.findViewById<TextView>(R.id.menuName).text = device.name
        v.findViewById<TextView>(R.id.menuWhere).text = listOf(device.ip, device.groupName).filter { it.isNotBlank() }.joinToString(" · ")
        paintSignal(v.findViewById(R.id.menuSignal))
        v.findViewById<View>(R.id.menuViewOnly).visibility = if (device.canControl) View.GONE else View.VISIBLE
        val grid = v.findViewById<GridLayout>(R.id.menuGrid)
        val dialog = Sheets.open(this, v)
        fun item(icon: Int, tint: Look.Tint, label: String, action: () -> Unit) {
            val cell = layoutInflater.inflate(R.layout.item_menu_cell, grid, false)
            Sheets.tint(cell.findViewById(R.id.cellIcon), icon, tint)
            cell.findViewById<TextView>(R.id.cellLabel).text = label
            cell.contentDescription = label
            cell.setOnClickListener { cell.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY); dialog.dismiss(); action() }
            // Four equal columns; FILL rows so one- and two-line labels line up.
            grid.addView(cell, GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED, GridLayout.FILL), GridLayout.spec(GridLayout.UNDEFINED, GridLayout.FILL, 1f)).apply { width = 0 })
        }
        if (device.canControl) {
            item(R.drawable.ic_keyboard, Look.Tint.PINK, getString(R.string.keyboard_short)) { keyBar?.showKeyboard() }
            item(if (touchpadMode) R.drawable.ic_mouse else R.drawable.ic_touch, Look.Tint.CYAN, getString(if (touchpadMode) R.string.mode_touchpad else R.string.mode_direct)) { switchMode() }
        }
        item(R.drawable.ic_image, Look.Tint.VIOLET, QualityPicker.names(this)[prefs.quality]) {
            QualityPicker.pickQuality(this, prefs.quality) { i -> prefs.quality = i; session?.setQuality(Quality.LADDER[i]) }
        }
        if (displays.size > 1) item(R.drawable.ic_monitor, Look.Tint.BLUE, QualityPicker.displayName(this, selectedDisplay)) {
            QualityPicker.pickDisplay(this, displays, selectedDisplay) { n -> selectedDisplay = n; session?.selectDisplay(n) }
        }
        if (device.canFiles) item(R.drawable.ic_folder, Look.Tint.AMBER, getString(R.string.files)) {
            startActivity(android.content.Intent(this, FilesActivity::class.java).putExtra(FilesActivity.EXTRA_DEVICE_ID, device.id))
        }
        if (device.canClipboard) {
            item(R.drawable.ic_paste, Look.Tint.GREEN, getString(R.string.paste_short)) { pasteToComputer() }
            item(R.drawable.ic_copy, Look.Tint.GREEN, getString(R.string.copy_short)) { copyFromComputer() }
        }
        if (device.canControl) item(R.drawable.ic_key, Look.Tint.GRAY, "Ctrl+Alt+Del") { keys?.special(SpecialKey.CTRL_ALT_DEL) }
        if (device.canPower) item(R.drawable.ic_restart, Look.Tint.RED, getString(R.string.restart_short)) {
            DeviceActions.confirmPower(this, device, th.sichomphu.scpremote.protocol.ControlMessages.RESTART)
        }
        item(R.drawable.ic_help, Look.Tint.BLUE, getString(R.string.help)) { showGuide() }
        v.findViewById<View>(R.id.menuDisconnect).setOnClickListener { dialog.dismiss(); leave() }
        dialog.show()
    }

    /**
     * The phone's copied text goes to the computer's clipboard and is pasted where the cursor is
     * (Ctrl+V), like copy/paste between two computers.
     */
    private fun pasteToComputer() {
        val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val text = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        if (text.isNullOrEmpty()) { Toast.makeText(this, R.string.phone_clipboard_empty, Toast.LENGTH_SHORT).show(); return }
        try { AppSession.channel?.setClipboard(device.id, text) } catch (e: Exception) { Toast.makeText(this, errorText(e), Toast.LENGTH_SHORT).show(); return }
        // Give the agent a moment to set the clipboard before the paste keys arrive.
        ui.postDelayed({
            gate.send(KvmMessages.key(true, 0x11)); gate.send(KvmMessages.key(true, 0x56))
            gate.send(KvmMessages.key(false, 0x56)); gate.send(KvmMessages.key(false, 0x11))
        }, 300)
        Toast.makeText(this, getString(R.string.pasted_to_pc, text.take(40)), Toast.LENGTH_SHORT).show()
    }

    /** The computer's clipboard text onto the phone's clipboard (copy it on the computer first). */
    private fun copyFromComputer() {
        val channel = AppSession.channel ?: return
        lifecycleScope.launch {
            val text = try { channel.getClipboard(device.id) } catch (e: Exception) { null }
            if (text.isNullOrEmpty()) { Toast.makeText(this@RemoteActivity, R.string.pc_clipboard_empty, Toast.LENGTH_LONG).show(); return@launch }
            val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("SCP-Remote", text))
            Toast.makeText(this@RemoteActivity, getString(R.string.copied_from_pc, text.take(40)), Toast.LENGTH_SHORT).show()
        }
    }

    private fun switchMode() {
        output(if (touchpadMode) touchpad?.cancel().orEmpty() else direct.cancel())
        touchpadMode = !touchpadMode
        prefs.touchpadMode = touchpadMode
        canvas.invalidate()
        Toast.makeText(this, if (touchpadMode) R.string.mode_touchpad_on else R.string.mode_direct_on, Toast.LENGTH_SHORT).show()
        if (!prefs.guideSeen(touchpadMode)) showGuide()
    }

    /** How to use the screen, for the current mouse mode. */
    private fun showGuide() {
        val lines = when {
            !device.canControl -> R.string.guide_view_only
            touchpadMode -> R.string.guide_touchpad
            else -> R.string.guide_direct
        }
        if (device.canControl) prefs.setGuideSeen(touchpadMode)
        MaterialAlertDialogBuilder(this)
            .setTitle(if (touchpadMode) R.string.guide_title_touchpad else R.string.guide_title_direct)
            .setMessage(lines)
            .setPositiveButton(R.string.got_it, null)
            .show()
    }

    // --- Touch -----------------------------------------------------------------------------------

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

    /** Every input message goes through here; a view-only account's input never leaves the phone. */
    private val gate by lazy { InputGate(device.canControl) { session?.send(it) } }
    private var keys: KeyboardBridge? = null
    private var keyBar: KeyBar? = null

    private fun setUpKeyboard() {
        val root = findViewById<View>(R.id.root)
        val host = findViewById<android.widget.FrameLayout>(R.id.keybarHost)
        host.visibility = View.GONE
        // Edge-to-edge: make room for the phone keyboard ourselves, so the picture and key bar sit
        // above it. The key bar shows only while the phone keyboard is open (like AnyDesk).
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            // Above the keyboard, and above the gesture bar Android shows while the keyboard is up.
            v.setPadding(0, 0, 0, maxOf(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom, insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom))
            val open = insets.isVisible(WindowInsetsCompat.Type.ime())
            if (keyBar != null && open != (host.visibility == View.VISIBLE)) {
                host.visibility = if (open) View.VISIBLE else View.GONE
                if (!open) keyBar?.hidden()
            }
            insets
        }
        if (!device.canControl) return
        val k = KeyboardBridge(gate::send)
        keys = k
        canvas.keyboard = k
        keyBar = KeyBar(this, host, k, canvas).also { host.addView(it.view) }
    }

    /** Mouse output → desktop-channel messages; a click is felt as a light tap. */
    private fun output(events: List<PointerOut>) {
        if (events.isEmpty()) return
        var moved = false
        for (ev in events) {
            val bytes = when (ev) {
                is PointerOut.Move -> { moved = true; KvmMessages.mouse(MouseAction.MOVE, 0, ev.x, ev.y) }
                is PointerOut.Down -> {
                    if (device.canControl) canvas.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                    // A click puts the computer's cursor somewhere else: the keyboard's view starts over.
                    canvas.keyboardContextMoved()
                    KvmMessages.mouse(MouseAction.DOWN, ev.button, ev.x, ev.y)
                }
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
        // About 11 dp tall: small, so it does not hide what it points at (asked smaller twice).
        val u = resources.displayMetrics.density * 0.55f
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
