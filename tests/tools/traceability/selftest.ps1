<#
.SYNOPSIS
  Self-test of traceability.ps1 on tiny fixtures (fixtures/): a complete set passes; a missing P0, an unknown or
  malformed ID, a skip or expected failure without a BUG id (also a const or interpolated Skip; also an in-body
  test.fail(cond, "...")), a Vitest/Playwright known-bug test that never runs (test.skip/fixme with a BUG id) and a
  repeated catalog ID fail; IDs in comments and e-mail addresses don't count; known bugs are found in multi-line attributes, wrapped
  titles and describe.skip blocks (a body-less describe.skip skips nothing); expected failures (Vitest test.fails,
  Playwright test.fail, also conditional) with a BUG id are known bugs that run; a known bug wins over a passing test of
  the same case and level (still counted as covered); every BUG id of a known-bug test of the 3 tools is listed (also
  untagged or conditional ones); Vitest levels: .test.ts = unit, .test.tsx = ui (+ the unit level of a case without a
  ui level, listed apart); a scope that leaves the missing case out passes; P2 is not gated. Exit 1 when the tool
  misbehaves.
  Run by test.ps1 (full tier).
#>
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'traceability.ps1'
$fixtures = Join-Path $PSScriptRoot 'fixtures'
$catalog = Join-Path $fixtures 'catalog.md'
$out = Join-Path ([IO.Path]::GetTempPath()) ("clinichub-traceability-selftest-" + [guid]::NewGuid().ToString('N'))
$failures = New-Object System.Collections.ArrayList
# The PowerShell running this script (powershell.exe on Windows, pwsh on the Linux CI)
$shell = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName

# The BUG ids the tool lists, as one sorted string
function Get-BugIds($j) { return (@($j.knownBugIds) | Sort-Object) -join ',' }

function Invoke-Case([string] $name, [string] $root, [int] $expectedExit, [string[]] $extra, [scriptblock] $check,
    [string] $catalogFile = $catalog) {
    $dir = Join-Path $out $name
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tool, '-Root', (Join-Path $fixtures $root),
        '-Catalog', $catalogFile, '-OutDir', $dir, '-Gate') + $extra
    # A refused catalog writes to stderr: not an error of the self-test
    $ErrorActionPreference = 'Continue'
    & $shell @arguments 2>&1 | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne $expectedExit) { [void]$failures.Add("$($name): exit $code, expected $expectedExit") ; return }
    if ($null -eq $check) { return }
    $json = Get-Content (Join-Path $dir 'traceability.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $problem = & $check $json
    if ($problem) { [void]$failures.Add("$($name): $problem") }
}

