/** Independent, bounded JSON-value contract. No Notion client or undocumented format. */
export const FORMAT = 'research-block-fidelity';
export const LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, documentBytes: 2 * 1024 * 1024, depth: 40, documentDepth: 36, nodes: 100000, documentNodes: 45000, blocks: 2000, text: 100000, runs: 1000 });
export const TYPES = Object.freeze(['paragraph', 'heading_1', 'heading_2', 'heading_3', 'quote', 'bulleted_list_item', 'numbered_list_item', 'equation']);
export const COLORS = Object.freeze(['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red', ...['gray','brown','orange','yellow','green','blue','purple','pink','red'].map(c => c + '_background')]);
const FLAGS = ['bold', 'italic', 'strikethrough', 'underline', 'code'];
const BAD = new Set(['__proto__', 'prototype', 'constructor']);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.hasOwn(o, k);
export const clone = v => structuredClone(v);
export const pointer = segments => segments.length ? '/' + segments.map(s => String(s).replaceAll('~','~0').replaceAll('/','~1')).join('/') : '';
function fail(message) { throw new Error(message); }
function validString(s) {
  if (s.length > LIMITS.text) fail('String exceeds the 100,000-code-unit limit.');
  for (let i=0;i<s.length;i++) { const c=s.charCodeAt(i); if (c>=0xd800&&c<=0xdbff) { const n=s.charCodeAt(++i); if (!(n>=0xdc00&&n<=0xdfff)) fail('Ill-formed Unicode surrogate rejected.'); } else if(c>=0xdc00&&c<=0xdfff) fail('Ill-formed Unicode surrogate rejected.'); }
  return s;
}
/** Recursive JSON parser detects duplicate keys before they could be overwritten. */
export function parseJSON(text,scope='input') {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LIMITS.bytes) fail('JSON exceeds the 5 MiB input limit.');
  let i=0,nodes=0; const ws=()=>{while(/[\x20\n\r\t]/.test(text[i]??'!'))i++;};
  function str() { const start=i++;let closed=false;while(i<text.length){const c=text[i++];if(c==='\\'){i++;continue;}if(c==='"'){closed=true;break;}} if(!closed)fail('Unterminated JSON string.');return validString(JSON.parse(text.slice(start,i))); }
  function value(depth) {
    if(depth>(scope==='document'?LIMITS.documentDepth:LIMITS.depth)||++nodes>(scope==='document'?LIMITS.documentNodes:LIMITS.nodes))fail('JSON depth or node limit exceeded.');ws();const c=text[i];
    if(c==='"')return str();
    if(c==='{'){i++;ws();const out=Object.create(null);if(text[i]==='}'){i++;return out;}while(true){ws();if(text[i]!=='"')fail('Expected an object key.');const k=str();if(BAD.has(k))fail(`Unsafe object key rejected: ${k}`);if(own(out,k))fail(`Duplicate object key rejected: ${k}`);ws();if(text[i++]!==':')fail('Expected colon.');out[k]=value(depth+1);ws();if(text[i]==='}'){i++;return out;}if(text[i++]!==',')fail('Expected object comma.');}}
    if(c==='['){i++;ws();const out=[];if(text[i]===']'){i++;return out;}while(true){out.push(value(depth+1));ws();if(text[i]===']'){i++;return out;}if(text[i++]!==',')fail('Expected array comma.');}}
    for(const [literal,v]of [['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
    const match=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!match)fail('Invalid JSON value.');i+=match[0].length;const num=Number(match[0]);if(!Number.isFinite(num)||(Number.isInteger(num)&&!Number.isSafeInteger(num))||Object.is(num,-0))fail('Non-finite, negative-zero or unsafe integer JSON number rejected.');return num;
  }
  const result=value(0);ws();if(i!==text.length)fail('Unexpected trailing JSON data.');return result;
}
function bounded(value) { return parseJSON(JSON.stringify(value),'document'); }
function rootEntries(document) {
  if(Array.isArray(document))return document.map((b,i)=>({b,path:[i]}));
  if(obj(document)&&document.object==='list'&&Array.isArray(document.results))return document.results.map((b,i)=>({b,path:['results',i]}));
  if(obj(document)&&typeof document.type==='string')return [{b:document,path:[]}];
  fail('Import a block, block array, or Notion list object with a results array. Page exports and Markdown are not block JSON.');
}
function childEntries(b,path) {
  const body=b[b.type];
  if(own(b,'children')&&own(body,'children'))fail('Ambiguous child storage: both block.children and type.children exist.');
  const key=own(b,'children')?['children']:own(body,'children')?[b.type,'children']:null;
  if(!key)return [];
  let children=b;for(const k of key)children=children[k];
  if(!Array.isArray(children))fail('children must be an array of blocks.');
  return children.map((child,i)=>({b:child,path:[...path,...key,i]}));
}
export function blockEntries(document) {
  const entries=[];
  function walk({b,path},depth) {
    if(!obj(b)||typeof b.type!=='string'||!(/^[a-z][a-z0-9_]{0,63}$/).test(b.type)||!obj(b[b.type]))fail(`Invalid block shape at ${pointer(path)}.`);
    if(entries.length>=LIMITS.blocks)fail('Block limit exceeded (2,000).');
    const supported=TYPES.includes(b.type);const entry={block:b,path,depth,supported};entries.push(entry);
    if(supported)for(const child of childEntries(b,path))walk(child,depth+1);
  }
  for(const e of rootEntries(document))walk(e,0);
  return entries;
}
export function validateDocument(document) {if(new TextEncoder().encode(JSON.stringify(document)).byteLength>LIMITS.documentBytes)fail('Document exceeds the 2 MiB compact JSON limit; native projects reserve room for the baseline.');const safe=bounded(document);blockEntries(safe);return safe;}
export function importDocument(text) {
  const parsed=parseJSON(text);
  if(obj(parsed)&&parsed.format===FORMAT) {
    if(parsed.version!==1||!own(parsed,'document')||!own(parsed,'baseline'))fail('Unsupported native project version/shape.');
    const keys=Object.keys(parsed);if(keys.some(k=>!['format','version','baseline','document'].includes(k)))fail('Unknown native envelope field; refuse to silently discard it.');
    validateDocument(parsed.baseline);validateDocument(parsed.document);return parsed;
  }
  const document=validateDocument(parsed);return {format:FORMAT,version:1,baseline:clone(document),document};
}
export function nativeJSON(project) { return JSON.stringify(project)+'\n'; }
export function blockJSON(project) { return JSON.stringify(project.document)+'\n'; }
export function at(document,path) {let target=document;for(const k of path){if(!Array.isArray(target)&&!obj(target))fail('Stale block path.');if(!own(target,k)||BAD.has(String(k)))fail('Invalid block path.');target=target[k];}return target;}
export function editableRun(run) {
  if(!obj(run))return {ok:false,reason:'Malformed rich-text object; preserved opaque.'};
  if(run.type==='text'&&obj(run.text)&&typeof run.text.content==='string')return {ok:true,kind:'text',value:run.text.content};
  if(run.type==='equation'&&obj(run.equation)&&typeof run.equation.expression==='string')return {ok:true,kind:'equation',value:run.equation.expression};
  return {ok:false,reason:`${run.type??'unknown'} rich-text is opaque; no flattening.`};
}
export function editRun(project,path,index,value,annotations=null) {
  validString(value);const next=clone(project);const b=at(next.document,path);
  if(!TYPES.includes(b.type)||b.type==='equation')fail('Block is opaque or not a rich-text block.');
  const runs=b[b.type].rich_text;if(!Array.isArray(runs)||runs.length>LIMITS.runs||!Number.isInteger(index)||index<0||index>=runs.length)fail('Invalid rich-text run index or bounds.');
  const run=runs[index],editable=editableRun(run);if(!editable.ok)fail(editable.reason);
  if(own(run,'plain_text')&&typeof run.plain_text!=='string')fail('Malformed cached plain_text cannot be safely rewritten.');
  if(value.length>(editable.kind==='text'?2000:1000))fail('Edited text/equation exceeds the documented request-value length. No automatic splitting.');
  run[editable.kind][editable.kind==='text'?'content':'expression']=value;
  if(own(run,'plain_text'))run.plain_text=value;
  if(annotations!==null){if(!obj(annotations))fail('Annotations must be an object.');if(own(run,'annotations')&&!obj(run.annotations))fail('Malformed annotations are opaque; cannot rewrite.');run.annotations??={};for(const [k,v]of Object.entries(annotations)){if(FLAGS.includes(k)&&typeof v==='boolean')run.annotations[k]=v;else if(k==='color'&&COLORS.includes(v))run.annotations.color=v;else fail('Unsupported annotation edit.');}}
  validateDocument(next.document);return next;
}
export function editEquation(project,path,value) {validString(value);if(value.length>1000)fail('Equation exceeds the 1,000-code-unit edit limit.');const next=clone(project),b=at(next.document,path);if(b.type!=='equation'||typeof b.equation.expression!=='string')fail('Equation block is not editable.');b.equation.expression=value;validateDocument(next.document);return next;}
export function appendBlock(project,type) {
  if(!TYPES.includes(type))fail('Unsupported new block type.');const next=clone(project);const b={object:'block',type,[type]:type==='equation'?{expression:'E = mc^2'}:{rich_text:[{type:'text',text:{content:'New research note',link:null},annotations:{bold:false,italic:false,strikethrough:false,underline:false,code:false,color:'default'}}],color:'default'}};
  if(Array.isArray(next.document))next.document.push(b);else if(next.document.object==='list')next.document.results.push(b);else fail('Single-block document: import an array/list to append peers.');validateDocument(next.document);return next;
}
export function semanticDiff(before,after) {
  const result=[];function walk(a,b,path){if(JSON.stringify(a)===JSON.stringify(b))return;if(obj(a)&&obj(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)])){if(!own(a,key))result.push({path:pointer([...path,key]),change:'added',after:b[key]});else if(!own(b,key))result.push({path:pointer([...path,key]),change:'removed',before:a[key]});else walk(a[key],b[key],[...path,key]);}}else if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){for(let i=0;i<a.length;i++)walk(a[i],b[i],[...path,i]);}else result.push({path:pointer(path),change:'changed',before:a,after:b});}walk(before,after,[]);return result;
}
export function escapeHTML(s) {return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const mdEscape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_{}\[\]()#+\-.!|$~]/g,'\\$&').replaceAll('\r','&#13;').replaceAll('\n','  \n');
export function safeURL(value) {if(typeof value!=='string'||/[\x00-\x20\x7f]/.test(value))return null;try{const u=new URL(value);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:null;}catch{return null;}}

/** Every leaf not explicitly represented is listed. Paths are JSON pointers into imported document. */
export function projectExport(document,format) {
  if(!['markdown','html'].includes(format))fail('Unknown projection format.');
  const html=format==='html',losses=[],represented=new Set(),messages=[],entries=blockEntries(document);
  const mark=p=>represented.add(pointer(p));const issue=(p,reason,severity='loss')=>losses.push({path:pointer(p),severity,reason});
  function leaves(v,p){if(Array.isArray(v)){if(!v.length)issue(p,'Empty array has no recoverable representation.','structure');for(let i=0;i<v.length;i++)leaves(v[i],[...p,i]);}else if(obj(v)){if(!Object.keys(v).length)issue(p,'Empty object has no recoverable representation.','structure');for(const [k,val]of Object.entries(v))leaves(val,[...p,k]);}else if(!represented.has(pointer(p)))issue(p,'Field is retained in native JSON but omitted from this projection.');}
  function rich(run,p) {
    const editable=editableRun(run);let value;
    if(!editable.ok){issue(p,'Opaque rich-text object becomes a visible placeholder; its payload is not exported.');return html?'<span class="opaque">[opaque rich text]</span>':'[opaque rich text]';}
    const kind=editable.kind,key=kind==='text'?'content':'expression';mark([...p,'type']);mark([...p,kind,key]);
    if(own(run,'plain_text')){if(run.plain_text===editable.value)mark([...p,'plain_text']);else issue([...p,'plain_text'],'Cached plain_text contradicts content/expression and is not trusted.');}
    if(kind==='equation'){issue([...p,'equation','expression'],'LaTeX source is emitted without math rendering or semantic validation.','transform');value=html?`<code class="math">${escapeHTML(editable.value)}</code>`:`[LaTeX source: ${mdEscape(editable.value)}]`;}
    else value=html?escapeHTML(editable.value).replaceAll('\n','<br>'):mdEscape(editable.value);
    if(editable.value.includes('\n')||editable.value.includes('\r'))issue([...p,kind,key],'Text line breaks use projection syntax; original rich-text run boundaries require native JSON.','transform');
    const ann=obj(run.annotations)?run.annotations:{};
    for(const flag of FLAGS){if(own(ann,flag)){if(typeof ann[flag]!=='boolean'){issue([...p,'annotations',flag],'Malformed annotation is not interpreted.');continue;}mark([...p,'annotations',flag]);if(ann[flag]){if(html){const tag={bold:'strong',italic:'em',strikethrough:'s',underline:'u',code:'code'}[flag];value=`<${tag}>${value}</${tag}>`;}else if(flag==='underline'||flag==='strikethrough'||flag==='code'){issue([...p,'annotations',flag],`${flag} is omitted by this conservative CommonMark projection.`);}else value=(flag==='bold'?'**':'*')+value+(flag==='bold'?'**':'*');}else issue([...p,'annotations',flag],'Explicit false annotation is implicit in the projection; field presence is not retained.','structure');}}
    if(own(ann,'color')){mark([...p,'annotations','color']);issue([...p,'annotations','color'],ann.color==='default'?'Explicit default color is implicit; field presence is not retained.':'Notion text/background color is omitted by this portable projection.',ann.color==='default'?'structure':'loss');}
    const link=obj(run.text?.link)?run.text.link.url:null;
    if(run.type==='text'&&own(run.text,'link')) {
      if(run.text.link===null){mark([...p,'text','link']);issue([...p,'text','link'],'Explicit null link is omitted; field presence is not retained.','structure');}
      else if(safeURL(link)){mark([...p,'text','link','url']);if(safeURL(link)!==link)issue([...p,'text','link','url'],'URL is normalized by the browser URL parser.','transform');value=html?`<a href="${escapeHTML(safeURL(link))}" rel="noopener noreferrer">${value}</a>`:`[${value}](<${safeURL(link).replaceAll('<','%3C').replaceAll('>','%3E')}>)`;}
      else issue([...p,'text','link'],'Unsafe or unsupported URL is retained only in native JSON; never activated.');
    }
    if(own(run,'href')){mark([...p,'href']);issue([...p,'href'],'Cached href field is omitted; text.link is authoritative for this projection.','structure');}
    return value;
  }
  function render({b,path},depth=0) {
    if(!TYPES.includes(b.type)){issue(path,`Opaque ${b.type} block is a placeholder; all original fields remain in native JSON.`);return html?`<aside class="opaque">[Opaque ${escapeHTML(b.type)} block — see native JSON]</aside>`:`[Opaque ${mdEscape(b.type)} block — see native JSON]`;}
    mark([...path,'type']);const body=b[b.type],bodyPath=[...path,b.type];let text;
    if(b.type==='equation') {
      if(typeof body.expression!=='string'){issue(bodyPath,'Malformed equation body; not rendered.');text='[Malformed equation]';}
      else {mark([...bodyPath,'expression']);issue([...bodyPath,'expression'],'Equation is exported as escaped LaTeX source, without rendering/validation.','transform');text=html?`<pre class="math">${escapeHTML(body.expression)}</pre>`:`[LaTeX source]\n\n${body.expression.split(/\r?\n/).map(line=>'    '+line).join('\n')}`;}
    }else{
      if(!Array.isArray(body.rich_text)||body.rich_text.length>LIMITS.runs){issue([...bodyPath,'rich_text'],'Missing, malformed or oversized rich text is an opaque placeholder.');text='[Opaque rich text]';}
      else{text=body.rich_text.map((run,i)=>rich(run,[...bodyPath,'rich_text',i])).join('');issue([...bodyPath,'rich_text'],'Rich-text object/run segmentation is not recoverable from this projection.','structure');}
      if(html){const tag={paragraph:'p',heading_1:'h1',heading_2:'h2',heading_3:'h3',quote:'blockquote',bulleted_list_item:'li',numbered_list_item:'li'}[b.type];text=`<${tag}>${text}</${tag}>`;if(b.type.endsWith('list_item'))text=`<${b.type==='numbered_list_item'?'ol':'ul'}>${text}</${b.type==='numbered_list_item'?'ol':'ul'}>`;}
      else{const prefix={paragraph:'',heading_1:'# ',heading_2:'## ',heading_3:'### ',quote:'> ',bulleted_list_item:'- ',numbered_list_item:'1. '}[b.type];text=prefix+text;}
    }
    if(own(body,'color')){mark([...bodyPath,'color']);issue([...bodyPath,'color'],'Explicit block color field is omitted.');}
    const children=childEntries(b,path);
    if(b.has_children===true&&!children.length)issue([...path,'has_children'],'Child content was not included. Retrieve children recursively/paginate before claiming a complete document.','incomplete');
    if(children.length){issue(path,'Nested child content is emitted after its parent; native parent-child identity/layout is not preserved.','structure');text+='\n\n'+children.map(e=>render(e,depth+1)).join('\n\n');}
    return text;
  }
  let content=rootEntries(document).map(e=>render(e)).join('\n\n');
  leaves(document,[]);
  if(obj(document)&&document.has_more===true){issue(['has_more'],'Input is a partial paginated response; additional blocks are missing.','incomplete');messages.push('Partial response: has_more=true. This app does not fetch missing pages.');}
  if(html)content=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Research block projection</title><style>body{max-width:850px;margin:3rem auto;padding:1rem;font:18px/1.7 system-ui;color:#e4eaf4;background:#111822}a{color:#9dccfa}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}.opaque{border:1px dashed #ab8753;padding:1rem}blockquote{border-left:3px solid #8dc4c0;padding-left:1rem}li{margin:.3rem 0}</style></head><body>\n${content}\n</body></html>\n`;
  const unique=[...new Map(losses.map(x=>[`${x.path}|${x.severity}|${x.reason}`,x])).values()];
  return {content,report:{format,contract:'Portable projection produced by this app; not Notion-flavored Markdown, a Notion write payload, or a reversible export.',blockCount:entries.length,losses:unique,messages,nativeRecommendation:'Save the native .fidelity.json project to retain all imported JSON values and baseline edits.'}};
}
