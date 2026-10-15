<#
.SYNOPSIS
  Self-test of traceability.ps1 on tiny fixtures (fixtures/): a complete set passes; a missing P0, an unknown or
  malformed ID, a skip without a BUG id and a repeated catalog ID fail; IDs in comments don't count; known bugs are
  found in multi-line attributes, wrapped titles and describe.skip blocks; a scope that leaves the missing case out
  passes. Exit 1 when the tool misbehaves. Run by test.ps1 (full tier).
#>
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'traceability.ps1'
$fixtures = Join-Path $PSScriptRoot 'fixtures'
$catalog = Join-Path $fixtures 'catalog.md'
$out = Join-Path ([IO.Path]::GetTempPath()) ("clinichub-traceability-selftest-" + [guid]::NewGuid().ToString('N'))
$failures = New-Object System.Collections.ArrayList

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
    }
    Invoke-Case 'missing-p0' 'missing-p0' 1 @() {
        param($j)
        if (@($j.missing) -notcontains 'FIX-001|P0|api') { return "missing: $($j.missing -join ', ')" }
    }
    Invoke-Case 'unknown-id' 'unknown-id' 1 @() {
        param($j)
        if (-not (@($j.unknownIds) | Where-Object { $_ -like 'FIX-999 *' })) { return "unknown: $($j.unknownIds -join ', ')" }
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
    }
    Invoke-Case 'skipped-without-a-bug-id' 'skipped-without-bug' 1 @('-Levels', 'unit') {
        param($j)
        $skipped = @($j.skippedWithoutBug | ForEach-Object { ($_ -split ' ')[0] })
        if (@($skipped | Where-Object { $_ -eq 'FIX-001' }).Count -ne 1 -or @($skipped | Where-Object { $_ -eq 'FIX-005' }).Count -ne 2 -or
            @($skipped | Where-Object { $_ -eq 'FIX-003' }).Count -ne 1) { return "skipped without a bug: $($j.skippedWithoutBug -join '; ')" }
        if (@($j.knownBugCases).Count -ne 0) { return "a plain skip counted as a known bug: $($j.knownBugCases -join ', ')" }
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
Write-Host '  traceability self-test: ok (complete passes; missing P0, unknown/malformed ID, skip without bug id, duplicate catalog ID fail; comments ignored; wrapped known bugs found; scope works)'
exit 0
