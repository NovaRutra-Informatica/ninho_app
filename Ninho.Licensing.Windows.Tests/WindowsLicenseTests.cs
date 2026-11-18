using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Ninho.Licensing.Windows;
using Xunit;

namespace Ninho.Licensing.Windows.Tests;

public sealed class WindowsLicenseTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "Ninho-license-tests-" + Guid.NewGuid().ToString("N"));
    private readonly string keyName = "Ninho.Test.License." + Guid.NewGuid().ToString("N");
    private readonly ECDsa authority = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private static string Code() => "NINHO-" + LicenseProtocol.Base64Url(RandomNumberGenerator.GetBytes(32));

    private LicenseClientConfiguration Configuration() => LicenseClientConfiguration.Parse(JsonSerializer.Serialize(new
    {
        schemaVersion = 1, product = LicenseProtocol.Product, activationEndpoint = "https://license.test/v1/activate",
        publicKeys = new[] { new LicensePublicKey("test", LicenseProtocol.Base64Url(authority.ExportSubjectPublicKeyInfo())) }
    }, LicenseProtocol.JsonOptions));
    private LicenseClient Client(HttpMessageHandler? handler = null) => new(Configuration(), WindowsInstallationKey.Open(keyName, false), new ProtectedLicenseFile(directory), handler);
    private string Token(string binding)
    {
        var claims = new LicenseClaims(1, LicenseProtocol.Product, Guid.NewGuid().ToString(), binding, DateTimeOffset.UtcNow);
        var data = "NINHO1.test." + LicenseProtocol.Base64Url(JsonSerializer.SerializeToUtf8Bytes(claims, LicenseProtocol.JsonOptions));
        return data + "." + LicenseProtocol.Base64Url(authority.SignData(Encoding.UTF8.GetBytes(data), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
    }

    [Fact]
    public void InstallationKeyIsPersistentNonExportableAndProducesAcceptedProof()
    {
        using var client = Client();
        using var second = Client();
        Assert.Equal(client.Binding, second.Binding);
        var request = client.Request(Code());
        Assert.True(LicenseProtocol.ValidateActivationProof(request, out var binding));
        Assert.Equal(client.Binding, binding);
        using var stored = CngKey.Open(keyName);
        Assert.Equal(CngExportPolicies.None, stored.ExportPolicy);
        Assert.Throws<CryptographicException>(() => stored.Export(CngKeyBlobFormat.Pkcs8PrivateBlob));
    }

    [Fact]
    public async Task SignedPurchaseSurvivesRestartWithoutMakingNetworkRequests()
    {
        using (var client = Client(new RejectNetwork()))
            Assert.True((await client.AcceptAsync(Token(client.Binding))).IsValid);
        using var reopened = Client(new RejectNetwork());
        Assert.True((await reopened.ReadAsync())?.IsValid);
        Assert.DoesNotContain("NINHO1", Encoding.UTF8.GetString(await File.ReadAllBytesAsync(Path.Combine(directory, "purchase.dat"))));
    }

    [Fact]
    public async Task ManualOnlyDistributionRequiresSameSignedPurchaseWithoutNetworkEndpoint()
    {
        var config = Configuration() with { ActivationEndpoint = "" };
        using var client = new LicenseClient(config, WindowsInstallationKey.Open(keyName, false), new ProtectedLicenseFile(directory), new RejectNetwork());
        Assert.False(client.CanActivateOnline);
        Assert.True(LicenseProtocol.ValidateActivationProof(client.Request(Code()), out var binding));
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.ActivateAsync(Code()));
        Assert.True((await client.AcceptAsync(Token(binding))).IsValid);
        Assert.True((await client.ReadAsync())!.IsValid);
    }

    [Fact]
    public async Task AssistedActivationAcceptsOperatorJsonOrRawTokenWithoutNetwork()
    {
        using var client = Client(new RejectNetwork());
        var token = Token(client.Binding);
        var response = JsonSerializer.Serialize(new ActivationResponse(token), LicenseProtocol.JsonOptions);
        Assert.True((await client.AcceptReceiptAsync(response)).IsValid);
        var claims = (await client.ReadAsync())!.Claims;
        Assert.True((await client.AcceptReceiptAsync("\n" + token + "\n")).IsValid);
        Assert.Equal(claims, (await client.ReadAsync())!.Claims);
    }

    [Fact]
    public async Task InvalidAssistedReceiptsCannotReplaceExistingPurchase()
    {
        using var client = Client(new RejectNetwork());
        var token = Token(client.Binding);
        await client.AcceptAsync(token);
        var path = Path.Combine(directory, "purchase.dat");
        var before = await File.ReadAllBytesAsync(path);
        var jsonToken = JsonSerializer.Serialize(token);
        foreach (var invalid in new[] { "", "[]", "{}", "{\"token\":null}", "{\"token\":true}",
            "{\"token\":" + jsonToken + ",\"token\":" + jsonToken + "}",
            "{\"token\":" + jsonToken + ",\"unlocked\":true}",
            "{\"token\":\"NINHO1.test.fake.fake\"}", new string(' ', 16_385) + token })
        {
            await Assert.ThrowsAsync<InvalidDataException>(() => client.AcceptReceiptAsync(invalid));
            Assert.Equal(before, await File.ReadAllBytesAsync(path));
        }
        await Assert.ThrowsAnyAsync<JsonException>(() => client.AcceptReceiptAsync("{incomplete"));
        Assert.Equal(before, await File.ReadAllBytesAsync(path));
    }

    [Fact]
    public async Task ForgedOrOtherInstallationLicenseCannotReplaceValidPurchase()
    {
        using var client = Client();
        await client.AcceptAsync(Token(client.Binding));
        var before = await File.ReadAllBytesAsync(Path.Combine(directory, "purchase.dat"));
        using var different = InstallationIdentity.Create();
        await Assert.ThrowsAsync<InvalidDataException>(() => client.AcceptAsync(Token(different.Binding)));
        await Assert.ThrowsAsync<InvalidDataException>(() => client.AcceptAsync("NINHO1.test.fake.fake"));
        Assert.Equal(before, await File.ReadAllBytesAsync(Path.Combine(directory, "purchase.dat")));
    }

    [Fact]
    public async Task CorruptEncryptedPurchaseIsRejectedAndExistingDataIsNotDeleted()
    {
        var storage = new ProtectedLicenseFile(directory);
        await storage.WriteAsync("receipt");
        var path = Path.Combine(directory, "purchase.dat");
        var bytes = await File.ReadAllBytesAsync(path); bytes[^1] ^= 1;
        await File.WriteAllBytesAsync(path, bytes);
        await Assert.ThrowsAsync<CryptographicException>(() => storage.ReadAsync());
        Assert.Equal(bytes, await File.ReadAllBytesAsync(path));
    }

    [Fact]
    public async Task CanceledPublicationPreservesPreviousReceipt()
    {
        var storage = new ProtectedLicenseFile(directory);
        await storage.WriteAsync("first");
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => storage.WriteAsync("second", new CancellationToken(true)));
        Assert.Equal("first", await storage.ReadAsync());
    }

    [Fact]
    public async Task OnlineActivationSendsOnlyLicenseAndProofThenAllowsOfflineUse()
    {
        using var client = Client(new Reply(async request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("https://license.test/v1/activate", request.RequestUri!.AbsoluteUri);
            var body = await request.Content!.ReadAsStringAsync();
            using var json = JsonDocument.Parse(body);
            Assert.Equal(new[] { "code", "proof", "publicKey" }, json.RootElement.EnumerateObject().Select(p => p.Name).Order());
            var activation = JsonSerializer.Deserialize<ActivationRequest>(body, LicenseProtocol.JsonOptions)!;
            Assert.True(LicenseProtocol.ValidateActivationProof(activation, out var binding));
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new ActivationResponse(Token(binding)), LicenseProtocol.JsonOptions)) };
        }));
        Assert.True((await client.ActivateAsync(Code())).IsValid);
        Assert.True((await client.ReadAsync())!.IsValid);
    }

    [Theory]
    [InlineData(302)] [InlineData(409)] [InlineData(429)] [InlineData(500)]
    public async Task ServerFailuresCannotGrantOrReplaceLicense(int status)
    {
        using var client = Client(new Reply(_ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status))));
        await Assert.ThrowsAsync<InvalidOperationException>(() => client.ActivateAsync(Code()));
        Assert.Null(await client.ReadAsync());
    }

    [Fact]
    public async Task OversizedServerResponseDoesNotReachDisk()
    {
        using var client = Client(new Reply(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', 20_000)) })));
        await Assert.ThrowsAsync<InvalidDataException>(() => client.ActivateAsync(Code()));
        Assert.False(File.Exists(Path.Combine(directory, "purchase.dat")));
    }

    [Fact]
    public async Task DeadlineIncludesBodyAfterResponseHeadersAndPreservesExistingPurchase()
    {
        using var client = new LicenseClient(Configuration(), WindowsInstallationKey.Open(keyName, false), new ProtectedLicenseFile(directory),
            new Reply(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new WaitingContent() })), TimeSpan.FromMilliseconds(100));
        await client.AcceptAsync(Token(client.Binding));
        var previous = (await client.ReadAsync())!.Claims;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.ActivateAsync(Code()).WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Equal(previous, (await client.ReadAsync())!.Claims);
    }

    [Fact]
    public async Task CallerCancellationStopsReadingWithoutPublishingAReceipt()
    {
        using var canceled = new CancellationTokenSource();
        using var client = Client(new Reply(_ =>
        {
            canceled.Cancel();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new WaitingContent() });
        }));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.ActivateAsync(Code(), canceled.Token).WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Null(await client.ReadAsync());
    }

    [Fact]
    public async Task PublicationAccessFailureDoesNotReportAcceptedOrDeleteTarget()
    {
        Directory.CreateDirectory(Path.Combine(directory, "purchase.dat"));
        using var client = Client();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => client.AcceptAsync(Token(client.Binding)));
        Assert.True(Directory.Exists(Path.Combine(directory, "purchase.dat")));
    }

    [Theory]
    [InlineData("http://license.test/v1/activate")]
    [InlineData("https://user:password@license.test/v1/activate")]
    [InlineData("https://license.test/v1/activate?secret=x")]
    public void UnsafeEndpointConfigurationIsRejected(string endpoint)
    {
        var config = Configuration() with { ActivationEndpoint = endpoint };
        Assert.Throws<InvalidDataException>(() => LicenseClientConfiguration.Parse(JsonSerializer.Serialize(config, LicenseProtocol.JsonOptions)));
    }

    [Fact]
    public void MissingAndUnknownConfigurationCannotGrantCommercialAccess()
    {
        Assert.Throws<InvalidDataException>(() => LicenseClientConfiguration.Parse("{\"schemaVersion\":1,\"product\":\"ninho-windows\",\"activationEndpoint\":\"\",\"publicKeys\":[]}"));
        Assert.Throws<JsonException>(() => LicenseClientConfiguration.Parse("{\"bypass\":true}"));
    }

    public void Dispose()
    {
        authority.Dispose();
        if (CngKey.Exists(keyName)) { using var key = CngKey.Open(keyName); key.Delete(); }
        if (Directory.Exists(directory) && Path.GetFileName(directory).StartsWith("Ninho-license-tests-", StringComparison.Ordinal)) Directory.Delete(directory, true);
    }
    private sealed class RejectNetwork : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => throw new InvalidOperationException("Offline verification attempted to use the network.");
    }
    private sealed class Reply(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => respond(request);
    }
    private sealed class WaitingContent : HttpContent
    {
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => throw new NotSupportedException();
        protected override Task<Stream> CreateContentReadStreamAsync() => Task.FromResult<Stream>(new WaitingStream());
        protected override Task<Stream> CreateContentReadStreamAsync(CancellationToken cancellationToken) => CreateContentReadStreamAsync();
    }
    private sealed class WaitingStream : Stream
    {
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) { await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken); return 0; }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
