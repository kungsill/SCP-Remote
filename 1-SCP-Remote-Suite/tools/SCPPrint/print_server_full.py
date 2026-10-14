# -*- coding: utf-8 -*-
"""
SCPPrint — เวอร์ชัน 2.1
============================================================
โปรแกรมแชร์ปริ้นเตอร์ผ่านพอร์ต 9100 (แบบเดียวกับ print server ฮาร์ดแวร์)

ความสามารถ:
  - รองรับหลายปริ้นเตอร์/หลายพอร์ตในโปรแกรมเดียว (9100, 9101, 9102, ...)
  - แต่ละพอร์ตเลือกได้: ส่งตรงไปปริ้นเตอร์เน็ตเวิร์ก หรือส่งผ่านคิว Windows
  - ตารางจัดการ เพิ่ม/แก้ไข/ลบ + นับจำนวนงานแยกรายพอร์ต
  - จำค่าทั้งหมด เก็บใน %LOCALAPPDATA%\\SCPPrint\\config.json
  - แสดง path ที่เก็บ config บนหน้าจอ + ปุ่มเปิดโฟลเดอร์ข้อมูล
  - log แยกไฟล์รายวัน เก็บ 15 วัน (ลบเก่าอัตโนมัติ)
  - เริ่มอัตโนมัติเมื่อเปิด / เปิดพร้อม Windows / เปิดแบบย่อลงถาดระบบ
  - กด X = ย่อลงถาดระบบ (เซิร์ฟเวอร์ทำงานต่อ) / กันเปิดโปรแกรมซ้อน
  - รับงานเฉพาะวง LAN + จำกัดขนาดงาน (ความปลอดภัย)
  - แท็บ "หลัก": เพิ่มปริ้นเตอร์ 1 ปุ่ม — ตั้ง Firewall + Windows Defender
    exception + อัปเดตสคริปต์ติดตั้งเครื่องลูกให้อัตโนมัติในคลิกเดียว
  - แท็บ "จัดการ/อัปเดต": แก้ไข/ลบรายการ, log, ตัวเลือกอื่นๆ

ติดตั้งไลบรารี:  pip install pywin32 pystray pillow
สร้าง .exe:      ใช้ build.bat
"""

import ctypes
import datetime
import ipaddress
import json
import os
import shutil
import socket
import sys
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog

try:
    import win32print
except ImportError:
    win32print = None

try:
    import winreg
except ImportError:
    winreg = None

try:
    import pystray
    from PIL import Image, ImageDraw
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False


# ============================================================
#  ค่าคงที่
# ============================================================
APP_TITLE = "SCPPrint"
FIREWALL_RULE = "SCPPrint"
REG_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
REG_RUN_NAME = "SCPPrint"
BUFFER_SIZE = 65536

# ความปลอดภัย
LAN_ONLY = True                       # รับงานเฉพาะเครื่องในวง LAN
MAX_JOB_BYTES = 200 * 1024 * 1024     # จำกัดงานสูงสุด 200 MB (โหมดคิว Windows)

# log
LOG_KEEP_DAYS = 15                    # เก็บ log ย้อนหลังกี่วัน


# ============================================================
#  ตำแหน่งเก็บไฟล์ (config / log)
# ============================================================
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))


def _pick_data_dir():
    """เลือกโฟลเดอร์เก็บข้อมูลที่เขียนได้จริง แล้วคืน (path, ข้อความอธิบาย)"""
    candidates = []
    for env in ("LOCALAPPDATA", "APPDATA"):
        base = os.environ.get(env)
        if base:
            candidates.append(os.path.join(base, "SCPPrint"))
    # เผื่อ env หาย: ใช้โฟลเดอร์ home ของผู้ใช้
    candidates.append(os.path.join(os.path.expanduser("~"), "SCPPrint"))
    # ท้ายสุด: ข้างตัวโปรแกรม
    candidates.append(APP_DIR)

    for d in candidates:
        try:
            os.makedirs(d, exist_ok=True)
            test = os.path.join(d, ".writetest")
            with open(test, "w") as f:
                f.write("ok")
            os.remove(test)
            return d
        except OSError:
            continue
    return APP_DIR


DATA_DIR = _pick_data_dir()
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
LOG_DIR = os.path.join(DATA_DIR, "logs")
try:
    os.makedirs(LOG_DIR, exist_ok=True)
except OSError:
    LOG_DIR = DATA_DIR


def current_log_path() -> str:
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    return os.path.join(LOG_DIR, f"printserver-{today}.log")


def purge_old_logs():
    """ลบไฟล์ log ที่เก่ากว่า LOG_KEEP_DAYS วัน (นับเป็นวันเต็ม)"""
    cutoff = datetime.date.today() - datetime.timedelta(days=LOG_KEEP_DAYS)
    try:
        for name in os.listdir(LOG_DIR):
            if not (name.startswith("printserver-")
                    and name.endswith(".log")):
                continue
            datestr = name[len("printserver-"):-len(".log")]
            try:
                d = datetime.datetime.strptime(datestr, "%Y-%m-%d").date()
            except ValueError:
                continue
            if d < cutoff:
                try:
                    os.remove(os.path.join(LOG_DIR, name))
                except OSError:
                    pass
    except OSError:
        pass


def _migrate_old_files():
    """ย้ายไฟล์จากเวอร์ชันเก่ามาที่ใหม่ ถ้ามี"""
    # config เก่าข้างตัวโปรแกรม
    old_cfg = os.path.join(APP_DIR, "config.json")
    if os.path.exists(old_cfg) and not os.path.exists(CONFIG_PATH):
        try:
            shutil.copy2(old_cfg, CONFIG_PATH)
        except OSError:
            pass
    # log เดี่ยวแบบเก่า
    for folder in (DATA_DIR, APP_DIR):
        old_log = os.path.join(folder, "printserver.log")
        if os.path.exists(old_log):
            dest = os.path.join(LOG_DIR, "printserver-legacy.log")
            if not os.path.exists(dest):
                try:
                    shutil.copy2(old_log, dest)
                except OSError:
                    pass


_migrate_old_files()


# ============================================================
#  ไอคอน
# ============================================================
def _resource_path(name):
    base = getattr(sys, "_MEIPASS", APP_DIR)
    for folder in (base, APP_DIR):
        p = os.path.join(folder, name)
        if os.path.exists(p):
            return p
    return os.path.join(APP_DIR, name)


ICON_PNG = _resource_path("hashcat-32px.png")
ICON_ICO = _resource_path("hashcat.ico")


# ============================================================
#  ฟังก์ชันช่วยเหลือ
# ============================================================
def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "ไม่พบ"


def is_lan_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local
    except ValueError:
        return True


def is_valid_ip(ip: str) -> bool:
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


def mapping_desc(m: dict) -> str:
    if m["mode"] == "direct":
        return f"ส่งตรง → {m['printer_ip']}:{m['printer_port']}"
    return f"คิว Windows → {m['printer_name']}"


def _ps_quote(s: str) -> str:
    """ครอบสตริงด้วย "" แบบ PowerShell กันอักขระพิเศษหลุด syntax
    (ต้อง escape backtick ก่อน แล้วค่อย " แล้วค่อย $ — ถ้าไม่ escape $
    ชื่อไดรเวอร์ที่มี $(...) จะถูก PowerShell รันเป็นคำสั่งจริงตอนเปิดสคริปต์)"""
    return ('"' + s.replace("`", "``").replace('"', '`"')
            .replace("$", "`$") + '"')


