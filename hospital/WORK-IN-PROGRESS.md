# งานที่ค้างอยู่

## ตรวจภาพรวมและแก้รายการประมาณการถูกตัด — Codex, 13 ตุลาคม 2569

- ผลตรวจครบพร้อมจุดที่ยังควรแก้: `AUDIT-2026-10-13.md` แดชบอร์ดเว็บเต็มบนจอ 390px ยังมีความกว้างเอกสาร 495px; การ์ดสรุปยังใช้พื้นขาวกับข้อความสีสว่างใน night mode ทั้งสองจุดยังไม่ได้แก้ในรอบตรวจ
- พบและแก้ข้อผิดพลาดใบประมาณการเกิน 200 รายการถูกตัดตอนเปิดกลับ เปลี่ยนจาก `saved.lines.slice(0,200)` เป็นอ่านคืนครบ เพิ่ม regression test เปิดกลับและแก้ไขใบ 201 รายการ ข้อมูลและยอดเงินคงครบ
- เทสต์ทั้งหมด **545 ผ่าน**, build, HTTP checks, Chrome และ PDF QA ผ่าน ใช้สคริปต์ราคาเวอร์ชัน `20261013-preserve`
- ตรวจสำรองวันที่ 13 ต.ค. 02:23 ทั้ง F:/EX และ H: พบสำเนาตรงกันด้วย SHA-256 และ ZIP integrity ผ่าน ยังไม่ได้ทำ restore จริง
- หน้าเว็บหลักผ่าน Cloudflare Access สำหรับ request ไม่มี session; admin ยังไม่มี 2FA และ config ยังไม่กำหนด trustedProxy ควรทบทวนการตั้งค่าตามการใช้งานผ่านโดเมน ไม่ได้เปลี่ยน config หรือ restart ในรอบตรวจ


## แก้ชื่อ SCP-Remote จางในหัวแดชบอร์ด — Codex, 13 ตุลาคม 2569

- สาเหตุคือ `scp-ui.css` กำหนดพื้น `#masthead` เป็นขาวตายตัว แต่สีชื่อเว็บ/คำบรรยายเปลี่ยนเป็นสีสว่างตาม night mode จึงกลืนกับพื้น แก้พื้นหัวเว็บและเมนูด้านข้างให้ใช้ `--scp-surface` ตามธีม และเงาหัวเว็บใช้ `--scp-shadow`
- ตรวจ Chrome ด้วย DOM หัวเว็บจาก `default.handlebars` ทั้งโหมดสว่าง, `.night`, `data-bs-theme=dark` ที่ 320/390/1440px รวมกรณีชื่อเว็บถูกห่อด้วย `<font color=#fff>` ความต่างสีชื่อเว็บโหมดมืดจากกรณีจำลองเดิม 1.05:1 เป็น 14.60:1; โหมดสว่าง 17.05:1 คำบรรยายผ่าน 4.5:1 ทั้งสองโหมด
- เพิ่มเวอร์ชัน `scp-ui.css?v=20261013-contrast` ใน template หลัก/ทางเลือก/มือถือ/หน้าเข้าสู่ระบบ แล้ว build ไทย/อังกฤษและ HTTP checks ผ่าน ภาพ QA อยู่ `.local/ui-review/header-contrast/` ไม่ต้อง restart


## ปรับมือถือเพิ่มเติมครบ 4 จุด — Codex, 13 ตุลาคม 2569

- ลดส่วนหัวและแผงตัวเลขสรุปบนมือถือ ย่อคำแนะนำที่ซ้ำกับช่องค้นหา เปลี่ยนตัวกรองหน่วยงานเป็น dropdown บนจอไม่เกิน 800px ภาพจำลอง 390×844 เห็นการ์ดเครื่อง 2 ใบเต็มแม้มีชื่อไทยยาว
- ขยายชื่อหน่วยงานเป็น 13px, IP เป็น 14px, สถานะและข้อความประกอบเป็นอย่างน้อย 12px, ช่องค้นหา 16px ปุ่มแก้ปริ้นมีไอคอนพร้อมคำว่า “แก้ปริ้น” / “Fix printing” อยู่ข้างปุ่มรีโมต
- แถบค้นหาและตัวเลือกหน่วยงานใช้ sticky ใต้ header วัดความสูง header จริงด้วย ResizeObserver เพื่อรองรับ safe area และการเปลี่ยนขนาดจอ เมื่อกรองจากกลางรายชื่อจะเลื่อนให้เห็นผลลัพธ์แรก การรีเฟรชอัตโนมัติไม่เลื่อนหน้า
- ตรวจ Chrome 320–1440px ทั้ง light/dark, dropdown หน่วยงาน, การค้นหา/กรองออนไลน์/ภาษา/ผัง, ตัวอักษร, การเลื่อนรายการจำลอง 20 เครื่อง และยกเลิกคำสั่งแก้ปริ้นโดยไม่มี POST ผ่าน เทสต์มือถือ 55 ข้อและ HTTP checks ผ่าน
- ภาพ QA: `.local/ui-review/mobile-compact/` เวอร์ชัน CSS/JS `20261013-compact` ทั้งคู่ โหลดหน้าใหม่ใช้ได้โดยไม่ restart


## ปรับหน้ามือถือให้ทันสมัย — Codex, 13 ตุลาคม 2569

- ออกแบบหน้า `/m` ใหม่: พื้นโทนกลาง, ชมพูโรงพยาบาลเฉพาะจุดสำคัญ, แถบหัวกระชับ, ตัวเลขสรุปในแผงเดียว, ช่องค้นหาชัดเจน, ตัวกรองหน่วยงาน, ปุ่มสลับรายชื่อ/ผัง และไอคอน SVG ชุดเดียวกัน
- ใช้ IBM Plex Sans Thai จากไฟล์ฟอนต์ที่มีในเครื่อง ไม่มีการเรียก CDN ชื่อเครื่อง/หน่วยงาน/สถานะอ่านรวมในบรรทัดหัวการ์ด IP แยกชัด เครื่องออฟไลน์ไม่จางทั้งใบ ปุ่มรีโมตที่ใช้ไม่ได้ยังปิดอยู่
- เพิ่มกรองออนไลน์เท่านั้น จำนวนผลลัพธ์ตรงกับตัวกรอง โดยตัวเลขฝูงยังแสดงทั้งชุด ปุ่มแก้ปริ้นเป็นไอคอนข้างปุ่มรีโมต มีชื่อสำหรับการอ่านหน้าจอและยังใช้การยืนยัน/สิทธิ์เดิม
- ตรวจ Chrome จำลองความกว้าง 320, 360, 390, 430, 768, 1440 ทั้ง light/dark: ไม่มีการล้นจอแม้ชื่อเครื่องไทยยาว ทดสอบค้น IP, หน่วยงาน, กรองออนไลน์, ภาษา, ผัง และลิงก์รีโมตครบ ไม่ได้ส่งคำสั่งเครื่องลูกจริง
- เทสต์มือถือ 55 ข้อ, syntax และ HTTP checks ผ่าน ภาพ QA อยู่ `.local/ui-review/mobile-workspace/` เปลี่ยนเวอร์ชัน CSS/JS เป็น `20261013-workspace` ทั้งคู่ เซิร์ฟเวอร์เสิร์ฟไฟล์ใหม่ได้โดยไม่ restart


