# 三体主题本地交付

2026-09-22追加授权上传GitHub：交付分支为[三体主题开发分支](https://github.com/quarkbobo/quarkbobo.github.io/tree/codex/planet-interior-upgrade)，上传前复跑npm test为209通过、0失败、0跳过。以下“仅本地交付”描述保留为此前验收记录；本次上传不触发master的Pages部署。

## 沉浸版更新

[打开新版](http://127.0.0.1:4173/?theme=three-body&v=space-weather)。在舷窗右上角打开“观测控制”，可调整画面、轨道、参考点与空间天气；现有五镜头和经典主题切换仍可用。

- 三色恒星：金橙、冰蓝、珊瑚，配合白热核、日冕、较密星尘、低亮星云与舱框反光。配色来源及审美映射见 [ART-RESEARCH.md](ART-RESEARCH.md)。
- 画面参数：曝光、日冕耀斑、星尘密度、星云亮度、恒星展示倍率、尾迹辉光；画面选择会保存。引力软化长度和人为边界也可调整。
- 拉格朗日点：开关与三组恒星对；显示L1—L5及参考连线，采用瞬时两体圆轨道近似，不承诺四体系统中稳定。
- 碎冰带：64—256个受四体实际引力影响的无质量试验粒子，可调内外半径、倾角；开启“总览包含整个碎冰带”查看完整环带。单位为模型单位，不是太阳系比例。
- 随机空间天气：恒星耀斑、星尘风暴、行星极光；可调频率、强度或指定触发。事件只使用前台未暂停秒数，最多一个，后台不补发。它们为观测特效，不直接改变辐照或文明判定。极光可在跟随行星镜头观察。
- 额外修复：自然逃逸后仍可调整全局参数；切回约束前校验边界能否容纳天体；大模拟时钟下不会因浮点舍入误停；加号/向上滚轮为拉近镜头。

新版截图：[桌面](art-1440.png)、[手机与五参考点](art-390-lagrange.png)。原始三稿、上轮成品截图和录像继续保留。

| 新版复验 | 实测结果 / 证据 |
| --- | --- |
| `npm test` | 209通过、0失败、0跳过；art-final-npm.log |
| `node tools/verify-three-body.cjs` | 桌面104、手机102、减少动态84、无WebGL17，全通过；verification/2026-09-22T09-47-32-539Z/report.json |
| `node tools/verify-archive-a.cjs` | 25布局通过，控制台错误0；art-final-layout.log |
| 新观测层/参数/事件数值检查 | 共42项通过，其中原16项冻结断言保持原文；art-events-physics.log |
| `node docs/three-body/art-verify.cjs` | 最终复验6阶段41检查通过；art-evidence/2026-09-22T09-52-42-309Z/report.json |
| `node docs/three-body/events-verify.cjs` | 7阶段28登记检查通过，控制台错误0；events-evidence/2026-09-22T09-51-29-690Z/report.json |
| `node tools/verify-three-body.cjs --soak` | 第二轮真实600.090秒、141项通过，控制台/本站请求错误0；verification/2026-09-22T09-56-28-206Z/report.json |
| `node tools/verify-three-body.cjs --scope` | 最终872既有文件核验通过，只读改动0；原16物理检查通过，冻结SHA未变；verification/2026-09-22T10-09-30-592Z/report.json |

事件的三个实际效果、强度、频率、启停、主题隐藏冻结、死亡锁存、缩放方向及完整碎冰带取景均已验证。事件检查首轮把镜头选项误写为不存在的follow，修正为实际planet后完整通过，未修改生产或放宽断言；两轮报告保留。

本轮首个十分钟长跑在SwiftShader软件渲染、同期有其他短检查的条件下出现单帧长停顿（超过1.7067秒），10倍模拟触发固定积分预算保护并暂停；具体停顿来源未定位，该次不是通过。失败目录为 verification/2026-09-22T09-47-28-733Z，实际600.017秒，exit1。其他本任务的短检查退出后，未改生产代码或阈值，第二轮原样复跑600.090秒，exit0、141项通过。系统其他应用保持原样，结果不属于专用空载性能基准。

新版长测21次采样：帧数204→3420，首末跨度600.082秒，SwiftShader平均5.36fps，30秒区间3.34—16.39fps；这是软件渲染结果，不能代表RTX显卡表现，也不声称流畅60fps。GPU几何15、纹理1全程不变；每体尾迹采样最多125/512点、末次35点，所有采样逐点年龄≤8.05秒。JS heap首10,280,860、末33,460,512字节，采样范围5,116,156—37,716,268字节；如实保留增长和GC波动，不据此声称堆内存不增长。四体状态保持有限。

第590秒附近另经只读CDP抽查：运行未暂停、error=null；128带粒子位置/速度均有限且全部active，belt.error=null；事件历史保持8条，粒子池固定192。[补充快照](verification/2026-09-22T09-56-28-206Z/soak-extra-snapshot-590s.json)明确记录抽查口径，不是原冻结报告逐帧证明。新版实操录屏：[桌面](http://127.0.0.1:4173/__three-body/verification/2026-09-22T09-47-32-539Z/desktop-recording.html)、[手机](http://127.0.0.1:4173/__three-body/verification/2026-09-22T09-47-32-539Z/mobile-recording.html)。

红→绿证据：原受力反向注入exit1（3失败）→还原exit0（16通过），见fault-injection/red.log、green.log；本轮边界/大时钟回归先红后绿，见art-integration-red.log、art-integration-green.log。新增断言未放宽，冻结16项与验证器保持原SHA。下文为第一轮交付及历史验收原始记录，性能不混用。

## 预览与使用

- 成品：[三体观测站](http://127.0.0.1:4173/?theme=three-body)。顶部按钮切回经典外观，选择保存在本机浏览器。
- 三稿：[全景舷窗](http://127.0.0.1:4173/__three-body/drafts.html?design=panoramic)、[环形观测窗](http://127.0.0.1:4173/__three-body/drafts.html?design=ring)、[偏置科研舰桥](http://127.0.0.1:4173/__three-body/drafts.html?design=bridge)。选用全景舷窗；对照理由见 DESIGN.md。
- 实操录屏：[桌面](http://127.0.0.1:4173/__three-body/verification/2026-09-22T07-55-43-091Z/desktop-recording.html)、[手机](http://127.0.0.1:4173/__three-body/verification/2026-09-22T07-55-43-091Z/mobile-recording.html)。均为浏览器原始屏幕帧和真实时间轴。
- 最终截图：inspect-1440.png、inspect-390.png；drafts/ 内是六张构图草稿，verification/ 内含五镜头、公式、字体放大、文章、归档与降级截图。

预览服务若已停止，在项目根目录运行 `node docs/three-body/preview.cjs`。修改源码后先运行 `npm run build`。

“调整轨道”打开原生表单，选择天体后修改质量、光度、初值等并应用。仅改倍率不会回写陈旧位置。模式1有明确人为反射边界；模式2允许逃逸。五个镜头独立于物理，场景支持拖动、方向键与 +/- 缩放；手机纵向滑动保留正文滚动。

“三日凌空”预设用于观察真实环境触发的文明毁灭。死亡记录取模拟年份，调参和重置轨道不会复活；“新文明”才递增编号并解除死亡。单步为1/240模拟年。底部公式可以悬停、聚焦或点按。

## 实测命令

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | 183通过 / 0失败 / 0跳过（原167 + 新16） | baseline/final-node.log |
| `node tools/verify-archive-a.cjs` | 25布局通过 / 控制台错误0 | baseline/layout-after.log、layout-final.log |
| `node tools/verify-planet-explorer.cjs` | 桌面42、手机44、减少动态27、无WebGL23，通过 | baseline/legacy-explorer.log |
| `node tools/verify-three-body.cjs` | 范围、物理通过；桌面104、手机102、减少动态84、无WebGL17全部通过 | verification/2026-09-22T07-55-43-091Z/report.json |
| `node tools/verify-three-body.cjs --soak` | 真实600.024秒、141项通过、控制台/本站请求错误0 | verification/2026-09-22T07-56-43-223Z/report.json |
| `node tools/verify-three-body.cjs --scope` | 872既有文件核验，只读改动0，新增范围通过；物理16项通过 | verification/2026-09-22T08-06-27-500Z/report.json |
| `node docs/three-body/controller-regressions.cjs` | 4项通过；3种旧缺陷反向注入均被拒绝 | controller-regressions-report.json |
| `node docs/three-body/fault-check.cjs` | 受力反向：exit1、3项失败；还原：exit0、16项通过 | fault-injection/red.log、green.log |

反向注入只在本目录的独立副本操作，同一组冻结断言没有删除或放宽。新浏览器验收夹具曾修正选择器字符串和真实CDP输入的缺陷；原件、SHA及原因均保留在 VERIFICATION.md。旧测试完全未修改。

## 范围与模型

872个既有文件已经建立SHA-256基线。实际只修改 head/header/home 三个允许的模板和 planet-explorer 的场景生命周期接缝；新增实现、检查及证据均在白名单。历史未提交文章、题库和文档原样保留。没有增加依赖、后台或新框架；本轮只在本地运行。

采用三维四体牛顿引力和固定小步长Velocity-Verlet。展示球径与碰撞半径分开，世界坐标尾迹使用前台运行秒，8秒回收。二体基准及文明、碰撞阈值在 PLAN.md 冻结；实现接口见 CORE.md。

为支持持续观测，默认层级预设使用低质量伴星；混沌预设则使用相近质量的三恒星。它们均是可调教学初值，不宣称真实恒星参数。三日、过热、严寒阈值是玩法；不模拟日食、潮汐或完整气候。双日资料未取得原著权威原文，来源与适用范围见 SOURCES.md。

实际主机为 AMD Ryzen 9 8945HX、AMD Radeon 610M 与 NVIDIA RTX 5070 Laptop。验收浏览器由既有工具强制使用 ANGLE SwiftShader 软件WebGL；实测帧率不能当作该独显的性能。

## 十分钟耐久实测

证据：`verification/2026-09-22T07-56-43-223Z/soak-samples.json`。完成600.024真实秒，共21个采样点；首末样本间600.012秒。期间还运行了其他交付检查，以下是实际负载下的结果。

| 指标 | 实测 |
| --- | --- |
| 真实绘制帧数 | 452 → 16936，新增16484 |
| 软件渲染帧率 | 全程平均27.47fps；30秒区间13.00—35.82fps |
| 几何 / 纹理 | 始终11 / 1，无增长 |
| 四体尾迹 | 每体采样最大297点，容量512；末采样各109点 |
| 尾迹年龄 | 21次采样逐点检查全部≤8.05秒；未保存精确最大年龄，不虚报更多精度 |
| JS heap | 首5810888、末4719964字节；采样范围4719964—14788224字节，包含GC波动 |
| 模拟时间 | 125.4167 → 6125.5625年，四体位置/速度始终有限 |
| 浏览器错误 | consoleErrors=[]、networkErrors=[] |

这是软件WebGL耐久与资源上限的证据，不是硬件60fps结论。验收协议、冻结摘要与夹具修正记录均见 VERIFICATION.md。
