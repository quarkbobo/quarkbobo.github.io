const view=document.querySelector('#comparison-view');
const device=document.querySelector('#comparison-device');
const pairs={
 'home-a':['home','home-a','A 深空档案馆'],
 'home-b':['home','home-b','B 轨道工作台'],
 'latest':['latest','home-a-latest','A 最近记录'],
 'catalogue':['catalogue','home-a-catalogue','A 主题目录'],
 'article':['article','article','A 阅读页 · 无目录'],
 'article-toc':['article-toc','article-toc','A 阅读页 · 有目录'],
 'archive':['archive','archive','A 归档'],
 'games':['games','games','A 游戏合集']
};
const params=new URLSearchParams(location.search);
if(pairs[params.get('view')])view.value=params.get('view');
if(['1440','390'].includes(params.get('width')))device.value=params.get('width');
function render(){
 const[before,after,label]=pairs[view.value],w=Number(device.value),h=w===1440?1000:844;
 document.querySelector('#comparison-status').textContent=`${label} · ${w} × ${h}，前后使用相同视口。`;
 for(const[side,file,dir,title]of[['before',before,'baseline','原站'],['after',after,'verification',label]]){
  const img=document.querySelector('#'+side+'-image'),src=`evidence/${dir}/${w}-${file}.png`;
  img.src=src;img.width=w;img.height=h;img.alt=`${title}，${w}×${h}真实浏览器截图`;
  document.querySelector('#'+side+'-full').href=src;
  document.querySelector('#'+side+'-caption').textContent=title;
 }
 history.replaceState(null,'',`?view=${view.value}&width=${w}`);
}
view.addEventListener('change',render);device.addEventListener('change',render);render();
