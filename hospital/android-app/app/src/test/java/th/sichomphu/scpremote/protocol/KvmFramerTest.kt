package th.sichomphu.scpremote.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Framing must match public/scripts/agent-redir-ws-0.1.1.js (accumulator, jumbo frames) and the
// command layouts in public/scripts/agent-desktop-0.0.2.js.
class KvmFramerTest {
    private fun b(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    private fun collect(vararg chunks: ByteArray): List<KvmCommand> {
        val out = mutableListOf<KvmCommand>()
        val f = KvmFramer { out.add(it) }
        chunks.forEach { f.feed(it) }
        return out
    }

    @Test fun singleTile() {
        val out = collect(b(0, 3, 0, 11, 0, 10, 0, 20, 0xAA, 0xBB, 0xCC))
        assertEquals(1, out.size)
        val t = out[0] as KvmCommand.Tile
        assertEquals(10, t.x); assertEquals(20, t.y)
        assertArrayEquals(b(0xAA, 0xBB, 0xCC), t.image)
    }

    @Test fun screenSize() =
        assertEquals(listOf(KvmCommand.ScreenSize(1920, 1080)), collect(b(0, 7, 0, 8, 0x07, 0x80, 0x04, 0x38)))

    @Test fun jumboTile() {
        // Outer header cmd 27 size 8, real size 0x00000D (13) in bytes 5-7, then the inner tile.
        val out = collect(b(0, 0x1B, 0, 8, 0, 0, 0, 13, 0, 3, 0, 0, 0, 1, 0, 2, 9, 8, 7, 6, 5))
        assertEquals(1, out.size)
        val t = out[0] as KvmCommand.Tile
        assertEquals(1, t.x); assertEquals(2, t.y)
        assertArrayEquals(b(9, 8, 7, 6, 5), t.image)
    }

    @Test fun tileSplitAcrossThreeChunks() {
        val out = mutableListOf<KvmCommand>()
        val f = KvmFramer { out.add(it) }
        f.feed(b(0, 3, 0, 12, 0, 1))
        assertTrue(out.isEmpty())
        f.feed(b(0, 3))
        assertTrue(out.isEmpty())
        f.feed(b(0x11, 0x22, 0x33, 0x44))
        assertEquals(1, out.size)
        val t = out[0] as KvmCommand.Tile
        assertEquals(1, t.x); assertEquals(3, t.y)
        assertArrayEquals(b(0x11, 0x22, 0x33, 0x44), t.image)
    }

    @Test fun nextFrameAfterAccumulationIsParsedFresh() {
        val out = collect(b(0, 7, 0, 8, 0x07), b(0x80, 0x04, 0x38), b(0, 7, 0, 8, 0, 100, 0, 50))
        assertEquals(listOf(KvmCommand.ScreenSize(1920, 1080), KvmCommand.ScreenSize(100, 50)), out)
    }

    @Test fun displays() =
        assertEquals(
            listOf(KvmCommand.Displays(listOf(1, 2), 65535)),
            collect(b(0, 0x0B, 0, 0x0C, 0, 2, 0, 1, 0, 2, 0xFF, 0xFF))
        )

    @Test fun noDisplays() =
        assertEquals(listOf(KvmCommand.Displays(emptyList(), 0)), collect(b(0, 0x0B, 0, 6, 0, 0)))

    @Test fun tinyChunkIgnored() = assertTrue(collect(b(0, 3)).isEmpty())

    @Test fun keyStateTouchAlertOther() {
        val out = collect(
            b(0, 18, 0, 5, 4),
            b(0, 14, 0, 4),
            b(0, 65, 0, 6, 'h'.code, 'i'.code),
            b(0, 82, 0, 4)
        )
        assertEquals(
            listOf(KvmCommand.KeyState(4), KvmCommand.TouchEnabled, KvmCommand.Alert("hi"), KvmCommand.Other(82)),
            out
        )
    }
}
