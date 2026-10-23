import katex from 'katex';

const OPENERS=[['$$','$$',true],['$','$',false],['\\(','\\)',false],['\\[','\\]',true]];
const escaped=(text,index)=>{let n=0;while(index>0&&text[--index]==='\\')n++;return n%2===1;};
const normalize=math=>math.replace(/\\(begin|end)\{align\*?\}/g,'\\$1{aligned}').replace(/\\(begin|end)\{gather\*?\}/g,'\\$1{gathered}').replace(/\\(?:begin|end)\{equation\*?\}/g,'');

/** Strictly validates delimited KaTeX and rejects a common missing-command corruption. */
export function validMathText(value=''){
 const text=String(value);
 if(/\b[A-Za-z]\s+eq\s+0\b/.test(text))return false;
 let i=0;
 while(i<text.length){
  const env=text.slice(i).match(/\\begin\{(align\*?|aligned|gather\*?|gathered|equation\*?)\}/);
  const opener=OPENERS.find(([open])=>text.startsWith(open,i)&&!escaped(text,i));
  if(!opener&&!env){i++;continue;}
  let open,close,block,bodyStart;
  if(env){open=env[0];close=`\\end{${env[1]}}`;block=true;bodyStart=i+open.length;}
  else{[open,close,block]=opener;bodyStart=i+open.length;}
  let end=text.indexOf(close,bodyStart);
  while(end>=0&&escaped(text,end))end=text.indexOf(close,end+close.length);
  if(end<0||(!block&&text.slice(bodyStart,end).includes('\n')))return false;
  const body=normalize(text.slice(bodyStart,end));
  try{katex.renderToString(body,{displayMode:block,throwOnError:true,strict:'error',trust:false,maxSize:20,maxExpand:1000});}
  catch{return false;}
  i=end+close.length;
 }
 return true;
}

export function validModelMath(value){
 if(typeof value==='string')return validMathText(value);
 if(Array.isArray(value))return value.every(validModelMath);
 if(value&&typeof value==='object')return Object.values(value).every(validModelMath);
 return true;
}
