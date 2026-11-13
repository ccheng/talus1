import {CreateMLCEngine,prebuiltAppConfig,type MLCEngine} from '@mlc-ai/web-llm';
import {Tokenizer} from '@mlc-ai/web-tokenizers';
import type {LocalInference} from './localAnnotation';

export const modelId='Qwen2.5-3B-Instruct-q4f16_1-MLC';
export const revision='7690aaaa46df36b1be0fe93b9c9abac0497eff6c';
const preset=prebuiltAppConfig.model_list.find(model=>model.model_id===modelId);
if(!preset)throw Error('Pinned WebLLM runtime does not contain the selected model.');
const modelUrl=preset.model+'/resolve/'+revision+'/';
export const modelLib=preset.model_lib.replace('/binary-mlc-llm-libs/main/','/binary-mlc-llm-libs/146ed9cd4b4062e967b017fd2291f7106b50599f/');
const appConfig={...prebuiltAppConfig,model_list:[{...preset,model:modelUrl,model_lib:modelLib,overrides:{...preset.overrides,context_window_size:4096}}]};
export async function checkAdapter(){
 type Adapter={
  features:{has:(feature:string)=>boolean};
  limits:{maxStorageBufferBindingSize:number;maxBufferSize:number};
  info?:{vendor:string;architecture:string;device:string;description:string;isFallbackAdapter?:boolean};
  isFallbackAdapter?:boolean;
 };
 const gpu: {requestAdapter:(options:{powerPreference:'high-performance'})=>Promise<Adapter|null>} | undefined=globalThis.navigator.gpu;
 if(!gpu)throw Error('This browser does not expose WebGPU. Use a supported desktop Chrome installation.');
 const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter||adapter.isFallbackAdapter||adapter.info?.isFallbackAdapter)throw Error('No hardware WebGPU adapter is available.');
 const features=new Set(preset?.required_features??[]);
 features.add('shader-f16');
 for(const feature of features)if(!adapter.features.has(feature))throw Error('The hardware WebGPU adapter lacks '+feature+'.');
 return {info:adapter.info&&{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description},
  maxBufferSize:adapter.limits.maxBufferSize,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize};
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
export async function openLocalRuntime(onProgress:(text:string)=>void){
 onProgress('Checking the hardware WebGPU adapter…');
 const adapter=await checkAdapter();
 const tokenizer=await Tokenizer.fromJSON(await tokenizerBytes());
 try{
  const engine=await CreateMLCEngine(modelId,{appConfig,initProgressCallback:report=>onProgress(report.text)});
  return {adapter,tokenizer,engine};
 }catch(error){tokenizer.dispose();throw error;}
}

export function localInference(activeEngine:MLCEngine,activeTokenizer:Tokenizer):LocalInference {
 return {
   count:text=>activeTokenizer.encode(text).length,
   complete:async(prompt,outputLimit)=>{
    await activeEngine.resetChat();
    const response=await activeEngine.chat.completions.create({
     messages:[{role:'user',content:prompt}],temperature:0,max_tokens:outputLimit,response_format:{type:'json_object'}
    });
    return {text:response.choices[0]?.message.content??'',finish:response.choices[0]?.finish_reason??undefined,
     promptTokens:response.usage?.prompt_tokens,completionTokens:response.usage?.completion_tokens};
   }
 };
}
