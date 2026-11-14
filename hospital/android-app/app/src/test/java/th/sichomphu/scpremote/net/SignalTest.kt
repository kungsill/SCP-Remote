package th.sichomphu.scpremote.net

import org.junit.Assert.assertEquals
import org.junit.Test
import th.sichomphu.scpremote.net.Signal.Level

// Same thresholds the web page uses to lower the picture quality (scp-session.js quality(): 180 / 350 ms).
class SignalTest {
    @Test fun levels() {
        assertEquals(Level.UNKNOWN, Signal.level(null))
        assertEquals(Level.GOOD, Signal.level(40))
        assertEquals(Level.GOOD, Signal.level(179))
        assertEquals(Level.FAIR, Signal.level(180))
        assertEquals(Level.FAIR, Signal.level(349))
        assertEquals(Level.POOR, Signal.level(350))
    }
}
