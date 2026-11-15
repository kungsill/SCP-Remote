package th.sichomphu.scpremote.ui

import th.sichomphu.scpremote.R

/** Small display choices for the 1.3.0 look: the header greeting, tile colours, the account initial. */
object Look {
    enum class Greeting { MORNING, AFTERNOON, EVENING }

    /** Tile colour: [icon] colour on a soft [bg]. */
    enum class Tint(val icon: Int, val bg: Int) {
        PINK(R.color.tint_pink, R.color.tint_pink_bg),
        CYAN(R.color.tint_cyan, R.color.tint_cyan_bg),
        VIOLET(R.color.tint_violet, R.color.tint_violet_bg),
        AMBER(R.color.tint_amber, R.color.tint_amber_bg),
        GREEN(R.color.tint_green, R.color.tint_green_bg),
        RED(R.color.tint_red, R.color.tint_red_bg),
        BLUE(R.color.tint_blue, R.color.tint_blue_bg),
        GRAY(R.color.tint_gray, R.color.tint_gray_bg),
    }

    private val departmentTints = listOf(Tint.PINK, Tint.CYAN, Tint.VIOLET, Tint.AMBER)

    fun greeting(hour: Int) = when {
        hour < 12 -> Greeting.MORNING
        hour < 17 -> Greeting.AFTERNOON
        else -> Greeting.EVENING
    }

    /** One colour per department, the same every time; computers that are off are grey. */
    fun tileTint(groupId: String, online: Boolean): Tint =
        if (!online) Tint.GRAY else departmentTints[Math.floorMod(groupId.hashCode(), departmentTints.size)]

    /** A file-list tile: a short [label] (PDF, XLS…) or an [icon], on a solid [tint]. */
    data class Badge(val label: String?, val icon: Int?, val tint: Tint)

    private val pictures = setOf("jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "tif", "tiff")

    fun fileBadge(name: String, isFolder: Boolean, isDrive: Boolean): Badge = when {
        isDrive -> Badge(null, R.drawable.ic_drive, Tint.CYAN)
        isFolder -> Badge(null, R.drawable.ic_folder, Tint.AMBER)
        else -> when (name.substringAfterLast('.', "").lowercase()) {
            "pdf" -> Badge("PDF", null, Tint.RED)
            "xls", "xlsx", "csv" -> Badge("XLS", null, Tint.GREEN)
            "doc", "docx" -> Badge("DOC", null, Tint.BLUE)
            "ppt", "pptx" -> Badge("PPT", null, Tint.PINK)
            "zip", "rar", "7z" -> Badge("ZIP", null, Tint.GRAY)
            in pictures -> Badge(null, R.drawable.ic_image, Tint.VIOLET)
            else -> Badge(null, R.drawable.ic_file, Tint.GRAY)
        }
    }

    fun initial(name: String): String {
        val t = name.trim()
        if (t.isEmpty()) return "?"
        return String(Character.toChars(t.codePointAt(0))).uppercase()
    }
}
