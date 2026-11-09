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
 await expect(page.getByLabel('Choice A')).toHaveValue('A cart moving at 2 m/s');
 await expect(page.getByLabel('Choice B')).toHaveValue('');
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
 await accept(page);
 const master=await backup(page);
 expect(master.sections).toHaveLength(3);
 expect(master.instructions).toContain('Show your work');
 const v=master.sections.flatMap((s:{items:{variants:unknown[]}[]})=>s.items.map(i=>i.variants[0])) as any[];
 expect(v).toHaveLength(4);
 expect(v[0].choices.map((c:{html:string})=>c.html)).toEqual(['m','s','m/s²','m/s']);
 expect(v[2].choices.map((c:{html:string})=>c.html)).toEqual(['Acceleration','Displacement','Time','Force']);
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
