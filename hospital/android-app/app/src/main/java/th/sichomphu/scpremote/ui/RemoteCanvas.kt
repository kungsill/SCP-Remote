package th.sichomphu.scpremote.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Point
import android.text.InputType
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import th.sichomphu.scpremote.input.KeyboardBridge
import th.sichomphu.scpremote.input.SpecialKey

/**
 * The remote screen: a bitmap the size of the remote desktop, tiles drawn into it as they arrive
 * (from any thread), shown fitted to the view with zoom 1×–4× and pan.
 */
class RemoteCanvas @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val lock = Any()
    private var screen: Bitmap? = null
    private var screenCanvas: Canvas? = null
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val matrix = Matrix()
    private val decodeOptions = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }

    /** 1 = whole screen fitted to the view. */
    var zoom = 1f; private set
    private var panX = 0f
    private var panY = 0f

    val remoteWidth get() = synchronized(lock) { screen?.width ?: 0 }
    val remoteHeight get() = synchronized(lock) { screen?.height ?: 0 }

    /** Called when the remote screen size becomes known or changes (UI thread). */
    var onScreenSize: ((Int, Int) -> Unit)? = null

    /** A new remote screen size: starts a fresh black picture. Safe from any thread. */
    fun setScreenSize(w: Int, h: Int) {
        if (w <= 0 || h <= 0) return
        synchronized(lock) {
            if (screen?.width == w && screen?.height == h) return
            val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            b.eraseColor(Color.BLACK)
            screen = b; screenCanvas = Canvas(b)
        }
        post { clampPan(); invalidate(); onScreenSize?.invoke(w, h) }
    }

    /** Decodes a tile (PNG/JPEG/WebP) and draws it at (x, y). Safe from any thread. */
    fun drawTile(x: Int, y: Int, image: ByteArray) {
        val tile = BitmapFactory.decodeByteArray(image, 0, image.size, decodeOptions) ?: return
        synchronized(lock) { screenCanvas?.drawBitmap(tile, x.toFloat(), y.toFloat(), null) }
        tile.recycle()
        postInvalidateOnAnimation()
    }

    private fun fitScale(): Float {
        val b = screen ?: return 1f
        if (width == 0 || height == 0) return 1f
        return minOf(width.toFloat() / b.width, height.toFloat() / b.height)
    }

    private fun scale() = fitScale() * zoom

    /** Top-left of the picture in view coordinates. */
    private fun origin(): Pair<Float, Float> {
        val b = screen ?: return 0f to 0f
        val s = scale()
        val w = b.width * s; val h = b.height * s
        val x = if (w <= width) (width - w) / 2 else panX
        // Spare height (a phone held upright): the picture sits just under the toolbar, leaving the
        // room below for the key bar and the phone keyboard. Otherwise it is centred.
        val y = if (h > height) panY else if (height - h >= topInset) topInset else (height - h) / 2
        return x to y
    }

    /** Space kept free above the picture when there is room for it (the toolbar's height). */
    var topInset = 0f
        set(v) { field = v; invalidate() }

    private fun clampPan() {
        val b = screen ?: return
        val s = scale()
        panX = panX.coerceIn(minOf(0f, width - b.width * s), 0f)
        panY = panY.coerceIn(minOf(0f, height - b.height * s), 0f)
    }

    /** Zooms by [factor] keeping the point under (fx, fy) in place. */
    fun zoomBy(factor: Float, fx: Float, fy: Float) {
        val b = synchronized(lock) { screen } ?: return
        val before = scale()
        val (ox, oy) = origin()
        val rx = (fx - ox) / before; val ry = (fy - oy) / before
        zoom = (zoom * factor).coerceIn(1f, 4f)
        val after = scale()
        panX = fx - rx * after; panY = fy - ry * after
        clampPan()
        if (b.width * after <= width) panX = 0f
        invalidate()
    }

    fun panBy(dx: Float, dy: Float) {
        val (ox, oy) = origin()
        panX = ox + dx; panY = oy + dy
        clampPan(); invalidate()
    }

    /** Keeps the remote point (rx, ry) on screen when zoomed (the touchpad cursor follows). */
    fun keepVisible(rx: Int, ry: Int, margin: Float = 48f) {
        if (zoom <= 1f) return
        val s = scale()
        val (ox, oy) = origin()
        val vx = ox + rx * s; val vy = oy + ry * s
        var dx = 0f; var dy = 0f
        if (vx < margin) dx = margin - vx else if (vx > width - margin) dx = width - margin - vx
        if (vy < margin) dy = margin - vy else if (vy > height - margin) dy = height - margin - vy
        if (dx != 0f || dy != 0f) panBy(dx, dy)
    }

    /** The remote pixel under the view point (x, y), clamped to the remote screen. */
    fun viewToRemote(x: Float, y: Float): Point {
        val b = synchronized(lock) { screen } ?: return Point(0, 0)
        val s = scale()
        val (ox, oy) = origin()
        val rx = ((x - ox) / s).toInt().coerceIn(0, b.width - 1)
        val ry = ((y - oy) / s).toInt().coerceIn(0, b.height - 1)
        return Point(rx, ry)
    }

    /** Remote pixel → view point (for drawing the touchpad cursor). */
    fun remoteToView(rx: Int, ry: Int): Pair<Float, Float> {
        val s = scale()
        val (ox, oy) = origin()
        return (ox + rx * s) to (oy + ry * s)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        clampPan()
    }

    override fun onDraw(canvas: Canvas) {
        synchronized(lock) {
            val b = screen ?: return
            val s = scale()
            val (ox, oy) = origin()
            matrix.setScale(s, s)
            matrix.postTranslate(ox, oy)
            paint.isFilterBitmap = s != 1f
            canvas.drawBitmap(b, matrix, paint)
        }
        afterDraw?.invoke(canvas)
    }

    /** Extra drawing over the picture (the touchpad cursor). */
    var afterDraw: ((Canvas) -> Unit)? = null

    /** Where the phone keyboard's typing goes; null = no keyboard (view-only). */
    var keyboard: KeyboardBridge? = null

    override fun onCheckIsTextEditor() = keyboard != null

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val k = keyboard ?: return null
        outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN or EditorInfo.IME_ACTION_NONE
        outAttrs.initialSelStart = k.cursor
        outAttrs.initialSelEnd = k.cursor
        // The keyboard sees the text this app typed (KeyboardBridge remembers it): Samsung Keyboard
        // checks Thai order against it and drops an above/below mark when it sees no consonant.
        return object : BaseInputConnection(this, false) {
            override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean { text?.let(k::commitText); report(k); return true }
            override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean { k.setComposingText(text ?: ""); report(k); return true }
            override fun setComposingRegion(start: Int, end: Int): Boolean { k.setComposingRegion(minOf(start, end), maxOf(start, end)); report(k); return true }
            override fun finishComposingText(): Boolean { k.finishComposing(); report(k); return true }
            override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
                k.delete(beforeLength)
                repeat(afterLength) { k.special(SpecialKey.DELETE) }
                report(k)
                return true
            }
            override fun getTextBeforeCursor(n: Int, flags: Int): CharSequence = k.textBeforeCursor(n)
            override fun getTextAfterCursor(n: Int, flags: Int): CharSequence = ""
            override fun getSelectedText(flags: Int): CharSequence? = null
            override fun getExtractedText(request: android.view.inputmethod.ExtractedTextRequest?, flags: Int) =
                android.view.inputmethod.ExtractedText().apply {
                    text = k.textBeforeCursor(k.cursor); startOffset = 0; selectionStart = k.cursor; selectionEnd = k.cursor
                }
            override fun sendKeyEvent(event: KeyEvent): Boolean { if (event.action == KeyEvent.ACTION_DOWN) keyDown(k, event); report(k); return true }
        }
    }

    /** Tells the keyboard where the cursor and the composing text are now. */
    private fun report(k: KeyboardBridge) {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager ?: return
        val c = k.cursor
        val composing = k.composingLength
        imm.updateSelection(this, c, c, if (composing > 0) c - composing else -1, if (composing > 0) c else -1)
    }

    /** A click moved the computer's cursor: the keyboard starts from an empty line again. */
    fun keyboardContextMoved() {
        val k = keyboard ?: return
        if (k.cursor == 0) return
        k.clearContext()
        (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager)?.restartInput(this)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val k = keyboard ?: return super.onKeyDown(keyCode, event)
        if (keyCode == KeyEvent.KEYCODE_BACK) return super.onKeyDown(keyCode, event)
        return keyDown(k, event) || super.onKeyDown(keyCode, event)
    }

    /** Keys the phone keyboard (or a Bluetooth keyboard) sends as key events rather than text. */
    private fun keyDown(k: KeyboardBridge, e: KeyEvent): Boolean {
        val special = when (e.keyCode) {
            KeyEvent.KEYCODE_DEL -> SpecialKey.BACKSPACE
            KeyEvent.KEYCODE_FORWARD_DEL -> SpecialKey.DELETE
            KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> SpecialKey.ENTER
            KeyEvent.KEYCODE_TAB -> SpecialKey.TAB
            KeyEvent.KEYCODE_ESCAPE -> SpecialKey.ESC
            KeyEvent.KEYCODE_DPAD_LEFT -> SpecialKey.LEFT
            KeyEvent.KEYCODE_DPAD_RIGHT -> SpecialKey.RIGHT
            KeyEvent.KEYCODE_DPAD_UP -> SpecialKey.UP
            KeyEvent.KEYCODE_DPAD_DOWN -> SpecialKey.DOWN
            KeyEvent.KEYCODE_MOVE_HOME -> SpecialKey.HOME
            KeyEvent.KEYCODE_MOVE_END -> SpecialKey.END
            else -> null
        }
        if (special != null) { k.special(special); return true }
        val ch = e.unicodeChar
        if (ch != 0) { k.commitText(String(Character.toChars(ch))); return true }
        return false
    }
}
