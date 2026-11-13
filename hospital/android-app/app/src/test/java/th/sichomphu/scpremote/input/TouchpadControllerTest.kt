package th.sichomphu.scpremote.input

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import th.sichomphu.scpremote.input.PointerOut.Down
import th.sichomphu.scpremote.input.PointerOut.Move
import th.sichomphu.scpremote.input.PointerOut.Scroll
import th.sichomphu.scpremote.input.PointerOut.Up
import th.sichomphu.scpremote.input.TouchAction.DOWN
import th.sichomphu.scpremote.input.TouchAction.MOVE
import th.sichomphu.scpremote.input.TouchAction.POINTER_DOWN
import th.sichomphu.scpremote.input.TouchAction.POINTER_UP
import th.sichomphu.scpremote.input.TouchAction.UP
import th.sichomphu.scpremote.protocol.KvmMessages.LEFT
import th.sichomphu.scpremote.protocol.KvmMessages.RIGHT

class TouchpadControllerTest {
    private fun s(a: TouchAction, x: Float, y: Float, t: Long, p: Int = 1) = TouchSample(a, p, x, y, t)

    @Test fun cursorStartsInTheMiddleAndMovesBySpeed() {
        val c = TouchpadController(1000, 800, speed = 2f)
        c.onTouch(s(DOWN, 100f, 100f, 0))
        assertEquals(listOf(Move(520, 400)), c.onTouch(s(MOVE, 110f, 100f, 16)))
    }

    @Test fun moveClampsAtTheScreenEdges() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 500f, 500f, 0))
        assertEquals(listOf(Move(0, 0)), c.onTouch(s(MOVE, -5000f, -5000f, 16)))
        assertEquals(listOf(Move(999, 799)), c.onTouch(s(MOVE, 9000f, 9000f, 32)))
    }

    @Test fun tapClicksLeftAtTheCursor() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 10f, 10f, 0))
        assertEquals(listOf(Down(LEFT, 500, 400), Up(LEFT, 500, 400)), c.onTouch(s(UP, 12f, 11f, 120)))
    }

    @Test fun slowOrMovingTouchIsNotATap() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 10f, 10f, 0))
        assertTrue(c.onTouch(s(UP, 10f, 10f, 400)).isEmpty())
        c.onTouch(s(DOWN, 10f, 10f, 1000))
        c.onTouch(s(MOVE, 40f, 10f, 1050))
        assertTrue(c.onTouch(s(UP, 40f, 10f, 1100)).isEmpty())
    }

    @Test fun twoFingerTapClicksRight() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 10f, 10f, 0))
        c.onTouch(s(POINTER_DOWN, 30f, 10f, 20, p = 2))
        c.onTouch(s(POINTER_UP, 30f, 10f, 150, p = 2))
        assertEquals(listOf(Down(RIGHT, 500, 400), Up(RIGHT, 500, 400)), c.onTouch(s(UP, 10f, 10f, 160)))
    }

    @Test fun twoFingerScrollDown30pxScrollsOneNotch() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 10f, 10f, 0))
        c.onTouch(s(POINTER_DOWN, 30f, 10f, 10, p = 2))
        assertEquals(listOf(Scroll(500, 400, -120)), c.onTouch(s(MOVE, 30f, 40f, 50, p = 2)))
        assertTrue("no click after scrolling", c.onTouch(s(POINTER_UP, 30f, 40f, 60, p = 2)).isEmpty() && c.onTouch(s(UP, 10f, 40f, 70)).isEmpty())
    }

    @Test fun smallScrollsAccumulateToANotch() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 10f, 100f, 0))
        c.onTouch(s(POINTER_DOWN, 30f, 100f, 10, p = 2))
        assertTrue(c.onTouch(s(MOVE, 30f, 90f, 20, p = 2)).isEmpty())
        assertTrue(c.onTouch(s(MOVE, 30f, 80f, 30, p = 2)).isEmpty())
        assertEquals(listOf(Scroll(500, 400, 120)), c.onTouch(s(MOVE, 30f, 70f, 40, p = 2)))
    }

    @Test fun tapThenHoldAndMoveDrags() {
        val c = TouchpadController(1000, 800, speed = 1f)
        c.onTouch(s(DOWN, 10f, 10f, 0)); c.onTouch(s(UP, 10f, 10f, 100)) // the tap (a click)
        assertTrue(c.onTouch(s(DOWN, 10f, 10f, 250)).isEmpty())
        assertEquals(listOf(Down(LEFT, 500, 400), Move(520, 400)), c.onTouch(s(MOVE, 30f, 10f, 300)))
        assertEquals(listOf(Move(530, 400)), c.onTouch(s(MOVE, 40f, 10f, 330)))
        assertEquals(listOf(Up(LEFT, 530, 400)), c.onTouch(s(UP, 40f, 10f, 900)))
    }

    // A two-finger touch that became a pinch-zoom must not end as a right click.
    @Test fun cancelledGestureClicksNothing() {
        val c = TouchpadController(1000, 800)
        c.onTouch(s(DOWN, 10f, 10f, 0))
        c.onTouch(s(POINTER_DOWN, 30f, 10f, 20, p = 2))
        c.cancel()
        assertTrue(c.onTouch(s(POINTER_UP, 30f, 10f, 100, p = 2)).isEmpty())
        assertTrue(c.onTouch(s(UP, 10f, 10f, 120)).isEmpty())
    }

    @Test fun cancelDuringDragReleasesTheButton() {
        val c = TouchpadController(1000, 800, speed = 1f)
        c.onTouch(s(DOWN, 10f, 10f, 0)); c.onTouch(s(UP, 10f, 10f, 100))
        c.onTouch(s(DOWN, 10f, 10f, 200)); c.onTouch(s(MOVE, 30f, 10f, 250))
        assertEquals(listOf(Up(LEFT, 520, 400)), c.cancel())
    }

    @Test fun movingAfterTheDoubleTapWindowIsJustAMove() {
        val c = TouchpadController(1000, 800, speed = 1f)
        c.onTouch(s(DOWN, 10f, 10f, 0)); c.onTouch(s(UP, 10f, 10f, 100))
        c.onTouch(s(DOWN, 10f, 10f, 800))
        assertEquals(listOf(Move(520, 400)), c.onTouch(s(MOVE, 30f, 10f, 850)))
    }
}
