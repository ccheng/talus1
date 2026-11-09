import {useState,type ChangeEvent} from 'react';
import DOMPurify from 'dompurify';
import * as mammoth from 'mammoth';
import {marked} from 'marked';
import {parseText,parseHtml,parseLines,textLines,reviewWarnings,mergeIntoMaster,type ImportDraft,type ImportQuestion,type ImportSection} from './importParser';
import type {MasterTest,QuestionType} from './model';

const uid=()=>crypto.randomUUID();
const asHtml=(value:string)=>value.includes('<')?value:'<p>'+value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p>';
const text=(html:string)=>{const tmp=document.createElement('div');tmp.innerHTML=DOMPurify.sanitize(html);return tmp.textContent||'';};
export function ImportWorkspace({master,onAccept,onClose}:{master:MasterTest;onAccept:(m:MasterTest)=>void;onClose:()=>void}){
 const [source,setSource]=useState('');
 const [format,setFormat]=useState<'plain'|'markdown'>('plain');
 const [draft,setDraft]=useState<ImportDraft|null>(null);
 const [fileName,setFileName]=useState('');
 const [message,setMessage]=useState('');
 const [mode,setMode]=useState<'replace'|'append'>('replace');
 const [filter,setFilter]=useState<'all'|'warnings'>('all');
 const [expanded,setExpanded]=useState<string|null>(null);
 function makeDraft(raw:string,kind:'plain'|'markdown',name='Pasted assessment'){
  try{
   const parsed=kind==='markdown'?parseLines(textLines(raw).map(line=>({
    ...line,html:DOMPurify.sanitize(marked.parseInline(line.text.replace(/^#{1,6}\\s+/,''),{async:false}) as string)
  })),name,'markdown'):parseText(raw,name);
   setDraft(parsed);setExpanded(parsed.sections[0]?.questions[0]?.id??null);
   setMessage(parsed.sections.reduce((n,s)=>n+s.questions.length,0)+' question(s) detected. Review before importing.');
  }catch(error){setMessage('Unable to parse: '+String(error));}
 }
 async function readFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];if(!file)return;
  setFileName(file.name);
  const title=file.name.replace(/\.(docx|md|markdown|txt|html)$/i,'');
  try{
   if(/\.docx$/i.test(file.name)){
    const doc=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});
    const parsed=parseHtml(DOMPurify.sanitize(doc.value),title,'docx');
    parsed.warnings.push(...doc.messages.map(m=>'Word conversion: '+m.message));
    setDraft(parsed);setExpanded(parsed.sections[0]?.questions[0]?.id??null);
    setSource(parsed.source);setMessage('Word file parsed. Verify section headings and question boundaries.');
   }else if(/\.(md|markdown)$/i.test(file.name)){
    const raw=await file.text();setSource(raw);setFormat('markdown');makeDraft(raw,'markdown',title);
   }else if(/\.html?$/i.test(file.name)){
    const raw=await file.text();setSource(raw);
    setDraft(parseHtml(DOMPurify.sanitize(raw),title,'html'));
    setMessage('HTML imported. Review all questions.');
   }else{
    const raw=await file.text();setSource(raw);setFormat('plain');makeDraft(raw,'plain',title);
   }
  }catch(error){setMessage('File import failed: '+String(error));}
  event.target.value='';
 }
 function modify(fn:(copy:ImportDraft)=>void){
  setDraft(old=>{if(!old)return old;const next=structuredClone(old);fn(next);return next;});
 }
 function updateSection(id:string,field:keyof ImportSection,value:string){
  modify(d=>{const s=d.sections.find(s=>s.id===id);if(s)(s as unknown as Record<string,unknown>)[field]=value;});
 }
 function updateQuestion(id:string,fn:(q:ImportQuestion)=>void){
  modify(d=>{for(const s of d.sections){const q=s.questions.find(q=>q.id===id);if(q){fn(q);return;}}});
 }
 function moveQuestion(id:string,toId:string){
  modify(d=>{const from=d.sections.find(s=>s.questions.some(q=>q.id===id));const to=d.sections.find(s=>s.id===toId);
   if(!from||!to||from===to)return;
   const idx=from.questions.findIndex(q=>q.id===id);to.questions.push(from.questions.splice(idx,1)[0]);});
 }
 function splitQuestion(id:string){
  modify(d=>{for(const s of d.sections){
    const index=s.questions.findIndex(q=>q.id===id);if(index<0)continue;
    const q=s.questions[index];
    const match=/^([\s\S]+)(<p(?:\s+[^>]*)?>[\s\S]*?<\/p>)\s*$/i.exec(q.stem);
    let first:string;let last:string;
    if(match){first=match[1].trim();last=match[2].trim();}
    else {
      const parts=q.stem.split(/\n+/).map(x=>x.trim()).filter(Boolean);
      if(parts.length<2)return;
      first=parts.slice(0,-1).join('\n');last=parts[parts.length-1];
    }
    if(!text(first)||!text(last))return;
    q.stem=first;
    const next:ImportQuestion={...structuredClone(q),id:uid(),stem:last,choices:[],correct:[],answer:'',type:'shortAnswer',warnings:['Review split question and provide its answer']};
    s.questions.splice(index+1,0,next);setExpanded(next.id);return;
   }});
 }
 function mergeWithPrevious(id:string){
  modify(d=>{for(const s of d.sections){
    const index=s.questions.findIndex(q=>q.id===id);if(index<=0)continue;
    const previous=s.questions[index-1],current=s.questions[index];
    previous.stem+='\n'+current.stem;previous.sourceEnd=Math.max(previous.sourceEnd,current.sourceEnd);
    if(current.choices.length)previous.choices.push(...current.choices);
    if(current.answer){
      if(previous.answer)previous.reviewFlags=[...(previous.reviewFlags??[]),'Merged two keyed questions: verify and acknowledge the combined reference answer'];
      previous.answer+=(previous.answer?'\n':'')+current.answer;
    }
    previous.correct=[];if(previous.choices.length)previous.reviewFlags=[...(previous.reviewFlags??[]),'Merged answer choices: verify the correct selection'];
    s.questions.splice(index,1);setExpanded(previous.id);return;
   }});
 }
 function accept(){
  if(!draft)return;
  const warnings=reviewWarnings(draft);
  const empty=draft.sections.flatMap(s=>s.questions).filter(q=>!text(q.stem).trim());
  if(empty.length){setMessage('Cannot import empty question prompts. Edit or remove them first.');return;}
  if(!draft.sections.some(s=>s.questions.length)){setMessage('No questions detected. Add a question before accepting.');return;}
  if(warnings.length&&!window.confirm(warnings.length+' unresolved warning(s), including missing answer keys. Import anyway? You can finish those questions in the authoring workspace.'))return;
  if(mode==='replace'&&!window.confirm('Replace the current assessment with the reviewed import? Export a JSON backup first if you need the existing assessment.'))return;
  try{onAccept(mergeIntoMaster(master,draft,mode));}catch(error){setMessage(String(error));}
 }
 const warnings=draft?reviewWarnings(draft):[];
 const count=draft?.sections.reduce((n,s)=>n+s.questions.length,0)??0;
 return <div className="import-workspace">
  <div className="import-header"><div><h1>Import an existing assessment</h1><p>2A: deterministic parsing · 2B: review and correct before accepting</p></div><button className="secondary" onClick={onClose}>Back to authoring</button></div>
  {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}
  <div className="import-two-pane">
   <section className="panel import-source"><h2>1. Source</h2>
    <label>Upload an assessment (.docx, .md, .txt, .html)
     <input aria-label="Upload assessment" type="file" accept=".docx,.md,.markdown,.txt,.html,.htm" onChange={e=>void readFile(e)}/></label>
    {fileName&&<p className="help">Loaded: {fileName}</p>}
    <label>Or paste text from Word or Google Docs
     <select aria-label="Pasted input format" value={format} onChange={e=>setFormat(e.target.value as typeof format)}>
      <option value="plain">Plain text</option><option value="markdown">Markdown</option>
     </select>
     <textarea aria-label="Assessment source" rows={17} value={source} onChange={e=>setSource(e.target.value)} placeholder={'Section 1: Foundations\n1. Which formula is water?\nA. H2O\nB. CO2\nAnswer: A\n2. Explain your reasoning.\nAnswer: ...'}/>
    </label>
    <button className="primary" onClick={()=>makeDraft(source,format,'Pasted assessment')} disabled={!source.trim()}>Detect sections and questions</button>
    <p className="help">Parsing is entirely in your browser. The original assessment stays unchanged until you accept. Your in-progress review remains available if you switch to Author and back.</p>
    {draft&&<div className="import-original"><h3>Original source (read-only reference)</h3><pre>{draft.source}</pre></div>}
   </section>
   <section className="panel import-review"><div className="panel-heading"><h2>2. Review proposed structure</h2><span>{count} questions · {warnings.length} warnings</span></div>
    {!draft?<div className="empty-panel"><h3>No parsed assessment yet</h3><p>Paste or upload an assessment to preview its sections and questions.</p></div>:<>
     <label>Assessment title<input aria-label="Imported assessment title" value={draft.title} onChange={e=>modify(d=>{d.title=e.target.value;})}/></label>
     <div className="import-review-tools">
      <label>Show <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All questions</option><option value="warnings">Only questions needing review</option></select></label>
      <button className="secondary" onClick={()=>modify(d=>{d.sections.push({id:uid(),title:'New section',proficiency:'',instructions:'',questions:[]});})}>+ Section</button>
      <button className="secondary" onClick={()=>modify(d=>{const s=d.sections.at(-1);if(s)s.questions.push({id:uid(),sourceStart:0,sourceEnd:0,stem:'',choices:[],correct:[],answer:'',type:'shortAnswer',marks:1,responseLines:2,warnings:['Provide a prompt and answer']});})}>+ Question</button>
     </div>
     {draft.warnings.length>0&&<details className="import-warnings"><summary>Parser notes ({draft.warnings.length})</summary><ul>{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
     {draft.sections.map((s,si)=><div className="import-section" key={s.id}>
      <div className="import-section-head"><strong>Section {si+1}</strong><label>Name<input aria-label={'Section '+(si+1)+' name'} value={s.title} onChange={e=>updateSection(s.id,'title',e.target.value)}/></label>
       <label>Proficiency<input aria-label={'Section '+(si+1)+' proficiency'} value={s.proficiency} onChange={e=>updateSection(s.id,'proficiency',e.target.value)}/></label>
       <button className="danger" disabled={draft.sections.length===1} onClick={()=>{const at=draft.sections.findIndex(x=>x.id===s.id);const dest=draft.sections[at===0?1:at-1];if(!window.confirm('Remove '+s.title+'? Its '+s.questions.length+' question(s) will move to '+dest.title+'.'))return;modify(d=>{const index=d.sections.findIndex(x=>x.id===s.id);const target=d.sections[index===0?1:index-1];target.questions.push(...d.sections[index].questions);d.sections.splice(index,1);});}}>Remove section (move questions)</button>
      </div>
      <label>Section instructions<textarea rows={2} aria-label={'Section '+(si+1)+' instructions'} value={s.instructions} onChange={e=>updateSection(s.id,'instructions',e.target.value)}/></label>
      {s.questions.map((q,qi)=>{
       const flags=reviewWarnings({title:'',format:'plain',source:'',lines:[],sections:[{...s,questions:[q]}],warnings:[]});
       if(filter==='warnings'&&!flags.length)return null;
       return <div className="import-question" key={q.id}><button className="import-question-toggle" onClick={()=>setExpanded(expanded===q.id?null:q.id)}>
        <strong>Question {qi+1}</strong><span>{text(q.stem).slice(0,85)||'(empty prompt)'}</span>{flags.length?<span className="import-flag">Needs review</span>:<span className="import-ok">Ready</span>}
       </button>{expanded===q.id&&<div className="import-question-body">
        <div className="import-question-actions"><span className="help">Source lines {q.sourceStart}–{q.sourceEnd}</span>
         <button className="secondary" title="Split off final paragraph as next question" onClick={()=>splitQuestion(q.id)}>Split last paragraph</button>
         <button className="secondary" disabled={qi===0} onClick={()=>mergeWithPrevious(q.id)}>Merge into previous</button>
         <button className="danger" onClick={()=>modify(d=>{const sec=d.sections.find(x=>x.id===s.id);if(sec)sec.questions=sec.questions.filter(x=>x.id!==q.id);})}>Remove question</button>
        </div>
        <label>Question prompt (HTML or plain text)<textarea aria-label={'Question '+(qi+1)+' prompt in section '+(si+1)} rows={3} value={q.stem} onChange={e=>updateQuestion(q.id,q=>{q.stem=e.target.value;})}/></label>
        <div className="import-rendered" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(asHtml(q.stem))}}/>
        <div className="columns"><label>Question type<select aria-label={'Question '+(qi+1)+' type in section '+(si+1)} value={q.type} onChange={e=>updateQuestion(q.id,q=>{q.type=e.target.value as QuestionType;})}>
         <option value="singleChoice">Multiple choice</option><option value="multipleSelect">Select all that apply</option><option value="shortAnswer">Short answer</option><option value="writtenResponse">Written response</option>
        </select></label><label>Marks<input aria-label={'Question '+(qi+1)+' marks in section '+(si+1)} type="number" min="0" value={q.marks} onChange={e=>updateQuestion(q.id,q=>{q.marks=Number(e.target.value);})}/></label></div>
        {q.type==='singleChoice'||q.type==='multipleSelect'?<div className="import-choices"><strong>Answer choices</strong>
         {q.choices.map((choice,i)=><div className="import-choice" key={i}>
          <label title="Correct answer"><input aria-label={'Correct '+String.fromCharCode(65+i)} type={q.type==='singleChoice'?'radio':'checkbox'} name={'correct-'+q.id} checked={q.correct.includes(i)} onChange={e=>updateQuestion(q.id,q=>{q.correct=q.type==='singleChoice'?[i]:e.target.checked?[...q.correct,i]:q.correct.filter(j=>j!==i);})}/></label>
          <span>{String.fromCharCode(65+i)}.</span>
          <input aria-label={'Choice '+String.fromCharCode(65+i)} value={choice} onChange={e=>updateQuestion(q.id,q=>{q.choices[i]=e.target.value;})}/>
          <button className="danger" aria-label={'Remove choice '+String.fromCharCode(65+i)} onClick={()=>updateQuestion(q.id,q=>{q.choices.splice(i,1);q.correct=q.correct.filter(x=>x!==i).map(x=>x>i?x-1:x);})}>×</button>
         </div>)}
         <button className="secondary" onClick={()=>updateQuestion(q.id,q=>{q.choices.push('');})}>+ Choice</button>
        </div>:<><label>Reference answer<textarea aria-label={'Question '+(qi+1)+' reference answer in section '+(si+1)} rows={3} value={q.answer} onChange={e=>updateQuestion(q.id,q=>{q.answer=e.target.value;})}/></label>
        <label>Response lines<input aria-label={'Question '+(qi+1)+' response lines in section '+(si+1)} type="number" min="1" max="30" value={q.responseLines} onChange={e=>updateQuestion(q.id,q=>{q.responseLines=Number(e.target.value);})}/></label></>}
        <label>Move to section<select aria-label={'Move question '+(qi+1)+' to section'} value={s.id} onChange={e=>moveQuestion(q.id,e.target.value)}>{draft.sections.map(section=><option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
        {flags.length>0&&<ul className="import-question-warnings">{flags.map((w,i)=><li key={i}>{w}</li>)}</ul>}
        {!!q.reviewFlags?.length&&<button className="secondary" onClick={()=>updateQuestion(q.id,item=>{item.reviewFlags=[];})}>I have verified and resolved the source-mapping warnings</button>}
       </div>}</div>;
      })}
     </div>)}
     <div className="import-accept">
      <label>Import mode <select aria-label="Import mode" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="replace">Replace open assessment</option><option value="append">Append sections to open assessment</option></select></label>
      <p className="help">{warnings.length} unresolved warning(s). Incomplete answers will remain incomplete and block version generation until corrected.</p>
      <button className="primary" disabled={count===0} onClick={accept}>Accept reviewed import</button>
     </div>
    </>}
   </section>
  </div>
 </div>;
}
