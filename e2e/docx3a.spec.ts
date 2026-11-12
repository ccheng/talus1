import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const data='data:image/png;base64,'+PNG;
const math='<math><mfrac><mrow><mn>9</mn></mrow><mrow><mn>4</mn></mrow></mfrac></math>';
const base={schemaVersion:1,id:'test3a',title:'Science 10 Editable Word',instructions:'<p><strong>Show work.</strong> Use SI units.</p>',updatedAt:'2026-11-12T00:00:00Z',generationSettings:{count:6,seed:'docx-3a-qa'},sections:[{id:'s1',title:'Applications',proficiency:'Proficient',instructions:'<p>Answer every question.</p>',shuffleQuestions:true,items:[
 {kind:'slot',id:'q1',shufflePosition:true,variants:[{id:'v1',type:'shortAnswer',stem:'<p>Calculate '+math+' m/s. H<sub>2</sub>O, 6.02 × 10<sup>23</sup>.</p><p><img src="'+data+'" width="224" height="112" alt="Motion chart"></p><table><tr><th colspan="2">Readings</th></tr><tr><td>Time</td><td>3.50 s</td></tr><tr><td><img src="'+data+'" width="96" height="48"></td><td>'+math+'</td></tr></table>',choices:[],correctChoiceIds:[],referenceAnswer:'<p><strong>2.25</strong> m/s</p>',points:2,shuffleChoices:true,responseLines:3}]},
 {kind:'slot',id:'q2',shufflePosition:true,variants:[{id:'v2',type:'singleChoice',stem:'<p>Which is water?</p>',choices:[{id:'a',html:'<p>H<sub>2</sub>O</p>'},{id:'b',html:'<p>CO<sub>2</sub></p>'}],correctChoiceIds:['a'],referenceAnswer:'',points:1,shuffleChoices:true}]}]}]};
async function setup(page:import('@playwright/test').Page){
 await page.goto('./');
 page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'3a.talus.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
}
async function archive(page:import('@playwright/test').Page){
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
 return unzipSync(new Uint8Array(await readFile(await(await dl).path()!)));
}
const s=(z:Record<string,Uint8Array>,path:string)=>strFromU8(z[path]);
test('3A exports six editable student DOCX and six editable keys plus manifest',async({page})=>{
 await setup(page);const zipped=await archive(page);const files=Object.keys(zipped);
 expect(files.filter(f=>f.endsWith('.docx'))).toHaveLength(12);
 expect(files.some(f=>f.includes('-VA.docx'))).toBe(true);
 for(const [name,bytes] of Object.entries(zipped).filter(([k])=>k.endsWith('.docx'))){
  const doc=unzipSync(bytes);
  expect(s(doc,'[Content_Types].xml')).toContain('wordprocessingml.document.main+xml');
  const body=s(doc,'word/document.xml');
  expect(body).toContain('Science 10 Editable Word');
  expect(body).toContain('Applications');
  expect(body).toContain('<w:tbl>');
  expect(body).toContain('<m:f>');
  expect(body).toContain('r:embed=');
  expect(Object.keys(doc).filter(x=>x.startsWith('word/media/'))).toHaveLength(1);
  if(name.includes('-key'))expect(body).toContain('Answer:');
  else expect(body).not.toContain('2.25');
 }
 expect(files).toContain('generation-manifest.json');
});
test('3A Word displays real OOXML fractions, scripts, merged geometry and image dimensions',async({page})=>{
 await setup(page);const pack=await archive(page);const name=Object.keys(pack).find(f=>/VA\.docx$/.test(f))!;
 const doc=unzipSync(pack[name]);const xml=s(doc,'word/document.xml');
 expect(xml).toContain('<m:num>');expect(xml).toContain('<m:den>');
 expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
 expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
 expect(xml).toContain('<w:gridSpan w:val="2"/>');
 expect(xml).toContain('cx="2133600"'); // 224 * 9525 EMUs
 expect(xml).toContain('cy="1066800"'); // 112 * 9525 EMUs
 expect(xml).toContain('<w:t xml:space="preserve">3.50 s</w:t>');
});
test('3A deterministic export preserves version-specific key letters and response lines',async({page})=>{
 await setup(page);const pack=await archive(page);
 for(const version of 'ABC'){
  const key=Object.keys(pack).find(f=>f.endsWith('-V'+version+'-key.docx'))!;
  const student=Object.keys(pack).find(f=>f.endsWith('-V'+version+'.docx'))!;
  const a=s(unzipSync(pack[key]),'word/document.xml'),b=s(unzipSync(pack[student]),'word/document.xml');
  expect(a).toContain('Answer:');
  expect(a).toContain('2.25');
  expect(b).not.toContain('2.25');
  expect(b).toContain('________________');
 }
});
