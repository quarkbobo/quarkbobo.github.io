$ErrorActionPreference = 'Stop'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

$launcher = Join-Path $PSScriptRoot '../tools/quark-blog-tools.ps1'
Assert-True (Test-Path -LiteralPath $launcher -PathType Leaf) 'Launcher script is missing.'

$script:NoRunSideEffects = [System.Collections.Generic.List[string]]::new()
function Read-Host { param([string]$Prompt) [void]$script:NoRunSideEffects.Add("Read-Host:$Prompt") }
function Start-Process { [void]$script:NoRunSideEffects.Add('Start-Process') }
function git { [void]$script:NoRunSideEffects.Add('git') }
function npm.cmd { [void]$script:NoRunSideEffects.Add('npm.cmd') }

$noRunOutput = @()
foreach ($noRunAction in @('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe')) {
    $noRunOutput += @(. $launcher -NoRun -Action $noRunAction *>&1)
}

Remove-Item -LiteralPath Function:\Read-Host, Function:\Start-Process, Function:\git, Function:\npm.cmd -Force
Assert-True ($script:NoRunSideEffects.Count -eq 0) '-NoRun must not invoke menus or external processes.'
Assert-True ($noRunOutput.Count -eq 0) '-NoRun must not emit output.'

$requiredFunctions = @(
    'Get-QuarkBlogPaths'
    'Get-QuarkPublishCommands'
    'Invoke-QuarkOpenPosts'
    'Invoke-QuarkPreview'
    'Invoke-QuarkBuild'
    'Invoke-QuarkPublish'
    'Show-QuarkBlogMenu'
)
foreach ($functionName in $requiredFunctions) {
    Assert-True (Test-Path -LiteralPath "Function:\$functionName") "Missing required function: $functionName"
}

$paths = Get-QuarkBlogPaths
Assert-True ($paths.Project -eq 'C:\Users\Lenovo\Desktop\Quarkbobo') 'Wrong project path.'
Assert-True ($paths.Posts -eq 'C:\Users\Lenovo\Desktop\Quarkbobo\source\_posts') 'Wrong posts path.'

$commands = Get-QuarkPublishCommands -CommitMessage 'test message'
$joined = $commands -join "`n"
Assert-True ($joined -notmatch '--force') 'Publish must never force push.'
Assert-True ($joined -notmatch 'reset\s+--hard') 'Publish must never hard reset.'
Assert-True ($joined -match 'git status --short --branch') 'Publish must show status.'
Assert-True ($joined -match 'git diff --stat') 'Publish must show a diff summary.'
Assert-True ($joined -match 'git push origin master') 'Publish must use a normal master push.'

$specialMessage = 'fix: "quoted" & | ; $(New-Item BAD) ' + (-join @([char]0x4E2D, [char]0x6587))

function Assert-SequenceEqual {
    param(
        [object[]]$Actual,
        [object[]]$Expected,
        [string]$Message
    )

    Assert-True ($Actual.Count -eq $Expected.Count) "$Message Expected $($Expected.Count) items, got $($Actual.Count)."
    for ($index = 0; $index -lt $Expected.Count; $index++) {
        Assert-True ($Actual[$index] -ceq $Expected[$index]) "$Message Mismatch at index $index."
    }
}

function Invoke-TestPowerShell {
    param([string[]]$ArgumentList)

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = @(& powershell.exe @ArgumentList 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @($output | ForEach-Object { $_.ToString() })
    }
}

