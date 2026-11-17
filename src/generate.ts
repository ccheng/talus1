import type { MasterTest, TestItem, Slot, Choice, Variant, QuestionNumbering } from './model';
import { masterSectionsSchema,validateMaster } from './model';
import { diverseLayouts } from './shuffleDiversity';

export interface RenderedQuestion { slotId:string; variantId:string; number:number; label:string; sectionId:string; groupHtml?:string; stem:string; type:Variant['type'];points:number; choices:Choice[]; correctChoiceIds:string[]; referenceAnswer:string;responseLines?:number }
export interface RenderedSection { id:string;title:string;proficiency:string;instructions:string;questions:RenderedQuestion[] }
export interface GeneratedVersion { label:string;seed:string;sections:RenderedSection[];manifest:{slotId:string;variantId:string;choiceOrder:string[];number:number;label?:string}[] }
export function hashSeed(input:string):number {let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rng(seed:string):()=>number {let a=hashSeed(seed);return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function shuffled<T>(items:readonly T[],random:()=>number):T[]{const arr=[...items];for(let i=arr.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function orderItems(items:TestItem[],doShuffle:boolean,rand:()=>number):TestItem[]{
  if(!doShuffle)return [...items];
  const movable=shuffled(items.filter(i=>i.kind==='group'||i.shufflePosition),rand);
  let cursor=0;return items.map(i=>i.kind==='slot'&&!i.shufflePosition?i:movable[cursor++]);
}
export function generateVersions(master:MasterTest,count:number,seed:string):GeneratedVersion[]{
  return generate(master,count,seed,master.generationSettings?.numbering??'byType');
}

function groupCue(questions:RenderedQuestion[]):string {
  if(questions.length<2)return '';
  const labels=questions.map(question=>question.label);
  const first=labels[0],last=labels[labels.length-1];
  const prefix=(label:string)=>label.replace(/\d+$/,'');
  const list=labels.every(label=>prefix(label)===prefix(first))
    ? first+'–'+last
    : labels.length===2?first+' and '+last:labels.slice(0,-1).join(', ')+', and '+last;
  return '<p>Use the following for Questions '+list+':</p>';
}

function generate(master:MasterTest,count:number,seed:string,numbering?:QuestionNumbering):GeneratedVersion[]{
  const errors=validateMaster(master);
  if(errors.length)throw Error('Fix validation errors before generating: '+errors.join(' '));
  if(!Number.isInteger(count)||count<1||count>30)throw Error('Version count must be between 1 and 30.');
  if(!seed.trim())throw Error('Enter a seed.');
  const layouts=numbering?diverseLayouts(master.sections,count,rng,shuffled,seed):undefined;
  return Array.from({length:count},(_,versionIndex)=>{
    const label=versionIndex<26?String.fromCharCode(65+versionIndex):'V'+(versionIndex+1);
    const random=rng(seed+'|'+versionIndex);
    let number=0;
    const counters={choice:0,numerical:0,written:0};
    const manifest:GeneratedVersion['manifest']=[];
    const sections=master.sections.map((section,sectionIndex)=>{
      const questions:RenderedQuestion[]=[];
      function addSlot(slot:Slot,groupHtml?:string){
        // Rotate variants across versions; stable slot-specific offset prevents every slot using the same variant.
        const offset=hashSeed(seed+'|variant|'+slot.id)%slot.variants.length;
        const variant=slot.variants[(offset+versionIndex)%slot.variants.length];
        const choices=variant.shuffleChoices?shuffled(variant.choices,random):[...variant.choices];
        number++;
        let questionLabel=String(number);
        if(numbering==='byType'){
          if(variant.type==='numericalResponse')questionLabel='NR'+(++counters.numerical);
          else if(variant.type==='shortAnswer'||variant.type==='writtenResponse')questionLabel='WR'+(++counters.written);
          else questionLabel=String(++counters.choice);
        }
        questions.push({slotId:slot.id,variantId:variant.id,number,label:questionLabel,sectionId:section.id,groupHtml,stem:variant.stem,type:variant.type,points:variant.points,choices,correctChoiceIds:[...variant.correctChoiceIds],referenceAnswer:variant.referenceAnswer,responseLines:variant.responseLines});
        manifest.push({slotId:slot.id,variantId:variant.id,choiceOrder:choices.map(c=>c.id),number,...(numbering?{label:questionLabel}:{})});
      }
      const layout=layouts?.[versionIndex][sectionIndex];
      if(layout){
        layout.forEach(({slot})=>addSlot(slot));
        layout.forEach(({shared},index)=>{
          if(!shared)return;
          const cue=shared.labelRange?groupCue(questions.slice(index,index+shared.size)):'';
          questions[index].groupHtml=cue+shared.html;
        });
      }else{
        // Interleave the legacy question and choice draws to reproduce saved manifests.
        for(const item of orderItems(section.items,section.shuffleQuestions,random)){
          if(item.kind==='slot') addSlot(item);
          else{
            const children=item.shuffleWithinGroup?shuffled(item.items,random):item.items;
            const cue=item.rangeLabel&&children.length>1?'<p>Use the following for Questions '+(number+1)+'–'+(number+children.length)+':</p>':'';
            children.forEach((child,i)=>addSlot(child,i===0?cue+item.sharedHtml:undefined));
          }
        }
      }
      return {id:section.id,title:section.title,proficiency:section.proficiency,instructions:section.instructions,questions};
    });
    return {label,seed,sections,manifest};
  });
}

function hashGeneration(master:MasterTest,count:number,seed:string,sections:MasterTest['sections'],numbering?:QuestionNumbering):string{
 return hashSeed(JSON.stringify({id:master.id,updatedAt:master.updatedAt,count,seed,sections,
  ...(numbering?{algorithm:'diverse-v1',numbering}:{})})).toString(36).padStart(7,'0');
}
function canonicalSections(master:MasterTest):MasterTest['sections'] {
 // Keep 3C's original authored group order while normalizing the other fields.
 return masterSectionsSchema.parse(master.sections).map(section=>({...section,items:section.items.map(item=>
  item.kind==='slot'?item:{kind:item.kind,id:item.id,items:item.items,sharedHtml:item.sharedHtml,shuffleWithinGroup:item.shuffleWithinGroup,rangeLabel:item.rangeLabel}
 )}));
}
export function generationRunId(master:MasterTest,count:number,seed:string):string {
 return hashGeneration(master,count,seed,canonicalSections(master),master.generationSettings?.numbering??'byType');
}
export function generationRecord(master:MasterTest, versions:GeneratedVersion[], count:number, seed:string) {
  return {count,seed,runId:generationRunId(master,count,seed),sourceUpdatedAt:master.updatedAt,
    algorithm:'diverse-v1' as const,numbering:master.generationSettings?.numbering??'byType',
    manifests:versions.map(v=>({label:v.label,entries:v.manifest}))};
}
export function restoreGenerated(master:MasterTest):GeneratedVersion[] {
  const record=master.lastGeneration;
  if(!record||record.sourceUpdatedAt!==master.updatedAt)return [];
  const {count,seed,runId,algorithm,numbering}=record;
  if(algorithm==='diverse-v1'){
    if(!numbering||runId!==hashGeneration(master,count,seed,canonicalSections(master),numbering))return [];
  }else{
    // Legacy runs may have used the authored or former schema field ordering.
    if(algorithm!==undefined||numbering!==undefined||
      runId!==hashGeneration(master,count,seed,canonicalSections(master))&&
      runId!==hashGeneration(master,count,seed,master.sections)&&
      runId!==hashGeneration(master,count,seed,masterSectionsSchema.parse(master.sections)))return [];
  }
  const versions=generate(master,count,seed,numbering);
  if(JSON.stringify(versions.map(v=>({label:v.label,entries:v.manifest})))!==JSON.stringify(record.manifests)) return [];
  return versions;
}
