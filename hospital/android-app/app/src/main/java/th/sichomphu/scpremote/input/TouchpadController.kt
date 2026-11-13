package th.sichomphu.scpremote.input

import th.sichomphu.scpremote.protocol.KvmMessages
import kotlin.math.abs
import kotlin.math.hypot

/**
 * The phone screen as a laptop touchpad: one finger moves the cursor, tap = left click, two-finger
 * tap = right click, two fingers up/down = wheel, tap then hold and move = drag with the left button.
 */
class TouchpadController(private val screenW: Int, private val screenH: Int, private val speed: Float = 1.6f) {
    var cursorX = screenW / 2; private set
    var cursorY = screenH / 2; private set

    private var downTime = 0L
    private var downX = 0f
    private var downY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var moved = false
    private var maxPointers = 1
    private var twoMoved = false
    private var twoX = 0f
    private var twoY = 0f
    private var scrollAcc = 0f
    private var lastTapUp = -1L
    private var dragArmed = false
    private var dragging = false
    private var rebase = false

    private var cancelled = false

    /** The rest of this touch is not mouse input (it became a pinch-zoom): release, click nothing. */
    fun cancel(): List<PointerOut> {
        cancelled = true
        lastTapUp = -1L; dragArmed = false
        if (!dragging) return emptyList()
        dragging = false
        return listOf(PointerOut.Up(KvmMessages.LEFT, cursorX, cursorY))
    }

    fun onTouch(e: TouchSample): List<PointerOut> {
        val out = mutableListOf<PointerOut>()
        if (cancelled && e.action != TouchAction.DOWN) return out
        when (e.action) {
            TouchAction.DOWN -> {
                cancelled = false
                downTime = e.timeMs; downX = e.x; downY = e.y; lastX = e.x; lastY = e.y
                moved = false; maxPointers = 1; twoMoved = false; scrollAcc = 0f; rebase = false
                dragArmed = lastTapUp >= 0 && e.timeMs - lastTapUp <= DOUBLE_TAP_MS
            }
            TouchAction.POINTER_DOWN -> {
                maxPointers = maxOf(maxPointers, e.pointers)
                lastX = e.x; lastY = e.y; twoX = e.x; twoY = e.y; scrollAcc = 0f
                dragArmed = false
            }
            TouchAction.POINTER_UP -> rebase = true
            TouchAction.MOVE -> {
                if (rebase) { rebase = false; lastX = e.x; lastY = e.y; return out }
                val dx = e.x - lastX; val dy = e.y - lastY
                lastX = e.x; lastY = e.y
                if (e.pointers >= 2) {
                    if (hypot(e.x - twoX, e.y - twoY) > TAP_SLOP) twoMoved = true
                    scrollAcc += -dy * 4f
                    while (abs(scrollAcc) >= NOTCH) {
                        val notch = if (scrollAcc > 0) NOTCH.toInt() else -NOTCH.toInt()
                        out.add(PointerOut.Scroll(cursorX, cursorY, notch))
                        scrollAcc -= notch
                        twoMoved = true
                    }
                } else if (maxPointers == 1) {
                    if (hypot(e.x - downX, e.y - downY) > TAP_SLOP) moved = true
                    if (dragArmed && moved && !dragging) {
                        dragging = true
                        out.add(PointerOut.Down(KvmMessages.LEFT, cursorX, cursorY))
                    }
                    val nx = (cursorX + dx * speed).toInt().coerceIn(0, screenW - 1)
                    val ny = (cursorY + dy * speed).toInt().coerceIn(0, screenH - 1)
                    if (nx != cursorX || ny != cursorY) {
                        cursorX = nx; cursorY = ny
                        out.add(PointerOut.Move(cursorX, cursorY))
                    }
                }
            }
            TouchAction.UP -> {
                val held = e.timeMs - downTime
                when {
                    dragging -> { dragging = false; out.add(PointerOut.Up(KvmMessages.LEFT, cursorX, cursorY)) }
                    maxPointers == 1 && !moved && held < TAP_MS -> {
                        out.add(PointerOut.Down(KvmMessages.LEFT, cursorX, cursorY))
                        out.add(PointerOut.Up(KvmMessages.LEFT, cursorX, cursorY))
                        lastTapUp = e.timeMs
                        return out
                    }
                    maxPointers == 2 && !twoMoved && held < TWO_TAP_MS -> {
                        out.add(PointerOut.Down(KvmMessages.RIGHT, cursorX, cursorY))
                        out.add(PointerOut.Up(KvmMessages.RIGHT, cursorX, cursorY))
                    }
                }
                lastTapUp = -1L
                dragArmed = false
            }
        }
        return out
    }

    private companion object {
        const val TAP_MS = 200L
        const val TWO_TAP_MS = 300L
        const val DOUBLE_TAP_MS = 300L
        const val TAP_SLOP = 10f
        const val NOTCH = 120f
    }
}
