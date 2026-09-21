# งานที่ค้างอยู่

บันทึกสถานะงานพัฒนา ณ **21 กันยายน 2569** สำหรับคนที่มารับช่วงต่อ (หรือ session ถัดไป)

---

## สรุปสั้น: งานรอบล่าสุด commit ครบแล้ว เซิร์ฟเวอร์ deploy แล้ว เขียวหมด

| รายการ | สถานะ |
| --- | --- |
| ทดสอบ `npm run test:hospital` | ✅ ผ่าน 290/290 |
| เลขรุ่น `release.json` ↔ `meshcore.js` | ✅ ตรงกัน |
| เซิร์ฟเวอร์ | ✅ ทำงาน (PID 47752 ตั้งแต่ 21 ก.ย. 19:17) มีเครื่องลูกต่ออยู่ 43 เครื่อง |
| **git** | ✅ **working tree สะอาด — commit ครบทุกไฟล์แล้ว** |

commit ล่าสุด (21 ก.ย.):

- `Wire alert connector, power controls and session health into the platform`
- `Add alert-connector, power-safety and session-health modules`
- `Add a Restart button beside Shut down on each computer`
- `Add a Windows service manager to the dashboard`
- `Use the hospital logo as the app icon`

---

## 1. งานเปิดวงแลน 4 (192.168.4.0/24) — ทำแล้วบางส่วน ⚠️ ต้องตามต่อ

**21 ก.ย.** ผู้ดูแลแจ้งว่าแอดเครื่องเพิ่มในวงแลน 4 แต่เครื่องไม่ขึ้นในระบบ

**ตรวจพบ:** วง `192.168.4.0/24` ไม่ได้อยู่ใน allowlist (มีแค่ 2, 7, 11, 12, 18, 50, 220) — เอเจนต์จากวงที่ไม่ได้อนุญาตจะถูกเซิร์ฟเวอร์ปฏิเสธ

**ทำแล้ว:**
- เพิ่ม `192.168.4.0/24` เข้า `agentAllowedIP` + `userAllowedIP` (ผ่าน `node scripts/allow-subnet.js add`) และปรับกฎ firewall ให้ตรงกัน
- รีสตาร์ตเซิร์ฟเวอร์แบบ orphan-aware เรียบร้อย (บูตไม่มี error, HTTP 200)

**ยังต้องตามต่อ:** ตอนตรวจ log **ไม่พบร่องรอยว่าเครื่องวง .4 เคยพยายามต่อเลยแม้แต่ครั้งเดียว** แปลว่านอกจาก allowlist อาจมีอีกข้อ:

1. เครื่องยังไม่ได้ลง agent → ลง `SCP-Remote-Setup.exe` ที่เครื่อง
2. VLAN วง 4 route ไปหา `192.168.2.25:8443` ไม่ถึง → ทดสอบที่เครื่องวง 4: `Test-NetConnection 192.168.2.25 -Port 8443` ถ้า `False` ต้องให้คนดูแลเน็ตเวิร์กเปิดเส้นทางระหว่าง VLAN

ถ้าเครื่องวง .4 ทยอยขึ้นเองหลังจากนี้ = จบ (ติดแค่ allowlist) ถ้ายังเงียบ = ติดข้อ 1 หรือ 2

---

## 2. ตัวแจ้งเตือนเชิงรุก (Alert connector) — deploy แล้วแบบ "เงียบ" (dormant)

**21 ก.ย.** ทำตามที่ผู้ดูแลสั่ง: **ทำตัวเชื่อมไว้เฉยๆ แต่ยังไม่ต่อสายออกไปไหน** ผู้ดูแลจะไปต่อเอง

- ตราบใดที่ยังไม่ตั้ง `settings.scpAlertWebhook` ตัวเชื่อม **อ่านฐานข้อมูลไม่ส่งอะไรทั้งสิ้น** (ไม่มีข้อมูลออกนอกโรงพยาบาล)
- วิธีต่อสาย + รูปแบบ payload อยู่ใน [ALERTS.md](ALERTS.md)
- ผู้ดูแลติดธง 🔔 เฝ้าระวัง รายเครื่องได้จากแดชบอร์ด (ปุ่มกระดิ่งข้างแถวเครื่อง)

---

## 3. งานหน้างานที่ยังค้าง (ไม่ใช่งานโค้ด)

### 3.1 ถอน ESET ที่ ARI — 2 เครื่อง

| เครื่อง | IP | สถานะ |
| --- | --- | --- |
| **ARI พยาบาล** | 192.168.7.71 | ใช้งานปกติแล้ว (กู้จาก Safe Mode แล้ว) ยังไม่ได้ถอน ESET มี `C:\Windows\Temp\uninstaller.exe` (ESETUninstaller ของแท้) เตรียมไว้แล้ว |
| **ARI เครื่อง หมอ** | 192.168.7.106 | ออนไลน์ มี ESET 1 ตัว Windows แจ้ง PROBLEM ยังไม่ได้ทำอะไร |

