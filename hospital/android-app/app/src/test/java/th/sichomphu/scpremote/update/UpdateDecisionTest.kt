package th.sichomphu.scpremote.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.security.MessageDigest

class UpdateDecisionTest {
    private fun m(code: Int, sha: String = "00", size: Long = 1) = UpdateManifest(code, "1.0.$code", "scp-remote-1.0.$code.apk", sha, size)

    @Test fun onlyAStrictlyNewerVersionIsInstalled() {
        assertTrue(UpdateDecision.shouldUpdate(3, m(4)))
        assertFalse(UpdateDecision.shouldUpdate(4, m(4)))
        assertFalse(UpdateDecision.shouldUpdate(5, m(4)))
    }

    @Test fun parsesThePublishedJson() {
        val j = """{"versionCode":5,"versionName":"1.0.4","apk":"scp-remote-1.0.4.apk","sha256":"AB12","size":123}"""
        assertEquals(UpdateManifest(5, "1.0.4", "scp-remote-1.0.4.apk", "ab12", 123), UpdateDecision.parse(j))
    }

    @Test fun rejectsAManifestThatCouldPointElsewhere() {
        assertNull(UpdateDecision.parse("""{"versionCode":5,"versionName":"1","apk":"../x.apk","sha256":"ab","size":1}"""))
        assertNull(UpdateDecision.parse("""{"versionCode":5,"versionName":"1","apk":"https://evil/x.apk","sha256":"ab","size":1}"""))
        assertNull(UpdateDecision.parse("""{"versionCode":5,"versionName":"1","apk":"x.apk","sha256":"zz","size":1}"""))
        assertNull(UpdateDecision.parse("""{"versionCode":0,"versionName":"1","apk":"x.apk","sha256":"ab","size":1}"""))
        assertNull(UpdateDecision.parse("not json"))
    }

    @Test fun downloadedFileMustMatchSizeAndHash() {
        val f = File.createTempFile("update", ".apk").apply { writeBytes(byteArrayOf(1, 2, 3)); deleteOnExit() }
        val sha = MessageDigest.getInstance("SHA-256").digest(byteArrayOf(1, 2, 3)).joinToString("") { "%02x".format(it) }
        assertTrue(UpdateDecision.matches(f, m(2, sha, 3)))
        assertFalse("wrong size", UpdateDecision.matches(f, m(2, sha, 4)))
        assertFalse("wrong hash", UpdateDecision.matches(f, m(2, "00".repeat(32), 3)))
    }
}
