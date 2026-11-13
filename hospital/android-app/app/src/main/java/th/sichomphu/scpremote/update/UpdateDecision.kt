package th.sichomphu.scpremote.update

import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** public/app-update/android/android.json, as publish-apk.js writes it. */
data class UpdateManifest(val versionCode: Int, val versionName: String, val apk: String, val sha256: String, val size: Long)

object UpdateDecision {
    private val APK_NAME = Regex("""^[A-Za-z0-9._-]+\.apk$""")
    private val HEX = Regex("""^[0-9a-f]+$""")

    /** Only a strictly higher versionCode is offered. */
    fun shouldUpdate(installedCode: Int, manifest: UpdateManifest) = manifest.versionCode > installedCode

    /** The manifest, or null if it is malformed or names a file outside the update folder. */
    fun parse(json: String): UpdateManifest? = try {
        val j = JSONObject(json)
        val m = UpdateManifest(
            j.getInt("versionCode"), j.getString("versionName"), j.getString("apk"),
            j.getString("sha256").lowercase(), j.getLong("size"),
        )
        if (m.versionCode < 1 || !APK_NAME.matches(m.apk) || m.apk.contains("..") || !HEX.matches(m.sha256) || m.size <= 0) null else m
    } catch (e: Exception) { null }

    /** The downloaded file is exactly the published one (size and SHA-256). */
    fun matches(file: File, m: UpdateManifest): Boolean {
        if (!file.isFile || file.length() != m.size) return false
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it) } == m.sha256
    }
}
