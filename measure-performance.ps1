param([string]$Executable = (Join-Path $PSScriptRoot 'Ninho.Windows/bin/x64/Release/net10.0-windows10.0.26100.0/win-x64/Ninho.exe'))
$ErrorActionPreference = 'Stop'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('Ninho-performance-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temporary) | Out-Null
$state = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'resources/seed.json') -Raw | ConvertFrom-Json
$state.settings.name = 'Teste de desempenho'
$state.settings.sound = $false
$state.settings.reducedMotion = $true
$state.settings.theme = 'light'
$state | Add-Member -NotePropertyName profile -NotePropertyValue ([ordered]@{name='Teste de desempenho';goal='Coleção sintética';completedAt=[DateTimeOffset]::Now.ToString('o');dailyMinutes=30;sessionMinutes=25;tutorialsSeen=@('today','studies','reviews','materials','agenda','progress','mentor','timer')}) -Force
$state | ConvertTo-Json -Depth 70 | Set-Content -LiteralPath (Join-Path $temporary 'state.json') -Encoding UTF8
$previousData = $env:NINHO_DATA_DIR
$previousProbe = $env:NINHO_PERF_RUN
try {
    $env:NINHO_DATA_DIR = $temporary
    $env:NINHO_PERF_RUN = '1'
    $app = Start-Process -FilePath ([IO.Path]::GetFullPath($Executable)) -WorkingDirectory ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Executable))) -WindowStyle Hidden -PassThru
    [pscustomobject]@{ ProcessId=$app.Id; DataDirectory=$temporary; Report=(Join-Path $temporary 'performance.json') } | ConvertTo-Json
} finally {
    $env:NINHO_DATA_DIR = $previousData
    $env:NINHO_PERF_RUN = $previousProbe
}
