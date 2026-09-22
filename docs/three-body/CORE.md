# 物理与文明接口

状态不依赖 DOM、Three.js、镜头或真实时钟。模拟单位为年，控制器负责将运行秒乘倍率传给 `step`；物理核不会再次乘倍率。

## 固定 API

- `makeSystem(preset='balanced')`：返回独立可复现状态；preset 支持 `balanced`、`chaotic`、`triple`。body ID 顺序固定 `star-a/star-b/star-c/planet`。body 为 `{id,name,mass,radius,luminosity,position:[x,y,z],velocity:[x,y,z],active}`。
- system 为 `{bodies,time,G,softening,mode,boundary,accumulator,error,collisions}`；默认时间0、G1、软化0.01、模式1、三轴边界±12。`error` 为 null 或中文暂停原因。
- `step(system,deltaYears)`：原地推进并返回 system；基本步长1/240年，零碎时间存 accumulator。倍率改变子步数。积分使用 velocity Verlet，近距加密计入单次4096子步预算。错误时保持最后有效状态并锁存 error；不会产生文明死亡。
- `pairForce(a,b,G,softening)`：返回 a 受到 b 引力的三维力向量；`accelerations(system)` 返回和 bodies 顺序相同的加速度数组；`energy(system)` 返回动能与软化势能之和。
- `updateBody(system,id,patch)`、`setParameters(system,{G,mode,softening})`：校验后原子更新；非法值抛 RangeError，状态不变。质量[1e-6,10]，位置各轴[-100,100]，速度各轴[-20,20]，光度[0,20]，G[0.1,5]。不允许参数操作重新激活撞毁行星。
- `environment(system)`：返回 `{flux,suns,sunIds,normal,starFluxes,collision}`。starFluxes 条目为 `{id,flux,direction,aboveHorizon}`；direction 为从行星指向恒星的单位向量。归一化 flux=ΣL/r²。法线 `[cos(2πt/20),sin(2πt/20),0]`；太阳计数需严格在地平线上方且单星 flux≥0.08。不模拟日食。
- `createCivilization(number=1)`：返回 `{number,dead,reason,era,history,death,stableYears,hotYears,coldYears,tripleYears,hot,cold,lastFlux}`。era 为 `恒纪元/乱纪元`。
- `evolveCivilization(civ,env,deltaYears,simTime)`：原地推进，返回本次新增死亡记录或 null。deltaYears 必须是物理实际推进时间；暂停、报错或隐藏不能继续积累危险时间。
- `resetCivilization(civ)`：返回编号+1的新对象，保留最近20条历史；不改旧对象或物理状态。重置物理不等于新文明。
- `sampleTrails(trails,bodies,runningSeconds)`：原地操作普通对象 `{id:[{position:[x,y,z],time}]}`，复制世界位置，至少间隔1/60运行秒采样，8秒淘汰，每体最多512点。暂停/隐藏时控制器不推进 runningSeconds；清除尾迹用新 `{}`。
- `trailAlpha(age)`：8秒内单调衰减，过期为0。

## 碰撞与边界

模式1为人为三轴反射盒：中心边界为±(12-radius)，镜像保留越界量并翻转相应速度分量。模式2无边界。碰撞使用相对位移线段与半径和的扫掠检测，防止高速穿透；相对位移近似仅用于一个短积分子步。

碰撞事件为 `{type:'planet-star'|'star-star',ids:[id,id],time}`。行星碰撞停止行星积分并锁存事件，恒星继续；恒星互撞暂停全部，错误不冒充文明死亡。

## 文明规则

所有阈值集中导出 `RULES`，与 PLAN.md 数值一致。恒纪元需单日、辐照0.5—2、相邻采样变化不超过10%，连续5年。过热进入>4/退出<3.5；严寒进入<0.12/退出>0.16；连续5年死亡。三日连续2年死亡。死亡记录 `{number,time,year:2000+floor(time),cause}`；死因 `过热/严寒/三日凌空/行星碰撞`。死亡锁存并只追加一次；调参和物理重置不能复活文明。

## 冻结红灯

2026-09-22，`node --test test/three-body-core.test.cjs`：16 tests、0 pass、16 fail、0 skipped，61.3034 ms。全部因实现尚不存在的显式断言失败，无导入语法错误。

测试 SHA256：`1D71D40EB8CA5C4DD8FD8845F70EC2CE3D3E14A2C835005B3AB4BC38442E8ABB`。冻结后只修实现，不降低断言。

## 实现与实测

- 第1次实现验收：`node --test test/three-body-core.test.cjs`，16 tests / 16 pass / 0 fail / 0 skipped，100.1268 ms。测试 SHA 与红灯一致；无测试放宽，无首轮失败待修。
- 默认层级初值：主星质量1，伴星质量1e-5与4e-6、初始半径8与10.7；行星质量3e-6、初始半径4。初始速度取近圆轨道估计并平移至质心系；此后完全由四体引力推进，没有固定圆周路径。质量比是为长期观测选择的可调教学参数，不宣称是已知恒星系统。
- 独立长积分：默认预设、模式2、每次0.5年，共12400次，模拟6200年；耗时6385.9147 ms，所有四体活动且位置/速度有限，碰撞0，采样最小两体中心距离2.69968949，能量相对漂移1.5714352e-12。此为数值耐久检查，不能替代浏览器600秒渲染耐久检查。
- 近距子步使用当前两体动力学时间尺度的5%，每次提交前检查全部候选位置/速度；预算超额停止并保留最后成功子步。扫掠碰撞使用子步内相对直线轨迹近似；不是天体碰撞、潮汐或广义相对论模型。
- 死亡状态独立于system和镜头；只有resetCivilization返回的新对象解除锁存。已撞毁行星仍不可通过updateBody重新激活。
