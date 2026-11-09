import type { MasterTest, TestItem, Slot, Choice, Variant } from './model';
import { validateMaster } from './model';

export interface RenderedQuestion { slotId:string; variantId:string; number:number; sectionId:string; groupHtml?:string; stem:string; type:Variant['type'];points:number; choices:Choice[]; correctChoiceIds:string[]; referenceAnswer:string;responseLines?:number }
export interface RenderedSection { id:string;title:string;proficiency:string;instructions:string;questions:RenderedQuestion[] }
export interface GeneratedVersion { label:string;seed:string;sections:RenderedSection[];manifest:{slotId:string;variantId:string;choiceOrder:string[];number:number}[] }
export function hashSeed(input:string):number {let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rng(seed:string):()=>number {let a=hashSeed(seed);return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function shuffled<T>(items:readonly T[],random:()=>number):T[]{const arr=[...items];for(let i=arr.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function orderItems(items:TestItem[],doShuffle:boolean,rand:()=>number):TestItem[]{
  if(!doShuffle)return [...items];
  const movable=shuffled(items.filter(i=>i.kind==='group'||i.shufflePosition),rand);
  let cursor=0;return items.map(i=>i.kind==='slot'&&!i.shufflePosition?i:movable[cursor++]);
}
export function generateVersions(master:MasterTest,count:number,seed:string):GeneratedVersion[]{
  const errors=validateMaster(master);
  if(errors.length)throw Error('Fix validation errors before generating: '+errors.join(' '));
  if(!Number.isInteger(count)||count<1||count>30)throw Error('Version count must be between 1 and 30.');
  if(!seed.trim())throw Error('Enter a seed.');
  return Array.from({length:count},(_,versionIndex)=>{
    const label=versionIndex<26?String.fromCharCode(65+versionIndex):'V'+(versionIndex+1);
    const random=rng(seed+'|'+versionIndex);
    let number=0;const manifest:GeneratedVersion['manifest']=[];
    const sections=master.sections.map(section=>{
      const items=orderItems(section.items,section.shuffleQuestions,random);
      const questions:RenderedQuestion[]=[];
      function addSlot(slot:Slot,groupHtml?:string){
        // Rotate variants across versions; stable slot-specific offset prevents every slot using the same variant.
        const offset=hashSeed(seed+'|variant|'+slot.id)%slot.variants.length;
        const variant=slot.variants[(offset+versionIndex)%slot.variants.length];
        const choices=variant.shuffleChoices?shuffled(variant.choices,random):[...variant.choices];
        number++;
        questions.push({slotId:slot.id,variantId:variant.id,number,sectionId:section.id,groupHtml,stem:variant.stem,type:variant.type,points:variant.points,choices,correctChoiceIds:[...variant.correctChoiceIds],referenceAnswer:variant.referenceAnswer,responseLines:variant.responseLines});
        manifest.push({slotId:slot.id,variantId:variant.id,choiceOrder:choices.map(c=>c.id),number});
      }
      for(const item of items){
        if(item.kind==='slot') addSlot(item);
        else{
          const children=item.shuffleWithinGroup?shuffled(item.items,random):item.items;
          children.forEach((child,i)=>addSlot(child,i===0?item.sharedHtml:undefined));
        }
      }
      return {id:section.id,title:section.title,proficiency:section.proficiency,instructions:section.instructions,questions};
    });
    return {label,seed,sections,manifest};
  });
}

export function generationRunId(master:MasterTest,count:number,seed:string):string {
  return hashSeed(JSON.stringify({id:master.id,updatedAt:master.updatedAt,count,seed,sections:master.sections})).toString(36).padStart(7,'0');
}
export function generationRecord(master:MasterTest, versions:GeneratedVersion[], count:number, seed:string) {
  return {count,seed,runId:generationRunId(master,count,seed),sourceUpdatedAt:master.updatedAt,
    manifests:versions.map(v=>({label:v.label,entries:v.manifest}))};
}
export function restoreGenerated(master:MasterTest):GeneratedVersion[] {
  const record=master.lastGeneration;
  if(!record||record.sourceUpdatedAt!==master.updatedAt || record.runId!==generationRunId(master,record.count,record.seed)) return [];
  const versions=generateVersions(master,record.count,record.seed);
  if(JSON.stringify(versions.map(v=>({label:v.label,entries:v.manifest})))!==JSON.stringify(record.manifests)) return [];
  return versions;
}
