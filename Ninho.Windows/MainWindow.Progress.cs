using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private int Streak()
    {
        return StudyStreak.Count(StudyStreak.ActiveDays(State, DateTimeOffset.Now), DateOnly.FromDateTime(DateTime.Today));
    }
    private StackPanel ProgressPage()
    {
        var page = StudyStack(0, PlanningHeading("Olha o quanto você está construindo.", "Cada aula, cada revisão, cada minuto. Tudo conta.", PlanningBadge("SEU PERCURSO", icon: "trending-up")));
        var summary = new AdaptiveColumns { MaximumColumns = 4, MinimumColumnWidth = 170, Gap = 16, Margin = new Thickness(0, 0, 0, 23) };
        var numbers = new List<(Run Value, Run Suffix)>();
        OriginalIcon? streakGraphic = null;
        foreach (var (icon, description) in new[] { ("timer", "dedicados a aprender"), ("book-open", "aulas concluídas"), ("brain", "conhecimentos revisitados"), ("flame", "na sua sequência atual") })
        {
            var graphic = OriginalIcon.Create(icon, 22, ColorBrush("#91AA83")); graphic.HorizontalAlignment = HorizontalAlignment.Left; graphic.Margin = new Thickness(0, 0, 0, 19);
            var number = StudyText("", 31); number.FontWeight = FontWeights.Medium;
            var value = new Run(); var suffix = new Run { FontSize = 12, FontWeight = FontWeights.Normal, FontFamily = (FontFamily)Application.Current.Resources["ContentControlThemeFontFamily"] }; number.Inlines.Add(value); number.Inlines.Add(suffix); numbers.Add((value, suffix));
            var label = StudyText(description, 10, muted: true); label.Margin = new Thickness(0, 6, 0, 0);
            var panel = DashboardPanel(StudyStack(0, graphic, number, label), new Thickness(23));
            if (icon == "flame")
            {
                streakGraphic = graphic;
                var button = StudyPlain("Sua sequência · abrir calendário", panel, OpenStreakCalendar);
                button.HorizontalContentAlignment = HorizontalAlignment.Stretch; button.HorizontalAlignment = HorizontalAlignment.Stretch;
                summary.Children.Add(button);
            }
            else summary.Children.Add(panel);
        }
        page.Children.Add(summary);
        var weekTitle = DashboardText("Seus últimos sete dias", 23, display: true); weekTitle.CharacterSpacing = -22; weekTitle.Margin = new Thickness(0, 9, 0, 0);
        var weekBadge = PlanningBadge("");
        var weekHeader = StudyBetween(StudyStack(0, PlanningEyebrow("O HÁBITO SE FORMA AQUI"), weekTitle), weekBadge);
        var bars = new Grid { ColumnSpacing = 16, Height = 180, Margin = new Thickness(0, 30, 0, 24) };
        var barControls = new List<(TextBlock Number, TextBlock Day, Border Fill, Border Well)>();
        for (var index = 0; index < 7; index++)
        {
            bars.ColumnDefinitions.Add(new ColumnDefinition());
            var number = StudyText("", 10, muted: true); number.TextAlignment = TextAlignment.Center;
            var label = StudyText("", 9, muted: true); label.TextAlignment = TextAlignment.Center;
            var fill = new Border { Background = ColorBrush(index == 6 ? "#729B74" : "#B7C9A8"), Height = 2, VerticalAlignment = VerticalAlignment.Bottom, CornerRadius = new CornerRadius(6) };
            var well = new Border { Child = fill, Height = 130, MaxWidth = 38, HorizontalAlignment = HorizontalAlignment.Stretch, Background = StudySoft, CornerRadius = new CornerRadius(6) };
            var column = StudyStack(8, number, well, label); Grid.SetColumn(column, index); bars.Children.Add(column); barControls.Add((number, label, fill, well));
        }
        var note = StudyText("O tempo é registrado nas sessões de foco concluídas. Pausas não entram na conta.", 9, muted: true);
        var week = DashboardPanel(StudyStack(0, weekHeader, bars, note), new Thickness(26));
        var milestoneTitle = DashboardText("Motivos para continuar.", 23, display: true); milestoneTitle.CharacterSpacing = -22; milestoneTitle.Margin = new Thickness(0, 9, 0, 15);
        var milestoneItems = new[] { ("Primeiro passo", "Concluir sua primeira aula", "book-open"), ("Uma hora para você", "Somar 60 minutos de foco", "timer"), ("Memória em movimento", "Revisitar 10 conhecimentos", "brain"), ("Criando raízes", "Estudar por 7 dias seguidos", "leaf") };
        var milestones = StudyStack(0, PlanningEyebrow("PEQUENAS CONQUISTAS"), milestoneTitle);
        var milestoneControls = new List<(Border IconBox, OriginalIcon Icon, TextBlock Title, TextBlock Detail, OriginalIcon Check, Ellipse Dot)>();
        for (var index = 0; index < milestoneItems.Length; index++)
        {
            var item = milestoneItems[index]; var graphic = OriginalIcon.Create(item.Item3, 21, ColorBrush("#B1BDA8"));
            var box = new Border { Child = graphic, Width = 37, Height = 37, CornerRadius = new CornerRadius(10), Background = StudySoft, VerticalAlignment = VerticalAlignment.Center };
            var title = StudyText(item.Item1, 11); title.FontWeight = FontWeights.Medium;
            var detail = StudyText(item.Item2, 9, muted: true); detail.Margin = new Thickness(0, 4, 0, 0);
            var check = OriginalIcon.Create("check", 19, DashboardGreen); var dot = new Ellipse { Width = 5, Height = 5, Fill = DashboardLine, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var status = new Grid { Width = 19 }; status.Children.Add(check); status.Children.Add(dot);
            var row = new Grid { ColumnSpacing = 12 }; row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); row.ColumnDefinitions.Add(new ColumnDefinition()); row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(box); var copy = StudyStack(0, title, detail); Grid.SetColumn(copy, 1); row.Children.Add(copy); Grid.SetColumn(status, 2); row.Children.Add(status);
            milestones.Children.Add(new Border { Child = row, Padding = new Thickness(0, 14, 0, 14), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 0, 0, index == milestoneItems.Length - 1 ? 0 : 1) });
            milestoneControls.Add((box, graphic, title, detail, check, dot));
        }
        page.Children.Add(PlanningSplit(week, DashboardPanel(milestones, new Thickness(26)), 1.4));
        var steps = StudyText("", 12, muted: true);
        var heading = StudyBetween(StudyText("Seu avanço por matéria", 17, bold: true), steps); heading.Margin = new Thickness(0, 27, 0, 15); page.Children.Add(heading);
        var subjectRows = StudyStack(0); var subjectCache = new Dictionary<string, (string Signature, Border Row)>();
        page.Children.Add(DashboardPanel(subjectRows, new Thickness(24, 8, 24, 8)));

        void RefreshProgress()
        {
            var total = State.Sessions.Sum(x => x.DurationMinutes); var done = State.Lessons.Count(x => x.Status == "done"); var practiced = State.Cards.Count(x => x.LastReviewedAt != null); var streak = Streak();
            if (streakGraphic != null) streakGraphic.Foreground = ColorBrush(StudyStreak.ActiveDays(State, DateTimeOffset.Now).Contains(DateOnly.FromDateTime(DateTime.Today)) ? "#C88E67" : "#87928B");
            var values = new[] { (Math.Round(total).ToString(), " min"), (done.ToString(), $" / {State.Lessons.Count}"), (practiced.ToString(), $" / {State.Cards.Count}"), (streak.ToString(), " dias") };
            for (var index = 0; index < values.Length; index++) { numbers[index].Value.Text = values[index].Item1; numbers[index].Suffix.Text = values[index].Item2; }
            var byDay = State.Sessions.GroupBy(x => x.CompletedAt.LocalDateTime.Date).ToDictionary(x => x.Key, x => x.Sum(y => y.DurationMinutes));
            var days = Enumerable.Range(0, 7).Select(index => DateTime.Today.AddDays(index - 6)).Select(day => (Date: day, Minutes: byDay.GetValueOrDefault(day))).ToArray();
            var max = Math.Max(1, Math.Max(State.Settings.DailyMinutes, days.Max(x => x.Minutes)));
            for (var index = 0; index < 7; index++)
            {
                var day = days[index]; var bar = barControls[index]; bar.Number.Inlines.Clear(); bar.Number.Inlines.Add(new Run { Text = Math.Round(day.Minutes).ToString() }); bar.Number.Inlines.Add(new Run { Text = " m", FontSize = 8 });
                bar.Day.Text = day.Date.ToString("ddd", PlanningCulture).Replace(".", "");
                bar.Fill.Height = Math.Max(2, Math.Max(day.Minutes > 0 ? 3.9 : 0, day.Minutes / max * 130));
                AutomationProperties.SetName(bar.Well, day.Date.ToString("d 'de' MMMM", PlanningCulture) + $": {Math.Round(day.Minutes)} minutos");
            }
            ((TextBlock)weekBadge.Child).Text = $"{Math.Round(days.Sum(x => x.Minutes))} min";
            AutomationProperties.SetName(bars, "Tempo de estudo nos últimos sete dias: " + string.Join("; ", days.Select(day => day.Date.ToString("dd/MM") + $": {Math.Round(day.Minutes)} minutos")));
            var achieved = new[] { done > 0, total >= 60, practiced >= 10, streak >= 7 };
            for (var index = 0; index < achieved.Length; index++)
            {
                var item = milestoneControls[index]; var active = achieved[index]; item.IconBox.Background = active ? StudyMint : StudySoft;
                item.Icon.Foreground = active ? DashboardGreen : ColorBrush("#B1BDA8"); item.Title.Foreground = active ? DashboardGreen : DashboardMuted;
                item.Check.Visibility = active ? Visibility.Visible : Visibility.Collapsed; item.Dot.Visibility = active ? Visibility.Collapsed : Visibility.Visible;
            }
            steps.Text = $"{done} passos dados"; var desired = new List<UIElement>(); var live = new HashSet<string>();
            var lessonsBySubject = State.Lessons.GroupBy(x => x.SubjectId).ToDictionary(x => x.Key, x => x.ToArray());
            var cardsBySubject = State.Cards.GroupBy(x => x.SubjectId).ToDictionary(x => x.Key, x => x.ToArray());
            foreach (var subject in State.Subjects)
            {
                var lessons = lessonsBySubject.GetValueOrDefault(subject.Id) ?? []; var cards = cardsBySubject.GetValueOrDefault(subject.Id) ?? [];
                var completed = lessons.Count(x => x.Status == "done"); var reviewed = cards.Count(x => x.LastReviewedAt != null);
                var signature = string.Join("\u001F", subject.Name, subject.Color, completed, lessons.Length, reviewed, cards.Length); live.Add(subject.Id);
                if (!subjectCache.TryGetValue(subject.Id, out var cached) || cached.Signature != signature)
                {
                    var grid = new Grid { ColumnSpacing = 18 };
                    grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(7) }); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.2, GridUnitType.Star) }); grid.ColumnDefinitions.Add(new ColumnDefinition()); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(70) }); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
                    grid.Children.Add(new Ellipse { Width = 6, Height = 6, Fill = ColorBrush(subject.Color), VerticalAlignment = VerticalAlignment.Center });
                    var name = StudyText(subject.Name, 11); name.FontWeight = FontWeights.Medium; name.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(name, 1); grid.Children.Add(name);
                    var progress = (FrameworkElement)StudyProgress(completed, lessons.Length, subject.Color); progress.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(progress, 2); grid.Children.Add(progress);
                    var lessonCount = StudyText($"{completed}/{lessons.Length} aulas", 9, muted: true); lessonCount.TextAlignment = TextAlignment.Right; Grid.SetColumn(lessonCount, 3); grid.Children.Add(lessonCount);
                    var cardCount = StudyText($"{reviewed}/{cards.Length} cartões revistos", 9, muted: true); cardCount.TextAlignment = TextAlignment.Right; Grid.SetColumn(cardCount, 4); grid.Children.Add(cardCount);
                    grid.SizeChanged += (_, args) => { var compact = args.NewSize.Width < 800; grid.ColumnSpacing = compact ? 12 : 18; grid.ColumnDefinitions[3].Width = new GridLength(compact ? 64 : 70); grid.ColumnDefinitions[4].Width = new GridLength(compact ? 100 : 120); };
                    var row = new Border { Child = grid, Padding = new Thickness(0, 18, 0, 18), BorderBrush = DashboardLine };
                    subjectCache[subject.Id] = cached = (signature, row);
                }
                cached.Row.BorderThickness = new Thickness(0, 0, 0, desired.Count == State.Subjects.Count - 1 ? 0 : 1); desired.Add(cached.Row);
            }
            foreach (var id in subjectCache.Keys.Where(x => !live.Contains(x)).ToArray()) subjectCache.Remove(id);
            PlanningReconcile(subjectRows, desired);
        }
        refreshPage = RefreshProgress; RefreshProgress(); return page;
    }
}
