# SCP-Remote Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Android app (APK) that signs in with an SCP-Remote account, lists the computers that account may see, remotes them with touch-friendly mouse and keyboard, and fixes printing — all limited by the account's rights on the server.

**Architecture:** A pure-Kotlin `protocol` package (no Android imports, JVM-unit-tested) encodes and decodes MeshCentral's control and desktop messages. A `net` package wraps them in OkHttp WebSockets (control channel, relay session) with certificate pinning, keep-alive and reconnect. Android screens (`ui`) sit on top. Two new server operations supply devices-with-rights and the printer fix.

**Tech Stack:** Kotlin 2.1.20, Android Gradle Plugin 8.9.1, Gradle 8.13 (wrapper), compileSdk/targetSdk 36, minSdk 26, OkHttp 4.12.0, AndroidX (appcompat 1.7.0, recyclerview 1.4.0, security-crypto 1.1.0-alpha06), JUnit 4.13.2. Server side: Node (existing `node --test`).

**Spec:** `docs/superpowers/specs/2026-11-14-scp-remote-android-design.md`

## Global Constraints

- App lives in `hospital/android-app/`; package `th.sichomphu.scpremote`; app name `SCP-Remote`; UI Thai first, English when the phone is English.
- Default server `https://192.168.2.25:8443`; LAN pin = `certificateSha256` from `hospital/desktop-app/server.json` (copied into `app/src/main/res/raw/server.json` at build).
- Hostnames that are IPv4 literals are pinned; DNS names use the platform trust store.
- Remote picture never uses a WebView.
- Rights come only from the server (`appDevices`); the app never computes rights from mesh links.
- Quality ladder (`SendCompressionLevel` type, quality, scaling, frametimer), index 0..3: `[2,100,1024,50] [4,100,1024,50] [4,70,1024,100] [4,45,1024,200]`; phones default to index 2.
- Keep-alive: `{"ctrlChannel":102938,"type":"rtt","time":<ms>}` every 10 000 ms for the whole session.
- Reconnect delays after a drop of a session that had a picture: 2 000, 5 000, 10 000 ms; never after user disconnect, refusal (`console` msgid 2), or leaving the remote screen.
- Backgrounded longer than 30 000 ms → session closed.
- Printer fix asks first, naming computer, IP and department; Cancel is the default button.
- Server files edited keep the `SCP-Remote:` comment rule; server tests run with `npm run test:hospital`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rotating the phone mid-session** must not drop or restart the session (RemoteActivity handles `orientation|screenSize|screenLayout|keyboardHidden` config changes itself). → test in Task 7.
2. **Server certificate changed / wrong pin** must stop before any credential is sent, with the message "ใบรับรองเซิร์ฟเวอร์ไม่ตรง". → test in Task 4.
3. **View-only account** must never put input bytes on the wire even if the UI is poked. → test in Task 8.
4. **Thai typing with an IME that composes** (committed text arrives as a string, sometimes with deletions) must send each committed code point once and Backspace for deletions. → test in Task 8.
5. **Remote with several monitors** (display list with 65535 = all) must show the selected display and switch without reconnecting. → test in Task 9.

---

### Task 1: Server operations `appDevices` and `fixPrinter`

**Files:**
- Modify: `hospital/operations.js` (add two ops before `mapPlacements`)
- Test: `hospital/tests/app-ops.test.js`

**Interfaces:**
- Produces (over the control channel, `{action:'scpops', tag, op, ...}` → `{action:'scpops', tag, result|error}`):
  - `op:'appDevices'` → `{ user:{name, siteadmin}, groups:[{id,name}], devices:[{id, name, groupId, ip, online:boolean, users:[string], rights:number, canView, canControl, viewOnly, canFixPrinter}] }`
  - `op:'fixPrinter', nodeid` → `{ok, before, after, spooler}` or error `ACCESS_DENIED | NOT_ONLINE | NO_ANSWER | COMMAND_BUSY | NO_RESULT`

