// Collision math shared by the interactive viewer and offline boundary tests.
export const AVATAR_HEIGHT=1.70;
export function pointInPolygon(x,z,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(segmentDistance(x,z,a,b)<1e-7)return true;if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
export function overlaps(x,z,r,b,feet,height=AVATAR_HEIGHT+.02){
 if(!(feet+height>b.minY+.01&&feet+.23<b.maxY&&x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ))return false;
 if(b.segment)return segmentDistance(x,z,...b.segment)<r+(b.radius||.075);
 if(b.polygon)return pointInPolygon(x,z,b.polygon)||b.polygon.some((a,i)=>segmentDistance(x,z,a,b.polygon[(i+1)%b.polygon.length])<r);
 return true;
}
export function collisionData(data){
 const walls=[],floors=[];
 for(const e of data.elements){
  if(e.motion||e.collision==='none')continue;
  if(e.kind==='box'){
   const [x,y,z]=e.p,[w,d,h]=e.s,b={minX:x,maxX:x+w,minY:z,maxY:z+h,minZ:-y-d,maxZ:-y,name:e.name,group:e.group};
   if(e.collision==='floor'||/^(Lantai |Pelat kantor|Anak tangga kantor|Landing kantor|Pelataran beton|Jalan depan)/.test(e.name)){floors.push(b);walls.push(b);}
   else if(h>=.26&&w>=.03&&d>=.03)walls.push(b);
  }else if(e.kind==='cylinder'&&e.r>=.065&&e.h>=.3){const [x,y,z]=e.p;walls.push({minX:x-e.r,maxX:x+e.r,minZ:-y-e.r,maxZ:-y+e.r,minY:z,maxY:z+e.h,name:e.name});}
  else if(['beam','wf','cnp'].includes(e.kind)){
   const a=e.a,b=e.b,r=Math.max(e.w,e.h)/2;
   walls.push({minX:Math.min(a[0],b[0])-r,maxX:Math.max(a[0],b[0])+r,minZ:Math.min(-a[1],-b[1])-r,maxZ:Math.max(-a[1],-b[1])+r,minY:Math.min(a[2],b[2])-r,maxY:Math.max(a[2],b[2])+r,segment:[[a[0],-a[1]],[b[0],-b[1]]],radius:r,name:e.name,group:e.group});
  }else if(e.kind==='prism'&&e.collision){
   const xs=e.points.map(p=>p[0]),ys=e.points.map(p=>p[1]),zs=e.points.map(p=>p[2]);
   const b={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:-Math.max(...ys),maxZ:-Math.min(...ys),minY:Math.min(...zs)-e.th,maxY:Math.max(...zs),name:e.name,group:e.group};
   if(e.collision==='floor'){b.polygon=e.points.map(p=>[p[0],-p[1]]);floors.push(b);walls.push(b);}
   else {const xy=[];for(const p of e.points)if(!xy.some(q=>Math.hypot(q[0]-p[0],q[1]+p[1])<.0001))xy.push([p[0],-p[1]]);if(xy.length===2){b.segment=xy;b.radius=e.th/2;b.minX-=e.th/2;b.maxX+=e.th/2;b.minZ-=e.th/2;b.maxZ+=e.th/2;}else b.polygon=xy;walls.push(b);}
  }
 }
 return {walls,floors};
}
export function motionBox(m,p){const[x,y,z,w,d,h]=m.bounds;const dx=m.kind==='slide'?m.delta[0]*p:0,dz=m.kind==='slide'?-m.delta[1]*p:0,up=m.kind==='roll'?m.travel*p:0;
 return {minX:x+dx,maxX:x+w+dx,minZ:-y-d+dz,maxZ:-y+dz,minY:z+up,maxY:m.kind==='roll'?Math.max(z+up,z+h):z+h,name:m.label};}
export function motionBoxes(m,p){
 if(m.kind==='splitSlide')return m.leaves.map((bounds,i)=>{const s=(i===0?-1:1)*m.travel;return motionBox({...m,kind:'slide',bounds,delta:m.axis==='Y'?[0,s,0]:[s,0,0]},p);});
 if(m.kind==='hinge'){
  const[x,y,z,w,d,h]=m.bounds,[px,py]=m.pivot,ang=m.angle*p,c=Math.cos(ang),s=Math.sin(ang);
  const poly=[[x,y],[x+w,y],[x+w,y+d],[x,y+d]].map(([a,b])=>[px+c*(a-px)-s*(b-py),-(py+s*(a-px)+c*(b-py))]);
  return [{minX:Math.min(...poly.map(q=>q[0])),maxX:Math.max(...poly.map(q=>q[0])),minZ:Math.min(...poly.map(q=>q[1])),maxZ:Math.max(...poly.map(q=>q[1])),minY:z,maxY:z+h,polygon:poly,name:m.label}];
 }
 return [motionBox(m,p)];
}
export function floorAt(x,z,current,floors,ground=0){let h=ground;const eps=1e-6;for(const b of floors)if(x>=b.minX-eps&&x<=b.maxX+eps&&z>=b.minZ-eps&&z<=b.maxZ+eps&&(!b.polygon||pointInPolygon(x,z,b.polygon))&&b.maxY<=current+.24)h=Math.max(h,b.maxY);return h;}
export function moveBody(pos,dx,dz,walls,floors,r=.29,bounds=[-Infinity,Infinity,-Infinity,Infinity],ground=0){
 const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));let collided=false;
 for(let i=0;i<n;i++){
  for(const axis of ['x','z']){const x=pos.x+(axis==='x'?dx/n:0),z=pos.z+(axis==='z'?dz/n:0),foot=floorAt(x,z,pos.y,floors,ground);
   if(x-r<bounds[0]||x+r>bounds[1]||-z-r<bounds[2]||-z+r>bounds[3]||walls.some(b=>overlaps(x,z,r,b,foot))){collided=true;continue;}
   pos.x=x;pos.z=z;pos.y=foot;
  }
 }
 return collided;
}
export function segmentHit(a,b,box){let lo=0,hi=1;for(const k of ['X','Y','Z']){const key=k.toLowerCase(),d=b[key]-a[key],min=box['min'+k]-.08,max=box['max'+k]+.08;if(Math.abs(d)<1e-7){if(a[key]<min||a[key]>max)return 1;continue;}let t0=(min-a[key])/d,t1=(max-a[key])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return 1;}return lo>0?lo:1;}
