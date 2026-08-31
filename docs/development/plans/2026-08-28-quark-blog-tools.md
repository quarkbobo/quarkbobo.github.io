# Quark Blog Tools Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate `BoBo一键更新.lnk` and `Posts.lnk` workflows with one recoverable `Quark博客工具.lnk` that opens posts, previews, builds, or safely publishes the blog without force-push.

**Architecture:** Put all behavior in a project-owned PowerShell script with explicit non-interactive actions and a small interactive menu. Test command construction without starting Git/Hexo, then create the desktop `.lnk` through `WScript.Shell`; move the two old shortcuts only after the new target and actions verify.

**Tech Stack:** Windows PowerShell, WScript.Shell COM, Git, npm/Hexo, custom PowerShell assertions (no new dependency).

## Global Constraints

- Project path is exactly `C:/Users/Lenovo/Desktop/Quarkbobo` and posts path is `source/_posts`.
- New shortcut name is exactly `Quark博客工具.lnk`.
- Never use `git push --force`, `git reset --hard`, global execution-policy changes, or implicit deletion.
- Publish must show status/diff summary and require confirmation before `git add --all`.
- Empty working trees must not create empty commits.
- Old shortcuts are recoverable from the external redesign backup and are moved, not deleted, only after verification.
- No administrator privileges are required.

---

### Task 1: Implement and test the safe blog-tool launcher

**Files:**
- Create: `tools/quark-blog-tools.ps1`
- Create: `test/quark-blog-tools.test.ps1`

**Interfaces:**
- Produces functions `Get-QuarkBlogPaths()`, `Get-QuarkPublishCommands()`, `Invoke-QuarkOpenPosts()`, `Invoke-QuarkPreview()`, `Invoke-QuarkBuild()`, `Invoke-QuarkPublish()`, and `Show-QuarkBlogMenu()`.
- Script parameters: `-Action Menu|OpenPosts|Preview|Build|Publish|Describe`, `-NoRun`, and optional `-CommitMessage`.

- [ ] **Step 1: Write the failing PowerShell contract test**

Create `test/quark-blog-tools.test.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../tools/quark-blog-tools.ps1" -NoRun

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }

$paths = Get-QuarkBlogPaths
Assert-True ($paths.Project -eq 'C:\Users\Lenovo\Desktop\Quarkbobo') 'Wrong project path.'
Assert-True ($paths.Posts -eq 'C:\Users\Lenovo\Desktop\Quarkbobo\source\_posts') 'Wrong posts path.'

$commands = Get-QuarkPublishCommands -CommitMessage 'test message'
$joined = $commands -join "`n"
Assert-True ($joined -notmatch '--force') 'Publish must never force push.'
Assert-True ($joined -match 'git status --short --branch') 'Publish must show status.'
Assert-True ($joined -match 'git diff --stat') 'Publish must show a diff summary.'
Assert-True ($joined -match 'git push origin master') 'Publish must use a normal master push.'
Write-Output 'PASS: quark-blog-tools contract'
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1`

Expected: FAIL because the launcher does not exist.

- [ ] **Step 3: Implement the explicit actions and interactive menu**

The script must define paths with literal constants, return command strings from `Get-QuarkPublishCommands`, and execute them only inside `Invoke-QuarkPublish`. Publish flow:

```powershell
git -C $paths.Project status --short --branch
git -C $paths.Project diff --stat
$choice = Read-Host '输入 P 继续提交并普通推送；其他键取消'
if ($choice -cne 'P') { return }
git -C $paths.Project add --all
$staged = git -C $paths.Project diff --cached --name-only
if (-not $staged) { Write-Host '没有可提交的更改。'; git -C $paths.Project push origin master; return }
git -C $paths.Project commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { throw 'Commit failed; changes remain local.' }
git -C $paths.Project push origin master
if ($LASTEXITCODE -ne 0) { throw 'Push failed; commit remains local and can be retried.' }
```

`Preview` starts `npm run server` in the project; `Build` runs `npm run clean` followed by `npm run build`; `OpenPosts` calls `Start-Process explorer.exe -ArgumentList $paths.Posts`. `Describe` prints paths/actions as JSON. `-NoRun` defines functions without showing the menu.

- [ ] **Step 4: Run unit contract, Describe, and Build actions**

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/quark-blog-tools.ps1 -Action Describe
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/quark-blog-tools.ps1 -Action Build
```

