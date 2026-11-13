import {useMemo,useState} from 'react';
import {annotationRequest,reviewAnnotation,type AnnotationReview,type AnnotationSource} from './annotationImport';
import {download} from './storage';
import {LocalAnnotationControl} from './LocalAnnotationControl';

interface Props {
 source:AnnotationSource;
 active:boolean;
 onLocalRunning:(running:boolean)=>void;
 filename:string;
 review:AnnotationReview|null;
 issues:string[];
 confirmed:boolean;
 onConfirm:(confirmed:boolean)=>void;
 onReview:(review:AnnotationReview)=>void;
 onReset:()=>void;
}

export function AnnotationExchange({source,active,filename,review,issues,confirmed,onConfirm,onReview,onReset,onLocalRunning}:Props){
 const [raw,setRaw]=useState('');
 const [feedback,setFeedback]=useState('');
 const [open,setOpen]=useState(false);
 const [localRunning,setLocalRunning]=useState(false);
 const request=useMemo(()=>open?annotationRequest(source):'',[open,source]);
 const base=filename.replace(/\.docx$/i,'');
 function apply(value:string,local=false){
  onConfirm(false);
  try{onReview(reviewAnnotation(source,value,base));setFeedback(local?'Local annotation is ready for teacher review.':'');}
  catch(error){setFeedback((error instanceof Error?error.message:String(error))+(local?' Use Detect or paste external annotation JSON.':''));}
 }
 return <details className="annotation-exchange" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>AI-assisted DOCX annotation</summary>
  <p className="help">Copy or save this request, then share it with an external model if you choose. It contains assessment text and descriptions of rich content. Talus sends nothing. To resume after refresh, reopen the exact DOCX and reapply the saved annotation JSON.</p>
  {source.issues.length>0&&<div className="validation" role="alert"><strong>Source integrity issues</strong><ul>{source.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
  <LocalAnnotationControl source={source} active={active&&open} onRunningChange={running=>{setLocalRunning(running);onLocalRunning(running);}} onResult={value=>{
   setRaw(value);apply(value,true);
  }}/>
  {open&&<label>Annotation request<textarea aria-label="Annotation request" readOnly rows={5} value={request}/></label>}
  <div className="import-review-tools">
   <button className="secondary" onClick={async()=>{
    try{await navigator.clipboard.writeText(request);setFeedback('Annotation request copied.');}
    catch{setFeedback('Copy the request from its text field, or download it.');}
   }}>Copy annotation request</button>
   <button className="secondary" onClick={()=>download(request,base+'-annotation-request.txt')}>Download request</button>
  </div>
  <label>Annotation JSON<textarea aria-label="Annotation JSON" rows={5} value={raw} disabled={localRunning} onChange={event=>{
   setRaw(event.target.value);onConfirm(false);
  }}/></label>
  <label>Upload annotation JSON<input type="file" disabled={localRunning} accept=".json,application/json" aria-label="Upload annotation JSON" onChange={async event=>{
   const input=event.currentTarget,file=input.files?.[0];input.value='';if(!file)return;
   onConfirm(false);
   if(file.size>1_000_000){setFeedback('Annotation exceeds the 1 MB size limit.');return;}
   try{setRaw(await file.text());setFeedback('JSON loaded. Select Review annotation to validate it.');}
   catch{setFeedback('Could not read the annotation file.');}
  }}/></label>
  <div className="import-review-tools">
   <button className="secondary" disabled={!raw.trim()||localRunning} onClick={()=>apply(raw)}>Review annotation</button>
   <button className="secondary" disabled={!raw.trim()} onClick={()=>download(raw,base+'-annotation.json','application/json')}>Save annotation JSON</button>
   {review&&<button className="secondary" disabled={localRunning} onClick={()=>{onReset();setFeedback('');}}>Return to deterministic detection</button>}
  </div>
  {feedback&&<p role="status">{feedback}</p>}
  {review&&<>
   {issues.length>0&&<div className="validation" role="alert"><strong>Resolve these issues before accepting</strong><ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
   {review.ignored.length>0&&<><h4>Proposed exclusions</h4><ul>{review.ignored.map((item,i)=><li key={i}>{item.text} ({item.reason})</li>)}</ul></>}
   {review.defaults.length>0&&<details><summary>Marks that use the Talus default</summary><ul>{review.defaults.map((item,i)=><li key={i}>{item}</li>)}</ul></details>}
   {review.unassignedKeyText&&<p>Unassigned source key material: {review.unassignedKeyText}</p>}
   <details open><summary>Original proposed answer associations</summary>
    <p className="help">These are the original proposal. Review any edits in the proposed structure pane before accepting.</p>
    {review.keys.map((key,i)=><div className="import-flag" key={i}>
     <p><strong>{key.section} · {key.sourceNumber===undefined?'Question '+(i+1):'Source Q'+key.sourceNumber}</strong> {key.stem}</p>
     {!!key.choices.length&&<ul>{key.choices.map(choice=><li key={choice}>{choice}</li>)}</ul>}
     <p>Source key: {key.sourceKey||'None mapped'} · Proposed answer: {key.resolved}</p>
    </div>)}
   </details>
   <label className="check"><input type="checkbox" disabled={issues.length>0} checked={confirmed}
    onChange={event=>onConfirm(event.target.checked)}/> I reviewed the proposed structure, source answers, defaults and exclusions</label>
  </>}
 </details>;
}
