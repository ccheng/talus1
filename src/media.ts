/**
 * Milestone 2C.1: self-contained raster images and Word/HTML tables.
 * An uploaded document is untrusted; only data-URI raster images are accepted.
 * Limits are deliberately below common localStorage quotas because Talus also
 * writes a synchronous recovery draft in addition to IndexedDB.
 */
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MiB per image
export const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MiB across unique images
export const ACCEPTED_IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp'] as const;

export interface MediaInspection { html:string; warnings:string[]; imageCount:number; tableCount:number; imageBytes:number }

/** Browser-only processing; called before HTML is sent to the question parser. */
export function inspectImportedMedia(html:string):MediaInspection {
 const doc=new DOMParser().parseFromString(html,'text/html');
 const warnings:string[]=[];
 let imageCount=0, imageBytes=0;
 const seen=new Set<string>();
 const tables=Array.from(doc.body.querySelectorAll('table'));
 for(const table of tables){
  // A table without cells is almost certainly a conversion problem.
  if(!table.querySelector('td,th'))warnings.push('Imported table contains no cells; review the original Word table.');
 }
 for(const img of Array.from(doc.body.querySelectorAll('img'))){
  imageCount++;
  const src=img.getAttribute('src')??'';
  const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
  let reason='';
  if(!match)reason='Unsupported image format or external image reference';
  else {
   const bytes=Math.floor(match[2].length*3/4)-(match[2].endsWith('==')?2:match[2].endsWith('=')?1:0);
   if(bytes>MAX_IMAGE_BYTES)reason='Embedded image exceeds the 1 MiB per-image limit';
   else if(!seen.has(src)){
    seen.add(src);imageBytes+=bytes;
    if(imageBytes>MAX_TOTAL_IMAGE_BYTES)reason='Embedded images exceed the 3 MiB assessment limit';
   }
  }
  if(reason){
   warnings.push(reason+' (image '+imageCount+'); replace or resize this image before generating.');
   const replacement=doc.createElement('strong');
   replacement.textContent='[Embedded image '+imageCount+' unavailable: '+reason+']';
   img.replaceWith(replacement);
   continue;
  }
  if(!img.hasAttribute('alt'))img.setAttribute('alt','Imported illustration '+imageCount);
 }
 return {html:doc.body.innerHTML,warnings,imageCount,tableCount:tables.length,imageBytes};
}

/** Used for fail-closed validation of restored JSON without depending on DOM. */
export function embeddedAssetWarnings(html:string):string[]{
 const warnings:string[]=[];
 const imageTags=html.match(/<img\b[^>]*>/gi)??[];
 for(const tag of imageTags){
  const match=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
  const src=match?.[1]??'';
  const data=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
  if(!data)warnings.push('Image is not a supported embedded raster data URI.');
  else {
   const bytes=Math.floor(data[2].length*3/4)-(data[2].endsWith('==')?2:data[2].endsWith('=')?1:0);
   if(bytes>MAX_IMAGE_BYTES)warnings.push('Image exceeds the 1 MiB limit.');
  }
 }
 return warnings;
}
