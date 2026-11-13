package th.sichomphu.scpremote.protocol

import org.json.JSONArray
import org.json.JSONObject
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.model.DeviceList
import th.sichomphu.scpremote.model.Group
import java.net.URLEncoder
import java.util.Base64

/** JSON messages for the server's control channel (control.ashx) and the relay URL. */
object ControlMessages {
    private fun b64(s: String) = Base64.getEncoder().encodeToString(s.toByteArray(Charsets.UTF_8))
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** Value of the x-meshauth header: base64(user),base64(password). */
    fun authHeader(user: String, pass: String) = b64(user) + "," + b64(pass)

    fun scpops(tag: Int, op: String, extra: Map<String, Any?> = emptyMap()): String {
        val j = JSONObject().put("action", "scpops").put("tag", tag).put("op", op)
        extra.forEach { (k, v) -> j.put(k, v) }
        return j.toString()
    }

    fun authCookieRequest() = JSONObject().put("action", "authcookie").toString()

    /** Asks the agent on [nodeId] to open a desktop tunnel to the relay (usage 2 = desktop). */
    fun tunnelRequest(nodeId: String, tunnelId: String, rauth: String, viewOnly: Boolean): String {
        val j = JSONObject().put("action", "msg").put("type", "tunnel").put("nodeid", nodeId).put("usage", 2)
            .put("value", "*/meshrelay.ashx?p=2&nodeid=$nodeId&id=$tunnelId&rauth=$rauth")
        if (viewOnly) j.put("viewonly", true)
        return j.toString()
    }

    /** The phone's side of the relay; [base] is the server URL (https://host:port). */
    fun relayUrl(base: String, nodeId: String, tunnelId: String, auth: String, viewOnly: Boolean): String {
        val ws = base.trimEnd('/').replaceFirst(Regex("^http"), "ws")
        return "$ws/meshrelay.ashx?browser=1&p=2&nodeid=${enc(nodeId)}&id=${enc(tunnelId)}&auth=${enc(auth)}" +
            if (viewOnly) "&viewonly=1" else ""
    }

    /** The `result` object of the appDevices operation. Group names come from groups[] by groupId. */
    fun parseDevices(json: String): DeviceList {
        val r = JSONObject(json)
        val groups = r.optJSONArray("groups").objects().map { Group(it.optString("id"), it.optString("name")) }
        val names = groups.associate { it.id to it.name }
        val devices = r.optJSONArray("devices").objects().map {
            val gid = it.optString("groupId")
            Device(
                id = it.optString("id"), name = it.optString("name"), groupId = gid, groupName = names[gid] ?: "",
                ip = it.optString("ip"), online = it.optBoolean("online"),
                users = it.optJSONArray("users")?.let { a -> (0 until a.length()).map { i -> a.optString(i) } } ?: emptyList(),
                canView = it.optBoolean("canView"), canControl = it.optBoolean("canControl"),
                viewOnly = it.optBoolean("viewOnly"), canFixPrinter = it.optBoolean("canFixPrinter"),
            )
        }
        return DeviceList(r.optJSONObject("user")?.optString("name") ?: "", groups, devices)
    }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
}
