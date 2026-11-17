import { describe,expect,it } from 'vitest';
import { createMaster,createSlot,createVariant,masterSchema,validateMaster,type Group,type MasterTest,type Slot } from './model';
import { generateVersions,generationRecord,generationRunId,hashSeed,restoreGenerated } from './generate';

function fixture(){
  const master=createMaster();master.title='Sample';
  const section=master.sections[0];section.items=[];
  for(let j=0;j<8;j++){
    const slot=createSlot();slot.variants[0].stem='<p>Question '+j+'</p>';
    slot.variants[0].choices.forEach((c,i)=>c.html='<p>Choice '+i+'</p>');
    slot.variants[0].correctChoiceIds=[slot.variants[0].choices[0].id];
    section.items.push(slot);
  }return master;
}
describe('generator',()=>{
 it('preserves generation settings and manifests in version 1 backups',()=>{
   const m=fixture(), versions=generateVersions(m,6,'science10-qa-2026');
   m.generationSettings={count:6,seed:'science10-qa-2026'};
   m.lastGeneration=generationRecord(m,versions,6,'science10-qa-2026');
   const restored=JSON.parse(JSON.stringify(m));
   expect(restoreGenerated(restored)).toEqual(versions);
   expect(restored.lastGeneration.manifests).toHaveLength(6);
   restored.title='Edited';
   restored.updatedAt='2030-01-01T00:00:00.000Z';
   expect(restoreGenerated(restored)).toEqual([]);
 });

  it('generates deterministic, valid versions without missing slots',()=>{
    const m=fixture();expect(validateMaster(m)).toEqual([]);
    const a=generateVersions(m,4,'seed42'),b=generateVersions(m,4,'seed42');
    expect(a).toEqual(b);
    for(const v of a){
      expect(v.manifest).toHaveLength(8);
      expect(new Set(v.manifest.map(x=>x.slotId)).size).toBe(8);
      expect(v.manifest.map(x=>x.number)).toEqual([1,2,3,4,5,6,7,8]);
    }
  });
  it('rotates alternatives and preserves sections and fixed positions',()=>{
    const m=fixture();const s=m.sections[0];const fixed=s.items[0];if(fixed.kind!=='slot')throw Error();
    fixed.shufflePosition=false;const alternate=createVariant();
    alternate.stem='<p>Alternate</p>';alternate.choices.forEach((c,i)=>c.html='<p>'+i+'</p>');alternate.correctChoiceIds=[alternate.choices[1].id];
    fixed.variants.push(alternate);
    const other={...s,id:'second',title:'Another',items:[s.items.pop()!]};m.sections.push(other);
    const versions=generateVersions(m,2,'balanced');
    expect(versions[0].sections[0].questions[0].slotId).toBe(fixed.id);
    expect(versions[1].sections[0].questions[0].slotId).toBe(fixed.id);
    expect(versions[0].manifest[0].variantId).not.toBe(versions[1].manifest[0].variantId);
    expect(versions[0].sections[1].questions[0].number).toBe(8);
  });
  it('rejects incomplete answers',()=>{const m=fixture();const slot=m.sections[0].items[0];if(slot.kind!=='slot')throw Error();slot.variants[0].correctChoiceIds=[];expect(validateMaster(m).some(x=>x.includes('correct'))).toBe(true);});
});

describe('grouped generation backup restoration',()=>{
 it('keeps the run ID across schema parsing and restores exact versions without regeneration',()=>{
  const m=fixture(),section=m.sections[0];
  const children=section.items.splice(1,2);
  if(children.some(item=>item.kind!=='slot'))throw Error();
  const group={kind:'group',id:'group-fixture',items:children,sharedHtml:'<p>Shared setup</p>',shuffleWithinGroup:true} as Group;
  section.items.splice(1,0,group);
  const versions=generateVersions(m,6,'grouped-run');
  const generation=generationRecord(m,versions,6,'grouped-run');
  m.lastGeneration=generation;
  const restored=masterSchema.parse(JSON.parse(JSON.stringify(m)));
  expect(generationRunId(restored,6,'grouped-run')).toBe(generation.runId);
  expect(restoreGenerated(restored)).toEqual(versions);

  const restoredGroup=restored.sections[0].items[1] as Group;
  restoredGroup.sharedHtml='<p>Changed setup</p>';
  expect(restoreGenerated(restored)).toEqual([]);
 });
});

