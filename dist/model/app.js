import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {createExperience} from './experience.js';
import {createConstruction} from './construction.mjs';
import {qualityPlan,captureSize,AdaptiveQuality,prismFaces,validateCaptureBuffer} from './render-quality.mjs';
const configResponse=await fetch('project.json');
if(!configResponse.ok)throw Error('Project configuration missing');
const config=await configResponse.json();
if(config.status!=='configured'){
 document.getElementById('load-detail').textContent='Menunggu analisis DWG dan pembuatan model. Belum ada model 3D.';
 document.querySelectorAll('button,select').forEach(e=>e.disabled=true);
 throw Error('Awaiting drawing analysis; empty starter is not a generated model');
}
const center=config.center,span=config.span,views=config.views;
document.title=config.name+' — Eksplorasi 3D';
document.getElementById('project-title').textContent=config.name;
document.querySelector('.scale').textContent='BERDASARKAN '+config.source_filename;
document.getElementById('project-size').textContent=config.bounds.max.map((v,i)=>(v-config.bounds.min[i]).toFixed(1)).join(' × ')+' m';
for(const [id,v] of Object.entries(views)){const o=document.createElement('option');o.value=id;o.textContent=v.title;document.getElementById('view').append(o);}
const $=id=>document.getElementById(id),mobile=matchMedia('(max-width:700px)').matches,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const state={ready:false,errors:[],roof:true,interiors:true,time:'day',view:'overview',quality:'auto',textureLoads:0,fps:0};window.DWG_TWIN=state;
const coords=p=>new T.Vector3(p[0],p[2],-p[1]);
// These remain usable even if this device cannot create a WebGL context.
$('info').onclick=()=>$('details').showModal();document.querySelector('.close').onclick=()=>$('details').close();
$('collapse').onclick=()=>{const collapsed=document.querySelector('.controls').classList.toggle('collapsed');$('collapse').textContent=collapsed?'+':'−';$('collapse').setAttribute('aria-expanded',String(!collapsed));};
function webglUnavailable(error){
 state.errors.push(error.message);document.body.classList.add('webgl-unavailable');
 document.querySelectorAll('#settings button,#settings select,.construction-timeline button,.construction-timeline input').forEach(e=>e.disabled=true);
 $('loading').innerHTML='<div class="error"><span class="eyebrow">MODEL 3D</span><h2>WebGL tidak tersedia di browser ini</h2><p>Model membutuhkan WebGL 2 dan akselerasi grafis. Gambar sumber dan gambar teknik tetap bisa dibuka.</p><div class="fallback-links"><a href="../?view=source" target="_top">Buka DWG asli</a><a href="../?view=drawings" target="_top">Buka gambar teknik</a><a href="../downloads/Jetis-Sumber-Asli-R02.dwg" download>Unduh DWG asli</a><a href="../downloads/Jetis-Model-R02.skp" download>Unduh SketchUp</a></div></div>';
 $('assumptions').textContent='Model LOD 100 mengikuti DWG R02. File sumber asli dan SketchUp tersedia untuk pemeriksaan di aplikasi CAD.';
}

