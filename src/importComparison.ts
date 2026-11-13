import type {UnassignedSourceKey} from './annotationImport';
import type {ImportDraft,ImportQuestion} from './importParser';

type ChangeKind='Question boundary'|'Section'|'Choices'|'Key mapping'|'Marks'|'Rich placement';
export interface ImportChange {
 kind:ChangeKind;detect:string;ai:string;detectLines:number[];aiLines:number[];
}
export interface ImportFinding {questionId?:string;title:string;changes:ImportChange[]}
export interface ComparisonAsset {label:string;identity:string}

const distinct=(lines:number[]=[])=>[...new Set(lines)].filter(n=>n>0).sort((a,b)=>a-b);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const wordSpace=(value:string)=>value.replace(/\s+/g,' ').trim();

type RichAssets=(html:string)=>ComparisonAsset[];
function answerValue(q:ImportQuestion,text:(html:string)=>string,rich:RichAssets){
 if(!q.choices.length)return text(q.answer);
 return q.correct.flatMap(index=>{
  const choice=q.choices[index];
  return choice===undefined?[]:[text(choice)||rich(choice).map(asset=>asset.label).join(', ')];
 }).sort().join(' / ');
}
export interface KeyReconciliation {questionId:string;blocks:number[];answer:string}

export function reconcilableSourceKeys(detect:ImportDraft,ai:ImportDraft,current:ImportDraft,unassigned:UnassignedSourceKey[],
 text:(html:string)=>string,rich:RichAssets):KeyReconciliation[]{
 if(!unassigned.length)return [];
 const questions=new Map(current.sections.flatMap(section=>section.questions.map(q=>[q.id,q] as const)));
 const detectLines=new Map(detect.lines.map(line=>[line.number,wordSpace(line.text)]));
 return compareImportDrafts(detect,ai,text,rich).flatMap(finding=>{
  const change=finding.changes.find(item=>item.kind==='Key mapping');
  const q=finding.questionId?questions.get(finding.questionId):undefined;
  if(!change||!q||!change.detectLines.length||answerValue(q,html=>wordSpace(text(html)),rich)!==change.detect)return [];
  const supported=change.detectLines.every(line=>unassigned.some(piece=>
   piece.block===line&&piece.start===0&&piece.end===piece.blockLength&&wordSpace(piece.text)===detectLines.get(line)
  ));
  return supported?[{questionId:q.id,blocks:change.detectLines,answer:change.detect}]:[];
 });
}

/** Compare proposals anchored to the same source, never by their generated IDs or displayed question number alone. */
export function compareImportDrafts(detect:ImportDraft,ai:ImportDraft,
 text:(html:string)=>string,rich:(html:string)=>ComparisonAsset[]):ImportFinding[]{
 const flatten=(draft:ImportDraft)=>draft.sections.flatMap(section=>section.questions.map(q=>({q,section})));
 const before=flatten(detect),after=flatten(ai);
 const matched=new Set<string>();
 const byStart=new Map<number,typeof before>();
 for(const item of before){
  const list=byStart.get(item.q.sourceStart)??[];
  list.push(item);byStart.set(item.q.sourceStart,list);
 }
 const findings:ImportFinding[]=[];
 const normalized=(html:string)=>wordSpace(text(html));
 const stem=(q:ImportQuestion)=>normalized(q.stem).replace(/\s*[\[(]\s*\d+(?:\.\d+)?\s*(?:marks?|pts?|points?)\s*[\])]$/i,'').trim();
 const loc=(q:ImportQuestion)=>q.sourceStemLines??[q.sourceStart];
 const display=(value:string)=>value||'None';
 const title=(q:ImportQuestion)=>(q.sourceNumber===undefined?'':'Source question '+q.sourceNumber+' · ')+(stem(q).slice(0,85)||'Question');
 const answer=(q:ImportQuestion)=>answerValue(q,normalized,rich);
 const choices=(q:ImportQuestion)=>q.choices.map(normalized);
 const placements=(q:ImportQuestion)=>[
  ...rich(q.stem).map(asset=>({role:'Prompt',...asset})),
  ...q.choices.flatMap((choice,index)=>rich(choice).map(asset=>({role:'Choice '+String.fromCharCode(65+index),...asset}))),
  ...rich(q.answer).map(asset=>({role:'Reference answer',...asset}))
 ];
 for(const current of after){
  const q=current.q;
  const candidates=(byStart.get(q.sourceStart)??[]).filter(item=>!matched.has(item.q.id));
  // Inline questions can share one physical block. Match exact content first;
  // competing candidates stay unmatched rather than assigning by order.
  const exact=candidates.filter(item=>stem(item.q)===stem(q));
  const previous=exact.length===1?exact[0]:candidates.length===1?candidates[0]:undefined;
  if(!previous){
   findings.push({questionId:q.id,title:title(q),changes:[{kind:'Question boundary',detect:'No matching question',ai:display(stem(q)),detectLines:[],aiLines:distinct(loc(q))}]});
   continue;
  }
  const old=previous.q;matched.add(old.id);
  const changes:ImportChange[]=[];
  function change(kind:ChangeKind,detectValue:string,aiValue:string,detectLines:number[]=loc(old),aiLines:number[]=loc(q)){
   changes.push({kind,detect:display(detectValue),ai:display(aiValue),detectLines:distinct(detectLines),aiLines:distinct(aiLines)});
  }
  if(stem(old)!==stem(q)||old.sourceStemLines&&q.sourceStemLines&&!same(distinct(loc(old)),distinct(loc(q))))change('Question boundary',stem(old),stem(q));
  const sectionLabel=(item:typeof current)=>[item.section.title,item.section.proficiency].filter(Boolean).map(wordSpace).join(' · ');
  if(sectionLabel(previous).toLowerCase()!==sectionLabel(current).toLowerCase())change('Section',sectionLabel(previous),sectionLabel(current));
  if(old.type!==q.type||!same(choices(old),choices(q))){
   const value=(item:ImportQuestion)=>[item.type,...choices(item)].join(' · ');
   change('Choices',value(old),value(q),old.sourceChoiceLines??loc(old),q.sourceChoiceLines??loc(q));
  }
  if(answer(old)!==answer(q))change('Key mapping',answer(old),answer(q),old.sourceKeyLines??[],q.sourceKeyLines??[]);
  if(old.marks!==q.marks)change('Marks',String(old.marks),String(q.marks),old.sourceMarkLines??loc(old),q.sourceMarkLines??loc(q));
  const oldPlacement=placements(old),newPlacement=placements(q);
  const assetPositions=(values:typeof oldPlacement)=>values.map(asset=>[asset.role,asset.identity]);
  const describe=(values:typeof oldPlacement)=>values.map(asset=>asset.role+' · '+asset.label).join(' / ');
  if(!same(assetPositions(oldPlacement),assetPositions(newPlacement)))change('Rich placement',describe(oldPlacement),describe(newPlacement),
   [...loc(old),...(old.sourceChoiceLines??[]),...(old.sourceKeyLines??[])],
   [...loc(q),...(q.sourceChoiceLines??[]),...(q.sourceKeyLines??[])]);
  if(changes.length)findings.push({questionId:q.id,title:title(q),changes});
 }
 for(const item of before)if(!matched.has(item.q.id)){
  findings.push({title:title(item.q),changes:[{kind:'Question boundary',detect:display(stem(item.q)),ai:'No matching question',
   detectLines:distinct(loc(item.q)),aiLines:[]}]});
 }
 return findings;
}
