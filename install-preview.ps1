param([string]$PublishedDirectory = (Join-Path $PSScriptRoot 'artifacts/windows-x64'))
$ErrorActionPreference = 'Stop'
$productId = 'Ninho.Native.Preview'
$displayName = 'Ninho Nativo (Teste)'
$source = [IO.Path]::GetFullPath($PublishedDirectory).TrimEnd('\')
$programsRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs')).TrimEnd('\')
$installRoot = [IO.Path]::GetFullPath((Join-Path $programsRoot 'Ninho-Native-Preview'))
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Ninho.Native.Preview'
$manifestPath = Join-Path $installRoot 'install-preview.json'
if (-not $installRoot.StartsWith($programsRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino de instalação inválido.' }
foreach ($folder in @($source, $programsRoot, $installRoot)) {
    if ((Test-Path -LiteralPath $folder) -and ((Get-Item -LiteralPath $folder).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Não é permitido instalar por meio de links ou junctions.' }
}
if (Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'A publicação contém links ou junctions não suportados.' }
foreach ($required in @('Ninho.exe', 'Ninho.dll', 'Ninho.Core.dll', 'coreclr.dll', 'Ninho.pri', 'App.xbf', 'MainWindow.xbf', 'OwlControl.xbf', 'Assets/icon.ico', 'Assets/seed.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Leaf)) { throw "Publicação incompleta: $required. Execute build.ps1 -Action Publish." }
}
foreach ($scope in @('User', 'Machine')) {
    if ([Environment]::GetEnvironmentVariable('NINHO_DATA_DIR', $scope)) { throw "NINHO_DATA_DIR está configurado no escopo $scope. Confira esse destino antes de instalar a comparação." }
}
if (Test-Path -LiteralPath $installRoot) {
    if (-not (Test-Path -LiteralPath $manifestPath) -or (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).productId -ne $productId) { throw 'A pasta de destino já existe e não pertence a esta instalação de teste.' }
}
if (Test-Path -LiteralPath $registryPath) {
    if ((Get-ItemProperty -LiteralPath $registryPath).DisplayName -ne $displayName) { throw 'O registro de instalação já está em uso por outro aplicativo.' }
}
$shell = New-Object -ComObject WScript.Shell
$shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) "$displayName.lnk"),
    (Join-Path ([Environment]::GetFolderPath('Programs')) "$displayName.lnk")
)
foreach ($shortcutPath in $shortcutPaths) {
    if (Test-Path -LiteralPath $shortcutPath) {
        $existing = $shell.CreateShortcut($shortcutPath)
        if (-not $existing.TargetPath.StartsWith($installRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Atalho já utilizado por outro aplicativo: $shortcutPath" }
    }
}
$version = 'app-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$destination = Join-Path $installRoot $version
$createdRoot = -not (Test-Path -LiteralPath $installRoot)
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
$files = @(Get-ChildItem -LiteralPath $source -Recurse -File)
$bytes = 0L
try {
foreach ($file in $files) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'A publicação contém um link de arquivo não suportado.' }
    $relative = $file.FullName.Substring($source.Length).TrimStart('\')
    $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
    if (-not $target.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de publicação inválido.' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.File]::Copy($file.FullName, $target, $false)
    if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw "Falha ao conferir a cópia: $relative" }
    $bytes += $file.Length
}
} catch {
    $rollbackPath = [IO.Path]::GetFullPath($destination)
    if ($rollbackPath.StartsWith($installRoot + '\app-', [StringComparison]::OrdinalIgnoreCase) -and -not ((Get-Item -LiteralPath $rollbackPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { Remove-Item -LiteralPath $rollbackPath -Recurse -Force }
    if ($createdRoot -and @(Get-ChildItem -LiteralPath $installRoot -Force).Count -eq 0) { Remove-Item -LiteralPath $installRoot }
    throw
}
$executable = Join-Path $destination 'Ninho.exe'
$uninstaller = Join-Path $installRoot 'uninstall-preview.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall-preview.ps1') -Destination $uninstaller
@{ productId = $productId; displayName = $displayName; installedAt = [DateTimeOffset]::Now.ToString('o'); applicationDirectory = $destination; files = $files.Count; bytes = $bytes; shortcuts = $shortcutPaths } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
foreach ($shortcutPath in $shortcutPaths) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $executable
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = (Join-Path $destination 'Assets/icon.ico') + ',0'
    $shortcut.Description = 'Versão nativa .NET para comparação. Instalação e dados separados do Ninho original.'
    $shortcut.Save()
}
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$uninstallCommand = '"' + $powershell + '" -NoProfile -ExecutionPolicy Bypass -File "' + $uninstaller + '"'
New-Item -Path $registryPath -Force | Out-Null
foreach ($entry in @{
    DisplayName = $displayName; DisplayVersion = (Get-Date -Format 'yyyy.MM.dd') + '-preview'; Publisher = 'Ninho';
    InstallLocation = $installRoot; DisplayIcon = $executable; UninstallString = $uninstallCommand; InstallDate = (Get-Date -Format 'yyyyMMdd')
}.GetEnumerator()) { New-ItemProperty -LiteralPath $registryPath -Name $entry.Key -Value $entry.Value -PropertyType String -Force | Out-Null }
New-ItemProperty -LiteralPath $registryPath -Name EstimatedSize -Value ([int][Math]::Ceiling($bytes / 1KB)) -PropertyType DWord -Force | Out-Null
New-ItemProperty -LiteralPath $registryPath -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -LiteralPath $registryPath -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
[Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null
[pscustomobject]@{ Name = $displayName; Executable = $executable; FilesVerified = $files.Count; Shortcuts = $shortcutPaths; Started = $false } | ConvertTo-Json
