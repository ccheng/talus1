import {useLayoutEffect,useRef,useState} from 'react';
import type {AnnotationSource} from './annotationImport';
import type {LocalWorkerMessage} from './localAnnotationWorker';

export function LocalAnnotationControl({source,active,onResult,onRunningChange}:{
 source:AnnotationSource;
 active:boolean;
 onResult:(annotation:string)=>void;
 onRunningChange:(running:boolean)=>void;
}){
 const worker=useRef<Worker|null>(null);
 const [running,setRunning]=useState(false);
 const [status,setStatus]=useState('');
 function finish(current:Worker){
  if(worker.current!==current)return false;
  worker.current=null;
  current.terminate();
  setRunning(false);onRunningChange(false);
  return true;
 }
 useLayoutEffect(()=>{
  if(!active&&worker.current){
   worker.current.terminate();worker.current=null;
   setRunning(false);onRunningChange(false);setStatus('');
  }
 },[active,onRunningChange]);
 useLayoutEffect(()=>()=>{worker.current?.terminate();worker.current=null;},[source]);
 function start(){
  if(worker.current||!active||source.issues.length)return;
  let current:Worker;
  try{current=new Worker(new URL('./localAnnotationWorker.ts',import.meta.url),{type:'module'});}
  catch{setStatus('Could not start local annotation. Use Detect or paste external annotation JSON.');return;}
  worker.current=current;setRunning(true);onRunningChange(true);
  setStatus('Starting local annotation…');
  current.onmessage=(event:MessageEvent<LocalWorkerMessage>)=>{
   if(worker.current!==current)return;
   const message=event.data;
   if(message.type==='progress'){setStatus(message.text);return;}
   finish(current);
   if(message.type==='error')setStatus(message.text+' Use Detect or paste external annotation JSON.');
   else if(message.type==='result'){setStatus('');onResult(message.annotation);}
  };
  current.onerror=()=>{
   if(finish(current))setStatus('Local annotation stopped unexpectedly. Use Detect or paste external annotation JSON.');
  };
  const blocks=source.blocks.map(({id,text,atoms})=>({id,text,atoms,html:''}));
  try{current.postMessage({source:{fingerprint:source.fingerprint,blocks,issues:[]}});}
  catch{if(finish(current))setStatus('Could not start local annotation. Use Detect or paste external annotation JSON.');}
 }
 return <section>
  <h4>On-device AI annotation</h4>
  <p className="help">The first run downloads and caches about 2 GB of model files. A compatible desktop Chrome WebGPU adapter is required. Your assessment stays in this browser.</p>
  <button className="secondary" disabled={running||!active||source.issues.length>0} onClick={start}>Run local AI annotation</button>
  {running&&<button className="secondary" onClick={()=>{if(worker.current&&finish(worker.current))setStatus('Local annotation cancelled.');}}>Cancel local annotation</button>}
  {status&&<p role="status">{status}</p>}
 </section>;
}
