// SCP-Remote client setup.
// A single executable that walks the person at the keyboard through consent, naming
// the computer, and the install itself, then records the name so the machine is
// recognisable on the server. Built with the C# compiler that ships with Windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("SCP-Remote Setup")]
[assembly: AssemblyProduct("SCP-Remote")]
[assembly: AssemblyDescription("ติดตั้งโปรแกรมช่วยเหลือระยะไกล ฝ่ายไอทีโรงพยาบาล")]
[assembly: AssemblyCompany("Hospital IT")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace ScpRemoteSetup
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Wizard());
        }
    }

    // Everything the wizard needs to know about the agent already installed here.
    class AgentInfo
    {
        public string ServiceName;
        public string ExePath;
    }

    static class Agent
    {
        // The service name changes if agent branding is ever customised on the server,
        // so match on the executable path in the service registration instead.
        public static AgentInfo FindInstalled()
        {
            using (RegistryKey services = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services"))
            {
                if (services == null) return null;
                foreach (string name in services.GetSubKeyNames())
                {
                    try
                    {
                        using (RegistryKey key = services.OpenSubKey(name))
                        {
                            if (key == null) continue;
                            object image = key.GetValue("ImagePath");
                            if (image == null) continue;
                            string path = image.ToString();
                            if (path.IndexOf("meshagent.exe", StringComparison.OrdinalIgnoreCase) < 0) continue;
                            AgentInfo info = new AgentInfo();
                            info.ServiceName = name;
                            info.ExePath = ExtractExePath(path);
                            if (info.ExePath != null) return info;
                        }
                    }
                    catch { }
                }
            }
            return null;
        }

        // A service path is either "C:\...\MeshAgent.exe" -args or an unquoted path,
        // and the quoted form is usual because the folder name contains a space.
        static string ExtractExePath(string imagePath)
        {
            Match m = Regex.Match(imagePath, "^\\s*(?:\"(?<exe>[^\"]+)\"|(?<exe>\\S+))");
            if (!m.Success) return null;
            string exe = m.Groups["exe"].Value;
            if (exe.StartsWith("\\??\\")) exe = exe.Substring(4);
            return exe;
        }

        const ushort MachineX86 = 0x014c;
        const ushort MachineX64 = 0x8664;
        const ushort MachineArm64 = 0xAA64;

        // Consent window colours, as red,green,blue. These match the deep pink taken
        // from the hospital logo and the white text the server sends to new installs.
        const string ConsentBackground = "176,42,114";
        const string ConsentForeground = "255,255,255";

        // Read the architecture out of the executable header. Agent file names vary, and
        // running a 64-bit agent on 32-bit Windows fails with an unhelpful error, so read
        // what the file actually is rather than trusting its name.
        static ushort ReadMachineType(string file)
        {
            try
            {
                using (FileStream stream = File.OpenRead(file))
                using (BinaryReader reader = new BinaryReader(stream))
                {
                    if (stream.Length < 0x40) return 0;
                    stream.Seek(0x3C, SeekOrigin.Begin);
                    int peOffset = reader.ReadInt32();
                    if (peOffset <= 0 || peOffset + 6 > stream.Length) return 0;
                    stream.Seek(peOffset, SeekOrigin.Begin);
                    if (reader.ReadUInt32() != 0x00004550) return 0; // "PE\0\0"
                    return reader.ReadUInt16();
                }
            }
            catch { return 0; }
        }

        // What this copy of Windows can run, best first.
        static ushort[] PreferredMachines()
        {
            string arch = Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432");
            if (string.IsNullOrEmpty(arch)) arch = Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE");
            if (arch == null) arch = "";
            if (arch.ToUpperInvariant() == "ARM64") return new ushort[] { MachineArm64, MachineX64, MachineX86 };
            if (Environment.Is64BitOperatingSystem) return new ushort[] { MachineX64, MachineX86 };
            return new ushort[] { MachineX86 };
        }

        public static string DescribeThisWindows()
        {
            ushort[] order = PreferredMachines();
            if (order[0] == MachineArm64) return "Windows ARM 64 บิต";
            if (order[0] == MachineX64) return "Windows 64 บิต";
            return "Windows 32 บิต";
        }

        // Out of the files given, the one this computer can run, best architecture first.
        static string PickForThisMachine(List<string> candidates)
        {
            // Prefer files that look like an agent, but keep the rest as a fallback so a
            // renamed download still works.
            List<string> ordered = new List<string>();
            foreach (string file in candidates)
            {
                if (Path.GetFileName(file).IndexOf("agent", StringComparison.OrdinalIgnoreCase) >= 0) ordered.Add(file);
            }
            foreach (string file in candidates)
            {
                if (!ordered.Contains(file)) ordered.Add(file);
            }
            foreach (ushort machine in PreferredMachines())
            {
                foreach (string file in ordered)
                {
                    if (ReadMachineType(file) == machine) return file;
                }
            }
            return null;
        }

        // A copy of the agent for each architecture is compiled into this program, so the
        // file can be carried on its own. Anything placed next to it still wins, which is
        // how a newer download replaces the built-in copy without rebuilding.
        static string extractedFolder;
        public static string ExtractBundledInstaller()
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            List<string> files = new List<string>();
            try
            {
                if (extractedFolder == null)
                {
                    extractedFolder = Path.Combine(Path.GetTempPath(), "SCP-Remote-Setup");
                    Directory.CreateDirectory(extractedFolder);
                }
                foreach (string resource in assembly.GetManifestResourceNames())
                {
                    if (!resource.StartsWith("agent", StringComparison.OrdinalIgnoreCase) || !resource.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                    string target = Path.Combine(extractedFolder, resource);
                    if (!File.Exists(target))
                    {
                        using (Stream source = assembly.GetManifestResourceStream(resource))
                        using (FileStream output = File.Create(target))
                        {
                            if (source == null) continue;
                            source.CopyTo(output);
                        }
                    }
                    files.Add(target);
                }
            }
            catch { return null; }
            return PickForThisMachine(files);
        }

        public static bool HasBundledInstaller()
        {
            foreach (string resource in Assembly.GetExecutingAssembly().GetManifestResourceNames())
            {
                if (resource.StartsWith("agent", StringComparison.OrdinalIgnoreCase) && resource.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        // Look beside this executable first, then fall back to the compiled-in copy.
        public static string FindInstallerNextToUs()
        {
            string dir = Path.GetDirectoryName(Application.ExecutablePath);
            string self = Path.GetFullPath(Application.ExecutablePath);
            List<string> candidates = new List<string>();
            foreach (string file in Directory.GetFiles(dir, "*.exe"))
            {
                if (string.Equals(Path.GetFullPath(file), self, StringComparison.OrdinalIgnoreCase)) continue;
                candidates.Add(file);
            }
            string chosen = PickForThisMachine(candidates);
            if (chosen != null) return chosen;
            return ExtractBundledInstaller();
        }

        // True when an agent file is present but built for a different architecture, so
        // the wizard can say which download is missing instead of just "not found".
        public static bool HasIncompatibleInstaller()
        {
            string dir = Path.GetDirectoryName(Application.ExecutablePath);
            string self = Path.GetFullPath(Application.ExecutablePath);
            foreach (string file in Directory.GetFiles(dir, "*.exe"))
            {
                if (string.Equals(Path.GetFullPath(file), self, StringComparison.OrdinalIgnoreCase)) continue;
                ushort machine = ReadMachineType(file);
                if (machine == MachineX86 || machine == MachineX64 || machine == MachineArm64) return true;
            }
            return false;
        }

        // Write the name where the agent reads it. The .tag file is the documented
        // source for the server-side device name; the same value goes into the agent
        // settings file so the two never disagree if one of them is rebuilt.
        public static void WriteDeviceName(string agentExePath, string deviceName)
        {
            string dir = Path.GetDirectoryName(agentExePath);
            string baseName = Path.GetFileNameWithoutExtension(agentExePath);
            // Invariant culture keeps the year Gregorian, so it matches the server's own
            // logs instead of switching to the Buddhist era on a Thai-locale machine.
            string stamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
            string[] tagLines = new string[] {
                "~ServerName:" + deviceName,
                "~ServerDesc:" + deviceName + " (ติดตั้ง " + stamp + ")"
            };
            UTF8Encoding utf8 = new UTF8Encoding(false);

            File.WriteAllText(Path.Combine(dir, baseName + ".tag"), string.Join("\r\n", tagLines) + "\r\n", utf8);

            string msh = Path.Combine(dir, baseName + ".msh");
            if (File.Exists(msh))
            {
                // The server writes this file as UTF-8, so read it the same way or a
                // device group named in Thai comes back mangled and is written back broken.
                List<string> kept = new List<string>();
                foreach (string line in File.ReadAllLines(msh, Encoding.UTF8))
                {
                    if (Regex.IsMatch(line, "^\\s*(Tag|background|foreground)\\s*=", RegexOptions.IgnoreCase)) continue;
                    kept.Add(line);
                }
                kept.Add("Tag=" + string.Join("\\n", tagLines));
                // The agent reads these when it starts and uses them for the consent
                // window, so running this program again restyles an agent that was
                // installed before the hospital colours existed, with no reinstall.
                kept.Add("background=" + ConsentBackground);
                kept.Add("foreground=" + ConsentForeground);
                File.WriteAllLines(msh, kept.ToArray(), utf8);
            }
        }

        public static void RestartService(string serviceName)
        {
            using (ServiceController service = new ServiceController(serviceName))
            {
                TimeSpan wait = TimeSpan.FromSeconds(30);
                if (service.Status != ServiceControllerStatus.Stopped)
                {
                    service.Stop();
                    service.WaitForStatus(ServiceControllerStatus.Stopped, wait);
                }
                service.Start();
                service.WaitForStatus(ServiceControllerStatus.Running, wait);
            }
        }
    }

    class Wizard : Form
    {
        static readonly Color Brand = Color.FromArgb(230, 72, 155);
        static readonly Color BrandDark = Color.FromArgb(176, 42, 114);
        static readonly Color BrandSoft = Color.FromArgb(249, 189, 192);
        static readonly Color BannerBack = Color.FromArgb(252, 246, 249);
        static readonly Color Muted = Color.FromArgb(105, 105, 105);

        Label stepTitle, bannerTitle, bannerSub, stepList, installStatus, doneText;
        Panel pageWelcome, pageConsent, pageName, pageInstall, pageDone;
        Panel[] pages;
        CheckBox agree;
        TextBox nameBox;
        ProgressBar progress;
        Button btnBack, btnNext, btnCancel;
        int step = 1;
        string deviceName = "";

        public Wizard()
        {
            Text = "ติดตั้ง SCP-Remote";
            ClientSize = new Size(660, 470);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = Color.White;
            Font = new Font("Segoe UI", 10F);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            BuildBanner();
            BuildHeader();
            BuildPages();
            BuildButtons();

            pages = new Panel[] { pageWelcome, pageConsent, pageName, pageInstall, pageDone };
            nameBox.Text = Environment.MachineName;
            UpdateStep();
        }

        void BuildBanner()
        {
            Panel banner = new Panel();
            banner.Location = new Point(0, 0);
            banner.Size = new Size(180, 410);
            // The logo is pink on a transparent ground, so it needs a light panel to read.
            banner.BackColor = BannerBack;
            Controls.Add(banner);

            Panel edge = new Panel();
            edge.Location = new Point(177, 0);
            edge.Size = new Size(3, 410);
            edge.BackColor = BrandSoft;
            banner.Controls.Add(edge);

            bool hasLogo = false;
            PictureBox logo = new PictureBox();
            logo.Location = new Point(20, 16);
            logo.Size = new Size(138, 138);
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            logo.BackColor = Color.Transparent;
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                {
                    if (s != null) { logo.Image = Image.FromStream(s); hasLogo = true; }
                }
            }
            catch { hasLogo = false; }
            logo.Visible = hasLogo;
            banner.Controls.Add(logo);

            int textTop = hasLogo ? 164 : 40;

            bannerTitle = new Label();
            bannerTitle.Text = "SCP-Remote";
            bannerTitle.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
            bannerTitle.ForeColor = Brand;
            bannerTitle.Location = new Point(18, textTop);
            bannerTitle.Size = new Size(152, 30);
            banner.Controls.Add(bannerTitle);

            bannerSub = new Label();
            bannerSub.Text = "ระบบช่วยเหลือ\r\nคอมพิวเตอร์ระยะไกล\r\nฝ่ายไอทีโรงพยาบาล";
            bannerSub.ForeColor = Muted;
            bannerSub.Location = new Point(20, textTop + 32);
            bannerSub.Size = new Size(150, 70);
            banner.Controls.Add(bannerSub);

            stepList = new Label();
            stepList.Location = new Point(20, textTop + 108);
            stepList.Size = new Size(150, 130);
            stepList.ForeColor = BrandDark;
            banner.Controls.Add(stepList);
        }

        void BuildHeader()
        {
            stepTitle = new Label();
            stepTitle.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            stepTitle.ForeColor = BrandDark;
            stepTitle.Location = new Point(206, 28);
            stepTitle.Size = new Size(430, 32);
            Controls.Add(stepTitle);

            Label line = new Label();
            line.AutoSize = false;
            line.BorderStyle = BorderStyle.Fixed3D;
            line.Location = new Point(206, 64);
            line.Size = new Size(430, 2);
            Controls.Add(line);
        }

        Panel NewPage()
        {
            Panel page = new Panel();
            page.Location = new Point(206, 80);
            page.Size = new Size(436, 320);
            page.Visible = false;
            Controls.Add(page);
            return page;
        }

        void BuildPages()
        {
            pageWelcome = NewPage();
            Label welcome = new Label();
            welcome.Location = new Point(0, 6);
            welcome.Size = new Size(430, 300);
            welcome.Text =
                "ตัวช่วยนี้จะติดตั้งโปรแกรมของฝ่ายไอทีลงในเครื่องนี้ เพื่อให้เจ้าหน้าที่ช่วยแก้ปัญหาได้โดยไม่ต้องเดินมาที่เครื่อง\r\n\r\n" +
                "มี 3 ขั้นตอน ใช้เวลาประมาณ 1 นาที\r\n\r\n" +
                "    1  อ่านคำขออนุญาต แล้วกดยินยอม\r\n" +
                "    2  ตั้งชื่อเครื่อง\r\n" +
                "    3  ติดตั้ง\r\n\r\n" +
                "ระหว่างติดตั้งไม่ต้องปิดโปรแกรมอื่น และไม่ต้องรีสตาร์ตเครื่อง\r\n\r\n" +
                "กด ถัดไป เพื่อเริ่ม";
            pageWelcome.Controls.Add(welcome);

            pageConsent = NewPage();
            Label consentLead = new Label();
            consentLead.Location = new Point(0, 2);
            consentLead.Size = new Size(430, 22);
            consentLead.Text = "โปรดอ่านก่อน แล้วกดยินยอมที่ด้านล่าง";
            consentLead.ForeColor = Muted;
            pageConsent.Controls.Add(consentLead);

            TextBox consent = new TextBox();
            consent.Multiline = true;
            consent.ReadOnly = true;
            consent.ScrollBars = ScrollBars.Vertical;
            consent.BackColor = Color.FromArgb(250, 246, 248);
            consent.BorderStyle = BorderStyle.FixedSingle;
            consent.Location = new Point(0, 26);
            consent.Size = new Size(430, 232);
            consent.Text =
                "สิ่งที่เจ้าหน้าที่ทำได้ และการขออนุญาต\r\n\r\n" +
                "- ขอดูและควบคุมหน้าจอ ขอใช้หน้าต่างคำสั่ง และขอเข้าถึงไฟล์บนเครื่องนี้\r\n" +
                "- ทุกครั้งที่ขอเข้าใช้งาน จะมีหน้าต่างขึ้นที่เครื่องนี้ให้กดอนุญาตก่อนเสมอ และปฏิเสธได้\r\n" +
                "- ถ้าไม่มีผู้กดอนุญาต ระบบจะไม่เข้าใช้งานเอง และจะไม่ยอมรับอัตโนมัติเมื่อหมดเวลา\r\n" +
                "- ขณะถูกรีโมต จะมีสัญลักษณ์แจ้งเตือนแสดงบนหน้าจอ\r\n\r\n" +
                "การทำงานของโปรแกรม\r\n\r\n" +
                "- ทำงานเบื้องหลังและเริ่มเองตั้งแต่เปิดเครื่อง เพื่อให้ขอความช่วยเหลือได้ทันที\r\n" +
                "- ขณะไม่มีการรีโมต โปรแกรมเพียงรอรับงาน ไม่บันทึกหน้าจอ ไม่ส่งไฟล์ออกไปเอง\r\n" +
                "- เชื่อมต่อเฉพาะเซิร์ฟเวอร์ภายในโรงพยาบาล ไม่ส่งข้อมูลออกอินเทอร์เน็ต\r\n" +
                "- ถอนการติดตั้งได้ที่ ตั้งค่า > แอป หรือแจ้งฝ่ายไอที\r\n\r\n" +
                "หากไม่ต้องการติดตั้ง ให้กดยกเลิก และแจ้งฝ่ายไอทีได้ตามปกติ";
            pageConsent.Controls.Add(consent);

            agree = new CheckBox();
            agree.Text = "ข้าพเจ้าอ่านแล้ว และอนุญาตให้ติดตั้งโปรแกรมนี้";
            agree.Location = new Point(0, 268);
            agree.Size = new Size(430, 26);
            agree.CheckedChanged += delegate { if (step == 2) btnNext.Enabled = agree.Checked; };
            pageConsent.Controls.Add(agree);

            pageName = NewPage();
            Label nameLead = new Label();
            nameLead.Location = new Point(0, 6);
            nameLead.Size = new Size(430, 70);
            nameLead.Text = "ตั้งชื่อที่ฝ่ายไอทีจะเห็นในระบบ เช่น เลขครุภัณฑ์ ห้อง หรือชื่อจุดบริการ\r\n\r\n" +
                "ชื่อที่สื่อว่าเครื่องอยู่ที่ไหน จะช่วยให้ตามหาเครื่องได้เร็วตอนมีปัญหา";
            pageName.Controls.Add(nameLead);

            Label nameLabel = new Label();
            nameLabel.Location = new Point(0, 92);
            nameLabel.Size = new Size(430, 22);
            nameLabel.Text = "ชื่อเครื่อง";
            pageName.Controls.Add(nameLabel);

            nameBox = new TextBox();
            nameBox.Location = new Point(0, 116);
            nameBox.Size = new Size(430, 30);
            nameBox.MaxLength = 0;
            nameBox.Font = new Font("Segoe UI", 12F);
            pageName.Controls.Add(nameBox);

            Label nameHint = new Label();
            nameHint.Location = new Point(0, 152);
            nameHint.Size = new Size(430, 60);
            nameHint.Text = "พิมพ์ภาษาไทยได้ และไม่จำกัดความยาว\r\n\r\nตอนนี้ใส่ชื่อเครื่องของ Windows ไว้ให้แล้ว ถ้าพอใจกดถัดไปได้เลย";
            nameHint.ForeColor = Muted;
            pageName.Controls.Add(nameHint);

            pageInstall = NewPage();
            Label installLead = new Label();
            installLead.Location = new Point(0, 20);
            installLead.Size = new Size(430, 60);
            installLead.Text = "กำลังติดตั้ง โปรดรอสักครู่ และอย่าปิดหน้าต่างนี้";
            pageInstall.Controls.Add(installLead);

            progress = new ProgressBar();
            progress.Location = new Point(0, 80);
            progress.Size = new Size(430, 22);
            progress.Style = ProgressBarStyle.Marquee;
            progress.MarqueeAnimationSpeed = 30;
            pageInstall.Controls.Add(progress);

            installStatus = new Label();
            installStatus.Location = new Point(0, 112);
            installStatus.Size = new Size(430, 60);
            installStatus.ForeColor = Muted;
            pageInstall.Controls.Add(installStatus);

            pageDone = NewPage();
            Label doneMark = new Label();
            doneMark.Text = "ติดตั้งเรียบร้อย";
            doneMark.Font = new Font("Segoe UI", 13F, FontStyle.Bold);
            doneMark.ForeColor = Brand;
            doneMark.Location = new Point(0, 10);
            doneMark.Size = new Size(430, 30);
            pageDone.Controls.Add(doneMark);

            doneText = new Label();
            doneText.Location = new Point(0, 50);
            doneText.Size = new Size(430, 240);
            pageDone.Controls.Add(doneText);
        }

        void BuildButtons()
        {
            btnCancel = new Button();
            btnCancel.Text = "ยกเลิก";
            btnCancel.Location = new Point(206, 420);
            btnCancel.Size = new Size(104, 36);
            btnCancel.FlatStyle = FlatStyle.Flat;
            btnCancel.Click += delegate { Close(); };
            Controls.Add(btnCancel);

            btnBack = new Button();
            btnBack.Text = "ย้อนกลับ";
            btnBack.Location = new Point(404, 420);
            btnBack.Size = new Size(112, 36);
            btnBack.FlatStyle = FlatStyle.Flat;
            btnBack.Click += delegate { step--; UpdateStep(); };
            Controls.Add(btnBack);

            btnNext = new Button();
            btnNext.Text = "ถัดไป";
            btnNext.Location = new Point(524, 420);
            btnNext.Size = new Size(118, 36);
            btnNext.FlatStyle = FlatStyle.Flat;
            btnNext.BackColor = Brand;
            btnNext.ForeColor = Color.White;
            btnNext.Click += OnNext;
            Controls.Add(btnNext);
        }

        void OnNext(object sender, EventArgs e)
        {
            if (step == 1) { step = 2; UpdateStep(); }
            else if (step == 2) { step = 3; UpdateStep(); nameBox.Focus(); nameBox.SelectAll(); }
            else if (step == 3)
            {
                string entered = nameBox.Text.Trim();
                if (entered.Length == 0) entered = Environment.MachineName;
                deviceName = entered;
                RunInstall();
            }
            else if (step == 5) { Close(); }
        }

        void UpdateStep()
        {
            for (int i = 0; i < pages.Length; i++) pages[i].Visible = (i == step - 1);

            string[] titles = { "ยินดีต้อนรับ", "คำขออนุญาต", "ตั้งชื่อเครื่อง", "กำลังติดตั้ง", "เสร็จสิ้น" };
            stepTitle.Text = titles[step - 1];

            string[] names = { "อ่านคำขออนุญาต", "ตั้งชื่อเครื่อง", "ติดตั้ง" };
            int shown = step - 1;
            if (shown < 1) shown = 1;
            if (shown > 3) shown = 3;
            StringBuilder list = new StringBuilder();
            for (int i = 1; i <= 3; i++)
            {
                string mark = "  ○ ";                       // pending
                if (i < shown || step == 5) mark = "  ✓ ";  // done
                else if (i == shown && step != 1) mark = "  ● ";  // current
                list.Append(mark).Append(i).Append("  ").Append(names[i - 1]).Append("\r\n\r\n");
            }
            stepList.Text = list.ToString();

            btnBack.Visible = (step == 2 || step == 3);
            btnCancel.Visible = (step <= 3);
            btnNext.Visible = (step != 4);
            if (step == 2) { btnNext.Text = "ถัดไป"; btnNext.Enabled = agree.Checked; }
            else if (step == 3) { btnNext.Text = "ติดตั้ง"; btnNext.Enabled = true; }
            else if (step == 5) { btnNext.Text = "เสร็จสิ้น"; btnNext.Enabled = true; }
            else { btnNext.Text = "ถัดไป"; btnNext.Enabled = true; }
        }

        void Say(string text, MessageBoxIcon icon)
        {
            MessageBox.Show(this, text, "SCP-Remote", MessageBoxButtons.OK, icon);
        }

        void SetStatus(string text)
        {
            installStatus.Text = text;
            Refresh();
            Application.DoEvents();
        }

        void RunInstall()
        {
            step = 4;
            UpdateStep();
            Refresh();

            AgentInfo agent = Agent.FindInstalled();
            if (agent == null)
            {
                string installer = Agent.FindInstallerNextToUs();
                if (installer == null)
                {
                    string need = Agent.DescribeThisWindows();
                    string lead;
                    if (Agent.HasBundledInstaller())
                    {
                        lead = "ตัวติดตั้งนี้ไม่มีไฟล์เอเจนต์สำหรับ " + need + "\r\n\r\n" +
                               "ไฟล์ที่รวมมาในตัวติดตั้งเป็นของสถาปัตยกรรมอื่น";
                    }
                    else if (Agent.HasIncompatibleInstaller())
                    {
                        lead = "ไฟล์เอเจนต์ที่วางไว้ใช้กับเครื่องนี้ไม่ได้\r\n\r\n" +
                               "เครื่องนี้เป็น " + need + " จึงต้องใช้ไฟล์เอเจนต์ของสถาปัตยกรรมเดียวกัน";
                    }
                    else { lead = "ยังไม่พบไฟล์ตัวติดตั้งเอเจนต์"; }
                    Say(lead + "\r\n\r\n" +
                        "ให้ดาวน์โหลดไฟล์เอเจนต์ของกลุ่มอุปกรณ์จากเซิร์ฟเวอร์ ตามนี้\r\n\r\n" +
                        "1. เข้าเว็บของเซิร์ฟเวอร์ด้วยบัญชีผู้ดูแลระบบ\r\n" +
                        "2. เปิดกลุ่มอุปกรณ์ แล้วไปที่ \"เพิ่มอุปกรณ์\"\r\n" +
                        "3. ดาวน์โหลด \"บริการ " + need + "\"\r\n" +
                        "4. วางไฟล์ .exe ที่ได้ ไว้ในโฟลเดอร์เดียวกับไฟล์ติดตั้งนี้\r\n" +
                        "5. เปิดไฟล์ติดตั้งนี้อีกครั้ง\r\n\r\n" +
                        "วางไฟล์เอเจนต์ทั้ง 32 บิต 64 บิต และ ARM 64 บิต ไว้พร้อมกันได้ " +
                        "ตัวติดตั้งจะเลือกไฟล์ที่ตรงกับเครื่องให้เอง\r\n\r\n" +
                        "โฟลเดอร์ปลายทาง\r\n" + Path.GetDirectoryName(Application.ExecutablePath),
                        MessageBoxIcon.Warning);
                    step = 3; UpdateStep(); return;
                }
                SetStatus("กำลังติดตั้งโปรแกรม");
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(installer, "-fullinstall");
                    psi.UseShellExecute = false;
                    psi.WorkingDirectory = Path.GetDirectoryName(installer);
                    Process proc = Process.Start(psi);
                    // Keep the window painting while the agent installer runs.
                    while (!proc.HasExited) { Application.DoEvents(); Thread.Sleep(150); }
                }
                catch (Exception ex)
                {
                    Say("ติดตั้งไม่สำเร็จ\r\n\r\n" + ex.Message, MessageBoxIcon.Error);
                    step = 3; UpdateStep(); return;
                }
                // The installer returns before the service is registered, so wait for it.
                SetStatus("กำลังเริ่มบริการ");
                DateTime deadline = DateTime.Now.AddSeconds(90);
                while (agent == null && DateTime.Now < deadline)
                {
                    Application.DoEvents();
                    Thread.Sleep(500);
                    agent = Agent.FindInstalled();
                }
                if (agent == null)
                {
                    Say("ติดตั้งแล้ว แต่ยังไม่พบบริการของโปรแกรม กรุณาแจ้งฝ่ายไอที", MessageBoxIcon.Warning);
                    step = 3; UpdateStep(); return;
                }
            }
            else
            {
                SetStatus("พบโปรแกรมติดตั้งอยู่แล้ว กำลังตั้งชื่อเครื่องเป็นค่าใหม่");
            }

            SetStatus("กำลังบันทึกชื่อเครื่อง");
            try
            {
                Agent.WriteDeviceName(agent.ExePath, deviceName);
                Agent.RestartService(agent.ServiceName);
            }
            catch (Exception ex)
            {
                Say("ตั้งชื่อเครื่องไม่สำเร็จ\r\n\r\n" + ex.Message, MessageBoxIcon.Warning);
                step = 3; UpdateStep(); return;
            }

            doneText.Text = "ชื่อเครื่องนี้ในระบบคือ\r\n\r\n        " + deviceName + "\r\n\r\n" +
                "เครื่องนี้จะแสดงให้ฝ่ายไอทีเห็นภายในไม่กี่นาที และโปรแกรมจะเริ่มทำงานเองทุกครั้งที่เปิดเครื่อง\r\n\r\n" +
                "ทุกครั้งที่เจ้าหน้าที่ขอเข้าใช้งาน จะมีหน้าต่างขึ้นที่เครื่องนี้ให้กดอนุญาตก่อนเสมอ\r\n\r\n" +
                "กด เสร็จสิ้น เพื่อปิดหน้าต่างนี้";
            step = 5;
            UpdateStep();
        }
    }
}
