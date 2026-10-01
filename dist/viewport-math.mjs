export function zoomAt(view,factor,cx,cy){
  const scale=Math.max(.1,Math.min(32,view.scale*factor));
  const ratio=scale/view.scale;
  return {x:cx-(cx-view.x)*ratio,y:cy-(cy-view.y)*ratio,scale};
}
export function fitView(width,height,sheetWidth,sheetHeight,padding=28){
  const scale=Math.min((width-padding*2)/sheetWidth,(height-padding*2)/sheetHeight);
  return {x:(width-sheetWidth*scale)/2,y:(height-sheetHeight*scale)/2,scale};
}
