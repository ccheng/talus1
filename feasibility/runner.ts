import type {MLCEngine} from '@mlc-ai/web-llm';
import type {Tokenizer} from '@mlc-ai/web-tokenizers';
import {localInference,modelId,modelLib,openLocalRuntime,revision} from '../src/localModelRuntime';
import DOMPurify from 'dompurify';
import * as mammoth from 'mammoth';
import {makeAnnotationSource,reviewAnnotation,MAX_ANNOTATION_DOCX_BYTES} from '../src/annotationImport';
import {parseHtml,wordConversionWarnings} from '../src/importParser';
import {runLocalAnnotation} from '../src/localAnnotation';
import {applyWordImageDimensions,inspectImportedMedia} from '../src/media';
import {prepareWordMath,restoreWordMath} from '../src/wordMath';

const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const file=get<HTMLInputElement>('file');
const load=get<HTMLButtonElement>('load');
const run=get<HTMLButtonElement>('run');
const stop=get<HTMLButtonElement>('stop');
const save=get<HTMLButtonElement>('save');
const evidence=get<HTMLButtonElement>('evidence');
const status=get<HTMLParagraphElement>('status');
const output=get<HTMLPreElement>('result');
let engine:MLCEngine|undefined,tokenizer:Tokenizer|undefined,controller:AbortController|undefined;
let loadMs=0,record:Record<string,unknown>|undefined,result:Awaited<ReturnType<typeof runLocalAnnotation>>|undefined;
let adapterDetails:Record<string,unknown>|undefined;

function saveJson(value:unknown,name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const link=document.createElement('a');
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
load.onclick=async()=>{
 if(engine)return;
 load.disabled=true;
 const started=performance.now();
 try{
  const loaded=await openLocalRuntime(message=>{status.textContent=message;});
  adapterDetails=loaded.adapter;tokenizer=loaded.tokenizer;engine=loaded.engine;
  loadMs=performance.now()-started;
  status.textContent='Model ready in '+Math.round(loadMs/1000)+' s.';
  run.disabled=false;
 }catch(error){
  tokenizer?.dispose();tokenizer=undefined;load.disabled=false;
  status.textContent=String(error);
 }
};
stop.onclick=()=>{
 controller?.abort();
 void engine?.interruptGenerate();
 status.textContent='Cancelling…';
};
run.onclick=async()=>{
 const selected=file.files?.[0];
 if(!selected||!engine||!tokenizer){status.textContent='Select a DOCX and load the model.';return;}
 const activeEngine=engine,activeTokenizer=tokenizer;
 controller=new AbortController();
 run.disabled=true;stop.disabled=false;save.disabled=true;evidence.disabled=true;output.textContent='';
 result=undefined;
 const started=performance.now();
 record={modelId,revision,modelLib,userAgent:navigator.userAgent,fixture:selected.name,loadMs,adapter:adapterDetails};
 try{
  if(selected.size>MAX_ANNOTATION_DOCX_BYTES)throw Error('DOCX exceeds the 12 MB annotation limit.');
  const bytes=await selected.arrayBuffer(),math=prepareWordMath(bytes);
  const document=await mammoth.convertToHtml({arrayBuffer:math.arrayBuffer},{convertImage:mammoth.images.imgElement(async image=>({
   src:'data:'+image.contentType+';base64,'+await image.read('base64')
  }))});
  const media=await inspectImportedMedia(restoreWordMath(applyWordImageDimensions(document.value,bytes),math.equations));
  const html=DOMPurify.sanitize(media.html),title=selected.name.replace(/\.docx$/i,'');
  const deterministic=parseHtml(html,title,'docx');
  const warnings=wordConversionWarnings(document.messages,deterministic).filter(w=>/image|drawing|graphic|picture|media|relationship|linked|unsupported|textbox|object/i.test(w));
  const source=await makeAnnotationSource(bytes,html,[...warnings,...media.warnings,...math.warnings]);
  record.fingerprint=source.fingerprint;record.blocks=source.blocks.length;
  const calls:unknown[]=[];record.calls=calls;
  const inferenceStarted=performance.now();
  result=await runLocalAnnotation(source,localInference(activeEngine,activeTokenizer),message=>{status.textContent=message;},controller.signal,call=>calls.push(call));
  const review=reviewAnnotation(source,JSON.stringify(result.annotation),title);
  const issues=[...review.issues,...(review.unassignedSourceKeys.length?['Unassigned source key material requires teacher review.']:[])];
  record.inferenceMs=performance.now()-inferenceStarted;record.calls=result.telemetry;record.sourceIssues=issues;
  status.textContent=issues.length?'Source coverage requires repair. Use external annotation or Detect.':'Proposal ready for teacher review in the 2D.1 import workspace.';
  output.textContent=JSON.stringify({issues,keys:review.keys,timings:result.telemetry},null,2);
  save.disabled=issues.length>0;
 }catch(error){record.error=String(error);status.textContent=String(error);}
 finally{
  record.totalMs=performance.now()-started;
  run.disabled=false;stop.disabled=true;evidence.disabled=false;
  controller=undefined;
 }
};
save.onclick=()=>{if(result)saveJson(result.annotation,'talus-local-annotation.json');};
evidence.onclick=()=>{if(record)saveJson(record,'talus-local-annotation-timing.json');};
