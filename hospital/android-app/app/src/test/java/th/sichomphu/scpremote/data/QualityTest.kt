package th.sichomphu.scpremote.data

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

// Same ladder and starting point as the web page (public/scripts/scp-session.js).
class QualityTest {
    @Test fun ladderMatchesTheWeb() {
        assertEquals(4, Quality.LADDER.size)
        assertArrayEquals(intArrayOf(2, 100, 1024, 50), Quality.LADDER[0])
        assertArrayEquals(intArrayOf(4, 100, 1024, 50), Quality.LADDER[1])
        assertArrayEquals(intArrayOf(4, 70, 1024, 100), Quality.LADDER[2])
        assertArrayEquals(intArrayOf(4, 45, 1024, 200), Quality.LADDER[3])
    }

    @Test fun dataSaverStartsOnLowBandwidth() = assertEquals(3, Quality.defaultIndex(400, saveData = true))

    @Test fun phoneStartsOnBalanced() = assertEquals(2, Quality.defaultIndex(411, saveData = false))

    @Test fun bigTabletStartsOnSharpest() {
        assertEquals(0, Quality.defaultIndex(900, saveData = false))
        assertEquals(2, Quality.defaultIndex(899, saveData = false))
    }
}
