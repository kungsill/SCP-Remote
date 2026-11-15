package th.sichomphu.scpremote.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.ui.DeviceSections.Kind
import th.sichomphu.scpremote.ui.DeviceSections.Row

class DeviceSectionsTest {
    private fun d(id: String, online: Boolean = true) = Device(id, id, "g", "G", "", online, emptyList(), true, true, false, true)

    @Test fun recentIsOneStripFirstMostRecentFirstNotRepeatedBelow() {
        val shown = listOf(d("a"), d("b"), d("c"), d("x", online = false))
        val rows = DeviceSections.build(shown, recentIds = listOf("c", "x", "gone"), showRecent = true)
        assertEquals(
            listOf(
                Row.Recent(listOf(d("c"), d("x", online = false))),
                Row.Header(Kind.ONLINE, 2), Row.Item(d("a")), Row.Item(d("b")),
            ),
            rows,
        )
    }

    @Test fun offlineComputersAreGatheredAtTheEnd() {
        val rows = DeviceSections.build(listOf(d("a"), d("x", online = false)), emptyList(), showRecent = true)
        assertEquals(listOf(Row.Header(Kind.ONLINE, 1), Row.Item(d("a")), Row.Header(Kind.OFFLINE, 1), Row.Item(d("x", online = false))), rows)
    }

    @Test fun noRecentStripWhileSearchingOrFiltering() {
        val rows = DeviceSections.build(listOf(d("a"), d("b")), listOf("b"), showRecent = false)
        assertEquals(listOf(Row.Header(Kind.ONLINE, 2), Row.Item(d("a")), Row.Item(d("b"))), rows)
    }

    @Test fun nothingShownIsEmpty() = assertEquals(emptyList<Row>(), DeviceSections.build(emptyList(), listOf("a"), true))

    @Test fun recentListKeepsFiveNewestWithoutRepeats() {
        var r = emptyList<String>()
        for (id in listOf("a", "b", "c", "d", "e", "f", "b")) r = DeviceSections.pushRecent(r, id)
        assertEquals(listOf("b", "f", "e", "d", "c"), r)
    }

    @Test fun statsCountAllOnAndOff() =
        assertEquals(DeviceSections.Stats(total = 3, online = 2, offline = 1), DeviceSections.stats(listOf(d("a"), d("b"), d("x", online = false))))

    @Test fun statsOfNothingAreZero() = assertEquals(DeviceSections.Stats(0, 0, 0), DeviceSections.stats(emptyList()))
}