- [ ] **Step 1: Write the failing tests** in `hospital/tests/app-ops.test.js` using the `setup()` pattern from `hospital/tests/records.test.js`, with `parent.GetNodeWithRights` returning per-node rights and `parent.webserver = { wsagents: {...} }` (or whatever `mobile.run` reads — see `hospital/mobile.js` `exports.run(web, nodeid, by, from)`):
  - `appDevices lists only computers the account may see, with rights-derived flags`: rights 8 → canControl true, viewOnly false, canFixPrinter false; rights 8|256 → viewOnly true; rights 8|0x20000 → canFixPrinter true; rights 0x10000|8 → canView false; hidden node absent.
  - `fixPrinter refuses without REMOTECOMMAND`: rejects `/ACCESS_DENIED/`, no agent send.
  - `fixPrinter runs the server's fixed command for an allowed computer`: agent `send` receives `action:'runcommands'`, `responseid` starting `scpmfix`; resolving via `mobile.receive(nodeid, {responseid, result:'SCP_FIX:{"ok":true,"before":2,"after":0,"spooler":"Running"}'})` yields `{ok:true,before:2,after:0,spooler:'Running'}`.
- [ ] **Step 2: Run** `node --test hospital/tests/app-ops.test.js` → FAIL (`UNKNOWN_OPERATION`).
- [ ] **Step 3: Implement** both ops in `hospital/operations.js`. `appDevices`: read `node` rows for `domain.id`, for each call `GetNodeWithRights(domain, user, id, cb)`; skip invisible; `online` = agent present and `authenticated === 2` in `parent.wsagents` (the same test `hospital/mobile.js` uses); flags: `canView = (r===0xFFFFFFFF) || ((r & 8) && !(r & 0x10000))`, `viewOnly = r!==0xFFFFFFFF && (r & 256)!==0`, `canControl = canView && !viewOnly`, `canFixPrinter = r===0xFFFFFFFF || (r & 0x20000)!==0`; groups from `mesh` rows of visible devices. `fixPrinter`: rights check first (`REMOTECOMMAND` or full), then `return require('./mobile').run(<web>, nodeid, user._id, 'app')` — `<web>` is the object `mobile.run` expects (`wsagents`, `db`); pass `{ wsagents: parent.wsagents, db }` and confirm against `mobile.js`.
- [ ] **Step 4: Run** `npm run test:hospital` → all PASS.
- [ ] **Step 5: Commit** `feat(server): appDevices and fixPrinter operations for the Android app`. (Restart is done once, in Task 10.)

### Task 2: Android project and KVM message encoder

**Files:**
- Create: `hospital/android-app/{settings.gradle.kts, build.gradle.kts, gradle.properties, gradlew, gradlew.bat, gradle/wrapper/*}`, `hospital/android-app/app/build.gradle.kts`, `app/src/main/AndroidManifest.xml`, `app/src/main/java/th/sichomphu/scpremote/protocol/KvmMessages.kt`
- Modify: `.gitignore` (add `hospital/android-app/**/build/`, `hospital/android-app/.gradle/`, `hospital/android-app/local.properties`, `hospital/android-app/*.jks`, `hospital/android-app/keystore.properties`)
- Test: `app/src/test/java/th/sichomphu/scpremote/protocol/KvmMessagesTest.kt`

**Interfaces:**
- Produces `object KvmMessages` (all return `ByteArray`, big-endian shorts):
  - `mouse(action: MouseAction, button: Int, x: Int, y: Int)` — `MouseAction { MOVE, DOWN, UP, DBLCLICK }`; buttons `LEFT=0x02, RIGHT=0x08, MIDDLE=0x20`; layout `00 02 00 0A 00 <btnByte> xH xL yH yL`, btnByte = button on DOWN, (button*2)&0xFF on UP, 0 on MOVE, 0x88 on DBLCLICK.
  - `scroll(x: Int, y: Int, delta: Int)` — `00 02 00 0C 00 00 xH xL yH yL dH dL` (negative delta as in `agent-desktop-0.0.2.js` line ~621).
  - `key(down: Boolean, vk: Int, extended: Boolean = false)` — `00 01 00 06 <up> <vk>` where up = 0 down / 1 up, extended → 4 down / 3 up.
  - `unicode(down: Boolean, codeUnit: Int)` — `00 55 00 07 <0|1> hi lo`.
  - `ctrlAltDel()` `00 0A 00 04` · `refresh()` `00 06 00 04` · `compression(type, quality, scaling, frameMs)` `00 05 00 0A type quality sH sL fH fL` · `getDisplays()` `00 0B 00 04` · `setDisplay(n)` `00 0C 00 06 nH nL` · `pause(on)` `00 08 00 05 <1|0>` · `touchInitAck()` `00 0E 00 04`.
  - `rtt(nowMs: Long): String` = `{"ctrlChannel":102938,"type":"rtt","time":<nowMs>}`.

