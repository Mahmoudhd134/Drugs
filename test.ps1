<#
.SYNOPSIS
  Runs the ClinicHub tests at one depth (design D4) and writes artifacts/summary.md.

.DESCRIPTION
  step     all backend unit + all Vitest + integration smoke (Tier=Smoke) + the infra self-tests + the integration tests
           of the chosen areas (-Area, else from git diff); e2e only when UI files changed and an e2e script exists;
           traceability report (unknown case IDs fail).
  full     everything: all unit, Vitest with coverage gates, all integration with coverage, e2e (Chromium), the backend
           coverage gates (D5), the traceability gate (100% P0/P1, 80% P2).
  release  full + Stryker.NET on the critical backend modules (gate 85%) + StrykerJS (npm run test:mutation) + e2e on
           every browser (CLINICHUB_E2E_BROWSERS=all).
  PostgreSQL: the compose container (docker compose up -d). Test databases: drags_it_<run>_* (dropped at the end).
  Exit code: 0 when every stage passed and every gate held, else 1. Missing pieces (no npm script yet, no e2e) are
  skipped with a visible note.

.PARAMETER Area
  Integration areas for -Tier step: auth, access, isolation, errors, admin, catalog (comma separated or repeated), or
  "all". Default: from the changes (git diff against the branch point + uncommitted files).

.PARAMETER Seed
  Seed of the random test order (integration tests). Default: a new random seed, printed and written to the summary.

.EXAMPLE
  ./test.ps1                       # step tier, areas from git diff
  ./test.ps1 -Tier step -Area auth,access
  ./test.ps1 -Tier full
  ./test.ps1 -Tier step -Seed 1234 # reproduce an order