$nodePath = (Get-Command -Name 'node.exe' -CommandType Application -ErrorAction Stop).Source
$nodeArgumentProbe = 'console.log(JSON.stringify(process.argv.slice(1)))'
foreach ($nativeMessage in @($specialMessage, 'foo\" --no-verify')) {
    $nativeResult = Invoke-QuarkNativeCommand -FilePath $nodePath -ArgumentList @(
        '-e',
        $nodeArgumentProbe,
        $nativeMessage,
        'SENTINEL'
    )
    Assert-True ($nativeResult.ExitCode -eq 0) 'The native argv probe must exit successfully.'
    $receivedArguments = (($nativeResult.Output -join "`n") | ConvertFrom-Json)
    Assert-SequenceEqual -Actual @($receivedArguments) -Expected @($nativeMessage, 'SENTINEL') -Message 'Native execution must preserve each argument exactly.'
}
Assert-True (-not (Test-Path -LiteralPath (Join-Path (Get-Location) 'BAD'))) 'Commit-message metacharacters must never be evaluated.'

$nativeWorkingDirectory = [System.IO.Path]::GetTempPath()
$workingDirectoryResult = Invoke-QuarkNativeCommand -FilePath $nodePath -ArgumentList @(
    '-e',
    'console.log(process.cwd())'
) -WorkingDirectory $nativeWorkingDirectory
Assert-True ($workingDirectoryResult.ExitCode -eq 0) 'The native cwd probe must exit successfully.'
$expectedWorkingDirectory = $nativeWorkingDirectory.TrimEnd([char]0x5C, [char]0x2F)
$actualWorkingDirectory = ($workingDirectoryResult.Output[0]).TrimEnd([char]0x5C, [char]0x2F)
Assert-True ($actualWorkingDirectory -ceq $expectedWorkingDirectory) 'Native execution must honor its explicit working directory.'

$previousErrorActionPreference = $ErrorActionPreference
$missingCommandThrew = $false
try {
    $ErrorActionPreference = 'Continue'
    $global:LASTEXITCODE = 0
    $null = Invoke-QuarkNativeCommand -FilePath 'quark-command-that-does-not-exist.exe' -ArgumentList @() 2>$null
}
catch {
    $missingCommandThrew = $true
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
Assert-True $missingCommandThrew 'A missing native command must throw even when the caller uses Continue.'

$launcherPath = (Resolve-Path -LiteralPath $launcher).Path
$describeResult = Invoke-TestPowerShell -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $launcherPath,
    '-Action', 'Describe'
)
Assert-True ($describeResult.ExitCode -eq 0) 'Describe must exit successfully.'
$description = (($describeResult.Output -join "`n") | ConvertFrom-Json)
Assert-SequenceEqual -Actual @($description.PSObject.Properties.Name) -Expected @('Paths', 'Actions') -Message 'Describe must expose only paths and actions.'
Assert-SequenceEqual -Actual @($description.Paths.PSObject.Properties.Name) -Expected @('Project', 'Posts') -Message 'Describe paths are incomplete.'
Assert-True ($description.Paths.Project -ceq 'C:\Users\Lenovo\Desktop\Quarkbobo') 'Describe has the wrong project path.'
Assert-True ($description.Paths.Posts -ceq 'C:\Users\Lenovo\Desktop\Quarkbobo\source\_posts') 'Describe has the wrong posts path.'
Assert-SequenceEqual -Actual @($description.Actions) -Expected @('Menu', 'OpenPosts', 'Preview', 'Build', 'Publish', 'Describe') -Message 'Describe has the wrong action allowlist.'

$invalidActionResult = Invoke-TestPowerShell -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $launcherPath,
    '-Action', 'DefinitelyInvalid'
)
Assert-True ($invalidActionResult.ExitCode -ne 0) 'An action outside the allowlist must fail parameter binding.'

