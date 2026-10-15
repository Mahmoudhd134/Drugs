<#
.SYNOPSIS
  Mutation scores from a Stryker.NET JSON report: overall, per critical module (tests/tools/coverage/gates.json) and per
  file. Writes <OutDir>/mutation.md and mutation.json. Report only: the 85% gate (design D5) is Stryker's own "break"
  threshold (tests/stryker-config.json), so the stage fails there.

.DESCRIPTION
  Score = detected / (detected + undetected), as Stryker counts it: detected = Killed + Timeout, undetected = Survived +
  NoCoverage. CompileError and RuntimeError mutants are not counted (listed apart: e.g. Stryker's safe mode
  drops the mutants of a method that no longer compiles once mutated, see docs/testing/README.md "Stryker gaps");
  Ignored mutants (files outside the run's mutate list) are left out.
  A critical module's files: its gates.json "match" turned into a path (namespace = folder in this repo).
#>
param(
    [Parameter(Mandatory)] [string] $Report,
    [Parameter(Mandatory)] [string] $OutDir,
    [string] $Gates
)
$ErrorActionPreference = 'Stop'
if (-not $Gates) { $Gates = Join-Path $PSScriptRoot '..\coverage\gates.json' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$json = Get-Content $Report -Raw -Encoding UTF8 | ConvertFrom-Json
$modules = (Get-Content $Gates -Raw -Encoding UTF8 | ConvertFrom-Json).critical.modules

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

# "ClinicHub.Application.Features.Identity.Login." -> "ClinicHub.Application/Features/Identity/Login/"
# "ClinicHub.Api.Features.Platform.AdminClinicFilter" -> "ClinicHub.Api/Features/Platform/AdminClinicFilter.cs"
function ConvertTo-PathPattern([string] $match) {
    $parts = $match.TrimEnd('.') -split '\.'
    $path = "$($parts[0]).$($parts[1])/" + (($parts | Select-Object -Skip 2) -join '/')
    if ($match.EndsWith('.')) { return "$path/" }
    return "$path.cs"
}

$total = New-Counts
$files = New-Object System.Collections.ArrayList
$byModule = [ordered]@{}
foreach ($m in $modules) { $byModule[$m.name] = New-Counts }
foreach ($property in $json.files.PSObject.Properties) {
    $path = $property.Name.Replace([char]92, [char]47)
    $counts = New-Counts
    foreach ($mutant in $property.Value.mutants) { Add-Mutant $counts $mutant.status; Add-Mutant $total $mutant.status }
    $owners = @($modules | Where-Object { $m = $_; @($m.match | Where-Object { $path -like "*$(ConvertTo-PathPattern $_)*" }).Count -gt 0 })
    foreach ($owner in $owners) {
        foreach ($name in @('Killed', 'Timeout', 'Survived', 'NoCoverage', 'NotCounted')) { $byModule[$owner.name].$name += $counts.$name }
    }
    $short = $path; if ($path -match '(ClinicHub\.[^/]+/.*)$') { $short = $Matches[1] }
    [void]$files.Add([pscustomobject]@{ File = $short; Score = (Get-Score $counts); Counts = $counts })
}

function Format-Row([string] $scope, $c) {
    $score = Get-Score $c
    $shown = 'n/a'; if ($null -ne $score) { $shown = "$score%" }
    "| $scope | $shown | $($c.Killed + $c.Timeout) | $($c.Survived) | $($c.NoCoverage) | $($c.NotCounted) |"
}

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('| Scope | Score | Detected | Survived | No coverage | Not counted |')
[void]$md.AppendLine('|---|---:|---:|---:|---:|---:|')
[void]$md.AppendLine((Format-Row '**All mutated files**' $total))
foreach ($name in $byModule.Keys) {
    if (($byModule[$name].Killed + $byModule[$name].Timeout + $byModule[$name].Survived + $byModule[$name].NoCoverage + $byModule[$name].NotCounted) -gt 0) {
        [void]$md.AppendLine((Format-Row "Critical: $name" $byModule[$name]))
    }
}
foreach ($f in ($files | Sort-Object File)) {
    if (($f.Counts.Killed + $f.Counts.Timeout + $f.Counts.Survived + $f.Counts.NoCoverage) -gt 0) { [void]$md.AppendLine((Format-Row $f.File $f.Counts)) }
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
[IO.File]::WriteAllText((Join-Path $OutDir 'mutation.md'), $md.ToString(), $utf8)
$summary = [pscustomobject]@{
    score = (Get-Score $total); counts = $total
    modules = @($byModule.Keys | ForEach-Object { [pscustomobject]@{ name = $_; score = (Get-Score $byModule[$_]); counts = $byModule[$_] } })
}
[IO.File]::WriteAllText((Join-Path $OutDir 'mutation.json'), ($summary | ConvertTo-Json -Depth 4), $utf8)
$shownTotal = 'n/a'; if ($null -ne $summary.score) { $shownTotal = "$($summary.score)%" }
Write-Host "  mutation score: $shownTotal (detected $($total.Killed + $total.Timeout), survived $($total.Survived), no coverage $($total.NoCoverage), not counted $($total.NotCounted))"
exit 0
