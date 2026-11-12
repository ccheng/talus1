import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';

const IMG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const math='<math><mfrac><mn>9</mn><mn>4</mn></mfrac></math>';
const master={schemaVersion:1,id:'3b1',title:'Science 10 — Laboratory Assessment',instructions:'<p>Show all calculations and units.</p>',
 updatedAt:'2026-11-12T00:00:00Z',generationSettings:{count:6,seed:'layout-3b1'},
 sections:[{id:'s',title:'Applications',proficiency:'Proficient',instructions:'<p>Work carefully.</p>',shuffleQuestions:true,
 items:[
  {kind:'slot',id:'q1',shufflePosition:true,variants:[{id:'v1',type:'shortAnswer',stem:'<p>Find the ratio '+math+'.</p><p><img src="'+IMG+'" width="320" height="180"></p><table><tr><th colspan="2">Measurements</th></tr><tr><td>Time</td><td>3.50 s</td></tr><tr><td><img src="'+IMG+'" width="96" height="48"></td><td>'+math+'</td></tr></table>',
   choices:[],correctChoiceIds:[],referenceAnswer:'<p>2.25</p>',points:2,responseLines:3,shuffleChoices:true}]},
  {kind:'slot',id:'q2',shufflePosition:true,variants:[{id:'v2',type:'singleChoice',stem:'<p>Which is water?</p>',choices:[{id:'c1',html:'<p>H<sub>2</sub>O</p>'},{id:'c2',html:'<p>CO<sub>2</sub></p>'}],correctChoiceIds:['c1'],referenceAnswer:'',points:1,shuffleChoices:true}]}
 ]}]};
async function pack(page:import('@playwright/test').Page){
 await page.goto('./');page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'layout.talus.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(master))});
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const dl=page.waitForEvent('download');
 await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
 return unzipSync(new Uint8Array(await readFile(await(await dl).path()!)));
}
const content=(z:Record<string,Uint8Array>,path:string)=>strFromU8(z[path]);
function word(pack:Record<string,Uint8Array>,suffix:string){const name=Object.keys(pack).find(x=>x.endsWith(suffix));expect(name).toBeTruthy();return unzipSync(pack[name!]);}
test('3B.1 defaults: US Letter, consistent 1-inch margins, font/spacing, styled headings, questions and choices',async({page})=>{
 const files=await pack(page);
 for(const label of 'ABCDEF')for(const suffix of ['.docx','-key.docx']){
  const z=word(files,'-V'+label+suffix);
  const document=content(z,'word/document.xml'),styles=content(z,'word/styles.xml');
  expect(document).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
  expect(document).toContain('<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"');
  for(const name of ['Normal','Title','Heading1','Question','Choice','Answer','ResponseLine'])
   expect(styles).toContain('w:styleId="'+name+'"');
  expect(styles).toContain('<w:rFonts w:ascii="Aptos"');
  expect(styles).toContain('<w:sz w:val="22"/>');
  expect(styles).toContain('<w:spacing w:line="276"');
  expect(document).toContain('<w:pStyle w:val="Question"/>');
  expect(document).toContain('<w:pStyle w:val="Choice"/>');
  expect(document).toContain('<w:keepNext/>');
  expect(document).toContain('<w:cantSplit/>');
  expect(document).toContain('<w:tbl>');
  expect(document).toContain('<m:f>');
 }
});
test('3B.1 student identification and page-number footer are editable and correctly related',async({page})=>{
 const files=await pack(page);
 for(const label of 'ABCDEF'){
  for(const suffix of ['.docx','-key.docx']){
   const z=word(files,'-V'+label+suffix),main=content(z,'word/document.xml');
   const rel=content(z,'word/_rels/document.xml.rels');
   expect(rel).toContain('relationships/header');
   expect(rel).toContain('relationships/footer');
   expect(main).toContain('<w:headerReference w:type="default"');
   expect(main).toContain('<w:footerReference w:type="default"');
   const header=content(z,'word/header1.xml'),footer=content(z,'word/footer1.xml');
   expect(header).toContain('Science 10');
   expect(header).toContain('Version '+label);
   expect(footer).toContain('PAGE');
   if(suffix==='-key.docx'){
    expect(main).not.toContain('Name: __________________');
    expect(header).toContain('Answer Key');
   }else{
    expect(main).toContain('Name: __________________');
    expect(main).toContain('Class: ______________');
    expect(main).toContain('Date: ______________');
   }
  }
 }
});
test('3B.1 response space, answer keys, native maths, and rich tables remain intact in all twelve files',async({page})=>{
 const files=await pack(page);
 expect(Object.keys(files).filter(x=>x.endsWith('.docx'))).toHaveLength(12);
 for(const label of 'ABCDEF')for(const suffix of ['.docx','-key.docx']){
  const z=word(files,'-V'+label+suffix),xml=content(z,'word/document.xml');
  expect(xml).toContain('<m:f>');
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('w:gridSpan w:val="2"');
  expect(xml).toContain('r:embed=');
  expect(xml).toContain('w:val="TableCell"');
  if(suffix==='-key.docx')expect(xml).toContain('2.25');
  else{
   expect(xml).not.toContain('2.25');
   expect((xml.match(/<w:pStyle w:val="ResponseLine"\/>/g)||[]).length).toBe(3);
  }
 }
});
test('3B.1 page-break safeguards and XML package relationships are structurally valid',async({page})=>{
 const files=await pack(page);
 for(const [filename,data] of Object.entries(files).filter(([name])=>name.endsWith('.docx'))){
  const z=unzipSync(data);
  const styles=content(z,'word/styles.xml'),main=content(z,'word/document.xml'),rels=content(z,'word/_rels/document.xml.rels');
  expect(styles).toContain('<w:keepNext/>');
  expect(styles).toContain('<w:keepLines/>');
  expect(main).toContain('<w:cantSplit/>');
  const all=Object.entries(z).filter(([name])=>name.endsWith('.xml')||name.endsWith('.rels'));
  for(const [name,bytes] of all){
   const errors=await page.evaluate(xml=>new DOMParser().parseFromString(xml,'application/xml').getElementsByTagName('parsererror').length,strFromU8(bytes));
   expect(errors,filename+':'+name).toBe(0);
  }
  for(const part of ['header1.xml','footer1.xml'])expect(rels).toContain('Target="'+part+'"');
 }
});
