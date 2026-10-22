<#
.SYNOPSIS
  Runs the ClinicHub tests at one depth (design D4) and writes artifacts/summary.md.

.DESCRIPTION
  step     all backend unit + all Vitest + integration smoke (Tier=Smoke) + the infra self-tests + the integration tests
           of the chosen areas (-Area, else from git diff); e2e smoke (npm run e2e -- --grep @smoke) only when UI files
           changed and an e2e script exists; traceability report (unknown case IDs, skips without a bug ID and
           known-bug tests that never run fail).
  full     everything: all unit, Vitest with coverage gates, all integration with coverage, the whole e2e suite
           (Chromium), the backend coverage gates (D5), the traceability gate (100% P0 and P1; P2 reported, not gated).
  release  full + Stryker.NET on the 6 critical backend files of tests/stryker-config.json (gate 85% on each) +
           StrykerJS (npm run test:mutation). E2E stays Chromium only (CLINICHUB_E2E_BROWSERS=chromium).
  -Mutate  (any tier) also runs Stryker.NET on the files you name (to prove the tests of a file you changed).
  PostgreSQL: the compose container (docker compose up -d). Test databases: drags_it_<run>_* (dropped at the end).
  Exit code: 0 when every stage passed and every gate held, else 1 (also when the runner itself fails). Missing pieces
  (no npm script yet, no e2e) are skipped with a visible note.

.PARAMETER Area
  Integration areas for -Tier step: auth, access, isolation, errors, admin, catalog (comma separated or repeated), or
  "all". Default: from the changes (git diff against the branch point + uncommitted files, see -Base).

.PARAMETER Base
  The ref the changes are compared with (step tier, areas from git diff). Default: on an integration branch (main,
  m1.6-test-foundation) its last commit plus uncommitted files; on any other branch, the merge-base with the first
  integration branch that exists (m1.6-test-foundation, else main).

.PARAMETER Seed
  Seed of the random test order (integration tests). Default: a new random seed, printed and written to the summary.

.PARAMETER Mutate
  Files to mutate with Stryker.NET (glob patterns, repo-relative or starting with **; comma separated or repeated), e.g.
  'ClinicHub.Application/Features/Access/Authorization/PermissionService.cs'. Replaces the config's critical-file list
  for this run; the 85% gate applies to each mutated file, and a list that matches no code FAILS the stage. With an
  explicit -Area (not "all"), only that area's integration tests run against the mutants (Stryker's test-case-filter
  "(Area=a|Area=b)&FullyQualifiedName~ClinicHub.IntegrationTests"), so the score is the area's own; without -Area, every
  .NET test (unit + integration) counts. Report: artifacts/mutation/backend.

.EXAMPLE
  ./test.ps1                       # step tier, areas from git diff
  ./test.ps1 -Tier step -Area auth,access
  ./test.ps1 -Tier full
  ./test.ps1 -Tier step -Seed 1234 # reproduce an order
  ./test.ps1 -Tier step -Area auth -Mutate 'ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs'
#>
[CmdletBinding()]
param(
    [ValidateSet('step', 'full', 'release')] [string] $Tier = 'step',
    [string[]] $Area = @(),
    [string] $Base = '',
    [int] $Seed = -1,
    [string[]] $Mutate = @(),
    [switch] $NoBuild
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
$results = Join-Path $artifacts 'test-results'
$web = Join-Path $root 'ClinicHub.Web'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$allAreas = @('auth', 'access', 'isolation', 'errors', 'admin', 'catalog')
# Branches that tracks merge into; after M1.6 is merged, only main stays
$integrationBranches = @('m1.6-test-foundation', 'main')
$stages = New-Object System.Collections.ArrayList
$runStart = Get-Date
$fatal = $null

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

# Another PowerShell script (the gates, traceability): its output to the console, its exit code back
function Invoke-Script([string] $script, [string[]] $arguments = @()) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script @arguments | Out-Host
    return $LASTEXITCODE
}

