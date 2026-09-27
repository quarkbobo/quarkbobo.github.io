// Diagnostic only: temporary live-page style, no production edits.
const fs=require('node:fs'),path=require('node:path')
const {serve,launch}=require('../../tools/verify-planet-explorer.cjs')
const directory=path.join(__dirname,`perf-compositor-${new Date().toISOString().replace(/[:.]/g,'-')}`)
fs.mkdirSync(directory,{recursive:true})
const report={date:new Date().toISOString(),viewport:{width:1440,height:900},view:'station',method:'One continuously running production homepage; A/B/A with 3 consecutive 2.5-second windows per phase. B only adds will-change:transform to the canvas and body label spans. No simulation, particles, timing, or event setting changes. Software WebGL via existing launch helper.',consoleErrors:[],phases:[]}
const save=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n')
const metrics=r=>Object.fromEntries(r.metrics.map(m=>[m.name,m.value]))
;(async()=>{
  const {server,url}=await serve();let browser
  try{
    browser=await launch(report.viewport,report)
    await browser.send('Page.navigate',{url})
    await browser.until('window.threeBodySnapshot?.().renderer.available && threeBodySnapshot().realTime>1','homepage ready',30000)
    await browser.send('Performance.enable')
    report.userAgent=await browser.evaluate('navigator.userAgent')
    for(const phase of ['A1','B','A2']){
      await browser.evaluate(`(()=>{document.querySelector('#perf-layer-style')?.remove();if(${JSON.stringify(phase)}==='B'){const s=document.createElement('style');s.id='perf-layer-style';s.textContent='#three-body-canvas,.tb-body-labels span{will-change:transform}';document.head.append(s)}})()`)
      const result={phase,samples:[]};report.phases.push(result)
      for(let sample=0;sample<3;sample++){
        const before=metrics(await browser.send('Performance.getMetrics'))
        const value=await browser.evaluate(`(async()=>{const a=threeBodySnapshot(),start=performance.now();await new Promise(r=>setTimeout(r,2500));const elapsedMs=performance.now()-start,b=threeBodySnapshot();return{elapsedMs,frames:b.renderer.frames-a.renderer.frames,fps:(b.renderer.frames-a.renderer.frames)*1000/elapsedMs,simDelta:b.simTime-a.simTime,realDelta:b.realTime-a.realTime,realStart:a.realTime,realEnd:b.realTime,view:b.view,error:b.error,eventsBefore:a.effects,eventsAfter:b.effects,dimensions:{width:b.renderer.width,height:b.renderer.height},canvasWillChange:getComputedStyle(document.querySelector('#three-body-canvas')).willChange,labelWillChange:getComputedStyle(document.querySelector('.tb-body-labels span')).willChange}})()`)
        const after=metrics(await browser.send('Performance.getMetrics'))
        value.mainThread={scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,recalcStyleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,heapBytes:after.JSHeapUsedSize}
        result.samples.push(value);save()
      }
      result.fpsRange=[Math.min(...result.samples.map(s=>s.fps)),Math.max(...result.samples.map(s=>s.fps))]
      result.meanFps=result.samples.reduce((s,v)=>s+v.fps,0)/3;save()
      console.log(JSON.stringify({phase,fpsRange:result.fpsRange,meanFps:result.meanFps}))
    }
    await browser.evaluate("document.querySelector('#perf-layer-style')?.remove()")
    report.stylesRemoved=await browser.evaluate("!document.querySelector('#perf-layer-style')")
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));save()}
  console.log(JSON.stringify({output:directory,errors:report.consoleErrors}))
})().catch(error=>{report.error=error.stack;save();console.error(error);process.exitCode=1})
