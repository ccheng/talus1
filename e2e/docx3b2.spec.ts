import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';

const fixture=fileURLToPath(new URL('./fixtures/3b1-original-run.json',import.meta.url));
async function exported(page:import('@playwright/test').Page){
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
 return unzipSync(new Uint8Array(await readFile(await(await download).path()!)));
}
function xml(zip:Record<string,Uint8Array>,label:'A'|'F'='A',key=false,part='word/document.xml'){
 const filename=Object.keys(zip).find(n=>n.endsWith('-V'+label+(key?'-key':'')+'.docx'));
 expect(filename).toBeTruthy();
 const doc=unzipSync(zip[filename!]);return strFromU8(doc[part]);
}
async function setup(page:import('@playwright/test').Page){
 await page.goto('./');
 page.on('dialog',d=>d.accept());
 await page.locator('.header-actions input[type=file]').setInputFiles(fixture);
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.getByRole('button',{name:/Versions & answer keys/}).click();
 await expect(page.getByText('Run ID: 1pslge1',{exact:true})).toBeVisible();
}
test('3B.2 defaults do not change the validated 3B.1 layout or 12 DOCX batch',async({page})=>{
 await setup(page);
 const zip=await exported(page);
 expect(Object.keys(zip).filter(n=>n.endsWith('.docx'))).toHaveLength(12);
 const doc=xml(zip);
 const style=xml(zip,'A',false,'word/styles.xml');
 expect(doc).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
 expect(doc).toContain('<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"');
 expect(style).toContain('<w:sz w:val="22"/>');
 expect(style).toContain('<w:spacing w:line="276"');
 expect(doc).toContain('<w:headerReference w:type="default"');
 expect(doc).toContain('<w:footerReference w:type="default"');
});
test('3B.2 customization affects all Word versions, not keys, question order or run identifiers',async({page})=>{
 await setup(page);
 const original=await exported(page);
 await page.getByLabel('Word paper size').selectOption('a4');
 await page.getByLabel('Word margins').selectOption('0.75');
 await page.getByLabel('Word font size').selectOption('12');
 await page.getByLabel('Word line spacing').selectOption('1.5');
 await page.getByLabel('Word response group size').selectOption('2');
 await page.getByLabel('Word new page for each section').check();
 await page.getByLabel('Word running header').uncheck();
 await page.getByLabel('Word page numbers').uncheck();
 await page.reload();
 await expect(page.getByLabel('Word paper size')).toHaveValue('a4');
 await expect(page.getByLabel('Word response group size')).toHaveValue('2');
 await expect(page.getByText('Run ID: 1pslge1',{exact:true})).toBeVisible();
 const changed=await exported(page);
 expect(Object.keys(changed).filter(n=>n.endsWith('.docx'))).toHaveLength(12);
 for(const label of 'ABCDEF')for(const key of [false,true]){
  const main=xml(changed,label as 'A'|'F',key),style=xml(changed,label as 'A'|'F',key,'word/styles.xml');
  expect(main).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
  expect(main).toContain('<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"');
  expect(main).not.toContain('<w:headerReference');
  expect(main).not.toContain('<w:footerReference');
  expect(style).toContain('<w:sz w:val="24"/>');
  expect(style).toContain('<w:spacing w:line="360"');
  expect((main.match(/<w:pageBreakBefore\/>/g)||[]).length).toBe(4);
  expect((main.match(/<w:pStyle w:val="Continuation"\/>/g)||[]).length)
   .toBe((xml(original,label as 'A'|'F',key).match(/<w:pStyle w:val="Continuation"\/>/g)||[]).length);
  expect((main.match(/<m:f>/g)||[]).length).toBe((xml(original,label as 'A'|'F',key).match(/<m:f>/g)||[]).length);
  expect((main.match(/<w:tbl>/g)||[]).length).toBe((xml(original,label as 'A'|'F',key).match(/<w:tbl>/g)||[]).length);
  expect(main).toContain('Run ID: 1pslge1');
  if(!key)expect((main.match(/<w:pStyle w:val="ResponseLine"\/>/g)||[]).length).toBe(74);
 }
 const manifest=strFromU8(changed['generation-manifest.json']);
 expect(manifest).toContain('"paper": "a4"');
 expect(manifest).toContain('"runId": "1pslge1"');
 await page.getByRole('button',{name:'Restore professional defaults'}).click();
 const restored=await exported(page);
 expect(xml(restored)).toBe(xml(original));
});
test('3B.2 settings survive JSON backup and restore without regenerating existing versions',async({page})=>{
 await setup(page);
 await page.getByLabel('Word margins').selectOption('1.25');
 await page.getByLabel('Word response group size').selectOption('6');
 const backup=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const file=await backup,buffer=await readFile((await file.path())!);
 const parsed=JSON.parse(buffer.toString());
 expect(parsed.wordLayout.marginInches).toBe(1.25);
 expect(parsed.wordLayout.responseLinesPerGroup).toBe(6);
 expect(parsed.lastGeneration.runId).toBe('1pslge1');
 await page.getByRole('button',{name:'New test'}).click();
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'restore.talus.json',mimeType:'application/json',buffer});
 await page.getByRole('button',{name:/Versions & answer keys/}).click();
 await expect(page.getByLabel('Word margins')).toHaveValue('1.25');
 await expect(page.getByLabel('Word response group size')).toHaveValue('6');
 await expect(page.getByText('Run ID: 1pslge1',{exact:true})).toBeVisible();
});