## มือถือหลังล็อกอินและคลังราคากลาง — Codex, 13 ตุลาคม 2569

- แก้หน้าแรกที่บางครั้งแสดง MeshCentral Mobile เดิมหลังล็อกอิน: `handleRootRequestEx` อาจถูกเรียกตรงหลัง POST และข้าม middleware GET `/` จึงเรียกนโยบายเลือกหน้าของ `hospital/mobile` หลังตรวจโดเมนและบัญชีล็อก ก่อน render
- เพิ่ม `scp-mobile-landing.js` ใน head ของหน้ามือถือเดิมเป็นทางกลับ `/m` ที่ใช้ได้ทันทีจาก template ที่ build แล้ว ซ่อนหน้าเดิมระหว่างเปลี่ยนหน้า ลิงก์เครื่องเฉพาะและ `m=0` คงปลายทางและใช้หน้าเว็บเต็มที่ตกแต่งแล้ว เฉพาะโดเมนหลักที่มีเส้นทาง `/m`
- ปรับ viewport หน้าเว็บเต็มให้ใช้ความกว้างของอุปกรณ์ ตรวจ Chrome จำลองมือถือทั้ง light/dark ว่าเข้าหน้า `/m`, ไม่มีแถบ X/หน้ารายการเดิมค้าง และไม่มีการล้นแนวนอน ไม่ได้ใช้บัญชีจริงหรือเชื่อมต่อเครื่องลูกในการทดสอบ
- ตัวป้องกันฝั่ง template/สคริปต์เสิร์ฟจากเซิร์ฟเวอร์ปัจจุบันแล้ว ส่วน `webserver.js` จะโหลดเมื่อ restart ครั้งถัดไป ไม่ restart รอบนี้เพราะทางแก้ใน template ใช้ได้โดยไม่ตัดเซสชันรีโมต
- ทำคลัง 18 ฉบับ / 973 รายการพร้อม PDF, เลือกปีงบ 2551–2570, หมวดทุกอุปกรณ์, ค้นสเปก, CSV, พิมพ์ และประมาณการซ่อม อ่านขอบเขต/ปีที่ยังขาดใน `REFERENCE-PRICE-ARCHIVE.md` ไม่อ้างว่าพบต้นฉบับครบทุกปี
- เทสต์ระบบทั้งหมด, build ภาษาไทย, HTTP/config checks และ Chrome/PDF QA ผ่าน ไฟล์ QA อยู่ `.local/ui-review/mobile-prices/` มีชุดปัจจุบัน 70 รายการถึงท้ายรายงาน ไม่มีหน้าปกว่าง


## รับช่วงงาน Claude — 12 ตุลาคม 2569

ทำคำขอล่าสุดเรื่องจำนวนและรายละเอียดในแท็บ **การประเมินสภาพเครื่อง** ครบแล้ว:

- แสดงจำนวน **พร้อมใช้งาน / อัปเกรดได้ / ไม่รองรับ / วิกฤต/ต้องเปลี่ยน** กดการ์ดตัวเลขหรือปุ่มกรองเพื่อดูรายชื่อ เหตุผล รายการอัปเกรด และงบโดยประมาณได้
- จำนวนกับรายชื่อใช้เครื่องชุดเดียวกัน รวมเงื่อนไขแผนกและช่องค้นหา กลุ่มพร้อมใช้งานรวม `already_win11` ที่ผ่านเกณฑ์ด้วย
- CPU รองรับ Windows 11 แต่ RAM ต่ำกว่าเกณฑ์แนะนำ → **อัปเกรดได้** แม้ลง Windows 11 อยู่แล้ว อายุยังมีผลต่อคะแนน/แผนระยะยาว แต่ไม่ใช้เป็นเหตุผลเดียวให้ซื้อเครื่องใหม่
- **วิกฤต/ต้องเปลี่ยนเป็นธงแยก** (`healthStatus === 'critical'` หรือ `recommendation === 'replace'`) อาจซ้ำกับสามกลุ่มความพร้อม ไม่ควรนำทั้งสี่ตัวเลขมาบวกกัน
- เพิ่มงบอัปเกรดเทียบซื้อใหม่จากราคาที่ตั้งไว้ พร้อมแก้หน้ารายละเอียดและใบประเมินให้แสดงคำแนะนำอัปเกรดจากเซิร์ฟเวอร์ได้
- ข้อมูลล่าสุดที่อ่านจากฐานข้อมูลในเครื่องนี้: **131 เครื่อง — พร้อม 79 / อัปเกรดได้ 6 / ไม่รองรับ 46 / วิกฤตหรือต้องเปลี่ยน 46** (ข้อมูลสเปกครบ 131 เครื่อง) งบอัปเกรด 6 เครื่องประมาณ **10,200 บาท** เทียบซื้อใหม่ **108,000 บาท** ตามเกณฑ์ราคาปัจจุบัน ตัวเลขบนหน้าเว็บอาจต่างเมื่อกรองแผนก/ค้นหาหรือมีข้อมูลใหม่
- ตรวจผ่าน **494 เทสต์**, `build:hospital`, `check:hospital`, `check:config` และตรวจหน้าจอจำลองด้วย Chrome ที่ขนาดคอมพิวเตอร์/มือถือ ภาพอยู่ `.local/ui-review/assessment/`
- ใช้งานได้โดยไม่ restart: `hospital/operations.js` โหลด `fleet-assess.js` ใหม่ทุกครั้งที่ขอ `fleetAssessment`; สร้างหน้าไทยแล้วและเพิ่มเวอร์ชัน URL ของไฟล์เว็บให้โหลดใหม่ เปิดหน้าเว็บใหม่ → แท็บการประเมินสภาพเครื่อง

