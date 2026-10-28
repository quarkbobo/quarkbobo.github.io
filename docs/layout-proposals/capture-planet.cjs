const fs=require('node:fs');
const path=require('node:path');
const {serve,launch}=require('../../tools/verify-planet-explorer.cjs');
(async()=>{
  const {server,url}=await serve();let browser;const result={consoleErrors:[]};
  try {
    browser=await launch({width:1440,height:1000,reducedMotion:true},result);
    await browser.send('Page.navigate',{url});
    await browser.until(`document.querySelector('.planet-webgl-ready') && document.readyState==='complete'`,'original planet');
    const canvasBounds=await browser.evaluate(`(()=>{const r=document.querySelector('#planet-webgl').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    // The copy slightly overlaps the canvas in the original composition. Hide only
    // that foreground DOM in this disposable browser so the real planet is unobscured.
    await browser.evaluate(`document.querySelector('.home-hero__copy').style.visibility='hidden'`);
    // Capture the visible planet and complete ring, within the inspected canvas; no image editing.
    const clip={x:522,y:300,width:762,height:480,scale:1};
    const shot=await browser.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
    fs.mkdirSync(path.join(__dirname,'assets'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'assets/planet.png'),Buffer.from(shot.data,'base64'));
    fs.writeFileSync(path.join(__dirname,'assets/planet-source.json'),JSON.stringify({source:'public/index.html at commit 25e6650',selector:'#planet-webgl',method:'Original browser screenshot region showing the complete planet and ring. Overlapping home-copy DOM temporarily hidden only in the disposable capture browser; original canvas, shaders and camera unchanged. No generated or edited imagery; source files untouched.',viewport:[1440,1000],canvasBounds,clip,...result},null,2));
    console.log(JSON.stringify({clip,errors:result.consoleErrors}));
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
