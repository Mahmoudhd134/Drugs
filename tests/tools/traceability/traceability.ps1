<#
.SYNOPSIS
  Catalog traceability (design D2): which test-catalog cases have a test, per priority, level and area.

.DESCRIPTION
  Reads docs/testing/test-catalog.md (rows "| ID | Case | P | Level | Source |"; a level may be "api+e2e": each level
  counts on its own) and collects the case IDs the tests name:
    - backend unit tests     tests/ClinicHub.UnitTests/**/*.cs         [Trait("Case", "DOSE-012")]  -> level unit
    - integration tests      tests/ClinicHub.IntegrationTests/**/*.cs  [Trait("Case", "AUTH-036")]  -> level api
    - Vitest                 ClinicHub.Web/src/**/*.test.ts(x)         "@DOSE-012" in a title         -> levels unit, ui
    - Playwright             ClinicHub.Web/e2e/**/*.spec.ts            "@RX-004" in a title           -> level e2e
  A test marked as a known bug (xUnit Skip = "BUG-0nn: ...", Vitest test.skip("BUG-1nn: ..."), Playwright test.fixme)
  counts its cases as covered-but-known-bug: they count for the gates and are listed apart.
  Fails (exit 1) when a test names an ID that is not in the catalog, and, with -Gate, when the coverage of the cases in
  scope is below the gates: 100% of P0 and P1, at least 80% of P2 (manual cases are never counted).
  Writes <OutDir>/traceability.md and traceability.json.

.PARAMETER Areas
  Scope: only these catalog areas (AUTH, ISO, ACC, ERR, ADM, DRUG, GRP, DOSE, TAPER, RX, I18N, UX). Default: all.

.PARAMETER Levels
  Scope: only these levels (unit, api, ui, e2e). Default: all automated levels.

.EXAMPLE
  ./tests/tools/traceability/traceability.ps1 -Gate
  ./tests/tools/traceability/traceability.ps1 -Gate -Areas AUTH -Levels api      # "only my areas/levels"
#>
param(
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path,
    [string] $Catalog,
    [string] $OutDir,
    [string[]] $Areas = @(),
    [string[]] $Levels = @(),
    [switch] $Gate
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path.TrimEnd([char]92)
if (-not $Catalog) { $Catalog = Join-Path $Root 'docs\testing\test-catalog.md' }
if (-not $OutDir) { $OutDir = Join-Path $Root 'artifacts' }
$Areas = @($Areas | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToUpperInvariant() })
$Levels = @($Levels | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToLowerInvariant() })
$automated = @('unit', 'api', 'ui', 'e2e')
$gates = @{ P0 = 100; P1 = 100; P2 = 80 }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$idPattern = '[A-Z][A-Z0-9]*-\d{3}'

# ---- Catalog ----
$cases = [ordered]@{}
foreach ($line in [IO.File]::ReadAllLines($Catalog, $utf8)) {
    if ($line -notmatch "^\|\s*($idPattern)\s*\|") { continue }
    $cells = $line.Trim().Trim('|') -split '\|'
    # From the right: the case text may itself hold a "|"
    $id = $cells[0].Trim()
    $priority = $cells[$cells.Count - 3].Trim()
    $level = $cells[$cells.Count - 2].Trim()
    $cases[$id] = [pscustomobject]@{
        Id = $id; Area = ($id -split '-')[0]; Priority = $priority
        Levels = @($level -split '\+' | ForEach-Object { $_.Trim() })
    }
}
if ($cases.Count -eq 0) { throw "No case found in $Catalog" }

# ---- Tests ----
$found = New-Object System.Collections.ArrayList   # { Id, Level(s), KnownBug, File, Line }

function Get-Files([string] $dir, [string[]] $patterns) {
    if (-not (Test-Path $dir)) { return @() }
    Get-ChildItem -Path $dir -Recurse -File -Include $patterns |
        Where-Object { $_.FullName -notmatch '\\(bin|obj|node_modules)\\' }
}

function Add-CSharp([string] $dir, [string[]] $levels) {
    foreach ($file in Get-Files $dir @('*.cs')) {
        $lines = [IO.File]::ReadAllLines($file.FullName, $utf8)
        # The attributes above one member: their case IDs share the member's Skip
        $block = New-Object System.Collections.ArrayList
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $text = $lines[$i].Trim()
            if ($text.StartsWith('[') -or ($block.Count -gt 0 -and $text.StartsWith('//'))) {
                [void]$block.Add(@{ Text = $text; Line = $i + 1 })
                continue
            }
            if ($block.Count -gt 0) {
                $all = ($block | ForEach-Object { $_.Text }) -join ' '
                $knownBug = $all -match 'Skip\s*=\s*"BUG-\d+'
                foreach ($entry in $block) {
                    foreach ($m in [regex]::Matches($entry.Text, "Trait\(\s*""Case""\s*,\s*""([^""]+)""\s*\)")) {
                        [void]$found.Add([pscustomobject]@{
                            Id = $m.Groups[1].Value; Levels = $levels; KnownBug = $knownBug
                            File = $file.FullName.Substring($Root.Length + 1); Line = $entry.Line })
                    }
                }
                $block.Clear()
            }
        }
    }
}

