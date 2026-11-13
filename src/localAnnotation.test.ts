import {describe,expect,it} from 'vitest';
import {buildLocalWindows,mergeLocalFragments,type LocalFragment} from './localAnnotation';

const block=(n:number,text='word')=>({id:'B'+n,text,html:'',atoms:[]});
const r=(n:number)=>({block:'B'+n});
const q=(n:number,number:number)=>({type:'shortAnswer' as const,number:r(number),stem:[r(n)]});
const section=(n:number,questions:ReturnType<typeof q>[]):LocalFragment=>({sections:[{heading:r(n),questions}]});
const count=(value:string)=>value.length;
const budget={context:100,output:20,overlap:1,count,render:(ids:ReturnType<typeof block>[])=>ids.map(b=>b.text).join(' ')};
describe('2D.2 feasibility orchestration',()=>{
 it('splits at a forced boundary, retains original IDs, and overlaps one block',()=>{
  const windows=buildLocalWindows([block(1,'a'.repeat(30)),block(2,'b'.repeat(30)),block(3,'c'.repeat(30))],budget);
  expect(windows.map(window=>window.blocks.map(b=>b.id))).toEqual([['B1','B2'],['B2','B3']]);
  expect(windows.every(window=>window.inputTokens+budget.output<=budget.context)).toBe(true);
 });
 it('stops when a source block or overlap cannot fit intact',()=>{
  expect(()=>buildLocalWindows([block(1,'a'.repeat(81))],budget)).toThrow(/B1/);
  expect(()=>buildLocalWindows([block(1,'a'.repeat(70)),block(2,'b'.repeat(70))],budget)).toThrow(/overlap/i);
 });
 it('deduplicates identical source-backed questions and isolates repeated numbers in separate sections',()=>{
  const first=q(3,2),second=q(6,5);
  const firstKey={number:r(8),content:[r(9)]},secondKey={number:r(11),content:[r(12)]};
  const combined=mergeLocalFragments('a'.repeat(64),[section(1,[first]),section(1,[first]),section(4,[second])],
   [{heading:r(7),groups:[{heading:r(10),sectionHeading:r(4)}],matches:[
    {question:r(3),key:firstKey},{question:r(6),key:secondKey}
   ]}]);
  expect(combined.sections.map(section=>section.questions.map(item=>item.key))).toEqual([[firstKey],[secondKey]]);
  expect(combined.keyGroups).toEqual([{heading:r(10),section:1}]);
 });
 it('stops on incompatible overlapping proposals and competing key assignments',()=>{
  const first=q(3,2);
  expect(()=>mergeLocalFragments('a'.repeat(64),[section(1,[first]),section(1,[{...first,stem:[r(3),r(4)]}])],[])).toThrow(/conflict/i);
  expect(()=>mergeLocalFragments('a'.repeat(64),[section(1,[first])],[{matches:[
   {question:r(3),key:{content:[r(8)]}},{question:r(3),key:{content:[r(9)]}}
  ]}])).toThrow(/conflict/i);
 });
});
