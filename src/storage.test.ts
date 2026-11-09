import { afterEach,describe,expect,it,vi } from 'vitest';
import { createMaster } from './model';
import { loadDraftSync,saveDraftSync } from './storage';

afterEach(()=>vi.unstubAllGlobals());

describe('immediate autosave regression',()=>{
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
