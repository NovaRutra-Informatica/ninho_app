using System.Buffers.Binary;
using System.Text.Json;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public sealed class LocalModelCatalogTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "Ninho-model-catalog-" + Guid.NewGuid().ToString("N"));

    public LocalModelCatalogTests() => Directory.CreateDirectory(root);

    [Fact]
    public void ScanFindsNestedModelsAndDeduplicatesOverlappingRoots()
    {
        var nested = Path.Combine(root, "publisher", "model");
        var model = WriteModel(Path.Combine(nested, "Model-Q4_K_M.gguf"));
        var roots = new[] { root, nested, root + Path.DirectorySeparatorChar, root, Path.Combine(root, "missing") };
        var result = LocalModelCatalog.Scan(roots);

        var candidate = Assert.Single(result.Candidates);
        Assert.Equal(model, candidate.Path);
        Assert.Equal("Model-Q4_K_M", candidate.Name);
        Assert.Equal(1024L, candidate.Bytes);
        Assert.False(result.Truncated);
    }

    [Fact]
    public void ScanPrefersExistingQwenInstructWithoutSelectingOrCopyingIt()
    {
        WriteModel(Path.Combine(root, "A-chat.gguf"));
        var preferred = WriteModel(Path.Combine(root, "publisher", "Qwen3-4B-Instruct-2507-GGUF", "model-Q4_K_M.gguf"));
        WriteModel(Path.Combine(root, "Qwen3-4B.gguf"));

        var result = LocalModelCatalog.Scan([root]);

        Assert.Equal(3, result.Candidates.Count);
        Assert.Equal(preferred, result.Candidates[0].Path);
        Assert.Equal(3, Directory.GetFiles(root, "*", SearchOption.AllDirectories).Length);
    }

    [Theory]
    [InlineData("mmproj-model.gguf")]
    [InlineData("model-mmproj-f16.gguf")]
    [InlineData("model-00001-of-00002.gguf")]
    [InlineData("model-00002-of-00002.GGUF")]
    [InlineData("model.bin")]
    public void ValidateRejectsProjectorsSplitModelsAndWrongExtensions(string name)
    {
        var path = WriteModel(Path.Combine(root, name));
        Assert.Throws<InvalidDataException>(() => LocalModelCatalog.Validate(path));
        Assert.Empty(LocalModelCatalog.Scan([root]).Candidates);
    }

    [Theory]
    [InlineData(0, 1, 1)]
    [InlineData(1, 1, 1)]
    [InlineData(4, 1, 1)]
    [InlineData(3, 0, 1)]
    [InlineData(3, 1, 0)]
    public void ValidateRejectsInvalidFixedHeaders(uint version, ulong tensors, ulong metadata)
    {
        var path = WriteModel(Path.Combine(root, "invalid.gguf"), version, tensors, metadata);
        Assert.Throws<InvalidDataException>(() => LocalModelCatalog.Validate(path));
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void ValidateAcceptsSupportedHeaderWithoutClaimingArchitectureCompatibility(uint version)
    {
        // The remaining bytes deliberately contain no model metadata or tensors. This is a
        // header-level candidate check, not a guarantee that the inference runtime can load it.
        var path = WriteModel(Path.Combine(root, "candidate.GGUF"), version);
        Assert.Equal(path, LocalModelCatalog.Validate(path).Path);
    }

    [Fact]
    public void ScanSkipsMalformedAndIncompleteDownloadsButKeepsOtherModels()
    {
        var expected = WriteModel(Path.Combine(root, "valid.gguf"));
        File.WriteAllBytes(Path.Combine(root, "short.gguf"), "GGUF"u8.ToArray());
        File.WriteAllBytes(Path.Combine(root, "bad-magic.gguf"), new byte[1024]);
        WriteModel(Path.Combine(root, "pending.gguf.part"));
        WriteModel(Path.Combine(root, "mmproj-f16.gguf"));

        Assert.Equal(expected, Assert.Single(LocalModelCatalog.Scan([root]).Candidates).Path);
    }

    [Fact]
    public void CancellationStopsEnumerationBeforeReturningResults()
    {
        using var cancellation = new CancellationTokenSource();
        IEnumerable<string> Roots()
        {
            yield return root;
            cancellation.Cancel();
            yield return root;
        }

        Assert.Throws<OperationCanceledException>(() => LocalModelCatalog.Scan(Roots(), cancellation.Token));
        Assert.Throws<OperationCanceledException>(() => LocalModelCatalog.Scan([], cancellation.Token));
    }

    [Fact]
    public void BoundedRootEnumerationDoesNotConsumeAnUnboundedSource()
    {
        IEnumerable<string> Roots()
        {
            while (true) yield return root;
        }

        var result = LocalModelCatalog.Scan(Roots());
        Assert.True(result.Truncated);
    }

    [Fact]
    public void DeepDirectoryTreesAreBoundedAndReportedAsPartial()
    {
        var nested = root;
        for (var i = 0; i < 10; i++) nested = Path.Combine(nested, "nested");
        WriteModel(Path.Combine(nested, "too-deep.gguf"));
        var accessible = WriteModel(Path.Combine(root, "accessible.gguf"));

        var result = LocalModelCatalog.Scan([root]);
        Assert.True(result.Truncated);
        Assert.Equal(accessible, Assert.Single(result.Candidates).Path);
    }

    [Fact]
    public void LockedFileDoesNotPreventDiscoveryOfOtherModels()
    {
        var locked = WriteModel(Path.Combine(root, "locked.gguf"));
        var available = WriteModel(Path.Combine(root, "available.gguf"));
        using var lockHandle = new FileStream(locked, FileMode.Open, FileAccess.ReadWrite, FileShare.None);

        Assert.Equal(available, Assert.Single(LocalModelCatalog.Scan([root]).Candidates).Path);
    }

    [Fact]
    public void InvalidPathsGiveAUsefulValidationError()
    {
        Assert.Throws<InvalidDataException>(() => LocalModelCatalog.Validate(""));
        Assert.Throws<InvalidDataException>(() => LocalModelCatalog.Validate(Path.Combine(root, "missing.gguf")));
        Assert.Throws<InvalidDataException>(() => LocalModelCatalog.Validate("invalid\0.gguf"));
        Assert.Empty(LocalModelCatalog.Scan(["", "invalid\0", Path.Combine(root, "missing")]).Candidates);
    }

    [Fact]
    public void LMStudioSettingsAddCustomLocalModelsDirectoryAlongsideFallback()
    {
        var custom = Path.Combine(root, "other-models");
        WriteSettings(JsonSerializer.Serialize(new { downloadsFolder = custom + Path.DirectorySeparatorChar, ignoredFolder = "https://example.com/models" }));

        Assert.Equal(new[] { Path.Combine(root, ".lmstudio", "models"), custom }, LocalModelCatalog.GetLMStudioModelDirectories(root));
    }

    [Fact]
    public void LMStudioSettingsDeduplicateTheFallbackDirectory()
    {
        var fallback = Path.Combine(root, ".lmstudio", "models");
        WriteSettings(JsonSerializer.Serialize(new { downloadsFolder = fallback + Path.DirectorySeparatorChar }));

        Assert.Equal(fallback, Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Fact]
    public void LMStudioSettingsAcceptUtf8ByteOrderMark()
    {
        var custom = Path.Combine(root, "other-models");
        var path = WriteSettings("");
        File.WriteAllText(path, JsonSerializer.Serialize(new { downloadsFolder = custom }), new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

        Assert.Contains(custom, LocalModelCatalog.GetLMStudioModelDirectories(root));
    }

    [Fact]
    public void MissingLMStudioSettingsKeepTheFallbackDirectory()
    {
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Theory]
    [InlineData("invalid JSON")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("{\"downloadsFolder\":17}")]
    [InlineData("{\"downloadsFolder\":null}")]
    [InlineData("{\"downloadsFolder\":{\"path\":\"somewhere\"}}")]
    public void MalformedOrMissingLMStudioPreferenceKeepsFallback(string json)
    {
        WriteSettings(json);
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Theory]
    [InlineData("relative-models")]
    [InlineData("..\\models")]
    [InlineData("\\\\server\\models")]
    [InlineData("//server/models")]
    [InlineData("https://example.com/models")]
    [InlineData("file:///C:/models")]
    [InlineData("invalid\0path")]
    public void LMStudioSettingsIgnoreRelativeRemoteAndUriPaths(string path)
    {
        WriteSettings(JsonSerializer.Serialize(new { downloadsFolder = path }));
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Theory]
    [InlineData("relative-profile")]
    [InlineData("\\\\server\\profile")]
    public void LMStudioDirectoryDiscoveryDoesNotAccessNonLocalOrRelativeProfiles(string profile)
    {
        Assert.Empty(LocalModelCatalog.GetLMStudioModelDirectories(profile));
    }

    [Fact]
    public void LMStudioSettingsIgnoreAlternatePropertyNames()
    {
        WriteSettings(JsonSerializer.Serialize(new { modelDirectory = Path.Combine(root, "other-models") }));
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Fact]
    public void OversizedLMStudioSettingsAreNotParsed()
    {
        WriteSettings(JsonSerializer.Serialize(new { downloadsFolder = Path.Combine(root, "other-models"), padding = new string(' ', 256 * 1024) }));
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Fact]
    public void LMStudioSettingsLimitJsonDepth()
    {
        var preference = JsonSerializer.Serialize(Path.Combine(root, "other-models"));
        WriteSettings("{\"downloadsFolder\":" + preference + ",\"nested\":" + new string('[', 33) + "0" + new string(']', 33) + "}");
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    [Fact]
    public void InaccessibleLMStudioSettingsKeepFallback()
    {
        var path = WriteSettings(JsonSerializer.Serialize(new { downloadsFolder = Path.Combine(root, "other-models") }));
        using var lockHandle = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        Assert.Equal(Path.Combine(root, ".lmstudio", "models"), Assert.Single(LocalModelCatalog.GetLMStudioModelDirectories(root)));
    }

    private string WriteSettings(string json)
    {
        var directory = Path.Combine(root, ".lmstudio");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "settings.json");
        File.WriteAllText(path, json);
        return path;
    }

    private static string WriteModel(string path, uint version = 3, ulong tensors = 1, ulong metadata = 1)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var bytes = new byte[1024];
        "GGUF"u8.CopyTo(bytes);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4, 4), version);
        BinaryPrimitives.WriteUInt64LittleEndian(bytes.AsSpan(8, 8), tensors);
        BinaryPrimitives.WriteUInt64LittleEndian(bytes.AsSpan(16, 8), metadata);
        File.WriteAllBytes(path, bytes);
        return Path.GetFullPath(path);
    }

    public void Dispose() => Directory.Delete(root, recursive: true);
}
