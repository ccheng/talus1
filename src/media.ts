import {unzipSync,strFromU8} from 'fflate';
/**
 * Milestone 2C.1: self-contained raster images and Word/HTML tables.
 * An uploaded document is untrusted; only data-URI raster images are accepted.
 * Limits are deliberately below common localStorage quotas because Talus also
 * writes a synchronous recovery draft in addition to IndexedDB.
 */
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MiB per image
export const MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB across unique images
export const ACCEPTED_IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp'] as const;

export interface MediaInspection { html:string; warnings:string[]; imageCount:number; tableCount:number; imageBytes:number }

/** Browser-only processing; called before HTML is sent to the question parser. */
export async function inspectImportedMedia(html:string):Promise<MediaInspection> {
 const doc=new DOMParser().parseFromString(html,'text/html');
 const warnings:string[]=[];
 let imageCount=0, imageBytes=0;
 const seen=new Set<string>();
 const decoded=new Map<string,boolean>();
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
    if(imageBytes>MAX_TOTAL_IMAGE_BYTES)reason='Embedded images exceed the 2 MiB assessment limit';
   }
  }
  if(!reason&&match){
   // MIME, base64 syntax and file size do not prove that a Word raster is
   // decodable. Inspect the actual bytes before accepting the question.
   let valid=decoded.get(src);
   if(valid===undefined){
    try{
     const raw=atob(match[2]);
     const bytes=new Uint8Array(raw.length);
     for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
     if(typeof createImageBitmap==='function'){
      const bitmap=await createImageBitmap(new Blob([bytes],{type:match[1]}));
      valid=bitmap.width>0&&bitmap.height>0;
      bitmap.close();
     }else{
      valid=await new Promise<boolean>(resolve=>{
       const image=new Image();
       image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);
       image.onerror=()=>resolve(false);
       image.src=src;
      });
     }
    }catch{valid=false;}
    decoded.set(src,valid);
   }
   if(!valid)reason='Embedded image could not be decoded (corrupt or unsupported image data)';
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


/**
 * Match Word wp:extent dimensions with embedded image elements in drawing
 * order. Convert EMUs to CSS px at 96 dpi. When conversion omits a drawing,
 * do not guess an association: preserve content but skip size assignment.
 */
export function applyWordImageDimensions(html:string,wordFile:ArrayBuffer):string{
 try{
  const entries=unzipSync(new Uint8Array(wordFile));
  const xml=entries['word/document.xml'];
  if(!xml)return html;
  const wordDoc=new DOMParser().parseFromString(strFromU8(xml),'application/xml');
  const a='http://schemas.openxmlformats.org/drawingml/2006/main';
  const wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const dimensions:{width:number;height:number}[]=[];
  const drawingNs='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for(const drawing of Array.from(wordDoc.getElementsByTagNameNS(drawingNs,'drawing'))){
   const blip=drawing.getElementsByTagNameNS(a,'blip')[0];
   if(!blip?.getAttributeNS(rel,'embed'))continue; // linked images are not embedded
   const extent=drawing.getElementsByTagNameNS(wp,'extent')[0];
   if(!extent)continue;
   const cx=Number(extent.getAttribute('cx')),cy=Number(extent.getAttribute('cy'));
   if(cx>0&&cy>0&&Number.isFinite(cx)&&Number.isFinite(cy))
    dimensions.push({width:Math.max(1,Math.round(cx/914400*96)),height:Math.max(1,Math.round(cy/914400*96))});
  }
  const doc=new DOMParser().parseFromString(html,'text/html');
  const images=Array.from(doc.body.querySelectorAll('img'));
  if(images.length!==dimensions.length)return html;
  images.forEach((img,i)=>{
   img.setAttribute('width',String(dimensions[i].width));
   img.setAttribute('height',String(dimensions[i].height));
  });
  return doc.body.innerHTML;
 }catch{return html;}
}
