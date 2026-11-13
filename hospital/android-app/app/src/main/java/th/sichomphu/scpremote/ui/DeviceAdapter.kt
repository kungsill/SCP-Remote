package th.sichomphu.scpremote.ui

import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.model.Device

/** Computer cards: status, details, Connect (if allowed) and Fix printing (if allowed). */
class DeviceAdapter(
    private val onConnect: (Device) -> Unit,
    private val onFix: (Device) -> Unit,
) : RecyclerView.Adapter<DeviceAdapter.Holder>() {
    private var items: List<Device> = emptyList()
    /** Printer-fix progress or result per device id, shown under the card. */
    private val fixText = mutableMapOf<String, String>()
    private val fixBusy = mutableSetOf<String>()

    fun submit(list: List<Device>) { items = list; notifyDataSetChanged() }

    fun setFix(id: String, text: String, busy: Boolean) {
        fixText[id] = text
        if (busy) fixBusy.add(id) else fixBusy.remove(id)
        val i = items.indexOfFirst { it.id == id }
        if (i >= 0) notifyItemChanged(i)
    }

    override fun getItemCount() = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_device, parent, false))

    override fun onBindViewHolder(h: Holder, position: Int) {
        val d = items[position]
        val ctx = h.itemView.context
        h.name.text = d.name
        val color = ContextCompat.getColor(ctx, if (d.online) R.color.online else R.color.offline)
        h.dot.backgroundTintList = ColorStateList.valueOf(color)
        h.state.text = ctx.getString(if (d.online) R.string.online else R.string.offline)
        h.state.setTextColor(color)
        h.details.text = listOf(d.ip, d.groupName, d.users.joinToString(", ")).filter { it.isNotBlank() }.joinToString(" · ")

        h.connect.visibility = if (d.canView) View.VISIBLE else View.GONE
        h.connect.text = ctx.getString(if (d.viewOnly) R.string.view_only else R.string.connect)
        h.connect.isEnabled = d.online
        h.connect.setOnClickListener { onConnect(d) }

        h.fix.visibility = if (d.canFixPrinter) View.VISIBLE else View.GONE
        h.fix.isEnabled = d.online && d.id !in fixBusy
        h.fix.setOnClickListener { onFix(d) }

        val text = fixText[d.id]
        h.result.visibility = if (text == null) View.GONE else View.VISIBLE
        h.result.text = text
    }

    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val dot: View = v.findViewById(R.id.dot)
        val name: TextView = v.findViewById(R.id.name)
        val state: TextView = v.findViewById(R.id.state)
        val details: TextView = v.findViewById(R.id.details)
        val connect: Button = v.findViewById(R.id.connect)
        val fix: Button = v.findViewById(R.id.fix)
        val result: TextView = v.findViewById(R.id.result)
    }
}
