/**
 * Unresolved equations are integrity errors, not dismissible source warnings.
 * Scan every authored field even when old JSON has no importWarnings.
 * No DOM dependencies: identical checks in Vitest, JSON restore and generation.
 */
export function equationIntegrityWarnings(html:string):string[]{
 if(!html)return [];
 const warnings:string[]=[];
 const visible=html.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
 if(/Word\s+equation\s+requires\s+manual\s+review/i.test(visible))
  warnings.push('unresolved Word equation placeholder; repair the equation before generating');
 const matches=html.matchAll(/<math\b[^>]*>([\s\S]*?)<\/math>/gi);
 for(const match of matches){
  interface MathNode {tag:string; text:string; children:MathNode[]}
  const root:MathNode={tag:'math',text:'',children:[]};
  const stack=[root];
  const tokens=/<(\/?)([a-z][\w:-]*)\b[^>]*>|([^<]+)/gi;
  let token:RegExpExecArray|null;
  while((token=tokens.exec(match[1]))){
   if(token[3]){for(const node of stack)node.text+=token[3];continue;}
   if(token[1]==='/'){if(stack.length>1)stack.pop();continue;}
   const node:MathNode={tag:token[2].toLowerCase(),text:'',children:[]};
   stack[stack.length-1].children.push(node);
   if(!token[0].endsWith('/>'))stack.push(node);
  }
  function visit(n:MathNode){
   const required:{[key:string]:[number,string]}={
    mfrac:[2,'fraction'],msup:[2,'superscript'],msub:[2,'subscript'],
    msubsup:[3,'combined script'],mroot:[2,'root']
   };
   const rule=required[n.tag];
   if(rule){
    const [count,label]=rule;
    if(n.children.length!==count||n.children.some(x=>!x.text.trim())){
     const missing=n.tag==='mfrac'&&(n.children.length<2||!n.children[1]?.text.trim())
       ?'empty denominator or missing denominator' : 'invalid '+label+' operand';
     warnings.push('invalid '+label+': '+missing);
    }
   }
   if(n.tag==='msqrt'&&!n.text.trim())warnings.push('invalid root: empty radicand');
   n.children.forEach(visit);
  }
  root.children.forEach(visit);
 }
 return warnings;
}
