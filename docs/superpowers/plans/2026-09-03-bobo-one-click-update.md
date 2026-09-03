# Bobo One-Click Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one desktop shortcut that regenerates the Quarkbobo catalogue, safely commits and synchronizes `master`, pushes through the repository's existing `origin`, closes one second after success, and stays open on failure.

**Architecture:** A repository-owned PowerShell script contains both the catalogue generator and Git orchestration so the desktop shortcut remains a small, inspectable launcher. Node contract tests exercise the script against temporary local and bare Git repositories, while a local PowerShell acceptance step creates and inspects the `.lnk` without invoking a real upload.

**Tech Stack:** Windows PowerShell 5.1-compatible script, Git CLI, WScript.Shell shortcut COM API, Node.js `node:test`.

## Global Constraints

- Never modify `C:\Users\Lenovo\Desktop\Quark一键更新.lnk`; its baseline SHA-256 is `F15787C314F58E29E46CD9E217ACF1B01EC27A85DC474198E8C3DBD805042AF7`.
- Operate only on `C:\Users\Lenovo\Desktop\Quarkbobo`, branch `master`, and that repository's existing `origin`.
- Never change Git remotes, SSH configuration, credentials, or account selection.
- Never force-push, reset commits, or auto-resolve a rebase conflict.
- A successful production run prints success, waits exactly one second, and exits; a failed interactive run waits for Enter.
- Do not delete `C:\Users\Lenovo\Desktop\catalogue.ps1` until the new script and shortcut have passed acceptance checks.

---

### Task 1: Portable combined updater

**Files:**
- Create: `tools/bobo-update.ps1`
- Create: `test/bobo-update-contract.test.cjs`

**Interfaces:**
- Consumes: optional PowerShell parameters `RepositoryPath`, `SuccessDelaySeconds`, and `NonInteractive`; defaults target the repository containing the script, one second, and interactive failure handling.
- Produces: `source/_posts/博客目录.md`, an optional timestamped commit, a rebased local `master`, and a push to the existing `origin`.

- [ ] **Step 1: Write failing static and isolated-Git tests**

Create `test/bobo-update-contract.test.cjs` with these explicit checks:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'tools', 'bobo-update.ps1')
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'

test('Bobo updater declares safe repository, delay, and failure-mode parameters', () => {
  const source = fs.readFileSync(script, 'utf8')
  assert.match(source, /\[string\]\s*\$RepositoryPath/)
  assert.match(source, /\[int\]\s*\$SuccessDelaySeconds\s*=\s*1/)
  assert.match(source, /\[switch\]\s*\$NonInteractive/)
  assert.doesNotMatch(source, /--force|reset\s+--hard|remote\s+(?:add|set-url)/i)
})
```

The same test file must create a temporary bare remote and working repository, copy the updater into `tools`, seed categorized posts, configure a local test identity, set branch `master`, and execute:

```js
childProcess.spawnSync(powershell, [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', copiedScript,
  '-RepositoryPath', workingRepo,
  '-SuccessDelaySeconds', '0',
  '-NonInteractive'
], { encoding: 'utf8' })
```

Assert exit code `0`, generated catalogue headings/links, one pushed update commit in the bare remote, and a successful second no-change run without another commit. Add a detached/non-`master` fixture and assert nonzero exit without a new remote commit.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test test/bobo-update-contract.test.cjs
```

Expected: FAIL because `tools/bobo-update.ps1` does not exist.

- [ ] **Step 3: Implement the combined PowerShell script**

Start the file with a Windows PowerShell-compatible parameter block and strict failure policy:

```powershell
[CmdletBinding()]
param(
    [string]$RepositoryPath = (Split-Path -Parent $PSScriptRoot),
    [ValidateRange(0, 60)][int]$SuccessDelaySeconds = 1,
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
```

Move the existing catalogue behavior into focused functions named `Get-FrontMatter`, `Get-FrontMatterValue`, `Get-HtmlTitle`, `Get-PostCategory`, and `Write-BlogCatalogue`. Preserve the category order `个人博客`, `技术教程`, `游戏相关`, `关于我`, then `未分类`; exclude the output file itself; keep front-matter `title` and `permalink`; write UTF-8 `source/_posts/博客目录.md`.

