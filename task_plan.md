# Task Plan: Quark 个人博客科幻化重建

## Goal
完整备份现有 Hexo 博客，移除 NexT 主题并重建为高审美、响应式的深空科幻个人网站，同时保留全部内容并提供安全的一键更新入口。

## Next Step
请用户选择实施方式，然后先执行完整备份任务。

## Current Phase
Phase 2

## Phases

### Phase 1: 需求与技能确认
- [x] 检查 Hexo 项目、Git 状态、现有主题与桌面快捷方式
- [x] 确认核心视觉方向与粒子参考
- [x] 安装并验证 frontend-design、web-design-guidelines、vercel-react-best-practices
- [x] 编写、自检并提交正式设计规格
- [x] 用户复核书面规格，并将主题命名为“流体粒子”
- **Status:** complete

### Phase 2: 备份与实施计划
- [ ] 建立带时间戳的完整备份并验证可恢复性
- [x] 编写并提交可执行的文件级实施计划
- [ ] 明确 NexT 主题替换与内容兼容策略
- **Status:** in_progress

### Phase 3: 网站重建
- [ ] 创建独立的“流体粒子”Hexo 主题
- [ ] 实现首页、文章、归档、分类、标签和关于页
- [ ] 实现蓝紫土星、自然粒子流、鼠标交互与无障碍降级
- [ ] 保留所有文章、小游戏、工具和下载文件
- **Status:** pending

### Phase 4: 快捷入口整合
- [ ] 明确“上传至 GitHub”和“更新目录”两个文件的准确目标
- [ ] 创建一个安全入口并保留原入口备份
- [ ] 避免强制推送和无提示覆盖
- **Status:** pending

### Phase 5: 测试与交付
- [ ] 构建并检查链接、内容、移动端与 reduced-motion
- [ ] 验证动画稳定性与性能
- [ ] 核对备份、Git 差异与恢复说明
- **Status:** pending

## Key Questions
1. 已确认：按“深空档案馆”视觉实施，Hexo 主题名称为“流体粒子”。
2. “上传至 GitHub”和“更新目录”具体指哪两个本地文件或快捷方式？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 视觉采用“深空档案馆” | 用户已选择 A 方向，强调克制、精致与阅读体验 |
| 主视觉采用蓝紫土星 | 用户要求星球更像真实星球，并指定土星轮廓 |
| 粒子采用参考视频的多层弧流 | 用户提供视频并要求按其动态粒子流向生成 |
| 重建为独立 Hexo 主题 | 保留现有内容结构，同时彻底摆脱 NexT 视觉与代码耦合 |
| 使用三个已验证 skills | 已从 Vercel/Anthropic 仓库确认实际路径，并由 Codex 技能 CLI 成功发现 |
| 将网站主题与 Windows 快捷入口拆成两个实施计划 | 两个子系统可独立测试和审查，主题失败不会影响桌面工具 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 粒子原型三元表达式被解析为可选链语法 | 1 | 拆开三元表达式并重新生成原型 |
| 后台浏览器标签页被节流，FPS 指标不代表前台 | 1 | 识别为测试环境节流，最终性能需在正式本地站点前台验证 |
| `npx skills list` 默认缓存目录无写权限 | 1 | 改用用户临时缓存目录后成功查询 |
| web-design-guidelines 安装结果与实际技能清单不一致 | 1 | 记录为不可用，使用明确的本地质量门槛补齐 |
| 安装器 Python HTTPS 触发 OpenSSL Applink 错误 | 1 | 复现并确认 Git HTTPS 正常，改用安装器原生 `--method git` |
| `git diff --cached --check` 报告格式问题但分号链仍继续提交 | 1 | 修正行尾空格和末尾空行，重新检查后修订仅由本任务创建的提交 |
