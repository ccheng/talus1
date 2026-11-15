import Dexie, { type Table } from 'dexie';
import {masterSchema,type MasterTest} from './model';
class TalusDB extends Dexie {
  masters!:Table<MasterTest,string>;
  active!:Table<{key:'current';id:string},string>;
  constructor(){
    super('talus-v1');
    this.version(1).stores({masters:'id,updatedAt'});
    this.version(2).stores({masters:'id,updatedAt',active:'key'});
  }
}
export const db=new TalusDB();
export async function saveMaster(master:MasterTest){
  await db.transaction('rw',db.masters,db.active,async()=>{
    await db.masters.put(master);
    await db.active.put({key:'current',id:master.id});
  });
}
export function saveDraftSync(master:MasterTest):boolean{
  try{localStorage.setItem('talus-draft-v1',JSON.stringify(master));return true;}
  catch{
    // A failed large-media write must not leave an older synchronous draft
    // masking the new IndexedDB record on the next page load.
    try{localStorage.removeItem('talus-draft-v1');}catch{/* storage unavailable */}
    return false;
  }
}
export function loadDraftSync():MasterTest|undefined{
  try{
    const raw=localStorage.getItem('talus-draft-v1');
    const draft:unknown=raw?JSON.parse(raw):undefined;
    return masterSchema.safeParse(draft).success?draft as MasterTest:undefined;
  }
  catch{return undefined;}
}
// The synchronous draft represents the user's explicitly selected open assessment.
// updatedAt belongs to the authored document, not the import/selection event:
// an intentionally imported older backup must win over a newer IndexedDB record.
export function selectActiveMaster(draft:MasterTest|undefined, stored:MasterTest|undefined):MasterTest|undefined {
 return draft??stored;
}
export async function loadLatest():Promise<MasterTest|undefined>{
 const draft=loadDraftSync();
 if(draft)return draft;
 const selection=await db.active.get('current');
 const selected=selection?await db.masters.get(selection.id):undefined;
 if(selected&&masterSchema.safeParse(selected).success)return selected;
 // Recovery for browsers migrating a version-one database without a pointer.
 const latest=await db.masters.orderBy('updatedAt').last();
 return latest&&masterSchema.safeParse(latest).success?latest:undefined;
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