let renderer;
try{renderer=new T.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance',logarithmicDepthBuffer:true});}catch(e){webglUnavailable(e);throw e;}
renderer.localClippingEnabled=true;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#ccd8d4');scene.fog=new T.FogExp2('#cbd5cf',.00065);
const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.12,1800);camera.position.copy(coords(views.overview.eye));
const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(coords(center));controls.enableDamping=!reduced;controls.dampingFactor=.085;controls.minDistance=.7;controls.maxDistance=span*6;controls.maxPolarAngle=Math.PI*.485;controls.screenSpacePanning=true;if(camera.aspect<1)camera.position.sub(controls.target).multiplyScalar(1/camera.aspect).add(controls.target);
const hemi=new T.HemisphereLight('#d4e9ef','#b3ab88',.85);scene.add(hemi);
const sun=new T.DirectionalLight('#fff1d5',2.8);sun.position.copy(coords([center[0]-span,center[1]+span*.3,center[2]+span]));sun.target.position.copy(coords(center));scene.add(sun,sun.target);sun.castShadow=true;const shadowRadius=Math.hypot(config.bounds.max[0]-config.bounds.min[0],config.bounds.max[1]-config.bounds.min[1])*.53;sun.shadow.camera.left=-shadowRadius;sun.shadow.camera.right=shadowRadius;sun.shadow.camera.top=shadowRadius;sun.shadow.camera.bottom=-shadowRadius;sun.shadow.camera.near=1;sun.shadow.camera.far=span*4;sun.shadow.bias=-.00004;sun.shadow.normalBias=.06;
const sky=new Sky();sky.scale.setScalar(1200);scene.add(sky);const u=sky.material.uniforms;u.turbidity.value=4;u.rayleigh.value=1.6;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.82;u.sunPosition.value.set(-.5,.8,.2);
const pmrem=new T.PMREMGenerator(renderer);const skyScene=new T.Scene();const envSky=sky.clone();skyScene.add(envSky);let envTarget=pmrem.fromScene(skyScene,.06,.1,2000);scene.environment=envTarget.texture;scene.environmentIntensity=.5;
const ground=new T.Mesh(new T.PlaneGeometry(span*15,span*15),new T.MeshStandardMaterial({color:'#999f88',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(center[0],config.bounds.min[2]-.05,-center[1]);ground.receiveShadow=true;scene.add(ground);
const groups=new Map(),mats={},textureCache=new Map(),buckets=new Map(),prismBuckets=new Map(),motionRoots=new Map(),motionInstances=new Map();const temp=new T.Object3D();let data,transition=null,dynamicLights=[],experience=null,construction=null,capturing=false;
function motionRoot(id){if(!motionRoots.has(id)){const g=new T.Group();g.name=id;scene.add(g);motionRoots.set(id,g);}return motionRoots.get(id);}
function updateMotion(id,progress){const spec=data.motions.find(m=>m.id===id);if(spec.kind==='slide'){motionRoot(id).position.copy(coords(spec.delta)).multiplyScalar(progress);return;}for(const b of motionInstances.get(id)||[]){b.transforms.forEach((base,i)=>{const m=base.clone(),e=b.elements[i];if(spec.kind==='splitSlide'){if(spec.axis==='Y')m.elements[14]-=e.slideSide*spec.travel*progress;else m.elements[12]+=e.slideSide*spec.travel*progress;}else if(spec.kind==='hinge'){const p=coords(spec.pivot),t=new T.Matrix4().makeTranslation(p.x,p.y,p.z),r=new T.Matrix4().makeRotationY(spec.angle*progress),back=new T.Matrix4().makeTranslation(-p.x,-p.y,-p.z);m.premultiply(t.multiply(r).multiply(back));}else{const center=base.elements[13]+spec.travel*progress;m.elements[13]=center;if(center-e.s[2]/2>=spec.top+.035)m.scale(new T.Vector3(.00001,.00001,.00001));}b.mesh.setMatrixAt(i,m);});b.mesh.instanceMatrix.needsUpdate=true;b.mesh.computeBoundingSphere();}}
const adaptive=new AdaptiveQuality(mobile);
const gl=renderer.getContext(),maxDimension=Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
function quality(){
 const plan=qualityPlan({mode:state.quality,tier:adaptive.tier,width:innerWidth,height:innerHeight,devicePixelRatio,maxDimension,mobile});
 renderer.setPixelRatio(plan.pixelRatio);renderer.setSize(innerWidth,innerHeight);
 if(sun.shadow.mapSize.x!==plan.shadowSize){sun.shadow.mapSize.setScalar(plan.shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;}
 state.activeQuality=plan.tier;state.renderSize=[renderer.domElement.width,renderer.domElement.height];state.maxDimension=maxDimension;
 const label=state.quality==='4k'?'Ultra · anggaran hingga 4K':state.quality==='auto'?'Adaptif':state.quality==='low'?'Ringan':'Tinggi';
 $('quality-note').textContent=`${label} · ${state.renderSize.join(' × ')} px · tekstur ${mobile?'1K':'2K'}`;
 $('render-status').textContent=state.renderSize.join(' × ')+' px';
}
quality();

const manager=new T.LoadingManager();manager.onProgress=(url,n,total)=>{state.textureLoads=n;$('progress').style.width=(30+65*n/total)+'%';$('load-detail').textContent=`Material ${n} / ${total}`;};manager.onError=url=>{state.errors.push('Asset: '+url);};const loader=new T.TextureLoader(manager);
function texture(id,map){const key=id+map;if(textureCache.has(key))return textureCache.get(key);const tex=loader.load(`assets/${mobile?'textures-1k':'textures'}/${id}_${map}.jpg`);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),mobile?4:8);if(map==='Color')tex.colorSpace=T.SRGBColorSpace;textureCache.set(key,tex);return tex;}
const materialFinish={
 asphalt:{color:'#b9bfc0',roughness:.98,normalStrength:.18},concrete:{color:'#e2e3de',roughness:.9,normalStrength:.16},
 floor:{color:'#e6ebe7',roughness:.88,normalStrength:.1},steel:{color:'#537078',roughness:.5,metalness:.12,normalStrength:.08,useColor:false},
 roof:{color:'#c5ced1',roughness:.58,metalness:.72,normalStrength:.1,useColor:false},wall:{color:'#e2e7e5',roughness:.78,metalness:.06,normalStrength:.055,useColor:false},
 door:{color:'#62858d',roughness:.65,metalness:.1,normalStrength:.07,useColor:false},stainless:{color:'#c7d0d1',roughness:.38,metalness:.87,normalStrength:.08,useColor:false},
 trim:{color:'#334951',roughness:.5,metalness:.12},glass:{color:'#a9c8cf',roughness:.12,metalness:.04,opacity:.3},soil:{color:'#8c997d',roughness:1}
};
function material(spec,name){const s={...spec,...materialFinish[name]};
 const mat=new T.MeshStandardMaterial({color:s.color,roughness:s.roughness??.6,metalness:s.metalness??0,transparent:!!s.opacity,opacity:s.opacity??1,side:T.FrontSide});
 mat.userData.finish=name;mat.envMapIntensity=name==='roof'?.75:name==='stainless'?.95:.6;
 if(s.opacity){mat.depthWrite=false;mat.envMapIntensity=.85;mat.forceSinglePass=true;}
 if(s.emissive){mat.emissive.set(s.emissive);mat.emissiveIntensity=.35;}
 if(s.texture){if(s.useColor!==false)mat.map=texture(s.texture,'Color');mat.normalMap=texture(s.texture,'NormalGL');mat.normalScale.setScalar(s.normalStrength??.2);mat.roughnessMap=texture(s.texture,'Roughness');
  mat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
vec4 ngp=vec4(position,1.0);vec3 ngn=normal;
#ifdef USE_INSTANCING
ngp=instanceMatrix*ngp;mat3 ni=mat3(instanceMatrix);ngn/=vec3(dot(ni[0],ni[0]),dot(ni[1],ni[1]),dot(ni[2],ni[2]));ngn=ni*ngn;
#endif
ngp=modelMatrix*ngp;ngn=normalize(mat3(modelMatrix)*ngn);vec3 na=abs(ngn);vec2 nguv=na.y>na.x&&na.y>na.z?ngp.xz:(na.x>na.z?ngp.zy:ngp.xy);nguv/=${Number(s.tile??2).toFixed(2)};
#ifdef USE_MAP
vMapUv=nguv;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv=nguv;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv=nguv;
#endif`);};mat.customProgramCacheKey=()=>`dwg-worlduv-${s.tile??2}`;
 }return mat;}
function group(name){if(!groups.has(name)){const g=new T.Group();g.name=name;groups.set(name,g);scene.add(g);}return groups.get(name);}
const boxGeo=new T.BoxGeometry(1,1,1),sphereGeo=new T.IcosahedronGeometry(1,1),cylGeo=new T.CylinderGeometry(1,1,1,16,1);
function bucket(e,geom,matrix,key){const k=e.group+'|'+e.mat+'|'+key+'|'+(e.motion||'');if(!buckets.has(k))buckets.set(k,{g:e.group,mat:e.mat,geom,motion:e.motion,transforms:[],elements:[]});const b=buckets.get(k);b.transforms.push(matrix.clone());b.elements.push(e);}
function addBox(e,p,s,key='box'){temp.position.copy(coords([p[0]+s[0]/2,p[1]+s[1]/2,p[2]+s[2]/2]));temp.quaternion.identity();temp.scale.set(s[0],s[2],s[1]);temp.updateMatrix();bucket(e,boxGeo,temp.matrix,key);}
function beamParts(e){const a=coords(e.a),b=coords(e.b),dir=b.clone().sub(a),len=dir.length();dir.normalize();const ref=Math.abs(dir.y)>.99?new T.Vector3(0,0,-1):new T.Vector3(0,1,0);const x=new T.Vector3().crossVectors(ref,dir).normalize(),y=new T.Vector3().crossVectors(dir,x).normalize();const basis=new T.Matrix4().makeBasis(x,y,dir);const q=new T.Quaternion().setFromRotationMatrix(basis);
 const section=(ox,oy,w,h)=>{temp.position.copy(a).addScaledVector(dir,len/2).addScaledVector(x,ox).addScaledVector(y,oy);temp.quaternion.copy(q);temp.scale.set(w,h,len);temp.updateMatrix();bucket(e,boxGeo,temp.matrix,'box');};
 if(e.kind==='beam')section(0,0,e.w,e.h);else if(e.kind==='wf'){section(0,-e.h/2+e.tf/2,e.w,e.tf);section(0,e.h/2-e.tf/2,e.w,e.tf);section(0,0,e.tw,e.h-2*e.tf);}else{section(-e.w/2+e.tw/2,0,e.tw,e.h);section(e.tw/2,-e.h/2+e.tf/2,e.w-e.tw,e.tf);section(e.tw/2,e.h/2-e.tf/2,e.w-e.tw,e.tf);}}
function prism(e){
 const p=e.points.map(coords),result=prismFaces(p.map(v=>v.toArray()),e.th),key=e.group+'|'+e.mat+'|'+(result.thinSheet?'sheet':'solid');
 if(!prismBuckets.has(key))prismBuckets.set(key,{g:e.group,mat:e.mat,thinSheet:result.thinSheet,vertices:[],uv:[]});
 const batch=prismBuckets.get(key);batch.vertices.push(...result.vertices);batch.uv.push(...result.uv);
}

function label(text,p){const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#213b47';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#eee9db';ctx.font='500 75px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.toUpperCase(),512,69);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(text==='KANTOR'?3.8:4.8,.62),new T.MeshStandardMaterial({map:tex,roughness:.55}));mesh.position.copy(coords(p));mesh.rotation.y=Math.PI;mesh.userData.jetisLabel=true;scene.add(mesh);}
async function init(){const resp=await fetch('assets/scene.json');if(!resp.ok)throw Error('Geometri tidak dapat dimuat');data=await resp.json();if(!data.elements.length)throw Error('Belum ada geometri dari DWG');data.project=config;$('assumptions').textContent=data.assumptions.join(' · ');for(const m of data.motions){const row=document.createElement('div');row.className='row';const text=document.createElement('span');text.textContent=m.label;const button=document.createElement('button');button.id='toggle-'+m.id;button.className='switch';button.setAttribute('role','switch');button.setAttribute('aria-checked','false');button.append(document.createElement('span'));row.append(text,button);$('door-controls').append(row);}$('progress').style.width='25%';for(const [name,s] of Object.entries(data.materials))mats[name]=material(s,name);
 for(const e of data.elements){if(e.kind==='box')addBox(e,e.p,e.s);else if(['beam','wf','cnp'].includes(e.kind))beamParts(e);else if(e.kind==='prism')prism(e);else{temp.quaternion.identity();temp.position.copy(coords(e.p));if(e.kind==='cylinder'){temp.position.y+=e.h/2;temp.scale.set(e.r,e.h,e.r);}else if(e.kind==='wheel'){temp.rotation.x=Math.PI/2;temp.scale.set(e.r,e.d,e.r);}else temp.scale.set(e.s[0],e.s[2],e.s[1]);temp.updateMatrix();bucket(e,['cylinder','wheel'].includes(e.kind)?cylGeo:sphereGeo,temp.matrix,e.kind);}}
 for(const b of buckets.values()){
  const parent=b.motion?motionRoot(b.motion):group(b.g);
  // Transparent panes must sort independently; an instanced batch cannot sort its individual panes.
  if(mats[b.mat].transparent&&!b.motion){
   for(const matrix of b.transforms){const mesh=new T.Mesh(b.geom,mats[b.mat]);mesh.matrix.copy(matrix);mesh.matrixAutoUpdate=false;mesh.castShadow=false;mesh.receiveShadow=false;parent.add(mesh);}continue;
  }
  const mesh=new T.InstancedMesh(b.geom,mats[b.mat],b.transforms.length);b.transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=!['glass','light'].includes(b.mat);mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);
  if(b.motion){b.mesh=mesh;if(!motionInstances.has(b.motion))motionInstances.set(b.motion,[]);motionInstances.get(b.motion).push(b);}
 }

 for(const b of prismBuckets.values()){const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(b.vertices,3));geom.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));geom.computeVertexNormals();const mat=b.thinSheet?mats[b.mat].clone():mats[b.mat];if(b.thinSheet){mat.side=T.DoubleSide;mat.onBeforeCompile=mats[b.mat].onBeforeCompile;mat.customProgramCacheKey=mats[b.mat].customProgramCacheKey;}const mesh=new T.Mesh(geom,mat);mesh.castShadow=true;mesh.receiveShadow=true;group(b.g).add(mesh);}
 experience=createExperience({data,scene,camera,controls,canvas:$('scene'),state,updateMotion,reduced,isGroupVisible:name=>groups.get(name)?.visible!==false});state.experience=experience;
 data.labels.forEach(l=>label(l.text,l.p));
 for(const spec of data.lights||[]){const l=new T.PointLight(spec.color||'#ffdeb1',0,spec.distance||30,2);l.userData.power=spec.intensity??190;l.position.copy(coords(spec.p));scene.add(l);dynamicLights.push(l);}
 state.elements=data.elements.length;state.materials=Object.keys(mats).length;state.groups=[...groups.keys()];state.ready=true;setView('overview');construction=createConstruction({THREE:T,scene,state,groups,motionRoots,config,reduced,experience});state.constructionController=construction;window.DWG_TWIN.scene=scene;window.DWG_TWIN.camera=camera;window.DWG_TWIN.renderer=renderer;window.DWG_TWIN.controls=controls;
 const ready=()=>{$('progress').style.width='100%';$('loading').classList.add('loaded');setTimeout(()=>$('loading').hidden=true,800);};
 if(manager.isLoading)manager.onLoad=ready;else setTimeout(ready,300);
}
function setView(name){experience?.setMode('orbit');state.view=name;$('view').value=name;const v=views[name];$('view-title').textContent=v.title;$('view-detail').textContent=v.detail;$('view-no').textContent=String(Object.keys(views).indexOf(name)+1).padStart(2,'0');const dest=coords(v.eye);if((name==='overview'||name==='top')&&camera.aspect<1)dest.sub(coords(v.target)).multiplyScalar(1/camera.aspect).add(coords(v.target));transition={start:performance.now(),from:camera.position.clone(),to:dest,tf:controls.target.clone(),tt:coords(v.target)};if(v.interior){hemi.intensity=state.time==='day'?1.4:.65;controls.maxPolarAngle=Math.PI*.65;}else{hemi.intensity=state.time==='day'?.85:.45;controls.maxPolarAngle=Math.PI*.485;}}
function setTime(t){state.time=t;const night=t==='dusk';document.body.classList.toggle('dusk',night);document.querySelectorAll('[data-time]').forEach(b=>{b.classList.toggle('active',b.dataset.time===t);b.setAttribute('aria-pressed',b.dataset.time===t);});sun.color.set(night?'#ffc384':'#fff1d5');sun.intensity=night?1.4:2.8;hemi.intensity=night?.45:.85;sun.position.copy(coords([center[0]-span,center[1]+span*.3,center[2]+span*(night?.25:1)]));u.sunPosition.value.set(night?-.94:-.5,night?.12:.8,.2);u.turbidity.value=night?7:4;u.rayleigh.value=night?2.6:1.6;scene.fog.color.set(night?'#70858a':'#cbd5cf');renderer.toneMappingExposure=night?.87:.95;dynamicLights.forEach(l=>l.intensity=night?l.userData.power:0);scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.finish==='light')m.emissiveIntensity=night?3:.35;});envSky.material.uniforms.sunPosition.value.copy(u.sunPosition.value);const newEnv=pmrem.fromScene(skyScene,.08,.1,2000);scene.environment=newEnv.texture;envTarget.dispose();envTarget=newEnv;}
$('view').onchange=e=>setView(e.target.value);$('reset').onclick=()=>setView('overview');$('roof').onclick=()=>{state.roof=!state.roof;(config.roof_groups||[]).forEach(n=>{if(groups.has(n))groups.get(n).visible=state.roof});$('roof').setAttribute('aria-checked',state.roof);};$('interiors').onclick=()=>{state.interiors=!state.interiors;groups.forEach((g,n)=>{if((config.interior_groups||[]).includes(n))g.visible=state.interiors;});$('interiors').setAttribute('aria-checked',state.interiors);};document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>setTime(b.dataset.time));$('quality').onchange=e=>{state.quality=e.target.value;adaptive.reset();quality();};$('info').onclick=()=>$('details').showModal();document.querySelector('.close').onclick=()=>$('details').close();$('details').onclick=e=>{if(e.target===$('details')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}};$('collapse').onclick=()=>{const hidden=document.querySelector('.controls').classList.toggle('collapsed');$('collapse').textContent=hidden?'+':'−';$('collapse').setAttribute('aria-expanded',!hidden);};if(mobile){if(!document.querySelector('.controls').classList.contains('collapsed'))$('collapse').click();$('hint').textContent='SATU JARI putar · DUA JARI geser / zoom';}
async function capture4k(){
 if(capturing||!state.ready)return;capturing=true;const button=$('capture');button.disabled=true;button.querySelector('span').textContent='Menyiapkan…';
 const size=captureSize(maxDimension),previousSize=renderer.getSize(new T.Vector2()),previousRatio=renderer.getPixelRatio();
 const captureCamera=camera.clone();captureCamera.aspect=size.width/size.height;captureCamera.updateProjectionMatrix();
 try{
  // The default framebuffer preserves the live ACES/exposure and sRGB output path.
  // Rendering straight into an ordinary target would skip Three.js tone mapping.
  renderer.setPixelRatio(1);renderer.setSize(size.width,size.height,false);renderer.render(scene,captureCamera);
  validateCaptureBuffer({lost:gl.isContextLost(),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},size);
  const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));if(!blob)throw Error('Gambar tidak dapat disimpan');
  validateCaptureBuffer({lost:gl.isContextLost(),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},size);
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`jetis-sarilaut-${state.view}-${state.time}-${size.width}x${size.height}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('capture-status').textContent=`PNG ${size.width} × ${size.height} px${size.limited?' · dibatasi perangkat':''}`;state.lastCapture=size;
 }catch(error){state.errors.push(error.message);$('capture-status').textContent='Ekspor gagal: '+error.message;}
 finally{renderer.setPixelRatio(previousRatio);renderer.setSize(previousSize.x,previousSize.y,false);renderer.render(scene,camera);capturing=false;button.disabled=!state.ready;button.querySelector('span').textContent='Simpan 4K';}
}

$('capture').onclick=capture4k;$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.();};window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();quality();});controls.addEventListener('start',()=>transition=null);
const keys=new Set();$('scene').addEventListener('keydown',e=>{if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){keys.add(e.key);e.preventDefault();}});window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
let frames=0,last=performance.now(),previous=last;
function animate(now){requestAnimationFrame(animate);if(document.hidden||capturing){previous=now;last=now;frames=0;return;}const dt=Math.min((now-previous)/1000,.06);previous=now;if(transition&&state.walkMode!=='orbit'&&state.walkMode)transition=null;if(transition){const t=reduced?1:Math.min(1,(now-transition.start)/1500),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,ease);controls.target.lerpVectors(transition.tf,transition.tt,ease);if(t===1)transition=null;}
 if(keys.size&&(!state.walkMode||state.walkMode==='orbit')){const f=controls.target.clone().sub(camera.position);f.y=0;f.normalize();const r=new T.Vector3().crossVectors(f,camera.up).normalize();const move=new T.Vector3();if(keys.has('w')||keys.has('ArrowUp'))move.add(f);if(keys.has('s')||keys.has('ArrowDown'))move.sub(f);if(keys.has('d')||keys.has('ArrowRight'))move.add(r);if(keys.has('a')||keys.has('ArrowLeft'))move.sub(r);move.multiplyScalar(dt*4);camera.position.add(move);controls.target.add(move);}
 if(!state.walkMode||state.walkMode==='orbit')controls.update();experience?.update(dt);construction?.update(dt);renderer.render(scene,camera);frames++;if(now-last>2000){state.fps=Math.round(frames*1000/(now-last));state.drawCalls=renderer.info.render.calls;state.triangles=renderer.info.render.triangles;frames=0;last=now;if(state.ready&&state.quality==='auto'&&!document.hidden&&adaptive.observe(state.fps))quality();}}
requestAnimationFrame(animate);init().catch(e=>{state.errors.push(e.message);$('loading').innerHTML=`<div class="error"><h2>Model belum dapat dibuka</h2><p>${e.message}</p><button onclick="location.reload()">Muat ulang</button></div>`;console.error(e);});




renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();state.ready=false;$('capture').disabled=true;$('capture-status').textContent='Konteks grafis terputus. Muat ulang halaman untuk melanjutkan.';});
