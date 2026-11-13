import {CreateMLCEngine,prebuiltAppConfig,type MLCEngine} from '@mlc-ai/web-llm';
import {Tokenizer} from '@mlc-ai/web-tokenizers';
import DOMPurify from 'dompurify';
import * as mammoth from 'mammoth';
import {makeAnnotationSource,MAX_ANNOTATION_DOCX_BYTES} from '../src/annotationImport';
import {parseHtml,wordConversionWarnings} from '../src/importParser';
import {runLocalAnnotation} from '../src/localAnnotation';
import {applyWordImageDimensions,inspectImportedMedia} from '../src/media';
import {prepareWordMath,restoreWordMath} from '../src/wordMath';

const modelId='Qwen2.5-3B-Instruct-q4f16_1-MLC';
const revision='7690aaaa46df36b1be0fe93b9c9abac0497eff6c';
const preset=prebuiltAppConfig.model_list.find(model=>model.model_id===modelId);
if(!preset)throw Error('Pinned WebLLM runtime does not contain the selected model.');
const modelUrl=preset.model+'/resolve/'+revision+'/';
const modelLib=preset.model_lib.replace('/binary-mlc-llm-libs/main/','/binary-mlc-llm-libs/146ed9cd4b4062e967b017fd2291f7106b50599f/');
const appConfig={...prebuiltAppConfig,model_list:[{...preset,model:modelUrl,model_lib:modelLib,overrides:{...preset.overrides,context_window_size:4096}}]};
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

async function checkAdapter(){
 type Adapter={
  features:{has:(feature:string)=>boolean};
  limits:{maxStorageBufferBindingSize:number;maxBufferSize:number};
  info?:{vendor:string;architecture:string;device:string;description:string;isFallbackAdapter?:boolean};
  isFallbackAdapter?:boolean;
 };
 const gpu: {requestAdapter:(options:{powerPreference:'high-performance'})=>Promise<Adapter|null>} | undefined=navigator.gpu;
 if(!gpu)throw Error('This browser does not expose WebGPU. Use a supported desktop Chrome installation.');
 const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter||adapter.isFallbackAdapter||adapter.info?.isFallbackAdapter)throw Error('No hardware WebGPU adapter is available.');
 const features=new Set(preset?.required_features??[]);
 features.add('shader-f16');
 for(const feature of features)if(!adapter.features.has(feature))throw Error('The hardware WebGPU adapter lacks '+feature+'.');
 return {info:adapter.info&&{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description},
  maxBufferSize:adapter.limits.maxBufferSize,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize};
}

function saveJson(value:unknown,name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const link=document.createElement('a');
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function tokenizerBytes(){
 const cache=await caches.open('talus-2d2-tokenizer');
 const url=modelUrl+'tokenizer.json';
 const cached=await cache.match(url);
 if(cached)return cached.arrayBuffer();
 const response=await fetch(url);
 if(!response.ok)throw Error('Could not download the pinned model tokenizer.');
 await cache.put(url,response.clone());
 return response.arrayBuffer();
}
load.onclick=async()=>{
 if(engine)return;
 load.disabled=true;
 const started=performance.now();
 try{
  status.textContent='Checking the hardware WebGPU adapter…';
  adapterDetails=await checkAdapter();
  tokenizer=await Tokenizer.fromJSON(await tokenizerBytes());
  engine=await CreateMLCEngine(modelId,{appConfig,initProgressCallback:report=>{status.textContent=report.text;}});
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
  result=await runLocalAnnotation(source,title,{
   count:text=>activeTokenizer.encode(text).length,
   complete:async(prompt,outputLimit)=>{
    await activeEngine.resetChat();
    const response=await activeEngine.chat.completions.create({
     messages:[{role:'user',content:prompt}],temperature:0,max_tokens:outputLimit,response_format:{type:'json_object'}
    });
    return {text:response.choices[0]?.message.content??'',finish:response.choices[0]?.finish_reason??undefined,
     promptTokens:response.usage?.prompt_tokens,completionTokens:response.usage?.completion_tokens};
   }
  },message=>{status.textContent=message;},controller.signal,call=>calls.push(call));
  record.inferenceMs=performance.now()-inferenceStarted;record.calls=result.telemetry;record.sourceIssues=result.review.issues;
  status.textContent=result.review.issues.length?'Source coverage requires repair. Use external annotation or Detect.':'Proposal ready for teacher review in the 2D.1 import workspace.';
  output.textContent=JSON.stringify({issues:result.review.issues,keys:result.review.keys,timings:result.telemetry},null,2);
  save.disabled=result.review.issues.length>0;
 }catch(error){record.error=String(error);status.textContent=String(error);}
 finally{
  record.totalMs=performance.now()-started;
  run.disabled=false;stop.disabled=true;evidence.disabled=false;
  controller=undefined;
 }
};
save.onclick=()=>{if(result)saveJson(result.annotation,'talus-local-annotation.json');};
evidence.onclick=()=>{if(record)saveJson(record,'talus-local-annotation-timing.json');};
