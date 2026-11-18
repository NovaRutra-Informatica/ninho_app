using System.Text.Json;
using System.Text.Json.Serialization;

namespace Ninho.Core;

// The v2 shape intentionally matches the existing desktop backup format.
public abstract class Extensible
{
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; set; }
}
public sealed class StudyState : Extensible
{
    public int Version { get; set; } = 2;
    public Preferences Settings { get; set; } = new();
    public StudentProfile? Profile { get; set; }
    public List<StudyProgram> Programs { get; set; } = [];
    public List<Subject> Subjects { get; set; } = [];
    public List<Course> Courses { get; set; } = [];
    public List<Lesson> Lessons { get; set; } = [];
    public List<ReviewCard> Cards { get; set; } = [];
    public List<StudySession> Sessions { get; set; } = [];
    public List<Exam> Exams { get; set; } = [];
    public List<StudyTask> Tasks { get; set; } = [];
    public List<Material> Materials { get; set; } = [];
    public List<QuestionAttempt> Attempts { get; set; } = [];
    public FocusState Focus { get; set; } = new();
}
// Answers are the durable source of personalization. Generated plans never replace them.
public sealed class StudentProfile : Extensible
{
    public string Name { get; set; } = "";
    public string Goal { get; set; } = "";
    public string Motivation { get; set; } = "";
    public string TargetDate { get; set; } = "";
    public string Subjects { get; set; } = "";
    public string Level { get; set; } = "";
    public string Routine { get; set; } = "";
    public List<string> AvailableDays { get; set; } = [];
    public string PreferredTime { get; set; } = "";
    public int DailyMinutes { get; set; } = 30;
    public int SessionMinutes { get; set; } = 25;
    public string Challenges { get; set; } = "";
    public string Preferences { get; set; } = "";
    public string Accessibility { get; set; } = "";
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public int Revision { get; set; }
    public string Plan { get; set; } = "";
    public string PlanStatus { get; set; } = "none";
    public int PlanProfileRevision { get; set; }
    public List<string> TutorialsSeen { get; set; } = [];
}
public sealed class Preferences : Extensible
{
    public string Name { get; set; } = "Estudante";
    public int DailyMinutes { get; set; } = 30;
    public int NewCardsPerDay { get; set; } = 5;
    public int FocusMinutes { get; set; } = 25;
    public int BreakMinutes { get; set; } = 5;
    public string Theme { get; set; } = "system";
    public bool Sound { get; set; }
    public bool ReducedMotion { get; set; }
    public string ModelPath { get; set; } = "";
}
public sealed class StudyProgram : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Track { get; set; } = "pessoal";
    public string Color { get; set; } = "#527969";
    public string Description { get; set; } = "";
}
public sealed class Subject : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ProgramId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Track { get; set; } = "pessoal";
    public string Color { get; set; } = "#527969";
}
public sealed class Course : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SubjectId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Url { get; set; } = "";
}
public sealed class Lesson : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string CourseId { get; set; } = "";
    public string SubjectId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Url { get; set; } = "";
    public int Order { get; set; }
    public string Status { get; set; } = "not-started";
    public DateTimeOffset? UpdatedAt { get; set; }
    public string Notes { get; set; } = "";
}
public sealed class ReviewCard : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SubjectId { get; set; } = "";
    public string? LessonId { get; set; }
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public string Source { get; set; } = "";
    public string SourceUrl { get; set; } = "";
    public DateTimeOffset DueAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastReviewedAt { get; set; }
    public double IntervalDays { get; set; }
    public double Ease { get; set; } = 2.5;
    public int Repetitions { get; set; }
    public int Lapses { get; set; }
    public string Flag { get; set; } = "none";
    public bool Suspended { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class StudySession : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SubjectId { get; set; } = "";
    public string LessonId { get; set; } = "";
    public double DurationMinutes { get; set; }
    public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
    public string Kind { get; set; } = "focus";
    public string Feedback { get; set; } = "";
}
public sealed class Exam : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "";
    public string SubjectId { get; set; } = "";
    public string Date { get; set; } = "";
    public string Time { get; set; } = "";
    public string Location { get; set; } = "";
    public string Notes { get; set; } = "";
    public bool Completed { get; set; }
}
public sealed class StudyTask : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "";
    public string Date { get; set; } = "";
    public string SubjectId { get; set; } = "";
    public bool Completed { get; set; }
}
public sealed class Material : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string StoredName { get; set; } = "";
    public string Type { get; set; } = "";
    public long Size { get; set; }
    public string SubjectId { get; set; } = "";
    public string LessonId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string Notes { get; set; } = "";
}
public sealed class QuestionAttempt : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string CardId { get; set; } = "";
    public string SubjectId { get; set; } = "";
    public string Rating { get; set; } = "good";
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class FocusState : Extensible
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SubjectId { get; set; } = "";
    public string LessonId { get; set; } = "";
    public int TargetMinutes { get; set; } = 25;
    public bool Stopwatch { get; set; }
    public bool IsBreak { get; set; }
    public double AccumulatedSeconds { get; set; }
    public DateTimeOffset? RunningSince { get; set; }
    public double Elapsed(DateTimeOffset now)
    {
        var elapsed = Math.Max(0, AccumulatedSeconds + (RunningSince is { } start ? Math.Max(0, (now - start).TotalSeconds) : 0));
        return Math.Min(elapsed, Stopwatch ? 24 * 3600 : TargetMinutes * 60);
    }
    public void Pause(DateTimeOffset now) { AccumulatedSeconds = Elapsed(now); RunningSince = null; }
}
