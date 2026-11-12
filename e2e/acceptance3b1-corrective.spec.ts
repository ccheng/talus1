import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const image='<img src="'+PNG+'" width="250" height="120" alt="Lab motion">';
const table='<table><tbody><tr><td colspan="2"><p><strong>Run group</strong></p></td><td><p>Notes</p></td></tr>'+
 '<tr><td rowspan="2"><p>Series V</p></td><td><p>14.250</p></td><td><p>m/s</p></td></tr>'+
 '<tr><td><p>2.50</p></td><td><p>kg/m³</p></td></tr>'+
 '<tr><td>Last</td><td>5.25</td><td>Stable</td></tr></tbody></table>';
const stemOriginal='<p>Analyze this laboratory observation.</p>'+image+'<p>'+image+'</p>'+table;
const stemEdited='<p>Alternate lab scenario. Analyze this laboratory observation.</p><p>'+image+'</p><p>'+image+'</p>'+table;
const variant=(id:string,type:string,stem:string,answer='4')=>({id,type,stem,choices:[],correctChoiceIds:[],referenceAnswer:'<p>'+answer+'</p>',points:2,shuffleChoices:true,responseLines:type==='writtenResponse'?8:2});
const master={schemaVersion:1,id:'3b1-fix',title:'3B.1 Corrective Pagination',instructions:'',updatedAt:'2026-11-12T00:00:00Z',
 generationSettings:{count:6,seed:'3b1-original'},sections:[
 {id:'s1',title:'Mathematical Models',proficiency:'Exemplary',instructions:'<p></p>',shuffleQuestions:false,items:[{kind:'slot',id:'q1',shufflePosition:false,variants:[variant('a','shortAnswer','<p>Calculate 9/4.</p>')]}]},
 {id:'s2',title:'Multiple Choice',proficiency:'Base',instructions:'<p></p>',shuffleQuestions:false,items:[
  {kind:'slot',id:'q2',shufflePosition:false,variants:[{id:'b',type:'singleChoice',stem:'<p>Which expression gives one half?</p>',
   choices:['1/2','2/4','3/6','4/8'].map((v,i)=>({id:'c'+i,html:'<p>'+v+'</p>'})),correctChoiceIds:['c0'],referenceAnswer:'',points:1,shuffleChoices:false}]}
 ]},
 {id:'s3',title:'Lab Analysis',proficiency:'Proficient',instructions:'<p></p>',shuffleQuestions:false,items:[
  {kind:'slot',id:'q3',shufflePosition:false,variants:[variant('lab-original','writtenResponse',stemOriginal,'12'),variant('lab-edited','writtenResponse',stemEdited,'12')]},
  {kind:'slot',id:'q4',shufflePosition:false,variants:[variant('calibration','writtenResponse','<p>Report measurements.</p>'+table,'30')]}
 ]}
 ]};
