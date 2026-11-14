package th.sichomphu.scpremote.data

import android.content.Context
import android.net.ConnectivityManager

/** Settings remembered on this phone (not secret). */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val app = context.applicationContext

    /** Chosen picture level (index into Quality.LADDER); until chosen, suited to this phone. */
    var quality: Int
        get() = p.getInt("quality", -1).takeIf { it in Quality.LADDER.indices } ?: Quality.defaultIndex(
            app.resources.configuration.smallestScreenWidthDp, dataSaver()
        )
        set(v) { p.edit().putInt("quality", v).apply() }

    var touchpadMode: Boolean
        get() = p.getBoolean("touchpad", true)
        set(v) { p.edit().putBoolean("touchpad", v).apply() }

    /** Computers connected to most recently, newest first (ids; ids never contain a newline). */
    var recent: List<String>
        get() = p.getString("recent", "")!!.split('\n').filter { it.isNotEmpty() }
        set(v) { p.edit().putString("recent", v.joinToString("\n")).apply() }

    /** Sign-in connection setting (automatic unless changed) and the address typed for "custom". */
    var connectionMode: ServerChoice.Mode
        get() = runCatching { ServerChoice.Mode.valueOf(p.getString("connection", "AUTO")!!) }.getOrDefault(ServerChoice.Mode.AUTO)
        set(v) { p.edit().putString("connection", v.name).apply() }

    /** The address the last successful sign-in used (automatic mode tries it first). */
    var lastServer: String
        get() = p.getString("lastServer", "")!!
        set(v) { p.edit().putString("lastServer", v).apply() }

    var customServer: String
        get() = p.getString("customServer", "")!!
        set(v) { p.edit().putString("customServer", v).apply() }

    /** Gesture guide already shown for this mouse mode. */
    fun guideSeen(touchpad: Boolean) = p.getBoolean(if (touchpad) "guide_touchpad" else "guide_direct", false)
    fun setGuideSeen(touchpad: Boolean) { p.edit().putBoolean(if (touchpad) "guide_touchpad" else "guide_direct", true).apply() }

    private fun dataSaver(): Boolean {
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        // Never let a settings lookup stop the remote screen from opening.
        return try { cm.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED } catch (e: Exception) { false }
    }
}
