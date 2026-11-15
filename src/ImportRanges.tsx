import {useState} from 'react';
import DOMPurify from 'dompurify';
import type {ImportDraft} from './importParser';
import {confirmedImportRange,locateImportRange,type ImportRange} from './rangeImport';

function RangeReview({range,draft,onResolve}:{
 range:ImportRange;draft:ImportDraft;onResolve:(id:string,kind:'group'|'decline',first?:number,last?:number)=>void;
}){
 const [first,setFirst]=useState(String(range.first)),[last,setLast]=useState(String(range.last));
 const candidate=locateImportRange(draft,range,Number(first),Number(last));
 const confirmed=confirmedImportRange(draft,range);
 const section=draft.sections.find(item=>item.id===range.sectionId);
 return <article className="import-range">
  <h4>{range.cueText}</h4>
  <p className="help">Source line {range.cueLine}{range.sharedLines.length?', shared material on lines '+range.sharedLines.join(', '):''} · {section?.title??'Source section'}</p>
  {range.sharedHtml&&<div className="import-rendered" aria-label="Proposed shared material" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(range.sharedHtml)}}/>}
  <div className="columns">
   <label>First source question<input type="number" min="1" max="999" value={first} onChange={event=>setFirst(event.target.value)}/></label>
   <label>Last source question<input type="number" min="1" max="999" value={last} onChange={event=>setLast(event.target.value)}/></label>
  </div>
  {candidate.questions?<ol>{candidate.questions.map(question=><li key={question.id}>
   Source question {question.sourceNumber} · line {question.sourceStart}
  </li>)}</ol>:<p className="import-flag" role="status">{candidate.reason}</p>}
  {confirmed&&<p role="status">Confirmed source questions {confirmed[0].sourceNumber}–{confirmed.at(-1)?.sourceNumber}.</p>}
  {range.resolution?.kind==='decline'&&<p role="status">Declined. The cue and shared material will stay in the ordinary import{range.fallbackLocation==='question'?' with the preceding question':''}.</p>}
  {range.resolution?.kind==='group'&&!confirmed&&<p role="status">The confirmed questions changed. Confirm an updated range or keep the ordinary import.</p>}
  <div className="import-review-tools">
   <button className="secondary" disabled={!candidate.questions} onClick={()=>onResolve(range.id,'group',Number(first),Number(last))}>Confirm question group</button>
   <button className="secondary" disabled={range.resolution?.kind==='decline'} onClick={()=>onResolve(range.id,'decline')}>Decline grouping</button>
  </div>
 </article>;
}
export function ImportRanges({draft,onResolve}:{draft:ImportDraft;onResolve:Parameters<typeof RangeReview>[0]['onResolve']}){
 if(!draft.ranges?.length)return null;
 return <section className="import-comparison" aria-labelledby="range-proposals-title">
  <h3 id="range-proposals-title">Shared question ranges</h3>
  <p className="help">Review each source cue and adjust its question numbers if needed. Talus groups only confirmed proposals. Unconfirmed material stays in the ordinary import.</p>
  {draft.ranges.map(range=><RangeReview key={range.id} range={range} draft={draft} onResolve={onResolve}/>)}
 </section>;
}
