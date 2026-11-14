package th.sichomphu.scpremote.input

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import th.sichomphu.scpremote.input.PointerOut.Down
import th.sichomphu.scpremote.input.PointerOut.Move
import th.sichomphu.scpremote.input.PointerOut.Up
import th.sichomphu.scpremote.input.TouchAction.DOWN
import th.sichomphu.scpremote.input.TouchAction.MOVE
import th.sichomphu.scpremote.input.TouchAction.POINTER_DOWN
import th.sichomphu.scpremote.input.TouchAction.UP
import th.sichomphu.scpremote.protocol.KvmMessages.LEFT
import th.sichomphu.scpremote.protocol.KvmMessages.RIGHT

class DirectTouchControllerTest {
    // android.graphics.Point is a stub in unit tests, so the mapping returns RemotePoint.
    private val c = DirectTouchController { x, y -> RemotePoint((x * 4).toInt(), (y * 4).toInt()) }
    private fun s(a: TouchAction, x: Float, y: Float, t: Long, p: Int = 1) = TouchSample(a, p, x, y, t)

    @Test fun tapClicksWhereTouched() {
        assertTrue(c.onTouch(s(DOWN, 100f, 50f, 0)).isEmpty())
        assertEquals(listOf(Move(400, 200), Down(LEFT, 400, 200), Up(LEFT, 400, 200)), c.onTouch(s(UP, 101f, 50f, 100)))
    }

    @Test fun longPressClicksRight() {
        c.onTouch(s(DOWN, 10f, 10f, 0))
        assertEquals(listOf(Move(40, 40), Down(RIGHT, 40, 40), Up(RIGHT, 40, 40)), c.onTouch(s(UP, 10f, 10f, 600)))
    }

    @Test fun dragHoldsLeftFromWhereItStarted() {
        c.onTouch(s(DOWN, 10f, 10f, 0))
        assertEquals(listOf(Move(40, 40), Down(LEFT, 40, 40), Move(120, 40)), c.onTouch(s(MOVE, 30f, 10f, 50)))
        assertEquals(listOf(Up(LEFT, 120, 40)), c.onTouch(s(UP, 30f, 10f, 90)))
    }

    @Test fun cancelEndsADragAndTheNextUpClicksNothing() {
        c.onTouch(s(DOWN, 10f, 10f, 0)); c.onTouch(s(MOVE, 30f, 10f, 50))
        assertEquals(listOf(Up(LEFT, 120, 40)), c.cancel())
        assertTrue(c.onTouch(s(UP, 30f, 10f, 90)).isEmpty())
    }

    @Test fun twoFingersAreLeftToTheZoom() {
        c.onTouch(s(DOWN, 10f, 10f, 0))
        assertTrue(c.onTouch(s(POINTER_DOWN, 50f, 10f, 20, p = 2)).isEmpty())
        assertTrue(c.onTouch(s(MOVE, 70f, 30f, 40, p = 2)).isEmpty())
        assertTrue(c.onTouch(s(UP, 70f, 30f, 60)).isEmpty())
    }
}
