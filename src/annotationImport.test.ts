import {describe,expect,it} from 'vitest';
import {decodeAnnotation,verifyCoverage,type AnnotationBlock} from './annotationImport';

const fingerprint='a'.repeat(64);
const contract={format:'talus-annotation',version:1,fingerprint,sections:[
 {questions:[{type:'singleChoice',stem:[{block:'B1',start:0,end:4}],
   choices:[{label:{block:'B1',start:5,end:7},content:[{block:'B1',start:8,end:12}]},
     {label:{block:'B1',start:13,end:15},content:[{block:'B1',start:16,end:20}]}]}]}
]};
describe('2D.1 annotation validation',()=>{
 it('rejects stale documents and model-provided replacement text',()=>{
  expect(()=>decodeAnnotation(JSON.stringify(contract),'b'.repeat(64))).toThrow(/different DOCX/i);
  expect(()=>decodeAnnotation(JSON.stringify({...contract,html:'<script>alert(1)</script>'}),fingerprint)).toThrow(/schema/i);
 });
 it('distinguishes omissions from illegal whole-block and span collisions',()=>{
  const blocks:AnnotationBlock[]=[{id:'B1',text:'Stem A. blue B. pink',html:'Stem A. blue B. pink',atoms:[]}];
  expect(verifyCoverage(blocks,[{block:'B1',start:0,end:4}])).toEqual(['B1']);
  expect(()=>verifyCoverage(blocks,[{block:'B1'},{block:'B1',start:0,end:4}])).toThrow(/overlap/i);
  expect(verifyCoverage(blocks,[{block:'B1',start:0,end:4},{block:'B1',start:5,end:20}])).toEqual([]);
 });
 it('cannot split Unicode characters or protected objects',()=>{
  const blocks:AnnotationBlock[]=[{id:'B1',text:'😀[Math]',html:'',atoms:[{start:2,end:8}]}];
  expect(()=>verifyCoverage(blocks,[{block:'B1',start:0,end:1}])).toThrow(/character/i);
  expect(()=>verifyCoverage(blocks,[{block:'B1',start:0,end:4}])).toThrow(/protected/i);
 });
});
