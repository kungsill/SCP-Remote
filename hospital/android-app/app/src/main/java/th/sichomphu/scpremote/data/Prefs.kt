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

    private fun dataSaver(): Boolean {
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        // Never let a settings lookup stop the remote screen from opening.
        return try { cm.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED } catch (e: Exception) { false }
    }
}