it('restores a real legacy generation manifest and historical group hash',()=>{
 const slot=(name:string):Slot=>({
  kind:'slot',id:name,shufflePosition:true,
  variants:[{id:name+'-v',type:'singleChoice',stem:'<p>Synthetic '+name+'</p>',
   choices:[{id:name+'1',html:'<p>One</p>'},{id:name+'2',html:'<p>Two</p>'}],
   correctChoiceIds:[name+'1'],referenceAnswer:'',points:1,shuffleChoices:true}],
 });
 const m:MasterTest={schemaVersion:1,id:'legacy-test',title:'Legacy',instructions:'',updatedAt:'2020-01-01T00:00:00.000Z',
  sections:[{id:'legacy-section',title:'Legacy section',proficiency:'',instructions:'',shuffleQuestions:true,
   items:[slot('outer'),{kind:'group',id:'legacy-group',sharedHtml:'<p>Shared setup</p>',
    shuffleWithinGroup:true,items:[slot('left'),slot('right')],rangeLabel:true}]}],
 };
 // Captured from the previous release with this synthetic test.
 const a=[['right','21'],['left','21'],['outer','12']];
 const b=[['left','12'],['right','12'],['outer','12']];
 m.lastGeneration={count:2,seed:'legacy-group',runId:'1b1zbzz',sourceUpdatedAt:m.updatedAt,
  manifests:[a,b].map((entries,index)=>({label:index===0?'A':'B',entries:entries.map(([id,order],i)=>({
   slotId:id,variantId:id+'-v',choiceOrder:[...order].map(n=>id+n),number:i+1,
  }))}))};
 const restored=masterSchema.parse(JSON.parse(JSON.stringify(m)));
 const versions=restoreGenerated(restored);
 expect(versions.map(v=>v.manifest)).toEqual(m.lastGeneration.manifests.map(v=>v.entries));
 expect(versions[0].sections[0].questions[0].groupHtml).toContain('Questions 1–2');
 expect(versions[0].sections[0].questions.map(q=>q.label)).toEqual(['1','2','3']);

 const previousHash=hashSeed(JSON.stringify({id:restored.id,updatedAt:restored.updatedAt,count:2,
  seed:'legacy-group',sections:restored.sections})).toString(36).padStart(7,'0');
 restored.lastGeneration={...m.lastGeneration,runId:previousHash};
 expect(restoreGenerated(restored)).toEqual(versions);
});

describe('Milestone 8 generation',()=>{
 it('uses independent question-type counters across sections, even in a mixed shared group',()=>{
  const m=fixture(),section=m.sections[0];
  section.shuffleQuestions=false;
  const slots=section.items.filter((item):item is Slot=>item.kind==='slot');
  for(const [index,type] of [[1,'numericalResponse'],[3,'shortAnswer'],[4,'numericalResponse'],[6,'writtenResponse']] as const){
   slots[index].variants=[{...createVariant(type),stem:'<p>Synthetic response</p>',referenceAnswer:'<p>12</p>'}];
  }
  slots[2].variants[0].type='multipleSelect';
  section.items=[slots[0],{kind:'group',id:'mixed-group',sharedHtml:'<p>Read the weather chart.</p>',rangeLabel:true,
   shuffleWithinGroup:false,items:slots.slice(1,4)}];
  m.sections.push({...section,id:'follow-up',items:slots.slice(4)});
  const version=generateVersions(m,1,'mixed')[0];
  expect(version.sections.flatMap(s=>s.questions.map(q=>q.label))).toEqual(['1','NR1','2','WR1','NR2','3','WR2','4']);
  expect(version.sections[0].questions[1].groupHtml).toContain('Questions NR1, 2, and WR1');
  m.generationSettings={seed:'mixed',count:1,numbering:'continuous'};
  const continuous=generateVersions(m,1,'mixed')[0];
  expect(continuous.sections.flatMap(s=>s.questions.map(q=>q.label))).toEqual(['1','2','3','4','5','6','7','8']);
  expect(continuous.sections[0].questions[1].groupHtml).toContain('Questions 2–4');
  expect(continuous.manifest.map(({label,...entry})=>entry)).toEqual(version.manifest.map(({label,...entry})=>entry));
 });
 it('keeps pinned question positions and shared groups with unequal lengths intact',()=>{
  const m=fixture(),section=m.sections[0];
  const slots=section.items.filter((item):item is Slot=>item.kind==='slot');
  const pinned=slots[3];
  pinned.shufflePosition=false;
  section.items=[
   {kind:'group',id:'survey',sharedHtml:'<p>Survey data</p>',shuffleWithinGroup:false,items:[slots[0],slots[1]]},
   slots[2],pinned,slots[4],
   {kind:'group',id:'sample',sharedHtml:'<p>Sample data</p>',shuffleWithinGroup:true,items:slots.slice(5)},
  ];
  for(const version of generateVersions(m,12,'unequal-groups')){
   const qs=version.sections[0].questions;
   expect(qs[3].slotId).toBe(pinned.id);
   const survey=qs.findIndex(q=>q.groupHtml==='<p>Survey data</p>');
   const sample=qs.findIndex(q=>q.groupHtml==='<p>Sample data</p>');
   expect(qs.slice(survey,survey+2).map(q=>q.slotId)).toEqual(slots.slice(0,2).map(q=>q.id));
   expect(new Set(qs.slice(sample,sample+3).map(q=>q.slotId))).toEqual(new Set(slots.slice(5).map(q=>q.id)));
  }
 });
 it('spreads three forms across six independent binary sections and respects pinned questions',()=>{
  const m=fixture(),section=m.sections[0];
  m.sections=Array.from({length:6},(_,index)=>{
   const sample=fixture().sections[0].items.slice(0,index<2?2:4);
   if(index<2)return {...section,id:'binary-'+index,items:sample};
   if(sample[1].kind!=='slot'||sample[3].kind!=='slot')throw Error();
   sample[1].shufflePosition=false;
   sample[3].shufflePosition=false;
   return {...section,id:'binary-'+index,items:sample};
  });
  const versions=generateVersions(m,3,'weather-forms');
  for(const [index,version] of versions.entries()){
   for(const other of versions.slice(index+1)){
    expect(version.manifest.filter((q,i)=>q.slotId!==other.manifest[i].slotId)).toHaveLength(8);
   }
   for(const [sectionIndex,s] of version.sections.entries())
    m.sections[sectionIndex].items.forEach((item,i)=>{
     if(item.kind==='slot'&&!item.shufflePosition)expect(s.questions[i].slotId).toBe(item.id);
    });
  }
 });
});
