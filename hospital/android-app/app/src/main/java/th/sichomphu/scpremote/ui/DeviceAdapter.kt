package th.sichomphu.scpremote.ui

import android.content.Context
import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import th.sichomphu.scpremote.R
import th.sichomphu.scpremote.model.Device
import th.sichomphu.scpremote.ui.DeviceSections.Kind
import th.sichomphu.scpremote.ui.DeviceSections.Row

/**
 * The computer list: the "used recently" strip, section headings, then cards. A card connects when
 * tapped anywhere (if the account may view it and it is on); Fix printing shows its progress and
 * result as a coloured strip under the buttons.
 */
class DeviceAdapter(
    private val onConnect: (Device) -> Unit,
    private val onFix: (Device) -> Unit,
    /** ⋮ or long-press: every action for this computer. */
    private val onMore: (Device) -> Unit = {},
    private val onWake: (Device) -> Unit = {},
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
    enum class FixState { BUSY, OK, FAILED }

    private var rows: List<Row> = emptyList()
    private val fixText = mutableMapOf<String, Pair<String, FixState>>()

    fun submit(list: List<Row>) { rows = list; notifyDataSetChanged() }

    /** Rows that span every column on a tablet. */
    fun isHeader(position: Int) = rows.getOrNull(position).let { it is Row.Header || it is Row.Recent }

    fun setFix(id: String, text: String, state: FixState) {
        fixText[id] = text to state
        rows.forEachIndexed { i, r -> if (r is Row.Item && r.device.id == id) notifyItemChanged(i) }
    }

    override fun getItemCount() = rows.size
    override fun getItemViewType(position: Int) = when (rows[position]) {
        is Row.Recent -> 2
        is Row.Header -> 0
        is Row.Item -> 1
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            0 -> Header(inflater.inflate(R.layout.item_section, parent, false))
            2 -> Recent(inflater.inflate(R.layout.item_recent_strip, parent, false))
            else -> Card(inflater.inflate(R.layout.item_device, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val row = rows[position]) {
            is Row.Recent -> (holder as Recent).bind(row.devices)
            is Row.Header -> (holder as Header).bind(row)
            is Row.Item -> (holder as Card).bind(row.device)
        }
    }

    private fun color(ctx: Context, id: Int) = ContextCompat.getColor(ctx, id)

    private fun paintTile(tile: ImageView, d: Device) {
        val t = Look.tileTint(d.groupId, d.online)
        tile.backgroundTintList = ColorStateList.valueOf(color(tile.context, t.bg))
        tile.imageTintList = ColorStateList.valueOf(color(tile.context, t.icon))
    }

    private class Header(v: View) : RecyclerView.ViewHolder(v) {
        private val title: TextView = v.findViewById(R.id.sectionTitle)
        fun bind(h: Row.Header) {
            title.text = itemView.context.getString(
                when (h.kind) { Kind.ONLINE -> R.string.section_online; Kind.OFFLINE -> R.string.section_offline },
                h.count,
            )
        }
    }

    private inner class Recent(v: View) : RecyclerView.ViewHolder(v) {
        private val row: LinearLayout = v.findViewById(R.id.recentRow)
        fun bind(list: List<Device>) {
            val ctx = itemView.context
            row.removeAllViews()
            val inflater = LayoutInflater.from(ctx)
            for (d in list) {
                val card = inflater.inflate(R.layout.item_recent_card, row, false)
                paintTile(card.findViewById(R.id.tile), d)
                card.findViewById<TextView>(R.id.name).text = d.name
                val state = card.findViewById<TextView>(R.id.state)
                state.text = ctx.getString(if (d.online) R.string.online else R.string.offline)
                state.compoundDrawableTintList = ColorStateList.valueOf(color(ctx, if (d.online) R.color.online else R.color.offline))
                val canOpen = d.canView && d.online
                card.setOnClickListener { if (canOpen) onConnect(d) else onMore(d) }
                card.setOnLongClickListener { onMore(d); true }
                card.alpha = if (d.online) 1f else 0.75f
                row.addView(card)
            }
        }
    }

    private inner class Card(v: View) : RecyclerView.ViewHolder(v) {
        val tile: ImageView = v.findViewById(R.id.tile)
        val name: TextView = v.findViewById(R.id.name)
        val state: TextView = v.findViewById(R.id.state)
        val details: TextView = v.findViewById(R.id.details)
        val users: TextView = v.findViewById(R.id.users)
        val actions: View = v.findViewById(R.id.actions)
        val connect: Button = v.findViewById(R.id.connect)
        val fix: Button = v.findViewById(R.id.fix)
        val more: View = v.findViewById(R.id.cardMore)
        val spacer: View = v.findViewById(R.id.actionsSpacer)
        val result: TextView = v.findViewById(R.id.result)

        fun bind(d: Device) {
            val ctx = itemView.context
            name.text = d.name
            paintTile(tile, d)
            val fg = color(ctx, if (d.online) R.color.online else R.color.offline)
            state.text = ctx.getString(if (d.online) R.string.online else R.string.offline)
            state.setTextColor(fg)
            state.compoundDrawableTintList = ColorStateList.valueOf(fg)
            state.backgroundTintList = ColorStateList.valueOf(color(ctx, if (d.online) R.color.online_bg else R.color.offline_bg))
            details.text = listOf(d.ip, d.groupName).filter { it.isNotBlank() }.joinToString(" · ")
            val who = d.users.joinToString(", ")
            users.text = who
            users.visibility = if (who.isBlank()) View.GONE else View.VISIBLE

            val canOpen = d.canView && d.online
            // An offline computer that can be woken offers "Wake" where Connect would be.
            val wakeInstead = !d.online && d.canWake
            connect.visibility = if (d.canView || wakeInstead) View.VISIBLE else View.GONE
            spacer.visibility = if (connect.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            connect.text = ctx.getString(if (wakeInstead) R.string.wake else if (d.viewOnly) R.string.view_only else R.string.connect)
            connect.setCompoundDrawablesRelativeWithIntrinsicBounds(0, 0, if (wakeInstead) 0 else R.drawable.ic_arrow_forward, 0)
            connect.isEnabled = d.online || wakeInstead
            connect.setOnClickListener { if (wakeInstead) onWake(d) else onConnect(d) }
            itemView.setOnClickListener(if (canOpen) View.OnClickListener { onConnect(d) } else null)
            itemView.isClickable = canOpen
            itemView.setOnLongClickListener { onMore(d); true }
            more.setOnClickListener { onMore(d) }
            // A computer that can be woken stays fully visible so the button reads as usable.
            itemView.alpha = if (d.online || wakeInstead) 1f else 0.7f

            val fixState = fixText[d.id]
            fix.visibility = if (d.canFixPrinter) View.VISIBLE else View.GONE
            fix.isEnabled = d.online && fixState?.second != FixState.BUSY
            fix.alpha = if (fix.isEnabled) 1f else 0.5f
            fix.setOnClickListener { onFix(d) }
            // Nothing to press (off, cannot be woken, no fix): keep the card compact; long-press still works.
            actions.visibility = if (connect.visibility == View.VISIBLE || fix.visibility == View.VISIBLE) View.VISIBLE else View.GONE

            if (fixState == null) { result.visibility = View.GONE; return }
            val (bg, text) = when (fixState.second) {
                FixState.BUSY -> R.color.fix_busy_bg to R.color.fix_busy_fg
                FixState.OK -> R.color.fix_ok_bg to R.color.fix_ok_fg
                FixState.FAILED -> R.color.fix_fail_bg to R.color.fix_fail_fg
            }
            result.visibility = View.VISIBLE
            result.text = fixState.first
            result.backgroundTintList = ColorStateList.valueOf(color(ctx, bg))
            result.setTextColor(color(ctx, text))
        }
    }
}
