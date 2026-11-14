package th.sichomphu.scpremote.net

/** How good the connection is, from the keep-alive round trip (thresholds as scp-session.js). */
object Signal {
    enum class Level { GOOD, FAIR, POOR, UNKNOWN }

    fun level(rttMs: Long?): Level = when {
        rttMs == null -> Level.UNKNOWN
        rttMs < 180 -> Level.GOOD
        rttMs < 350 -> Level.FAIR
        else -> Level.POOR
    }
}
