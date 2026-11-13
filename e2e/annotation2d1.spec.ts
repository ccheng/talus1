import {expect,test,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import {generate} from './fixtures';

const plainXml=(xml:string)=>Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g),match=>match[1]).join('');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const m='http://schemas.openxmlformats.org/officeDocument/2006/math';
const r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pr='http://schemas.openxmlformats.org/package/2006/relationships';
const p=(value:string)=>'<w:p><w:r><w:t>'+value+'</w:t></w:r></w:p>';
const lines=['Annotation Science','Base','7. Which gas? A. Oxygen B. Nitrogen (2 marks)','Proficient','7. Select the metals. A. Iron B. Sulfur C. Zinc','8. Interpret the fraction.'];
const keys=['Answer Key','Base Answers','7. B','Proficient Answers','7. A, C','8. One half'];
const table='<w:tbl><w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>'+p('Merged cell')+'</w:tc></w:tr></w:tbl>';
const fraction='<w:p><m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></w:p>';
const image='<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Diagram" descr="Test image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
function fixture(namespaced=true,damaged=false,customBody?:string) {
 const appendix=namespaced?keys:['Answer Key','7. B','7. A, C','8. One half'];
 const document='<w:document xmlns:w="'+w+'" xmlns:m="'+m+'" xmlns:r="'+r+'" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+
  (customBody??(lines.map(p).join('')+(damaged?fraction.replace('<m:den><m:r><m:t>2</m:t></m:r></m:den>',''):fraction)+table+image+appendix.map(p).join('')))+'</w:body></w:document>';
 return Buffer.from(zipSync({
  '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels':strToU8('<Relationships xmlns="'+pr+'"><Relationship Id="rId1" Type="'+r+'/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/_rels/document.xml.rels':strToU8('<Relationships xmlns="'+pr+'"><Relationship Id="rIdImage" Type="'+r+'/image" Target="media/image.png"/></Relationships>'),
  'word/document.xml':strToU8(document),'word/media/image.png':png
 }));
}
const part=(block:string,line:string,value:string)=>{
 const start=line.indexOf(value);if(start<0)throw Error('Fixture substring not found: '+value);
 return {block,start,end:start+value.length};
};
const b=(n:number)=>({block:'B'+n});
const option=(id:string,line:string,label:string,value:string)=>({label:part(id,line,label),content:[part(id,line,value)]});
function annotation(bytes:Buffer,namespaced=true){
 const q1=lines[2],q2=lines[4],q3=lines[5];
 const key=(block:string,line:string,value:string)=>({number:part(block,line,line.slice(0,2)),content:[part(block,line,value)]});
 return {format:'talus-annotation',version:1,fingerprint:createHash('sha256').update(bytes).digest('hex'),title:b(1),keyHeading:b(10),
  keyGroups:namespaced?[{heading:b(11),section:0},{heading:b(13),section:1}]:undefined,
  sections:[
   {heading:b(2),questions:[{type:'singleChoice',number:part('B3',q1,'7.'),stem:[part('B3',q1,'Which gas?')],marks:part('B3',q1,'(2 marks)'),
    choices:[option('B3',q1,'A.','Oxygen'),option('B3',q1,'B.','Nitrogen')],key:key(namespaced?'B12':'B11',keys[2],'B')}]},
   {heading:b(4),questions:[{type:'multipleSelect',number:part('B5',q2,'7.'),stem:[part('B5',q2,'Select the metals.')],
    choices:[option('B5',q2,'A.','Iron'),option('B5',q2,'B.','Sulfur'),option('B5',q2,'C.','Zinc')],key:key(namespaced?'B14':'B12',keys[4],'A, C')},
    {type:'writtenResponse',number:part('B6',q3,'8.'),stem:[part('B6',q3,'Interpret the fraction.'),b(7),b(8),b(9)],key:key(namespaced?'B15':'B13',keys[5],'One half')}]}
  ]};
}
async function open(page:Page,bytes:Buffer){
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await page.getByLabel('Upload assessment',{exact:true}).setInputFiles({name:'annotation-science.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
 await page.getByText('AI-assisted DOCX annotation',{exact:true}).click();
 const request=page.getByRole('textbox',{name:'Annotation request'});
 await expect(request).toHaveValue(/Merged cell/);
 const input=(await request.inputValue()).split('\n\n').at(-1)!;
 const {blocks}=JSON.parse(input);
 expect(blocks.map(({id}: {id:string})=>id)).toContain('B10');
 expect(blocks[8].text).toContain('[Image:');
 if(blocks[6].text.startsWith('[Equation:')){
  expect(blocks[6].atoms[0].description).toBe('[Equation: (1)/(2)]');
  expect(blocks[6].text).not.toContain('[Equation: 12]');
 }
 expect(input).not.toContain('data:image/');
}
async function apply(page:Page,value:unknown){
 await page.getByLabel('Annotation JSON',{exact:true}).fill(JSON.stringify(value));
 await page.getByRole('button',{name:'Review annotation',exact:true}).click();
}
async function accept(page:Page){
 await page.getByRole('checkbox',{name:/I reviewed the proposed structure/}).check();
 await page.getByRole('button',{name:'Accept reviewed import'}).click();
}
async function download(page:Page,name:string|RegExp){
 const [event]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name}).click()]);
 return readFile((await event.path())!);
}

