import {confirmedImportRange,createImportRange,readRangeCue,restoreOrdinaryRangePlacement,type ImportRange} from './rangeImport';
import { createSection,createSlot,createVariant,uid,type MasterTest,type QuestionType,type Section } from './model';

const DOCX_TITLE_CLASS='talus-docx-title';
export const docxStyleMap=["p.Title => p."+DOCX_TITLE_CLASS+":fresh"];
export interface SourceLine { text:string; html:string; number:number; wordTitle?:true }
export interface ImportQuestion {
 id:string; sourceStart:number; sourceEnd:number; sourceNumber?:number; ambiguousReceiptSource?:true;
 sourceStemLines?:number[]; sourceChoiceLines?:number[]; sourceKeyLines?:number[]; sourceMarkLines?:number[]; stem:string; choices:string[]; correct:number[];
 answer:string; type:QuestionType; marks:number; responseLines:number; warnings:string[]; reviewFlags?:string[];
}
export interface ImportSection {
 id:string; title:string; proficiency:string; instructions:string; questions:ImportQuestion[];
}
export interface ImportDraft { title:string; instructions?:string; source:string; lines:SourceLine[]; sections:ImportSection[]; warnings:string[]; ranges?:ImportRange[]; format:'plain'|'markdown'|'docx'|'html' }

