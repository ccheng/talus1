import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { useEffect } from 'react';
import DOMPurify from 'dompurify';

export function RichEditor({value,onChange,placeholder='Write here…',compact=false}:{value:string;onChange:(html:string)=>void;placeholder?:string;compact?:boolean}){
  const editor=useEditor({
    extensions:[StarterKit,Superscript,Subscript],
    content:DOMPurify.sanitize(value),
    onUpdate:({editor})=>onChange(DOMPurify.sanitize(editor.getHTML())),
    editorProps:{attributes:{class:'tiptap-content','aria-label':placeholder}}
  });
  useEffect(()=>{if(editor&&!editor.isDestroyed&&editor.getHTML()!==value)editor.commands.setContent(DOMPurify.sanitize(value),false);},[editor,value]);
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
