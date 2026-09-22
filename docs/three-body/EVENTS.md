# 随机空间天气

`three-body-events.mjs`只安排视觉事件，不导入物理或文明模块。耀斑、尘埃和极光是观测画面的特殊效果，不改变引力、天体质量、碰撞、物理辐照或文明死亡规则，也不表示完整空间天气模拟。

## 接入

```js
const events = makeEvents(7301)
// 仅使用控制器已存在的前台未暂停运行秒数；无需 Date、额外定时器或模拟年。
advanceEvents(events, realTime, { enabled, frequency, intensity })
const effects = eventEffects(events, realTime, intensity)
// 手动替换当前事件：random / flare / dust / aurora。
triggerEvent(events, realTime, 'random')
```

- `frequency`允许0.25—3；默认首次等待8—14秒除以频率，每次效果持续6—10秒，结束后再等待20—45秒除以频率。始终最多一个活动特效。
- `intensity`允许0—2；渲染强度为`sin(π × age / duration) × intensity`，限制在0—2。`eventEffects`的默认强度是1，应显式传当前界面设置；此函数不修改状态或消耗随机数。
- `eventEffects`总是返回`{flare:{starId:null或'star-a/b/c',strength},dust,aurora}`。只有当前对应效果的强度非零；特效起点和终点为零。因此暂停状态下刚触发特效时，需继续运行才会从零渐入。
- 种子是无符号32位整数，默认7301。相同种子及相同调用顺序得到相同结果。模块不使用`Math.random`、`Date`、`setInterval`或墙上时钟。
- 状态含`seed`、`randomState`、`nextAt`、`active`与`history`，并记录内部的序号、上次时刻和设置。事件形状为`{id,type,starId,startedAt,duration}`；ID从1递增，`starId`随机为A/B/C之一。`history`最多保留最近8条真实开始的事件，反复渲染不会追加记录。

## 时钟和控制规则

控制器暂停、页面隐藏或观测窗离屏时，不增加`realTime`，事件相位及下一次时间随之冻结。倍率改变只影响模拟年，不影响这里的秒数。

关闭事件会立即清除活动特效，并将`nextAt`置空；重新开启从当前时钟安排新的首次等待。修改频率会重新安排将来的等待，正在进行的效果仍可自然结束。时钟回退（例如重置轨道）清除旧活动效果，并以当前时刻重新安排；保留的历史是此前确实触发过的观测记录。

若调用跨过了原定开始时刻至少10秒，即超过任何效果可能持续的时间，模块跳过错过的特效，从现在安排一个新等待，不补发、不为未播放事件写历史。每次调用最多检查和启动一次，没有补算循环。

手动`triggerEvent`立即替换活动事件并重排下一次等待，不会自行改动`enabled`设置。若界面允许关闭后手动预览，应先开启事件；否则下一次以`enabled:false`调用推进时会按关闭规则清除效果。

无效时间、种子、类型或设置抛出`RangeError`；参数先校验，失败不会消耗随机数或修改事件状态。控制器应沿用表单范围检查与错误提示。

## 验证

2026-09-22，新增测试在模块不存在时先执行：11项失败、0跳过；实现后相同测试11项通过、0失败、0跳过。覆盖确定性、首次与后续间隔、强度包络、单活动事件、启停与频率切换、时钟回退、长跳过期不补发、渲染幂等、历史上限和非法输入原子性。

执行：`node --test test/three-body-events.test.cjs`。
