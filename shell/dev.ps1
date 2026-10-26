# dev.ps1 - 开发模式：直接从源码目录启动，修改 web/ 后热重载。
#
# 用法（在 shell/ 目录）：
#     powershell -NoProfile -ExecutionPolicy Bypass -File .\dev.ps1
#
# 行为：
#   · 设置 TSUMU_DEV=1，开启 web/ 热重载
#   · 使用 node_modules 内的 electron 运行源码目录（不是打包产物）
#   · 修改 web/ 下的文件后窗口自动刷新；修改主进程文件后需重启本脚本
#
# 需要可分发产物时用 build-portable.ps1（或 npm run dist）。
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$electron = Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electron)) {
  Write-Host '未找到 electron，先装依赖：npm.cmd install' -ForegroundColor Red
  exit 1
}

$env:TSUMU_DEV = '1'
Write-Host '=== Tsumu 开发模式 ===' -ForegroundColor Cyan
Write-Host '· 热重载：web/ 下改动会自动刷新窗口'
Write-Host '· 主进程文件（main.js / preload.js / web-storage.js）改动需重启本脚本'
Write-Host '· 关掉窗口即退出'
Write-Host ''

& $electron .
$code = $LASTEXITCODE
Remove-Item Env:\TSUMU_DEV -ErrorAction SilentlyContinue
exit $code
