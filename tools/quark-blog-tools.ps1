[CmdletBinding()]
param(
    [ValidateSet('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')]
    [string]$Action = 'Menu',

    [switch]$NoRun,

    [string]$CommitMessage = 'chore: publish blog updates'
)

$script:QuarkBlogActions = @('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')

function Get-QuarkText {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Key
    )

    $escapedText = switch ($Key) {
        'FirstPublishPrompt' { '\u8f93\u5165\u5927\u5199 P \u6682\u5b58\u5168\u90e8\u66f4\u6539\uff1b\u5176\u4ed6\u952e\u53d6\u6d88' }
        'SecondPublishPrompt' { '\u518d\u6b21\u8f93\u5165\u5927\u5199 P \u63d0\u4ea4\u5e76\u666e\u901a\u63a8\u9001\uff1b\u5176\u4ed6\u952e\u53d6\u6d88\uff08\u66f4\u6539\u5c06\u4fdd\u7559\u4e3a\u5df2\u6682\u5b58\uff09' }
        'FirstPublishCancelled' { '\u5df2\u53d6\u6d88\u53d1\u5e03\uff1b\u6ca1\u6709\u65b0\u589e\u6682\u5b58\uff0c\u4e5f\u672a\u63d0\u4ea4\u6216\u63a8\u9001\u3002' }
        'SecondPublishCancelled' { '\u5df2\u53d6\u6d88\u53d1\u5e03\uff1b\u66f4\u6539\u5df2\u4fdd\u7559\u4e3a\u6682\u5b58\u72b6\u6001\uff0c\u5c1a\u672a\u63d0\u4ea4\u6216\u63a8\u9001\u3002' }
        'BranchHeading' { '\u5f53\u524d\u53d1\u5e03\u5206\u652f\uff1a' }
        'StatusHeading' { '\u53d1\u5e03\u524d\u5de5\u4f5c\u533a\u72b6\u6001\uff08\u542b\u672a\u8ddf\u8e2a\u6587\u4ef6\uff09\uff1a' }
        'UnstagedStatHeading' { '\u53d1\u5e03\u524d\u672a\u6682\u5b58\u66f4\u6539\u7edf\u8ba1\uff1a' }
        'InitialCachedNamesHeading' { '\u53d1\u5e03\u524d\u5df2\u6682\u5b58\u66f4\u6539\uff08\u540d\u79f0\u4e0e\u72b6\u6001\uff09\uff1a' }
        'InitialCachedStatHeading' { '\u53d1\u5e03\u524d\u5df2\u6682\u5b58\u66f4\u6539\u7edf\u8ba1\uff1a' }
        'FinalCachedNamesHeading' { '\u6682\u5b58\u5168\u90e8\u66f4\u6539\u540e\u7684\u540d\u79f0\u4e0e\u72b6\u6001\uff1a' }
        'FinalCachedStatHeading' { '\u6682\u5b58\u5168\u90e8\u66f4\u6539\u540e\u7684\u7edf\u8ba1\uff1a' }
        'NothingToCommit' { '\u6ca1\u6709\u53ef\u63d0\u4ea4\u7684\u66f4\u6539\uff1b\u5c06\u53ea\u6267\u884c\u666e\u901a\u63a8\u9001\u3002' }
        'MenuTitle' { 'Quark \u535a\u5ba2\u5de5\u5177' }
        'MenuOpenPosts' { '1. \u6253\u5f00\u6587\u7ae0\u76ee\u5f55' }
        'MenuPreview' { '2. \u9884\u89c8\u535a\u5ba2' }
        'MenuBuild' { '3. \u6784\u5efa\u535a\u5ba2' }
        'MenuPublish' { '4. \u5b89\u5168\u53d1\u5e03' }
        'MenuCancel' { '0. \u53d6\u6d88' }
        'MenuPrompt' { '\u8bf7\u9009\u62e9\u64cd\u4f5c' }
        'MenuUnknown' { '\u65e0\u6cd5\u8bc6\u522b\u8be5\u9009\u9879\uff0c\u672a\u6267\u884c\u4efb\u4f55\u64cd\u4f5c\u3002' }
        'MenuFailurePrefix' { '\u535a\u5ba2\u5de5\u5177\u8fd0\u884c\u5931\u8d25\uff1a' }
        'MenuRecovery' { '\u8bf7\u68c0\u67e5\u9879\u76ee\u8def\u5f84\uff0c\u4ee5\u53ca Git\u3001Node.js/npm \u662f\u5426\u53ef\u7528\uff1b\u4fee\u590d\u540e\u91cd\u65b0\u6253\u5f00\u201cQuark\u535a\u5ba2\u5de5\u5177\u201d\u5feb\u6377\u65b9\u5f0f\u3002' }
        'MenuPause' { '\u6309\u56de\u8f66\u952e\u5173\u95ed\u7a97\u53e3' }
        default { throw "Unknown localized text key: $Key" }
    }

    [regex]::Unescape($escapedText)
}

