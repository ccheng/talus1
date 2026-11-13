import type {AnnotationSource} from './annotationImport';
import {runLocalAnnotation} from './localAnnotation';
import {localInference,openLocalRuntime} from './localModelRuntime';

export type LocalWorkerMessage =
 | {type:'progress';text:string}
 | {type:'error';text:string}
 | {type:'result';annotation:string};

const worker=globalThis as unknown as {
 onmessage:((event:MessageEvent<{source:AnnotationSource}>)=>void)|null;
 postMessage:(message:LocalWorkerMessage)=>void;
};
worker.onmessage=async event=>{
 const progress=(text:string)=>worker.postMessage({type:'progress',text});
 let runtime:Awaited<ReturnType<typeof openLocalRuntime>>|undefined;
 try{
  runtime=await openLocalRuntime(progress);
  const result=await runLocalAnnotation(event.data.source,localInference(runtime.engine,runtime.tokenizer),progress);
  worker.postMessage({type:'result',annotation:JSON.stringify(result.annotation)});
 }catch(error){worker.postMessage({type:'error',text:error instanceof Error?error.message:String(error)});}
 finally{
  runtime?.tokenizer.dispose();
  await runtime?.engine.unload();
 }
};