test('2D.1 checks exact source and reviewed keys, then preserves rich content in all 12 Word files',async({page})=>{
 const bytes=fixture(), data=annotation(bytes);
 await page.goto('./');
 await open(page,bytes);
 await apply(page,{...data,fingerprint:'0'.repeat(64)});
 await expect(page.getByText(/belongs to a different DOCX/)).toBeVisible();
 const swapped=structuredClone(data);
 const base=swapped.sections[0].questions[0], proficient=swapped.sections[1].questions[0];
 [base.key,proficient.key]=[proficient.key,base.key];
 await apply(page,swapped);
 await expect(page.getByText(/detached answer from a different section/)).toBeVisible();
 const incomplete=structuredClone(data);
 incomplete.sections[1].questions[1].stem.pop();
 await apply(page,incomplete);
 await expect(page.getByText(/Unassigned source content: B9/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeDisabled();
 await page.reload();
 await expect(page.getByRole('button',{name:'Import assessment',exact:true})).toBeVisible();
 await open(page,bytes);
 await apply(page,data);
 await expect(page.getByText(/Proposed answer: B\. Nitrogen/)).toBeVisible();
 await expect(page.getByText(/Proposed answer: A\. Iron \/ C\. Zinc/)).toBeVisible();
 await expect(page.getByText(/Interpret the fraction\. \[Equation: \(1\)\/\(2\)\]/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeDisabled();
 page.on('dialog',dialog=>dialog.accept());
 await accept(page);
 await expect(page.getByText('Validation: Ready')).toBeVisible();
 await generate(page,6,'2d1-annotation');
 const getWord=()=>download(page,/Word\/DOCX \(ZIP\)/);
 const files=unzipSync(await getWord()),word=Object.entries(files).filter(([name])=>name.endsWith('.docx'));
 expect(word).toHaveLength(12);
 for(const [name,bytes] of word){
  const parts=unzipSync(bytes),xml=strFromU8(parts['word/document.xml']);
  expect(xml).toContain('Which gas?');
  expect(xml.indexOf('Which gas?')).toBeLessThan(xml.indexOf('Select the metals.'));
  expect(xml).toContain('<m:f>');
  expect(xml).toContain('<w:gridSpan w:val="2"/>');
  expect(xml).toContain('Merged cell');
  expect(Buffer.from(Object.entries(parts).find(([part])=>part.startsWith('word/media/'))![1])).toEqual(png);
  const key=name.endsWith('-key.docx');
  expect(xml.includes('One half')).toBe(key);
  if(key){
   const paragraphs=xml.split('</w:p>').map(plainXml);
   const answerParagraphs=paragraphs.filter(paragraph=>paragraph.includes('Answer:'));
   expect(answerParagraphs).toHaveLength(3);
   const actual=answerParagraphs.map(paragraph=>paragraph.match(/Answer: (.+)/)?.[1]);
   const choices=paragraphs.flatMap(paragraph=>{
    const match=paragraph.match(/([A-Z])\. (Oxygen|Nitrogen|Iron|Sulfur|Zinc)/);
    return match?[[match[2],match[1]]]:[];
   });
   const letters=Object.fromEntries(choices);
   expect(actual).toContain(letters.Nitrogen);
   expect(actual).toContain([letters.Iron,letters.Zinc].sort().join(', '));
  }
 }
 const manifestName=Object.keys(files).find(name=>name.endsWith('manifest.json'))!;
 await generate(page,6,'2d1-annotation');
 const repeated=unzipSync(await getWord());
 expect(repeated[manifestName]).toEqual(files[manifestName]);
});

test('2D.1 leaves ambiguous repeated keys repairable after refresh and JSON backup restore',async({page})=>{
 const bytes=fixture(false);
 await page.goto('./');
 await open(page,bytes);
 await apply(page,annotation(bytes,false));
 await expect(page.getByText(/Repeated source question number has no matching key section/).first()).toBeVisible();
 page.on('dialog',dialog=>dialog.accept());
 await accept(page);
 const generateButton=page.getByRole('button',{name:'Generate',exact:true});
 await expect(generateButton).toBeDisabled();
 await page.reload();
 await expect(generateButton).toBeDisabled();
 const backup=await download(page,'Backup JSON');
 await page.locator('.header-actions input[type=file]').setInputFiles({name:'annotation-backup.json',mimeType:'application/json',buffer:backup});
 await expect(page.getByText('Imported backup.')).toBeVisible();
 await expect(generateButton).toBeDisabled();
 const saved=JSON.parse(backup.toString('utf8'));
 expect(saved.sections[0].items[0].variants[0].correctChoiceIds).toEqual([]);
 expect(saved.sections[1].items[0].variants[0].correctChoiceIds).toEqual([]);
});

test('2D.1 cannot accept a DOCX with an incomplete source equation',async({page})=>{
 const bytes=fixture(true,true);
 await page.goto('./');
 await open(page,bytes);
 await expect(page.getByText('Source integrity issues',{exact:true})).toBeVisible();
 await apply(page,annotation(bytes));
 await expect(page.getByText('Resolve these issues before accepting',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeDisabled();
});

test('2D.3 surfaces source-backed competing keys and exports the teacher correction for six forms',async({page})=>{
 const body=['Base','1. Which is the reference reading?','A. 21','B. 29','Answer: A','Answer Key','1. B'];
 const bytes=fixture(true,false,body.map(p).join(''));
 const reference=(n:number,value:string)=>part('B'+n,body[n-1],value);
 const proposal={format:'talus-annotation',version:1,fingerprint:createHash('sha256').update(bytes).digest('hex'),keyHeading:b(6),sections:[{
  heading:b(1),questions:[{type:'singleChoice',number:reference(2,'1.'),stem:[reference(2,'Which is the reference reading?')],
   choices:[option('B3',body[2],'A.','21'),option('B4',body[3],'B.','29')],
   key:{label:reference(5,'Answer:'),content:[{block:'B5',start:8,end:9}]}}]
 }],unassignedKeys:[b(7)]};
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await page.getByLabel('Upload assessment',{exact:true}).setInputFiles({name:'competing-keys.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
 await page.getByText('AI-assisted DOCX annotation',{exact:true}).click();
 await apply(page,proposal);
 const comparison=page.getByRole('region',{name:'Detect and AI disagreements'});
 await comparison.locator('summary').filter({hasText:'Key mapping'}).click();
 await expect(comparison).toContainText('Source line 7');
 await expect(comparison).toContainText('1. B');
 await expect(comparison).toContainText('Source B5');
 await expect(comparison).toContainText('Answer: A');
 await comparison.getByRole('button',{name:'Review this question'}).click();
 await expect(page.getByRole('radio',{name:'Correct A',exact:true})).toBeChecked();
 await page.getByRole('radio',{name:'Correct B',exact:true}).check();
 await expect(comparison).toContainText('Key mapping · Edited in current draft');
 await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeDisabled();
 await comparison.getByRole('checkbox',{name:/Use source B7 for this question/}).check();
 page.on('dialog',dialog=>dialog.accept());
 await accept(page);
 await generate(page,6,'2d3-reviewed');
 const word=Object.entries(unzipSync(await download(page,/Word\/DOCX \(ZIP\)/))).filter(([name])=>name.endsWith('.docx'));
 expect(word).toHaveLength(12);
 for(const [name,raw] of word){
  const xml=strFromU8(unzipSync(raw)['word/document.xml']);
  const paragraphs=xml.split('</w:p>').map(plainXml);
  const choice=paragraphs.find(paragraph=>/^[A-Z]\. 29$/.test(paragraph));
  expect(choice).toBeTruthy();
  if(name.endsWith('-key.docx'))expect(paragraphs).toContain('Answer: '+choice![0]);
  else expect(paragraphs.some(paragraph=>paragraph.startsWith('Answer:'))).toBe(false);
 }
});
