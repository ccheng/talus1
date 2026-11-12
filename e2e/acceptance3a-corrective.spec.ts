import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const img='data:image/png;base64,'+PNG;
const summation='<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mrow><munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mrow><mn>4</mn></mrow></munderover><mrow><mi>k</mi></mrow></mrow></mrow></math>';
const cells='<table><tbody><tr><td><p>Time (s)</p></td><td><p>Position (m)</p></td><td><p>Instrument</p></td></tr><tr><td><p>2</p></td><td><p>8</p></td><td><p><img src="'+img+'" width="96" height="48"/></p></td></tr><tr><td><p>5</p></td><td><p>20</p></td><td><p>Laser</p></td></tr></tbody></table>';
const wrapped='<p>Before Lab table.</p><p>'+cells+'</p><p>After Lab table.</p>';
const topLevel='<p>Before Lab table.</p><p></p>'+cells+'<p>After Lab table.</p>';
const master={schemaVersion:1,id:'3a-original-acceptance-fixture',title:'Summation and Lab Table',instructions:'',updatedAt:'2026-11-12T00:00:00.000Z',generationSettings:{count:6,seed:'3a-corrective'},sections:[{id:'s1',title:'Science',proficiency:'Proficient',instructions:'',shuffleQuestions:false,items:[
{kind:'slot',id:'summation-slot',shufflePosition:false,variants:[{id:'summation-variant',type:'shortAnswer',stem:'<p>Evaluate the sum:</p><p>'+summation+'</p>',choices:[],correctChoiceIds:[],referenceAnswer:'10',points:2,shuffleChoices:true}]},
{kind:'slot',id:'lab-slot',shufflePosition:false,variants:[
{id:'lab-wrapped',type:'shortAnswer',stem:wrapped,choices:[],correctChoiceIds:[],referenceAnswer:'12',points:2,shuffleChoices:true},
{id:'lab-normalized',type:'shortAnswer',stem:topLevel,choices:[],correctChoiceIds:[],referenceAnswer:'12',points:2,shuffleChoices:true}
]}]}]};
async function batch(page:import('@playwright/test').Page,input=master){
 await page.goto('./');page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'independent-3a.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
 return unzipSync(new Uint8Array(await readFile(await(await download).path()!)));
}
function doc(pack:Record<string,Uint8Array>,name:string){
 const path=Object.keys(pack).find(x=>x.endsWith(name));
 expect(path,name).toBeTruthy();
 return strFromU8(unzipSync(pack[path!])['word/document.xml']);
}
test('3A-01 P0: native summation has exact nonempty k operand in all six student forms and keys',async({page})=>{
 const pack=await batch(page);
 for(const label of 'ABCDEF'){
  for(const suffix of ['.docx','-key.docx']){
   const xml=doc(pack,'-V'+label+suffix);
   const parsed=await page.evaluate(xml=>{
    const root=new DOMParser().parseFromString(xml,'application/xml');
    const nary=Array.from(root.getElementsByTagName('*')).find(n=>n.localName==='nary');
    const operand=Array.from(nary?.children||[]).find(n=>n.localName==='e');
    return {count:root.getElementsByTagName('parsererror').length,operand:operand?.textContent||'',
     lower:Array.from(nary?.children||[]).find(n=>n.localName==='sub')?.textContent||'',
     upper:Array.from(nary?.children||[]).find(n=>n.localName==='sup')?.textContent||'',
     separateSibling: nary?.nextElementSibling?.localName==='r'&&nary.nextElementSibling.textContent==='k'};
   },xml);
   expect(parsed.count).toBe(0);
   expect(parsed.operand).toBe('k');
   expect(parsed.lower).toBe('k=1');
   expect(parsed.upper).toBe('4');
   expect(parsed.separateSibling).toBe(false);
  }
 }
});
test('3A-02 P0: paragraph wrapped and top-level tables retain native rows, columns and image cell association',async({page})=>{
 const pack=await batch(page);
 for(const label of 'ABCDEF')for(const suffix of ['.docx','-key.docx']){
  const xml=doc(pack,'-V'+label+suffix);
  const result=await page.evaluate(xml=>{
   const tree=new DOMParser().parseFromString(xml,'application/xml');
   const tables=Array.from(tree.getElementsByTagName('*')).filter(n=>n.localName==='tbl');
   const t=tables.find(n=>n.textContent?.includes('Instrument'));
   const rows=Array.from(t?.children||[]).filter(n=>n.localName==='tr');
   const cellCounts=rows.map(r=>Array.from(r.children).filter(n=>n.localName==='tc').length);
   const image=Array.from(t?.getElementsByTagName('*')||[]).find(n=>n.localName==='drawing');
   return {tables:tables.length,rows:rows.length,cellCounts,inCell:image?.parentElement?.closest?.('w\\:tc')!==null,
      imageWithinCell:!!image&&!!Array.from(t?.getElementsByTagName('*')||[]).find(n=>n.localName==='tc'&&Array.from(n.getElementsByTagName('*')).includes(image)),
      content:t?.textContent||''};
  },xml);
  expect(result.tables).toBe(1);
  expect(result.rows).toBe(3);
  expect(result.cellCounts).toEqual([3,3,3]);
  expect(result.imageWithinCell).toBe(true);
  expect(result.content).toContain('Time (s)');
  expect(result.content).toContain('Position (m)');
  expect(result.content).toContain('Instrument');
 }
});
test('3A-01 safety: missing n-ary operand blocks export visibly instead of generating an empty box',async({page})=>{
 const source=JSON.parse(JSON.stringify(master));source.sections[0].items[0].variants[0].stem='<p><math><mrow><munderover><mo>∑</mo><mi>k</mi><mn>4</mn></munderover></mrow></math></p>';
 await page.goto('./');page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'unattached-sum.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
 await expect(page.locator('.notice')).toContainText(/Word export blocked.*summation.*operand/i);
});
