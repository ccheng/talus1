import type { Page } from '@playwright/test';

export type Choice = { id: string; html: string };
export type Variant = { id: string; type: string; stem: string; choices: Choice[]; correctChoiceIds: string[];
  referenceAnswer: string; points: number; shuffleChoices: boolean; responseLines?: number };
export type Slot = { kind: 'slot'; id: string; shufflePosition: boolean; variants: Variant[] };
export type Section = { id: string; title: string; proficiency: string; instructions: string; shuffleQuestions: boolean; items: Slot[] };
export type Assessment = { schemaVersion: 1; id: string; title: string; instructions: string; updatedAt: string;
  sections: Section[]; generationSettings?: { count: number; seed: string }; lastGeneration?: unknown };

const html=(s:string)=>'<p>'+s+'</p>';
let nextId=1;
const id=()=>('e2e-id-'+nextId++);
function question(stem:string,answers:string[],correct:number|number[],type='singleChoice',points=1):Variant {
 const choices=answers.map(a=>({id:id(),html:html(a)}));
 const picks=Array.isArray(correct)?correct:[correct];
 return {id:id(),type,stem:html(stem),choices,correctChoiceIds:picks.map(i=>choices[i].id),
  referenceAnswer:'',points,shuffleChoices:true};
}
function response(stem:string,answer:string,type='shortAnswer',points=2,lines?:number):Variant {
 return {id:id(),type,stem:html(stem),choices:[],correctChoiceIds:[],referenceAnswer:html(answer),
  points,shuffleChoices:true,responseLines:lines};
}
function slot(variants:Variant[],shufflePosition=true):Slot{return {kind:'slot',id:id(),shufflePosition,variants};}

export function fixture(title='Science 10 E2E Assessment',updatedAt='2026-01-01T00:00:00.000Z'):Assessment {
 nextId=1;
 const first=slot([
  question('Which formula represents water?',['H2O','CO2','O2','NaCl'],0),
  question('Which formula represents carbon dioxide?',['H2O','CO2','O2','NaCl'],1),
  question('Which formula represents oxygen gas?',['H2O','CO2','O2','NaCl'],2),
 ]);
 const speed=slot([response('Speed calculation','4 m/s')]);
 const fixed=slot([question('Which SI unit measures acceleration?',['m/s²','m/s','m','s'],0)],false);
 const accel=slot([response('Bike acceleration','2 m/s²'),response('Scooter acceleration','3 m/s²')]);
 const chemical=slot([question('Indicators of chemical change?',['Precipitate','Melting','Gas forms','Paper cut'],[0,2],'multipleSelect')]);
 const graph=slot([question('Area under velocity–time graph?',['Acceleration','Displacement','Average velocity','Elapsed time'],1)]);
 graph.variants[0].shuffleChoices=false;
 const written=slot([response('Distance and displacement','18 m, 6 m east','writtenResponse',4,9)]);
 const mass=slot([response('Closed flask mass','180 g','shortAnswer',3,2)]);
 return {schemaVersion:1,id:id(),title,instructions:'<p><strong>Show work.</strong></p><ul><li><p>Include units.</p></li></ul>',
 updatedAt,generationSettings:{count:6,seed:'science10-qa-2026'},
 sections:[
  {id:id(),title:'Foundations',proficiency:'Base',instructions:'<p><em>Choose carefully.</em></p>',shuffleQuestions:true,items:[first,speed,fixed]},
  {id:id(),title:'Applications',proficiency:'Proficient',instructions:'',shuffleQuestions:true,items:[accel,chemical,graph]},
  {id:id(),title:'Transfer',proficiency:'Exemplary',instructions:'',shuffleQuestions:false,items:[written,mass]},
 ]};
}
export async function importAssessment(page:Page,assessment:Assessment):Promise<void>{
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.header-actions input[type="file"]').setInputFiles({
  name:'fixture.talus.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(assessment)),
 });
 await page.getByText('Imported backup.').waitFor();
}
export async function generate(page:Page,count=6,seed='science10-qa-2026'):Promise<void>{
 await page.getByRole('button',{name:'1. Author'}).click();
 const panel=page.locator('.rightbar');
 await panel.getByLabel('Number of versions').fill(String(count));
 await panel.getByLabel('Reproducibility seed').fill(seed);
 await panel.getByRole('button',{name:'Generate',exact:true}).click();
 await page.getByRole('heading',{name:'Versions & answer keys'}).waitFor();
}
