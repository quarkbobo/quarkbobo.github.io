# 三体主题独立验收

本协议在生产实现前冻结。验证通过真实 CDP 输入操作控件，读取真实物理状态和真实 Three.js renderer；不在测试中设置生产模拟状态，不替换轨迹，不用文字出现冒充行为通过。

## 入口

先生成 `public/`，再运行：

```powershell
node tools/verify-three-body.cjs
node tools/verify-three-body.cjs --browser
node tools/verify-three-body.cjs --soak
```

默认检查冻结 SHA-256、授权新增范围、`node --test test/three-body-core.test.cjs` 及四组浏览器场景。`--browser` 不重复物理测试；`--soak` 用真实600秒长跑替代四组短场景；二者仍检查只读范围。浏览器复用原有 `tools/verify-planet-explorer.cjs` 的 `serve/launch`，不修改旧工具或旧测试，不新增依赖。

每次证据独立保存在 `docs/three-body/verification/<UTC时间>/`。`report.json` 记录每条断言、异常、网络错误和失败时快照；PNG用于人工版式检查；`*-recording.html` 回放 CDP `Page.startScreencast` 原始JPEG帧，保留实际时间轴。不是合成演示视频。

## 固定 DOM 协议

- `#three-body-toggle` 全站主题开关，支持键盘和持久化；`?theme=three-body` 可以直接预览。
- `#three-body-observatory` 为主题区域，`#three-body-canvas` 是实际 WebGL canvas。
- `#tb-mode`: `1/2`；`#tb-view`: `station/star-a/star-b/star-c/planet`。
- `#tb-preset`: `balanced/chaotic/triple`；`#tb-body`: `star-a/star-b/star-c/planet`。
- `#tb-pause/#tb-step/#tb-reset/#tb-new` 为按钮。单步=1/240年；重置不解锁死亡；新文明才解锁并编号+1。
- `details#tb-parameters` 默认收起；数字输入 `#tb-mass/#tb-luminosity/#tb-x/#tb-y/#tb-z/#tb-vx/#tb-vy/#tb-vz/#tb-g/#tb-speed`；`#tb-apply` 提交。
- 公式按钮 `[data-force="gravity|acceleration|radiation"]`；`#tb-status` 文明状态；`#tb-message` 输入或降级说明。

## 只读诊断协议

`window.threeBodySnapshot()` 每次返回真实状态的副本：

```js
{
  active, paused, mode, view, preset, G, speed, simTime, realTime, forceMode,
  bodies: [{ id, mass, luminosity, position: [x,y,z], velocity: [vx,vy,vz],
             trail: [{ time, position: [x,y,z] }] }],
  civilization: { state, dead, number, events: [{ type, time, year, cause, number }] },
  renderer: { available, frames, geometries, textures,
              camera: { position: [x,y,z], quaternion: [x,y,z,w] } }
}
```

`simTime` 为模拟年；`realTime` 为前台未暂停的实际活动秒，尾迹 `time` 使用同一时钟。`frames` 只计实际 `renderer.render`，资源数来自 `renderer.info.memory`，相机数值来自实际相机对象。死亡事件类型为 `death`。非首页仍有 `active` 主题偏好，但 `renderer.available=false`，不创建观测场景。

## 冻结检查

1. 1440×900、390×844；键盘进入、真实触摸拖动、200%字体无横向溢出；原首页、归档、文章保留可读可访问。
2. 五镜头实际相机变换各不同；两个模式进入求解器；参数质量、光度、位置、速度、G、倍率实际生效；负质量不能进入求解器。
3. 单步确实移动四个三维天体；所有数值有限。暂停同时冻结物理时间、尾迹时钟及独立拦截计数的WebGL draw；隐藏主题停止模拟。
4. 10倍速度运行至少9.3秒后，每体尾迹仍以真实8秒衰减，容量≤512，样本不是瞬间清空；暂停不增加或老化尾迹。
5. 三日预设通过实际运行触发死亡；当前文明恰好一条死亡记录；持续运行不重复；重置仍死亡；新文明编号增加并解除死亡。
6. reduce 默认暂停；禁WebGL真实降级，保留说明及内容导航；本站请求失败和所有console错误为0（不豁免Three.js异常）。
7. 长跑先预热镜头与三种力图，再真实600秒每30秒取样；四体数值、尾迹持续验证，geometry/texture首末不增长，每段实际绘制继续。记录JS heap与帧数，不捏造60FPS门槛，不将GC波动误判为泄漏。

