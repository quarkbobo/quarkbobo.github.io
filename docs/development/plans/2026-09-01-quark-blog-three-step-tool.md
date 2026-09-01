# Quark 博客三步工具实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Quark博客工具.lnk` 精简为查看文章、更新文章目录、更新后安全上传 GitHub 三项功能，并保持成功自动关闭、失败保留窗口。

**Architecture:** 保留已验证的 `Invoke-QuarkBuild` 和 `Invoke-QuarkPublish` 原子操作，新增 `Invoke-QuarkRefreshAndPublish` 负责 build-before-publish 编排。公开 Action 改为 `Menu|OpenPosts|Refresh|RefreshAndPublish|Describe`；快捷方式仍调用 `-Action Menu`，只更新描述。

**Tech Stack:** Windows PowerShell 5.1、PowerShell 合同测试、Git、npm、Hexo、WScript.Shell shortcut COM API。

## Global Constraints

- 菜单只显示“查看当前文章目录”“更新文章目录”“更新并上传 GitHub”和“取消”。
- 更新严格执行 `npm run clean` 后执行 `npm run build`。
- 更新并上传严格执行 clean → build → Git 预览/双确认/提交/普通 `git push origin master`。
- clean 或 build 失败时不得调用 Git 暂存、提交或推送。
- 成功、菜单取消和发布确认取消时正常退出；失败时返回非零、显示恢复提示并等待回车。
- 保持双重大写 `P`、精确 `master`、无空提交、无 `--force` 合同。
- 不申请管理员权限，不修改全局执行策略，不真实推送远端。
- 不删除或修改旧 `C:/Users/Lenovo/Desktop/Quark一键更新.lnk`。
- 使用 `apply_patch` 修改受跟踪文本；快捷方式通过 WScript.Shell COM API 原位更新。

## 文件映射

- Modify: `tools/quark-blog-tools.ps1` — 新编排、公开 Action、三项菜单。
- Modify: `test/quark-blog-tools.test.ps1` — 顺序、失败隔离、菜单和窗口生命周期合同。
- Modify outside repository: `C:/Users/Lenovo/Desktop/Quark博客工具.lnk` — 仅描述。
- Create: `docs/development/verification/2026-09-01-quark-blog-three-step-tool.md` — 验收证据。

---

### Task 1：新增“更新后安全上传”编排

**Files:**
- Modify: `test/quark-blog-tools.test.ps1`
- Modify: `tools/quark-blog-tools.ps1`

**Interfaces:**
- Consumes: `Invoke-QuarkBuild`, `Invoke-QuarkPublish -CommitMessage <string>`。
- Produces: `Invoke-QuarkRefreshAndPublish([string]$CommitMessage, [scriptblock]$BuildAction, [scriptblock]$PublishAction)`。

- [ ] **Step 1：写失败的编排合同测试**

把 `Invoke-QuarkRefreshAndPublish` 加入函数清单，并添加：

~~~powershell
$script:RefreshPublishJournal = [System.Collections.Generic.List[string]]::new()
$recordBuild = { [void]$script:RefreshPublishJournal.Add('build') }
$recordPublish = { param([string]$Message) [void]$script:RefreshPublishJournal.Add("publish:$Message") }
Invoke-QuarkRefreshAndPublish -CommitMessage 'three-step test' -BuildAction $recordBuild -PublishAction $recordPublish
Assert-SequenceEqual @($script:RefreshPublishJournal) @('build', 'publish:three-step test') 'RefreshAndPublish order is wrong.'

$script:RefreshPublishJournal.Clear()
$failed = $false
try {
    Invoke-QuarkRefreshAndPublish -BuildAction {
        [void]$script:RefreshPublishJournal.Add('build')
        throw 'simulated build failure'
    } -PublishAction { param($Message) [void]$script:RefreshPublishJournal.Add('publish') }
}
catch { $failed = $true }
Assert-True $failed 'Build failure must propagate.'
Assert-SequenceEqual @($script:RefreshPublishJournal) @('build') 'Build failure must block publish.'
~~~

- [ ] **Step 2：运行 RED**

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
~~~

Expected: FAIL，函数尚未定义。

- [ ] **Step 3：实现最小编排函数**

