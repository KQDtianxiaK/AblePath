param(
  [switch]$RestartServer
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root ".tools\node-v20.19.0-win-x64"
$node = Join-Path $nodeDir "node.exe"
$server = Join-Path $root "apps\server\dist\src\index.js"
$electron = Join-Path $root "node_modules\.bin\electron.cmd"
$desktop = Join-Path $root "apps\desktop"

if (-not (Test-Path $node)) {
  throw "Local Node runtime not found at $node. Download/extract Node 20.19.0 first."
}

if (-not (Test-Path $server)) {
  throw "Built server not found at $server. Run npm run build first."
}

if (-not (Test-Path $electron)) {
  throw "Electron is not installed. Run npm install -w @ablepath/desktop --save-dev electron first."
}

$env:PATH = "$nodeDir;$env:PATH"
Set-Location $root

if ($RestartServer) {
  $listeners = Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    if ($listener.OwningProcess) {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 500
}

$healthOk = $false
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:4317/api/health" -TimeoutSec 2
  $healthOk = $health.ok -eq $true
} catch {
  $healthOk = $false
}

if (-not $healthOk) {
  $serverProcess = Start-Process `
    -FilePath $node `
    -ArgumentList @($server) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru

  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:4317/api/health" -TimeoutSec 2
      if ($health.ok -eq $true) {
        $ready = $true
        break
      }
    } catch {
      $ready = $false
    }
  }

  if (-not $ready) {
    if ($serverProcess -and -not $serverProcess.HasExited) {
      Stop-Process -Id $serverProcess.Id -Force
    }
    throw "AblePath server did not become ready on http://127.0.0.1:4317."
  }
}

$env:ABLEPATH_SERVER_URL = "http://127.0.0.1:4317"
& $electron $desktop