ไฟล์ที่แก้รอบนี้: `hospital/fleet-assess.js`, `public/scripts/scp-assess.js`, `public/scripts/scp-dashboard.js`, `public/scripts/scp-report.js`, `public/styles/scp-dashboard.css`, `views/default.handlebars` และเทสต์ที่เกี่ยวข้อง ยังไม่ได้ commit และยังมีงานแก้ไฟล์อื่นค้างอยู่จากก่อนรับช่วง

### ตามคำขอเพิ่ม: เต็มจอและพิมพ์รายละเอียดในหน้านี้

- แท็บประเมินขยายเต็มพื้นที่หน้าต่างอัตโนมัติ ย้ายแผงออกจาก container ที่ตัดเนื้อหา มีปุ่ม **กลับหน้าปกติ / ขยายเต็มจอ** แถบเครื่องมือพิมพ์ติดด้านบนเมื่อเลื่อน และกลับตำแหน่งเดิมเมื่อออกจากแท็บ
- แก้ความสูงการเลื่อนในโหมดปกติให้หัก footer และรวม padding ภายในพื้นที่ ไม่บังแถวสุดท้าย
- ปุ่ม **พิมพ์รายละเอียดกลุ่มที่เลือก**, **พิมพ์ทุกเครื่อง**, **พิมพ์เครื่องนี้** เปิดหน้าต่างพิมพ์ของเบราว์เซอร์โดยตรง เลือกเครื่องพิมพ์หรือบันทึก PDF ได้ กลุ่มที่เลือกใช้รายการหลังกรองสถานะ/แผนก/ค้นหา ส่วนทุกเครื่องใช้ทุกเครื่องที่ผู้ใช้เห็นได้
- รายงานประกอบด้วยหน้าสรุปและใบประเมินแต่ละเครื่อง: CPU/RAM/ดิสก์/พื้นที่ว่าง/BIOS/TPM/OS ชนิดและรุ่นเครื่อง IP/โฮสต์/ผู้ใช้งานเมื่อมีข้อมูล สิทธิ์ Windows/Office ครุภัณฑ์ ปีจัดซื้อหรือปีประมาณ ราคาจัดซื้อหรือราคากลาง ค่าเสื่อม มูลค่าคงเหลือ คะแนน เหตุผล คำแนะนำ งบประมาณ และแผนระยะยาว ข้อมูลที่ยังไม่ตรวจระบุว่าไม่ทราบหรือยังไม่ได้ตรวจ
- ตรวจผ่าน **497 เทสต์**, build และ HTTP/config checks ทดสอบ Chrome รายการ 40 เครื่องว่าเลื่อนถึงแถวท้าย และตรวจ PDF จำลองครบ 40 เครื่อง (41 หน้า: สรุป 1 + เครื่องละ 1) ภาพ/PDF สำหรับ QA อยู่ `.local/ui-review/assessment/` รายงานเครื่องจริงที่มีหมายเหตุยาวอาจต่อหลายหน้าเพื่อคงรายละเอียด
- เพิ่มเวอร์ชันไฟล์เป็น `20261012-assess-print`, build หน้าไทยแล้ว และยืนยันเซิร์ฟเวอร์เสิร์ฟโค้ดพิมพ์ใหม่ ไม่ต้อง restart

**แก้ตามคำขอถัดมา:** ตัดหน้าสรุปนำออกจากการพิมพ์รายละเอียด รายงานเริ่มจากเครื่องแรกทันที ไม่มีหน้าเปล่าจากการขึ้นหน้าใหม่ก่อนเครื่องแรก ทดสอบ PDF จำลอง 40 เครื่องได้ 40 หน้า รายละเอียดครบและเทสต์รายงาน 11 ข้อผ่าน เพิ่มเวอร์ชัน CSS/รายงานเป็น `20261012-assess-print2` และ build หน้าไทยแล้ว

### ราคากลางงบ 2570 จาก PDF ฉบับร่าง

ผู้ดูแลกำหนดปีงบ **2570** และเลือกให้เก็บทุกประเภทไว้เลือก เพิ่มรายการ PC / All-in-One / Notebook รวม 8 ประเภท (รวมงานประมวลผลและ Notebook AI) ที่หน้า **เกณฑ์ประเมิน** ใช้ราคางานสำนักงานเป็นค่าเริ่มต้นและแสดงสถานะฉบับร่าง รายละเอียดราคา/หน้าต้นฉบับอยู่ [REFERENCE-PRICES-2570.md](REFERENCE-PRICES-2570.md)

งบซื้อทดแทนรวมราคาตามชนิดและประเภทงานจริง เริ่มที่งบ 2570 ราคาครุภัณฑ์เก่าไม่ถูกแทนด้วยราคาใหม่ แก้การบันทึกเกณฑ์จาก UI ให้ส่ง payload `criteria` ถูกต้อง ตรวจผ่าน **499 เทสต์**, build, HTTP/config checks, หน้าตัวเลือก 8 ประเภทใน Chrome และ PDF จำลอง 40 เครื่อง/40 หน้า พร้อมราคาซื้อทดแทนปี 2570 ใช้งานได้โดยไม่ restart

### ราคากลางย้อนหลังจากคลังเอกสารทางการ (Claude รับช่วงต่อ — 12 ต.ค. 2569 ดึก)

- คลังเอกสาร MDES/ICT ที่ Codex ดึงไว้ (`public/data/reference-prices/catalog.json`, 18 ฉบับ 2553–2570) **ยังไม่ได้ต่อเข้าระบบ** รอบนี้ต่อแล้ว: ราคากลาง **PC / Notebook / All-in-One งานสำนักงาน** รายปีจากฉบับ **ทางการ** ทุกฉบับ (ไม่รวมฉบับร่างและรายการ GIS) อยู่ใน `scp-price-reference.js` (`history`, `historySources` บอกฉบับ/หน้า/ข้อ) ใช้ร่วมกันทั้ง `fleet-assess.js` และ `scp-assess.js` เป็น `DEFAULT_CRITERIA.referencePrices`
- ใช้คิด **ราคาตั้งต้นและค่าเสื่อมของเครื่องเดิม** ตามปีที่ได้มา (ปีที่ไม่มีฉบับของตัวเองใช้ฉบับก่อนหน้าที่ใกล้ที่สุด ก่อนปี 2561 ยังไม่มีหมวด All-in-One ใช้ราคา PC ปีนั้น) งบซื้อทดแทนยังใช้ฉบับร่าง 2570 ตามที่ Codex ทำไว้
- **แก้ค่าที่ผิด:** ค่าเริ่มต้นเดิม 2566 = 17,000 (ผม/Claude ใส่จากเอกสารจัดซื้อของหน่วยงานอื่น) ฉบับ มี.ค. 2566 จริงคือ PC 20,000 · Notebook 19,000 · AIO 20,000 ฐานข้อมูลยังไม่เคยบันทึกเกณฑ์ ค่าที่ผิดจึงไม่ค้าง
- ปรับเทสต์ของ Codex หนึ่งข้อ: AIO ที่ CPU ปี 2556 ราคาตั้งต้นเป็น 14,000 ตามฉบับปี 2556 (เดิม 17,000 เพราะยังไม่มีข้อมูลปีเก่า) เจตนา "ไม่ใช้ราคาใหม่ย้อนหลัง" ยังคงทดสอบอยู่ เพิ่มเทสต์ราคาย้อนหลัง
- ตรวจผ่าน **500 เทสต์**, `build:hospital`, `check:hospital`, `check:config` เพิ่มเวอร์ชัน `scp-price-reference.js` / `scp-assess.js` เป็น `20261012-history` ไม่ต้อง restart

