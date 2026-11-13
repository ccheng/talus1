import {useState} from 'react';
import {RichEditor} from './Editor';
import {groupQuestions,moveAdjacentIntoGroup,moveGroupChildOut,ungroupQuestions,updateGroup} from './groupAuthoring';
import {slotsOf,type Group,type Section,type Slot} from './model';

export function GroupAuthoring({section,slot,group,onEdit}:{
 section:Section;slot:Slot;group?:Group;onEdit:(fn:(section:Section)=>Section)=>void;
}){
 const [endId,setEndId]=useState('');
 const [destination,setDestination]=useState('');
 const [sharedSourceOpen,setSharedSourceOpen]=useState(false);
 const slots=slotsOf(section),number=(id:string)=>slots.findIndex(q=>q.id===id)+1;
 if(!group){
  const at=section.items.findIndex(item=>item.id===slot.id);
  const following:Slot[]=[];
  for(const item of section.items.slice(at+1)){
   if(item.kind==='group')break;
   following.push(item);
  }
  if(!following.length)return null;
  return <section className="panel group-authoring">
   <h2>Group consecutive questions</h2>
   <label>Group through question<select value={endId} onChange={event=>setEndId(event.target.value)}>
    <option value="">Select the last question</option>
    {following.map(q=><option key={q.id} value={q.id}>Question {number(q.id)}</option>)}
   </select></label>
   <button className="secondary" disabled={!following.some(q=>q.id===endId)} onClick={()=>onEdit(s=>groupQuestions(s,slot.id,endId))}>
    Group questions
   </button>
  </section>;
 }
 const index=section.items.findIndex(item=>item.id===group.id);
 const children=group.items,child=children.findIndex(item=>item.id===slot.id);
 const range=children.map(item=>number(item.id));
 const hasShared=!!group.sharedHtml.trim();
 const validDestination=destination==='section'||children.some(item=>item.id===destination);
 return <section className="panel group-authoring">
  <h2>Question group {range.length===1?range[0]:range[0]+'–'+range.at(-1)}</h2>
  {!/<(?:img|table|math)\b/i.test(group.sharedHtml)&&<button className="secondary" onClick={()=>setSharedSourceOpen(open=>!open)}>{sharedSourceOpen?'Close HTML entry':'Add or edit shared HTML source'}</button>}
  <RichEditor allowHtmlSource={sharedSourceOpen} value={group.sharedHtml} placeholder="Shared group material" onChange={sharedHtml=>onEdit(s=>updateGroup(s,group.id,item=>({...item,sharedHtml})))}/>
  <label className="check"><input type="checkbox" checked={group.shuffleWithinGroup}
   onChange={event=>onEdit(s=>updateGroup(s,group.id,item=>({...item,shuffleWithinGroup:event.target.checked})))}/> Shuffle questions within this group</label>
  <div className="group-actions">
   {section.items[index-1]?.kind==='slot'&&<button className="secondary" onClick={()=>onEdit(s=>moveAdjacentIntoGroup(s,group.id,'before'))}>Include previous question</button>}
   {section.items[index+1]?.kind==='slot'&&<button className="secondary" onClick={()=>onEdit(s=>moveAdjacentIntoGroup(s,group.id,'after'))}>Include next question</button>}
   {children.length>1&&(child===0||child===children.length-1)&&<button className="secondary" onClick={()=>onEdit(s=>moveGroupChildOut(s,group.id,slot.id))}>Move this question out of group</button>}
  </div>
  {hasShared&&<label>Keep shared material in<select value={destination} onChange={event=>setDestination(event.target.value)}>
   <option value="">Select where to keep the shared material</option>
   <option value="section">Section instructions</option>
   {children.map(item=><option key={item.id} value={item.id}>Question {number(item.id)} (all alternatives)</option>)}
  </select></label>}
  <button className="secondary" disabled={hasShared&&!validDestination} onClick={()=>onEdit(s=>ungroupQuestions(s,group.id,destination||undefined))}>Ungroup questions</button>
 </section>;
}
