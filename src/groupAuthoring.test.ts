import {describe,expect,it} from 'vitest';
import {createMaster,createSlot,validateMaster,type Group,type Section} from './model';
import {groupQuestions,moveAdjacentIntoGroup,moveGroupChildOut,removeQuestion,ungroupQuestions} from './groupAuthoring';
import {generateVersions} from './generate';

function fixture(){
 const master=createMaster();
 const section=master.sections[0];
 const slots=Array.from({length:4},(_,i)=>{
  const slot=createSlot();
  slot.variants[0]={...slot.variants[0],type:'shortAnswer',stem:'<p>Question '+i+'</p>',referenceAnswer:'<p>Answer '+i+'</p>',choices:[],correctChoiceIds:[]};
  return slot;
 });
 section.items=slots;
 return {master,section,slots};
}

describe('3C grouped question authoring',()=>{
 it('groups consecutive top-level questions without re-creating their IDs or alternatives',()=>{
  const {section,slots}=fixture();
  const grouped=groupQuestions(section,slots[1].id,slots[2].id);
  const group=grouped.items[1] as Group;
  expect(group).toMatchObject({kind:'group',items:[slots[1],slots[2]],sharedHtml:'',shuffleWithinGroup:false});
  expect(grouped.items[0]).toBe(slots[0]);
  expect(grouped.items[2]).toBe(slots[3]);
  expect(groupQuestions(grouped,slots[0].id,slots[3].id)).toBe(grouped);
 });
 it('retains shared content and order when moving adjacent questions in and edge children out',()=>{
  const {section,slots}=fixture();
  const initial=groupQuestions(section,slots[1].id,slots[2].id);
  const group=initial.items[1] as Group;
  group.sharedHtml='<p>Shared context</p>';
  const moved=moveAdjacentIntoGroup(initial,group.id,'before');
  expect((moved.items[0] as Group).items).toEqual(slots.slice(0,3));
  const restored=moveGroupChildOut(moved,group.id,slots[0].id);
  expect(restored).toEqual(initial);
  expect(moveGroupChildOut(moved,group.id,slots[1].id)).toBe(moved);
  expect(removeQuestion(initial,slots[1].id).items[1]).toMatchObject({sharedHtml:group.sharedHtml,items:[slots[2]]});
  expect(removeQuestion(removeQuestion(initial,slots[1].id),slots[2].id).items[1]).toMatchObject({sharedHtml:group.sharedHtml,items:[slots[2]]});
 });
 it('preserves shared context exactly once per generated version after ungrouping into a selected child',()=>{
  const {master,section,slots}=fixture();
  const initial=groupQuestions(section,slots[1].id,slots[2].id);
  const group=initial.items[1] as Group;
  group.sharedHtml='<p>Shared passage</p>';
  const original=slots[2].variants[0];
  slots[2].variants.push({...original,id:'alternate',stem:'<p>Alternate prompt</p>'});
  expect(ungroupQuestions(initial,group.id,undefined)).toBe(initial);
  const ungrouped=ungroupQuestions(initial,group.id,slots[2].id);
  expect(ungrouped.items.map(i=>i.id)).toEqual(slots.map(s=>s.id));
  expect((ungrouped.items[2] as typeof slots[number]).variants.map(v=>v.stem)).toEqual([
   '<p>Shared passage</p>'+original.stem,'<p>Shared passage</p><p>Alternate prompt</p>'
  ]);
  master.sections=[ungrouped];
  for(const version of generateVersions(master,6,'groups'))expect(version.sections[0].questions.filter(q=>q.stem.includes('Shared passage'))).toHaveLength(1);
  const intoInstructions=ungroupQuestions({...initial,instructions:'<p>General</p>'},group.id,'section');
  expect(intoInstructions.instructions).toBe('<p>General</p><p>Shared passage</p>');
 });
 it('validates group identity, empty groups and shared media while keeping valid legacy single-child groups',()=>{
  const {master,section,slots}=fixture();
  const legacy:Group={kind:'group',id:'legacy',items:[slots[0]],sharedHtml:'',shuffleWithinGroup:false};
  master.sections=[{...section,items:[legacy]}];
  expect(validateMaster(master)).toEqual([]);
  const invalid:Section={...section,items:[legacy,{...legacy,items:[],sharedHtml:'<img src="https://example.org/source.png">'}]};
  master.sections=[invalid];
  const issues=validateMaster(master).join(' ');
  expect(issues).toMatch(/Duplicate ID.*group/i);
  expect(issues).toMatch(/group has no questions/i);
  expect(issues).toMatch(/supported embedded raster data URI/i);
 });
});
