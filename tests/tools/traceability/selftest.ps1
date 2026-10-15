<#
.SYNOPSIS
  Self-test of traceability.ps1 on tiny fixtures (fixtures/): a complete set passes; a missing P0 and an unknown ID
  fail; a scope that leaves the missing case out passes. Exit 1 when the tool misbehaves. Run by test.ps1 (full tier).
#>
$ErrorActionPreference = 'Stop'
$tool = Join-Path $PSScriptRoot 'traceability.ps1'
$fixtures = Join-Path $PSScriptRoot 'fixtures'
$catalog = Join-Path $fixtures 'catalog.md'
$out = Join-Path ([IO.Path]::GetTempPath()) ("clinichub-traceability-selftest-" + [guid]::NewGuid().ToString('N'))
$failures = New-Object System.Collections.ArrayList

function Invoke-Case([string] $name, [string] $root, [int] $expectedExit, [string[]] $extra, [scriptblock] $check) {
    $dir = Join-Path $out $name
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tool, '-Root', (Join-Path $fixtures $root),
        '-Catalog', $catalog, '-OutDir', $dir, '-Gate') + $extra
    & powershell.exe @arguments | Out-Null
    $code = $LASTEXITCODE
    if ($code -ne $expectedExit) { [void]$failures.Add("$($name): exit $code, expected $expectedExit") ; return }
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
}
finally {
    if (Test-Path $out) { Remove-Item -Recurse -Force $out }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "  traceability self-test: $_" -ForegroundColor Red }
    exit 1
}
Write-Host '  traceability self-test: ok (complete passes; missing P0 and unknown ID fail; scope works)'
exit 0
