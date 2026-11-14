package th.sichomphu.scpremote.data

/** Picture settings [encoding, quality, scaling, frame ms], the same four levels as the web page. */
object Quality {
    val LADDER: List<IntArray> = listOf(
        intArrayOf(2, 100, 1024, 50), // Sharpest (PNG)
        intArrayOf(4, 100, 1024, 50), // Sharp
        intArrayOf(4, 70, 1024, 100), // Balanced
        intArrayOf(4, 45, 1024, 200), // Low bandwidth
    )

    /** Data Saver on → Low bandwidth; a phone (short side under 900 dp) → Balanced; else Sharpest. */
    fun defaultIndex(shortSideDp: Int, saveData: Boolean): Int = when {
        saveData -> 3
        shortSideDp in 1 until 900 -> 2
        else -> 0
    }
}
