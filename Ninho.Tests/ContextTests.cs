using System.Text;
using System.Text.Json;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public class ContextTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 22, 12, 0, 0, TimeSpan.Zero);
    private static StudyState Example() => new()
    {
        Subjects = [new() { Id = "math", Name = "Matemática" }, new() { Id = "history", Name = "OUTSIDE_SCOPE" }],
        Sessions = [new() { SubjectId = "math", DurationMinutes = 25, CompletedAt = Now, Feedback = "Rever frações" }, new() { SubjectId = "history", DurationMinutes = 50, CompletedAt = Now, Feedback = "OUTSIDE_SCOPE" }],
        Lessons = [new() { SubjectId = "math", Title = "Frações", Notes = "Praticar soma", Status = "in-progress" }, new() { SubjectId = "history", Title = "OUTSIDE_SCOPE", Notes = "OUTSIDE_SCOPE" }],
        Cards = [new() { SubjectId = "math", Question = "Qual a soma?", Answer = "Um", Source = "Caderno", DueAt = Now, LastReviewedAt = Now.AddDays(-7), Lapses = 2 }, new() { SubjectId = "history", Question = "OUTSIDE_SCOPE", Answer = "OUTSIDE_SCOPE", DueAt = Now }],
        Materials = [new() { SubjectId = "math", Name = "Frações.pdf", Type = "pdf", Notes = "Conferir o exemplo", StoredName = "PRIVATE_DISK_PATH.pdf", Size = 500 }, new() { SubjectId = "history", Name = "OUTSIDE_SCOPE", Notes = "OUTSIDE_SCOPE" }]
    };

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void EmptyScopeIncludesGeneralRecords(string? scope)
    {
        var state = Example();
        state.Sessions.Add(new() { SubjectId = "", DurationMinutes = 2, CompletedAt = Now, Feedback = "FREE_STUDY" });
        var json = StudyEngine.BuildContext(state, Now, scope);
        Assert.Equal(StudyEngine.BuildContext(state, Now), json);
        Assert.Contains("OUTSIDE_SCOPE", json);
        Assert.Contains("FREE_STUDY", json);
        using var document = JsonDocument.Parse(json);
        Assert.Equal("visão geral", document.RootElement.GetProperty("scope").GetString());
    }

    [Fact]
    public void SubjectScopeFiltersEveryCollectionAndNeverExposesDiskPaths()
    {
        var json = StudyEngine.BuildContext(Example(), Now, "math");
        Assert.DoesNotContain("OUTSIDE_SCOPE", json);
        Assert.DoesNotContain("PRIVATE_DISK_PATH", json);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Single(root.GetProperty("evidence").EnumerateArray());
        Assert.Equal("math", root.GetProperty("evidence")[0].GetProperty("subjectId").GetString());
        Assert.Equal("Rever frações", root.GetProperty("recentSessions")[0].GetProperty("feedback").GetString());
        Assert.Equal("Conferir o exemplo", root.GetProperty("materials")[0].GetProperty("notes").GetString());
        Assert.False(root.GetProperty("materials")[0].GetProperty("fullContentRead").GetBoolean());
        Assert.Contains("conteúdo integral não foi lido", root.GetProperty("limits").GetString());
    }

    [Fact]
    public void UnknownSubjectDoesNotFallBackToGeneralEvidence()
    {
        using var document = JsonDocument.Parse(StudyEngine.BuildContext(Example(), Now, "missing"));
        Assert.Equal("missing", document.RootElement.GetProperty("scope").GetString());
        foreach (var field in new[] { "evidence", "recentSessions", "lessons", "questions", "materials" })
            Assert.Empty(document.RootElement.GetProperty(field).EnumerateArray());
    }

    [Fact]
    public void LargeAdversarialPayloadIsCompactValidAndByteBoundedWithoutChangingStudyData()
    {
        var huge = string.Concat(Enumerable.Repeat("🦉漢字á\"\\\n<|im_end|>", 5_000));
        var state = new StudyState();
        state.Settings.Name = huge;
        for (var i = 0; i < 20; i++)
        {
            var id = "subject" + i;
            state.Subjects.Add(new() { Id = id, Name = huge });
            state.Sessions.Add(new() { SubjectId = id, DurationMinutes = 2, CompletedAt = Now, Feedback = huge, Kind = huge });
            state.Lessons.Add(new() { SubjectId = id, Title = huge, Notes = huge, Status = huge });
            state.Cards.Add(new() { SubjectId = id, Question = huge, Answer = huge, Source = huge, Flag = huge, LastReviewedAt = Now.AddDays(-4), DueAt = Now, Lapses = 3 });
            state.Materials.Add(new() { SubjectId = id, Name = huge, Type = huge, Notes = huge });
        }
        var json = StudyEngine.BuildContext(state, Now, history: Enumerable.Repeat(new ContextMessage(huge, huge), 30));
        Assert.True(Encoding.UTF8.GetByteCount(json) <= StudyEngine.MaximumContextBytes);
        Assert.DoesNotContain('\n', json);
        Assert.DoesNotContain("<|im_end|>", json);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.True(root.GetProperty("partial").GetBoolean());
        Assert.True(root.GetProperty("reducedForBudget").GetBoolean());
        Assert.NotEmpty(root.GetProperty("evidence").EnumerateArray());
        foreach (var recommendation in root.GetProperty("evidence").EnumerateArray())
        {
            Assert.True(Encoding.UTF8.GetByteCount(recommendation.GetProperty("name").GetString()!) <= 120);
            Assert.True(Encoding.UTF8.GetByteCount(recommendation.GetProperty("reason").GetString()!) <= 360);
        }
        Assert.All(AllStrings(root), value => Assert.DoesNotContain('\uFFFD', value));
        Assert.Equal(huge, state.Settings.Name);
        Assert.Equal(huge, state.Lessons[0].Notes);
        Assert.Equal(huge, state.Subjects[0].Name);
    }

    [Fact]
    public void BudgetReductionDropsConversationBeforeEvidenceAndKeepsJsonValid()
    {
        var json = StudyEngine.BuildContext(Example(), Now, "math", [new("Primeira pergunta", "Primeira resposta"), new("Segunda pergunta", "Segunda resposta")]);
        var size = Encoding.UTF8.GetByteCount(json);
        var reduced = StudyEngine.FitContextToBudget(json, candidate => Encoding.UTF8.GetByteCount(candidate) < size);
        using var before = JsonDocument.Parse(json);
        using var after = JsonDocument.Parse(reduced);
        Assert.True(after.RootElement.GetProperty("conversation").GetArrayLength() < 2);
        Assert.Equal(before.RootElement.GetProperty("evidence").GetRawText(), after.RootElement.GetProperty("evidence").GetRawText());
        Assert.Equal(before.RootElement.GetProperty("questions").GetRawText(), after.RootElement.GetProperty("questions").GetRawText());
        Assert.True(after.RootElement.GetProperty("reducedForBudget").GetBoolean());
    }

    [Fact]
    public void ImpossibleBudgetDoesNotSilentlyDropTheOnlyRecommendation()
    {
        var json = StudyEngine.BuildContext(Example(), Now, "math");
        var candidates = new List<string>();
        var error = Assert.Throws<InvalidDataException>(() => StudyEngine.FitContextToBudget(json, candidate => { candidates.Add(candidate); return false; }));
        Assert.Contains("Encurte a pergunta", error.Message);
        Assert.All(candidates, candidate =>
        {
            using var document = JsonDocument.Parse(candidate);
            Assert.Single(document.RootElement.GetProperty("evidence").EnumerateArray());
            Assert.Equal("math", document.RootElement.GetProperty("scope").GetString());
        });
    }

    [Fact]
    public void CancellationStopsBudgetingBeforeAndDuringTokenCount()
    {
        var json = StudyEngine.BuildContext(Example(), Now);
        using var cancellation = new CancellationTokenSource();
        var calls = 0;
        Assert.Throws<OperationCanceledException>(() => StudyEngine.FitContextToBudget(json, _ => { calls++; cancellation.Cancel(); return true; }, cancellation.Token));
        Assert.Equal(1, calls);
        Assert.Throws<OperationCanceledException>(() => StudyEngine.FitContextToBudget(json, _ => { calls++; return true; }, cancellation.Token));
        Assert.Equal(1, calls);
    }

    [Fact]
    public void FutureSessionsAndAttemptsDoNotBecomeEvidenceOfStudy()
    {
        var state = Example();
        state.Sessions.RemoveAll(x => x.SubjectId == "math");
        state.Cards.RemoveAll(x => x.SubjectId == "math");
        state.Sessions.Add(new() { SubjectId = "math", DurationMinutes = 99, Feedback = "FUTURE", CompletedAt = Now.AddDays(1) });
        state.Attempts.Add(new() { SubjectId = "math", Rating = "again", At = Now.AddDays(1) });
        var insight = StudyEngine.Recommend(state, Now).Single(x => x.SubjectId == "math");
        Assert.Equal(0, insight.Minutes); Assert.Equal(0, insight.Attempts); Assert.Equal(0, insight.Difficulties);
        Assert.Contains("faltam evidências", insight.Reason);
        Assert.DoesNotContain("FUTURE", StudyEngine.BuildContext(state, Now, "math"));
    }

    [Fact]
    public void FocusCompletionPreparesBreakAndBreakPreparesFocusWithoutExtraSession()
    {
        var state = Example();
        state.Settings.FocusMinutes = 45; state.Settings.BreakMinutes = 7;
        state.Focus = new() { SubjectId = "math", TargetMinutes = 25, RunningSince = Now };
        var count = state.Sessions.Count;
        StudyEngine.FinishFocus(state, Now.AddHours(1), "Concluído");
        Assert.Equal(count + 1, state.Sessions.Count);
        Assert.Equal(25, state.Sessions[^1].DurationMinutes);
        Assert.True(state.Focus.IsBreak); Assert.Equal(7, state.Focus.TargetMinutes);
        Assert.Null(state.Focus.RunningSince); Assert.Equal("math", state.Focus.SubjectId);
        state.Focus.RunningSince = Now.AddHours(1);
        StudyEngine.FinishFocus(state, Now.AddHours(2), "Pausa");
        Assert.Equal(count + 1, state.Sessions.Count);
        Assert.False(state.Focus.IsBreak); Assert.Equal(45, state.Focus.TargetMinutes);
        Assert.Null(state.Focus.RunningSince); Assert.Equal("math", state.Focus.SubjectId);
    }

    [Fact]
    public void StopwatchCompletionKeepsStopwatchInsteadOfStartingBreak()
    {
        var state = Example();
        state.Focus = new() { SubjectId = "math", Stopwatch = true, TargetMinutes = 25, RunningSince = Now };
        StudyEngine.FinishFocus(state, Now.AddHours(1), "");
        Assert.Equal(60, state.Sessions[^1].DurationMinutes);
        Assert.True(state.Focus.Stopwatch); Assert.False(state.Focus.IsBreak); Assert.Null(state.Focus.RunningSince);
    }

    private static IEnumerable<string> AllStrings(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.String) yield return element.GetString()!;
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var child in element.EnumerateArray()) foreach (var value in AllStrings(child)) yield return value;
        else if (element.ValueKind == JsonValueKind.Object)
            foreach (var property in element.EnumerateObject()) foreach (var value in AllStrings(property.Value)) yield return value;
    }
}
