using System;
using System.Diagnostics;
using System.IO;

namespace ScpRemoteViewer
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string url = "https://192.168.2.25:8445/";
            
            string[] candidates = new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe")
            };

            string exe = null;
            foreach (string path in candidates)
            {
                if (File.Exists(path)) { exe = path; break; }
            }

            if (exe != null)
            {
                ProcessStartInfo psi = new ProcessStartInfo(exe, "--app=" + url + " --window-size=1360,860");
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            else
            {
                Process.Start(url);
            }
        }
    }
}
