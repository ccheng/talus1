/**
 * Common fail-closed validation for visually authored HTML and downloaded
 * content. This module must also run on restored JSON with no import warnings.
 */
export function stripExecutableHtml(html:string):string{
 return html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')
  .replace(/<script\b[^>]*\/?>/gi,'')
  .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'')
  .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi,'');
}
export function tableIntegrityWarnings(html:string):string[]{
 const warnings:string[]=[];
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
 const openCount=(html.match(/<table\b/gi)||[]).length;
 if(openCount>tables.length)warnings.push('Invalid table geometry: unclosed table element');
 for(const [,table] of tables){
  const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const n=rows.length;
  if(!n){warnings.push('Invalid table geometry: table has no complete rows');continue;}
  for(const [i,row] of rows.entries()){
   const cells=[...row[1].matchAll(/<(?:td|th)\b([^>]*)>/gi)];
   if(!cells.length)warnings.push('Invalid table geometry: row '+(i+1)+' has no cells');
   for(const cell of cells){
    for(const dimension of ['rowspan','colspan'] as const){
     const attr=new RegExp('(?:^|\\s)'+dimension+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i').exec(cell[1]);
     if(!attr)continue;
     const raw=attr[1]??attr[2]??attr[3];
     const value=Number(raw);
     if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(value)||
       (dimension==='rowspan'&&value>n-i)){
      warnings.push('Invalid table geometry: '+dimension+'="'+raw+'" in row '+(i+1));
     }
    }
   }
  }
 }
 return warnings;
}
