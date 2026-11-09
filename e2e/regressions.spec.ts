import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync,strFromU8 } from 'fflate';
import { fixture,generate,importAssessment,type Assessment } from './fixtures';

test.beforeEach(async ({page})=>{await page.goto('./');await expect(page.getByRole('heading',{name:'Assessment',exact:true})).toBeVisible();});

test('T2 — title edit survives immediate browser refresh without waiting for IndexedDB',async ({page})=>{
 await page.getByLabel('Title',{exact:true}).fill('QA immediate-refresh sentinel');
 await page.reload();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('QA immediate-refresh sentinel');
});

test('T3 — generation settings and saved forms/keys survive refresh',async ({page})=>{
 const m=fixture();await importAssessment(page,m);await generate(page,6,'science10-qa-2026');
 await expect(page.getByRole('option',{name:'Version F'})).toHaveCount(1);
 await page.reload();
 await expect(page.getByRole('button',{name:'2. Versions & answer keys'})).toBeVisible();
 await page.getByRole('button',{name:'1. Author'}).click();
 await expect(page.getByLabel('Number of versions')).toHaveValue('6');
 await expect(page.getByLabel('Reproducibility seed')).toHaveValue('science10-qa-2026');
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(page.getByRole('option',{name:'Version F'})).toHaveCount(1);
 await page.locator('.versions-choice select').selectOption('5');
 await expect(page.locator('.print-question')).toHaveCount(8);
 await page.getByLabel('Answer key',{exact:true}).check();
 await expect(page.locator('.key')).toHaveCount(8);
});

test('import regression — older version 1 backup replaces newer draft even without editing before refresh',async ({page})=>{
 const newer=fixture('Newer working assessment','2030-01-01T00:00:00.000Z');
 const older=fixture('Older imported assessment','2020-01-01T00:00:00.000Z');
 older.id='old-distinct-id';older.generationSettings=undefined;
 await importAssessment(page,newer);
 await importAssessment(page,older);
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Older imported assessment');
 await page.reload();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Older imported assessment');
 await expect(page.getByLabel('Number of versions')).toHaveValue('3');
 await expect(page.getByLabel('Reproducibility seed')).toHaveValue('talus-2026');
});

test('import regression — older saved-run backup restores seed, six forms, and keys after refresh',async ({page})=>{
 const original=fixture('Saved run assessment');
 await importAssessment(page,original);await generate(page,6,'saved-run-seed');
 await page.getByRole('button',{name:'1. Author'}).click();
 const backup=page.waitForEvent('download');
 await page.getByRole('button',{name:'Backup JSON'}).click();
 const download=await backup;
 const saved=JSON.parse(await readFile(await download.path()!,'utf8')) as Assessment;
 const newer=fixture('Future-dated draft','2030-01-01T00:00:00.000Z');
 newer.id='different-newer-id';
 await importAssessment(page,newer);
 await importAssessment(page,saved);
 await page.reload();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Saved run assessment');
 await expect(page.getByLabel('Number of versions')).toHaveValue('6');
 await expect(page.getByLabel('Reproducibility seed')).toHaveValue('saved-run-seed');
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(page.getByRole('option',{name:'Version F'})).toHaveCount(1);
 await page.getByLabel('Answer key',{exact:true}).check();
 await expect(page.locator('.key')).toHaveCount(8);
});

test('T1 — single ZIP batch download contains all 6 student forms, 6 keys, and manifest',async ({page})=>{
 await importAssessment(page,fixture());
 await generate(page);
 const event=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download all versions & keys (ZIP)'}).click();
 const downloaded=await event;
 expect(downloaded.suggestedFilename()).toMatch(/\.zip$/);
 const archive=unzipSync(new Uint8Array(await readFile(await downloaded.path()!)));
 const names=Object.keys(archive);
 expect(names).toHaveLength(13);
 expect(names.filter(x=>/-key\.md$/.test(x))).toHaveLength(6);
 expect(names.filter(x=>/-V[A-F]\.md$/.test(x))).toHaveLength(6);
 const manifest=JSON.parse(strFromU8(archive['generation-manifest.json']));
 expect(manifest.generation.count).toBe(6);
 expect(manifest.generation.manifests).toHaveLength(6);
 for(const [name,content] of Object.entries(archive)){
  expect(content.byteLength).toBeGreaterThan(0);
  if(name.endsWith('.md'))expect(strFromU8(content)).toContain('Foundations');
 }
});

