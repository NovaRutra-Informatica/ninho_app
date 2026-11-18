using System.Text.Json;
using System.Text.Json.Nodes;
using System.IO.Compression;
using System.Security.Cryptography;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public class StudyTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 22, 12, 0, 0, TimeSpan.Zero);
    private static StudyState Example() => new()
    {
        Programs = [new() { Id = "p", Name = "Objetivo" }],
        Subjects = [new() { Id = "s", ProgramId = "p", Name = "Matemática" }, new() { Id = "t", ProgramId = "p", Name = "História" }],
        Cards = [new() { Id = "q", SubjectId = "s", Question = "Quanto é 2 + 2?", Answer = "4", DueAt = Now, CreatedAt = Now.AddDays(-30) }]
    };
    [Fact] public async Task ExistingCatalogLoadsWithoutDroppingRecords()
    {
        var state = await StudyStore.ReadAsync(Path.Combine(AppContext.BaseDirectory, "seed.json"));
        Assert.Equal(2, state.Version); Assert.True(state.Lessons.Count >= 271); Assert.True(state.Cards.Count >= 71);
        Assert.Empty(state.Sessions); Assert.Empty(state.Attempts);
    }
    [Fact] public void CountdownClampsSleepAndDoesNotCountPausedTime()
    {
        var timer = new FocusState { TargetMinutes = 25, RunningSince = Now };
        Assert.Equal(1500, timer.Elapsed(Now.AddHours(5)));
        timer.Pause(Now.AddMinutes(3));
        Assert.Equal(180, timer.Elapsed(Now.AddHours(1)));
        timer.RunningSince = Now.AddHours(1);
        Assert.Equal(240, timer.Elapsed(Now.AddHours(1).AddMinutes(1)));
    }
    [Fact] public void FocusRecordsActualTimeAndDoesNotCompleteLesson()
    {
        var state = Example(); state.Focus = new() { SubjectId = "s", RunningSince = Now };
        StudyEngine.FinishFocus(state, Now.AddMinutes(2), "Rever frações");
        Assert.Equal(2, Assert.Single(state.Sessions).DurationMinutes);
        Assert.Equal("Rever frações", state.Sessions[0].Feedback);
        Assert.Null(state.Focus.RunningSince); Assert.Equal(0, state.Focus.AccumulatedSeconds);
        Assert.Throws<InvalidDataException>(() => StudyEngine.FinishFocus(state, Now.AddMinutes(3), ""));
        Assert.Single(state.Sessions);
    }
    [Fact] public void ReviewsPersistFeedbackAndAlwaysShowOverdueDespiteNewLimit()
    {
        var state = Example(); state.Settings.NewCardsPerDay = 1;
        StudyEngine.Review(state, "q", "again", Now);
        Assert.Equal(Now.AddMinutes(10), state.Cards[0].DueAt, TimeSpan.FromMilliseconds(1));
        Assert.Equal("again", Assert.Single(state.Attempts).Rating);
        state.Cards.Add(new ReviewCard { Id = "q2", SubjectId = "s", Question = "Outra?", Answer = "Sim", DueAt = Now, CreatedAt = Now });
        Assert.Empty(StudyEngine.DueCards(state, Now));
        Assert.Equal("q", Assert.Single(StudyEngine.DueCards(state, Now.AddMinutes(11))).Id);
        StudyEngine.Review(state, "q", "good", Now.AddMinutes(11));
        Assert.Single(state.Sessions, x => x.Id.StartsWith("review:first:"));
    }
    [Fact] public void PriorityExplainsGapDifficultyAndDueWithoutClaimingMastery()
    {
        var state = Example();
        state.Sessions.Add(new() { SubjectId = "s", DurationMinutes = 15, CompletedAt = Now.AddDays(-12) });
        StudyEngine.Review(state, "q", "again", Now.AddDays(-10));
        var insights = StudyEngine.Recommend(state, Now);
        Assert.Equal("s", insights[0].SubjectId); Assert.True(insights[0].Priority > insights[1].Priority);
        Assert.Contains("vencida", insights[0].Reason); Assert.Contains("10 dias", insights[0].Reason); Assert.Contains("difícil", insights[0].Reason);
        Assert.Contains("faltam evidências", insights[1].Reason);
    }
    [Fact] public void ContextIncludesFeedbackAndNotesButRespectsSubjectAndBounds()
    {
        var state = Example();
        state.Sessions.Add(new() { SubjectId = "s", Feedback = "Praticar frações", DurationMinutes = 10, CompletedAt = Now });
        state.Sessions.Add(new() { SubjectId = "t", Feedback = "PRIVATE OTHER SUBJECT", DurationMinutes = 20, CompletedAt = Now });
        var context = StudyEngine.BuildContext(state, Now, "s");
        Assert.Contains("Praticar", context); Assert.DoesNotContain("PRIVATE OTHER SUBJECT", context);
        Assert.True(context.Length < 16000); using var json = JsonDocument.Parse(context);
    }
    [Fact] public async Task FailedMutationDoesNotOverwriteStateAndWritesAreSerialized()
    {
        var directory = NewDirectory();
        var seed = Path.Combine(directory, "input.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
        var store = new StudyStore(Path.Combine(directory, "data")); await store.LoadAsync(seed);
        var before = await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
        await Assert.ThrowsAsync<InvalidDataException>(() => store.ChangeAsync(s => s.Settings.DailyMinutes = -1));
        Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json")));
        await Task.WhenAll(Enumerable.Range(0, 15).Select(i => store.ChangeAsync(s => s.Sessions.Add(new() { Id = "session" + i, SubjectId = "s", DurationMinutes = 1 }))));
        Assert.Equal(15, store.State.Sessions.Count);
        Assert.True(File.Exists(Path.Combine(store.DirectoryPath, "state.json.previous")));
        var reopened = new StudyStore(store.DirectoryPath); await reopened.LoadAsync(seed); Assert.Equal(15, reopened.State.Sessions.Count);
    }
    [Fact] public async Task MigrationCopiesDataAndAttachmentsWithoutChangingOriginal()
    {
        var directory = NewDirectory(); var legacy = Path.Combine(directory, "legacy"); Directory.CreateDirectory(Path.Combine(legacy, "materials"));
        var state = Example(); state.Materials.Add(new() { Name = "notes.txt", StoredName = "notes.txt", Type = "txt", Size = 5 });
        var original = JsonSerializer.Serialize(state, StudyStore.JsonOptions);
        await File.WriteAllTextAsync(Path.Combine(legacy, "state.json"), original); await File.WriteAllTextAsync(Path.Combine(legacy, "materials", "notes.txt"), "hello");
        var store = new StudyStore(Path.Combine(directory, "native")); await store.LoadAsync("unused.json", legacy);
        Assert.NotNull(store.MigrationMessage); Assert.Equal("hello", await File.ReadAllTextAsync(store.MaterialPath("notes.txt")));
        await store.ChangeAsync(s => s.Settings.Name = "Alterado"); Assert.Equal(original, await File.ReadAllTextAsync(Path.Combine(legacy, "state.json")));
    }
    [Fact] public async Task CorruptExistingFileNeverSilentlyResets()
    {
        var directory = NewDirectory(); await File.WriteAllTextAsync(Path.Combine(directory, "state.json"), "broken");
        var store = new StudyStore(directory);
        await Assert.ThrowsAnyAsync<JsonException>(() => store.LoadAsync(Path.Combine(AppContext.BaseDirectory, "seed.json")));
        Assert.Equal("broken", await File.ReadAllTextAsync(Path.Combine(directory, "state.json")));
    }
    [Fact] public async Task FullBackupRestoresAttachmentsAndDetectsTampering()
    {
        var directory = NewDirectory(); var seed = Path.Combine(directory, "input.json");
        await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
        var store = new StudyStore(Path.Combine(directory, "source")); await store.LoadAsync(seed);
        var note = Path.Combine(directory, "note.txt"); await File.WriteAllTextAsync(note, "Resumo de estudo"); await store.ImportMaterialAsync(note, "s");
        var archive = Path.Combine(directory, "backup.zip"); await store.ExportArchiveAsync(archive);
        var restored = new StudyStore(Path.Combine(directory, "restored")); await restored.LoadAsync(seed); await restored.ImportArchiveAsync(archive);
        Assert.Equal("Resumo de estudo", await File.ReadAllTextAsync(restored.MaterialPath(Assert.Single(restored.State.Materials).StoredName)));
        using (var zip = System.IO.Compression.ZipFile.Open(archive, System.IO.Compression.ZipArchiveMode.Update))
        {
            zip.GetEntry("state.json")!.Delete();
            using var writer = new StreamWriter(zip.CreateEntry("state.json").Open()); writer.Write("{}");
        }
        var before = await File.ReadAllTextAsync(Path.Combine(restored.DirectoryPath, "state.json"));
        await Assert.ThrowsAsync<InvalidDataException>(() => restored.ImportArchiveAsync(archive));
        Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(restored.DirectoryPath, "state.json")));
    }
    [Theory] [InlineData("../private.txt")] [InlineData("..\\private.txt")] [InlineData("C:\\private.txt")] [InlineData("x:stream")]
    public void ImportedAttachmentCannotEscapeDataDirectory(string name)
    {
        var state = Example(); state.Materials.Add(new() { StoredName = name }); Assert.Throws<InvalidDataException>(() => StudyStore.Validate(state));
    }

    [Theory]
    [InlineData("{}")] [InlineData("null")] [InlineData("[]")] [InlineData("{\"version\":2}")] [InlineData("{\"version\":\"2\"}")]
    public async Task ArbitraryJsonCannotReplaceTheCollection(string json)
    {
        var directory = NewDirectory();
        try
        {
            var seed = Path.Combine(directory, "seed.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(directory, "data")); await store.LoadAsync(seed);
            var before = await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
            var wrong = Path.Combine(directory, "wrong.json"); await File.WriteAllTextAsync(wrong, json);
            await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportStateAsync(wrong));
            Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json")));
            Assert.Equal("q", Assert.Single(store.State.Cards).Id);
        }
        finally { Directory.Delete(directory, true); }
    }

    [Theory]
    [InlineData("programs")] [InlineData("subjects")] [InlineData("courses")] [InlineData("lessons")] [InlineData("cards")]
    [InlineData("sessions")] [InlineData("exams")] [InlineData("tasks")] [InlineData("materials")]
    public async Task RequiredCollectionsAndNullRowsCannotBeSilentlyDefaulted(string collection)
    {
        var directory = NewDirectory();
        try
        {
            var root = JsonSerializer.SerializeToNode(Example(), StudyStore.JsonOptions)!.AsObject(); root.Remove(collection);
            var path = Path.Combine(directory, "state.json"); await File.WriteAllTextAsync(path, root.ToJsonString());
            await Assert.ThrowsAsync<InvalidDataException>(() => StudyStore.ReadAsync(path));
            root[collection] = new JsonArray((JsonNode?)null); await File.WriteAllTextAsync(path, root.ToJsonString());
            await Assert.ThrowsAsync<InvalidDataException>(() => StudyStore.ReadAsync(path));
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact] public async Task MissingIdentityOrAmbiguousVersionIsRejectedWithoutSynthesizingRecords()
    {
        var directory = NewDirectory();
        try
        {
            var root = JsonSerializer.SerializeToNode(Example(), StudyStore.JsonOptions)!.AsObject(); root["cards"]![0]!.AsObject().Remove("id");
            var path = Path.Combine(directory, "state.json"); await File.WriteAllTextAsync(path, root.ToJsonString());
            await Assert.ThrowsAsync<InvalidDataException>(() => StudyStore.ReadAsync(path));
            var duplicate = JsonSerializer.Serialize(Example(), StudyStore.JsonOptions).Replace("\"version\": 2", "\"version\": 2, \"Version\": 1");
            await File.WriteAllTextAsync(path, duplicate);
            await Assert.ThrowsAsync<InvalidDataException>(() => StudyStore.ReadAsync(path));
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact] public async Task LegacyV1AndV2WithoutNativeExtensionsStillLoad()
    {
        var directory = NewDirectory();
        try
        {
            var root = JsonSerializer.SerializeToNode(Example(), StudyStore.JsonOptions)!.AsObject(); root.Remove("focus"); root.Remove("attempts");
            var path = Path.Combine(directory, "legacy.json"); await File.WriteAllTextAsync(path, root.ToJsonString());
            var v2 = await StudyStore.ReadAsync(path); Assert.Empty(v2.Attempts); Assert.Equal(0, v2.Focus.AccumulatedSeconds);
            root["version"] = 1; root.Remove("programs"); foreach (var subject in root["subjects"]!.AsArray()) subject!.AsObject().Remove("programId");
            await File.WriteAllTextAsync(path, root.ToJsonString());
            var migrated = await StudyStore.ReadAsync(path); Assert.Equal(2, migrated.Version);
            Assert.Equal("outros", Assert.Single(migrated.Programs).Id); Assert.All(migrated.Subjects, x => Assert.Equal("outros", x.ProgramId));
        }
        finally { Directory.Delete(directory, true); }
    }

    private static StudyState WithLesson()
    {
        var state = Example(); state.Courses.Add(new() { Id = "c", SubjectId = "s", Title = "Módulo" });
        state.Lessons.Add(new() { Id = "l", SubjectId = "s", CourseId = "c", Title = "Aula" }); return state;
    }
    [Fact] public void AllLessonReferencesMustBelongToTheSelectedSubject()
    {
        foreach (var change in new Action<StudyState>[] {
            s => s.Lessons[0].SubjectId = "t",
            s => { s.Cards[0].SubjectId = "t"; s.Cards[0].LessonId = "l"; },
            s => s.Sessions.Add(new() { SubjectId = "t", LessonId = "l", DurationMinutes = 1 }),
            s => s.Materials.Add(new() { SubjectId = "t", LessonId = "l", Name = "note.txt", StoredName = "note.txt", Type = "txt" }),
            s => { s.Focus.SubjectId = "t"; s.Focus.LessonId = "l"; } })
        {
            var state = WithLesson(); change(state); Assert.Throws<InvalidDataException>(() => StudyStore.Validate(state));
        }
    }
    [Fact] public void GeneralSessionsZeroMinuteReviewsAndDeletedCardHistoryRemainValid()
    {
        var state = WithLesson();
        state.Sessions.Add(new() { SubjectId = "", LessonId = "", DurationMinutes = 5 });
        state.Sessions.Add(new() { Id = "review:first:old", SubjectId = "s", LessonId = "", DurationMinutes = 0, Kind = "review" });
        state.Attempts.Add(new() { CardId = "deleted-card", SubjectId = "s", Rating = "hard" });
        state.Attempts.Add(new() { CardId = "q", SubjectId = "t", Rating = "hard" });
        state.Materials.Add(new() { Name = "note.txt", StoredName = "note.txt", Type = "txt" });
        state.Exams.Add(new() { Title = "Prova geral", Date = "2026-09-23" }); state.Tasks.Add(new() { Title = "Tarefa geral", Date = "2026-09-23" });
        state.Focus = new() { SubjectId = "", RunningSince = Now };
        StudyStore.Validate(state);
        state.Focus.IsBreak = true; StudyEngine.FinishFocus(state, Now.AddMinutes(3), "Pausa");
        Assert.Equal(2, state.Sessions.Count); Assert.False(state.Focus.IsBreak);
    }
    [Fact] public void InvalidPreferencesDatesEnumsAndNullValuesFailClearly()
    {
        foreach (var change in new Action<StudyState>[] {
            s => s.Settings.BreakMinutes = 0, s => s.Settings.Theme = "unknown", s => s.Settings.Name = null!,
            s => s.Subjects[0].Color = "green", s => s.Cards[0].Lapses = -1, s => s.Cards[0].Flag = "unknown",
            s => s.Cards[0].Source = null!, s => s.Programs[0].Name = "", s => s.Lessons.Add(null!),
            s => s.Tasks.Add(new() { Title = "Tarefa", Date = "2026-02-30" }),
            s => s.Exams.Add(new() { Title = "Prova", Date = "2026-09-23", Time = "25:99" }),
            s => s.Focus.LessonId = null!, s => s.Focus.AccumulatedSeconds = double.NaN })
        {
            var state = Example(); change(state); Assert.Throws<InvalidDataException>(() => StudyStore.Validate(state));
        }
    }

    [Fact] public async Task RestoreSnapshotSurvivesLaterSavesAndKeepsOldAttachments()
    {
        var directory = NewDirectory();
        try
        {
            var seed = Path.Combine(directory, "seed.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(directory, "data")); await store.LoadAsync(seed);
            var material = Path.Combine(directory, "note.txt"); await File.WriteAllTextAsync(material, "Anterior"); await store.ImportMaterialAsync(material, "s");
            var oldName = store.State.Materials[0].StoredName; var oldBytes = await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
            await store.ImportStateAsync(seed); await store.ChangeAsync(x => x.Settings.Name = "Depois"); await store.ChangeAsync(x => x.Settings.Name = "Mais tarde");
            var snapshot = Assert.Single(Directory.GetFiles(Path.Combine(store.DirectoryPath, "backups"), "before-restore-*.json"));
            Assert.Equal(oldBytes, await File.ReadAllTextAsync(snapshot)); Assert.Equal("Anterior", await File.ReadAllTextAsync(store.MaterialPath(oldName)));
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact] public async Task CorrectlyHashedButStructurallyInvalidArchiveCannotEraseStudies()
    {
        var directory = NewDirectory();
        try
        {
            var seed = Path.Combine(directory, "seed.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(directory, "data")); await store.LoadAsync(seed);
            var before = await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
            var path = Path.Combine(directory, "bad.zip");
            using (var archive = ZipFile.Open(path, ZipArchiveMode.Create))
            {
                var bytes = "{}"u8.ToArray(); using (var state = archive.CreateEntry("state.json").Open()) state.Write(bytes);
                using var manifest = archive.CreateEntry("ninho-native.json").Open();
                JsonSerializer.Serialize(manifest, new { version = 1, hashes = new Dictionary<string, string> { ["state.json"] = Convert.ToHexString(SHA256.HashData(bytes)) } }, StudyStore.JsonOptions);
            }
            await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportArchiveAsync(path));
            Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json")));
        }
        finally { Directory.Delete(directory, true); }
    }

    [Fact] public async Task LegacyArchiveRestoresAndBadAttachmentLeavesNoOrphans()
    {
        var directory = NewDirectory();
        try
        {
            var example = Example(); example.Materials.Add(new() { Id = "m", Name = "note.txt", StoredName = "old-note.txt", Type = "txt", SubjectId = "s", Size = 3 });
            var seed = Path.Combine(directory, "seed.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(directory, "data")); await store.LoadAsync(seed);
            var path = Path.Combine(directory, "legacy.zip"); var stateBytes = JsonSerializer.SerializeToUtf8Bytes(example, StudyStore.JsonOptions); var note = "old"u8.ToArray();
            using (var archive = ZipFile.Open(path, ZipArchiveMode.Create))
            {
                using (var state = archive.CreateEntry("state.json").Open()) state.Write(stateBytes);
                using (var file = archive.CreateEntry("materials/old-note.txt").Open()) file.Write(note);
                using var manifest = archive.CreateEntry("manifest.json").Open();
                JsonSerializer.Serialize(manifest, new { format = "NinhoBackup", version = 1, files = new[] {
                    new { path = "state.json", size = stateBytes.Length, sha256 = Convert.ToHexString(SHA256.HashData(stateBytes)).ToLowerInvariant() },
                    new { path = "materials/old-note.txt", size = note.Length, sha256 = Convert.ToHexString(SHA256.HashData(note)).ToLowerInvariant() } } }, StudyStore.JsonOptions);
            }
            await store.ImportArchiveAsync(path); var restored = Assert.Single(store.State.Materials);
            Assert.Equal("old", await File.ReadAllTextAsync(store.MaterialPath(restored.StoredName)));
            var recovery = Assert.Single(Directory.GetFiles(Path.Combine(store.DirectoryPath, "backups")));
            var recoveryBytes = await File.ReadAllTextAsync(recovery); await store.ChangeAsync(x => x.Settings.Name = "Depois"); Assert.Equal(recoveryBytes, await File.ReadAllTextAsync(recovery));
            var before = await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
            var attachments = Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials"));
            using (var archive = ZipFile.Open(path, ZipArchiveMode.Update))
            {
                archive.GetEntry("materials/old-note.txt")!.Delete(); using var wrong = archive.CreateEntry("materials/old-note.txt").Open(); wrong.Write("bad"u8);
            }
            await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportArchiveAsync(path));
            Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json")));
            Assert.Equal(attachments, Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials")));
            Assert.Equal("old", await File.ReadAllTextAsync(store.MaterialPath(restored.StoredName)));
        }
        finally { Directory.Delete(directory, true); }
    }
    [Fact] public async Task RecoveryCopyFailureStopsRestoreAndFailedImportRemovesOnlyNewCopy()
    {
        var directory = NewDirectory();
        try
        {
            var seed = Path.Combine(directory, "seed.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(directory, "data")); await store.LoadAsync(seed);
            var before = await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
            await File.WriteAllTextAsync(Path.Combine(store.DirectoryPath, "backups"), "Obstacle");
            await Assert.ThrowsAnyAsync<IOException>(() => store.ImportStateAsync(seed));
            Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json")));
            var file = Path.Combine(directory, "note.txt"); await File.WriteAllTextAsync(file, "Original");
            await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportMaterialAsync(file, "missing-subject"));
            Assert.Empty(Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials"))); Assert.Equal("Original", await File.ReadAllTextAsync(file));
        }
        finally { Directory.Delete(directory, true); }
    }
    private static string NewDirectory()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-native-tests", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory); return directory;
    }
}
