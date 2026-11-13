import {test,expect} from '@playwright/test';
import {execFile,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';

// Regression 3B2-01, derived from independent 3B.2 evidence ZIP:
// D1-wide.png, D1-middle.png, and corresponding first-page student PDFs.
// Word previously exported all identification fields as one run separated by
// breakable spaces. Writer wrapped "Class:" or "Date:" away from its rule.
const run=promisify(execFile);
const fixture=fileURLToPath(new URL('./fixtures/3b1-original-run.json',import.meta.url));
const canRender=()=>!spawnSync('soffice',['--version']).error&&!spawnSync('pdftotext',['-v']).error;
test.describe('3B2-01: student identification labels stay attached to their writing rules',()=>{
 test.describe.configure({mode:'default',timeout:120_000});
 test.skip(!process.env.CI&&!canRender(),'LibreOffice and Poppler required for pagination audit.');
 for(const profile of [
  {name:'wide',paper:'a4',margin:'1.5',font:'14',spacing:'1.5'},
  {name:'middle',paper:'letter',margin:'1.25',font:'12',spacing:'1.15'},
 ]){
  test(profile.name+' profile renders all six student forms without detached labels',async({page},info)=>{
   await page.goto('./');
   page.on('dialog',dialog=>dialog.accept());
   await page.locator('.header-actions input[type=file]').setInputFiles(fixture);
   await expect(page.getByText('Validation: Ready')).toBeVisible();
   await page.getByRole('button',{name:/Versions & answer keys/}).click();
   await page.getByLabel('Word paper size').selectOption(profile.paper);
   await page.getByLabel('Word margins').selectOption(profile.margin);
   await page.getByLabel('Word font size').selectOption(profile.font);
   await page.getByLabel('Word line spacing').selectOption(profile.spacing);
   const download=page.waitForEvent('download');
   await page.getByRole('button',{name:/Word.*DOCX.*ZIP/i}).click();
   const archive=unzipSync(new Uint8Array(await readFile((await(await download).path())!)));
   expect(Object.keys(archive).filter(name=>name.endsWith('.docx'))).toHaveLength(12);
   const directory=await mkdtemp(join(tmpdir(),'talus-3b2-01-'));
   try{
    const studentFiles=Object.entries(archive).filter(([name])=>/-V[A-F]\\.docx$/.test(name));
    const keyFiles=Object.entries(archive).filter(([name])=>/-V[A-F]-key\\.docx$/.test(name));
    expect(studentFiles).toHaveLength(6);
    expect(keyFiles).toHaveLength(6);
    for(const [name,bytes] of keyFiles){
     const keyXml=strFromU8(unzipSync(bytes)['word/document.xml']);
     for(const label of ['Name','Class','Date'])
      expect(keyXml,name+' must omit student identification fields').not.toContain(label+':');
    }
    const paths:string[]=[];
    for(const [name,bytes] of studentFiles){
     const file=join(directory,name);
     paths.push(file);
     await writeFile(file,bytes);
     const xml=strFromU8(unzipSync(bytes)['word/document.xml']);
     for(const [label,count] of [['Name',30],['Class',14],['Date',14]] as const)
      expect(xml,name+' must keep an editable label/rule pair')
       .toContain(label+':'+String.fromCharCode(160)+'_'.repeat(count));
    }
    await run('soffice',['-env:UserInstallation='+pathToFileURL(join(directory,'lo-profile')).href,
     '--headless','--convert-to','pdf','--outdir',directory,...paths],{timeout:90_000});
    for(const file of paths){
     const pdf=file.replace(/\.docx$/,'.pdf');
     const {stdout}=await run('pdftotext',['-f','1','-l','1','-layout',pdf,'-']);
     await info.attach(profile.name+'-'+file.split('/').pop()+'.txt',{body:stdout,contentType:'text/plain'});
     for(const [label,count] of [['Name',30],['Class',14],['Date',14]] as const){
      const lines=stdout.split(/\r?\n/).filter(line=>line.includes(label+':'));
      expect(lines,profile.name+' '+file+' '+label+' must occur once').toHaveLength(1);
      expect(lines[0],profile.name+' '+file+' '+label+' and writing rule separated')
       .toMatch(new RegExp(label+':\\s*_{4,}'));
     }
    }
   }finally{await rm(directory,{recursive:true,force:true});}
  });
 }
});