$script:PublishJournal = [System.Collections.Generic.List[object]]::new()
$script:PublishMode = 'Success'
$script:StagedOutput = @('source/_posts/example.md')
$commandRunner = {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList
    )

    [void]$script:PublishJournal.Add([pscustomobject]@{
        FilePath = $FilePath
        Arguments = [string[]]@($ArgumentList)
    })

    $verb = $ArgumentList[2]
    $exitCode = 0
    $output = @()
    if (($verb -eq 'status') -and ($script:PublishMode -eq 'StatusFails')) {
        $exitCode = 1
    }
    elseif ($verb -eq 'status') {
        $output = @('## master')
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList[3] -eq '--stat') -and ($script:PublishMode -eq 'DiffFails')) {
        $exitCode = 1
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList[3] -eq '--stat')) {
        $output = @('source/_posts/example.md | 1 +')
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList[3] -eq '--cached') -and ($script:PublishMode -eq 'CachedDiffFails')) {
        $exitCode = 1
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList[3] -eq '--cached')) {
        $output = @($script:StagedOutput)
    }
    elseif (($verb -eq 'add') -and ($script:PublishMode -eq 'AddFails')) {
        $exitCode = 1
    }
    elseif (($verb -eq 'commit') -and ($script:PublishMode -eq 'CommitFails')) {
        $exitCode = 1
    }
    elseif (($verb -eq 'push') -and ($script:PublishMode -eq 'PushFails')) {
        $exitCode = 1
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @($output)
    }
}

function Get-PublishVerbs {
    @($script:PublishJournal | ForEach-Object { $_.Arguments[2] })
}

$expectedPrompt = -join @(
    [char]0x8F93, [char]0x5165, ' P ', [char]0x7EE7, [char]0x7EED,
    [char]0x63D0, [char]0x4EA4, [char]0x5E76, [char]0x666E,
    [char]0x901A, [char]0x63A8, [char]0x9001, [char]0xFF1B,
    [char]0x5176, [char]0x4ED6, [char]0x952E, [char]0x53D6,
    [char]0x6D88
)
$script:ConfirmationPrompts = [System.Collections.Generic.List[string]]::new()
$cancelReader = {
    param([string]$Prompt)
    [void]$script:ConfirmationPrompts.Add($Prompt)
    'p'
}
$null = @(Invoke-QuarkPublish -CommitMessage 'cancelled' -CommandRunner $commandRunner -ConfirmationReader $cancelReader *>&1)
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff') -Message 'Lowercase p must cancel before staging.'
Assert-SequenceEqual -Actual @($script:ConfirmationPrompts) -Expected @($expectedPrompt) -Message 'Publish confirmation prompt changed.'

$script:PublishJournal.Clear()
$script:PublishMode = 'CommitFails'
$script:StagedOutput = @('source/_posts/example.md')
$confirmReader = { param([string]$Prompt) 'P' }
$neverConfirmReader = { param([string]$Prompt) throw 'Confirmation must not be requested.' }

$script:PublishJournal.Clear()
$script:PublishMode = 'StatusFails'
$statusFailureThrown = $false
$statusFailureMessage = ''
try {
    $null = @(Invoke-QuarkPublish -CommitMessage 'status failure' -CommandRunner $commandRunner -ConfirmationReader $neverConfirmReader *>&1)
}
catch {
    $statusFailureThrown = $true
    $statusFailureMessage = $_.Exception.Message
}
Assert-True $statusFailureThrown 'A failed status must throw.'
Assert-True ($statusFailureMessage -match 'Status failed') 'A status failure must report the failing gate.'
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status') -Message 'A failed status must stop immediately.'

$script:PublishJournal.Clear()
$script:PublishMode = 'DiffFails'
$diffFailureThrown = $false
$diffFailureMessage = ''
try {
    $null = @(Invoke-QuarkPublish -CommitMessage 'diff failure' -CommandRunner $commandRunner -ConfirmationReader $neverConfirmReader *>&1)
}
catch {
    $diffFailureThrown = $true
    $diffFailureMessage = $_.Exception.Message
}
Assert-True $diffFailureThrown 'A failed diff summary must throw.'
Assert-True ($diffFailureMessage -match 'Diff summary failed') 'A diff failure must report the failing gate.'
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff') -Message 'A failed diff summary must stop before confirmation.'

