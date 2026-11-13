import {describe,expect,it} from 'vitest';
import {compareImportDrafts,reconcilableSourceKeys} from './importComparison';
import type {ImportDraft,ImportQuestion} from './importParser';

const question=(id:string,sourceStart=1):ImportQuestion=>({
 id,sourceStart,sourceEnd:sourceStart,sourceNumber:7,stem:'<p>Which gas?</p>',
 choices:['<p>Oxygen</p>','<p>Nitrogen</p>'],correct:[1],answer:'',type:'singleChoice',marks:2,responseLines:2,warnings:[]
});
const draft=(questions:ImportQuestion[],title='Base'):ImportDraft=>({
 title:'Test',source:'',lines:[],sections:[{id:'section',title,proficiency:title,instructions:'',questions}],format:'docx',warnings:[]
});
const text=(html:string)=>html.replace(/<[^>]+>/g,'').trim();
const rich=(html:string)=>html.includes('<img')?[{label:'Image diagram',identity:'image:diagram'}]:[];

describe('2D.3 import comparison',()=>{
 it('keeps equivalent paragraph markup and equal answers quiet',()=>{
  const ai=question('ai');ai.stem='<strong>Which gas?</strong>';ai.choices=['Oxygen','Nitrogen'];ai.sourceEnd=5;
  expect(compareImportDrafts(draft([question('detect')]),draft([ai]),text,rich)).toEqual([]);
 });
 it('flags a wrong source-backed answer and shows the actual source of each interpretation',()=>{
  const detect={...question('detect'),sourceKeyLines:[20]};
  const ai={...question('ai'),correct:[0],sourceKeyLines:[25]};
  const findings=compareImportDrafts(draft([detect]),draft([ai]),text,rich);
  expect(findings).toMatchObject([{questionId:'ai',changes:[{kind:'Key mapping',detect:'Nitrogen',ai:'Oxygen',
   detectLines:[20],aiLines:[25]}]}]);
  expect(compareImportDrafts(draft([detect]),draft([{...ai,correct:[1]}]),text,rich)).toEqual([]);
 });
 it('matches repeated numbers by source position and reports omissions without equating unrelated questions',()=>{
  const one=question('d1',1),two=question('d2',15);
  const findings=compareImportDrafts(draft([one,two]),draft([{...two,id:'a2'}]),text,rich);
  expect(findings).toMatchObject([{changes:[{kind:'Question boundary'}]}]);
 });
 it('flags a moved image separately from text, and never compares choice indices across changed order',()=>{
  const detect={...question('detect'),stem:'<p>Which gas?</p><img src="data:diagram">',marks:3};
  const ai={...question('ai'),choices:['Nitrogen','Oxygen<img src="data:diagram">'],correct:[0]};
  const findings=compareImportDrafts(draft([detect]),draft([ai],'Exemplary'),text,rich);
  expect(findings[0].changes.map(change=>change.kind)).toEqual(['Section','Choices','Marks','Rich placement']);
 });
});

describe('2D.3 key reconciliation',()=>{
 it('requires the specific corrected question and exact whole detached source reference',()=>{
  const detect={...question('detect'),sourceKeyLines:[20]};
  const ai={...question('ai'),correct:[0],sourceKeyLines:[4]};
  const current={...ai,correct:[1]};
  const evidence=[{block:20,start:0,end:4,blockLength:4,text:'7. B'}];
  const normalized=(html:string)=>html.replace(/<[^>]+>/g,'').trim();
  const detectLines=[{number:20,text:'7. B',html:'<p>7. B</p>'}];
  const original={...draft([detect]),lines:detectLines};
  expect(reconcilableSourceKeys(original,draft([ai]),draft([ai]),evidence,normalized,rich)).toEqual([]);
  expect(reconcilableSourceKeys(original,draft([ai]),draft([current]),evidence,normalized,rich))
   .toEqual([{questionId:'ai',blocks:[20],answer:'Nitrogen'}]);
  expect(reconcilableSourceKeys(original,draft([ai]),draft([{...current,id:'other'}]),evidence,normalized,rich)).toEqual([]);
  expect(reconcilableSourceKeys(original,draft([ai]),draft([current]),[{...evidence[0],end:2}],normalized,rich)).toEqual([]);
  expect(reconcilableSourceKeys(original,draft([ai]),draft([current]),[{...evidence[0],text:'8. C'}],normalized,rich)).toEqual([]);
 });
});