function Add-Script([string] $dir, [string[]] $patterns, [string[]] $levels) {
    foreach ($file in Get-Files $dir $patterns) {
        $lines = [IO.File]::ReadAllLines($file.FullName, $utf8)
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $text = $lines[$i]
            $tokens = [regex]::Matches($text, "@($idPattern)\b")
            if ($tokens.Count -eq 0) { continue }
            $knownBug = ($text -match '\.(skip|fixme)\s*\(' -and $text -match 'BUG-\d+') -or ($text -match '\.fixme\s*\(')
            foreach ($m in $tokens) {
                [void]$found.Add([pscustomobject]@{
                    Id = $m.Groups[1].Value; Levels = $levels; KnownBug = $knownBug
                    File = $file.FullName.Substring($Root.Length + 1); Line = $i + 1 })
            }
        }
    }
}

Add-CSharp (Join-Path $Root 'tests\ClinicHub.UnitTests') @('unit')
Add-CSharp (Join-Path $Root 'tests\ClinicHub.IntegrationTests') @('api')
Add-Script (Join-Path $Root 'ClinicHub.Web\src') @('*.test.ts', '*.test.tsx') @('unit', 'ui')
Add-Script (Join-Path $Root 'ClinicHub.Web\e2e') @('*.spec.ts') @('e2e')

# ---- Matching ----
$unknown = @($found | Where-Object { -not $cases.Contains($_.Id) })
# case|level -> 'covered' | 'knownBug'
$status = @{}
$offLevel = New-Object System.Collections.ArrayList
foreach ($test in ($found | Where-Object { $cases.Contains($_.Id) })) {
    $case = $cases[$test.Id]
    $matched = @($test.Levels | Where-Object { $case.Levels -contains $_ })
    if ($matched.Count -eq 0) {
        [void]$offLevel.Add("$($test.Id) ($($case.Levels -join '+')) named by a $($test.Levels -join '/') test: $($test.File):$($test.Line)")
        continue
    }
    foreach ($level in $matched) {
        $key = "$($test.Id)|$level"
        # A passing test wins over a known-bug one
        if (-not $test.KnownBug) { $status[$key] = 'covered' }
        elseif (-not $status.ContainsKey($key)) { $status[$key] = 'knownBug' }
    }
}

$rows = New-Object System.Collections.ArrayList     # one per (case, automated level)
foreach ($case in $cases.Values) {
    foreach ($level in $case.Levels) {
        if ($automated -notcontains $level) { continue }
        $key = "$($case.Id)|$level"
        $state = 'missing'
        if ($status.ContainsKey($key)) { $state = $status[$key] }
        $inScope = (($Areas.Count -eq 0) -or ($Areas -contains $case.Area)) -and (($Levels.Count -eq 0) -or ($Levels -contains $level))
        [void]$rows.Add([pscustomobject]@{
            Id = $case.Id; Area = $case.Area; Priority = $case.Priority; Level = $level; State = $state; InScope = $inScope })
    }
}

function Get-Stats($set) {
    $total = @($set).Count
    $covered = @($set | Where-Object { $_.State -eq 'covered' }).Count
    $bug = @($set | Where-Object { $_.State -eq 'knownBug' }).Count
    $pct = 100.0
    if ($total -gt 0) { $pct = [math]::Round(100.0 * ($covered + $bug) / $total, 1) }
    [pscustomobject]@{ Total = $total; Covered = $covered; KnownBug = $bug; Missing = $total - $covered - $bug; Percent = $pct }
}

$scoped = @($rows | Where-Object { $_.InScope })
$gateResults = New-Object System.Collections.ArrayList
foreach ($p in @('P0', 'P1', 'P2')) {
    $s = Get-Stats @($scoped | Where-Object { $_.Priority -eq $p })
    [void]$gateResults.Add([pscustomobject]@{
        Priority = $p; Gate = $gates[$p]; Total = $s.Total; Covered = $s.Covered; KnownBug = $s.KnownBug
        Missing = $s.Missing; Percent = $s.Percent; Passed = ($s.Percent -ge $gates[$p]) })
}
$gateFailed = @($gateResults | Where-Object { -not $_.Passed }).Count -gt 0

