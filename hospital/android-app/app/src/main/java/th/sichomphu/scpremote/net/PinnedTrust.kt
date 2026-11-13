package th.sichomphu.scpremote.net

import okhttp3.OkHttpClient
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/** The server's certificate is not the one the app was built for. */
class CertMismatch : CertificateException("server certificate does not match the pinned one")

/**
 * The hospital server uses its own certificate on an IP address (as the desktop program does), so
 * an IP host is trusted only when its certificate's SHA-256 equals the pin from res/raw/server.json.
 * The check runs in the TLS handshake, before any HTTP request (and its x-meshauth header) is sent.
 * A host name (e.g. through Cloudflare) uses the normal public trust.
 */
class PinnedTrust(pinSha256Hex: String) {
    private val pin = pinSha256Hex.replace(":", "").uppercase()

    fun matches(certDer: ByteArray): Boolean =
        MessageDigest.getInstance("SHA-256").digest(certDer).joinToString("") { "%02X".format(it) } == pin

    val trustManager: X509TrustManager = object : X509TrustManager {
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            if (chain.isNullOrEmpty() || !matches(chain[0].encoded)) throw CertMismatch()
        }
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = throw CertificateException()
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    private fun base() = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)

    private val publicClient by lazy { base().build() }
    private val pinnedClients = mutableMapOf<String, OkHttpClient>()

    @Synchronized
    fun clientFor(host: String): OkHttpClient {
        if (!IPV4.matches(host)) return publicClient
        return pinnedClients.getOrPut(host) {
            val ctx = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager), null) }
            base().sslSocketFactory(ctx.socketFactory, trustManager).hostnameVerifier { h, _ -> h == host }.build()
        }
    }

    private companion object { val IPV4 = Regex("""^\d{1,3}(\.\d{1,3}){3}$""") }
}