ขั้นตอนที่เครื่อง (ARI พยาบาล): ล็อกอิน admin → Command Prompt (Run as administrator) → `bcdedit /deletevalue {default} safeboot` (ถ้าเคยตั้ง safeboot ไว้) → `C:\Windows\Temp\uninstaller.exe` → รีสตาร์ต → Defender เปิดเอง

**สำคัญ: ห้ามใช้วิธีรีโมต Safe Mode กับเครื่องโรงพยาบาลอีก** (Agent ไม่ขึ้นใน Safe Mode — ดูบทเรียนข้อ 5) ถ้าจะถอนที่ ARI หมอ ลองถอนโหมดปกติผ่าน ตรวจโปรแกรม → ถอดออก ก่อน ถ้าไม่ได้ค่อยไป Safe Mode **ที่เครื่อง**

### 3.2 อื่นๆ

- ทดสอบปุ่มหยุดของ Desktop App กับเครื่องจริงก่อนแจกใช้เต็มรูปแบบ (ระบุใน DESKTOP-APP.md)
- OPD 4 กลับมาออนไลน์แล้ว (ลง agent ใหม่ 21 ก.ย.) — โซน OPD เครื่องอื่นที่ยังออฟไลน์ตามต่อได้

---

## 4. งาน roadmap ถัดไป (รอเลือก)

หลัง Alert connector รายการถัดไปที่คุยกันไว้:

- **รายงาน (Report)** — สรุปสถานะฟลีต/เหตุการณ์ ออกมาดู/พิมพ์ได้
- **ขยายช่องทางแจ้งเตือน** — ต่อ Alert เข้า LINE / Discord / webhook (ผู้ดูแลจะเอา URL มาต่อเอง)

---

## 5. บทเรียนหน้างาน — บันทึกไว้กันพลาดซ้ำ

### 5.1 Mesh Agent ไม่ขึ้นใน Safe Mode แม้จะลงทะเบียนไว้แล้ว

ทดลองจริงกับ ARI พยาบาล: เพิ่มคีย์ `SafeBoot\Network\Mesh Agent = "Service"` ยืนยันคีย์ติดจริงแล้ว รีบูตเข้า Safe Mode **ผลคือ Agent ไม่ต่อกลับมาเลยเกิน 100 นาที** → **อย่าวางแผนทำงานรีโมตใน Safe Mode กับเครื่องโรงพยาบาล**

### 5.2 Task Scheduler ก็ไม่ทำงานใน Safe Mode

`SafeBoot\Network` ไม่มีคีย์ `Schedule` ตามค่าเริ่มต้น → แผนสำรอง "ตั้ง scheduled task ให้ถอย safeboot อัตโนมัติ" ใช้ไม่ได้

### 5.3 `service:restart` รายงานว่าสำเร็จทั้งที่ไม่ได้รีสตาร์ต

`npm run service:restart` พิมพ์ stopped/started ทุกครั้ง แต่ process เก่าอาจค้างเป็น orphan ครองพอร์ต 8443 ตัวใหม่จองพอร์ตไม่ได้แล้วตาย เหลือ orphan เสิร์ฟโค้ดเก่า → **การแก้ไฟล์ฝั่งเซิร์ฟเวอร์ไม่มีผลโดยไม่มีสัญญาณเตือน**

**วิธี deploy ที่เชื่อถือได้ (orphan-aware):**
1. `npm run service:stop`
2. ตรวจว่า process เก่าตายจริง + พอร์ต 8443 ว่าง (ถ้ายังค้าง ฆ่าลูกก่อนแม่)
3. `npm run service:start`
4. ยืนยัน PID **เปลี่ยนจริง** และ HTTPS 8443 ตอบ

---

## 6. คำสั่งที่ใช้บ่อย

```
npm run test:hospital      ทดสอบทั้งหมด (290 ข้อ)
npm run check:hospital     ตรวจหน้าเว็บและการตั้งค่า
npm run build:hospital     สร้างหน้าไทยใหม่ (ต้องรันหลังแก้ views/default.handlebars)
node scripts/allow-subnet.js list                   ดูวงที่อนุญาต
node scripts/allow-subnet.js add 192.168.x.0/24     เพิ่มวงเครือข่าย (แล้วต้องรีสตาร์ตเซิร์ฟเวอร์)
```

**ไฟล์ใน `public/scripts/` ไม่ต้องรีสตาร์ตเซิร์ฟเวอร์** เบราว์เซอร์ดึงใหม่เอง แต่กด **Ctrl+Shift+R** เพื่อล้างแคช

**เมื่อออกรุ่นโมดูลเอเจนต์ใหม่** ต้องแก้เลขรุ่นให้ตรงกันทั้ง `hospital/release.json` และ `meshCoreObj.scpRelease` ใน `agents/meshcore.js` (มีเทสต์ตรวจ)
