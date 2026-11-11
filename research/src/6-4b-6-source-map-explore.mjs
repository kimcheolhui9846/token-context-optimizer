// 6.4b-6 (N-33) EXPLORATORY microbenchmark after the valid S1 FAIL in perf-run1.json.
// Not a gate: in-process buildSourceMap-only timing, median of 25, no A/A. Used only to pick a
// same-semantics faster implementation; the gate is re-run under a new preregistration.
import { performance } from 'node:perf_hooks';
const MIB=1024*1024;
function legacy(content){const m=[...content.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/gu)];let b=0;return m.filter((x,i)=>x[1].length>0||i<m.length-1).map((x,i)=>{const t=x[1],d=x[2],l=Buffer.byteLength(t,'utf8');const o={line:i+1,startByte:b,endByte:b+l,text:t,delimiter:d};b+=l+Buffer.byteLength(d,'utf8');return o;});}
function v1(content){const lines=[];let ls=0,b=0;const push=(e,d)=>{const t=content.slice(ls,e);const l=Buffer.byteLength(t,'utf8');lines.push({line:lines.length+1,startByte:b,endByte:b+l,text:t,delimiter:d});b+=l+d.length;};
for(let i=0;i<content.length;i++){const c=content.charCodeAt(i);if(c===10){push(i,'\n');ls=i+1;}else if(c===13){if(content.charCodeAt(i+1)===10){push(i,'\r\n');i++;}else push(i,'\r');ls=i+1;}}if(ls<content.length)push(content.length,'');return lines;}
function v2(content){const lines=[];const n=content.length;let ls=0,b=0,lf=content.indexOf('\n'),cr=content.indexOf('\r');
while(lf!==-1||cr!==-1){let e,d;if(cr!==-1&&(lf===-1||cr<lf)){if(lf===cr+1){d='\r\n';}else d='\r';e=cr;}else{e=lf;d='\n';}
const t=content.slice(ls,e);const l=Buffer.byteLength(t,'utf8');lines.push({line:lines.length+1,startByte:b,endByte:b+l,text:t,delimiter:d});b+=l+d.length;ls=e+d.length;
if(lf!==-1&&lf<ls)lf=content.indexOf('\n',ls);if(cr!==-1&&cr<ls)cr=content.indexOf('\r',ls);}
if(ls<n){const t=content.slice(ls);const l=Buffer.byteLength(t,'utf8');lines.push({line:lines.length+1,startByte:b,endByte:b+l,text:t,delimiter:''});}return lines;}
const sh={S1:'abcdefghijklmnopqrstuvwxyz0123456789 '.repeat(28400).slice(0,MIB),S3:'a\n'.repeat(MIB/2),S4:'\n'.repeat(MIB),S5:Array.from({length:20000},(_,i)=>`Line ${i}: mixed delimiters keep byte offsets exact.`+['\r\n','\n','\r'][i%3]).join(''),S2:('한글 中文 é \u{1F600} '.repeat(2978)+'x'.repeat(19)+'\n').repeat(16)};
for(const [k,s] of Object.entries(sh)){const ref=JSON.stringify(legacy(s));for(const f of [v1,v2]) if(JSON.stringify(f(s))!==ref) console.log('MISMATCH',k,f.name);
const r={};for(const f of [legacy,v1,v2]){const xs=[];for(let i=0;i<25;i++){const t=performance.now();f(s);xs.push(performance.now()-t);}xs.sort((a,b)=>a-b);r[f.name]=xs[12].toFixed(2);}console.log(k,JSON.stringify(r));}
function v1b(content){const lines=[];const n=content.length;let ls=0,b=0,i=0;
while(i<n){const c=content.charCodeAt(i);if(c>13||(c!==10&&c!==13)){i++;continue;}
let d;const e=i;if(c===10){d='\n';i++;}else if(i+1<n&&content.charCodeAt(i+1)===10){d='\r\n';i+=2;}else{d='\r';i++;}
const t=content.slice(ls,e);const l=Buffer.byteLength(t,'utf8');lines.push({line:lines.length+1,startByte:b,endByte:b+l,text:t,delimiter:d});b+=l+d.length;ls=i;}
if(ls<n){const t=content.slice(ls);const l=Buffer.byteLength(t,'utf8');lines.push({line:lines.length+1,startByte:b,endByte:b+l,text:t,delimiter:''});}return lines;}
console.log('--- v1b');
for(const [k,s] of Object.entries(sh)){const ref=JSON.stringify(legacy(s));if(JSON.stringify(v1b(s))!==ref)console.log('MISMATCH',k);
const r={};for(const f of [legacy,v1,v1b,v2]){const xs=[];for(let i=0;i<25;i++){const t=performance.now();f(s);xs.push(performance.now()-t);}xs.sort((a,b)=>a-b);r[f.name]=xs[12].toFixed(2);}console.log(k,JSON.stringify(r));}
// fresh-process first call cost matters (each indexArtifact call in gate is warm though)