#>
[CmdletBinding()]
param(
    [ValidateSet('step', 'full', 'release')] [string] $Tier = 'step',
    [string[]] $Area = @(),
    [int] $Seed = -1,
    [switch] $NoBuild
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
$results = Join-Path $artifacts 'test-results'
$web = Join-Path $root 'ClinicHub.Web'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$allAreas = @('auth', 'access', 'isolation', 'errors', 'admin', 'catalog')
$stages = New-Object System.Collections.ArrayList
$runStart = Get-Date

# ---------------------------------------------------------------- helpers

function Add-Stage([string] $name, [string] $result, [TimeSpan] $time, [string] $note = '', $counts = $null) {
    [void]$stages.Add([pscustomobject]@{ Name = $name; Result = $result; Time = $time; Note = $note; Counts = $counts })
    $color = 'Green'
    if ($result -eq 'FAILED') { $color = 'Red' } elseif ($result -eq 'skipped') { $color = 'Yellow' }
    $line = "  [{0}] {1} ({2:mm\:ss})" -f $result, $name, $time
    if ($note) { $line += " - $note" }
    Write-Host $line -ForegroundColor $color
}

function Invoke-Stage([string] $name, [scriptblock] $body) {
    Write-Host ""
    Write-Host "== $name" -ForegroundColor Cyan
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $outcome = $null
    try {
        $outcome = & $body
    }
    catch {
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
        $outcome = @{ Result = 'FAILED'; Note = $_.Exception.Message }
    }
    $watch.Stop()
    if ($null -eq $outcome) { $outcome = @{ Result = 'passed' } }
    Add-Stage $name $outcome.Result $watch.Elapsed $outcome.Note $outcome.Counts
}

function Invoke-Native([string] $exe, [string[]] $arguments, [string] $workingDirectory = $root) {
    Push-Location $workingDirectory
    try {
        # To the console, not into the function's output (which must be the exit code only)
        & $exe @arguments | Out-Host
        return $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}

function Get-TrxCounts([string] $dir) {
    $total = 0; $passed = 0; $failed = 0; $skipped = 0; $bugs = 0
    foreach ($file in (Get-ChildItem -Path $dir -Filter *.trx -Recurse -ErrorAction SilentlyContinue)) {
        [xml] $trx = [IO.File]::ReadAllText($file.FullName, $utf8)
        $c = $trx.TestRun.ResultSummary.Counters
        $total += [int]$c.total; $passed += [int]$c.passed; $failed += [int]$c.failed
        $skipped += [int]$c.notExecuted
        $bugs += ([regex]::Matches($trx.OuterXml, 'BUG-\d{3}')).Count
    }
    [pscustomobject]@{ Total = $total; Passed = $passed; Failed = $failed; Skipped = $skipped; KnownBugMentions = $bugs }
}

function Get-NpmScripts {
    $package = Join-Path $web 'package.json'
    if (-not (Test-Path $package)) { return @() }
    $json = Get-Content $package -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $json.scripts) { return @() }
    return @($json.scripts.PSObject.Properties | ForEach-Object { $_.Name })
}

function Ensure-NodeModules {
    if (-not (Test-Path (Join-Path $web 'node_modules'))) {
        Write-Host '  node_modules missing: npm ci'
        $code = Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') $web
        if ($code -ne 0) { throw "npm ci failed ($code)" }
    }
}

function Get-ChangedFiles {
    # The branch point: the merge-base with the first of these branches that is not the current one
    $branch = (git -C $root rev-parse --abbrev-ref HEAD).Trim()
    $base = (git -C $root rev-parse HEAD).Trim()
    $baseName = 'HEAD'
    foreach ($candidate in @('m1.6-test-foundation', 'main')) {
        if ($candidate -eq $branch) { continue }
        git -C $root rev-parse --verify --quiet $candidate | Out-Null
        if ($LASTEXITCODE -ne 0) { continue }
        $base = (git -C $root merge-base HEAD $candidate).Trim()
        $baseName = $candidate
        break
    }
    $files = @(git -C $root diff --name-only $base) + @(git -C $root ls-files --others --exclude-standard)
    [pscustomobject]@{ Base = "$baseName@$($base.Substring(0, 7))"; Files = @($files | Where-Object { $_ } | Sort-Object -Unique) }
}

# Folder -> integration areas ("*" = every area). First match wins; backend files with no match count as "*".
$areaMap = @(
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/Auth/'; Areas = @('auth') },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/Access/'; Areas = @('access') },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/Isolation/'; Areas = @('isolation') },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/Errors/'; Areas = @('errors') },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/Admin/'; Areas = @('admin') },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/Catalog/'; Areas = @('catalog') },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/SelfTests/'; Areas = @() },
    @{ Pattern = '^tests/ClinicHub\.IntegrationTests/'; Areas = @('*') },
    @{ Pattern = '^ClinicHub\.Infrastructure/Migrations/'; Areas = @('*') },
    @{ Pattern = '^ClinicHub\.Infrastructure/Database/Configurations/Catalog/'; Areas = @('catalog') },
    @{ Pattern = '^ClinicHub\.Infrastructure/Database/'; Areas = @('isolation') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Infrastructure|Domain)/(Features/)?Identity/'; Areas = @('auth') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Infrastructure|Domain)/(Features/)?Access/'; Areas = @('access') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Infrastructure|Domain)/(Features/)?Platform/'; Areas = @('admin') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Domain)/(Features/)?(Catalog|Drugs|DrugGroups)/'; Areas = @('catalog') },
    @{ Pattern = '^ClinicHub\.Application/Common/(Paging|Search)/'; Areas = @('catalog', 'admin') },
    @{ Pattern = '^ClinicHub\.Application/Common/(Results|Behaviors|Validation|Messaging)/'; Areas = @('errors') },
    @{ Pattern = '^ClinicHub\.Application/Common/Settings/'; Areas = @('auth') },
    @{ Pattern = '^ClinicHub\.Application/Common/Abstractions/'; Areas = @('isolation') },
    @{ Pattern = '^ClinicHub\.Domain/Common/'; Areas = @('isolation') },
    @{ Pattern = '^ClinicHub\.Api/(Errors|Controllers)/'; Areas = @('errors') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Infrastructure|Domain)/'; Areas = @('*') }
)

