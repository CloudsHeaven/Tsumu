# dev-l2d.ps1 -- open the Live2D viewer page in dev mode (no packaging needed).
#
# Usage (from shell/):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\dev-l2d.ps1
# or just double-click dev-l2d.cmd
#
# What it does:
#   - sets TSUMU_ENTRY=l2d.html so the shell serves web/l2d.html as the entry
#   - sets TSUMU_DEV=1 so edits under web/ hot-reload the window
#   - runs the project-local electron against the source tree (not a build)
#
# NOTE: Tsumu uses a single-instance lock (see main.js). If a Tsumu window is
#       already open, this one exits immediately. Close it first.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$electron = Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electron)) {
  Write-Host 'electron not found. run: npm.cmd install' -ForegroundColor Red
  exit 1
}

$env:TSUMU_DEV = '1'
$env:TSUMU_ENTRY = 'l2d.html'

Write-Host '=== Tsumu Live2D viewer (dev) ===' -ForegroundColor Cyan
Write-Host 'page   : web/l2d.html   (model: web/assets/models/maou)'
Write-Host 'wheel  : zoom      drag : pan      move mouse : look around'
Write-Host 'If no window appears, close the running Tsumu window first (single-instance lock).'
Write-Host ''

& $electron .
$code = $LASTEXITCODE
Remove-Item Env:\TSUMU_DEV -ErrorAction SilentlyContinue
Remove-Item Env:\TSUMU_ENTRY -ErrorAction SilentlyContinue
exit $code