def build_client_install_script(mappings, server_ip: str) -> str:
    """สร้างเนื้อหาสคริปต์ PowerShell สำหรับติดตั้งพอร์ต+ปริ้นเตอร์ที่เครื่องลูก"""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "# " + "=" * 60,
        f"#  สคริปต์ติดตั้งเครื่องพิมพ์ฝั่งเครื่องลูก — สร้างโดย {APP_TITLE}",
        f"#  เซิร์ฟเวอร์: {server_ip}    สร้างเมื่อ: {now}",
        "# " + "=" * 60,
        "#  วิธีใช้:",
        "#   1) คัดลอกไฟล์นี้ไปที่เครื่องลูก",
        "#   2) คลิกขวาไฟล์ -> Run with PowerShell (หรือรันใน PowerShell "
        "แบบ Run as Administrator)",
        "#   3) ถ้าบรรทัดไหนมี # นำหน้า Add-Printer และมี "
        "<ใส่ชื่อไดรเวอร์ตรงนี้> แปลว่ายังไม่ได้ระบุชื่อไดรเวอร์ไว้ล่วงหน้า",
        "#      ให้รัน  Get-PrinterDriver  ดูชื่อไดรเวอร์ที่มีอยู่ในเครื่องนี้ก่อน "
        "แล้วแก้บรรทัดนั้นเอง (ลบ # ออกด้วย)",
        "# " + "=" * 60,
        "",
    ]

    for m in sorted(mappings, key=lambda x: x["listen_port"]):
        port = m["listen_port"]
        driver_name = (m.get("driver_name") or "").strip()
        port_name = f"SCPPrint_{port}"
        lines.append(f"# --- พอร์ต {port}: {mapping_desc(m)} ---")
        lines.append(
            f"Add-PrinterPort -Name {_ps_quote(port_name)} "
            f"-PrinterHostAddress {_ps_quote(server_ip)} -PortNumber {port}"
        )
        if driver_name:
            printer_label = f"{driver_name} (Port {port})"
            lines.append(
                f"Add-Printer -Name {_ps_quote(printer_label)} "
                f"-DriverName {_ps_quote(driver_name)} "
                f"-PortName {_ps_quote(port_name)}"
            )
        else:
            printer_label = f"เครื่องพิมพ์พอร์ต {port}"
            lines.append(
                "# TODO: ใส่ชื่อไดรเวอร์ที่ตรงกับปริ้นเตอร์ปลายทางของพอร์ตนี้ "
                "แล้วลบ # ออกจากบรรทัดด้านล่าง"
            )
            lines.append(
                f"# Add-Printer -Name {_ps_quote(printer_label)} "
                f"-DriverName \"<ใส่ชื่อไดรเวอร์ตรงนี้>\" "
                f"-PortName {_ps_quote(port_name)}"
            )
        lines.append("")

    return "\n".join(lines)


# ============================================================
#  เซิร์ฟเวอร์ 1 ตัว ต่อ 1 พอร์ต
# ============================================================
class PortServer:
    def __init__(self, mapping: dict, log_func, job_done_func):
        self.m = mapping
        self.log = log_func
        self.job_done = job_done_func
        self.sock = None
        self.running = False

    @property
    def port(self):
        return self.m["listen_port"]

    def start(self) -> bool:
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            # ไม่ใช้ SO_REUSEADDR — กันเปิดโปรแกรมซ้อนแล้วแย่งพอร์ตเงียบ ๆ
            self.sock.bind(("0.0.0.0", self.port))
            self.sock.listen(5)
            self.sock.settimeout(1.0)
        except OSError as e:
            self.log(f"[{self.port}] เปิดพอร์ตไม่ได้: {e} "
                     f"(อาจมีโปรแกรมอื่น/ตัวเก่าใช้พอร์ตนี้อยู่)")
            self.sock = None
            return False
        self.running = True
        threading.Thread(target=self._accept_loop, daemon=True).start()
        self.log(f"[{self.port}] เริ่มทำงาน — {mapping_desc(self.m)}")
        return True

    def stop(self):
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def _accept_loop(self):
        while self.running:
            try:
                conn, addr = self.sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=self._handle_client,
                             args=(conn, addr), daemon=True).start()

    def _handle_client(self, conn, addr):
        ip = addr[0]
        if LAN_ONLY and not is_lan_ip(ip):
            self.log(f"[{self.port}] ปฏิเสธการเชื่อมต่อจาก {ip} "
                     f"(ไม่ได้อยู่ในวง LAN)")
            try:
                conn.close()
            except OSError:
                pass
            return

        self.log(f"[{self.port}] มีการเชื่อมต่อจาก {ip}")

        if self.m["mode"] == "direct":
            self._relay_direct(conn, ip)
            return

        chunks, total, oversize = [], 0, False
        try:
            conn.settimeout(30)
            while True:
                data = conn.recv(BUFFER_SIZE)
                if not data:
                    break
                chunks.append(data)
                total += len(data)
                if total > MAX_JOB_BYTES:
                    oversize = True
                    break
        except socket.timeout:
            self.log(f"[{self.port}] {ip} เงียบเกินเวลา — ใช้ข้อมูลเท่าที่ได้รับ")
        except OSError as e:
            self.log(f"[{self.port}] รับข้อมูลจาก {ip} มีปัญหา: {e}")
        finally:
            conn.close()

        if oversize:
            self.log(f"[{self.port}] ยกเลิกงานจาก {ip} — ใหญ่เกิน "
                     f"{MAX_JOB_BYTES // (1024*1024)} MB")
            return
        if total == 0:
            self.log(f"[{self.port}] {ip} ไม่ได้ส่งข้อมูล (อาจแค่เช็กพอร์ต)")
            return

        self.log(f"[{self.port}] รับจาก {ip} ครบ {total:,} bytes "
                 f"กำลังส่งไปพิมพ์...")
        try:
            self._send_to_spooler(b"".join(chunks), ip)
            self.job_done(self.port)
        except Exception as e:
            self.log(f"[{self.port}] ส่งเข้าปริ้นเตอร์ไม่สำเร็จ: {e}")

    def _relay_direct(self, client_conn, client_ip):
        total = 0
        try:
            printer_conn = socket.create_connection(
                (self.m["printer_ip"], int(self.m["printer_port"])),
                timeout=10)
        except OSError as e:
            self.log(f"[{self.port}] ต่อปริ้นเตอร์ "
                     f"{self.m['printer_ip']}:{self.m['printer_port']} "
                     f"ไม่ได้: {e}")
            client_conn.close()
            return

        try:
            client_conn.settimeout(30)
            printer_conn.settimeout(30)
            while True:
                data = client_conn.recv(BUFFER_SIZE)
                if not data:
                    break
                printer_conn.sendall(data)
                total += len(data)
        except socket.timeout:
            self.log(f"[{self.port}] {client_ip} เงียบเกินเวลา — "
                     f"ส่งข้อมูลเท่าที่ได้รับ")
        except OSError as e:
            self.log(f"[{self.port}] ส่งต่อข้อมูลมีปัญหา: {e}")
        finally:
            client_conn.close()
            try:
                printer_conn.shutdown(socket.SHUT_WR)
            except OSError:
                pass
            printer_conn.close()

        if total > 0:
            self.log(f"[{self.port}] ส่งต่อจาก {client_ip} ไปยัง "
                     f"{self.m['printer_ip']} แล้ว {total:,} bytes")
            self.job_done(self.port)
        else:
            self.log(f"[{self.port}] {client_ip} ไม่ได้ส่งข้อมูล "
                     f"(อาจแค่เช็กพอร์ต)")

    def _send_to_spooler(self, data: bytes, client_ip: str):
        hprinter = win32print.OpenPrinter(self.m["printer_name"])
        try:
            job_info = (f"RAW{self.port} from {client_ip}", None, "RAW")
            job_id = win32print.StartDocPrinter(hprinter, 1, job_info)
            try:
                win32print.StartPagePrinter(hprinter)
                win32print.WritePrinter(hprinter, data)
                win32print.EndPagePrinter(hprinter)
            finally:
                win32print.EndDocPrinter(hprinter)
            self.log(f"[{self.port}] ส่งงานเข้า '{self.m['printer_name']}' "
                     f"แล้ว (Job {job_id})")
        finally:
            win32print.ClosePrinter(hprinter)