# npm as installed (npm.cmd with the Node.js installer, npm.exe with nvm-style setups)
function Get-Npm {
    $command = Get-Command npm -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) { throw 'npm not found on PATH (Node.js is needed for the frontend stages)' }
    return $command.Source
}

# Counts from each test result (UnitTestResult outcome): VSTest's own counters leave skipped xUnit tests out
function Get-TrxCounts([string] $dir) {
    $total = 0; $passed = 0; $failed = 0; $skipped = 0
    $knownBugTests = 0
    $knownBugIds = New-Object System.Collections.Generic.SortedSet[string]
    foreach ($file in (Get-ChildItem -Path $dir -Filter *.trx -Recurse -ErrorAction SilentlyContinue)) {
        [xml] $trx = [IO.File]::ReadAllText($file.FullName, $utf8)
        foreach ($result in @($trx.TestRun.Results.UnitTestResult)) {
            if ($null -eq $result) { continue }
            $total++
            switch ($result.outcome) {
                'Passed' { $passed++ }
                'NotExecuted' {
                    $skipped++
                    $message = "$($result.Output.ErrorInfo.Message)".Trim()
                    if ($message -match '^(BUG-\d{3})') { $knownBugTests++; [void]$knownBugIds.Add($Matches[1]) }
                }
                default { $failed++ }
            }
        }
    }
    [pscustomobject]@{ Total = $total; Passed = $passed; Failed = $failed; Skipped = $skipped
        KnownBugTests = $knownBugTests; KnownBugIds = @($knownBugIds) }
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
        $code = Invoke-Native (Get-Npm) @('ci', '--no-audit', '--no-fund') $web
        if ($code -ne 0) { throw "npm ci failed ($code)" }
    }
}

function Test-Ref([string] $ref) {
    git -C $root rev-parse --verify --quiet "$ref^{commit}" | Out-Null
    return $LASTEXITCODE -eq 0
}

