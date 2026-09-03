[CmdletBinding()]
param(
    [string]$RepositoryPath,
    [ValidateRange(0, 60)][int]$SuccessDelaySeconds = 1,
    [switch]$NonInteractive
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    $RepositoryPath = Split-Path -Parent $PSScriptRoot
}

function Get-FrontMatter {
    param([string]$Content)

    $match = [regex]::Match(
        $Content,
        '(?s)^\s*---\s*(.*?)\s*---\s*',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return $null
}

function Get-FrontMatterValue {
    param(
        [AllowNull()][string]$FrontMatter,
        [string]$Key
    )

    if (-not $FrontMatter) { return $null }
    $pattern = "(?m)^\s*$([regex]::Escape($Key))\s*:\s*[`"']?(.*?)[`"']?\s*$"
    $match = [regex]::Match($FrontMatter, $pattern)
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return $null
}

function Get-HtmlTitle {
    param([string]$Content)

    $match = [regex]::Match(
        $Content,
        '(?i)<title>\s*(.*?)\s*</title>',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return $null
}

function Write-BlogCatalogue {
    param([string]$RepoPath)

    $postsPath = [System.IO.Path]::GetFullPath((Join-Path $RepoPath 'source\_posts'))
    $outputFile = [System.IO.Path]::GetFullPath((Join-Path $postsPath '博客目录.md'))
    if (-not (Test-Path -LiteralPath $postsPath -PathType Container)) {
        throw "文章目录不存在：$postsPath"
    }

    $categories = @{}
    $postsPrefix = $postsPath.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

    $allFiles = Get-ChildItem -LiteralPath $postsPath -Recurse -File |
        Where-Object {
            $_.Extension -match '^(?:\.md|\.markdown|\.html|\.htm)$' -and
            [System.IO.Path]::GetFullPath($_.FullName) -ne $outputFile
        } |
        Sort-Object FullName

    foreach ($file in $allFiles) {
        $fileName = $file.BaseName
        $fileExtension = $file.Extension.ToLowerInvariant()
        $relativePath = $file.FullName.Substring($postsPrefix.Length)
        $relativeSegments = @($relativePath -split '[\\/]')
        $category = if ($relativeSegments.Count -gt 1) { $relativeSegments[0] } else { '未分类' }
        if (-not $categories.ContainsKey($category)) { $categories[$category] = @() }
        $title = $fileName -replace '\s+', '-'
        $relativeRoute = [System.IO.Path]::ChangeExtension($relativePath, $null).TrimEnd('.')
        $permalink = ($relativeRoute -replace '\\', '/') -replace '\s+', '-'
        $frontMatter = $null

        try {
            $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
            $frontMatter = Get-FrontMatter $content
            if ($fileExtension -in @('.md', '.markdown')) {
                $frontMatterTitle = Get-FrontMatterValue $frontMatter 'title'
                if ($frontMatterTitle) { $title = $frontMatterTitle }
                $frontMatterPermalink = Get-FrontMatterValue $frontMatter 'permalink'
                if ($frontMatterPermalink) { $permalink = $frontMatterPermalink }
            } else {
                $htmlTitle = Get-HtmlTitle $content
                if ($htmlTitle) { $title = $htmlTitle }
            }
        } catch {
            Write-Host "警告：无法读取 $($file.FullName)，将使用文件名。" -ForegroundColor Yellow
        }

        $categories[$category] += [pscustomobject]@{
            Title = $title
            Permalink = $permalink
            FileExtension = $fileExtension
        }
    }

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('---')
    $lines.Add('title: 博客目录')
    $lines.Add('permalink: /')
    $lines.Add('---')
    $lines.Add('')
    $lines.Add('## 📚 文章分类')
    $lines.Add('')

    $categoryNames = @($categories.Keys | Sort-Object)
    if ($categoryNames -contains '未分类') {
        $categoryNames = @($categoryNames | Where-Object { $_ -ne '未分类' }) + @('未分类')
    }
    foreach ($categoryName in $categoryNames) {
        $articles = @($categories[$categoryName] | Sort-Object Title, Permalink)
        if (-not $articles -or $articles.Count -eq 0) { continue }
        $lines.Add("### $categoryName")
        $lines.Add('')
        foreach ($article in $articles) {
            $line = "- [$($article.Title)]($($article.Permalink))"
            if ($article.FileExtension -match '\.html?$') { $line += ' (HTML)' }
            $lines.Add($line)
        }
        $lines.Add('')
    }

    $lines.Add('---')
    $lines.Add('')
    $lines.Add("*最后更新：$(Get-Date -Format 'yyyy-MM-dd')*")
    Set-Content -LiteralPath $outputFile -Value ($lines -join [Environment]::NewLine) -Encoding UTF8
    Write-Host "目录已生成：$outputFile" -ForegroundColor Cyan
}

function Invoke-CheckedGit {
    param(
        [string]$Stage,
        [string[]]$Arguments
    )

    & git -C $RepositoryPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Stage 失败（Git 退出码 $LASTEXITCODE）"
    }
}

try {
    $RepositoryPath = [System.IO.Path]::GetFullPath($RepositoryPath)
    if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) {
        throw "仓库目录不存在：$RepositoryPath"
    }

    $resolvedRoot = (& git -C $RepositoryPath rev-parse --show-toplevel 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "目标不是 Git 仓库：$RepositoryPath" }
    $resolvedRoot = [System.IO.Path]::GetFullPath($resolvedRoot)
    if (-not $resolvedRoot.Equals($RepositoryPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "必须直接指定仓库根目录：$resolvedRoot"
    }

    $currentBranch = (& git -C $RepositoryPath branch --show-current 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw '无法读取当前 Git 分支。' }
    if ($currentBranch -ne 'master') { throw "当前分支是 '$currentBranch'，必须切换到 master 后再上传。" }

    Write-BlogCatalogue $RepositoryPath
    Invoke-CheckedGit '暂存修改' @('add', '-A')

    & git -C $RepositoryPath diff --cached --quiet
    $stagedDifference = $LASTEXITCODE
    if ($stagedDifference -eq 1) {
        $message = "update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        Invoke-CheckedGit '创建提交' @('commit', '-m', $message)
    } elseif ($stagedDifference -ne 0) {
        throw "检查暂存修改失败（Git 退出码 $stagedDifference）"
    } else {
        Write-Host '没有需要提交的新修改，将继续同步远端。' -ForegroundColor Yellow
    }

    Invoke-CheckedGit '同步远端' @('pull', '--rebase', 'origin', 'master')
    Invoke-CheckedGit '上传到 GitHub' @('push', 'origin', 'master')

    Write-Host "上传成功，窗口将在 $SuccessDelaySeconds 秒后关闭。" -ForegroundColor Green
    Start-Sleep -Seconds $SuccessDelaySeconds
    exit 0
} catch {
    Write-Host ''
    Write-Host 'Bobo 一键更新失败：' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host '未执行强制推送或自动重置，请根据上方信息处理后重试。' -ForegroundColor Yellow
    if (-not $NonInteractive) { Read-Host '按回车关闭窗口' | Out-Null }
    exit 1
}
