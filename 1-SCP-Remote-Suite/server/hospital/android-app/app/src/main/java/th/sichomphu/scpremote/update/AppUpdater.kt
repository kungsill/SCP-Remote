package th.sichomphu.scpremote.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import th.sichomphu.scpremote.net.PinnedTrust
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Self-update from the hospital server (public/app-update/android/), through the same pinned
 * connection as sign-in. The APK is installed only if its size and SHA-256 match android.json, and
 * Android still asks the person to confirm the install.
 */
class AppUpdater(private val context: Context, private val baseUrl: String, private val trust: PinnedTrust) {
    private val folder = baseUrl.trimEnd('/') + "/app-update/android/"
    private val file get() = File(context.cacheDir, "update.apk")

    private fun client() = trust.clientFor(Uri.parse(baseUrl).host ?: "").newBuilder()
        .readTimeout(60, TimeUnit.SECONDS).pingInterval(0, TimeUnit.SECONDS).build()

    fun installedCode(): Int =
        PackageInfoCompat.getLongVersionCode(context.packageManager.getPackageInfo(context.packageName, 0)).toInt()

    /** The newer version on the server, or null (none, or the server could not be read). */
    suspend fun check(): UpdateManifest? = withContext(Dispatchers.IO) {
        try {
            client().newCall(Request.Builder().url(folder + "android.json").header("Cache-Control", "no-cache").build()).execute().use { r ->
                if (!r.isSuccessful) return@use null
                UpdateDecision.parse(r.body?.string() ?: "")?.takeIf { UpdateDecision.shouldUpdate(installedCode(), it) }
            }
        } catch (e: Exception) { null }
    }

    /** Downloads and verifies the APK; null (and nothing kept) if anything does not match. */
    suspend fun download(m: UpdateManifest): File? = withContext(Dispatchers.IO) {
        val f = file
        try {
            client().newCall(Request.Builder().url(folder + m.apk).build()).execute().use { r ->
                if (!r.isSuccessful) return@use null
                val body = r.body ?: return@use null
                if (body.contentLength() > 0 && body.contentLength() != m.size) return@use null
                f.outputStream().use { out -> body.byteStream().copyTo(out) }
                if (UpdateDecision.matches(f, m)) f else null
            }
        } catch (e: Exception) { null }.also { if (it == null) f.delete() }
    }

    /** Android 8+ asks once to allow installs from this app; until then open that setting. */
    fun canInstall(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun openInstallPermission() {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Hands the verified APK to Android's installer (the person confirms there). */
    fun install(apk: File) {
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", apk)
        context.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