function Get-QuarkBlogPaths {
    [CmdletBinding()]
    param()

    [pscustomobject]@{
        Project = 'C:\Users\Lenovo\Desktop\Quarkbobo'
        Posts   = 'C:\Users\Lenovo\Desktop\Quarkbobo\source\_posts'
    }
}

function Get-QuarkPublishCommands {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$CommitMessage
    )

    $displayMessage = "'" + $CommitMessage.Replace("'", "''") + "'"
    @(
        'git symbolic-ref --quiet --short HEAD'
        'git status --short --branch'
        'git diff --stat'
        'git diff --cached --name-status'
        'git diff --cached --stat'
        'git add --all'
        'git diff --cached --name-status'
        'git diff --cached --stat'
        "git commit -m $displayMessage"
        'git push origin master'
    )
}

function ConvertTo-QuarkWindowsCommandLineArgument {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [AllowEmptyString()]
        [string]$Argument
    )

    if ($null -eq $Argument) {
        $Argument = ''
    }

    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append([char]0x22)
    $backslashCount = 0

    foreach ($character in $Argument.ToCharArray()) {
        if ([int]$character -eq 0x5C) {
            $backslashCount++
            continue
        }

        if ([int]$character -eq 0x22) {
            [void]$builder.Append([char]0x5C, (($backslashCount * 2) + 1))
            [void]$builder.Append([char]0x22)
            $backslashCount = 0
            continue
        }

        if ($backslashCount -gt 0) {
            [void]$builder.Append([char]0x5C, $backslashCount)
            $backslashCount = 0
        }
        [void]$builder.Append($character)
    }

    if ($backslashCount -gt 0) {
        [void]$builder.Append([char]0x5C, ($backslashCount * 2))
    }
    [void]$builder.Append([char]0x22)
    $builder.ToString()
}

function Invoke-QuarkNativeCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [string[]]$ArgumentList = @(),

        [string]$WorkingDirectory
    )

    try {
        $application = @(Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop)[0]
    }
    catch {
        throw "Native command '$FilePath' was not found."
    }

    # Windows PowerShell 5 runs on .NET Framework, whose ProcessStartInfo has
    # no ArgumentList API. Serialize each already-separated argument with the
    # Windows CRT quoting rules; no shell or expression evaluator is involved.
    $serializedArguments = @(
        $ArgumentList | ForEach-Object {
            ConvertTo-QuarkWindowsCommandLineArgument -Argument $_
        }
    ) -join ' '

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $application.Source
    $startInfo.Arguments = $serializedArguments
    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        $startInfo.WorkingDirectory = $WorkingDirectory
    }
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        try {
            if (-not $process.Start()) {
                throw "Native command '$FilePath' did not start."
            }
        }
        catch {
            throw "Native command '$FilePath' could not start: $($_.Exception.Message)"
        }

        $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
        $standardErrorTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $standardOutput = $standardOutputTask.GetAwaiter().GetResult()
        $standardError = $standardErrorTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }

    $output = @(
        @($standardOutput, $standardError) |
            Where-Object { -not [string]::IsNullOrEmpty($_) } |
            ForEach-Object { $_ -split "\r?\n" } |
            Where-Object { $_.Length -gt 0 }
    )
    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @($output)
    }
}

