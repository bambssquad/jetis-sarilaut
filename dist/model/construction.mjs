export const STAGES=[
 {title:'Tapak & pondasi',detail:'Penyiapan tapak dan fondasi konseptual. Bentuk fondasi belum menjadi desain struktur.'},
 {title:'Struktur utama',detail:'Kolom, rangka utama dan struktur kanopi mengikuti massa serta bentang Jetis.'},
 {title:'Lantai & akses',detail:'Lantai dua +4,50 m, tangga, void, jembatan timbang dan akses loading.'},
 {title:'Atap & selubung',detail:'Atap 15°, gording, talang dan dinding. Bentuk atap tahap 2 mempertahankan taper sumber.'},
 {title:'Penyelesaian',detail:'Bukaan, ruang pencatatan, interior konseptual dan kawasan. Kembalikan slider untuk mengurai pembangunan.'}
];
export const clamp=n=>Math.max(0,Math.min(1,n));
export function stageIndex(percent){return Math.max(0,Math.min(4,Math.ceil(percent/20)-1));}
export function revealProgress(percent,stage){return stage<0?1:clamp(percent/20-stage);}
export function groupStage(name){
 if(['Tapak | tanah','Tapak | jalan','Tapak | sirkulasi'].includes(name))return -1;
 if(name.startsWith('Fondasi |')||name==='Lantai | sumber')return 0;
 if(name.startsWith('Struktur |'))return /Mezzanine|Tangga/.test(name)?2:1;
 if(name.startsWith('Akses |')||/Lantai dua|Tangga sumber|Lantai utama|Modul12m/.test(name)||name==='Tapak | Timbangan')return 2;
 if(name.startsWith('Atap |')||name.startsWith('Selubung |'))return 3;
 return 4;
}
export function createConstruction({THREE:T,scene,state,groups,motionRoots,config,reduced,experience}){
 const $=id=>document.getElementById(id),slider=$('construction-slider'),play=$('construction-play');
 if(!slider||!play)throw new Error('Kontrol tahapan konstruksi tidak tersedia');
 const records=[];const sectionPlane=new T.Plane(new T.Vector3(-1,0,0),config.center[0]);
 const roots=[...groups.entries()].map(([name,root])=>({name,root,stage:groupStage(name)}));
 for(const [name,root] of motionRoots)roots.push({name,root,stage:4});
 for(const item of roots){
  item.baseY=item.root.position.y;
  const bounds=new T.Box3().setFromObject(item.root);const min=Number.isFinite(bounds.min.y)?bounds.min.y:0,max=Number.isFinite(bounds.max.y)?bounds.max.y:14;
  const plane=new T.Plane(new T.Vector3(0,-1,0),max+1);
  const materials=[];item.root.traverse(mesh=>{if(!mesh.isMesh)return;const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];const copied=originals.map(original=>{const m=original.clone();m.onBeforeCompile=original.onBeforeCompile;m.customProgramCacheKey=original.customProgramCacheKey;m.clippingPlanes=[];m.clipShadows=true;materials.push(m);return m;});mesh.material=Array.isArray(mesh.material)?copied:copied[0];});
  records.push({...item,min,max,plane,materials});
 }
 const labels=[];scene.traverse(o=>{if(o.userData.jetisLabel)labels.push(o);});
 const construction={progress:100,playing:false,section:false,explode:false,labels:true,visibleGroups:roots.length,partialGroups:0};state.construction=construction;
 let displayProgress=100,explodeOffset=0,labelStage=-1,lastPercent=-1;
 function setProgress(percent,{smooth=false}={}){
  construction.progress=Math.max(0,Math.min(100,Number(percent)||0));if(!smooth||reduced)displayProgress=construction.progress;
  slider.value=String(construction.progress);document.documentElement.style.setProperty('--construction-progress',construction.progress+'%');slider.style.setProperty('--construction-progress',construction.progress+'%');
  const i=stageIndex(construction.progress),stage=STAGES[i];if(i!==labelStage){labelStage=i;$('construction-number').textContent=String(i+1).padStart(2,'0');$('construction-title').textContent=stage.title;$('construction-detail').textContent=stage.detail;}const rounded=Math.round(construction.progress);if(rounded!==lastPercent){lastPercent=rounded;$('construction-percent').textContent=rounded+'%';slider.setAttribute('aria-valuetext',`${rounded} persen, ${stage.title}`);}
  document.querySelectorAll('[data-stage]').forEach(b=>{const selected=Number(b.dataset.stage)===i;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  const blocked=construction.progress<99.999||construction.section||construction.explode;$('walk-mode').disabled=blocked;$('walk-mode').title=blocked?'Jelajah tersedia pada model lengkap tanpa potongan atau uraian.':'';document.body.classList.toggle('construction-active',construction.progress<99.999);
  if(blocked&&state.walkMode&&state.walkMode!=='orbit')experience.setMode('orbit');
 }
 function setPlaying(value){construction.playing=value;play.setAttribute('aria-label',value?'Jeda tahapan konstruksi':'Putar tahapan konstruksi');play.setAttribute('aria-pressed',String(value));}
 slider.addEventListener('input',()=>{setPlaying(false);setProgress(slider.value);});
 play.addEventListener('click',()=>{if(construction.playing){setPlaying(false);return;}if(construction.progress>=99.999)setProgress(0);setPlaying(true);});
 document.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>{setPlaying(false);setProgress((Number(b.dataset.stage)+1)*20,{smooth:true});}));
 for(const [id,flag] of [['section-toggle','section'],['explode-toggle','explode'],['labels-toggle','labels']]){
  const b=$(id);if(!b)continue;b.setAttribute('aria-pressed',String(construction[flag]));b.classList.toggle('active',construction[flag]);b.onclick=()=>{construction[flag]=!construction[flag];b.setAttribute('aria-pressed',String(construction[flag]));b.classList.toggle('active',construction[flag]);setProgress(construction.progress,{smooth:true});};
 }
 let currentStage=-1;
 function update(dt){
  if(construction.playing){setProgress(construction.progress+dt*100/28);if(construction.progress>=100)setPlaying(false);}
  const blend=reduced?1:1-Math.exp(-dt*12);displayProgress+=(construction.progress-displayProgress)*blend;explodeOffset+=((construction.explode?1:0)-explodeOffset)*blend;
  let visible=0,partial=0;
  for(const r of records){
   const p=revealProgress(displayProgress,r.stage);let show=p>0.00001;if((config.roof_groups||[]).includes(r.name)&&!state.roof)show=false;if((config.interior_groups||[]).includes(r.name)&&!state.interiors)show=false;r.root.visible=show;
   if(show)visible++;if(p>0&&p<1)partial++;r.root.position.y=r.baseY+Math.max(0,r.stage+1)*3.2*explodeOffset;
   r.plane.constant=r.min+(r.max-r.min+.08)*p+r.root.position.y-r.baseY;
   const planes=[];if(p>0&&p<.99999&&r.stage>=0)planes.push(r.plane);if(construction.section&&r.stage>=0)planes.push(sectionPlane);
   for(const mat of r.materials){if(mat.clippingPlanes.length!==planes.length)mat.needsUpdate=true;mat.clippingPlanes=planes;}
  }
  labels.forEach(o=>o.visible=construction.labels&&displayProgress>=99.999&&!construction.explode);
  construction.visibleGroups=visible;construction.partialGroups=partial;construction.renderProgress=displayProgress;
  const next=stageIndex(displayProgress);if(next!==currentStage){currentStage=next;document.body.dataset.constructionStage=String(next);}
 }
 setProgress(100);setPlaying(false);update(0);
 return {update,setProgress,play:()=>play.click(),pause:()=>setPlaying(false),state:construction};
}
