using System.IO.Compression;
using System.Text.Json;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public sealed class DailyBackupTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "Ninho-daily-" + Guid.NewGuid().ToString("N"));
    private static readonly DateTimeOffset Now = new(2026, 9, 23, 12, 0, 0, TimeSpan.FromHours(-4));
    private string Backups => Path.Combine(root, "backups");
    private static StudyState Example() => new()
    {
        Programs = [new() { Id = "p", Name = "Meu curso" }],
        Subjects = [new() { Id = "s", ProgramId = "p", Name = "Matemática" }],
        Courses = [new() { Id = "c", SubjectId = "s", Title = "Curso" }],
        Lessons = [new() { Id = "l", SubjectId = "s", CourseId = "c", Title = "Aula", Status = "done", Notes = "Minha anotação" }],
        Cards = [new() { Id = "q", SubjectId = "s", Question = "Pergunta", Answer = "Resposta", CreatedAt = Now.AddDays(-2), DueAt = Now }],
        Profile = new() { Name = "Pessoa local", Goal = "Aprender", Plan = "Plano salvo", CompletedAt = Now },
        Sessions = [new() { Id = "session", SubjectId = "s", LessonId = "l", DurationMinutes = 15, CompletedAt = Now }],
        Attempts = [new() { Id = "attempt", CardId = "q", SubjectId = "s", Rating = "good", At = Now }],
        Materials = [new() { Id = "m", Name = "Material", StoredName = "private.pdf", SubjectId = "s", LessonId = "l", Type = "pdf", CreatedAt = Now }]
    };
    [Fact] public async Task RoundTripIncludesLearningAndSavedAnalysisButNoAttachmentsOrWeights()
    {
        var state = Example(); state.Settings.ModelPath = "C:/models/local.gguf";
        var analysis = new CoachJournal(); analysis.Observe("studies", DateOnly.FromDateTime(Now.Date), 20, true);
        var path = await new DailyBackups(Backups).SaveAsync(state, analysis, Now);
        var read = await DailyBackups.ReadAsync(path);
        Assert.Equal("Plano salvo", read.State.Profile!.Plan); Assert.Equal("Minha anotação", Assert.Single(read.State.Lessons).Notes);
        Assert.Single(read.State.Attempts); Assert.Single(read.State.Sessions); Assert.Single(read.State.Materials);
        Assert.Equal(20, Assert.Single(Assert.Single(read.Analysis!.Days).Routes).ActiveSeconds);
        using var zip = ZipFile.OpenRead(path);
        Assert.Equal(new[] { "analysis.json", "manifest.json", "state.json" }, zip.Entries.Select(e => e.FullName).Order().ToArray());
        Assert.True(new FileInfo(path).Length < JsonSerializer.SerializeToUtf8Bytes(state, StudyStore.JsonOptions).Length);
    }
    [Fact] public async Task SameDayUpdatesOneFileAndUnchangedPayloadDoesNotRewriteIt()
    {
        var writer = new DailyBackups(Backups); var state = Example();
        var path = await writer.SaveAsync(state, null, Now);
        var bytes = await File.ReadAllBytesAsync(path);
        Assert.Equal(path, await writer.SaveAsync(state, null, Now.AddHours(1)));
        Assert.Equal(bytes, await File.ReadAllBytesAsync(path));
        state.Settings.Name = "Atualizado";
        Assert.Equal(path, await writer.SaveAsync(state, null, Now.AddHours(2)));
        Assert.Single(Directory.GetFiles(Backups, "Ninho-daily-*.zip"));
        Assert.Equal("Atualizado", (await DailyBackups.ReadAsync(path)).State.Settings.Name);
    }
    [Fact] public async Task RetentionKeepsFourteenDaysAndNeverDeletesUnrelatedFiles()
    {
        Directory.CreateDirectory(Backups); var unrelated = Path.Combine(Backups, "my-backup.zip"); await File.WriteAllTextAsync(unrelated, "user file");
        var writer = new DailyBackups(Backups);
        for (var i = 0; i < 18; i++) await writer.SaveAsync(Example(), null, Now.AddDays(i));
        Assert.Equal(14, Directory.GetFiles(Backups, "Ninho-daily-*.zip").Length);
        Assert.Equal("user file", await File.ReadAllTextAsync(unrelated));
        Assert.False(File.Exists(Path.Combine(Backups, $"Ninho-daily-{Now:yyyy-MM-dd}.zip")));
    }
    [Fact] public async Task CorruptNewestFallsBackAndAutomaticRecoveryPausesTimerWithoutOverwritingExistingData()
    {
        var writer = new DailyBackups(Backups); var state = Example(); state.Focus.RunningSince = Now.AddMinutes(-2);
        await writer.SaveAsync(state, null, Now);
        var corrupted = await writer.SaveAsync(state, null, Now.AddDays(1)); await File.WriteAllTextAsync(corrupted, "broken");
        var data = Path.Combine(root, "reinstalled"); var restored = await writer.RestoreIfMissingAsync(data);
        Assert.NotNull(restored); Assert.Equal(Now, restored!.CreatedAt);
        var read = await StudyStore.ReadAsync(Path.Combine(data, "state.json"));
        Assert.Null(read.Focus.RunningSince); Assert.Equal(120, read.Focus.AccumulatedSeconds);
        var bytes = await File.ReadAllBytesAsync(Path.Combine(data, "state.json"));
        Assert.Null(await writer.RestoreIfMissingAsync(data));
        Assert.Equal(bytes, await File.ReadAllBytesAsync(Path.Combine(data, "state.json")));
    }
    [Fact] public async Task ExistingInvalidStateIsPreservedInsteadOfBeingSilentlyReplaced()
    {
        var writer = new DailyBackups(Backups); await writer.SaveAsync(Example(), null, Now);
        var data = Path.Combine(root, "data"); Directory.CreateDirectory(data); var file = Path.Combine(data, "state.json"); await File.WriteAllTextAsync(file, "invalid user state");
        Assert.Null(await writer.RestoreIfMissingAsync(data)); Assert.Equal("invalid user state", await File.ReadAllTextAsync(file));
    }
    [Fact] public async Task InvalidNewSnapshotCannotReplaceGoodDailyBackup()
    {
        var writer = new DailyBackups(Backups); var state = Example(); var path = await writer.SaveAsync(state, null, Now); var before = await File.ReadAllBytesAsync(path);
        state.Cards[0].SubjectId = "missing";
        await Assert.ThrowsAsync<InvalidDataException>(() => writer.SaveAsync(state, null, Now));
        Assert.Equal(before, await File.ReadAllBytesAsync(path));
    }
    [Fact] public async Task CorruptDailyCopiesArePreservedButRecoveryCopiesRemainBounded()
    {
        var writer = new DailyBackups(Backups); var state = Example(); var path = await writer.SaveAsync(state, null, Now);
        for (var i = 0; i < 5; i++)
        {
            await File.WriteAllTextAsync(path, "corrupt " + i);
            await writer.SaveAsync(state, null, Now.AddMinutes(i + 1));
        }
        Assert.Equal(3, Directory.GetFiles(Backups, "preserved-invalid-*.zip").Length);
        Assert.NotNull(await DailyBackups.ReadAsync(path));
    }
    [Fact] public async Task TamperingAndUnexpectedArchiveEntriesAreRejected()
    {
        var path = await new DailyBackups(Backups).SaveAsync(Example(), null, Now);
        using (var zip = ZipFile.Open(path, ZipArchiveMode.Update))
        { zip.GetEntry("state.json")!.Delete(); using var output = new StreamWriter(zip.CreateEntry("state.json").Open()); output.Write("{}"); }
        await Assert.ThrowsAsync<InvalidDataException>(() => DailyBackups.ReadAsync(path));
        using (var zip = ZipFile.Open(path, ZipArchiveMode.Update)) { zip.CreateEntry("../../other.txt"); }
        await Assert.ThrowsAsync<InvalidDataException>(() => DailyBackups.ReadAsync(path));
    }
    [Fact] public async Task OversizedExpandedStateIsRejectedBeforeExtraction()
    {
        Directory.CreateDirectory(Backups); var path = Path.Combine(Backups, "bomb.zip");
        using (var zip = ZipFile.Open(path, ZipArchiveMode.Create))
        {
            using (var writer = new StreamWriter(zip.CreateEntry("manifest.json").Open()))
                writer.Write(JsonSerializer.Serialize(new { format = "NinhoDaily", version = 1, createdAt = Now, hashes = new Dictionary<string, string> { ["state.json"] = new string('0', 64) } }));
            using var data = zip.CreateEntry("state.json", CompressionLevel.SmallestSize).Open();
            var block = new byte[1024 * 1024]; for (var i = 0; i < 33; i++) data.Write(block);
        }
        await Assert.ThrowsAsync<InvalidDataException>(() => DailyBackups.ReadAsync(path));
    }
    [Fact] public async Task MissingBackupLeavesCleanInstallAloneAndStorageFailurePreservesSource()
    {
        var writer = new DailyBackups(Backups); var data = Path.Combine(root, "data");
        Assert.Null(await writer.RestoreIfMissingAsync(data)); Assert.False(Directory.Exists(data));
        Directory.CreateDirectory(root); var blocked = Path.Combine(root, "blocked"); await File.WriteAllTextAsync(blocked, "existing file");
        await Assert.ThrowsAnyAsync<IOException>(() => new DailyBackups(blocked).SaveAsync(Example(), null, Now));
        Assert.Equal("existing file", await File.ReadAllTextAsync(blocked));
    }
    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root, true); }
}
