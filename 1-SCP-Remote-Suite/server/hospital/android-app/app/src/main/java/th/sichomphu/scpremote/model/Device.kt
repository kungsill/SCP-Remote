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
    /** The account's MeshCentral rights on this computer (0xFFFFFFFF = everything). */
    val rights: Long = 0,
) {
    val canPower get() = Rights.canPower(rights)
    val canWake get() = Rights.canWake(rights)
    val canFiles get() = Rights.canFiles(rights, canControl)
    val canClipboard get() = canControl
}

/**
 * Which extra buttons to show, from the same bits the server checks (meshuser.js): restart and
 * shut down need RESETOFF, wake needs WAKEDEVICE, files need control and no NOFILES. The server
 * still refuses anything the account may not do.
 */
object Rights {
    private const val FULL = 0xFFFFFFFFL
    private const val WAKEDEVICE = 0x40L
    private const val NOFILES = 0x400L
    private const val RESETOFF = 0x40000L

    fun canPower(r: Long) = r == FULL || (r and RESETOFF) != 0L
    fun canWake(r: Long) = r == FULL || (r and WAKEDEVICE) != 0L
    fun canFiles(r: Long, canControl: Boolean) = canControl && (r == FULL || (r and NOFILES) == 0L)
}

data class DeviceList(val userName: String, val groups: List<Group>, val devices: List<Device>)

/** Result of the server's fixed printer fix; [error] is the server's code (ACCESS_DENIED, NOT_ONLINE…). */
data class FixResult(val ok: Boolean, val before: Int?, val after: Int?, val spooler: String?, val error: String?)
