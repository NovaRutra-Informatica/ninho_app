using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Ninho.Licensing;

namespace Ninho.LicenseServer;

public sealed class LicenseAuthority : IDisposable
{
    private readonly ECDsa key;
    public string KeyId { get; }
    public LicenseAuthority(string keyId, ECDsa privateKey)
    {
        if (!LicenseProtocol.IsKeyId(keyId) || privateKey.KeySize != 256 || privateKey.ExportParameters(false).Curve.Oid.Value != ECCurve.NamedCurves.nistP256.Oid.Value) throw new ArgumentException("A P-256 signing key and valid identifier are required.");
        // Fail at startup if a public-only key was supplied accidentally.
        privateKey.SignData(RandomNumberGenerator.GetBytes(32), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        KeyId = keyId;
        key = privateKey;
    }
    public LicensePublicKey PublicKey => new(KeyId, LicenseProtocol.Base64Url(key.ExportSubjectPublicKeyInfo()));
    public string Sign(string licenseId, string binding, DateTimeOffset issuedAt)
    {
        var claims = new LicenseClaims(1, LicenseProtocol.Product, licenseId, binding, issuedAt.ToUniversalTime());
        var payload = LicenseProtocol.Base64Url(JsonSerializer.SerializeToUtf8Bytes(claims, LicenseProtocol.JsonOptions));
        var header = $"{LicenseProtocol.Prefix}.{KeyId}.{payload}";
        lock (key)
            return header + "." + LicenseProtocol.Base64Url(key.SignData(Encoding.UTF8.GetBytes(header), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
    }
    public void Dispose() => key.Dispose();
}

public enum ActivationError { None, InvalidRequest, InvalidCode, NoSeats }
public sealed record ActivationResult(ActivationError Error, string? Token = null);
public sealed record IssuedCode(string LicenseId, string Code, int Seats);
public sealed record StoredActivation(string Binding, string Token);
public sealed record StoredLicense(string LicenseId, string CodeHash, int Seats, DateTimeOffset IssuedAt, List<StoredActivation> Activations);
public sealed record LicenseDatabase(int Version, List<StoredLicense> Licenses);

// The exclusive lock covers read, seat allocation, signing, and atomic replace.
// It works between processes sharing this local directory, not across replicas.
public sealed class LicenseStore
{
    private readonly string path;
    private readonly LicenseAuthority authority;
    public LicenseStore(string path, LicenseAuthority authority)
    {
        if (!Path.IsPathFullyQualified(path)) throw new ArgumentException("An absolute database path is required.");
        this.path = Path.GetFullPath(path);
        this.authority = authority;
    }
    public async Task<IssuedCode> IssueAsync(int seats, CancellationToken cancellationToken = default)
    {
        if (seats is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(seats));
        await using var lease = await AcquireAsync(cancellationToken);
        var database = await ReadAsync(cancellationToken);
        var code = "NINHO-" + LicenseProtocol.Base64Url(RandomNumberGenerator.GetBytes(32));
        var id = Guid.NewGuid().ToString("D");
        database.Licenses.Add(new(id, CodeHash(code), seats, DateTimeOffset.UtcNow, []));
        await WriteAsync(database, cancellationToken);
        return new(id, code, seats);
    }
    public async Task<ActivationResult> ActivateAsync(ActivationRequest request, CancellationToken cancellationToken = default)
    {
        if (!LicenseProtocol.ValidateActivationProof(request, out var binding)) return new(ActivationError.InvalidRequest);
        var codeHash = CodeHash(request.Code);
        await using var lease = await AcquireAsync(cancellationToken);
        var database = await ReadAsync(cancellationToken);
        var license = database.Licenses.Find(item => CryptographicOperations.FixedTimeEquals(Convert.FromHexString(item.CodeHash), Convert.FromHexString(codeHash)));
        if (license is null) return new(ActivationError.InvalidCode);
        var previous = license.Activations.Find(item => item.Binding == binding);
        if (previous is not null) return new(ActivationError.None, previous.Token);
        if (license.Activations.Count >= license.Seats) return new(ActivationError.NoSeats);
        var token = authority.Sign(license.LicenseId, binding, DateTimeOffset.UtcNow);
        license.Activations.Add(new(binding, token));
        await WriteAsync(database, cancellationToken);
        return new(ActivationError.None, token);
    }
    private async Task<FileStream> AcquireAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try { return OpenPrivateFile(path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite); }
            catch (IOException) when (DateTime.UtcNow < deadline) { await Task.Delay(20, cancellationToken); }
        }
    }
    private static string CodeHash(string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(LicenseProtocol.NormalizeCode(code))));
    private async Task<LicenseDatabase> ReadAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(path)) return new(1, []);
        if (new FileInfo(path).Length > 64 * 1024 * 1024) throw new InvalidDataException("Database size limit reached; operator migration required.");
        var bytes = await File.ReadAllBytesAsync(path, cancellationToken);
        var database = JsonSerializer.Deserialize<LicenseDatabase>(bytes, LicenseProtocol.JsonOptions) ?? throw new InvalidDataException("Invalid database.");
        if (database.Version != 1 || database.Licenses is null || database.Licenses.Count > 100000
            || database.Licenses.Any(license => !ValidRecord(license))
            || database.Licenses.Select(license => license.CodeHash).Distinct(StringComparer.Ordinal).Count() != database.Licenses.Count
            || database.Licenses.Select(license => license.LicenseId).Distinct(StringComparer.Ordinal).Count() != database.Licenses.Count)
            throw new InvalidDataException("Invalid database; existing file preserved.");
        return database;
    }
    private static bool ValidRecord(StoredLicense? license)
    {
        if (license is null || !Guid.TryParseExact(license.LicenseId, "D", out _)
            || license.CodeHash is null || license.CodeHash.Length != 64 || !license.CodeHash.All(Uri.IsHexDigit)
            || license.Seats is < 1 or > 100 || license.IssuedAt < DateTimeOffset.UnixEpoch || license.IssuedAt.Offset != TimeSpan.Zero
            || license.Activations is null || license.Activations.Count > license.Seats)
            return false;
        try
        {
            foreach (var activation in license.Activations)
            {
                if (activation is null || string.IsNullOrEmpty(activation.Token) || activation.Token.Length > LicenseProtocol.MaximumTokenLength
                    || activation.Binding is null || LicenseProtocol.DecodeBase64Url(activation.Binding, 32).Length != 32)
                    return false;
                var parts = activation.Token.Split('.');
                if (parts.Length != 4 || parts[0] != LicenseProtocol.Prefix || !LicenseProtocol.IsKeyId(parts[1])) return false;
            }
        }
        catch (FormatException) { return false; }
        return license.Activations.Select(activation => activation.Binding).Distinct(StringComparer.Ordinal).Count() == license.Activations.Count;
    }
    private async Task WriteAsync(LicenseDatabase database, CancellationToken cancellationToken)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(database, LicenseProtocol.JsonOptions);
        if (database.Licenses.Count > 100000 || bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException("Database capacity reached; existing file preserved.");
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var stream = OpenPrivateFile(temporary, FileMode.CreateNew, FileAccess.Write, FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes, cancellationToken);
                stream.Flush(true);
            }
            cancellationToken.ThrowIfCancellationRequested();
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static FileStream OpenPrivateFile(string path, FileMode mode, FileAccess access, FileOptions fileOptions = FileOptions.None)
    {
        var options = new FileStreamOptions { Mode = mode, Access = access, Share = FileShare.None, Options = fileOptions };
        if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        return new FileStream(path, options);
    }
}