- [ ] **Step 1: Create the Gradle project** (wrapper 8.13, AGP 8.9.1, Kotlin 2.1.20, namespace/applicationId `th.sichomphu.scpremote`, minSdk 26, compile/target 36, `testImplementation("junit:junit:4.13.2")`, `implementation("com.squareup.okhttp3:okhttp:4.12.0")`, AndroidX deps from Tech Stack). Manifest: `INTERNET`, `REQUEST_INSTALL_PACKAGES` permissions; `android:usesCleartextTraffic="false"`.
- [ ] **Step 2: Run** `./gradlew :app:assembleDebug` from `hospital/android-app` → BUILD SUCCESSFUL (empty app). Set `sdk.dir` in `local.properties` to `%LOCALAPPDATA%\Android\Sdk` and `JAVA_HOME` to `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot` if needed.
- [ ] **Step 3: Write failing tests** `KvmMessagesTest`: one assertion per message with exact bytes, e.g. `mouse(DOWN, LEFT, 300, 2)` = `00 02 00 0A 00 02 01 2C 00 02`; `mouse(UP, RIGHT, 1, 1)` byte 5 = `0x10`; `unicode(true, 0x0E01)` = `00 55 00 07 00 0E 01`; `key(false, 0x5B, extended=true)` byte 4 = `3`; `scroll(10,10,-120)` last two bytes `FF 87`; `compression(2,100,1024,50)` = `00 05 00 0A 02 64 04 00 00 32`; `rtt(5)` exact string.
- [ ] **Step 4: Run** `./gradlew :app:testDebugUnitTest --tests '*KvmMessagesTest'` → FAIL.
- [ ] **Step 5: Implement** `KvmMessages.kt` (pure Kotlin).
- [ ] **Step 6: Run** the test → PASS.
- [ ] **Step 7: Commit** `feat(android): project and KVM message encoder`.

### Task 3: Incoming desktop frame parser

**Files:**
- Create: `app/src/main/java/th/sichomphu/scpremote/protocol/KvmFramer.kt`
- Test: `app/src/test/java/th/sichomphu/scpremote/protocol/KvmFramerTest.kt`

**Interfaces:**
- Produces `class KvmFramer(private val onCommand: (KvmCommand) -> Unit) { fun feed(chunk: ByteArray) }`
- `sealed class KvmCommand`: `Tile(x:Int, y:Int, image:ByteArray)` (cmd 3, image = bytes from offset 8), `ScreenSize(w:Int, h:Int)` (cmd 7, from bytes 4..7), `Displays(list:List<Int>, selected:Int)` (cmd 11, per `agent-desktop-0.0.2.js` lines ~257-266), `KeyState(bits:Int)` (cmd 18), `Alert(text:String)` (cmd 65), `TouchEnabled` (cmd 14), `Other(cmd:Int)`.
- Framing rules (from `agent-redir-ws-0.1.1.js` lines ~215-245): ignore chunks < 4 bytes when not accumulating; `cmd = b0<<8|b1`, `size = b2<<8|b3`; if `cmd==27 && size==8` then real `cmd = b8<<8|b9`, `size = b5<<16|b6<<8|b7`, drop first 8 bytes; if `size != chunk.size` start accumulating until `size` bytes collected, then emit.

