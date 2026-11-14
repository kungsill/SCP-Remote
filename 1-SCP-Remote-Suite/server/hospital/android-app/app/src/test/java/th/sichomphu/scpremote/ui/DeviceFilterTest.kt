package th.sichomphu.scpremote.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import th.sichomphu.scpremote.model.Device

class DeviceFilterTest {
    private fun d(name: String, ip: String = "", group: String = "g1", groupName: String = "ER", online: Boolean = true, users: List<String> = emptyList()) =
        Device("node//$name", name, group, groupName, ip, online, users, true, true, false, true)

    private val list = listOf(
        d("ห้องยา-02", "192.168.2.51", online = false),
        d("ER-PC1", "192.168.2.40", users = listOf("ER\\nurse")),
        d("ห้องยา-01", "192.168.2.50", "g2", "ห้องยา"),
        d("OPD-PC9", "192.168.3.9", "g2", "ห้องยา", online = false),
    )
    private fun names(r: List<Device>) = r.map { it.name }

    @Test fun byIp() = assertEquals(listOf("ER-PC1"), names(DeviceFilter.apply(list, "2.40", null)))

    @Test fun byThaiName() = assertEquals(listOf("ห้องยา-01", "ห้องยา-02"), names(DeviceFilter.apply(list, "ห้องยา-0", null)))

    @Test fun byUserCaseInsensitive() = assertEquals(listOf("ER-PC1"), names(DeviceFilter.apply(list, "NURSE", null)))

    // OPD-PC9 matches only through its group's name.
    @Test fun byGroupName() = assertEquals(listOf("ห้องยา-01", "OPD-PC9", "ห้องยา-02"), names(DeviceFilter.apply(list, "ห้องยา", null)))

    @Test fun groupFilter() = assertEquals(listOf("ห้องยา-01", "OPD-PC9"), names(DeviceFilter.apply(list, "", "g2")))

    @Test fun onlineFirstThenName() =
        assertEquals(listOf("ER-PC1", "ห้องยา-01", "OPD-PC9", "ห้องยา-02"), names(DeviceFilter.apply(list, " ", null)))
}
