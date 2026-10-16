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
  A test marked as a known bug (xUnit Skip = "BUG-0nn: ..." as a plain string literal, Vitest test.skip("BUG-1nn: ..."),
  Playwright test.fixme("BUG-1nn: ...")) counts its cases as covered-with-known-bug: they count for the gates and are
  listed apart. A known bug wins over a passing test of the same case and level (a case proven by a passing test and
  also marked by a known-bug test is still reported as a known bug). Every BUG-nnn id of a known-bug test (xUnit,
  Vitest, Playwright; with or without a case tag; also a conditional test.fixme(cond, "BUG-nnn: ...")) is listed
  (knownBugIds, knownBugTests in the json; test.ps1's summary shows them). Any other skip (no BUG-nnn id; a Skip that is not a plain literal: a const, $"...", @"..."; also .todo
  and the tests of a describe.skip) is not coverage, nor is an ID in a comment. Fails (exit 1) when a test names an ID
  that is not exactly a catalog ID, when a test is skipped without a BUG-nnn id, when the catalog repeats an ID, and,
  with -Gate, when the coverage of the P0 or P1 cases in scope is below 100% (P2 is reported, not gated; manual cases
  are never counted).
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
# P2: reported only (the user's trim, 2026-10-15: E2E covers P0/P1; P2 by component/api tests where cheap)
$gates = @{ P0 = 100; P1 = 100; P2 = $null }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$idPattern = '[A-Z][A-Z0-9]*-\d{3}'

# ---- Catalog ----
$cases = [ordered]@{}
$duplicates = New-Object System.Collections.ArrayList
foreach ($line in [IO.File]::ReadAllLines($Catalog, $utf8)) {
    if ($line -notmatch "^\|\s*($idPattern)\s*\|") { continue }
    $cells = $line.Trim().Trim('|') -split '\|'
    # From the right: the case text may itself hold a "|"
    $id = $cells[0].Trim()
    if ($cases.Contains($id)) { [void]$duplicates.Add($id); continue }
    $priority = $cells[$cells.Count - 3].Trim()
    $level = $cells[$cells.Count - 2].Trim()
    $cases[$id] = [pscustomobject]@{
        Id = $id; Area = ($id -split '-')[0]; Priority = $priority
        Levels = @($level -split '\+' | ForEach-Object { $_.Trim() })
    }
}
if ($cases.Count -eq 0) { throw "No case found in $Catalog" }
# IDs are stable and never reused (design D2)
if ($duplicates.Count -gt 0) { throw "Duplicate case IDs in $($Catalog): $(($duplicates | Sort-Object -Unique) -join ', ')" }

# ---- Tests ----
# { Id, Levels, State (covered | knownBug | skipped), File, Line }; "skipped" = skipped without a BUG-nnn id: not counted
$found = New-Object System.Collections.ArrayList
# { Bug, Tool (xunit | vitest | playwright), File, Line }: every known-bug test, whether or not it names a case
$bugTests = New-Object System.Collections.ArrayList

function Get-Files([string] $dir, [string[]] $patterns) {
    if (-not (Test-Path $dir)) { return @() }
    Get-ChildItem -Path $dir -Recurse -File -Include $patterns |
        Where-Object { $_.FullName -notmatch '\\(bin|obj|node_modules)\\' }
}

# The lines with their comments blanked out ("//..." and "/* ... */", also across lines), strings kept: an ID in a
# comment proves nothing. $quotes: the string delimiters of the language.
function Remove-Comments([string[]] $lines, [char[]] $quotes) {
    $out = New-Object System.Collections.ArrayList
    $inBlock = $false
    foreach ($line in $lines) {
        $sb = New-Object System.Text.StringBuilder
        $quote = [char]0
        for ($i = 0; $i -lt $line.Length; $i++) {
            $c = $line[$i]
            $next = [char]0; if ($i + 1 -lt $line.Length) { $next = $line[$i + 1] }
            if ($inBlock) {
                if ($c -eq '*' -and $next -eq '/') { $inBlock = $false; $i++ }
                continue
            }
            if ($quote -ne [char]0) {
                [void]$sb.Append($c)
                if ($c -eq [char]92 -and $next -ne [char]0) { [void]$sb.Append($next); $i++ }
                elseif ($c -eq $quote) { $quote = [char]0 }
                continue
            }
            if ($c -eq '/' -and $next -eq '/') { break }
            if ($c -eq '/' -and $next -eq '*') { $inBlock = $true; $i++; continue }
            if ($quotes -contains $c) { $quote = $c }
            [void]$sb.Append($c)
        }
        [void]$out.Add($sb.ToString())
    }
    return , $out.ToArray()
}

