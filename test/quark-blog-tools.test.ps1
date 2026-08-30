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
    'Invoke-QuarkBlogAction'
    'Invoke-QuarkBlogEntryPoint'
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
Assert-True ($joined -match 'git symbolic-ref --quiet --short HEAD') 'Publish must verify the symbolic current branch.'
Assert-True ($joined -match 'git status --short --branch') 'Publish must show status.'
Assert-True ($joined -match 'git diff --stat') 'Publish must show a diff summary.'
Assert-True ((@($commands | Where-Object { $_ -ceq 'git diff --cached --name-status' })).Count -eq 2) 'Publish must show staged names before and after staging.'
Assert-True ((@($commands | Where-Object { $_ -ceq 'git diff --cached --stat' })).Count -eq 2) 'Publish must show staged stats before and after staging.'
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
$script:ConfirmationPrompts = [System.Collections.Generic.List[string]]::new()
$script:ConfirmationAnswers = [System.Collections.Generic.Queue[string]]::new()
$script:PublishMode = 'Success'
$script:BranchOutput = @('master')
$script:StatusOutput = @('## master', '?? source/_posts/new article.md')
$script:UnstagedStatOutput = @('themes/fluid-particle/layout/index.ejs | 2 +-')
$script:InitialCachedNameStatusOutput = @('M' + "`t" + 'source/_posts/already-staged.md')
$script:InitialCachedStatOutput = @('source/_posts/already-staged.md | 1 +')
$script:FinalCachedNameStatusOutput = @('R100' + "`t" + 'source/_posts/already-staged.md' + "`t" + 'source/_posts/renamed.md', 'A' + "`t" + 'source/_posts/new article.md')
$script:FinalCachedStatOutput = @('2 files changed, 3 insertions(+)')
$script:CachedNameStatusCallCount = 0
$script:CachedStatCallCount = 0
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

    if (($verb -eq 'symbolic-ref') -and ($script:PublishMode -in @('DetachedHead', 'BranchQueryFails'))) {
        $exitCode = 1
    }
    elseif ($verb -eq 'symbolic-ref') {
        $output = @($script:BranchOutput)
    }
    elseif (($verb -eq 'status') -and ($script:PublishMode -eq 'StatusFails')) {
        $exitCode = 1
    }
    elseif ($verb -eq 'status') {
        $output = @($script:StatusOutput)
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList.Count -eq 4) -and ($ArgumentList[3] -eq '--stat') -and ($script:PublishMode -eq 'UnstagedStatFails')) {
        $exitCode = 1
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList.Count -eq 4) -and ($ArgumentList[3] -eq '--stat')) {
        $output = @($script:UnstagedStatOutput)
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList[3] -eq '--cached') -and ($ArgumentList[4] -eq '--name-status')) {
        $script:CachedNameStatusCallCount++
        if (($script:CachedNameStatusCallCount -eq 1) -and ($script:PublishMode -eq 'InitialCachedNameStatusFails')) {
            $exitCode = 1
        }
        elseif (($script:CachedNameStatusCallCount -eq 2) -and ($script:PublishMode -eq 'FinalCachedNameStatusFails')) {
            $exitCode = 1
        }
        elseif ($script:CachedNameStatusCallCount -eq 1) {
            $output = @($script:InitialCachedNameStatusOutput)
        }
        else {
            $output = @($script:FinalCachedNameStatusOutput)
        }
    }
    elseif (($verb -eq 'diff') -and ($ArgumentList[3] -eq '--cached') -and ($ArgumentList[4] -eq '--stat')) {
        $script:CachedStatCallCount++
        if (($script:CachedStatCallCount -eq 1) -and ($script:PublishMode -eq 'InitialCachedStatFails')) {
            $exitCode = 1
        }
        elseif (($script:CachedStatCallCount -eq 2) -and ($script:PublishMode -eq 'FinalCachedStatFails')) {
            $exitCode = 1
        }
        elseif ($script:CachedStatCallCount -eq 1) {
            $output = @($script:InitialCachedStatOutput)
        }
        else {
            $output = @($script:FinalCachedStatOutput)
        }
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

function Reset-PublishFixture {
    $script:PublishJournal.Clear()
    $script:ConfirmationPrompts.Clear()
    $script:ConfirmationAnswers.Clear()
    $script:PublishMode = 'Success'
    $script:BranchOutput = @('master')
    $script:StatusOutput = @('## master', '?? source/_posts/new article.md')
    $script:UnstagedStatOutput = @('themes/fluid-particle/layout/index.ejs | 2 +-')
    $script:InitialCachedNameStatusOutput = @('M' + "`t" + 'source/_posts/already-staged.md')
    $script:InitialCachedStatOutput = @('source/_posts/already-staged.md | 1 +')
    $script:FinalCachedNameStatusOutput = @('R100' + "`t" + 'source/_posts/already-staged.md' + "`t" + 'source/_posts/renamed.md', 'A' + "`t" + 'source/_posts/new article.md')
    $script:FinalCachedStatOutput = @('2 files changed, 3 insertions(+)')
    $script:CachedNameStatusCallCount = 0
    $script:CachedStatCallCount = 0
}

function Get-PublishCommandKeys {
    @($script:PublishJournal | ForEach-Object {
        ($_.Arguments[2..($_.Arguments.Count - 1)] -join ' ')
    })
}

$confirmationReader = {
    param([string]$Prompt)
    [void]$script:ConfirmationPrompts.Add($Prompt)
    if ($script:ConfirmationAnswers.Count -eq 0) {
        throw 'An unexpected confirmation was requested.'
    }
    $script:ConfirmationAnswers.Dequeue()
}
$neverConfirmReader = { param([string]$Prompt) throw 'Confirmation must not be requested.' }

$firstPrompt = [regex]::Unescape('\u8f93\u5165\u5927\u5199 P \u6682\u5b58\u5168\u90e8\u66f4\u6539\uff1b\u5176\u4ed6\u952e\u53d6\u6d88')
$secondPrompt = [regex]::Unescape('\u518d\u6b21\u8f93\u5165\u5927\u5199 P \u63d0\u4ea4\u5e76\u666e\u901a\u63a8\u9001\uff1b\u5176\u4ed6\u952e\u53d6\u6d88\uff08\u66f4\u6539\u5c06\u4fdd\u7559\u4e3a\u5df2\u6682\u5b58\uff09')
$initialCommands = @(
    'symbolic-ref --quiet --short HEAD'
    'status --short --branch'
    'diff --stat'
    'diff --cached --name-status'
    'diff --cached --stat'
)
$afterFirstConfirmationCommands = @(
    $initialCommands
    'add --all'
    'diff --cached --name-status'
    'diff --cached --stat'
)

Reset-PublishFixture
$script:ConfirmationAnswers.Enqueue('p')
$cancelOutput = @(Invoke-QuarkPublish -CommitMessage 'cancelled' -CommandRunner $commandRunner -ConfirmationReader $confirmationReader *>&1)
Assert-SequenceEqual -Actual @(Get-PublishCommandKeys) -Expected $initialCommands -Message 'Lowercase p must cancel before staging.'
Assert-SequenceEqual -Actual @($script:ConfirmationPrompts) -Expected @($firstPrompt) -Message 'The first publish prompt must require uppercase P.'
$cancelText = $cancelOutput -join "`n"
Assert-True ($cancelText -match [regex]::Escape([regex]::Unescape('\u6ca1\u6709\u65b0\u589e\u6682\u5b58'))) 'First cancellation must explain that staging was not changed.'

Reset-PublishFixture
$script:ConfirmationAnswers.Enqueue('P')
$script:ConfirmationAnswers.Enqueue('p')
$secondCancelOutput = @(Invoke-QuarkPublish -CommitMessage 'cancel after staging' -CommandRunner $commandRunner -ConfirmationReader $confirmationReader *>&1)
Assert-SequenceEqual -Actual @(Get-PublishCommandKeys) -Expected $afterFirstConfirmationCommands -Message 'Second cancellation must leave staged changes without committing or pushing.'
Assert-SequenceEqual -Actual @($script:ConfirmationPrompts) -Expected @($firstPrompt, $secondPrompt) -Message 'Publish must require two distinct uppercase-P confirmations.'
$secondCancelText = $secondCancelOutput -join "`n"
Assert-True ($secondCancelText -match [regex]::Escape([regex]::Unescape('\u5df2\u4fdd\u7559\u4e3a\u6682\u5b58\u72b6\u6001'))) 'Second cancellation must clearly say that changes remain staged.'
Assert-True ($secondCancelText -match [regex]::Escape([regex]::Unescape('\u5c1a\u672a\u63d0\u4ea4\u6216\u63a8\u9001'))) 'Second cancellation must clearly say that commit and push did not run.'

Reset-PublishFixture
$script:ConfirmationAnswers.Enqueue('P')
$script:ConfirmationAnswers.Enqueue('P')
$publishOutput = @(Invoke-QuarkPublish -CommitMessage $specialMessage -CommandRunner $commandRunner -ConfirmationReader $confirmationReader *>&1)
$expectedSuccessCommands = @(
    $afterFirstConfirmationCommands
    "commit -m $specialMessage"
    'push origin master'
)
Assert-SequenceEqual -Actual @(Get-PublishCommandKeys) -Expected $expectedSuccessCommands -Message 'Successful publish uses the wrong command order.'
Assert-SequenceEqual -Actual @($script:ConfirmationPrompts) -Expected @($firstPrompt, $secondPrompt) -Message 'Successful publish must receive both confirmations.'
$publishText = $publishOutput -join "`n"
foreach ($visibleLine in @(
    '?? source/_posts/new article.md'
    'themes/fluid-particle/layout/index.ejs | 2 +-'
    ('M' + "`t" + 'source/_posts/already-staged.md')
    'source/_posts/already-staged.md | 1 +'
    ('R100' + "`t" + 'source/_posts/already-staged.md' + "`t" + 'source/_posts/renamed.md')
    ('A' + "`t" + 'source/_posts/new article.md')
    '2 files changed, 3 insertions(+)'
)) {
    Assert-True ($publishText.Contains($visibleLine)) "Publish preview did not show: $visibleLine"
}
$commitCall = @($script:PublishJournal | Where-Object { $_.Arguments[2] -eq 'commit' })
Assert-True ($commitCall.Count -eq 1) 'Successful publish must make exactly one commit call.'
Assert-SequenceEqual -Actual @($commitCall[0].Arguments) -Expected @('-C', 'C:\Users\Lenovo\Desktop\Quarkbobo', 'commit', '-m', $specialMessage) -Message 'Commit message must remain one literal argument.'
$pushCall = @($script:PublishJournal | Where-Object { $_.Arguments[2] -eq 'push' })
Assert-SequenceEqual -Actual @($pushCall[0].Arguments) -Expected @('-C', 'C:\Users\Lenovo\Desktop\Quarkbobo', 'push', 'origin', 'master') -Message 'Publish must use a normal master push.'
Assert-True (-not (($pushCall[0].Arguments -join ' ') -match '--force')) 'Publish must never force push.'
foreach ($publishCall in $script:PublishJournal) {
    Assert-True ($publishCall.FilePath -ceq 'git') 'Every publish stage must invoke git directly.'
    Assert-True ($publishCall.Arguments[0] -ceq '-C') 'Every publish stage must anchor git to the fixed project path.'
    Assert-True ($publishCall.Arguments[1] -ceq 'C:\Users\Lenovo\Desktop\Quarkbobo') 'Every publish stage used the wrong project path.'
}

foreach ($wrongBranch in @('feature/not-master', 'Master')) {
    Reset-PublishFixture
    $script:BranchOutput = @($wrongBranch)
    $featureFailureThrown = $false
    try {
        $null = @(Invoke-QuarkPublish -CommitMessage 'wrong branch' -CommandRunner $commandRunner -ConfirmationReader $neverConfirmReader *>&1)
    }
    catch {
        $featureFailureThrown = $true
    }
    Assert-True $featureFailureThrown "Publish must reject the non-exact branch name: $wrongBranch"
    Assert-SequenceEqual -Actual @(Get-PublishCommandKeys) -Expected @('symbolic-ref --quiet --short HEAD') -Message 'A non-master branch must stop before preview or staging.'
}

$failureCases = @(
    [pscustomobject]@{ Name = 'detached HEAD'; Mode = 'DetachedHead'; Answers = @(); Commands = @('symbolic-ref --quiet --short HEAD') }
    [pscustomobject]@{ Name = 'branch query'; Mode = 'BranchQueryFails'; Answers = @(); Commands = @('symbolic-ref --quiet --short HEAD') }
    [pscustomobject]@{ Name = 'status'; Mode = 'StatusFails'; Answers = @(); Commands = @($initialCommands[0..1]) }
    [pscustomobject]@{ Name = 'unstaged stat'; Mode = 'UnstagedStatFails'; Answers = @(); Commands = @($initialCommands[0..2]) }
    [pscustomobject]@{ Name = 'initial cached names'; Mode = 'InitialCachedNameStatusFails'; Answers = @(); Commands = @($initialCommands[0..3]) }
    [pscustomobject]@{ Name = 'initial cached stat'; Mode = 'InitialCachedStatFails'; Answers = @(); Commands = @($initialCommands) }
    [pscustomobject]@{ Name = 'add'; Mode = 'AddFails'; Answers = @('P'); Commands = @($initialCommands + 'add --all') }
    [pscustomobject]@{ Name = 'final cached names'; Mode = 'FinalCachedNameStatusFails'; Answers = @('P'); Commands = @($initialCommands + 'add --all' + 'diff --cached --name-status') }
    [pscustomobject]@{ Name = 'final cached stat'; Mode = 'FinalCachedStatFails'; Answers = @('P'); Commands = @($afterFirstConfirmationCommands) }
    [pscustomobject]@{ Name = 'commit'; Mode = 'CommitFails'; Answers = @('P', 'P'); Commands = @($afterFirstConfirmationCommands + 'commit -m failure test') }
    [pscustomobject]@{ Name = 'push'; Mode = 'PushFails'; Answers = @('P', 'P'); Commands = @($afterFirstConfirmationCommands + 'commit -m failure test' + 'push origin master') }
)
foreach ($failureCase in $failureCases) {
    Reset-PublishFixture
    $script:PublishMode = $failureCase.Mode
    foreach ($answer in $failureCase.Answers) {
        $script:ConfirmationAnswers.Enqueue($answer)
    }
    $failureThrown = $false
    try {
        $null = @(Invoke-QuarkPublish -CommitMessage 'failure test' -CommandRunner $commandRunner -ConfirmationReader $confirmationReader *>&1)
    }
    catch {
        $failureThrown = $true
    }
    Assert-True $failureThrown "A failed $($failureCase.Name) stage must throw."
    Assert-SequenceEqual -Actual @(Get-PublishCommandKeys) -Expected @($failureCase.Commands) -Message "A failed $($failureCase.Name) stage did not stop immediately."
}

Reset-PublishFixture
$script:StatusOutput = @('## master')
$script:UnstagedStatOutput = @()
$script:InitialCachedNameStatusOutput = @()
$script:InitialCachedStatOutput = @()
$script:FinalCachedNameStatusOutput = @()
$script:FinalCachedStatOutput = @()
$script:ConfirmationAnswers.Enqueue('P')
$script:ConfirmationAnswers.Enqueue('P')
$null = @(Invoke-QuarkPublish -CommitMessage 'nothing staged' -CommandRunner $commandRunner -ConfirmationReader $confirmationReader *>&1)
Assert-SequenceEqual -Actual @(Get-PublishCommandKeys) -Expected @($afterFirstConfirmationCommands + 'push origin master') -Message 'An empty staging area must skip commit and use a normal push only after the second confirmation.'

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

$script:MenuPrompts = [System.Collections.Generic.List[string]]::new()
$menuOutput = @(Show-QuarkBlogMenu -CommitMessage 'menu test' -SelectionReader {
    param([string]$Prompt)
    [void]$script:MenuPrompts.Add($Prompt)
    '0'
} *>&1)
$menuText = $menuOutput -join "`n"
foreach ($menuLabel in @(
    [regex]::Unescape('Quark \u535a\u5ba2\u5de5\u5177')
    [regex]::Unescape('\u6253\u5f00\u6587\u7ae0\u76ee\u5f55')
    [regex]::Unescape('\u9884\u89c8\u535a\u5ba2')
    [regex]::Unescape('\u6784\u5efa\u535a\u5ba2')
    [regex]::Unescape('\u5b89\u5168\u53d1\u5e03')
)) {
    Assert-True ($menuText.Contains($menuLabel)) "Menu did not show the Chinese label: $menuLabel"
}
Assert-SequenceEqual -Actual @($script:MenuPrompts) -Expected @([regex]::Unescape('\u8bf7\u9009\u62e9\u64cd\u4f5c')) -Message 'The menu prompt must be Chinese.'

$script:DispatchCalls = [System.Collections.Generic.List[string]]::new()
$failingDispatcher = {
    param([string]$SelectedAction, [string]$SelectedCommitMessage)
    [void]$script:DispatchCalls.Add($SelectedAction)
    throw 'simulated launcher failure'
}
$script:PausePrompts = [System.Collections.Generic.List[string]]::new()
$pauseReader = {
    param([string]$Prompt)
    [void]$script:PausePrompts.Add($Prompt)
    ''
}
$interactiveExitCode = 0
$interactiveFailureOutput = @(Invoke-QuarkBlogEntryPoint -Action 'Menu' -CommitMessage 'menu failure' -ActionDispatcher $failingDispatcher -PauseReader $pauseReader -ExitCode ([ref]$interactiveExitCode) *>&1)
$interactiveFailureText = $interactiveFailureOutput -join "`n"
Assert-True ($interactiveExitCode -ne 0) 'An interactive Menu failure must produce a nonzero exit code.'
Assert-SequenceEqual -Actual @($script:DispatchCalls) -Expected @('Menu') -Message 'The entry point dispatched the wrong interactive action.'
Assert-True ($interactiveFailureText.Contains('simulated launcher failure')) 'The interactive recovery message must include the original failure.'
Assert-True ($interactiveFailureText.Contains([regex]::Unescape('\u8bf7\u68c0\u67e5\u9879\u76ee\u8def\u5f84'))) 'The interactive recovery message must tell the user what to check.'
Assert-True ($interactiveFailureText.Contains([regex]::Unescape('\u91cd\u65b0\u6253\u5f00'))) 'The interactive recovery message must explain how to retry.'
Assert-SequenceEqual -Actual @($script:PausePrompts) -Expected @([regex]::Unescape('\u6309\u56de\u8f66\u952e\u5173\u95ed\u7a97\u53e3')) -Message 'An interactive failure must wait for Enter before closing.'

$script:DispatchCalls.Clear()
$script:PausePrompts.Clear()
$lowercaseMenuExitCode = 0
$null = @(Invoke-QuarkBlogEntryPoint -Action 'menu' -CommitMessage 'lowercase menu failure' -ActionDispatcher $failingDispatcher -PauseReader $pauseReader -ExitCode ([ref]$lowercaseMenuExitCode) *>&1)
Assert-True ($lowercaseMenuExitCode -ne 0) 'The case-insensitive Menu action must still use interactive error handling.'
Assert-SequenceEqual -Actual @($script:PausePrompts) -Expected @([regex]::Unescape('\u6309\u56de\u8f66\u952e\u5173\u95ed\u7a97\u53e3')) -Message 'Lowercase menu must wait for Enter after failure.'

$script:DispatchCalls.Clear()
$script:PausePrompts.Clear()
$explicitFailureThrown = $false
try {
    $explicitExitCode = 0
    $null = @(Invoke-QuarkBlogEntryPoint -Action 'Build' -CommitMessage 'explicit failure' -ActionDispatcher $failingDispatcher -PauseReader $pauseReader -ExitCode ([ref]$explicitExitCode) *>&1)
}
catch {
    $explicitFailureThrown = $true
}
Assert-True $explicitFailureThrown 'A failing explicit action must propagate its error for automation.'
Assert-SequenceEqual -Actual @($script:DispatchCalls) -Expected @('Build') -Message 'The entry point dispatched the wrong explicit action.'
Assert-True ($script:PausePrompts.Count -eq 0) 'A failing explicit non-interactive action must not pause.'

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
