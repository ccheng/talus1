import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { VersionReceipt } from '../src/versionReceipt';

const fixture=fileURLToPath(new URL('../docs/teacher/water-filter-lab.docx',import.meta.url));
const openVersions = (page:Page) => page.getByRole('button',{name:'2. Versions & answer keys'}).click();
const download = async (page:Page, button:string|RegExp) => {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:button,exact:typeof button==='string'}).click(),
  ]);
  const location=(await file.path())!;
  return { name:file.suggestedFilename(), location, buffer:await readFile(location) };
};
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

test('Word-import receipt downloads a PDF and verifies the exact DOCX from individual and ZIP exports', async ({page}) => {
  await page.goto('./');
  page.on('dialog', dialog=>dialog.accept());
  await page.getByRole('button',{name:'Import assessment'}).click();
  await page.getByLabel(/Upload.*assessment/i).setInputFiles(fixture);
  await page.getByRole('button',{name:'Confirm question group'}).click();
  await page.getByRole('button',{name:'Accept reviewed import'}).click();
  await expect(page.getByText('Validation: Ready')).toBeVisible();
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await page.getByLabel('Version',{exact:true}).selectOption({label:'Version B'});

  const student=await download(page,'Student Word (.docx)');
  const individual=await download(page,'Download receipt (JSON)');
  const individualReceipt=JSON.parse(individual.buffer.toString()) as VersionReceipt;
  expect(individualReceipt.version).toBe('B');
  expect(individualReceipt.files).toEqual([{filename:student.name,role:'student',sha256:sha256(student.buffer)}]);
  const pdf=await download(page,'Download receipt (PDF)');
  expect(pdf.name).toMatch(/-VB-run-.*-teacher-receipt\.pdf$/);
  expect(pdf.buffer.subarray(0,5).toString()).toBe('%PDF-');
  const text=spawnSync('pdftotext',['-layout',pdf.location,'-'],{encoding:'utf8'});
  expect(text.status,text.stderr).toBe(0);
  expect(text.stdout).toContain('Version B receipt');
  expect(text.stdout).toContain('Water Filter Lab');
  expect(text.stdout).toContain(individualReceipt.runId);
  expect(text.stdout).toContain('Choice mapping');
  expect(text.stdout).toMatch(/A\s*→\s*[ABCD]/);

  const bundle=await download(page,/Word\/DOCX \(ZIP\).*all versions/);
  const files=unzipSync(bundle.buffer);
  const manifest=JSON.parse(strFromU8(files['generation-manifest.json']));
  await page.reload();
  await openVersions(page);
  await page.getByLabel('Version',{exact:true}).selectOption({label:'Version B'});
  const saved=await download(page,'Download receipt (JSON)');
  const receipt=JSON.parse(saved.buffer.toString()) as VersionReceipt;
  expect(receipt.runId).toBe(manifest.generation.runId);
  expect(receipt.questions).toHaveLength(5);
  expect(receipt.questions.map(q=>q.wordQuestion).sort()).toEqual([6,7,8,9,11]);
  expect(receipt.questions).toEqual(individualReceipt.questions);
  expect(receipt.files).toHaveLength(2);
  for(const entry of receipt.files) expect(entry.sha256).toBe(sha256(files[entry.filename]));
  const studentFile=receipt.files.find(file=>file.role==='student')!;
  const keyFile=receipt.files.find(file=>file.role==='key')!;
  const documentXml=(file:string)=>strFromU8(unzipSync(files[file])['word/document.xml']);
  expect(documentXml(studentFile.filename)).toContain('Run ID: '+receipt.runId);
  expect(documentXml(studentFile.filename)).not.toContain('Answer:');
  const keyedXml=documentXml(keyFile.filename);
  for (const row of receipt.questions.filter(q=>q.choices.length)) {
    const correct = row.choices.filter(c=>c.correct).map(c=>c.generated).sort().join(', ');
    expect(keyedXml).toContain('Answer: '+correct);
  }
  await page.getByText('Verify a Word export',{exact:true}).click();
  await page.getByLabel('Receipt JSON').setInputFiles({name:saved.name,mimeType:'application/json',buffer:saved.buffer});
  async function verify(buffer:Buffer, expected:RegExp) {
    await page.getByLabel('Word document').setInputFiles({
      name:'renamed.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer,
    });
    await page.getByRole('button',{name:'Verify file',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:expected})).toBeVisible();
  }
  await verify(Buffer.from(files[studentFile.filename]),/Exact export match:.*student form/);
  await verify(Buffer.from(files[keyFile.filename]),/Exact export match:.*answer key/);
  const edited=unzipSync(files[studentFile.filename]);
  edited['word/document.xml']=strToU8(documentXml(studentFile.filename).replace('Water Filter Lab','Water Filter Lab revised'));
  await verify(Buffer.from(zipSync(edited)),/No match/);
  await verify(Buffer.from(files[studentFile.filename.replace('-VB.docx','-VA.docx')]),/No match/);
  await page.getByLabel('Receipt JSON').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await page.getByRole('button',{name:'Verify file',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:/Invalid Talus receipt/})).toBeVisible();
});
