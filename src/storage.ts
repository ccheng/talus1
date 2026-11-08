import Dexie, { type Table } from 'dexie';
import type { MasterTest } from './model';
class TalusDB extends Dexie {
  masters!:Table<MasterTest,string>;
  constructor(){super('talus-v1');this.version(1).stores({masters:'id,updatedAt'});}
}
export const db=new TalusDB();
export async function saveMaster(master:MasterTest){await db.masters.put(master);}
export async function loadLatest():Promise<MasterTest|undefined>{return db.masters.orderBy('updatedAt').last();}
export function exportBackup(master:MasterTest):void{
  download(JSON.stringify(master,null,2),fileBase(master)+'.talus.json','application/json');
}
export function fileBase(master:MasterTest):string{return (master.title.trim()||'talus-test').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').slice(0,70)||'talus-test';}
export function download(content:string,filename:string,mime='text/plain;charset=utf-8'):void{
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
