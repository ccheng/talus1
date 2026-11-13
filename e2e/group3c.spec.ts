import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strFromU8,unzipSync} from 'fflate';
import {generate} from './fixtures';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const shared='<p>Shared passage for linked items.</p><p><img src="data:image/png;base64,'+png+'" width="96" height="96" alt="Shared plot"></p>'+
 '<table><tbody><tr><td>Shared measurement</td><td>4</td></tr></tbody></table>'+
 '<p>Shared ratio <math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math></p>';
const source='<h1>Grouped science</h1><h2>Section 1: Foundations</h2>'+
 '<p>1. First prompt.</p><p>Answer: Alpha response.</p>'+
 '<p>2. Linked prompt.</p><p>Answer: Beta response.</p>'+
 '<p>3. Outside prompt.</p><p>Answer: Gamma response.</p>';

async function getDownload(page:Page,name:string|RegExp){
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name}).click()]);
 return readFile((await download.path())!);
}
const chooseQuestion=(page:Page,n:number)=>page.locator('.sidebar').getByRole('button',{name:new RegExp('^Question '+n+' ')});
test('3C groups imported children, preserves rich context through save and all exports, and ungroups without loss',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await page.getByLabel('Upload assessment',{exact:true}).setInputFiles({name:'grouped.html',mimeType:'text/html',buffer:Buffer.from(source)});
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.getByLabel('Group through question').selectOption({label:'Question 2'});
 await page.getByRole('button',{name:'Group questions',exact:true}).click();
 const shuffle=page.getByRole('checkbox',{name:'Shuffle questions within this group'});
 await expect(shuffle).not.toBeChecked();
 await page.getByRole('button',{name:'Add or edit shared HTML source'}).click();
 await page.getByLabel('Shared group material HTML source').fill(shared);
 await expect(page.getByRole('textbox',{name:'Shared group material',exact:true}).getByRole('img',{name:'Shared plot',exact:true})).toHaveAttribute('src','data:image/png;base64,'+png);
 await page.getByRole('button',{name:'Include next question'}).click();
 await chooseQuestion(page,3).click();
 await page.getByRole('button',{name:'Move this question out of group'}).click();
 await chooseQuestion(page,2).click();
 await page.getByRole('button',{name:'Copy alternative'}).click();
 const stem=page.getByRole('textbox',{name:'Question stem',exact:true});
 await stem.fill('Linked alternative prompt.');
 const backup=await getDownload(page,'Backup JSON');
 const saved=JSON.parse(backup.toString());
 const group=saved.sections[0].items[0];
 expect(group.kind).toBe('group');
 expect(group.items).toHaveLength(2);
 expect(group.items[1].variants).toHaveLength(2);
 expect(group.sharedHtml).toContain(png);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Question group 1–2'})).toBeVisible();
 await expect(shuffle).not.toBeChecked();
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'grouped.talus.json',mimeType:'application/json',buffer:backup});
 await expect(page.getByText('Imported backup.')).toBeVisible();
 await expect(page.getByLabel('Shared group material HTML source')).toHaveValue(shared);
 await generate(page,6,'3c-group-regression');
 const preview=page.locator('.print-page');
 await expect(preview.getByText('Shared passage for linked items.')).toHaveCount(1);
 await expect(preview.getByRole('img',{name:'Shared plot',exact:true})).toHaveAttribute('src','data:image/png;base64,'+png);
 const word=unzipSync(await getDownload(page,/Word\/DOCX \(ZIP\)/));
 const markdown=unzipSync(await getDownload(page,'Download all versions & keys (ZIP)'));
 const documents=Object.entries(word).filter(([name])=>name.endsWith('.docx'));
 expect(documents).toHaveLength(12);
 for(const [name,bytes] of documents){
  const parts=unzipSync(bytes),xml=strFromU8(parts['word/document.xml']);
  expect(xml.match(/Shared passage for linked items\./g)).toHaveLength(1);
  expect(xml.indexOf('Shared passage for linked items.')).toBeLessThan(xml.indexOf('First prompt.'));
  expect(xml.indexOf('First prompt.')).toBeLessThan(xml.indexOf('Linked '));
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('<m:f>');
  const paragraphs=xml.split('</w:p>');
  for(const anchor of ['Shared passage for linked items.','Shared plot','Shared measurement','Shared ratio']){
   expect(paragraphs.find(paragraph=>paragraph.includes(anchor)),anchor).toContain('<w:keepNext/>');
  }
  expect(Buffer.from(Object.entries(parts).find(([path])=>path.startsWith('word/media/'))![1]).toString('base64')).toBe(png);
  expect(xml.includes('Beta response.')).toBe(name.endsWith('-key.docx'));
 }
 const markdownFiles=Object.entries(markdown).filter(([name])=>name.endsWith('.md'));
 expect(markdownFiles).toHaveLength(12);
 for(const [,bytes] of markdownFiles){
  const text=strFromU8(bytes);
  expect(text.match(/Shared passage for linked items\./g)).toHaveLength(1);
  expect(text).toContain('<mfrac>');
  expect(text).toContain('Shared measurement');
 }
 const generatedBackup=await getDownload(page,'Backup JSON');
 const generation=JSON.parse(generatedBackup.toString()).lastGeneration;
 await page.locator('.header-actions input[type=file]').setInputFiles({
  name:'grouped-with-generation.talus.json',mimeType:'application/json',buffer:generatedBackup
 });
 await expect(page.getByText('Imported backup.')).toBeVisible();
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(preview.getByText('Run ID: '+generation.runId,{exact:true})).toBeVisible();
 const restoredWord=unzipSync(await getDownload(page,/Word\/DOCX \(ZIP\)/));
 expect(restoredWord['generation-manifest.json']).toEqual(word['generation-manifest.json']);
 await page.getByRole('button',{name:'1. Author'}).click();
 await chooseQuestion(page,2).click();
 const ungroup=page.getByRole('button',{name:'Ungroup questions'});
 await expect(ungroup).toBeDisabled();
 await page.getByLabel('Keep shared material in').selectOption({label:'Question 2 (all alternatives)'});
 await ungroup.click();
 const after=JSON.parse((await getDownload(page,'Backup JSON')).toString());
 const items=after.sections[0].items;
 expect(items.map((item:{kind:string})=>item.kind)).toEqual(['slot','slot','slot']);
 expect(items[1].variants).toHaveLength(2);
 for(const alternative of items[1].variants)expect(alternative.stem).toContain(png);
});
