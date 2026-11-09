import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strToU8,zipSync} from 'fflate';

const source=`Title: Science 10 Import QA
Section 1: Foundations
1. Which formula is water? (1 mark)
A. H2O
B. CO2
C. NaCl
Answer: A
2. Explain why velocity differs from speed. (3 marks)
Answer: Velocity includes direction.
Section 2: Applications
3. A cart travels 12 m in 3 s. Calculate its speed. (2 marks)
Answer: 4 m/s
4. Which represent chemical changes? (2 marks)
A. A precipitate forms
B. Ice melts
C. A gas forms
Answer: A, C`;

test.beforeEach(async ({page})=>{
 await page.goto('./');
 await expect(page.getByRole('heading',{name:'Assessment',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Import assessment'}).click();
 await expect(page.getByRole('heading',{name:'Import an existing assessment'})).toBeVisible();
});

test('paste → parse → edit review → accept → generate → save and refresh',async ({page})=>{
 await page.getByLabel('Assessment source').fill(source);
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.locator('.import-review .panel-heading span')).toContainText('4 questions');
 await expect(page.getByLabel('Imported assessment title')).toHaveValue('Science 10 Import QA');
 await expect(page.getByLabel('Section 1 name')).toHaveValue('Section 1: Foundations');
 await expect(page.getByLabel('Section 2 name')).toHaveValue('Section 2: Applications');
 await page.getByLabel('Imported assessment title').fill('Science 10 Imported and Reviewed');
 await expect(page.getByLabel('Question 1 prompt in section 1')).toHaveValue(/Which formula is water/);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Science 10 Imported and Reviewed');
 await expect(page.locator('.sidebar .side-item')).toHaveCount(4);
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.getByRole('option',{name:'Version C'})).toHaveCount(1);
 await expect(page.locator('.print-page > section')).toHaveCount(2);
 await expect(page.locator('.print-question')).toHaveCount(4);
 await page.getByLabel('Answer key',{exact:true}).check();
 await expect(page.locator('.key')).toHaveCount(4);
 await page.reload();
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(page.locator('.print-question')).toHaveCount(4);
 await page.getByRole('button',{name:'1. Author'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Science 10 Imported and Reviewed');
});

test('incomplete import warns and does not invent an answer; review can repair',async ({page})=>{
 await page.getByLabel('Assessment source').fill('1. Which is correct?\nA. Yes\nB. No');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.locator('.import-review .panel-heading span')).toContainText('1 questions');
 await expect(page.locator('.import-question-warnings')).toContainText('Correct answer not identified');
 await page.getByLabel('Correct A').check();
 await expect(page.locator('.import-review .panel-heading span')).toContainText('0 warnings');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
});

test('review allows splitting, merging, moving questions and appending sections',async ({page})=>{
 await page.getByLabel('Assessment source').fill('Section 1: A\n1. First part\nSecond part\nAnswer: done\nSection 2: B\n2. Other question\nAnswer: done');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await page.getByRole('button',{name:'Split last paragraph'}).click();
 await expect(page.locator('.import-question-toggle')).toHaveCount(3);
 await page.getByRole('button',{name:'Merge into previous'}).click();
 await expect(page.locator('.import-question-toggle')).toHaveCount(2);
 await page.getByLabel('Import mode').selectOption('append');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Untitled assessment');
});

test('review can reassign a question to a different proficiency section without losing slots',async ({page})=>{
 await page.getByLabel('Assessment source').fill(source);
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await page.getByLabel('Move question 1 to section').selectOption({label:'Section 2: Applications'});
 await expect(page.locator('.import-section').nth(0).locator('.import-question-toggle')).toHaveCount(1);
 await expect(page.locator('.import-section').nth(1).locator('.import-question-toggle')).toHaveCount(3);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const contents=JSON.parse(await readFile(await (await downloaded).path()!,'utf8'));
 expect(contents.sections.map((s:{items:unknown[]})=>s.items.length)).toEqual([1,3]);
});

test('Markdown paste preserves inline emphasis, headings, and numbered questions',async ({page})=>{
 await page.getByLabel('Pasted input format').selectOption('markdown');
 await page.getByLabel('Assessment source').fill('# Section 1: Foundations\n\n1. What is **H₂O**?\n\nA. Water\n\nB. Carbon dioxide\n\nAnswer: A');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.getByText('1 questions · 0 warnings')).toBeVisible();
 await expect(page.locator('.import-rendered strong')).toHaveText('H₂O');
});

test('Word DOCX upload is converted in browser to reviewable sections and questions',async ({page})=>{
 const body=[
  ['Section 1: Foundations','Heading1'],
  ['1. Which formula is water?','Normal'],
  ['A. H2O','Normal'],
  ['B. CO2','Normal'],
  ['Answer: A','Normal']
 ].map(([line,style])=>'<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr><w:r><w:t>'+line+'</w:t></w:r></w:p>').join('');
 const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>';
 const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 const bytes=zipSync({'[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rels),'word/document.xml':strToU8(doc)});
 await page.getByLabel('Upload assessment').setInputFiles({name:'science10.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(bytes)});
 await expect(page.getByLabel('Imported assessment title')).toHaveValue('science10');
 await expect(page.locator('.import-question-toggle')).toHaveCount(1);
 await expect(page.locator('.import-review .panel-heading span')).toContainText('1 questions');
});
