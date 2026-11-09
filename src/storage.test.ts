import { afterEach,describe,expect,it,vi } from 'vitest';
import { createMaster } from './model';
import { loadDraftSync,saveDraftSync,selectActiveMaster,loadLatest,db } from './storage';

afterEach(()=>vi.unstubAllGlobals());

describe('immediate autosave regression',()=>{
 it('imports an older document over a newer draft and keeps the imported selection across refresh',async()=>{
  const data=new Map<string,string>();
  vi.stubGlobal('localStorage',{
   setItem:(key:string,value:string)=>{data.set(key,value);},
   getItem:(key:string)=>data.get(key)??null
  });
  const newer=createMaster();newer.title='Newer local draft';newer.updatedAt='2026-11-10T00:00:00.000Z';
  const imported=createMaster();imported.title='Imported earlier backup';imported.updatedAt='2026-11-01T00:00:00.000Z';
  imported.generationSettings={count:6,seed:'qa-original'};
  saveDraftSync(newer);
  // Simulate accepting the import without editing the imported document.
  saveDraftSync(imported);
  expect(selectActiveMaster(loadDraftSync(),newer)?.title).toBe(imported.title);
  expect(selectActiveMaster(loadDraftSync(),newer)?.generationSettings).toEqual({count:6,seed:'qa-original'});
  const getOriginal=db.masters.orderBy;
  db.masters.orderBy=(()=>({last:async()=>newer})) as typeof db.masters.orderBy;
  try{
    const refreshed=await loadLatest();
    expect(refreshed?.id).toBe(imported.id);
    expect(refreshed?.generationSettings?.seed).toBe('qa-original');
  }finally{db.masters.orderBy=getOriginal;}
 });

 it('makes the newest edit synchronously available before a simulated refresh',()=>{
  const data=new Map<string,string>();
  vi.stubGlobal('localStorage',{
    setItem:(key:string,value:string)=>{data.set(key,value);},
    getItem:(key:string)=>data.get(key)??null
  });
  const master=createMaster();master.title='First';
  expect(saveDraftSync(master)).toBe(true);
  master.title='QA immediate-refresh sentinel';
  expect(saveDraftSync(master)).toBe(true);
  expect(loadDraftSync()?.title).toBe('QA immediate-refresh sentinel');
 });
 it('reports unsafe persistence when the browser rejects synchronous storage',()=>{
  vi.stubGlobal('localStorage',{setItem:()=>{throw Error('QuotaExceededError');},getItem:()=>null});
  expect(saveDraftSync(createMaster())).toBe(false);
  expect(loadDraftSync()).toBeUndefined();
 });
});
