# Quarkbobo 仓库目录整理与安全清理设计

日期：2026-08-31
状态：用户已批准交互设计，等待书面规格复核

## 目标

把 `Quarkbobo` 收敛为边界清晰的 Hexo 博客仓库，移出不属于博客的独立项目，归档开发记录，删除确定无用的配置与可再生产物，同时保持现有博客内容、公开 URL、桌面快捷工具和本地预览能力不变。

## 不在范围内

- 不改首页、主题视觉、粒子或行星效果。
- 不移动 `source/`、`themes/fluid-particle/`、`tools/`、`test/`、`scaffolds/` 的稳定路径。
- 不删除文章、小游戏、图片、题库或 `source/files/backup/`。
- 不更改任何现有文章、游戏下载和题库下载 URL。
- 不删除 `node_modules/`，避免本地快捷预览立即失效。
- 不推送远程仓库。

## 目标结构

```text
Quarkbobo/
├─ .github/                   GitHub 配置
├─ docs/
│  ├─ development/
│  │  ├─ specs/               设计规格
│  │  ├─ plans/               实施计划
│  │  ├─ verification/        验收记录
│  │  └─ logs/                已完成任务的规划日志
│  └─ recovery/               外部备份与恢复说明
├─ scaffolds/                 Hexo 内容模板
├─ source/                    文章、静态页面、下载与保留备份
├─ test/                      自动测试
├─ themes/
│  └─ fluid-particle/         当前唯一主题
├─ tools/                     Quark 博客快捷工具
├─ .gitignore
├─ _config.yml
├─ package.json
└─ package-lock.json
```

独立游戏项目迁移到：

```text
C:/Users/Lenovo/Desktop/TarotReigns/
```

## 保留内容

- `source/` 下全部文章、页面、游戏、图片和文件。
- `source/files/backup/`，继续按现有路径随博客发布。
- `themes/fluid-particle/` 全部生产文件。
- `tools/quark-blog-tools.ps1` 及其测试；脚本固定项目根和文章目录路径保持不变。
- `docs/recovery/` 与其中记录的外部完整备份位置、哈希和恢复步骤。
- `.github/`、`scaffolds/`、`test/`、`package-lock.json` 和当前 Hexo 配置。

## 迁移内容

### 独立项目

`tarot-reigns/` 不被 Hexo、主题、博客工具或测试引用。它将迁移为桌面独立项目，而不是删除。

迁移采用复制后校验的安全流程：

1. 记录原目录中全部文件的相对路径、大小和 SHA-256。
2. 确认目标 `C:/Users/Lenovo/Desktop/TarotReigns` 不存在。
3. 复制到目标目录。
4. 核对文件数量、相对路径、大小和 SHA-256。
5. 只在完全一致后从 Git 仓库移除 `tarot-reigns/`。
6. 校验完成后清除独立项目中的 `__pycache__/` 与 `*.pyc`，并添加适用于 Python 项目的 `.gitignore`。

任何目标冲突、复制失败或哈希不一致都会停止流程，并保留仓库原目录。

### 开发文档

- `docs/superpowers/specs/` → `docs/development/specs/`
- `docs/superpowers/plans/` → `docs/development/plans/`
- `docs/verification/` → `docs/development/verification/`
- 当前任务完成后，根目录 `task_plan.md`、`findings.md`、`progress.md` → `docs/development/logs/`
- `docs/recovery/` 保持原位。

移动使用 Git 重命名，以保留历史追踪。文档内仍有用的仓库相对链接必须同步更新。

## 删除内容

以下项目均有明确证据表明不参与当前博客：

- `desktop.ini`：Windows 文件夹元数据。
- `.codebuddy/settings.local.json`：本地编辑器插件开关，无站点引用。
- `_config.landscape.yml`：空文件，当前主题不是 Landscape。
- `render.yaml`：指向不存在的 `xiangqi-server/`，当前配置不可运行。
- `themes/.gitkeep`：主题目录已非空，占位文件失去作用。
- `tarot-reigns/**/__pycache__/` 与 `*.pyc`：可再生 Python 字节码。
- 空的 `.worktrees/`：已结束的隔离开发容器。
- `public/` 与 `db.json`：由 Hexo 重新生成的忽略产物，通过标准 clean 清除。

`.gitignore` 将补充 `desktop.ini`、`.codebuddy/`、`__pycache__/` 和 `*.py[cod]`，防止同类杂项重新进入仓库。

## 依赖收敛

移除根项目直接依赖：

- `hexo-theme-landscape`
- `hexo-renderer-stylus`

依据：当前主题为 `fluid-particle`，仓库没有 `.styl` 源文件，两项依赖没有其他包引用。更新 `package.json` 和 `package-lock.json` 后必须执行全新构建，确认 Hexo 不再需要它们。

## 数据与运行路径

Hexo 的运行链保持不变：

```text
source/ + themes/fluid-particle/ + _config.yml
                    ↓
              npm run build
                    ↓
                 public/
```

`public/` 和 `db.json` 被清除后可由构建恢复。Quark 博客工具继续从固定根目录调用 `npm run server`、`npm run build` 和安全发布流程，不需要更新桌面快捷方式。

## 失败与恢复策略

- Tarot 迁移在删除仓库副本前进行完整哈希校验。
- 文档移动采用 Git 跟踪的重命名；未提交时可直接审查差异。
- 依赖更新、构建或测试失败时停止，不提交清理结果。
- 所有仓库内删除项仍可从 Git 历史恢复。
- 设计前完整备份仍位于 `C:/Users/Lenovo/Desktop/Quarkbobo-backups/Quarkbobo-before-redesign-20260828-211820`，并有 `docs/recovery/` 中的哈希证明。
- 清理过程不使用强制推送，也不推送远程。

## 验收

必须同时满足：

1. `npm run test:fresh` 完整通过。
2. `test/quark-blog-tools.test.ps1` 通过。
3. 首页、文章、小游戏和题库下载的生成路径保持不变。
4. `source/files/backup/` 内容和 URL 保持不变。
5. 粒子与行星生产文件没有被本任务修改。
6. `C:/Users/Lenovo/Desktop/TarotReigns` 中的非缓存文件与迁移前清单一致。
7. 仓库根目录只保留博客运行、维护和标准项目配置入口。
8. `git diff --check` 通过，Git 差异仅包含本规格批准的移动、删除、忽略规则与依赖调整。
9. 不存在未解释的未跟踪文件，且未发生远程推送。
10. 全部构建验收结束并记录成功后，再执行一次 `npm run clean`，使最终工作目录不保留 `public/` 与 `db.json`。
