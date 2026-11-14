package th.sichomphu.scpremote.net

/** When a remote session is reopened by itself, and the session's timings (as scp-session.js). */
object SessionPolicy {
    private val RETRY_DELAYS = longArrayOf(2000, 5000, 10000)

    /** Keep-alive every 10 s for the whole session (a quiet link is otherwise cut, 13 Nov lesson). */
    const val KEEPALIVE_MS = 10_000L

    /** The app hidden for longer than this closes the remote session. */
    const val BACKGROUND_CLOSE_MS = 30_000L

    /**
     * A session that had a picture and then ended by itself is reopened after the returned delay;
     * null when someone ended it, it was refused, the technician left the screen, or 3 tries are used.
     */
    fun reconnectDelay(hadImage: Boolean, userClosed: Boolean, refused: Boolean, onScreen: Boolean, attempts: Int): Long? {
        if (!hadImage || userClosed || refused || !onScreen) return null
        if (attempts < 0 || attempts >= RETRY_DELAYS.size) return null
        return RETRY_DELAYS[attempts]
    }
}
