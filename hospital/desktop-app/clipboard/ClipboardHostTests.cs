using System;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
class ClipboardHostTests {
 static JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=4194304};static int count;
 static Dictionary<string,object> Call(object value) {
  var req=json.Deserialize<Dictionary<string,object>>(json.Serialize(value));
  try {return json.Deserialize<Dictionary<string,object>>(json.Serialize(typeof(ClipboardHost).GetMethod("Handle",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{req})));}
  catch(TargetInvocationException e){throw e.InnerException;}
 }
 static void Check(bool condition,string name){if(!condition)throw new Exception("FAIL: "+name);Console.WriteLine("PASS: "+name);count++;}
 static void Error(Action action,string code){try{action();throw new Exception("Expected "+code);}catch(InvalidOperationException e){Check(e.Message==code,code);}}
 [STAThread] static void Main(string[] args) {
  var previous=new DataObject();var original=Clipboard.GetDataObject();
  if(original!=null)foreach(string format in original.GetFormats(false)){var value=original.GetData(format,false);if(value!=null)previous.SetData(format,false,value);}
  string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
  try{
   string folder=Path.Combine(root,"โฟลเดอร์ทดสอบ");Directory.CreateDirectory(folder);Directory.CreateDirectory(Path.Combine(folder,"ว่าง"));
   byte[] bytes=new byte[300123];new Random(123).NextBytes(bytes);File.WriteAllBytes(Path.Combine(folder,"ข้อมูล.bin"),bytes);File.WriteAllBytes(Path.Combine(folder,"ศูนย์.txt"),new byte[0]);
   string second=Path.Combine(root,"ไฟล์ที่สอง.txt");File.WriteAllText(second,"SCP-Remote ทดสอบ",Encoding.UTF8);
   var paths=new StringCollection();paths.Add(folder);paths.Add(second);Clipboard.SetFileDropList(paths);
   var snap=Call(new{op="snapshot"});var entries=(ArrayList)snap["entries"];
   Check(entries.Count==5,"CF_HDROP snapshot: multiple files, Thai names, folders, empty directory");
   Error(()=>Call(new{op="read",job="wrong",index=0,offset=0}),"INVALID_JOB");
   foreach(string bad in new[]{"../escape","C:/escape","a/../../escape","file:stream","CON.txt","a\\b","trailing."})
    Error(()=>Call(new{op="prepare",entries=new[]{new{path=bad,directory=false,size=1}}}),"INVALID_PATH");
   Error(()=>Call(new{op="prepare",entries=new[]{new{path="x",directory=false,size=1},new{path="X",directory=false,size=1}}}),"DUPLICATE_NAME");
   Error(()=>Call(new{op="prepare",entries=new[]{new{path="a/b",directory=false,size=1}}}),"MISSING_PARENT");
   var seq=Call(new{op="state"})["sequence"];var job=Call(new{op="prepare",entries=entries,sequence=seq})["job"];
   Error(()=>Call(new{op="commit",job=job}),"TRANSFER_INCOMPLETE");
   bool checkedHash=false;
   for(int i=0;i<entries.Count;i++) {var e=(Dictionary<string,object>)entries[i];if((bool)e["directory"])continue;long size=Convert.ToInt64(e["size"]),offset=0;
    while(offset<size){var b=Call(new{op="read",job=snap["job"],index=i,offset=offset});if(!checkedHash){Error(()=>Call(new{op="write",job=job,index=i,offset=offset,data=b["data"],sha256="bad"}),"HASH_MISMATCH");checkedHash=true;}
     var ack=Call(new{op="write",job=job,index=i,offset=offset,data=b["data"],sha256=b["sha256"]});offset=Convert.ToInt64(ack["offset"]);
    }
   }
   Check((bool)Call(new{op="commit",job=job})["ready"],"verified chunks committed to CF_HDROP");
   var received=Clipboard.GetFileDropList();Check(received.Count==2,"Windows clipboard has two pasteable root items");
   Check(Convert.ToBase64String(File.ReadAllBytes(Path.Combine(received[0],"ข้อมูล.bin")))==Convert.ToBase64String(bytes),"file contents match after multi-chunk transfer");
   Check(Directory.Exists(Path.Combine(received[0],"ว่าง"))&&new FileInfo(Path.Combine(received[0],"ศูนย์.txt")).Length==0,"empty folder and zero-byte file preserved");
   Check(File.ReadAllText(received[1])==File.ReadAllText(second),"second file preserved");
   seq=Call(new{op="state"})["sequence"];job=Call(new{op="prepare",entries=new[]{new{path="empty.txt",directory=false,size=0}},sequence=seq})["job"];
   Clipboard.SetText("New clipboard data");Error(()=>Call(new{op="commit",job=job}),"CLIPBOARD_CHANGED");Call(new{op="abort"});
   seq=Call(new{op="state"})["sequence"];Call(new{op="text",text="ข้อความสองทาง",sequence=seq});Check(Clipboard.GetText()=="ข้อความสองทาง","Unicode text clipboard");
   Check((string)Call(new{op="snapshot"})["text"]=="ข้อความสองทาง","text snapshot");
   Console.WriteLine(count+" checks passed.");
  }finally{Call(new{op="abort"});Clipboard.SetDataObject(previous,true,10,100);}
 }
}
