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
import th.sichomphu.scpremote.ui.DeviceSections.Kind
import th.sichomphu.scpremote.ui.DeviceSections.Row

/**
 * The computer list: section headings, then cards. A card connects when tapped anywhere (if the
 * account may view it and it is on); Fix printing shows its progress and result as a coloured chip.
 */
class DeviceAdapter(
    private val onConnect: (Device) -> Unit,
    private val onFix: (Device) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
    enum class FixState { BUSY, OK, FAILED }

    private var rows: List<Row> = emptyList()
    private val fixText = mutableMapOf<String, Pair<String, FixState>>()

    fun submit(list: List<Row>) { rows = list; notifyDataSetChanged() }

    fun isHeader(position: Int) = rows.getOrNull(position) is Row.Header

    fun setFix(id: String, text: String, state: FixState) {
        fixText[id] = text to state
        rows.forEachIndexed { i, r -> if (r is Row.Item && r.device.id == id) notifyItemChanged(i) }
    }

    override fun getItemCount() = rows.size
    override fun getItemViewType(position: Int) = if (rows[position] is Row.Header) 0 else 1

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == 0) Header(inflater.inflate(R.layout.item_section, parent, false))
        else Card(inflater.inflate(R.layout.item_device, parent, false))
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val row = rows[position]) {
            is Row.Header -> (holder as Header).bind(row)
            is Row.Item -> (holder as Card).bind(row.device)
        }
    }

    private class Header(v: View) : RecyclerView.ViewHolder(v) {
        private val title: TextView = v.findViewById(R.id.sectionTitle)
        fun bind(h: Row.Header) {
            val ctx = itemView.context
            title.text = ctx.getString(
                when (h.kind) { Kind.RECENT -> R.string.section_recent; Kind.ONLINE -> R.string.section_online; Kind.OFFLINE -> R.string.section_offline },
                h.count,
            )
        }
    }

    private inner class Card(v: View) : RecyclerView.ViewHolder(v) {
        val dot: View = v.findViewById(R.id.dot)
        val name: TextView = v.findViewById(R.id.name)
        val state: TextView = v.findViewById(R.id.state)
        val details: TextView = v.findViewById(R.id.details)
        val connect: Button = v.findViewById(R.id.connect)
        val fix: Button = v.findViewById(R.id.fix)
        val result: TextView = v.findViewById(R.id.result)

        fun bind(d: Device) {
            val ctx = itemView.context
            name.text = d.name
            val color = ContextCompat.getColor(ctx, if (d.online) R.color.online else R.color.offline)
            dot.backgroundTintList = ColorStateList.valueOf(color)
            state.text = ctx.getString(if (d.online) R.string.online else R.string.offline)
            state.setTextColor(color)
            details.text = listOf(d.ip, d.groupName, d.users.joinToString(", ")).filter { it.isNotBlank() }.joinToString(" · ")
            // A computer that is off is shown faded: nothing on it can be done now.
            itemView.alpha = if (d.online) 1f else 0.6f

            val canOpen = d.canView && d.online
            connect.visibility = if (d.canView) View.VISIBLE else View.GONE
            connect.text = ctx.getString(if (d.viewOnly) R.string.view_only else R.string.connect)
            connect.isEnabled = d.online
            connect.setOnClickListener { onConnect(d) }
            itemView.setOnClickListener(if (canOpen) View.OnClickListener { onConnect(d) } else null)
            itemView.isClickable = canOpen

            val fixState = fixText[d.id]
            fix.visibility = if (d.canFixPrinter) View.VISIBLE else View.GONE
            fix.isEnabled = d.online && fixState?.second != FixState.BUSY
            fix.setOnClickListener { onFix(d) }

            if (fixState == null) { result.visibility = View.GONE; return }
            val (bg, fg) = when (fixState.second) {
                FixState.BUSY -> R.color.fix_busy_bg to R.color.fix_busy_fg
                FixState.OK -> R.color.fix_ok_bg to R.color.fix_ok_fg
                FixState.FAILED -> R.color.fix_fail_bg to R.color.fix_fail_fg
            }
            result.visibility = View.VISIBLE
            result.text = fixState.first
            result.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(ctx, bg))
            result.setTextColor(ContextCompat.getColor(ctx, fg))
        }
    }
}
