# Quarkbobo Safe Repository Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Turn Quarkbobo into a focused Hexo blog repository by safely extracting the unrelated Tarot Reigns project, archiving development records, removing verified legacy files and dependencies, and preserving every published route and download.

**Architecture:** Keep the runtime boundaries source/, themes/fluid-particle/, tools/, and test/ unchanged. Treat the external Tarot migration as a copy-and-verify transaction, express lasting repository rules in one Node structure contract, use Git renames for documents, and finish with fresh Hexo/browser tests plus route and source manifests.

**Tech Stack:** Windows PowerShell 5+, Git, Node.js built-in test runner, npm, Hexo 8.1.1, SHA-256.

## Global Constraints

- Do not modify the visual design, particle renderer, planet renderer, authored posts, games, images, questionnaires, or downloads.
- Keep source/files/backup/ and all 12 existing public file names unchanged.
- Keep source/, themes/fluid-particle/, tools/, test/, and scaffolds/ at their current paths.
- Keep node_modules/ so the local preview shortcut remains immediately usable.
- Do not change the fixed paths used by tools/quark-blog-tools.ps1 or the desktop shortcut.
- Do not push to any remote.
- Validate every absolute target before a recursive copy, move, or delete.
- Preserve the user-owned planning log edits already present in the main checkout.
- Use apply_patch for hand-edited repository files; Git renames and generated lockfile rewrites may use their native tools.
- Stop before deleting the repository copy of Tarot Reigns if its external copy differs by path, size, or SHA-256.

---

## File Map

