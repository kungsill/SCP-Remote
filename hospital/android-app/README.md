# แอป SCP-Remote สำหรับ Android

แอปรีโมตเครื่องในโรงพยาบาลจากมือถือ Android (ติดตั้งจากไฟล์ APK) เข้าสู่ระบบด้วยบัญชี SCP-Remote
เดียวกับเว็บ สิทธิ์ต่อเครื่อง (เชื่อมต่อ / ดูอย่างเดียว / แก้ปริ้น) มาจากเซิร์ฟเวอร์ ออกแบบไว้ที่
`docs/superpowers/specs/2026-11-14-scp-remote-android-design.md`

## สร้างแอป

ต้องมี JDK 21 (`C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot`) และ Android SDK
(`%LOCALAPPDATA%\Android\Sdk`, ระบุใน `local.properties` ซึ่งไม่อยู่ใน git)

```powershell
cd hospital\android-app
.\gw.ps1 :app:testDebugUnitTest      # ทดสอบ
.\gw.ps1 :app:assembleDebug          # app\build\outputs\apk\debug\app-debug.apk
.\gw.ps1 :app:assembleRelease        # app\build\outputs\apk\release\app-release.apk (ลงลายเซ็นแล้ว)
```

`gw.ps1` เรียก `gradlew.bat` ด้วย JDK 21 และตัดเครื่องหมาย `"` ที่หลงอยู่ใน PATH ของเครื่องเซิร์ฟเวอร์
(ถ้าไม่ตัด ตัวทดสอบเปิดไม่ขึ้น: "Could not find or load main class VS")

## กุญแจลงลายเซ็น (สำคัญมาก)

| สิ่งของ | ที่อยู่ |
| --- | --- |
| กุญแจ | `F:\SCP-addons\android-keystore\scp-remote-release.jks` (alias `scpremote`, RSA 4096, อายุ 25 ปี) |
| รหัสผ่านของกุญแจ | `F:\SCP-addons\android-keystore\keystore.properties` (ไฟล์เดียวกับที่ build ใช้) |

- **ห้ามหาย** ต้องสำรองทั้งสองไฟล์ไว้ที่อื่นด้วย (เช่น `H:\` หรือแฟลชไดรฟ์ที่เก็บในที่ปลอดภัย)
  ถ้ากุญแจหาย แอปรุ่นใหม่จะติดตั้งทับรุ่นเดิมไม่ได้ ทุกเครื่องต้องถอนแอปแล้วลงใหม่
- ไม่อยู่ใน git (`*.jks` และ `keystore.properties` ถูก ignore) และห้ามส่งให้คนนอก
- build หาไฟล์ `keystore.properties` ตามลำดับ: ข้างโปรเจกต์นี้ → ตัวแปร `SCP_ANDROID_KEYSTORE`
  → `F:\SCP-addons\android-keystore\keystore.properties` ถ้าไม่พบจะได้ APK release ที่ไม่ลงลายเซ็น

## ออกรุ่นใหม่ (มือถือที่ลงแอปไว้จะเสนออัปเดตเอง)

1. เพิ่ม `versionCode` (ต้องมากกว่าเดิม) และ `versionName` ใน `app/build.gradle.kts`
2. `.\gw.ps1 :app:testDebugUnitTest :app:assembleRelease`
3. จากโฟลเดอร์หลักของ repo: `node hospital/android-app/publish-apk.js`
   คัดลอก APK ไปที่ `public/app-update/android/scp-remote-<versionName>.apk` และเขียน `android.json`
   (เว็บเสิร์ฟ `public/` อยู่แล้ว ไม่ต้องรีสตาร์ต) ไฟล์รุ่นเก่าเก็บไว้ ไม่ลบ
4. แอปตรวจหลังเข้าสู่ระบบ หรือกด ⋮ → อัปเดตแอป ดาวน์โหลดผ่านการเชื่อมต่อที่ตรวจใบรับรองเดียวกับตอนเข้าสู่ระบบ
   ตรวจขนาดและ SHA-256 ตรงกับ `android.json` แล้ว Android ถามยืนยันการติดตั้ง

ถอนรุ่นที่มีปัญหา: แก้ `android.json` ให้ชี้รุ่นเดิมไม่ได้ผล (แอปรับเฉพาะ versionCode ที่สูงกว่า)
ต้องออกรุ่นใหม่ที่ versionCode สูงกว่าแทน

## ติดตั้งครั้งแรกบนมือถือ

เปิด `https://192.168.2.25:8443/app-update/android/scp-remote-<รุ่น>.apk` ในวง LAN ของโรงพยาบาล
(หรือส่งไฟล์ APK ให้) แล้วอนุญาต "ติดตั้งแอปที่ไม่รู้จัก" ให้เบราว์เซอร์หรือโปรแกรมจัดการไฟล์

## ข้อจำกัด

- ใช้ได้เฉพาะในวง LAN ของโรงพยาบาล (`192.168.2.25` ปักหมุดใบรับรองจาก `res/raw/server.json`
  ซึ่งคัดลอกจาก `hospital/desktop-app/server.json`) ถ้าเปลี่ยนใบรับรองเซิร์ฟเวอร์ต้องแก้ไฟล์นี้และออกรุ่นใหม่
- นอกโรงพยาบาล: ถ้าติดต่อ `192.168.2.25` ไม่ได้ แอปลองผ่าน `https://remote.kpsnana.com` (Cloudflare Tunnel, `internetUrl` ใน `res/raw/server.json`) เอง
  และจำที่อยู่ที่ใช้ได้ล่าสุดไว้ลองก่อนครั้งหน้า ถ้ากลับไปเปิด Cloudflare Access กั้น `control.ashx` อีก แอปจะใช้ได้แค่ในโรงพยาบาล
- คัดลอก/วางเป็นข้อความเท่านั้น (ไฟล์ใช้หน้า "ไฟล์" แทน) · ปลุกเครื่องต้องมีเครื่องอื่นที่เปิดอยู่ในวงแลนเดียวกันและเครื่องนั้นต้องเปิด Wake-on-LAN ใน BIOS
