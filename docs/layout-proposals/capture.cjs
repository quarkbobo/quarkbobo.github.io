const fs=require('node:fs');const path=require('node:path');
const{launch}=require('../../tools/verify-planet-explorer.cjs');const{serve}=require('./serve.cjs');
(async()=>{const{server,url}=await serve();let browser;const run={consoleErrors:[],pages:[]};
try{for(const[width,height]of[[1440,1000],[390,844]]){
 browser=await launch({width,height,reducedMotion:true},run);
 for(const page of ['home-a','home-b','article','article-toc','archive','games']){
 await browser.send('Page.navigate',{url:url+page+'.html'});await browser.until(`document.readyState==='complete' && [...document.images].every(i=>i.complete)`,'loaded');
 const metrics=await browser.evaluate(`(()=>{const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y+scrollY,width:r.width,height:r.height}};return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,latest:rect('#latest-posts'),catalogue:rect('#catalogue'),body:rect('.article-body'),header:rect('.article-header'),controls:[...document.querySelectorAll('a,summary')].filter(e=>e.getBoundingClientRect().height>0).length}})()`);
 run.pages.push({page,width,height,...metrics});
 const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.join(__dirname,'evidence/verification'),{recursive:true});fs.writeFileSync(path.join(__dirname,`evidence/verification/${width}-${page}.png`),Buffer.from(shot.data,'base64'));
 }await browser.close();browser=null;
 }fs.writeFileSync(path.join(__dirname,'evidence/visual-metrics.json'),JSON.stringify(run,null,2));console.log(JSON.stringify(run,null,2));
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
