using System.Diagnostics;
using System.Text.Json;
using Ninho.Core;
using Xunit;
using Xunit.Abstractions;

namespace Ninho.Tests;

public sealed class PerformanceLoadTests(ITestOutputHelper output)
{
    [Theory]
    [InlineData(71)]
    [InlineData(1000)]
    [InlineData(5000)]
    public async Task LargeCollectionRemainsConsistentThroughAnalysisSaveAndRecovery(int count)
    {
        var now = new DateTimeOffset(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);
        var state = new StudyState { Profile = new StudentProfile { Name = "Carga sintética", Goal = "Validar desempenho", CompletedAt = now } };
        state.Programs.Add(new StudyProgram { Id = "load-program", Name = "Carga" });
        for (var i = 0; i < Math.Min(200, count); i++)
        {
            var id = $"subject-{i}";
            state.Subjects.Add(new Subject { Id = id, ProgramId = "load-program", Name = $"Matéria {i}" });
            state.Courses.Add(new Course { Id = $"course-{i}", SubjectId = id, Title = "Módulo" });
        }
        for (var i = 0; i < count; i++)
        {
            var subject = i % state.Subjects.Count;
            state.Lessons.Add(new Lesson { Id = $"lesson-{i}", SubjectId = $"subject-{subject}", CourseId = $"course-{subject}", Title = $"Aula {i}", Order = i, Notes = new string('a', 256) });
            state.Cards.Add(new ReviewCard { Id = $"card-{i}", SubjectId = $"subject-{subject}", LessonId = $"lesson-{i}", Question = $"Pergunta {i}", Answer = new string('b', 256), LastReviewedAt = now.AddDays(-2), DueAt = now.AddDays(-1), CreatedAt = now.AddDays(-10) });
            state.Materials.Add(new Material { Id = $"material-{i}", SubjectId = $"subject-{subject}", LessonId = $"lesson-{i}", Name = $"Material {i}.txt", StoredName = $"material-{i}.txt", Type = "txt", Size = 128 });
            for (var j = 0; j < 4; j++)
            {
                state.Sessions.Add(new StudySession { Id = $"session-{i}-{j}", SubjectId = $"subject-{subject}", LessonId = $"lesson-{i}", DurationMinutes = 25, CompletedAt = now.AddHours(-(i * 4 + j)) });
                state.Attempts.Add(new QuestionAttempt { Id = $"attempt-{i}-{j}", CardId = $"card-{i}", SubjectId = $"subject-{subject}", Rating = "good", At = now.AddHours(-(i * 4 + j)) });
            }
        }
        StudyStore.Validate(state);
        var directory = Path.Combine(Path.GetTempPath(), "Ninho-load-core-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var path = Path.Combine(directory, "state.json");
            await File.WriteAllTextAsync(path, JsonSerializer.Serialize(state, StudyStore.JsonOptions));
            var store = new StudyStore(directory);
            var samples = new List<double>();
            for (var repeat = 0; repeat < 6; repeat++)
            {
                var watch = Stopwatch.StartNew();
                Assert.Equal(count, StudyEngine.DueCards(state, now).Count());
                Assert.Equal(state.Subjects.Count, StudyEngine.Recommend(state, now).Count);
                Assert.NotEmpty(AdaptiveCoach.Analyze(state, now));
                var elapsed = watch.Elapsed.TotalMilliseconds;
                if (repeat > 0) samples.Add(elapsed);
            }
            var load = Stopwatch.StartNew();
            await store.LoadAsync(path);
            var loadMs = load.Elapsed.TotalMilliseconds;
            var save = Stopwatch.StartNew();
            await store.ChangeAsync(s => s.Lessons[^1].Notes = "Atualização persistida");
            var saveMs = save.Elapsed.TotalMilliseconds;
            var recovered = await StudyStore.ReadAsync(path);
            Assert.Equal(count, recovered.Cards.Count);
            Assert.Equal(count * 4, recovered.Sessions.Count);
            Assert.Equal(count * 4, recovered.Attempts.Count);
            Assert.Equal("Atualização persistida", recovered.Lessons[^1].Notes);
            Assert.True(File.Exists(path + ".previous"));
            output.WriteLine(JsonSerializer.Serialize(new { count, subjects = state.Subjects.Count, sessions = state.Sessions.Count, bytes = new FileInfo(path).Length, engineMedianMs = samples.Order().ElementAt(2), engineMaxMs = samples.Max(), loadMs, saveMs }));
        }
        finally { Directory.Delete(directory, true); }
    }
}
