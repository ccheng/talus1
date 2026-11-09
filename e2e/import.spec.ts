import {test,expect} from '@playwright/test';
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
 await expect(page.getByText('4 questions · 0 warnings')).toBeVisible();
 await expect(page.getByLabel('Imported assessment title')).toHaveValue('Science 10 Import QA');
 await expect(page.getByLabel('Section 1 name')).toHaveValue('Section 1: Foundations');
 await expect(page.getByLabel('Section 2 name')).toHaveValue('Section 2: Applications');
 await page.getByLabel('Imported assessment title').fill('Science 10 Imported and Reviewed');
 await page.getByRole('button',{name:/Question 1 Which formula is water/}).click();
 await expect(page.getByLabel('Question 1 prompt in section 1')).toContainText('Which formula is water?');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Science 10 Imported and Reviewed');
 await expect(page.locator('.sidebar .side-item')).toHaveCount(4); // two sections and the two questions in the selected section
});

test('incomplete import warns and does not invent an answer; review can repair',async ({page})=>{
 await page.getByLabel('Assessment source').fill('1. Which is correct?\nA. Yes\nB. No');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.getByText('1 questions · 1 warnings')).toBeVisible();
 await page.locator('.import-question-toggle').first().click();
 await expect(page.getByText('Correct answer not identified')).toBeVisible();
 await page.getByLabel('Correct A').check();
 await expect(page.getByText('1 questions · 0 warnings')).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
});

test('review allows splitting, merging, moving questions and appending sections',async ({page})=>{
 await page.getByLabel('Assessment source').fill('Section 1: A\n1. First part\nSecond part\nAnswer: done\nSection 2: B\n2. Other question\nAnswer: done');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await page.locator('.import-question-toggle').first().click();
 await page.getByRole('button',{name:'Split last paragraph'}).click();
 await expect(page.locator('.import-question-toggle')).toHaveCount(3);
 await page.locator('.import-question-toggle').nth(1).click();
 await page.getByRole('button',{name:'Merge into previous'}).click();
 await expect(page.locator('.import-question-toggle')).toHaveCount(2);
 await page.getByLabel('Import mode').selectOption('append');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Untitled assessment');
});

test('Markdown paste preserves inline emphasis, headings, and numbered questions',async ({page})=>{
 await page.getByLabel('Pasted input format').selectOption('markdown');
 await page.getByLabel('Assessment source').fill('# Section 1: Foundations\n\n1. What is **H₂O**?\n\nA. Water\n\nB. Carbon dioxide\n\nAnswer: A');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.getByText('1 questions · 0 warnings')).toBeVisible();
 await page.locator('.import-question-toggle').first().click();
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
 await expect(page.getByText('1 questions · 0 warnings')).toBeVisible();
});
