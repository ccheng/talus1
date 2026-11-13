import {useMemo,useState} from 'react';
import {compareImportDrafts} from './importComparison';
import type {ImportDraft} from './importParser';

function normalizeHtml(html:string){
 const template=document.createElement('template');template.innerHTML=html;
 for(const element of template.content.querySelectorAll('img,table,math'))element.replaceWith(document.createTextNode(' '));
 for(const block of template.content.querySelectorAll('p,div,li,br,blockquote'))block.after(document.createTextNode(' '));
 return template.content.textContent??'';
}

const assetNames={img:'Image',table:'Table',math:'Equation'};
function richAssets(html:string){
 const template=document.createElement('template');template.innerHTML=html;
 return Array.from(template.content.querySelectorAll('img,table,math'),element=>{
  const kind=element.localName as keyof typeof assetNames;
  const description=kind==='img'?element.getAttribute('alt'):element.textContent;
  const name=description?.replace(/\s+/g,' ').trim().slice(0,80);
  const label=assetNames[kind]+(name?' '+name:'');
  const identity=kind==='img'?(element.getAttribute('src')??''):element.outerHTML;
  return {label,identity};
 });
}

export function ImportComparison({detect,ai,current,onQuestion}:{
 detect:ImportDraft;ai:ImportDraft;current:ImportDraft;onQuestion:(id:string)=>void;
}){
 const findings=useMemo(()=>compareImportDrafts(detect,ai,normalizeHtml,richAssets),[detect,ai]);
 const [showAll,setShowAll]=useState(false);
 const currentChanges=useMemo(()=>new Map(compareImportDrafts(ai,current,normalizeHtml,richAssets).map(finding=>[
  finding.questionId,new Set(finding.changes.map(change=>change.kind))
 ])),[ai,current]);
 const currentIds=new Set(current.sections.flatMap(section=>section.questions.map(q=>q.id)));
 if(!findings.length)return null;
 const preview=(draft:ImportDraft,lines:number[])=>{
  const map=new Map(draft.lines.map(line=>[line.number,line.text]));
  return lines.map(line=>map.get(line)).filter(Boolean).join(' · ');
 };
 return <section className="import-comparison" aria-labelledby="import-comparison-title">
  <h3 id="import-comparison-title">Detect and AI disagreements</h3>
  <p className="help">These differences compare the two original proposals. Check the source before choosing an answer or editing the draft.</p>
  {(showAll?findings:findings.slice(0,8)).map((finding,index)=><details key={finding.questionId??index}>
   <summary>{finding.title} · {finding.changes.map(change=>change.kind).join(', ')}</summary>
   {finding.changes.map(change=><section key={change.kind} className="comparison-change">
    <h4>{change.kind}{currentChanges.get(finding.questionId)?.has(change.kind)?' · Edited in current draft':''}</h4>
    <div className="comparison-pair">
     <div><strong>Detect</strong><p>{change.detect}</p>
      {!!change.detectLines.length&&<p className="help">Source {change.detectLines.map(line=>'line '+line).join(', ')} · {preview(detect,change.detectLines)}</p>}</div>
     <div><strong>AI proposal</strong><p>{change.ai}</p>
      {!!change.aiLines.length&&<p className="help">Source {change.aiLines.map(line=>'B'+line).join(', ')} · {preview(ai,change.aiLines)}</p>}</div>
    </div>
   </section>)}
   {finding.questionId&&currentIds.has(finding.questionId)&&<button className="secondary" onClick={()=>onQuestion(finding.questionId!)}>Review this question</button>}
  </details>)}
  {findings.length>8&&<button className="secondary" onClick={()=>setShowAll(value=>!value)}>{showAll?'Show fewer disagreements':'Show all '+findings.length+' disagreements'}</button>}
 </section>;
}
