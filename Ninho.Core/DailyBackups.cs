using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Ninho.Core;

public sealed record DailyBackupSnapshot(StudyState State, CoachJournal? Analysis, DateTimeOffset CreatedAt, string Path, string RecoveryWarning = "");
public sealed record DailyBackupListing(IReadOnlyList<string> Paths, bool Complete);
public sealed class DailyBackupPendingException(string message) : IOException(message);
public sealed class DailyBackupRecoveryRequiredException() : IOException("Existe uma cópia anterior. Restaure-a antes de enviar esta coleção à pasta escolhida.");

public sealed class DailyBackups(string directory, bool requireExistingDirectory = false,
    string? recoveryRequirement = null, Func<Task<DailyBackupListing>>? discover = null)
{
    public const int RetainedDays = 14;
    public const int MaximumStateBytes = 32 * 1024 * 1024;
    private readonly SemaphoreSlim gate = new(1, 1);
    public string DirectoryPath { get; } = Path.GetFullPath(directory);
    private static readonly Regex OwnedName = new(@"^Ninho-daily-\d{4}-\d{2}-\d{2}\.zip$", RegexOptions.CultureInvariant);
    private static readonly Regex PreservedName = new(@"^preserved-invalid-\d{8}-\d{6}-[a-f0-9]{32}\.zip$", RegexOptions.CultureInvariant);
    private sealed class Manifest
    {
        public string Format { get; set; } = "NinhoDaily";
        public int Version { get; set; } = 1;
        public DateTimeOffset CreatedAt { get; set; }
        public Dictionary<string, string> Hashes { get; set; } = [];
    }

    public async Task<string> SaveAsync(StudyState state, CoachJournal? analysis, DateTimeOffset now)
    {
        await gate.WaitAsync();
        try
        {
            if (recoveryRequirement != null && File.Exists(recoveryRequirement))
            {
                if (await LatestValidAsync() != null) throw new DailyBackupRecoveryRequiredException();
                FinishInitialRecovery();
            }
            if (requireExistingDirectory && !Directory.Exists(DirectoryPath)) throw new DailyBackupPendingException("A pasta escolhida está indisponível. Reconecte o serviço ou a unidade antes de atualizar a cópia.");
            StudyStore.Validate(state); analysis?.Validate();
            Directory.CreateDirectory(DirectoryPath); RejectLink(DirectoryPath);
            var stateBytes = JsonSerializer.SerializeToUtf8Bytes(state, StudyStore.JsonOptions);
            if (stateBytes.Length > MaximumStateBytes) throw new InvalidDataException("Estudos grandes demais para a cópia automática.");
            var payload = new Dictionary<string, byte[]> { ["state.json"] = stateBytes };
            if (analysis != null) payload["analysis.json"] = JsonSerializer.SerializeToUtf8Bytes(analysis, StudyStore.JsonOptions);
            if (payload.TryGetValue("analysis.json", out var a) && a.Length > 512 * 1024) throw new InvalidDataException("Análise local grande demais.");
            var path = Path.Combine(DirectoryPath, $"Ninho-daily-{now:yyyy-MM-dd}.zip");
            var manifest = new Manifest { CreatedAt = now, Hashes = payload.ToDictionary(p => p.Key, p => Convert.ToHexString(SHA256.HashData(p.Value))) };
            if (File.Exists(path))
            {
                RejectLink(path);
                try
                {
                    var previous = await ReadManifestAsync(path);
                    if (previous.Hashes.Count == manifest.Hashes.Count && manifest.Hashes.All(p => previous.Hashes.GetValueOrDefault(p.Key) == p.Value))
                    { await ReadAsync(path); Prune(); return path; }
                }
                catch (Exception error) when (error is IOException or JsonException or InvalidDataException)
                {
                    File.Copy(path, Path.Combine(DirectoryPath, $"preserved-invalid-{now:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.zip"));
                }
            }
            var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                await using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.WriteThrough))
                {
                    using (var zip = new ZipArchive(file, ZipArchiveMode.Create, true))
                    {
                        foreach (var pair in payload)
                        { await using var entry = zip.CreateEntry(pair.Key, CompressionLevel.SmallestSize).Open(); await entry.WriteAsync(pair.Value); }
                        await using var metadata = zip.CreateEntry("manifest.json", CompressionLevel.SmallestSize).Open();
                        await JsonSerializer.SerializeAsync(metadata, manifest, StudyStore.JsonOptions);
                    }
                    await file.FlushAsync();
                }
                await ReadAsync(temporary);
                File.Move(temporary, path, true);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
            Prune(); return path;
        }
        finally { gate.Release(); }
    }

    public async Task<DailyBackupSnapshot?> LatestValidAsync()
    {
        var listing = discover != null ? await discover() : new DailyBackupListing(Files().ToArray(), true);
        if (!listing.Complete) throw new DailyBackupPendingException("A descoberta das cópias ainda não terminou. Aguarde a sincronização e tente novamente.");
        var paths = listing.Paths.Where(p => OwnedName.IsMatch(Path.GetFileName(p))).OrderDescending(StringComparer.Ordinal).ToArray();
        foreach (var path in paths)
        {
            try
            {
                var attributes = File.GetAttributes(path);
                if ((attributes & (FileAttributes.Offline | (FileAttributes)0x400000 | (FileAttributes)0x40000)) != 0)
                    throw new DailyBackupPendingException("Há uma cópia aguardando download. Torne a pasta disponível neste dispositivo e tente novamente.");
                return await ReadAsync(path);
            }
            catch (Exception error) when (error is JsonException or InvalidDataException) { }
        }
        if (paths.Length > 0) throw new InvalidDataException("As cópias anteriores não puderam ser lidas. Elas foram preservadas; uma coleção nova não será criada sobre elas.");
        return null;
    }

    public async Task RequireInitialRecoveryAsync()
    {
        if (recoveryRequirement == null) return;
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(recoveryRequirement))!);
        await File.WriteAllTextAsync(recoveryRequirement, "true");
    }

    public void FinishInitialRecovery()
    {
        if (recoveryRequirement != null && File.Exists(recoveryRequirement)) File.Delete(recoveryRequirement);
    }

    public static bool MatchesRestoredState(DailyBackupSnapshot snapshot, StudyState state)
    {
        var restored = StudyStore.DecodeState(JsonSerializer.SerializeToUtf8Bytes(snapshot.State, StudyStore.JsonOptions));
        restored.Focus.Pause(snapshot.CreatedAt);
        return JsonSerializer.SerializeToUtf8Bytes(restored, StudyStore.JsonOptions).AsSpan()
            .SequenceEqual(JsonSerializer.SerializeToUtf8Bytes(state, StudyStore.JsonOptions));
    }

    public async Task<DailyBackupSnapshot?> RestoreIfMissingAsync(string dataDirectory)
    {
        var target = Path.Combine(Path.GetFullPath(dataDirectory), "state.json");
        if (File.Exists(target)) return null;
        if (!StudyStore.IsPristineDirectory(dataDirectory)) throw new InvalidDataException("Há arquivos anteriores nesta coleção. A recuperação automática foi pausada para preservá-los.");
        await RequireInitialRecoveryAsync();
        var snapshot = await LatestValidAsync();
        if (snapshot == null) { FinishInitialRecovery(); return null; }
        Directory.CreateDirectory(dataDirectory); RejectLink(dataDirectory);
        // An old running timer must not manufacture study time after reinstalling.
        snapshot.State.Focus.Pause(snapshot.CreatedAt);
        var temporary = target + ".recovery-" + Guid.NewGuid().ToString("N");
        try
        {
            await File.WriteAllBytesAsync(temporary, JsonSerializer.SerializeToUtf8Bytes(snapshot.State, StudyStore.JsonOptions));
            _ = await StudyStore.ReadAsync(temporary);
            if (File.Exists(target)) return null;
            File.Move(temporary, target, false);
            var analysisPath = Path.Combine(dataDirectory, "coach-usage.json");
            if (snapshot.Analysis != null && !File.Exists(analysisPath))
            {
                try { await new CoachJournalStore(analysisPath).SaveAsync(snapshot.Analysis); }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException)
                { snapshot = snapshot with { RecoveryWarning = "Os estudos foram recuperados, mas as observações da assistente não puderam ser copiadas: " + error.Message }; }
            }
            FinishInitialRecovery();
            return snapshot;
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    public static async Task<DailyBackupSnapshot> ReadAsync(string path)
    {
        RejectLink(path);
        using var zip = Open(path);
        var manifest = await ManifestFrom(zip);
        var entries = zip.Entries.Where(e => e.FullName != "manifest.json").ToArray();
        if (entries.Length != manifest.Hashes.Count || !manifest.Hashes.ContainsKey("state.json")) throw new InvalidDataException("Índice de cópia diária incompleto.");
        var bytes = new Dictionary<string, byte[]>();
        foreach (var entry in entries)
        {
            var payload = await ReadEntry(entry, entry.FullName == "state.json" ? MaximumStateBytes : 512 * 1024);
            if (!manifest.Hashes.TryGetValue(entry.FullName, out var expected) || expected != Convert.ToHexString(SHA256.HashData(payload))) throw new InvalidDataException("A integridade da cópia diária não confere.");
            bytes[entry.FullName] = payload;
        }
        var state = StudyStore.DecodeState(bytes["state.json"]);
        CoachJournal? analysis = null;
        if (bytes.TryGetValue("analysis.json", out var data))
        { analysis = JsonSerializer.Deserialize<CoachJournal>(data, StudyStore.JsonOptions) ?? throw new InvalidDataException("Análise vazia."); analysis.Validate(); }
        return new(state, analysis, manifest.CreatedAt, path);
    }
    private static async Task<Manifest> ReadManifestAsync(string path) { using var zip = Open(path); return await ManifestFrom(zip); }
    private static ZipArchive Open(string path)
    {
        if (new FileInfo(path).Length > MaximumStateBytes + 1024 * 1024) throw new InvalidDataException("Cópia diária grande demais.");
        var zip = ZipFile.OpenRead(path);
        if (zip.Entries.Count is < 2 or > 3 || zip.Entries.Select(e => e.FullName).Distinct(StringComparer.Ordinal).Count() != zip.Entries.Count ||
            zip.Entries.Any(e => e.FullName is not ("state.json" or "analysis.json" or "manifest.json")))
        { zip.Dispose(); throw new InvalidDataException("Conteúdo de cópia diária inválido."); }
        return zip;
    }
    private static async Task<Manifest> ManifestFrom(ZipArchive zip)
    {
        var entry = zip.GetEntry("manifest.json") ?? throw new InvalidDataException("Falta o índice da cópia diária.");
        var manifest = JsonSerializer.Deserialize<Manifest>(await ReadEntry(entry, 16 * 1024), StudyStore.JsonOptions) ?? throw new InvalidDataException("Índice vazio.");
        if (manifest.Format != "NinhoDaily" || manifest.Version != 1 || manifest.CreatedAt < DateTimeOffset.UnixEpoch || manifest.Hashes == null ||
            manifest.Hashes.Count is < 1 or > 2 || manifest.Hashes.Any(p => p.Key is not ("state.json" or "analysis.json") || p.Value == null || !Regex.IsMatch(p.Value, "^[A-F0-9]{64}$")))
            throw new InvalidDataException("Versão ou índice de cópia diária inválido.");
        return manifest;
    }
    private static async Task<byte[]> ReadEntry(ZipArchiveEntry entry, int maximum)
    {
        if (entry.Length > maximum) throw new InvalidDataException("Conteúdo descomprimido grande demais.");
        await using var input = entry.Open(); using var output = new MemoryStream();
        var buffer = new byte[81920]; int read;
        while ((read = await input.ReadAsync(buffer)) > 0)
        { if (output.Length + read > maximum) throw new InvalidDataException("Limite da cópia diária excedido."); await output.WriteAsync(buffer.AsMemory(0, read)); }
        return output.ToArray();
    }
    private IEnumerable<string> Files()
    {
        if (!Directory.Exists(DirectoryPath))
        {
            if (requireExistingDirectory) throw new DailyBackupPendingException("A pasta escolhida está indisponível. Reconecte o serviço ou a unidade antes de continuar.");
            return [];
        }
        RejectLink(DirectoryPath);
        return Directory.EnumerateFiles(DirectoryPath).Where(p => OwnedName.IsMatch(Path.GetFileName(p)));
    }
    private void Prune()
    {
        foreach (var path in Files().OrderDescending(StringComparer.Ordinal).Skip(RetainedDays))
        { RejectLink(path); File.Delete(path); }
        foreach (var path in Directory.EnumerateFiles(DirectoryPath).Where(p => PreservedName.IsMatch(Path.GetFileName(p))).OrderDescending(StringComparer.Ordinal).Skip(3))
        { RejectLink(path); File.Delete(path); }
    }
    private static void RejectLink(string path)
    {
        // OneDrive placeholders also carry ReparsePoint. LinkTarget distinguishes
        // actual symlinks/junctions, including parents, from cloud-managed files.
        FileSystemInfo? item = Directory.Exists(path) ? new DirectoryInfo(path) : new FileInfo(path);
        while (item != null)
        {
            if (item.LinkTarget != null) throw new InvalidDataException("Link ou junction não permitido para a cópia diária.");
            item = item is DirectoryInfo folder ? folder.Parent : (item as FileInfo)?.Directory;
        }
    }
}
