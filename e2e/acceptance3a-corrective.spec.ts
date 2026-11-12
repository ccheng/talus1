import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
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
async function batch(page:Page,input=master){
 await page.goto('./');page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'independent-3a.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 return downloadWordBatch(page);
}
async function downloadWordBatch(page:Page){
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
async function inspectLab(page:Page, parts:Record<string,Uint8Array>){
 const documentXml=strFromU8(parts['word/document.xml']);
 const relationshipsXml=strFromU8(parts['word/_rels/document.xml.rels']);
 const result=await page.evaluate(({documentXml,relationshipsXml})=>{
  const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const m='http://schemas.openxmlformats.org/officeDocument/2006/math';
  const a='http://schemas.openxmlformats.org/drawingml/2006/main';
  const r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parser=new DOMParser();
  const doc=parser.parseFromString(documentXml,'application/xml');
  const rels=parser.parseFromString(relationshipsXml,'application/xml');
  const children=(e:Element|undefined,ns:string,name:string)=>
   Array.from(e?.children??[]).filter(n=>n.namespaceURI===ns&&n.localName===name);
  const tables=Array.from(doc.getElementsByTagNameNS(w,'tbl'));
  const lab=tables.find(t=>t.textContent?.includes('Instrument'));
  const rows=children(lab,w,'tr').map(row=>children(row,w,'tc'));
  const cells=rows.map(row=>row.map(cell=>Array.from(cell.getElementsByTagNameNS(w,'t')).map(t=>t.textContent).join('')));
  const drawings=rows.map(row=>row.map(cell=>cell.getElementsByTagNameNS(w,'drawing').length));
  const embed=rows[1]?.[2]?.getElementsByTagNameNS(a,'blip')[0]?.getAttributeNS(r,'embed');
  const target=Array.from(rels.getElementsByTagNameNS('*','Relationship')).find(rel=>rel.getAttribute('Id')===embed)?.getAttribute('Target');
  const sums=Array.from(doc.getElementsByTagNameNS(m,'nary')).map(n=>({
   operand:children(n,m,'e')[0]?.textContent,
   lower:children(n,m,'sub')[0]?.textContent,
   upper:children(n,m,'sup')[0]?.textContent,
   detached:n.nextElementSibling?.namespaceURI===m&&n.nextElementSibling.localName==='r'&&n.nextElementSibling.textContent==='k',
  }));
  return {cells,drawings,target,sums,alternate:doc.documentElement.textContent?.includes('QA Lab alternate:')};
 },{documentXml,relationshipsXml});
 expect(result.cells).toEqual([
  ['Time (s)','Position (m)','Instrument'],
  ['2','8',''],
  ['5','20','Laser'],
 ]);
 expect(result.drawings).toEqual([[0,0,0],[0,0,1],[0,0,0]]);
 expect(result.sums).toEqual([{operand:'k',lower:'k=1',upper:'4',detached:false}]);
 expect(result.target).toMatch(/^media\//);
 const image=parts['word/'+result.target];
 expect(image).toBeDefined();
 return {image:Buffer.from(image),alternate:result.alternate};
}

test('3A original Word fixture: native sum and exact Lab cells and image survive in every version',async({page})=>{
 const fixture=fileURLToPath(new URL('./fixtures/Science-Rich-Editing.docx',import.meta.url));
 const source=await inspectLab(page,unzipSync(new Uint8Array(await readFile(fixture))));
 await page.goto('./');
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await page.getByLabel('Upload assessment',{exact:true}).setInputFiles(fixture);
 await expect(page.getByRole('textbox',{name:'Imported assessment title'})).toHaveValue('Talus Rich Content Acceptance');
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await page.getByRole('button',{name:/^Section 4: Lab Analysis/}).click();
 await page.getByRole('button',{name:'+ Copy alternative',exact:true}).click();
 const stem=page.getByRole('textbox',{name:'Question stem',exact:true});
 await stem.press('Control+Home');
 await stem.pressSequentially('QA Lab alternate: ');
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.getByRole('spinbutton',{name:'Number of versions',exact:true}).fill('6');
 await page.getByRole('button',{name:'Generate',exact:true}).click();
 const pack=await downloadWordBatch(page);
 const editedVersions:string[]=[];
 for(const label of 'ABCDEF'){
  const pair=[];
  for(const suffix of ['.docx','-key.docx']){
   const name=Object.keys(pack).find(n=>n.endsWith('-V'+label+suffix));
   expect(name).toBeDefined();
   const actual=await inspectLab(page,unzipSync(pack[name!]));
   expect(actual.image.equals(source.image),name).toBe(true);
   pair.push(actual.alternate);
  }
  expect(pair[1]).toBe(pair[0]);
  if(pair[0])editedVersions.push(label);
 }
 expect(editedVersions).toHaveLength(3);
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
