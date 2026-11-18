using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Ninho.Licensing.Windows;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record LicenseClientConfiguration(int SchemaVersion, string Product, string ActivationEndpoint, LicensePublicKey[] PublicKeys)
{
    public static LicenseClientConfiguration Parse(string json)
    {
        if (json.Length > 16_384) throw new InvalidDataException("Configuração de licenciamento inválida.");
        var value = JsonSerializer.Deserialize<LicenseClientConfiguration>(json, LicenseProtocol.JsonOptions)
            ?? throw new InvalidDataException("Configuração de licenciamento ausente.");
        if (value.SchemaVersion != 1 || value.Product != LicenseProtocol.Product || value.PublicKeys is not { Length: > 0 and <= 8 })
            throw new InvalidDataException("Esta edição ainda não foi configurada para ativação comercial.");
        if (value.ActivationEndpoint is null || value.ActivationEndpoint.Length > 2048) throw new InvalidDataException("Configuração de ativação inválida.");
        if (value.ActivationEndpoint.Length > 0 && (!Uri.TryCreate(value.ActivationEndpoint, UriKind.Absolute, out var endpoint) || endpoint.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(endpoint.UserInfo) || !string.IsNullOrEmpty(endpoint.Query) || !string.IsNullOrEmpty(endpoint.Fragment)))
            throw new InvalidDataException("O endereço de ativação precisa usar HTTPS sem credenciais ou parâmetros.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var publicKey in value.PublicKeys)
        {
            if (publicKey is null || publicKey.KeyId is null || !LicenseProtocol.IsKeyId(publicKey.KeyId) || !ids.Add(publicKey.KeyId))
                throw new InvalidDataException("A chave pública de ativação é inválida ou está duplicada.");
            using var key = LicenseProtocol.ReadPublicKey(publicKey.PublicKey);
        }
        return value;
    }
}

public sealed class LicenseClient : IDisposable
{
    private readonly LicenseClientConfiguration configuration;
    private readonly WindowsInstallationKey installation;
    private readonly ProtectedLicenseFile storage;
    private readonly LicenseVerifier verifier;
    private readonly HttpClient http;
    private readonly TimeSpan activationTimeout;
    public string Binding { get; }
    public bool HardwareBacked => installation.HardwareBacked;
    public bool CanActivateOnline => configuration.ActivationEndpoint.Length > 0;

    public LicenseClient(LicenseClientConfiguration configuration, WindowsInstallationKey installation, ProtectedLicenseFile storage, HttpMessageHandler? handler = null, TimeSpan? activationTimeout = null)
    {
        this.configuration = LicenseClientConfiguration.Parse(JsonSerializer.Serialize(configuration, LicenseProtocol.JsonOptions));
        this.installation = installation;
        this.storage = storage;
        this.activationTimeout = activationTimeout ?? TimeSpan.FromSeconds(25);
        if (this.activationTimeout <= TimeSpan.Zero || this.activationTimeout > TimeSpan.FromMinutes(1)) throw new ArgumentOutOfRangeException(nameof(activationTimeout));
        verifier = new LicenseVerifier(configuration.PublicKeys);
        Binding = LicenseProtocol.Binding(LicenseProtocol.Base64Url(installation.PublicKeyBytes));
        http = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = Timeout.InfiniteTimeSpan };
    }

    public async Task<LicenseValidationResult?> ReadAsync(CancellationToken cancellationToken = default)
    {
        var token = await storage.ReadAsync(cancellationToken);
        return token == null ? null : verifier.Verify(token, Binding);
    }

    public ActivationRequest Request(string code)
    {
        code = LicenseProtocol.NormalizeCode(code);
        var publicKey = LicenseProtocol.Base64Url(installation.PublicKeyBytes);
        var proof = LicenseProtocol.Base64Url(installation.Sign(LicenseProtocol.ActivationMessage(code, publicKey)));
        return new ActivationRequest(code, publicKey, proof);
    }

    public async Task<LicenseValidationResult> ActivateAsync(string code, CancellationToken cancellationToken = default)
    {
        if (!CanActivateOnline) throw new InvalidOperationException("Esta edição usa ativação assistida. Envie a solicitação ao suporte e aplique o comprovante recebido.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(activationTimeout);
        cancellationToken = deadline.Token;
        var request = await Task.Run(() => Request(code), cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        using var message = new HttpRequestMessage(HttpMethod.Post, configuration.ActivationEndpoint)
        {
            Content = JsonContent.Create(request, options: LicenseProtocol.JsonOptions)
        };
        using var response = await http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(response.StatusCode == HttpStatusCode.TooManyRequests
                ? "Muitas tentativas de ativação. Aguarde um pouco e tente novamente."
                : response.StatusCode == HttpStatusCode.Conflict
                    ? "Esta licença já atingiu o número de computadores permitido. Entre em contato com o suporte para recuperar ou transferir sua ativação."
                    : "Não foi possível confirmar o código. Confira sua compra e tente novamente.");
        if (response.Content.Headers.ContentLength > 16_384) throw new InvalidDataException("A resposta de ativação ultrapassa o tamanho permitido.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var bytes = new MemoryStream();
        var buffer = new byte[4096];
        int count;
        while ((count = await stream.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (bytes.Length + count > 16_384) throw new InvalidDataException("A resposta de ativação ultrapassa o tamanho permitido.");
            bytes.Write(buffer, 0, count);
        }
        var receipt = JsonSerializer.Deserialize<ActivationResponse>(bytes.ToArray(), LicenseProtocol.JsonOptions)
            ?? throw new InvalidDataException("A resposta de ativação está incompleta.");
        return await AcceptAsync(receipt.Token, cancellationToken);
    }

    public Task<LicenseValidationResult> AcceptReceiptAsync(string receipt, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(receipt) || receipt.Length > 16_384)
            throw new InvalidDataException("O comprovante de ativação está inválido.");
        receipt = receipt.Trim();
        if (receipt.StartsWith("NINHO1.", StringComparison.Ordinal)) return AcceptAsync(receipt, cancellationToken);
        using var document = JsonDocument.Parse(receipt, new JsonDocumentOptions { MaxDepth = 2 });
        if (document.RootElement.ValueKind != JsonValueKind.Object)
            throw new InvalidDataException("O arquivo não contém um comprovante de ativação.");
        var properties = document.RootElement.EnumerateObject().ToArray();
        if (properties.Length != 1 || properties[0].Name != "token" || properties[0].Value.ValueKind != JsonValueKind.String)
            throw new InvalidDataException("O arquivo não contém um comprovante de ativação.");
        return AcceptAsync(properties[0].Value.GetString()!, cancellationToken);
    }

    public async Task<LicenseValidationResult> AcceptAsync(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > LicenseProtocol.MaximumTokenLength)
            throw new InvalidDataException("O comprovante de ativação está inválido.");
        var result = verifier.Verify(token.Trim(), Binding);
        if (!result.IsValid) throw new InvalidDataException("Este comprovante não é válido para esta instalação do Ninho.");
        await storage.WriteAsync(token.Trim(), cancellationToken);
        return result;
    }

    public void Dispose() { http.Dispose(); installation.Dispose(); }
}