try {
    Invoke-Case 'complete' 'complete' 0 @() {
        param($j)
        if ($j.catalogCases -ne 5) { return "catalog cases $($j.catalogCases), expected 5" }
        if (@($j.missing).Count -ne 0) { return "missing: $($j.missing -join ', ')" }
        if (@($j.knownBugCases) -notcontains 'FIX-003|api' -or @($j.knownBugCases) -notcontains 'FIX-003|e2e') {
            return "known-bug cases: $($j.knownBugCases -join ', ')"
        }
        if ((Get-BugIds $j) -ne 'BUG-001,BUG-101') { return "known-bug ids: $(Get-BugIds $j)" }
        # The xUnit Skip (no other way there) and the Playwright test.fail (runs, expected to fail)
        if ($j.knownBugMarkers.skip -ne 1 -or $j.knownBugMarkers.expectedFailure -ne 1) { return "markers: $($j.knownBugMarkers | ConvertTo-Json -Compress)" }
        if (@($j.knownBugTestsNotRun).Count -ne 0) { return "not run: $($j.knownBugTestsNotRun -join '; ')" }
    }
    Invoke-Case 'known-bug-tests-that-never-run-fail' 'not-run' 1 @() {
        param($j)
        # A declared test.skip / test.fixme with a BUG id never runs: listed (and the run fails), also when another test
        # of the same bug runs; a conditional skip inside a running known-bug test, naming its bug, is not listed
        $notRun = @($j.knownBugTestsNotRun | Sort-Object)
        if ($notRun.Count -ne 2 -or $notRun[0] -notlike 'BUG-131 vitest *' -or $notRun[1] -notlike 'BUG-132 playwright *journey.spec.ts:6') {
            return "not run: $($j.knownBugTestsNotRun -join '; ')"
        }
        # An in-body test.fail(cond, "...") without a BUG id: reported like a skip without one
        $inBody = @($j.skippedWithoutBug | Where-Object { $_ -like 'in-body test.fail() *journey.spec.ts:9' })
        if ($inBody.Count -ne 1 -or @($j.skippedWithoutBug).Count -ne 1) { return "skipped without a bug: $($j.skippedWithoutBug -join '; ')" }
        if (@($j.missing).Count -ne 0 -or @($j.unknownIds).Count -ne 0) { return "missing/unknown: $($j.missing) $($j.unknownIds)" }
    }
    Invoke-Case 'vitest-levels-and-expected-failures' 'levels-and-markers' 1 @() {
        param($j)
        # .test.ts = unit only: LVL-002 (ui) is not covered by it; .test.tsx = ui, and unit only for a case without ui
        if (@($j.missing) -notcontains 'LVL-002|P1|ui') { return "a .test.ts file covered a ui case: missing $($j.missing -join ', ')" }
        if (@($j.missing) -notcontains 'LVL-006|P2|unit') { return "a component test covered a unit+ui case's unit level: missing $($j.missing -join ', ')" }
        foreach ($covered in @('LVL-001|P1|unit', 'LVL-001|P1|ui', 'LVL-003|P1|unit', 'LVL-003|P1|e2e', 'LVL-005|P2|unit', 'LVL-006|P2|ui')) {
            if (@($j.missing) -contains $covered) { return "not covered: $covered" }
        }
        if ((@($j.unitByComponentTest) -join ',') -ne 'LVL-003') { return "unit by component test: $($j.unitByComponentTest -join ', ')" }
        # test.fails / test.fail with a BUG id: known bugs that run (expected failures), also a conditional one
        # LVL-005: test.fails.each(rows(r => ...))("BUG-602: ..."): an arrow in the arguments is not the body
        foreach ($expected in @('LVL-004|ui', 'LVL-004|e2e', 'LVL-005|unit')) {
            if (@($j.knownBugCases) -notcontains $expected) { return "expected failure not a known bug ($expected): $($j.knownBugCases -join ', ')" }
        }
        if ((Get-BugIds $j) -ne 'BUG-591,BUG-592,BUG-593,BUG-601,BUG-602') { return "known-bug ids: $(Get-BugIds $j)" }
        # A conditional skip inside a running known-bug test, naming its bug, doesn't make that bug "not run"
        if ($j.knownBugMarkers.expectedFailure -ne 5 -or $j.knownBugMarkers.skip -ne 1 -or @($j.knownBugTestsNotRun).Count -ne 0) {
            return "markers: $($j.knownBugMarkers | ConvertTo-Json -Compress), not run: $($j.knownBugTestsNotRun -join '; ')"
        }
        if (@($j.skippedWithoutBug).Count -ne 0 -or @($j.unknownIds).Count -ne 0) { return "skipped/unknown: $($j.skippedWithoutBug) $($j.unknownIds)" }
    } (Join-Path $fixtures 'catalog-levels.md')
    Invoke-Case 'known-bug-wins-over-a-passing-test' 'known-bug-wins' 0 @() {
        param($j)
        # FIX-001 (api) and FIX-005 (ui) have a passing test AND a known-bug test: reported as known bug, gate still met
        foreach ($expected in @('FIX-001|api', 'FIX-005|ui')) {
            if (@($j.knownBugCases) -notcontains $expected) { return "hidden by its passing test: $expected ($($j.knownBugCases -join ', '))" }
            if (@($j.knownBugCasesAlsoPassing) -notcontains $expected) { return "not marked as also passing: $expected" }
        }
        if (@($j.knownBugCases).Count -ne 2) { return "known-bug cases: $($j.knownBugCases -join ', ')" }
        $p0 = @($j.gate | Where-Object { $_.Priority -eq 'P0' })[0]
        if ($p0.Covered -ne 0 -or $p0.KnownBug -ne 2 -or $p0.Missing -ne 0 -or $p0.Percent -ne 100) {
            return "P0: covered $($p0.Covered), known bug $($p0.KnownBug), missing $($p0.Missing), $($p0.Percent)%"
        }
        # Every BUG id of the 3 tools: untagged (BUG-012, BUG-122) and conditional (BUG-121) ones too; not a plain skip
        if ((Get-BugIds $j) -ne 'BUG-011,BUG-012,BUG-111,BUG-121,BUG-122') { return "known-bug ids: $(Get-BugIds $j)" }
        if (@($j.knownBugTestsNotRun).Count -ne 0) { return "not run: $($j.knownBugTestsNotRun -join '; ')" }
        if (@($j.knownBugTests.xunit).Count -ne 2 -or @($j.knownBugTests.vitest).Count -ne 1 -or @($j.knownBugTests.playwright).Count -ne 2) {
            return "known-bug tests: xunit $(@($j.knownBugTests.xunit).Count), vitest $(@($j.knownBugTests.vitest).Count), playwright $(@($j.knownBugTests.playwright).Count)"
        }
    }
    Invoke-Case 'missing-p0' 'missing-p0' 1 @() {
        param($j)
        if (@($j.missing) -notcontains 'FIX-001|P0|api') { return "missing: $($j.missing -join ', ')" }
    }
    Invoke-Case 'unknown-id' 'unknown-id' 1 @() {
        param($j)
        if (-not (@($j.unknownIds) | Where-Object { $_ -like 'FIX-999 *' })) { return "unknown: $($j.unknownIds -join ', ')" }
    }
    Invoke-Case 'p2-is-reported-not-gated' 'missing-p2' 0 @() {
        param($j)
        if (@($j.missing) -notcontains 'FIX-003|P2|api') { return "missing: $($j.missing -join ', ')" }
    }
    Invoke-Case 'scope-excludes-the-missing-case' 'missing-p0' 0 @('-Levels', 'unit,ui,e2e') { param($j) }
    Invoke-Case 'scope-includes-the-missing-case' 'missing-p0' 1 @('-Areas', 'FIX', '-Levels', 'api') { param($j) }
    Invoke-Case 'comments-and-wrapped-known-bugs' 'tricky' 1 @() {
        param($j)
        foreach ($expected in @('FIX-001|P0|api', 'FIX-005|P0|ui')) {
            if (@($j.missing) -notcontains $expected) { return "an ID in a comment counted: missing $($j.missing -join ', ')" }
        }
        foreach ($expected in @('FIX-003|api', 'FIX-003|e2e')) {
            if (@($j.knownBugCases) -notcontains $expected) { return "known bug not found ($expected): $($j.knownBugCases -join ', ')" }
        }
        if (@($j.skippedWithoutBug).Count -ne 0 -or @($j.unknownIds).Count -ne 0) { return "skipped/unknown: $($j.skippedWithoutBug) $($j.unknownIds)" }
        if ((Get-BugIds $j) -ne 'BUG-002,BUG-102,BUG-103') { return "known-bug ids (multi-line, wrapped, describe.skip): $(Get-BugIds $j)" }
        # An e-mail address is no ID; a describe.skip with no body skips nothing after it
        if (@($j.missing) -contains 'FIX-002|P1|unit') { return "a test after a body-less describe.skip not counted: $($j.missing -join ', ')" }
    }
    Invoke-Case 'skipped-without-a-bug-id' 'skipped-without-bug' 1 @('-Levels', 'unit') {
        param($j)
        $skipped = @($j.skippedWithoutBug | ForEach-Object { ($_ -split ' ')[0] })
        # FIX-001: a plain reason, a const, $"..." and @"..." (only a plain "BUG-nnn..." literal is a known bug);
        # FIX-002: inside a describe.skip whose body opens after a wrapped title; FIX-005 and FIX-003: also an expected
        # failure (test.fails, test.fail) without a BUG id
        if (@($skipped | Where-Object { $_ -eq 'FIX-001' }).Count -ne 4 -or @($skipped | Where-Object { $_ -eq 'FIX-005' }).Count -ne 3 -or
            @($skipped | Where-Object { $_ -eq 'FIX-003' }).Count -ne 2 -or @($skipped | Where-Object { $_ -eq 'FIX-002' }).Count -ne 1) {
            return "skipped without a bug: $($j.skippedWithoutBug -join '; ')"
        }
        if (@($j.knownBugCases).Count -ne 0) { return "a plain skip counted as a known bug: $($j.knownBugCases -join ', ')" }
        if (@($j.knownBugIds).Count -ne 0) { return "a plain skip listed as a known bug: $(Get-BugIds $j)" }
    }
    Invoke-Case 'malformed-id' 'malformed-id' 1 @('-Levels', 'unit') {
        param($j)
        foreach ($expected in @('FIX-0055', 'fix-002')) {
            if (-not (@($j.unknownIds) | Where-Object { $_ -like "$expected *" })) { return "not reported: $expected ($($j.unknownIds -join ', '))" }
        }
    }
    Invoke-Case 'duplicate-catalog-id' 'complete' 1 @() $null (Join-Path $fixtures 'catalog-duplicate.md')
}
finally {
    if (Test-Path $out) { Remove-Item -Recurse -Force $out }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "  traceability self-test: $_" -ForegroundColor Red }
    exit 1
}
Write-Host '  traceability self-test: ok (complete passes; missing P0, unknown/malformed ID, skip or expected failure without bug id, known-bug test that never runs, duplicate catalog ID fail; missing P2 passes; comments and e-mails ignored; wrapped known bugs found; expected failures with a BUG id are known bugs; a known bug wins over a passing test; BUG ids of the 3 tools listed; Vitest levels by file; scope works)'
exit 0
