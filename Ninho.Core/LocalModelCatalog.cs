using System.Buffers.Binary;
using System.Security;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Ninho.Core;

public sealed record LocalModelCandidate(string Path, string Name, long Bytes);

public sealed record LocalModelScanResult(IReadOnlyList<LocalModelCandidate> Candidates, bool Truncated);

/// <summary>
/// Finds local, single-file GGUF candidates without loading their weights. Header checks do not
/// establish that a model is complete or that its architecture/chat template supports inference.
/// </summary>
public static partial class LocalModelCatalog
{
    public const long MaximumFileBytes = 6L * 1024 * 1024 * 1024;
    private const int MaximumRoots = 32;
    private const int MaximumDirectories = 256;
    private const int MaximumEntries = 10_000;
    private const int MaximumDepth = 8;
    private const int MaximumCandidates = 128;
    private const int MaximumSettingsBytes = 256 * 1024;

    public static string DefaultModelsDirectory => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".lmstudio", "models");

    public static IReadOnlyList<string> GetLMStudioModelDirectories(string? profileDirectory = null)
    {
        if (!TryGetLocalAbsolutePath(profileDirectory ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), out var profile))
            return [];
        var fallback = System.IO.Path.Combine(profile, ".lmstudio", "models");
        try
        {
            var settingsPath = System.IO.Path.Combine(profile, ".lmstudio", "settings.json");
            using var stream = new FileStream(settingsPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            if (stream.Length > MaximumSettingsBytes) return [fallback];
            // The extra byte also catches a file growing after the length check, without an
            // unbounded JSON stream parse or reading any model weights/settings elsewhere.
            var buffer = new byte[MaximumSettingsBytes + 1];
            var length = 0;
            while (length < buffer.Length)
            {
                var read = stream.Read(buffer, length, buffer.Length - length);
                if (read == 0) break;
                length += read;
            }
            if (length > MaximumSettingsBytes) return [fallback];
            var offset = length >= 3 && buffer[0] == 0xEF && buffer[1] == 0xBB && buffer[2] == 0xBF ? 3 : 0;
            using var document = JsonDocument.Parse(buffer.AsMemory(offset, length - offset), new JsonDocumentOptions { MaxDepth = 32 });
            if (document.RootElement.ValueKind != JsonValueKind.Object ||
                !document.RootElement.TryGetProperty("downloadsFolder", out var preference) ||
                preference.ValueKind != JsonValueKind.String ||
                !TryGetLocalAbsolutePath(preference.GetString(), out var configured) ||
                configured.Equals(fallback, StringComparison.OrdinalIgnoreCase)) return [fallback];
            return [fallback, configured];
        }
        catch (Exception error) when (IsUnavailable(error) || error is JsonException)
        {
            return [fallback];
        }
    }

    /// <summary>Run on a worker thread. Enumeration is bounded and checks cancellation between entries.</summary>
    public static LocalModelScanResult Scan(IEnumerable<string> roots, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(roots);
        var directories = new Queue<(string Path, int Depth)>();
        var visitedDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var candidates = new Dictionary<string, LocalModelCandidate>(StringComparer.OrdinalIgnoreCase);
        var truncated = false;
        var rootCount = 0;
        foreach (var root in roots)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (++rootCount > MaximumRoots) { truncated = true; break; }
            if (string.IsNullOrWhiteSpace(root)) continue;
            try
            {
                var path = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(root));
                var attributes = File.GetAttributes(path);
                if (!attributes.HasFlag(FileAttributes.Directory) || attributes.HasFlag(FileAttributes.ReparsePoint)) continue;
                if (visitedDirectories.Add(path)) directories.Enqueue((path, 0));
            }
            catch (Exception error) when (IsUnavailable(error)) { }
        }

        var entryCount = 0;
        while (directories.TryDequeue(out var directory))
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                // Recheck before enumeration: a folder may have been replaced since it was queued.
                if (File.GetAttributes(directory.Path).HasFlag(FileAttributes.ReparsePoint)) continue;
                foreach (var path in Directory.EnumerateFileSystemEntries(directory.Path, "*", new EnumerationOptions
                {
                    RecurseSubdirectories = false,
                    IgnoreInaccessible = true,
                    ReturnSpecialDirectories = false,
                    AttributesToSkip = FileAttributes.ReparsePoint
                }))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (++entryCount > MaximumEntries)
                    {
                        truncated = true;
                        directories.Clear();
                        break;
                    }
                    try
                    {
                        var attributes = File.GetAttributes(path);
                        if (attributes.HasFlag(FileAttributes.ReparsePoint)) continue;
                        if (attributes.HasFlag(FileAttributes.Directory))
                        {
                            if (visitedDirectories.Contains(path)) continue;
                            if (directory.Depth >= MaximumDepth || visitedDirectories.Count >= MaximumDirectories)
                            {
                                truncated = true;
                                continue;
                            }
                            visitedDirectories.Add(path);
                            directories.Enqueue((path, directory.Depth + 1));
                            continue;
                        }
                        if (!System.IO.Path.GetExtension(path).Equals(".gguf", StringComparison.OrdinalIgnoreCase)) continue;
                        var candidate = Validate(path);
                        candidates.TryAdd(candidate.Path, candidate);
                        if (candidates.Count >= MaximumCandidates)
                        {
                            truncated = true;
                            directories.Clear();
                            break;
                        }
                    }
                    catch (Exception error) when (IsUnavailable(error) || error is InvalidDataException) { }
                }
            }
            catch (Exception error) when (IsUnavailable(error)) { }
        }
        cancellationToken.ThrowIfCancellationRequested();
        return new LocalModelScanResult(candidates.Values
            .OrderByDescending(IsPreferredQwen)
            .ThenBy(candidate => candidate.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(candidate => candidate.Path, StringComparer.OrdinalIgnoreCase)
            .ToArray(), truncated);
    }

    public static LocalModelCandidate Validate(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new InvalidDataException("Selecione um arquivo GGUF local.");
        try
        {
            var fullPath = System.IO.Path.GetFullPath(path);
            var file = new FileInfo(fullPath);
            if (!file.Exists || !file.Extension.Equals(".gguf", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Selecione um arquivo GGUF local existente.");
            if (file.Attributes.HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidDataException("Selecione o arquivo GGUF original, em vez de um link.");
            if (file.Length is < 1024 or > MaximumFileBytes)
                throw new InvalidDataException("Use um modelo GGUF quantizado de até 6 GB; o arquivo selecionado é pequeno demais ou excede esse limite.");
            if (SplitModelFile().IsMatch(file.Name))
                throw new InvalidDataException("Selecione um modelo GGUF em arquivo único. Modelos divididos em partes não são aceitos neste seletor.");
            if (file.Name.Contains("mmproj", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Este arquivo é um projetor multimodal. Selecione o GGUF principal do modelo de linguagem.");

            using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            var bytes = stream.Length;
            if (bytes is < 1024 or > MaximumFileBytes)
                throw new InvalidDataException("Use um modelo GGUF quantizado de até 6 GB; o arquivo selecionado é pequeno demais ou excede esse limite.");
            Span<byte> header = stackalloc byte[24];
            stream.ReadExactly(header);
            var version = BinaryPrimitives.ReadUInt32LittleEndian(header[4..8]);
            var tensors = BinaryPrimitives.ReadUInt64LittleEndian(header[8..16]);
            var metadata = BinaryPrimitives.ReadUInt64LittleEndian(header[16..24]);
            if (!header[..4].SequenceEqual("GGUF"u8) || version is not (2 or 3) || tensors == 0 || metadata == 0)
                throw new InvalidDataException("O arquivo não tem um cabeçalho GGUF de modelo válido (versão 2 ou 3).");

            return new LocalModelCandidate(fullPath, System.IO.Path.GetFileNameWithoutExtension(fullPath), bytes);
        }
        catch (Exception error) when (IsUnavailable(error))
        {
            throw new InvalidDataException("Não foi possível ler esse modelo GGUF. Verifique se o arquivo está disponível e pode ser acessado.", error);
        }
    }

    private static bool IsPreferredQwen(LocalModelCandidate candidate) => PreferredQwen().IsMatch(candidate.Path);

    private static bool TryGetLocalAbsolutePath(string? path, out string normalized)
    {
        normalized = "";
        if (string.IsNullOrWhiteSpace(path) || path.StartsWith(@"\\", StringComparison.Ordinal) ||
            path.StartsWith("//", StringComparison.Ordinal) || !System.IO.Path.IsPathFullyQualified(path)) return false;
        try
        {
            normalized = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(path));
            var driveRoot = System.IO.Path.GetPathRoot(normalized);
            if (string.IsNullOrEmpty(driveRoot) || new DriveInfo(driveRoot).DriveType == DriveType.Network)
            {
                normalized = "";
                return false;
            }
            return true;
        }
        catch (Exception error) when (IsUnavailable(error))
        {
            normalized = "";
            return false;
        }
    }

    private static bool IsUnavailable(Exception error) => error is IOException or UnauthorizedAccessException
        or SecurityException or ArgumentException or NotSupportedException;

    [GeneratedRegex(@"-\d{5}-of-\d{5}\.gguf$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SplitModelFile();

    [GeneratedRegex(@"qwen[\s_.-]*3[\s_.-]*4b[\s_.-]*instruct[\s_.-]*2507", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex PreferredQwen();
}
