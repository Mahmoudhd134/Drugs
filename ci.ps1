<#
.SYNOPSIS
  Runs a test tier on GitHub Actions for the current branch and waits for the verdict (docs/testing/README.md
  "Continuous integration"). The laptop only pushes and waits: the tests run on GitHub's machines.

.DESCRIPTION
  1. Refuses on main and with uncommitted changes to tracked files (CI tests the pushed commit, not the working tree).
  2. Pushes the branch (git push -u origin HEAD).
  3. Starts the CI workflow on it (gh workflow run) with the tier and the mutation options.
  4. Waits for the run (gh run watch, a check every 30 s) and writes artifacts/ci/summary.md: the run's link, every
     job's result and, for a failed run, the failed steps' log tails. Failed e2e parts: their traces and screenshots
     are downloaded to artifacts/ci/<artifact>/ (npx playwright show-trace <trace.zip>).
  Exit code: 0 when the run passed, else 1.
  Needs the GitHub CLI, signed in (gh auth login), with push access.

.PARAMETER Tier
  step (default): unit + integration tests, Vitest, the e2e smoke tests, the traceability report (about 5 min).
  full: + coverage gates, the whole e2e suite, the traceability gate (about 8 min; what every pull request runs, except into main: release).
  release: full + Stryker.NET on the critical files (one job per file) + StrykerJS (what every pull request into main runs).

.PARAMETER Mutate
  Backend files to mutate with Stryker.NET on any tier (repo-relative, comma separated or repeated), e.g.
  'ClinicHub.Application/Features/Access/Authorization/PermissionService.cs'. Gate: 85% on each file.

.PARAMETER Area
  With -Mutate: only these areas' integration tests score the mutants (auth, access, isolation, errors, admin, catalog).

.PARAMETER NoWait
  Start the run and return at once (its link is printed).

.EXAMPLE
  ./ci.ps1                      # step tier on this branch
  ./ci.ps1 -Tier full
  ./ci.ps1 -Tier step -Mutate 'ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs' -Area auth
#>
[CmdletBinding()]
param(
    [ValidateSet('step', 'full', 'release')] [string] $Tier = 'step',
    [string[]] $Mutate = @(),
    [string[]] $Area = @(),
    [switch] $NoWait
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out = Join-Path $root 'artifacts\ci'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Gh {
    $command = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    $installed = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
    if (Test-Path $installed) { return $installed }
    throw 'GitHub CLI (gh) not found: winget install GitHub.cli, then gh auth login'
}

# A native command's output (stdout and stderr) as text; a failure stops the script with its output. Windows
# PowerShell turns a native command's stderr line into an error under 'Stop' (git push writes its progress there)
function Invoke-Native([string] $exe, [string[]] $arguments) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $text = & $exe @arguments 2>&1 | ForEach-Object { "$_" } | Out-String
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $saved
    }
    if ($code -ne 0) { throw "$(Split-Path $exe -Leaf) $($arguments -join ' ') failed ($code): $text" }
    return $text.Trim()
}

function Invoke-Git([string[]] $arguments) { Invoke-Native 'git' (@('-C', $root) + $arguments) }

