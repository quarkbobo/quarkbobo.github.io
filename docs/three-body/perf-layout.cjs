// Compatibility copy: retain every original layout assertion, viewport, font scale, and route.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{serve,launch}=require('../../tools/verify-planet-explorer.cjs');
const out=path.resolve(__dirname,'perf-layout-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const originalScript=path.resolve(__dirname,'../../tools/verify-archive-a.cjs');
const originalSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(originalScript)).digest('hex');
const report={originalScript:'tools/verify-archive-a.cjs',originalSha256,copiedFromSha256:'15454a7b8c7efeea94faf2503b266112d45cfc27369e68c5f2cf253d93d452f0',adaptation:['Resolve the existing serve/launch helper from docs/three-body.','Write timestamped evidence inside docs/three-body.','Replace only the obsolete home .planet-webgl-ready wait with the real threeBodySnapshot renderer availability and positive frame count.','All 25 viewport/route/font cases, layout assertions, thresholds, and zero-console assertion are copied unchanged. No fake legacy DOM class is added.'],consoleErrors:[],views:[]};
(async()=>{const{server,url}=await serve();let b;try{
 for(const[width,height,zoom]of[[1440,1000,false],[390,844,false],[320,844,false],[768,1000,false],[390,844,true]]){
  b=await launch({width,height,reducedMotion:true},report);
  for(const[name,route]of[['home',''],['article','关于我/zzyc_V4_for_U/'],['article-toc','个人博客/My-First-Blog/'],['archive','archives/'],['games','游戏相关/game-concat/']]){
   await b.send('Page.navigate',{url:new URL(route,url).href});await b.until(`document.readyState==='complete'${name==='home'?" && window.threeBodySnapshot?.().renderer.available && window.threeBodySnapshot().renderer.frames>0":''}`,'ready');
   if(zoom)await b.evaluate(`document.documentElement.style.fontSize='200%'`);
   await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const m=await b.evaluate(`(()=>{const visible=e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0;const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{inner:innerWidth,page:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,latestY:document.querySelector('#latest-posts')?.getBoundingClientRect().y,body:document.querySelector('.article-body')?rect(document.querySelector('.article-body')):null,cards:document.querySelectorAll('[data-latest-card]').length,topics:document.querySelectorAll('.catalogue-topic').length,clipped:[...document.querySelectorAll('h1,h2,h3,a,button,summary')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left< -1||r.right>document.documentElement.clientWidth+1||e.scrollWidth>e.clientWidth+1&&e.clientWidth>0}).map(e=>e.outerHTML.slice(0,160))}})()`);
   const entry={name,width,zoom,...m};report.views.push(entry);assert.equal(m.inner,width,`${name} exact viewport`);assert.ok(m.page<=m.client,`${name} ${width} overflow: ${m.page}`);assert.deepEqual(m.clipped,[],`${name} ${width} clipped text`);
   if(name==='home'){assert.equal(m.cards,2);assert.equal(m.topics,3);}
   if(name==='article')assert.ok(Math.abs(m.body.x-(m.client-m.body.width)/2)<2,'no TOC article centered');
   const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${width}-${name}${zoom?'-font200':''}.png`),Buffer.from(shot.data,'base64'));
   console.log(`PASS ${name} ${width}${zoom?' font200':''}`);
  }await b.close();b=null;
 }
 assert.deepEqual(report.consoleErrors,[]);report.passed=true;console.log('PASS 25 live-page layouts; console errors 0');
}finally{if(b)await b.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify(report,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
