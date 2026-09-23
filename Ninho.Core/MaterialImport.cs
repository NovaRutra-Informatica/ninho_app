using System.Text.RegularExpressions;

namespace Ninho.Core;

public sealed record MaterialContext(string SubjectId, string LessonId);

public static class MaterialImport
{
    private static readonly Regex StrategyFile = new(@"^curso-([0-9]+)-aula-([0-9]+)(?:[-_.])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex StrategyProvider = new("estratégia|estrategia", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static MaterialContext InferContext(StudyState state, string filename, string? subjectId = null, string? lessonId = null)
    {
        var match = StrategyFile.Match(Path.GetFileName(filename));
        var course = match.Success && Path.GetExtension(filename).Equals(".pdf", StringComparison.OrdinalIgnoreCase)
            ? state.Courses.FirstOrDefault(course => course.Id == match.Groups[1].Value && StrategyProvider.IsMatch(course.Provider))
            : null;
        var lesson = course == null ? null : state.Lessons.FirstOrDefault(lesson =>
            lesson.Id == $"{course.Id}:aula:{match.Groups[2].Value.PadLeft(2, '0')}" && lesson.CourseId == course.Id);
        var resolvedSubject = string.IsNullOrEmpty(subjectId) ? course?.SubjectId ?? "" : subjectId;
        return new MaterialContext(resolvedSubject, lessonId ?? (lesson?.SubjectId == resolvedSubject ? lesson.Id : ""));
    }
}