function Invoke-QuarkOpenPosts {
    [CmdletBinding()]
    param()

    $paths = Get-QuarkBlogPaths
    Start-Process -FilePath 'explorer.exe' -ArgumentList @($paths.Posts) -ErrorAction Stop
}

function Invoke-QuarkPreview {
    [CmdletBinding()]
    param()

    $paths = Get-QuarkBlogPaths
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'server') -WorkingDirectory $paths.Project -WindowStyle Hidden -ErrorAction Stop
}

function Invoke-QuarkBuild {
    [CmdletBinding()]
    param(
        [scriptblock]$CommandRunner
    )

    if ($null -eq $CommandRunner) {
        $CommandRunner = {
            param(
                [string]$FilePath,
                [string[]]$ArgumentList,
                [string]$WorkingDirectory
            )

            Invoke-QuarkNativeCommand -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory
        }
    }

    $paths = Get-QuarkBlogPaths
    Push-Location -LiteralPath $paths.Project -ErrorAction Stop
    try {
        $cleanArguments = [string[]]@('run', 'clean')
        $cleanResult = & $CommandRunner -FilePath 'npm.cmd' -ArgumentList $cleanArguments -WorkingDirectory $paths.Project
        @($cleanResult.Output) | Write-Output
        if ($cleanResult.ExitCode -ne 0) {
            throw 'Clean failed; build was not started.'
        }

        $buildArguments = [string[]]@('run', 'build')
        $buildResult = & $CommandRunner -FilePath 'npm.cmd' -ArgumentList $buildArguments -WorkingDirectory $paths.Project
        @($buildResult.Output) | Write-Output
        if ($buildResult.ExitCode -ne 0) {
            throw 'Build failed.'
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-QuarkPublish {
    [CmdletBinding()]
    param(
        [string]$CommitMessage = 'chore: publish blog updates',

        [scriptblock]$CommandRunner,

        [scriptblock]$ConfirmationReader
    )

    if ($null -eq $CommandRunner) {
        $CommandRunner = {
            param(
                [string]$FilePath,
                [string[]]$ArgumentList
            )

            Invoke-QuarkNativeCommand -FilePath $FilePath -ArgumentList $ArgumentList
        }
    }
    if ($null -eq $ConfirmationReader) {
        $ConfirmationReader = {
            param([string]$Prompt)
            Read-Host $Prompt
        }
    }

    $paths = Get-QuarkBlogPaths

    $branchArguments = [string[]]@('-C', $paths.Project, 'symbolic-ref', '--quiet', '--short', 'HEAD')
    $branchResult = & $CommandRunner -FilePath 'git' -ArgumentList $branchArguments
    if ($branchResult.ExitCode -ne 0) {
        throw ([regex]::Unescape('\u65e0\u6cd5\u786e\u8ba4\u5f53\u524d Git \u5206\u652f\uff0c\u5df2\u505c\u6b62\u53d1\u5e03\uff1b\u6ca1\u6709\u6682\u5b58\u4efb\u4f55\u65b0\u66f4\u6539\u3002'))
    }
    $branch = @($branchResult.Output | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if (($branch.Count -ne 1) -or ($branch[0] -cne 'master')) {
        $detectedBranch = if ($branch.Count -eq 1) { [string]$branch[0] } else { '<unknown>' }
        throw (([regex]::Unescape('\u5f53\u524d\u5206\u652f\u4e0d\u662f master\uff08\u68c0\u6d4b\u5230\uff1a{0}\uff09\uff0c\u5df2\u505c\u6b62\u53d1\u5e03\uff1b\u6ca1\u6709\u6682\u5b58\u4efb\u4f55\u65b0\u66f4\u6539\u3002')) -f $detectedBranch)
    }
    Write-Host "$(Get-QuarkText -Key 'BranchHeading') $($branch[0])"

    $statusArguments = [string[]]@('-C', $paths.Project, 'status', '--short', '--branch')
    $statusResult = & $CommandRunner -FilePath 'git' -ArgumentList $statusArguments
    Write-Host (Get-QuarkText -Key 'StatusHeading')
    @($statusResult.Output) | Write-Output
    if ($statusResult.ExitCode -ne 0) {
        throw 'Status failed; no changes were staged.'
    }

    $diffArguments = [string[]]@('-C', $paths.Project, 'diff', '--stat')
    $diffResult = & $CommandRunner -FilePath 'git' -ArgumentList $diffArguments
    Write-Host (Get-QuarkText -Key 'UnstagedStatHeading')
    @($diffResult.Output) | Write-Output
    if ($diffResult.ExitCode -ne 0) {
        throw 'Diff summary failed; no changes were staged.'
    }

    $initialCachedNamesArguments = [string[]]@('-C', $paths.Project, 'diff', '--cached', '--name-status')
    $initialCachedNamesResult = & $CommandRunner -FilePath 'git' -ArgumentList $initialCachedNamesArguments
    Write-Host (Get-QuarkText -Key 'InitialCachedNamesHeading')
    @($initialCachedNamesResult.Output) | Write-Output
    if ($initialCachedNamesResult.ExitCode -ne 0) {
        throw 'Initial staged name/status preview failed; no new changes were staged.'
    }

    $initialCachedStatArguments = [string[]]@('-C', $paths.Project, 'diff', '--cached', '--stat')
    $initialCachedStatResult = & $CommandRunner -FilePath 'git' -ArgumentList $initialCachedStatArguments
    Write-Host (Get-QuarkText -Key 'InitialCachedStatHeading')
    @($initialCachedStatResult.Output) | Write-Output
    if ($initialCachedStatResult.ExitCode -ne 0) {
        throw 'Initial staged stat preview failed; no new changes were staged.'
    }

    $choice = & $ConfirmationReader (Get-QuarkText -Key 'FirstPublishPrompt')
    if ($choice -cne 'P') {
        Write-Host (Get-QuarkText -Key 'FirstPublishCancelled')
        return
    }

    $addArguments = [string[]]@('-C', $paths.Project, 'add', '--all')
    $addResult = & $CommandRunner -FilePath 'git' -ArgumentList $addArguments
    @($addResult.Output) | Write-Output
    if ($addResult.ExitCode -ne 0) {
        throw 'Add failed; changes remain unstaged or partially staged.'
    }

    $finalCachedNamesArguments = [string[]]@('-C', $paths.Project, 'diff', '--cached', '--name-status')
    $finalCachedNamesResult = & $CommandRunner -FilePath 'git' -ArgumentList $finalCachedNamesArguments
    Write-Host (Get-QuarkText -Key 'FinalCachedNamesHeading')
    @($finalCachedNamesResult.Output) | Write-Output
    if ($finalCachedNamesResult.ExitCode -ne 0) {
        throw 'Final staged name/status preview failed; commit and push were not attempted.'
    }

    $finalCachedStatArguments = [string[]]@('-C', $paths.Project, 'diff', '--cached', '--stat')
    $finalCachedStatResult = & $CommandRunner -FilePath 'git' -ArgumentList $finalCachedStatArguments
    Write-Host (Get-QuarkText -Key 'FinalCachedStatHeading')
    @($finalCachedStatResult.Output) | Write-Output
    if ($finalCachedStatResult.ExitCode -ne 0) {
        throw 'Final staged stat preview failed; commit and push were not attempted.'
    }

    $secondChoice = & $ConfirmationReader (Get-QuarkText -Key 'SecondPublishPrompt')
    if ($secondChoice -cne 'P') {
        Write-Host (Get-QuarkText -Key 'SecondPublishCancelled')
        return
    }

    $staged = @($finalCachedNamesResult.Output | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if ($staged.Count -eq 0) {
        Write-Host (Get-QuarkText -Key 'NothingToCommit')
    }

    if ($staged.Count -gt 0) {
        $commitArguments = [string[]]@('-C', $paths.Project, 'commit', '-m', $CommitMessage)
        $commitResult = & $CommandRunner -FilePath 'git' -ArgumentList $commitArguments
        @($commitResult.Output) | Write-Output
        if ($commitResult.ExitCode -ne 0) {
            throw 'Commit failed; changes remain local.'
        }
    }

    $pushArguments = [string[]]@('-C', $paths.Project, 'push', 'origin', 'master')
    $pushResult = & $CommandRunner -FilePath 'git' -ArgumentList $pushArguments
    @($pushResult.Output) | Write-Output
    if ($pushResult.ExitCode -ne 0) {
        throw 'Push failed; commit remains local and can be retried.'
    }
}

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

function Show-QuarkBlogMenu {
    [CmdletBinding()]
    param(
        [string]$CommitMessage = 'chore: publish blog updates',

        [scriptblock]$SelectionReader
    )

    if ($null -eq $SelectionReader) {
        $SelectionReader = {
            param([string]$Prompt)
            Read-Host $Prompt
        }
    }

    Write-Host ''
    Write-Host (Get-QuarkText -Key 'MenuTitle')
    Write-Host (Get-QuarkText -Key 'MenuOpenPosts')
    Write-Host (Get-QuarkText -Key 'MenuPreview')
    Write-Host (Get-QuarkText -Key 'MenuBuild')
    Write-Host (Get-QuarkText -Key 'MenuPublish')
    Write-Host (Get-QuarkText -Key 'MenuCancel')
    $selection = & $SelectionReader (Get-QuarkText -Key 'MenuPrompt')

    switch ($selection) {
        '1' { Invoke-QuarkOpenPosts }
        '2' { Invoke-QuarkPreview }
        '3' { Invoke-QuarkBuild }
        '4' { Invoke-QuarkPublish -CommitMessage $CommitMessage }
        '0' { return }
        default { Write-Host (Get-QuarkText -Key 'MenuUnknown') }
    }
}

function Invoke-QuarkBlogAction {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')]
        [string]$Action,

        [string]$CommitMessage = 'chore: publish blog updates'
    )

    switch ($Action) {
        'Menu' {
            Show-QuarkBlogMenu -CommitMessage $CommitMessage
        }
        'OpenPosts' {
            Invoke-QuarkOpenPosts
        }
        'Preview' {
            Invoke-QuarkPreview
        }
        'Build' {
            Invoke-QuarkBuild
        }
        'Publish' {
            Invoke-QuarkPublish -CommitMessage $CommitMessage
        }
        'Describe' {
            $paths = Get-QuarkBlogPaths
            [ordered]@{
                Paths = [ordered]@{
                    Project = $paths.Project
                    Posts   = $paths.Posts
                }
                Actions = [string[]]$script:QuarkBlogActions
            } | ConvertTo-Json -Depth 3
        }
    }
}

function Invoke-QuarkBlogEntryPoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')]
        [string]$Action,

        [string]$CommitMessage = 'chore: publish blog updates',

        [scriptblock]$ActionDispatcher,

        [scriptblock]$PauseReader,

        [Parameter(Mandatory)]
        [ref]$ExitCode
    )

    if ($null -eq $ActionDispatcher) {
        $ActionDispatcher = {
            param([string]$SelectedAction, [string]$SelectedCommitMessage)
            Invoke-QuarkBlogAction -Action $SelectedAction -CommitMessage $SelectedCommitMessage
        }
    }
    if ($null -eq $PauseReader) {
        $PauseReader = {
            param([string]$Prompt)
            Read-Host $Prompt
        }
    }

    $ExitCode.Value = 0
    try {
        & $ActionDispatcher $Action $CommitMessage
    }
    catch {
        if ($Action -ne 'Menu') {
            throw
        }

        $ExitCode.Value = 1
        Write-Host "$(Get-QuarkText -Key 'MenuFailurePrefix') $($_.Exception.Message)"
        Write-Host (Get-QuarkText -Key 'MenuRecovery')
        $null = & $PauseReader (Get-QuarkText -Key 'MenuPause')
    }
}

if ($NoRun) {
    return
}

$quarkExitCode = 0
Invoke-QuarkBlogEntryPoint -Action $Action -CommitMessage $CommitMessage -ExitCode ([ref]$quarkExitCode)
if ($quarkExitCode -ne 0) {
    exit $quarkExitCode
}