test('core algorithm UI — section boundaries, slot uniqueness, rotation, correct keys and numbering',async ({page})=>{
 const m=fixture();
 await importAssessment(page,m);
 await generate(page);
 const variants=new Map<string,string>();
 for(const s of m.sections)for(const slot of s.items)for(const v of slot.variants)variants.set(v.stem.replace(/<[^>]+>/g,''),slot.id);
 const formulaNames=['Which formula represents water?','Which formula represents carbon dioxide?','Which formula represents oxygen gas?'];
 const seenFormula:string[]=[];
 for(let version=0;version<6;version++){
  await page.locator('.versions-choice select').selectOption(String(version));
  const sections=page.locator('.print-page > section');
  await expect(sections).toHaveCount(3);
  const texts=await sections.locator('.print-question').allTextContents();
  expect(texts).toHaveLength(8);
  for(let s=0;s<3;s++)await expect(sections.nth(s).locator('.print-question')).toHaveCount([3,3,2][s]);
  const sectionsByText=await Promise.all([0,1,2].map(i=>sections.nth(i).locator('.print-question .question-stem').allTextContents()));
  expect(sectionsByText[0].join(' ')).toContain('Which SI unit measures acceleration?');
  expect(sectionsByText[0][2]).toContain('Which SI unit measures acceleration?');
  expect(sectionsByText[1].join(' ')).toContain('Area under velocity–time graph?');
  expect(sectionsByText[2][0]).toContain('Distance and displacement');
  expect(sectionsByText[2][1]).toContain('Closed flask mass');
  const allStems=sectionsByText.flat().map(x=>x.replace(/^\d+\.\s*/,'').replace(/\(\d+ marks?\)/g,'').trim());
  expect(new Set(allStems.map(x=>variants.get(x)))).toEqual(new Set(m.sections.flatMap(x=>x.items.map(slot=>slot.id))));
  const formula=allStems.find(x=>formulaNames.includes(x));
  expect(formula).toBeTruthy();seenFormula.push(formula!);
  const nums=await page.locator('.question-stem > strong').allTextContents();
  expect(nums).toEqual(['1.','2.','3.','4.','5.','6.','7.','8.']);
  await page.getByLabel('Answer key',{exact:true}).check();
  const questions=page.locator('.print-question');
  for(let i=0;i<8;i++){
   const q=questions.nth(i),stem=(await q.locator('.question-stem').innerText()).replace(/^\d+\.\s*/,'').replace(/\(\d+ marks?\)/g,'').trim();
   const v=m.sections.flatMap(s=>s.items.flatMap(slot=>slot.variants)).find(v=>v.stem.replace(/<[^>]+>/g,'')===stem)!;
   const letters=await q.locator('.print-choice').allTextContents();
   if(v.choices.length){
    const expected=letters.map((text,j)=>{
     const raw=text.replace(/^[A-Z]\.\s*/, '').trim();
     const choice=v.choices.find(c=>c.html.replace(/<[^>]+>/g,'')===raw);
     return choice&&v.correctChoiceIds.includes(choice.id)?String.fromCharCode(65+j):null;
    }).filter(Boolean).join(', ');
    await expect(q.locator('.key')).toContainText('Answer: '+expected);
   }else await expect(q.locator('.key')).toContainText(v.referenceAnswer.replace(/<[^>]+>/g,''));
  }
  await page.getByLabel('Answer key',{exact:true}).uncheck();
 }
 expect(new Set(seenFormula)).toEqual(new Set(formulaNames));
});

test('T4 — editing clears generated success notice and explains regeneration',async ({page})=>{
 await importAssessment(page,fixture());await generate(page);
 await page.getByRole('button',{name:'1. Author'}).click();
 await page.getByLabel('Title',{exact:true}).fill('Changed title');
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(page.getByText('No current versions')).toBeVisible();
 await expect(page.getByText('Assessment changed or no saved generation found. Generate versions again.')).toBeVisible();
 await expect(page.getByText(/Generated 6 versions/)).toHaveCount(0);
});

test('T5 and T6 — preview and Markdown use matching response space and mark labels',async ({page})=>{
 await importAssessment(page,fixture());await generate(page);
 const written=page.locator('.print-question').filter({hasText:'Distance and displacement'});
 await expect(written.locator('.response-line')).toHaveCount(9);
 await expect(written.locator('.question-stem small')).toHaveText('(4 marks)');
 const one=page.locator('.print-question').filter({hasText:'Which SI unit measures acceleration?'});
 await expect(one.locator('.question-stem small')).toHaveText('(1 mark)');
 const d=page.waitForEvent('download');
 await page.getByRole('button',{name:'Student Markdown'}).click();
 const markdown=await readFile(await (await d).path()!,'utf8');
 expect(markdown).toContain('(1 mark)');
 expect(markdown).toContain('(4 marks)');
 const block=markdown.split('Distance and displacement')[1]?.split('**8.**')[0]??'';
 expect((block.match(/\\_/g)??[]).length).toBeGreaterThanOrEqual(9*20);
});

test('rich text — editor and preview preserve bold, italic, list, super- and subscripts',async ({page})=>{
 const m=fixture();
 m.instructions='<p><strong>Bold directions</strong> and <em>italic directions</em>: H<sub>2</sub>O and x<sup>2</sup></p><ul><li><p>First rule</p></li></ul>';
 m.sections[0].items[0].variants[0].choices[0].html='<p>H<sub>2</sub>O and x<sup>2</sup></p>';
 await importAssessment(page,m);
 await expect(page.locator('.test-title')).toHaveValue(m.title);
 await generate(page);
 await expect(page.locator('.print-page strong').filter({hasText:'Bold directions'})).toBeVisible();
 await expect(page.locator('.print-page em').filter({hasText:'italic directions'})).toBeVisible();
 await expect(page.locator('.print-page li').filter({hasText:'First rule'})).toBeVisible();
 await expect(page.locator('.print-page sub')).toHaveCount(1);
 await expect(page.locator('.print-page sup')).toHaveCount(1);
});
