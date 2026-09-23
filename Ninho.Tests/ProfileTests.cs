using System.Text.Json;
using System.Text.Json.Nodes;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public sealed class ProfileTests
{
    [Fact]
    public void CanonicalProfileSurvivesScopeAndAggressiveHistoryReduction()
    {
        var state = new StudyState { Profile = new StudentProfile { Name = "Ana", Goal = "Aprender álgebra", Routine = "Trabalho de manhã", AvailableDays = ["mon", "wed"], Challenges = "Relembrar fórmulas", Revision = 3, Plan = "GENERATED_PLAN_MUST_NOT_BE_EVIDENCE" } };
        var context = StudyEngine.BuildContext(state, DateTimeOffset.Now, "another-subject", [new ContextMessage(new string('a', 350), new string('b', 650))]);
        var original = JsonNode.Parse(context)!;
        var reduced = StudyEngine.FitContextToBudget(context, json => JsonNode.Parse(json)!["conversation"]!.AsArray().Count == 0);
        var result = JsonNode.Parse(reduced)!;
        Assert.True(JsonNode.DeepEquals(original["profile"], result["profile"]));
        Assert.Equal("Aprender álgebra", result["profile"]!["goal"]!.GetValue<string>());
        Assert.Empty(result["conversation"]!.AsArray());
        Assert.DoesNotContain("GENERATED_PLAN_MUST_NOT_BE_EVIDENCE", context);
    }

    [Fact]
    public void ImpossibleBudgetFailsRatherThanSilentlyDiscardingProfile()
    {
        var state = new StudyState { Profile = new StudentProfile { Goal = "A goal that must always be available" } };
        var error = Assert.Throws<InvalidDataException>(() => StudyEngine.FitContextToBudget(StudyEngine.BuildContext(state, DateTimeOffset.Now), _ => false));
        Assert.Contains("perfil foi preservado", error.Message);
        Assert.Equal("A goal that must always be available", state.Profile.Goal);
    }

    [Fact]
    public async Task ProfileAndTutorialsSurviveReloadAndJsonBackup()
    {
        var folder = Path.Combine(Path.GetTempPath(), "ninho-profile-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            var seed = Path.Combine(folder, "seed.json"); await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(new StudyState(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(folder, "data")); await store.LoadAsync(seed);
            Assert.NotNull(store.State.Profile); Assert.Null(store.State.Profile.CompletedAt);
            await store.ChangeAsync(s => { s.Profile!.Name = "Ana"; s.Profile.Goal = "Ler com constância"; s.Profile.CompletedAt = DateTimeOffset.Now; s.Profile.AvailableDays = ["tue", "sat"]; s.Profile.TutorialsSeen = ["today", "reviews"]; s.Profile.Plan = "Plano salvo"; s.Profile.PlanStatus = "ready"; s.Profile.Revision = s.Profile.PlanProfileRevision = 2; });
            var backup = Path.Combine(folder, "backup.json"); await store.ExportAsync(backup);
            var copy = await StudyStore.ReadAsync(backup);
            var restarted = new StudyStore(Path.Combine(folder, "data")); await restarted.LoadAsync(seed);
            Assert.Equal(JsonSerializer.Serialize(copy.Profile), JsonSerializer.Serialize(restarted.State.Profile));
            Assert.Equal("Ler com constância", restarted.State.Profile!.Goal);
            Assert.Equal(["today", "reviews"], restarted.State.Profile.TutorialsSeen);
        }
        finally { Directory.Delete(folder, true); }
    }

    [Theory]
    [InlineData("oversize")]
    [InlineData("null-answer")]
    [InlineData("bad-day")]
    [InlineData("duplicate-day")]
    [InlineData("bad-status")]
    [InlineData("bad-time")]
    public void RejectsMalformedProfileBackups(string input)
    {
        var profile = new StudentProfile();
        switch (input)
        {
            case "oversize": profile.Goal = new string('x', 401); break;
            case "null-answer": profile.Routine = null!; break;
            case "bad-day": profile.AvailableDays = ["monday"]; break;
            case "duplicate-day": profile.AvailableDays = ["mon", "mon"]; break;
            case "bad-status": profile.PlanStatus = "claimed-complete"; break;
            case "bad-time": profile.DailyMinutes = 0; break;
        }
        Assert.Throws<InvalidDataException>(() => StudyStore.Validate(new StudyState { Profile = profile }));
    }

    [Fact]
    public void LegacyStateWithoutProfileRemainsValid()
    {
        var old = JsonSerializer.Deserialize<StudyState>("{\"version\":2}", StudyStore.JsonOptions)!;
        StudyStore.Validate(old);
        Assert.Null(old.Profile);
    }
}
