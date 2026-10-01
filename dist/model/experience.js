import * as T from 'three';
import {AVATAR_HEIGHT,collisionData,motionBoxes,overlaps,moveBody,segmentHit} from './navigation.js';

export function createExperience({data,scene,camera,controls,canvas,state,updateMotion,reduced,isGroupVisible=()=>true}){
 const $=id=>document.getElementById(id),{walls,floors}=collisionData(data),spawn=data.project.spawn,player=new T.Vector3(spawn[0],spawn[2],-spawn[1]);
 const doors=new Map(data.motions.map(m=>[m.id,{...m,value:0,target:0}]));
 const keys=new Set(),stick={x:0,y:0};let mode='orbit',yaw=0,pitch=.28,time=0,drag=null,saved=null,walkSpeed=0;
 const avatar=new T.Group();avatar.name='Karakter penjelajah';scene.add(avatar);avatar.visible=false;
 const avatarScale=AVATAR_HEIGHT/1.955;avatar.scale.setScalar(avatarScale);state.avatarHeightM=AVATAR_HEIGHT;
 const palette={skin:0xe6b77d,shirt:0x426b75,vest:0xdfa943,pants:0x263c48,boot:0x263032,eye:0x263032};
 const materials=Object.fromEntries(Object.entries(palette).map(([k,color])=>[k,new T.MeshStandardMaterial({color,roughness:.72})]));
 const part=(parent,size,p,m)=>{const v=new T.Mesh(new T.BoxGeometry(...size),materials[m]);v.position.set(...p);v.castShadow=true;v.receiveShadow=true;parent.add(v);return v;};
 part(avatar,[.70,.64,.37],[0,1.12,0],'shirt');part(avatar,[.72,.48,.04],[0,1.15,.21],'vest');
 for(const x of [-.24,.24])part(avatar,[.075,.44,.045],[x,1.15,.237],'skin');
 part(avatar,[.46,.44,.44],[0,1.66,0],'skin');part(avatar,[.51,.09,.49],[0,1.91,0],'vest');
 for(const x of [-.105,.105])part(avatar,[.045,.05,.016],[x,1.70,.228],'eye');part(avatar,[.13,.022,.016],[0,1.59,.228],'eye');
 const limbs=[];
 for(const side of [-1,1]){
  const leg=new T.Group();leg.position.set(side*.19,.82,0);avatar.add(leg);part(leg,[.29,.72,.32],[0,-.35,0],'pants');part(leg,[.31,.16,.41],[0,-.74,.04],'boot');
  const arm=new T.Group();arm.position.set(side*.47,1.40,0);avatar.add(arm);part(arm,[.22,.43,.28],[0,-.22,0],'shirt');part(arm,[.22,.21,.28],[0,-.52,0],'skin');limbs.push({leg,arm,side});
 }
 const notice=message=>{$('walk-status').textContent=message;};
 function blockers(){return [...walls.filter(b=>isGroupVisible(b.group)),...[...doors.values()].filter(d=>d.kind!=='roll'||d.value*d.travel<d.bounds[5]+.05).flatMap(d=>motionBoxes(d,d.value))];}
 function toggleDoor(id){const d=doors.get(id);if(!d)return;const closing=d.target===1;
  if(closing&&mode!=='orbit'&&motionBoxes(d,0).some(b=>overlaps(player.x,player.z,.4,b,player.y))){notice('Jalur tertutup karakter. Menjauh dulu untuk menutup.');return;}
  d.target=closing?0:1;syncButtons();
 }
 function syncButtons(){for(const d of doors.values()){const b=$('toggle-'+d.id);b.setAttribute('aria-checked',String(d.target===1));b.title=d.target?'Tutup '+d.label:'Buka '+d.label;b.setAttribute('aria-label',b.title);}state.doors=Object.fromEntries([...doors].map(([id,d])=>[id,{open:d.target===1,progress:d.value}]));}
 for(const d of doors.values())$('toggle-'+d.id).onclick=()=>toggleDoor(d.id);
 function nearest(){let best=null,dist=6;for(const d of doors.values()){const q=Math.hypot(player.x-d.anchor[0],player.z+d.anchor[1]);if(q<dist){dist=q;best=d;}}return best;}
 function interact(){const d=nearest();if(d)toggleDoor(d.id);else notice('Dekati gerbang atau pintu gudang untuk membukanya.');}
 function setMode(next){if(next===mode)return;
  if(next!=='orbit'&&mode==='orbit'){saved={position:camera.position.clone(),target:controls.target.clone(),fov:camera.fov};player.set(spawn[0],spawn[2],-spawn[1]);yaw=0;pitch=next==='first'?0:.28;notice('WASD untuk berjalan · seret untuk melihat · E untuk pintu');}
  if(next==='orbit'&&saved){camera.position.copy(saved.position);controls.target.copy(saved.target);camera.fov=saved.fov;controls.update();}else camera.fov=58;
  camera.updateProjectionMatrix();
  mode=next;state.walkMode=mode;controls.enabled=mode==='orbit';avatar.visible=mode==='third';document.body.classList.toggle('walking',mode!=='orbit');$('walk-mode').value=mode;
  keys.clear();stick.x=stick.y=0;drag=null;canvas.style.cursor=mode==='orbit'?'grab':'crosshair';
  if(mode==='first')pitch=0;else if(mode==='third')pitch=.28;
 }
 $('walk-mode').onchange=e=>setMode(e.target.value);$('interact').onclick=interact;$('exit-walk').onclick=()=>setMode('orbit');
 window.addEventListener('keydown',e=>{if(mode==='orbit'||e.target.closest('select,input,textarea,dialog'))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyE','Escape'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)interact();if(e.code==='Escape')setMode('orbit');}});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();stick.x=stick.y=0;drag=null;});
 canvas.addEventListener('pointerdown',e=>{if(mode==='orbit')return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus();});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.004;pitch=Math.max(mode==='first'?-1.2:.05,Math.min(mode==='first'?1.2:1.15,pitch-(e.clientY-drag.y)*.003));drag.x=e.clientX;drag.y=e.clientY;});
 const endLook=e=>{if(drag?.id===e.pointerId)drag=null;};canvas.addEventListener('pointerup',endLook);canvas.addEventListener('pointercancel',endLook);
 const pad=$('joystick'),knob=$('joystick-knob');let padId=null;
 const joystick=e=>{const r=pad.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),s=Math.max(1,Math.hypot(dx,dy)/38);stick.x=dx/s/38;stick.y=-dy/s/38;knob.style.transform=`translate(${dx/s}px,${dy/s}px)`;};
 pad.addEventListener('pointerdown',e=>{padId=e.pointerId;pad.setPointerCapture(padId);joystick(e);});pad.addEventListener('pointermove',e=>{if(e.pointerId===padId)joystick(e);});
 const release=e=>{if(e.pointerId===padId){padId=null;stick.x=stick.y=0;knob.style.transform='';}};pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);
 function update(dt){
  let changing=false;for(const d of doors.values()){
   if(d.value===d.target)continue;
   const step=dt/(d.kind==='roll'?3.2:5.5),next=reduced?d.target:T.MathUtils.clamp(d.value+Math.sign(d.target-d.value)*step,0,1);
   if(d.target===0&&mode!=='orbit'&&motionBoxes(d,next).some(b=>overlaps(player.x,player.z,.36,b,player.y))){d.target=1;notice('Sensor pengaman: pintu kembali terbuka.');}
   else{d.value=Math.abs(next-d.target)<step?d.target:next;updateMotion(d.id,d.value);changing=true;}
  }if(changing)syncButtons();
  if(mode==='orbit')return;
  const forward=stick.y+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),side=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const len=Math.max(1,Math.hypot(forward,side)),speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?4.7:2.8;
  const dx=(Math.sin(yaw)*forward-Math.cos(yaw)*side)/len*speed*dt,dz=(Math.cos(yaw)*forward+Math.sin(yaw)*side)/len*speed*dt;
  const before=player.clone(),active=blockers();const blocked=moveBody(player,dx,dz,active,floors,.29,data.project.walk_bounds,data.project.ground_height??data.project.bounds.min[2]);walkSpeed=player.distanceTo(before)/Math.max(dt,.001);avatar.position.copy(player);
  if(walkSpeed>.1){const target=Math.atan2(player.x-before.x,player.z-before.z),diff=T.MathUtils.euclideanModulo(target-avatar.rotation.y+Math.PI,Math.PI*2)-Math.PI;avatar.rotation.y+=diff*Math.min(1,dt*13);}
  time+=dt*walkSpeed*3;for(const {leg,arm,side:s} of limbs){const a=reduced?0:Math.sin(time)*Math.min(.6,walkSpeed*.18)*s;leg.rotation.x=a;arm.rotation.x=-a;}
  const eye=player.clone().add(new T.Vector3(0,1.66*avatarScale,0));
  if(mode==='first'){camera.position.copy(eye);camera.lookAt(eye.x+Math.sin(yaw)*6,eye.y+Math.sin(pitch)*6,eye.z+Math.cos(yaw)*6);}
  else{const focus=player.clone().add(new T.Vector3(0,1.35*avatarScale,0)),desired=focus.clone().add(new T.Vector3(-Math.sin(yaw)*5.2*Math.cos(pitch),5.2*Math.sin(pitch),-Math.cos(yaw)*5.2*Math.cos(pitch)));let t=1;for(const b of active)t=Math.min(t,segmentHit(focus,desired,b));camera.position.copy(focus).lerp(desired,Math.max(.12,t-.035));camera.lookAt(focus);}
  const near=nearest();$('interact').disabled=!near;$('interact').textContent=near?`${near.target?'Tutup':'Buka'} ${near.label} · E`:'Dekati pintu · E';
  state.walk={mode,position:[player.x,player.y,player.z],blocked,moving:walkSpeed>.1};
 }
 syncButtons();state.walkMode='orbit';
 return {update,setMode,toggleDoor,interact,player,doors,avatar,blockers,inspect:()=>({mode,position:player.toArray(),colliders:walls.length,floors:floors.length})};
}
