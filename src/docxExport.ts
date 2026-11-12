/**
 * Milestone 3A: deterministic editable Office Open XML export.
 * Pure browser-side: no Word automation, external image services, or backend.
 * Export generated (already validated) versions, never the raw master order.
 */
import {zipSync,strToU8} from 'fflate';
import type {MasterTest} from './model';
import {markLabel,responseLineCount,sectionHeading,validateMaster} from './model';
import type {GeneratedVersion,RenderedQuestion} from './generate';
import {fileBase} from './storage';
import {stripExecutableHtml} from './contentIntegrity';

const NS_W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const NS_A='http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC='http://schemas.openxmlformats.org/drawingml/2006/picture';
const NS_WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const text=(s:string)=>'<w:t xml:space="preserve">'+esc(s)+'</w:t>';
const para=(contents:string,style?:string)=>'<w:p>'+(style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':'')+contents+'</w:p>';
const mathRun=(s:string)=>'<m:r><m:t xml:space="preserve">'+esc(s)+'</m:t></m:r>';
const mathArg=(name:string,contents:string)=>'<m:'+name+'>'+contents+'</m:'+name+'>';
const children=(e:Element)=>Array.from(e.children);
const tag=(e:Element)=>e.localName.toLowerCase();
function mathTree(e:Element):string{
 const t=tag(e), c=children(e), nested=()=>c.map(mathTree).join('');
 if(t==='math'||t==='mrow'||t==='mstyle'||t==='semantics')return nested();
 if(t==='mi'||t==='mn'||t==='mo'||t==='mtext'||t==='ms'||t==='mspace')return mathRun(e.textContent||'');
 if(t==='mfrac'&&c.length===2)return '<m:f><m:fPr><m:type m:val="bar"/></m:fPr>'+mathArg('num',mathTree(c[0]))+mathArg('den',mathTree(c[1]))+'</m:f>';
 if((t==='msup'||t==='msub'||t==='msubsup')&&c.length===(t==='msubsup'?3:2)){
  const form=t==='msup'?'sSup':t==='msub'?'sSub':'sSubSup';
  return '<m:'+form+'>'+mathArg('e',mathTree(c[0]))+
   (t!=='msup'?mathArg('sub',mathTree(c[1])):'')+
   (t!=='msub'?mathArg('sup',mathTree(c[t==='msubsup'?2:1])):'')+'</m:'+form+'>';
 }
 if(t==='msqrt')return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr>'+mathArg('deg','')+mathArg('e',nested())+'</m:rad>';
 if(t==='mroot'&&c.length===2)return '<m:rad>'+mathArg('deg',mathTree(c[1]))+mathArg('e',mathTree(c[0]))+'</m:rad>';
 if(t==='mfenced'){
  const beg=e.getAttribute('open')??'(',end=e.getAttribute('close')??')',sep=e.getAttribute('separators')??',';
  return '<m:d><m:dPr><m:begChr m:val="'+esc(beg)+'"/><m:endChr m:val="'+esc(end)+'"/><m:sepChr m:val="'+esc(sep)+'"/></m:dPr>'+mathArg('e',nested())+'</m:d>';
 }
 if((t==='munder'||t==='mover'||t==='munderover')&&(c.length===2||c.length===3)){
  const base=c[0].textContent||'';
  if(/^[∑∏∫∬∭⋃⋂]$/.test(base)){
   const lo=t!=='mover'?mathTree(c[1]):'',hi=t==='munderover'?mathTree(c[2]):t==='mover'?mathTree(c[1]):'';
   return '<m:nary><m:naryPr><m:chr m:val="'+esc(base)+'"/><m:limLoc m:val="undOvr"/></m:naryPr>'+mathArg('sub',lo)+mathArg('sup',hi)+mathArg('e','')+'</m:nary>';
  }
  const form=t==='munder'?'limLow':t==='mover'?'limUpp':'sSubSup';
  return '<m:'+form+'>'+mathArg('e',mathTree(c[0]))+
   (t!=='mover'?mathArg('lim',mathTree(c[1])):'')+
   (t==='mover'?mathArg('lim',mathTree(c[1])):t==='munderover'?mathArg('sup',mathTree(c[2])):'')+'</m:'+form+'>';
 }
 if(t==='mover'||t==='munder')throw Error('Unsupported mathematical limit structure: '+t);
 if(t==='mtable'||t==='mtr'||t==='mtd'||t==='menclose'||t==='mmultiscripts')throw Error('This equation needs manual review before editable Word export: '+t);
 throw Error('Unsupported MathML element for editable Word export: '+t);
}
interface Media {path:string;rid:string;mime:string;bytes:Uint8Array}
class WordWriter {
 media:Media[]=[];private nextDrawing=1;
 private mediaBySource=new Map<string,Media>();
 private run(body:string,format:{bold?:boolean;italic?:boolean;sub?:boolean;sup?:boolean}={}):string {
  const props=[format.bold?'<w:b/>':'',format.italic?'<w:i/>':'',format.sub?'<w:vertAlign w:val="subscript"/>':'',format.sup?'<w:vertAlign w:val="superscript"/>':''].join('');
  return '<w:r>'+(props?'<w:rPr>'+props+'</w:rPr>':'')+body+'</w:r>';
 }
 private image(e:Element):string {
  const src=e.getAttribute('src')||'';
  const match=/^data:image\/(png|jpe?g|gif);base64,([a-zA-Z0-9+/=\s]+)$/.exec(src);
  if(!match)throw Error('DOCX cannot embed unsupported or external image: '+src.slice(0,50));
  let entry=this.mediaBySource.get(src);
  if(!entry){
   const kind=match[1]==='jpg'?'jpeg':match[1];
   const binary=atob(match[2].replace(/\s/g,'')),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const ext=kind==='jpeg'?'jpg':kind;
   entry={path:'word/media/image'+(this.media.length+1)+'.'+ext,rid:'rId'+(this.media.length+2),mime:'image/'+kind,bytes};
   this.media.push(entry);this.mediaBySource.set(src,entry);
  }
  const width=Math.max(1,Number(e.getAttribute('width')||240)),height=Math.max(1,Number(e.getAttribute('height')||120));
  const cx=Math.round(width*9525),cy=Math.round(height*9525),id=this.nextDrawing++,alt=esc(e.getAttribute('alt')||'Imported image');
  return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/>'+
   '<wp:docPr id="'+id+'" name="Talus image '+id+'" descr="'+alt+'"/><wp:cNvGraphicFramePr/>'+
   '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'+
   '<pic:nvPicPr><pic:cNvPr id="0" name="'+alt+'"/><pic:cNvPicPr/></pic:nvPicPr>'+
   '<pic:blipFill><a:blip r:embed="'+entry.rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
   '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm>'+
   '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'+
   '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>';
 }
 private inline(e:Node,fmt:{bold?:boolean;italic?:boolean;sub?:boolean;sup?:boolean}={}):string{
  if(e.nodeType===3)return this.run(text(e.textContent||''),fmt);
  if(e.nodeType!==1)return '';
  const el=e as Element,t=tag(el);
  if(t==='math')return '<m:oMath>'+mathTree(el)+'</m:oMath>';
  if(t==='img')return this.run(this.image(el));
  if(t==='br')return this.run('<w:br/>');
  const f={...fmt};
  if(t==='b'||t==='strong')f.bold=true;
  if(t==='i'||t==='em')f.italic=true;
  if(t==='sup'){f.sup=true;f.sub=false;}
  if(t==='sub'){f.sub=true;f.sup=false;}
  if(t==='script'||t==='style'||t==='iframe')return '';
  return Array.from(el.childNodes).map(child=>this.inline(child,f)).join('');
 }
 private paragraphContents(el:Element):string {
  return Array.from(el.childNodes).map(n=>this.inline(n)).join('');
 }
 private table(el:Element):string {
  const rows=Array.from(el.querySelectorAll('tr')).filter(r=>r.closest('table')===el);
  const occupancy=new Map<number,{remaining:number;span:number}>();
  const emitted:{cells:{el:Element|null;span:number;merge?:'restart'|'continue'}[]}[]=[];
  let max=0;
  for(const row of rows){
   const cells=Array.from(row.children).filter(e=>tag(e)==='th'||tag(e)==='td');
   const rowCells:{el:Element|null;span:number;merge?:'restart'|'continue'}[]=[];
   let column=0,position=0;
   while(position<cells.length||[...occupancy.keys()].some(k=>k>=column)){
    const pending=occupancy.get(column);
    if(pending){
     rowCells.push({el:null,span:pending.span,merge:'continue'});
     occupancy.delete(column);
     if(pending.remaining>1)occupancy.set(column,{remaining:pending.remaining-1,span:pending.span});
     column+=pending.span;continue;
    }
    if(position>=cells.length){column++;continue;}
    const cell=cells[position++];
    const span=Math.max(1,Number(cell.getAttribute('colspan')||1));
    const rowsLeft=Math.max(1,Number(cell.getAttribute('rowspan')||1));
    rowCells.push({el:cell,span,merge:rowsLeft>1?'restart':undefined});
    if(rowsLeft>1)occupancy.set(column,{remaining:rowsLeft-1,span});
    column+=span;
   }
   max=Math.max(max,column);emitted.push({cells:rowCells});
  }
  const grid='<w:tblGrid>'+Array.from({length:max},()=>'<w:gridCol w:w="'+Math.floor(9000/Math.max(max,1))+'"/>').join('')+'</w:tblGrid>';
  return '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>'+
   ['top','bottom','left','right','insideH','insideV'].map(x=>'<w:'+x+' w:val="single" w:sz="4" w:color="888888"/>').join('')+
   '</w:tblBorders></w:tblPr>'+grid+emitted.map(row=>'<w:tr>'+row.cells.map(cell=>{
    const props=(cell.span>1?'<w:gridSpan w:val="'+cell.span+'"/>':'')+(cell.merge?'<w:vMerge w:val="'+cell.merge+'"/>':'');
    const body=cell.el?this.blocksFromNodes(Array.from(cell.el.childNodes)):para('');
    return '<w:tc><w:tcPr>'+props+'</w:tcPr>'+(body||para(''))+'</w:tc>';
   }).join('')+'</w:tr>').join('')+'</w:tbl>';
 }
 private blocksFromNodes(nodes:Node[]):string{
  let out='',pending='';
  const flush=()=>{if(pending){out+=para(pending);pending='';}};
  for(const n of nodes){
   if(n.nodeType===3){if((n.textContent||'').trim())pending+=this.inline(n);continue;}
   if(n.nodeType!==1)continue;
   const el=n as Element,t=tag(el);
   if(t==='p'||t==='div'||t==='h1'||t==='h2'||t==='h3'){
    flush();const sub=this.paragraphContents(el);
    if(sub)out+=para(sub,t.startsWith('h')?'Heading'+t.slice(1):undefined);
    else if(t==='p')out+=para('');
   }else if(t==='table'){flush();out+=this.table(el);}
   else if(t==='ul'||t==='ol'){
    flush();let index=0;for(const li of children(el)){if(tag(li)!=='li')continue;index++;
     out+=para(this.run(text(t==='ul'?'•  ':index+'.  '))+this.paragraphContents(li));
    }
   }else if(t==='math'&&el.getAttribute('display')==='block'){
    flush();out+=para('<m:oMathPara><m:oMath>'+mathTree(el)+'</m:oMath></m:oMathPara>');
   }else if(t==='br'){flush();out+=para('');}
   else if(t==='img'){flush();out+=para(this.inline(el));}
   else pending+=this.inline(el);
  }
  flush();return out;
 }
 html(html:string):string {
  const parsed=new DOMParser().parseFromString(stripExecutableHtml(html||''),'text/html');
  return this.blocksFromNodes(Array.from(parsed.body.childNodes));
 }
 plain(s:string,style?:string):string{return para(this.run(text(s)),style);}
 question(q:RenderedQuestion,key:boolean):string {
  let out='';
  if(q.groupHtml)out+=this.html(q.groupHtml);
  out+=this.plain(q.number+'.   '+markLabel(q.points));
  out+=this.html(q.stem);
  q.choices.forEach((choice,i)=>{
   out+=this.plain(String.fromCharCode(65+i)+'.');
   out+=this.html(choice.html);
  });
  if(key){
   const letters=q.choices.map((c,i)=>q.correctChoiceIds.includes(c.id)?String.fromCharCode(65+i):'').filter(Boolean).join(', ');
   out+=this.plain('Answer: '+letters);
   if(!q.choices.length)out+=this.html(q.referenceAnswer);
  }else if(!q.choices.length){
   for(let i=0;i<responseLineCount(q.type,q.responseLines);i++)out+=this.plain('________________________________________________');
  }
  return out;
 }
 build(master:MasterTest,v:GeneratedVersion,answerKey:boolean):Uint8Array {
  let body=this.plain(master.title+' — '+(answerKey?'Answer Key ':'Version ')+v.label,'Title');
  if(master.lastGeneration)body+=this.plain('Run ID: '+master.lastGeneration.runId);
  body+=this.html(master.instructions);
  for(const section of v.sections){
   body+=this.plain(sectionHeading(section.title,section.proficiency),'Heading1');
   body+=this.html(section.instructions);
   for(const q of section.questions)body+=this.question(q,answerKey);
  }
  body+='<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr>';
  const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<w:document xmlns:w="'+NS_W+'" xmlns:r="'+NS_R+'" xmlns:m="'+NS_M+'" xmlns:a="'+NS_A+
   '" xmlns:pic="'+NS_PIC+'" xmlns:wp="'+NS_WP+'"><w:body>'+body+'</w:body></w:document>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
   this.media.map(m=>'<Relationship Id="'+m.rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+m.path.split('/').pop()+'"/>').join('')+
   '</Relationships>';
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
   '<Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
   [...new Set(this.media.map(m=>m.mime))].map(m=>'<Default Extension="'+(m==='image/jpeg'?'jpg':m.split('/')[1])+'" ContentType="'+m+'"/>').join('')+
   '</Types>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="'+NS_W+'">'+
   ['Title','Heading1','Heading2','Heading3'].map((name,i)=>'<w:style w:type="paragraph" w:styleId="'+name+'"><w:name w:val="'+name+'"/>'+
    '<w:rPr><w:b/><w:sz w:val="'+(i===0?'36':i===1?'28':'24')+'"/></w:rPr></w:style>').join('')+'</w:styles>';
  const files:Record<string,Uint8Array>={
   '[Content_Types].xml':strToU8(types),
   '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
   'word/document.xml':strToU8(document),
   'word/styles.xml':strToU8(styles),
   'word/_rels/document.xml.rels':strToU8(rels)
  };
  for(const m of this.media)files[m.path]=m.bytes;
  return zipSync(files,{level:6});
 }
}
export function versionDocx(master:MasterTest,version:GeneratedVersion,answers=false):Uint8Array{
 const errors=validateMaster(master);if(errors.length)throw Error('DOCX export blocked by validation: '+errors.join('; '));
 return new WordWriter().build(master,version,answers);
}
export function docxFilename(master:MasterTest,version:GeneratedVersion,answers=false):string{
 return fileBase(master)+'-V'+version.label+(answers?'-key':'')+'.docx';
}
export function bundleDocx(master:MasterTest,versions:GeneratedVersion[]):Uint8Array{
 const files:Record<string,Uint8Array>={};
 for(const v of versions)for(const key of [false,true])files[docxFilename(master,v,key)]=versionDocx(master,v,key);
 files['generation-manifest.json']=strToU8(JSON.stringify({testId:master.id,title:master.title,generation:master.lastGeneration,format:'editable-docx'},null,2));
 return zipSync(files,{level:6});
}
