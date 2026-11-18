using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Ninho.Licensing;

public sealed record ActivationRequest(string Code, string PublicKey, string Proof);
public sealed record ActivationResponse(string Token);
public sealed record LicensePublicKey(string KeyId, string PublicKey);
public sealed record LicenseClaims(int Version, string Product, string LicenseId, string InstallationBinding, DateTimeOffset IssuedAt);
public enum LicenseError { None, Malformed, UnknownKey, InvalidSignature, InvalidPayload, WrongProduct, WrongInstallation }
public sealed record LicenseValidationResult(LicenseError Error, LicenseClaims? Claims = null)
{
    public bool IsValid => Error == LicenseError.None;
}

public static class LicenseProtocol
{
    public const string Product = "ninho-windows";
    public const string Prefix = "NINHO1";
    public const int MaximumTokenLength = 4096;
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 8
    };

    public static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] DecodeBase64Url(string value, int maximumBytes)
    {
        if (string.IsNullOrEmpty(value) || value.Length > (maximumBytes * 4 + 2) / 3 || value.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-' && c != '_')) throw new FormatException("Invalid encoding.");
        var bytes = Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));
        if (bytes.Length > maximumBytes || Base64Url(bytes) != value) throw new FormatException("Noncanonical encoding.");
        return bytes;
    }
    public static string NormalizeCode(string code)
    {
        var normalized = code.Trim();
        if (!normalized.StartsWith("NINHO-", StringComparison.Ordinal) || DecodeBase64Url(normalized[6..], 32).Length != 32) throw new FormatException("Invalid activation code.");
        return normalized;
    }
    public static bool IsKeyId(string value) => value.Length is >= 1 and <= 40 && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
    public static ECDsa ReadPublicKey(string encoded)
    {
        var bytes = DecodeBase64Url(encoded, 256);
        var key = ECDsa.Create();
        try
        {
            key.ImportSubjectPublicKeyInfo(bytes, out var read);
            if (read != bytes.Length || key.KeySize != 256 || key.ExportParameters(false).Curve.Oid.Value != ECCurve.NamedCurves.nistP256.Oid.Value || Base64Url(key.ExportSubjectPublicKeyInfo()) != encoded) throw new CryptographicException("P-256 key required.");
            return key;
        }
        catch { key.Dispose(); throw; }
    }
    public static string Binding(string publicKey)
    {
        using var key = ReadPublicKey(publicKey);
        return Base64Url(SHA256.HashData(key.ExportSubjectPublicKeyInfo()));
    }
    public static byte[] ActivationMessage(string code, string publicKey) => Encoding.UTF8.GetBytes($"{Prefix}/ACTIVATE\n{NormalizeCode(code)}\n{publicKey}");
    public static bool ValidateActivationProof(ActivationRequest request, out string binding)
    {
        binding = "";
        try
        {
            if (request.Code is null || request.PublicKey is null || request.Proof is null) return false;
            using var key = ReadPublicKey(request.PublicKey);
            var signature = DecodeBase64Url(request.Proof, 64);
            if (signature.Length != 64 || !key.VerifyData(ActivationMessage(request.Code, request.PublicKey), signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation)) return false;
            binding = Base64Url(SHA256.HashData(key.ExportSubjectPublicKeyInfo()));
            return true;
        }
        catch (Exception exception) when (exception is FormatException or CryptographicException or ArgumentException) { return false; }
    }
}