function Resolve-Areas([string[]] $files) {
    $set = New-Object System.Collections.Generic.HashSet[string]
    foreach ($file in $files) {
        foreach ($entry in $areaMap) {
            if ($file -match $entry.Pattern) {
                foreach ($a in $entry.Areas) { [void]$set.Add($a) }
                break
            }
        }
    }
    if ($set.Contains('*')) { return @('all') }
    return @($set | Sort-Object)
}

# ---------------------------------------------------------------- setup

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
foreach ($dir in @($results, (Join-Path $artifacts 'coverage'), (Join-Path $artifacts 'mutation'))) {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

if ($Seed -lt 0) { $Seed = Get-Random -Minimum 1 -Maximum 1000000 }
$worktree = (Split-Path $root -Leaf).ToLowerInvariant() -replace '[^a-z0-9]', ''
if (-not $worktree) { $worktree = 'run' }
if ($worktree.Length -gt 20) { $worktree = $worktree.Substring(0, 20) }
$runId = "$worktree$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
$env:CLINICHUB_TEST_RUN = $runId
$env:CLINICHUB_TEST_SEED = "$Seed"

$changes = Get-ChangedFiles
$uiChanged = @($changes.Files | Where-Object { $_ -like 'ClinicHub.Web/*' }).Count -gt 0
$areaSource = "-Area"
$areas = @($Area | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToLowerInvariant() })
if ($areas.Count -eq 0) {
    $areas = Resolve-Areas $changes.Files
    $areaSource = "git diff vs $($changes.Base) ($($changes.Files.Count) files)"
}
foreach ($a in $areas) {
    if ($a -ne 'all' -and $allAreas -notcontains $a) { throw "Unknown area '$a' (known: $($allAreas -join ', '), all)" }
}
$scripts = Get-NpmScripts

Write-Host "ClinicHub tests: tier $Tier, run $runId, seed $Seed" -ForegroundColor Cyan
if ($Tier -eq 'step') {
    $shown = 'none (smoke + infra only)'; if ($areas.Count -gt 0) { $shown = $areas -join ', ' }
    Write-Host "Integration areas: $shown (from $areaSource)"
}

# ---------------------------------------------------------------- stages

Invoke-Stage 'PostgreSQL (docker compose)' {
    $code = Invoke-Native 'docker' @('compose', 'up', '-d')
    if ($code -ne 0) { throw "docker compose up failed ($code)" }
    for ($i = 0; $i -lt 60; $i++) {
        & docker exec drags-postgres pg_isready -U drags -d postgres | Out-Null
        if ($LASTEXITCODE -eq 0) { return @{ Result = 'passed' } }
        Start-Sleep -Seconds 1
    }
    throw 'PostgreSQL not ready after 60 s'
}

if ($Tier -ne 'step') {
    Invoke-Stage 'Tools (dotnet tool restore)' {
        $code = Invoke-Native 'dotnet' @('tool', 'restore')
        if ($code -ne 0) { throw "dotnet tool restore failed ($code)" }
    }
}

if ($NoBuild) {
    Add-Stage 'Build (Release)' 'skipped' ([TimeSpan]::Zero) '-NoBuild'
}
else {
    Invoke-Stage 'Build (Release)' {
        $code = Invoke-Native 'dotnet' @('build', 'ClinicHub.sln', '-c', 'Release', '-nologo', '-v', 'q')
        if ($code -ne 0) { throw "build failed ($code)" }
    }
}
$buildFailed = @($stages | Where-Object { $_.Name -like 'Build*' -and $_.Result -eq 'FAILED' }).Count -gt 0
$coverage = $Tier -ne 'step'