# How much a line opens (+) or closes (-) of $open/$close, outside strings
function Get-Depth([string] $line, [char] $open, [char] $close, [char[]] $quotes) {
    $depth = 0; $quote = [char]0
    for ($i = 0; $i -lt $line.Length; $i++) {
        $c = $line[$i]
        if ($quote -ne [char]0) {
            if ($c -eq [char]92) { $i++ } elseif ($c -eq $quote) { $quote = [char]0 }
            continue
        }
        if ($quotes -contains $c) { $quote = $c }
        elseif ($c -eq $open) { $depth++ }
        elseif ($c -eq $close) { $depth-- }
    }
    return $depth
}

function Add-Found([string] $id, [string[]] $levels, [string] $state, [string] $file, [int] $line) {
    [void]$found.Add([pscustomobject]@{ Id = $id; Levels = $levels; State = $state; File = $file.Substring($Root.Length + 1); Line = $line })
}

function Add-BugTest([string] $text, [string] $tool, [string] $file, [int] $line) {
    foreach ($m in [regex]::Matches($text, 'BUG-\d{3}')) {
        [void]$bugTests.Add([pscustomobject]@{ Bug = $m.Value; Tool = $tool; File = $file.Substring($Root.Length + 1); Line = $line })
    }
}

# xUnit: the attributes above one member (continuation lines of a multi-line attribute included) share its Skip
function Add-CSharp([string] $dir, [string[]] $levels) {
    $quotes = [char[]]@('"')
    foreach ($file in Get-Files $dir @('*.cs')) {
        $lines = Remove-Comments ([IO.File]::ReadAllLines($file.FullName, $utf8)) $quotes
        $block = New-Object System.Collections.ArrayList
        $depth = 0
        for ($i = 0; $i -le $lines.Count; $i++) {
            $text = ''; if ($i -lt $lines.Count) { $text = $lines[$i].Trim() }
            $inBlock = $block.Count -gt 0
            if ($i -lt $lines.Count -and ($text.StartsWith('[') -or ($inBlock -and ($depth -gt 0 -or $text -eq '')))) {
                [void]$block.Add(@{ Text = $text; Line = $i + 1 })
                $depth += Get-Depth $text '[' ']' $quotes
                continue
            }
            if ($inBlock) {
                $all = ($block | ForEach-Object { $_.Text }) -join ' '
                # Any Skip skips (xUnit takes a const or an interpolated string too); a known bug only as a plain literal
                $state = 'covered'
                if ($all -match '(?<![\w$@])Skip\s*=\s*"\s*(BUG-\d{3})') {
                    $state = 'knownBug'
                    Add-BugTest $Matches[1] 'xunit' $file.FullName $block[0].Line
                }
                elseif ($all -match '\bSkip\s*=') { $state = 'skipped' }
                foreach ($entry in $block) {
                    foreach ($m in [regex]::Matches($entry.Text, "Trait\(\s*""Case""\s*,\s*""([^""]+)""\s*\)")) {
                        Add-Found $m.Groups[1].Value $levels $state $file.FullName $entry.Line
                    }
                }
                $block.Clear()
                $depth = 0
            }
        }
    }
}

