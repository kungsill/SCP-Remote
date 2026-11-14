package th.sichomphu.scpremote.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ServerChoiceTest {
    private val config = ServerConfig("https://192.168.2.25:8443", "AB", internetUrl = "https://remote.kpsnana.com")

    @Test fun hospitalAddressFallsBackToTheInternetOne() =
        assertEquals(listOf("https://192.168.2.25:8443", "https://remote.kpsnana.com"), ServerChoice.candidates("https://192.168.2.25:8443", config))

    @Test fun internetAddressTypedFallsBackToTheHospitalOne() =
        assertEquals(listOf("https://remote.kpsnana.com", "https://192.168.2.25:8443"), ServerChoice.candidates("https://remote.kpsnana.com/", config))

    @Test fun anyOtherAddressIsTriedAlone() =
        assertEquals(listOf("https://10.0.0.5"), ServerChoice.candidates("https://10.0.0.5", config))

    @Test fun noInternetAddressConfigured() =
        assertEquals(listOf("https://192.168.2.25:8443"), ServerChoice.candidates("https://192.168.2.25:8443", config.copy(internetUrl = "")))

    @Test fun onlyAnUnreachableServerIsWorthTryingTheOtherAddress() {
        assertEquals(true, ServerChoice.tryNext("UNREACHABLE"))
        assertEquals(false, ServerChoice.tryNext("BAD_LOGIN"))
        assertEquals(false, ServerChoice.tryNext("CERT_MISMATCH"))
    }

    @Test fun internetAddressIsLabelled() {
        assertEquals(true, ServerChoice.isInternet("https://remote.kpsnana.com", config))
        assertEquals(false, ServerChoice.isInternet("https://192.168.2.25:8443", config))
    }
}
