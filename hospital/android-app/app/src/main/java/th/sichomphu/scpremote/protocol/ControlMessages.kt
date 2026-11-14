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
        // The tag must be a string: meshuser.js ignores scpops messages whose tag is not.
        val j = JSONObject().put("action", "scpops").put("tag", tag.toString()).put("op", op)
        extra.forEach { (k, v) -> j.put(k, v) }
        return j.toString()
    }

    fun authCookieRequest() = JSONObject().put("action", "authcookie").toString()

    /** Asks the agent on [nodeId] to open a tunnel to the relay: protocol 2 = desktop, 5 = files. */
    fun tunnelRequest(nodeId: String, tunnelId: String, rauth: String, viewOnly: Boolean, protocol: Int = 2): String {
        val j = JSONObject().put("action", "msg").put("type", "tunnel").put("nodeid", nodeId).put("usage", protocol)
            .put("value", "*/meshrelay.ashx?p=$protocol&nodeid=$nodeId&id=$tunnelId&rauth=$rauth")
        if (viewOnly) j.put("viewonly", true)
        return j.toString()
    }

    /** The phone's side of the relay; [base] is the server URL (https://host:port). */
    fun relayUrl(base: String, nodeId: String, tunnelId: String, auth: String, viewOnly: Boolean, protocol: Int = 2): String {
        val ws = base.trimEnd('/').replaceFirst(Regex("^http"), "ws")
        return "$ws/meshrelay.ashx?browser=1&p=$protocol&nodeid=${enc(nodeId)}&id=${enc(tunnelId)}&auth=${enc(auth)}" +
            if (viewOnly) "&viewonly=1" else ""
    }

    // Power action types (meshuser.js poweraction): 2 = power off, 3 = reset.
    const val SHUTDOWN = 2
    const val RESTART = 3

    /** The computer's clipboard text; the agent answers {action:'msg', type:'getclip', nodeid, tag, data}. */
    fun getClipboard(nodeId: String, tag: Int) =
        JSONObject().put("action", "msg").put("type", "getclip").put("nodeid", nodeId).put("tag", tag).toString()

    fun setClipboard(nodeId: String, text: String) =
        JSONObject().put("action", "msg").put("type", "setclip").put("nodeid", nodeId).put("data", text).toString()

    fun power(nodeId: String, actionType: Int, responseId: String) =
        JSONObject().put("action", "poweraction").put("nodeids", JSONArray().put(nodeId)).put("actiontype", actionType)
            .put("responseid", responseId).toString()

    /** Wake-on-LAN, sent by other computers on the same network (needs a known MAC address). */
    fun wake(nodeId: String, responseId: String) =
        JSONObject().put("action", "wakedevices").put("nodeids", JSONArray().put(nodeId)).put("responseid", responseId).toString()

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
                rights = it.optLong("rights", 0L),
            )
        }
        return DeviceList(r.optJSONObject("user")?.optString("name") ?: "", groups, devices)
    }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
}
