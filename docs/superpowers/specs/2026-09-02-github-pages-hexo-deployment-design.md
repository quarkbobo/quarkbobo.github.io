# GitHub Pages 自动发布设计

## 目标

每次向 `master` 分支推送代码后，由 GitHub Actions 自动构建当前 Hexo 项目，并把 `public/` 中的静态网页发布到 `https://quarkbobo.github.io/`。同时保留手动触发工作流的能力。

## 当前状态

- 仓库保存 Hexo 源文件，默认分支为 `master`。
- `npm run build` 会生成可部署的 `public/` 目录。
- `public/` 被忽略，不应提交到源码分支。
- 仓库目前没有 Pages 工作流，根目录也没有构建后的 `index.html`，因此 Pages 地址返回 404。

## 方案

新增 `.github/workflows/pages.yml`，使用 GitHub 官方 Pages Actions：

1. 在推送到 `master` 或手动触发时运行。
2. 检出仓库并配置 Node.js，启用 npm 缓存。
3. 使用 `npm ci` 按 `package-lock.json` 安装固定依赖。
4. 执行 `npm run build`，生成 `public/`。
5. 配置 Pages，上传 `public/` 作为 Pages artifact。
6. 在 `github-pages` environment 中发布 artifact。

工作流只授予 `contents: read`、`pages: write` 和 `id-token: write` 所需权限，并通过并发组避免多个发布任务互相覆盖。

## 数据流

`master` 推送 → GitHub Actions → `npm ci` → `npm run build` → 上传 `public/` → GitHub Pages 发布。

## 错误处理

- 依赖安装或 Hexo 构建失败时停止发布，保留当前线上版本。
- Pages 上传或部署失败时在 Actions 页面显示失败日志。
- 新推送会取消仍在排队但尚未发布的旧任务；正在发布的任务不强制取消，避免留下不完整状态。

## 验证

- 添加一个静态契约测试，检查工作流触发分支、权限、构建命令、发布目录和官方 Pages Actions。
- 先观察测试在工作流不存在时失败，再新增工作流使其通过。
- 运行完整的 `npm run test:fresh`，确认 Hexo 构建及现有测试全部通过。
- 推送后检查 GitHub Actions 结果，并验证 `https://quarkbobo.github.io/` 返回网站首页而非 404。

## 范围外事项

- 不更换 Hexo、主题或 Node 依赖。
- 不把 `public/` 提交到 `master`。
- 不引入自定义域名。
- 不修改文章内容或页面视觉设计。
