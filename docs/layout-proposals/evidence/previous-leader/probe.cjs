const fs = require('node:fs')
const path = require('node:path')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
const out = __dirname
const results = []
const metrics = `(() => {
  const rect = element => { if (!element) return null; const r=element.getBoundingClientRect(); const s=getComputedStyle(element); return {x:r.x,y:r.y,documentY:r.y+scrollY,width:r.width,height:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight,gap:s.gap,text:element.innerText?.trim().slice(0,120)} };
  return {title:document.title,url:location.pathname,viewport:[innerWidth,innerHeight],pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,scrollY,
    parts:Object.fromEntries(['.site-header','.site-brand','.home-hero','.hero-actions','#latest-posts','.catalogue-section','.article-layout','.article-header','.article-header h1','.article-body','.article-toc','.article-toc-disclosure','.archive-shell','.archive-list','.site-footer'].map(s=>[s,rect(document.querySelector(s))])),
    cards:[...document.querySelectorAll('.post-card')].map(rect),
    links:[...document.querySelectorAll('.site-nav a,.post-card h3 a,.archive-list a,.catalogue-content a')].map(a=>({text:a.innerText,href:a.getAttribute('href'),current:a.getAttribute('aria-current')}))}
})()`
;(async () => {
  const { server, url } = await serve()
  try {
    for (const size of [{width:1440,height:1000},{width:390,height:844}]) {
      const run={size,consoleErrors:[],pages:[]}; let browser
      try {
        browser=await launch({...size,reducedMotion:true},run)
        const capture = async name => {
          const data=await browser.evaluate(metrics); run.pages.push({name,...data})
          const screenshot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
          fs.writeFileSync(path.join(out,`${size.width}-${name}.png`),Buffer.from(screenshot.data,'base64'))
        }
        await browser.send('Page.navigate',{url})
        await browser.until(`document.readyState==='complete' && document.querySelector('.planet-webgl-ready')`,'homepage ready',15000)
        await capture('home')
        const links=await browser.evaluate(`[...document.querySelectorAll('.post-card h3 a')].map(a=>({text:a.innerText,url:a.href}))`)
        for (const [selector,name] of [['#latest-posts','latest'],['.catalogue-section','catalogue']]) {
          await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'}); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
          await capture(name)
        }
        const routes=[{name:'archive',url:new URL('archives/',url).href},...[
          ['article',links.find(a=>a.text.includes('V4'))],['games',links.find(a=>a.text==='游戏合集')]
        ].map(([name,item])=>({name,url:item.url}))]
        for(const route of routes) {
          await browser.send('Page.navigate',{url:route.url})
          await browser.until(`document.readyState==='complete'`,'page loaded',15000)
          await capture(route.name)
        }
        results.push(run)
        console.log(`Captured ${run.pages.length} views at ${size.width}x${size.height}; errors ${run.consoleErrors.length}`)
      } finally {if(browser)await browser.close()}
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2))
  } finally {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1})
