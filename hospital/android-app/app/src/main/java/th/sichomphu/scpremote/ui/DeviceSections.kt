package th.sichomphu.scpremote.ui

import th.sichomphu.scpremote.model.Device

/**
 * The computer list in sections: a strip of computers used recently (newest first), then those
 * that are on, then those that are off. A computer appears once.
 */
object DeviceSections {
    enum class Kind { ONLINE, OFFLINE }

    sealed class Row {
        /** The horizontal "used recently" strip at the top. */
        data class Recent(val devices: List<Device>) : Row()
        data class Header(val kind: Kind, val count: Int) : Row()
        data class Item(val device: Device) : Row()
    }

    /** The numbers on the header's stats card. */
    data class Stats(val total: Int, val online: Int, val offline: Int)

    const val MAX_RECENT = 5

    /** [shown] is already filtered and ordered; [showRecent] is false while searching or filtering. */
    fun build(shown: List<Device>, recentIds: List<String>, showRecent: Boolean): List<Row> {
        val byId = shown.associateBy { it.id }
        val recent = if (showRecent) recentIds.mapNotNull { byId[it] } else emptyList()
        val recentSet = recent.map { it.id }.toSet()
        val rest = shown.filter { it.id !in recentSet }
        val rows = mutableListOf<Row>()
        if (recent.isNotEmpty()) rows.add(Row.Recent(recent))
        fun section(kind: Kind, list: List<Device>) {
            if (list.isEmpty()) return
            rows.add(Row.Header(kind, list.size))
            list.forEach { rows.add(Row.Item(it)) }
        }
        section(Kind.ONLINE, rest.filter { it.online })
        section(Kind.OFFLINE, rest.filter { !it.online })
        return rows
    }

    fun stats(all: List<Device>): Stats {
        val on = all.count { it.online }
        return Stats(all.size, on, all.size - on)
    }

    /** [id] becomes the newest of the recent computers; at most [MAX_RECENT] are kept. */
    fun pushRecent(recent: List<String>, id: String): List<String> = (listOf(id) + recent.filter { it != id }).take(MAX_RECENT)
}
