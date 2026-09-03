# Bobo 一键更新设计

## 目标

在桌面新增 `Bobo一键更新.lnk`，一次完成 Quarkbobo 博客目录生成、Git 提交、远端同步和推送。成功时显示结果并在 1 秒后自动关闭；失败时保留窗口和错误信息。

## 账号与文件边界

- `C:\Users\Lenovo\Desktop\Quark一键更新.lnk` 属于另一个 GitHub 账号，必须保持内容和文件元数据不变。
- 新工具只操作 `C:\Users\Lenovo\Desktop\Quarkbobo`。
- 使用该仓库现有的 `origin` 和 `master`，不修改 Git remote、SSH 配置或账号设置。
- 新快捷方式验证通过后，删除桌面上已被合并替代的 `catalogue.ps1`；其目录生成功能迁入项目内的支持脚本。

## 结构

- 支持脚本：`C:\Users\Lenovo\Desktop\Quarkbobo\tools\bobo-update.ps1`
- 唯一桌面入口：`C:\Users\Lenovo\Desktop\Bobo一键更新.lnk`
- 快捷方式启动 Windows PowerShell，设置 `-NoProfile` 和 `-ExecutionPolicy Bypass`，并执行支持脚本。

## 执行流程

1. 切换到 Quarkbobo 仓库并确认当前分支为 `master`。
2. 递归扫描 `source\_posts`，生成 `source\_posts\博客目录.md`。
3. 执行 `git add -A`，存在暂存差异时以当前时间创建提交；没有变化时跳过提交。
4. 执行 `git pull --rebase origin master`，失败或冲突时停止。
5. 执行 `git push origin master`。
6. 所有步骤成功后输出“上传成功”，等待 1 秒并正常退出。

## 错误处理

- 外部命令每一步都检查退出码，任何非零结果都视为失败。
- 失败时输出失败阶段与建议，窗口保持打开，等待用户按回车关闭。
- 不自动执行强制推送、重置、删除提交或解决 rebase 冲突。
- 只有新脚本测试通过、快捷方式目标验证正确后，才移除桌面旧 `catalogue.ps1`。

## 验收

- 原 `Quark一键更新.lnk` 的目标、参数、工作目录和文件哈希均未改变。
- `Bobo一键更新.lnk` 明确指向新支持脚本及 Quarkbobo 工作目录。
- 目录生成可以在隔离测试副本中运行，且失败路径不会自动关闭。
- 成功路径包含精确的 1 秒等待后退出，不使用永久 `-NoExit`。
- Git 操作只作用于 Quarkbobo 的 `master` 与现有 `origin`。
