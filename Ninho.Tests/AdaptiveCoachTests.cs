using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public class AdaptiveCoachTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);
    [Fact] public void NewStudentGetsAnHonestStartingPointWithoutModel()
    {
        var state = new StudyState { Profile = new StudentProfile { Goal = "Ler espanhol", DailyMinutes = 10, SessionMinutes = 25 } };
        var insight = Assert.Single(AdaptiveCoach.Analyze(state, Now));
        Assert.Equal("starting", insight.Id); Assert.Contains("10 minutos", insight.Message);
        Assert.Contains("Ler espanhol", insight.Evidence);
        Assert.DoesNotContain("25 minutos", AdaptiveCoach.InitialPlan(state.Profile));
    }
    [Fact] public void PriorUpdatesWithEvidenceAndNeverBecomesCertain()
    {
        var zero = AdaptiveCoach.Estimate(0, 0); var some = AdaptiveCoach.Estimate(3, 10); var all = AdaptiveCoach.Estimate(10, 10);
        Assert.Equal(.5, zero.Mean); Assert.InRange(some.Mean, .3, .4); Assert.InRange(all.Mean, .9, .99);
        Assert.True(some.Upper - some.Lower < zero.Upper - zero.Lower);
        Assert.Throws<ArgumentOutOfRangeException>(() => AdaptiveCoach.Estimate(11, 10));
    }
    [Fact] public void NavigationNeverCountsAsStudyOrProofOfInattention()
    {
        var journal = new CoachJournal(); var day = DateOnly.FromDateTime(Now.DateTime);
        for (var i = 0; i < 20; i++) journal.Observe(i % 3 == 0 ? "reviews" : "studies", day, 60, true);
        var state = new StudyState(); var insights = AdaptiveCoach.Analyze(state, Now, journal);
        Assert.Contains(insights, i => i.Id == "usage"); Assert.Contains(insights, i => i.Id == "starting");
        Assert.DoesNotContain(insights, i => i.Id is "goal" or "consistency" or "rhythm"); Assert.Empty(state.Sessions);
    }
    [Fact] public void FutureAndBreakSessionsCannotProducePatterns()
    {
        var state = new StudyState();
        for (var i = 0; i < 10; i++) { state.Sessions.Add(new() { CompletedAt = Now.AddDays(i + 1), DurationMinutes = 90 }); state.Sessions.Add(new() { CompletedAt = Now.AddDays(-i), DurationMinutes = 90, Kind = "break" }); }
        Assert.Single(AdaptiveCoach.Analyze(state, Now));
    }
    [Fact] public void PatternRequiresSeveralDaysAndDescribesCompletionTime()
    {
        var state = new StudyState();
        for (var i = 1; i <= 7; i++) state.Sessions.Add(new() { CompletedAt = Now.AddDays(-i).AddHours(7), DurationMinutes = 20 });
        Assert.Contains(AdaptiveCoach.Analyze(state, Now), i => i.Id == "rhythm" && i.Evidence.Contains("terminaram"));
        state.Sessions.ForEach(s => s.CompletedAt = Now.AddHours(-1));
        Assert.DoesNotContain(AdaptiveCoach.Analyze(state, Now), i => i.Id is "rhythm" or "consistency");
    }
    [Fact] public void SelfAssessmentIsNeverPresentedAsAnAccuracyScore()
    {
        var state = new StudyState { Attempts = Enumerable.Range(0, 6).Select(i => new QuestionAttempt { At = Now.AddDays(-1), Rating = i < 4 ? "hard" : "good" }).ToList() };
        var insight = Assert.Single(AdaptiveCoach.Analyze(state, Now), i => i.Id == "difficulty");
        Assert.Contains("4 de 6", insight.Evidence); Assert.Contains("Autoavaliação", insight.Evidence);
    }
    [Fact] public void JournalBoundsRetentionAndRejectsArbitraryRoutes()
    {
        var journal = new CoachJournal(); var day = new DateOnly(2026, 9, 23);
        for (var i = 0; i < 100; i++) journal.Observe("today", day.AddDays(i), 999, true);
        journal.Observe("another-app", day.AddDays(100), 12);
        journal.Validate(); Assert.Equal(90, journal.Days.Count); Assert.All(journal.Days, d => Assert.Equal(60, Assert.Single(d.Routes).ActiveSeconds));
    }
    [Fact] public void DisabledObservationKeepsAllStudySuggestionsWithoutCollectingVisits()
    {
        var journal = new CoachJournal { Enabled = false };
        journal.Observe("studies", new DateOnly(2026, 9, 23), 30, true);
        Assert.Empty(journal.Days); Assert.False(journal.Snapshot().Enabled);
        Assert.Contains(AdaptiveCoach.Analyze(new StudyState(), Now, journal), i => i.Id == "starting");
    }
    [Fact] public async Task JournalSurvivesReloadWithoutChangingStudyState()
    {
        var directory = Path.Combine(Path.GetTempPath(), "ninho-journal-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new CoachJournalStore(Path.Combine(directory, "usage.json")); var journal = new CoachJournal();
            journal.Observe("timer", new DateOnly(2026, 9, 23), 12, true, true); await store.SaveAsync(journal.Snapshot());
            var copy = await store.LoadAsync(); Assert.Equal(1, Assert.Single(copy.Days).Pauses); Assert.Equal(12, copy.Days[0].Routes[0].ActiveSeconds);
            await File.WriteAllTextAsync(Path.Combine(directory, "usage.json"), "{\"version\":1,\"days\":null}");
            await Assert.ThrowsAsync<InvalidDataException>(() => store.LoadAsync());
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
    [Theory] [InlineData(10, "", "goal", 1)] [InlineData(10, "Ana", "", 2)] [InlineData(999, "Ana", "goal", 11)]
    public void WelcomeCannotResumePastMissingIdentity(int saved, string name, string goal, int expected) => Assert.Equal(expected, WelcomeJourney.Resume(saved, new StudentProfile { Name = name, Goal = goal }));
}
