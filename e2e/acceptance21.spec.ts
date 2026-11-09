import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';

async function openImport(page:Page){
 await page.goto('./');
 await expect(page.getByRole('heading',{name:'Assessment',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Import assessment'}).click();
}
async function parsePlain(page:Page,source:string){
 await openImport(page);
 await page.getByLabel('Assessment source').fill(source);
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
}
async function accept(page:Page){
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toBeVisible();
}
async function backup(page:Page){
 const event=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 return JSON.parse(await readFile(await (await event).path()!,'utf8'));
}
function docx(paras:{text:string;style?:string;italic?:boolean}[]):Uint8Array{
 const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
 const body=paras.map(p=>'<w:p><w:pPr>'+(p.style?'<w:pStyle w:val="'+p.style+'"/>':'')+'</w:pPr><w:r><w:rPr>'+(p.italic?'<w:i/>':'')+'</w:rPr><w:t>'+esc(p.text)+'</w:t></w:r></w:p>').join('');
 const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>';
 const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 return zipSync({'[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rels),'word/document.xml':strToU8(doc)});
}
test('P0 malformed MC retains blank choice, unmatched D, and blocks invalid key generation',async ({page})=>{
 await parsePlain(page,'Section 1: Applications\n1. Which object has the highest speed?\nA. A cart moving at 2 m/s\nB.\nAnswer: D');
 await expect(page.locator('.import-question-toggle')).toHaveCount(1);
 await expect(page.getByLabel('Choice A',{exact:true})).toHaveValue('A cart moving at 2 m/s');
 await expect(page.getByLabel('Choice B',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Question 1 type in section 1')).toHaveValue('singleChoice');
 await expect(page.locator('.import-question-warnings')).toContainText('Blank answer choice');
 await expect(page.locator('.import-question-warnings')).toContainText('does not match');
 await accept(page);
 const master=await backup(page),v=master.sections[0].items[0].variants[0];
 expect(v.choices).toHaveLength(2);
 expect(v.correctChoiceIds).toHaveLength(0);
 expect(v.referenceAnswer).toBe('');
 expect(v.importWarnings.length).toBeGreaterThan(0);
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
});

test('P1 Word separate answer key attaches to exactly four source questions',async ({page})=>{
 await openImport(page);
 const paras=[
 {text:'Science 10 Motion Assessment',style:'Title'},
 {text:'Show your work and include SI units.'},
 {text:'Section 1: Foundations (Base)',style:'Heading1'},
 {text:'Choose the best answer for each multiple-choice question.'},
 {text:'1. Which SI unit measures acceleration?'},
 {text:'A. m'},{text:'B. s'},{text:'C. m/s²'},{text:'D. m/s'},
 {text:'2. A cart travels 12 m in 3 s. Calculate its average speed.'},
 {text:'Section 2: Applications (Proficient)',style:'Heading1'},
 {text:'3. What does the area under a velocity-time graph represent?'},
 {text:'A. Acceleration'},{text:'B. Displacement'},{text:'C. Time'},{text:'D. Force'},
 {text:'Section 3: Transfer (Exemplary)',style:'Heading1'},
 {text:'4. A runner travels 12 m east, then 6 m west. Calculate the displacement.'},
 {text:'Answer Key',style:'Heading1'},
 {text:'1. C'},{text:'2. 4 m/s'},{text:'3. B'},{text:'4. 6 m east'}
 ];
 await page.getByLabel('Upload assessment').setInputFiles({name:'motion.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docx(paras))});
 await expect(page.locator('.import-question-toggle')).toHaveCount(4);
 await expect(page.locator('.import-section')).toHaveCount(3);
 await expect(page.getByLabel('Imported assessment title')).toHaveValue('Science 10 Motion Assessment');
 await expect(page.locator('.import-warnings')).not.toContainText('Style ID: Title');
 await expect(page.locator('.import-warnings')).not.toContainText('ID Title was referenced');
 await expect(page.locator('.import-warnings')).toContainText('Heading1');
 await expect(page.getByText(/Unrecognised paragraph style.*Title/)).toHaveCount(0);
 await accept(page);
 const master=await backup(page);
 expect(master.sections).toHaveLength(3);
 expect(master.instructions).toContain('Show your work');
 const v=master.sections.flatMap((s:{items:{variants:unknown[]}[]})=>s.items.map(i=>i.variants[0])) as any[];
 expect(v).toHaveLength(4);
 expect(v[0].choices.map((c:{html:string})=>c.html.replace(/<[^>]+>/g,''))).toEqual(['m','s','m/s²','m/s']);
 expect(v[2].choices.map((c:{html:string})=>c.html.replace(/<[^>]+>/g,''))).toEqual(['Acceleration','Displacement','Time','Force']);
 expect(v[0].correctChoiceIds).toEqual([v[0].choices[2].id]);
 expect(v[2].correctChoiceIds).toEqual([v[2].choices[1].id]);
 expect(v[1].referenceAnswer).toContain('4 m/s');
 expect(v[3].referenceAnswer).toContain('6 m east');
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-question')).toHaveCount(4);
 const d=page.waitForEvent('download');
 await page.getByRole('button',{name:'Student Markdown'}).click();
 const markdown=await readFile(await (await d).path()!,'utf8');
 expect(markdown).not.toContain('Answer Key');
 expect(markdown).not.toContain('**Answer:**');
});

test('P2 Word italic question prefix is removed without removing emphasis',async ({page})=>{
 await openImport(page);
 const paras=[
 {text:'Science 10 Forces Quiz',style:'Title'},
 {text:'Section 1: Proficient',style:'Heading1'},
 {text:'12. A 4 kg cart accelerates at 3 m/s². Find net force.'},
 {text:'Answer: 12 N'},
 {text:'12) Explain why mass and weight differ.',italic:true},
 {text:'Answer: Mass is constant but weight depends on gravity.'}
 ];
 await page.getByLabel('Upload assessment').setInputFiles({name:'irregular.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docx(paras))});
 await expect(page.locator('.import-question-toggle')).toHaveCount(2);
 await page.locator('.import-question-toggle').nth(1).click();
 const prompt=await page.getByLabel('Question 2 prompt in section 1').inputValue();
 expect(prompt).toContain('<em>Explain why mass and weight differ.</em>');
 expect(prompt).not.toContain('12)');
});

const chemistry=[
 '# Science 10 Chemical Reactions',
 'Read **every question** and show *all work*.',
 '## Section 1: Foundations (Base)',
 '1. Which formula represents **water**?',
 'A. H<sub>2</sub>O','B. CO<sub>2</sub>','C. O<sub>2</sub>','D. NaCl','Answer: A',
 '2. State the charge of the ion Mg<sup>2+</sup>. Explain *why*.',
 '- Refer to electrons.','- Use the sign in your answer.',
 'Answer: Positive two. Magnesium has lost two electrons.',
 '## Section 2: Applications (Proficient)',
 '3. In the closed flask, what is the total mass after the reaction?',
 'A. 80 g','B. 100 g','C. 120 g','D. Cannot be determined','Answer: B'
].join('\n');

for(const mode of ['compact-paste','spaced-paste','markdown-upload'] as const){
 test('P1 compact chemistry Markdown '+mode+' retains all student content and keys',async ({page})=>{
  await openImport(page);
  if(mode==='markdown-upload'){
   await page.getByLabel('Upload assessment').setInputFiles({name:'chemistry.md',mimeType:'text/markdown',buffer:Buffer.from(chemistry)});
  }else{
   await page.getByLabel('Pasted input format').selectOption('markdown');
   await page.getByLabel('Assessment source').fill(mode==='spaced-paste'?chemistry.split('\n').filter(Boolean).join('\n\n'):chemistry);
   await page.getByRole('button',{name:'Detect sections and questions'}).click();
  }
  await expect(page.locator('.import-section')).toHaveCount(2);
  await expect(page.locator('.import-question-toggle')).toHaveCount(3);
  await expect(page.getByLabel('Imported assessment title')).toHaveValue('Science 10 Chemical Reactions');
  await accept(page);
  const master=await backup(page);
  expect(master.sections.map((s:{items:unknown[]})=>s.items.length)).toEqual([2,1]);
  const v=master.sections.flatMap((s:{items:{variants:unknown[]}[]})=>s.items.map(i=>i.variants[0])) as any[];
  expect(v[0].choices).toHaveLength(4);
  expect(v[2].choices).toHaveLength(4);
  expect(v[0].correctChoiceIds).toEqual([v[0].choices[0].id]);
  expect(v[2].correctChoiceIds).toEqual([v[2].choices[1].id]);
  expect(v[1].referenceAnswer).toContain('Positive two');
  expect(v[1].stem).toContain('<ul>');
  expect(v[1].stem).toContain('<li>');
  expect(v[1].stem).not.toContain('Answer:');
  await expect(page.getByText('Validation: Ready')).toBeVisible();
  await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
  const d=page.waitForEvent('download');
  await page.getByRole('button',{name:'Student Markdown'}).click();
  const markdown=await readFile(await (await d).path()!,'utf8');
  expect(markdown).not.toContain('**Answer:**');
  expect(markdown).not.toContain('Positive two');
 });
}

test('P2 keyed merge creates a persistent question-level warning blocking generation',async ({page})=>{
 await parsePlain(page,'Section 1: Science\n1. What is 2 + 2?\nAnswer: 4\n2. What is 3 + 3?\nAnswer: 6');
 await page.locator('.import-question-toggle').nth(1).click();
 await page.getByRole('button',{name:'Merge into previous'}).click();
 await expect(page.locator('.import-question-toggle')).toHaveCount(1);
 await expect(page.locator('.import-question-warnings')).toContainText('Merged two keyed questions');
 await accept(page);
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'I have corrected and reviewed this question'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
});

test('P2 staged import review survives navigation without changing active test',async ({page})=>{
 await parsePlain(page,'Section 1: A\n1. Write the number four.\nAnswer: 4');
 await page.getByLabel('Imported assessment title').fill('STAGED REVIEW');
 await page.getByRole('button',{name:'1. Author'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Untitled assessment');
 await page.getByRole('button',{name:'Import existing test'}).click();
 await expect(page.getByLabel('Imported assessment title')).toHaveValue('STAGED REVIEW');
});

test('P2 populated section removal explains relocation and supports cancellation',async ({page})=>{
 await parsePlain(page,'Section 1: First\n1. One?\nAnswer: 1\nSection 2: Second\n2. Two?\nAnswer: 2');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.getByRole('button',{name:'Remove section (move questions)'}).last().click();
 await expect(page.locator('.import-section')).toHaveCount(2);
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('will move to');void dialog.accept();});
 await page.getByRole('button',{name:'Remove section (move questions)'}).last().click();
 await expect(page.locator('.import-section')).toHaveCount(1);
 await expect(page.locator('.import-question-toggle')).toHaveCount(2);
});

test('P3 choice removal buttons expose separate A and B accessible names',async ({page})=>{
 await parsePlain(page,'Section 1: Science\n1. Which?\nA. Yes\nB. No\nAnswer: A');
 await expect(page.getByRole('button',{name:'Remove choice A'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Remove choice B'})).toBeVisible();
 await page.getByRole('button',{name:'Remove choice A'}).click();
 await expect(page.locator('.import-question-warnings')).toContainText('Correct answer not identified');
});

for(const viewport of [{width:768,height:1024},{width:1024,height:768}]){
 test('P2 tablet '+viewport.width+'x'+viewport.height+' keeps import controls reachable',async ({page})=>{
  await page.setViewportSize(viewport);
  await parsePlain(page,'Section 1: Science\n1. How many?\nA. One\nB. Two\nAnswer: A');
  await expect(page.getByLabel('Assessment source')).toBeVisible();
  await expect(page.getByLabel('Choice A',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 });
}

test('P2 reordered review questions retain correct source-to-answer mappings',async ({page})=>{
 await parsePlain(page,'Section 1: Motion\n1. First question?\nAnswer: first\n2. Second question?\nAnswer: second');
 await page.locator('.import-question-toggle').nth(1).click();
 await page.getByRole('button',{name:'Move up'}).click();
 await expect(page.locator('.import-question-toggle').first()).toContainText('Second question');
 await accept(page);
 const master=await backup(page);
 const variants=master.sections[0].items.map((i:{variants:unknown[]})=>i.variants[0]) as any[];
 expect(variants[0].stem).toContain('Second question');
 expect(variants[0].referenceAnswer).toContain('second');
 expect(variants[1].stem).toContain('First question');
 expect(variants[1].referenceAnswer).toContain('first');
});

test('tablet Chromium touch emulation: source, review and accept are usable',async ({browser})=>{
 const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 try{
  const page=await context.newPage();
  await parsePlain(page,'Section 1: Motion\n1. What is speed?\nA. Distance per time\nB. Force per mass\nAnswer: A');
  await expect(page.locator('.import-source')).toBeVisible();
  await expect(page.locator('.import-review')).toBeVisible();
  await page.getByLabel('Imported assessment title').tap();
  await page.getByLabel('Imported assessment title').fill('Touch-reviewed assessment');
  await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Accept reviewed import'}).tap();
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Touch-reviewed assessment');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 }finally{await context.close();}
});
