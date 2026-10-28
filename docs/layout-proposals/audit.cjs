const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const{serve}=require('./serve.cjs'),{launch}=require('../../tools/verify-planet-explorer.cjs'),{assertNoHorizontalOverflow,geometryScript}=require('./verify.cjs');
const out=path.join(__dirname,'evidence');const report={checks:[],consoleErrors:[],views:[]};
function check(label,value){assert.ok(value,label);report.checks.push(label);console.log('PASS '+label)}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function key(b,key,code){await b.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code})}
const overlaps=`(()=>{const els=[...document.querySelectorAll('h1,h2,h3,a,summary')].filter(e=>{const r=e.getBoundingClientRect();return e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&r.width>0&&r.height>0&&r.top>=0&&r.top<innerHeight});const bad=[];for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i],b=els[j];if(a.contains(b)||b.contains(a))continue;const intersects=[...a.getClientRects()].some(r=>[...b.getClientRects()].some(s=>Math.min(r.right,s.right)-Math.max(r.left,s.left)>2&&Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)>2));if(intersects)bad.push([a.outerHTML.slice(0,120),b.outerHTML.slice(0,120)]);}return bad})()`;
(async()=>{const{server,url}=await serve();let b;
try{
 const latest=JSON.parse(fs.readFileSync(path.join(out,'verification-latest.json')));const v=JSON.parse(fs.readFileSync(path.join(latest.directory,'verification.json')));
 check('final independent matrix: 56 cases / 1200 assertions / zero failures',v.passed&&v.cases.length===56&&v.cases.reduce((n,c)=>n+c.checks.length,0)===1200&&v.failures.length===0);
 for(const name of['styles.css','index.html','home-a.html','home-b.html','article.html','article-toc.html','archive.html','games.html'])check('current UI matches verified hash: '+name,hash(fs.readFileSync(path.join(__dirname,name)))===v.sourceHashes[name]);
 const d=require('./content.json');for(const item of d.sources)check('real content source unchanged: '+item.path,hash(fs.readFileSync(path.resolve(__dirname,'../..',item.path)))===item.sha256);
 for(const[width,height,zoom]of[[1440,1000,false],[390,844,false],[390,844,true]]){
  b=await launch({width,height,reducedMotion:true},report);
  for(const page of['index','home-a','home-b','article','article-toc','archive','games','compare','REPORT']){
   await b.send('Page.navigate',{url:url+page+'.html'});await b.until(`document.readyState==='complete' && [...document.images].every(i=>i.complete&&i.naturalWidth>0)`,'fully loaded');
   if(zoom)await b.evaluate(`document.documentElement.style.fontSize='200%'`);
   const g=await b.evaluate(geometryScript);assertNoHorizontalOverflow(g,width);check(`${page} ${width}${zoom?' font200':''}: no overflow`,true);
   for(const position of['top','middle']){if(position==='middle')await b.evaluate(`scrollTo(0,Math.max(0,(document.documentElement.scrollHeight-innerHeight)/2))`);const bad=await b.evaluate(overlaps);check(`${page} ${width}${zoom?' font200':''}: no intersecting controls/headings at ${position}`,bad.length===0);}
   if(page==='games'||page==='article'){
    const selector=page==='games'?'.game-entry:last-child':'.reading-end a:last-child';
    await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();document.activeElement.scrollIntoView({block:'center'})`);
    // Shift+Tab then Tab puts the same lower-page target into keyboard modality.
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await key(b,'Tab',9);
    check(`${page} ${width}${zoom?' font200':''}: lower-page keyboard focus visible`,await b.evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return e.matches(':focus-visible')&&parseFloat(s.outlineWidth)>=3&&r.top>=0&&r.bottom<=innerHeight})()`));
   }
   if(page==='compare'||page==='REPORT'){await b.evaluate('scrollTo(0,0)');const s=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`delivery-${page}-${width}${zoom?'-font200':''}.png`),Buffer.from(s.data,'base64'));}
   report.views.push({page,width,height,zoom,geometry:g});
  }
  if(!zoom&&width===1440){
   await b.send('Page.navigate',{url:url+'compare.html'});await b.until(`document.querySelector('#comparison-view')`,'comparison controls');await b.evaluate(`document.querySelector('#comparison-view').focus()`);await key(b,'ArrowDown',40);check('comparison selector responds to real keyboard input',await b.evaluate(`location.search.includes('view=home-b')`));
   for(const view of['home-a','home-b','latest','catalogue','article','article-toc','archive','games'])for(const device of[1440,390]){
    await b.evaluate(`document.querySelector('#comparison-view').value=${JSON.stringify(view)};document.querySelector('#comparison-device').value='${device}';document.querySelector('#comparison-view').dispatchEvent(new Event('change'))`);await b.until(`[...document.querySelectorAll('.comparison-pair img')].every(i=>i.complete&&i.naturalWidth===${device})`,'same-size comparison assets');check(`comparison ${view} ${device}: both source PNGs have exact native dimensions`,await b.evaluate(`[...document.querySelectorAll('.comparison-pair img')].every(i=>i.naturalHeight===${device===1440?1000:844})`));
   }
  }
  await b.close();b=null;
 }
 check('supplemental browsers have no console errors',report.consoleErrors.length===0);
 const original=JSON.parse(fs.readFileSync(path.join(out,'freeze.json')));const status=cp.execFileSync('git',['status','--porcelain','-uall','-z'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}).split('\0').filter(Boolean);
 const unexpected=status.map(s=>s.slice(3).replaceAll('\\','/')).filter(p=>!p.startsWith('docs/layout-proposals/')&&!['PROGRESS.md','BLOCKED.md'].includes(p)&&!Object.hasOwn(original.files,p));
 check('no new files outside authorized scope',unexpected.length===0);report.unexpected=unexpected;
 report.passed=true;console.log(`SUPPLEMENTAL PASS ${report.checks.length} checks`);
}finally{if(b)await b.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'delivery-audit.json'),JSON.stringify(report,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
