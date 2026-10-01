import {fitBounds,zoomView,screenToWorld,intersects} from './geometry.mjs';
const $=id=>document.getElementById(id);
const number=n=>n.toLocaleString('id-ID');
const layerColor=()=> '#3c4646'; // Source ACI/lineweight/linetype were not extracted.
export function createSourceViewer(){
 const stage=$('source-stage'),canvas=$('source-canvas'),ctx=canvas.getContext('2d',{alpha:false}),pointers=new Map();
 const state={ready:false,error:null,manifest:null,scene:null,region:null,view:{x:0,y:0,scale:1},baseScale:1,renderedGroups:0,renderedTexts:0,active:false};
 window.JETIS_SOURCE=state;
 let loading=null,frame=0,gesture=null,width=0,height=0,dpr=1;
 function requestDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
 function setMatrix(m){const {x,y,scale:s}=state.view;ctx.setTransform(dpr*s*m[0],-dpr*s*m[1],dpr*s*m[2],-dpr*s*m[3],dpr*(x+s*m[4]),dpr*(y-s*m[5]));}
 function visibleBounds(){const a=screenToWorld(state.view,0,height),b=screenToWorld(state.view,width,0);return [a[0],a[1],b[0],b[1]];}
 function draw(){
  if(!width||!height||!state.scene)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#fbfcfb';ctx.fillRect(0,0,width,height);
  const visible=visibleBounds(),layer=$('source-layer').value,s=state.view.scale;
  const gridStep=10**Math.floor(Math.log10(65/s)),step=gridStep*(gridStep*s<30?5:1);
  ctx.strokeStyle='#e8edeb';ctx.lineWidth=.7;ctx.beginPath();
  for(let x=Math.ceil(visible[0]/step)*step;x<visible[2];x+=step){const px=state.view.x+x*s;ctx.moveTo(px,0);ctx.lineTo(px,height);}
  for(let y=Math.ceil(visible[1]/step)*step;y<visible[3];y+=step){const py=state.view.y-y*s;ctx.moveTo(0,py);ctx.lineTo(width,py);}ctx.stroke();
  state.renderedGroups=0;state.renderedTexts=0;
  for(const g of state.scene.groups){
   if((layer&&g.layer!==layer)||!intersects(g.bounds,visible))continue;
   g.cachedPath ||= new Path2D(g.path);setMatrix(g.matrix);ctx.strokeStyle=layerColor(g.layer);
   const localScale=Math.max(Math.hypot(g.matrix[0],g.matrix[1]),Math.hypot(g.matrix[2],g.matrix[3]));
   ctx.lineWidth=.8/(s*localScale||1);ctx.lineCap='butt';ctx.lineJoin='round';ctx.stroke(g.cachedPath);state.renderedGroups++;
  }
  if($('source-text-toggle').checked||$('source-dim-toggle').checked){
   for(const t of state.scene.texts){
    if((layer&&t.layer!==layer)||!intersects(t.bounds,visible)||!(t.kind==='dimension'?$('source-dim-toggle').checked:$('source-text-toggle').checked))continue;
    const largest=Math.max(0,...t.layout.lines.flatMap(l=>l.runs.map(r=>r.height))),localScale=Math.hypot(t.matrix[0],t.matrix[1]);
    if(largest*s*localScale<1.5)continue; // Subpixel labels do not change position or size.
    setMatrix(t.matrix);ctx.translate(t.position[0],t.position[1]);ctx.scale(1,-1);ctx.fillStyle=t.kind==='dimension'?'#94713a':'#273b36';ctx.textBaseline='top';let y=0;
    for(const line of t.layout.lines){let x=0,lineHeight=Math.max(t.height*.5,...line.runs.map(r=>r.height));
     for(const r of line.runs){ctx.save();ctx.translate(x,y);ctx.scale(r.width,1);ctx.font=`${r.italic?'italic ':''}${r.bold?'bold ':''}${r.height}px "${r.font.replace(/["\\]/g,'')}",Arial,sans-serif`;ctx.fillText(r.text,0,0);const w=ctx.measureText(r.text).width;
      if(r.underline){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.max(r.height*.045,.5/(s*localScale));ctx.beginPath();ctx.moveTo(0,r.height);ctx.lineTo(w,r.height);ctx.stroke();}
      ctx.restore();x+=w*r.width;
     }y+=lineHeight*1.25;
    }state.renderedTexts++;
   }
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);const barStep=10**Math.floor(Math.log10(85/s)),bar=barStep*s;
  ctx.strokeStyle='#6b7e75';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(18,height-39);ctx.lineTo(18+bar,height-39);ctx.moveTo(18,height-43);ctx.lineTo(18,height-35);ctx.moveTo(18+bar,height-43);ctx.lineTo(18+bar,height-35);ctx.stroke();ctx.font='9px Arial';ctx.fillStyle='#6b7e75';ctx.fillText(`${number(barStep)} unit koordinat asli`,18,height-48);
  $('source-zoom-label').value=Math.round(s/state.baseScale*100)+'%';
 }
 function resize(){const r=stage.getBoundingClientRect();if(r.width<=0||r.height<=0)return;width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';requestDraw();}
 function fit(){if(!state.region)return;resize();if(!width||!height)return;state.view=fitBounds(state.region.bounds,width,height,innerWidth<650?16:28);state.baseScale=state.view.scale;requestDraw();}
 function zoom(factor,x=width/2,y=height/2){state.view=zoomView(state.view,factor,x,y,state.baseScale*.05,state.baseScale*1000);requestDraw();}
 function choose(id,saveHash=true){
  const r=state.manifest?.regions.find(r=>r.id===id);if(!r)return;state.region=r;$('source-region').value=id;$('source-title').textContent=r.label;
  document.querySelectorAll('[data-source-region]').forEach(b=>{const active=b.dataset.sourceRegion===id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  fit();if(saveHash)history.replaceState(null,'','#dwg-'+id);
 }
 async function load(){
  if(state.ready)return;if(loading)return loading;
  loading=(async()=>{
   $('source-loading').hidden=false;$('source-loading').textContent='Memuat garis & teks sumber asli…';
   try{
    const [a,b]=await Promise.all([fetch(new URL('./manifest.json',import.meta.url)),fetch(new URL('./scene.json',import.meta.url))]);if(!a.ok||!b.ok)throw new Error('Pratinjau sumber tidak dapat dimuat');
    const [manifest,scene]=await Promise.all([a.json(),b.json()]);state.manifest=manifest;state.scene=scene;
    if(scene.sourceSha256!==manifest.source.sha256)throw new Error('Identitas sumber tidak cocok');
    $('source-region').replaceChildren();$('source-region-list').replaceChildren();
    for(const [i,r] of manifest.regions.entries()){
     const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.label;$('source-region').append(opt);
     const button=document.createElement('button');button.className='sheet-item';button.dataset.sourceRegion=r.id;
     const n=document.createElement('span');n.className='sheet-number';n.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span');label.textContent=r.label;
     const small=document.createElement('small');small.textContent=r.sourceHandles.length?'SUMBER '+r.sourceHandles.join(' / '):'KOORDINAT MODEL-SPACE';label.append(small);button.append(n,label);button.onclick=()=>choose(r.id);$('source-region-list').append(button);
    }
    const layers=[...new Set([...scene.groups,...scene.texts].map(g=>g.layer))].sort((a,b)=>a.localeCompare(b));
    for(const layer of layers){const option=document.createElement('option');option.value=layer;option.textContent=layer;$('source-layer').append(option);}
    const c=scene.coverage;$('source-counts').textContent=`${number(c.modelRecords)} rekaman model-space · ${number(c.blockDefinitions)} definisi blok · ${number(c.modelLinework)} entitas garis sumber + ${number(c.blockLinework)} hasil perluasan blok · ${number(c.modelMText)} MTEXT sumber · ${number(c.partialDimensions)} dimensi parsial · ${number(c.warnings)} peringatan ekstraktor. ${number(c.expandedInserts)} insert termasuk insert bersarang diperluas. Blok hilang: ${c.missingBlocks.length}; siklus: ${c.cyclicBlocks.length}. Tidak tampil: ${Object.entries(c.omitted).map(([k,v])=>`${k} ${number(v)}`).join(', ')}.`;
    $('source-limitations').replaceChildren();for(const item of manifest.limitations){const li=document.createElement('li');li.textContent=item;$('source-limitations').append(li);}
    $('source-unit-warning').textContent=manifest.unitEvidence.note;
    state.ready=true;state.error=null;$('source-loading').hidden=true;
    const hash=location.hash.slice(1),id=hash.startsWith('dwg-')?hash.slice(4):manifest.defaultRegion;choose(manifest.regions.some(r=>r.id===id)?id:manifest.defaultRegion,false);
   }catch(error){state.ready=false;state.error=error.message;$('source-loading').textContent=error.message+' · coba buka tab lagi';loading=null;throw error;}
  })();return loading;
 }
 async function activate(){state.active=true;try{await load();requestAnimationFrame(fit);}catch{} }
 function deactivate(){state.active=false;pointers.clear();gesture=null;}
 $('source-region').onchange=e=>choose(e.target.value);$('source-fit').onclick=fit;$('source-zoom-in').onclick=()=>zoom(1.25);$('source-zoom-out').onclick=()=>zoom(.8);
 for(const id of ['source-layer','source-text-toggle','source-dim-toggle'])$(id).onchange=requestDraw;
 function coords(e){const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 stage.addEventListener('wheel',e=>{if(!state.ready)return;e.preventDefault();const p=coords(e);zoom(Math.exp(-e.deltaY*.0015),p.x,p.y);},{passive:false});
 stage.addEventListener('dblclick',e=>{const p=coords(e);zoom(1.5,p.x,p.y);});
 function reset(){const ps=[...pointers.values()];gesture=ps.length?{points:ps,view:{...state.view},distance:ps.length>1?Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y):0}:null;}
 stage.addEventListener('pointerdown',e=>{if(!state.ready)return;stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,coords(e));stage.classList.add('dragging');reset();});
 stage.addEventListener('pointermove',e=>{
  const p=coords(e),w=screenToWorld(state.view,p.x,p.y);$('source-coordinate').value=`X ${w[0].toFixed(3)} · Y ${w[1].toFixed(3)}`;
  if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,p);const ps=[...pointers.values()];
  if(ps.length===1)state.view={...gesture.view,x:gesture.view.x+p.x-gesture.points[0].x,y:gesture.view.y+p.y-gesture.points[0].y};
  else{const start={x:(gesture.points[0].x+gesture.points[1].x)/2,y:(gesture.points[0].y+gesture.points[1].y)/2},center={x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2},distance=Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y);const v=zoomView(gesture.view,distance/(gesture.distance||1),start.x,start.y,state.baseScale*.05,state.baseScale*1000);state.view={...v,x:v.x+center.x-start.x,y:v.y+center.y-start.y};}requestDraw();
 });
 function release(e){pointers.delete(e.pointerId);if(!pointers.size)stage.classList.remove('dragging');reset();}
 for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,release);
 stage.addEventListener('keydown',e=>{if(!state.ready)return;if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='0')fit();else if(e.key.startsWith('Arrow')){const dx=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0,dy=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;state.view={...state.view,x:state.view.x+dx,y:state.view.y+dy};requestDraw();}});
 $('source-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{}};
 document.addEventListener('fullscreenchange',()=>{if(state.active)requestAnimationFrame(fit);});
 let resizeTimer;new ResizeObserver(()=>{if(!state.active)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{resize();if(state.ready)fit();},100);}).observe(stage);
 $('source-coverage').onclick=()=>{$('source-coverage-dialog').showModal();$('source-coverage').setAttribute('aria-expanded','true');};$('source-close-coverage').onclick=()=>$('source-coverage-dialog').close();$('source-coverage-dialog').addEventListener('close',()=>$('source-coverage').setAttribute('aria-expanded','false'));
 Object.assign(state,{fit,choose,zoom,activate,deactivate});return state;
}
