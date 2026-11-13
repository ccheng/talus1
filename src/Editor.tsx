import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { useEffect,useMemo,useRef,useState } from 'react';
import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {stripExecutableHtml} from './contentIntegrity';
import DOMPurify from 'dompurify';
import {TalusImage,TalusTable,TalusMath} from './richNodes';

export function RichEditor({value,onChange,placeholder='Write here…',compact=false,allowHtmlSource=false}:{value:string;onChange:(html:string)=>void;placeholder?:string;compact?:boolean;allowHtmlSource?:boolean}){
 const [sourceWarning,setSourceWarning]=useState('');
 const changeSource=(raw:string)=>{
  const safe=stripExecutableHtml(raw);
  setSourceWarning(raw!==safe?'Unsafe script or event-handler content was removed. Review the remaining HTML before generating.':'');
  onChange(safe);
 };
 const hasRichContent=/<(?:img|table|math)\b/i.test(value);
 if(hasRichContent||allowHtmlSource)return <div className="rich-media-editor">{hasRichContent&&<p className="help">Edit surrounding text directly. Use the controls beside each illustration, table or equation. Images, tables and equations are protected against accidental Backspace deletion. Advanced HTML source remains available for intentional structural changes.</p>}<RichTextTiptap value={value} onChange={onChange} placeholder={placeholder} compact={compact}/><label>Advanced HTML source<textarea aria-label={placeholder+' HTML source'} rows={4} value={value} onChange={e=>changeSource(e.target.value)}/></label>{sourceWarning&&<div role="alert" className="import-flag">{sourceWarning}</div>}{hasRichContent&&<div className="rich-media-preview" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(value)}}/>}</div>;
 return <RichTextTiptap value={value} onChange={onChange} placeholder={placeholder} compact={compact}/>;
}
function RichTextTiptap({value,onChange,placeholder,compact}:{value:string;onChange:(html:string)=>void;placeholder:string;compact:boolean}){
  const sourceSync=useRef(false);
  const preserveNodes=useMemo(()=>Extension.create({
   name:'talusPreventAccidentalRichContentRemoval',
   addProseMirrorPlugins(){
    return [new Plugin({
     filterTransaction:(tr,state)=>{
      if(!tr.docChanged||sourceSync.current)return true;
      const count=(doc:typeof state.doc)=>{
       const counts={talusMath:0,talusImage:0,talusTable:0};
       doc.descendants(n=>{if(n.type.name in counts)counts[n.type.name as keyof typeof counts]++;});
       return counts;
      };
      const before=count(state.doc),after=count(tr.doc);
      return (Object.keys(before) as (keyof typeof before)[]).every(k=>after[k]>=before[k]);
     }
    })];
   }
  }),[]);

  const editor=useEditor({
    extensions:[StarterKit,Superscript,Subscript,TalusImage,TalusTable,TalusMath,preserveNodes],
    content:DOMPurify.sanitize(value),
    onUpdate:({editor})=>onChange(DOMPurify.sanitize(editor.getHTML())),
    editorProps:{
      attributes:{class:'tiptap-content',role:'textbox','aria-multiline':'true','aria-label':placeholder},
      handleTextInput:(view,from,to,text)=>{
       // Word superscript formatting should not accidentally extend into a
       // following plain unit when the teacher types whitespace at its end.
       if(!/^\s/.test(text))return false;
       const sup=view.state.schema.marks.superscript;
       if(!sup)return false;
       const marks=view.state.storedMarks??view.state.doc.resolve(from).marks();
       if(!marks.some(m=>m.type===sup))return false;
       const tr=view.state.tr.insertText(text,from,to);
       tr.removeMark(from,from+text.length,sup);
       tr.setStoredMarks(marks.filter(m=>m.type!==sup));
       view.dispatch(tr);
       return true;
      }
    }
  });
  useEffect(()=>{if(editor&&!editor.isDestroyed&&editor.getHTML()!==value){sourceSync.current=true;try{editor.commands.setContent(DOMPurify.sanitize(value),false);}finally{sourceSync.current=false;}}},[editor,value]);
  if(!editor)return <div>Loading editor…</div>;
  const commands=[
    ['Bold',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold')],
    ['Italic',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic')],
    ['Bullets',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList')],
    ['Numbers',()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList')],
    ['Code',()=>editor.chain().focus().toggleCodeBlock().run(),editor.isActive('codeBlock')],
    ['x²',()=>editor.chain().focus().toggleSuperscript().run(),editor.isActive('superscript')],
    ['x₂',()=>editor.chain().focus().toggleSubscript().run(),editor.isActive('subscript')],
  ] as const;
  return <div className={'rich-editor '+(compact?'compact':'')}>
    <div className="toolbar" role="toolbar" aria-label="Text formatting">{commands.map(([label,action,active])=><button key={label} type="button" className={active?'selected':''} onMouseDown={e=>e.preventDefault()} onClick={action}>{label}</button>)}</div>
    <EditorContent editor={editor}/>
  </div>;
}