function Invoke-DotnetTests([string] $project, [string] $name, [string] $filter) {
    $dir = Join-Path $results $name
    $arguments = @('test', $project, '-c', 'Release', '--no-build', '--nologo',
        '--logger', "trx;LogFileName=$name.trx", '--results-directory', $dir)
    if ($filter) { $arguments += @('--filter', $filter) }
    if ($coverage) { $arguments += @('--collect', 'XPlat Code Coverage', '--settings', (Join-Path $root 'tests\coverage.runsettings')) }
    $code = Invoke-Native 'dotnet' $arguments
    $counts = Get-TrxCounts $dir
    $note = "$($counts.Passed) passed, $($counts.Failed) failed, $($counts.Skipped) skipped"
    if ($counts.Total -eq 0) { $note = 'no tests yet' }
    $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
    return @{ Result = $result; Note = $note; Counts = $counts }
}

if ($buildFailed) {
    Add-Stage 'Tests' 'skipped' ([TimeSpan]::Zero) 'the build failed'
}
else {
    Invoke-Stage 'Backend unit tests' { Invoke-DotnetTests 'tests\ClinicHub.UnitTests\ClinicHub.UnitTests.csproj' 'unit' '' }

    $vitestScript = 'test'; if ($Tier -ne 'step' -and $scripts -contains 'test:coverage') { $vitestScript = 'test:coverage' }
    if ($scripts -contains $vitestScript) {
        Invoke-Stage "Frontend tests (npm run $vitestScript)" {
            Ensure-NodeModules
            $code = Invoke-Native 'npm.cmd' @('run', $vitestScript) $web
            $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
            $note = ''
            if ($vitestScript -eq 'test' -and $Tier -ne 'step') { $note = 'no test:coverage script yet: Vitest coverage gates not checked' }
            return @{ Result = $result; Note = $note }
        }
    }
    else {
        Add-Stage 'Frontend tests (Vitest)' 'skipped' ([TimeSpan]::Zero) 'no "test" script in ClinicHub.Web/package.json yet'
    }

    $filter = ''
    $label = 'Integration tests (all)'
    if ($Tier -eq 'step' -and $areas -notcontains 'all') {
        $parts = @('Tier=Smoke', 'Area=infra') + @($areas | ForEach-Object { "Area=$_" })
        $filter = $parts -join '|'
        $label = "Integration tests (smoke + infra$(@($areas | ForEach-Object { " + $_" }) -join ''))"
    }
    Invoke-Stage $label { Invoke-DotnetTests 'tests\ClinicHub.IntegrationTests\ClinicHub.IntegrationTests.csproj' 'integration' $filter }

    # Belt and braces: the run drops its databases itself; a crash leaves them to the next run's cleanup
    & docker exec drags-postgres psql -U drags -d postgres -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'drags\_it\_$runId\_%'" |
        Where-Object { $_ -match "^drags_it_$($runId)_[a-z0-9]+$" } |
        ForEach-Object { & docker exec drags-postgres psql -U drags -d postgres -qc "DROP DATABASE IF EXISTS `"$_`" WITH (FORCE)" | Out-Null }

    $runE2e = $scripts -contains 'e2e' -and ($Tier -ne 'step' -or $uiChanged)
    if ($runE2e) {
        Invoke-Stage 'End-to-end tests (npm run e2e)' {
            Ensure-NodeModules
            if ($Tier -eq 'release') { $env:CLINICHUB_E2E_BROWSERS = 'all' } else { $env:CLINICHUB_E2E_BROWSERS = 'chromium' }
            $code = Invoke-Native 'npm.cmd' @('run', 'e2e') $web
            $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
            return @{ Result = $result; Note = "browsers: $env:CLINICHUB_E2E_BROWSERS" }
        }
    }
    else {
        $why = 'no "e2e" script in ClinicHub.Web/package.json yet'
        if ($scripts -contains 'e2e') { $why = 'no UI file changed (step tier)' }
        Add-Stage 'End-to-end tests' 'skipped' ([TimeSpan]::Zero) $why
    }
}

$coverageNote = ''
if ($coverage -and -not $buildFailed) {
    Invoke-Stage 'Backend coverage gates' {
        $reports = @(Get-ChildItem -Path $results -Filter coverage.cobertura.xml -Recurse | ForEach-Object { $_.FullName })
        if ($reports.Count -eq 0) { throw 'no coverage report produced' }
        $target = Join-Path $artifacts 'coverage\backend'
        $code = Invoke-Native 'dotnet' @('reportgenerator', "-reports:$($reports -join ';')", "-targetdir:$target",
            '-reporttypes:Cobertura;HtmlSummary;Html;JsonSummary', '-verbosity:Warning')
        if ($code -ne 0) { throw "reportgenerator failed ($code)" }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tests\tools\coverage\coverage-gates.ps1') `
            -Cobertura (Join-Path $target 'Cobertura.xml') -OutDir $target
        $result = 'passed'; if ($LASTEXITCODE -ne 0) { $result = 'FAILED' }
        return @{ Result = $result; Note = 'artifacts/coverage/backend (index.html, gates.md)' }
    }
}