# Vitest / Playwright: "@ID" tokens in a test or describe title. The title belongs to the nearest call opened on its
# line or up to 5 lines above (prettier wraps long titles); inside a describe.skip/fixme block every test is skipped too.
function Add-Script([string] $dir, [string[]] $patterns, [string[]] $levels, [string] $tool) {
    $quotes = [char[]]@('"', "'", '`')
    $opener = '\b(test|it|describe)((\.\w+)*)\s*\('
    foreach ($file in Get-Files $dir $patterns) {
        $lines = Remove-Comments ([IO.File]::ReadAllLines($file.FullName, $utf8)) $quotes
        $braces = 0
        $skippedBlocks = New-Object System.Collections.ArrayList   # { Depth, Bug }
        $pending = $null                                           # a describe.skip whose body has not opened yet
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $text = $lines[$i]
            # A known-bug test (or describe): the BUG-nnn ids of its call up to its body ("=>", "function", ");"), the
            # title possibly wrapped over the next lines; also a conditional test.fixme(cond, "BUG-nnn: ...") in a body
            if ($text -match $opener -and $Matches[2] -match '\.(skip|fixme|todo)\b') {
                $call = ($lines[$i..[math]::Min($lines.Count - 1, $i + 5)] -join ' ')
                $call = $call.Substring($call.IndexOf($Matches[0]))
                $end = [regex]::Match($call, '=>|\bfunction\b|\)\s*;')
                if ($end.Success) { $call = $call.Substring(0, $end.Index) }
                Add-BugTest $call $tool $file.FullName ($i + 1)
            }
            # Not an e-mail address ("owner@clinic-1.test"): nothing word-like right before the "@"
            $tokens = [regex]::Matches($text, '(?<![\w.%+-])@([A-Za-z][A-Za-z0-9]*-\d+)\b')
            if ($tokens.Count -gt 0) {
                $state = 'covered'
                $start = $i
                for ($j = $i; $j -ge [math]::Max(0, $i - 5); $j--) {
                    if ($lines[$j] -match $opener) { $start = $j; break }
                }
                $call = ($lines[$start..$i] -join ' ')
                $modifiers = ''
                if ($call -match $opener) { $modifiers = $Matches[2] }
                $bug = $call -match 'BUG-\d{3}'
                if ($modifiers -match '\.(skip|fixme|todo)\b') { if ($bug) { $state = 'knownBug' } else { $state = 'skipped' } }
                elseif ($skippedBlocks.Count -gt 0) {
                    if ($bug -or @($skippedBlocks | Where-Object { $_.Bug }).Count -gt 0) { $state = 'knownBug' } else { $state = 'skipped' }
                }
                foreach ($m in $tokens) { Add-Found $m.Groups[1].Value $levels $state $file.FullName ($i + 1) }
            }
            # A describe.skip/fixme skips the tests of the body it opens (its "{" may come a few lines later, after a
            # wrapped title); one that opens no body (describe.skip("x", suite);) skips nothing below it
            if ($text -match '\bdescribe((\.\w+)*)\s*\(' -and $Matches[1] -match '\.(skip|fixme)\b') {
                $pending = [pscustomobject]@{ Depth = $braces; Parens = 0; Bug = $false }
            }
            $opened = Get-Depth $text '{' '}' $quotes
            if ($null -ne $pending) {
                if ($text -match 'BUG-\d{3}') { $pending.Bug = $true }
                $pending.Parens += Get-Depth $text '(' ')' $quotes
                if ($opened -gt 0) { [void]$skippedBlocks.Add([pscustomobject]@{ Depth = $pending.Depth; Bug = $pending.Bug }); $pending = $null }
                elseif ($pending.Parens -le 0) { $pending = $null }
            }
            $braces += $opened
            while ($skippedBlocks.Count -gt 0 -and $braces -le $skippedBlocks[$skippedBlocks.Count - 1].Depth -and $text -match '\}') {
                $skippedBlocks.RemoveAt($skippedBlocks.Count - 1)
            }
        }
    }
}

Add-CSharp (Join-Path $Root 'tests\ClinicHub.UnitTests') @('unit')
Add-CSharp (Join-Path $Root 'tests\ClinicHub.IntegrationTests') @('api')
Add-Script (Join-Path $Root 'ClinicHub.Web\src') @('*.test.ts', '*.test.tsx') @('unit', 'ui') 'vitest'
Add-Script (Join-Path $Root 'ClinicHub.Web\e2e') @('*.spec.ts') @('e2e') 'playwright'

