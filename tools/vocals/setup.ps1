# One-time setup for the headless OpenUtau renderer (ou-render, from openutau-mcp):
#   powershell -ExecutionPolicy Bypass -File tools/vocals/setup.ps1
# 1. clones openutau-mcp into tools/vocals/.openutau-mcp at the tag below;
# 2. runs its setup.ps1, which fetches OpenUtau's source at the version it is pinned to, installs the
#    .NET 10 SDK into %LOCALAPPDATA%\dotnet10 if needed and builds ou-render into
#    tools/vocals/.ou-render (where render.ps1 and .mcp.json look for it).
# Voicebanks are read from Documents\OpenUtau\Singers, where the desktop app installs them.
# -Repo can be a local clone (e.g. ..\openutau-mcp) to build from work in progress.
param(
    [string]$Repo = 'https://github.com/r3coder/openutau-mcp.git',
    [string]$Tag = 'v0.1.0'
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$src = Join-Path $here '.openutau-mcp'

if (-not (Test-Path $src)) {
    git clone --branch $Tag --recurse-submodules --shallow-submodules $Repo $src
    if ($LASTEXITCODE) { throw 'git clone failed' }
}

& (Join-Path $src 'setup.ps1') -Out (Join-Path $here '.ou-render')
