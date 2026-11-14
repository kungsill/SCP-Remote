package th.sichomphu.scpremote.net

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

class PinnedTrustTest {
    private val pin = "DA:51:5D:CE:DA:9A:11:A3:92:F1:84:A2:37:37:82:E1:9F:C1:97:DC:6B:C8:8B:68:61:D1:94:67:10:16:CE:D1"
    private fun der(name: String) = javaClass.classLoader!!.getResourceAsStream(name)!!.readBytes()
    private fun cert(name: String) =
        CertificateFactory.getInstance("X.509").generateCertificate(der(name).inputStream()) as X509Certificate

    @Test fun matchesOnlyThePinnedCertificate() {
        val t = PinnedTrust(pin)
        assertTrue(t.matches(der("test-cert.der")))
        assertFalse(t.matches(der("other-cert.der")))
    }

    @Test fun pinWithoutColonsOrLowercaseAlsoWorks() =
        assertTrue(PinnedTrust(pin.replace(":", "").lowercase()).matches(der("test-cert.der")))

    @Test fun trustManagerAcceptsThePinnedLeaf() =
        PinnedTrust(pin).trustManager.checkServerTrusted(arrayOf(cert("test-cert.der")), "ECDHE_ECDSA")

    // Review Focus 2: the check runs inside the TLS handshake, which completes before OkHttp writes
    // the upgrade request — so a server with another certificate never sees the x-meshauth header.
    @Test fun trustManagerRejectsAnyOtherCertificateWithCertMismatch() {
        try {
            PinnedTrust(pin).trustManager.checkServerTrusted(arrayOf(cert("other-cert.der")), "ECDHE_ECDSA")
            fail("expected CertMismatch")
        } catch (e: CertMismatch) { }
    }

    @Test fun trustManagerRejectsAnEmptyChain() {
        try { PinnedTrust(pin).trustManager.checkServerTrusted(emptyArray(), "RSA"); fail() } catch (e: CertMismatch) { }
    }

    @Test fun ipAddressUsesThePinnedClientAndNamesUseTheDefault() {
        val t = PinnedTrust(pin)
        val ip = t.clientFor("192.168.2.25")
        assertSame(t.trustManager, ip.x509TrustManager)
        assertTrue(ip.hostnameVerifier.verify("192.168.2.25", null))
        assertFalse(ip.hostnameVerifier.verify("10.0.0.1", null))
        assertNotSame(t.trustManager, t.clientFor("remote.example.org").x509TrustManager)
    }
}
