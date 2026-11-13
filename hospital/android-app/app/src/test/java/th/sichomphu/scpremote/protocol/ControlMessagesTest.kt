package th.sichomphu.scpremote.protocol

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.model.Group

class ControlMessagesTest {
    @Test fun authHeaderIsBase64UserCommaBase64Pass() =
        assertEquals("YWRtaW4=,cEBzcw==", ControlMessages.authHeader("admin", "p@ss"))

    @Test fun authHeaderThaiPasswordIsUtf8() =
        assertEquals("dQ==,4LiB", ControlMessages.authHeader("u", "ก"))

    @Test fun scpopsCarriesTagOpAndExtra() {
        val j = JSONObject(ControlMessages.scpops(7, "fixPrinter", mapOf("nodeid" to "node//abc")))
        assertEquals("scpops", j.getString("action"))
        // meshuser.js drops an scpops message whose tag is not a string (typeof command.tag !== 'string').
        assertEquals("7", j.get("tag"))
        assertEquals("fixPrinter", j.getString("op"))
        assertEquals("node//abc", j.getString("nodeid"))
    }

    @Test fun authCookieRequest() =
        assertEquals("authcookie", JSONObject(ControlMessages.authCookieRequest()).getString("action"))

    @Test fun tunnelRequestFullControl() {
        val j = JSONObject(ControlMessages.tunnelRequest("node//abc", "xyz", "R", viewOnly = false))
        assertEquals("msg", j.getString("action"))
        assertEquals("tunnel", j.getString("type"))
        assertEquals("node//abc", j.getString("nodeid"))
        assertEquals(2, j.getInt("usage"))
        assertEquals("*/meshrelay.ashx?p=2&nodeid=node//abc&id=xyz&rauth=R", j.getString("value"))
        assertFalse(j.has("viewonly"))
    }

    @Test fun tunnelRequestViewOnly() =
        assertTrue(JSONObject(ControlMessages.tunnelRequest("n", "i", "R", viewOnly = true)).getBoolean("viewonly"))

    @Test fun relayUrlEncodesIdsAndCookie() {
        assertEquals(
            "wss://192.168.2.25:8443/meshrelay.ashx?browser=1&p=2&nodeid=node%2F%2Fabc&id=xyz&auth=a%2Bb%3D",
            ControlMessages.relayUrl("https://192.168.2.25:8443", "node//abc", "xyz", "a+b=", viewOnly = false)
        )
        assertTrue(ControlMessages.relayUrl("https://h", "n", "i", "c", viewOnly = true).endsWith("&viewonly=1"))
    }

    @Test fun parseDevicesMapsServerShape() {
        val json = """{"user":{"name":"nurse1","siteadmin":0},
            "groups":[{"id":"mesh//g1","name":"ER"}],
            "devices":[{"id":"node//a","name":"ER-PC1","groupId":"mesh//g1","ip":"192.168.2.40","online":true,
              "users":["ER\\nurse"],"rights":131080,"canView":true,"canControl":true,"viewOnly":false,"canFixPrinter":true},
              {"id":"node//b","name":"ER-PC2","groupId":"mesh//gone","online":false,"rights":264,
              "canView":true,"canControl":false,"viewOnly":true,"canFixPrinter":false}]}"""
        val list = ControlMessages.parseDevices(json)
        assertEquals("nurse1", list.userName)
        assertEquals(listOf(Group("mesh//g1", "ER")), list.groups)
        assertEquals(
            Device("node//a", "ER-PC1", "mesh//g1", "ER", "192.168.2.40", true, listOf("ER\\nurse"), true, true, false, true),
            list.devices[0]
        )
        val b = list.devices[1]
        assertEquals("", b.groupName); assertEquals("", b.ip); assertEquals(emptyList<String>(), b.users)
        assertTrue(b.viewOnly); assertFalse(b.canControl)
    }
}