# ============================================================
#  หน้าต่างเพิ่ม/แก้ไขรายการ
# ============================================================
class MappingDialog(tk.Toplevel):
    """หน้าต่างแก้ไขรายการปริ้นเตอร์ที่มีอยู่แล้ว (การเพิ่มใหม่ทำผ่านแท็บ
    "หลัก" โดยตรง ไม่ต้องเปิดหน้าต่างนี้)"""

    def __init__(self, parent, printers, mapping=None, used_ports=None):
        super().__init__(parent)
        self.title("แก้ไขปริ้นเตอร์")
        self.resizable(False, False)
        self.grab_set()
        self.result = None
        self.used_ports = used_ports or set()

        self.var_mode = tk.StringVar(
            value=(mapping or {}).get("mode", "direct"))

        frm = ttk.Frame(self)
        frm.pack(fill="both", expand=True, padx=10, pady=10)

        ttk.Label(frm, text="พอร์ตรับงาน (เช่น 9100, 9101):").grid(
            row=0, column=0, sticky="w", pady=4)
        self.ent_listen = ttk.Entry(frm, width=10)
        self.ent_listen.grid(row=0, column=1, sticky="w", pady=4)
        self.ent_listen.insert(0, str((mapping or {}).get("listen_port", "")))

        ttk.Separator(frm).grid(row=1, column=0, columnspan=2,
                                sticky="we", pady=6)

        ttk.Radiobutton(frm, text="ส่งตรงไปปริ้นเตอร์เน็ตเวิร์ก (มี IP ตัวเอง)",
                        variable=self.var_mode, value="direct",
                        command=self._update_state).grid(
                            row=2, column=0, columnspan=2, sticky="w")
        f1 = ttk.Frame(frm)
        f1.grid(row=3, column=0, columnspan=2, sticky="w", padx=20)
        ttk.Label(f1, text="IP:").pack(side="left")
        self.ent_ip = ttk.Entry(f1, width=16)
        self.ent_ip.pack(side="left", padx=4)
        self.ent_ip.insert(0, (mapping or {}).get("printer_ip", ""))
        ttk.Label(f1, text="พอร์ต:").pack(side="left")
        self.ent_pport = ttk.Entry(f1, width=7)
        self.ent_pport.pack(side="left", padx=4)
        self.ent_pport.insert(0, str((mapping or {}).get("printer_port",
                                                         "9100")))

        ttk.Radiobutton(frm,
                        text="ส่งผ่านคิว Windows (ปริ้นเตอร์ USB ในเครื่องนี้)",
                        variable=self.var_mode, value="spooler",
                        command=self._update_state).grid(
                            row=4, column=0, columnspan=2, sticky="w",
                            pady=(8, 0))
        self.cbo_printer = ttk.Combobox(frm, state="readonly", width=40,
                                        values=printers)
        self.cbo_printer.grid(row=5, column=0, columnspan=2,
                              sticky="w", padx=20, pady=(2, 8))
        name = (mapping or {}).get("printer_name", "")
        if name in printers:
            self.cbo_printer.set(name)
        elif printers:
            self.cbo_printer.current(0)

        ttk.Separator(frm).grid(row=6, column=0, columnspan=2,
                                sticky="we", pady=6)
        ttk.Label(frm, text="ชื่อไดรเวอร์ (สำหรับสคริปต์ติดตั้งเครื่องลูก, ไม่บังคับ):").grid(
            row=7, column=0, columnspan=2, sticky="w")
        self.ent_driver = ttk.Entry(frm, width=42)
        self.ent_driver.grid(row=8, column=0, columnspan=2, sticky="w",
                             pady=(2, 4))
        self.ent_driver.insert(0, (mapping or {}).get("driver_name", ""))

        fbtn = ttk.Frame(frm)
        fbtn.grid(row=9, column=0, columnspan=2, pady=(8, 2))
        ttk.Button(fbtn, text="ตกลง", width=10,
                   command=self._ok).pack(side="left", padx=6)
        ttk.Button(fbtn, text="ยกเลิก", width=10,
                   command=self.destroy).pack(side="left", padx=6)

        self._update_state()
        self.ent_listen.focus()

    def _update_state(self):
        direct = self.var_mode.get() == "direct"
        self.ent_ip.config(state="normal" if direct else "disabled")
        self.ent_pport.config(state="normal" if direct else "disabled")
        self.cbo_printer.config(state="disabled" if direct else "readonly")

    def _ok(self):
        try:
            listen_port = int(self.ent_listen.get().strip())
            if not (1 <= listen_port <= 65535):
                raise ValueError
        except ValueError:
            messagebox.showwarning(APP_TITLE,
                                   "พอร์ตรับงานต้องเป็นตัวเลข 1–65535",
                                   parent=self)
            return
        if listen_port in self.used_ports:
            messagebox.showwarning(APP_TITLE,
                                   f"พอร์ต {listen_port} ถูกใช้ในตารางแล้ว",
                                   parent=self)
            return

        mode = self.var_mode.get()
        driver_name = self.ent_driver.get().strip()
        if mode == "direct":
            ip = self.ent_ip.get().strip()
            if not ip:
                messagebox.showwarning(APP_TITLE, "กรุณาใส่ IP ปริ้นเตอร์",
                                       parent=self)
                return
            if not is_valid_ip(ip):
                messagebox.showwarning(APP_TITLE,
                                       f"'{ip}' ไม่ใช่รูปแบบ IP ที่ถูกต้อง",
                                       parent=self)
                return
            try:
                pport = int(self.ent_pport.get().strip() or "9100")
                if not (1 <= pport <= 65535):
                    raise ValueError
            except ValueError:
                messagebox.showwarning(APP_TITLE,
                                       "พอร์ตปริ้นเตอร์ต้องเป็นตัวเลข",
                                       parent=self)
                return
            if pport == listen_port and ip in ("127.0.0.1", get_lan_ip()):
                messagebox.showwarning(APP_TITLE,
                                       "IP ชี้กลับมาเครื่องนี้เอง จะวนลูป",
                                       parent=self)
                return
            self.result = {"listen_port": listen_port, "mode": "direct",
                           "printer_ip": ip, "printer_port": pport,
                           "printer_name": "", "driver_name": driver_name}
        else:
            name = self.cbo_printer.get().strip()
            if not name:
                messagebox.showwarning(APP_TITLE, "กรุณาเลือกปริ้นเตอร์",
                                       parent=self)
                return
            self.result = {"listen_port": listen_port, "mode": "spooler",
                           "printer_name": name,
                           "printer_ip": "", "printer_port": 9100,
                           "driver_name": driver_name}
        self.destroy()


