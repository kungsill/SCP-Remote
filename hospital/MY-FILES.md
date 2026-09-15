# ไฟล์ของฉัน — My Files

พื้นที่นี้เก็บไฟล์บนเซิร์ฟเวอร์ SCP-Remote เปิดแท็บ **ไฟล์ของฉัน** แล้วกด **อัปโหลด** หรือลากไฟล์มาวาง เลือกหลายไฟล์ได้ ระบบจะอัปโหลดตามคิวและแสดงสถานะแต่ละไฟล์:

- รออัปโหลด → กำลังอัปโหลดพร้อมเปอร์เซ็นต์ → กำลังบันทึกบนเซิร์ฟเวอร์ → อัปโหลดสำเร็จ
- เมื่อเซิร์ฟเวอร์ยืนยันว่าบันทึกแล้ว ไฟล์จะปรากฏในรายการทันที พร้อมขอรายการล่าสุดจากเซิร์ฟเวอร์
- หากไม่สำเร็จจะแสดงสาเหตุ เช่น พื้นที่เต็ม ชื่อซ้ำ หรือเซสชันหมดอายุ พร้อมปุ่มลองใหม่
- ชื่อซ้ำต้องยืนยันก่อนเขียนทับ หากเปลี่ยนโฟลเดอร์ระหว่างอัปโหลด ไฟล์ยังเข้าปลายทางที่เลือกไว้เดิม กดเปิดโฟลเดอร์ปลายทางจากแถวสถานะได้
- ประวัติสถานะอยู่จนกว่าจะล้างสถานะหรือโหลดหน้าใหม่ ส่วนไฟล์ที่บันทึกสำเร็จยังอยู่บนเซิร์ฟเวอร์

## ทำอะไรได้บ้าง

- อัปโหลดและดาวน์โหลดไฟล์ รวมถึงชื่อภาษาไทยและไฟล์ขนาด 0 ไบต์
- สร้างโฟลเดอร์ เปลี่ยนชื่อ ลบ คัดลอก และย้ายไฟล์ด้วยตัด/วาง ตามสิทธิ์ของบัญชี
- จัดเรียงตามชื่อ ขนาด หรือวันที่ และดูพื้นที่ที่ใช้เทียบกับโควตา
- แก้ไขไฟล์ข้อความขนาดเล็กผ่านปุ่มแก้ไขของระบบเดิม (ไม่เกิน 200 KiB)
- ใช้โฟลเดอร์ของกลุ่มอุปกรณ์ร่วมกันได้ตามสิทธิ์ที่ผู้ดูแลกำหนด
- ไฟล์ในโฟลเดอร์ **Public** มีลิงก์ดาวน์โหลดที่ไม่ต้องเข้าสู่ระบบ ผู้ที่เข้าถึงเซิร์ฟเวอร์และมีลิงก์เปิดได้ จึงไม่ใช่พื้นที่ส่วนตัว

**ไฟล์ของฉัน** ต่างจากแท็บ **ไฟล์** ของเครื่องลูก: ส่วนแรกเก็บบนเซิร์ฟเวอร์ ส่วนหลังใช้จัดการไฟล์บนคอมพิวเตอร์ที่เชื่อมต่อเอเจนต์ ยังไม่รองรับลากทั้งโฟลเดอร์มาอัปโหลด ให้สร้างโฟลเดอร์ปลายทางแล้วเลือกไฟล์ภายในแทน

## English

My Files stores files on the SCP-Remote server. Select multiple files or drag them into the file area. Each file shows Queued, Uploading (%), Saving on server, then Uploaded only after the server confirms storage. Successfully saved files appear immediately. Errors include a reason and a Retry button; replacing a duplicate requires confirmation. Uploads keep their originally selected destination even when you navigate elsewhere.

Existing actions include download, folders, rename, delete, copy/cut/paste, sorting, quota display, and editing small text files (up to 200 KiB), subject to permissions. Device-group folders follow group permissions. Public folder download links do not require sign-in for anyone who can reach the server. Upload status history lasts for the current page; saved files remain after reload. Whole-folder uploads are not supported. The device Files tab manages files on a connected remote computer instead.
