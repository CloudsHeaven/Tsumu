# build-portable.ps1 -- build a RUNNABLE portable folder from this checkout.
#   steps: install deps -> electron-builder --dir -> copy web\ into resources\ -> zip
# ASCII only (PowerShell 5.1 reads BOM-less files as ANSI and chokes on CJK).
#
# Why copy web\: shell/main.js serves the UI from resources\web when packaged,
#   and shell/package.json build.files does not include web\ -- skip this step and
#   the window opens blank.
param(
  [string]$Out = "dist",
  [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$shell = Join-Path $root "shell"
$web   = Join-Path $root "web"
if (-not (Test-Path (Join-Path $shell "package.json"))) { throw "not a Tsumu checkout: $root" }
if (-not (Test-Path $web)) { throw "missing web \: $web" }

if (-not $SkipInstall -and -not (Test-Path (Join-Path $shell "node_modules"))) {
  Write-Host "[1/4] installing dependencies (npm ci) ..."
  Push-Location $shell
  npm ci
  Pop-Location
} else {
  Write-Host "[1/4] dependencies present (skip install)"
}

Write-Host "[2/4] electron-builder --dir ..."
Push-Location $shell

# electron-builder refuses a version RANGE like "^44.4.5": it needs an exact Electron.
# Prefer the already-installed dist (offline, exact); otherwise pin the installed version.
$ebArgs = @("--win", "--x64", "--dir", "-c.directories.output=$root\$Out")
$electronDist = Join-Path $shell "node_modules\electron\dist"
if (Test-Path $electronDist) {
  Write-Host "      using installed electron dist (no download)"
  $ebArgs += "-c.electronDist=$electronDist"
} else {
  $verFile = Join-Path $shell "node_modules\electron\package.json"
  if (Test-Path $verFile) {
    $ver = (Get-Content $verFile -Raw | ConvertFrom-Json).version
    Write-Host "      pinning electron version to $ver"
    $ebArgs += "-c.electronVersion=$ver"
  } else {
    throw "electron is not installed: run npm ci in shell\ first (or install electron@44)"
  }
}
npx electron-builder @ebArgs
Pop-Location

$unpacked = Join-Path $root "$Out\win-unpacked"
if (-not (Test-Path $unpacked)) { throw "build output missing: $unpacked" }

Write-Host "[3/4] copying web into resources (required when packaged)"
$resWeb = Join-Path $unpacked "resources\web"
if (Test-Path $resWeb) { Remove-Item $resWeb -Recurse -Force }
Copy-Item $web $resWeb -Recurse -Force

Write-Host "[4/4] zipping with tar.exe (Compress-Archive writes backslashes into the zip)"
$zip = Join-Path $root "$Out\Tsumu-win-x64.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
$zipName = "Tsumu-win-x64"
$zipParent = Join-Path $root "$Out\_zipstage"
if (Test-Path $zipParent) { Remove-Item $zipParent -Recurse -Force }
$inner = Join-Path $zipParent $zipName
New-Item -ItemType Directory -Path $inner -Force | Out-Null
Copy-Item (Join-Path $unpacked "*") $inner -Recurse -Force
Push-Location $zipParent
tar -a -c -f $zip $zipName
Pop-Location
Remove-Item $zipParent -Recurse -Force
if (-not (Test-Path $zip)) { throw "zip was not created: $zip" }

Write-Host "done: $zip"
Write-Host "NOTE: no Live2D model and no built-in audio are included -- see README section 4."
