package th.sichomphu.scpremote.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class LookTest {
    @Test fun greetingFollowsTheHour() {
        assertEquals(Look.Greeting.MORNING, Look.greeting(0))
        assertEquals(Look.Greeting.MORNING, Look.greeting(11))
        assertEquals(Look.Greeting.AFTERNOON, Look.greeting(12))
        assertEquals(Look.Greeting.AFTERNOON, Look.greeting(16))
        assertEquals(Look.Greeting.EVENING, Look.greeting(17))
        assertEquals(Look.Greeting.EVENING, Look.greeting(23))
    }

    @Test fun offComputersAreGrey() = assertEquals(Look.Tint.GRAY, Look.tileTint("mesh//abc", online = false))

    @Test fun sameDepartmentSameColourEveryTime() =
        assertEquals(Look.tileTint("mesh//er", online = true), Look.tileTint("mesh//er", online = true))

    @Test fun onComputersNeverGrey() {
        for (g in listOf("", "a", "mesh//er", "mesh//opd", "mesh//ward", "mesh//lab")) assertNotEquals(Look.Tint.GRAY, Look.tileTint(g, online = true))
    }

    @Test fun departmentsSpreadOverSeveralColours() {
        val tints = (1..40).map { Look.tileTint("mesh//group$it", online = true) }.toSet()
        assertEquals(4, tints.size)
    }

    @Test fun initialIsFirstLetterUpperCased() {
        assertEquals("A", Look.initial("admin"))
        assertEquals("ส", Look.initial("  สมชาย"))
        assertEquals("?", Look.initial(""))
    }
}
