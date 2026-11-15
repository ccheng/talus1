import {uid} from './model';
import type {ImportDraft,ImportSection,SourceLine} from './importParser';

export interface ImportRange {
 id:string;
 sectionId:string;
 cueLine:number;
 cueText:string;
 cueHtml:string;
 sharedLines:number[];
 sharedHtml:string;
 first:number;
 last:number;
 precedingQuestionId?:string;
 fallbackOffset:number;
 fallbackLocation:'assessment'|'section'|'question';
 resolution?:{kind:'decline'}|{kind:'group';children:string[]};
}

export function readRangeCue(line:SourceLine){
 const cue=line.text.replace(/^#{1,6}\s*/,'').trim();
 // Match an entire cue, so only its structural text is replaced during export.
 if(/<(?:img|table|math)\b/i.test(line.html))return undefined;
 const match=/^(?:(?:use (?:the following(?: information| passage| diagram| figure| table)?|the (?:passage|diagram|figure|table|information)(?: below)?) (?:for|to answer)|(?:the following|the (?:passage|diagram|figure|table|information)(?: below)?) (?:applies to|is for))\s+)?questions\s+(\d{1,3})\s*(?:[-–—]|to|through)\s*(\d{1,3})\s*[.:]?$/i.exec(cue);
 return match?{first:Number(match[1]),last:Number(match[2]),cueText:cue}:undefined;
}

export function createImportRange(cue:SourceLine,shared:SourceLine[],section:ImportSection,precedingQuestionId:string|undefined,
 fallbackLocation:ImportRange['fallbackLocation'],fallbackOffset:number):ImportRange{
 return {id:uid(),sectionId:section.id,cueLine:cue.number,...readRangeCue(cue)!,cueHtml:wrapSourceBlock(cue.html),
  sharedLines:shared.map(line=>line.number),sharedHtml:shared.map(line=>wrapSourceBlock(line.html)).join(''),
  precedingQuestionId,fallbackLocation,fallbackOffset};
}

function wrapSourceBlock(html:string){
 return /^\s*<(?:p|ul|ol|li|h[1-6]|blockquote|table)\b/i.test(html)?html:'<p>'+html+'</p>';
}

export function locateImportRange(draft:ImportDraft,range:ImportRange,first=range.first,last=range.last){
 const section=draft.sections.find(s=>s.id===range.sectionId);
 if(!section)return {reason:'The source section no longer exists.'};
 if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<1||first>=last||last>999)
  return {reason:'Use an increasing range of at least two source question numbers.'};
 if(!range.sharedHtml.trim())return {reason:'No shared source material was found between the cue and the next question.'};
 const start=section.questions.findIndex(q=>q.sourceNumber===first&&q.sourceStart>range.cueLine);
 if(start<0)return {reason:'The first requested question is missing after the cue in this section.'};
 const missing=Array.from({length:last-first+1},(_,index)=>first+index)
  .find(number=>!section.questions.some(q=>q.sourceNumber===number&&q.sourceStart>range.cueLine));
 if(missing!==undefined)return {reason:'Source question '+missing+' is missing after the cue in this section.'};
 const questions=section.questions.slice(start,start+last-first+1);
 if(questions.length!==last-first+1||questions.some((q,i)=>q.sourceNumber!==first+i||q.sourceStart<=range.cueLine))
  return {reason:'The requested source numbers must be consecutive in one section.'};
 const repeated=section.questions.some((q,i)=>(i<start||i>=start+questions.length)&&q.sourceNumber!==undefined&&q.sourceNumber>=first&&q.sourceNumber<=last);
 if(repeated)return {reason:'A requested source number appears more than once in this section.'};
 const ids=questions.map(q=>q.id);
 const overlap=draft.ranges?.some(other=>other.id!==range.id&&other.resolution?.kind==='group'&&other.resolution.children.some(id=>ids.includes(id)));
 if(overlap)return {reason:'These questions overlap another confirmed range.'};
 return {section,questions};
}

export function resolveImportRange(draft:ImportDraft,id:string,kind:'group'|'decline',first?:number,last?:number):boolean{
 const range=draft.ranges?.find(candidate=>candidate.id===id);
 if(!range)return false;
 if(kind==='decline'){range.resolution={kind};return true;}
 const found=locateImportRange(draft,range,first,last);
 if(!found.questions)return false;
 range.resolution={kind,children:found.questions.map(q=>q.id)};
 return true;
}

export function confirmedImportRange(draft:ImportDraft,range:ImportRange){
 if(range.resolution?.kind!=='group')return undefined;
 const ids=range.resolution.children;
 const section=draft.sections.find(s=>s.id===range.sectionId);
 const first=section?.questions.find(q=>q.id===ids[0])?.sourceNumber;
 const last=section?.questions.find(q=>q.id===ids.at(-1))?.sourceNumber;
 if(first===undefined||last===undefined)return undefined;
 const found=locateImportRange(draft,range,first,last);
 return found.questions&&found.questions.every((q,i)=>q.id===ids[i])&&found.questions.length===ids.length?found.questions:undefined;
}

export function unresolvedImportRanges(draft:ImportDraft){
 return (draft.ranges??[]).filter(range=>range.resolution?.kind!=='decline'&&!confirmedImportRange(draft,range));
}

/** Reattach declined or unresolved material where ordinary parsing placed it. */
export function restoreOrdinaryRangePlacement(draft:ImportDraft):ImportDraft {
 if(!draft.ranges?.length)return draft;
 const restored=structuredClone(draft);
 for(const range of [...draft.ranges].reverse()){
  if(confirmedImportRange(draft,range))continue;
  const material=range.cueHtml+range.sharedHtml;
  const insert=(html:string)=>range.fallbackLocation==='question'?html+material:
   html.slice(0,range.fallbackOffset)+material+html.slice(range.fallbackOffset);
  const section=restored.sections.find(s=>s.id===range.sectionId);
  const previous=restored.sections.flatMap(s=>s.questions).find(q=>q.id===range.precedingQuestionId);
  if(range.fallbackLocation==='question'&&previous)previous.stem=insert(previous.stem);
  else if(range.fallbackLocation==='assessment'||!section)restored.instructions=insert(restored.instructions??'');
  else section.instructions=insert(section.instructions);
 }
 return restored;
}
