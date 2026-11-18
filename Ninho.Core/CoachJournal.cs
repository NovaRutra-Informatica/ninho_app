using System.Text.Json;

namespace Ninho.Core;

public sealed class CoachRouteUsage
{
    public string Route { get; set; } = "today";
    public int Visits { get; set; }
    public double ActiveSeconds { get; set; }
}
public sealed class CoachDayUsage
{
    public DateOnly Date { get; set; }
    public List<CoachRouteUsage> Routes { get; set; } = [];
    public int Pauses { get; set; }
}
public sealed class CoachJournal
{
    public int Version { get; set; } = 1;
    public bool Enabled { get; set; } = true;
    public List<CoachDayUsage> Days { get; set; } = [];
    public static readonly string[] AllowedRoutes = ["today", "studies", "reviews", "materials", "agenda", "progress", "mentor", "timer", "profile", "settings"];

    public void Observe(string route, DateOnly day, double seconds, bool visit = false, bool pause = false)
    {
        if (!Enabled || !AllowedRoutes.Contains(route) || !double.IsFinite(seconds) || seconds < 0) return;
        Days.RemoveAll(d => d.Date < day.AddDays(-89) || d.Date > day);
        var bucket = Days.FirstOrDefault(d => d.Date == day);
        if (bucket == null) { bucket = new CoachDayUsage { Date = day }; Days.Add(bucket); }
        var screen = bucket.Routes.FirstOrDefault(r => r.Route == route);
        if (screen == null) { screen = new CoachRouteUsage { Route = route }; bucket.Routes.Add(screen); }
        screen.ActiveSeconds = Math.Min(86400, screen.ActiveSeconds + Math.Min(60, seconds));
        if (visit) screen.Visits = Math.Min(10000, screen.Visits + 1);
        if (pause) bucket.Pauses = Math.Min(10000, bucket.Pauses + 1);
    }
    public CoachJournal Snapshot() => new() { Enabled = Enabled, Days = Days.Select(d => new CoachDayUsage { Date = d.Date, Pauses = d.Pauses, Routes = d.Routes.Select(r => new CoachRouteUsage { Route = r.Route, Visits = r.Visits, ActiveSeconds = r.ActiveSeconds }).ToList() }).ToList() };
    public void Validate()
    {
        if (Version != 1 || Days == null || Days.Count > 90 || Days.Select(d => d?.Date).Distinct().Count() != Days.Count) throw new InvalidDataException("Histórico local de navegação inválido.");
        foreach (var day in Days)
            if (day == null || day.Pauses is < 0 or > 10000 || day.Routes == null || day.Routes.Count > AllowedRoutes.Length || day.Routes.Select(r => r?.Route).Distinct().Count() != day.Routes.Count ||
                day.Routes.Any(r => r == null || !AllowedRoutes.Contains(r.Route) || r.Visits is < 0 or > 10000 || !double.IsFinite(r.ActiveSeconds) || r.ActiveSeconds is < 0 or > 86400))
                throw new InvalidDataException("Histórico local de navegação inválido.");
    }
}

public sealed class CoachJournalStore(string path)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    public async Task<CoachJournal> LoadAsync()
    {
        if (!File.Exists(path)) return new();
        if (new FileInfo(path).Length > 512 * 1024) throw new InvalidDataException("Histórico local de navegação grande demais.");
        var result = JsonSerializer.Deserialize<CoachJournal>(await File.ReadAllTextAsync(path), StudyStore.JsonOptions) ?? throw new InvalidDataException("Histórico vazio.");
        result.Validate(); return result;
    }
    public async Task SaveAsync(CoachJournal snapshot)
    {
        snapshot.Validate(); await gate.WaitAsync();
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temporary = path + ".tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(snapshot, StudyStore.JsonOptions));
            File.Move(temporary, path, true);
        }
        finally { gate.Release(); }
    }
}
