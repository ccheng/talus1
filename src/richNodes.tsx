import {useEffect,useState} from 'react';
import {Node,mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer,NodeViewWrapper,type NodeViewProps} from '@tiptap/react';
import DOMPurify from 'dompurify';
import {equationIntegrityWarnings} from './equationSafety';

function clean(html:string):string {return DOMPurify.sanitize(html);}
function dom(html:string):Element|null{
 const parsed=new DOMParser().parseFromString(html,'text/html');
 return parsed.body.firstElementChild;
}
function ImageView({node,updateAttributes}:NodeViewProps){
 const [open,setOpen]=useState(false);
 const [width,setWidth]=useState(String(node.attrs.width||288));
 useEffect(()=>setWidth(String(node.attrs.width||288)),[node.attrs.width]);
 const w=Number(width);
 return <NodeViewWrapper className="talus-rich-image" data-type="talus-image">
  <img src={node.attrs.src as string} alt={node.attrs.alt as string||'Imported illustration'}
    width={node.attrs.width||undefined} height={node.attrs.height||undefined}/>
  <button type="button" className="secondary rich-node-control" contentEditable={false} onClick={()=>setOpen(x=>!x)}
   aria-label="Edit image 1">Edit image size</button>
  {open&&<div className="rich-node-panel" contentEditable={false}>
   <label>Width in CSS pixels<input aria-label="Image width in CSS pixels" type="number" min="16" max="1200" value={width} onChange={e=>setWidth(e.target.value)}/></label>
   <button className="secondary" type="button" onClick={()=>{
    if(Number.isInteger(w)&&w>=16&&w<=1200){
     const oldWidth=Number(node.attrs.width),oldHeight=Number(node.attrs.height);
     updateAttributes({width:String(w),height:oldWidth>0&&oldHeight>0?String(Math.max(1,Math.round(w*oldHeight/oldWidth))):node.attrs.height});
     setOpen(false);
    }
   }}>Apply image size</button>
  </div>}
 </NodeViewWrapper>;
}
function TableView({node,updateAttributes}:NodeViewProps){
 const [open,setOpen]=useState(false);
 const html=String(node.attrs.html||'');
 const table=dom(html);
 const rows=Array.from(table?.querySelectorAll('tr')||[]);
 function editCell(ri:number,ci:number,value:string){
  const next=dom(html);
  if(!next)return;
  const row=next.querySelectorAll('tr')[ri];
  const cell=row?.querySelectorAll('td,th')[ci];
  if(!cell)return;
  cell.textContent=value;
  updateAttributes({html:clean(next.outerHTML)});
 }
 return <NodeViewWrapper className="talus-rich-table" data-type="talus-table">
  <div className="rich-node-rendered" dangerouslySetInnerHTML={{__html:clean(html)}}/>
  <button type="button" className="secondary rich-node-control" contentEditable={false} onClick={()=>setOpen(x=>!x)}
   aria-label="Edit table 1">Edit table cells</button>
  {open&&<div contentEditable={false} className="rich-node-panel rich-table-grid">
   <div className="help">Edit individual table cells. Merged cells and geometry are preserved.</div>
   <div className="rich-table-input-grid">{rows.map((row,ri)=><div className="rich-table-input-row" key={ri}>
    {Array.from(row.querySelectorAll('td,th')).map((cell,ci)=><label key={ci}>
     
     <input aria-label={'Table row '+(ri+1)+' column '+(ci+1)}
      value={cell.textContent||''} onChange={e=>editCell(ri,ci,e.target.value)}/>
    </label>)}
   </div>)}</div>
   <button type="button" className="secondary" onClick={()=>setOpen(false)}>Done editing table</button>
  </div>}
 </NodeViewWrapper>;
}
function MathView({node,updateAttributes}:NodeViewProps){
 const html=String(node.attrs.html||'');
 const [open,setOpen]=useState(false);
 const [source,setSource]=useState(html);
 const [error,setError]=useState('');
 useEffect(()=>{if(!open)setSource(html);},[html,open]);
 function apply(){
  const result=clean(source);
  const first=dom(result);
  if(!first||first.tagName.toLowerCase()!=='math'){
   setError('Equation must contain one MathML <math> root.');return;
  }
  const issues=equationIntegrityWarnings(result);
  if(issues.length){setError(issues.join('; '));return;}
  updateAttributes({html:result});setError('');setOpen(false);
 }
 return <NodeViewWrapper as="span" className="talus-rich-equation" data-type="talus-math">
  <span className="rich-node-rendered" dangerouslySetInnerHTML={{__html:clean(html)}}/>
  <button type="button" className="secondary rich-node-control" aria-label="Edit equation 1" contentEditable={false}
    onClick={()=>{setSource(html);setError('');setOpen(x=>!x);}}>Edit equation</button>
  {open&&<span className="rich-node-panel" contentEditable={false}>
   <label>Advanced equation markup<textarea aria-label="Equation MathML source" value={source} rows={5}
    onChange={e=>{setSource(e.target.value);setError('');}}/></label>
   {error&&<span role="alert" className="import-flag">{error}</span>}
   <button className="secondary" type="button" onClick={apply}>Apply equation</button>
  </span>}
 </NodeViewWrapper>;
}

/**
 * ProseMirror schema nodes for otherwise unsupported rich Word content.
 * An atomic node stays intact during normal surrounding-prose edits.
 * The data is serialized back to the same embedded HTML/MathML, not replaced
 * with a placeholder or an external image URL.
 */
export const TalusImage=Node.create({
 name:'talusImage',group:'block',atom:true,draggable:true,
 addAttributes(){return {
  src:{default:null,parseHTML:element=>element.getAttribute('src')},
  alt:{default:null,parseHTML:element=>element.getAttribute('alt')},
  width:{default:null,parseHTML:element=>element.getAttribute('width')},
  height:{default:null,parseHTML:element=>element.getAttribute('height')}
 };},
 parseHTML(){return [{tag:'img'}];},
 renderHTML({HTMLAttributes}){return ['img',mergeAttributes(HTMLAttributes)];},
 addNodeView(){return ReactNodeViewRenderer(ImageView);}
});
export const TalusTable=Node.create({
 name:'talusTable',group:'block',atom:true,draggable:true,
 addAttributes(){return {html:{default:'',parseHTML:element=>element.outerHTML}};},
 parseHTML(){return [{tag:'table'}];},
 renderHTML({node}){return dom(clean(String(node.attrs.html)))||['table'];},
 addNodeView(){return ReactNodeViewRenderer(TableView);}
});
export const TalusMath=Node.create({
 name:'talusMath',group:'inline',inline:true,atom:true,selectable:true,
 addAttributes(){return {html:{default:'',parseHTML:element=>element.outerHTML}};},
 parseHTML(){return [{tag:'math'}];},
 renderHTML({node}){return dom(clean(String(node.attrs.html)))||['math'];},
 addNodeView(){return ReactNodeViewRenderer(MathView);}
});
