import { createSection,createSlot,createVariant,uid,type MasterTest,type QuestionType,type Section } from './model';

export interface SourceLine { text:string; html:string; number:number }
export interface ImportQuestion {
 id:string; sourceStart:number; sourceEnd:number; sourceNumber?:number; stem:string; choices:string[]; correct:number[];
 answer:string; type:QuestionType; marks:number; responseLines:number; warnings:string[]; reviewFlags?:string[];
}
export interface ImportSection {
 id:string; title:string; proficiency:string; instructions:string; questions:ImportQuestion[];
}
export interface ImportDraft { title:string; instructions?:string; source:string; lines:SourceLine[]; sections:ImportSection[]; warnings:string[]; format:'plain'|'markdown'|'docx'|'html' }

const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function textLines(source:string):SourceLine[] {
 return source.replace(/\r\n?/g,'\n').split('\n').map((text,i)=>({text,html:escape(text),number:i+1}));
}
export function htmlLines(html:string):SourceLine[]{
 const document=new DOMParser().parseFromString(html,'text/html');
 const output:SourceLine[]=[];
 function append(html:string,text:string){
  if(text.trim())output.push({text:text.trim(),html:html.trim(),number:output.length+1});
 }
 function walk(root:Element){
  for(const child of Array.from(root.children)){
   const tag=child.tagName.toLowerCase();
   if(tag==='ol'){
    let index=Number(child.getAttribute('start')||'1');
    for(const li of Array.from(child.children)){
     if(li.tagName.toLowerCase()!=='li')continue;
     append(index+'. '+li.innerHTML,index+'. '+(li.textContent??''));index++;
    }
    continue;
   }
   if(tag==='ul'){
    for(const li of Array.from(child.children)){
     if(li.tagName.toLowerCase()==='li')append('<li>'+li.innerHTML+'</li>','- '+(li.textContent??''));
    }
    continue;
   }
   if(['p','h1','h2','h3','h4','li','pre','blockquote'].includes(tag)){
    const heading=tag.startsWith('h')?'#'.repeat(Number(tag[1]))+' ':'';
    append(heading+child.innerHTML,heading+(child.textContent??''));continue;
   }
   if(['div','section','article','body'].includes(tag)){walk(child);continue;}
   append(child.innerHTML,child.textContent??'');
  }
 }
 walk(document.body);return output;
}
const sectionHeader=/^(?:#{1,4}\s*)?(?:(?:section|part|topic|level)\s+[\w\d]+\s*[:.\-–)]\s*.+|(?:base|proficient|proficiency|exemplary|foundations|applications|transfer|knowledge|application|understanding)(?:\s+(?:section|questions|level))?\s*:?|(?:#{1,4}\s+.+))$/i;
const numbered=/^\s*(?:(?:question|Q)\s*)?(\d{1,3})\s*[.)]\s*(.+)$/i;
const choice=/^\s*(?:\(?([A-Ha-h])\)|([A-Ha-h])[.)])\s*(.*)$/;
const answer=/^\s*(?:answer|correct(?:\s+answer)?|key|solution)\s*[:\-]\s*(.+)$/i;
const marks=/\s*\((\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\)\s*$/i;
const sectionLevel=(s:string)=>/base/i.test(s)?'Base':/proficien|applications?/i.test(s)?'Proficient':/exemplar|transfer/i.test(s)?'Exemplary':'';
const htmlText=(str:string)=>str.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function stripPrefix(html:string,pattern:RegExp,plain:string):string{
 const direct=html.replace(pattern,'');
 if(direct!==html)return direct;
 // Text with a whole bold/italic wrapper: remove numbering inside the wrapper.
 const wrapped=/^(<(?:strong|b|em|i)(?:\s[^>]*)?>)([\s\S]*)(<\/(?:strong|b|em|i)>)$/i.exec(html.trim());
 if(wrapped){
  const modified=wrapped[2].replace(pattern,'');
  if(modified!==wrapped[2])return wrapped[1]+modified+wrapped[3];
 }
 const raw=htmlText(html);
 if(raw.trim()===plain.trim())return escape(plain.replace(pattern,''));
 return html;
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
 return {id:uid(),sourceStart:index,sourceEnd:index,stem:html||escape(stem),choices:[],correct:[],answer:'',type:'shortAnswer',marks:1,responseLines:2,warnings:[],reviewFlags:[]};
}
function newSection(title:string):ImportSection {return {id:uid(),title,proficiency:sectionLevel(title),instructions:'',questions:[]};}
function classify(q:ImportQuestion){
 if(q.choices.length>0)q.type=q.correct.length>1?'multipleSelect':'singleChoice';
 else q.type=/\\b(explain|justify|discuss|describe|compare|evaluate)\\b/i.test(htmlText(q.stem))?'writtenResponse':'shortAnswer';
 q.responseLines=q.type==='writtenResponse'?8:2;
 q.warnings=[];
}
const numberedKey=/^\\s*(?:question\\s+|Q\\s*)?(\\d{1,3})\\s*[.)]\\s*(.+)$/i;
const keyHeading=/^(?:#{1,6}\\s*)?(?:answer\\s*key|solutions?|marking\\s*key|answer\\s*sheet)\\s*:?$/i;
const numberedPrefix=/^\\s*(?:(?:question|Q)\\s*)?\\d{1,3}\\s*[.)]\\s*/i;
const choicePrefix=/^\\s*(?:\\(?[A-Ha-h]\\)|[A-Ha-h][.)])\\s*/;
function paragraph(html:string):string {
 if(/^\\s*<(?:p|ul|ol|li|h[1-6]|blockquote)\\b/i.test(html))return html;
 return '<p>'+html+'</p>';
}
export function parseLines(lines:SourceLine[],title='Imported assessment',format:ImportDraft['format']='plain'):ImportDraft {
 const sections:ImportSection[]=[];let current=newSection('Section 1');
 let q:ImportQuestion|undefined;let seenQuestions=false;let keyMode=false;
 let preamble:string[]=[];let instructions='';let sourceTitle=false;
 const warnings:string[]=[];const detachedKeys:{number:number;value:string}[]=[];
 const meaningful=lines.filter(line=>line.text.trim());
 const flush=()=>{if(q){classify(q);current.questions.push(q);q=undefined;seenQuestions=true;}};
 for(let i=0;i<meaningful.length;i++){
  const line=meaningful[i],raw=line.text.trim(),next=meaningful[i+1];
  if(keyHeading.test(raw)){
   flush();if(current.questions.length||current.instructions.trim())sections.push(current);
   current=newSection('Section 1');keyMode=true;continue;
  }
  if(keyMode){
   const match=numberedKey.exec(raw);
   if(match)detachedKeys.push({number:Number(match[1]),value:match[2].trim()});
   else if(raw)warnings.push('Unmapped answer-key content: '+raw);
   continue;
  }
  if(!seenQuestions&&!q&&/^title\\s*:/i.test(raw)){
   title=raw.replace(/^title\\s*:/i,'').trim()||title;sourceTitle=true;continue;
  }
  if(!seenQuestions&&!q&&/^#\\s+/.test(raw)&&!/(?:section|part|topic|level)\\s+\\w+/i.test(raw)){
   title=raw.replace(/^#\\s+/,'').trim();sourceTitle=true;continue;
  }
  if(isHeader(raw,next)){
   flush();
   if(current.questions.length||current.instructions.trim())sections.push(current);
   current=newSection(raw.replace(/^#{1,4}\\s*/, '').trim());continue;
  }
  // DOCX Title is often its first plain paragraph, followed by instructions and a section.
  if(!seenQuestions&&!q&&!sourceTitle&&!sections.length&&current.title==='Section 1'&&i===0&&
     !numbered.test(raw)&&!choice.test(raw)&&!/^[-*]\\s/.test(raw)&&
     (format==='docx'||format==='html') && meaningful.some(l=>/^(?:section|part)\\s+\\d+/i.test(l.text.trim()))){
    title=raw.replace(/^#{1,6}\\s*/,'');sourceTitle=true;continue;
  }
  const n=numbered.exec(raw);
  if(n){
   flush();
   const marksMatch=marks.exec(n[2]),stem=marksMatch?n[2].replace(marks,'').trim():n[2].trim();
   q=newQuestion(line.number,stem,stripPrefix(line.html,numberedPrefix,raw));
   q.sourceNumber=Number(n[1]);if(marksMatch)q.marks=Number(marksMatch[1]);
   continue;
  }
  const a=answer.exec(raw);
  if(a&&q){
   q.sourceEnd=line.number;const value=a[1].trim();
   if(q.choices.length){
    const letters=/^[A-H](?:\\s*[,;&+]\\s*[A-H])*$/i.test(value)
      ?value.match(/[A-H]/gi)??[]:[];
    if(letters.length&&letters.every(l=>l.toUpperCase().charCodeAt(0)-65<q!.choices.length)){
     q.correct=[...new Set(letters.map(l=>l.toUpperCase().charCodeAt(0)-65))];
    }else q.reviewFlags?.push('Answer '+value+' does not match the detected answer choices');
   }else q.answer=escape(value);
   continue;
  }
  const choiceMatch=choice.exec(raw);
  if(choiceMatch&&q){
   const index=(choiceMatch[1]||choiceMatch[2]).toUpperCase().charCodeAt(0)-65;
   if(index===q.choices.length){
    q.choices.push(stripPrefix(line.html,choicePrefix,raw));q.sourceEnd=line.number;
   }else{
    q.reviewFlags?.push('Out-of-order answer choice '+(choiceMatch[1]||choiceMatch[2]).toUpperCase());
    q.choices.push(stripPrefix(line.html,choicePrefix,raw));q.sourceEnd=line.number;
   }
   continue;
  }
  if(q){
   if(/^[-*]\\s+/.test(raw)||/^<li\\b/i.test(line.html)){
    const rendered=line.html.startsWith('<li')?line.html:'<li>'+line.html.replace(/^[-*]\\s+/,'')+'</li>';
    q.stem=q.stem.endsWith('</ul>')?q.stem.slice(0,-5)+rendered+'</ul>':q.stem+'<ul>'+rendered+'</ul>';
   }else q.stem+=paragraph(line.html);
   q.sourceEnd=line.number;
  }else if(!seenQuestions&&sections.length===0&&current.title==='Section 1'){
   preamble.push(line.html);
  }else current.instructions+=(current.instructions?'\\n':'')+paragraph(line.html);
 }
 flush();
 if(!keyMode && (current.questions.length||current.instructions.trim()))sections.push(current);
 if(!sections.length)sections.push(current);
 if(preamble.length){
  // A leading H1/Title and instructions belong to the master, not a placeholder section.
  instructions=preamble.map(paragraph).join('\\n');
 }
 if(detachedKeys.length){
  const all=sections.flatMap(s=>s.questions);
  const numbers=new Map<number,ImportQuestion[]>();
  for(const item of all){
   const k=item.sourceNumber??0;
   numbers.set(k,[...(numbers.get(k)??[]),item]);
  }
  for(const key of detachedKeys){
   const matches=numbers.get(key.number)??[];
   if(matches.length!==1){
    warnings.push('Answer-key entry '+key.number+' could not be matched uniquely: '+key.value);continue;
   }
   const target=matches[0];
   if(target.choices.length){
    const chars=/^[A-H](?:\\s*[,;&+]\\s*[A-H])*$/i.test(key.value)?key.value.match(/[A-H]/gi)??[]:[];
    const choices=chars.map(l=>l.toUpperCase().charCodeAt(0)-65);
    if(!choices.length||choices.some(i=>i>=target.choices.length)){
     target.reviewFlags?.push('Answer-key entry '+key.number+' is not a valid choice: '+key.value);
    }else target.correct=[...new Set(choices)];
   }else target.answer=escape(key.value);
  }
 }
 for(const s of sections)for(const item of s.questions){
  classify(item);
 }
 if(!seenQuestions)warnings.push('No numbered questions detected. Review the source and add questions manually.');
 return {title,instructions,source:lines.map(x=>x.text).join('\\n'),lines,sections,warnings,format};
}
export function parseText(source:string,title='Imported assessment'):ImportDraft{return parseLines(textLines(source),title,'plain');}
export function parseHtml(html:string,title='Imported assessment',format:ImportDraft['format']='html'):ImportDraft{return parseLines(htmlLines(html),title,format);}
export function reviewWarnings(draft:ImportDraft):string[]{
 const warnings=draft.sections.flatMap(s=>s.questions.flatMap(q=>{
  const errors=[...(q.reviewFlags??[])];
  if(!htmlText(q.stem).trim())errors.push('Question prompt is empty');
  if(!Number.isFinite(q.marks)||q.marks<0)errors.push('Marks must be nonnegative');
  if(q.type==='singleChoice'||q.type==='multipleSelect'){
   if(q.choices.length<2)errors.push('At least two answer choices required');
   if(q.choices.some(c=>!htmlText(c).trim()))errors.push('Blank answer choice');
   if(!q.correct.length)errors.push('Correct answer not identified');
   if(q.correct.some(i=>!Number.isInteger(i)||i<0||i>=q.choices.length))errors.push('Invalid correct answer');
   if(q.type==='singleChoice'&&q.correct.length>1)errors.push('Single-choice question has multiple correct answers');
  }else{
   if(q.choices.length)errors.push('Choice data exists on a non-choice question');
   if(!htmlText(q.answer).trim())errors.push('Reference answer not identified');
  }
  return errors.map(error=>s.title+': '+error);
 }));
 return [...draft.warnings,...warnings];
}
export function toTalusSections(draft:ImportDraft):Section[]{
 return draft.sections.filter(s=>s.questions.length>0||s.instructions.trim()).map(s=>{
  const section=createSection();
  section.title=s.title;section.proficiency=s.proficiency;section.instructions=s.instructions.includes('<')?s.instructions:'<p>'+escape(s.instructions)+'</p>';
  section.items=s.questions.map(q=>{
   const slot=createSlot();const type=q.type;const variant=createVariant(type);
   variant.stem=q.stem.includes('<')?q.stem:'<p>'+escape(q.stem)+'</p>';
   variant.points=q.marks;variant.responseLines=q.responseLines;variant.importWarnings=[...(q.reviewFlags??[])];
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
 return {...base,title:draft.title,instructions:draft.instructions??'',sections,lastGeneration:undefined,updatedAt:new Date().toISOString()};
}