async function exportAll(page:import('@playwright/test').Page){
 await page.goto('./');page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'3b1-corrective.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(master))});
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
 return unzipSync(new Uint8Array(await readFile(await (await dl).path()!)));
}
function documents(z:Record<string,Uint8Array>){
 return Object.entries(z).filter(([k])=>k.endsWith('.docx')).map(([filename,data])=>({filename,parts:unzipSync(data)}));
}
async function inspect(page:import('@playwright/test').Page,xml:string){
 return page.evaluate(source=>{
  const tree=new DOMParser().parseFromString(source,'application/xml'),ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body=tree.getElementsByTagNameNS(ns,'body')[0];
  const paras=Array.from(body?.children||[]).filter(e=>e.localName==='p');
  const texts=(e:Element)=>Array.from(e.getElementsByTagNameNS(ns,'t')).map(x=>x.textContent||'').join('');
  const style=(e:Element)=>e.getElementsByTagNameNS(ns,'pStyle')[0]?.getAttributeNS(ns,'val')||'';
  const has=(e:Element,name:string)=>e.getElementsByTagNameNS(ns,name).length>0;
  return {bodyParagraphs:paras.map(p=>({text:texts(p),style:style(p),keep:has(p,'keepNext'),center:Array.from(p.getElementsByTagNameNS(ns,'jc')).some(n=>n.getAttributeNS(ns,'val')==='center'),
    images:p.getElementsByTagNameNS(ns,'drawing').length})),
   tables:Array.from(tree.getElementsByTagNameNS(ns,'tbl')).map(t=>({rows:Array.from(t.children).filter(x=>x.localName==='tr').map(row=>({
    header:has(row,'tblHeader'),cells:Array.from(row.children).filter(x=>x.localName==='tc').map(c=>({text:texts(c),keep:has(c,'keepNext')}))}))})),
   errors:tree.getElementsByTagName('parsererror').length};
 },xml);
}
test('3B1-01: empty section instructions do not separate headings and first substantive questions',async({page})=>{
 const z=await exportAll(page);
 for(const {filename,parts} of documents(z)){
  const info=await inspect(page,strFromU8(parts['word/document.xml']));
  expect(info.errors,filename).toBe(0);
  for(const [i,p] of info.bodyParagraphs.entries()){
   if(p.style==='Heading1'){
    expect(p.text).toBeTruthy();
    expect(info.bodyParagraphs[i+1]?.style,filename+': '+p.text).toBe('Question');
   }
  }
 }
});
test('3B1-02: four-choice MC and answer line have a short keep-with-next chain',async({page})=>{
 const z=await exportAll(page);
 for(const {filename,parts} of documents(z)){
  const info=await inspect(page,strFromU8(parts['word/document.xml']));
  const first=info.bodyParagraphs.findIndex(p=>p.text.includes('Which expression gives one half?'));
  expect(first,filename).toBeGreaterThan(-1);
  const group=info.bodyParagraphs.slice(first,first+5);
  expect(group.map(p=>p.style)).toEqual(['Question','Choice','Choice','Choice','Choice']);
  expect(group.slice(0,4).every(p=>p.keep),filename).toBe(true);
  if(filename.includes('-key'))expect(group[4].keep).toBe(true);
  else expect(group[4].keep).toBe(false);
 }
});
test('3B1-03: compact tables do not fragment header from rows; headers repeat for continued tables',async({page})=>{
 const z=await exportAll(page);
 for(const {filename,parts} of documents(z)){
  const info=await inspect(page,strFromU8(parts['word/document.xml']));
  expect(info.tables.length,filename).toBe(2);
  for(const table of info.tables){
   expect(table.rows.length).toBe(4);
   expect(table.rows[0].header,filename).toBe(true);
   // All paragraphs in rows before the last are chained to keep a short table together.
   for(const row of table.rows.slice(0,-1))expect(row.cells.every(c=>c.keep),filename).toBe(true);
  }
 }
});
test('3B1-04: response rules are in kept, question-number-labelled chunks, not context-free loose lines',async({page})=>{
 const z=await exportAll(page);
 for(const {filename,parts} of documents(z)){
  const info=await inspect(page,strFromU8(parts['word/document.xml']));
  if(filename.includes('-key'))continue;
  const paragraphs=info.bodyParagraphs;
  const labels=paragraphs.filter(p=>p.style==='ResponseLabel');
  expect(labels.length,filename).toBeGreaterThanOrEqual(2);
  for(const label of labels){
   expect(label.text).toMatch(/Question \d+ — response space/i);
   expect(label.keep).toBe(true);
  }
  expect(paragraphs.filter(p=>p.style==='ResponseLine')).toHaveLength(18);
  for(let i=0;i<paragraphs.length;i++)if(paragraphs[i].style==='ResponseLine'){
   const previous=paragraphs[i-1];
   expect(previous.style==='ResponseLine'||previous.style==='ResponseLabel',filename).toBe(true);
  }
 }
});
test('3B1-05: standalone images have the same alignment for original and prose-edited variants',async({page})=>{
 const z=await exportAll(page);
 const results=[];
 for(const {filename,parts} of documents(z)){
  const info=await inspect(page,strFromU8(parts['word/document.xml']));
  const standalone=info.bodyParagraphs.filter(p=>p.images>0);
  expect(standalone.length,filename).toBe(2);
  expect(standalone.every(p=>p.center),filename).toBe(true);
  results.push(standalone.map(p=>p.center));
 }
 expect(new Set(results.map(x=>JSON.stringify(x))).size).toBe(1);
});
