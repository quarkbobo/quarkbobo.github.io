# 三体主题待处理事项

当前使用GitHub Pages入口。以下事项不阻断本轮图标、画面和性能修改。

- `_config.yml` 中旧自定义域名 `quark567.patrickliucloud.top` 上次实测返回域名停放HTML，不能作为博客入口；不改只读配置或DNS。本轮没有重新验证该域名。实际发布地址为 https://quarkbobo.github.io/ 。证据：publish-domain-check.json。
- 历史`tools/verify-archive-a.cjs`等待已按用户要求停用的`.planet-webgl-ready`，当前命令真实exit1。原工具保持只读；本轮`docs/three-body/perf-layout.cjs`仅替换首页就绪条件，全部25项布局断言原样通过。旧双主题综合验收同样保留历史原件，当前单主题由39项入口验收覆盖。不是把旧命令记为通过。

图标问题已解决并发布：2026-09-27线上浏览器真实访问首页、归档与非根文章，SVG实际请求200，无隐式ICO请求、控制台/资源错误0。三份改动资源与发布提交33de344逐字节一致，Actions36294134474成功。证据：perf-live-evidence/2026-09-27T04-27-27-360Z/report.json；此前失败与导航夹具误绿报告保留并明确作废，不作为通过依据。