### ราคาอะไหล่ + ตรวจอะไหล่ที่ควรเปลี่ยน (Claude — 12 ต.ค. 2569 23:2x)

- **ราคาอะไหล่** อยู่ใน `scp-price-reference.js` (`parts`) และแก้ได้ที่ **เกณฑ์ประเมิน**: RAM 1,200 · SSD 1,500 · CPU 3,500 · พัดลม CPU 350 · ถ่าน BIOS CR2032 50 (**ราคาตลาดโดยประมาณ** — MDES ไม่มีราคากลางของวัสดุพวกนี้) · UPS 800 VA **2,500 ราคากลาง MDES ฉบับ ธ.ค. 2568 หน้า 28** ฝั่งเซิร์ฟเวอร์รับเฉพาะตัวเลข 0–1,000,000 ใน `saveCriteria`
- **ปุ่มตรวจเครื่อง** (อ่านอย่างเดียว) เพิ่มการอ่าน: ชนิด/สุขภาพดิสก์จริงจาก `Get-PhysicalDisk` และดิสก์ที่มีไดรฟ์ C:, UPS ที่ต่อ USB (`Win32_Battery`), จำนวนครั้งที่นาฬิการีเซ็ตกลับปีก่อน 2015 ตอนบูตใน 6 เดือน (Kernel-General 1 = ถ่าน BIOS หมด), จำนวน event ซีพียูถูก firmware ลดความเร็วใน 30 วัน (Kernel-Processor-Power 37 = มักร้อน/พัดลม) เก็บใน `scpchassis`
- `maintenanceFor()` (ใช้ร่วมเซิร์ฟเวอร์/เว็บ) แนะนำ: ดิสก์ระบบไม่ Healthy → เปลี่ยน SSD ด่วน · reset ≥1 → ถ่าน BIOS · throttle ≥5 → พัดลม · PC/AIO ที่ไม่พบ UPS USB → UPS (**optional** ไม่นับในงบที่ต้องใช้ เพราะ UPS ที่ไม่ต่อ USB มองไม่เห็น) ผลประเมินมี `maintenance`, `maintenanceCost`, `diskSource`; สรุปฝูงมี `maintenance`
- SSD จากผลตรวจจริงแทนการเดาจากชื่อรุ่น (เช่น KINGSTON SA400 เดิมถูกนับเป็น HDD)
- แสดงที่แท็บประเมิน (บรรทัดสรุปอะไหล่ + 🔧 ในแต่ละแถว), หน้ารายละเอียดเครื่อง, สรุปประจำวัน
- ตรวจผ่าน **502 เทสต์**, build, check:hospital · restart แล้ว 23:23 · เวอร์ชันไฟล์ `20261012-parts`

---

## บันทึกก่อนหน้า (23 กันยายน 2569)

บันทึกสถานะงานพัฒนา ณ **23 กันยายน 2569** สำหรับคนที่มารับช่วงต่อ (หรือ session ถัดไป)

---

## สรุปสั้น: commit ครบ deploy แล้ว เขียวหมด

| รายการ | สถานะ |
| --- | --- |
| ทดสอบ `npm run test:hospital` | ✅ ผ่าน 354/354 |
| ตรวจหน้าเว็บ `npm run check:hospital` | ✅ ผ่าน |
| ตรวจการตั้งค่า `npm run check:config` | ✅ ไม่มีข้อบล็อก |
| เลขรุ่น `release.json` ↔ `meshcore.js` | ✅ ตรงกัน (2026.09.22.3) |
| เซิร์ฟเวอร์ | ✅ ทำงาน (PID 9608 ตั้งแต่ 23 ก.ย. 13:24) เครื่องลูก **102 เครื่อง** 27 กลุ่ม ออนไลน์ 76 |
| **git** | ✅ **working tree สะอาด** |

commit รอบ 23 ก.ย.:

- `Hold a KVM session to one viewer, and scope consent to that session` — งานค้างจาก 22 ก.ย.
- `Stop the Visual Studio project listing files that are not there`
- `Refuse a device rename that collides inside the same device group`
- `Put a refused agent in front of an administrator, not only in a log file`
- `Review compression and minify, and say which one is the trap`

---

## 1. วงเครือข่ายที่ยังไม่ได้อนุญาต — ปิดเคสแล้ว ✅ (แต่รูปแบบนี้จะกลับมาอีก)

**เกิดซ้ำ 3 รอบ:** วง 4 (21 ก.ย.), แล้ว **วง 6 และวง 60 (23 ก.ย.)** ทุกรอบอาการเหมือนกันเป๊ะ — "แอดเครื่องแล้วเครื่องไม่ขึ้น" เพราะวงนั้นไม่อยู่ใน `agentAllowedIP` เซิร์ฟเวอร์ปฏิเสธเงียบๆ

**23 ก.ย. ทำแล้ว:** เพิ่ม `192.168.6.0/24` และ `192.168.60.0/24` (พบในหน้าจอ log ว่าถูกปฏิเสธจริง: .84 .118 .195 .196 และ .142) รีสตาร์ตแล้ว เครื่อง **ER 7 เครื่อง + Lab 1 เครื่อง** ขึ้นระบบครบ

**รอบที่ 4 เกิดขึ้นบ่ายวันเดียวกัน — และระบบเตือนทำงานจริง:** 12:56 น. วง `192.168.5.0/24` (แผนกเภสัช) ถูกปฏิเสธ คราวนี้**ไม่ต้องไล่หาสาเหตุเลย** เพราะเหตุการณ์ `scprefusedagent` เด้งขึ้นหน้าจอพร้อมคำสั่งที่ต้องใช้ เพิ่มวง + restart แล้วเครื่องเข้ามา **6 เครื่องรวดเดียว**

