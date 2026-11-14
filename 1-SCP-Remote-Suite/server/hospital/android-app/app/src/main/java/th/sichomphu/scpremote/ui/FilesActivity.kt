package th.sichomphu.scpremote.ui

import android.content.res.ColorStateList
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.format.Formatter
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.progressindicator.LinearProgressIndicator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.data.AppSession
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.net.FileTransfer
import th.sichomphu.scpremote.net.FilesSession

/**
 * The computer's files: browse folders, tap a file to save it on the phone, or send a file from
 * the phone into the folder shown. Uses MeshCentral's own file channel, so the server records it.
 */
class FilesActivity : AppCompatActivity() {
    private lateinit var device: Device
    private var session: FilesSession? = null
    private var path = ""
    private var busy = false
    private lateinit var status: TextView
    private lateinit var pathText: TextView
    private lateinit var progress: LinearProgressIndicator
    private lateinit var progressText: TextView
    private lateinit var upload: MaterialButton
    private val adapter = Entries()
    /** The file waiting for the phone to say where to save it. */
    private var pendingDownload: FileTransfer.Entry? = null

    private val saveTo = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val e = pendingDownload ?: return@registerForActivityResult
        pendingDownload = null
        if (uri != null) download(e, uri)
    }
    private val pickFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) upload(uri) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra(EXTRA_DEVICE_ID)
        val found = AppSession.devices?.devices?.firstOrNull { it.id == id }
        if (AppSession.channel == null || found == null) { finish(); return }
        device = found
        setContentView(R.layout.activity_files)
        findViewById<View>(R.id.header).padForSystemBars(top = true, bottom = false)
        findViewById<View>(R.id.root).padForSystemBars(top = false, bottom = true)
        status = findViewById(R.id.status); pathText = findViewById(R.id.path)
        progress = findViewById(R.id.progress); progressText = findViewById(R.id.progressText); upload = findViewById(R.id.upload)
        findViewById<TextView>(R.id.title).text = getString(R.string.files_title, device.name)
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        findViewById<RecyclerView>(R.id.list).apply { layoutManager = LinearLayoutManager(this@FilesActivity); adapter = this@FilesActivity.adapter }
        upload.setOnClickListener { pickFile.launch(arrayOf("*/*")) }
        upload.isEnabled = false
        setUpPlaces()
        open()
    }

    override fun onDestroy() {
        super.onDestroy()
        session?.close()
    }

    /** The signed-in Windows user's folders, from the user name the agent reports (DOMAIN\name). */
    private fun home(): String? = device.users.firstOrNull()?.substringAfterLast('\\')?.takeIf { it.isNotBlank() }?.let { "C:\\Users\\$it" }

    private fun setUpPlaces() {
        val group = findViewById<ChipGroup>(R.id.places)
        fun place(label: String, target: String) = group.addView(Chip(this).apply { text = label; setOnClickListener { list(target) } })
        home()?.let { h ->
            place(getString(R.string.place_desktop), "$h\\Desktop")
            place(getString(R.string.place_downloads), "$h\\Downloads")
            place(getString(R.string.place_documents), "$h\\Documents")
        }
        place(getString(R.string.place_drives), "")
    }

    private fun open() {
        val channel = AppSession.channel ?: return finish()
        val trust = AppSession.trust ?: return finish()
        status.text = getString(R.string.files_opening)
        lifecycleScope.launch {
            val s = AppSession.relayOpener?.let { FilesSession(channel, trust, device, AppSession.server, it) }
                ?: FilesSession(channel, trust, device, AppSession.server)
            session = s
            try {
                s.open()
                list(home()?.let { "$it\\Desktop" } ?: "")
            } catch (e: Exception) {
                android.util.Log.w("SCP-Files", "open failed", e)
                status.text = getString(if (e.message == "REFUSED") R.string.files_refused else R.string.files_failed)
            }
        }
    }

    private fun list(target: String) {
        val s = session ?: return
        if (busy) return
        lifecycleScope.launch {
            status.text = getString(R.string.loading)
            try {
                val l = s.transfer.ls(target)
                path = l.path
                pathText.text = if (path.isEmpty()) getString(R.string.place_drives) else path
                adapter.submit(path.isNotEmpty(), l.entries)
                status.text = if (l.entries.isEmpty()) getString(R.string.files_empty) else getString(R.string.files_count, l.entries.size)
                upload.isEnabled = path.isNotEmpty()
            } catch (e: Exception) {
                android.util.Log.w("SCP-Files", "list failed", e)
                status.text = getString(R.string.files_failed)
            }
        }
    }

    private fun download(e: FileTransfer.Entry, uri: Uri) {
        val s = session ?: return
        val remote = FileTransfer.join(path, e.name)
        transfer(getString(R.string.files_downloading, e.name), e.size) { report ->
            withContext(Dispatchers.IO) {
                contentResolver.openOutputStream(uri)?.use { out -> s.transfer.download(remote, out, report) } ?: throw FileTransfer.TransferError("CANNOT_SAVE")
            }
            getString(R.string.files_downloaded, e.name)
        }
    }

    private fun upload(uri: Uri) {
        val s = session ?: return
        var name = "file"; var size = -1L
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst()) { name = c.getString(0) ?: name; size = if (c.isNull(1)) -1 else c.getLong(1) }
        }
        val dir = path
        transfer(getString(R.string.files_uploading, name), size) { report ->
            withContext(Dispatchers.IO) {
                contentResolver.openInputStream(uri)?.use { input -> s.transfer.upload(dir, name, input, size.coerceAtLeast(0), report) } ?: throw FileTransfer.TransferError("CANNOT_READ")
            }
            list(dir)
            getString(R.string.files_uploaded, name, dir)
        }
    }

    /** Runs one transfer with a progress bar; [work] returns the message shown when it is done. */
    private fun transfer(label: String, size: Long, work: suspend ((Long) -> Unit) -> String) {
        if (busy) return
        busy = true
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        progress.visibility = View.VISIBLE; progressText.visibility = View.VISIBLE
        progress.isIndeterminate = size <= 0
        progressText.text = label
        upload.isEnabled = false
        val report: (Long) -> Unit = { n ->
            runOnUiThread {
                if (size > 0) progress.setProgressCompat((n * 100 / size).toInt().coerceIn(0, 100), true)
                progressText.text = label + " · " + Formatter.formatShortFileSize(this, n) + if (size > 0) " / " + Formatter.formatShortFileSize(this, size) else ""
            }
        }
        lifecycleScope.launch {
            val message = try { work(report) } catch (e: Exception) { getString(R.string.files_transfer_failed) }
            busy = false
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            progress.visibility = View.GONE; progressText.visibility = View.GONE
            upload.isEnabled = path.isNotEmpty()
            Toast.makeText(this@FilesActivity, message, Toast.LENGTH_LONG).show()
        }
    }

    private fun open(e: FileTransfer.Entry?) {
        if (busy) return
        when {
            e == null -> list(FileTransfer.parent(path))
            e.isFolder -> list(FileTransfer.join(path, e.name))
            else -> { pendingDownload = e; saveTo.launch(e.name) }
        }
    }

    /** Folder rows (with "up" first when inside a folder), then files. */
    private inner class Entries : RecyclerView.Adapter<Entries.Row>() {
        private var up = false
        private var items: List<FileTransfer.Entry> = emptyList()

        fun submit(showUp: Boolean, list: List<FileTransfer.Entry>) { up = showUp; items = list; notifyDataSetChanged() }

        override fun getItemCount() = items.size + if (up) 1 else 0
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = Row(LayoutInflater.from(parent.context).inflate(R.layout.item_file, parent, false))

        override fun onBindViewHolder(h: Row, position: Int) {
            val e = if (up) items.getOrNull(position - 1) else items[position]
            val ctx = h.itemView.context
            if (e == null) {
                h.icon.setImageResource(R.drawable.ic_arrow_back); h.name.text = ctx.getString(R.string.files_up); h.detail.text = FileTransfer.parent(path).ifEmpty { ctx.getString(R.string.place_drives) }
            } else {
                h.icon.setImageResource(if (e.isDrive) R.drawable.ic_drive else if (e.isFolder) R.drawable.ic_folder else R.drawable.ic_file)
                h.name.text = e.name
                h.detail.text = when {
                    e.isDrive -> ""
                    e.isFolder -> e.modified.take(10)
                    else -> Formatter.formatShortFileSize(ctx, e.size) + " · " + e.modified.take(10)
                }
            }
            h.icon.imageTintList = ColorStateList.valueOf(ContextCompat.getColor(ctx, if (e == null || e.isFolder) R.color.accent else R.color.text_muted))
            h.itemView.setOnClickListener { open(e) }
        }

        inner class Row(v: View) : RecyclerView.ViewHolder(v) {
            val icon: ImageView = v.findViewById(R.id.icon)
            val name: TextView = v.findViewById(R.id.name)
            val detail: TextView = v.findViewById(R.id.detail)
        }
    }

    companion object { const val EXTRA_DEVICE_ID = "deviceId" }
}
