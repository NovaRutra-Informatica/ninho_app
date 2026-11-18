using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Ninho.LicenseServer;
using Xunit;

namespace Ninho.Licensing.Tests;

public sealed class LicensingTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "ninho-license-test-" + Guid.NewGuid().ToString("N"));
    private readonly ECDsa signingKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly LicenseAuthority authority;
    private readonly LicenseStore store;
    private readonly LicenseVerifier verifier;
    private string DatabasePath => Path.Combine(directory, "licenses.json");
    public LicensingTests()
    {
        Directory.CreateDirectory(directory);
        authority = new("test-key", signingKey);
        store = new(DatabasePath, authority);
        verifier = new([authority.PublicKey]);
    }
    public void Dispose()
    {
        authority.Dispose();
        Directory.Delete(directory, true);
    }
    [Fact]
    public async Task PerpetualActivationValidatesOfflineForItsInstallationOnly()
    {
        using var installation = InstallationIdentity.Create();
        var issued = await store.IssueAsync(1);
        var result = await store.ActivateAsync(installation.CreateActivationRequest(issued.Code));
        Assert.Equal(ActivationError.None, result.Error);
        var validation = verifier.Verify(result.Token!, installation.Binding);
        Assert.True(validation.IsValid);
        Assert.Equal(issued.LicenseId, validation.Claims!.LicenseId);
        Assert.Equal(LicenseProtocol.Product, validation.Claims.Product);
        Assert.DoesNotContain("expir", Encoding.UTF8.GetString(LicenseProtocol.DecodeBase64Url(result.Token!.Split('.')[2], 2048)), StringComparison.OrdinalIgnoreCase);
        File.Delete(DatabasePath); // Offline verification does not contact a store or service.
        Assert.True(verifier.Verify(result.Token, installation.Binding).IsValid);
        using var other = InstallationIdentity.Create();
        Assert.Equal(LicenseError.WrongInstallation, verifier.Verify(result.Token, other.Binding).Error);
    }
    [Fact]
    public void CngCompatibleProofBytesAndInstallationKeyRoundTripAreStable()
    {
        using var installation = InstallationIdentity.Create();
        var privateKey = installation.ExportPrivateKey();
        try
        {
            using var restored = InstallationIdentity.ImportPrivateKey(privateKey);
            Assert.Equal(installation.PublicKey, restored.PublicKey);
            Assert.Equal(installation.Binding, LicenseProtocol.Binding(restored.PublicKey));
            var code = NewTestCode();
            var request = restored.CreateActivationRequest(" " + code + " ");
            using var key = LicenseProtocol.ReadPublicKey(request.PublicKey);
            Assert.True(key.VerifyData(LicenseProtocol.ActivationMessage(code, request.PublicKey), LicenseProtocol.DecodeBase64Url(request.Proof, 64), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
        }
        finally { CryptographicOperations.ZeroMemory(privateKey); }
    }
    [Fact]
    public async Task TamperingAndUnknownAuthorityNeverValidate()
    {
        using var installation = InstallationIdentity.Create();
        var issued = await store.IssueAsync(1);
        var result = await store.ActivateAsync(installation.CreateActivationRequest(issued.Code));
        var parts = result.Token!.Split('.');
        var payload = LicenseProtocol.DecodeBase64Url(parts[2], 2048);
        payload[10] ^= 1;
        Assert.Equal(LicenseError.InvalidSignature, verifier.Verify($"{parts[0]}.{parts[1]}.{LicenseProtocol.Base64Url(payload)}.{parts[3]}", installation.Binding).Error);
        var signature = LicenseProtocol.DecodeBase64Url(parts[3], 64); signature[0] ^= 1;
        Assert.Equal(LicenseError.InvalidSignature, verifier.Verify($"{parts[0]}.{parts[1]}.{parts[2]}.{LicenseProtocol.Base64Url(signature)}", installation.Binding).Error);
        Assert.Equal(LicenseError.UnknownKey, new LicenseVerifier([]).Verify(result.Token, installation.Binding).Error);
        Assert.False(verifier.Verify("NINHO2" + result.Token[6..], installation.Binding).IsValid);
        Assert.False(verifier.Verify(result.Token + "=", installation.Binding).IsValid);
        Assert.False(verifier.Verify(new string('a', 5000), installation.Binding).IsValid);
    }
    [Theory]
    [InlineData("wrong-product")]
    [InlineData("version")]
    [InlineData("duplicate")]
    [InlineData("extra")]
    [InlineData("missing")]
    [InlineData("bad-binding")]
    [InlineData("bad-date")]
    [InlineData("bad-license-id")]
    public void StrictSchemaRejectsEvenCorrectlySignedInvalidClaims(string mutation)
    {
        using var installation = InstallationIdentity.Create();
        var claims = JsonSerializer.Serialize(new LicenseClaims(1, LicenseProtocol.Product, Guid.NewGuid().ToString("D"), installation.Binding, DateTimeOffset.UtcNow), LicenseProtocol.JsonOptions);
        claims = mutation switch
        {
            "wrong-product" => claims.Replace("ninho-windows", "another-app"),
            "version" => claims.Replace("\"version\":1", "\"version\":2"),
            "duplicate" => "{\"version\":1," + claims[1..],
            "extra" => "{\"expiresAt\":null," + claims[1..],
            "missing" => claims.Replace("\"version\":1,", ""),
            "bad-binding" => claims.Replace(installation.Binding, "short"),
            "bad-date" => JsonSerializer.Serialize(new LicenseClaims(1, LicenseProtocol.Product, Guid.NewGuid().ToString("D"), installation.Binding, DateTimeOffset.MinValue), LicenseProtocol.JsonOptions),
            _ => claims.Replace("\"licenseId\":\"", "\"licenseId\":\"invalid")
        };
        var header = "NINHO1.test-key." + LicenseProtocol.Base64Url(Encoding.UTF8.GetBytes(claims));
        var token = header + "." + LicenseProtocol.Base64Url(signingKey.SignData(Encoding.UTF8.GetBytes(header), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
        Assert.False(verifier.Verify(token, installation.Binding).IsValid);
    }
    [Fact]
    public async Task ActivationProofCannotBeReusedForAnotherCodeOrInstallation()
    {
        using var installation = InstallationIdentity.Create();
        using var other = InstallationIdentity.Create();
        var issued = await store.IssueAsync(1);
        var request = installation.CreateActivationRequest(issued.Code);
        var before = await File.ReadAllTextAsync(DatabasePath);
        Assert.Equal(ActivationError.InvalidRequest, (await store.ActivateAsync(request with { PublicKey = other.PublicKey })).Error);
        Assert.Equal(ActivationError.InvalidRequest, (await store.ActivateAsync(request with { Code = NewTestCode() })).Error);
        Assert.Equal(ActivationError.InvalidRequest, (await store.ActivateAsync(request with { Proof = "bad" })).Error);
        Assert.Equal(ActivationError.InvalidCode, (await store.ActivateAsync(installation.CreateActivationRequest(NewTestCode()))).Error);
        Assert.Equal(before, await File.ReadAllTextAsync(DatabasePath));
    }
    [Fact]
    public async Task ConcurrentReplayForSameInstallationIsIdempotentAcrossStoreInstances()
    {
        using var installation = InstallationIdentity.Create();
        var issued = await store.IssueAsync(1);
        var request = installation.CreateActivationRequest(issued.Code);
        var results = await Task.WhenAll(Enumerable.Range(0, 24).Select(_ => new LicenseStore(DatabasePath, authority).ActivateAsync(request)));
        Assert.All(results, result => Assert.Equal(ActivationError.None, result.Error));
        Assert.Single(results.Select(result => result.Token).Distinct());
        var database = JsonSerializer.Deserialize<LicenseDatabase>(await File.ReadAllTextAsync(DatabasePath), LicenseProtocol.JsonOptions)!;
        Assert.Single(database.Licenses.Single().Activations);
        Assert.DoesNotContain(issued.Code, await File.ReadAllTextAsync(DatabasePath));
    }
    [Fact]
    public async Task ConcurrentDifferentInstallationsCannotExceedSeats()
    {
        var issued = await store.IssueAsync(2);
        var requests = Enumerable.Range(0, 20).Select(_ => { using var installation = InstallationIdentity.Create(); return installation.CreateActivationRequest(issued.Code); }).ToArray();
        var results = await Task.WhenAll(requests.Select(request => new LicenseStore(DatabasePath, authority).ActivateAsync(request)));
        Assert.Equal(2, results.Count(result => result.Error == ActivationError.None));
        Assert.Equal(18, results.Count(result => result.Error == ActivationError.NoSeats));
        foreach (var (request, result) in requests.Zip(results))
            if (result.Error == ActivationError.None) Assert.True(verifier.Verify(result.Token!, LicenseProtocol.Binding(request.PublicKey)).IsValid);
    }
    [Fact]
    public async Task CorruptDatabaseAndCancelledWritesPreserveOriginal()
    {
        using var installation = InstallationIdentity.Create();
        var issued = await store.IssueAsync(1);
        var request = installation.CreateActivationRequest(issued.Code);
        var before = await File.ReadAllTextAsync(DatabasePath);
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => store.ActivateAsync(request, cancelled.Token));
        Assert.Equal(before, await File.ReadAllTextAsync(DatabasePath));
        await File.WriteAllTextAsync(DatabasePath, "{ damaged");
        await Assert.ThrowsAsync<JsonException>(() => store.ActivateAsync(request));
        Assert.Equal("{ damaged", await File.ReadAllTextAsync(DatabasePath));
        Assert.Empty(Directory.GetFiles(directory, "*.tmp"));
    }
    [Fact]
    public async Task FailedAtomicReplacementNeverReturnsAnActivationOrLosesPriorFile()
    {
        using var installation = InstallationIdentity.Create();
        var issued = await store.IssueAsync(1);
        var request = installation.CreateActivationRequest(issued.Code);
        var before = await File.ReadAllTextAsync(DatabasePath);
        if (OperatingSystem.IsWindows())
        {
            await using (var locked = new FileStream(DatabasePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                var error = await Record.ExceptionAsync(() => store.ActivateAsync(request));
                Assert.True(error is IOException or UnauthorizedAccessException);
            }
            Assert.Equal(before, await File.ReadAllTextAsync(DatabasePath));
            Assert.Empty(Directory.GetFiles(directory, "*.tmp"));
        }
        Assert.Equal(ActivationError.None, (await store.ActivateAsync(request)).Error);
    }
    [Fact]
    public void ActivationRequestRejectsExtraDuplicateMissingAndOversizedFields()
    {
        using var installation = InstallationIdentity.Create();
        var raw = JsonSerializer.Serialize(installation.CreateActivationRequest(NewTestCode()), LicenseProtocol.JsonOptions);
        Assert.NotNull(OperatorProgram.ParseRequest(Encoding.UTF8.GetBytes(raw)));
        Assert.Throws<InvalidDataException>(() => OperatorProgram.ParseRequest(Encoding.UTF8.GetBytes("{\"code\":\"extra\"," + raw[1..])));
        Assert.Throws<InvalidDataException>(() => OperatorProgram.ParseRequest(Encoding.UTF8.GetBytes("{\"unknown\":true," + raw[1..])));
        Assert.Throws<InvalidDataException>(() => OperatorProgram.ParseRequest(Encoding.UTF8.GetBytes("{}")));
        Assert.Throws<InvalidDataException>(() => OperatorProgram.ParseRequest(new byte[4097]));
    }
    [Fact]
    public void PublicKeysRequireP256AndCanonicalEncoding()
    {
        using var unsupported = ECDsa.Create(ECCurve.NamedCurves.nistP384);
        Assert.ThrowsAny<CryptographicException>(() => new LicenseVerifier([new("unsupported", LicenseProtocol.Base64Url(unsupported.ExportSubjectPublicKeyInfo()))]));
        Assert.ThrowsAny<FormatException>(() => new LicenseVerifier([new("test", authority.PublicKey.PublicKey + "=")]));
        Assert.ThrowsAny<ArgumentException>(() => new LicenseVerifier([authority.PublicKey, authority.PublicKey]));
    }
    private static string NewTestCode() => "NINHO-" + LicenseProtocol.Base64Url(RandomNumberGenerator.GetBytes(32));
}
