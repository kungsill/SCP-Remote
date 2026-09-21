using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Runs in the interactive user's session, never the Windows service desktop.
// Source paths can only originate from CF_HDROP. Destination paths are always
// inside a fresh, helper-owned cache directory. The wire protocol exposes IDs.
class ClipboardHost {
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    const int Chunk = 131072, MaxEntries = 10000;
    const long MaxBytes = 10737418240L;
    static JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 4194304, RecursionLimit = 64 };
    class Entry { public string relative; public string full; public bool directory; public long size; public long stamp; public long offset; }
    static List<Entry> source, target;
    static string sourceId, targetId, targetRoot;
    static uint targetSequence;
    static bool committed;
    static string S(Dictionary<string, object> d, string k) { return d.ContainsKey(k) ? Convert.ToString(d[k]) : ""; }
    static long N(Dictionary<string, object> d, string k) { return Convert.ToInt64(d[k]); }
    static string Hash(byte[] b) { using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(b)).Replace("-", "").ToLowerInvariant(); }
    static string Wire(object value) {var b=new StringBuilder();foreach(char c in json.Serialize(value)){if(c>127)b.Append("\\u"+((int)c).ToString("x4"));else b.Append(c);}return b.ToString();}
    static void Require(bool ok, string error) { if(!ok) throw new InvalidOperationException(error); }
    static void SafePath(string path) {
        Require(!String.IsNullOrWhiteSpace(path) && path.Length <= 220 && !Path.IsPathRooted(path), "INVALID_PATH");
        foreach(string part in path.Split('/')) {
            Require(part.Length>0 && part!="." && part!=".." && !part.EndsWith(".") && !part.EndsWith(" ") && part.IndexOfAny(Path.GetInvalidFileNameChars())<0 && part.IndexOf('\\')<0, "INVALID_PATH");
            string stem=part.Split('.')[0].ToUpperInvariant();
            Require(!new[]{"CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"}.Contains(stem), "INVALID_PATH");
        }
    }
    static void NoLinks(string full) {
        string p=full;
        while(!String.IsNullOrEmpty(p)) { Require((File.GetAttributes(p)&FileAttributes.ReparsePoint)==0,"LINK_NOT_SUPPORTED"); p=Path.GetDirectoryName(p); }
    }
    static void Walk(string full, string relative, int depth) {
        SafePath(relative); NoLinks(full);
        Require(depth<=32 && source.Count<MaxEntries, "TOO_MANY_FILES");
        bool dir=Directory.Exists(full);
        var e=new Entry{relative=relative,full=full,directory=dir,size=dir?0:new FileInfo(full).Length,stamp=dir?0:File.GetLastWriteTimeUtc(full).Ticks};
        source.Add(e);
        Require(source.Sum(x=>x.size)<=MaxBytes,"TRANSFER_TOO_LARGE");
        if(dir) foreach(string child in Directory.GetFileSystemEntries(full)) Walk(child, relative+"/"+Path.GetFileName(child),depth+1);
    }
    static object Snapshot() {
        uint seq=GetClipboardSequenceNumber();
        source=new List<Entry>(); sourceId=Guid.NewGuid().ToString("N");
        if(Clipboard.ContainsFileDropList()) {
            var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(string path in Clipboard.GetFileDropList()) { string full=Path.GetFullPath(path); string name=Path.GetFileName(full); Require(names.Add(name),"DUPLICATE_NAME"); Walk(full,name,0); }
        }
        Require(seq==GetClipboardSequenceNumber(),"CLIPBOARD_CHANGED");
        string text=source.Count==0 && Clipboard.ContainsText()?Clipboard.GetText():null;
        Require(text==null || text.Length<=1048576,"TEXT_TOO_LARGE");
        Require(seq==GetClipboardSequenceNumber(),"CLIPBOARD_CHANGED");
        return new {job=sourceId,sequence=seq,text=text,entries=source.Select(e=>new{path=e.relative,directory=e.directory,size=e.size}).ToArray()};
    }
    static void Abort() {
        // Partial transfers contain only data this process created. No recursion
        // through links: refuse cleanup if anything has been replaced externally.
        if(targetRoot!=null && !committed && Directory.Exists(targetRoot)) {
            try { foreach(var e in target.OrderByDescending(x=>x.full.Length)) { NoLinks(e.full); if(e.directory) Directory.Delete(e.full,false); else File.Delete(e.full); } NoLinks(targetRoot); Directory.Delete(targetRoot,false); } catch { }
        }
        target=null;targetRoot=null;targetId=null;committed=false;
    }
    static object Handle(Dictionary<string,object> d) {
        string op=S(d,"op");
        if(op=="state") return new{sequence=GetClipboardSequenceNumber(),files=Clipboard.ContainsFileDropList()};
        if(op=="snapshot") return Snapshot();
        if(op=="text") {string text=S(d,"text");Require(text.Length<=1048576,"TEXT_TOO_LARGE");Require(!d.ContainsKey("sequence") || GetClipboardSequenceNumber()==checked((uint)N(d,"sequence")),"CLIPBOARD_CHANGED");if(text.Length==0)Clipboard.Clear();else Clipboard.SetText(text);return new{ready=true};}
        if(op=="read") {
            Require(source!=null && S(d,"job")==sourceId,"INVALID_JOB");
            int i=checked((int)N(d,"index")); Require(i>=0 && i<source.Count,"INVALID_INDEX");
            var e=source[i]; long offset=N(d,"offset"); Require(!e.directory && offset>=0 && offset<=e.size,"INVALID_OFFSET"); NoLinks(e.full);
            var info=new FileInfo(e.full); Require(info.Length==e.size && info.LastWriteTimeUtc.Ticks==e.stamp,"SOURCE_CHANGED");
            byte[] b=new byte[(int)Math.Min(Chunk,e.size-offset)];
            using(var f=new FileStream(e.full,FileMode.Open,FileAccess.Read,FileShare.Read)) { f.Position=offset; int n=0; while(n<b.Length) {int r=f.Read(b,n,b.Length-n);Require(r>0,"SOURCE_CHANGED");n+=r;} }
            return new{data=Convert.ToBase64String(b),sha256=Hash(b),length=b.Length};
        }
        if(op=="prepare") {
            Abort(); var rows=d["entries"] as ArrayList; Require(rows!=null && rows.Count>0 && rows.Count<=MaxEntries,"INVALID_MANIFEST");
            var list=new List<Entry>(); var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase); long total=0;
            foreach(Dictionary<string,object> row in rows) { string p=S(row,"path"); SafePath(p); Require(names.Add(p),"DUPLICATE_NAME"); bool dir=Convert.ToBoolean(row["directory"]);long size=N(row,"size");Require(size>=0 && (!dir||size==0) && size<=MaxBytes-total,"TRANSFER_TOO_LARGE");total+=size;list.Add(new Entry{relative=p,directory=dir,size=size}); }
            foreach(var e in list) { int slash=e.relative.LastIndexOf('/'); if(slash>=0) Require(list.Any(x=>x.directory && String.Equals(x.relative,e.relative.Substring(0,slash),StringComparison.OrdinalIgnoreCase)),"MISSING_PARENT"); }
            string cache=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SCP-Remote","Clipboard");
            Directory.CreateDirectory(cache);NoLinks(cache);
            Require(new DriveInfo(Path.GetPathRoot(cache)).AvailableFreeSpace>total+16777216,"NOT_ENOUGH_SPACE");
            targetId=Guid.NewGuid().ToString("N");targetRoot=Path.Combine(cache,targetId);Directory.CreateDirectory(targetRoot);target=list;
            targetSequence=d.ContainsKey("sequence")?checked((uint)N(d,"sequence")):GetClipboardSequenceNumber();
            foreach(var e in target.OrderBy(x=>x.relative.Length)) { e.full=Path.Combine(targetRoot,e.relative.Replace('/',Path.DirectorySeparatorChar)); NoLinks(Path.GetDirectoryName(e.full)); if(e.directory) Directory.CreateDirectory(e.full);else using(var f=new FileStream(e.full,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {} }
            return new{job=targetId};
        }
        if(op=="abort") {Abort();return new{aborted=true};}
        Require(target!=null && S(d,"job")==targetId && !committed,"INVALID_JOB");
        if(op=="write") {
            int i=checked((int)N(d,"index"));Require(i>=0&&i<target.Count,"INVALID_INDEX");var e=target[i];Require(!e.directory && N(d,"offset")==e.offset,"INVALID_OFFSET");
            string data=S(d,"data");Require(data.Length<=174764,"CHUNK_TOO_LARGE");byte[] b=Convert.FromBase64String(data);Require(b.Length>0 && b.Length<=Chunk && b.Length<=e.size-e.offset,"INVALID_LENGTH");Require(Hash(b)==S(d,"sha256"),"HASH_MISMATCH");NoLinks(e.full);
            using(var f=new FileStream(e.full,FileMode.Open,FileAccess.ReadWrite,FileShare.None)) {Require(f.Length==e.offset,"DESTINATION_CHANGED");f.Position=e.offset;f.Write(b,0,b.Length);f.Flush(true); f.Position=e.offset;byte[] check=new byte[b.Length];int n=0;while(n<check.Length){int r=f.Read(check,n,check.Length-n);Require(r>0,"WRITE_FAILED");n+=r;}Require(Hash(check)==Hash(b),"WRITE_FAILED");}e.offset+=b.Length;
            return new{offset=e.offset};
        }
        if(op=="commit") {
            Require(target.All(x=>x.directory || x.offset==x.size),"TRANSFER_INCOMPLETE");
            foreach(var e in target) {NoLinks(e.full);if(!e.directory)Require(new FileInfo(e.full).Length==e.size,"DESTINATION_CHANGED");}
            Require(GetClipboardSequenceNumber()==targetSequence,"CLIPBOARD_CHANGED");
            var paths=new StringCollection();foreach(var e in target.Where(x=>!x.relative.Contains('/')))paths.Add(e.full);
            // CF_HDROP plus explicit COPY; never delete the source as Cut would.
            var value=new DataObject();value.SetFileDropList(paths);value.SetData("Preferred DropEffect",new MemoryStream(new byte[]{1,0,0,0}));Clipboard.SetDataObject(value,true,10,100);committed=true;
            return new{ready=true,sequence=GetClipboardSequenceNumber()};
        }
        throw new InvalidOperationException("UNKNOWN_OPERATION");
    }
    [STAThread] static void Main(string[] args) {
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
        TextReader input=Console.In;TextWriter output=Console.Out;
        System.IO.Pipes.NamedPipeClientStream pipe=null;
        if(args.Length==2 && args[0]=="--pipe") {
            pipe=new System.IO.Pipes.NamedPipeClientStream(".",args[1],System.IO.Pipes.PipeDirection.InOut);
            pipe.Connect(10000);input=new StreamReader(pipe,new UTF8Encoding(false));output=new StreamWriter(pipe,new UTF8Encoding(false)){AutoFlush=true};
        }
        output.WriteLine("{\"ready\":true}");output.Flush();
        try {string line;while((line=input.ReadLine())!=null) {object id=null;try {Require(line.Length<=4194304,"REQUEST_TOO_LARGE");var d=json.Deserialize<Dictionary<string,object>>(line);id=d.ContainsKey("id")?d["id"]:null;output.WriteLine(Wire(new{id=id,ok=true,result=Handle(d)}));}catch(Exception ex){output.WriteLine(Wire(new{id=id,ok=false,error=ex.Message}));}output.Flush();}} catch(IOException) { } finally {Abort();if(pipe!=null)pipe.Dispose();}
    }
}
