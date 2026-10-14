<#
.SYNOPSIS
    Builds the ClinicHub app into a single self-contained package ready for IIS.

.DESCRIPTION
    1. Builds the React/Vite frontend -> ClinicHub.Api/wwwroot
    2. Publishes the ASP.NET Core backend (self-contained, win-x64) -> ./publish
       The backend serves the frontend from wwwroot and the API from /api/v1,
       so the whole app is ONE website / ONE origin on IIS.

    Copy the resulting ./publish folder to the server and point an IIS site at it.
    See DEPLOY.md for the IIS setup steps.

.PARAMETER SelfContained
    $true (default) bundles the .NET runtime so the server only needs the
    ASP.NET Core Hosting Bundle (for the IIS module). Set $false for a smaller,
    framework-dependent build if the matching .NET 9 runtime is installed.
#>
param(
    [bool]$SelfContained = $true
)

$ErrorActionPreference = "Stop"
$root      = $PSScriptRoot
$webDir    = Join-Path $root "ClinicHub.Web"
$apiProj   = Join-Path $root "ClinicHub.Api\ClinicHub.Api.csproj"
$publishDir = Join-Path $root "publish"

Write-Host "==> 1/3  Building frontend (Vite -> ClinicHub.Api/wwwroot)" -ForegroundColor Cyan
Push-Location $webDir
try {
    if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
        Write-Host "    installing npm dependencies..."
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
}
finally {
    Pop-Location
}

Write-Host "==> 2/3  Cleaning previous publish output" -ForegroundColor Cyan
if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}

Write-Host "==> 3/3  Publishing backend (ASP.NET Core -> ./publish)" -ForegroundColor Cyan
if ($SelfContained) {
    dotnet publish $apiProj -c Release -r win-x64 --self-contained true -o $publishDir
} else {
    dotnet publish $apiProj -c Release -o $publishDir
}
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

# Safety net: never ship the local dev database.
$devDb = Join-Path $publishDir "database.db"
if (Test-Path $devDb) { Remove-Item $devDb -Force }

Write-Host ""
Write-Host "Done. Deployable package is in:" -ForegroundColor Green
Write-Host "    $publishDir"
Write-Host "Copy that folder to the server and point an IIS site at it (see DEPLOY.md)."