$script:PublishJournal.Clear()
$script:PublishMode = 'CachedDiffFails'
$cachedDiffFailureThrown = $false
$cachedDiffFailureMessage = ''
try {
    $null = @(Invoke-QuarkPublish -CommitMessage 'cached diff failure' -CommandRunner $commandRunner -ConfirmationReader $confirmReader *>&1)
}
catch {
    $cachedDiffFailureThrown = $true
    $cachedDiffFailureMessage = $_.Exception.Message
}
Assert-True $cachedDiffFailureThrown 'A failed cached diff must throw.'
Assert-True ($cachedDiffFailureMessage -match 'Staged diff failed') 'A cached diff failure must report the failing gate.'
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff', 'add', 'diff') -Message 'A failed cached diff must stop before commit and push.'

$commitFailureThrown = $false
$commitFailureMessage = ''
$script:PublishJournal.Clear()
$script:PublishMode = 'CommitFails'
$script:StagedOutput = @('source/_posts/example.md')
try {
    $null = @(Invoke-QuarkPublish -CommitMessage 'commit failure' -CommandRunner $commandRunner -ConfirmationReader $confirmReader *>&1)
}
catch {
    $commitFailureThrown = $true
    $commitFailureMessage = $_.Exception.Message
}
Assert-True $commitFailureThrown 'A failed commit must throw.'
Assert-True ($commitFailureMessage -match 'Commit failed') 'A failed commit must explain that changes remain local.'
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff', 'add', 'diff', 'commit') -Message 'A failed commit must stop before push.'

$script:PublishJournal.Clear()
$script:PublishMode = 'AddFails'
$script:StagedOutput = @('source/_posts/example.md')
$addFailureThrown = $false
try {
    $null = @(Invoke-QuarkPublish -CommitMessage 'add failure' -CommandRunner $commandRunner -ConfirmationReader $confirmReader *>&1)
}
catch {
    $addFailureThrown = $true
}
Assert-True $addFailureThrown 'A failed add must throw.'
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff', 'add') -Message 'A failed add must stop before cached diff, commit, or push.'

$script:PublishJournal.Clear()
$script:PublishMode = 'Success'
$script:StagedOutput = @('source/_posts/example.md')
$specialMessage = 'fix: "quoted" & | ; $(New-Item BAD) ' + (-join @([char]0x4E2D, [char]0x6587))
$null = @(Invoke-QuarkPublish -CommitMessage $specialMessage -CommandRunner $commandRunner -ConfirmationReader $confirmReader *>&1)
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff', 'add', 'diff', 'commit', 'push') -Message 'Successful publish uses the wrong command order.'
$commitCall = @($script:PublishJournal | Where-Object { $_.Arguments[2] -eq 'commit' })
Assert-True ($commitCall.Count -eq 1) 'Successful publish must make exactly one commit call.'
Assert-SequenceEqual -Actual @($commitCall[0].Arguments) -Expected @('-C', 'C:\Users\Lenovo\Desktop\Quarkbobo', 'commit', '-m', $specialMessage) -Message 'Commit message must remain one literal argument.'
$pushCall = @($script:PublishJournal | Where-Object { $_.Arguments[2] -eq 'push' })
Assert-SequenceEqual -Actual @($pushCall[0].Arguments) -Expected @('-C', 'C:\Users\Lenovo\Desktop\Quarkbobo', 'push', 'origin', 'master') -Message 'Publish must use a normal master push.'

$script:PublishJournal.Clear()
$script:PublishMode = 'PushFails'
$script:StagedOutput = @('source/_posts/example.md')
$pushFailureThrown = $false
$pushFailureMessage = ''
try {
    $null = @(Invoke-QuarkPublish -CommitMessage 'push failure' -CommandRunner $commandRunner -ConfirmationReader $confirmReader *>&1)
}
catch {
    $pushFailureThrown = $true
    $pushFailureMessage = $_.Exception.Message
}
Assert-True $pushFailureThrown 'A failed push must throw.'
Assert-True ($pushFailureMessage -match 'Push failed') 'A push failure must explain that the commit remains local.'
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff', 'add', 'diff', 'commit', 'push') -Message 'A failed push must not run another command.'

