param(
    [ValidateSet('Build', 'Test', 'Publish')][string]$Action = 'Build',
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$FrameworkDependent,
    [ValidateSet('Preview', 'Production')][string]$Distribution = 'Preview',
    [string]$LicensingPublicConfiguration,
    [string]$SigningCertificateThumbprint,
    [Uri]$TimestampServer
)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if ($Action -eq 'Test') {
        foreach ($testProject in @('Ninho.Tests/Ninho.Tests.csproj', 'Ninho.Licensing.Tests/Ninho.Licensing.Tests.csproj', 'Ninho.Licensing.Windows.Tests/Ninho.Licensing.Windows.Tests.csproj')) {
            & dotnet test $testProject --configuration $Configuration -p:RestoreLockedMode=true --nologo
            if ($LASTEXITCODE -ne 0) { throw "Os testes falharam: $testProject" }
        }
    } else {
        $licenseArguments = @("-p:NinhoDistribution=$Distribution")
        if ($LicensingPublicConfiguration) { $licenseArguments += "-p:LicensingPublicConfiguration=$([IO.Path]::GetFullPath($LicensingPublicConfiguration))" }
        $signingCertificate = $null
        if ($Action -eq 'Publish' -and $Distribution -eq 'Production') {
            if ($Configuration -ne 'Release') { throw 'A distribuição comercial exige Release.' }
            if (-not $SigningCertificateThumbprint -or -not $TimestampServer -or $TimestampServer.Scheme -ne 'https') { throw 'Informe o certificado comercial de assinatura e o servidor HTTPS de timestamp para publicar para clientes.' }
            $signingCertificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$SigningCertificateThumbprint" -ErrorAction Stop
            $usages = @($signingCertificate.Extensions | Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
            if (-not $signingCertificate.HasPrivateKey -or $signingCertificate.NotAfter -le (Get-Date) -or $signingCertificate.NotBefore -gt (Get-Date) -or '1.3.6.1.5.5.7.3.3' -notin $usages) { throw 'O certificado precisa estar válido, com chave privada e uso de assinatura de código.' }
            $publicConfig = if ($LicensingPublicConfiguration) { $LicensingPublicConfiguration } else { 'Ninho.Windows/Licensing/production.public.json' }
            & ./scripts/validate-license-config.ps1 -Path $publicConfig
        }
        & dotnet restore Ninho.Windows/Ninho.Windows.csproj --locked-mode -p:Platform=x64
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar as dependências bloqueadas.' }
        if ($Action -eq 'Build') {
            & dotnet build Ninho.Windows/Ninho.Windows.csproj --configuration $Configuration -p:Platform=x64 --no-restore --nologo @licenseArguments
        } else {
            $folder = if ($Distribution -eq 'Production') { 'artifacts/windows-x64-commercial' } elseif ($FrameworkDependent) { 'artifacts/windows-x64-framework-dependent' } else { 'artifacts/windows-x64' }
            $publishPath = Join-Path $PSScriptRoot $folder
            $selfContained = if ($FrameworkDependent) { 'false' } else { 'true' }
            & dotnet publish Ninho.Windows/Ninho.Windows.csproj --configuration $Configuration -p:Platform=x64 --self-contained $selfContained --output $publishPath --nologo -p:RestoreLockedMode=true @licenseArguments
        }
        if ($LASTEXITCODE -ne 0) { throw 'A compilação nativa falhou.' }
        if ($Action -eq 'Publish') {
            foreach ($resource in @('Ninho.pri', 'App.xbf', 'MainWindow.xbf', 'OwlControl.xbf')) {
                $resourcePath = Join-Path $publishPath $resource
                if (-not (Test-Path -LiteralPath $resourcePath -PathType Leaf) -or (Get-Item -LiteralPath $resourcePath).Length -eq 0) { throw "Publicação incompleta: recurso WinUI ausente ($resource)." }
            }
            if ($Distribution -eq 'Production') {
                foreach ($binary in Get-ChildItem -LiteralPath $publishPath -File | Where-Object { $_.Name -eq 'Ninho.exe' -or $_.Name -like 'Ninho*.dll' }) {
                    $signature = Set-AuthenticodeSignature -LiteralPath $binary.FullName -Certificate $signingCertificate -HashAlgorithm SHA256 -TimestampServer $TimestampServer.AbsoluteUri
                    if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) { throw "Assinatura comercial incompleta: $($binary.Name). Não distribua esta pasta." }
                }
            }
            [ordered]@{ distribution=$Distribution; configuration=$Configuration; licensedProduct='ninho-windows'; createdAt=[DateTimeOffset]::UtcNow.ToString('O') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $publishPath 'distribution.json') -Encoding UTF8
        }
    }
} finally { Pop-Location }