> **ข้อสังเกตสำคัญ:** log แสดงแค่ `192.168.5.205` เครื่องเดียว แต่จริง ๆ มี 6 เครื่องรออยู่ เพราะระบบเตือนซ้ำแค่ชั่วโมงละครั้งต่อหนึ่งวง — นี่คือเหตุผลที่เพิ่มตัวนับจำนวนครั้งเข้าไป ถ้าวงเดิมถูกปฏิเสธซ้ำจนถึงรอบแจ้งอีกครั้ง จะบอกว่า "พยายามแล้ว N ครั้ง" ซึ่งอ่านต่างกันมากระหว่าง "1 เครื่องตั้งผิด" กับ "ทั้งแผนกเข้าไม่ได้"

**วงที่อนุญาตแล้วทั้งหมด (23 ก.ย.):** 2, 4, 5, 6, 7, 11, 12, 18, 50, 60, 220

**กันไม่ให้เสียเวลาซ้ำ:** ตั้งแต่ commit `e1efb68` การปฏิเสธเอเจนต์ไม่ได้อยู่แค่ใน log แล้ว — เซิร์ฟเวอร์จะ **ส่งเป็นเหตุการณ์ขึ้นหน้าจอแอดมิน** พร้อมชื่อวง จำนวนครั้งที่พยายาม และคำสั่งที่ใช้แก้ ถ้าเห็นข้อความนี้ให้ทำตามได้เลย:

```
node scripts/allow-subnet.js add 192.168.x.0/24
npm run service:restart
```

**บทเรียน:** ของเดิมเขียน log ไว้ครบตั้งแต่ ก.ย. แต่ยังเสียเวลาอีก 2 รอบ เพราะ **ไม่มีใครเปิดไฟล์ log ถ้ายังไม่สงสัยอยู่ก่อน** คำตอบที่ถูกต้องแต่ไม่มีใครเห็น = ไม่มีค่า

---

## 2. ตัวแจ้งเตือนเชิงรุก (Alert connector) — deploy แล้วแบบ "เงียบ" (dormant)

**21 ก.ย.** ทำตามที่ผู้ดูแลสั่ง: **ทำตัวเชื่อมไว้เฉยๆ แต่ยังไม่ต่อสายออกไปไหน** ผู้ดูแลจะไปต่อเอง

- ตราบใดที่ยังไม่ตั้ง `settings.scpAlertWebhook` ตัวเชื่อม **อ่านฐานข้อมูลไม่ส่งอะไรทั้งสิ้น** (ไม่มีข้อมูลออกนอกโรงพยาบาล)
- วิธีต่อสาย + รูปแบบ payload อยู่ใน [ALERTS.md](ALERTS.md)
- ผู้ดูแลติดธง 🔔 เฝ้าระวัง รายเครื่องได้จากแดชบอร์ด (ปุ่มกระดิ่งข้างแถวเครื่อง)

---

## 2.4 รีโมตจากนอกโรงพยาบาล — ✅ เปิดใช้งานแล้ว 23 ก.ย. 2569

`https://remote.kpsnana.com` ใช้งานได้จริง ทดสอบจากมือถือที่ใช้เน็ตมือถือแล้วเปิดหน้าจอเครื่องในโรงพยาบาลได้

```
ผู้ดูแลจากข้างนอก → remote.kpsnana.com → Cloudflare Access (ล็อกอินอีเมล)
                                        → cloudflared → localhost:8443 → SCP-Remote (รหัสผ่าน + 2FA)
```

| | |
| --- | --- |
| ไฟร์วอลล์ขาเข้า | **ปิดสนิททุกพอร์ต** — tunnel ต่อออก ไม่มีใครต่อเข้า |
| ชั้นกั้น | Cloudflare Access → รหัสผ่าน → 2FA (บังคับแล้ว) |
| TLS ถึงเซิร์ฟเวอร์ | ตรวจครบด้วย CA Pool ไม่ได้ปิดการตรวจ |
| log | บันทึก IP จริงของผู้ใช้ (ยืนยันแล้ว) |
| เครื่องลูก 123 เครื่อง | **ไม่ได้แตะสักเครื่อง** ยังต่อ LAN ที่ `192.168.2.25:8443` |

**ใช้ tunnel ร่วมกับระบบจองคิว/เรียนออนไลน์** (`academy-server`) — เพิ่ม route เข้าไป ไม่ได้แก้ของเดิม **ห้าม `Stop-Service Cloudflared` เพื่อไล่ปัญหา SCP-Remote** จะล้มระบบจองคิวที่ประชาชนใช้อยู่

ขั้นตอนทั้งหมดและวิธีย้อนกลับ: [CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md) · [REMOTE-OVER-INTERNET.md](REMOTE-OVER-INTERNET.md)

สลับโหมดฝั่งเซิร์ฟเวอร์: `npm run tunnel:mode` (status / `enable <โฮสต์>` / `disable`)

---

## 2.45 หน้าแรกคือหน้ารีโมทแบบแอปแล้ว — และวิธีกลับไปเว็บเต็ม

ตั้งแต่ 23 ก.ย. 2569 **ทุกเครื่องที่ล็อกอินแล้วเปิด `remote.kpsnana.com` จะเจอหน้ารีโมทแบบแอปทันที** (การ์ดเครื่อง ค้นหา แถบห้อง) ไม่ว่าจะเป็นมือถือ แท็บเล็ต หรือคอมพิวเตอร์ — ตามที่ผู้ดูแลต้องการให้มีประตูเดียวและทำตัวเหมือนแอป

### 🔑 เข้าเว็บเต็ม (MeshCentral เดิม) — จำให้ได้

```
https://remote.kpsnana.com/?m=0
```

**นี่คือทางเดียวแล้ว** ปุ่ม "เว็บเต็ม" ถูกเอาออกจากหน้าตามที่สั่ง งานที่ทำได้เฉพาะในเว็บเต็ม:

- สร้าง/แก้ไข/ลบกลุ่มอุปกรณ์
- ย้ายเครื่องระหว่างกลุ่ม
- เพิ่ม/ลบบัญชีผู้ใช้ และกำหนดสิทธิ์
- อนุมัติแอป Desktop ของเครื่องใหม่
- ดูเหตุการณ์ (Events) ย้อนหลัง
- ตั้งค่าอื่นๆ ของเซิร์ฟเวอร์ทั้งหมด

