using System.Security.Cryptography;
using System.Text.Json;
using Ninho.Licensing;
using Ninho.LicenseServer;

return await OperatorProgram.RunAsync(args);

public static class OperatorProgram
{
    public static async Task<int> RunAsync(string[] args)
    {
        if (args.Length == 0 || args[0] is "help" or "--help")
        {
            Console.WriteLine("Ninho LicenseServer: serve | issue --seats N --output FILE | public-key --output FILE | activate-file --request FILE --output FILE. Configure private paths before use; see DevDocs/LICENSING-SERVER.md.");
            return 0;
        }
        try
        {
            var signingPath = OperatorFiles.RequirePrivatePath(Required("NINHO_LICENSE_SIGNING_KEY_FILE"), true);
            var databasePath = OperatorFiles.RequirePrivatePath(Required("NINHO_LICENSE_STORE"));
            if (signingPath.Equals(databasePath, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Signing key and database must be separate files.");
            var key = ECDsa.Create();
            try { key.ImportFromPem(await File.ReadAllTextAsync(signingPath)); }
            catch { key.Dispose(); throw; }
            using var authority = new LicenseAuthority(Required("NINHO_LICENSE_KEY_ID"), key);
            var store = new LicenseStore(databasePath, authority);
            if (args[0] == "serve")
            {
                var url = Required("NINHO_LICENSE_LISTEN_URL");
                if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.UserInfo.Length > 0 || uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0) throw new ArgumentException("An explicit HTTPS listen URL is required.");
                var app = LicenseHttpHost.Create(store, builder => builder.WebHost.UseUrls(url));
                Console.WriteLine("License service starting with HTTPS and bounded requests. No activation data is logged.");
                await app.RunAsync();
                return 0;
            }
            var output = OperatorFiles.RequirePrivatePath(Option(args, "--output"));
            if (File.Exists(output) || output.Equals(signingPath, StringComparison.OrdinalIgnoreCase) || output.Equals(databasePath, StringComparison.OrdinalIgnoreCase)) throw new IOException("Choose a new output file.");
            object value;
            if (args[0] == "issue") value = await store.IssueAsync(int.Parse(Option(args, "--seats"), System.Globalization.CultureInfo.InvariantCulture));
            else if (args[0] == "public-key") value = authority.PublicKey;
            else if (args[0] == "activate-file")
            {
                var requestPath = OperatorFiles.RequirePrivatePath(Option(args, "--request"), true);
                if (new FileInfo(requestPath).Length > 4096) throw new InvalidDataException("Request is too large.");
                var request = ParseRequest(await File.ReadAllBytesAsync(requestPath));
                var result = await store.ActivateAsync(request);
                if (result.Error != ActivationError.None) throw new InvalidDataException("Activation rejected.");
                value = new ActivationResponse(result.Token!);
            }
            else throw new ArgumentException("Unknown command.");
            await OperatorFiles.WriteNewAsync(output, JsonSerializer.Serialize(value, LicenseProtocol.JsonOptions));
            Console.WriteLine("Completed. Result written to the private output file.");
            return 0;
        }
        catch (Exception exception) when (exception is ArgumentException or CryptographicException or IOException or UnauthorizedAccessException or JsonException or FormatException or OverflowException)
        {
            Console.Error.WriteLine("Operation failed. Check private paths, permissions, signing configuration, request and capacity. Existing data was not intentionally replaced; retry activation with the same installation.");
            return 1;
        }
    }
    public static ActivationRequest ParseRequest(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length > 4096) throw new InvalidDataException("Request is too large.");
        using var document = JsonDocument.Parse(bytes.ToArray(), new JsonDocumentOptions { MaxDepth = 4 });
        if (document.RootElement.ValueKind != JsonValueKind.Object || !document.RootElement.EnumerateObject().Select(property => property.Name).Order().SequenceEqual(new[] { "code", "proof", "publicKey" })) throw new InvalidDataException("Invalid request schema.");
        var request = JsonSerializer.Deserialize<ActivationRequest>(bytes, LicenseProtocol.JsonOptions);
        if (request?.Code is null || request.PublicKey is null || request.Proof is null) throw new InvalidDataException("Invalid request schema.");
        return request;
    }
    private static string Required(string key) => Environment.GetEnvironmentVariable(key) is { Length: > 0 } value ? value : throw new ArgumentException("Required configuration is missing.");
    private static string Option(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        if (index < 1 || index + 1 >= args.Length) throw new ArgumentException("A command option is missing.");
        return args[index + 1];
    }
}