Expected: test PASS; Describe JSON lists exact paths/actions; Build exits 0.

- [ ] **Step 5: Commit the tested launcher**

Run:

```powershell
git add -- tools/quark-blog-tools.ps1 test/quark-blog-tools.test.ps1
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: add safe quark blog launcher"
```

---

### Task 2: Create, verify, and consolidate the desktop shortcut

**Files:**
- Create on Desktop: `C:/Users/Lenovo/Desktop/Quark博客工具.lnk`
- Move after verification: `BoBo一键更新.lnk` and `Posts.lnk` to the exact external backup recorded in `docs/recovery/2026-08-28-redesign-backup.md`.

**Interfaces:**
- Consumes: `tools/quark-blog-tools.ps1` and the verified external backup.
- Produces: one desktop shortcut whose target is Windows PowerShell and whose arguments invoke the launcher menu.

- [ ] **Step 1: Resolve and validate exact source, destination, and backup paths**

Run:

```powershell
$desktop = (Resolve-Path 'C:/Users/Lenovo/Desktop').Path
$project = (Resolve-Path 'C:/Users/Lenovo/Desktop/Quarkbobo').Path
$launcher = (Resolve-Path (Join-Path $project 'tools/quark-blog-tools.ps1')).Path
$newShortcut = Join-Path $desktop 'Quark博客工具.lnk'
$oldShortcuts = @((Join-Path $desktop 'BoBo一键更新.lnk'), (Join-Path $desktop 'Posts.lnk'))
foreach ($path in $oldShortcuts) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing original shortcut: $path" } }
```

Expected: all exact paths resolve; no broad directory or wildcard is used.

- [ ] **Step 2: Create the new shortcut without changing system policy**

Run:

```powershell
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($newShortcut)
$shortcut.TargetPath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`" -Action Menu"
$shortcut.WorkingDirectory = $project
$shortcut.WindowStyle = 1
$shortcut.Description = '流体粒子博客：打开文章、预览、构建与安全发布'
$shortcut.Save()
```

- [ ] **Step 3: Read the `.lnk` back and verify every field**

Run:

```powershell
$check = $shell.CreateShortcut($newShortcut)
if ($check.TargetPath -ne 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe') { throw 'Shortcut target mismatch.' }
if ($check.Arguments -notmatch 'quark-blog-tools\.ps1.+-Action Menu') { throw 'Shortcut arguments mismatch.' }
if ($check.WorkingDirectory -ne $project) { throw 'Shortcut working directory mismatch.' }
```

Expected: all fields match exactly.

- [ ] **Step 4: Verify non-destructive actions before consolidating originals**

Run the shortcut and select Open Posts; verify Explorer opens `source/_posts`. Run it again and select Build; verify Hexo exits 0. Do not select Publish during this verification, because publishing is an external side effect and is not needed to validate shortcut construction.

- [ ] **Step 5: Move the two originals into the verified backup**

Read the exact backup path from `docs/recovery/2026-08-28-redesign-backup.md`, resolve it, and verify it starts with `C:\Users\Lenovo\Desktop\Quarkbobo-backups\`. Create a `desktop-shortcuts` child directory, then use `Move-Item -LiteralPath` for exactly the two resolved shortcut paths. Verify the new shortcut remains and originals exist in the backup. This move is recoverable and within the user-approved consolidation scope.

- [ ] **Step 6: Run the final shortcut evidence gate**

Freshly run the PowerShell contract test, launcher Describe, launcher Build, and `.lnk` field checks. Report the backup location of the original shortcuts and explicitly note that no administrator setting or global execution policy changed.
