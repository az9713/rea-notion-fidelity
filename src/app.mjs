import {TYPES,COLORS,LIMITS,importDocument,nativeJSON,blockJSON,blockEntries,editableRun,editRun,editEquation,appendBlock,semanticDiff,projectExport,pointer,clone} from './core.mjs';
import {fixture} from './fixture.mjs';
const $=s=>document.querySelector(s);let project=importDocument(JSON.stringify(fixture)),selected=0,history=[],saved=nativeJSON(project),projection='html';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const notify=(text,error=false)=>{$('#notice').textContent=text;$('#notice').className=error?'notice error':'notice';};
const button=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=fn;return n;};
function commit(next,message='Edit applied. Native JSON retains unknown fields.') {history.push(clone(project));if(history.length>20)history.shift();project=next;notify(message);render();}
function action(fn) {try{fn();}catch(error){notify(error.message,true);}}
function download(name,text,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function load(text) {const next=importDocument(text);if(nativeJSON(project)!==saved&&!confirm('Replace the current document and discard unsaved in-memory edits? Save a native project first to preserve them.'))return;history=[];project=next;selected=0;saved=nativeJSON(next);$('#json-input').value='';notify('Imported locally. No credentials, upload or Notion connection.');render();}
function renderOutline(entries) {
  const list=$('#outline');list.replaceChildren();entries.forEach((entry,i)=>{const b=entry.block;const summary=b.type==='equation'?b.equation.expression:(Array.isArray(b[b.type].rich_text)?b[b.type].rich_text.map(r=>editableRun(r).value??`[${r?.type??'opaque'}]`).join(''):JSON.stringify(b[b.type]));
    const item=button('',()=>{selected=i;render();},`outline-item ${i===selected?'selected':''}`);item.setAttribute('aria-pressed',String(i===selected));item.style.paddingLeft=`${14+Math.min(entry.depth,8)*13}px`;item.append(el('span',b.type,'block-type'),el('span',summary?.slice(0,80)??'Opaque block','block-snippet'));if(!entry.supported)item.append(el('span','OPAQUE','small-badge'));list.append(item);});
}
function renderEditor(entry) {
  const root=$('#editor');root.replaceChildren();if(!entry){root.append(el('p','No blocks yet. Add a block to begin.'));return;}
  const {block:b,path,supported}=entry;root.append(el('div',`${b.type} · ${pointer(path)||'(root)'}`,'eyebrow'),el('h2',supported?'Edit the known fields.':'Opaque means untouched.'));
  if(!supported){root.append(el('p','This block is preserved as an opaque JSON object. Its fields and nested content are not interpreted, rendered or editable. Native project/API-shaped JSON export retains it.','muted'));const pre=el('pre',JSON.stringify(b,null,2));root.append(pre);return;}
  const body=b[b.type];
  if(b.type==='equation') {
    if(typeof body.expression!=='string'){root.append(el('p','Malformed equation body: retained but not editable.','warning'));return;}
    const label=el('label','LaTeX source (not rendered/validated)');const input=el('textarea');input.value=body.expression;input.maxLength=1000;input.id='equation-input';label.append(input);root.append(label,button('Apply equation',()=>action(()=>commit(editEquation(project,path,input.value)))));return;
  }
  if(!Array.isArray(body.rich_text)||body.rich_text.length>LIMITS.runs){root.append(el('p','Malformed or oversized rich_text is retained opaque. Edit through a valid source export.','warning'));return;}
  if(!body.rich_text.length)root.append(el('p','This block has an empty rich_text array. Its empty state is preserved; add a separate block to write text.','muted'));
  body.rich_text.forEach((run,index)=>{
    const card=el('div',undefined,'run-card');const info=editableRun(run);card.append(el('div',`RUN ${index+1} · ${info.kind??run?.type??'unknown'}`,'eyebrow'));
    if(!info.ok){card.append(el('p',info.reason,'warning'),el('pre',JSON.stringify(run,null,2)));root.append(card);return;}
    const label=el('label',info.kind==='equation'?'Inline LaTeX source':'Text content');const input=el('textarea');input.value=info.value;input.maxLength=info.kind==='text'?2000:1000;input.dataset.run=String(index);input.setAttribute('aria-label',`Run ${index+1} content`);label.append(input);card.append(label);
    const controls=el('div',undefined,'annotations');const changes={};const annotations=run.annotations;
    if(annotations===undefined||(annotations!==null&&typeof annotations==='object'&&!Array.isArray(annotations))){
      for(const [flag,name]of [['bold','Bold'],['italic','Italic'],['underline','Underline'],['strikethrough','Strike'],['code','Code']]){const check=el('input');check.type='checkbox';check.checked=annotations?.[flag]===true;check.onchange=()=>{changes[flag]=check.checked;};const wrapper=el('label',name);wrapper.prepend(check);controls.append(wrapper);}
      const color=el('select');color.setAttribute('aria-label',`Run ${index+1} color`);for(const value of COLORS){const option=el('option',value);option.value=value;color.append(option);}if(COLORS.includes(annotations?.color))color.value=annotations.color;color.onchange=()=>{changes.color=color.value;};controls.append(color);
    }else card.append(el('p','Malformed annotations are preserved; formatting controls disabled.','warning'));
    card.append(controls,button('Apply run',()=>action(()=>commit(editRun(project,path,index,input.value,Object.keys(changes).length?changes:null))),'primary'));
    if(run.text?.link!==undefined)card.append(el('p',`Link metadata retained: ${JSON.stringify(run.text.link)}`,'muted tiny'));
    const details=el('details');details.append(el('summary','All original run fields'),el('pre',JSON.stringify(run,null,2)));card.append(details);root.append(card);
  });
  const details=el('details');details.append(el('summary','Complete block JSON (read only)'),el('pre',JSON.stringify(b,null,2)));root.append(details);
}
function renderReports() {
  const format=$('#export-format').value;const result=projectExport(project.document,format);const report=$('#loss-report');report.replaceChildren();
  $('#loss-count').textContent=String(result.report.losses.length);$('#projection-name').textContent=format==='html'?'HTML projection':'CommonMark projection';
  const critical=result.report.losses.filter(l=>l.severity==='incomplete');$('#coverage').textContent=critical.length?'Incomplete source content':'Imported content only';$('#coverage').className=critical.length?'warning':'muted';
  for(const loss of result.report.losses.slice(0,160)){const row=el('li');row.append(el('code',loss.path||'(root)'),el('span',loss.reason),el('small',loss.severity));report.append(row);}if(result.report.losses.length>160)report.append(el('li',`Showing first 160 of ${result.report.losses.length}. Download the full report for every field.`));
  const changes=semanticDiff(project.baseline,project.document);$('#diff-count').textContent=String(changes.length);const diff=$('#diff');diff.replaceChildren();if(!changes.length)diff.append(el('p','No semantic changes since import.','muted'));else for(const change of changes.slice(0,100)){const row=el('div',undefined,'diff-row');row.append(el('code',change.path||'(root)'),el('pre',JSON.stringify(change,null,2)));diff.append(row);}
  if(projection==='html'){$('#preview-frame').hidden=false;$('#markdown-preview').hidden=true;$('#preview-frame').srcdoc=projectExport(project.document,'html').content;}else{$('#preview-frame').hidden=true;$('#markdown-preview').hidden=false;$('#markdown-preview').textContent=projectExport(project.document,'markdown').content;}
  $('#undo').disabled=!history.length;$('#dirty').textContent=nativeJSON(project)===saved?'Native project is saved/imported':'Unsaved in-memory edits';
}
function render() {const entries=blockEntries(project.document);selected=Math.min(selected,Math.max(0,entries.length-1));$('#block-count').textContent=String(entries.length);$('#opaque-count').textContent=String(entries.filter(e=>!e.supported).length);renderOutline(entries);renderEditor(entries[selected]);renderReports();}
$('#import-json').onclick=()=>action(()=>load($('#json-input').value));
$('#open-file').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>LIMITS.bytes)throw Error('File exceeds 5 MiB.');load(await file.text());}catch(error){notify(error.message,true);}finally{event.target.value='';}};
$('#load-demo').onclick=()=>load(JSON.stringify(fixture));
$('#undo').onclick=()=>{if(history.length){project=history.pop();notify('Previous in-memory state restored.');render();}};
$('#save-project').onclick=()=>action(()=>{const text=nativeJSON(project);download('research-notes.fidelity.json',text);saved=text;notify('Native project downloaded with original baseline and all current JSON fields.');renderReports();});
$('#export-json').onclick=()=>download('research-blocks.json',blockJSON(project));
$('#download-report').onclick=()=>download('projection-loss-report.json',JSON.stringify(projectExport(project.document,$('#export-format').value).report,null,2));
$('#export-portable').onclick=()=>action(()=>{const format=$('#export-format').value,result=projectExport(project.document,format);if(!$('#accept-loss').checked)throw Error('Review the report and acknowledge projection losses before downloading.');download(format==='html'?'research-projection.html':'research-projection.md',result.content,format==='html'?'text/html':'text/markdown');notify(`Downloaded ${format}; save the separate loss report and native project to retain provenance.`);});
$('#export-format').onchange=()=>{$('#accept-loss').checked=false;renderReports();};
$('#preview-mode').onchange=()=>{projection=$('#preview-mode').value;renderReports();};
$('#add-block').onclick=()=>action(()=>commit(appendBlock(project,$('#add-type').value),'New block appended. Undo is available.'));
for(const type of TYPES){const option=el('option',type);option.value=type;$('#add-type').append(option);}
window.addEventListener('beforeunload',event=>{if(nativeJSON(project)!==saved){event.preventDefault();event.returnValue='';}});
render();
