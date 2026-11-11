import {test,expect} from '@playwright/test';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import {readFile} from 'node:fs/promises';
const p=(x:string)=>'<w:p><w:r><w:t>'+x+'</w:t></w:r></w:p>';
const run=(x:string,kind?:'subscript'|'superscript')=>'<w:r>'+(kind?'<w:rPr><w:vertAlign w:val="'+kind+'"/></w:rPr>':'')+'<w:t>'+x+'</w:t></w:r>';
const eq=(inner:string)=>'<m:oMath>'+inner+'</m:oMath>';
const mr=(x:string)=>'<m:r><m:t>'+x+'</m:t></m:r>';
const frac='<m:f><m:num>'+mr('a')+'</m:num><m:den>'+mr('b')+'</m:den></m:f>';
const power='<m:sSup><m:e>'+mr('x')+'</m:e><m:sup>'+mr('2')+'</m:sup></m:sSup>';
function docx(body:string):Buffer{
 const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>'+body+'</w:body></w:document>';
 const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 return Buffer.from(zipSync({'[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rels),'word/document.xml':strToU8(document)}));
}
const SCIENCE=docx(
 p('Science 10 Notation and Equations')+p('Section 1: Applications')+
 '<w:p>'+run('1. Simplify the fraction ')+eq(frac)+run(' and the power ')+eq(power)+run('.')+'</w:p>'+
 p('Answer: a/b and x squared')+
 '<w:p>'+run('2. Explain the formulas H')+run('2','subscript')+run('O and Mg')+run('2+','superscript')+
 run(' with ΔE = 6.02 × 10')+run('23','superscript')+run(' mol⁻¹.')+'</w:p>'+
 p('Answer: Water and magnesium ion; a power of ten.')
);
const UNKNOWN=docx(
 p('Advanced Equations')+p('Section 1: Transfer')+
 '<w:p>'+run('1. Evaluate ')+eq('<m:box><m:e>'+mr('z')+'</m:e></m:box>')+'</w:p>'+
 p('Answer: The result depends on z.')
);
async function upload(page:import('@playwright/test').Page,name:string,file:Buffer){
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:file});
}
test('2C.2 Word OMML fractions/powers and styled scientific symbols survive six versions, Markdown, backup and restore',async({page})=>{
 await upload(page,'science-math.docx',SCIENCE);
 await expect(page.locator('.import-question-toggle')).toHaveCount(2);
 await expect(page.locator('.import-rendered math')).toHaveCount(2);
 await expect(page.locator('.import-rendered mfrac')).toHaveCount(1);
 await expect(page.locator('.import-rendered msup')).toHaveCount(1);
 await page.locator('.import-question-toggle').last().click();
 await expect(page.locator('.import-rendered sub')).toContainText('2');
 await expect(page.locator('.import-rendered sup')).toContainText('2+');
 await expect(page.locator('.import-rendered')).toContainText('ΔE');
 await expect(page.locator('.import-review .panel-heading span')).toContainText('0 warnings');
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await expect(page.locator('.rich-media-preview math')).toHaveCount(2);
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const backup=await readFile(await (await download).path()!);
 const saved=JSON.parse(backup.toString('utf8'));
 expect(JSON.stringify(saved)).toContain('<mfrac>');
 expect(JSON.stringify(saved)).toContain('<msup>');
 expect(JSON.stringify(saved)).toContain('<sub>2</sub>');
 expect(JSON.stringify(saved)).toContain('<sup>2+</sup>');
 await page.locator('.rightbar').getByLabel('Number of versions').fill('6');
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const zip=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download all versions & keys (ZIP)'}).click();
 const contents=unzipSync(new Uint8Array(await readFile(await (await zip).path()!)));
 const files=Object.entries(contents).filter(([name])=>name.endsWith('.md'));
 expect(files).toHaveLength(12);
 for(const [,bytes] of files){
  const text=strFromU8(bytes);
  expect(text).toContain('<math');
  expect(text).toContain('<mfrac>');
  expect(text).toContain('<msup>');
  expect(text).toContain('ΔE');
  expect(text).toContain('H~2~O');
  expect(text).toContain('Mg^2+^');
 }
 await page.reload();
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'science-math-restored.json',mimeType:'application/json',buffer:backup});
 await expect(page.locator('.rich-media-preview math')).toHaveCount(2);
 await expect(page.getByText('Validation: Ready')).toBeVisible();
});

test('2C.2 unsupported Word equation structure produces persistent blocking warning, never silent disappearance',async({page})=>{
 await upload(page,'unsupported-math.docx',UNKNOWN);
 await expect(page.locator('.import-warnings')).toContainText(/Unsupported Word equation structure/i);
 await expect(page.locator('.import-rendered')).toContainText('Word equation requires manual review');
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
 const event=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const saved=JSON.parse((await readFile(await (await event).path()!)).toString('utf8'));
 expect(saved.importWarnings.join(' ')).toMatch(/Unsupported Word equation structure/i);
});