function Get-ChangedFiles {
    $branch = (git -C $root rev-parse --abbrev-ref HEAD).Trim()
    if ($Base) {
        if (-not (Test-Ref $Base)) { throw "-Base '$Base' is not a commit" }
        $baseCommit = (git -C $root merge-base HEAD $Base).Trim()
        $baseName = $Base
    }
    elseif ($integrationBranches -contains $branch) {
        # On the branch the tracks merge into: what the last commit (a merge) and the working tree change
        $baseCommit = (git -C $root rev-parse HEAD).Trim()
        $baseName = 'HEAD (uncommitted)'
        if (Test-Ref 'HEAD~1') { $baseCommit = (git -C $root rev-parse 'HEAD~1').Trim(); $baseName = 'HEAD~1 (last commit + uncommitted)' }
    }
    else {
        $baseCommit = (git -C $root rev-parse HEAD).Trim()
        $baseName = 'HEAD (uncommitted)'
        foreach ($candidate in $integrationBranches) {
            if (-not (Test-Ref $candidate)) { continue }
            $baseCommit = (git -C $root merge-base HEAD $candidate).Trim()
            $baseName = "merge-base with $candidate"
            break
        }
    }
    $files = @(git -C $root diff --name-only $baseCommit) + @(git -C $root ls-files --others --exclude-standard)
    [pscustomobject]@{ Base = "$baseName@$($baseCommit.Substring(0, 7))"; Files = @($files | Where-Object { $_ } | Sort-Object -Unique) }
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
    @{ Pattern = '^ClinicHub\.Infrastructure/Database/Configurations/Identity/'; Areas = @('auth') },
    @{ Pattern = '^ClinicHub\.Infrastructure/Database/Configurations/Access/'; Areas = @('access', 'admin') },
    @{ Pattern = '^ClinicHub\.Infrastructure/Database/Configurations/Platform/'; Areas = @('admin', 'auth') },
    @{ Pattern = '^ClinicHub\.Infrastructure/Database/'; Areas = @('isolation') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Infrastructure|Domain)/(Features/)?Identity/'; Areas = @('auth') },
    # The admin staff and role screens call the same use cases as the clinic's own
    @{ Pattern = '^ClinicHub\.(Application|Domain)/(Features/)?Access/(Roles|StaffMembers)/'; Areas = @('access', 'admin') },
    # The super-admin gate of every /admin endpoint
    @{ Pattern = '^ClinicHub\.Api/Features/Access/PlatformAdmin'; Areas = @('access', 'admin') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Infrastructure|Domain)/(Features/)?Access/'; Areas = @('access') },
    # A clinic's state decides who can log in
    @{ Pattern = '^ClinicHub\.(Application|Domain)/(Features/)?Platform/'; Areas = @('admin', 'auth') },
    @{ Pattern = '^ClinicHub\.(Api|Infrastructure)/(Features/)?Platform/'; Areas = @('admin') },
    @{ Pattern = '^ClinicHub\.(Api|Application|Domain)/(Features/)?(Catalog|Drugs|Protocols)/'; Areas = @('catalog') },
    @{ Pattern = '^ClinicHub\.Application/Common/(Paging|Search)/'; Areas = @('catalog', 'admin') },
    @{ Pattern = '^ClinicHub\.Application/Common/(Results|Behaviors|Validation|Messaging)/'; Areas = @('errors') },
    @{ Pattern = '^ClinicHub\.Application/Common/Settings/PlatformSettings'; Areas = @('admin', 'auth') },
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

function Invoke-DotnetTests([string] $project, [string] $name, [string] $filter, [bool] $coverage) {
    $dir = Join-Path $results $name
    $arguments = @('test', $project, '-c', 'Release', '--no-build', '--nologo',
        '--logger', "trx;LogFileName=$name.trx", '--results-directory', $dir)
    if ($filter) { $arguments += @('--filter', $filter) }
    if ($coverage) { $arguments += @('--collect', 'XPlat Code Coverage', '--settings', (Join-Path $root 'tests\coverage.runsettings')) }
    $code = Invoke-Native 'dotnet' $arguments
    $counts = Get-TrxCounts $dir
    $note = "$($counts.Passed) passed, $($counts.Failed) failed, $($counts.Skipped) skipped"
    if ($counts.KnownBugTests -gt 0) { $note += " ($($counts.KnownBugTests) known bug: $($counts.KnownBugIds -join ', '))" }
    if ($counts.Total -eq 0) { $note = 'no tests yet' }
    $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
    return @{ Result = $result; Note = $note; Counts = $counts }
}

# Stryker.NET from the local tool manifest (never a tool installed under a long folder: the 260-character path
# limit breaks it). With $mutateGlobs, that file list instead of the config's; with $testAreas, only those areas'
# integration tests run against the mutants. The 85% gate applies to each mutated file (mutation-score.ps1).
function Invoke-Stryker([string[]] $mutateGlobs, [string[]] $testAreas) {
    $out = Join-Path $artifacts 'mutation\backend'
    $json = Get-Content (Join-Path $root 'tests\stryker-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $options = $json.'stryker-config'
    if ($mutateGlobs.Count -gt 0) {
        $options.mutate = @($mutateGlobs | ForEach-Object {
                $glob = $_.Replace([char]92, [char]47)
                if ($glob.StartsWith('**') -or $glob.StartsWith('!')) { $glob } else { "**/$glob" }
            })
    }
    $tests = 'every .NET test (unit + integration)'
    if ($testAreas.Count -gt 0) {
        $filter = "($(@($testAreas | ForEach-Object { "Area=$_" }) -join '|'))&FullyQualifiedName~ClinicHub.IntegrationTests"
        $options | Add-Member -NotePropertyName 'test-case-filter' -NotePropertyValue $filter -Force
        $tests = "integration tests of $($testAreas -join ', ') ($filter)"
    }
    $options.solution = Join-Path $root 'ClinicHub.sln'
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $config = Join-Path $artifacts 'mutation\stryker-config.chosen.json'
    [IO.File]::WriteAllText($config, ($json | ConvertTo-Json -Depth 5), $utf8)
    Write-Host "  mutating: $($options.mutate -join ', ')"
    Write-Host "  tests: $tests"
    $log = Join-Path $out 'stryker.log'
    # Each Stryker test process makes its own test run (own databases): no shared run id
    $saved = $env:CLINICHUB_TEST_RUN
    Remove-Item Env:\CLINICHUB_TEST_RUN
    Push-Location $root
    try {
        # To the console and to a log (read below for tests failing without any mutant)
        & dotnet stryker -f $config -O $out | Tee-Object -Variable strykerOutput | Out-Host
        $code = $LASTEXITCODE
        [IO.File]::WriteAllLines($log, [string[]]@($strykerOutput), $utf8)
    }
    finally {
        Pop-Location
        $env:CLINICHUB_TEST_RUN = $saved
    }
    $report = Join-Path $out 'reports\mutation-report.json'
    if (-not (Test-Path $report)) {
        return @{ Result = 'FAILED'; Note = "Stryker failed before scoring (see its log above, artifacts/mutation/backend/stryker.log); a build error such as CS0518 under load: rerun" }
    }
    $scoreCode = Invoke-Script (Join-Path $root 'tests\tools\mutation\mutation-score.ps1') @('-Report', $report, '-OutDir', $out, '-Gate', '85')
    $summary = Get-Content (Join-Path $out 'mutation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $note = "score $($summary.score)% (gate 85% per file), artifacts/mutation/backend"
    $result = 'passed'
    if ($summary.tested -eq 0) { $result = 'FAILED'; $note = "no mutant in $($options.mutate -join ', ')" }
    elseif ($scoreCode -ne 0 -or $code -ne 0) { $result = 'FAILED' }
    # Tests that already fail without any mutant make the score meaningless (Stryker only warns)
    $failing = Select-String -Path $log -Pattern '(\d+) tests? (is|are) failing' | Select-Object -First 1
    if ($failing) {
        $result = 'FAILED'
        $note = "$($failing.Matches[0].Groups[1].Value) test(s) failed in Stryker's initial run (score not trustworthy, see the log); $note"
    }
    return @{ Result = $result; Note = $note }
}

# ---------------------------------------------------------------- run

$runId = ''
$areas = @()
$areaSource = '-Area'
try {
    New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
    # Never leave a previous run's summary behind (a crash below still writes a new one)
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $artifacts 'summary.md'), (Join-Path $artifacts 'traceability.md'), (Join-Path $artifacts 'traceability.json')
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

    $areas = @($Area | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToLowerInvariant() })
    # powershell -File passes "-Mutate a.cs,b.cs" as one string: split it like -Area
    $Mutate = @($Mutate | ForEach-Object { $_ -split ',' } | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
    # Only an explicit -Area (not "all") narrows the tests run against the mutants
    $mutateAreas = @()
    if ($areas -notcontains 'all') { $mutateAreas = $areas }
    foreach ($a in $areas) {
        if ($a -ne 'all' -and $allAreas -notcontains $a) { throw "Unknown area '$a' (known: $($allAreas -join ', '), all)" }
    }
    $changes = Get-ChangedFiles
    $uiChanged = @($changes.Files | Where-Object { $_ -like 'ClinicHub.Web/*' }).Count -gt 0
    if ($areas.Count -eq 0) {
        $areas = Resolve-Areas $changes.Files
        $areaSource = "git diff vs $($changes.Base) ($($changes.Files.Count) files)"
    }
    $scripts = Get-NpmScripts

    Write-Host "ClinicHub tests: tier $Tier, run $runId, seed $Seed" -ForegroundColor Cyan
    if ($Tier -eq 'step') {
        $shown = 'none (smoke + infra only)'; if ($areas.Count -gt 0) { $shown = $areas -join ', ' }
        Write-Host "Integration areas: $shown (from $areaSource)"
    }

    # ------------------------------------------------------------ stages

    # The integration harness and the e2e setup load the shared drug catalog with Python + psycopg (design M1.7 D12):
    # checked once up front, so a missing prerequisite stops the run with the install command instead of failing
    # every test. The message is CatalogLoader.InstallHint (tests/ClinicHub.IntegrationTests/Harness/Databases).
    Invoke-Stage 'Prerequisites (Python + psycopg)' {
        $installHint = 'The integration tests load the shared drug catalog with Python 3 and psycopg: install Python 3.10+ (python on the PATH), then run: python -m pip install "psycopg[binary]"'
        $python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $python) { throw $installHint }
        # PowerShell 5.1 turns a native stderr line into an error record: only the exit code matters here
        $ErrorActionPreference = 'Continue'
        & $python.Source -c 'import psycopg' 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw $installHint }
    }
    if (@($stages | Where-Object { $_.Name -like 'Prerequisites*' -and $_.Result -eq 'FAILED' }).Count -gt 0) {
        throw 'a test prerequisite is missing (see the Prerequisites stage)'
    }

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

    if ($Tier -ne 'step' -or $Mutate.Count -gt 0) {
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

    if ($buildFailed) {
        Add-Stage 'Tests' 'skipped' ([TimeSpan]::Zero) 'the build failed'
    }
    else {
        Invoke-Stage 'Backend unit tests' { Invoke-DotnetTests 'tests\ClinicHub.UnitTests\ClinicHub.UnitTests.csproj' 'unit' '' $coverage }

        $vitestScript = 'test'; if ($Tier -ne 'step' -and $scripts -contains 'test:coverage') { $vitestScript = 'test:coverage' }
        if ($scripts -contains $vitestScript) {
            Invoke-Stage "Frontend tests (npm run $vitestScript)" {
                Ensure-NodeModules
                $code = Invoke-Native (Get-Npm) @('run', $vitestScript) $web
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
        Invoke-Stage $label { Invoke-DotnetTests 'tests\ClinicHub.IntegrationTests\ClinicHub.IntegrationTests.csproj' 'integration' $filter $coverage }

        # Belt and braces: the run drops its databases itself; a crash leaves them to the next run's cleanup
        try {
            & docker exec drags-postgres psql -U drags -d postgres -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'drags\_it\_$runId\_%'" |
                Where-Object { $_ -match "^drags_it_$($runId)_[a-z0-9]+(_bare)?$" } |
                ForEach-Object { & docker exec drags-postgres psql -U drags -d postgres -qc "DROP DATABASE IF EXISTS `"$_`" WITH (FORCE)" | Out-Null }
        }
        catch {
            Write-Host "  (leftover database check skipped: $($_.Exception.Message))" -ForegroundColor Yellow
        }

        # e2e contract: "npm run e2e" = the whole Playwright suite; step adds "-- --grep @smoke"; the Playwright config
        # picks its projects from CLINICHUB_E2E_BROWSERS (always "chromium": the Chromium projects)
        $runE2e = $scripts -contains 'e2e' -and ($Tier -ne 'step' -or $uiChanged)
        if ($runE2e) {
            $e2eArguments = @('run', 'e2e')
            $e2eLabel = 'End-to-end tests (npm run e2e)'
            if ($Tier -eq 'step') { $e2eArguments += @('--', '--grep', '@smoke'); $e2eLabel = 'End-to-end smoke (npm run e2e -- --grep @smoke)' }
            Invoke-Stage $e2eLabel {
                Ensure-NodeModules
                # Chromium only, on every tier (the user's trim, 2026-10-15)
                $env:CLINICHUB_E2E_BROWSERS = 'chromium'
                $code = Invoke-Native (Get-Npm) $e2eArguments $web
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

    if ($coverage -and -not $buildFailed) {
        Invoke-Stage 'Backend coverage gates' {
            $reports = @(Get-ChildItem -Path $results -Filter coverage.cobertura.xml -Recurse | ForEach-Object { $_.FullName })
            if ($reports.Count -eq 0) { throw 'no coverage report produced' }
            $target = Join-Path $artifacts 'coverage\backend'
            $code = Invoke-Native 'dotnet' @('reportgenerator', "-reports:$($reports -join ';')", "-targetdir:$target",
                '-reporttypes:Cobertura;HtmlSummary;Html;JsonSummary', '-verbosity:Warning')
            if ($code -ne 0) { throw "reportgenerator failed ($code)" }
            $code = Invoke-Script (Join-Path $root 'tests\tools\coverage\coverage-gates.ps1') @('-Cobertura', (Join-Path $target 'Cobertura.xml'), '-OutDir', $target)
            $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
            return @{ Result = $result; Note = 'artifacts/coverage/backend (index.html, gates.md)' }
        }
    }

    Invoke-Stage 'Traceability' {
        if ($Tier -ne 'step') {
            if ((Invoke-Script (Join-Path $root 'tests\tools\traceability\selftest.ps1')) -ne 0) { throw 'the traceability self-test failed' }
        }
        $arguments = @('-Root', $root)
        if ($Tier -ne 'step') { $arguments += '-Gate' }
        $code = Invoke-Script (Join-Path $root 'tests\tools\traceability\traceability.ps1') $arguments
        $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
        $note = 'report only (unknown IDs, skips without a bug ID and known-bug tests that never run fail)'; if ($Tier -ne 'step') { $note = 'gate: 100% P0 and P1 (P2 reported)' }
        return @{ Result = $result; Note = $note }
    }

    if (-not $buildFailed -and ($Tier -eq 'release' -or $Mutate.Count -gt 0)) {
        $mutationLabel = 'Backend mutation (Stryker.NET, critical files)'
        $testAreas = @()
        if ($Mutate.Count -gt 0) {
            $mutationLabel = 'Backend mutation (Stryker.NET, -Mutate files)'
            $testAreas = $mutateAreas
        }
        Invoke-Stage $mutationLabel { Invoke-Stryker $Mutate $testAreas }
    }
    if ($Tier -eq 'release' -and -not $buildFailed) {
        if ($scripts -contains 'test:mutation') {
            Invoke-Stage 'Frontend mutation (npm run test:mutation)' {
                Ensure-NodeModules
                $code = Invoke-Native (Get-Npm) @('run', 'test:mutation') $web
                $result = 'passed'; if ($code -ne 0) { $result = 'FAILED' }
                return @{ Result = $result; Note = 'artifacts/mutation/frontend' }
            }
        }
        else {
            Add-Stage 'Frontend mutation' 'skipped' ([TimeSpan]::Zero) 'no "test:mutation" script in ClinicHub.Web/package.json yet'
        }
    }
}
catch {
    $fatal = $_.Exception.Message
    Write-Host ""
    Write-Host "Runner failed: $fatal" -ForegroundColor Red
}

# ---------------------------------------------------------------- summary (always written)

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
$verdict = 'PASSED'
if ($fatal) { $verdict = "FAILED (runner error: $fatal)" }
elseif ($failedStages.Count -gt 0) { $verdict = "FAILED ($($failedStages.Count) stage(s))" }
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
    [void]$md.AppendLine('| Priority | Covered | Covered with known bug | Missing | % | Gate |')
    [void]$md.AppendLine('|---|---:|---:|---:|---:|---:|')
    foreach ($g in $t.gate) {
        $gateText = 'reported'; if ($null -ne $g.Gate) { $gateText = "$($g.Gate)%" }
        [void]$md.AppendLine("| $($g.Priority) | $($g.Covered) | $($g.KnownBug) | $($g.Missing) | $($g.Percent)% | $gateText |")
    }
    # A blank line first: a line right under a table renders as one of its rows
    if (@($t.unknownIds).Count -gt 0) { [void]$md.AppendLine(''); [void]$md.AppendLine("Unknown IDs: $($t.unknownIds -join '; ')") }
    if (@($t.skippedWithoutBug).Count -gt 0) { [void]$md.AppendLine(''); [void]$md.AppendLine("Skipped or expected to fail without a bug ID (not counted): $($t.skippedWithoutBug -join '; ')") }
    if (@($t.knownBugTestsNotRun).Count -gt 0) { [void]$md.AppendLine(''); [void]$md.AppendLine("Known-bug tests that never run (FAIL; use test.fails / test.fail): $($t.knownBugTestsNotRun -join '; ')") }
    # A choice the user confirmed: a component test proves the unit level of a case without a ui level; shown, not hidden
    if ($null -ne $t.unitByComponentTest) {
        $unitIds = @($t.unitByComponentTest)
        $unitText = 'none'; if ($unitIds.Count -gt 0) { $unitText = $unitIds -join ', ' }
        [void]$md.AppendLine('')
        [void]$md.AppendLine("Unit level proven by a component test only (cases without a ui level): $($unitIds.Count) ($unitText).")
    }
    [void]$md.AppendLine('')
    [void]$md.AppendLine('Details: artifacts/traceability.md')
}
$mutationFile = Join-Path $artifacts 'mutation\backend\mutation.md'
$mutationReports = @(Get-ChildItem -Path (Join-Path $artifacts 'mutation') -Filter 'mutation-report.json' -Recurse -ErrorAction SilentlyContinue)
if ((Test-Path $mutationFile) -or $mutationReports.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Mutation (gate 85% per critical file)')
    [void]$md.AppendLine('')
    if (Test-Path $mutationFile) { [void]$md.Append([IO.File]::ReadAllText($mutationFile, $utf8)); [void]$md.AppendLine('') }
    foreach ($m in $mutationReports) { [void]$md.AppendLine("- $($m.FullName.Substring($root.Length + 1))") }
}
$bugTests = 0
$bugIds = New-Object System.Collections.Generic.SortedSet[string]
foreach ($s in $stages) {
    if ($s.Counts) { $bugTests += $s.Counts.KnownBugTests; foreach ($id in $s.Counts.KnownBugIds) { [void]$bugIds.Add($id) } }
}
[void]$md.AppendLine('')
[void]$md.AppendLine('## Known bugs (D9)')
[void]$md.AppendLine('')
$idsText = 'none'; if ($bugIds.Count -gt 0) { $idsText = @($bugIds) -join ', ' }
$line = "$knownBugRows entries in docs/testing/known-bugs*.md; $bugTests skipped known-bug .NET tests in this run ($idsText)."
# Every level (xUnit, Vitest, Playwright): the known-bug tests the traceability tool found in the test sources
if (Test-Path $traceFile) {
    $t = Get-Content $traceFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -ne $t.knownBugIds) {
        $all = 'none'; if (@($t.knownBugIds).Count -gt 0) { $all = @($t.knownBugIds) -join ', ' }
        $perTool = @('xunit', 'vitest', 'playwright' | ForEach-Object { "$_ $(@($t.knownBugTests.$_).Count)" }) -join ', '
        $line = "$knownBugRows entries in docs/testing/known-bugs*.md. Known-bug tests (a BUG id in test.fails / test.fail, run and expected to fail; xUnit Skip) in the sources: $perTool; BUG ids: $all. Skipped known-bug .NET tests in this run: $bugTests."
        if (@($t.knownBugTestsNotRun).Count -gt 0) { $line += " known-bug tests that never run (test.skip/test.fixme; use test.fails/test.fail): $(@($t.knownBugTestsNotRun) -join '; ')." }
    }
}
[void]$md.AppendLine($line)

$summaryPath = Join-Path $artifacts 'summary.md'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
[IO.File]::WriteAllText($summaryPath, $md.ToString(), $utf8)

Write-Host ""
Write-Host "Summary: $summaryPath" -ForegroundColor Cyan
foreach ($s in $stages) {
    $color = 'Gray'; if ($s.Result -eq 'FAILED') { $color = 'Red' } elseif ($s.Result -eq 'skipped') { $color = 'Yellow' }
    Write-Host ("  {0,-8} {1:mm\:ss}  {2}  {3}" -f $s.Result, $s.Time, $s.Name, $s.Note) -ForegroundColor $color
}
Write-Host ("Total {0:mm\:ss}: {1}" -f $total, $verdict)
if ($fatal -or $failedStages.Count -gt 0) { exit 1 }
exit 0
