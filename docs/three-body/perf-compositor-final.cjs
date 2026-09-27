// Final production CSS verification. A explicitly overrides will-change:auto;
// B removes the override and measures the production transform declaration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {createHash}=require('node:crypto')
const {serve,launch}=require('../../tools/verify-planet-explorer.cjs')
const root=path.resolve(__dirname,'../..')
const directory=path.join(__dirname,`perf-compositor-final-${new Date().toISOString().replace(/[:.]/g,'-')}`)
fs.mkdirSync(directory,{recursive:true})
const hash=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
const report={date:new Date().toISOString(),method:'Final production CSS: same-browser continuously running homepage A/B/A at each viewport, station view, 3 consecutive 2.5-second windows per phase. A injects auto!important; B removes the override and uses real production CSS. No physics, timestep, particle, or event changes. Isolated headless SwiftShader, DPR 1.',assets:['js/three-body-scene.mjs','js/three-body.mjs','css/three-body.css'].map(p=>({path:p,source:hash('themes/fluid-particle/source/'+p),generated:hash('public/'+p)})),cases:[]}
for(const a of report.assets)assert.equal(a.source,a.generated,'Source/public mismatch: '+a.path)
const save=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n')
const metrics=r=>Object.fromEntries(r.metrics.map(m=>[m.name,m.value]))
;(async()=>{
  const {server,url}=await serve()
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const result={viewport,view:'station',consoleErrors:[],phases:[]};report.cases.push(result)
      const browser=await launch(viewport,result)
      try{
        await browser.send('Page.navigate',{url})
        await browser.until('window.threeBodySnapshot?.().renderer.available && threeBodySnapshot().realTime>1','homepage ready',30000)
        await browser.send('Performance.enable')
        result.userAgent=await browser.evaluate('navigator.userAgent')
        for(const phase of ['A1','B','A2']){
          await browser.evaluate(`(()=>{document.querySelector('#perf-layer-style')?.remove();if(${JSON.stringify(phase)}!=='B'){const s=document.createElement('style');s.id='perf-layer-style';s.textContent='#three-body-canvas,.tb-body-labels span{will-change:auto!important}';document.head.append(s)}})()`)
          const current={phase,samples:[]};result.phases.push(current)
          for(let sample=0;sample<3;sample++){
            const before=metrics(await browser.send('Performance.getMetrics'))
            const value=await browser.evaluate(`(async()=>{const a=threeBodySnapshot(),start=performance.now();await new Promise(r=>setTimeout(r,2500));const elapsedMs=performance.now()-start,b=threeBodySnapshot();return{elapsedMs,frames:b.renderer.frames-a.renderer.frames,fps:(b.renderer.frames-a.renderer.frames)*1000/elapsedMs,simDelta:b.simTime-a.simTime,realDelta:b.realTime-a.realTime,realStart:a.realTime,realEnd:b.realTime,view:b.view,error:b.error,eventsBefore:a.effects,eventsAfter:b.effects,dimensions:{width:b.renderer.width,height:b.renderer.height},canvasWillChange:getComputedStyle(document.querySelector('#three-body-canvas')).willChange,labelWillChange:getComputedStyle(document.querySelector('.tb-body-labels span')).willChange}})()`)
            assert.equal(value.canvasWillChange,phase==='B'?'transform':'auto')
            assert.equal(value.labelWillChange,phase==='B'?'transform':'auto')
            assert.equal(value.view,'station');assert.equal(value.error,null)
            const after=metrics(await browser.send('Performance.getMetrics'))
            value.mainThread={scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,recalcStyleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,heapBytes:after.JSHeapUsedSize}
            current.samples.push(value);save()
          }
          current.fpsRange=[Math.min(...current.samples.map(s=>s.fps)),Math.max(...current.samples.map(s=>s.fps))]
          current.meanFps=current.samples.reduce((s,v)=>s+v.fps,0)/3;save()
          console.log(JSON.stringify({width:viewport.width,phase,fpsRange:current.fpsRange,meanFps:current.meanFps}))
          if(phase==='B'){
            const screenshot=await browser.send('Page.captureScreenshot',{format:'png'})
            result.productionScreenshot=`production-${viewport.width}.png`
            fs.writeFileSync(path.join(directory,result.productionScreenshot),Buffer.from(screenshot.data,'base64'));save()
          }
        }
        await browser.evaluate("document.querySelector('#perf-layer-style')?.remove()")
        result.productionStylesRestored=await browser.evaluate("!document.querySelector('#perf-layer-style')&&getComputedStyle(document.querySelector('#three-body-canvas')).willChange==='transform'&&getComputedStyle(document.querySelector('.tb-body-labels span')).willChange==='transform'")
        assert.equal(result.productionStylesRestored,true)
      }finally{await browser.close();save()}
    }
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));save()}
  console.log(JSON.stringify({output:directory,errors:report.cases.map(c=>c.consoleErrors)}))
})().catch(error=>{report.error=error.stack;save();console.error(error);process.exitCode=1})
