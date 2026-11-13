package th.sichomphu.scpremote.input

import android.view.MotionEvent

enum class TouchAction { DOWN, MOVE, UP, POINTER_DOWN, POINTER_UP }

/** One touch event: [x], [y] is the finger (or the middle of the fingers when there are several). */
data class TouchSample(val action: TouchAction, val pointers: Int, val x: Float, val y: Float, val timeMs: Long) {
    companion object {
        /** From an Android event; null for events the controllers ignore (e.g. CANCEL). */
        fun of(e: MotionEvent): TouchSample? {
            val action = when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> TouchAction.DOWN
                MotionEvent.ACTION_MOVE -> TouchAction.MOVE
                MotionEvent.ACTION_UP -> TouchAction.UP
                MotionEvent.ACTION_POINTER_DOWN -> TouchAction.POINTER_DOWN
                MotionEvent.ACTION_POINTER_UP -> TouchAction.POINTER_UP
                else -> return null
            }
            var x = 0f; var y = 0f; var n = 0
            for (i in 0 until e.pointerCount) {
                // On POINTER_UP the lifted finger is still listed; leave it out of the middle point.
                if (e.actionMasked == MotionEvent.ACTION_POINTER_UP && i == e.actionIndex) continue
                x += e.getX(i); y += e.getY(i); n++
            }
            if (n == 0) { x = e.x; y = e.y; n = 1 }
            return TouchSample(action, e.pointerCount, x / n, y / n, e.eventTime)
        }
    }
}

/** A remote screen pixel. */
data class RemotePoint(val x: Int, val y: Int)

/** Mouse output in remote screen pixels; buttons are KvmMessages.LEFT/RIGHT/MIDDLE. */
sealed class PointerOut {
    data class Move(val x: Int, val y: Int) : PointerOut()
    data class Down(val button: Int, val x: Int, val y: Int) : PointerOut()
    data class Up(val button: Int, val x: Int, val y: Int) : PointerOut()
    data class Scroll(val x: Int, val y: Int, val delta: Int) : PointerOut()
}
