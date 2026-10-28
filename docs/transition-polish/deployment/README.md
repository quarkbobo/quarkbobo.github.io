# 发布记录 · 2026-09-08

用户在动效优化验收后明确授权部署。本次将18个相关源码、模板、依赖锁文件、复制脚本及测试文件提交为 `25e6650db51499c285f1e8083a5a514ed41f3fab`，以正常快进推送到 `origin/master`。本地master也已快进到相同提交；当前工作分支保留。未提交public、取证目录或两个无关题库文件；两个题库SHA256与任务前相同。

正式发布工作流：[Deploy Hexo site to Pages / 34214565532](https://github.com/quarkbobo/quarkbobo.github.io/actions/runs/34214565532)，build及deploy成功；CI依赖安装、Hexo构建、Node测试、资源上传全部成功。部署记录6325437179的状态success，environment_url为 https://quarkbobo.github.io/ 。原始API记录见github-status.json。

本地发布前复测268通过、0失败、0跳过，见local-tests.log。
线上首页、3个mjs、CSS、Three的2个模块与LICENSE均HTTP 200；7个资源文本归一化CRLF后SHA256与本次本地源码一致；MJS以text/javascript返回，见live-resources.json。

```text
PASS live 1440x1000: WebGL homepage, entry, 3 stations, return; unexpected console errors 0; existing favicon 404: 1
PASS live 390x844: WebGL homepage, entry, 3 stations, return; unexpected console errors 0; existing favicon 404: 1
```

线上浏览器烟雾检查首次因favicon.ico 404失败，原始输出保留在live-browser.log。核查前一发布提交9f2da40及现有模板，原站无favicon文件或声明；本地冻结测试服务器对该请求返回204，所以此前没有暴露。仅将这一明确的既有静态资源404单独记录，仍对所有其他控制台错误断言失败；所有真实WebGL、进入、三个节点和返回断言保留不变。复测见live-browser-recheck.log及live-browser.json，截图live-1440.png和live-390.png。

发布边界：
- 项目_config.yml里的quark567.patrickliucloud.top在本机HTTPS检查时连接中断，尚未验证通过；没有更改DNS、域名或证书。真实Pages部署地址由GitHub部署记录确认为quarkbobo.github.io。
- 仓库既有的另一个“pages build and deployment”Jekyll自动工作流仍失败；此前提交9f2da40也同样失败。本次正式Hexo工作流已成功，线上文件指纹与新提交一致，没有把旧工作流失败冒充发布成功。
- gh CLI凭据返回401，但现有SSH推送成功；以公开GitHub API核验发布，未读取或更改凭据。
