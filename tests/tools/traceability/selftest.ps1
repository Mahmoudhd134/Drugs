<#
.SYNOPSIS
  Self-test of traceability.ps1 on tiny fixtures (fixtures/): a complete set passes; a missing P0, an unknown or
  malformed ID, a skip without a BUG id (also a const or interpolated Skip) and a repeated catalog ID fail; IDs in
  comments and e-mail addresses don't count; known bugs are found in multi-line attributes, wrapped titles and
  describe.skip blocks (a body-less describe.skip skips nothing); a known bug wins over a passing test of the same case
  and level (still counted as covered); every BUG id of a known-bug test of the 3 tools is listed (also untagged or
  conditional ones); a scope that leaves the missing case out passes; P2 is not gated. Exit 1 when the tool misbehaves.
  Run by test.ps1 (full tier).
#>
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'traceability.ps1'
$fixtures = Join-Path $PSScriptRoot 'fixtures'
$catalog = Join-Path $fixtures 'catalog.md'
$out = Join-Path ([IO.Path]::GetTempPath()) ("clinichub-traceability-selftest-" + [guid]::NewGuid().ToString('N'))
$failures = New-Object System.Collections.ArrayList

# The BUG ids the tool lists, as one sorted string
function Get-BugIds($j) { return (@($j.knownBugIds) | Sort-Object) -join ',' }

function Invoke-Case([string] $name, [string] $root, [int] $expectedExit, [string[]] $extra, [scriptblock] $check,
    [string] $catalogFile = $catalog) {
    $dir = Join-Path $out $name
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tool, '-Root', (Join-Path $fixtures $root),
        '-Catalog', $catalogFile, '-OutDir', $dir, '-Gate') + $extra
    # A refused catalog writes to stderr: not an error of the self-test
    $ErrorActionPreference = 'Continue'
    & powershell.exe @arguments 2>&1 | Out-Null
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
    }
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
        # FIX-002: inside a describe.skip whose body opens after a wrapped title
        if (@($skipped | Where-Object { $_ -eq 'FIX-001' }).Count -ne 4 -or @($skipped | Where-Object { $_ -eq 'FIX-005' }).Count -ne 2 -or
            @($skipped | Where-Object { $_ -eq 'FIX-003' }).Count -ne 1 -or @($skipped | Where-Object { $_ -eq 'FIX-002' }).Count -ne 1) {
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
Write-Host '  traceability self-test: ok (complete passes; missing P0, unknown/malformed ID, skip without bug id, duplicate catalog ID fail; missing P2 passes; comments and e-mails ignored; wrapped known bugs found; a known bug wins over a passing test; BUG ids of the 3 tools listed; scope works)'
exit 0
