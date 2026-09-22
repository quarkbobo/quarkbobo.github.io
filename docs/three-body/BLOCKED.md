# 三体主题待处理事项

Pages发布已成功，以下既有问题不阻断GitHub Pages入口；按“不顺手改旧问题”的范围约束保留。

- `_config.yml` 中旧自定义域名 `quark567.patrickliucloud.top` 当前返回域名停放HTML，不能作为博客入口；不改只读配置或DNS。实际发布地址为 https://quarkbobo.github.io/?theme=three-body 。证据：publish-domain-check.json。
- 线上浏览器隐式请求 `/favicon.ico` 返回404，因此额外线上“控制台错误0”断言未通过（exit1）。发布前旧head未声明图标，旧本地验证服务器对该请求专门返回204；这是已存在且被本地服务器掩盖的资源缺失。本次没有放宽断言或顺手改旧问题，错误完整保留在publish-verification.json / publish-browser.log。新主题六个资源SHA与已部署提交一致，WebGL四体及128带粒子实际运行、主系统error=null，Pages Actions成功。
