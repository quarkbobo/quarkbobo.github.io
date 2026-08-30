[CmdletBinding()]
param(
    [ValidateSet('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')]
    [string]$Action = 'Menu',

    [switch]$NoRun,

    [string]$CommitMessage = 'chore: publish blog updates'
)

$script:QuarkBlogActions = @('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')

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
        'git status --short --branch'
        'git diff --stat'
        'git add --all'
        'git diff --cached --name-only'
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

    $statusArguments = [string[]]@('-C', $paths.Project, 'status', '--short', '--branch')
    $statusResult = & $CommandRunner -FilePath 'git' -ArgumentList $statusArguments
    @($statusResult.Output) | Write-Output
    if ($statusResult.ExitCode -ne 0) {
        throw 'Status failed; no changes were staged.'
    }

    $diffArguments = [string[]]@('-C', $paths.Project, 'diff', '--stat')
    $diffResult = & $CommandRunner -FilePath 'git' -ArgumentList $diffArguments
    @($diffResult.Output) | Write-Output
    if ($diffResult.ExitCode -ne 0) {
        throw 'Diff summary failed; no changes were staged.'
    }

    $confirmationPrompt = -join @(
        [char]0x8F93, [char]0x5165, ' P ', [char]0x7EE7, [char]0x7EED,
        [char]0x63D0, [char]0x4EA4, [char]0x5E76, [char]0x666E,
        [char]0x901A, [char]0x63A8, [char]0x9001, [char]0xFF1B,
        [char]0x5176, [char]0x4ED6, [char]0x952E, [char]0x53D6,
        [char]0x6D88
    )
    $choice = & $ConfirmationReader $confirmationPrompt
    if ($choice -cne 'P') {
        Write-Host 'Publish cancelled.'
        return
    }

    $addArguments = [string[]]@('-C', $paths.Project, 'add', '--all')
    $addResult = & $CommandRunner -FilePath 'git' -ArgumentList $addArguments
    @($addResult.Output) | Write-Output
    if ($addResult.ExitCode -ne 0) {
        throw 'Add failed; changes remain unstaged or partially staged.'
    }

    $stagedArguments = [string[]]@('-C', $paths.Project, 'diff', '--cached', '--name-only')
    $stagedResult = & $CommandRunner -FilePath 'git' -ArgumentList $stagedArguments
    if ($stagedResult.ExitCode -ne 0) {
        throw 'Staged diff failed; commit and push were not attempted.'
    }
    $staged = @($stagedResult.Output | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if ($staged.Count -eq 0) {
        Write-Host 'No staged changes to commit.'
        $emptyPushArguments = [string[]]@('-C', $paths.Project, 'push', 'origin', 'master')
        $emptyPushResult = & $CommandRunner -FilePath 'git' -ArgumentList $emptyPushArguments
        @($emptyPushResult.Output) | Write-Output
        if ($emptyPushResult.ExitCode -ne 0) {
            throw 'Push failed; local history can be retried.'
        }
        return
    }

    $commitArguments = [string[]]@('-C', $paths.Project, 'commit', '-m', $CommitMessage)
    $commitResult = & $CommandRunner -FilePath 'git' -ArgumentList $commitArguments
    @($commitResult.Output) | Write-Output
    if ($commitResult.ExitCode -ne 0) {
        throw 'Commit failed; changes remain local.'
    }

    $pushArguments = [string[]]@('-C', $paths.Project, 'push', 'origin', 'master')
    $pushResult = & $CommandRunner -FilePath 'git' -ArgumentList $pushArguments
    @($pushResult.Output) | Write-Output
    if ($pushResult.ExitCode -ne 0) {
        throw 'Push failed; commit remains local and can be retried.'
    }
}

function Show-QuarkBlogMenu {
    [CmdletBinding()]
    param(
        [string]$CommitMessage = 'chore: publish blog updates'
    )

    Write-Host ''
    Write-Host 'Quark Blog Tools'
    Write-Host '1. Open posts'
    Write-Host '2. Preview'
    Write-Host '3. Build'
    Write-Host '4. Publish safely'
    Write-Host '0. Cancel'
    $selection = Read-Host 'Select an action'

    switch ($selection) {
        '1' { Invoke-QuarkOpenPosts }
        '2' { Invoke-QuarkPreview }
        '3' { Invoke-QuarkBuild }
        '4' { Invoke-QuarkPublish -CommitMessage $CommitMessage }
        '0' { return }
        default { Write-Host 'Unknown selection; nothing was run.' }
    }
}

if ($NoRun) {
    return
}

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
    default {
        throw "Action '$Action' is not allowed."
    }
}
