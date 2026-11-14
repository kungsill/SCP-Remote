package th.sichomphu.scpremote.net

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Same rules as reconnectIn in public/scripts/scp-session.js (hospital/tests/reconnect.test.js).
class SessionPolicyTest {
    private fun dropped(hadImage: Boolean = true, userClosed: Boolean = false, refused: Boolean = false, onScreen: Boolean = true, attempts: Int = 0) =
        SessionPolicy.reconnectDelay(hadImage, userClosed, refused, onScreen, attempts)

    @Test fun droppedSessionIsReopenedALittleLaterEachTime() {
        assertEquals(2000L, dropped())
        assertEquals(5000L, dropped(attempts = 1))
        assertEquals(10000L, dropped(attempts = 2))
        assertNull("three tries, then it is left to the technician", dropped(attempts = 3))
    }

    @Test fun neverReopenedWhenEndedRefusedOrLeft() {
        assertNull("the technician pressed Disconnect", dropped(userClosed = true))
        assertNull("the person there said no", dropped(refused = true))
        assertNull("the technician has left the remote screen", dropped(onScreen = false))
        assertNull("it never connected: a failure, not a drop", dropped(hadImage = false))
        assertNull(dropped(attempts = -1))
    }

    @Test fun timings() {
        assertEquals(10_000L, SessionPolicy.KEEPALIVE_MS)
        assertEquals(30_000L, SessionPolicy.BACKGROUND_CLOSE_MS)
    }
}
