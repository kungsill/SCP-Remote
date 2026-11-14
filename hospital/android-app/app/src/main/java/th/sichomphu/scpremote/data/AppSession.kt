package th.sichomphu.scpremote.data

import android.content.Context
import org.json.JSONObject
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.model.DeviceList
import th.sichomphu.scpremote.net.ControlChannel
import th.sichomphu.scpremote.net.PinnedTrust
import th.sichomphu.scpremote.net.SocketOpener

/** The server the app was built for (res/raw/server.json, a copy of the desktop program's). */
data class ServerConfig(val url: String, val certificateSha256: String) {
    companion object {
        fun load(context: Context): ServerConfig {
            val j = JSONObject(context.resources.openRawResource(R.raw.server).bufferedReader().use { it.readText() })
            return ServerConfig(j.getString("url"), j.getString("certificateSha256"))
        }
    }
}

/** Process-wide sign-in state shared by the screens. Lost with the process; the sign-in screen rebuilds it. */
object AppSession {
    @Volatile var server: String = ""
    @Volatile var trust: PinnedTrust? = null
    @Volatile var channel: ControlChannel? = null
    @Volatile var devices: DeviceList? = null
    /** Debug builds' preview mode only: a stand-in relay. Always null in the published app. */
    @Volatile var relayOpener: SocketOpener? = null
    /** The app looked for a newer version after this sign-in. */
    @Volatile var updateChecked = false

    fun signOut() {
        channel?.close()
        channel = null
        devices = null
        updateChecked = false
    }
}
