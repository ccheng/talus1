import Dexie, { type Table } from 'dexie';
import type { MasterTest } from './model';
class TalusDB extends Dexie {
  masters!:Table<MasterTest,string>;
  constructor(){super('talus-v1');this.version(1).stores({masters:'id,updatedAt'});}
}
export const db=new TalusDB();
export async function saveMaster(master:MasterTest){await db.masters.put(master);}
export function saveDraftSync(master:MasterTest):boolean{
  try{localStorage.setItem('talus-draft-v1',JSON.stringify(master));return true;}
  catch{return false;}
}
export function loadDraftSync():MasterTest|undefined{
  try{const raw=localStorage.getItem('talus-draft-v1');return raw?JSON.parse(raw) as MasterTest:undefined;}
  catch{return undefined;}
}
export async function loadLatest():Promise<MasterTest|undefined>{
 const draft=loadDraftSync();let stored:MasterTest|undefined;
 try{stored=await db.masters.orderBy('updatedAt').last();}catch{if(!draft)throw Error('Local storage unavailable');}
 if(!draft)return stored;
 return !stored||draft.updatedAt>=stored.updatedAt?draft:stored;
}
export function exportBackup(master:MasterTest):void{
  download(JSON.stringify(master,null,2),fileBase(master)+'.talus.json','application/json');
}
export function fileBase(master:MasterTest):string{return (master.title.trim()||'talus-test').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').slice(0,70)||'talus-test';}
export function download(content:string,filename:string,mime='text/plain;charset=utf-8'):void{
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function downloadBytes(bytes:Uint8Array,filename:string,mime='application/zip'):void{
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime}));
 const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
