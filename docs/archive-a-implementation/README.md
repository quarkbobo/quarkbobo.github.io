# A 深空档案馆 · 已落实到本地站点

2026-09-09用户在A预览页选择“A”，进入实施阶段。此前只读探索阶段已结束；本轮修改主题，未提交、推送或部署。

## 改动

- 首页为A构图：真实可交互星球、最近2篇、作者3组主题目录与全部6文。保留原品牌、文章摘要、href/id、更新说明和NEW运行时。
- 导航标示当前首页/归档。无目录正文居中760px，标题缩至46px；有目录仍为桌面右侧sticky、手机原生details。
- 归档保留7条真实记录，按2026/2025分组。游戏仍为4条原链接，仅增加整卡布局；原文开头不可见的零宽缩进在渲染时移除，避免成为空白网格单元，源文章不变。
- 新archive-a.css只负责页面布局；未改planet JS、模型、dialog和flight CSS。移动备用星球改为完整居中，同步将原来“右缘必须超出画面”的旧测试改为“两侧均在画面内”，其余模型比例/角度/交互断言不变。

## 验证

最终日志为下列文件，之前失败日志保留作历史：

```text
tests-pass.log: 271 tests, 271 pass, 0 fail, 0 skipped
explorer-pass.log: desktop41 + mobile43 + reduced26 + webgl-disabled22 PASS
transition-pass.log: desktop50 + mobile44 + reduced6 PASS
layout-pass.log: 25 live-page layouts PASS, console errors0
protected-files.json: 78 protected files, changed=[]
```

25布局场景覆盖首页、两种文章、归档、游戏×1440/390/320/768和390下200%字号，检查真实视口、横向裁切、居中阅读栏；截图已人工查看。对比原站：桌面最近记录Y1001→683、手机732→663；V4正文桌面Y543.5→303.4、手机354.2→277。最终真实站点没有原型方案工具条。

真实WebGL检查保留首次进入、再次进入、返回、触屏、减少动态和无WebGL替代；100项衔接检查通过。这不是新的性能基准，不声称所有设备恒定60fps。

78项保护包括全部source、星球JS与已有flight/dialog CSS、配置、package依赖与CI；两个题库无变化。git diff --check无错误。另有3个新增文件：主题CSS、布局回归测试、真实浏览器布局探针，均未提交。

本地真实站点：http://127.0.0.1:4000/ 。原方案仍在4001；线上网站未改变。
