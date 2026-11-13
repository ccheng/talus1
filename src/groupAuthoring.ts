import {uid,type Group,type Section,type Slot,type TestItem} from './model';

export function groupQuestions(section:Section,firstId:string,lastId:string):Section {
 const first=section.items.findIndex(item=>item.id===firstId);
 const last=section.items.findIndex(item=>item.id===lastId);
 if(first<0||last<=first)return section;
 const items=section.items.slice(first,last+1);
 if(!items.every((item):item is Slot=>item.kind==='slot'))return section;
 const group:Group={kind:'group',id:uid(),items,sharedHtml:'',shuffleWithinGroup:false};
 return {...section,items:[...section.items.slice(0,first),group,...section.items.slice(last+1)]};
}

export function updateGroup(section:Section,id:string,update:(group:Group)=>Group):Section {
 return {...section,items:section.items.map(item=>item.kind==='group'&&item.id===id?update(item):item)};
}

export function moveAdjacentIntoGroup(section:Section,id:string,side:'before'|'after'):Section {
 const at=section.items.findIndex(item=>item.id===id&&item.kind==='group');
 const group=section.items[at],neighbor=section.items[at+(side==='before'?-1:1)];
 if(group?.kind!=='group'||neighbor?.kind!=='slot')return section;
 const items=side==='before'?[neighbor,...group.items]:[...group.items,neighbor];
 return {...section,items:section.items.flatMap(item=>item===group?[{...group,items}]:item===neighbor?[]:[item])};
}

export function moveGroupChildOut(section:Section,id:string,slotId:string):Section {
 const group=section.items.find((item):item is Group=>item.id===id&&item.kind==='group');
 if(!group)return section;
 if(group.items.length===1)return group.items[0].id===slotId&&!group.sharedHtml.trim()?ungroupQuestions(section,id):section;
 const at=group.items.findIndex(item=>item.id===slotId),child=group.items[at];
 if(!child||at!==0&&at!==group.items.length-1)return section;
 const updated={...group,items:group.items.filter(item=>item!==child)};
 return {...section,items:section.items.flatMap(item=>item!==group?[item]:at===0?[child,updated]:[updated,child])};
}

export function ungroupQuestions(section:Section,id:string,destination?:string):Section {
 const group=section.items.find((item):item is Group=>item.id===id&&item.kind==='group');
 if(!group)return section;
 if(group.sharedHtml.trim()&&destination!=='section'&&!group.items.some(slot=>slot.id===destination))return section;
 const children=group.items.map(slot=>slot.id===destination&&group.sharedHtml.trim()?{
  ...slot,variants:slot.variants.map(variant=>({...variant,stem:group.sharedHtml+variant.stem}))
 }:slot);
 return {...section,
  instructions:destination==='section'?section.instructions+group.sharedHtml:section.instructions,
  items:section.items.flatMap(item=>item===group?children:[item])
 };
}

export function removeQuestion(section:Section,slotId:string):Section {
 const group=section.items.find((item):item is Group=>item.kind==='group'&&item.items.some(slot=>slot.id===slotId));
 if(group?.items.length===1&&group.sharedHtml.trim())return section;
 return {...section,items:section.items.flatMap<TestItem>(item=>{
  if(item.kind==='slot')return item.id===slotId?[]:[item];
  if(item!==group)return [item];
  const items=item.items.filter(slot=>slot.id!==slotId);
  return items.length?[{...item,items}]:[];
 })};
}
