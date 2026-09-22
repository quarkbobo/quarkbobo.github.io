# 设定与实现口径

核验日期：2026-09-22。下列来源不是网页素材授权，不复制剧集图像、配乐或原作长段文字。

- [Netflix 官方第3集回顾](https://www.netflix.com/tudum/articles/3-body-problem-episode-3-recap)：影视改编分别描述三日凌空的高温毁灭和三日连珠的引力灾难；不能把影视中的引力反转当作牛顿求解器。
- [Netflix 官方科学解释](https://www.netflix.com/tudum/articles/3-body-problem-science-explained-burning-questions)：改编中的恒/乱纪元、极端冷热、脱水和复水。它不等于出版社原文核验。
- [NASA 双星宜居带](https://science.nasa.gov/resource/orbiting-in-the-habitable-zone-of-two-suns/)：两个太阳不直接决定宜居性，光度与距离决定辐照条件。
- [NASA 宜居带](https://science.nasa.gov/exoplanets/habitable-zone/)：宜居带取决于恒星亮度等条件，不以太阳数量作为唯一判据。

本站是三恒星加小质量行星的四体数值系统，主题名“三体”沿用作品意象。运动由牛顿力计算；三日连续2模拟年灭亡与冷热持续阈值是明确的玩法约定，不是原著数字、真实气候模型或宜居预测。不模拟日食、潮汐破碎、完整大气和相对论。

三日连珠没有在本轮另加剧情功能；它与三日凌空不同，不用相同名称解释。

图形使用程序材质与几何，不新增贴图版权依赖。Three.js 使用项目已安装版本及原许可证。

## 新增观测层

- [NASA：什么是拉格朗日点](https://science.nasa.gov/resource/what-is-a-lagrange-point/)：两主天体与小质量第三体的旋转参照系中有五个参考点，前三个共线、后两个成等边三角形。当前实现按瞬时两体位置/质量/轨道平面套用圆形限制三体近似，不声称真实四体混沌轨道存在五个固定平衡点。
- [NASA：柯伊伯带](https://science.nasa.gov/solar-system/kuiper-belt/facts/)：太阳系海王星外分布的环状冰质小天体区域。本主题借用“碎冰环带”的意象，使用无质量试验粒子在当前四体引力中数值积分；没有海王星、未套用太阳系真实尺度，也不将固定圆环动画称作轨道求解。
- 三恒星颜色的恒星分类和色轮依据详见 ART-RESEARCH.md。最终界面颜色为审美映射，未声称由质量和光度唯一确定表面温度。
