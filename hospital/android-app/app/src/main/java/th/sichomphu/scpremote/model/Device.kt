package th.sichomphu.scpremote.model

data class Group(val id: String, val name: String)

/** One computer as the server's appDevices operation reports it, with this account's rights. */
data class Device(
    val id: String,
    val name: String,
    val groupId: String,
    val groupName: String,
    val ip: String,
    val online: Boolean,
    val users: List<String>,
    val canView: Boolean,
    val canControl: Boolean,
    val viewOnly: Boolean,
    val canFixPrinter: Boolean,
)

data class DeviceList(val userName: String, val groups: List<Group>, val devices: List<Device>)

/** Result of the server's fixed printer fix; [error] is the server's code (ACCESS_DENIED, NOT_ONLINE…). */
data class FixResult(val ok: Boolean, val before: Int?, val after: Int?, val spooler: String?, val error: String?)
