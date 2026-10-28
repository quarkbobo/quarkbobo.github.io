# 星球动效优化验收

已完成：连续展开/推进、柔和云雾位移、收稳后标签淡入，保留进入2600ms、返回720ms。手机拖动后按钮漏响应已修复。

同一冻结探针、1440×1000、DPR1、隔离Chromium SwiftShader，连续三次结果中位数：

| 指标 | 优化前 | 最终 | 判定 |
| --- | ---: | ---: | --- |
| 进入P95帧间隔 | 132.2ms | 91.0ms | 降低31.2%，通过 |
| 进入平均帧率 | 17.0fps | 31.9fps | 通过 |
| 内部P95帧间隔 | 42.2ms | 29.2ms | 通过 |

该结果是软件渲染下的提交节奏，不能外推真实GPU或承诺恒定60fps。冷激活仍有初始化成本；桌面取证同步点击151.9ms，手机43.3ms，均较各自基线改善。

实际验收输出节选：

```text
$ npm test
ℹ tests 268
ℹ pass 268
ℹ fail 0
ℹ skipped 0

$ node tools/verify-planet-explorer.cjs
PASS desktop: 41 checks
PASS mobile: 43 checks
PASS reduced-motion: 26 checks
PASS webgl-disabled: 22 checks

$ node tools/verify-planet-transition.cjs --capture
PASS transition-desktop: 50 checks
PASS transition-mobile: 44 checks
PASS transition-reduced-motion: 6 checks
```

28个冻结验收文件SHA256未变；范围检查无越界改动。原始基线、三次性能、全部命令日志在[baseline](baseline/)和[final](final/)；新增检查的[故障注入失败](fault-injection/red.log)及[恢复通过](fault-injection/green.log)均已保存，注入只发生在报告目录副本中。

[打开前后关键帧对比](compare.html)：桌面/手机各9组，展开、穿云、抵达与返回均带相对时间。关键帧采用受控时间作视觉比较；真实性能探针没有改写RAF或performance.now。最终观感请在本地网站点击体验。

完整根因、过程中的失败与修正、单次诊断局限及范围核验方法见[PROGRESS.md](../../PROGRESS.md)。所有上一轮未提交成果已保留。
