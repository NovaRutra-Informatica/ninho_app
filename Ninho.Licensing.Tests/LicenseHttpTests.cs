using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Ninho.LicenseServer;
using Xunit;

namespace Ninho.Licensing.Tests;

public sealed class LicenseHttpTests
{
    [Fact]
    public async Task InMemoryHttpRequiresHttpsChecksSchemaAndReturnsIdempotentToken()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-license-http-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            using var authority = new LicenseAuthority("test-http", ECDsa.Create(ECCurve.NamedCurves.nistP256));
            var store = new LicenseStore(Path.Combine(directory, "store.json"), authority);
            await using var app = LicenseHttpHost.Create(store, builder => builder.WebHost.UseTestServer());
            await app.StartAsync();
            using var client = app.GetTestClient();
            client.BaseAddress = new Uri("https://localhost");
            using var identity = InstallationIdentity.Create();
            var issued = await store.IssueAsync(1);
            var request = identity.CreateActivationRequest(issued.Code);
            var insecure = await client.PostAsJsonAsync("http://localhost/v1/activate", request, LicenseProtocol.JsonOptions);
            Assert.Equal(HttpStatusCode.BadRequest, insecure.StatusCode);
            Assert.True(insecure.Headers.CacheControl?.NoStore);
            var response = await client.PostAsJsonAsync("/v1/activate", request, LicenseProtocol.JsonOptions);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var activation = await response.Content.ReadFromJsonAsync<ActivationResponse>(LicenseProtocol.JsonOptions);
            Assert.True(new LicenseVerifier([authority.PublicKey]).Verify(activation!.Token, identity.Binding).IsValid);
            var replay = await client.PostAsJsonAsync("/v1/activate", request, LicenseProtocol.JsonOptions);
            Assert.Equal(activation, await replay.Content.ReadFromJsonAsync<ActivationResponse>(LicenseProtocol.JsonOptions));
            using var other = InstallationIdentity.Create();
            var capacity = await client.PostAsJsonAsync("/v1/activate", other.CreateActivationRequest(issued.Code), LicenseProtocol.JsonOptions);
            Assert.Equal(HttpStatusCode.Conflict, capacity.StatusCode);
            Assert.Equal("{\"error\":\"activation_limit\"}", await capacity.Content.ReadAsStringAsync());
            var json = JsonSerializer.Serialize(request, LicenseProtocol.JsonOptions);
            foreach (var invalid in new[] { "{\"code\":\"duplicate\"," + json[1..], "{\"extra\":true," + json[1..], "{}", new string('x', 4097) })
            {
                var rejected = await client.PostAsync("/v1/activate", new StringContent(invalid, Encoding.UTF8, "application/json"));
                Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
                Assert.DoesNotContain(issued.Code, await rejected.Content.ReadAsStringAsync());
            }
            await File.WriteAllTextAsync(Path.Combine(directory, "store.json"), "corrupt");
            var failure = await client.PostAsJsonAsync("/v1/activate", request, LicenseProtocol.JsonOptions);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, failure.StatusCode);
            Assert.Equal("{\"error\":\"service_unavailable\"}", await failure.Content.ReadAsStringAsync());
        }
        finally { Directory.Delete(directory, true); }
    }
    [Fact]
    public async Task InMemoryHttpRateLimitIsBoundedWithoutAllocatingPerAddressPartitions()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-license-limit-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            using var authority = new LicenseAuthority("test-rate", ECDsa.Create(ECCurve.NamedCurves.nistP256));
            var store = new LicenseStore(Path.Combine(directory, "store.json"), authority);
            await using var app = LicenseHttpHost.Create(store, builder => builder.WebHost.UseTestServer());
            await app.StartAsync();
            using var client = app.GetTestClient(); client.BaseAddress = new Uri("https://localhost");
            for (var index = 0; index < 30; index++)
                Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/v1/activate", new StringContent("{}", Encoding.UTF8, "application/json"))).StatusCode);
            var throttled = await client.PostAsync("/v1/activate", new StringContent("{}", Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
            Assert.True(throttled.Headers.CacheControl?.NoStore);
        }
        finally { Directory.Delete(directory, true); }
    }
}
