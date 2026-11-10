import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import {readFile} from 'node:fs/promises';

/**
 * Compact OOXML reproductions of original Work-mode evidence:
 * D-complex.docx (5 images, 2 tables, embedded/cell drawings, sizing),
 * K-external-link.docx (a:blip r:link), L-corrupt-image.docx (17 bad PNG bytes),
 * A-physics.docx (3-inch drawings, proficiency labels).
 * Original binaries and fingerprints remain in the independent evidence ZIP.
 */
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const img=Uint8Array.from(Buffer.from(png,'base64'));
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const p=(s:string)=>'<w:p><w:r><w:t>'+esc(s)+'</w:t></w:r></w:p>';
const cell=(s:string)=>'<w:tc>'+p(s)+'</w:tc>';
const row=(...cells:string[])=>'<w:tr>'+cells.map(cell).join('')+'</w:tr>';
const table=(...rows:string[][])=>'<w:tbl><w:tblPr><w:tblW w:w="4500" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="2200"/></w:tblGrid>'+rows.map(r=>row(...r))+'</w:tbl>';
const image=(id:number,cx=1143000,cy=579120,linked=false)=>'<w:p><w:r><w:drawing>'+
 '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="'+cx+'" cy="'+cy+'"/>'+
 '<wp:docPr id="'+id+'" name="Diagram '+id+'"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+
 '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
 '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+id+'" name="Image'+id+'.png"/><pic:cNvPicPr/></pic:nvPicPr>'+
 '<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:'+(linked?'link':'embed')+'="rId'+(id+1)+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
 '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'+
 '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