# ============================================================
#  หน้าจอหลัก
# ============================================================
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("700x680")
        self.minsize(660, 620)
        self._set_window_icon()

        self.mappings = []
        self.servers = []
        self.counts = {}
        self.tray_icon = None
        self._last_purge_day = None

        self.var_autostart_server = tk.BooleanVar(value=False)
        self.var_start_with_windows = tk.BooleanVar(value=False)
        self.var_start_minimized = tk.BooleanVar(value=False)

        self._build_ui()
        self._load_config()
        self._refresh_tree()
        self._auto_update_client_script()
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        # log บอกที่เก็บข้อมูลไว้ตั้งแต่เริ่ม เพื่อวินิจฉัยง่าย
        self.log(f"เก็บข้อมูลที่: {DATA_DIR}")
        if win32print is None:
            self.log("ยังไม่ได้ติดตั้ง pywin32 — โหมดคิว Windows จะใช้ไม่ได้")

        if self.var_autostart_server.get() and self.mappings:
            self.after(500, self._auto_start)
        if (self.var_start_minimized.get() and TRAY_AVAILABLE
                and self.var_autostart_server.get() and self.mappings):
            self.after(1200, self._hide_to_tray)

    # ---------- ไอคอน ----------
    def _set_window_icon(self):
        try:
            if os.path.exists(ICON_ICO):
                self.iconbitmap(ICON_ICO)
                return
        except Exception:
            pass
        try:
            if os.path.exists(ICON_PNG):
                self._icon_img = tk.PhotoImage(file=ICON_PNG)
                self.iconphoto(True, self._icon_img)
        except Exception:
            pass

    # ---------- UI ----------
    def _build_ui(self):
        pad = {"padx": 10, "pady": 5}

        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=8)

        tab_main = ttk.Frame(nb)
        tab_manage = ttk.Frame(nb)
        nb.add(tab_main, text="หลัก")
        nb.add(tab_manage, text="จัดการ / อัปเดต")

        self._build_main_tab(tab_main, pad)
        self._build_manage_tab(tab_manage, pad)

    def _build_main_tab(self, parent, pad):
        frm_info = ttk.Frame(parent)
        frm_info.pack(fill="x", padx=12, pady=(10, 4))
        ttk.Label(frm_info, text="IP เครื่องนี้:").pack(side="left")
        ttk.Label(frm_info, text=get_lan_ip(),
                  font=("Segoe UI", 10, "bold"),
                  foreground="#0066cc").pack(side="left", padx=6)

        frm_add = ttk.LabelFrame(parent, text="เพิ่มปริ้นเตอร์ใหม่")
        frm_add.pack(fill="x", **pad)

        self.qvar_mode = tk.StringVar(value="direct")

        self.qrad_direct = ttk.Radiobutton(
            frm_add, text="เครือข่าย (มี IP ตัวเอง)",
            variable=self.qvar_mode, value="direct",
            command=self._quick_update_state)
        self.qrad_direct.grid(row=0, column=0, sticky="w", padx=8,
                             pady=(8, 0))

        f1 = ttk.Frame(frm_add)
        f1.grid(row=1, column=0, sticky="w", padx=28)
        ttk.Label(f1, text="IP:").pack(side="left")
        self.qent_ip = ttk.Entry(f1, width=16)
        self.qent_ip.pack(side="left", padx=4)
        ttk.Label(f1, text="พอร์ต:").pack(side="left")
        self.qent_pport = ttk.Entry(f1, width=7)
        self.qent_pport.pack(side="left", padx=4)
        self.qent_pport.insert(0, "9100")
        self.btn_test_conn = ttk.Button(f1, text="ทดสอบการเชื่อมต่อ",
                                        command=self._quick_test_connection)
        self.btn_test_conn.pack(side="left", padx=8)

        self.qrad_spooler = ttk.Radiobutton(
            frm_add, text="USB (ปริ้นเตอร์ในเครื่องนี้)",
            variable=self.qvar_mode, value="spooler",
            command=self._quick_update_state)
        self.qrad_spooler.grid(row=2, column=0, sticky="w", padx=8,
                              pady=(8, 0))

        f2 = ttk.Frame(frm_add)
        f2.grid(row=3, column=0, sticky="w", padx=28)
        self.qcbo_printer = ttk.Combobox(f2, state="readonly", width=32,
                                         values=self._get_printers())
        self.qcbo_printer.pack(side="left")
        ttk.Button(f2, text="รีเฟรช", width=8,
                   command=self._refresh_quick_printers).pack(
                       side="left", padx=4)

        ttk.Separator(frm_add).grid(row=4, column=0, sticky="we",
                                    padx=8, pady=8)

        f3 = ttk.Frame(frm_add)
        f3.grid(row=5, column=0, sticky="w", padx=8)
        ttk.Label(f3, text="พอร์ตรับงาน (สำหรับเครื่องลูก):").pack(side="left")
        self.qent_listen = ttk.Entry(f3, width=8)
        self.qent_listen.pack(side="left", padx=4)
        self.qent_listen.insert(0, "9100")

        f4 = ttk.Frame(frm_add)
        f4.grid(row=6, column=0, sticky="w", padx=8, pady=(4, 0))
        ttk.Label(f4, text="ชื่อไดรเวอร์ (ไม่บังคับ):").pack(side="left")
        self.qent_driver = ttk.Entry(f4, width=34)
        self.qent_driver.pack(side="left", padx=4)

        self.qvar_auto_perm = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            frm_add,
            text="ตั้งค่า Firewall/Defender ทันทีตอนเพิ่ม",
            variable=self.qvar_auto_perm).grid(
                row=7, column=0, sticky="w", padx=8, pady=(8, 0))
        ttk.Label(
            frm_add, foreground="gray",
            text="(ปลดติ๊กชั่วคราวถ้าจะเพิ่มหลายเครื่องรวด แล้วค่อยกดปุ่ม "
                 "ตั้งค่าครั้งเดียวที่แท็บ 'จัดการ' หลังเพิ่มครบ)",
            wraplength=520, justify="left").grid(
                row=8, column=0, sticky="w", padx=8)

        self.btn_quick_add = ttk.Button(
            frm_add,
            text="+  เพิ่มปริ้นเตอร์",
            command=self._quick_add)
        self.btn_quick_add.grid(row=9, column=0, pady=10)

        self.lbl_quick_status = ttk.Label(frm_add, text="", foreground="gray",
                                          wraplength=520, justify="left")
        self.lbl_quick_status.grid(row=10, column=0, sticky="w",
                                   padx=8, pady=(0, 8))

        self.lbl_count = ttk.Label(
            parent, foreground="gray",
            text="มีปริ้นเตอร์อยู่ในระบบ: 0 รายการ "
                 "(ดู/แก้ไข/ลบได้ที่แท็บ 'จัดการ / อัปเดต')")
        self.lbl_count.pack(fill="x", padx=12, pady=(0, 8))

        frm_ctrl = ttk.LabelFrame(parent, text="ควบคุมเซิร์ฟเวอร์")
        frm_ctrl.pack(fill="x", **pad)
        self.btn_toggle = ttk.Button(frm_ctrl, text="▶  เริ่มทำงานทั้งหมด",
                                     command=self.toggle_server)
        self.btn_toggle.pack(side="left", padx=8, pady=8)
        self.lbl_status = ttk.Label(frm_ctrl, text="สถานะ: หยุดอยู่",
                                    foreground="red")
        self.lbl_status.pack(side="left", padx=15)

        self._quick_update_state()

    def _build_manage_tab(self, parent, pad):
        frm_map = ttk.LabelFrame(
            parent, text="รายการปริ้นเตอร์ (พอร์ตรับงาน → ปลายทาง)")
        frm_map.pack(fill="x", **pad)

        cols = ("port", "dest", "count")
        self.tree = ttk.Treeview(frm_map, columns=cols, show="headings",
                                 height=5)
        self.tree.heading("port", text="พอร์ตรับงาน")
        self.tree.heading("dest", text="ปลายทาง")
        self.tree.heading("count", text="งานพิมพ์")
        self.tree.column("port", width=90, anchor="center")
        self.tree.column("dest", width=350)
        self.tree.column("count", width=80, anchor="center")
        self.tree.pack(side="left", fill="both", expand=True,
                       padx=(8, 0), pady=8)

        sb = ttk.Scrollbar(frm_map, orient="vertical",
                           command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="left", fill="y", pady=8)

        fbtn = ttk.Frame(frm_map)
        fbtn.pack(side="left", fill="y", padx=8, pady=8)
        self.btn_edit = ttk.Button(fbtn, text="แก้ไข", width=9,
                                   command=self._edit_mapping)
        self.btn_edit.pack(pady=2)
        self.btn_del = ttk.Button(fbtn, text="ลบ", width=9,
                                  command=self._del_mapping)
        self.btn_del.pack(pady=2)

        frm_opt = ttk.LabelFrame(parent, text="ตัวเลือก")
        frm_opt.pack(fill="x", **pad)
        ttk.Checkbutton(frm_opt,
                        text="เริ่มเซิร์ฟเวอร์อัตโนมัติเมื่อเปิดโปรแกรม",
                        variable=self.var_autostart_server,
                        command=self._save_config).pack(anchor="w",
                                                        padx=8, pady=3)
        ttk.Checkbutton(frm_opt, text="เปิดโปรแกรมนี้พร้อม Windows",
                        variable=self.var_start_with_windows,
                        command=self._apply_start_with_windows).pack(
                            anchor="w", padx=8, pady=3)
        ttk.Checkbutton(
            frm_opt,
            text="เปิดแบบย่อลงถาดระบบทันที (ทำงานเงียบ ๆ ไม่เด้งหน้าต่าง)",
            variable=self.var_start_minimized,
            command=self._save_config).pack(anchor="w", padx=8, pady=3)
        ttk.Button(
            frm_opt,
            text="ตั้งค่า Firewall + Windows Defender ใหม่ (ขอสิทธิ์ Admin)",
            command=self._apply_windows_permissions).pack(
                anchor="w", padx=8, pady=(3, 0))
        ttk.Button(
            frm_opt,
            text="สร้างสคริปต์ติดตั้งเครื่องลูก (.ps1) — บันทึกที่อื่น",
            command=self._generate_client_script).pack(
                anchor="w", padx=8, pady=(3, 8))

        frm_log = ttk.LabelFrame(parent, text="บันทึกการทำงาน (Log)")
        frm_log.pack(fill="both", expand=True, **pad)
        self.txt_log = scrolledtext.ScrolledText(frm_log, height=8,
                                                 state="disabled",
                                                 font=("Consolas", 9))
        self.txt_log.pack(fill="both", expand=True, padx=6, pady=6)

        # แถบล่าง: แสดง path ที่เก็บข้อมูล + ปุ่มเปิดโฟลเดอร์
        frm_data = ttk.Frame(parent)
        frm_data.pack(fill="x", padx=12, pady=(0, 4))
        ttk.Label(frm_data, text="ข้อมูล/ค่าที่บันทึกอยู่ที่:",
                  foreground="gray").pack(side="left")
        ttk.Label(frm_data, text=DATA_DIR, foreground="gray").pack(
            side="left", padx=4)
        ttk.Button(frm_data, text="เปิดโฟลเดอร์",
                   command=self._open_data_dir).pack(side="right")

        ttk.Label(parent, foreground="gray",
                  text="เครื่องอื่น: Add Printer → TCP/IP Port → IP เครื่องนี้ + "
                       "เลขพอร์ตตามตาราง → ไดรเวอร์ตรงรุ่นของพอร์ตนั้น").pack(
                           fill="x", padx=12, pady=(0, 2))
        ttk.Label(parent, foreground="gray",
                  text="สคริปต์ติดตั้งเครื่องลูก (install-client-printer.ps1) "
                       "จะปรับปรุงอัตโนมัติทุกครั้งที่แก้ตาราง — "
                       "อยู่ในโฟลเดอร์ข้อมูลด้านบน").pack(
                           fill="x", padx=12, pady=(0, 8))

    def _open_data_dir(self):
        try:
            os.startfile(DATA_DIR)   # Windows เท่านั้น
        except Exception as e:
            messagebox.showinfo(APP_TITLE, f"โฟลเดอร์ข้อมูล:\n{DATA_DIR}\n\n"
                                           f"(เปิดอัตโนมัติไม่ได้: {e})")

    def _refresh_tree(self):
        self.tree.delete(*self.tree.get_children())
        for m in sorted(self.mappings, key=lambda x: x["listen_port"]):
            port = m["listen_port"]
            self.tree.insert("", "end", iid=str(port),
                             values=(port, mapping_desc(m),
                                     self.counts.get(port, 0)))
        self.lbl_count.config(
            text=f"มีปริ้นเตอร์อยู่ในระบบ: {len(self.mappings)} รายการ "
                 "(ดู/แก้ไข/ลบได้ที่แท็บ 'จัดการ / อัปเดต')")

    def _get_printers(self):
        if win32print is None:
            return []
        return [p[2] for p in win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL |
            win32print.PRINTER_ENUM_CONNECTIONS)]

    # ---------- เพิ่มแบบเร็ว (แท็บ "หลัก") ----------
    def _refresh_quick_printers(self):
        self.qcbo_printer["values"] = self._get_printers()

    def _quick_update_state(self):
        """เปิด/ปิดช่องกรอกในแท็บหลัก ตามโหมดที่เลือก และล็อกทั้งหมด
        ถ้าเซิร์ฟเวอร์กำลังทำงานอยู่ (แก้ตารางระหว่างรันไม่ได้)"""
        if self.servers:
            for w in (self.qent_ip, self.qent_pport, self.qcbo_printer,
                     self.qent_listen, self.qent_driver,
                     self.qrad_direct, self.qrad_spooler,
                     self.btn_quick_add, self.btn_test_conn):
                w.config(state="disabled")
            return
        direct = self.qvar_mode.get() == "direct"
        self.qent_ip.config(state="normal" if direct else "disabled")
        self.qent_pport.config(state="normal" if direct else "disabled")
        self.qcbo_printer.config(state="disabled" if direct else "readonly")
        self.btn_test_conn.config(state="normal" if direct else "disabled")
        for w in (self.qent_listen, self.qent_driver, self.qrad_direct,
                 self.qrad_spooler, self.btn_quick_add):
            w.config(state="normal")

    def _quick_test_connection(self):
        """ทดสอบเปิดซ็อกเก็ตไปยัง IP:พอร์ตที่กรอกไว้ ก่อนจะไปเสียเวลา
        ตั้งเครื่องลูก (รันในเธรดแยกกันหน้าจอค้างระหว่างรอ timeout)"""
        ip = self.qent_ip.get().strip()
        if not ip:
            messagebox.showwarning(APP_TITLE, "กรุณาใส่ IP ก่อนทดสอบ")
            return
        if not is_valid_ip(ip):
            messagebox.showwarning(APP_TITLE,
                                   f"'{ip}' ไม่ใช่รูปแบบ IP ที่ถูกต้อง")
            return
        try:
            pport = int(self.qent_pport.get().strip() or "9100")
            if not (1 <= pport <= 65535):
                raise ValueError
        except ValueError:
            messagebox.showwarning(APP_TITLE, "พอร์ตปริ้นเตอร์ต้องเป็นตัวเลข")
            return

        self.btn_test_conn.config(state="disabled", text="กำลังทดสอบ...")

        def worker():
            try:
                socket.create_connection((ip, pport), timeout=2).close()
                ok, msg = True, f"เชื่อมต่อ {ip}:{pport} ได้ปกติ"
            except OSError as e:
                ok, msg = False, f"เชื่อมต่อ {ip}:{pport} ไม่ได้: {e}"
            self.after(0, lambda: self._quick_test_done(ok, msg))

        threading.Thread(target=worker, daemon=True).start()

    def _quick_test_done(self, ok: bool, msg: str):
        self.btn_test_conn.config(text="ทดสอบการเชื่อมต่อ")
        self._quick_update_state()
        if ok:
            messagebox.showinfo(APP_TITLE, msg)
        else:
            messagebox.showerror(APP_TITLE, msg)

    def _quick_add(self):
        try:
            listen_port = int(self.qent_listen.get().strip())
            if not (1 <= listen_port <= 65535):
                raise ValueError
        except ValueError:
            messagebox.showwarning(APP_TITLE,
                                   "พอร์ตรับงานต้องเป็นตัวเลข 1–65535")
            return
        if listen_port in {m["listen_port"] for m in self.mappings}:
            messagebox.showwarning(APP_TITLE,
                                   f"พอร์ต {listen_port} ถูกใช้ในตารางแล้ว")
            return

        mode = self.qvar_mode.get()
        driver_name = self.qent_driver.get().strip()
        if mode == "direct":
            ip = self.qent_ip.get().strip()
            if not ip:
                messagebox.showwarning(APP_TITLE, "กรุณาใส่ IP ปริ้นเตอร์")
                return
            if not is_valid_ip(ip):
                messagebox.showwarning(APP_TITLE,
                                       f"'{ip}' ไม่ใช่รูปแบบ IP ที่ถูกต้อง")
                return
            try:
                pport = int(self.qent_pport.get().strip() or "9100")
                if not (1 <= pport <= 65535):
                    raise ValueError
            except ValueError:
                messagebox.showwarning(APP_TITLE,
                                       "พอร์ตปริ้นเตอร์ต้องเป็นตัวเลข")
                return
            if pport == listen_port and ip in ("127.0.0.1", get_lan_ip()):
                messagebox.showwarning(APP_TITLE,
                                       "IP ชี้กลับมาเครื่องนี้เอง จะวนลูป")
                return
            mapping = {"listen_port": listen_port, "mode": "direct",
                      "printer_ip": ip, "printer_port": pport,
                      "printer_name": "", "driver_name": driver_name}
        else:
            name = self.qcbo_printer.get().strip()
            if not name:
                messagebox.showwarning(APP_TITLE, "กรุณาเลือกปริ้นเตอร์")
                return
            mapping = {"listen_port": listen_port, "mode": "spooler",
                      "printer_name": name, "printer_ip": "",
                      "printer_port": 9100, "driver_name": driver_name}

        self.mappings.append(mapping)
        self._refresh_tree()
        self._save_config()
        auto_perm = self.qvar_auto_perm.get()
        if auto_perm:
            self._apply_windows_permissions()
        self._auto_update_client_script()

        self.qent_listen.delete(0, "end")
        self.qent_listen.insert(0, str(listen_port + 1))
        self.qent_ip.delete(0, "end")
        self.qent_pport.delete(0, "end")
        self.qent_pport.insert(0, "9100")
        self.qent_driver.delete(0, "end")

        if auto_perm:
            self.lbl_quick_status.config(
                text=f"✓ เพิ่มพอร์ต {listen_port} แล้ว — ตั้งค่า "
                     "Firewall/Defender และอัปเดตสคริปต์ติดตั้งเครื่องลูก"
                     "ให้อัตโนมัติ (อาจมีหน้าต่างขอสิทธิ์ Admin เด้งขึ้นมาสั้นๆ)",
                foreground="green")
            self.log(f"เพิ่มปริ้นเตอร์พอร์ต {listen_port} แล้ว "
                     "(ตั้งค่า Firewall/Defender + อัปเดตสคริปต์อัตโนมัติ)")
        else:
            self.lbl_quick_status.config(
                text=f"✓ เพิ่มพอร์ต {listen_port} แล้ว (ยังไม่ได้ตั้งค่า "
                     "Firewall/Defender เพราะปลดติ๊กไว้ — อัปเดตสคริปต์ให้แล้ว) "
                     "อย่าลืมไปกดปุ่ม 'ตั้งค่า Firewall + Windows Defender ใหม่' "
                     "ที่แท็บ 'จัดการ' หลังเพิ่มครบทุกเครื่อง",
                foreground="#b8860b")
            self.log(f"เพิ่มปริ้นเตอร์พอร์ต {listen_port} แล้ว "
                     "(ข้าม Firewall/Defender ตามที่ปลดติ๊กไว้ — "
                     "อัปเดตสคริปต์อัตโนมัติ)")

    # ---------- แก้/ลบ (แท็บ "จัดการ") ----------
    def _edit_mapping(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showinfo(APP_TITLE, "เลือกแถวที่ต้องการแก้ไขก่อน")
            return
        port = int(sel[0])
        m = next(x for x in self.mappings if x["listen_port"] == port)
        used = {x["listen_port"] for x in self.mappings} - {port}
        dlg = MappingDialog(self, self._get_printers(), mapping=m,
                            used_ports=used)
        self.wait_window(dlg)
        if dlg.result:
            self.mappings.remove(m)
            self.mappings.append(dlg.result)
            self._refresh_tree()
            self._save_config()
            self._auto_update_client_script()

    def _del_mapping(self):
        sel = self.tree.selection()
        if not sel:
            messagebox.showinfo(APP_TITLE, "เลือกแถวที่ต้องการลบก่อน")
            return
        port = int(sel[0])
        m = next((x for x in self.mappings if x["listen_port"] == port), None)
        desc = mapping_desc(m) if m else ""
        if not messagebox.askyesno(
                APP_TITLE,
                f"แน่ใจไหมว่าจะลบพอร์ต {port} ({desc})?\n"
                "ลบแล้วต้องตั้งค่าใหม่ทั้งหมดถ้าต้องการใช้อีก"):
            return
        self.mappings = [x for x in self.mappings
                         if x["listen_port"] != port]
        self._refresh_tree()
        self._save_config()
        self._auto_update_client_script()

    # ---------- เริ่ม/หยุด ----------
    def _auto_start(self):
        if not self.servers:
            self.toggle_server()

    def toggle_server(self):
        if self.servers:
            for s in self.servers:
                s.stop()
            self.servers = []
            self.log("เซิร์ฟเวอร์หยุดทำงานทั้งหมดแล้ว")
            self._set_running_ui(False)
            return

        if not self.mappings:
            messagebox.showwarning(APP_TITLE,
                                   "ยังไม่มีรายการปริ้นเตอร์ กด 'เพิ่ม' ก่อน")
            return
        if (any(m["mode"] == "spooler" for m in self.mappings)
                and win32print is None):
            messagebox.showwarning(APP_TITLE,
                                   "มีรายการโหมดคิว Windows แต่ยังไม่ได้ติดตั้ง "
                                   "pywin32")
            return

        started = []
        for m in self.mappings:
            srv = PortServer(m, self.log, self.on_job_done)
            if srv.start():
                started.append(srv)
        self.servers = started

        if started:
            ports = ", ".join(str(s.port) for s in started)
            self._set_running_ui(True, ports)
            if len(started) < len(self.mappings):
                self.log("บางพอร์ตเปิดไม่ได้ — ดูรายละเอียดด้านบน")
        else:
            self.log("ไม่มีพอร์ตไหนเปิดได้เลย")

    def _set_running_ui(self, running: bool, ports: str = ""):
        if running:
            self.btn_toggle.config(text="■  หยุดทำงานทั้งหมด")
            self.lbl_status.config(text=f"สถานะ: กำลังทำงาน (พอร์ต {ports})",
                                   foreground="green")
            self.btn_edit.config(state="disabled")
            self.btn_del.config(state="disabled")
        else:
            self.btn_toggle.config(text="▶  เริ่มทำงานทั้งหมด")
            self.lbl_status.config(text="สถานะ: หยุดอยู่", foreground="red")
            self.btn_edit.config(state="normal")
            self.btn_del.config(state="normal")
        self._quick_update_state()

    # ---------- log / นับงาน ----------
    def log(self, msg: str):
        now = datetime.datetime.now()
        line = f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
        try:
            with open(current_log_path(), "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass

        today = now.date()
        if self._last_purge_day != today:
            self._last_purge_day = today
            purge_old_logs()

        def append():
            self.txt_log.config(state="normal")
            self.txt_log.insert("end", line)
            self.txt_log.see("end")
            self.txt_log.config(state="disabled")
        self.after(0, append)

    def on_job_done(self, listen_port: int):
        def update():
            self.counts[listen_port] = self.counts.get(listen_port, 0) + 1
            if self.tree.exists(str(listen_port)):
                m = next(x for x in self.mappings
                         if x["listen_port"] == listen_port)
                self.tree.item(str(listen_port),
                               values=(listen_port, mapping_desc(m),
                                       self.counts[listen_port]))
        self.after(0, update)

    # ---------- เปิดพร้อม Windows ----------
    def _apply_start_with_windows(self):
        if winreg is None:
            self._save_config()
            return
        enable = self.var_start_with_windows.get()
        if getattr(sys, "frozen", False):
            cmd = f'"{sys.executable}"'
        else:
            pythonw = sys.executable.replace("python.exe", "pythonw.exe")
            cmd = f'"{pythonw}" "{os.path.abspath(__file__)}"'
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_RUN_KEY,
                                 0, winreg.KEY_SET_VALUE)
            if enable:
                winreg.SetValueEx(key, REG_RUN_NAME, 0, winreg.REG_SZ, cmd)
                self.log("ตั้งค่าเปิดพร้อม Windows แล้ว")
            else:
                try:
                    winreg.DeleteValue(key, REG_RUN_NAME)
                except FileNotFoundError:
                    pass
                self.log("ยกเลิกการเปิดพร้อม Windows แล้ว")
            winreg.CloseKey(key)
        except OSError as e:
            self.log(f"ตั้งค่า Registry ไม่สำเร็จ: {e}")
        self._save_config()

    # ---------- Firewall + Windows Defender ----------
    def _apply_windows_permissions(self):
        """ตั้งค่า Firewall (เปิดพอร์ตทุกพอร์ตในตาราง) + เพิ่ม Windows Defender
        exception ให้ตัวโปรแกรม รวมเป็นการขอสิทธิ์ Admin แค่ครั้งเดียว
        (เขียนเป็นไฟล์ .ps1 ชั่วคราวแล้วรันแบบ elevated กันปัญหาการ escape
        เครื่องหมายคำพูดซ้อนกันหลายชั้นตอนต่อคำสั่งผ่าน cmd.exe)"""
        if not self.mappings:
            return
        ports = ",".join(str(p) for p in sorted(
            {m["listen_port"] for m in self.mappings}))
        exe_path = (sys.executable if getattr(sys, "frozen", False)
                   else os.path.abspath(__file__))
        script_lines = [
            f'netsh advfirewall firewall delete rule name="{FIREWALL_RULE}" '
            '| Out-Null',
            f'netsh advfirewall firewall add rule name="{FIREWALL_RULE}" '
            f'dir=in action=allow protocol=TCP localport={ports} | Out-Null',
            'try {',
            f'    Add-MpPreference -ExclusionProcess {_ps_quote(exe_path)} '
            '-ErrorAction Stop',
            '} catch { }',
        ]
        setup_ps1 = os.path.join(DATA_DIR, "_setup_permissions.ps1")
        try:
            with open(setup_ps1, "w", encoding="utf-8-sig") as f:
                f.write("\n".join(script_lines))
        except OSError as e:
            self.log(f"เตรียมสคริปต์ตั้งค่า Windows ไม่สำเร็จ: {e}")
            return
        params = (f'-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden '
                 f'-File "{setup_ps1}"')
        ret = ctypes.windll.shell32.ShellExecuteW(
            None, "runas", "powershell.exe", params, None, 0)
        if ret > 32:
            self.log(f"ตั้งค่า Firewall + Defender exception พอร์ต "
                     f"{ports} แล้ว")
        else:
            self.log("ตั้งค่า Firewall/Defender ไม่สำเร็จ "
                     "(อาจกดยกเลิกสิทธิ์ Admin)")

    # ---------- สคริปต์ติดตั้งเครื่องลูก ----------
    def _client_script_default_path(self):
        return os.path.join(DATA_DIR, "install-client-printer.ps1")

    def _write_client_script(self, path: str, server_ip: str):
        content = build_client_install_script(self.mappings, server_ip)
        # utf-8-sig กัน PowerShell อ่านภาษาไทยในคอมเมนต์เพี้ยน
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8-sig") as f:
            f.write(content)
        os.replace(tmp, path)

    def _auto_update_client_script(self):
        """ปรับปรุงไฟล์สคริปต์ติดตั้งเครื่องลูก (ที่ตำแหน่งเดิม) ให้ตรงกับตาราง
        ล่าสุดโดยอัตโนมัติ ทุกครั้งที่เพิ่ม/แก้/ลบปริ้นเตอร์ — ผู้ใช้ไม่ต้องกด
        ปุ่ม "สร้างสคริปต์" เองอีก แค่ไปหยิบไฟล์ที่โฟลเดอร์ข้อมูลได้เลย"""
        if not self.mappings:
            return
        server_ip = get_lan_ip()
        if server_ip == "ไม่พบ":
            # หา IP เครื่องนี้ไม่เจอตอนนี้ — เงียบไว้ก่อน ไม่รบกวนผู้ใช้ด้วย
            # popup ระหว่างแก้ตาราง รอผู้ใช้กดปุ่ม "สร้างสคริปต์" เองตอนต้องการ
            return
        try:
            self._write_client_script(
                self._client_script_default_path(), server_ip)
            self.log("ปรับปรุงสคริปต์ติดตั้งเครื่องลูกอัตโนมัติแล้ว: "
                     f"{self._client_script_default_path()}")
        except OSError as e:
            self.log(f"ปรับปรุงสคริปต์ติดตั้งเครื่องลูกอัตโนมัติไม่สำเร็จ: {e}")

    def _generate_client_script(self):
        if not self.mappings:
            messagebox.showwarning(APP_TITLE, "ยังไม่มีรายการปริ้นเตอร์")
            return

        server_ip = get_lan_ip()
        if server_ip == "ไม่พบ":
            if not messagebox.askyesno(
                    APP_TITLE,
                    "หา IP เครื่องนี้ไม่เจอตอนนี้ (อาจไม่ได้ต่อ LAN) "
                    "ต้องการสร้างสคริปต์ต่อไหม? (จะต้องแก้ IP เองในไฟล์)"):
                return
            server_ip = "<ใส่ IP เครื่องนี้ตรงนี้>"

        path = filedialog.asksaveasfilename(
            title="บันทึกสคริปต์ติดตั้งเครื่องลูก",
            defaultextension=".ps1",
            filetypes=[("PowerShell script", "*.ps1")],
            initialfile="install-client-printer.ps1",
            initialdir=DATA_DIR)
        if not path:
            return

        try:
            self._write_client_script(path, server_ip)
        except OSError as e:
            messagebox.showerror(APP_TITLE, f"บันทึกไฟล์ไม่สำเร็จ: {e}")
            return

        self.log(f"สร้างสคริปต์ติดตั้งเครื่องลูกแล้ว: {path}")
        messagebox.showinfo(
            APP_TITLE,
            f"สร้างสคริปต์เรียบร้อย:\n{path}\n\n"
            "เอาไฟล์นี้ไปรันที่เครื่องลูก (คลิกขวา -> Run with PowerShell, "
            "ต้องใช้สิทธิ์ Administrator)\n\n"
            "ถ้าพอร์ตไหนไม่ได้ใส่ชื่อไดรเวอร์ไว้ในตาราง สคริปต์จะ comment "
            "บรรทัด Add-Printer ไว้ให้ ต้องไปแก้เองก่อนรัน")

    # ---------- System Tray ----------
    def _make_tray_image(self):
        for path in (ICON_PNG, ICON_ICO):
            try:
                if os.path.exists(path):
                    return Image.open(path)
            except Exception:
                pass
        img = Image.new("RGB", (64, 64), "#0066cc")
        d = ImageDraw.Draw(img)
        d.rectangle([14, 22, 50, 44], fill="white")
        d.rectangle([22, 10, 42, 22], fill="#dddddd")
        d.rectangle([22, 44, 42, 56], fill="#dddddd")
        return img

    def _hide_to_tray(self):
        self.withdraw()
        if self.tray_icon:
            return
        menu = pystray.Menu(
            pystray.MenuItem("เปิดหน้าต่าง", self._show_window, default=True),
            pystray.MenuItem("ออกจากโปรแกรม", self._quit_from_tray))
        self.tray_icon = pystray.Icon(APP_TITLE, self._make_tray_image(),
                                      APP_TITLE, menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()
        self.log("ย่อลงถาดระบบแล้ว — เซิร์ฟเวอร์ยังทำงานอยู่ "
                 "(ดับเบิลคลิกไอคอนเพื่อเปิดหน้าต่าง)")

    def _show_window(self, *_):
        self.after(0, self.deiconify)

    def _quit_from_tray(self, *_):
        if self.tray_icon:
            self.tray_icon.stop()
        self.after(0, self._really_quit)

    def _really_quit(self):
        for s in self.servers:
            s.stop()
        self.destroy()

    def on_close(self):
        if TRAY_AVAILABLE and self.servers:
            self._hide_to_tray()
        else:
            if self.servers:
                if not messagebox.askyesno(
                        APP_TITLE,
                        "เซิร์ฟเวอร์กำลังทำงานอยู่ ปิดโปรแกรมเลยไหม?"):
                    return
            self._really_quit()

    # ---------- config ----------
    def _save_config(self):
        cfg = {"mappings": self.mappings,
               "autostart_server": self.var_autostart_server.get(),
               "start_with_windows": self.var_start_with_windows.get(),
               "start_minimized": self.var_start_minimized.get()}
        try:
            # เขียนลงไฟล์ชั่วคราวก่อนแล้วค่อยแทนที่ กันไฟล์เสียหายถ้าไฟดับ
            tmp = CONFIG_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
            os.replace(tmp, CONFIG_PATH)
        except OSError as e:
            # ถ้าเขียนไม่ได้ แจ้งผู้ใช้ (ครั้งเดียว) แทนที่จะเงียบ
            if not getattr(self, "_warned_save", False):
                self._warned_save = True
                self.log(f"เตือน: บันทึกค่าไม่สำเร็จ ({e}) — "
                         f"ค่าที่ตั้งอาจหายเมื่อปิดโปรแกรม")

    def _load_config(self):
        if not os.path.exists(CONFIG_PATH):
            return
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, json.JSONDecodeError):
            return

        if isinstance(cfg.get("mappings"), list):
            for m in cfg["mappings"]:
                try:
                    self.mappings.append({
                        "listen_port": int(m["listen_port"]),
                        "mode": m.get("mode", "direct"),
                        "printer_name": m.get("printer_name", ""),
                        "printer_ip": m.get("printer_ip", ""),
                        "printer_port": int(m.get("printer_port", 9100)),
                        "driver_name": m.get("driver_name", ""),
                    })
                except (KeyError, ValueError, TypeError):
                    continue
        elif cfg.get("port"):
            try:
                self.mappings.append({
                    "listen_port": int(cfg["port"]),
                    "mode": cfg.get("mode", "spooler"),
                    "printer_name": cfg.get("printer", ""),
                    "printer_ip": cfg.get("printer_ip", ""),
                    "printer_port": int(cfg.get("printer_port", 9100)),
                })
            except (ValueError, TypeError):
                pass

        self.var_autostart_server.set(bool(cfg.get("autostart_server")))
        self.var_start_with_windows.set(bool(cfg.get("start_with_windows")))
        self.var_start_minimized.set(bool(cfg.get("start_minimized")))


if __name__ == "__main__":
    App().mainloop()
