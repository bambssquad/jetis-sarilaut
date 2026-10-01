import {zoomAt,fitView} from './viewport-math.mjs';
import {createSourceViewer} from './source/viewer.mjs';
const $=id=>document.getElementById(id),stage=$('drawing-stage'),paper=$('sheet-transform');
const state={manifest:null,sheet:null,view:{x:0,y:0,scale:1},baseScale:1,ready:false,error:null};
window.JETIS_DRAWINGS=state;
let request=0;
const pointers=new Map();let gesture=null;
function render(){const v=state.view;paper.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.scale})`;$('zoom-label').value=Math.round(v.scale/state.baseScale*100)+'%';}
function fit(){if(!state.sheet)return;const [, ,w,h]=state.sheet.viewBox;const r=stage.getBoundingClientRect();if(r.width<=0||r.height<=0)return;state.view=fitView(r.width,r.height,w,h,innerWidth<650?15:30);state.baseScale=state.view.scale;render();}
function zoom(factor,cx,cy){const r=stage.getBoundingClientRect();state.view=zoomAt(state.view,factor,cx??r.width/2,cy??r.height/2);render();}
function writeList(target,items){target.replaceChildren();for(const item of items||[]){const li=document.createElement('li');li.textContent=item;target.append(li);}}
async function choose(id){
  const seq=++request,sheet=state.manifest.sheets.find(s=>s.id===id);if(!sheet)return;
  $('loading-text').hidden=false;$('loading-text').textContent='Menyiapkan lembar gambar…';
  try{
    const response=await fetch('drawings/'+sheet.file);if(!response.ok)throw new Error('Lembar gambar tidak dapat dimuat');
    const text=await response.text();if(seq!==request)return;
    const parsed=new DOMParser().parseFromString(text,'image/svg+xml');if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error('Lembar SVG tidak valid');
    const svg=parsed.documentElement;svg.removeAttribute('width');svg.removeAttribute('height');
    const viewBox=sheet.viewBox||svg.getAttribute('viewBox').split(/\s+/).map(Number);if(viewBox.length!==4||!viewBox.every(Number.isFinite))throw new Error('Ukuran lembar tidak valid');
    state.sheet={...sheet,viewBox};paper.replaceChildren(document.importNode(svg,true));paper.style.width=viewBox[2]+'px';paper.style.height=viewBox[3]+'px';
    $('sheet-title').textContent=sheet.title;$('sheet-id').textContent=sheet.id.toUpperCase()+' / LOD 100';$('sheet-select').value=id;
    document.querySelectorAll('#sheet-list .sheet-item').forEach(b=>{const active=b.dataset.sheet===id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
    $('sheet-download').href='drawings/'+sheet.file;$('sheet-download').download=sheet.file;$('notes-sheet-name').textContent=sheet.title;
    writeList($('sheet-facts'),sheet.facts);writeList($('sheet-assumptions'),sheet.assumptions||state.manifest.assumptions);
    $('caption-text').textContent=sheet.description||'Studi konseptual. Bukan dokumen konstruksi.';
    $('loading-text').hidden=true;state.ready=true;state.error=null;fit();
    if(state.activeTab==='drawings')history.replaceState(null,'','#'+id);
  }catch(error){if(seq!==request)return;state.error=error.message;state.ready=false;$('loading-text').textContent=error.message;}
}
async function init(){
  try{const response=await fetch('drawings/manifest.json');if(!response.ok)throw new Error('Daftar gambar tidak dapat dimuat');state.manifest=await response.json();
    for(const [i,s] of state.manifest.sheets.entries()){
      const option=document.createElement('option');option.value=s.id;option.textContent=s.id+' · '+s.title;$('sheet-select').append(option);
      const b=document.createElement('button');b.className='sheet-item';b.dataset.sheet=s.id;const number=document.createElement('span');number.className='sheet-number';number.textContent=String(i+1).padStart(2,'0');const text=document.createElement('span');text.textContent=s.title;const small=document.createElement('small');small.textContent=s.id.toUpperCase();text.append(small);b.append(number,text);b.addEventListener('click',()=>choose(s.id));$('sheet-list').append(b);
    }
    const selected=location.hash.slice(1);await choose(state.manifest.sheets.some(s=>s.id===selected)?selected:state.manifest.sheets[0].id);
  }catch(error){state.error=error.message;$('loading-text').textContent=error.message;}
}
$('sheet-select').addEventListener('change',e=>choose(e.target.value));
$('zoom-in').addEventListener('click',()=>zoom(1.25));$('zoom-out').addEventListener('click',()=>zoom(.8));$('fit').addEventListener('click',fit);
stage.addEventListener('wheel',e=>{e.preventDefault();const r=stage.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
stage.addEventListener('dblclick',e=>{const r=stage.getBoundingClientRect();zoom(1.5,e.clientX-r.left,e.clientY-r.top);});
function resetGesture(){const points=[...pointers.values()];gesture=points.length===1?{points,view:{...state.view}}:points.length>1?{points,view:{...state.view},distance:Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)}:null;}
stage.addEventListener('pointerdown',e=>{stage.setPointerCapture(e.pointerId);const r=stage.getBoundingClientRect();pointers.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});stage.classList.add('dragging');resetGesture();});
stage.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const r=stage.getBoundingClientRect();pointers.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});const ps=[...pointers.values()];if(ps.length===1){state.view={...gesture.view,x:gesture.view.x+ps[0].x-gesture.points[0].x,y:gesture.view.y+ps[0].y-gesture.points[0].y};}else{const start={x:(gesture.points[0].x+gesture.points[1].x)/2,y:(gesture.points[0].y+gesture.points[1].y)/2};const center={x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2};const distance=Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y);const v=zoomAt(gesture.view,distance/(gesture.distance||1),start.x,start.y);state.view={...v,x:v.x+center.x-start.x,y:v.y+center.y-start.y};}render();});
function release(e){pointers.delete(e.pointerId);if(!pointers.size)stage.classList.remove('dragging');resetGesture();}
stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
stage.addEventListener('keydown',e=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='0')fit();else if(e.key.startsWith('Arrow')){const dx=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0,dy=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;state.view={...state.view,x:state.view.x+dx,y:state.view.y+dy};render();}});
$('drawing-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{} });
document.addEventListener('fullscreenchange',()=>requestAnimationFrame(fit));
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(fit,100);}).observe(stage);
const sourceViewer=createSourceViewer();
function tab(view){
  state.activeTab=view;
  const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);
  for(const id of ['model','drawings','source']){const active=id===view;$(id+'-view').hidden=!active;$(id+'-tab').classList.toggle('active',active);$(id+'-tab').setAttribute('aria-pressed',String(active));}
  sourceViewer.deactivate();
  $('view-status').replaceChildren();const dot=document.createElement('i');$('view-status').append(dot,view==='source'?' Ekstraksi · DWG R02':' LOD 100 · DWG R02');
  if(view==='model'&&!$('model-frame').src)$('model-frame').src=$('model-frame').dataset.src;
  if(view==='drawings')requestAnimationFrame(fit);
  if(view==='source')sourceViewer.activate();
}
$('model-tab').onclick=()=>tab('model');$('drawings-tab').onclick=()=>tab('drawings');$('source-tab').onclick=()=>tab('source');
$('notes-toggle').onclick=()=>{$('source-notes').showModal();$('notes-toggle').setAttribute('aria-expanded','true');};$('close-notes').onclick=()=>$('source-notes').close();$('source-notes').addEventListener('close',()=>$('notes-toggle').setAttribute('aria-expanded','false'));
window.JETIS_DRAWINGS.fit=fit;window.JETIS_DRAWINGS.choose=choose;const requestedView=new URLSearchParams(location.search).get('view');
const initialView=['source','drawings'].includes(requestedView)?requestedView:(location.hash.startsWith('#dwg-')?'source':'model');
init();tab(initialView);
