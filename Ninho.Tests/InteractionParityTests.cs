using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public sealed class InteractionParityTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);
    [Fact] public void YesterdayMaintainsCountButDoesNotActivateTodaysFlame()
    {
        var state = new StudyState { Sessions = [new() { DurationMinutes = 10, CompletedAt = Now.AddDays(-1) }] };
        var days = StudyStreak.ActiveDays(state, Now);
        var today = DateOnly.FromDateTime(Now.LocalDateTime);
        Assert.Equal(1, StudyStreak.Count(days, today)); Assert.DoesNotContain(today, days);
        state.Attempts.Add(new() { At = Now });
        days = StudyStreak.ActiveDays(state, Now);
        Assert.Equal(2, StudyStreak.Count(days, today)); Assert.Contains(today, days);
    }
    [Fact] public void OpeningAppRunningTimerAndFutureRecordsDoNotMarkToday()
    {
        var state = new StudyState
        {
            Focus = new() { RunningSince = Now.AddMinutes(-10) },
            Sessions = [new() { DurationMinutes = 0, CompletedAt = Now }, new() { DurationMinutes = 10, CompletedAt = Now.AddDays(1) }],
            Attempts = [new() { At = Now.AddDays(1) }]
        };
        var days = StudyStreak.ActiveDays(state, Now);
        Assert.Empty(days); Assert.Equal(0, StudyStreak.Count(days, DateOnly.FromDateTime(Now.LocalDateTime)));
    }
    [Fact] public void NavigationSoundIsGentleSeventyMillisecondPcm()
    {
        var data = NavigationSound.WaveData();
        Assert.Equal("RIFF", System.Text.Encoding.ASCII.GetString(data, 0, 4));
        Assert.Equal(22050, BitConverter.ToInt32(data, 24));
        Assert.Equal(44 + (int)(.07 * 22050) * 2, data.Length);
        var samples = Enumerable.Range(0, (data.Length - 44) / 2).Select(i => BitConverter.ToInt16(data, 44 + i * 2)).ToArray();
        Assert.Equal(0, samples[0]); Assert.Equal(0, samples[^1]);
        Assert.InRange(samples.Max(x => Math.Abs((int)x)), 2500, 3700);
        var crossings = samples.Zip(samples.Skip(1)).Count(pair => pair.First <= 0 && pair.Second > 0);
        Assert.InRange(crossings / .07, 700, 740);
    }
    [Fact] public void NavigationGateSuppressesRapidOverlappingInactiveAndDisabledCues()
    {
        var gate = new NavigationSoundGate();
        Assert.False(gate.TryPlay(TimeSpan.Zero, false, true, false));
        Assert.False(gate.TryPlay(TimeSpan.Zero, true, false, false));
        Assert.False(gate.TryPlay(TimeSpan.Zero, true, true, true));
        Assert.True(gate.TryPlay(TimeSpan.Zero, true, true, false));
        Assert.False(gate.TryPlay(TimeSpan.FromMilliseconds(139), true, true, false));
        Assert.True(gate.TryPlay(TimeSpan.FromMilliseconds(140), true, true, false));
        Assert.False(gate.TryPlay(TimeSpan.FromSeconds(1), true, true, true));
    }
}
