using System.Diagnostics;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private async Task RunPerformanceDiagnostics()
    {
        if (Environment.GetEnvironmentVariable("NINHO_PERF_RUN") != "1") return;
        var temporaryRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var directory = Path.GetFullPath(store.DirectoryPath);
        if (!directory.StartsWith(temporaryRoot + "Ninho-performance-", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("O diagnóstico exige uma coleção sintética temporária.");
        var original = JsonSerializer.Serialize(State.Cards, StudyStore.JsonOptions);
        State.Settings.ReducedMotion = true;
        State.Settings.Sound = false;
        State.Profile!.TutorialsSeen = PageGuides.Keys.ToList();
        await Task.Delay(500);
        var results = new List<object>();
        foreach (var count in new[] { 71, 1000, 5000 })
        {
            var templates = JsonSerializer.Deserialize<List<ReviewCard>>(original, StudyStore.JsonOptions)!;
            State.Cards = Enumerable.Range(0, count).Select(i =>
            {
                var source = templates[i % templates.Count];
                return new ReviewCard { Id = $"load-card-{i}", SubjectId = source.SubjectId, Question = $"{i + 1}. {source.Question}", Answer = source.Answer, Source = source.Source, SourceUrl = source.SourceUrl, DueAt = source.DueAt, CreatedAt = source.CreatedAt };
            }).ToList();
            foreach (var page in new[] { "today", "reviews", "studies", "materials", "progress" })
            {
                for (var repeat = 0; repeat < 3; repeat++)
                {
                    await Task.Delay(80);
                    route = page; reviewMode = "library"; libraryPage = 0; reviewQuery = ""; selectedSubject = "";
                    var allocated = GC.GetAllocatedBytesForCurrentThread();
                    var watch = Stopwatch.StartNew();
                    Render(true);
                    var renderMs = watch.Elapsed.TotalMilliseconds;
                    Root.UpdateLayout();
                    var layoutMs = watch.Elapsed.TotalMilliseconds;
                    var bytes = GC.GetAllocatedBytesForCurrentThread() - allocated;
                    var elements = CountVisuals(PageHost);
                    var frame = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                    EventHandler<object>? rendered = null;
                    rendered = (_, _) => { CompositionTarget.Rendering -= rendered; frame.TrySetResult(); };
                    CompositionTarget.Rendering += rendered;
                    await frame.Task.WaitAsync(TimeSpan.FromSeconds(10));
                    results.Add(new { count, page, repeat, renderMs, layoutMs, frameMs = watch.Elapsed.TotalMilliseconds, allocatedBytes = bytes, visuals = elements.Total, cardRows = elements.Cards, workingSetBytes = Process.GetCurrentProcess().WorkingSet64 });
                }
            }
        }
        await File.WriteAllTextAsync(Path.Combine(directory, "performance.json"), JsonSerializer.Serialize(new { capturedAt = DateTimeOffset.Now, framework = Environment.Version.ToString(), reducedMotion = true, results }, new JsonSerializerOptions { WriteIndented = true }));
        Close();
    }

    private static (int Total, int Cards) CountVisuals(DependencyObject root)
    {
        var total = 1;
        var cards = AutomationProperties.GetAutomationId(root).StartsWith("card-library-", StringComparison.Ordinal) ? 1 : 0;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
        {
            var child = CountVisuals(VisualTreeHelper.GetChild(root, i)); total += child.Total; cards += child.Cards;
        }
        return (total, cards);
    }
}