เมื่อเข้า `?m=0` แล้ว **ระบบจะจำไว้** เปิดหน้าอื่นหรือรีเฟรชก็ยังอยู่ที่เว็บเต็ม จนกว่าจะกลับไป `/m` ซึ่งจะสลับกลับเป็นโหมดแอป

> ถ้าวันหนึ่งเข้าเว็บเต็มไม่ได้และลืม URL นี้ ให้ดูในไฟล์ [hospital/mobile.js](mobile.js) — เขียนกำกับไว้ในโค้ดด้วย

---

## 2.5 ค้างอยู่ตอนนี้ — ต้องทำที่หน้าเว็บ ทำจาก command line ไม่ได้

### เครื่อง 12 เครื่องค้างในกลุ่ม "ทดสอบ"

| เครื่อง | ควรอยู่กลุ่ม |
| --- | --- |
| `XRAY01` (192.168.6.110), `xray2` (192.168.7.112), `XRAY03` (192.168.6.201) | ยังไม่มีกลุ่มเอกซเรย์ — ต้องสร้างใหม่ |
| เภสัช 8 เครื่อง (วง 192.168.5.x) | **`ห้องยา`** — กลุ่มนี้มีอยู่แล้วและยังว่าง |
| `10999` (192.168.2.25) | เครื่องเซิร์ฟเวอร์เอง ปล่อยไว้ได้ |

วิธีทำ: หน้าเว็บ → เลือกเครื่อง (ติ๊กหลายเครื่องพร้อมกันได้) → **ย้ายไปกลุ่มอุปกรณ์**

ชื่อเครื่องเอกซเรย์เขียนไม่ตรงแบบกัน (`XRAY01` / `xray2` / `XRAY03`) จะจัดให้เป็นระเบียบก็ได้ — ตั้งแต่ commit `2576e65` ถ้าเผลอตั้งชื่อซ้ำกับเครื่องอื่นในกลุ่มเดียวกัน ระบบจะปฏิเสธและขึ้นข้อความบอก

**ทำไมสคริปต์ทำให้ไม่ได้:** `meshctrl movetodevicegroup` ต้องล็อกอิน ซึ่งต้องใช้รหัสผ่านแอดมิน หรือต้องเพิ่ม `loginTokenKey` ลง config — เท่ากับสร้างกุญแจถาวรที่ข้ามรหัสผ่านบนเซิร์ฟเวอร์ที่คุมคอมพิวเตอร์ 102 เครื่อง เพื่อทำงานที่กดในหน้าเว็บไม่กี่คลิก **อย่าทำ**

### กลุ่มที่สร้างไว้แล้วแต่ยังว่าง

`โรงครัว` `ห้องยา` `จ่ายกลาง` `กลุ่มการ` `LR` `OR` `ช่าง` `คลินิกพิเศษ` `ซักฟอก`

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

## 4. งาน roadmap

**เสร็จแล้ว 21 ก.ย.:**
- ✅ **รายงานสถานะเครื่อง (Report)** — ปุ่ม "รายงาน" บนแถบเครื่องมือแดชบอร์ด เปิดรายงานทั้งฟลีต (สรุปจำนวน, แยกตามหน่วยงาน, เครื่องที่ต้องดูแล, เครื่องเฝ้าระวัง, เครื่องออฟไลน์) พิมพ์/บันทึก PDF ได้ ใช้ข้อมูลชุดเดียวกับ panel แจ้งเตือน (`ScpDashboard.snapshot()`) — ตัวเลขบนกระดาษตรงกับบนจอเสมอ ไฟล์: `public/scripts/scp-report.js`, ทดสอบ: `hospital/tests/report.test.js`

**ถัดไป (รอเลือก):**
- **ขยายช่องทางแจ้งเตือน** — ต่อ Alert เข้า LINE / Discord / webhook (ผู้ดูแลจะเอา URL มาต่อเอง)

---

## 4.5 ความเร็วและประสิทธิภาพ — ทำแล้วส่วนหนึ่ง เหลือข้อที่ต้องใช้ตาคน

### ทำแล้ว 23 ก.ย. — เปิดการบีบอัด (ได้ผลมากที่สุด)

`settings.compression` เป็น `false` มาตลอด (ค่าเริ่มต้นของ MeshCentral) เซิร์ฟเวอร์จึงส่งหน้าเว็บแบบดิบทุกครั้ง เปิดแล้ววัดของจริง:

| | ก่อน | หลัง | ลด |
| --- | --- | --- | --- |
| หน้า login | 70,192 | 12,168 | 83% |
| หน้าไทยเต็ม (`default_th`) | 1,649,612 | ~297,700 | 82% |

ยืนยันด้วย header `Content-Encoding: gzip` และ `npm run check:hospital` ผ่าน ตัวกัน BREACH (`webPageLengthRandomization`) เปิดอยู่ตามค่าเริ่มต้นแล้ว

### ⛔ ห้ามเปิด `minify` — เป็นกับดัก

ดูเผินๆ เหมือนของฟรี (ไฟล์ `default-min_th.handlebars` มีอยู่จริง เล็กกว่า 40%) **แต่เปิดแล้วเว็บจะพังทั้งระบบ** เพราะ `minify` ยังไปเปลี่ยน src ของสคริปต์แกนหลักทุกตัวเป็น `-min.js` ด้วย ซึ่ง fork นี้ไม่เคยสร้าง — ขาดทั้ง 12 ตัว (`common-0.0.1`, `meshcentral`, `agent-desktop-0.0.2`, ฯลฯ) หน้าเว็บจะโหลดขึ้นแล้วไม่ทำงานอะไรเลย ซึ่งดูเหมือน "เซิร์ฟเวอร์เสีย" ไม่ใช่ "มีคนเปลี่ยนค่า"

`npm run check:config` บล็อกให้แล้วถ้ามีใครเผลอเปิด และจะบอกว่าขาดไฟล์อะไร

### ✅ แก้แล้ว 23 ก.ย. — ภาพรีโมทหล่นจาก WEBP ไปเป็น PNG กลางเซสชัน

ของเดิมตั้งใจใช้ WEBP แทน PNG (มีคอมเมนต์กำกับที่ migration `scpDesktopQuality3` ว่า *"WEBP ที่คุณภาพเต็มยังคมโดยไม่กินทราฟฟิกแบบที่ PNG ต้องใช้"*)

