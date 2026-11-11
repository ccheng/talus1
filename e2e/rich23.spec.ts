import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const image='data:image/png;base64,'+PNG;
const maths='<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><mn>9</mn></mrow><mrow><mn>4</mn></mrow></mfrac></math>';
const source='<h1>Lab Diagram and Equation</h1><h2>Section 1: Applications</h2>'+
 '<p>1. Analyze the motion diagram and table, then evaluate the ratio.</p>'+
 '<p><img src="'+image+'" width="288" height="160" alt="Motion plot"></p>'+
 '<table><thead><tr><th>Time (s)</th><th>Distance (m)</th></tr></thead><tbody><tr><td>1</td><td>3</td></tr><tr><td>2</td><td>6</td></tr></tbody></table>'+
 '<p>Calculate '+maths+' and explain.</p><p>Answer: 2.25</p>';
async function upload(page:import('@playwright/test').Page){
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name:'rich-visual.html',mimeType:'text/html',buffer:Buffer.from(source)});
 await expect(page.locator('.import-rendered img')).toHaveCount(1);
 await expect(page.locator('.import-rendered table')).toHaveCount(1);
 await expect(page.locator('.import-rendered math')).toHaveCount(1);
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
}
test('2C.3: teacher edits prose visually while preserving image bytes, table cells and fraction semantics',async({page})=>{
 await upload(page);
 const editor=page.getByRole('textbox',{name:'Question stem',exact:true});
 await expect(editor).toBeVisible();
 await expect(editor.locator('img')).toHaveAttribute('src',image);
 await expect(editor.locator('table')).toHaveCount(1);
 await expect(editor.locator('math mfrac')).toHaveCount(1);
 await editor.locator('p').first().click();
 await page.keyboard.press('End');
 await page.keyboard.type(' Record your calculation.');
 await expect(editor).toContainText('Record your calculation.');
 await expect(editor.locator('math mfrac')).toHaveCount(1);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Backup JSON'}).click();
 const backup=JSON.parse((await readFile(await (await dl).path()!)).toString('utf8'));
 const stem=backup.sections[0].items[0].variants[0].stem as string;
 expect(stem).toContain(image);
 expect(stem).toContain('<table');
 expect(stem).toContain('Distance (m)');
 expect(stem).toContain('<mfrac>');
 expect(stem).toContain('Record your calculation.');
});
test('2C.3: edit table cell visually, resize image without changing data and retain both through JSON restore',async({page})=>{
 await upload(page);
 await page.getByRole('button',{name:'Edit table 1'}).click();
 await page.getByLabel('Table row 2 column 2').fill('3.5');
 await page.getByRole('button',{name:'Done editing table',exact:true}).click();
 await page.getByRole('button',{name:'Edit image 1'}).click();
 await page.getByLabel('Image width in CSS pixels').fill('200');
 await page.getByRole('button',{name:'Apply image size',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true}).locator('img')).toHaveAttribute('width','200');
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Backup JSON'}).click();
 const bytes=await readFile(await (await dl).path()!);
 const saved=JSON.parse(bytes.toString('utf8'));
 const stem=saved.sections[0].items[0].variants[0].stem;
 expect(stem).toContain('3.5');
 expect(stem).toContain(image);
 expect(stem).toContain('width="200"');
 await page.reload();
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'restored-2c3.json',mimeType:'application/json',buffer:bytes});
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true}).locator('img')).toHaveAttribute('width','200');
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true}).locator('table')).toContainText('3.5');
});
test('2C.3: equation is protected from ordinary typing and MathML edit rejects malformed denominator',async({page})=>{
 await upload(page);
 await page.getByRole('button',{name:'Edit equation 1'}).click();
 const input=page.getByLabel('Equation MathML source');
 await expect(input).toHaveValue(/mfrac/);
 await input.fill('<math><mfrac><mn>9</mn><mrow></mrow></mfrac></math>');
 await page.getByRole('button',{name:'Apply equation',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText(/invalid fraction|empty denominator/i);
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true}).locator('math mfrac')).toHaveCount(1);
 await input.fill(maths.replace('<mn>9</mn>','<mn>12</mn>'));
 await page.getByRole('button',{name:'Apply equation',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true}).locator('math')).toContainText('12');
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page math')).toContainText('12');
});
test('2C.3: review pane visual editing preserves media before accepting import',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name:'rich-visual.html',mimeType:'text/html',buffer:Buffer.from(source)});
 const review=page.getByRole('textbox',{name:'Review question prompt visually',exact:true});
 await expect(review).toBeVisible();
 await expect(review.locator('img')).toHaveCount(1);
 await expect(review.locator('table')).toHaveCount(1);
 await expect(review.locator('math')).toHaveCount(1);
 await review.locator('p').first().click();
 await page.keyboard.press('End');await page.keyboard.type(' Explain in detail.');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true})).toContainText('Explain in detail.');
 await expect(page.getByRole('textbox',{name:'Question stem',exact:true}).locator('img')).toHaveCount(1);
});


test('2C.3: review table-cell edit is retained after acceptance and generated student export',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name:'review-table.html',mimeType:'text/html',buffer:Buffer.from(source)});
 await page.getByRole('button',{name:'Edit table 1'}).click();
 await page.getByLabel('Table row 2 column 2').fill('3.75');
 await page.getByRole('button',{name:'Done editing table',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Review question prompt visually',exact:true}).locator('table')).toContainText('3.75');
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page table')).toContainText('3.75');
 await expect(page.locator('.print-page math mfrac')).toHaveCount(1);
});

test('2C.3: scientific answer choice remains visually editable through review, authoring and export',async({page})=>{
 const choiceDoc='<h1>Choice Equation Lab</h1><h2>Section 1: Applications</h2>'+
 '<p>Instructions: Choose the mathematically equivalent expression 10².</p>'+
 '<p>1. Which formula gives the squared term?</p>'+
 '<p>A. '+maths+'</p><p>B. 9</p><p>Answer: A</p>';
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name:'choice-equation.html',mimeType:'text/html',buffer:Buffer.from(choiceDoc)});
 const choiceEditor=page.getByRole('textbox',{name:'Review choice A visually',exact:true});
 await expect(choiceEditor.locator('math mfrac')).toHaveCount(1);
 await choiceEditor.locator('math').click();
 await expect(page.locator('.import-review .panel-heading')).toContainText('0 warnings');
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page math mfrac')).toHaveCount(1);
 const dl=page.waitForEvent('download');
 await page.getByRole('button',{name:'Student Markdown'}).click();
 const md=await readFile(await (await dl).path()!,'utf8');
 expect(md).toContain('<mfrac>');
});
