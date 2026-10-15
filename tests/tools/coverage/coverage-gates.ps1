<#
.SYNOPSIS
  Backend coverage gates (design D5) from the merged Cobertura report (ReportGenerator output).

.DESCRIPTION
  Overall line and branch rates of the app assemblies, and the branch rate of each critical module (gates.json: a
  "match" entry ending with "." is a namespace prefix, otherwise a class with its nested/compiler-generated classes).
  Branches are counted from each line's condition-coverage "(covered/valid)". Writes <OutDir>/gates.md and gates.json;
  exit 1 when a gate is missed (a module with no branch counts as 100%).
#>
param(
    [Parameter(Mandatory)] [string] $Cobertura,
    [string] $Gates,
    [Parameter(Mandatory)] [string] $OutDir
)
$ErrorActionPreference = 'Stop'
if (-not $Gates) { $Gates = Join-Path $PSScriptRoot 'gates.json' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$config = Get-Content $Gates -Raw -Encoding UTF8 | ConvertFrom-Json
[xml] $xml = [IO.File]::ReadAllText($Cobertura, $utf8)

function Get-Counts($classes) {
    $lv = 0; $lc = 0; $bv = 0; $bc = 0
    foreach ($class in $classes) {
        foreach ($line in $class.lines.line) {
            $lv++
            if ([int]$line.hits -gt 0) { $lc++ }
            if ($line.branch -eq 'True' -and $line.'condition-coverage' -match '\((\d+)/(\d+)\)') {
                $bc += [int]$Matches[1]; $bv += [int]$Matches[2]
            }
        }
    }
    $lr = 100.0; if ($lv -gt 0) { $lr = [math]::Round(100.0 * $lc / $lv, 1) }
    $br = 100.0; if ($bv -gt 0) { $br = [math]::Round(100.0 * $bc / $bv, 1) }
    [pscustomobject]@{ Lines = $lr; LinesCovered = $lc; LinesValid = $lv; Branches = $br; BranchesCovered = $bc; BranchesValid = $bv }
}

function Test-Match([string] $className, $patterns) {
    foreach ($p in $patterns) {
        if ($p.EndsWith('.')) { if ($className.StartsWith($p)) { return $true } }
        elseif ($className -eq $p -or $className.StartsWith("$p/") -or $className.StartsWith("$p+") -or $className.StartsWith("$p.<")) { return $true }
    }
    return $false
}

$allClasses = @($xml.coverage.packages.package | ForEach-Object { $_.classes.class })
$overall = Get-Counts $allClasses
$results = New-Object System.Collections.ArrayList
[void]$results.Add([pscustomobject]@{ Scope = 'Backend overall: lines'; Value = $overall.Lines; Gate = $config.backend.lines
    Detail = "$($overall.LinesCovered)/$($overall.LinesValid)"; Passed = $overall.Lines -ge $config.backend.lines })
[void]$results.Add([pscustomobject]@{ Scope = 'Backend overall: branches'; Value = $overall.Branches; Gate = $config.backend.branches
    Detail = "$($overall.BranchesCovered)/$($overall.BranchesValid)"; Passed = $overall.Branches -ge $config.backend.branches })
foreach ($module in $config.critical.modules) {
    $classes = @($allClasses | Where-Object { Test-Match $_.name $module.match })
    $c = Get-Counts $classes
    $note = "$($c.BranchesCovered)/$($c.BranchesValid)"
    if ($classes.Count -eq 0) { $note = 'no class found' }
    [void]$results.Add([pscustomobject]@{ Scope = "Critical: $($module.name) (branches)"; Value = $c.Branches
        Gate = $config.critical.branches; Detail = $note; Passed = ($classes.Count -gt 0 -and $c.Branches -ge $config.critical.branches) })
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('| Scope | % | Gate | Covered/valid | Result |')
[void]$md.AppendLine('|---|---:|---:|---|---|')
foreach ($r in $results) {
    $res = 'pass'; if (-not $r.Passed) { $res = '**FAIL**' }
    [void]$md.AppendLine("| $($r.Scope) | $($r.Value)% | $($r.Gate)% | $($r.Detail) | $res |")
}
[IO.File]::WriteAllText((Join-Path $OutDir 'gates.md'), $md.ToString(), $utf8)
[IO.File]::WriteAllText((Join-Path $OutDir 'gates.json'), ($results | ConvertTo-Json -Depth 3), $utf8)
foreach ($r in $results) {
    $color = 'Gray'; if (-not $r.Passed) { $color = 'Red' }
    Write-Host ("  {0}: {1}% (gate {2}%, {3})" -f $r.Scope, $r.Value, $r.Gate, $r.Detail) -ForegroundColor $color
}
if (@($results | Where-Object { -not $_.Passed }).Count -gt 0) { exit 1 }
exit 0
