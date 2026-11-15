package th.sichomphu.scpremote.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import th.sichomphu.scpremote.R

class FileBadgeTest {
    private fun b(name: String, folder: Boolean = false, drive: Boolean = false) = Look.fileBadge(name, folder, drive)

    @Test fun drivesAndFoldersUseIcons() {
        assertEquals(Look.Badge(null, R.drawable.ic_drive, Look.Tint.CYAN), b("C:", drive = true))
        assertEquals(Look.Badge(null, R.drawable.ic_folder, Look.Tint.AMBER), b("รูปภาพ", folder = true))
        // A folder named like a file is still a folder.
        assertEquals(Look.Badge(null, R.drawable.ic_folder, Look.Tint.AMBER), b("old.pdf", folder = true))
    }

    @Test fun officeAndPdfGetALabelledColour() {
        assertEquals(Look.Badge("PDF", null, Look.Tint.RED), b("ใบสั่งยา-14-11.pdf"))
        assertEquals(Look.Badge("XLS", null, Look.Tint.GREEN), b("รายงานเวร.XLSX"))
        assertEquals(Look.Badge("XLS", null, Look.Tint.GREEN), b("data.csv"))
        assertEquals(Look.Badge("DOC", null, Look.Tint.BLUE), b("บันทึก.docx"))
        assertEquals(Look.Badge("PPT", null, Look.Tint.PINK), b("slides.pptx"))
        assertEquals(Look.Badge("ZIP", null, Look.Tint.GRAY), b("backup.7z"))
    }

    @Test fun picturesUseThePictureIcon() = assertEquals(Look.Badge(null, R.drawable.ic_image, Look.Tint.VIOLET), b("scan-01.JPG"))

    @Test fun anythingElseIsAPlainFile() {
        assertEquals(Look.Badge(null, R.drawable.ic_file, Look.Tint.GRAY), b("notes.txt"))
        assertEquals(Look.Badge(null, R.drawable.ic_file, Look.Tint.GRAY), b("README"))
        assertEquals(Look.Badge(null, R.drawable.ic_file, Look.Tint.GRAY), b(".pdf.bak"))
    }
}
