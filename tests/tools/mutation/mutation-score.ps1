<#
.SYNOPSIS
  Mutation scores from a Stryker.NET JSON report: overall and per mutated file. Writes <OutDir>/mutation.md and
  mutation.json. With -Gate, fails (exit 1) when a mutated file scores below it (design D5: 85% on each critical file),
  or when nothing was mutated at all (a -Mutate glob that matches no file must not pass).

.DESCRIPTION
  Score = detected / (detected + undetected), as Stryker counts it: detected = Killed + Timeout, undetected = Survived +
  NoCoverage. CompileError and RuntimeError mutants are not counted (listed apart: e.g. Stryker's safe mode
  drops the mutants of a method that no longer compiles once mutated, see docs/testing/README.md "Stryker gaps");
  Ignored mutants (files outside the run's mutate list) are left out, and so is a file with no tested mutant.
#>
param(
    [Parameter(Mandatory)] [string] $Report,
    [Parameter(Mandatory)] [string] $OutDir,
    [int] $Gate = 0
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$json = Get-Content $Report -Raw -Encoding UTF8 | ConvertFrom-Json

function New-Counts { [pscustomobject]@{ Killed = 0; Timeout = 0; Survived = 0; NoCoverage = 0; NotCounted = 0 } }

function Add-Mutant($counts, [string] $status) {
    switch ($status) {
        'Killed' { $counts.Killed++ }
        'Timeout' { $counts.Timeout++ }
        'Survived' { $counts.Survived++ }
        'NoCoverage' { $counts.NoCoverage++ }
        # Mutants of files outside the mutate list (or excluded by Stryker's filters): not part of this run
        'Ignored' { }
        default { $counts.NotCounted++ }
    }
}

function Get-Score($c) {
    $detected = $c.Killed + $c.Timeout
    $valid = $detected + $c.Survived + $c.NoCoverage
    if ($valid -eq 0) { return $null }
    return [math]::Round(100.0 * $detected / $valid, 1)
}

$total = New-Counts
$files = New-Object System.Collections.ArrayList
foreach ($property in $json.files.PSObject.Properties) {
    $path = $property.Name.Replace([char]92, [char]47)
    $counts = New-Counts
    foreach ($mutant in $property.Value.mutants) { Add-Mutant $counts $mutant.status }
    # Files of the mutate list only: the others' mutants are Ignored, or compile errors of code nobody mutated
    if (($counts.Killed + $counts.Timeout + $counts.Survived + $counts.NoCoverage) -eq 0) { continue }
    foreach ($name in @('Killed', 'Timeout', 'Survived', 'NoCoverage', 'NotCounted')) { $total.$name += $counts.$name }
    $short = $path; if ($path -match '(ClinicHub\.[^/]+/.*)$') { $short = $Matches[1] }
    $score = Get-Score $counts
    [void]$files.Add([pscustomobject]@{ File = $short; Score = $score; Counts = $counts
        Below = ($Gate -gt 0 -and $null -ne $score -and $score -lt $Gate) })
}

function Format-Row([string] $scope, $c, [string] $result) {
    $score = Get-Score $c
    $shown = 'n/a'; if ($null -ne $score) { $shown = "$score%" }
    "| $scope | $shown | $($c.Killed + $c.Timeout) | $($c.Survived) | $($c.NoCoverage) | $($c.NotCounted) | $result |"
}

$tested = $total.Killed + $total.Timeout + $total.Survived + $total.NoCoverage
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('| File | Score | Detected | Survived | No coverage | Not counted | Gate |')
[void]$md.AppendLine('|---|---:|---:|---:|---:|---:|---|')
foreach ($f in ($files | Sort-Object File)) {
    $result = '-'
    if ($Gate -gt 0) {
        if ($f.Below) { $result = "**below $Gate%**" } else { $result = 'pass' }
    }
    [void]$md.AppendLine((Format-Row $f.File $f.Counts $result))
}
[void]$md.AppendLine((Format-Row '**All mutated files**' $total ''))
if ($tested -eq 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('No mutant was tested: the mutate list matched no code (or Stryker could not compile it).')
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
[IO.File]::WriteAllText((Join-Path $OutDir 'mutation.md'), $md.ToString(), $utf8)
$summary = [pscustomobject]@{
    score = (Get-Score $total); tested = $tested; gate = $Gate; counts = $total
    files = @($files | ForEach-Object { [pscustomobject]@{ file = $_.File; score = $_.Score; below = $_.Below; counts = $_.Counts } })
}
[IO.File]::WriteAllText((Join-Path $OutDir 'mutation.json'), ($summary | ConvertTo-Json -Depth 4), $utf8)

$shownTotal = 'n/a'; if ($null -ne $summary.score) { $shownTotal = "$($summary.score)%" }
Write-Host "  mutated files ($($files.Count)):"
foreach ($f in ($files | Sort-Object File)) {
    $s = 'n/a'; if ($null -ne $f.Score) { $s = "$($f.Score)%" }
    $color = 'Gray'; if ($f.Below) { $color = 'Red' }
    Write-Host "    $s  $($f.File)" -ForegroundColor $color
}
Write-Host "  mutation score: $shownTotal (detected $($total.Killed + $total.Timeout), survived $($total.Survived), no coverage $($total.NoCoverage), not counted $($total.NotCounted))"
if ($Gate -gt 0) {
    if ($tested -eq 0) { Write-Host '  No mutant was tested (the mutate list matched nothing): FAIL' -ForegroundColor Red; exit 1 }
    $below = @($files | Where-Object { $_.Below })
    if ($below.Count -gt 0) { Write-Host "  Below the $Gate% gate: $(($below | ForEach-Object { $_.File }) -join ', ')" -ForegroundColor Red; exit 1 }
}
exit 0
