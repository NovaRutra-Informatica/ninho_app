namespace Ninho.Core;

public sealed record DailyBackupWriteResult(string LocalPath, string? ExternalPath = null, string ExternalError = "");

public sealed class DailyBackupCoordinator(DailyBackups local, DailyBackups? external = null)
{
    public DailyBackups Local { get; } = local;
    public DailyBackups? External { get; } = external;

    public async Task<DailyBackupWriteResult> SaveAsync(StudyState state, CoachJournal? analysis, DateTimeOffset now)
    {
        var path = await Local.SaveAsync(state, analysis, now);
        if (External == null) return new(path);
        try { return new(path, await External.SaveAsync(state, analysis, now)); }
        catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException or System.Text.Json.JsonException)
        { return new(path, ExternalError: error.Message); }
    }

    public async Task<DailyBackupSnapshot?> RestoreIfMissingAsync(string dataDirectory)
    {
        if (File.Exists(Path.Combine(dataDirectory, "state.json"))) return null;
        if (External != null) await External.RequireInitialRecoveryAsync();
        var snapshot = await Local.RestoreIfMissingAsync(dataDirectory);
        if (snapshot != null || External == null) return snapshot;
        return await External.RestoreIfMissingAsync(dataDirectory);
    }
}
