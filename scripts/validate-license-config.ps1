param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
$expected = @('schemaVersion', 'product', 'activationEndpoint', 'publicKeys') | Sort-Object
$actual = @($config.PSObject.Properties.Name) | Sort-Object
if (@(Compare-Object $expected $actual).Count -ne 0 -or $config.schemaVersion -ne 1 -or $config.product -ne 'ninho-windows') { throw 'Configuração pública de licença inválida.' }
$endpoint = $null
if ($config.activationEndpoint -isnot [string] -or $config.activationEndpoint.Length -gt 2048) { throw 'Endereço de ativação inválido.' }
if ($config.activationEndpoint.Length -gt 0 -and (-not [Uri]::TryCreate($config.activationEndpoint, [UriKind]::Absolute, [ref]$endpoint) -or $endpoint.Scheme -ne 'https' -or $endpoint.IsLoopback -or $endpoint.UserInfo -or $endpoint.Query -or $endpoint.Fragment -or $endpoint.Host -match '(^|\.)example\.(com|org|net)$|\.invalid$')) { throw 'Configure o endereço HTTPS real da ativação ou deixe-o vazio para ativação assistida.' }
$keys = @($config.publicKeys)
if ($keys.Count -lt 1 -or $keys.Count -gt 8) { throw 'Inclua de uma a oito chaves públicas do emissor. Nunca inclua a chave privada.' }
$ids = @{}
foreach ($key in $keys) {
    if (@(Compare-Object @('keyId', 'publicKey') @($key.PSObject.Properties.Name | Sort-Object)).Count -ne 0 -or $key.keyId -cnotmatch '^[a-zA-Z0-9_-]{1,40}$' -or $ids.ContainsKey($key.keyId)) { throw 'Identificador de chave inválido ou repetido.' }
    $ids[$key.keyId] = $true
    if ($key.publicKey -cnotmatch '^[a-zA-Z0-9_-]+$') { throw 'A chave pública deve ser SPKI P-256 em base64url, sem padding.' }
    $encoded = $key.publicKey.Replace('-', '+').Replace('_', '/')
    $bytes = [Convert]::FromBase64String($encoded + ('=' * ((4 - $encoded.Length % 4) % 4)))
    $prefix = '3059301306072A8648CE3D020106082A8648CE3D03010703420004'
    if ($bytes.Length -ne 91 -or [BitConverter]::ToString($bytes, 0, 27).Replace('-', '') -ne $prefix) { throw 'Use somente a chave PÚBLICA SPKI ECDSA P-256.' }
    $blob = [byte[]]::new(72)
    [Array]::Copy([BitConverter]::GetBytes([uint32]0x31534345), 0, $blob, 0, 4)
    [Array]::Copy([BitConverter]::GetBytes([uint32]32), 0, $blob, 4, 4)
    [Array]::Copy($bytes, 27, $blob, 8, 64)
    $public = [System.Security.Cryptography.CngKey]::Import($blob, [System.Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob)
    $public.Dispose()
}
Write-Output 'Configuração pública de ativação verificada. A disponibilidade do serviço e a assinatura comercial exigem validação de distribuição.'