$gh = Get-Gh
$Mutate = @($Mutate | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().Replace('\', '/') } | Where-Object { $_ })
$Area = @($Area | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })

$branch = Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')
if ($branch -eq 'HEAD') { throw 'Detached HEAD: check out a branch first' }
if ($branch -eq 'main') { throw 'On main: CI runs on a branch (main changes only through a pull request)' }
$dirty = Invoke-Git @('status', '--porcelain', '--untracked-files=no')
if ($dirty) { throw "Uncommitted changes (CI tests the pushed commit): commit them first`n$dirty" }

Write-Host "Pushing $branch" -ForegroundColor Cyan
Write-Host (Invoke-Git @('push', '-u', 'origin', 'HEAD'))
$sha = Invoke-Git @('rev-parse', 'HEAD')

$started = (Get-Date).ToUniversalTime().AddSeconds(-5)
$arguments = @('workflow', 'run', 'ci.yml', '--ref', $branch, '-f', "tier=$Tier")
if ($Mutate.Count -gt 0) { $arguments += @('-f', "mutate=$($Mutate -join ',')") }
if ($Area.Count -gt 0) { $arguments += @('-f', "areas=$($Area -join ',')") }
Write-Host "Starting CI: tier $Tier on $branch @ $($sha.Substring(0, 7))$(if ($Mutate.Count) { ", mutating $($Mutate -join ', ')" })" -ForegroundColor Cyan
Write-Host (Invoke-Native $gh $arguments)

# The run just started: the newest manual run of this commit created after the request
$run = $null
for ($i = 0; $i -lt 30 -and -not $run; $i++) {
    Start-Sleep -Seconds 3
    $json = & $gh run list --workflow ci.yml --branch $branch --event workflow_dispatch --limit 10 --json 'databaseId,headSha,createdAt,url' | Out-String
    # Windows PowerShell's ConvertFrom-Json passes a JSON list on as one object: unroll it
    $run = $json | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object { $_.headSha -eq $sha -and ([datetime]$_.createdAt).ToUniversalTime() -ge $started } |
        Select-Object -First 1
}
if (-not $run) { throw 'The run did not show up within 90 s: look at the Actions tab' }
Write-Host "Run: $($run.url)" -ForegroundColor Cyan
if ($NoWait) { exit 0 }

# Waits with a check every 30 s (cheap); the exit code is the run's
& $gh run watch $run.databaseId --interval 30 --exit-status --compact | Out-Host
$passed = $LASTEXITCODE -eq 0

# ---------------------------------------------------------------- summary
# Best effort from here (gh writes progress to stderr): a missing log or artifact must not hide the verdict
$ErrorActionPreference = 'Continue'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$view = & $gh run view $run.databaseId --json 'jobs,conclusion,url' | Out-String | ConvertFrom-Json
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# CI: tier $Tier, $branch @ $($sha.Substring(0, 7))")
[void]$md.AppendLine('')
[void]$md.AppendLine("- Result: **$(if ($passed) { 'PASSED' } else { "FAILED ($($view.conclusion))" })**")
[void]$md.AppendLine("- Run (summary page: counts, coverage, traceability, seed; artifacts): $($view.url)")
[void]$md.AppendLine('')
[void]$md.AppendLine('| Job | Result | Time |')
[void]$md.AppendLine('|---|---|---:|')
foreach ($job in $view.jobs) {
    $time = ''
    if ($job.completedAt -and $job.startedAt -and ([datetime]$job.completedAt).Year -gt 2000) {
        $time = '{0:mm\:ss}' -f (([datetime]$job.completedAt) - ([datetime]$job.startedAt))
    }
    [void]$md.AppendLine("| $($job.name) | $($job.conclusion) | $time |")
}
if (-not $passed) {
    # The failed steps' logs, the last lines of each (the whole log: gh run view <id> --log-failed)
    $failedLog = & $gh run view $run.databaseId --log-failed 2>&1 | Out-String
    $tail = @($failedLog -split "`r?`n" | ForEach-Object { $_ -replace '\x1b\[[0-9;]*m', '' }) | Select-Object -Last 300
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Failed steps (last 300 lines; all: gh run view ' + $run.databaseId + ' --log-failed)')
    [void]$md.AppendLine('')
    [void]$md.AppendLine('```')
    foreach ($line in $tail) { [void]$md.AppendLine($line) }
    [void]$md.AppendLine('```')
    # A failed e2e part's traces, screenshots and API log
    $names = & $gh api "repos/{owner}/{repo}/actions/runs/$($run.databaseId)/artifacts" --jq '.artifacts[].name' 2>$null
    foreach ($name in @($names | Where-Object { $_ -like 'e2e-failures-*' })) {
        & $gh run download $run.databaseId --name $name --dir (Join-Path $out $name) 2>&1 | Out-Null
        [void]$md.AppendLine('')
        [void]$md.AppendLine("Downloaded ``$name`` to artifacts/ci/$name (traces: npx playwright show-trace <trace.zip>).")
    }
}
$summary = Join-Path $out 'summary.md'
[IO.File]::WriteAllText($summary, $md.ToString(), $utf8)

Write-Host ''
Write-Host "Summary: $summary" -ForegroundColor Cyan
if ($passed) { Write-Host 'CI PASSED' -ForegroundColor Green; exit 0 }
Write-Host 'CI FAILED' -ForegroundColor Red
exit 1
