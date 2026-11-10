import TurndownService from 'turndown';
import { markLabel,responseLineCount,sectionHeading,type MasterTest } from './model';
import type { GeneratedVersion, RenderedQuestion } from './generate';
import { fileBase } from './storage';
import { zipSync,strToU8 } from 'fflate';
const td=new TurndownService({headingStyle:'atx',bulletListMarker:'-'});
td.addRule('subscript',{filter:'sub',replacement:(content)=>'~'+content+'~'});
td.addRule('superscript',{filter:'sup',replacement:(content)=>'^'+content+'^'});
// Keep imported table geometry in standard Markdown's raw-HTML extension.
td.addRule('embeddedTable',{filter:'table',replacement:(_content,node)=>'\n\n'+(node as HTMLElement).outerHTML+'\n\n'});
function md(html:string):string{return td.turndown(html||'').trim();}
function answerFor(q:RenderedQuestion):string {
  if(q.type==='singleChoice'||q.type==='multipleSelect') {
    const letters=q.choices.map((c,i)=>q.correctChoiceIds.includes(c.id)?String.fromCharCode(65+i):null).filter(Boolean);
    return letters.join(', ');
  }return md(q.referenceAnswer)||'(No reference answer)';
}
export function versionMarkdown(master:MasterTest,v:GeneratedVersion,answers=false):string {
  let out='# '+master.title+' — '+(answers?'Answer Key ':'Version ')+v.label+'\n\n';
  if(master.lastGeneration)out+='Run ID: '+master.lastGeneration.runId+'\n\n';
  if(md(master.instructions))out+=md(master.instructions)+'\n\n';
  for(const s of v.sections){
    out+='## '+sectionHeading(s.title,s.proficiency,'markdown')+'\n\n';
    if(md(s.instructions))out+=md(s.instructions)+'\n\n';
    for(const q of s.questions){
      if(q.groupHtml)out+=md(q.groupHtml)+'\n\n';
      out+='**'+q.number+'.** '+md(q.stem)+' *('+markLabel(q.points)+')*\n\n';
      if(q.choices.length)q.choices.forEach((c,i)=>{out+='   '+String.fromCharCode(65+i)+'. '+md(c.html)+'\n\n';});
      if(answers)out+='**Answer:** '+answerFor(q)+'\n\n';
      else if(q.type==='shortAnswer'||q.type==='writtenResponse')out+=Array.from({length:responseLineCount(q.type,q.responseLines)},()=>String.raw`\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_`).join('\n\n')+'\n\n';
    }
  }
  return out;
}
export function exportFilename(master:MasterTest,v:GeneratedVersion,answers:boolean):string {
  return fileBase(master)+'-V'+v.label+(answers?'-key':'')+'.md';
}

export function bundleFiles(master:MasterTest,versions:GeneratedVersion[]):Record<string,Uint8Array>{
 const out:Record<string,Uint8Array>={};
 for(const v of versions)for(const key of [false,true])out[exportFilename(master,v,key)]=strToU8(versionMarkdown(master,v,key));
 out['generation-manifest.json']=strToU8(JSON.stringify({testId:master.id,title:master.title,generation:master.lastGeneration},null,2));
 return out;
}
export function bundleZip(master:MasterTest,versions:GeneratedVersion[]):Uint8Array {
 return zipSync(bundleFiles(master,versions),{level:6});
}
