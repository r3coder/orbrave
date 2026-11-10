# Vocal phrases, start to finish, without opening OpenUtau:
#   powershell -ExecutionPolicy Bypass -File tools/vocals/render.ps1
# make_ustx.py writes phrases.ustx -> ou-render gives it natural pitch and sings every track to
# tools/vocals/.render ->
# build_vocals.py slices them into server/vocals (git-ignored; copy it to the share server's VOCAL_DIR).
# Needs setup.ps1 run once, and a Python with numpy, soundfile and scipy ($env:VOCALS_PYTHON, or
# `python`). The desktop app may stay open: both share the render cache in Documents\OpenUtau.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Resolve-Path (Join-Path $here '..\..')
$py = if ($env:VOCALS_PYTHON) { $env:VOCALS_PYTHON } else { 'python' }
$exe = Join-Path $here '.ou-render\ou-render.exe'
if (-not (Test-Path $exe)) { throw "ou-render is not built: run tools/vocals/setup.ps1 first" }
$dotnet10 = Join-Path $env:LOCALAPPDATA 'dotnet10'
if (Test-Path $dotnet10) { $env:DOTNET_ROOT = $dotnet10 }

& $py -I (Join-Path $here 'make_ustx.py')
if ($LASTEXITCODE) { throw 'make_ustx.py failed' }

$out = Join-Path $here '.render'
New-Item -ItemType Directory -Force $out | Out-Null
# natural pitch (Tuner.cs in openutau-mcp); the tuned project is kept, to open in OpenUtau
$tuned = Join-Path $out 'phrases.tuned.ustx'
& $exe tune (Join-Path $here 'phrases.ustx') $tuned
if ($LASTEXITCODE) { throw 'ou-render tune failed' }
& $exe $tuned (Join-Path $out 'phrases.wav')
if ($LASTEXITCODE) { throw 'ou-render failed' }

& $py -I (Join-Path $here 'build_vocals.py') $out (Join-Path $root 'server\vocals')
if ($LASTEXITCODE) { throw 'build_vocals.py failed' }
