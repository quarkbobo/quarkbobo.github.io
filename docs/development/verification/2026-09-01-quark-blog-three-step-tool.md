# Quark 博客三步工具验收记录

日期：2026-09-01

## 提交范围

本记录覆盖桌面“Quark博客工具”快捷方式说明更新，以及三步博客工具的本地、无推送验收。未执行 `Publish` 或 `RefreshAndPublish`，也没有发生远端推送。

## 快捷方式验收

`C:\Users\Lenovo\Desktop\Quark博客工具.lnk` 仅更新了描述：

- 修改前描述：`Quark 博客工具：文章目录、预览、构建与安全发布`
- 修改后描述：`Quark 博客工具：查看文章、更新目录、更新并上传 GitHub`
- TargetPath（修改前后相同）：`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
- Arguments（修改前后相同）：`-NoProfile -ExecutionPolicy Bypass -File "C:\Users\Lenovo\Desktop\Quarkbobo\tools\quark-blog-tools.ps1" -Action Menu`
- WorkingDirectory（修改前后相同）：`C:\Users\Lenovo\Desktop\Quarkbobo`
- IconLocation（修改前后相同）：`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe,0`

`C:\Users\Lenovo\Desktop\Quark一键更新.lnk` 未修改：其 TargetPath、Arguments、WorkingDirectory、IconLocation、Description 和 LastWriteTimeUtc 均保持不变。

## 本地验收

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1`：1/1 PASS（`PASS: quark-blog-tools contract`）。
- `npm run test:fresh`：Node 157/157 通过，0 fail；构建生成 81 个文件。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/quark-blog-tools.ps1 -Action Describe`：仅列出 `Menu`、`OpenPosts`、`Refresh`、`RefreshAndPublish`、`Describe` 五个 Action。
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/quark-blog-tools.ps1 -Action Refresh`：本地刷新成功，生成 `public/index.html`，共生成 81 个文件；没有执行发布或推送。

## 清理

验收后运行 `npm run clean`，确认 `public` 与 `db.json` 均不存在，`node_modules` 保留；随后 `git diff --check` 通过。
