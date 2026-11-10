import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';

const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/OZkAAAAASUVORK5CYII=';
const B64='data:image/png;base64,'+PNG;
function docxWithIllustration():Uint8Array{
 const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 const imageRels='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/motion.png"/></Relationships>';
 const p=(s:string)=>'<w:p><w:r><w:t>'+s+'</w:t></w:r></w:p>';
 const cell=(s:string)=>'<w:tc><w:p><w:r><w:t>'+s+'</w:t></w:r></w:p></w:tc>';
 const row=(a:string,b:string)=>'<w:tr>'+cell(a)+cell(b)+'</w:tr>';
 const table='<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>'+row('Time (s)','Distance (m)')+row('1','3')+row('2','6')+'</w:tbl>';
 const picture='<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="228600" cy="152400"/><wp:docPr id="1" name="Motion diagram" descr="Blue and white motion graph"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="motion.png" descr="Blue and white motion graph"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="228600" cy="152400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
 const document='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+p('Motion and Diagrams Assessment')+p('Section 1: Applications')+p('1. Interpret the motion diagram and the following data table.')+picture+table+p('Answer: Constant speed of 3 m/s.')+'</w:body></w:document>';
 return zipSync({'[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rels),'word/document.xml':strToU8(document),'word/_rels/document.xml.rels':strToU8(imageRels),'word/media/motion.png':Uint8Array.from(Buffer.from(PNG,'base64'))});
}
test('2C.1 Word embedded PNG and multi-row table survive import, review, generation, refresh, JSON, Markdown and ZIP',async ({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment'}).click();
 await page.getByLabel('Upload assessment').setInputFiles({
  name:'motion-diagram.docx',
  mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer:Buffer.from(docxWithIllustration())
 });
 await expect(page.locator('.import-question-toggle')).toHaveCount(1);
 await expect(page.locator('.import-rendered img')).toHaveCount(1);
 await expect(page.locator('.import-rendered table')).toHaveCount(1);
 await expect(page.locator('.import-rendered tr')).toHaveCount(3);
 await expect(page.locator('.import-rendered img')).toHaveAttribute('src',B64);
 await expect(page.locator('.import-review .panel-heading span')).toContainText('0 warnings');
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await expect(page.locator('.rich-media-preview img')).toHaveCount(1);
 await expect(page.locator('.rich-media-preview table')).toHaveCount(1);
 const backupEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const json=JSON.parse(await readFile(await (await backupEvent).path()!,'utf8'));
 const stem=json.sections[0].items[0].variants[0].stem as string;
 expect(stem).toContain(B64);
 expect(stem).toMatch(/<table/);
 expect(stem).toContain('Distance (m)');
 const right=page.locator('.rightbar');
 await right.getByLabel('Number of versions').fill('6');
 await right.getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.getByRole('option',{name:'Version F'})).toHaveCount(1);
 await expect(page.locator('.print-page img')).toHaveAttribute('src',B64);
 await expect(page.locator('.print-page tr')).toHaveCount(3);
 const studentEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Student Markdown'}).click();
 const student=await readFile(await (await studentEvent).path()!,'utf8');
 expect(student).toContain(B64);
 expect(student).toMatch(/<table/);
 expect(student).toContain('Distance (m)');
 const zipEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download all versions & keys (ZIP)'}).click();
 const zip=unzipSync(new Uint8Array(await readFile(await (await zipEvent).path()!)));
 const md=Object.entries(zip).filter(([name])=>name.endsWith('.md'));
 expect(md).toHaveLength(12);
 for(const [,bytes] of md){
  const text=strFromU8(bytes);
  expect(text).toContain(B64);
  expect(text).toContain('<table');
  expect(text).toContain('Distance (m)');
 }
 await page.reload();
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(page.locator('.print-page img')).toHaveAttribute('src',B64);
 await expect(page.locator('.print-page tr')).toHaveCount(3);
});
