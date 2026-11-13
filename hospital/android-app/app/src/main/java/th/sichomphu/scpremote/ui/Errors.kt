package th.sichomphu.scpremote.ui

import android.content.Context
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.net.ControlError

/** The sentence shown for a ControlError code (or any other failure). */
fun Context.errorText(e: Throwable?): String = when (val code = (e as? ControlError)?.code) {
    "BAD_LOGIN" -> getString(R.string.err_BAD_LOGIN)
    "CERT_MISMATCH" -> getString(R.string.err_CERT_MISMATCH)
    "UNREACHABLE" -> getString(R.string.err_UNREACHABLE)
    "DISCONNECTED" -> getString(R.string.err_DISCONNECTED)
    "TIMEOUT" -> getString(R.string.err_TIMEOUT)
    "UNKNOWN_OPERATION" -> getString(R.string.err_UNKNOWN_OPERATION)
    null -> getString(R.string.err_other, e?.javaClass?.simpleName ?: "?")
    else -> getString(R.string.err_other, code)
}
