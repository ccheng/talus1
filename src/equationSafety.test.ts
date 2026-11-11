import {describe,it,expect} from 'vitest';
import {createMaster,createVariant,validateMaster} from './model';

describe('2C.2 missing-operand hard validation',()=>{
 function build(html:string,field:'stem'|'referenceAnswer'|'choice'|'instructions'|'sectionInstructions'|'group'='stem'){
  const master=createMaster();
  const slot=master.sections[0].items[0];
  if(slot.kind!=='slot')throw Error('Missing slot');
  const v=createVariant('shortAnswer');
  v.stem='<p>Compute 9 / 4.</p>';
  v.referenceAnswer='<p>2.25</p>';
  slot.variants=[v];
  if(field==='stem')v.stem=html;
  if(field==='referenceAnswer')v.referenceAnswer=html;
  if(field==='choice'){v.type='singleChoice';v.choices=[{id:'a',html},{id:'b',html:'<p>Other</p>'}];v.correctChoiceIds=['a'];}
  if(field==='instructions')master.instructions=html;
  if(field==='sectionInstructions')master.sections[0].instructions=html;
  if(field==='group'){master.sections[0].items=[{kind:'group',id:'g',sharedHtml:html,shuffleWithinGroup:false,items:[slot]}];}
  return master;
 }
 const placeholder='<strong>[Word equation requires manual review: Incomplete Word equation: missing den operand in f]</strong>';
 for(const field of ['stem','referenceAnswer','choice','instructions','sectionInstructions','group'] as const){
  it('blocks placeholder in '+field+' even without an import warning',()=>{
   const master=build(placeholder,field);
   master.importWarnings=[];
   expect(validateMaster(master).join(' ')).toMatch(/unresolved Word equation placeholder/i);
   expect(validateMaster(JSON.parse(JSON.stringify(master))).join(' ')).toMatch(/unresolved Word equation placeholder/i);
  });
 }
 it('accepts repaired content and an intact MathML fraction',()=>{
  const master=build('<math><mfrac><mrow><mn>9</mn></mrow><mrow><mn>4</mn></mrow></mfrac></math>');
  expect(validateMaster(master)).toEqual([]);
 });
 it('rejects an empty MathML denominator supplied through JSON even if no warning exists',()=>{
  const master=build('<math><mfrac><mrow><mn>17</mn></mrow><mrow></mrow></mfrac></math>');
  expect(validateMaster(master).join(' ')).toMatch(/empty.*denominator|invalid.*fraction/i);
 });
});