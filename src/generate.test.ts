import { describe,expect,it } from 'vitest';
import { createMaster,createSlot,createVariant,validateMaster } from './model';
import { generateVersions } from './generate';

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
