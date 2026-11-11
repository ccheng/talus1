import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';

const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const children=(node:Element)=>Array.from(node.children).filter(x=>x.namespaceURI===M);
const child=(node:Element,name:string)=>children(node).find(x=>x.localName===name);
const inner=(node?:Element):string=>node?children(node).map(render).join(''):'';
const wrap=(s:string)=>'<mrow>'+s+'</mrow>';

function render(node:Element):string{
 const name=node.localName;
 // Office Math has property elements that control display rather than content.
 if(name.endsWith('Pr')||name==='ctrlPr')return '';
 if(name==='r'){
  const content=Array.from(node.getElementsByTagNameNS(M,'t')).map(t=>t.textContent??'').join('');
  if(!content)return '';
  const t=esc(content);
  if(/^[0-9.,]+$/.test(content))return '<mn>'+t+'</mn>';
  if(/^[+\-=×÷±∓<>≤≥∑∏∞(){}\[\],.]+$/.test(content))return '<mo>'+t+'</mo>';
  return '<mi>'+t+'</mi>';
 }
 if(['num','den','e','sup','sub','deg','lim','fName','oMath','oMathPara'].includes(name))return inner(node);
 if(name==='f')return '<mfrac>'+wrap(inner(child(node,'num')))+wrap(inner(child(node,'den')))+'</mfrac>';
 if(name==='sSup')return '<msup>'+wrap(inner(child(node,'e')))+wrap(inner(child(node,'sup')))+'</msup>';
 if(name==='sSub')return '<msub>'+wrap(inner(child(node,'e')))+wrap(inner(child(node,'sub')))+'</msub>';
 if(name==='sSubSup')return '<msubsup>'+wrap(inner(child(node,'e')))+wrap(inner(child(node,'sub')))+wrap(inner(child(node,'sup')))+'</msubsup>';
 if(name==='rad'){
  const value=wrap(inner(child(node,'e'))),deg=inner(child(node,'deg'));
  return deg?'<mroot>'+value+wrap(deg)+'</mroot>':'<msqrt>'+value+'</msqrt>';
 }
 if(name==='d')return '<mrow><mo>(</mo>'+children(node).filter(x=>x.localName==='e').map(render).join('<mo>,</mo>')+'<mo>)</mo></mrow>';
 if(name==='func')return '<mrow>'+inner(child(node,'fName'))+wrap(inner(child(node,'e')))+'</mrow>';
 if(name==='limLow')return '<munder>'+wrap(inner(child(node,'e')))+wrap(inner(child(node,'lim')))+'</munder>';
 if(name==='limUpp')return '<mover>'+wrap(inner(child(node,'e')))+wrap(inner(child(node,'lim')))+'</mover>';
 if(name==='nary'){
  const prop=child(node,'naryPr');
  const char=prop&&child(prop,'chr')?.getAttributeNS(M,'val')||'∑';
  const operator='<mo>'+esc(char)+'</mo>';
  return '<mrow><munderover>'+operator+wrap(inner(child(node,'sub')))+wrap(inner(child(node,'sup')))+'</munderover>'+wrap(inner(child(node,'e')))+'</mrow>';
 }
 if(name==='eqArr')return '<mtable>'+children(node).filter(x=>x.localName==='e').map(e=>'<mtr><mtd>'+wrap(inner(e))+'</mtd></mtr>').join('')+'</mtable>';
 if(name==='t')return '<mtext>'+esc(node.textContent??'')+'</mtext>';
 throw Error('Unsupported Word equation structure: '+name);
}

export interface WordMathResult { arrayBuffer:ArrayBuffer; equations:Record<string,string>; warnings:string[] }

/**
 * Mammoth does not render OMML equations. Replace each equation with an
 * unambiguous plain-text Word run *before* Mammoth parses the document, then
 * substitute sanitized MathML after conversion. Never drop unknown OMML.
 */
export function prepareWordMath(buffer:ArrayBuffer):WordMathResult{
 const bytes=unzipSync(new Uint8Array(buffer));
 const word=bytes['word/document.xml'];
 if(!word)return {arrayBuffer:buffer,equations:{},warnings:['Word document is missing its main XML part']};
 const xml=new DOMParser().parseFromString(strFromU8(word),'application/xml');
 const equations:Record<string,string>={},warnings:string[]=[];
 let index=0;
 const makeRun=(text:string,block:boolean):Element=>{
  const run=xml.createElementNS(W,'w:r');
  const t=xml.createElementNS(W,'w:t');t.textContent=text;run.appendChild(t);
  if(!block)return run;
  const p=xml.createElementNS(W,'w:p');p.appendChild(run);return p;
 };
 function consume(node:Element,block:boolean){
  const marker='TALUS_EQUATION_'+(++index)+'_END';
  try{
   const math=wrap(inner(node));
   if(!math.replace(/<[^>]+>/g,'').trim())throw Error('Empty Word equation content');
   equations[marker]='<math xmlns="http://www.w3.org/1998/Math/MathML" aria-label="Imported Word equation">'+math+'</math>';
  }catch(e){
   const issue=String(e instanceof Error?e.message:e);
   warnings.push(issue+' (equation '+index+'). Recreate or replace the equation before generating.');
   equations[marker]='<strong>[Word equation requires manual review: '+esc(issue)+']</strong>';
  }
  node.parentNode?.replaceChild(makeRun(marker,block),node);
 }
 const blocks=Array.from(xml.getElementsByTagNameNS(M,'oMathPara'));
 for(const block of blocks)consume(block,true);
 const inline=Array.from(xml.getElementsByTagNameNS(M,'oMath'));
 for(const eq of inline)consume(eq,false);
 if(!index)return {arrayBuffer:buffer,equations,warnings};
 bytes['word/document.xml']=strToU8(new XMLSerializer().serializeToString(xml));
 const out=zipSync(bytes);
 return {arrayBuffer:out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength) as ArrayBuffer,equations,warnings};
}

export function restoreWordMath(html:string,equations:Record<string,string>):string{
 let out=html;
 for(const [token,math] of Object.entries(equations)){
  // The marker is generated internally, never from the uploaded document.
  out=out.split(token).join(math);
 }
 return out;
}