public sealed class InstallationIdentity : IDisposable
{
    private readonly ECDsa key;
    private InstallationIdentity(ECDsa key) => this.key = key;
    public static InstallationIdentity Create() => new(ECDsa.Create(ECCurve.NamedCurves.nistP256));
    public static InstallationIdentity ImportPrivateKey(byte[] privateKey)
    {
        if (privateKey.Length > 1024) throw new CryptographicException("Invalid installation key.");
        var key = ECDsa.Create();
        try
        {
            key.ImportPkcs8PrivateKey(privateKey, out var read);
            if (read != privateKey.Length || key.KeySize != 256 || key.ExportParameters(false).Curve.Oid.Value != ECCurve.NamedCurves.nistP256.Oid.Value) throw new CryptographicException("P-256 key required.");
            return new(key);
        }
        catch { key.Dispose(); throw; }
    }
    public byte[] ExportPrivateKey() => key.ExportPkcs8PrivateKey();
    public string PublicKey => LicenseProtocol.Base64Url(key.ExportSubjectPublicKeyInfo());
    public string Binding => LicenseProtocol.Base64Url(SHA256.HashData(key.ExportSubjectPublicKeyInfo()));
    public ActivationRequest CreateActivationRequest(string code)
    {
        var normalized = LicenseProtocol.NormalizeCode(code);
        return new(normalized, PublicKey, LicenseProtocol.Base64Url(key.SignData(LicenseProtocol.ActivationMessage(normalized, PublicKey), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation)));
    }
    public void Dispose() => key.Dispose();
}

public sealed class LicenseVerifier
{
    private readonly Dictionary<string, string> keys;
    public LicenseVerifier(IEnumerable<LicensePublicKey> publicKeys)
    {
        keys = new(StringComparer.Ordinal);
        foreach (var entry in publicKeys)
        {
            if (!LicenseProtocol.IsKeyId(entry.KeyId)) throw new ArgumentException("Invalid key identifier.");
            using var key = LicenseProtocol.ReadPublicKey(entry.PublicKey);
            keys.Add(entry.KeyId, entry.PublicKey);
        }
    }
    public LicenseValidationResult Verify(string token, string expectedBinding)
    {
        try
        {
            if (string.IsNullOrEmpty(token) || token.Length > LicenseProtocol.MaximumTokenLength) return new(LicenseError.Malformed);
            var parts = token.Split('.');
            if (parts.Length != 4 || parts[0] != LicenseProtocol.Prefix || !LicenseProtocol.IsKeyId(parts[1])) return new(LicenseError.Malformed);
            if (!keys.TryGetValue(parts[1], out var encodedKey)) return new(LicenseError.UnknownKey);
            var payload = LicenseProtocol.DecodeBase64Url(parts[2], 2048);
            var signature = LicenseProtocol.DecodeBase64Url(parts[3], 64);
            using var key = LicenseProtocol.ReadPublicKey(encodedKey);
            if (signature.Length != 64 || !key.VerifyData(Encoding.UTF8.GetBytes(string.Join('.', parts.Take(3))), signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation)) return new(LicenseError.InvalidSignature);
            using var document = JsonDocument.Parse(payload, new JsonDocumentOptions { MaxDepth = 4 });
            string[] names = ["version", "product", "licenseId", "installationBinding", "issuedAt"];
            if (document.RootElement.ValueKind != JsonValueKind.Object || !document.RootElement.EnumerateObject().Select(property => property.Name).Order().SequenceEqual(names.Order())) return new(LicenseError.InvalidPayload);
            var claims = JsonSerializer.Deserialize<LicenseClaims>(payload, LicenseProtocol.JsonOptions);
            if (claims is null || claims.Version != 1 || !Guid.TryParseExact(claims.LicenseId, "D", out _) || claims.InstallationBinding is null || LicenseProtocol.DecodeBase64Url(claims.InstallationBinding, 32).Length != 32 || claims.IssuedAt.Offset != TimeSpan.Zero || claims.IssuedAt < DateTimeOffset.UnixEpoch) return new(LicenseError.InvalidPayload);
            if (claims.Product != LicenseProtocol.Product) return new(LicenseError.WrongProduct);
            if (claims.InstallationBinding != expectedBinding) return new(LicenseError.WrongInstallation);
            return new(LicenseError.None, claims);
        }
        catch (Exception exception) when (exception is JsonException or FormatException or CryptographicException or ArgumentException or InvalidOperationException) { return new(LicenseError.Malformed); }
    }
}