# ---- Report ----
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$scopeText = 'all areas, all automated levels'
if ($Areas.Count -gt 0 -or $Levels.Count -gt 0) {
    $a = 'all areas'; if ($Areas.Count -gt 0) { $a = $Areas -join ', ' }
    $l = 'all automated levels'; if ($Levels.Count -gt 0) { $l = $Levels -join ', ' }
    $scopeText = "$a; $l"
}
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('# Traceability')
[void]$md.AppendLine('')
[void]$md.AppendLine("Catalog: $($cases.Count) cases. Tests naming a case: $($found.Count). Scope of the gate: $scopeText.")
[void]$md.AppendLine('Each level of a case counts on its own (an `api+e2e` case needs a test at each); `manual` cases are not counted.')
[void]$md.AppendLine('')
[void]$md.AppendLine('## Gate (in scope)')
[void]$md.AppendLine('')
[void]$md.AppendLine('| Priority | Gate | Total | Covered | Known bug | Missing | % | Result |')
[void]$md.AppendLine('|---|---:|---:|---:|---:|---:|---:|---|')
foreach ($g in $gateResults) {
    $result = 'pass'; if (-not $g.Passed) { $result = '**FAIL**' }
    [void]$md.AppendLine("| $($g.Priority) | $($g.Gate)% | $($g.Total) | $($g.Covered) | $($g.KnownBug) | $($g.Missing) | $($g.Percent)% | $result |")
}
[void]$md.AppendLine('')
[void]$md.AppendLine('## By area and level (whole catalog)')
[void]$md.AppendLine('')
[void]$md.AppendLine('| Area | Level | P0 | P1 | P2 | Missing P0/P1 |')
[void]$md.AppendLine('|---|---|---|---|---|---:|')
foreach ($areaGroup in ($rows | Group-Object Area)) {
    foreach ($levelGroup in ($areaGroup.Group | Group-Object Level)) {
        $cells = foreach ($p in @('P0', 'P1', 'P2')) {
            $s = Get-Stats @($levelGroup.Group | Where-Object { $_.Priority -eq $p })
            if ($s.Total -eq 0) { '-' } else { "$($s.Covered + $s.KnownBug)/$($s.Total)" }
        }
        $missingTop = @($levelGroup.Group | Where-Object { $_.State -eq 'missing' -and $_.Priority -ne 'P2' }).Count
        [void]$md.AppendLine("| $($areaGroup.Name) | $($levelGroup.Name) | $($cells -join ' | ') | $missingTop |")
    }
}
if ($unknown.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Unknown IDs (not in the catalog): FAIL')
    [void]$md.AppendLine('')
    foreach ($u in $unknown) { [void]$md.AppendLine("- $($u.Id): $($u.File):$($u.Line)") }
}
$bugs = @($rows | Where-Object { $_.State -eq 'knownBug' })
if ($bugs.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Covered by a known-bug test only')
    [void]$md.AppendLine('')
    foreach ($b in $bugs) { [void]$md.AppendLine("- $($b.Id) ($($b.Priority), $($b.Level))") }
}
if ($offLevel.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Tests at a level the case does not list (not counted)')
    [void]$md.AppendLine('')
    foreach ($o in $offLevel) { [void]$md.AppendLine("- $o") }
}
$missingTop = @($scoped | Where-Object { $_.State -eq 'missing' -and $_.Priority -ne 'P2' })
[void]$md.AppendLine('')
[void]$md.AppendLine("## Missing P0/P1 in scope ($($missingTop.Count))")
[void]$md.AppendLine('')
foreach ($m in $missingTop) { [void]$md.AppendLine("- $($m.Id) ($($m.Priority), $($m.Level))") }

[IO.File]::WriteAllText((Join-Path $OutDir 'traceability.md'), $md.ToString(), $utf8)
$json = [pscustomobject]@{
    catalogCases = $cases.Count; testsNamingCases = $found.Count; scope = $scopeText
    gate = $gateResults; unknownIds = @($unknown | ForEach-Object { "$($_.Id) $($_.File):$($_.Line)" })
    knownBugCases = @($bugs | ForEach-Object { "$($_.Id)|$($_.Level)" })
    missing = @($scoped | Where-Object { $_.State -eq 'missing' } | ForEach-Object { "$($_.Id)|$($_.Priority)|$($_.Level)" })
} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $OutDir 'traceability.json'), $json, $utf8)

# ---- Console + exit code ----
foreach ($g in $gateResults) {
    Write-Host ("  {0}: {1}% of {2} (covered {3}, known bug {4}, missing {5}; gate {6}%)" -f $g.Priority, $g.Percent, $g.Total, $g.Covered, $g.KnownBug, $g.Missing, $g.Gate)
}
$failed = $false
if ($unknown.Count -gt 0) {
    Write-Host "  Unknown case IDs: $(($unknown | ForEach-Object { $_.Id }) -join ', ')" -ForegroundColor Red
    $failed = $true
}
if ($Gate -and $gateFailed) {
    Write-Host '  Traceability gate missed (see artifacts/traceability.md).' -ForegroundColor Red
    $failed = $true
}
if ($failed) { exit 1 }
exit 0
