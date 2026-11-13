import {describe,expect,it} from 'vitest';
import {decodeAnnotation,detachedKeyAmbiguity,reviewAnnotation,verifyCoverage,type AnnotationBlock} from './annotationImport';

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
 it('requires a unique source question inside the declared detached-key section',()=>{
  expect(detachedKeyAmbiguity('7',true,1,2)).toBeUndefined();
  expect(detachedKeyAmbiguity('7',true,2,2)).toMatch(/within the key section/);
  expect(detachedKeyAmbiguity('7',false,1,2)).toMatch(/no matching key section/);
  expect(detachedKeyAmbiguity('7',false,1,1)).toBeUndefined();
 });
 it('cannot split Unicode characters or protected objects',()=>{
  const blocks:AnnotationBlock[]=[{id:'B1',text:'😀[Math]',html:'',atoms:[{start:2,end:8}]}];
  expect(()=>verifyCoverage(blocks,[{block:'B1',start:0,end:1}])).toThrow(/character/i);
  expect(()=>verifyCoverage(blocks,[{block:'B1',start:0,end:4}])).toThrow(/protected/i);
 });
});

describe('2D.1 live acceptance regressions',()=>{
 const assessment=(source:string[],question:Record<string,unknown>,after:Record<string,unknown>[]=[])=>
  reviewAnnotation({fingerprint,issues:[],blocks:source.map((text,i)=>({
   id:'B'+(i+1),text,html:text==='[Image: Support]'?'<p><img alt="Support"></p>':'<p>'+text+'</p>',
   atoms:text==='[Image: Support]'?[{start:0,end:text.length}]:[]
  }))},JSON.stringify({format:'talus-annotation',version:1,fingerprint,
   sections:[{questions:[question,...after]}]}),'Review fixture');
 const ref=(block:number)=>({block:'B'+block});

 it('accounts for the full square-bracket marks span and uses the numeric marks',()=>{
  const question={type:'writtenResponse',stem:[ref(1)],marks:ref(2),key:{content:[ref(3)]}};
  const review=assessment(['Explain the result.','[2 marks]','Sample response'],question);
  expect(review.issues).toEqual([]);
  expect(review.defaults).toEqual([]);
  expect(review.draft.sections[0].questions[0].marks).toBe(2);
  const inner={...question,marks:{block:'B2',start:1,end:8}};
  expect(assessment(['Explain the result.','[2 marks]','Sample response'],inner).issues).toEqual([
   expect.stringContaining('Unassigned source content: B2')
  ]);
  expect(()=>assessment(['Explain the result.','[2 marks)','Sample response'],question)).toThrow(/invalid source marks/);
 });

 it('accepts trailing protected question support while rejecting unrelated trailing text and later-question material',()=>{
  const source=['Which response fits the image?','A.','First','B.','Second','[Image: Support]','Answer:','A'];
  const question={type:'singleChoice',stem:[ref(1),ref(6)],
   choices:[{label:ref(2),content:[ref(3)]},{label:ref(4),content:[ref(5)]}],
   key:{label:ref(7),content:[ref(8)]}};
  const review=assessment(source,question);
  expect(review.issues).toEqual([]);
  const imported=review.draft.sections[0].questions[0];
  expect(imported.stem).toContain('<img alt="Support">');
  expect(imported.correct).toEqual([0]);
  const textInstead=[...source];textInstead[5]='Unrelated prose';
  expect(()=>assessment(textInstead,question)).toThrow(/protected support/i);
  const next={type:'shortAnswer',stem:[ref(6)]};
  expect(()=>assessment([...source,'[Image: Support]'],{...question,stem:[ref(1),ref(9)]},[next])).toThrow(/question boundaries/i);
 });
});