แต่ชุดปรับคุณภาพอัตโนมัติที่เพิ่มมาใน `a85ab44` ตั้งโปรไฟล์ "คมชัด" เป็น `[2,90,1024,50]` — เลข `2` คือ **PNG** และ [scp-session.js](../public/scripts/scp-session.js) สั่งโปรไฟล์นี้ทันทีที่ได้ภาพแรกของทุกเซสชัน **WEBP จึงอยู่ได้แค่ไม่กี่เฟรมแล้วโดนสลับเป็น PNG ตลอดเซสชัน** โดยไม่มีอะไรฟ้อง เพราะโค้ดสองส่วนไม่เคยเจอกัน

แก้ให้ทุกขั้นของบันไดอยู่บน WEBP แล้ว และ "คมชัด" = `[4,100,1024,50]` ตรงกับค่าตั้งต้นของหน้าเว็บพอดี **มีเทสต์ตรึงค่าไว้แล้ว** รวมถึงเทสต์ที่ตรวจว่าบันไดกับค่าตั้งต้นต้องไม่ขัดกัน

**บทเรียน:** โมดูลที่เขียนมาเพื่อเรื่องหนึ่ง (ปรับคุณภาพ) เผลอพลิกการตัดสินใจของอีกเรื่อง (เลือก encoding) ได้ ถ้าไม่มีเทสต์ตรึงค่าที่ตั้งใจไว้

### ⚠️ แอป Desktop มีสำเนาโค้ดของตัวเอง — แก้ฝั่งเว็บอย่างเดียวไม่พอ

พบตอนแก้ WEBP: [hospital/desktop-app/session-health.js](desktop-app/session-health.js) **เป็นสำเนาไบต์ต่อไบต์** ของ [public/scripts/scp-session.js](../public/scripts/scp-session.js) ที่ [main.js](desktop-app/main.js) ฉีดเข้าไปในหน้าต่างแอป แก้ฝั่งเว็บไปแล้วแต่ฝั่งแอปยังเป็น PNG อยู่ — **เจ้าหน้าที่ที่ใช้แอปจะยังเจอปัญหาเดิมทั้งที่คิดว่าแก้แล้ว**

ซ้ำร้าย `main.js` ยังเป็น**ที่ที่สาม**ที่ตั้งค่าภาพ และตั้งไม่ตรงกับอีกสองที่ (`quality=90` + `ImageType=2` ซึ่งคือ PNG และ PNG ไม่สนใจค่า quality อยู่แล้ว) ตอนนี้ปรับให้ทั้งสามที่ตรงกันหมดแล้ว **พร้อมเทสต์ที่จะ fail ถ้าสองไฟล์นี้เพี้ยนจากกันอีก**

> **ต้อง build แอปใหม่** การแก้นี้จะยังไม่ถึงเครื่องที่ติดตั้งแอปไว้แล้ว จนกว่าจะ `cd hospital/desktop-app && npm run package` แล้วบีบ zip แจกใหม่ (ดู [DESKTOP-APP.md](DESKTOP-APP.md))

### ℹ️ แก้หน้า view แล้วไม่ต้อง restart

เซิร์ฟเวอร์ไม่ได้รันโหมด production (ดูที่ log ตอนบูต ถ้าไม่มีคำว่า `Production mode.` ต่อท้าย แปลว่าไม่ได้เปิด) Express จึงไม่แคช handlebars — **แก้ `views/*.handlebars` แล้วมีผลทันที** แค่ต้องรัน `npm run build:hospital` เพื่อสร้างหน้าไทยใหม่ ส่วนไฟล์ใน `public/scripts/` ให้เด้งเลข `?v=` ในหน้า view เบราว์เซอร์จะดึงใหม่เองโดยไม่ต้องบอกผู้ใช้กด Ctrl+Shift+R

### ⏳ ยังไม่ได้ทำ — ลดคุณภาพภาพลงอีก (ต้องมีคนดูด้วยตา)

ตอนนี้ "คมชัด" = WEBP คุณภาพ **100** เต็มความละเอียด ซึ่งกินแบนด์วิดท์สูงสุด ถ้าจะประหยัดกว่านี้ ขั้นถัดไปคือ **90** (ตัวเลือกที่หน้าเว็บมีคือ 100, 90, 80, 70, … ไม่มี 85)

**ยังไม่แก้ เพราะตัดสินจากโค้ดไม่ได้** ต้องเปิดรีโมทเครื่องจริงแล้วดูว่าตัวอักษรไทยบนหน้าจอระบบโรงพยาบาลยังอ่านชัดไหม

**วิธีเทียบโดยไม่ต้องแก้โค้ดเลย:** เปิดรีโมทเครื่องหนึ่ง → แผงเครื่องมือมีตัวเลือก **คมชัด / สมดุล / ประหยัดเน็ต** อยู่แล้ว สลับดูได้สดๆ และ **แถบสถานะบอก KB/s, RTT, ภาพย่อย/วิ ให้เห็นตัวเลขจริง** ถ้าสรุปได้ว่าระดับไหนพอ ค่อยมาแก้เลขในบันไดที่ [scp-session.js](../public/scripts/scp-session.js) (มีเทสต์คุมอยู่ ต้องแก้เทสต์ด้วย)

> ระวัง: โปรไฟล์ "คมชัด" จะถูกสั่งทุกครั้งที่ได้ภาพแรก ฉะนั้นค่าที่ตั้งในหน้า Settings ของ MeshCentral เองจะถูกทับตอนเริ่มเซสชัน (เปลี่ยนกลางเซสชันยังได้อยู่) ถ้าจะเปลี่ยนค่าถาวร ให้แก้ที่บันไดใน scp-session.js ไม่ใช่ที่หน้า Settings

### `desktopMultiplex` — ยังไม่เปิด และยังไม่ควรเปิดแบบไม่ทดสอบ

ช่วยเฉพาะตอนมีผู้ดูหลายคนพร้อมกัน (เอเจนต์ส่งภาพชุดเดียวแตกให้หลายเบราว์เซอร์ และเบราว์เซอร์ช้าไม่ถ่วงเบราว์เซอร์เร็ว) แลกด้วย RAM/CPU เซิร์ฟเวอร์ — ซึ่งเครื่องนี้เหลือเฟือ (ใช้ 145 MB จาก 32 GB)