Invoke-Stage 'Traceability' {
    if ($Tier -ne 'step') {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tests\tools\traceability\selftest.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'the traceability self-test failed' }
    }
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'tests\tools\traceability\traceability.ps1'), '-Root', $root)
    if ($Tier -ne 'step') { $arguments += '-Gate' }
    & powershell.exe @arguments
    $result = 'passed'; if ($LASTEXITCODE -ne 0) { $result = 'FAILED' }
    $note = 'report only (unknown IDs fail)'; if ($Tier -ne 'step') { $note = 'gate: 100% P0/P1, 80% P2' }
    return @{ Result = $result; Note = $note }
}

if ($Tier -eq 'release' -and -not $buildFailed) {
    Invoke-Stage 'Backend mutation (Stryker.NET, critical modules)' {
        # Each Stryker test process makes its own test run (own databases): no shared run id
        $saved = $env:CLINICHUB_TEST_RUN
        Remove-Item Env:\CLINICHUB_TEST_RUN
        try {
            # Run from the repo root: the config's solution path is relative to it
            $code = Invoke-Native 'dotnet' @('stryker', '-f', 'tests\stryker-config.json', '-O', (Join-Path $artifacts 'mutation\backend'))
        }
        finally {
            $env:CLINICHUB_TEST_RUN = $saved
        }
        $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
        return @{ Result = $result; Note = 'gate 85% (break), artifacts/mutation/backend' }
    }
    if ($scripts -contains 'test:mutation') {
        Invoke-Stage 'Frontend mutation (npm run test:mutation)' {
            Ensure-NodeModules
            $code = Invoke-Native 'npm.cmd' @('run', 'test:mutation') $web
            $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
            return @{ Result = $result; Note = 'artifacts/mutation/frontend' }
        }
    }
    else {
        Add-Stage 'Frontend mutation' 'skipped' ([TimeSpan]::Zero) 'no "test:mutation" script in ClinicHub.Web/package.json yet'
    }
}

# ---------------------------------------------------------------- summary

