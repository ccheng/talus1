import {describe,expect,it} from 'vitest';
import {mergeIntoMaster,parseLines,textLines} from './importParser';
import {createMaster,masterSchema} from './model';
import {generateVersions,generationRunId} from './generate';
import {resolveImportRange,unresolvedImportRanges} from './rangeImport';

const fixture='Section A: Base\n1. Before?\nAnswer: First\nUse the following for Questions 2–3:\nShared stimulus.\n2. Second?\nAnswer: Second\n3. Third?\nAnswer: Third\n4. After?\nAnswer: Fourth';
const draftFor=(text=fixture)=>parseLines(textLines(text),'Range fixture','docx');

describe('4A explicit DOCX range cues',()=>{
 it('requires review, preserves numbered child keys and regenerates a shared cue after seeded shuffling and JSON restore',()=>{
  const draft=draftFor(),range=draft.ranges?.[0];
  expect(range).toMatchObject({first:2,last:3,cueLine:4,sharedLines:[5]});
  expect(unresolvedImportRanges(draft)).toHaveLength(1);
  expect(mergeIntoMaster(createMaster(),draft,'replace').sections[0].items.every(item=>item.kind==='slot')).toBe(true);
  expect(resolveImportRange(draft,range!.id,'group',2,3)).toBe(true);
  const master=mergeIntoMaster(createMaster(),draft,'replace');
  const group=master.sections[0].items[1];
  expect(group).toMatchObject({kind:'group',rangeLabel:true,sharedHtml:'<p>Shared stimulus.</p>',items:[
   {variants:[{referenceAnswer:'<p>Second</p>'}]},{variants:[{referenceAnswer:'<p>Third</p>'}]}
  ]});
  const restored=masterSchema.parse(JSON.parse(JSON.stringify(master)));
  expect(generationRunId(master,6,'cue')).toBe(generationRunId(restored,6,'cue'));
  const versions=generateVersions(restored,6,'cue');
  const numbers=new Set<number>();
  for(const version of versions){
   const questions=version.sections[0].questions,first=questions.findIndex(q=>q.groupHtml);
   const question=questions[first];
   numbers.add(question.number);
   expect(question.groupHtml).toBe('<p>Use the following for Questions '+question.number+'–'+(question.number+1)+':</p><p>Shared stimulus.</p>');
   expect(questions.slice(first,first+2).map(q=>q.referenceAnswer)).toEqual(['<p>Second</p>','<p>Third</p>']);
  }
  expect(numbers.size).toBeGreaterThan(1);
 });
 it('flags missing, reversed and cross-section ranges and keeps shared material when declined',()=>{
  for(const candidate of [fixture.replace('2–3','2–8'),fixture.replace('2–3','3–2'),fixture.replace('3. Third?','Section B: Proficient\n3. Third?')]){
   const draft=draftFor(candidate),range=draft.ranges![0];
   expect(resolveImportRange(draft,range.id,'group',range.first,range.last)).toBe(false);
   expect(unresolvedImportRanges(draft)).toHaveLength(1);
   expect(resolveImportRange(draft,range.id,'decline')).toBe(true);
   const master=mergeIntoMaster(createMaster(),draft,'replace');
   expect(master.sections[0].items[0]).toMatchObject({variants:[{stem:expect.stringContaining('Shared stimulus.')}]});
   expect(master.sections.flatMap(s=>s.items).every(i=>i.kind==='slot')).toBe(true);
  }
 });
 it('revalidates confirmed children after a draft edit',()=>{
  const draft=draftFor(),range=draft.ranges![0];
  expect(resolveImportRange(draft,range.id,'group',2,3)).toBe(true);
  draft.sections[0].questions.splice(2,1);
  expect(unresolvedImportRanges(draft)).toHaveLength(1);
 });
});