~~~powershell
function Invoke-QuarkRefreshAndPublish {
    [CmdletBinding()]
    param(
        [string]$CommitMessage = 'chore: publish blog updates',
        [scriptblock]$BuildAction,
        [scriptblock]$PublishAction
    )
    if ($null -eq $BuildAction) { $BuildAction = { Invoke-QuarkBuild } }
    if ($null -eq $PublishAction) {
        $PublishAction = { param([string]$Message) Invoke-QuarkPublish -CommitMessage $Message }
    }
    & $BuildAction
    & $PublishAction $CommitMessage
}
~~~

不得捕获并吞掉 Build 错误；终止错误自然阻断 Publish。

- [ ] **Step 4：运行 GREEN 并提交**

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
npm run test:node
git add -- tools/quark-blog-tools.ps1 test/quark-blog-tools.test.ps1
git diff --cached --check
git commit -m "feat: build before publishing blog"
~~~

Expected: PowerShell 合同 PASS，Node 157/157。

### Task 2：精简公开动作与三项菜单

**Files:**
- Modify: `test/quark-blog-tools.test.ps1`
- Modify: `tools/quark-blog-tools.ps1`

**Interfaces:**
- Consumes: `Invoke-QuarkBuild`, `Invoke-QuarkRefreshAndPublish`。
- Produces: actions `Menu|OpenPosts|Refresh|RefreshAndPublish|Describe`；菜单选择 `1|2|3|0`。

- [ ] **Step 1：写新 allowlist、菜单文案和分派测试**

把 `-NoRun` 与 Describe 期望改为：

~~~powershell
@('Menu', 'OpenPosts', 'Refresh', 'RefreshAndPublish', 'Describe')
~~~

临时替换三个函数并逐项调用菜单：

~~~powershell
$originalOpen = (Get-Command Invoke-QuarkOpenPosts -CommandType Function).ScriptBlock
$originalBuild = (Get-Command Invoke-QuarkBuild -CommandType Function).ScriptBlock
$originalCombined = (Get-Command Invoke-QuarkRefreshAndPublish -CommandType Function).ScriptBlock
$script:MenuDispatch = [System.Collections.Generic.List[string]]::new()
Set-Item Function:\Invoke-QuarkOpenPosts -Value { [void]$script:MenuDispatch.Add('open') }
Set-Item Function:\Invoke-QuarkBuild -Value { [void]$script:MenuDispatch.Add('refresh') }
Set-Item Function:\Invoke-QuarkRefreshAndPublish -Value { param($Message) [void]$script:MenuDispatch.Add("combined:$Message") }
foreach ($case in @(
    @{ Choice = '1'; Expected = 'open' },
    @{ Choice = '2'; Expected = 'refresh' },
    @{ Choice = '3'; Expected = 'combined:menu test' }
)) {
    $script:MenuDispatch.Clear()
    $null = @(Show-QuarkBlogMenu -CommitMessage 'menu test' -SelectionReader { param($Prompt) $case.Choice } *>&1)
    Assert-SequenceEqual @($script:MenuDispatch) @($case.Expected) "Menu $($case.Choice) dispatched incorrectly."
}
Set-Item Function:\Invoke-QuarkOpenPosts -Value $originalOpen
Set-Item Function:\Invoke-QuarkBuild -Value $originalBuild
Set-Item Function:\Invoke-QuarkRefreshAndPublish -Value $originalCombined
~~~

同时断言菜单包含三项新中文标签，不包含“预览博客”或独立“安全发布”。

- [ ] **Step 2：运行 RED**

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
~~~

Expected: FAIL，旧菜单仍暴露 Preview/Build/Publish。

- [ ] **Step 3：修改脚本公开合同与菜单**

统一修改参数 ValidateSet、`$script:QuarkBlogActions`、`Invoke-QuarkBlogAction` 和入口 ValidateSet 为 `Menu, OpenPosts, Refresh, RefreshAndPublish, Describe`。菜单文本与分派改为：

~~~powershell
switch ($selection) {
    '1' { Invoke-QuarkOpenPosts }
    '2' { Invoke-QuarkBuild }
    '3' { Invoke-QuarkRefreshAndPublish -CommitMessage $CommitMessage }
    '0' { return }
    default { Write-Host (Get-QuarkText -Key 'MenuUnknown') }
}
~~~

公开 Action 的 `Refresh` 分派到 Build，`RefreshAndPublish` 分派到组合函数。保留 Preview/Publish 内部函数，避免无关重构，但不再公开。

- [ ] **Step 4：补充成功自动关闭合同**