- [ ] **Step 1: Write failing tests**: single tile chunk → one `Tile` with x/y and image bytes; screen size `00 07 00 08 07 80 04 38` → `ScreenSize(1920,1080)`; jumbo `00 1B 00 08 00 01 00 0A 00 03 ...` → `Tile` of declared size; a tile split across three chunks → exactly one `Tile` after the third; displays `00 0B 00 0C 00 02 00 01 00 02 FF FF ...` per the JS layout → `Displays([1,2],selected)`; a 2-byte chunk → nothing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(android): desktop frame parser with jumbo and split frames`.

### Task 4: Control channel, sign-in and certificate pinning

**Files:**
- Create: `net/PinnedTrust.kt`, `net/ControlChannel.kt`, `protocol/ControlMessages.kt`, `model/Device.kt`, `res/raw/server.json` (copy of `hospital/desktop-app/server.json`)
- Test: `protocol/ControlMessagesTest.kt`, `net/PinnedTrustTest.kt`

**Interfaces:**
- `object ControlMessages`: `authHeader(user:String, pass:String): String` (= base64(user)+","+base64(pass), NO_WRAP); `scpops(tag:Int, op:String, extra: Map<String,Any?> = emptyMap()): String`; `authCookieRequest(): String` (`{"action":"authcookie"}`); `tunnelRequest(nodeId:String, tunnelId:String, rauth:String, viewOnly:Boolean): String`; `relayUrl(base:String, nodeId:String, tunnelId:String, auth:String, viewOnly:Boolean): String` (`wss://…/meshrelay.ashx?browser=1&p=2&nodeid=<enc>&id=<id>&auth=<enc>` + `&viewonly=1`); `parseDevices(json:String): DeviceList`.
- `data class Device(id, name, groupId, groupName, ip, online, users:List<String>, canView, canControl, viewOnly, canFixPrinter)`; `data class DeviceList(userName:String, groups:List<Group>, devices:List<Device>)`.
- `class PinnedTrust(pinSha256Hex: String)`: `fun clientFor(host: String): OkHttpClient` — IPv4 literal → custom `X509TrustManager` accepting only a leaf whose SHA-256 equals the pin and a `HostnameVerifier` accepting that host; otherwise default client. `fun matches(certDer: ByteArray): Boolean`.
- `data class FixResult(val ok: Boolean, val before: Int?, val after: Int?, val spooler: String?, val error: String?)` (error is one of Task 1's codes).
- `fun interface SocketOpener { fun open(request: Request, listener: WebSocketListener): WebSocket }` — injected so tests use a fake; production uses `trust.clientFor(host).newWebSocket`. `PinnedTrust` throws `CertMismatch` from the TLS layer before the upgrade request (and its `x-meshauth` header) is written.
- `class ControlChannel(baseUrl:String, trust:PinnedTrust, opener: SocketOpener = default)`: `suspend fun signIn(user, pass): Result<Unit>` (opens `wss://host/control.ashx` with `x-meshauth`; fails on `{"action":"close","cause":...}`; error codes `BAD_LOGIN`, `CERT_MISMATCH`, `UNREACHABLE`); `suspend fun devices(): DeviceList`; `suspend fun authCookie(): Pair<String,String>` (cookie, rcookie); `fun send(json:String)`; `suspend fun fixPrinter(nodeId:String): FixResult`; `fun close()`.

- [ ] **Step 1: Write failing tests**: `authHeader("admin","p@ss")` exact; `tunnelRequest` JSON contains `"usage":2`, `"value":"*/meshrelay.ashx?p=2&nodeid=node//abc&id=xyz&rauth=R"` and `"viewonly":true` only when asked; `relayUrl` URL-encodes `node//abc` and cookie; `parseDevices` maps the Task 1 shape; `PinnedTrust.matches` true for the cert whose SHA-256 is the pin (use a fixed test cert in `src/test/resources/test-cert.der` and its known hash), false for any other; Review Focus 2: `ControlChannel.signIn` against a MockWebServer-free fake — inject a fake `SocketOpener` whose open() fails with `CertMismatch` → result `CERT_MISMATCH`, and assert the opener never received a request carrying `x-meshauth` to a server whose certificate did not match.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (coroutines via `kotlinx-coroutines-android:1.9.0`; tags are incrementing ints; replies matched by `tag`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(android): sign-in, device list and pinned control channel`.

### Task 5: Sign-in and device list screens

**Files:**
- Create: `ui/LoginActivity.kt`, `ui/DevicesActivity.kt`, `ui/DeviceAdapter.kt`, `data/SecureStore.kt`, `res/layout/{activity_login,activity_devices,item_device}.xml`, `res/values/strings.xml`, `res/values-en/strings.xml`, `res/values/colors.xml` (accent `#B02A72`, background `#FAF3F6`), launcher icons from `public/images/app/icon-maskable-512.png`
- Test: `ui/DeviceFilterTest.kt` (pure function)

**Interfaces:**
- `object DeviceFilter { fun apply(list:List<Device>, query:String, groupId:String?): List<Device> }` — matches name, ip, users, group name, case-insensitive; online first, then name (Thai collation via `java.text.Collator.getInstance(Locale("th"))`).
- `class SecureStore(context)`: `save(server, user, pass)`, `load(): Saved?`, `clear()` — EncryptedSharedPreferences.
- Device card: name, IP, group, status dot, buttons `เชื่อมต่อ` (hidden if `!canView`) and `แก้ปริ้น` (hidden if `!canFixPrinter`, disabled offline). Fix asks `AlertDialog` with title "แก้ปริ้นไม่ออกที่เครื่องนี้ใช่หรือไม่", message `name · ip · group` + the warning text from `hospital/desktop-app/main.js` `scp:fix-printer`; negative button `ยกเลิก` is the default (positive button text `แก้ปริ้นเครื่องนี้`); result shown under the card.

- [ ] **Step 1: Write failing tests** for `DeviceFilter`: query by IP, by Thai name, by user; group filter; online-first order.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** filter, screens and store. **Step 4: Run** unit tests → PASS, and `./gradlew :app:assembleDebug` → success.
- [ ] **Step 5: Commit** `feat(android): sign-in and device list`.

### Task 6: Remote picture (relay session and canvas)

**Files:**
- Create: `net/RelaySession.kt`, `ui/RemoteActivity.kt`, `ui/RemoteCanvas.kt` (custom `View`), `res/layout/activity_remote.xml`
- Modify: `AndroidManifest.xml` (RemoteActivity `android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|keyboard"`)
- Test: `net/SessionPolicyTest.kt`

**Interfaces:**
- `object SessionPolicy`: `fun reconnectDelay(hadImage:Boolean, userClosed:Boolean, refused:Boolean, onScreen:Boolean, attempts:Int): Long?` → `[2000,5000,10000][attempts]` or null (same rules as `public/scripts/scp-session.js` `reconnectIn`); `const val KEEPALIVE_MS = 10_000L`; `const val BACKGROUND_CLOSE_MS = 30_000L`.
- `class RelaySession(control: ControlChannel, trust: PinnedTrust, device: Device, listener: Listener)`: `start()`, `send(bytes: ByteArray)`, `close(userInitiated: Boolean)`; `interface Listener { onState(state: State); onCommand(cmd: KvmCommand) }`; `enum State { CONNECTING, WAITING_CONSENT, CONNECTED, REFUSED, CLOSED }`. Flow: `authCookie()` → `control.send(tunnelRequest)` → open relay → on text `c`/`cr` send `"2"` and `compression(...)` for the chosen quality, then `refresh()`; on cmd 7 reply `touchInitAck()` and release modifier keys (`key(false, 16|17|18|91|92)`); text frames with `ctrlChannel` `console` msgid 2 → `REFUSED`; timer sends `rtt()` every `KEEPALIVE_MS`.
- `RemoteCanvas`: holds an `ARGB_8888` bitmap of `ScreenSize`; draws each `Tile` with `BitmapFactory.decodeByteArray` at (x,y); fit-to-view with pinch zoom 1x..4x and pan; exposes `viewToRemote(x: Float, y: Float): Point`.

- [ ] **Step 1: Write failing tests** for `SessionPolicy.reconnectDelay` (all cases from `hospital/tests/reconnect.test.js`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** policy, session, canvas, activity (connect on open; close on back; close when backgrounded beyond `BACKGROUND_CLOSE_MS`; Review Focus 1: no restart on rotation). **Step 4: Run** unit tests → PASS; `assembleDebug` → success.
- [ ] **Step 5: Manual check** on the emulator `Medium_Phone_API_36.0` against `https://192.168.2.25:8443` with a test account and the `test01` computer: picture appears; rotate → same session (server events show one desktop session).
- [ ] **Step 6: Commit** `feat(android): remote picture over the relay with keep-alive and reconnect`.

### Task 7: Mouse — touchpad and direct touch

**Files:**
- Create: `input/TouchpadController.kt`, `input/DirectTouchController.kt`, `input/PointerEvents.kt`
- Modify: `ui/RemoteActivity.kt` (mode toggle in the toolbar, default touchpad)
- Test: `input/TouchpadControllerTest.kt`, `input/DirectTouchControllerTest.kt`

**Interfaces:**
- `sealed class PointerOut { Move(x,y); Down(button,x,y); Up(button,x,y); Scroll(x,y,delta) }`.
- `class TouchpadController(screenW:Int, screenH:Int, speed:Float = 1.6f)`: `fun onTouch(e: TouchSample): List<PointerOut>` where `TouchSample(action: DOWN|MOVE|UP|POINTER_DOWN|POINTER_UP, pointers:Int, x:Float, y:Float, timeMs:Long)`. Rules: one finger move → cursor moves by delta × speed, clamped to screen; tap (< 200 ms, < 10 px) → Down+Up LEFT at cursor; two-finger tap → Down+Up RIGHT; two-finger vertical move → Scroll with delta = −dy × 4 (rounded, multiples of 120 accumulate); tap then hold within 300 ms and move → Down LEFT, moves, Up on release (drag).
- `class DirectTouchController(map: (Float, Float) -> Point)`: tap → Move+Down+Up LEFT at mapped point; long press 500 ms → RIGHT click; two-finger gestures are left to the canvas zoom.
- RemoteActivity converts `PointerOut` to `KvmMessages.mouse/scroll` and sends only when `device.canControl`.

- [ ] **Step 1: Write failing tests**: touchpad move clamps at (0,0) and (w−1,h−1); tap → `[Down(LEFT), Up(LEFT)]` at cursor; two-finger tap → RIGHT; two-finger scroll down 30 px → `Scroll(delta=-120)`; tap-hold-drag sequence → Down, Move…, Up; direct tap at view (100,50) mapped to (400,200) → Move, Down, Up at (400,200).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(android): touchpad and direct-touch mouse`.

### Task 8: Keyboard — Thai text, special keys, view-only guard

**Files:**
- Create: `input/KeyboardBridge.kt`, `input/InputGate.kt`, `ui/KeyBar.kt`, `res/layout/view_keybar.xml`
- Modify: `ui/RemoteCanvas.kt` (`onCreateInputConnection` returning a `BaseInputConnection` that forwards `commitText`, `deleteSurroundingText`, `sendKeyEvent` to `KeyboardBridge`)
- Test: `input/KeyboardBridgeTest.kt`, `input/InputGateTest.kt`

**Interfaces:**
- `class KeyboardBridge(private val out: (ByteArray) -> Unit)`: `commitText(text: CharSequence)` → for each UTF-16 unit `unicode(true,u)` then `unicode(false,u)`; `delete(count:Int)` → Backspace (VK 0x08) down/up × count; `special(key: SpecialKey)`; `setModifier(mod: Modifier, on: Boolean)` (Ctrl 0x11, Alt 0x12, Shift 0x10, Win 0x5B extended); while a modifier is held, letters from `commitText` are sent as `key()` with the VK of the uppercase ASCII letter so Ctrl+C works. `enum SpecialKey { ESC(0x1B), TAB(0x09), ENTER(0x0D), BACKSPACE(0x08), DELETE(0x2E ext), LEFT(0x25 ext), UP(0x26 ext), RIGHT(0x27 ext), DOWN(0x28 ext), HOME(0x24 ext), END(0x23 ext), F1..F12(0x70..0x7B), CTRL_ALT_DEL }` (CTRL_ALT_DEL uses `ctrlAltDel()`).
- `class InputGate(private val allowed: Boolean, private val send: (ByteArray) -> Unit) { fun send(bytes: ByteArray) }` — drops every input message (cmd 1, 2, 10, 15, 85) when not allowed; non-input messages pass.
- Key bar: toggles for Ctrl/Alt/Shift/Win (stay on until tapped again or one non-modifier key is sent), buttons for the SpecialKey list, a keyboard button that shows the IME.

- [ ] **Step 1: Write failing tests**: `commitText("สวัสดี")` emits 6×2 unicode messages in order; `commitText("😀")` emits both surrogates; `delete(2)` emits two Backspace down/up pairs (Review Focus 4); Ctrl held + `commitText("c")` → key down 0x11, key down 0x43, key up 0x43, (modifier stays until released); `special(LEFT)` uses extended flag; `InputGate(false)` drops mouse/key/unicode/CAD bytes and passes `refresh()` (Review Focus 3).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; RemoteActivity routes every input through `InputGate(device.canControl)`. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(android): Thai text, special keys and view-only input guard`.

### Task 9: Quality and display selection

**Files:**
- Create: `ui/QualityPicker.kt`, `data/Prefs.kt`
- Modify: `ui/RemoteActivity.kt`
- Test: `data/QualityTest.kt`

**Interfaces:**
- `object Quality { val LADDER = listOf(intArrayOf(2,100,1024,50), intArrayOf(4,100,1024,50), intArrayOf(4,70,1024,100), intArrayOf(4,45,1024,200)); fun defaultIndex(shortSideDp: Int, saveData: Boolean): Int }` — saveData → 3; shortSideDp < 900 → 2; else 0 (same as `defaultQuality` in `public/scripts/scp-session.js`).
- `Prefs.quality` remembered per install; choosing sends `compression(*LADDER[i])` then `refresh()`.
- Displays: on `KvmCommand.Displays` show a picker when `list.size > 1` (label 65535 as "ทุกจอ"); choosing sends `setDisplay(n)` and `refresh()` without reconnecting (Review Focus 5).

- [ ] **Step 1: Write failing tests** for `defaultIndex` and the ladder values; and a `RelaySession` fake-socket test: after `Displays([1,2],1)` then choosing 2, the socket receives `setDisplay(2)` then `refresh()` and no new tunnel request.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(android): quality ladder and display picker`.

### Task 10: Self-update, publishing, server restart

**Files:**
- Create: `update/AppUpdater.kt`, `hospital/android-app/publish-apk.js`, `res/xml/file_paths.xml` (FileProvider)
- Modify: `AndroidManifest.xml` (FileProvider), `app/build.gradle.kts` (release signing from `keystore.properties`, never committed)
- Test: `update/UpdateDecisionTest.kt`, `hospital/tests/android-publish.test.js`

**Interfaces:**
- `public/app-update/android/android.json` = `{ "versionCode": Int, "versionName": String, "apk": "scp-remote-<versionName>.apk", "sha256": hex, "size": Int }`.
- `object UpdateDecision { fun shouldUpdate(installedCode:Int, manifest:AndroidManifestJson): Boolean }` (strictly greater).
- `class AppUpdater(control/base url, trust)`: on sign-in, fetch manifest through the same pinned client, download to `cacheDir/update.apk`, verify size and SHA-256, then `ACTION_VIEW` via FileProvider; mismatches delete the file and do nothing.
- `publish-apk.js`: reads `app/build/outputs/apk/release/app-release.apk` and `versionCode/versionName` from `app/build.gradle.kts`, writes the APK and `android.json` into `public/app-update/android/`.

- [ ] **Step 1: Write failing tests**: `shouldUpdate(3, {versionCode:4})` true, equal false, lower false; `android-publish.test.js` runs `publish(outDir, fakeApkPath, {versionCode:5, versionName:'1.0.4'})` and checks the JSON hash matches the file and the name pattern.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Create the release keystore once (`keytool -genkeypair -keystore hospital/android-app/scp-remote-release.jks -alias scpremote -keyalg RSA -keysize 4096 -validity 9125`), write `keystore.properties` locally, and record in `hospital/android-app/README.md` where the keystore and passwords are kept (not their values). **Step 4: Run** tests → PASS; `./gradlew :app:assembleRelease` → signed APK; `node publish-apk.js` → files in `public/app-update/android/`.
- [ ] **Step 5: Restart the SCP-Remote service** (ask the administrator first; they approved restarts for this work) to load Task 1's operations: `npm run service:stop`, confirm port 8443 free, `npm run service:start`, confirm a new process listens and `npm run check:hospital` passes.
- [ ] **Step 6: End-to-end on the emulator**: install the release APK, sign in, see devices, connect to `test01`, move the mouse in touchpad mode, type "ทดสอบ" into Notepad on `test01`, press Ctrl+Alt+Del from the key bar, run Fix printing with Cancel (nothing happens) and then confirm (result shown). Server events show the session and the printer fix (`from: app`).
- [ ] **Step 7: Commit** `feat(android): self-update, signed release and publishing`; update `hospital/WORK-IN-PROGRESS.md` and `hospital/HANDOVER.md` (where the keystore is kept, how to publish).