# ---- Matching ----
# Anything not exactly a catalog ID (a typo, "@AUTH-0163", "@auth-189") is unknown
$unknown = @($found | Where-Object { -not $cases.Contains($_.Id) -or $_.Id -cnotmatch "^$idPattern$" })
$skippedWithoutBug = @($found | Where-Object { $_.State -eq 'skipped' })
# case|level -> 'covered' | 'knownBug': a known bug wins over a passing test (the bug must stay visible)
$status = @{}
$alsoPassing = @{}
$offLevel = New-Object System.Collections.ArrayList
foreach ($test in ($found | Where-Object { $_.State -ne 'skipped' -and $cases.Contains($_.Id) -and $_.Id -cmatch "^$idPattern$" })) {
    $case = $cases[$test.Id]
    $matched = @($test.Levels | Where-Object { $case.Levels -contains $_ })
    if ($matched.Count -eq 0) {
        [void]$offLevel.Add("$($test.Id) ($($case.Levels -join '+')) named by a $($test.Levels -join '/') test: $($test.File):$($test.Line)")
        continue
    }
    foreach ($level in $matched) {
        $key = "$($test.Id)|$level"
        if ($test.State -eq 'covered') {
            $alsoPassing[$key] = $true
            if (-not $status.ContainsKey($key)) { $status[$key] = 'covered' }
        }
        else { $status[$key] = 'knownBug' }
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
            Id = $case.Id; Area = $case.Area; Priority = $case.Priority; Level = $level; State = $state; InScope = $inScope
            AlsoPassing = ($state -eq 'knownBug' -and $alsoPassing.ContainsKey($key)) })
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
    $passed = ($null -eq $gates[$p]) -or ($s.Percent -ge $gates[$p])
    [void]$gateResults.Add([pscustomobject]@{
        Priority = $p; Gate = $gates[$p]; Total = $s.Total; Covered = $s.Covered; KnownBug = $s.KnownBug
        Missing = $s.Missing; Percent = $s.Percent; Passed = $passed })
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
[void]$md.AppendLine('Covered with known bug: a known-bug test marks the case (with or without a passing test); it counts as covered.')
[void]$md.AppendLine('')
[void]$md.AppendLine('| Priority | Gate | Total | Covered | Covered with known bug | Missing | % | Result |')
[void]$md.AppendLine('|---|---:|---:|---:|---:|---:|---:|---|')
foreach ($g in $gateResults) {
    $result = 'pass'; if (-not $g.Passed) { $result = '**FAIL**' }
    $gateText = "$($g.Gate)%"
    if ($null -eq $g.Gate) { $gateText = '-'; $result = 'reported' }
    [void]$md.AppendLine("| $($g.Priority) | $gateText | $($g.Total) | $($g.Covered) | $($g.KnownBug) | $($g.Missing) | $($g.Percent)% | $result |")
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
if ($skippedWithoutBug.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine('## Skipped without a BUG-nnn id (not counted): FAIL')
    [void]$md.AppendLine('')
    [void]$md.AppendLine('A test is skipped only as a known bug (Skip = "BUG-0nn: ..." as a plain string literal, test.skip/fixme("BUG-1nn: ...")); any other skip is not coverage.')
    [void]$md.AppendLine('')
    foreach ($k in $skippedWithoutBug) { [void]$md.AppendLine("- $($k.Id): $($k.File):$($k.Line)") }
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
    [void]$md.AppendLine('## Covered with a known bug')
    [void]$md.AppendLine('')
    foreach ($b in $bugs) {
        $how = 'known-bug test only'; if ($b.AlsoPassing) { $how = 'also a passing test' }
        [void]$md.AppendLine("- $($b.Id) ($($b.Priority), $($b.Level)): $how")
    }
}
$knownBugIds = @($bugTests | ForEach-Object { $_.Bug } | Sort-Object -Unique)
$byTool = [ordered]@{}
foreach ($tool in @('xunit', 'vitest', 'playwright')) {
    $byTool[$tool] = @($bugTests | Where-Object { $_.Tool -eq $tool } | ForEach-Object { "$($_.Bug) $($_.File):$($_.Line)" })
}
if ($bugTests.Count -gt 0) {
    [void]$md.AppendLine('')
    [void]$md.AppendLine("## Known-bug tests ($($bugTests.Count); $($knownBugIds -join ', '))")
    [void]$md.AppendLine('')
    foreach ($tool in $byTool.Keys) { foreach ($t in $byTool[$tool]) { [void]$md.AppendLine("- $($tool): $t") } }
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
    skippedWithoutBug = @($skippedWithoutBug | ForEach-Object { "$($_.Id) $($_.File):$($_.Line)" })
    knownBugCases = @($bugs | ForEach-Object { "$($_.Id)|$($_.Level)" })
    knownBugCasesAlsoPassing = @($bugs | Where-Object { $_.AlsoPassing } | ForEach-Object { "$($_.Id)|$($_.Level)" })
    knownBugIds = $knownBugIds
    knownBugTests = $byTool
    missing = @($scoped | Where-Object { $_.State -eq 'missing' } | ForEach-Object { "$($_.Id)|$($_.Priority)|$($_.Level)" })
} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $OutDir 'traceability.json'), $json, $utf8)

# ---- Console + exit code ----
foreach ($g in $gateResults) {
    $gateText = 'reported, no gate'; if ($null -ne $g.Gate) { $gateText = "gate $($g.Gate)%" }
    Write-Host ("  {0}: {1}% of {2} (covered {3}, covered with known bug {4}, missing {5}; {6})" -f $g.Priority, $g.Percent, $g.Total, $g.Covered, $g.KnownBug, $g.Missing, $gateText)
}
$failed = $false
if ($unknown.Count -gt 0) {
    Write-Host "  Unknown case IDs: $(($unknown | ForEach-Object { $_.Id }) -join ', ')" -ForegroundColor Red
    $failed = $true
}
if ($skippedWithoutBug.Count -gt 0) {
    Write-Host "  Tests skipped without a BUG-nnn id: $(($skippedWithoutBug | ForEach-Object { "$($_.Id) $($_.File):$($_.Line)" }) -join '; ')" -ForegroundColor Red
    $failed = $true
}
if ($Gate -and $gateFailed) {
    Write-Host '  Traceability gate missed (see artifacts/traceability.md).' -ForegroundColor Red
    $failed = $true
}
if ($failed) { exit 1 }
exit 0
