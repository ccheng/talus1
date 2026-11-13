import { z } from 'zod';
import { embeddedAssetWarnings } from './media';
import { equationIntegrityWarnings } from './equationSafety';
import {tableIntegrityWarnings} from './contentIntegrity';

export type QuestionType = 'singleChoice' | 'multipleSelect' | 'shortAnswer' | 'writtenResponse';
export interface Choice { id: string; html: string }
export interface Variant {
  id: string; type: QuestionType; stem: string; choices: Choice[];
  correctChoiceIds: string[]; referenceAnswer: string;
  points: number; shuffleChoices: boolean; responseLines?: number; importWarnings?: string[];
}
export interface Slot { kind: 'slot'; id: string; shufflePosition: boolean; variants: Variant[] }
export interface Group { kind: 'group'; id: string; sharedHtml: string; shuffleWithinGroup: boolean; items: Slot[] }
export type TestItem = Slot | Group;
export interface Section {
  id: string; title: string; proficiency: string; instructions: string;
  shuffleQuestions: boolean; items: TestItem[];
}
export interface GenerationRecord {
  count:number; seed:string; runId:string; sourceUpdatedAt:string;
  manifests: {label:string;entries:{slotId:string;variantId:string;choiceOrder:string[];number:number}[]}[];
}
export interface WordLayoutSettings {
  paper: 'letter'|'a4';
  marginInches: number;
  fontSizePt: number;
  lineSpacing: 1|1.15|1.5;
  sectionPageBreaks: boolean;
  responseLinesPerGroup: 2|4|6;
  showHeader: boolean;
  showPageNumbers: boolean;
}
export const DEFAULT_WORD_LAYOUT:WordLayoutSettings={
  paper:'letter',marginInches:1,fontSizePt:11,lineSpacing:1.15,
  sectionPageBreaks:false,responseLinesPerGroup:4,showHeader:true,showPageNumbers:true,
};
export const wordLayoutSchema=z.object({
  paper:z.enum(['letter','a4']),
  marginInches:z.number().min(0.5).max(1.5),
  fontSizePt:z.number().min(9).max(14),
  lineSpacing:z.union([z.literal(1),z.literal(1.15),z.literal(1.5)]),
  sectionPageBreaks:z.boolean(),
  responseLinesPerGroup:z.union([z.literal(2),z.literal(4),z.literal(6)]),
  showHeader:z.boolean(),showPageNumbers:z.boolean()
});
export function wordLayout(settings?:Partial<WordLayoutSettings>):WordLayoutSettings {
 return wordLayoutSchema.parse({...DEFAULT_WORD_LAYOUT,...settings});
}
export interface MasterTest { schemaVersion: 1; id: string; title: string; instructions: string; sections: Section[]; updatedAt: string;
  generationSettings?:{count:number;seed:string}; wordLayout?:WordLayoutSettings; lastGeneration?:GenerationRecord; importWarnings?:string[];
}
export type RichText = string;
export const uid = (): string => crypto.randomUUID();

const choiceSchema = z.object({ id: z.string().min(1), html: z.string() });
const variantSchema = z.object({
  id: z.string().min(1), type: z.enum(['singleChoice','multipleSelect','shortAnswer','writtenResponse']),
  stem: z.string(), choices: z.array(choiceSchema), correctChoiceIds: z.array(z.string()),
  referenceAnswer: z.string(), points: z.number().nonnegative().finite(), shuffleChoices: z.boolean(), responseLines:z.number().int().min(1).max(30).optional(), importWarnings:z.array(z.string()).optional()
});
const slotSchema = z.object({kind:z.literal('slot'),id:z.string().min(1),shufflePosition:z.boolean(),variants:z.array(variantSchema)});
const groupSchema = z.object({kind:z.literal('group'),id:z.string().min(1),sharedHtml:z.string(),shuffleWithinGroup:z.boolean(),items:z.array(slotSchema)});
const sectionSchema = z.object({id:z.string().min(1),title:z.string(),proficiency:z.string(),instructions:z.string(),shuffleQuestions:z.boolean(),items:z.array(z.union([slotSchema,groupSchema]))});
export const masterSchema = z.object({schemaVersion:z.literal(1),id:z.string().min(1),title:z.string(),instructions:z.string(),sections:z.array(sectionSchema),updatedAt:z.string(),
 generationSettings:z.object({count:z.number().int().min(1).max(30),seed:z.string()}).optional(), wordLayout:wordLayoutSchema.optional(), importWarnings:z.array(z.string()).optional(),
 lastGeneration:z.object({count:z.number().int().min(1).max(30),seed:z.string(),runId:z.string(),sourceUpdatedAt:z.string(),
  manifests:z.array(z.object({label:z.string(),entries:z.array(z.object({slotId:z.string(),variantId:z.string(),choiceOrder:z.array(z.string()),number:z.number().int()}))}))}).optional()
});

