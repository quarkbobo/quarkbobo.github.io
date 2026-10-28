const fs=require('node:fs'),path=require('node:path');
const{launch}=require('../../tools/verify-planet-explorer.cjs');const{serve}=require('./serve.cjs');const d=require('./content.json');
(async()=>{const{server,url}=await serve();const report={consoleErrors:[],views:[]};let browser;
try{for(const[width,height]of[[1440,1000],[390,844]]){
 browser=await launch({width,height,reducedMotion:true},report);
 const entries=[['article-toc','/original'+d.articles.withToc.href,null,'baseline'],...['a','b'].flatMap(v=>[['home-'+v+'-latest','/home-'+v+'.html','#latest-posts','verification'],['home-'+v+'-catalogue','/home-'+v+'.html','#catalogue','verification']])];
 for(const[name,route,selector,dir]of entries){await browser.send('Page.navigate',{url:new URL(route,url).href});await browser.until(`document.readyState==='complete'`,'loaded');
 if(selector)await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
 const m=await browser.evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,documentY:r.y+scrollY,width:r.width,height:r.height}};return{scrollY,viewport:[innerWidth,innerHeight],pageHeight:document.documentElement.scrollHeight,barHeight:document.querySelector('.proposal-bar')?.getBoundingClientRect().height||0,body:document.querySelector('.article-body')?rect(document.querySelector('.article-body')):null,entries:[...document.querySelectorAll('[data-entry],.post-card')].map(rect)}})()`);
 const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,`evidence/${dir}/${width}-${name}.png`),Buffer.from(shot.data,'base64'));report.views.push({name,width,dir,...m});
 }await browser.close();browser=null;
 }fs.writeFileSync(path.join(__dirname,'evidence/supplemental-captures.json'),JSON.stringify(report,null,2));console.log(`Supplemental captures ${report.views.length}, errors ${report.consoleErrors.length}`);
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
