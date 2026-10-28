const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'evidence');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
fs.mkdirSync(out, {recursive:true});
if (process.argv[2] === 'freeze') {
  if (fs.existsSync(path.join(out,'freeze.json'))) throw Error('Baseline already exists; do not overwrite');
  const files = new Set(cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean));
  for(const dir of ['source','themes','test','tools','.github','docs']) for(const p of walk(path.join(root,dir))) {
    const rel=path.relative(root,p).replaceAll('\\','/');
    if(!rel.startsWith('docs/layout-proposals/')) files.add(rel);
  }
  files.add('.superpowers/layout-leader/probe.cjs');
  const prefixes=Object.fromEntries(['PROGRESS.md','BLOCKED.md'].map(p=>{const b=fs.readFileSync(path.join(root,p));return[p,{bytes:b.length,sha256:hash(b)}]}));
  const manifest={head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),date:new Date().toISOString(),prefixes,files:Object.fromEntries([...files].sort().map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]))};
  fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(out,'git-before.txt'),cp.execFileSync('git',['status','--short'],{cwd:root}));
  fs.cpSync(path.join(root,'.superpowers/layout-leader'),path.join(out,'previous-leader'),{recursive:true});
  console.log(`FROZEN ${files.size} files; prior evidence backed up; progress prefixes recorded.`);
} else if (process.argv[2] === 'verify') {
  const m=JSON.parse(fs.readFileSync(path.join(out,'freeze.json')));
  const changed=Object.entries(m.files).filter(([p,h])=>!fs.existsSync(path.join(root,p))||hash(fs.readFileSync(path.join(root,p)))!==h).map(([p])=>p);
  const prefixes=Object.entries(m.prefixes).every(([p,v])=>hash(fs.readFileSync(path.join(root,p)).subarray(0,v.bytes))===v.sha256);
  const diff=cp.execFileSync('git',['diff','HEAD','--stat'],{cwd:root,encoding:'utf8'});
  const report={filesChecked:Object.keys(m.files).length,changed,progressHistoryPreserved:prefixes,productionDiff:diff,headUnchanged:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()===m.head};
  fs.writeFileSync(path.join(out,'freeze-final.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(changed.length||!prefixes||diff||!report.headUnchanged)process.exitCode=1;
} else if(process.argv[2]==='baseline') {
  for(const [name,cmd,args] of [['node-tests','npm.cmd',['test']],['original-probe',process.execPath,['.superpowers/layout-leader/probe.cjs']]]) {
    const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',shell:cmd==='npm.cmd',timeout:300000});
    fs.writeFileSync(path.join(out,name+'.log'),r.stdout+'\n'+r.stderr);
    console.log(`${name}: exit ${r.status}\n${r.stdout.slice(-650)}`);
    if(r.status!==0)throw Error(name+' failed');
  }
  fs.cpSync(path.join(root,'.superpowers/layout-leader'),path.join(out,'baseline'),{recursive:true});
}
