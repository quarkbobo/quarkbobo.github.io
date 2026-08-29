# Findings & Decisions

## Requirements
- 完整备份网站当前所有内容。
- 删除/替换现有 NexT 主题。
- 重新生成高审美科幻个人网页。
- 使用深色星空背景、蓝紫色土星和自然表面流光。
- 粒子按用户视频中的弧形流场运动，并保持平滑高帧率。
- 鼠标经过时触发克制的视差、聚散或高亮交互。
- 保留现有文章、小游戏、工具与下载文件。
- 将“上传至 GitHub”和“更新目录”的两个本地入口合成一个快捷入口。
- 三个技能现均位于 `C:/Users/Lenovo/.codex/skills`，且 CLI 可发现：frontend-design、web-design-guidelines、vercel-react-best-practices。
- 主题对外名称确定为“流体粒子”，兼容目录名为 `themes/fluid-particle`。

## Research Findings
- 项目是 Hexo 8.1.1，当前主题配置为 `next theme`。
- 内容主要位于 `source/_posts`，另有国际象棋、中国象棋、贪吃蛇、2048、图像转换器等静态页面。
- Git 当前分支为 `master`，远端为 `origin/master`，开始检查时工作区干净。
- 桌面存在 `BoBo一键更新.lnk`，执行 `git add . && git commit -m 'update' && git push --force origin master`；强制推送存在风险。
- 桌面另有 `Posts.lnk` 和 `files.lnk`，分别打开文章目录与文件目录；用户描述的“更新目录”尚不能唯一对应。
- 参考视频为 1280×592、30 FPS、8.1 秒 HEVC 视频。
- 连续帧显示：主体画面基本静止，运动集中在下半部；大多数粒子短距离缓慢漂移，少量高亮粒子快速穿过。
- `source/_posts/博客目录.md` 的 `permalink: /` 占用根路由；新主题必须把该根文章视为首页数据源，不能移动它或更改 URL。
- 现有依赖已包含 `hexo-renderer-ejs`，可直接创建 EJS 主题，无需增加运行时 npm 依赖。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 使用独立自有主题，不直接魔改 NexT | 更容易形成一致视觉系统，也能保留 Hexo 内容生成能力 |
| Canvas 只绘制粒子，土星结构优先用 CSS/轻量图层 | 控制重绘成本，兼顾清晰度和响应式 |
| 粒子按真实时间推进而非逐帧固定步长 | 降低掉帧时的速度跳变和机械感 |
| 使用预渲染粒子光点贴图 | 避免每颗粒子每帧重复计算阴影模糊 |
| 普通流尘与稀有高速粒子拆分模型 | 更接近参考视频的节奏层次 |
| `post.ejs` 对 `page.path === 'index.html'` 使用首页局部模板 | 保留博客目录文章的根 URL，同时实现新的首页布局与文章查询 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 技能目录不止三个，无法从时间戳确定用户所指 skills | 请求用户提供准确名称或截图 |
| 浏览器测试标签的 FPS 被后台节流 | 正式实现后使用前台页面、不同视口和真实设备验证 |
| `web-design-guidelines` 未实际出现在工作区或全局技能清单 | 本轮无法读取；以键盘焦点、对比度、语义结构、响应式、reduced-motion 和性能预算作为显式验收项 |
| Vercel 技能的仓库目录名与技能名不同 | 使用 `skills/react-best-practices` 并指定目标名 `vercel-react-best-practices`；网页规范位于 `skills/web-design-guidelines` |
| 系统 Python 的 urllib HTTPS 触发 OpenSSL Applink 错误 | 安装器切换为受支持的 Git 下载模式，无需改系统 SSL |

## Resources
- `C:/Users/Lenovo/Desktop/Quarkbobo/_config.yml`
- `C:/Users/Lenovo/Desktop/Quarkbobo/themes/next theme`
- `C:/Users/Lenovo/Documents/xwechat_files/wxid_uz6uj3dkp9t112_c034/msg/video/2026-08/b26aab7263f557c6aabc9389993c3049.mp4`

## Visual/Browser Findings
- 用户选择了“深空档案馆”方向：左侧大标题与内容，右侧单一主天体，整体克制。
- 主色为蓝紫，球面需有气态条带与表面流光。
- 土星环必须有前后遮挡层次，不能只是细椭圆描边。
- 参考粒子从左下沿多层弧线向右侧天体区域流动，亮暗与速度层次明显。
- 鼠标交互应是轻微扰动和视差，不应改变整体流向。
