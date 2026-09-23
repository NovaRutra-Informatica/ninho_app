$ErrorActionPreference = 'Stop'
$expected = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs/Ninho-Native-Preview')).TrimEnd('\')
$actual = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
if (-not $actual.Equals($expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'Execute o desinstalador somente dentro da instalação Ninho-Native-Preview.' }
if ((Get-Item -LiteralPath $actual).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Não é permitido remover uma instalação redirecionada por link ou junction.' }
if (Get-ChildItem -LiteralPath $actual -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'A instalação contém links ou junctions. Nenhum arquivo foi removido.' }
$manifest = Get-Content -LiteralPath (Join-Path $actual 'install-preview.json') -Raw | ConvertFrom-Json
if ($manifest.productId -ne 'Ninho.Native.Preview') { throw 'Esta pasta não corresponde ao Ninho Nativo de teste.' }
$running = Get-Process -Name Ninho -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($actual + '\', [StringComparison]::OrdinalIgnoreCase) }
if ($running) { throw 'Feche o Ninho Nativo (Teste) antes de desinstalar. A versão antiga pode continuar aberta.' }
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $shortcutPath = Join-Path $folder 'Ninho Nativo (Teste).lnk'
    if ((Test-Path -LiteralPath $shortcutPath) -and $shell.CreateShortcut($shortcutPath).TargetPath.StartsWith($actual + '\', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $shortcutPath }
}
[Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Ninho.Native.Preview'
if ((Test-Path -LiteralPath $registryPath) -and (Get-ItemProperty -LiteralPath $registryPath).DisplayName -eq 'Ninho Nativo (Teste)') { Remove-Item -LiteralPath $registryPath }
Remove-Item -LiteralPath $actual -Recurse -Force
Write-Output 'Ninho Nativo (Teste) removido. Os dados de estudo e a versão antiga foram preservados.'
