import {expect,test} from '@playwright/test';
import {generationRunId} from '../src/generate';
import type {MasterTest} from '../src/model';
import {fixture,generate,importAssessment} from './fixtures';

test('6 restores a JSON backup when IndexedDB is denied and local storage is usable',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get:()=>undefined});});
 await page.goto('./');
 await expect(page.getByLabel('Title',{exact:true})).toBeVisible();
 await importAssessment(page,fixture('LocalStorage recovery'));
 await page.reload();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('LocalStorage recovery');
});

test('6 retains an older selected backup when only IndexedDB is available',async({page})=>{
 await page.addInitScript(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(key==='talus-draft-v1')throw new DOMException('Storage disabled for this draft','QuotaExceededError');
   return original.call(this,key,value);
  };
 });
 await page.goto('./');
 await importAssessment(page,fixture('New record','2030-01-01T00:00:00.000Z'));
 const older=fixture('Old selected record','2020-01-01T00:00:00.000Z');
 older.id='old-selected-id';
 await importAssessment(page,older);
 await expect(page.locator('.save-state')).toHaveText('Saved locally');
 await page.reload();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Old selected record');
});

test('6 invalid saved generation restores the assessment without reusing the previous run',async({page})=>{
 await page.goto('./');
 await importAssessment(page,fixture('Original generated test'));
 await generate(page);
 await expect(page.getByRole('option',{name:'Version F'})).toHaveCount(1);
 const backup=fixture('Other assessment with invalid answer');
 backup.sections[0].items[0].variants[0].correctChoiceIds=[];
 const seed='invalid-backup-generation';
 backup.lastGeneration={count:6,seed,sourceUpdatedAt:backup.updatedAt,
  runId:generationRunId(backup as unknown as MasterTest,6,seed),manifests:[]};
 await importAssessment(page,backup);
 await page.getByRole('button',{name:'2. Versions & answer keys'}).click();
 await expect(page.getByText('No current versions')).toBeVisible();
 await expect(page.getByRole('option',{name:'Version F'})).toHaveCount(0);
});

test('6 malformed replacement upload cannot revive the prior source through Detect',async({page})=>{
 await page.goto('./');
 await importAssessment(page,fixture('Keep active assessment'));
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 const upload=page.getByLabel('Upload assessment',{exact:true});
 await upload.setInputFiles({name:'prior.txt',mimeType:'text/plain',buffer:Buffer.from('1. Prior uploaded question?\nAnswer: Yes')});
 await expect(page.locator('.import-question-toggle')).toContainText('Prior uploaded question');
 await upload.setInputFiles({name:'broken.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('not a DOCX')});
 await expect(page.getByRole('status').filter({hasText:'File import failed'})).toBeVisible();
 await expect(page.getByLabel('Assessment source')).toHaveValue('');
 await expect(page.getByRole('button',{name:'Detect sections and questions'})).toBeDisabled();
 await expect(page.getByText('Loaded: broken.docx')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Accept reviewed import'})).toHaveCount(0);
 await page.getByRole('button',{name:'1. Author'}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Keep active assessment');
});

test('6 exposes import review expansion and keyboard focus on an actual editor',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await page.getByLabel('Assessment source').fill('1. Ready for review?\nAnswer: Yes');
 await page.getByRole('button',{name:'Detect sections and questions'}).click();
 const question=page.locator('.import-question-toggle');
 await expect(question).toHaveAttribute('aria-expanded','true');
 await question.focus();
 await page.keyboard.press('Enter');
 await expect(question).toHaveAttribute('aria-expanded','false');
 await page.keyboard.press('Enter');
 await expect(question).toHaveAttribute('aria-expanded','true');
 const editor=page.getByRole('textbox',{name:'Review question prompt visually',exact:true});
 await editor.focus();
 await expect(editor).toHaveCSS('outline-style','solid');
});
