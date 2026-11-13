package th.sichomphu.scpremote.input

import th.sichomphu.scpremote.protocol.KvmMessages
import kotlin.math.hypot

/**
 * Touch where you want to click: tap = left click there, hold 500 ms = right click, drag = hold the
 * left button from where the finger started. Two-finger gestures belong to the picture's zoom.
 */
class DirectTouchController(private val map: (Float, Float) -> RemotePoint) {
    private var downTime = 0L
    private var downX = 0f
    private var downY = 0f
    private var multi = false
    private var dragging = false
    private var last = RemotePoint(0, 0)

    /** The rest of this touch is not mouse input: release a held button and click nothing. */
    fun cancel(): List<PointerOut> {
        multi = true
        if (!dragging) return emptyList()
        dragging = false
        return listOf(PointerOut.Up(KvmMessages.LEFT, last.x, last.y))
    }

    fun onTouch(e: TouchSample): List<PointerOut> {
        val out = mutableListOf<PointerOut>()
        when (e.action) {
            TouchAction.DOWN -> { downTime = e.timeMs; downX = e.x; downY = e.y; multi = false; dragging = false }
            TouchAction.POINTER_DOWN -> {
                multi = true
                if (dragging) { dragging = false; out.add(PointerOut.Up(KvmMessages.LEFT, last.x, last.y)) }
            }
            TouchAction.POINTER_UP -> {}
            TouchAction.MOVE -> {
                if (multi || e.pointers > 1) return out
                if (!dragging && hypot(e.x - downX, e.y - downY) > SLOP) {
                    dragging = true
                    val start = map(downX, downY)
                    out.add(PointerOut.Move(start.x, start.y))
                    out.add(PointerOut.Down(KvmMessages.LEFT, start.x, start.y))
                }
                if (dragging) {
                    val p = map(e.x, e.y)
                    if (p != last || out.isNotEmpty()) { last = p; out.add(PointerOut.Move(p.x, p.y)) }
                }
            }
            TouchAction.UP -> {
                if (multi) return out
                if (dragging) {
                    dragging = false
                    out.add(PointerOut.Up(KvmMessages.LEFT, last.x, last.y))
                } else {
                    val p = map(downX, downY)
                    val button = if (e.timeMs - downTime >= LONG_PRESS_MS) KvmMessages.RIGHT else KvmMessages.LEFT
                    out.add(PointerOut.Move(p.x, p.y))
                    out.add(PointerOut.Down(button, p.x, p.y))
                    out.add(PointerOut.Up(button, p.x, p.y))
                }
            }
        }
        return out
    }

    private companion object {
        const val SLOP = 10f
        const val LONG_PRESS_MS = 500L
    }
}
