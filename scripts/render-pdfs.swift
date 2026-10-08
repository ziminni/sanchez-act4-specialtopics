import PDFKit
import AppKit
import Foundation
let args=CommandLine.arguments.dropFirst()
for name in args {let d=PDFDocument(url:URL(fileURLWithPath:name))!;let rows=Int(ceil(Double(d.pageCount)/3.0));let image=NSImage(size:NSSize(width:900,height:rows*430));image.lockFocus();NSColor.white.setFill();NSRect(x:0,y:0,width:900,height:rows*430).fill();for i in 0..<d.pageCount {let p=d.page(at:i)!;let t=p.thumbnail(of:NSSize(width:280,height:400),for:.mediaBox);t.draw(in:NSRect(x:(i%3)*300+10,y:(rows-1-i/3)*430+15,width:280,height:400));};image.unlockFocus();let b=NSBitmapImageRep(data:image.tiffRepresentation!)!;let out="/private/tmp/bcis-"+URL(fileURLWithPath:name).deletingPathExtension().lastPathComponent+".png";try! b.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:out));print(name,d.pageCount,out)}
