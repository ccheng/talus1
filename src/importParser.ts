import { createSection,createSlot,createVariant,uid,type MasterTest,type QuestionType,type Section,type Slot } from './model';

export interface SourceLine { text:string; html:string; number:number }
export interface ImportQuestion {
 id:string; sourceStart:number; sourceEnd:number; stem:string; choices:string[]; correct:number[];
 answer:string; type:QuestionType; marks:number; responseLines:number; warnings:string[];
}
export interface ImportSection {
 id:string; title:string; proficiency:string; instructions:string; questions:ImportQuestion[];
}
export interface ImportDraft { title:string; source:string; lines:SourceLine[]; sections:ImportSection[]; warnings:string[]; format:'plain'|'markdown'|'docx'|'html' }

const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function textLines(source:string):SourceLine[] {
 return source.replace(/\r\n?/g,'\n').split('\n').map((text,i)=>({text,html:escape(text),number:i+1}));
}
export function htmlLines(html:string):SourceLine[]{
 const document=new DOMParser().parseFromString(html,'text/html');
 const output:SourceLine[]=[];
 function append(html:string,text:string) {if(text.trim())output.push({text:text.trim(),html:html.trim(),number:output.length+1});}
 function walk(root:Element){
  for(const child of Array.from(root.children)){
   const tag=child.tagName.toLowerCase();
   if(['p','h1','h2','h3','h4','li','pre','blockquote'].includes(tag)){
    const prefix=tag.startsWith('h')?'# ':'';
    append(prefix+child.innerHTML,prefix+(child.textContent??''));continue;
   }
   if(['ul','ol','div','section','article','body'].includes(tag)){walk(child);continue;}
   append(child.innerHTML,child.textContent??'');
  }
 }
 walk(document.body);return output;
}
const sectionHeader=/^(?:#{1,4}\s*)?(?:(?:section|part|topic|level)\s+[\w\d]+\s*[:.\-–)]\s*.+|(?:base|proficient|proficiency|exemplary|foundations|applications|transfer|knowledge|application|understanding)(?:\s+(?:section|questions|level))?\s*:?|(?:#{1,4}\s+.+))$/i;
const numbered=/^\s*(?:question\s+)?(\d{1,3})\s*[.)]\s+(.+)$/i;
const choice=/^\s*(?:\(?([A-Ha-h])\)|([A-Ha-h])[.)])\s+(.+)$/;
const answer=/^\s*(?:answer|correct(?:\s+answer)?|key|solution)\s*[:\-]\s*(.+)$/i;
const marks=/\s*\((\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\)\s*$/i;
const sectionLevel=(s:string)=>/base/i.test(s)?'Base':/proficien|applications?/i.test(s)?'Proficient':/exemplar|transfer/i.test(s)?'Exemplary':'';
const htmlText=(str:string)=>str.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function stripPrefix(html:string,pattern:RegExp,plain:string):string{
 const clean=htmlText(html);if(clean.trim()===plain.trim())return escape(plain.replace(pattern,''));
 return html; // do not discard formatting when a Word numbering run spans rich text
}
function isHeader(text:string,next?:SourceLine):boolean{
 const t=text.trim();
 if(!sectionHeader.test(t))return false;
 if(/^#{1,4}\s+/.test(t))return true;
 if(/^(section|part|topic|level)\b/i.test(t))return true;
 if(/^(base|proficient|exemplary|foundations|applications|transfer|knowledge|application|understanding)/i.test(t)){
  return !next || !!numbered.exec(next.text.trim()) || !!/\bquestions?\b/i.exec(t);
 }
 return false;
}
function newQuestion(index:number,stem:string,html:string):ImportQuestion {
 return {id:uid(),sourceStart:index,sourceEnd:index,stem:html||escape(stem),choices:[],correct:[],answer:'',type:'shortAnswer',marks:1,responseLines:2,warnings:[]};
}
function newSection(title:string):ImportSection {return {id:uid(),title,proficiency:sectionLevel(title),instructions:'',questions:[]};}
function classify(q:ImportQuestion){
 if(q.choices.length>=2)q.type=q.correct.length>1?'multipleSelect':'singleChoice';
 else if(q.answer||/\b(explain|justify|discuss|describe|compare|evaluate)\b/i.test(htmlText(q.stem))){
  q.type=/\b(explain|justify|discuss|describe|evaluate)\b/i.test(htmlText(q.stem))?'writtenResponse':'shortAnswer';
 }
 q.responseLines=q.type==='writtenResponse'?8:2;
 q.warnings=[];
 if(!htmlText(q.stem).trim())q.warnings.push('Empty question prompt');
 if(q.choices.length===1)q.warnings.push('Only one answer choice detected');
 if(q.choices.length>=2 && !q.correct.length)q.warnings.push('Correct answer not identified');
 if(!q.choices.length && !htmlText(q.answer).trim())q.warnings.push('Reference answer not identified');
}
export function parseLines(lines:SourceLine[],title='Imported assessment',format:ImportDraft['format']='plain'):ImportDraft{
 const sections:ImportSection[]=[];let current=newSection('Section 1');sections.push(current);
 let q:ImportQuestion|undefined;let runningQuestion=0;let trailing:number[]=[];
 const meaningful=lines.filter(x=>x.text.trim());
 const flush=()=>{if(q){classify(q);current.questions.push(q);q=undefined;}};
 for(let ix=0;ix<meaningful.length;ix++){
  const line=meaningful[ix];const raw=line.text.trim();const next=meaningful[ix+1];
  if(isHeader(raw,next)){
   flush();const heading=raw.replace(/^#{1,4}\s*/, '').trim();
   if(!current.questions.length && !current.instructions && sections.length===1 && current.title==='Section 1'){
     current.title=heading;current.proficiency=sectionLevel(heading);
   }else{current=newSection(heading);sections.push(current);}
   continue;
  }
  const a=answer.exec(raw);
  if(a && q){
   q.sourceEnd=line.number;
   const letters=a[1].match(/\b[A-H]\b/gi);
   if(q.choices.length>=2 && letters && letters.length && letters.every(l=>l.toUpperCase().charCodeAt(0)-65<q!.choices.length)){
    q.correct=[...new Set(letters.map(l=>l.toUpperCase().charCodeAt(0)-65))];
   }else q.answer=escape(a[1]);
   continue;
  }
  const n=numbered.exec(raw);
  if(n){
   flush();runningQuestion++;
   const m=marks.exec(n[2]);const stem=m?n[2].replace(marks,'').trim():n[2].trim();
   q=newQuestion(line.number,stem,stripPrefix(line.html,/^\s*(?:question\s+)?\d{1,3}\s*[.)]\s+/i,stem));
   if(m)q.marks=Number(m[1]);
   continue;
  }
  const c=choice.exec(raw);
  if(c&&q){
   const index=((c[1]||c[2]).toUpperCase().charCodeAt(0)-65);
   // Only classify as a choice when the lettering advances in sequence.
   if(index===q.choices.length){
    q.choices.push(stripPrefix(line.html,/^\s*(?:\(?[A-Ha-h]\)|[A-Ha-h][.)])\s+/,c[3]));
    q.sourceEnd=line.number;continue;
   }
  }
  if(q){
   q.stem+='<p>'+line.html+'</p>';q.sourceEnd=line.number;
  }else if(!sections.some(s=>s.questions.length) && /^\s*(?:title)\s*:/i.test(raw)){
   title=raw.replace(/^\s*title\s*:/i,'').trim()||title;
  }else{
   current.instructions+=(current.instructions?'\n':'')+line.html;
   trailing.push(line.number);
  }
 }
 flush();
 const warnings:string[]=[];
 if(!runningQuestion)warnings.push('No numbered questions detected. Review the original text and split into questions manually.');
 if(trailing.length)warnings.push('Unnumbered introductory text was kept as section instructions.');
 if(!sections.some(s=>s.questions.length))warnings.push('No questions created.');
 for(const s of sections)for(const question of s.questions)if(question.warnings.length)warnings.push(s.title+': '+question.warnings.join('; '));
 return {title,source:lines.map(x=>x.text).join('\n'),lines,sections,warnings,format};
}
export function parseText(source:string,title='Imported assessment'):ImportDraft{return parseLines(textLines(source),title,'plain');}
export function parseHtml(html:string,title='Imported assessment',format:ImportDraft['format']='html'):ImportDraft{return parseLines(htmlLines(html),title,format);}
export function reviewWarnings(draft:ImportDraft):string[]{
 return draft.sections.flatMap(s=>s.questions.flatMap(q=>{
  classify(q);return q.warnings.map(w=>s.title+': '+w);
 }));
}
export function toTalusSections(draft:ImportDraft):Section[]{
 return draft.sections.filter(s=>s.questions.length>0||s.instructions.trim()).map(s=>{
  const section=createSection();
  section.title=s.title;section.proficiency=s.proficiency;section.instructions=s.instructions.includes('<')?s.instructions:'<p>'+escape(s.instructions)+'</p>';
  section.items=s.questions.map(q=>{
   const slot=createSlot();const type=q.type;const variant=createVariant(type);
   variant.stem=q.stem.includes('<')?q.stem:'<p>'+escape(q.stem)+'</p>';
   variant.points=q.marks;variant.responseLines=q.responseLines;
   if(type==='singleChoice'||type==='multipleSelect'){
    variant.choices=q.choices.map(html=>({id:uid(),html:html.includes('<')?html:'<p>'+escape(html)+'</p>'}));
    variant.correctChoiceIds=q.correct.filter(i=>i>=0&&i<variant.choices.length).map(i=>variant.choices[i].id);
   }else variant.referenceAnswer=q.answer.includes('<')?q.answer:'<p>'+escape(q.answer)+'</p>';
   slot.variants=[variant];return slot;
  });
  return section;
 });
}
export function mergeIntoMaster(base:MasterTest,draft:ImportDraft,mode:'replace'|'append'):MasterTest{
 const sections=toTalusSections(draft);
 if(!sections.length)throw Error('No sections or questions to import.');
 if(mode==='append')return {...base,sections:[...base.sections,...sections],lastGeneration:undefined,updatedAt:new Date().toISOString()};
 return {...base,title:draft.title,instructions:'',sections,lastGeneration:undefined,updatedAt:new Date().toISOString()};
}
