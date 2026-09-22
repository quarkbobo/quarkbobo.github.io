# 三体观测主题设计

## 目标与边界

博客读者进入空间站观测三恒星与一颗行星，在同一物理状态上切换总览、跟随、受力和文明视图。旧主题仍为默认；文字阅读与原有 URL 保留。下列草稿只是构图比较，不作为真实物理、效果或功能的验收截图。

## 三套构图

`drafts.html?design=panoramic|ring|bridge` 可分别打开，每套同时支持 1440px 桌面与 390px 手机。

| 方案 | 构图 | 手机处理 | 取舍 |
| --- | --- | --- | --- |
| 全景舷窗（采用） | 横向视窗占主体，上沿只放时间/文明，底沿是窄观测台；四角可见舰体结构 | 顶部信息两行，长舷窗变成竖向观测窗，控制在窗下换行 | 观测面积最大，正文可自然接在舱台下 |
| 环形观察舱 | 主视窗被圆形环框包围，时间与文明沿环外分布 | 环框缩小，状态与操作移到圆窗下 | 识别鲜明，但同尺寸下浪费角落并遮挡极端轨道 |
| 偏置舰桥 | 左侧固定观测台，右侧不对称舷窗；用一道斜梁建立纵深 | 观测台落在窗下，弱化斜梁 | 适合信息密集操作，手机布局转变较大 |

## 全景舷窗的视觉语言

- 色彩：深空 `#050914`；舱壁 `#101c2b`；结构边缘 `#33475a`；冰白文字 `#e6edf2`；观测青 `#92d9e5`；恒星琥珀 `#efb66e`。告警使用克制的 `#e58f78`，不染红整个背景。
- 字体：标题沿用 `Iowan Old Style / Source Han Serif SC / Noto Serif CJK SC / Songti SC`，界面沿用 `Microsoft YaHei UI / PingFang SC`，年份/物理读数沿用 `Cascadia Mono / SFMono-Regular / Consolas`。不增加远程字体。
- 布局：场景是视觉主体，标题与仪表外置；生产舞台桌面高约 57vh、手机约 54svh，保持星体总览可见并把复杂控件置于场景下方。博客内容保持正常文档流，观测窗不拦截页面滚动。草稿的整体观测区含标题与仪表，高度约 700/650px。
- 标志性细节：窗下沿三条恒星色的细刻线连接简洁的引力公式，暗示它们来自同一观测系统；不堆叠无意义 HUD、扫描线或仪表卡片。
- 材质：有体积的暖白/琥珀/浅蓝恒星，表面细胞扰动与有限日冕；小面积淡耀斑。行星具有程序大陆、海洋、云层、三颗恒星的方向光和薄大气。星海分远近层，控制曝光，保留黑场。
- 轨迹：同世界坐标、运行中的真实时间 8 秒渐隐；每体最多 512 点。暂停、隐藏不老化；镜头切换不采样。粒子与线共用采样点，不生成第二份物理状态。

## 交互及可读性

镜头与模式独立；空间站自动包围全部活动天体，跟随镜头保持目标外安全距离，支持 yaw/pitch/zoom。镜头平滑转换，操作不改变物理状态。颜色并非唯一辨识：标签分别为恒星 A/B/C 与行星。公式 hover、focus 或手机点击进入对应实际力/加速度/辐照叠加层。

总览按相机横纵投影的可用视角取景，以使用宽舷窗面积。球体展示半径适当放大（恒星约 0.5—0.65、行星 0.28），安全跟随采用展示半径，碰撞与辐照始终以物理模块为准。引力层显示恒星两两三组作用/反作用共六个向量，统一线性比例；三条中性连线补足微小向量不可辨识时的关系。F=ma 层显示所选天体的合力与加速度，以各自单位的十进制比例显示，比例和值同时提供给 HUD，长度不能跨量纲比较。辐照层始终由三颗恒星指向行星，不随参数编辑目标改变。

正文和控制组件由页面控制器负责；场景不启动 RAF、不监听滚轮、不注册全局按键。控制器处理暂停、页面隐藏、减弱动态偏好、降级说明以及主题退出。暗色背景上的正文使用实色底与高对比文字。仅在明确操作场景时旋转镜头，正常阅读保留浏览器原生手势。

## 场景接口

```js
export async function createScene(canvas)
// -> { render(system, options), resize(), dispose(), diagnostics() }
```

`system.bodies` 每项为 `{id,name,mass,radius,luminosity,position:[x,y,z],velocity:[x,y,z],active}`，`system.time` 为模拟年。scene 只读 system；恒星 id 为 `star-a/star-b/star-c`，行星为 `planet`。

`options` 为 `{view,deltaSeconds,runningSeconds,paused,forceMode,selectedId,yaw,pitch,zoom,trails}`。view 取 `station/star-a/star-b/star-c/planet`；forceMode 取 `null/gravity/acceleration/radiation`。yaw/pitch 为弧度，zoom 为正倍率，默认 1。deltaSeconds 为本次运行帧的真实秒增量。

尾迹接口为普通对象 `{[id]:[{position:[x,y,z],time:运行秒}]}`，控制器在运行帧调用 core 的 `sampleTrails` 采样。scene 仅以 runningSeconds 计算透明度；没有 trails 时不擅自采样。力方向和相对量来自 core 的 `pairForce(a,b,G,softening)` 与 `accelerations(system)`，归一显示尺度须在说明中标明，不改变物理。`deltaSeconds=0` 仍可绘制冻结物理状态；暂停不继续 RAF，用户切镜头时控制器用 `deltaSeconds=0.25` 单次绘制。

`resize()` 读取 canvas 容器的 CSS 尺寸并限制像素比；`dispose()` 释放 GPU 资源；`diagnostics()` 提供尺寸、frames、drawCalls、triangles、bodyCount、trailPointCount、forceArrowCount、currentView、cameraPosition 和 target，以及 `renderer:{geometries,textures,camera:{position,quaternion},available:true}`（同样平铺于返回值）。`projections` 为天体的 CSS 像素投影位置；`forcePairs` 给出三对恒星的真实向量与大小；`selectedVectors` 给出所选天体的 F、a、各自大小与显示比例，供控制器绘制可读标签。创建 renderer 前先取得 WebGL2 context，失败时直接抛出可捕获错误，交由控制器显示 HTML 降级信息，避免 Three.js 内部重复报错。

GPU 几何、纹理、力箭头和轨迹缓冲区预先分配并重用；600 秒运行不增长。无需后期处理或远程纹理：恒星球面与行星表面使用程序 shader；日冕使用三体共享纹理。四条轨迹的线和粒子分别使用同一几何数据。scene 不修改 canvas 的键盘/触摸行为。

## 设计自检

三套方案具有真实空间站结构差异；生产选择全景舷窗。草稿无需远程素材或新依赖；生产场景使用已存在的 Three.js。画面与观测数据消费同一个 system；草稿中的示意曲线与读数不进入生产。正文、键盘焦点和手机滚动优先于装饰效果。物理、文明与数值阈值以 PLAN 和冻结验收为准。
