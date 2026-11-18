namespace Ninho.Core;

public static class StudyStreak
{
    public static HashSet<DateOnly> ActiveDays(StudyState state, DateTimeOffset now) => state.Sessions
        .Where(x => x.CompletedAt <= now && (x.DurationMinutes > 0 || x.Kind == "review"))
        .Select(x => DateOnly.FromDateTime(x.CompletedAt.LocalDateTime))
        .Concat(state.Attempts.Where(x => x.At <= now).Select(x => DateOnly.FromDateTime(x.At.LocalDateTime))).ToHashSet();

    public static int Count(IReadOnlySet<DateOnly> days, DateOnly today)
    {
        var day = days.Contains(today) ? today : today.AddDays(-1);
        var count = 0;
        while (days.Contains(day)) { count++; if (day == DateOnly.MinValue) break; day = day.AddDays(-1); }
        return count;
    }
}
