import type { Section, Slot, TestItem } from './model';

export interface PositionedSlot { slot: Slot; shared?: { html:string; labelRange?:true; size:number } }

type Random = () => number;
type Shuffle = <T>(items:readonly T[],random:Random)=>T[];

function pinned(item: TestItem): item is Slot {
  return item.kind === 'slot' && !item.shufflePosition;
}

function itemLength(item: TestItem): number {
  return item.kind === 'group' ? item.items.length : 1;
}

function orderSection(section:Section, random:Random, shuffle:Shuffle): TestItem[] {
  if (!section.shuffleQuestions) return section.items;
  if (!section.items.some(pinned)) return shuffle(section.items,random);

  // Shuffle between anchors first, then let equal-sized items trade across anchors.
  // Neither step changes the number of questions before any pinned slot.
  let pending:TestItem[]=[];
  const ordered:TestItem[]=[];
  for (const item of section.items) {
    if (!pinned(item)) pending.push(item);
    else {
      ordered.push(...shuffle(pending,random),item);
      pending=[];
    }
  }
  ordered.push(...shuffle(pending,random));
  const buckets=new Map<number,number[]>();
  ordered.forEach((item,index)=>{
    if (pinned(item)) return;
    const size=itemLength(item);
    const positions=buckets.get(size)??[];
    positions.push(index);
    buckets.set(size,positions);
  });
  for (const positions of buckets.values()) {
    const items=shuffle(positions.map(i=>ordered[i]),random);
    positions.forEach((position,index)=>{ordered[position]=items[index];});
  }
  return ordered;
}

export function makeLayout(sections:Section[], random:Random, shuffle:Shuffle): PositionedSlot[][] {
  return sections.map(section=>orderSection(section,random,shuffle).flatMap(item=>{
    if (item.kind==='slot') return [{slot:item}];
    const children=item.shuffleWithinGroup?shuffle(item.items,random):item.items;
    return children.map((slot,index)=>({
      slot,
      shared:index===0?{html:item.sharedHtml,labelRange:item.rangeLabel,size:children.length}:undefined,
    }));
  }));
}

export function diverseLayouts(sections:Section[],count:number,rng:(seed:string)=>Random,shuffle:Shuffle,seed:string) {
  const first=makeLayout(sections,rng(seed+'|question-layout|0'),shuffle);
  if(count===1)return [first];
  const pool=[first];
  const ids=[first.flat().map(({slot})=>slot.id)];
  const seen=new Set([JSON.stringify(ids[0])]);
  // Bound generation and scoring even for inputs allowing many permutations.
  const attempts=Math.min(384,Math.max(96,count*8));
  for(let i=1;i<attempts&&pool.length<96;i++){
    const layout=makeLayout(sections,rng(seed+'|question-layout|'+i),shuffle);
    const order=layout.flat().map(({slot})=>slot.id);
    const signature=JSON.stringify(order);
    if(seen.has(signature))continue;
    seen.add(signature);
    pool.push(layout);
    ids.push(order);
  }
  const n=pool.length;
  if(n<count)return Array.from({length:count},(_,i)=>pool[i%n]);

  const distances=Array.from({length:n},()=>new Uint32Array(n));
  for(let i=1;i<n;i++)for(let j=0;j<i;j++){
    let changed=0;
    ids[i].forEach((id,index)=>{if(id!==ids[j][index])changed++;});
    distances[i][j]=distances[j][i]=changed;
  }
  const selected=[0];
  const best=(candidate:number, incumbent:number, chosen:number[])=>{
    const score=(index:number)=>chosen.reduce(([min,total],other)=>{
      const distance=distances[index][other];
      return [Math.min(min,distance),total+distance];
    },[Infinity,0]);
    const [min,sum]=score(candidate);
    const [previousMin,previousSum]=score(incumbent);
    return min>previousMin||min===previousMin&&sum>previousSum;
  };
  if(count>=3){
    // A farthest pair can leave a third form close to one of them. Compare
    // triples anchored to the seeded first layout before adding more forms.
    let min=-1,total=-1,pair=[1,2];
    for(let i=1;i<n;i++)for(let j=i+1;j<n;j++){
      const a=distances[0][i],b=distances[0][j],c=distances[i][j];
      const closest=Math.min(a,b,c),combined=a+b+c;
      if(closest>min||closest===min&&combined>total){
        min=closest;
        total=combined;
        pair=[i,j];
      }
    }
    selected.push(...pair);
  }
  while(selected.length<count){
    let next=-1;
    for(let i=0;i<n;i++){
      if(!selected.includes(i)&&(next===-1||best(i,next,selected)))next=i;
    }
    selected.push(next);
  }
  return selected.map(i=>pool[i]);
}