const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function textLines(source:string):SourceLine[] {
 return source.replace(/\r\n?/g,'\n').split('\n').map((text,i)=>({text,html:escape(text),number:i+1}));
}
export function htmlLines(html:string):SourceLine[]{
 const document=new DOMParser().parseFromString(html,'text/html');
 const output:SourceLine[]=[];
 function append(html:string,text:string,wordTitle=false){
  // Word drawings can have no textContent. Keep the HTML as source content.
  if(text.trim()||/<(?:img|table)\b/i.test(html))output.push({text:text.trim(),html:html.trim(),number:output.length+1,...(wordTitle?{wordTitle:true as const}:{})});
 }
 function walk(root:Element){
  for(const child of Array.from(root.children)){
   const tag=child.tagName.toLowerCase();
   if(tag==='table'){
    append(child.outerHTML,child.textContent??'');continue;
   }
   if(tag==='img'){
    append(child.outerHTML,child.getAttribute('alt')??'');continue;
   }
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
    append(heading+child.innerHTML,heading+(child.textContent??''),tag==='p'&&child.classList.contains(DOCX_TITLE_CLASS));continue;
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
const answer=/^\s*(?:answer|correct(?:\s+answer)?|key|solution)\s*[:\-]\s*(.*)$/i;
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
/**
 * Remove only the Answer:/Solution: label from a Word rich paragraph.
 * Taking the plain-text regexp capture silently erased superscripts and OMML
 * from reference answers, sometimes changing their mathematical meaning.
 */
function stripAnswerLabel(html:string):string{
 const label=/^\s*(?:answer|correct(?:\s+answer)?|key|solution)\s*[:\-]\s*/i;
 const plain=htmlText(html);
 const match=label.exec(plain);
 if(!match)return html;
 if(!/<[a-z][\s\S]*>/i.test(html)||typeof DOMParser==='undefined')
  return html.replace(label,'');
 const doc=new DOMParser().parseFromString('<div id="talus-answer">'+html+'</div>','text/html');
 const root=doc.getElementById('talus-answer');
 if(!root)return html;
 const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const nodes:Text[]=[];
 for(let node=walker.nextNode();node;node=walker.nextNode())nodes.push(node as Text);
 let remaining=match[0].length;
 for(const node of nodes){
  if(remaining<=0)break;
  const content=node.textContent??'';
  const count=Math.min(remaining,content.length);
  node.textContent=content.slice(count);
  remaining-=count;
 }
 return remaining===0?root.innerHTML:html;
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
 else q.type=/\b(explain|justify|discuss|describe|compare|evaluate)\b/i.test(htmlText(q.stem))?'writtenResponse':'shortAnswer';
 q.responseLines=q.type==='writtenResponse'?8:2;
 q.warnings=[];
}
const numberedKey=/^\s*(?:question\s+|Q\s*)?(\d{1,3})\s*[.)]\s*(.+)$/i;
const keyHeading=/^(?:#{1,6}\s*)?(?:answer\s*key|solutions?|marking\s*key|answer\s*sheet)\s*:?$/i;
const numberedPrefix=/^\s*(?:(?:question|Q)\s*)?\d{1,3}\s*[.)]\s*/i;
const choicePrefix=/^\s*(?:\(?[A-Ha-h]\)|[A-Ha-h][.)])\s*/;
function paragraph(html:string):string {
 if(/^\s*<(?:p|ul|ol|li|h[1-6]|blockquote)\b/i.test(html))return html;
 return '<p>'+html+'</p>';
}
function splitInlineChoices(html:string,raw:string):string[]|undefined{
 const labels=[...raw.matchAll(/(?:^|[ \t\u00a0]{2,})([A-H])[.)]\s+/g)];
 if(labels.length<2||labels[0].index!==0||labels.some((label,i)=>label[1]!==String.fromCharCode(65+i)))return;
 const spans=labels.map((label,i)=>[label.index+label[0].length,labels[i+1]?.index??raw.length] as const);
 if(!/<[a-z][\s\S]*>/i.test(html)||typeof DOMParser==='undefined')
  return spans.map(([start,end])=>escape(raw.slice(start,end).trim()));
 const document=new DOMParser().parseFromString(html,'text/html');
 const root=document.body,all=root.textContent??'',offset=all.indexOf(raw);
 if(offset<0)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const nodes:Text[]=[];
 for(let node=walker.nextNode();node;node=walker.nextNode())nodes.push(node as Text);
 function point(index:number):[Text,number]{
  let remaining=index+offset;
  for(const node of nodes){if(remaining<=node.length)return [node,remaining];remaining-=node.length;}
  return [nodes.at(-1)!,nodes.at(-1)!.length];
 }
 return spans.map(([start,end])=>{
  const range=document.createRange(),container=document.createElement('div');
  range.setStart(...point(start));range.setEnd(...point(end));
  container.append(range.cloneContents());
  return container.innerHTML.trim();
 });
}
export function parseLines(lines:SourceLine[],title='Imported assessment',format:ImportDraft['format']='plain'):ImportDraft {
 const sections:ImportSection[]=[];let current=newSection('Section 1');
 let q:ImportQuestion|undefined;let seenQuestions=false;let keyMode=false;
 let preamble:string[]=[];let instructions='';let sourceTitle=false;
 const warnings:string[]=[],ranges:ImportRange[]=[];const detachedKeys:{number:number;value:string;line:number;sectionId?:string}[]=[];
 const meaningful=lines.filter(line=>line.text.trim()||/<(?:img|table)\b/i.test(line.html));
 const explicitRanges=format==='docx'&&meaningful.some(line=>readRangeCue(line));
 const rangeSection=(value:string)=>explicitRanges&&/^(?:section|part)\s+[\w\d]+\s+[–—]+\s+\S/i.test(value);
 let keySection:ImportSection|undefined;
 const flush=()=>{if(q){classify(q);current.questions.push(q);q=undefined;seenQuestions=true;}};
 for(let i=0;i<meaningful.length;i++){
  const line=meaningful[i],raw=line.text.trim(),next=meaningful[i+1];
  if(keyHeading.test(raw)){
   flush();if(current.questions.length||current.instructions.trim())sections.push(current);
   current=newSection('Section 1');keyMode=true;continue;
  }
  if(keyMode){
   if(explicitRanges&&(isHeader(raw,next)||rangeSection(raw))){
    const header=raw.replace(/^#{1,4}\s*/,'');
    const matched=sections.filter(section=>section.title.toLowerCase()===header.toLowerCase());
    keySection=matched.length===1?matched[0]:undefined;
    if(keySection)continue;
   }
   const match=numberedKey.exec(raw);
   if(match)detachedKeys.push({number:Number(match[1]),value:match[2].trim(),line:line.number,sectionId:keySection?.id});
   else if(raw)warnings.push('Unmapped answer-key content: '+raw);
   continue;
  }
  if(!seenQuestions&&!q&&/^title\s*:/i.test(raw)){
   title=raw.replace(/^title\s*:/i,'').trim()||title;sourceTitle=true;continue;
  }
  if(format==='docx'&&i===0&&line.wordTitle&&!/<(?:img|table|math)\b/i.test(line.html)){
   title=raw;sourceTitle=true;continue;
  }
  if(!seenQuestions&&!q&&/^#\s+/.test(raw)&&!/(?:section|part|topic|level)\s+\w+/i.test(raw)){
   title=raw.replace(/^#\s+/,'').trim();sourceTitle=true;continue;
  }
  if(format==='docx'&&readRangeCue(line)){
   const shared:SourceLine[]=[];
   for(let j=i+1;j<meaningful.length;j++){
    const upcoming=meaningful[j],value=upcoming.text.trim();
    if(readRangeCue(upcoming)||numbered.test(value)||keyHeading.test(value)||isHeader(value,meaningful[j+1])||rangeSection(value)||answer.test(value)||choice.test(value))break;
    shared.push(upcoming);
   }
   const fallback=q?'question':!seenQuestions&&!sections.length&&current.title==='Section 1'?'assessment':'section';
   const offset=q?.stem.length??(fallback==='assessment'?preamble.map(paragraph).join('\n').length:current.instructions.length);
   ranges.push(createImportRange(line,shared,current,q?.id,fallback,offset));
   flush();i+=shared.length;continue;
  }
  if(isHeader(raw,next)||rangeSection(raw)){
   flush();
   if(current.questions.length||current.instructions.trim())sections.push(current);
   current=newSection(raw.replace(/^#{1,4}\s*/, '').trim());continue;
  }
  // DOCX Title is often its first plain paragraph, followed by instructions and a section.
  if(!seenQuestions&&!q&&!sourceTitle&&!sections.length&&current.title==='Section 1'&&i===0&&
     !numbered.test(raw)&&!choice.test(raw)&&!/^[-*]\s/.test(raw)&&
     (format==='docx'||format==='html') && meaningful.some(l=>/^(?:#{1,6}\s*)?(?:section|part)\s+\d+/i.test(l.text.trim())||rangeSection(l.text.trim()))){
    title=raw.replace(/^#{1,6}\s*/,'');sourceTitle=true;continue;
  }
  const n=numbered.exec(raw);
  if(n){
   flush();
   const markPattern=explicitRanges&&/\[\d/.test(n[2])?/\s*\[(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\]\s*$/i:marks;
   const marksMatch=markPattern.exec(n[2]),stem=marksMatch?n[2].replace(markPattern,'').trim():n[2].trim();
   let stemHtml=stripPrefix(line.html,numberedPrefix,raw);
   if(explicitRanges&&marksMatch)stemHtml=stemHtml.replace(/\s*[\[(]\d+(?:\.\d+)?\s*(?:marks?|pts?|points?)[\])]\s*(?=(?:<\/[\w:-]+>\s*)*$)/i,'');
   q=newQuestion(line.number,stem,stemHtml);
   q.sourceStemLines=[line.number];
   q.sourceNumber=Number(n[1]);if(marksMatch){q.marks=Number(marksMatch[1]);q.sourceMarkLines=[line.number];}
   continue;
  }
  const a=answer.exec(raw);
  if(a&&q){
   q.sourceEnd=line.number;const value=a[1].trim();
   if(!value){q.reviewFlags?.push('Empty answer line in source');continue;}
   if(q.choices.length){
    const letters=/^[A-H](?:\s*[,;&+]\s*[A-H])*$/i.test(value)
      ?value.match(/[A-H]/gi)??[]:[];
    if(letters.length&&letters.every(l=>l.toUpperCase().charCodeAt(0)-65<q!.choices.length)){
     q.correct=[...new Set(letters.map(l=>l.toUpperCase().charCodeAt(0)-65))];q.sourceKeyLines=[line.number];
    }else q.reviewFlags?.push('Answer '+value+' does not match the detected answer choices');
   }else {q.answer=stripAnswerLabel(line.html);q.sourceKeyLines=[line.number];}
   continue;
  }
  const choiceMatch=choice.exec(raw);
  if(explicitRanges&&q&&choiceMatch&&!q.choices.length){
   const combined=splitInlineChoices(line.html,raw);
   if(combined){
    q.choices=combined;q.sourceChoiceLines=[line.number];q.sourceEnd=line.number;continue;
   }
  }
  if(choiceMatch&&q){
   (q.sourceChoiceLines??=[]).push(line.number);
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
   (q.sourceStemLines??=[]).push(line.number);
   if(q.choices.length && /^(?:draw|graph|explain|calculate|describe|justify|compare)\b/i.test(raw))q.reviewFlags?.push('Possible unnumbered additional question: '+raw.slice(0,90));
   if(/^[-*]\s+/.test(raw)||/^<li\b/i.test(line.html)){
    const rendered=line.html.startsWith('<li')?line.html:'<li>'+line.html.replace(/^[-*]\s+/,'')+'</li>';
    q.stem=q.stem.endsWith('</ul>')?q.stem.slice(0,-5)+rendered+'</ul>':q.stem+'<ul>'+rendered+'</ul>';
   }else q.stem+=paragraph(line.html);
   q.sourceEnd=line.number;
  }else if(!seenQuestions&&sections.length===0&&current.title==='Section 1'){
   preamble.push(line.html);
  }else current.instructions+=(current.instructions?'\n':'')+paragraph(line.html);
 }
 flush();
 if(!keyMode && (current.questions.length||current.instructions.trim()))sections.push(current);
 if(!sections.length)sections.push(current);
 if(preamble.length){
  // A leading H1/Title and instructions belong to the master, not a placeholder section.
  instructions=preamble.map(paragraph).join('\n');
 }
 if(detachedKeys.length){
  const all=sections.flatMap(s=>s.questions);
  const numbers=new Map<number,ImportQuestion[]>();
  for(const item of all){
   const k=item.sourceNumber??0;
   numbers.set(k,[...(numbers.get(k)??[]),item]);
  }
  for(const key of detachedKeys){
   const pool=key.sectionId?sections.find(section=>section.id===key.sectionId)?.questions.filter(q=>q.sourceNumber===key.number):numbers.get(key.number);
   const matches=pool??[];
   if(matches.length!==1){
    warnings.push('Answer-key entry '+key.number+' could not be matched uniquely: '+key.value);continue;
   }
   const target=matches[0];

   if(target.choices.length){
    const chars=/^[A-H](?:\s*[,;&+]\s*[A-H])*$/i.test(key.value)?key.value.match(/[A-H]/gi)??[]:[];
    const choices=chars.map(l=>l.toUpperCase().charCodeAt(0)-65);
    if(!choices.length||choices.some(i=>i>=target.choices.length)){
     target.reviewFlags?.push('Answer-key entry '+key.number+' is not a valid choice: '+key.value);
    }else {target.correct=[...new Set(choices)];target.sourceKeyLines=[key.line];}
   }else {target.answer=escape(key.value);target.sourceKeyLines=[key.line];}
  }
 }
 for(const s of sections)for(const item of s.questions){
  classify(item);
 }
 if(!seenQuestions)warnings.push('No numbered questions detected. Review the source and add questions manually.');
 for(const section of sections){
   if(/\b(?:Answer|Key)\s*:/i.test(section.instructions))warnings.push('Possible student-facing answer-key text in '+section.title+' instructions');
   for(const question of section.questions){
    if(/\b(?:Answer|Key)\s*:/i.test(question.stem))question.reviewFlags?.push('Possible answer-key text embedded in student prompt');
   }
 }
 return {title,instructions,source:lines.map(x=>x.text).join('\n'),lines,sections,warnings,format,ranges:ranges.length?ranges:undefined};
}
export function parseText(source:string,title='Imported assessment'):ImportDraft{return parseLines(textLines(source),title,'plain');}
export function parseHtml(html:string,title='Imported assessment',format:ImportDraft['format']='html'):ImportDraft{return parseLines(htmlLines(html),title,format);}
export function reviewWarnings(draft:ImportDraft):string[]{
 const warnings=draft.sections.flatMap(s=>s.questions.flatMap(q=>{
  const errors=[...(q.reviewFlags??[])];
  if(!htmlText(q.stem).trim()&&!/<(?:img|table)\b/i.test(q.stem))errors.push('Question prompt is empty');
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
export function toTalusSections(draft:ImportDraft, wordQuestionNumbers?:Record<string,number>):Section[]{
 const ordinary=restoreOrdinaryRangePlacement(draft);
 return ordinary.sections.filter(s=>s.questions.length>0||s.instructions.trim()).map(s=>{
  const section=createSection();
  section.title=s.title;section.proficiency=s.proficiency;section.instructions=s.instructions.includes('<')?s.instructions:'<p>'+escape(s.instructions)+'</p>';
  section.items=[];
  const slots=s.questions.map(q=>{
   const slot=createSlot();const type=q.type;const variant=createVariant(type);
   variant.stem=q.stem.includes('<')?q.stem:'<p>'+escape(q.stem)+'</p>';
   variant.points=q.marks;variant.responseLines=q.responseLines;variant.importWarnings=[...(q.reviewFlags??[])];
   if(type==='singleChoice'||type==='multipleSelect'){
    variant.choices=q.choices.map(html=>({id:uid(),html:html.includes('<')?html:'<p>'+escape(html)+'</p>'}));
    variant.correctChoiceIds=q.correct.filter(i=>i>=0&&i<variant.choices.length).map(i=>variant.choices[i].id);
   }else variant.referenceAnswer=q.answer.includes('<')?q.answer:'<p>'+escape(q.answer)+'</p>';
   slot.variants=[variant];
   const number=q.sourceNumber;
   if(wordQuestionNumbers && draft.format==='docx' && number!==undefined && Number.isSafeInteger(number)
     && !q.ambiguousReceiptSource && s.questions.filter(other=>other.sourceNumber===number).length===1) {
    wordQuestionNumbers[variant.id]=number;
   }
   return slot;
  });
  const groups=new Map<string,{range:ImportRange;count:number}>();
  for(const range of draft.ranges??[]){
   if(range.sectionId!==s.id)continue;
   const children=confirmedImportRange(draft,range);
   if(children)groups.set(children[0].id,{range,count:children.length});
  }
  for(let i=0;i<slots.length;){
   const group=groups.get(s.questions[i].id);
   if(group){
    section.items.push({kind:'group',id:group.range.id,sharedHtml:group.range.sharedHtml,
     shuffleWithinGroup:false,items:slots.slice(i,i+group.count),rangeLabel:true});
    i+=group.count;
   }else {section.items.push(slots[i]);i++;}
  }
  return section;
 });
}
export function mergeIntoMaster(base:MasterTest,draft:ImportDraft,mode:'replace'|'append'):MasterTest{
 const wordQuestionNumbers = mode==='append' ? {...base.wordQuestionNumbers} : {};
 const sections=toTalusSections(draft,wordQuestionNumbers);
 if(!sections.length)throw Error('No sections or questions to import.');
 const critical=draft.warnings.filter(w=>/unmapped|answer-key|numbered questions detected|ambiguous|student-facing|embedded image|image format|image reference|image exceeds|images exceed|table contains no cells|unsupported media|rich-content source media loss|Word equation|equation structure|equation content/i.test(w)||/Word conversion:.*(?:image|drawing|graphic|picture|media|relationship|linked)/i.test(w));
 if(mode==='append')return {...base,sections:[...base.sections,...sections],wordQuestionNumbers,wordReceiptFiles:undefined,importWarnings:[...(base.importWarnings??[]),...critical],lastGeneration:undefined,updatedAt:new Date().toISOString()};
 return {...base,title:draft.title,instructions:restoreOrdinaryRangePlacement(draft).instructions??'',sections,wordQuestionNumbers,wordReceiptFiles:undefined,importWarnings:critical,lastGeneration:undefined,updatedAt:new Date().toISOString()};
}

/**
 * Mammoth may report the built-in Word Title paragraph style as unmapped even
 * when its text was successfully recognized as the assessment title.
 * Suppress only that cosmetic diagnostic. All other conversion diagnostics
 * remain visible to the teacher.
 */
export function wordConversionWarnings(
 messages:ReadonlyArray<{message:string}>,
 parsed:ImportDraft
):string[]{
 const first=parsed.lines.find(line=>line.text.trim())?.text.trim().replace(/^#{1,6}\s*/, '')??'';
 const titleMapped=first.length>0&&first===parsed.title.trim();
 return messages.filter(item=>{
  if(!titleMapped)return true;
  const message=item.message.trim();
  const titleStyleUnmapped=/^Unrecognised paragraph style:\s*(?:'[^']*'|"[^"]*"|null)\s*\(Style ID:\s*Title\)\s*$/i.test(message);
  const titleStyleUndefined=/^Paragraph style with ID Title was referenced but not defined in the document\.?$/i.test(message);
  return !(titleStyleUnmapped||titleStyleUndefined);
 }).map(item=>'Word conversion: '+item.message);
}
