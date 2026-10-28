const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const publicRoot=path.resolve(__dirname,'../../public');
async function serve(port=0, proposalRoot=__dirname) {
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mjs':'text/javascript','.woff2':'font/woff2','.mp3':'audio/mpeg'};
  const server=http.createServer((req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.includes('8_new_questions')) {res.writeHead(403).end();return;}
      if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      let base=proposalRoot, relative=pathname;
      if(pathname.startsWith('/original/')){base=publicRoot;relative=pathname.slice('/original'.length);}
      let file=path.resolve(base,'.'+relative);
      if(file!==base&&!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
      if(!fs.existsSync(file)&&base===proposalRoot){base=publicRoot;file=path.resolve(base,'.'+relative);}
      if(file!==base&&!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
      if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end('Not found');return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(file).pipe(res);
    }catch(e){res.writeHead(400).end(e.message);}
  });
  server.listen(port,'127.0.0.1');await once(server,'listening');
  return{server,url:`http://127.0.0.1:${server.address().port}/`};
}
module.exports={serve};
if(require.main===module)serve(Number(process.argv[2]||4001)).then(({url})=>console.log(`Layout proposals: ${url}`));