const relsPrefix='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
function docx(body:string,images:number,options:{external?:boolean;corrupt?:boolean}={}):Buffer{
 const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
 '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'+
 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rootRels=relsPrefix+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 let imageRels=relsPrefix;
 const entries:Record<string,Uint8Array>={'[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rootRels)};
 for(let i=1;i<=images;i++){
  const linked=options.external&&i===1;
  imageRels+='<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="'+(linked?'https://example.com/talus-2c1-test-image.png':'media/image'+i+'.png')+'"'+(linked?' TargetMode="External"':'')+'/>';
  if(!linked)entries['word/media/image'+i+'.png']=options.corrupt&&i===1?strToU8('corrupt PNG bytes'):img;
 }
 entries['word/_rels/document.xml.rels']=strToU8(imageRels+'</Relationships>');
 entries['word/document.xml']=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>');
 return Buffer.from(zipSync(entries));
}
const D=docx(
 p('Science 10 Laboratory Stations')+p('Section 1: Foundations')+
 p('1. Compare the two motion cards.')+image(1,1143000,579120)+image(2,1417320,755904)+p('Use the cards above and the station table below.')+
 table(['Station group G17','Reading (mL)'],['C1 Sample alpha','12.75'],['C2 Sample beta','83.25'])+
 image(3,731520,407356)+image(4,1463040,845312)+p('The card after the table is a check figure.')+
 p('Answer: C2 has the larger reading.')+p('2. Which card appears in the final station?')+
 table(['Final station','Identification'],['Z95','Card 5'])+image(5,777240,463617)+p('Answer: Card 5'),5);
const K=docx(p('External link probe')+p('Section 1: Foundations')+
 p('1. Read the calibration patch.')+p('Patch 1')+image(1,960120,534924,true)+p('Answer: Calibration verified.')+
 p('2. What is the control reading?')+table(['Control','Mass (g)'],['T17','63.45'])+p('Answer: 63.45 g'),1,{external:true});
const L=docx(p('Corrupt image probe')+p('Section 1: Foundations')+
 p('1. Read the calibration patch.')+p('Patch 1')+image(1,960120,534924)+p('Answer: Calibration verified.')+
 p('2. What is the control reading?')+table(['Control','Mass (g)'],['T17','63.45'])+p('Answer: 63.45 g'),1,{corrupt:true});
const A=docx(p('Science 10 Motion Analysis')+p('Section 1: Foundations (Base)')+
 p('1. Use the VT74 motion graph.')+image(1,2743200,1528354)+p('Answer: Positive velocity.')+
 p('Section 2: Applications (Proficient)')+p('2. Use the motion diagram.')+image(2,2743200,674176)+p('Answer: Motion.'),2);
async function upload(page:Page,name:string,bytes:Buffer){
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
}
async function accept(page:Page){
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toBeVisible();
}
test('2C1-01 P0: repeat Detect on unchanged D Word preserves all five images, two tables and document title',async({page})=>{
 await upload(page,'D-complex.docx',D);
 await expect(page.locator('.import-source-rich img')).toHaveCount(5);
 await expect(page.locator('.import-source-rich table')).toHaveCount(2);
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.getByLabel('Imported assessment title')).toHaveValue('Science 10 Laboratory Stations');
 await expect(page.locator('.import-source-rich img')).toHaveCount(5);
 await expect(page.locator('.import-source-rich table')).toHaveCount(2);
 await expect(page.locator('.import-review .panel-heading span')).toContainText('0 warnings');
 await accept(page);
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page img')).toHaveCount(5);
 await expect(page.locator('.print-page table')).toHaveCount(2);
});
test('2C1-02 P1: linked Word image warning persists after acceptance, refresh and JSON restore',async({page})=>{
 await upload(page,'K-external-link.docx',K);
 await expect(page.locator('.import-warnings')).toContainText('could not open external image');
 await accept(page);
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
 await expect(page.getByText('Unresolved source-level import warnings')).toBeVisible();
 const event=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const bytes=await readFile(await (await event).path()!);
 expect(JSON.parse(bytes.toString()).importWarnings.join(' ')).toMatch(/external image/i);
 await page.reload();
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'K-restored.json',mimeType:'application/json',buffer:bytes});
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
});
test('2C1-03 P1: corrupt Word PNG yields explicit blocking warning and is never released as a valid diagram',async({page})=>{
 await upload(page,'L-corrupt-image.docx',L);
 await expect(page.locator('.import-warnings')).toContainText(/could not be decoded|cannot decode|corrupt/i);
 await expect(page.locator('.import-rendered img')).toHaveCount(0);
 await accept(page);
 await expect(page.getByText('Unresolved source-level import warnings')).toBeVisible();
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
});
test('2C1-04 P2: imported Word drawing display width is respected, responsive and preserved in versions',async({page})=>{
 await upload(page,'A-physics.docx',A);
 const first=page.locator('.import-source-rich img').first();
 await expect(first).toHaveAttribute('width','288');
 await accept(page);
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page img').first()).toHaveAttribute('width','288');
});
test('2C1-05 P3: a proficiency label embedded in section title is displayed only once',async({page})=>{
 await upload(page,'A-physics.docx',A);
 await accept(page);
 await page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.locator('.print-page h2').first()).toHaveText('Section 1: Foundations (Base)');
 const e=page.waitForEvent('download');
 await page.getByRole('button',{name:'Student Markdown'}).click();
 const md=await readFile(await (await e).path()!,'utf8');
 expect(md).toContain('## Section 1: Foundations (Base)\n');
 expect(md).not.toContain('(Base) (Base)');
});

test('2C1-01 follow-up: editing a rich Word source never silently downgrades it to plain text',async({page})=>{
 await upload(page,'D-complex.docx',D);
 await expect(page.locator('.import-source-rich img')).toHaveCount(5);
 const source=page.getByLabel('Assessment source');
 await source.fill((await source.inputValue())+'\nTeacher-added comment.');
 page.once('dialog',dialog=>{expect(dialog.message()).toContain('remove embedded images and table structure');void dialog.dismiss();});
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.locator('.import-source-rich img')).toHaveCount(5);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 await expect(page.locator('.import-warnings')).toContainText('Rich-content source media loss');
 await accept(page);
 await expect(page.getByText('Unresolved source-level import warnings')).toBeVisible();
 await expect(page.locator('.rightbar').getByRole('button',{name:'Generate',exact:true})).toBeDisabled();
});
