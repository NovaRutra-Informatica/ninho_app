param(
    [ValidateSet('Build', 'Test', 'Publish')][string]$Action = 'Build',
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$FrameworkDependent
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if ($Action -eq 'Test') {
        & dotnet test Ninho.Tests/Ninho.Tests.csproj --configuration $Configuration -p:RestoreLockedMode=true --nologo
        if ($LASTEXITCODE -ne 0) { throw 'Os testes falharam.' }
    } else {
        & dotnet restore Ninho.Windows/Ninho.Windows.csproj --locked-mode -p:Platform=x64
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar as dependências bloqueadas.' }
        if ($Action -eq 'Build') {
            & dotnet build Ninho.Windows/Ninho.Windows.csproj --configuration $Configuration -p:Platform=x64 --no-restore --nologo
        } else {
            $folder = if ($FrameworkDependent) { 'artifacts/windows-x64-framework-dependent' } else { 'artifacts/windows-x64' }
            $publishPath = Join-Path $PSScriptRoot $folder
            $selfContained = if ($FrameworkDependent) { 'false' } else { 'true' }
            & dotnet publish Ninho.Windows/Ninho.Windows.csproj --configuration $Configuration -p:Platform=x64 --self-contained $selfContained --output $publishPath --nologo -p:RestoreLockedMode=true
        }
        if ($LASTEXITCODE -ne 0) { throw 'A compilação nativa falhou.' }
        if ($Action -eq 'Publish') {
            foreach ($resource in @('Ninho.pri', 'App.xbf', 'MainWindow.xbf', 'OwlControl.xbf')) {
                $resourcePath = Join-Path $publishPath $resource
                if (-not (Test-Path -LiteralPath $resourcePath -PathType Leaf) -or (Get-Item -LiteralPath $resourcePath).Length -eq 0) { throw "Publicação incompleta: recurso WinUI ausente ($resource)." }
            }
        }
    }
} finally { Pop-Location }