export function createVariant(type: QuestionType = 'singleChoice'): Variant {
  const choices = type === 'singleChoice' || type === 'multipleSelect'
    ? Array.from({length:4},()=>({id:uid(),html:''})) : [];
  return {id:uid(),type,stem:'',choices,correctChoiceIds:[],referenceAnswer:'',points:1,shuffleChoices:true,responseLines:type==='writtenResponse'?8:2};
}
export function createSlot():Slot {return {kind:'slot',id:uid(),shufflePosition:true,variants:[createVariant()]};}
export function createSection():Section {return {id:uid(),title:'New section',proficiency:'',instructions:'',shuffleQuestions:true,items:[createSlot()]};}
export function createMaster():MasterTest {return {schemaVersion:1,id:uid(),title:'Untitled assessment',instructions:'',updatedAt:new Date().toISOString(),generationSettings:{count:3,seed:'talus-2026'},sections:[{...createSection(),title:'Section 1'}]};}
export const slotsOf = (s:Section):Slot[] => s.items.flatMap(item=>item.kind==='slot'?[item]:item.items);
export const isChoiceType = (type:QuestionType):boolean => type==='singleChoice'||type==='multipleSelect';
export function cleanText(html:string):string {return html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
export function hasQuestionContent(html:string):boolean{return !!cleanText(html)||/<(?:img|table)\b/i.test(html);}
export function validateMaster(master:MasterTest):string[] {
  const parsed=masterSchema.safeParse(master);
  if(!parsed.success) return ['Invalid master test structure: '+parsed.error.issues[0]?.message];
  const errors:string[]=[]; const ids=new Set<string>();
  function unique(id:string,where:string){if(ids.has(id)) errors.push('Duplicate ID in '+where); ids.add(id);}
  unique(master.id,'test');
  if(!master.title.trim()) errors.push('Test title is required.');
  if(master.importWarnings?.length)errors.push('Unresolved imported source warnings: '+master.importWarnings.join('; '));
  if(!master.sections.length) errors.push('At least one section is required.');
  for(const warning of [...embeddedAssetWarnings(master.instructions),...equationIntegrityWarnings(master.instructions),...tableIntegrityWarnings(master.instructions)])errors.push('General instructions: '+warning);
  for(const [si,section] of master.sections.entries()){
    const label='Section '+(si+1);unique(section.id,label);
    if(!section.title.trim()) errors.push(label+' needs a title.');
    for(const warning of [...embeddedAssetWarnings(section.instructions),...equationIntegrityWarnings(section.instructions),...tableIntegrityWarnings(section.instructions)])errors.push(label+': '+warning);
    for(const item of section.items)if(item.kind==='group'){
      unique(item.id,label+' question group');
      if(!item.items.length)errors.push(label+': group has no questions.');
      for(const warning of [...embeddedAssetWarnings(item.sharedHtml),...equationIntegrityWarnings(item.sharedHtml),...tableIntegrityWarnings(item.sharedHtml)])
        errors.push(label+' shared question: '+warning);
    }
    if(!section.items.length) errors.push(label+' needs at least one question.');
    for(const slot of slotsOf(section)){
      unique(slot.id,label+' question');
      if(!slot.variants.length) errors.push(label+': question has no variants.');
      const points=slot.variants[0]?.points;
      for(const [vi,v] of slot.variants.entries()){
        unique(v.id,label+' variant');
        const loc=label+', question '+(slotsOf(section).indexOf(slot)+1)+', variant '+(vi+1);
        if(!hasQuestionContent(v.stem)) errors.push(loc+': prompt is empty.');
        if(v.points!==points) errors.push(loc+': points differ between alternatives.');
        if(v.importWarnings?.length) errors.push(loc+': unresolved import review: '+v.importWarnings.join('; '));
        for(const html of [v.stem,v.referenceAnswer,...v.choices.map(choice=>choice.html)])for(const warning of [...embeddedAssetWarnings(html),...equationIntegrityWarnings(html),...tableIntegrityWarnings(html)])errors.push(loc+': '+warning);
        if(isChoiceType(v.type)){
          if(v.choices.length<2) errors.push(loc+': needs at least two choices.');
          const choiceIds=new Set<string>();
          for(const c of v.choices){unique(c.id,loc+' choice');choiceIds.add(c.id);if(!hasQuestionContent(c.html)) errors.push(loc+': choice is blank.');}
          if(v.correctChoiceIds.length!==(v.type==='singleChoice'?1:v.correctChoiceIds.length) || !v.correctChoiceIds.length) errors.push(loc+': select the correct answer(s).');
          for(const correct of v.correctChoiceIds)if(!choiceIds.has(correct))errors.push(loc+': answer points to a missing choice.');
          if(new Set(v.correctChoiceIds).size!==v.correctChoiceIds.length) errors.push(loc+': duplicate correct answers.');
        } else if(!hasQuestionContent(v.referenceAnswer)) errors.push(loc+': reference answer is empty.');
      }
    }
  }
  return errors;
}

/** Avoid displaying an imported proficiency twice in a section heading. */
export function sectionHeading(title:string,proficiency:string,format:'preview'|'markdown'='preview'):string{
 const level=proficiency.trim();
 if(!level)return title;
 const lower=title.trim().toLowerCase(),name=level.toLowerCase();
 if(lower.endsWith('('+name+')')||lower.endsWith(' — '+name)||lower===name)return title;
 return title+(format==='preview'?' — '+level:' ('+level+')');
}
export function markLabel(points:number):string{return points+' '+(points===1?'mark':'marks');}
export function responseLineCount(type:QuestionType, lines?:number):number {return lines??(type==='writtenResponse'?8:2);}
