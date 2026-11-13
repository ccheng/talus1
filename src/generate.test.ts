import { describe,expect,it } from 'vitest';
import { createMaster,createSlot,createVariant,masterSchema,validateMaster,type Group } from './model';
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

  // Historical records generated from a schema-parsed 3C backup are still valid.
  const schemaOrderGroup={kind:group.kind,id:group.id,sharedHtml:group.sharedHtml,shuffleWithinGroup:group.shuffleWithinGroup,items:group.items};
  const previousSections=[{...section,items:section.items.map(item=>item===group?schemaOrderGroup:item)}];
  const previousHash=hashSeed(JSON.stringify({id:m.id,updatedAt:m.updatedAt,count:6,seed:'grouped-run',sections:previousSections})).toString(36).padStart(7,'0');
  restored.lastGeneration={...generation,runId:previousHash};
  expect(restoreGenerated(restored)).toEqual(versions);
  const restoredGroup=restored.sections[0].items[1] as Group;
  restoredGroup.sharedHtml='<p>Changed setup</p>';
  expect(restoreGenerated(restored)).toEqual([]);
 });
});
