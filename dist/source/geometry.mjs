// Saved ObjectDBX primitives only. No inferred CAD boundaries, unit conversion or dimension linkage.
const TAU=Math.PI*2,IDENTITY=[1,0,0,1,0,0];
const point=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
const combine=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const union=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
const emptyBounds=()=>[Infinity,Infinity,-Infinity,-Infinity];
const boxPoints=ps=>ps.reduce((a,p)=>union(a,[p[0],p[1],p[0],p[1]]),emptyBounds());
const transformBox=(b,m)=>boxPoints([[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(p=>point(m,p)));
export function bulgeArc(a,b,bulge){
 if(!Number.isFinite(bulge)||Math.abs(bulge)<1e-14)return null;
 const chord=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!chord)return null;
 return {radius:chord*(1+bulge*bulge)/(4*Math.abs(bulge)),large:Math.abs(bulge)>1?1:0,sweep:bulge>0?1:0,end:b};
}
export function entityPath(e){
 if(e.type==='AcDbLine')return `M${e.a[0]} ${e.a[1]}L${e.b[0]} ${e.b[1]}`;
 if(e.type==='AcDbPolyline'||e.type==='AcDb2dPolyline'){
  const ps=[];for(let i=0;i<e.points.length-1;i+=2)ps.push([e.points[i],e.points[i+1]]);if(!ps.length)return '';
  let p=`M${ps[0][0]} ${ps[0][1]}`;const n=ps.length-(e.closed?0:1);
  for(let i=0;i<n;i++){const b=ps[(i+1)%ps.length],arc=bulgeArc(ps[i],b,e.bulges?.[i]||0);p+=arc?`A${arc.radius} ${arc.radius} 0 ${arc.large} ${arc.sweep} ${b[0]} ${b[1]}`:`L${b[0]} ${b[1]}`;}
  return p+(e.closed?'Z':'');
 }
 if(e.type==='AcDbCircle'){
  const [x,y]=e.center,r=e.radius;return `M${x+r} ${y}A${r} ${r} 0 1 1 ${x-r} ${y}A${r} ${r} 0 1 1 ${x+r} ${y}`;
 }
 if(e.type==='AcDbArc'){
  const [x,y]=e.center,r=e.radius;let sweep=e.end-e.start;while(sweep<0)sweep+=TAU;while(sweep>TAU)sweep-=TAU;
  if(Math.abs(sweep-TAU)<1e-12)return entityPath({...e,type:'AcDbCircle'});
  const a=[x+r*Math.cos(e.start),y+r*Math.sin(e.start)],b=[x+r*Math.cos(e.end),y+r*Math.sin(e.end)];
  return `M${a[0]} ${a[1]}A${r} ${r} 0 ${sweep>Math.PI?1:0} 1 ${b[0]} ${b[1]}`;
 }
 return '';
}
function entityBounds(e){
 if(e.type==='AcDbLine')return boxPoints([e.a,e.b]);
 if(e.type==='AcDbCircle'||e.type==='AcDbArc'){const [x,y]=e.center,r=e.radius;return [x-r,y-r,x+r,y+r];}
 const ps=[];for(let i=0;i<e.points.length-1;i+=2)ps.push([e.points[i],e.points[i+1]]);
 let bounds=boxPoints(ps);
 for(let i=0;i<ps.length-(e.closed?0:1);i++){
  const a=ps[i],b=ps[(i+1)%ps.length],bulge=e.bulges?.[i]||0,arc=bulgeArc(a,b,bulge);
  if(arc){const dx=b[0]-a[0],dy=b[1]-a[1],offset=(1-bulge*bulge)/(4*bulge),cx=(a[0]+b[0])/2-dy*offset,cy=(a[1]+b[1])/2+dx*offset;bounds=union(bounds,[cx-arc.radius,cy-arc.radius,cx+arc.radius,cy+arc.radius]);}
 }
 return bounds;
}
export function parseMText(raw,baseHeight=1){
 const source=String(raw??'').replace(/%%[cC]/g,'Ø').replace(/%%[pP]/g,'±').replace(/%%[dD]/g,'°').replace(/\\U\+([\da-fA-F]{4})/g,(_,c)=>String.fromCharCode(parseInt(c,16)));
 const lines=[{runs:[]}];let style={height:baseHeight,font:'Arial',underline:false,bold:false,italic:false,width:1},stack=[],buffer='';
 const flush=()=>{if(buffer){lines.at(-1).runs.push({text:buffer,...style});buffer='';}};
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(ch==='{'){flush();stack.push({...style});continue;}
  if(ch==='}'){flush();style=stack.pop()||style;continue;}
  if(ch!=='\\'){buffer+=ch;continue;}
  const code=source[++i];if(code===undefined)break;
  if(['\\','{','}'].includes(code)){buffer+=code;continue;}
  if(code==='~'){buffer+='\u00a0';continue;}
  if(code==='P'||code==='n'){flush();lines.push({runs:[]});continue;}
  if(['L','l','O','o','K','k'].includes(code)){flush();if(code==='L')style.underline=true;if(code==='l')style.underline=false;continue;}
  const end=source.indexOf(';',i+1);if(end<0){buffer+='\\'+code;continue;}
  const value=source.slice(i+1,end);flush();i=end;
  if(code==='H'){const n=parseFloat(value);if(Number.isFinite(n))style.height=value.endsWith('x')?style.height*n:n;}
  else if(code==='f'||code==='F'){const parts=value.split('|');style.font=parts[0];style.bold=parts.includes('b1');style.italic=parts.includes('i1');}
  else if(code==='W'){const n=parseFloat(value);if(Number.isFinite(n))style.width=n;}
  else if(code==='S'){buffer+=value.replace(/[\^#]/g,'/');}
  // Alignment/color/tracking and unprovided text layout cannot be recovered faithfully.
 }
 flush();return {lines};
}
export function compileGeometry(data){
 const groups=[],texts=[],active=new Map(),missing=new Set(),cycles=new Set();let bounds=emptyBounds();
 const coverage={modelRecords:data.entities.length,blockDefinitions:Object.keys(data.blocks||{}).length,renderedLinework:0,modelLinework:0,modelMText:0,blockLinework:0,expandedInserts:0,partialDimensions:0,omitted:{},warnings:data.warnings?.length||0,missingBlocks:[],cyclicBlocks:[]};
 const omit=kind=>{coverage.omitted[kind]=(coverage.omitted[kind]||0)+1;};
 const addText=(e,m,layer,kind,raw,height)=>{
  const layout=parseMText(raw,height),maxWidth=Math.max(0,...layout.lines.map(l=>l.runs.reduce((w,r)=>w+r.text.length*r.height*.85*r.width,0))),totalHeight=layout.lines.reduce((h,l)=>h+Math.max(height*.5,...l.runs.map(r=>r.height))*1.25,0);
  const p=e.position||e.textPosition,b=transformBox([p[0],p[1]-totalHeight,p[0]+maxWidth,p[1]+height],m);
  texts.push({handle:e.handle,layer,kind,raw:String(raw),position:p.slice(0,2),height,matrix:m,bounds:b,layout});bounds=union(bounds,b);
 };
 function visit(e,m=IDENTITY,inherited='0',trail=[]){
  const layer=e.layer==='0'?inherited:(e.layer||inherited),kind=e.type;
  if(e.unsupported){omit(kind);return;}
  if(e.normal&&(Math.abs(e.normal[0])>1e-10||Math.abs(e.normal[1])>1e-10||Math.abs(e.normal[2]-1)>1e-10)){omit(kind+':non-XY-normal');return;}
  if(kind==='AcDbBlockReference'){
   const b=data.blocks?.[e.name];if(!b){missing.add(e.name);return;}if(trail.includes(e.name)){cycles.add(e.name);return;}
   if(b.isXref){omit('ExternalReference');return;}
   const [sx=1,sy=1]=e.scale||[],r=e.rotation||0,c=Math.cos(r),s=Math.sin(r),o=b.origin||[0,0],p=e.position;
   const local=[c*sx,s*sx,-s*sy,c*sy,0,0];local[4]=p[0]-local[0]*o[0]-local[2]*o[1];local[5]=p[1]-local[1]*o[0]-local[3]*o[1];
   coverage.expandedInserts++;for(const child of b.entities||[])visit(child,combine(m,local),layer,[...trail,e.name]);return;
  }
  if(kind==='AcDbMText'){
   if(!trail.length)coverage.modelMText++;addText(e,m,layer,'mtext',e.text,e.height||1);return;
  }
  if(kind?.includes('Dimension')){
   coverage.partialDimensions++;if(e.textPosition&&Number.isFinite(e.measurement))addText(e,m,layer,'dimension',e.text||String(e.measurement),.5);return;
  }
  const path=entityPath(e);if(!path){omit(kind||'Unknown');return;}
  const b=transformBox(entityBounds(e),m),key=layer+':'+m.join(','),old=active.get(key);
  let g=old;if(!g||g.count>=500){g={layer,matrix:m,path:'',bounds:emptyBounds(),count:0};active.set(key,g);groups.push(g);}
  g.path+=path;g.bounds=union(g.bounds,b);g.count++;coverage.renderedLinework++;coverage[trail.length?'blockLinework':'modelLinework']++;bounds=union(bounds,b);
 }
 for(const e of data.entities)visit(e);
 coverage.missingBlocks=[...missing];coverage.cyclicBlocks=[...cycles];
 return {version:1,sourceSha256:data.source_sha256?.toLowerCase(),extractedInsunits:data.insunits??null,coordinateSystem:'Original model-space XY; no rescale, rebasing or geometry interpretation',bounds,groups,texts,coverage};
}
export function fitBounds(b,width,height,padding=24){
 const scale=Math.min((width-padding*2)/(b[2]-b[0]||1),(height-padding*2)/(b[3]-b[1]||1));
 return {x:width/2-(b[0]+b[2])/2*scale,y:height/2+(b[1]+b[3])/2*scale,scale};
}
export function screenToWorld(v,x,y){return [(x-v.x)/v.scale,(v.y-y)/v.scale];}
export function zoomView(v,factor,x,y,min=.00001,max=100000){
 const scale=Math.max(min,Math.min(max,v.scale*factor)),f=scale/v.scale;return {x:x-(x-v.x)*f,y:y-(y-v.y)*f,scale};
}
export function intersects(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