$script:PublishJournal.Clear()
$script:PublishMode = 'Success'
$script:StagedOutput = @()
$null = @(Invoke-QuarkPublish -CommitMessage 'nothing staged' -CommandRunner $commandRunner -ConfirmationReader $confirmReader *>&1)
Assert-SequenceEqual -Actual @(Get-PublishVerbs) -Expected @('status', 'diff', 'add', 'diff', 'push') -Message 'An empty staging area must skip commit and use a normal push.'

$originalPathsFunction = (Get-Command -Name 'Get-QuarkBlogPaths' -CommandType Function).ScriptBlock
$script:BuildProject = Join-Path ([System.IO.Path]::GetTempPath()) ("quark-missing-$([guid]::NewGuid().ToString('N'))")
$script:BuildJournal = [System.Collections.Generic.List[object]]::new()
$script:BuildMode = 'Success'
Set-Item -LiteralPath Function:\Get-QuarkBlogPaths -Value {
    [pscustomobject]@{
        Project = $script:BuildProject
        Posts   = Join-Path $script:BuildProject 'source/_posts'
    }
}
$buildRunner = {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )

    [void]$script:BuildJournal.Add([pscustomobject]@{
        FilePath         = $FilePath
        Arguments        = [string[]]@($ArgumentList)
        WorkingDirectory = $WorkingDirectory
    })
    $exitCode = 0
    if (($script:BuildMode -eq 'CleanFails') -and ($ArgumentList[-1] -eq 'clean')) {
        $exitCode = 1
    }
    elseif (($script:BuildMode -eq 'BuildFails') -and ($ArgumentList[-1] -eq 'build')) {
        $exitCode = 1
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @()
    }
}

