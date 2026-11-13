package th.sichomphu.scpremote.ui

import th.sichomphu.scpremote.model.Device
import java.text.Collator
import java.util.Locale

/** Search and order for the computer list: online computers first, then by name in Thai order. */
object DeviceFilter {
    private val collator: Collator = Collator.getInstance(Locale("th", "TH"))

    fun apply(list: List<Device>, query: String, groupId: String?): List<Device> {
        val q = query.trim().lowercase()
        return list
            .filter { groupId == null || it.groupId == groupId }
            .filter { d ->
                q.isEmpty() || d.name.lowercase().contains(q) || d.ip.contains(q) ||
                    d.groupName.lowercase().contains(q) || d.users.any { it.lowercase().contains(q) }
            }
            .sortedWith(compareBy<Device> { !it.online }.thenComparator { a, b -> collator.compare(a.name, b.name) })
    }
}
