param(
    [ValidateSet('Build','Test','Publish')][string]$Action = 'Build',
    [string]$ProjectDirectory = (Join-Path $env:USERPROFILE 'RiderProjects/Ninho')
)
$ErrorActionPreference = 'Stop'
$build = Join-Path $ProjectDirectory 'build.ps1'
if (-not (Test-Path -LiteralPath $build -PathType Leaf)) { throw "Projeto nativo não encontrado: $ProjectDirectory. Informe -ProjectDirectory ou abra a solução no Rider." }
& $build -Action $Action
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