**แต่** การเปิดจะปลุกเส้นทางโค้ดที่ deployment นี้ไม่เคยรันเลย และเส้นทางนั้นเกี่ยวพันกับงาน consent/KVM ที่เพิ่ง commit ไป ต้องทดสอบกับเครื่องจริงก่อน ไม่ใช่เปิดในเวลาราชการ

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
npm run test:hospital      ทดสอบทั้งหมด (354 ข้อ)
npm run check:hospital     ตรวจหน้าเว็บและการตั้งค่า
npm run check:config       ตรวจไฟล์ตั้งค่า (บล็อกถ้าตั้งค่าที่ทำให้ระบบพัง)
npm run build:hospital     สร้างหน้าไทยใหม่ (ต้องรันหลังแก้ views/default.handlebars)
node scripts/allow-subnet.js list                   ดูวงที่อนุญาต
node scripts/allow-subnet.js add 192.168.x.0/24     เพิ่มวงเครือข่าย (แล้วต้องรีสตาร์ตเซิร์ฟเวอร์)
```

**ไฟล์ใน `public/scripts/` ไม่ต้องรีสตาร์ตเซิร์ฟเวอร์** เบราว์เซอร์ดึงใหม่เอง แต่กด **Ctrl+Shift+R** เพื่อล้างแคช

**เมื่อออกรุ่นโมดูลเอเจนต์ใหม่** ต้องแก้เลขรุ่นให้ตรงกันทั้ง `hospital/release.json` และ `meshCoreObj.scpRelease` ใน `agents/meshcore.js` (มีเทสต์ตรวจ)

## Fiscal-year plans (Claude, 2026-10-12)

- Plan years are Thai fiscal years (1 Oct – 30 Sep). `ScpPriceReference.fiscalYearBE(date)` is the one helper; `resolveCriteria` defaults `budgetYearBE` to the current fiscal year, and a saved year that has already passed is treated as stale and moves on to the current one.
- Both assessors count replacement years and survival keys from `budgetYearBE − 543` (not the calendar year); age still uses the calendar year. Upgrades are budgeted in the current fiscal year; the printout now says so ("อัปเกรดเครื่องเดิมในปีงบประมาณ 2570 … คาดว่าจะต้องเปลี่ยนเครื่องใหม่ราวปีงบประมาณ 2572").
- Previously an upgrade plan printed calendar 2026 + 2 → "2571" next to the budget, which read as the wrong budget year; machines to keep could land in "2570" from calendar arithmetic.
- The FY 2570 draft-price tests assume the current fiscal year is 2570; update them with the FY 2571 price edition.

## Cartoon map style (Claude, 2026-10-12)

- `public/scripts/scp-map-anime.js` adds a 2.5D anime look to the map; `scp-map.js` calls it only while `map.anime` is on (✨ button, pref `scpMapStyle`, default `anime`; `classic` = the old look).
- Static layer: pastel cel-shaded buildings with violet outlines, glass windows by day, grass island with flowers, pastel indoor walls, warm tint morning/late afternoon.
- Per frame: trees that sway (green, pink ชมพูพันธุ์ทิพย์, yellow ราชพฤกษ์; depth-sorted with people and cars, hidden behind buildings), clouds and their shadows (fade out as you zoom in), petals, birds; stars and fireflies at night; sunbeams and strolling patients in floor-plan waiting areas; faces on screens (happy/blinking = on, glancing + typing bubble = in use, asleep with z's = off, sweat drop = serious risk). Desks grow with zoom in this style.
- Engine: smooth wheel/button zoom, flick-to-glide panning, eased building lift on hover, floor fade-in, `fit(true)` glides home. Frames run at display rate while each costs < 7 ms, else ~30 fps. Reduced motion: nothing moves, zoom is instant.
- Landmarks (cartoon style): car parks get bays, parked pastel cars and a P sign; the football pitch gets mown stripes, lines, goals and 10 players passing a ball; the court gets lines, hoops and 4 players dribbling; the Buddha statue (c_buddha) is a golden seated figure on a lotus and two-tier base with a breathing glow and sparkles; the flagpole (c_flag) flies a waving Thai flag by day (lowered at night). Avenue trees (pink and coconut palms) line the roads; gusts of wind roll across the trees, crowns wobble per part, and leaves blow off now and then.
- Hospital sign (c_sign): a white board in a pink frame on a plinth with a flower bed, lettered โรงพยาบาลสีชมพู / SICHOMPHU HOSPITAL with the pink cross logo; the text is laid on the face towards the viewer and always reads left to right; lit at night. Its floating map label is hidden in this style since the sign shows the name.

## Phones (Claude, 2026-10-13)

- Map on a phone (≤700 px): the map takes the screen; floor picker full width on top, view tabs under it, alert below; control buttons become one sideways-scrolling row along the bottom, the legend one line above them, the risk button above that; arranging by drag is hidden (needs a mouse).
- Remote screen on a phone (`scp-remote-ui.js`): two fingers pinch-zoom the picture up to 4× round the point between them and move it; one finger slides the zoomed picture; a tap is still a click (mapped via offsetX, so it stays exact when zoomed or scrolled). A "พอดีจอ · NNN%" button in the app bar fits it again. Nothing is sent to the remote PC — its own resolution is deliberately left alone so the person using it is not disturbed. `sharing.handlebars` was not touched (it has someone else's pending changes), so the Desktop App keeps its old script version tag.
- Full site on a phone (≤760 px): the left menu folds away behind a ☰ button in the masthead (scp-ui.js) and opens as a drawer over the page with a dimmed backdrop; choosing an item, tapping outside or Esc folds it. The page gets the full width.

## Central repair estimates (Codex, 2026-10-13)

- `hospital/ticket-estimates.js` implements `getTicketEstimate` / `saveTicketEstimate` through existing `scpops`. Estimates live in `scpticket.estimate` in the same DB write; device/domain access and ticket revision are checked, and the existing ticket queue is shared with status updates. History records estimate revision, author, time and total. No schema migration is needed.
- Price archive has ticket selection, explicit central save/load, local draft preservation on conflicts, and printing with ticket details. Ticket detail opens the archive to its estimate. The server derives citation snapshots from the local verified catalogue; manual parts remain quotations. At most 1,000 lines; amounts round to two decimals per line before summing. Older local drafts need an explicit ticket selection and save.
- Further research is in `hospital/reference-price-research.json`, included in the generated catalogue and shown in source details. General originals 2551–2552 and 2554 remain unverified. MOPH index mentions 60 items for 2554, but its PDF could not be verified; DMH PDF is the same GIS manual. Do not fill missing years with modern prices or label the GIS manual as the general edition.
- Build and 550 tests passed. Isolated real Chrome QA at 320/390/1440px, fresh-tab restore and one-page estimate PDF passed. No test records were written to production. User-authorized SCP service restart completed at about 17:11 Bangkok: old server PID 53680 stopped, new PID 48788 listens on 8443; HTTP checks and live assets passed. Cloudflared was left running.
