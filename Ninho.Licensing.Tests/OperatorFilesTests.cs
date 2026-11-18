using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text.Json;
using Ninho.LicenseServer;
using Xunit;

namespace Ninho.Licensing.Tests;

public sealed class OperatorFilesTests
{
    [Fact]
    public async Task AdministrativeIssueAndOfflineRedemptionUseTemporaryAuthorityAndPrivateFilesOnly()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-license-operator-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        string[] settings = ["NINHO_LICENSE_SIGNING_KEY_FILE", "NINHO_LICENSE_KEY_ID", "NINHO_LICENSE_STORE"];
        var previous = settings.ToDictionary(setting => setting, Environment.GetEnvironmentVariable);
        try
        {
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            using var signingKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
            var privatePath = Path.Combine(directory, "temporary-key.pem");
            await OperatorFiles.WriteNewAsync(privatePath, signingKey.ExportPkcs8PrivateKeyPem());
            Environment.SetEnvironmentVariable(settings[0], privatePath);
            Environment.SetEnvironmentVariable(settings[1], "temporary-test-key");
            Environment.SetEnvironmentVariable(settings[2], Path.Combine(directory, "database.json"));
            var publicPath = Path.Combine(directory, "public.json");
            var deliveryPath = Path.Combine(directory, "delivery.json");
            Assert.Equal(0, await OperatorProgram.RunAsync(["public-key", "--output", publicPath]));
            Assert.Equal(0, await OperatorProgram.RunAsync(["issue", "--seats", "1", "--output", deliveryPath]));
            var issued = JsonSerializer.Deserialize<IssuedCode>(await File.ReadAllTextAsync(deliveryPath), LicenseProtocol.JsonOptions)!;
            Assert.DoesNotContain(issued.Code, await File.ReadAllTextAsync(Path.Combine(directory, "database.json")));
            using var installation = InstallationIdentity.Create();
            var requestPath = Path.Combine(directory, "request.json");
            await OperatorFiles.WriteNewAsync(requestPath, JsonSerializer.Serialize(installation.CreateActivationRequest(issued.Code), LicenseProtocol.JsonOptions));
            var resultPath = Path.Combine(directory, "result.json");
            Assert.Equal(0, await OperatorProgram.RunAsync(["activate-file", "--request", requestPath, "--output", resultPath]));
            var response = JsonSerializer.Deserialize<ActivationResponse>(await File.ReadAllTextAsync(resultPath), LicenseProtocol.JsonOptions)!;
            var publicKey = JsonSerializer.Deserialize<LicensePublicKey>(await File.ReadAllTextAsync(publicPath), LicenseProtocol.JsonOptions)!;
            Assert.True(new LicenseVerifier([publicKey]).Verify(response.Token, installation.Binding).IsValid);
            var retryPath = Path.Combine(directory, "retry.json");
            Assert.Equal(0, await OperatorProgram.RunAsync(["activate-file", "--request", requestPath, "--output", retryPath]));
            Assert.Equal(await File.ReadAllTextAsync(resultPath), await File.ReadAllTextAsync(retryPath));
            Assert.Equal(1, await OperatorProgram.RunAsync(["issue", "--seats", "1", "--output", deliveryPath]));
            Assert.Equal(issued, JsonSerializer.Deserialize<IssuedCode>(await File.ReadAllTextAsync(deliveryPath), LicenseProtocol.JsonOptions));
        }
        finally
        {
            foreach (var setting in previous) Environment.SetEnvironmentVariable(setting.Key, setting.Value);
            Directory.Delete(directory, true);
        }
    }
    [Fact]
    public async Task OperatorOutputIsPrivateAndNeverOverwritesAnExistingFile()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-license-files-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            var path = Path.Combine(directory, "issued.json");
            await OperatorFiles.WriteNewAsync(path, "private output");
            Assert.Equal("private output", await File.ReadAllTextAsync(path));
            Assert.Equal(path, OperatorFiles.RequirePrivatePath(path, true));
            await Assert.ThrowsAsync<IOException>(() => OperatorFiles.WriteNewAsync(path, "replacement"));
            Assert.Equal("private output", await File.ReadAllTextAsync(path));
            Assert.Throws<ArgumentException>(() => OperatorFiles.RequirePrivatePath("relative.json"));
        }
        finally { Directory.Delete(directory, true); }
    }
    [Fact]
    public void BroadReadPermissionsAreRejectedBeforeUsingSecrets()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-license-permissions-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var item = new DirectoryInfo(directory);
                var access = item.GetAccessControl();
                access.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.WorldSid, null), FileSystemRights.Read, AccessControlType.Allow));
                item.SetAccessControl(access);
            }
            else File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | UnixFileMode.OtherRead);
            Assert.Throws<UnauthorizedAccessException>(() => OperatorFiles.RequirePrivatePath(Path.Combine(directory, "store.json")));
        }
        finally { Directory.Delete(directory, true); }
    }
}
