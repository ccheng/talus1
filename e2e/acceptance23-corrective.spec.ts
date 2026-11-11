import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const img='data:image/png;base64,'+PNG;
const eq='<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><mn>9</mn></mrow><mrow><mn>4</mn></mrow></mfrac></math>';
const source='<h1>2C.3 Work Evidence Regressions</h1><h2>Section 1: Applications</h2>'+
 '<p>1. MIX-AFTER. Compute v = '+eq+' and use E12A.</p>'+
 '<p><img src="'+img+'" width="288" height="160" alt="Motion"></p>'+
 '<table><tr><th>Parameter</th><th>Value</th><th>Photo</th></tr>'+
 '<tr><td><strong>H<sub>2</sub>O ratio</strong> '+eq+'</td><td>14.250</td><td><img src="'+img+'" width="96" height="64"></td></tr>'+
 '</table><p>Answer: 2.25 m/s.</p>';
async function open(page:import('@playwright/test').Page){
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name:'2c3-work-evidence.html',mimeType:'text/html',buffer:Buffer.from(source)});
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
}
async function backup(page:import('@playwright/test').Page){
 const dl=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 return JSON.parse((await readFile(await (await dl).path()!)).toString('utf8'));
}
test('2C3-01: Backspace at trailing text never deletes earlier inline equation',async({page})=>{
 await open(page);
 const ed=page.getByRole('textbox',{name:'Question stem',exact:true});
 const original=await ed.locator('math').count();
 const p=ed.locator('p').first();
 await p.click();await page.keyboard.press('End');await page.keyboard.press('Backspace');
 expect(await ed.locator('math').count()).toBe(original);
 expect((await backup(page)).sections[0].items[0].variants[0].stem).toContain('<mfrac>');
});
test('2C3-02: table cell append preserves equation, chemistry subscript and image pixels',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'Edit table 1'}).click();
 const rich=page.getByLabel('Table row 2 column 1');
 const old=await rich.inputValue();
 await rich.fill(old+'.');
 await page.getByLabel('Table row 2 column 3').fill('Cart photograph');
 await page.getByRole('button',{name:'Done editing table',exact:true}).click();
 const data=(await backup(page)).sections[0].items[0].variants[0].stem as string;
 expect(data).toContain('<mfrac>');
 expect(data).toContain('<sub>2</sub>');
 expect(data).toContain(img);
 expect(data).toContain('Cart photograph');
});
test('2C3-03: rootless MathML is a non-dismissible generation blocker after JSON restore',async({page})=>{
 await open(page);
 const advanced=page.getByLabel('Question stem HTML source');
 await advanced.fill((await advanced.inputValue())+'<mfrac><mn>19</mn><mn>2</mn></mfrac>');
 const generate=page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true});
 await expect(generate).toBeDisabled();
 const saved=await backup(page);
 await page.reload();
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'bad-math.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await expect(generate).toBeDisabled();
});
test('2C3-04: typing a baseline word after a superscript never extends the exponent',async({page})=>{
 const html='<h1>Scientific Key</h1><h2>Section 1: Applications</h2><p>1. How many particles?</p><p>Answer: 6.02 × 10<sup>23</sup></p>';
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name:'physics-script.html',mimeType:'text/html',buffer:Buffer.from(html)});
 const review=page.getByRole('textbox',{name:'Review reference answer visually',exact:true});
 await review.locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type(' particles');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Accept reviewed import'}).click();
 const saved=(await backup(page)).sections[0].items[0].variants[0].referenceAnswer as string;
 expect(saved).toMatch(/<sup>23<\/sup>\s*particles/);
 expect(saved).not.toMatch(/<sup>23 particles<\/sup>/);
});
test('2C3-05: switching between written and short responses preserves rich reference HTML',async({page})=>{
 await open(page);
 // Restore a written variant to exercise the compatible transition.
 const raw=await backup(page);const v=raw.sections[0].items[0].variants[0];
 v.type='writtenResponse';v.referenceAnswer='<p><math><mn>5</mn></math> m/s</p>';
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'written.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
 const type=page.locator('.editor-area select').first();
 await type.selectOption('shortAnswer');
 expect((await backup(page)).sections[0].items[0].variants[0].referenceAnswer).toContain('<math>');
 await type.selectOption('writtenResponse');
 expect((await backup(page)).sections[0].items[0].variants[0].referenceAnswer).toContain('m/s');
});
test('2C3-06: resized standalone images retain explicit dimensions in Markdown',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'Edit image 1'}).click();
 await page.getByLabel('Image width in CSS pixels').fill('224');
 await page.getByRole('button',{name:'Apply image size',exact:true}).click();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Student Markdown'}).click();
 const text=await readFile(await (await dl).path()!,'utf8');
 expect(text).toMatch(/<img[^>]*width="224"/);
 expect(text).toContain(img);
});
test('2C3-07: invalid rowspan/colspan cannot be generated',async({page})=>{
 await open(page);const advanced=page.getByLabel('Question stem HTML source');
 await advanced.fill((await advanced.inputValue())+'<table><tr><td rowspan="99" colspan="0">invalid</td></tr></table>');
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
});
test('2C3-08: script and event markup cannot leak into student Markdown or stored assessment',async({page})=>{
 await open(page);const advanced=page.getByLabel('Question stem HTML source');
 await advanced.fill((await advanced.inputValue())+'<script>document.body.setAttribute("data-qa","leak")</script><p onmouseover="window.leak=1">safe</p>');
 const raw=await backup(page);
 expect(JSON.stringify(raw)).not.toContain('document.body.setAttribute');
 expect(JSON.stringify(raw)).not.toContain('onmouseover');
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Student Markdown'}).click();
 const md=await readFile(await (await dl).path()!,'utf8');
 expect(md).not.toContain('document.body.setAttribute');
});
