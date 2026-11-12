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
/** Word n-ary nodes must own the expression following the operator; an empty
 * m:e silently changes the formula, so never emit a detached summand. */
function isNary(e:Element):boolean {
 const c=children(e);
 return ['munder','mover','munderover'].includes(tag(e)) &&
  !!c.length && /^[∑∏∫∬∭⋃⋂]$/.test(c[0].textContent||'');
}
function naryWithOperand(operator:Element,operand:Element):string{
 const c=children(operator),t=tag(operator);
 if((t==='munderover'&&c.length!==3)||(t!=='munderover'&&c.length!==2))
  throw Error('Summation operand or limit structure is incomplete.');
 const lo=t!=='mover'?mathTree(c[1]):'';
 const hi=t==='munderover'?mathTree(c[2]):t==='mover'?mathTree(c[1]):'';
 if(!operand.textContent?.trim())throw Error('Summation operand is missing.');
 if(tag(operand)==='mo'&&/^[+=−-]$/.test(operand.textContent||''))
  throw Error('Summation operand is ambiguous; group it explicitly.');
 const body=mathTree(operand);
 if(!body.trim())throw Error('Summation operand is missing.');
 return '<m:nary><m:naryPr><m:chr m:val="'+esc(c[0].textContent||'')+
  '"/><m:limLoc m:val="undOvr"/></m:naryPr>'+
  mathArg('sub',lo)+mathArg('sup',hi)+mathArg('e',body)+'</m:nary>';
}
function mathSiblings(items:Element[]):string{
 let result='';
 for(let i=0;i<items.length;i++){
  const current=items[i];
  if(isNary(current)){
   if(i+1>=items.length)throw Error('Summation operand is missing after the operator.');
   result+=naryWithOperand(current,items[++i]);
  }else result+=mathTree(current);
 }
 return result;
}
function mathTree(e:Element):string{
 const t=tag(e), c=children(e), nested=()=>mathSiblings(c);
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
  if(/^[∑∏∫∬∭⋃⋂]$/.test(base))
   throw Error('Summation operand is missing or detached; place its body after the operator.');
  if(t==='munderover')
   return '<m:sSubSup>'+mathArg('e',mathTree(c[0]))+
    mathArg('sub',mathTree(c[1]))+mathArg('sup',mathTree(c[2]))+'</m:sSubSup>';
  const form=t==='munder'?'limLow':'limUpp';
  return '<m:'+form+'>'+mathArg('e',mathTree(c[0]))+
   mathArg('lim',mathTree(c[1]))+'</m:'+form+'>';
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
  const originalWidth=Math.max(1,Number(e.getAttribute('width')||240));
  const originalHeight=Math.max(1,Number(e.getAttribute('height')||120));
  // Printable US Letter width at 1-inch margins: 6.5 inches = 624 CSS px.
  // Scale oversize drawings proportionally; never crop or distort their bytes.
  const scale=Math.min(1,624/originalWidth);
  const width=originalWidth*scale,height=originalHeight*scale;
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
  // Source Word commonly uses <td> rather than <th> for header rows.
  // Recognize an all-text leading row followed by measured values.
  const firstRow=rows[0];
  const firstCells=firstRow?Array.from(firstRow.children).filter(e=>tag(e)==='th'||tag(e)==='td'):[];
  const hasHeaderCells=firstCells.some(e=>tag(e)==='th');
  const looksLikeHeader=rows.length>1 && firstCells.length>0 &&
   firstCells.every(e=>!!e.textContent?.trim() && !/\d/.test(e.textContent||'') &&
    (e.textContent||'').trim().length<90) &&
   rows.slice(1).some(row=>/\d/.test(row.textContent||''));
  const headerRow=hasHeaderCells||looksLikeHeader;
  const keepCompactRowsTogether=rows.length<=5;
  const grid='<w:tblGrid>'+Array.from({length:max},()=>'<w:gridCol w:w="'+Math.floor(9000/Math.max(max,1))+'"/>').join('')+'</w:tblGrid>';
  return '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblBorders>'+
   ['top','bottom','left','right','insideH','insideV'].map(x=>'<w:'+x+' w:val="single" w:sz="4" w:color="888888"/>').join('')+
   '</w:tblBorders></w:tblPr>'+grid+emitted.map((row,i)=>'<w:tr><w:trPr><w:cantSplit/>'+(i===0&&headerRow?'<w:tblHeader w:val="true"/>':'')+'</w:trPr>'+row.cells.map(cell=>{
    const props=(cell.span>1?'<w:gridSpan w:val="'+cell.span+'"/>':'')+(cell.merge?'<w:vMerge w:val="'+cell.merge+'"/>':'');
    const body=cell.el?this.blocksFromNodes(Array.from(cell.el.childNodes)):para('');
    const styled=(body||para('')).replace(/<w:p>(?!<w:pPr>)/g,'<w:p><w:pPr><w:pStyle w:val="TableCell"/></w:pPr>');
    // Paragraph keep-with-next is understood by Word/Writer across table rows.
    // Use only for compact tables to avoid making large tables unbreakable.
    const guarded=keepCompactRowsTogether&&i<emitted.length-1
     ? styled.replace(/<w:pPr>/g,'<w:pPr><w:keepNext/>')
     : styled;
    return '<w:tc><w:tcPr>'+props+'</w:tcPr>'+guarded+'</w:tc>';
   }).join('')+'</w:tr>').join('')+'</w:tbl>';
 }
 private blocksFromNodes(nodes:Node[]):string{
  let out='',pending='';
  const flush=()=>{if(pending){out+=para(pending);pending='';}};
  for(const n of nodes){
   if(n.nodeType===3){if((n.textContent||'').trim())pending+=this.inline(n);continue;}
   if(n.nodeType!==1)continue;
   const el=n as Element,t=tag(el);
   // Word requires block-level w:tbl. Some imported Word HTML stores
   // a table under <p> (invalid HTML but preserved by earlier import stages).
   // Do not pass such descendants through inline(), which flattens their cells.
   if(el.querySelector('table')&&t!=='table'){
    flush();out+=this.blocksFromNodes(Array.from(el.childNodes));
   }else if(t==='p'||t==='div'||t==='h1'||t==='h2'||t==='h3'){
    flush();const sub=this.paragraphContents(el);
    if(sub){
     // Nested spans or prose-only edits must not change diagram alignment.
     const imageOnly=!(el.textContent||'').trim() && el.querySelectorAll('img').length>0 &&
      !el.querySelector('table,math');
     const onlyDisplayMath=children(el).length===1 && tag(children(el)[0])==='math' && children(el)[0].getAttribute('display')==='block';
     if(imageOnly||onlyDisplayMath)out+= '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr>'+sub+'</w:p>';
     else out+=para(sub,t.startsWith('h')?'Heading'+t.slice(1):undefined);
    }
    // Intentionally omit empty imported paragraphs; they can break the
    // heading's keep-with-next chain and orphan a section at a page bottom.
   }else if(t==='table'){flush();out+=this.table(el);}
   else if(t==='ul'||t==='ol'){
    flush();let index=0;for(const li of children(el)){if(tag(li)!=='li')continue;index++;
     out+=para(this.run(text(t==='ul'?'•  ':index+'.  '))+this.paragraphContents(li));
    }
   }else if(t==='math'&&el.getAttribute('display')==='block'){
    flush();out+=para('<m:oMathPara><m:oMath>'+mathTree(el)+'</m:oMath></m:oMathPara>');
   }else if(t==='br'){flush();out+=para('');}
   else if(t==='img'){flush();out+='<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr>'+this.inline(el)+'</w:p>';}
   else pending+=this.inline(el);
  }
  flush();return out;
 }
 html(html:string):string {
  const parsed=new DOMParser().parseFromString(stripExecutableHtml(html||''),'text/html');
  return this.blocksFromNodes(Array.from(parsed.body.childNodes));
 }
 plain(s:string,style?:string):string{return para(this.run(text(s)),style);}
 /** Keep Word question numbers, marks and answer letters on the prompt line. */
 private labelledHtml(html:string,prefix:string,suffix='',style='Question'):string{
  const body=this.html(html);
  if(!body.startsWith('<w:p>')||body.startsWith('<w:p><w:pPr>'))
   return this.plain(prefix+suffix,style)+body;
  return ('<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>'+this.run(text(prefix))+body.slice(5))
   .replace('</w:p>',this.run(text(suffix))+'</w:p>');
 }
 question(q:RenderedQuestion,key:boolean):string {
  let out='';
  if(q.groupHtml)out+=this.html(q.groupHtml);
  const stemXml=this.labelledHtml(q.stem,q.number+'. ','  ('+markLabel(q.points)+')');
  // Explicit direct pagination control improves parity between Word and Writer,
  // rather than depending solely on paragraph-style inheritance.
  out+=stemXml.replace(/<w:pPr>/,'<w:pPr><w:keepNext/>');
  const compactChoices=q.choices.length>=2&&q.choices.length<=5;
  q.choices.forEach((choice,i)=>{
   const choiceXml=this.labelledHtml(choice.html,String.fromCharCode(65+i)+'. ','','Choice');
   // Chain complete short MC groups without preventing large groups from paginating.
   // The key's final choice also stays with the answer label.
   const keep=compactChoices&&(i<q.choices.length-1||key);
   out+=keep?choiceXml.replace(/<w:pPr>/,'<w:pPr><w:keepNext/>'):choiceXml;
  });
  if(key){
   const letters=q.choices.map((c,i)=>q.correctChoiceIds.includes(c.id)?String.fromCharCode(65+i):'').filter(Boolean).join(', ');
   if(q.choices.length)out+=this.plain('Answer: '+letters,'Answer');
   else out+=this.labelledHtml(q.referenceAnswer,'Answer: ','','Answer');
  }else if(!q.choices.length){
   const count=responseLineCount(q.type,q.responseLines);
   // Each four-line chunk has its own question-number context and is kept
   // together, but longer responses can still continue onto another page.
   for(let start=0;start<count;start+=4){
    const size=Math.min(4,count-start);
    out+=this.plain('Question '+q.number+' — response space'+(start?' (continued)':''),'ResponseLabel')
      .replace(/<w:pPr>/,'<w:pPr><w:keepNext/>');
    for(let i=0;i<size;i++){
     const line=this.plain('________________________________________________','ResponseLine');
     out+=i<size-1?line.replace(/<w:pPr>/,'<w:pPr><w:keepNext/>'):line;
    }
   }
  }
  return out;
 }
 build(master:MasterTest,v:GeneratedVersion,answerKey:boolean):Uint8Array {
  let body=this.plain(master.title+' — '+(answerKey?'Answer Key ':'Version ')+v.label,'Title');
  if(master.lastGeneration)body+=this.plain('Run ID: '+master.lastGeneration.runId,'Metadata');
  if(!answerKey)body+=this.plain('Name: ______________________________    Class: ______________    Date: ______________','StudentDetails');
  body+=this.html(master.instructions);
  for(const section of v.sections){
   body+=this.plain(sectionHeading(section.title,section.proficiency),'Heading1');
   body+=this.html(section.instructions);
   for(const q of section.questions)body+=this.question(q,answerKey);
  }
  body+='<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>';
  const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<w:document xmlns:w="'+NS_W+'" xmlns:r="'+NS_R+'" xmlns:m="'+NS_M+'" xmlns:a="'+NS_A+
   '" xmlns:pic="'+NS_PIC+'" xmlns:wp="'+NS_WP+'"><w:body>'+body+'</w:body></w:document>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
   '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'+
   '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'+
   this.media.map(m=>'<Relationship Id="'+m.rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+m.path.split('/').pop()+'"/>').join('')+
   '</Relationships>';
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
   '<Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
   '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'+
   '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'+
   [...new Set(this.media.map(m=>m.mime))].map(m=>'<Default Extension="'+(m==='image/jpeg'?'jpg':m.split('/')[1])+'" ContentType="'+m+'"/>').join('')+
   '</Types>';
  const style=(id:string,name:string,paragraph:string,run='')=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+name+'"/><w:basedOn w:val="Normal"/><w:pPr>'+paragraph+'</w:pPr>'+(run?'<w:rPr>'+run+'</w:rPr>':'')+'</w:style>';
  const space=(before:number,after:number)=>'<w:spacing w:before="'+before+'" w:after="'+after+'" w:line="276" w:lineRule="auto"/>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="'+NS_W+'">'+
   '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>'+
   '<w:pPrDefault><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
   '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr>'+space(0,80)+'</w:pPr></w:style>'+
   style('Title','Title',space(0,180)+'<w:keepNext/>','<w:b/><w:sz w:val="32"/>')+
   style('Heading1','Section heading',space(220,100)+'<w:keepNext/><w:keepLines/>','<w:b/><w:sz w:val="26"/>')+
   style('Heading2','Subheading',space(160,80)+'<w:keepNext/>','<w:b/><w:sz w:val="24"/>')+
   style('Heading3','Minor heading',space(120,60)+'<w:keepNext/>','<w:b/>')+
   style('StudentDetails','Student fields',space(80,180)+'<w:keepNext/>')+
   style('Metadata','Run metadata',space(0,80),'<w:color w:val="606060"/><w:sz w:val="18"/>')+
   style('Question','Question prompt',space(160,70)+'<w:keepNext/><w:keepLines/>')+
   style('Choice','Multiple-choice option',space(0,45)+'<w:ind w:left="360" w:hanging="180"/>')+
   style('Answer','Teacher answer',space(80,120)+'<w:ind w:left="240"/>','<w:color w:val="24436A"/>')+
   style('ResponseLabel','Response space label',space(80,20)+'<w:keepNext/>','<w:color w:val="606060"/><w:sz w:val="18"/>')+
   style('ResponseLine','Student response line',space(0,100)+'<w:ind w:left="240"/>')+
   style('TableCell','Table cell',space(0,0))+
   '</w:styles>';
  const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="'+NS_W+'">'+
   para(this.run(text(master.title+'  |  '+(answerKey?'Answer Key ':'Version ')+v.label)),'Metadata')+'</w:hdr>';
  const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="'+NS_W+'">'+
   para(this.run(text('Page '))+'<w:fldSimple w:instr="PAGE"><w:r>'+text('1')+'</w:r></w:fldSimple>','Metadata')+'</w:ftr>';
  const files:Record<string,Uint8Array>={
   '[Content_Types].xml':strToU8(types),
   '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
   'word/document.xml':strToU8(document),
   'word/styles.xml':strToU8(styles),
   'word/header1.xml':strToU8(header),
   'word/footer1.xml':strToU8(footer),
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
