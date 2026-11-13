import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';

function docx(stem:string){
 const types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 const document='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1. '+stem+'</w:t></w:r></w:p><w:p><w:r><w:t>Answer: Water.</w:t></w:r></w:p></w:body></w:document>';
 return Buffer.from(zipSync({'[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rels),'word/document.xml':strToU8(document)}));
}
async function upload(page:Page,stem:string){
 await page.getByLabel('Upload assessment',{exact:true}).setInputFiles({name:'local.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx(stem)});
 await page.getByText('AI-assisted DOCX annotation',{exact:true}).click();
}
async function fakeWorker(page:Page){
 await page.addInitScript(()=>{
  class FakeWorker{
   onmessage:((event:{data:unknown})=>void)|null=null;
   postMessage(request:{source:{fingerprint:string;blocks:{text:string}[]}}){
    const {fingerprint,blocks}=request.source;
    this.onmessage?.({data:{type:'progress',text:'Testing local inference'}});
    setTimeout(()=>{
     const annotation={format:'talus-annotation',version:1,fingerprint,sections:[{questions:[{
      type:'shortAnswer',number:{block:'B1',start:0,end:2},stem:[{block:'B1',start:3,end:blocks[0].text.length}],
      key:{label:{block:'B2',start:0,end:7},content:[{block:'B2',start:8,end:blocks[1].text.length}]}
     }]}]};
     this.onmessage?.({data:{type:'result',annotation:JSON.stringify(annotation)}});
    },800);
   }
   terminate(){}
  }
  Object.defineProperty(window,'Worker',{configurable:true,value:FakeWorker});
 });
}
test('2D.2 opt-in validates worker output and still requires teacher review',async({page})=>{
 await fakeWorker(page);
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await upload(page,'What forms?');
 await page.getByRole('button',{name:'Run local AI annotation',exact:true}).click();
 await expect(page.getByText(/Local annotation is ready for teacher review/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Accept reviewed import'})).toBeDisabled();
 await expect(page.getByText(/Proposed answer: Water\./)).toBeVisible();
});
test('2D.2 discards late worker messages after cancel or source replacement',async({page})=>{
 await fakeWorker(page);
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await upload(page,'What forms?');
 await page.getByRole('button',{name:'Run local AI annotation',exact:true}).click();
 await page.getByRole('button',{name:'Cancel local annotation',exact:true}).click();
 await expect(page.getByText(/Local annotation cancelled/)).toBeVisible();
 await page.getByRole('button',{name:'Run local AI annotation',exact:true}).click();
 await upload(page,'What remains?');
 await expect(page.getByRole('button',{name:/Question 1.*What remains/})).toBeVisible();
 await expect(page.getByText(/Local annotation is ready for teacher review/)).toHaveCount(0);
});
test('2D.2 offline setup failure preserves Detect and external annotation',async({page})=>{
 await page.addInitScript(()=>{
  class OfflineWorker{
   onmessage:((event:{data:unknown})=>void)|null=null;
   postMessage(){this.onmessage?.({data:{type:'error',text:'Failed to fetch model artifacts'}});}
   terminate(){}
  }
  Object.defineProperty(window,'Worker',{configurable:true,value:OfflineWorker});
 });
 await page.goto('./');
 await page.getByRole('button',{name:'Import assessment',exact:true}).click();
 await upload(page,'What forms?');
 await page.getByRole('button',{name:'Run local AI annotation',exact:true}).click();
 await expect(page.getByText(/Failed to fetch model artifacts.*Detect/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Detect sections and questions'})).toBeEnabled();
 await expect(page.getByLabel('Annotation JSON',{exact:true})).toBeEditable();
 await expect(page.getByRole('button',{name:/Question 1.*What forms/})).toBeVisible();
});
