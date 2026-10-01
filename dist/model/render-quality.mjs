/** Rendering policy, independent of source geometry and device-specific WebGL state. */
export const FOUR_K_PIXELS=3840*2160;
export function qualityPlan({mode='auto',tier='detail',width,height,devicePixelRatio=1,maxDimension=8192,mobile=false}){
 width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);maxDimension=Math.max(1,Number(maxDimension)||2048);
 const low=mode==='low'||(mode==='auto'&&(mobile||tier==='low'));
 const balanced=mode==='auto'&&tier==='balanced';
 let pixelRatio=mode==='4k'?Math.min(4,Math.max(1,Math.sqrt(FOUR_K_PIXELS/(width*height)))):Math.min(devicePixelRatio,low?1:balanced?1.25:2);
 const budget=low?1920*1080:balanced?2560*1440:FOUR_K_PIXELS;
 pixelRatio=Math.min(pixelRatio,Math.sqrt(budget/(width*height)),maxDimension/width,maxDimension/height);
 const renderWidth=Math.max(1,Math.floor(width*pixelRatio)),renderHeight=Math.max(1,Math.floor(height*pixelRatio));
 return {pixelRatio,width:renderWidth,height:renderHeight,shadowSize:Math.min(maxDimension,low?1024:mode==='4k'?4096:2048),tier:low?'low':balanced?'balanced':'detail',limited:mode==='4k'&&(renderWidth<3840&&renderHeight<2160)};
}
export function captureSize(maxDimension=8192){const width=Math.min(3840,Math.floor(maxDimension));const height=Math.floor(width*9/16);return {width,height,limited:width<3840};}
export class AdaptiveQuality{
 constructor(mobile=false){this.mobile=mobile;this.reset();}
 reset(){this.tier=this.mobile?'low':'detail';this.lowSamples=0;}
 observe(fps){
  this.lowSamples=Number.isFinite(fps)&&fps<24?this.lowSamples+1:0;
  if(this.lowSamples<3||this.tier==='low')return false;
  this.tier=this.tier==='detail'?'balanced':'low';this.lowSamples=0;return true;
 }
}
/** Thin physical sheets use their exact top surface twice-sided, avoiding a near-coplanar back shell. */
export function prismFaces(points,thickness){
 const vertices=[],uv=[],thinSheet=thickness<=.002;
 const tri=(a,b,c)=>{vertices.push(...a,...b,...c);uv.push(0,0,1,0,1,1);};
 for(let i=1;i<points.length-1;i++)tri(points[0],points[i],points[i+1]);
 if(!thinSheet){
  const a=points[0],b=points[1],c=points[2],u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
  const bottom=points.map(p=>p.map((v,i)=>v-n[i]/length*thickness));
  for(let i=1;i<points.length-1;i++)tri(bottom[0],bottom[i+1],bottom[i]);
  for(let i=0;i<points.length;i++){const j=(i+1)%points.length;tri(points[j],points[i],bottom[i]);tri(points[j],bottom[i],bottom[j]);}
 }
 return {vertices,uv,thinSheet};
}
export function validateCaptureBuffer(actual,requested){
 if(actual.lost)throw Error('Konteks grafis terputus saat ekspor. Muat ulang halaman.');
 if(actual.width!==requested.width||actual.height!==requested.height)throw Error('GPU tidak dapat menyediakan resolusi ekspor yang diminta. Pilih kualitas lebih ringan.');
 return true;
}