Use one checked Git wrapper:

```powershell
function Invoke-CheckedGit {
    param([string]$Stage, [string[]]$Arguments)
    & git -C $RepositoryPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Stage 失败（Git 退出码 $LASTEXITCODE）" }
}
```

The orchestration body must resolve and validate the repository, require `git branch --show-current` to equal `master`, generate the catalogue, run `git add -A`, commit only when `git diff --cached --quiet` returns `1`, reject any other diff exit code, then run checked `pull --rebase origin master` and `push origin master`. On success:

```powershell
Write-Host '上传成功，窗口将在 1 秒后关闭。' -ForegroundColor Green
Start-Sleep -Seconds $SuccessDelaySeconds
exit 0
```

Wrap orchestration in `try/catch`; on failure print the exception, call `Read-Host '按回车关闭窗口'` only when `-not $NonInteractive`, and `exit 1`.

- [ ] **Step 4: Run focused and full tests and verify GREEN**

Run:

```powershell
node --test test/bobo-update-contract.test.cjs
npm run test:fresh
git diff --check
```

Expected: isolated updater tests pass, the existing site suite passes, and the diff check is clean.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- tools/bobo-update.ps1 test/bobo-update-contract.test.cjs
git commit -m "feat: add Bobo one-click updater"
```

---

### Task 2: Desktop shortcut and safe migration

**Files:**
- Create: `C:\Users\Lenovo\Desktop\Bobo一键更新.lnk`
- Remove after verification: `C:\Users\Lenovo\Desktop\catalogue.ps1`
- Preserve byte-for-byte: `C:\Users\Lenovo\Desktop\Quark一键更新.lnk`

**Interfaces:**
- Consumes: `C:\Users\Lenovo\Desktop\Quarkbobo\tools\bobo-update.ps1` from Task 1.
- Produces: one visible desktop launcher for the Bobo repository.

- [ ] **Step 1: Capture safety and target baselines**

Run:

```powershell
$quarkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\Lenovo\Desktop\Quark一键更新.lnk').Hash
if ($quarkHash -ne 'F15787C314F58E29E46CD9E217ACF1B01EC27A85DC474198E8C3DBD805042AF7') {
    throw 'Quark 快捷方式已在本任务外发生变化，停止迁移。'
}
Test-Path -LiteralPath 'C:\Users\Lenovo\Desktop\Quarkbobo\tools\bobo-update.ps1'
```

Expected: hash matches and the new script exists.

- [ ] **Step 2: Create the Bobo shortcut**

Use WScript.Shell to create the new shortcut only:

```powershell
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut('C:\Users\Lenovo\Desktop\Bobo一键更新.lnk')
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\Lenovo\Desktop\Quarkbobo\tools\bobo-update.ps1"'
$shortcut.WorkingDirectory = 'C:\Users\Lenovo\Desktop\Quarkbobo'
$shortcut.Description = '生成 Bobo 博客目录并上传到 GitHub'
$shortcut.WindowStyle = 1
$shortcut.Save()
```

- [ ] **Step 3: Inspect the saved shortcut before deleting anything**

Reopen `Bobo一键更新.lnk` with WScript.Shell and assert exact `TargetPath`, `Arguments`, `WorkingDirectory`, and description. Assert `Test-Path` for the new script and shortcut. Recompute the Quark shortcut SHA-256 and require the exact baseline hash.

- [ ] **Step 4: Remove the replaced desktop script and verify the final desktop state**

Only after Step 3 succeeds, remove the exact file:

```powershell
Remove-Item -LiteralPath 'C:\Users\Lenovo\Desktop\catalogue.ps1'
```

Assert that `Bobo一键更新.lnk` exists, `catalogue.ps1` no longer exists, and `Quark一键更新.lnk` still has the baseline SHA-256.

- [ ] **Step 5: Final repository verification**

Run:

```powershell
npm run test:fresh
git diff --check
git status --short --branch
```

Expected: all tests pass, no whitespace errors, and `master` contains only the intentional committed updater work.

