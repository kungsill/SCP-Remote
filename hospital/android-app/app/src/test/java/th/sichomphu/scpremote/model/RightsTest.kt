package th.sichomphu.scpremote.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The server's own checks (meshuser.js: poweraction needs RESETOFF 0x40000, wakedevices WAKEDEVICE 0x40,
// the files tunnel refuses NOFILES 0x400); the app only hides buttons that would be refused.
class RightsTest {
    private val full = 0xFFFFFFFFL

    @Test fun fullRightsAllowEverything() {
        assertTrue(Rights.canPower(full)); assertTrue(Rights.canWake(full)); assertTrue(Rights.canFiles(full, canControl = true))
    }

    @Test fun powerNeedsResetOff() {
        assertTrue(Rights.canPower(0x40000L or 8)); assertFalse(Rights.canPower(8))
    }

    @Test fun wakeNeedsWakeDevice() {
        assertTrue(Rights.canWake(0x40L)); assertFalse(Rights.canWake(8))
    }

    @Test fun filesNeedControlAndNoNoFiles() {
        assertTrue(Rights.canFiles(8, canControl = true))
        assertFalse(Rights.canFiles(8 or 0x400, canControl = true))
        assertFalse(Rights.canFiles(8, canControl = false))
    }
}
