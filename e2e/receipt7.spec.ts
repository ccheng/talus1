import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MasterTest, QuestionType, Slot } from '../src/model';
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
  await page.locator('.versions-choice select').selectOption({label:'Version B'});

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
  expect(text.stdout).toMatch(/A\s+to\s+[ABCD]/);

  const bundle=await download(page,/Word\/DOCX \(ZIP\).*all versions/);
  const files=unzipSync(bundle.buffer);
  const manifest=JSON.parse(strFromU8(files['generation-manifest.json']));
  await page.reload();
  await openVersions(page);
  await page.locator('.versions-choice select').selectOption({label:'Version B'});
  const saved=await download(page,'Download receipt (JSON)');
  const receipt=JSON.parse(saved.buffer.toString()) as VersionReceipt;
  expect(receipt.runId).toBe(manifest.generation.runId);
  expect(receipt.questions).toHaveLength(5);
  expect(receipt.questions.map(q=>q.wordQuestion).sort((a,b)=>(a??0)-(b??0))).toEqual([6,7,8,9,11]);
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

test('typed question labels agree in preview, Word, Markdown, and both receipts', async ({page}) => {
  const slot = (id: string, type: QuestionType, stem: string, referenceAnswer = ''): Slot => {
    const choices = type === 'singleChoice' || type === 'multipleSelect'
      ? [{id: id+'-a', html: '<p>Red</p>'}, {id: id+'-b', html: '<p>Blue</p>'}]
      : [];
    return {kind: 'slot', id, shufflePosition: false, variants: [{id: id+'-variant', type, stem,
      choices, correctChoiceIds: choices.slice(0, type === 'multipleSelect' ? 2 : 1).map(choice => choice.id),
      referenceAnswer, points: 1, shuffleChoices: false}]};
  };
  const groupedWriting = '<p>Explain the observation.</p><table><tbody><tr><td><p>Three leaves</p></td></tr></tbody></table>'
    + '<p><math><mfrac><mn>1</mn><mn>2</mn></mfrac></math></p>';
  const master: MasterTest = {
    schemaVersion: 1, id: 'plant-lab', title: 'Plant measurements', instructions: '', updatedAt: '2026-11-01T00:00:00Z',
    sections: [
      {id: 'leaves', title: 'Leaves', proficiency: '', instructions: '', shuffleQuestions: false, items: [
        {kind: 'group', id: 'observations', sharedHtml: '<p>Use the growth log.</p>', shuffleWithinGroup: false, rangeLabel: true,
          items: [slot('colour', 'singleChoice', '<p>Choose the colour.</p>'),
            slot('count', 'numericalResponse', '<p>Give the leaf count.</p>', '<p>3</p>'),
            slot('explain', 'writtenResponse', groupedWriting, '<p>Sample explanation</p>')]},
      ]},
      {id: 'stems', title: 'Stems', proficiency: '', instructions: '', shuffleQuestions: false, items: [
        slot('name', 'shortAnswer', '<p>Name the part.</p>', '<p>Stem</p>'),
        slot('select', 'multipleSelect', '<p>Select the colours.</p>'),
        slot('height', 'numericalResponse', '<p>Give the height.</p>', '<p>4</p>'),
      ]},
    ],
  };

  await page.goto('./');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('.header-actions input[type=file]').setInputFiles({
    name: 'plant-lab.talus.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(master)),
  });
  await expect(page.getByText('Validation: Ready')).toBeVisible();
  await page.getByRole('button', {name: 'Generate', exact: true}).click();
  const labels = ['1', 'NR1', 'WR1', 'WR2', '2', 'NR2'];
  await expect(page.locator('.print-page .question-stem > strong')).toHaveText(labels.map(label => label+'.'));
  const groupCue = 'Use the following for Questions 1, NR1, and WR1:';
  await expect(page.locator('.print-page')).toContainText(groupCue);

  for (const [wordButton, markdownButton] of [
    ['Student Word (.docx)', 'Student Markdown'], ['Answer key Word (.docx)', 'Answer key Markdown'],
  ]) {
    const word = await download(page, wordButton);
    const xml = strFromU8(unzipSync(word.buffer)['word/document.xml']);
    expect(xml).toContain(groupCue);
    expect(xml).toContain('Question WR1 — continued');
    const markdown = (await download(page, markdownButton)).buffer.toString();
    expect(markdown).toContain(groupCue);
    expect([...markdown.matchAll(/^\*\*((?:NR|WR)?\d+)\.\*\*/gm)].map(match => match[1])).toEqual(labels);
    for (const label of labels) expect(xml).toContain('>'+label+'. </w:t>');
    if (wordButton === 'Student Word (.docx)') {
      expect(xml).toContain('Question NR1 — response space');
      expect(markdown.split('**NR1.**')[1].split('**WR1.**')[0]).toContain('\\_');
    } else {
      expect(markdown.split('**NR1.**')[1].split('**WR1.**')[0]).toContain('**Answer:** 3');
    }
  }

  const json = JSON.parse((await download(page, 'Download receipt (JSON)')).buffer.toString()) as VersionReceipt;
  expect(json.questions.map(row => row.generatedLabel)).toEqual(labels);
  expect(json.questions.map(row => row.generatedNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  const pdf = await download(page, 'Download receipt (PDF)');
  const text = spawnSync('pdftotext', ['-layout', pdf.location, '-'], {encoding: 'utf8'});
  expect(text.status, text.stderr).toBe(0);
  for (const label of ['NR1', 'NR2', 'WR1', 'WR2']) expect(text.stdout).toContain(label);
});