物理能量、三维受力、边界、扫掠碰撞、文明滞回等严格数值检查由冻结的 `test/three-body-core.test.cjs` 执行，阈值来自 `PLAN.md`。浏览器截图仍需人工查看遮挡、视觉质量和可读性；自动化通过不能代替视觉审查。

任何实现与协议差异先讨论。不能为了让现有实现变绿而删除断言、改变数值阈值或编辑旧测试。首轮红灯和后续每轮修复证据均保留。

## 首轮红灯

2026-09-22：`node --check tools/verify-three-body.cjs` 退出0；默认验收退出1。只读SHA与新增范围通过；物理模块尚未实现；四个浏览器场景均在全站主题开关不存在处失败。证据：`verification/2026-09-22T07-35-52-159Z/report.json`。随后仅加严隐藏场景（从运行状态隐藏再验证冻结），并给异步相机绘制增加100ms等待。

## 夹具执行修正（不改变标准）

首次集成证据 `verification/2026-09-22T07-47-27-071Z/report.json`：只读与物理通过；三个浏览器在选择器字符串的二次求值处出现SyntaxError；桌面可通过Tab聚焦开关，但Enter未触发点击。独立CDP事件记录证实，缺少 `text: '\r'` 的Enter只有keydown/keyup，补充后产生原生click并成功激活主题，生产代码无须键盘补丁。

经根代理确认，仅将两处CSS属性选择器改为等价的无引号写法，并为Enter keyDown补充 `text/unmodifiedText`；所有断言、阈值、场景和跳过条件不变。`node --check` 只能检查脚本本身，无法发现运行时传给Runtime.evaluate的字符串语法错误。

- 原冻结SHA-256：`FA5A4EB5951EF1C9971CBB097000338FC2F26618AFE1A21753AA45D65A17ECC0`。
- 原件存档：`verification/verify-three-body-frozen-v1.cjs`。
- 修正后SHA-256：`7EFCE7A69E7845EC0A7DB66C60D3350AE434C68E632D41945249460BFE9DD853`。

第二次夹具修正：集成记录 `verification/2026-09-22T07-50-31-259Z/report.json` 中，desktop/mobile 已通过参数真实写入，但尾迹测试的预设恢复操作选择了本来就选中的balanced，浏览器原生select不会为同值产生change。失败快照仍保留编辑后的星A质量1.7，随后轨道碰撞自动停止；这不能验证预设尾迹寿命。经根代理确认，恢复预设时先通过真实输入选择chaotic，再选择balanced，确保触发正常change。所有断言与阈值不变。

- v2存档：`verification/verify-three-body-frozen-v2.cjs`，SHA-256 `7EFCE7A69E7845EC0A7DB66C60D3350AE434C68E632D41945249460BFE9DD853`。
- v3当前SHA-256：`DDA1ED3511787F93804B0F1DB3E8958565DBBFC5ACF800E512FE84E3276B918B`。
- 同轮独立生产缺陷：390px+200%字体时 `.tb-equations` 的公式溢出；禁WebGL时旧星球初始化记录3条Three.js错误。保留报告与失败截图，生产修复后整套重跑。

## 最终实测结果

冻结v3入口未再修改。默认验收于 `verification/2026-09-22T07-55-43-091Z/report.json` 全部通过（exit0）：范围及物理通过，桌面104项、手机102项、减少动态84项、禁WebGL17项。桌面录屏104帧/13.845秒，手机154帧/13.865秒；帧索引指向的JPEG全部存在。

十分钟长跑证据 `verification/2026-09-22T07-56-43-223Z/report.json` 与 `soak-samples.json`：exit0、141项检查通过。实际运行600024ms，首末样本间600012ms；真实绘制452→16936，新增16484帧。此测试使用SwiftShader软件WebGL，全程平均27.47FPS，30秒区间12.999—35.819FPS，不代表硬件GPU性能。

21次采样的几何数始终11、纹理数始终1；每体尾迹数量最大均297（上限512），末样本各109。每次均遍历全部尾迹点验证年龄≤8.05秒；精确年龄最大值未存入样本文件，因此不声称测得精确最大值。JS heap首5810888、末4719964、范围4719964—14788224字节，作为GC环境下的观测数据，不设置堆内存硬阈值。本站网络错误与控制台错误均为0。
