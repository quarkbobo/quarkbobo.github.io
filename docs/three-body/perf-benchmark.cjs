// Reproduce: node docs/three-body/perf-benchmark.cjs baseline|after
// Runs sequentially with the existing isolated headless SwiftShader helper.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict')
const {execFileSync}=require('node:child_process')
const {createHash}=require('node:crypto')
const {serve,launch}=require('../../tools/verify-planet-explorer.cjs')
const root=path.resolve(__dirname,'../..'),label=process.argv[2]||'baseline'
const baseline=label.startsWith('baseline')
assert.match(label,/^[a-z0-9-]+$/)
const directory=path.join(__dirname,`perf-${label}-${new Date().toISOString().replace(/[:.]/g,'-')}`)
fs.mkdirSync(directory,{recursive:true})
const hash=filename=>createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
const names=['three-body.mjs','three-body-scene.mjs','three-body-core.mjs','three-body-overlays.mjs','three-body-events.mjs']
const assets=names.map(name=>({name,source:hash(path.join(root,'themes/fluid-particle/source/js',name)),public:hash(path.join(root,'public/js',name))}))
for(const a of assets)if(!(baseline&&a.name==='three-body-scene.mjs'))assert.equal(a.source,a.public,`Build mismatch for ${a.name}`)
const report={label,date:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),assets,servedSceneHash:baseline?hash(path.join(__dirname,'perf-baseline-scene.mjs')):assets.find(a=>a.name==='three-body-scene.mjs').public,hardware:{platform:process.platform,release:os.release(),cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length},method:{backend:'Existing launch helper: headless Chromium --use-angle=swiftshader, DPR 1. Software WebGL is CPU-backed, not hardware-GPU performance.',fixedScene:'Production createScene; fixed state after four real simulation years at DT=1/240; 128 physically integrated belt particles; trails sampled at 60 Hz. No mocked core or increased integration step. Baseline labels serve the preserved unmodified baseline scene module.',renderSamples:'Each view: 12 warm frames, 2 sequential batches of 24 RAF frames. submitMs measures render CPU/command submission; completeMs includes gl.finish plus a one-pixel readPixels to force command completion. It includes synchronization overhead and is not a hardware GPU timer.',homepage:'3 sequential 2.5-second normal-running windows per view; actual scene-frame deltas and independent RAF interval distribution; no gl.finish in homepage.',screenshots:'Taken after measured samples; excluded from timing.'},cases:[]}
const save=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n')
const summarize=values=>{const s=[...values].sort((a,b)=>a-b);return{n:s.length,min:s[0],median:s[Math.floor(s.length/2)],p95:s[Math.floor((s.length-1)*.95)],max:s.at(-1),mean:s.reduce((a,b)=>a+b,0)/s.length}}
const metricMap=response=>Object.fromEntries(response.metrics.map(m=>[m.name,m.value]))
;(async()=>{
  const {server,url}=await serve()
  const handler=server.listeners('request')[0]
  server.removeAllListeners('request')
  server.on('request',(req,res)=>{
    if(new URL(req.url,url).pathname==='/perf-scene.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(path.join(__dirname,'perf-scene.html')).pipe(res)}
    else if(baseline&&new URL(req.url,url).pathname==='/js/three-body-scene.mjs'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});fs.createReadStream(path.join(__dirname,'perf-baseline-scene.mjs')).pipe(res)}
    else handler(req,res)
  })
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const errors={consoleErrors:[]},browser=await launch(viewport,errors)
      const entry={viewport,...errors,fixed:[],homepage:[]};report.cases.push(entry);save()
      try{
        await browser.send('Page.navigate',{url:url+'perf-scene.html'})
        await browser.until('window.perfReady','fixed scene ready',30000)
        entry.hardware=await browser.evaluate('perfScene.hardware')
        entry.physics=await browser.evaluate('perfScene.physicsSample()')
        for(const view of ['station','planet','star-a']){
          const setup=await browser.evaluate(`perfScene.setView(${JSON.stringify(view)})`)
          const samples=[]
          for(let i=0;i<2;i++)samples.push(await browser.evaluate('perfScene.sample(24)'))
          const png=await browser.send('Page.captureScreenshot',{format:'png'})
          const screenshot=`fixed-${viewport.width}-${view}.png`;fs.writeFileSync(path.join(directory,screenshot),Buffer.from(png.data,'base64'))
          const value={view,setup,samples,screenshot,completeMs:summarize(samples.flatMap(s=>s.raw.completed)),submitMs:summarize(samples.flatMap(s=>s.raw.submit))};entry.fixed.push(value);save()
          console.log(JSON.stringify({phase:'fixed',width:viewport.width,view,completeMs:value.completeMs,submitMs:value.submitMs}))
        }
        await browser.send('Page.navigate',{url})
        await browser.until('window.threeBodySnapshot?.().renderer.available && threeBodySnapshot().realTime>1','homepage ready',30000)
        await browser.send('Performance.enable')
        for(const view of ['station','planet','star-a']){
          await browser.evaluate(`document.querySelector('#tb-view').value=${JSON.stringify(view)};document.querySelector('#tb-view').dispatchEvent(new Event('change'))`)
          const samples=[]
          for(let i=0;i<3;i++){
            const before=metricMap(await browser.send('Performance.getMetrics'))
            const sample=await browser.evaluate(`(async()=>{const state=threeBodySnapshot();const began=performance.now();let previous=null,frames=[];await new Promise(resolve=>{const capture=t=>{if(previous!==null)frames.push(t-previous);previous=t;if(performance.now()-began>=2500)resolve();else requestAnimationFrame(capture)};requestAnimationFrame(capture)});const ended=performance.now(),after=threeBodySnapshot();return{elapsedMs:ended-began,actualRenderFrames:after.renderer.frames-state.renderer.frames,renderFps:(after.renderer.frames-state.renderer.frames)*1000/(ended-began),intervals:frames,simDelta:after.simTime-state.simTime,runningDelta:after.realTime-state.realTime,error:after.error,renderer:after.renderer,viewport:{innerWidth,innerHeight},oldWebgl:window.__planetQA.webgl}})()`)
            const after=metricMap(await browser.send('Performance.getMetrics'))
            sample.mainThread={scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,heapBytes:after.JSHeapUsedSize}
            sample.rafIntervalMs=summarize(sample.intervals);samples.push(sample)
          }
          entry.homepage.push({view,samples,fpsRange:[Math.min(...samples.map(s=>s.renderFps)),Math.max(...samples.map(s=>s.renderFps))]});save()
          console.log(JSON.stringify({phase:'homepage',width:viewport.width,view,fps:entry.homepage.at(-1).fpsRange,errors:samples.map(s=>s.error)}))
        }
        await browser.evaluate("if(!threeBodySnapshot().paused)document.querySelector('#tb-pause').click()")
        const png=await browser.send('Page.captureScreenshot',{format:'png'})
        fs.writeFileSync(path.join(directory,`homepage-${viewport.width}.png`),Buffer.from(png.data,'base64'));save()
      }finally{await browser.close();save()}
    }
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));save()}
  console.log(JSON.stringify({output:directory,consoleErrors:report.cases.map(c=>c.consoleErrors)}))
})().catch(error=>{report.error=error.stack;save();console.error(error);process.exitCode=1})
