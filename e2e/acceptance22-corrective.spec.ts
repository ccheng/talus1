import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const p=(s:string)=>'<w:p><w:r><w:t>'+s+'</w:t></w:r></w:p>';
const mr=(s:string)=>'<m:r><m:t>'+s+'</m:t></m:r>';
const math=(s:string,display=false)=>display?'<m:oMathPara><m:oMath>'+s+'</m:oMath></m:oMathPara>':'<m:oMath>'+s+'</m:oMath>';
const doc=(body:string)=>Buffer.from(zipSync({
 '[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
 '_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
 'word/document.xml':strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="'+M+'"><w:body>'+body+'</w:body></w:document>')
}));
const H=doc(p('Absolute Value Lab')+p('Section 1: Foundations')+'<w:p><w:r><w:t>1. Evaluate ABS-CHECK </w:t></w:r>'+math('<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>'+mr('−')+mr('3')+'</m:e></m:d>')+'</w:p>'+p('Answer: 3'));
const B=doc(p('Particle Count Lab')+p('Section 1: Foundations')+p('1. Write the stated particle count to three significant figures.')+'<w:p><w:r><w:t>Answer: 6.02 × 10</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>23</w:t></w:r></w:p>');
const F=doc(p('Malformed Fraction Lab')+p('Section 1: Foundations')+'<w:p><w:r><w:t>1. Evaluate incomplete </w:t></w:r>'+math('<m:f><m:num>'+mr('17')+'</m:num></m:f>')+'</w:p>'+p('Answer: undefined.')+'<w:p><w:r><w:t>2. Evaluate intact </w:t></w:r>'+math('<m:f><m:num>'+mr('9')+'</m:num><m:den>'+mr('4')+'</m:den></m:f>')+'</w:p>'+p('Answer: 2.25'));
const D=doc(p('Velocity Lab')+p('Section 1: Applications')+p('1. Calculate velocity.')+'<w:p><w:r><w:t>Answer: </w:t></w:r>'+math(mr('4'))+'<w:r><w:t xml:space="preserve"> m/s.</w:t></w:r></w:p>');
const P=doc(p('Operator Lab')+p('Section 1: Applications')+'<w:p><w:r><w:t>1. Evaluate </w:t></w:r>'+math(mr('7')+mr('−')+mr('4'))+'</w:p>'+p('Answer: 3')+p('2. Evaluate the displayed summation.')+'<w:p>'+math('<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>'+mr('k=1')+'</m:sub><m:sup>'+mr('4')+'</m:sup><m:e>'+mr('k')+'</m:e></m:nary>',true)+'</w:p>'+p('Answer: 10'));
async function upload(page:Page,name:string,bytes:Buffer){
 await page.goto('./');await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
}
async function accept(page:Page){
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Accept reviewed import'}).click();
}
test('2C2-01 P0: original OMML absolute-value bars survive generation and preserve meaning',async({page})=>{
 await upload(page,'H-absolute.docx',H);
 await expect(page.locator('.import-rendered math mo').first()).toHaveText('|');
 await expect(page.locator('.import-review .panel-heading')).toContainText('0 warnings');
 await accept(page);await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page math mo').first()).toHaveText('|');
 await expect(page.locator('.print-page math mo').last()).toHaveText('|');
});
test('2C2-02 P0: reference-answer superscript 23 remains raised into generated key',async({page})=>{
 await upload(page,'B-physics.docx',B);
 await expect(page.getByLabel('Question 1 reference answer')).toHaveValue(/<sup>23<\/sup>/);
 await accept(page);await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await page.getByLabel('Answer key').check();
 await expect(page.locator('.print-page .key sup')).toHaveText('23');
});
test('2C2-03 P0: incomplete OMML fraction blocks generation, neighboring fraction remains correct',async({page})=>{
 await upload(page,'F-malformed.docx',F);
 await expect(page.locator('.import-warnings')).toContainText(/missing|empty.*denominator/i);
 await expect(page.locator('.import-rendered')).toContainText('Word equation requires manual review');
 await accept(page);
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
});
test('2C2-04 P1: inline OMML in a reference answer remains MathML beside unit text',async({page})=>{
 await upload(page,'D-mixed.docx',D);
 await expect(page.getByLabel('Question 1 reference answer')).toHaveValue(/<math/);
 await accept(page);await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await page.getByLabel('Answer key').check();
 await expect(page.locator('.print-page .key math')).toHaveCount(1);
 await expect(page.locator('.print-page .key')).toContainText('m/s.');
});
test('2C2-05 P2: compact MathML does not introduce vertical scrollbars',async({page})=>{
 await upload(page,'H-absolute.docx',H);await accept(page);
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const overflow=await page.locator('.print-page math').first().evaluate(node=>getComputedStyle(node).overflowY);
 expect(overflow).not.toBe('auto');
 expect(overflow).not.toBe('scroll');
});
test('2C2-06 P2: Unicode minus is MathML operator and block equations retain display mode',async({page})=>{
 await upload(page,'operator-display.docx',P);
 await expect(page.locator('.import-rendered math mo')).toContainText(['−']);
 await expect(page.locator('.import-source-rich math[display="block"]')).toHaveCount(1);
 await accept(page);await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page math[display="block"]')).toHaveCount(1);
});


test('2C2 corrective integrated: six shuffled student/key exports preserve every math operand and reference answer',async({page})=>{
 const clean=doc(
 p('Science 10 Mixed Math Key Regression')+p('Section 1: Foundations')+
 '<w:p><w:r><w:t>1. Evaluate absolute value </w:t></w:r>'+math('<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>'+mr('−')+mr('3')+'</m:e></m:d>')+'</w:p>'+p('Answer: 3')+
 p('2. Write the particle count to three significant figures.')+
 '<w:p><w:r><w:t>Answer: 6.02 × 10</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>23</w:t></w:r></w:p>'+
 p('Section 2: Applications')+
 '<w:p><w:r><w:t>3. Divide the quantities </w:t></w:r>'+math('<m:f><m:num>'+mr('9')+'</m:num><m:den>'+mr('4')+'</m:den></m:f>')+'</w:p>'+p('Answer: 2.25')+
 p('4. Calculate velocity.')+'<w:p><w:r><w:t>Answer: </w:t></w:r>'+math(mr('4'))+'<w:r><w:t> m/s.</w:t></w:r></w:p>'
 );
 await upload(page,'2c2-integrated.docx',clean);
 await expect(page.locator('.import-review .panel-heading')).toContainText('4 questions · 0 warnings');
 await accept(page);
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByLabel('Number of versions').fill('6');
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 const dl=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download all versions & keys (ZIP)'}).click();
 const file=await dl;
 const {unzipSync,strFromU8}=await import('fflate');
 const {readFile}=await import('node:fs/promises');
 const entries=unzipSync(new Uint8Array(await readFile(await file.path()!)));
 const files=Object.entries(entries).filter(([name])=>name.endsWith('.md'));
 expect(files).toHaveLength(12);
 for(const [name,bytes] of files){
  const md=strFromU8(bytes);
  expect(md).toContain('<mo stretchy="true">|</mo>');
  expect(md).toContain('<mfrac>');
  if(name.includes('-key')){
   expect(md).toMatch(/6\.02 × 10\^23\^/);
   expect(md).toContain('<math');
   expect(md).toContain('m/s.');
  }else{
   expect(md).not.toContain('**Answer:**');
  }
 }
});
