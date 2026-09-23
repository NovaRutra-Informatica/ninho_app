using System.Text.Json;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Ninho.Core;

public sealed class StudyStore(string directory)
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true, MaxDepth = 48 };
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string directory = Path.GetFullPath(directory);
    public string DirectoryPath => directory;
    public StudyState State { get; private set; } = new();
    public string? MigrationMessage { get; private set; }
    private const long MaxStateBytes = 32 * 1024 * 1024;
    private string StatePath => Path.Combine(directory, "state.json");

    public async Task LoadAsync(string seedPath, string? legacyDirectory = null)
    {
        await gate.WaitAsync();
        try
        {
            Directory.CreateDirectory(directory);
            if (File.Exists(StatePath)) State = await ReadAsync(StatePath);
            else
            {
                var legacyPath = legacyDirectory == null ? null : Path.Combine(legacyDirectory, "state.json");
                var migrated = legacyPath != null && File.Exists(legacyPath);
                var candidate = await ReadAsync(migrated ? legacyPath! : seedPath);
                if (!migrated) candidate.Profile ??= new StudentProfile { DailyMinutes = candidate.Settings.DailyMinutes, SessionMinutes = candidate.Settings.FocusMinutes };
                if (migrated)
                {
                    foreach (var material in candidate.Materials)
                    {
                        var source = SafeMaterialPath(Path.Combine(legacyDirectory!, "materials"), material.StoredName);
                        if (!File.Exists(source)) continue;
                        var target = MaterialPath(material.StoredName);
                        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                        await using var input = File.OpenRead(source);
                        await using var output = File.Create(target);
                        await input.CopyToAsync(output);
                    }
                    MigrationMessage = "Seus estudos foram copiados da versão anterior. Os arquivos originais foram preservados.";
                }
                await WriteAsync(candidate);
                State = candidate;
            }
        }
        finally { gate.Release(); }
    }

    public async Task ChangeAsync(Action<StudyState> change)
    {
        await gate.WaitAsync();
        try
        {
            var candidate = await Task.Run(() => JsonSerializer.Deserialize<StudyState>(JsonSerializer.Serialize(State, JsonOptions), JsonOptions)!);
            change(candidate);
            await Task.Run(() => Validate(candidate));
            await WriteAsync(candidate);
            State = candidate;
        }
        finally { gate.Release(); }
    }

    public async Task ImportStateAsync(string path)
    {
        var candidate = await ReadAsync(path);
        await gate.WaitAsync();
        try { await PreserveBeforeRestoreAsync(); await WriteAsync(candidate); State = candidate; }
        finally { gate.Release(); }
    }

    public async Task ExportAsync(string path)
    {
        await gate.WaitAsync();
        try
        {
            if (Path.GetFullPath(path).Equals(StatePath, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Escolha outro arquivo para o backup.");
            await using var file = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true);
            await JsonSerializer.SerializeAsync(file, State, JsonOptions);
        }
        finally { gate.Release(); }
    }

    public async Task ExportArchiveAsync(string path)
    {
        await gate.WaitAsync();
        try
        {
            if (Path.GetFullPath(path).Equals(StatePath, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Escolha outro arquivo de backup.");
            var temporary = path + ".partial";
            await using (var file = new FileStream(temporary, FileMode.Create, FileAccess.ReadWrite, FileShare.None, 81920, true))
            using (var zip = new ZipArchive(file, ZipArchiveMode.Create, true))
            {
                var manifest = new ArchiveManifest();
                var bytes = JsonSerializer.SerializeToUtf8Bytes(State, JsonOptions);
                await using (var entry = zip.CreateEntry("state.json").Open()) await entry.WriteAsync(bytes);
                manifest.Hashes["state.json"] = Convert.ToHexString(SHA256.HashData(bytes));
                foreach (var material in State.Materials)
                {
                    var source = MaterialPath(material.StoredName);
                    if (!File.Exists(source)) throw new FileNotFoundException($"Anexo ausente: {material.Name}. Exporte JSON para preservar os registros ou reimporte o anexo.");
                    await using var input = File.OpenRead(source);
                    await using var entry = zip.CreateEntry("materials/" + material.StoredName, CompressionLevel.NoCompression).Open();
                    manifest.Hashes["materials/" + material.StoredName] = await CopyHashedAsync(input, entry, 2L * 1024 * 1024 * 1024);
                }
                await using var metadata = zip.CreateEntry("ninho-native.json").Open();
                await JsonSerializer.SerializeAsync(metadata, manifest, JsonOptions);
            }
            File.Move(temporary, path, true);
        }
        finally { gate.Release(); }
    }

    public async Task ImportArchiveAsync(string path)
    {
        await gate.WaitAsync();
        try
        {
            await using var file = File.OpenRead(path);
            using var zip = new ZipArchive(file, ZipArchiveMode.Read);
            if (zip.Entries.Count > 5002 || zip.Entries.Sum(x => (decimal)x.Length) > 20L * 1024 * 1024 * 1024 || zip.Entries.Select(x => x.FullName).Distinct(StringComparer.OrdinalIgnoreCase).Count() != zip.Entries.Count)
                throw new InvalidDataException("Backup grande demais ou com entradas duplicadas.");
            var nativeEntry = zip.GetEntry("ninho-native.json");
            var manifestEntry = nativeEntry ?? zip.GetEntry("manifest.json") ?? throw new InvalidDataException("Este arquivo não contém um índice de backup Ninho.");
            if (manifestEntry.Length > 2 * 1024 * 1024) throw new InvalidDataException("Índice de backup inválido.");
            await using var manifestStream = manifestEntry.Open();
            using var manifestBytes = new MemoryStream();
            await CopyHashedAsync(manifestStream, manifestBytes, 2 * 1024 * 1024);
            using var metadata = JsonDocument.Parse(manifestBytes.ToArray(), new JsonDocumentOptions { MaxDepth = JsonOptions.MaxDepth });
            RequireObject(metadata.RootElement, "manifesto"); RejectDuplicateProperties(metadata.RootElement);
            RequireFields(metadata.RootElement, "version", nativeEntry != null ? "hashes" : "files");
            ArchiveManifest? manifest;
            if (nativeEntry != null) manifest = metadata.RootElement.Deserialize<ArchiveManifest>(JsonOptions);
            else
            {
                var legacy = metadata.RootElement.Deserialize<LegacyManifest>(JsonOptions);
                if (legacy?.Format != "NinhoBackup" || legacy.Version != 1 || legacy.Files == null || legacy.Files.Count > 5001 || legacy.Files.Any(x => x == null || x.Path == null || x.Sha256 == null || x.Size < 0 || !Regex.IsMatch(x.Sha256, "^[a-fA-F0-9]{64}$")) || legacy.Files.Select(x => x.Path).Distinct(StringComparer.OrdinalIgnoreCase).Count() != legacy.Files.Count)
                    throw new InvalidDataException("Índice do backup anterior inválido.");
                manifest = new ArchiveManifest();
                foreach (var entry in legacy.Files)
                {
                    if (zip.GetEntry(entry.Path)?.Length != entry.Size) throw new InvalidDataException("Tamanho ou entrada divergente no backup anterior.");
                    manifest.Hashes.Add(entry.Path, entry.Sha256.ToUpperInvariant());
                }
            }
            if (manifest?.Version != 1 || manifest.Hashes == null || manifest.Hashes.Count > 5001 || manifest.Hashes.Any(x => x.Value == null || !Regex.IsMatch(x.Value, "^[a-fA-F0-9]{64}$"))) throw new InvalidDataException("Índice de backup inválido.");
            var stateEntry = zip.GetEntry("state.json") ?? throw new InvalidDataException("O backup não contém estudos.");
            await using var stateStream = stateEntry.Open();
            using var stateBytes = new MemoryStream();
            var stateHash = await CopyHashedAsync(stateStream, stateBytes, MaxStateBytes);
            if (!string.Equals(manifest.Hashes.GetValueOrDefault("state.json"), stateHash, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Os estudos do backup falharam na verificação de integridade.");
            var candidate = await Task.Run(() => DecodeState(stateBytes.ToArray()));
            var expected = candidate.Materials.Select(x => "materials/" + x.StoredName).Prepend("state.json").ToHashSet(StringComparer.Ordinal);
            if (!expected.SetEquals(manifest.Hashes.Keys) || !expected.Append(manifestEntry.FullName).ToHashSet(StringComparer.Ordinal).SetEquals(zip.Entries.Where(x => x.FullName != "materials/").Select(x => x.FullName)) || zip.GetEntry("materials/") is { Length: > 0 })
                throw new InvalidDataException("O índice não corresponde ao conteúdo do backup.");
            Directory.CreateDirectory(Path.Combine(directory, "materials"));
            // New unique filenames prevent a failed restore from modifying any active attachment.
            var createdPaths = new List<string>();
            try
            {
                foreach (var material in candidate.Materials)
                {
                    var name = "materials/" + material.StoredName;
                    var entry = zip.GetEntry(name) ?? throw new InvalidDataException("Falta um anexo no backup: " + material.Name);
                    if (entry.Length != material.Size) throw new InvalidDataException("Tamanho de anexo inválido.");
                    var storedName = Guid.NewGuid().ToString() + Path.GetExtension(material.StoredName);
                    var destination = MaterialPath(storedName);
                    await using var input = entry.Open();
                    await using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write);
                    createdPaths.Add(destination);
                    var hash = await CopyHashedAsync(input, output, 2L * 1024 * 1024 * 1024);
                    if (!string.Equals(manifest.Hashes.GetValueOrDefault(name), hash, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Anexo com integridade inválida: " + material.Name);
                    material.StoredName = storedName;
                }
                await PreserveBeforeRestoreAsync();
                await WriteAsync(candidate);
                State = candidate;
            }
            catch
            {
                foreach (var created in createdPaths) { try { File.Delete(created); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
                throw;
            }
        }
        finally { gate.Release(); }
    }
    private sealed class ArchiveManifest
    {
        public int Version { get; set; } = 1;
        public Dictionary<string, string> Hashes { get; set; } = new(StringComparer.Ordinal);
    }
    private sealed class LegacyManifest
    {
        public string Format { get; set; } = "";
        public int Version { get; set; }
        public List<LegacyFile> Files { get; set; } = [];
    }
    private sealed class LegacyFile
    {
        public string Path { get; set; } = "";
        public long Size { get; set; }
        public string Sha256 { get; set; } = "";
    }
    private static async Task<string> CopyHashedAsync(Stream input, Stream output, long limit, CancellationToken cancellationToken = default)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[81920]; long total = 0; int read;
        while ((read = await input.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0)
        {
            total += read;
            if (total > limit) throw new InvalidDataException("O conteúdo excede o limite do backup.");
            hash.AppendData(buffer, 0, read);
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        return Convert.ToHexString(hash.GetHashAndReset());
    }

    public async Task ImportMaterialAsync(string path, string? subjectId = null, string? lessonId = null)
        => await ImportMaterialsAsync([path], subjectId, lessonId);

    public Task<IReadOnlyList<Material>> ImportMaterialsAsync(IReadOnlyCollection<string> paths, string? subjectId = null, string? lessonId = null, CancellationToken cancellationToken = default)
    {
        if (paths == null || paths.Count is < 1 or > 100) throw new InvalidDataException("Selecione entre 1 e 100 arquivos por vez.");
        var selection = paths.ToArray();
        return Task.Run<IReadOnlyList<Material>>(async () =>
        {
            await gate.WaitAsync(cancellationToken);
            var createdPaths = new List<string>();
            try
            {
                const long limit = 2L * 1024 * 1024 * 1024;
                var candidate = JsonSerializer.Deserialize<StudyState>(JsonSerializer.Serialize(State, JsonOptions), JsonOptions)!;
                var pending = new List<(string Path, Material Material)>();
                foreach (var source in selection)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (string.IsNullOrWhiteSpace(source) || !Path.IsPathFullyQualified(source)) throw new InvalidDataException("Escolha um caminho de arquivo absoluto.");
                    var info = new FileInfo(source);
                    if (!info.Exists) throw new FileNotFoundException("Material não encontrado: " + info.Name, source);
                    if ((info.Attributes & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new InvalidDataException("Escolha arquivos comuns, sem atalhos ou links simbólicos.");
                    var extension = info.Extension.ToLowerInvariant();
                    if (!MaterialExtensions.Contains(extension)) throw new InvalidDataException("Formato não suportado: " + info.Name);
                    if (info.Length > limit) throw new InvalidDataException("Limite de 2 GB por material: " + info.Name);
                    var context = MaterialImport.InferContext(candidate, info.Name, subjectId, lessonId);
                    var material = new Material { Name = info.Name, StoredName = Guid.NewGuid().ToString() + extension, Size = info.Length, SubjectId = context.SubjectId, LessonId = context.LessonId, Type = extension.TrimStart('.') };
                    pending.Add((info.FullName, material));
                    candidate.Materials.Add(material);
                }
                Directory.CreateDirectory(Path.Combine(directory, "materials"));
                Validate(candidate);
                foreach (var (source, material) in pending)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
                    if (input.Length != material.Size) throw new InvalidDataException("O arquivo mudou durante a importação. Tente novamente.");
                    var destination = MaterialPath(material.StoredName);
                    await using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous);
                    createdPaths.Add(destination); // Only paths successfully created by this transaction can be removed on failure.
                    await CopyHashedAsync(input, output, limit, cancellationToken);
                    await output.FlushAsync(cancellationToken);
                    if (output.Length != material.Size || input.Length != material.Size) throw new InvalidDataException("O arquivo mudou durante a importação. Tente novamente.");
                }
                cancellationToken.ThrowIfCancellationRequested();
                // Cancellation stops before commit. Once publication starts, finish it and report success consistently.
                await WriteAsync(candidate);
                State = candidate;
                return pending.Select(item => item.Material).ToArray();
            }
            catch
            {
                foreach (var created in createdPaths) { try { File.Delete(created); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
                throw;
            }
            finally { gate.Release(); }
        }, cancellationToken);
    }

    public string MaterialPath(string storedName) => SafeMaterialPath(Path.Combine(directory, "materials"), storedName);
    private static string SafeMaterialPath(string root, string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || name.Contains(':') || name.Contains('/') || name.Contains('\\'))
            throw new InvalidDataException("Nome de anexo inválido.");
        return Path.Combine(root, name);
    }

    public static async Task<StudyState> ReadAsync(string path)
    {
        if (new FileInfo(path).Length > MaxStateBytes) throw new InvalidDataException("O arquivo de estudos excede 32 MB.");
        await using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
        using var bytes = new MemoryStream();
        await CopyHashedAsync(input, bytes, MaxStateBytes);
        return await Task.Run(() => DecodeState(bytes.ToArray()));
    }

    public static StudyState DecodeState(byte[] bytes)
    {
        if (bytes.Length > MaxStateBytes) throw new InvalidDataException("O arquivo de estudos excede 32 MB.");
        using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = JsonOptions.MaxDepth });
        var root = document.RootElement;
        RequireObject(root, "estudos");
        if (!root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var number) || number is not (1 or 2))
            throw new InvalidDataException("Informe um estado Ninho com versão 1 ou 2 explícita.");
        var lists = new[] { "subjects", "courses", "lessons", "cards", "exams", "materials", "sessions", "tasks" };
        if (number == 2) lists = [.. lists, "programs"];
        foreach (var name in lists)
        {
            if (!root.TryGetProperty(name, out var list) || list.ValueKind != JsonValueKind.Array)
                throw new InvalidDataException($"O backup não contém a coleção obrigatória {name}.");
            foreach (var item in list.EnumerateArray())
            {
                RequireObject(item, name);
                RequireFields(item, "id");
            }
        }
        if (!root.TryGetProperty("settings", out var settings)) throw new InvalidDataException("O backup não contém preferências.");
        RequireObject(settings, "preferências");
        RequireFields(settings, "name", "dailyMinutes", "newCardsPerDay", "focusMinutes", "breakMinutes", "theme", "sound", "reducedMotion");
        if (number == 2) foreach (var item in root.GetProperty("programs").EnumerateArray()) RequireFields(item, "name", "track", "color", "description");
        foreach (var item in root.GetProperty("subjects").EnumerateArray()) { RequireFields(item, "name", "track", "color"); if (number == 2) RequireFields(item, "programId"); }
        foreach (var item in root.GetProperty("courses").EnumerateArray()) RequireFields(item, "subjectId", "title", "provider", "url");
        foreach (var item in root.GetProperty("lessons").EnumerateArray()) RequireFields(item, "courseId", "subjectId", "title", "description", "url", "order", "status", "updatedAt", "notes");
        foreach (var item in root.GetProperty("exams").EnumerateArray()) RequireFields(item, "title", "subjectId", "date", "time", "location", "notes", "completed");
        foreach (var item in root.GetProperty("tasks").EnumerateArray()) RequireFields(item, "title", "subjectId", "date", "completed");
        foreach (var optional in new[] { "focus", "attempts" })
            if (root.TryGetProperty(optional, out var value) && value.ValueKind != (optional == "focus" ? JsonValueKind.Object : JsonValueKind.Array))
                throw new InvalidDataException($"Campo {optional} inválido.");
        // Identity and recorded times must never be synthesized from deserializer defaults.
        foreach (var item in root.GetProperty("cards").EnumerateArray()) RequireFields(item, "subjectId", "question", "answer", "dueAt", "lastReviewedAt", "createdAt", "intervalDays", "ease", "repetitions", "lapses", "flag", "suspended");
        foreach (var item in root.GetProperty("sessions").EnumerateArray()) RequireFields(item, "subjectId", "lessonId", "durationMinutes", "completedAt", "kind");
        foreach (var item in root.GetProperty("materials").EnumerateArray()) RequireFields(item, "name", "storedName", "type", "size", "subjectId", "lessonId", "createdAt", "notes");
        if (root.TryGetProperty("focus", out var focus)) RequireFields(focus, "id", "subjectId", "lessonId", "targetMinutes", "stopwatch", "accumulatedSeconds", "runningSince");
        if (root.TryGetProperty("attempts", out var attempts)) foreach (var item in attempts.EnumerateArray()) { RequireObject(item, "tentativa"); RequireFields(item, "id", "cardId", "subjectId", "rating", "at"); }
        RejectDuplicateProperties(root);
        var state = root.Deserialize<StudyState>(JsonOptions) ?? throw new InvalidDataException("Arquivo de estudos vazio.");
        Migrate(state);
        Validate(state);
        return state;
    }
    private static void RequireObject(JsonElement value, string name)
    {
        if (value.ValueKind != JsonValueKind.Object) throw new InvalidDataException($"O campo {name} deve ser um objeto.");
    }
    private static void RequireFields(JsonElement value, params string[] fields)
    {
        foreach (var field in fields) if (!value.TryGetProperty(field, out _)) throw new InvalidDataException($"Falta o campo obrigatório {field}.");
    }
    private static void RejectDuplicateProperties(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var property in value.EnumerateObject())
            {
                if (!names.Add(property.Name)) throw new InvalidDataException("O arquivo contém campos JSON duplicados ou ambíguos.");
                RejectDuplicateProperties(property.Value);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) RejectDuplicateProperties(item);
    }

    private async Task WriteAsync(StudyState state)
    {
        var temporary = StatePath + ".tmp";
        await using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.WriteThrough))
        {
            await JsonSerializer.SerializeAsync(stream, state, JsonOptions);
            await stream.FlushAsync();
        }
        if (File.Exists(StatePath)) File.Replace(temporary, StatePath, StatePath + ".previous", true);
        else File.Move(temporary, StatePath);
    }

    private async Task PreserveBeforeRestoreAsync()
    {
        if (!File.Exists(StatePath)) return;
        var backups = Path.Combine(directory, "backups"); Directory.CreateDirectory(backups);
        var path = Path.Combine(backups, $"before-restore-{DateTime.UtcNow:yyyyMMdd-HHmmssfff}-{Guid.NewGuid():N}.json");
        await using var source = File.OpenRead(StatePath);
        await using var destination = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.WriteThrough);
        await source.CopyToAsync(destination); await destination.FlushAsync();
    }

    public static void Validate(StudyState state)
    {
        if (state == null || state.Version != 2 || state.Settings == null || state.Focus == null || state.Subjects == null || state.Programs == null || state.Courses == null || state.Lessons == null || state.Cards == null || state.Sessions == null || state.Exams == null || state.Tasks == null || state.Materials == null || state.Attempts == null)
            throw new InvalidDataException("Este backup não é um estado Ninho v2 válido.");
        static bool Text(string? value, int limit) => value != null && value.Length <= limit;
        static bool Label(string? value, int limit) => !string.IsNullOrWhiteSpace(value) && value.Length <= limit;
        static bool Identifier(string? value, int limit = 200) => value != null && value.Length <= limit && Regex.IsMatch(value, "^[A-Za-z0-9][A-Za-z0-9._:-]*$");
        static bool Color(string? value) => value != null && Regex.IsMatch(value, "^#[a-fA-F0-9]{6}$");
        static bool Track(string? value) => value is "concurso" or "faculdade" or "pessoal";
        static bool Source(string? value) => value != null && value.Length <= 4000 && (value.Length == 0 || !value.Any(char.IsWhiteSpace) && Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && uri.Host.Length > 0 && uri.UserInfo.Length == 0);
        static bool Day(string? value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) && date.Year is >= 1900 and <= 2200;
        if (!Label(state.Settings.Name, 200) || state.Settings.DailyMinutes is < 1 or > 1440 || state.Settings.FocusMinutes is < 1 or > 240 || state.Settings.BreakMinutes is < 1 or > 60 || state.Settings.NewCardsPerDay is < 0 or > 500 || state.Settings.Theme is not ("light" or "dark" or "system") || !Text(state.Settings.ModelPath, 4000))
            throw new InvalidDataException("Preferências inválidas.");
        if (state.Profile is { } profile)
        {
            if (!Text(profile.Name, 100) || !Text(profile.Goal, 400) || !Text(profile.Motivation, 300) || !Text(profile.TargetDate, 40) ||
                !Text(profile.Subjects, 300) || !Text(profile.Level, 160) || !Text(profile.Routine, 400) || !Text(profile.PreferredTime, 160) ||
                !Text(profile.Challenges, 400) || !Text(profile.Preferences, 300) || !Text(profile.Accessibility, 240) || !Text(profile.Plan, 16000) ||
                profile.DailyMinutes is < 1 or > 1440 || profile.SessionMinutes is < 1 or > 240 || profile.Revision < 0 || profile.PlanProfileRevision < 0 ||
                profile.PlanStatus is not ("none" or "pending" or "ready" or "error") || profile.AvailableDays == null || profile.AvailableDays.Count > 7 ||
                profile.AvailableDays.Distinct().Count() != profile.AvailableDays.Count || profile.AvailableDays.Any(x => x is not ("mon" or "tue" or "wed" or "thu" or "fri" or "sat" or "sun")) ||
                profile.TutorialsSeen == null || profile.TutorialsSeen.Count > 32 || profile.TutorialsSeen.Any(x => !Identifier(x, 40)))
                throw new InvalidDataException("Perfil local inválido. Confira os limites das respostas.");
        }
        static HashSet<string> Ids<T>(IEnumerable<T> items, Func<T, string> getId, int maximum = 100000, int length = 200) where T : class
        {
            var set = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in items)
                if (item == null || !Identifier(getId(item), length) || !set.Add(getId(item))) throw new InvalidDataException("Registros nulos ou identificadores inválidos/duplicados.");
            if (set.Count > maximum) throw new InvalidDataException("Há registros demais neste backup.");
            return set;
        }
        var subjects = Ids(state.Subjects, x => x.Id, 500);
        Ids(state.Programs, x => x.Id, 500); Ids(state.Courses, x => x.Id, 5000); Ids(state.Lessons, x => x.Id);
        Ids(state.Cards, x => x.Id); Ids(state.Sessions, x => x.Id, 500000, 300); Ids(state.Attempts, x => x.Id, 500000);
        Ids(state.Exams, x => x.Id, 10000); Ids(state.Tasks, x => x.Id); Ids(state.Materials, x => x.Id, 10000);
        var programs = state.Programs.ToDictionary(x => x.Id);
        var courses = state.Courses.ToDictionary(x => x.Id);
        var lessons = state.Lessons.ToDictionary(x => x.Id);
        bool SubjectExists(string? id) => id != null && (id == "" || subjects.Contains(id));
        bool LessonMatches(string? id, string subject, bool nullable = false) => id == null ? nullable : id == "" || lessons.TryGetValue(id, out var lesson) && lesson.SubjectId == subject;
        if (state.Programs.Any(x => !Label(x.Name, 150) || !Track(x.Track) || !Color(x.Color) || !Text(x.Description, 5000)) ||
            state.Subjects.Any(x => !Label(x.Name, 150) || !Track(x.Track) || !Color(x.Color) || x.ProgramId == null || !programs.TryGetValue(x.ProgramId, out var parent) || parent.Track != x.Track) ||
            state.Courses.Any(x => !subjects.Contains(x.SubjectId) || !Label(x.Title, 500) || !Text(x.Provider, 200) || !Source(x.Url)) ||
            state.Lessons.Any(x => !subjects.Contains(x.SubjectId) || x.CourseId == null || !courses.TryGetValue(x.CourseId, out var parent) || parent.SubjectId != x.SubjectId || !Text(x.Notes, 100000) || !Label(x.Title, 500) || !Text(x.Description, 20000) || !Source(x.Url) || x.Order is < 0 or > 100000 || x.Status is not ("not-started" or "in-progress" or "done")) ||
            state.Cards.Any(x => !subjects.Contains(x.SubjectId) || !LessonMatches(x.LessonId, x.SubjectId, true) || !Label(x.Question, 10000) || !Label(x.Answer, 50000) || !Text(x.Source, 5000) || !Source(x.SourceUrl) || !double.IsFinite(x.IntervalDays) || x.IntervalDays is < 0 or > 36500 || x.Ease is < 1.3 or > 3.5 || !double.IsFinite(x.Ease) || x.Repetitions is < 0 or > 1000000 || x.Lapses is < 0 or > 1000000 || x.Flag is not ("none" or "outdated" or "relearn") || x.DueAt < x.CreatedAt || x.LastReviewedAt is { } last && (last < x.CreatedAt || x.DueAt < last) || x.LastReviewedAt == null && (x.Repetitions != 0 || x.Lapses != 0 || x.IntervalDays != 0)) ||
            state.Sessions.Any(x => !SubjectExists(x.SubjectId) || !LessonMatches(x.LessonId, x.SubjectId) || !double.IsFinite(x.DurationMinutes) || x.DurationMinutes is < 0 or > 1440 || !Text(x.Feedback, 20000) || x.Kind is not ("focus" or "lesson" or "review")) ||
            // A card can be moved or deleted; attempts keep the subject recorded at practice time.
            state.Attempts.Any(x => !subjects.Contains(x.SubjectId) || !Identifier(x.CardId) || x.Rating is not ("again" or "hard" or "good" or "easy")) ||
            state.Exams.Any(x => !SubjectExists(x.SubjectId) || !Label(x.Title, 300) || !Day(x.Date) || x.Time == null || x.Time != "" && !TimeOnly.TryParseExact(x.Time, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) || !Text(x.Location, 500) || !Text(x.Notes, 20000)) ||
            state.Tasks.Any(x => !SubjectExists(x.SubjectId) || !Label(x.Title, 500) || !Day(x.Date)))
            throw new InvalidDataException("Há conteúdo ou referências inválidas no backup.");
        if (!Identifier(state.Focus.Id) || !SubjectExists(state.Focus.SubjectId) || !LessonMatches(state.Focus.LessonId, state.Focus.SubjectId) || state.Focus.TargetMinutes is < 1 or > 240 || !double.IsFinite(state.Focus.AccumulatedSeconds) || state.Focus.AccumulatedSeconds is < 0 or > 86400)
            throw new InvalidDataException("Temporizador inválido.");
        var materialNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var material in state.Materials)
        {
            SafeMaterialPath(root: "unused", name: material.StoredName);
            var extension = Path.GetExtension(material.StoredName).ToLowerInvariant();
            if (!MaterialExtensions.Contains(extension) || !materialNames.Add(material.StoredName) || !Label(material.Name, 500) || !Text(material.Notes, 100000) || !string.Equals(material.Type, extension.TrimStart('.'), StringComparison.OrdinalIgnoreCase) || material.Size < 0 || material.Size > 2L * 1024 * 1024 * 1024 || !SubjectExists(material.SubjectId) || !LessonMatches(material.LessonId, material.SubjectId)) throw new InvalidDataException("Anexo inválido no backup.");
        }
    }
    public static readonly string[] MaterialExtensions = [".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".mp4", ".webm", ".mov", ".mkv", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
    private static void Migrate(StudyState state)
    {
        if (state.Version != 1 || state.Subjects == null) return;
        state.Programs ??= [];
        foreach (var group in state.Subjects.GroupBy(x => x.Track))
        {
            var id = group.Key == "concurso" ? "senado-federal" : group.Key == "faculdade" ? "maua" : "outros";
            if (!state.Programs.Any(x => x.Id == id)) state.Programs.Add(new StudyProgram { Id = id, Name = group.Key == "concurso" ? "Senado Federal" : group.Key == "faculdade" ? "Mauá" : "Outros estudos", Track = group.Key });
            foreach (var subject in group) subject.ProgramId = id;
        }
        state.Version = 2;
    }
}
