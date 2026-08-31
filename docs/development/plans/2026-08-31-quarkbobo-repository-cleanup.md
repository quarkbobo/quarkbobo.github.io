# Quarkbobo Safe Repository Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Turn Quarkbobo into a focused Hexo blog repository by safely extracting the unrelated Tarot Reigns project, archiving development records, removing verified legacy files and dependencies, and preserving every published route and download.

**Architecture:** Keep source/, themes/fluid-particle/, tools/, test/, and scaffolds/ at stable paths. Treat the Tarot extraction as a copy-and-verify transaction, use Git renames for documentation, and verify cleanup through real Git/npm/Hexo/PowerShell behavior plus route and SHA-256 manifests rather than permanent source-text or directory change-detector tests.

**Tech Stack:** Windows PowerShell 5+, Git, Node.js, npm, Hexo 8.1.1, SHA-256.

## Global Constraints

- Do not modify visual design, particle/planet renderers, authored posts, games, images, questionnaires, or downloads.
- Keep source/files/backup/ and all 12 public file names unchanged.
- Keep source/, themes/fluid-particle/, tools/, test/, and scaffolds/ at their current paths.
- Keep node_modules/ so the preview shortcut remains immediately usable.
- Do not change fixed paths used by tools/quark-blog-tools.ps1 or the desktop shortcut.
- Do not push to any remote.
- Validate every absolute target before recursive copy, move, or delete.
- Preserve user-owned planning log edits already committed on master.
- Use apply_patch for hand-edited repository files; Git renames and npm lockfile rewrites may use native tools.
- Stop before deleting the repository Tarot copy if the external copy differs by path, size, or SHA-256.
- User-approved test-policy exception: configuration and filesystem cleanup use explicit pre/post audits and real behavior verification; do not add a permanent test that merely greps source text or asserts a chosen directory layout.

---

## File Map

