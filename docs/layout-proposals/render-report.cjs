const fs=require('node:fs'),path=require('node:path');
const marked=require('marked');
const source=fs.readFileSync(path.join(__dirname,'README.md'),'utf8');
let html=marked.parse(source);
html=html.replace(/<code>([^<]+\.(?:html|json|log|md))<\/code>/g,(all,file)=>fs.existsSync(path.join(__dirname,file))?`<a href="${file}">${file}</a>`:all);
fs.writeFileSync(path.join(__dirname,'REPORT.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>布局结论与验证记录</title><link rel="stylesheet" href="styles.css"><style>.report-content{overflow-wrap:anywhere}.report-content h3{margin-top:2rem}.report-content code{font-size:.85em;white-space:normal}.report-content table{width:100%;table-layout:fixed}.report-content td{overflow-wrap:anywhere}.report-content a{display:inline;min-height:0}.report-content nav a{display:inline-flex;min-height:44px;align-items:center;margin-right:2rem}.report-content ol{list-style:decimal;padding-left:1.3rem}</style></head><body><a class="skip" href="#main">跳到正文</a><main id="main" class="wrap report-content"><nav aria-label="方案导航"><a href="index.html">方案入口</a><a href="compare.html">同尺寸对比</a></nav>${html}</main></body></html>`);
console.log('Rendered REPORT.html from README.md');