$knownBugRows = 0
foreach ($file in (Get-ChildItem -Path (Join-Path $root 'docs\testing') -Filter 'known-bugs*.md' -ErrorAction SilentlyContinue)) {
    $knownBugRows += @([IO.File]::ReadAllLines($file.FullName, $utf8) | Where-Object { $_ -match '^\|\s*BUG-\d{3}\s*\|' }).Count
}
$failedStages = @($stages | Where-Object { $_.Result -eq 'FAILED' })
$total = (Get-Date) - $runStart

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('# Test summary')
[void]$md.AppendLine('')
[void]$md.AppendLine("- Tier: **$Tier**, run ``$runId``, seed $Seed (reproduce: ``./test.ps1 -Tier $Tier -Seed $Seed``), $($runStart.ToString('yyyy-MM-dd HH:mm'))")
if ($Tier -eq 'step') {
    $shown = 'none (smoke + infra only)'; if ($areas.Count -gt 0) { $shown = $areas -join ', ' }
    [void]$md.AppendLine("- Integration areas: $shown (from $areaSource)")
}
$verdict = 'PASSED'; if ($failedStages.Count -gt 0) { $verdict = "FAILED ($($failedStages.Count) stage(s))" }
[void]$md.AppendLine("- Result: **$verdict** in $('{0:mm\:ss}' -f $total)")
[void]$md.AppendLine('')
[void]$md.AppendLine('| Stage | Result | Passed | Failed | Skipped | Time | Note |')
[void]$md.AppendLine('|---|---|---:|---:|---:|---:|---|')
foreach ($s in $stages) {
    $p = ''; $f = ''; $k = ''
    if ($s.Counts) { $p = $s.Counts.Passed; $f = $s.Counts.Failed; $k = $s.Counts.Skipped }
    [void]$md.AppendLine("| $($s.Name) | $($s.Result) | $p | $f | $k | $('{0:mm\:ss}' -f $s.Time) | $($s.Note) |")
}
$gatesFile = Join-Path $artifacts 'coverage\backend\gates.md'
if (Test-Path $gatesFile) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Backend coverage (D5)')
    [void]$md.AppendLine('')
    [void]$md.Append([IO.File]::ReadAllText($gatesFile, $utf8))
}
$frontendSummary = Join-Path $artifacts 'coverage\frontend\coverage-summary.json'
if (Test-Path $frontendSummary) {
    $fs = Get-Content $frontendSummary -Raw -Encoding UTF8 | ConvertFrom-Json
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Frontend coverage')
    [void]$md.AppendLine('')
    [void]$md.AppendLine("Lines $($fs.total.lines.pct)%, branches $($fs.total.branches.pct)% (gates enforced by ``npm run test:coverage``; report: artifacts/coverage/frontend).")
}
$traceFile = Join-Path $artifacts 'traceability.json'
if (Test-Path $traceFile) {
    $t = Get-Content $traceFile -Raw -Encoding UTF8 | ConvertFrom-Json
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Traceability (D2)')
    [void]$md.AppendLine('')
    [void]$md.AppendLine('| Priority | Covered | Known bug | Missing | % | Gate |')
    [void]$md.AppendLine('|---|---:|---:|---:|---:|---:|')
    foreach ($g in $t.gate) { [void]$md.AppendLine("| $($g.Priority) | $($g.Covered) | $($g.KnownBug) | $($g.Missing) | $($g.Percent)% | $($g.Gate)% |") }
    if (@($t.unknownIds).Count -gt 0) { [void]$md.AppendLine("Unknown IDs: $($t.unknownIds -join '; ')") }
    [void]$md.AppendLine('')
    [void]$md.AppendLine('Details: artifacts/traceability.md')
}
$mutation = @(Get-ChildItem -Path (Join-Path $artifacts 'mutation') -Filter 'mutation-report.json' -Recurse -ErrorAction SilentlyContinue)
if ($mutation.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Mutation')
    [void]$md.AppendLine('')
    foreach ($m in $mutation) { [void]$md.AppendLine("- $($m.FullName.Substring($root.Length + 1))") }
}
$bugMentions = 0
foreach ($s in $stages) { if ($s.Counts) { $bugMentions += $s.Counts.KnownBugMentions } }
[void]$md.AppendLine('')
[void]$md.AppendLine('## Known bugs (D9)')
[void]$md.AppendLine('')
[void]$md.AppendLine("$knownBugRows entries in docs/testing/known-bugs*.md; $bugMentions BUG-nnn mentions in the .NET test results (skipped known-bug tests).")

$summaryPath = Join-Path $artifacts 'summary.md'
[IO.File]::WriteAllText($summaryPath, $md.ToString(), $utf8)

Write-Host ""
Write-Host "Summary: $summaryPath" -ForegroundColor Cyan
foreach ($s in $stages) {
    $color = 'Gray'; if ($s.Result -eq 'FAILED') { $color = 'Red' } elseif ($s.Result -eq 'skipped') { $color = 'Yellow' }
    Write-Host ("  {0,-8} {1:mm\:ss}  {2}  {3}" -f $s.Result, $s.Time, $s.Name, $s.Note) -ForegroundColor $color
}
Write-Host ("Total {0:mm\:ss}: {1}" -f $total, $verdict)
if ($failedStages.Count -gt 0) { exit 1 }
exit 0
