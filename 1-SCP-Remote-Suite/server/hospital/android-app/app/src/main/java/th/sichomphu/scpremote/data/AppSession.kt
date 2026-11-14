package th.sichomphu.scpremote.data

import android.content.Context
import org.json.JSONObject
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.model.DeviceList
import th.sichomphu.scpremote.net.ControlChannel
import th.sichomphu.scpremote.net.PinnedTrust
import th.sichomphu.scpremote.net.SocketOpener

/**
 * The server the app was built for (res/raw/server.json): the hospital address (pinned
 * certificate) and the internet address through Cloudflare (public certificate).
 */
data class ServerConfig(val url: String, val certificateSha256: String, val internetUrl: String = "") {
    companion object {
        fun load(context: Context): ServerConfig {
            val j = JSONObject(context.resources.openRawResource(R.raw.server).bufferedReader().use { it.readText() })
            return ServerConfig(j.getString("url"), j.getString("certificateSha256"), j.optString("internetUrl"))
        }
    }
}

/** Which address to try: the one typed, then the other known one if the first cannot be reached. */
object ServerChoice {
    private fun same(a: String, b: String) = a.trimEnd('/').equals(b.trimEnd('/'), ignoreCase = true)

    fun candidates(typed: String, config: ServerConfig): List<String> {
        val t = typed.trimEnd('/')
        val other = when {
            config.internetUrl.isBlank() -> null
            same(t, config.url) -> config.internetUrl
            same(t, config.internetUrl) -> config.url
            else -> null
        }
        return listOfNotNull(t, other?.trimEnd('/'))
    }

    /** Only "cannot reach" means the other address may work; a wrong password or certificate will not. */
    fun tryNext(code: String?) = code == "UNREACHABLE"

    fun isInternet(url: String, config: ServerConfig) = config.internetUrl.isNotBlank() && same(url, config.internetUrl)
}

/** Process-wide sign-in state shared by the screens. Lost with the process; the sign-in screen rebuilds it. */
object AppSession {
    @Volatile var server: String = ""
    @Volatile var trust: PinnedTrust? = null
    @Volatile var channel: ControlChannel? = null
    @Volatile var devices: DeviceList? = null
    /** Signed in through the internet address (Cloudflare), not the hospital network. */
    @Volatile var viaInternet = false
    /** Debug builds' preview mode only: a stand-in relay. Always null in the published app. */
    @Volatile var relayOpener: SocketOpener? = null
    /** The app looked for a newer version after this sign-in. */
    @Volatile var updateChecked = false

    fun signOut() {
        channel?.close()
        channel = null
        devices = null
        updateChecked = false
        viaInternet = false
    }
}
