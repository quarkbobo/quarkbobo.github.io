# 三体主题待处理事项

当前使用GitHub Pages入口。以下事项不阻断本轮图标、画面和性能修改。

- `_config.yml` 中旧自定义域名 `quark567.patrickliucloud.top` 上次实测返回域名停放HTML，不能作为博客入口；不改只读配置或DNS。本轮没有重新验证该域名。实际发布地址为 https://quarkbobo.github.io/ 。证据：publish-domain-check.json。
- 历史`tools/verify-archive-a.cjs`等待已按用户要求停用的`.planet-webgl-ready`，当前命令真实exit1。原工具保持只读；本轮`docs/three-body/perf-layout.cjs`仅替换首页就绪条件，全部25项布局断言原样通过。旧双主题综合验收同样保留历史原件，当前单主题由39项入口验收覆盖。不是把旧命令记为通过。

2026-09-27用户已授权修复图标：共享head声明三恒星SVG，本地严格浏览器确认首页/归档/文章均无隐式ICO请求、图标200、控制台错误0；旧404失败证据保留。本轮线上部署及复核尚待完成。
