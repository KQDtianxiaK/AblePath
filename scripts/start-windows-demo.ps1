$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root ".tools\node-v20.19.0-win-x64"
$node = Join-Path $nodeDir "node.exe"
$server = Join-Path $root "apps\server\dist\src\index.js"

if (-not (Test-Path $node)) {
  throw "Local Node runtime not found at $node. Download/extract Node 20.19.0 first."
}

if (-not (Test-Path $server)) {
  throw "Built server not found at $server. Run npm run build first."
}

$env:PATH = "$nodeDir;$env:PATH"
Set-Location $root
& $node $server