- Create outside repository: C:/Users/Lenovo/Desktop/TarotReigns/.gitignore.
- Create: docs/development/verification/2026-08-31-repository-cleanup.md.
- Move: docs/superpowers/specs/*.md to docs/development/specs/.
- Move: docs/superpowers/plans/*.md to docs/development/plans/.
- Move: docs/verification/*.md to docs/development/verification/.
- Move after implementation: task_plan.md, findings.md, progress.md to docs/development/logs/.
- Modify: .gitignore, package.json, package-lock.json.
- Delete after safety checks: tarot-reigns/, desktop.ini, .codebuddy/settings.local.json, _config.landscape.yml, render.yaml, themes/.gitkeep.
- Remove ignored generated state after verification: public/ and db.json. Remove the main checkout's empty .worktrees/ container only after the isolated worktree has been integrated and removed.

### Task 1: Extract Tarot Reigns with a verified transaction

**Files:**
- Create outside repository: C:/Users/Lenovo/Desktop/TarotReigns/.gitignore
- Delete after verification: tarot-reigns/

**Interfaces:**
- Consumes: repository source tarot-reigns/ and an absent desktop target.
- Produces: verified standalone Tarot project and three temp manifests used by Task 6.

- [ ] **Step 1: Run baseline suite and capture routes/source manifests**

~~~powershell
npm run test:fresh
if ($LASTEXITCODE -ne 0) { throw 'Baseline test:fresh failed.' }

$routeBaseline = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-route-baseline.txt'
$sourceBaseline = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-source-baseline.json'
$publicRoot = (Resolve-Path -LiteralPath 'public').Path
$sourceRoot = (Resolve-Path -LiteralPath 'source').Path

Get-ChildItem -File -Recurse -LiteralPath $publicRoot |
  ForEach-Object { [System.IO.Path]::GetRelativePath($publicRoot, $_.FullName).Replace('\', '/') } |
  Sort-Object |
  Set-Content -LiteralPath $routeBaseline -Encoding UTF8

Get-ChildItem -File -Recurse -LiteralPath $sourceRoot |
  ForEach-Object {
    [pscustomobject]@{
      Path = [System.IO.Path]::GetRelativePath($sourceRoot, $_.FullName).Replace('\', '/')
      Bytes = $_.Length
      SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
  } |
  Sort-Object Path |
  ConvertTo-Json -Depth 3 |
  Set-Content -LiteralPath $sourceBaseline -Encoding UTF8
~~~

Expected: suite passes and both manifests exist.

- [ ] **Step 2: Record the expected pre-clean state**

~~~powershell
if (-not (Test-Path -LiteralPath 'tarot-reigns')) { throw 'Expected repository Tarot project is missing.' }
if (Test-Path -LiteralPath 'C:/Users/Lenovo/Desktop/TarotReigns') { throw 'Desktop target already exists.' }
git -c core.quotePath=false ls-files tarot-reigns
~~~

Expected: Git lists the Tarot files and the desktop target is absent.

- [ ] **Step 3: Copy and verify every source file**

~~~powershell
$repoRoot = (Resolve-Path -LiteralPath ((git rev-parse --show-toplevel).Trim())).Path
$source = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'tarot-reigns')).Path
$target = [System.IO.Path]::GetFullPath('C:/Users/Lenovo/Desktop/TarotReigns')
$desktopRoot = (Resolve-Path -LiteralPath 'C:/Users/Lenovo/Desktop').Path
if (-not $target.StartsWith($desktopRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $target" }
if (Test-Path -LiteralPath $target) { throw "Target exists: $target" }

function Get-TarotManifest([string]$root) {
  @(Get-ChildItem -File -Recurse -LiteralPath $root | ForEach-Object {
    [pscustomobject]@{
      Path = [System.IO.Path]::GetRelativePath($root, $_.FullName).Replace('\', '/')
      Bytes = $_.Length
      SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
  } | Sort-Object Path)
}

$before = Get-TarotManifest $source
$manifestPath = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-tarot-before.json'
$before | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Copy-Item -LiteralPath $source -Destination $target -Recurse
$after = Get-TarotManifest $target
$beforeRows = @($before | ForEach-Object { "$($_.Path)|$($_.Bytes)|$($_.SHA256)" })
$afterRows = @($after | ForEach-Object { "$($_.Path)|$($_.Bytes)|$($_.SHA256)" })
if (@(Compare-Object $beforeRows $afterRows).Count -ne 0) { throw 'Tarot copy verification failed; keep repository source.' }
~~~

- [ ] **Step 4: Remove verified caches from the external target and add ignore rules**

~~~powershell
$target = (Resolve-Path -LiteralPath 'C:/Users/Lenovo/Desktop/TarotReigns').Path
$prefix = $target + [System.IO.Path]::DirectorySeparatorChar
$cacheTargets = @(Get-ChildItem -Recurse -Force -LiteralPath $target |
  Where-Object { ($_.PSIsContainer -and $_.Name -eq '__pycache__') -or ((-not $_.PSIsContainer) -and $_.Extension -eq '.pyc') })
foreach ($item in ($cacheTargets | Sort-Object FullName -Descending)) {
  $resolved = [System.IO.Path]::GetFullPath($item.FullName)
  if (-not $resolved.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe cache target: $resolved" }
  Remove-Item -Force -Recurse -LiteralPath $resolved
}
~~~

Create C:/Users/Lenovo/Desktop/TarotReigns/.gitignore with apply_patch:

~~~gitignore
__pycache__/
*.py[cod]
.venv/
~~~

- [ ] **Step 5: Remove the verified repository copy, verify post-state, and commit**

~~~powershell
git rm -r -- tarot-reigns
if (Test-Path -LiteralPath 'tarot-reigns') { throw 'Repository Tarot directory remains.' }
if (-not (Test-Path -LiteralPath 'C:/Users/Lenovo/Desktop/TarotReigns')) { throw 'External Tarot target is missing.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git commit -m "refactor: extract tarot project from blog"
~~~

### Task 2: Consolidate retained development documentation

**Files:**
- Move: docs/superpowers/specs/*.md to docs/development/specs/
- Move: docs/superpowers/plans/*.md to docs/development/plans/
- Move: docs/verification/*.md to docs/development/verification/
- Modify after move: two historical implementation plans with active path references.

**Interfaces:**
- Produces: docs/development/{specs,plans,verification}; docs/recovery/ remains unchanged.

- [ ] **Step 1: Record expected pre-move state**

~~~powershell
foreach ($path in @('docs/superpowers/specs','docs/superpowers/plans','docs/verification','docs/recovery')) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Expected path missing: $path" }
}
~~~

- [ ] **Step 2: Move documents using Git**

~~~powershell
New-Item -ItemType Directory -Force -Path 'docs/development/specs','docs/development/plans','docs/development/verification' | Out-Null
Get-ChildItem -File -LiteralPath 'docs/superpowers/specs' | ForEach-Object { git mv -- $_.FullName 'docs/development/specs/' }
Get-ChildItem -File -LiteralPath 'docs/superpowers/plans' | ForEach-Object { git mv -- $_.FullName 'docs/development/plans/' }
Get-ChildItem -File -LiteralPath 'docs/verification' | ForEach-Object { git mv -- $_.FullName 'docs/development/verification/' }
~~~

- [ ] **Step 3: Update active references with apply_patch**

- In docs/development/plans/2026-08-30-high-energy-ringed-star.md, replace docs/verification/ with docs/development/verification/.
- In docs/development/plans/2026-08-31-realistic-canvas-ringed-planet.md, replace docs/superpowers/specs/ with docs/development/specs/ and docs/verification/ with docs/development/verification/.
- Keep the cleanup design's explicit old-to-new migration mapping unchanged.

- [ ] **Step 4: Verify post-state and commit**

~~~powershell
foreach ($path in @('docs/development/specs','docs/development/plans','docs/development/verification','docs/recovery')) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Target path missing: $path" }
}
foreach ($path in @('docs/superpowers','docs/verification')) {
  if (Test-Path -LiteralPath $path) { throw "Legacy path remains: $path" }
}
rg -n "docs/(superpowers|verification)/" docs/development/plans/2026-08-30-high-energy-ringed-star.md docs/development/plans/2026-08-31-realistic-canvas-ringed-planet.md
if ($LASTEXITCODE -eq 0) { throw 'Active plan references still use old paths.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- docs
git commit -m "docs: consolidate development records"
~~~

### Task 3: Remove verified legacy files and unused dependencies

**Files:**
- Modify: package.json, package-lock.json
- Delete: .codebuddy/settings.local.json, _config.landscape.yml, desktop.ini, render.yaml, themes/.gitkeep

**Interfaces:**
- Produces: one active Hexo theme dependency set and no broken deployment descriptor.

- [ ] **Step 1: Record expected obsolete state**

~~~powershell
foreach ($path in @('.codebuddy/settings.local.json','_config.landscape.yml','desktop.ini','render.yaml','themes/.gitkeep')) {
  git ls-files --error-unmatch -- $path
  if ($LASTEXITCODE -ne 0) { throw "Expected tracked path missing: $path" }
}
npm explain hexo-theme-landscape
if ($LASTEXITCODE -ne 0) { throw 'Expected Landscape dependency missing.' }
npm explain hexo-renderer-stylus
if ($LASTEXITCODE -ne 0) { throw 'Expected Stylus dependency missing.' }
~~~

- [ ] **Step 2: Delete only approved tracked files**

Use apply_patch for the five approved paths. Confirm Git shows only their deletions before continuing.

- [ ] **Step 3: Remove unused packages through npm**

~~~powershell
npm uninstall hexo-theme-landscape hexo-renderer-stylus --save
if ($LASTEXITCODE -ne 0) { throw 'npm dependency removal failed.' }
~~~

- [ ] **Step 4: Verify real behavior and commit**

~~~powershell
npm explain hexo-theme-landscape
if ($LASTEXITCODE -eq 0) { throw 'Landscape package remains.' }
npm explain hexo-renderer-stylus
if ($LASTEXITCODE -eq 0) { throw 'Stylus renderer remains.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Hexo build failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -A -- package.json package-lock.json .codebuddy _config.landscape.yml desktop.ini render.yaml themes/.gitkeep
git commit -m "chore: remove obsolete blog scaffolding"
~~~

### Task 4: Protect downloads, ignore local artifacts, and clean generated state

**Files:**
- Modify: .gitignore
- Remove ignored state during implementation: public/, db.json

**Interfaces:**
- Produces: behaviorally verified ignore rules while preserving the exact 12 download names.

- [ ] **Step 1: Verify retained downloads and expected missing ignore behavior**

~~~powershell
$expected = @(
  '1月_new_questions.txt','1月_new_questions.xlsx',
  '1月学生政治理论学习月测（自测）_final.txt','1月学生政治理论学习月测（自测）_final.xlsx',
  '202603.xlsx','202603new_questions(1).txt','202604new_questions.txt','202604new_questions.xlsx',
  '2月学生政治理论学习月测（自测）.txt','2月学生政治理论学习月测（自测）.xlsx','5.txt','5.xlsx'
) | Sort-Object
$actual = @(Get-ChildItem -File -LiteralPath 'source/files/backup' | Select-Object -ExpandProperty Name | Sort-Object)
if (@(Compare-Object $expected $actual).Count -ne 0) { throw 'Backup download names changed before cleanup.' }

git check-ignore --no-index -- desktop.ini .codebuddy/settings.local.json sample/__pycache__/x.pyc
if ($LASTEXITCODE -eq 0) { throw 'New ignore behavior already exists; inspect before editing.' }
~~~

- [ ] **Step 2: Add exact ignore rules with apply_patch**

~~~gitignore
desktop.ini
.codebuddy/
__pycache__/
*.py[cod]
~~~

- [ ] **Step 3: Verify ignore behavior**

~~~powershell
git check-ignore --no-index -v -- desktop.ini .codebuddy/settings.local.json sample/__pycache__/x.pyc
if ($LASTEXITCODE -ne 0) { throw 'Ignore rules are inactive.' }
~~~

- [ ] **Step 4: Clean exact generated paths**

~~~powershell
npm run clean
if ($LASTEXITCODE -ne 0) { throw 'Hexo clean failed.' }

if (Test-Path -LiteralPath 'public') { throw 'public remains after clean.' }
if (Test-Path -LiteralPath 'db.json') { throw 'db.json remains after clean.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { throw 'node_modules was removed.' }
~~~

The main checkout's `.worktrees/` directory still contains the active isolated worktree at this point. Validate and remove that container only after branch integration and `git worktree remove`, during the finishing step.

- [ ] **Step 5: Commit**

~~~powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- .gitignore
git commit -m "chore: ignore local repository artifacts"
~~~

### Task 5: Archive completed root planning logs

**Files:**
- Move: task_plan.md, findings.md, progress.md to docs/development/logs/

**Interfaces:**
- Produces: a clean repository root and retained planning history.

- [ ] **Step 1: Update all logs before archival**

Use apply_patch to record Tasks 1-4, their commits, checks, errors, and final verification as the only remaining phase.

- [ ] **Step 2: Record expected root state**

~~~powershell
foreach ($name in @('task_plan.md','findings.md','progress.md')) {
  if (-not (Test-Path -LiteralPath $name)) { throw "Root log missing before archival: $name" }
}
~~~

- [ ] **Step 3: Move logs and update navigational paths**

~~~powershell
New-Item -ItemType Directory -Force -Path 'docs/development/logs' | Out-Null
git mv -- task_plan.md docs/development/logs/task_plan.md
git mv -- findings.md docs/development/logs/findings.md
git mv -- progress.md docs/development/logs/progress.md
~~~

With apply_patch in docs/development/logs/progress.md:

- Replace docs/superpowers/specs/ with docs/development/specs/.
- Replace docs/superpowers/plans/ with docs/development/plans/.
- Keep commit IDs and recovery paths unchanged.

- [ ] **Step 4: Verify post-state and commit**

~~~powershell
foreach ($name in @('task_plan.md','findings.md','progress.md')) {
  if (Test-Path -LiteralPath $name) { throw "Root log remains: $name" }
  if (-not (Test-Path -LiteralPath (Join-Path 'docs/development/logs' $name))) { throw "Archived log missing: $name" }
}
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- docs/development/logs
git commit -m "docs: archive completed project logs"
~~~

### Task 6: Verify the cleaned repository and record evidence

**Files:**
- Create: docs/development/verification/2026-08-31-repository-cleanup.md
- Verify unchanged: source/, theme production files, tools, routes, external TarotReigns/.

**Interfaces:**
- Consumes: Task 1 temp manifests.
- Produces: final evidence and clean generated-output state.

- [ ] **Step 1: Run full fresh tests and PowerShell tool contract**

~~~powershell
npm run test:fresh
if ($LASTEXITCODE -ne 0) { throw 'Final test:fresh failed.' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Quark blog tools test failed.' }
~~~

- [ ] **Step 2: Compare generated routes and source against baselines**

~~~powershell
$routeBaseline = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-route-baseline.txt'
$sourceBaseline = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-source-baseline.json'
if (-not (Test-Path $routeBaseline) -or -not (Test-Path $sourceBaseline)) { throw 'Baselines are missing.' }

$publicRoot = (Resolve-Path -LiteralPath 'public').Path
$currentRoutes = @(Get-ChildItem -File -Recurse -LiteralPath $publicRoot |
  ForEach-Object { [System.IO.Path]::GetRelativePath($publicRoot, $_.FullName).Replace('\', '/') } | Sort-Object)
$baselineRoutes = @(Get-Content -LiteralPath $routeBaseline)
if (@(Compare-Object $baselineRoutes $currentRoutes).Count -ne 0) { throw 'Generated routes changed.' }

$sourceRoot = (Resolve-Path -LiteralPath 'source').Path
$currentSource = @(Get-ChildItem -File -Recurse -LiteralPath $sourceRoot | ForEach-Object {
  [pscustomobject]@{
    Path = [System.IO.Path]::GetRelativePath($sourceRoot, $_.FullName).Replace('\', '/')
    Bytes = $_.Length
    SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
  }
} | Sort-Object Path)
$baselineSource = @(Get-Content -Raw -LiteralPath $sourceBaseline | ConvertFrom-Json)
$baselineRows = @($baselineSource | ForEach-Object { "$($_.Path)|$($_.Bytes)|$($_.SHA256)" })
$currentRows = @($currentSource | ForEach-Object { "$($_.Path)|$($_.Bytes)|$($_.SHA256)" })
if (@(Compare-Object $baselineRows $currentRows).Count -ne 0) { throw 'Authored source changed.' }
~~~

- [ ] **Step 3: Verify external Tarot non-cache files**

~~~powershell
$manifestPath = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-tarot-before.json'
$target = (Resolve-Path -LiteralPath 'C:/Users/Lenovo/Desktop/TarotReigns').Path
$before = @(Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json |
  Where-Object { $_.Path -notmatch '(^|/)__pycache__/|\.pyc$' })
$after = @(Get-ChildItem -File -Recurse -LiteralPath $target |
  Where-Object { $_.Name -ne '.gitignore' -and $_.FullName -notmatch '[\\/]__pycache__[\\/]' -and $_.Extension -ne '.pyc' } |
  ForEach-Object {
    [pscustomobject]@{
      Path = [System.IO.Path]::GetRelativePath($target, $_.FullName).Replace('\', '/')
      Bytes = $_.Length
      SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
  } | Sort-Object Path)
$beforeRows = @($before | ForEach-Object { "$($_.Path)|$($_.Bytes)|$($_.SHA256)" })
$afterRows = @($after | ForEach-Object { "$($_.Path)|$($_.Bytes)|$($_.SHA256)" })
if (@(Compare-Object $beforeRows $afterRows).Count -ne 0) { throw 'External Tarot project changed.' }
~~~

- [ ] **Step 4: Create verification record**

Create docs/development/verification/2026-08-31-repository-cleanup.md with branch/commit, exact test count, PowerShell result, manifest comparisons, removed items, retained downloads, and recovery path.

- [ ] **Step 5: Final clean, diff audit, and commit**

~~~powershell
npm run clean
if ($LASTEXITCODE -ne 0) { throw 'Final clean failed.' }
if (Test-Path -LiteralPath 'public') { throw 'public still exists.' }
if (Test-Path -LiteralPath 'db.json') { throw 'db.json still exists.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { throw 'node_modules was removed.' }

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Final diff check failed.' }
git status --short
git diff --stat HEAD
git diff --name-status HEAD
git add -- docs/development/verification/2026-08-31-repository-cleanup.md
git commit -m "docs: verify repository cleanup"
git status --short
~~~

Expected: status clean, generated output absent, node_modules/ retained, no push.