- Create test/repository-structure.test.cjs: permanent repository-boundary contract.
- Create C:/Users/Lenovo/Desktop/TarotReigns/.gitignore: standalone Python cache rules.
- Create docs/development/verification/2026-08-31-repository-cleanup.md: final evidence.
- Move docs/superpowers/specs/*.md to docs/development/specs/.
- Move docs/superpowers/plans/*.md to docs/development/plans/.
- Move docs/verification/*.md to docs/development/verification/.
- Move task_plan.md, findings.md, and progress.md to docs/development/logs/ only after implementation work is complete.
- Modify .gitignore, package.json, and package-lock.json.
- Delete tarot-reigns/, desktop.ini, .codebuddy/settings.local.json, _config.landscape.yml, render.yaml, and themes/.gitkeep after their safety conditions pass.

### Task 1: Extract Tarot Reigns with a verified transaction

**Files:**
- Create: test/repository-structure.test.cjs
- Create outside repository: C:/Users/Lenovo/Desktop/TarotReigns/.gitignore
- Delete after verification: tarot-reigns/

**Interfaces:**
- Consumes: repository root C:/Users/Lenovo/Desktop/Quarkbobo; destination must not exist.
- Produces: verified standalone Tarot project and repoRoot, exists(relativePath), read(relativePath) test helpers.

- [ ] **Step 1: Capture clean source and generated-route baselines**

Run:

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

Expected: fresh suite passes and both temp manifests exist.

- [ ] **Step 2: Write the failing boundary test**

Create test/repository-structure.test.cjs:

~~~js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const exists = relativePath => fs.existsSync(path.join(repoRoot, relativePath))
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('the unrelated Tarot Reigns project is not bundled inside the blog repository', () => {
  assert.equal(exists('tarot-reigns'), false)
})
~~~

- [ ] **Step 3: Run RED**

Run: node --test test/repository-structure.test.cjs

Expected: FAIL because tarot-reigns/ still exists.

- [ ] **Step 4: Copy and verify every original Tarot file**

~~~powershell
$repoRoot = (Resolve-Path -LiteralPath 'C:/Users/Lenovo/Desktop/Quarkbobo').Path
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

- [ ] **Step 5: Remove only verified caches, add external ignore rules, then remove repository copy**

Validate every cache target before removal:

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

Then run: git rm -r -- tarot-reigns

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
node --test test/repository-structure.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Tarot structure test failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- test/repository-structure.test.cjs
git commit -m "refactor: extract tarot project from blog"
~~~

### Task 2: Consolidate retained development documentation

**Files:**
- Modify: test/repository-structure.test.cjs
- Move: docs/superpowers/specs/*.md to docs/development/specs/
- Move: docs/superpowers/plans/*.md to docs/development/plans/
- Move: docs/verification/*.md to docs/development/verification/
- Modify after move: docs/development/plans/2026-08-30-high-energy-ringed-star.md
- Modify after move: docs/development/plans/2026-08-31-realistic-canvas-ringed-planet.md

**Interfaces:**
- Consumes: exists(relativePath) from Task 1.
- Produces: one development-document hierarchy; docs/recovery/ stays unchanged.

- [ ] **Step 1: Append the failing layout test**

~~~js
test('development records use one hierarchy while recovery stays separate', () => {
  for (const directory of [
    'docs/development/specs',
    'docs/development/plans',
    'docs/development/verification',
    'docs/recovery'
  ]) assert.equal(exists(directory), true, directory)

  assert.equal(exists('docs/superpowers'), false)
  assert.equal(exists('docs/verification'), false)
})
~~~

- [ ] **Step 2: Run RED**

Run: node --test test/repository-structure.test.cjs

Expected: FAIL because both old document roots still exist.

- [ ] **Step 3: Move documents with Git history**

~~~powershell
New-Item -ItemType Directory -Force -Path 'docs/development/specs','docs/development/plans','docs/development/verification' | Out-Null
Get-ChildItem -File -LiteralPath 'docs/superpowers/specs' | ForEach-Object { git mv -- $_.FullName 'docs/development/specs/' }
Get-ChildItem -File -LiteralPath 'docs/superpowers/plans' | ForEach-Object { git mv -- $_.FullName 'docs/development/plans/' }
Get-ChildItem -File -LiteralPath 'docs/verification' | ForEach-Object { git mv -- $_.FullName 'docs/development/verification/' }
~~~

- [ ] **Step 4: Update active navigational references**

With apply_patch:

- In docs/development/plans/2026-08-30-high-energy-ringed-star.md, replace docs/verification/ with docs/development/verification/.
- In docs/development/plans/2026-08-31-realistic-canvas-ringed-planet.md, replace docs/superpowers/specs/ with docs/development/specs/ and docs/verification/ with docs/development/verification/.
- Do not change the explicit old-to-new mapping in the cleanup design specification.

Verify:

~~~powershell
rg -n "docs/(superpowers|verification)/" docs/development/plans/2026-08-30-high-energy-ringed-star.md docs/development/plans/2026-08-31-realistic-canvas-ringed-planet.md
~~~

Expected: no matches.

- [ ] **Step 5: Run GREEN and commit**

~~~powershell
node --test test/repository-structure.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Documentation structure test failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- docs test/repository-structure.test.cjs
git commit -m "docs: consolidate development records"
~~~

### Task 3: Remove verified legacy files and dependencies

**Files:**
- Modify: test/repository-structure.test.cjs
- Modify: package.json
- Modify: package-lock.json
- Delete: .codebuddy/settings.local.json
- Delete: _config.landscape.yml
- Delete: desktop.ini
- Delete: render.yaml
- Delete: themes/.gitkeep

**Interfaces:**
- Consumes: exists(relativePath) and read(relativePath).
- Produces: one active Hexo theme dependency set with no broken deployment descriptor.

- [ ] **Step 1: Append the failing legacy-surface test**

~~~js
test('obsolete theme, deployment, editor, and placeholder artifacts are absent', () => {
  for (const relativePath of [
    '.codebuddy',
    '_config.landscape.yml',
    'desktop.ini',
    'render.yaml',
    'themes/.gitkeep'
  ]) assert.equal(exists(relativePath), false, relativePath)

  const packageJson = JSON.parse(read('package.json'))
  assert.equal(packageJson.dependencies['hexo-theme-landscape'], undefined)
  assert.equal(packageJson.dependencies['hexo-renderer-stylus'], undefined)
})
~~~

- [ ] **Step 2: Run RED**

Run: node --test test/repository-structure.test.cjs

Expected: FAIL on the tracked files and both dependencies.

- [ ] **Step 3: Delete only approved tracked files**

Use apply_patch to delete the five paths listed above. Inspect:

~~~powershell
git status --short -- .codebuddy _config.landscape.yml desktop.ini render.yaml themes/.gitkeep
~~~

- [ ] **Step 4: Remove unused packages through npm**

~~~powershell
npm uninstall hexo-theme-landscape hexo-renderer-stylus --save
if ($LASTEXITCODE -ne 0) { throw 'npm dependency removal failed.' }
npm explain hexo-theme-landscape
if ($LASTEXITCODE -eq 0) { throw 'Landscape package is still installed.' }
npm explain hexo-renderer-stylus
if ($LASTEXITCODE -eq 0) { throw 'Stylus renderer is still installed.' }
~~~

- [ ] **Step 5: Run GREEN, build, and commit**

~~~powershell
node --test test/repository-structure.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Legacy surface test failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed after dependency removal.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -A -- package.json package-lock.json test/repository-structure.test.cjs .codebuddy _config.landscape.yml desktop.ini render.yaml themes/.gitkeep
git commit -m "chore: remove obsolete blog scaffolding"
~~~

### Task 4: Protect downloads and ignore local-only artifacts

**Files:**
- Modify: test/repository-structure.test.cjs
- Modify: .gitignore
- Remove ignored generated state: public/, db.json, .worktrees/

**Interfaces:**
- Consumes: exists(relativePath), read(relativePath), fs, path.
- Produces: exact 12-file download contract and durable ignore rules.

- [ ] **Step 1: Append failing ignore rule and passing download tests**

~~~js
test('local Windows, editor, and Python artifacts stay ignored', () => {
  const lines = new Set(read('.gitignore').split(/\r?\n/))
  for (const pattern of ['desktop.ini', '.codebuddy/', '__pycache__/', '*.py[cod]']) {
    assert.equal(lines.has(pattern), true, pattern)
  }
})

test('all approved backup downloads keep their exact public names', () => {
  const expected = [
    '1月_new_questions.txt',
    '1月_new_questions.xlsx',
    '1月学生政治理论学习月测（自测）_final.txt',
    '1月学生政治理论学习月测（自测）_final.xlsx',
    '202603.xlsx',
    '202603new_questions(1).txt',
    '202604new_questions.txt',
    '202604new_questions.xlsx',
    '2月学生政治理论学习月测（自测）.txt',
    '2月学生政治理论学习月测（自测）.xlsx',
    '5.txt',
    '5.xlsx'
  ]
  const actual = fs.readdirSync(path.join(repoRoot, 'source/files/backup')).sort()
  assert.deepEqual(actual, expected.sort())
})
~~~

- [ ] **Step 2: Run RED**

Run: node --test test/repository-structure.test.cjs

Expected: download test PASS; ignore rule test FAIL.

- [ ] **Step 3: Add exact rules with apply_patch**

~~~gitignore
desktop.ini
.codebuddy/
__pycache__/
*.py[cod]
~~~

- [ ] **Step 4: Clean generated state with exact target checks**

~~~powershell
npm run clean
if ($LASTEXITCODE -ne 0) { throw 'Hexo clean failed.' }

$repoRoot = (Resolve-Path -LiteralPath 'C:/Users/Lenovo/Desktop/Quarkbobo').Path
$candidate = Join-Path $repoRoot '.worktrees'
if (Test-Path -LiteralPath $candidate) {
  $target = (Resolve-Path -LiteralPath $candidate).Path
  $expected = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.worktrees'))
  if (-not $target.Equals($expected, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $target" }
  if (@(Get-ChildItem -Force -LiteralPath $target).Count -ne 0) { throw '.worktrees is not empty.' }
  Remove-Item -LiteralPath $target
}
~~~

Expected: public/, db.json, and empty .worktrees/ are absent; node_modules/ remains.

- [ ] **Step 5: Run GREEN and commit**

~~~powershell
node --test test/repository-structure.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Boundary tests failed.' }
git check-ignore -v -- desktop.ini .codebuddy/settings.local.json sample/__pycache__/x.pyc
if ($LASTEXITCODE -ne 0) { throw 'Ignore rules are inactive.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- .gitignore test/repository-structure.test.cjs
git commit -m "test: protect clean repository boundaries"
~~~

### Task 5: Archive completed root planning logs

**Files:**
- Modify: test/repository-structure.test.cjs
- Move: task_plan.md to docs/development/logs/task_plan.md
- Move: findings.md to docs/development/logs/findings.md
- Move: progress.md to docs/development/logs/progress.md

**Interfaces:**
- Consumes: exists(relativePath).
- Produces: clean repository root and retained planning history.

- [ ] **Step 1: Update all three logs before archival**

Use apply_patch to record Tasks 1-4, their commits, tests, errors, and one remaining phase: final verification.

- [ ] **Step 2: Append the failing archival test**

~~~js
test('completed planning logs are archived outside the repository root', () => {
  for (const name of ['task_plan.md', 'findings.md', 'progress.md']) {
    assert.equal(exists(name), false, name)
    assert.equal(exists(path.join('docs/development/logs', name)), true, name)
  }
})
~~~

- [ ] **Step 3: Run RED**

Run: node --test test/repository-structure.test.cjs

Expected: FAIL because the three logs remain at root.

- [ ] **Step 4: Move logs with history and update retained paths**

~~~powershell
New-Item -ItemType Directory -Force -Path 'docs/development/logs' | Out-Null
git mv -- task_plan.md docs/development/logs/task_plan.md
git mv -- findings.md docs/development/logs/findings.md
git mv -- progress.md docs/development/logs/progress.md
~~~

With apply_patch in docs/development/logs/progress.md:

- Replace docs/superpowers/specs/ with docs/development/specs/.
- Replace docs/superpowers/plans/ with docs/development/plans/.
- Keep historical commit IDs and recovery paths unchanged.

- [ ] **Step 5: Run GREEN and commit**

~~~powershell
node --test test/repository-structure.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Log archival test failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed.' }
git add -- docs/development/logs test/repository-structure.test.cjs
git commit -m "docs: archive completed project logs"
~~~

### Task 6: Verify the cleaned repository and record evidence

**Files:**
- Create: docs/development/verification/2026-08-31-repository-cleanup.md
- Verify unchanged: source/, themes/fluid-particle/, tools/quark-blog-tools.ps1, generated routes, external TarotReigns/.

**Interfaces:**
- Consumes: the three Task 1 temp manifests.
- Produces: final verification record and clean generated-output state.

- [ ] **Step 1: Run full fresh tests and the PowerShell tool contract**

~~~powershell
npm run test:fresh
if ($LASTEXITCODE -ne 0) { throw 'Final test:fresh failed.' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test/quark-blog-tools.test.ps1
if ($LASTEXITCODE -ne 0) { throw 'Quark blog tools test failed.' }
~~~

Expected: all Node/Chrome tests pass and PowerShell prints PASS: quark-blog-tools contract.

- [ ] **Step 2: Compare routes and authored source to Task 1 baselines**

~~~powershell
$routeBaseline = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-route-baseline.txt'
$sourceBaseline = Join-Path ([System.IO.Path]::GetTempPath()) 'quarkbobo-source-baseline.json'
if (-not (Test-Path $routeBaseline) -or -not (Test-Path $sourceBaseline)) { throw 'Cleanup baselines are missing.' }

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

- [ ] **Step 4: Create final verification record**

Create docs/development/verification/2026-08-31-repository-cleanup.md with:

- tested branch and commit;
- exact Node test count and PowerShell result;
- route/source/Tarot manifest comparison results;
- removed dependencies and files;
- retained 12 download names;
- confirmation that content, theme production files, tools, and remote state stayed in scope;
- recovery path from docs/recovery/2026-08-28-redesign-backup.md.

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

Expected: final status is clean, generated output is absent, node_modules/ remains, and no push has occurred.