~~~powershell
$successfulExitCode = 99
$script:PausePrompts.Clear()
Invoke-QuarkBlogEntryPoint -Action 'RefreshAndPublish' -CommitMessage 'success' -ActionDispatcher {
    param($Action, $Message)
} -PauseReader $pauseReader -ExitCode ([ref]$successfulExitCode)
Assert-True ($successfulExitCode -eq 0) 'Success must return zero.'
Assert-True ($script:PausePrompts.Count -eq 0) 'Success must not pause before close.'
~~~

保留 Menu 失败合同：非零退出、恢复提示、等待回车。

- [ ] **Step 5：运行回归并提交**

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
npm run test:node
git diff --check
git add -- tools/quark-blog-tools.ps1 test/quark-blog-tools.test.ps1
git commit -m "feat: simplify blog tool menu"
~~~

Expected: PowerShell 合同 PASS，Node 157/157，提交只包含脚本和测试。

### Task 3：更新快捷方式并完成无推送验收

**Files:**
- Modify outside repository: `C:/Users/Lenovo/Desktop/Quark博客工具.lnk`
- Verify unchanged: `C:/Users/Lenovo/Desktop/Quark一键更新.lnk`
- Create: `docs/development/verification/2026-09-01-quark-blog-three-step-tool.md`

**Interfaces:**
- Consumes: public `Menu` action and fixed script path。
- Produces: shortcut with unchanged target/arguments/working directory and updated description。

- [ ] **Step 1：导出两个快捷方式修改前属性**

~~~powershell
$shell = New-Object -ComObject WScript.Shell
$toolPath = 'C:/Users/Lenovo/Desktop/Quark博客工具.lnk'
$legacyPath = 'C:/Users/Lenovo/Desktop/Quark一键更新.lnk'
$tool = $shell.CreateShortcut($toolPath)
$legacy = $shell.CreateShortcut($legacyPath)
$before = [pscustomobject]@{
    TargetPath = $tool.TargetPath; Arguments = $tool.Arguments
    WorkingDirectory = $tool.WorkingDirectory; IconLocation = $tool.IconLocation
    LegacyTarget = $legacy.TargetPath; LegacyArguments = $legacy.Arguments
    LegacyWriteTime = (Get-Item -LiteralPath $legacyPath).LastWriteTimeUtc
}
$before | ConvertTo-Json | Set-Content (Join-Path $env:TEMP 'quark-blog-shortcut-before.json') -Encoding UTF8
~~~

- [ ] **Step 2：原位更新描述并验证不变字段**

~~~powershell
$tool.Description = 'Quark 博客工具：查看文章、更新目录、更新并上传 GitHub'
$tool.Save()
$after = $shell.CreateShortcut($toolPath)
foreach ($name in @('TargetPath','Arguments','WorkingDirectory','IconLocation')) {
    if ($after.$name -cne $before.$name) { throw "Shortcut $name changed." }
}
if ($after.Description -cne 'Quark 博客工具：查看文章、更新目录、更新并上传 GitHub') { throw 'Description is wrong.' }
$legacyAfter = $shell.CreateShortcut($legacyPath)
if ($legacyAfter.TargetPath -cne $before.LegacyTarget -or $legacyAfter.Arguments -cne $before.LegacyArguments) { throw 'Legacy shortcut changed.' }
if ((Get-Item $legacyPath).LastWriteTimeUtc -ne $before.LegacyWriteTime) { throw 'Legacy shortcut write time changed.' }
~~~

- [ ] **Step 3：执行无远端副作用验收**

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
npm run test:fresh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/quark-blog-tools.ps1 -Action Describe
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/quark-blog-tools.ps1 -Action Refresh
~~~

Expected: PowerShell PASS；Node 157/157；Describe 只列出五个新 Action；Refresh 生成 `public/index.html`，且没有真实 push。

- [ ] **Step 4：创建验收记录**

用 `apply_patch` 创建验证文档，写明提交范围、精确测试计数、快捷方式前后属性、`public/index.html` 生成成功、旧快捷方式未改、没有执行真实 Publish。

- [ ] **Step 5：最终清理并提交验收记录**

~~~powershell
npm run clean
if (Test-Path public) { throw 'public remains.' }
if (Test-Path db.json) { throw 'db.json remains.' }
if (-not (Test-Path node_modules)) { throw 'node_modules missing.' }
git diff --check
git add -- docs/development/verification/2026-09-01-quark-blog-three-step-tool.md
git commit -m "docs: verify three-step blog tool"
git status --short
~~~

Expected: Git 状态干净，桌面快捷方式可用，没有远端推送。