$previousErrorActionPreference = $ErrorActionPreference
$missingProjectThrew = $false
try {
    $ErrorActionPreference = 'Continue'
    $null = @(Invoke-QuarkBuild -CommandRunner $buildRunner *>&1)
}
catch {
    $missingProjectThrew = $true
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
Assert-True $missingProjectThrew 'Build must terminate when the project directory is unavailable.'
Assert-True ($script:BuildJournal.Count -eq 0) 'Build must not run npm in the caller directory after a location failure.'

$script:BuildProject = [System.IO.Path]::GetTempPath()
$script:BuildJournal.Clear()
$script:BuildMode = 'CleanFails'
$cleanFailureThrown = $false
try {
    $null = @(Invoke-QuarkBuild -CommandRunner $buildRunner *>&1)
}
catch {
    $cleanFailureThrown = $true
}
Assert-True $cleanFailureThrown 'A failed clean must throw.'
Assert-True ($script:BuildJournal.Count -eq 1) 'A failed clean must prevent build.'
Assert-True ($script:BuildJournal[0].FilePath -ceq 'npm.cmd') 'Build must invoke npm.cmd.'
Assert-SequenceEqual -Actual @($script:BuildJournal[0].Arguments) -Expected @('run', 'clean') -Message 'Build must run clean first.'

$script:BuildJournal.Clear()
$script:BuildMode = 'Success'
$null = @(Invoke-QuarkBuild -CommandRunner $buildRunner *>&1)
Assert-True ($script:BuildJournal.Count -eq 2) 'A successful Build must run exactly clean and build.'
Assert-SequenceEqual -Actual @($script:BuildJournal[0].Arguments) -Expected @('run', 'clean') -Message 'Build must run clean first.'
Assert-SequenceEqual -Actual @($script:BuildJournal[1].Arguments) -Expected @('run', 'build') -Message 'Build must run build second.'
Assert-True ($script:BuildJournal[0].WorkingDirectory -ceq $script:BuildProject) 'Clean must run in the fixed project directory.'
Assert-True ($script:BuildJournal[1].WorkingDirectory -ceq $script:BuildProject) 'Build must run in the fixed project directory.'

$script:BuildJournal.Clear()
$script:BuildMode = 'BuildFails'
$buildFailureThrown = $false
try {
    $null = @(Invoke-QuarkBuild -CommandRunner $buildRunner *>&1)
}
catch {
    $buildFailureThrown = $true
}
Assert-True $buildFailureThrown 'A failed build must throw.'
Assert-True ($script:BuildJournal.Count -eq 2) 'A failed build must run clean once and build once.'
Assert-SequenceEqual -Actual @($script:BuildJournal[0].Arguments) -Expected @('run', 'clean') -Message 'Build must run clean first.'
Assert-SequenceEqual -Actual @($script:BuildJournal[1].Arguments) -Expected @('run', 'build') -Message 'Build must run build second.'

$script:BuildProject = [System.IO.Path]::GetTempPath()
$savedPath = $env:PATH
$previousErrorActionPreference = $ErrorActionPreference
$missingNpmThrew = $false
try {
    $env:PATH = ''
    $ErrorActionPreference = 'Continue'
    $global:LASTEXITCODE = 0
    $null = @(Invoke-QuarkBuild *>&1)
}
catch {
    $missingNpmThrew = $true
}
finally {
    $env:PATH = $savedPath
    $ErrorActionPreference = $previousErrorActionPreference
}
Assert-True $missingNpmThrew 'Build must throw when npm.cmd is unavailable even if LASTEXITCODE was zero.'

Set-Item -LiteralPath Function:\Get-QuarkBlogPaths -Value $originalPathsFunction

$script:ProcessCalls = [System.Collections.Generic.List[object]]::new()
function Start-Process {
    [CmdletBinding()]
    param(
        [string]$FilePath,
        [object[]]$ArgumentList,
        [string]$WorkingDirectory,
        [System.Diagnostics.ProcessWindowStyle]$WindowStyle
    )

    [void]$script:ProcessCalls.Add([pscustomobject]@{
        FilePath         = $FilePath
        ArgumentList     = [object[]]@($ArgumentList)
        WorkingDirectory = $WorkingDirectory
        WindowStyle      = $WindowStyle
        HasWindowStyle   = $PSBoundParameters.ContainsKey('WindowStyle')
    })
}

Invoke-QuarkOpenPosts
Invoke-QuarkPreview
Remove-Item -LiteralPath Function:\Start-Process -Force
Assert-True ($script:ProcessCalls.Count -eq 2) 'OpenPosts and Preview must each start one process.'
Assert-True ($script:ProcessCalls[0].FilePath -ceq 'explorer.exe') 'OpenPosts must use Explorer.'
Assert-SequenceEqual -Actual @($script:ProcessCalls[0].ArgumentList) -Expected @('C:\Users\Lenovo\Desktop\Quarkbobo\source\_posts') -Message 'OpenPosts must open the fixed posts path.'
Assert-True ($script:ProcessCalls[1].FilePath -ceq 'npm.cmd') 'Preview must start npm.cmd.'
Assert-SequenceEqual -Actual @($script:ProcessCalls[1].ArgumentList) -Expected @('run', 'server') -Message 'Preview must run the server script.'
Assert-True ($script:ProcessCalls[1].WorkingDirectory -ceq 'C:\Users\Lenovo\Desktop\Quarkbobo') 'Preview must use the fixed project directory.'
Assert-True $script:ProcessCalls[1].HasWindowStyle 'Preview must set an explicit window style.'
Assert-True ($script:ProcessCalls[1].WindowStyle -eq [System.Diagnostics.ProcessWindowStyle]::Hidden) 'Preview helper must be hidden.'

Write-Output 'PASS: quark-blog-tools contract'
