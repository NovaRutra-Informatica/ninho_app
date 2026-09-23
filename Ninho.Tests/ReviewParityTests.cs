using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public class ReviewParityTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 22, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("good", 1, 2.5, 3)]
    [InlineData("good", 4, 2.5, 10)]
    [InlineData("easy", 3, 2.5, 10)]
    [InlineData("easy", 0.01, 2.5, 4)]
    [InlineData("hard", 30, 2.5, 1)]
    public void ImportedCardsKeepTheOriginalWholeDaySchedule(string rating, double interval, double ease, double expected)
    {
        var card = new ReviewCard { Id = "q", SubjectId = "s", Question = "Q", Answer = "A", IntervalDays = interval, Ease = ease, Repetitions = 7, LastReviewedAt = Now.AddDays(-30) };
        var state = new StudyState { Cards = [card] };
        StudyEngine.Review(state, card.Id, rating, Now);
        Assert.Equal(expected, card.IntervalDays);
        Assert.Equal(Now.LocalDateTime.AddDays(expected), card.DueAt.LocalDateTime);
        Assert.Equal(8, card.Repetitions);
    }

    [Fact]
    public void ForgottenCardKeepsLifetimeRepetitionCountAndRelearnsAfterTenMinutes()
    {
        var card = new ReviewCard { Id = "q", SubjectId = "s", Repetitions = 7, IntervalDays = 30, LastReviewedAt = Now.AddDays(-30) };
        var state = new StudyState { Cards = [card] };
        StudyEngine.Review(state, card.Id, "again", Now);
        Assert.Equal(8, card.Repetitions); Assert.Equal(1, card.Lapses);
        Assert.Equal(Now.AddMinutes(10), card.DueAt);
        StudyEngine.Review(state, card.Id, "good", Now.AddMinutes(10));
        Assert.Equal(9, card.Repetitions); Assert.Equal(1, card.IntervalDays);
        Assert.Equal(2, state.Attempts.Count); Assert.Empty(state.Sessions);
    }
}
