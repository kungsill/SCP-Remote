package th.sichomphu.scpremote.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** The remembered account, kept in Android's encrypted preferences (key in the Keystore). */
class SecureStore(context: Context) {
    data class Saved(val server: String, val user: String, val pass: String)

    private val prefs: SharedPreferences? = try {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, "account", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        // A broken keystore (e.g. after a restore from backup) means nothing is remembered.
        null
    }

    fun save(server: String, user: String, pass: String) {
        prefs?.edit()?.putString("server", server)?.putString("user", user)?.putString("pass", pass)?.apply()
    }

    fun load(): Saved? {
        val p = prefs ?: return null
        val user = p.getString("user", null) ?: return null
        val pass = p.getString("pass", null) ?: return null
        return Saved(p.getString("server", null) ?: "", user, pass)
    }

    fun clear() { prefs?.edit()?.clear()?.apply() }
}
