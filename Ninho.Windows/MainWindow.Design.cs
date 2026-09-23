using System.Globalization;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Microsoft.UI.Xaml.Automation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private static SolidColorBrush ColorBrush(string hex)
    {
        var color = Convert.ToUInt32(hex.TrimStart('#'), 16);
        return new SolidColorBrush(global::Windows.UI.Color.FromArgb(255, (byte)(color >> 16), (byte)(color >> 8), (byte)color));
    }
    private static TextBlock ColoredText(string text, double size, string color)
    { var block = Text(text, size); block.Foreground = ColorBrush(color); return block; }
    private static TextBlock Caption(string text)
    { var block = Body(text); block.FontSize = 12; return block; }
    private static FontIcon Glyph(string glyph, string color, double size = 22) => new() { Glyph = glyph, FontSize = size, Foreground = ColorBrush(color), FontFamily = new FontFamily("Segoe Fluent Icons") };
    private static Border Badge(string text) => new() { Background = ColorBrush("#E9F2E8"), CornerRadius = new CornerRadius(6), Padding = new Thickness(9, 6, 9, 6), HorizontalAlignment = HorizontalAlignment.Left, Child = ColoredText(text, 9, "#235E50") };
    private Button Tile(UIElement content, Action open)
    {
        content.IsHitTestVisible = false;
        var button = new Button { Content = content, Padding = new Thickness(20), HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch, CornerRadius = new CornerRadius(15) };
        button.Style = (Style)Application.Current.Resources["NinhoTileStyle"];
        button.Click += (_, _) => open();
        return button;
    }

    private bool DashboardDark => Root.ActualTheme == ElementTheme.Dark;
    private Brush DashboardInk => ColorBrush(DashboardDark ? "#F0F1F3" : "#193C35");
    private Brush DashboardMuted => ColorBrush(DashboardDark ? "#AEB3BE" : "#50675E");
    private Brush DashboardGreen => ColorBrush(DashboardDark ? "#A8D7BC" : "#235E50");
    private Brush DashboardSurface => ColorBrush(DashboardDark ? "#23252A" : "#FFFFFF");
    private Brush DashboardLine => ColorBrush(DashboardDark ? "#3B3E46" : "#E6EAE3");
    private TextBlock DashboardText(string text, double size = 12, Brush? foreground = null, bool display = false)
    {
        var block = new TextBlock { Text = text, FontSize = size, TextWrapping = TextWrapping.Wrap, Foreground = foreground ?? DashboardInk, LineHeight = size * 1.55, LineStackingStrategy = LineStackingStrategy.BlockLineHeight };
        if (display) { block.FontFamily = (FontFamily)Application.Current.Resources["NinhoDisplayFont"]; block.FontWeight = FontWeights.Medium; }
        return UseOriginalTextFace(block);
    }
    private static StackPanel DashboardRow(params UIElement[] items)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 9, VerticalAlignment = VerticalAlignment.Center };
        foreach (var item in items) panel.Children.Add(item);
        return panel;
    }
    private Button DashboardButton(string label, string icon, Func<Task> open, bool link = false, bool leading = false, double iconSize = 16)
    {
        var button = ActionButton(label, open);
        button.FontSize = link ? 11 : 12;
        button.Padding = link ? new Thickness(0, 4, 0, 4) : new Thickness(17, 11, 17, 11);
        button.MinHeight = link ? 0 : 42;
        button.MinWidth = 0;
        button.HorizontalAlignment = HorizontalAlignment.Left;
        button.Background = link ? new SolidColorBrush(Microsoft.UI.Colors.Transparent) : DashboardSurface;
        button.BorderBrush = DashboardLine;
        button.BorderThickness = new Thickness(link ? 0 : 1);
        button.Foreground = link ? DashboardGreen : DashboardInk;
        var labelText = DashboardText(label, link ? 11 : 12, button.Foreground);
        labelText.FontWeight = FontWeights.SemiBold;
        var graphic = OriginalIcon.Create(icon, iconSize, button.Foreground);
        var content = leading ? DashboardRow(graphic, labelText) : DashboardRow(labelText, graphic);
        content.Spacing = link ? 7 : 9;
        button.Content = content;
        return button;
    }
    private UIElement SectionHeading(string title, string action, Func<Task> open)
    {
        var grid = new Grid { ColumnSpacing = 14, Margin = new Thickness(0, 27, 0, 15) };
        grid.ColumnDefinitions.Add(new ColumnDefinition()); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var heading = DashboardText(title, 17); heading.FontWeight = FontWeights.SemiBold; heading.CharacterSpacing = -29; heading.VerticalAlignment = VerticalAlignment.Center;
        grid.Children.Add(heading);
        var button = DashboardButton(action, "arrow-right", open, true, iconSize: 15);
        Grid.SetColumn(button, 1); grid.Children.Add(button); return grid;
    }
    private Border DashboardPanel(UIElement content, Thickness padding) => new() { Child = content, Background = DashboardSurface, BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(16), Padding = padding };
    private UIElement DashboardStat(string icon, string tint, string ink, string title, string value, string suffix, string detail, Action open, double? progress = null)
    {
        var layout = new Grid { ColumnSpacing = 14 };
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); layout.ColumnDefinitions.Add(new ColumnDefinition()); layout.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var iconBox = new Border { Background = ColorBrush(tint), CornerRadius = new CornerRadius(12), Width = 43, Height = 46, Child = OriginalIcon.Create(icon, 22, ColorBrush(ink)), VerticalAlignment = VerticalAlignment.Center };
        layout.Children.Add(iconBox);
        var number = DashboardText("", 25); number.FontWeight = FontWeights.Medium;
        number.Inlines.Add(new Run { Text = value });
        var unit = new Run { Text = suffix, FontSize = 9, FontWeight = FontWeights.Normal, Foreground = DashboardMuted };
        number.Inlines.Add(unit);
        var smallTitle = DashboardText(title, 10, DashboardMuted); smallTitle.LineHeight = 23.25;
        var info = Column(smallTitle, number); info.Spacing = 0; info.VerticalAlignment = VerticalAlignment.Center;
        var detailText = DashboardText(detail, 8, DashboardMuted); detailText.Margin = new Thickness(0, 1, 0, 0);
        if (progress is { } fraction)
        {
            var fill = new Border { Background = DashboardGreen, CornerRadius = new CornerRadius(10), HorizontalAlignment = HorizontalAlignment.Left };
            var track = new Grid { Height = 3, Background = DashboardLine, CornerRadius = new CornerRadius(10), Margin = new Thickness(0, 5, 0, 0) };
            track.Children.Add(fill); track.SizeChanged += (_, e) => fill.Width = Math.Max(0, e.NewSize.Width * Math.Clamp(fraction, 0, 1)); info.Children.Add(track);
        }
        else info.Children.Add(detailText);
        Grid.SetColumn(info, 1); layout.Children.Add(info);
        var chevron = OriginalIcon.Create("chevron-right", 14, ColorBrush("#AAB5AC")); Grid.SetColumn(chevron, 2); layout.Children.Add(chevron);
        var button = Tile(layout, open); button.Padding = new Thickness(18, 19, 18, 19); button.CornerRadius = new CornerRadius(14); button.BorderThickness = new Thickness(1);
        button.SizeChanged += (_, _) =>
        {
            var compact = Root.ActualWidth <= 1200;
            button.Padding = compact ? new Thickness(12, 16, 12, 16) : new Thickness(18, 19, 18, 19);
            layout.ColumnSpacing = compact ? 9 : 14; iconBox.Width = compact ? 36 : 43; iconBox.Height = compact ? 41 : 46;
            number.FontSize = compact ? 23 : 25; number.LineHeight = number.FontSize * 1.5; unit.FontSize = compact ? 8 : 9; detailText.FontSize = compact ? 7 : 8; detailText.LineHeight = detailText.FontSize * 1.55;
            chevron.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        };
        AutomationProperties.SetName(button, $"{title}, {value}{suffix}, {detail}"); return button;
    }

    private StackPanel TodayPage()
    {
        var today = DateTime.Today;
        var todayKey = today.ToString("yyyy-MM-dd");
        var now = DateTimeOffset.Now;
        var culture = CultureInfo.GetCultureInfo("pt-BR");
        var minutes = State.Sessions.Where(x => x.CompletedAt <= now && x.CompletedAt.LocalDateTime.Date == today).Sum(x => x.DurationMinutes);
        var due = StudyEngine.DueCards(State, now).Count();
        var studyDays = State.Sessions.Where(x => x.CompletedAt <= now && (x.DurationMinutes > 0 || x.Kind == "review")).Select(x => x.CompletedAt.LocalDateTime.Date)
            .Concat(State.Attempts.Where(x => x.At <= now).Select(x => x.At.LocalDateTime.Date)).ToHashSet();
        var cursor = studyDays.Contains(today) ? today : today.AddDays(-1); var streak = 0;
        while (studyDays.Contains(cursor)) { streak++; cursor = cursor.AddDays(-1); }
        var next = State.Lessons.FirstOrDefault(x => x.Status == "in-progress") ?? State.Lessons.FirstOrDefault(x => x.Status == "not-started");
        var nextSubject = State.Subjects.FirstOrDefault(x => x.Id == next?.SubjectId);

        var intro = new Grid { ColumnSpacing = 22, Margin = new Thickness(0, 0, 0, 27) };
        intro.ColumnDefinitions.Add(new ColumnDefinition()); intro.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var eyebrow = DashboardText("SEU ESPAÇO PARA CRESCER", 9, DashboardMuted); eyebrow.FontWeight = FontWeights.Bold; eyebrow.CharacterSpacing = 200; eyebrow.Margin = new Thickness(0, 0, 0, 11);
        var greetingTitle = DashboardText($"{(now.Hour < 12 ? "Bom dia" : now.Hour < 18 ? "Boa tarde" : "Boa noite")}, {State.Settings.Name.Split(' ')[0]}", 32, display: true); greetingTitle.LineHeight = 38.4; greetingTitle.CharacterSpacing = -31;
        var leaf = OriginalIcon.Create("leaf", 24, ColorBrush("#90A683")); leaf.RenderTransformOrigin = new global::Windows.Foundation.Point(.5, .5); leaf.RenderTransform = new RotateTransform { Angle = -15 };
        var greetingLine = DashboardRow(greetingTitle, leaf); greetingLine.Spacing = 7;
        var subtitle = DashboardText("Que tal dar mais um passo por você hoje?", 13, DashboardMuted); subtitle.Margin = new Thickness(0, 8, 0, 0);
        var greeting = Column(eyebrow, greetingLine, subtitle); greeting.Spacing = 0; intro.Children.Add(greeting);
        var dateLabel = today.ToString("ddd, d 'de' MMMM", culture);
        var date = DashboardButton(dateLabel, "calendar-days", () => { Navigate("agenda"); return Task.CompletedTask; }, leading: true);
        date.CornerRadius = new CornerRadius(30); date.Padding = new Thickness(15, 10, 15, 10); date.MinHeight = 0;
        date.Foreground = DashboardMuted;
        date.Content = DashboardRow(OriginalIcon.Create("calendar-days", 16, DashboardMuted), DashboardText(dateLabel, 11, DashboardMuted));
        AutomationProperties.SetName(date, "Abrir calendário"); Grid.SetColumn(date, 1); intro.Children.Add(date);

        var hero = new Grid { MinHeight = 278 };
        hero.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(67, GridUnitType.Star) }); hero.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(33, GridUnitType.Star) });
        var label = DashboardText("SEU PRÓXIMO CAPÍTULO", 8, ColorBrush("#C7DDC0")); label.CharacterSpacing = 225; label.FontWeight = FontWeights.Medium;
        var labelRow = DashboardRow(new Ellipse { Width = 5, Height = 5, Fill = ColorBrush("#A8D7BC"), VerticalAlignment = VerticalAlignment.Center }, label); labelRow.Spacing = 7;
        var heroTitle = DashboardText("Um passo hoje.\nMais perto da aprovação.", 35, ColorBrush("#FFFFFF"), true); heroTitle.LineHeight = 39.9; heroTitle.CharacterSpacing = -26; heroTitle.Margin = new Thickness(0, 15, 0, 12);
        var description = DashboardText("Um lugar para organizar a mente, cuidar do que aprendeu e construir o que vem depois.", 12, ColorBrush("#C2D3C7")); description.LineHeight = 19.2; description.MaxWidth = 380; description.HorizontalAlignment = HorizontalAlignment.Left;
        var start = DashboardButton("Vamos estudar", "arrow-right", () => { if (next != null) OpenLesson(next); else Navigate("studies"); return Task.CompletedTask; }, iconSize: 18);
        start.Background = ColorBrush("#A8D7BC"); start.Foreground = ColorBrush("#214C37"); start.BorderThickness = new Thickness(0); start.Margin = new Thickness(0, 22, 0, 0); start.MinHeight = 40;
        var startLabel = DashboardText("Vamos estudar", 12, start.Foreground); startLabel.FontWeight = FontWeights.SemiBold; start.Content = DashboardRow(startLabel, OriginalIcon.Create("arrow-right", 18, start.Foreground));
        var program = State.Programs.FirstOrDefault(x => x.Id == nextSubject?.ProgramId);
        var programCaption = program?.Id == "senado-federal" ? "Senado Federal · Análise e Suporte a Sistemas" : program?.Name ?? "";
        var chapter = DashboardText(programCaption, 9, ColorBrush("#9CBAAA")); chapter.Margin = new Thickness(0, 13, 0, 0); chapter.Visibility = programCaption.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        var heroCopy = Column(labelRow, heroTitle, description, start, chapter); heroCopy.Spacing = 0; heroCopy.Padding = new Thickness(37, 31, 37, 31);
        hero.Children.Add(heroCopy);
        var mascot = new Grid { IsHitTestVisible = true };
        var orbitCanvas = new Canvas { IsHitTestVisible = false };
        var orbit = new Ellipse { Width = 290, Height = 290, Stroke = ColorBrush("#739782"), Opacity = 53d / 255, StrokeThickness = 1 };
        var outerOrbit = new Ellipse { Width = 355, Height = 355, Stroke = ColorBrush("#739782"), Opacity = 53d / 255, StrokeThickness = 1 };
        orbitCanvas.Children.Add(orbit); orbitCanvas.Children.Add(outerOrbit); Canvas.SetTop(orbit, 1); Canvas.SetTop(outerOrbit, -31);
        mascot.SizeChanged += (_, e) => { Canvas.SetLeft(orbit, e.NewSize.Width - 290 + 6); Canvas.SetLeft(outerOrbit, e.NewSize.Width - 355 + 38); };
        mascot.Children.Add(orbitCanvas);
        var owl = new OwlControl { Width = 253, Height = 253 * 260d / 280, Margin = new Thickness(0, -9, 33, 0), VerticalAlignment = VerticalAlignment.Center, Animate = !State.Settings.ReducedMotion };
        mascot.Children.Add(owl);
        var note = DashboardText("Eu sou a Íris.\nVamos juntos?", 11, ColorBrush("#D5E2C7"), true); note.TextAlignment = TextAlignment.Center; note.HorizontalAlignment = HorizontalAlignment.Right; note.VerticalAlignment = VerticalAlignment.Bottom; note.Margin = new Thickness(0, 0, 72, 26); note.RenderTransform = new RotateTransform { Angle = -5 }; mascot.Children.Add(note);
        Grid.SetColumn(mascot, 1); hero.Children.Add(mascot);
        var heroCard = new Border { Background = ColorBrush(DashboardDark ? "#294F3F" : "#214D40"), CornerRadius = new CornerRadius(19), Child = hero };
        heroCard.SizeChanged += (_, e) =>
        {
            var compact = Root.ActualWidth <= 1200; var small = e.NewSize.Width < 540;
            mascot.Visibility = small ? Visibility.Collapsed : Visibility.Visible;
            hero.ColumnDefinitions[0].Width = new GridLength(compact ? 65 : 67, GridUnitType.Star);
            hero.ColumnDefinitions[1].Width = new GridLength(small ? 0 : compact ? 35 : 33, GridUnitType.Star);
            heroTitle.FontSize = compact ? 31 : 35; heroTitle.LineHeight = heroTitle.FontSize * 1.14;
            heroCopy.Padding = compact ? new Thickness(29) : new Thickness(37, 31, 37, 31);
            owl.Width = compact ? 205 : 253; owl.Height = owl.Width * 260d / 280; owl.Margin = new Thickness(0, -9, compact ? 15 : 33, 0); note.Margin = new Thickness(0, 0, compact ? 50 : 72, 26);
            hero.Clip = new RectangleGeometry { Rect = new global::Windows.Foundation.Rect(0, 0, e.NewSize.Width, e.NewSize.Height) };
        };

        var stats = new AdaptiveColumns { MinimumColumnWidth = 190, Gap = 15, Margin = new Thickness(0, 21, 0, 0) };
        stats.Children.Add(DashboardStat("timer", DashboardDark ? "#354831" : "#EDF3E8", DashboardDark ? "#BDD6AA" : "#779666", "Seu tempo hoje", $"{Math.Round(minutes)}", $" / {State.Settings.DailyMinutes} min", "", () => Navigate("timer"), minutes / Math.Max(1, State.Settings.DailyMinutes)));
        stats.Children.Add(DashboardStat("brain", DashboardDark ? "#423F53" : "#F0EEF8", DashboardDark ? "#C4B5E0" : "#9986BD", "Para revisar", $"{due}", " conhecimentos", "Um reencontro com o que aprendeu", () => Navigate("reviews")));
        stats.Children.Add(DashboardStat("flame", DashboardDark ? "#533F32" : "#FBEEE3", DashboardDark ? "#DEAF88" : "#C88E67", "Seu ritmo", $"{streak}", streak == 1 ? " dia seguido" : " dias seguidos", "Constância se constrói aos poucos", () => Navigate("progress")));

        var left = Column(SectionHeading("Seu próximo passo", "Ver estudos", () => { Navigate("studies"); return Task.CompletedTask; })); left.Spacing = 0;
        if (next != null)
        {
            var badge = Badge(next.Status == "in-progress" ? "CONTINUE DE ONDE PAROU" : "UM BOM COMEÇO"); badge.Background = ColorBrush(DashboardDark ? "#303A37" : "#E9F2E8"); ((TextBlock)badge.Child).Foreground = DashboardGreen;
            var badgeRow = new Grid(); badgeRow.Children.Add(badge);
            var book = OriginalIcon.Create("book-open", 23, ColorBrush("#A5B59E")); book.HorizontalAlignment = HorizontalAlignment.Right; badgeRow.Children.Add(book);
            var subject = DashboardText(nextSubject?.Name ?? "", 10, DashboardMuted); subject.Margin = new Thickness(0, 20, 0, 0);
            var title = DashboardText(next.Title, 21); title.FontWeight = FontWeights.Medium; title.LineHeight = 29.4; title.Margin = new Thickness(0, 7, 0, 7);
            var text = DashboardText(next.Description, 12, DashboardMuted); text.LineHeight = 19.8; text.MaxLines = 2; text.TextTrimming = TextTrimming.CharacterEllipsis; text.MinHeight = 39;
            var open = DashboardButton("Abrir meu estudo", "arrow-right", () => { OpenLesson(next); return Task.CompletedTask; }); open.Margin = new Thickness(0, 20, 0, 0);
            var lessonCard = Column(badgeRow, subject, title, text, open); lessonCard.Spacing = 0; left.Children.Add(DashboardPanel(lessonCard, new Thickness(24, 21, 24, 21)));
        }
        else
        {
            var empty = Column(DashboardText("Mais um caminho pela frente.", 16), DashboardText("Você pode organizar um novo curso ou revisitar o que aprendeu.", 12, DashboardMuted), DashboardButton("Explorar estudos", "arrow-right", () => { Navigate("studies"); return Task.CompletedTask; }));
            left.Children.Add(DashboardPanel(empty, new Thickness(24)));
        }
        var taskHeading = new Grid { Margin = new Thickness(0, 27, 0, 15) };
        var taskTitle = DashboardText("Pequenos passos de hoje", 17); taskTitle.FontWeight = FontWeights.SemiBold; taskTitle.VerticalAlignment = VerticalAlignment.Center; taskHeading.Children.Add(taskTitle);
        var addTask = ActionButton("Adicionar tarefa de hoje", () => AddAgendaItem(false)); addTask.Content = OriginalIcon.Create("plus", 19, DashboardMuted); addTask.Padding = new Thickness(7); addTask.MinWidth = 0; addTask.Width = 33; addTask.Height = 33; addTask.MinHeight = 0; addTask.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent); addTask.BorderThickness = new Thickness(0); addTask.HorizontalAlignment = HorizontalAlignment.Right; taskHeading.Children.Add(addTask); left.Children.Add(taskHeading);
        var tasks = State.Tasks.Where(x => x.Date == todayKey).ToArray();
        var taskList = Column(); taskList.Spacing = 0;
        if (tasks.Length == 0)
        {
            var empty = new Grid { ColumnSpacing = 13, MinHeight = 54 };
            empty.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); empty.ColumnDefinitions.Add(new ColumnDefinition()); empty.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            empty.Children.Add(new Border { Width = 34, Height = 34, CornerRadius = new CornerRadius(10), Background = ColorBrush(DashboardDark ? "#303A37" : "#E9F2E8"), Child = OriginalIcon.Create("check", 20, DashboardGreen), VerticalAlignment = VerticalAlignment.Center });
            var quiet = Column(DashboardText("Menos na cabeça. Mais no papel.", 11), DashboardText("Escolha uma pequena tarefa para hoje.", 10, DashboardMuted)); quiet.Spacing = 0; quiet.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(quiet, 1); empty.Children.Add(quiet);
            var add = DashboardButton("Adicionar", "plus", () => AddAgendaItem(false), true, iconSize: 15); Grid.SetColumn(add, 2); empty.Children.Add(add); taskList.Children.Add(empty);
        }
        else foreach (var task in tasks)
        {
            var check = ActionButton($"{(task.Completed ? "Reabrir" : "Concluir")} tarefa {task.Title}", () => Save(s => { var item = s.Tasks.First(x => x.Id == task.Id); item.Completed = !item.Completed; }));
            check.Content = OriginalIcon.Create(task.Completed ? "check" : "circle", 19, ColorBrush(task.Completed ? "#60936A" : "#9FAC98")); check.Padding = new Thickness(0); check.MinWidth = 19; check.MinHeight = 19; check.BorderThickness = new Thickness(0); check.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
            var text = DashboardText(task.Title, 12, task.Completed ? DashboardMuted : DashboardInk); if (task.Completed) text.TextDecorations = global::Windows.UI.Text.TextDecorations.Strikethrough;
            var row = new Grid { ColumnSpacing = 10 }; row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); row.ColumnDefinitions.Add(new ColumnDefinition()); row.Children.Add(check); Grid.SetColumn(text, 1); row.Children.Add(text);
            taskList.Children.Add(new Border { Child = row, Padding = new Thickness(0, 13, 0, 13), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 0, 0, task == tasks[^1] ? 0 : 1) });
        }
        left.Children.Add(DashboardPanel(taskList, new Thickness(19, 15, 19, 15)));

        var right = Column(SectionHeading("No horizonte", "Agenda", () => { Navigate("agenda"); return Task.CompletedTask; })); right.Spacing = 0;
        var exams = State.Exams.Where(x => !x.Completed && string.CompareOrdinal(x.Date, todayKey) >= 0).OrderBy(x => x.Date).ThenBy(x => x.Time).Take(3).ToArray();
        var horizon = Column(); horizon.Spacing = 0;
        if (exams.Length == 0)
        {
            var illustration = new Grid { Width = 65, Height = 37, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 0, 11) };
            var calendar = OriginalIcon.Create("calendar-days", 37, ColorBrush("#99AA82")); calendar.HorizontalAlignment = HorizontalAlignment.Left; illustration.Children.Add(calendar);
            var sparkles = OriginalIcon.Create("sparkles", 20, ColorBrush("#C8AC6E")); sparkles.HorizontalAlignment = HorizontalAlignment.Right; sparkles.VerticalAlignment = VerticalAlignment.Top; sparkles.Margin = new Thickness(0, -5, -5, 0); illustration.Children.Add(sparkles);
            var title = DashboardText("Sua próxima conquista\nmerece uma data.", 20, display: true); title.LineHeight = 28; title.Margin = new Thickness(0, 0, 0, 9);
            var text = DashboardText("Marque as provas da Mauá e dos concursos para se preparar com calma.", 11, DashboardMuted); text.MaxWidth = 270; text.HorizontalAlignment = HorizontalAlignment.Left;
            var add = DashboardButton("Marcar uma prova", "plus", () => AddAgendaItem(true), leading: true); add.Margin = new Thickness(0, 18, 0, 0);
            horizon.Children.Add(illustration); horizon.Children.Add(title); horizon.Children.Add(text); horizon.Children.Add(add);
        }
        else foreach (var exam in exams)
        {
            var dateValue = DateTime.ParseExact(exam.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var day = DashboardText(dateValue.ToString("dd", culture), 23); day.FontWeight = FontWeights.Medium; day.HorizontalAlignment = HorizontalAlignment.Center; day.LineHeight = 23;
            var month = DashboardText(dateValue.ToString("MMM", culture).ToUpper(culture), 9, DashboardMuted); month.HorizontalAlignment = HorizontalAlignment.Center; month.Margin = new Thickness(0, 5, 0, 0);
            var dateStack = Column(day, month); dateStack.Spacing = 0;
            var dateBox = new Border { Child = dateStack, Background = ColorBrush(DashboardDark ? "#2B2E35" : "#F8F9F5"), CornerRadius = new CornerRadius(10), Padding = new Thickness(8, 10, 8, 10), MinWidth = 47 };
            var title = DashboardText(exam.Title, 12); title.FontWeight = FontWeights.SemiBold;
            var subject = State.Subjects.FirstOrDefault(x => x.Id == exam.SubjectId)?.Name ?? "Seu compromisso";
            var examText = Column(title, DashboardText(subject + (exam.Time.Length > 0 ? " · " + exam.Time : ""), 10, DashboardMuted)); examText.Spacing = 5; examText.VerticalAlignment = VerticalAlignment.Center;
            var row = new Grid { ColumnSpacing = 13 }; row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); row.ColumnDefinitions.Add(new ColumnDefinition()); row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); row.Children.Add(dateBox); Grid.SetColumn(examText, 1); row.Children.Add(examText);
            var arrow = OriginalIcon.Create("chevron-right", 16, DashboardMuted); Grid.SetColumn(arrow, 2); row.Children.Add(arrow);
            var button = Tile(row, () => Navigate("agenda")); button.Padding = new Thickness(0, 12, 0, 12); button.CornerRadius = new CornerRadius(0); button.BorderThickness = new Thickness(0, 0, 0, exam == exams[^1] ? 0 : 1); AutomationProperties.SetName(button, $"{exam.Title}, {exam.Date}"); horizon.Children.Add(button);
        }
        var horizonPanel = DashboardPanel(horizon, new Thickness(22, 23, 22, 23)); horizonPanel.MinHeight = 237; right.Children.Add(horizonPanel);
        var focusContent = new Grid { ColumnSpacing = 13 };
        focusContent.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); focusContent.ColumnDefinitions.Add(new ColumnDefinition()); focusContent.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        focusContent.Children.Add(new Border { Width = 37, Height = 39, Background = ColorBrush(DashboardDark ? "#415635" : "#F9FAEE"), CornerRadius = new CornerRadius(13), Child = OriginalIcon.Create("play", 22, ColorBrush(DashboardDark ? "#C8DFAE" : "#235E50")) });
        var focusTitle = DashboardText("Um tempo só para estudar", 11, ColorBrush(DashboardDark ? "#DEEAD0" : "#43533B")); focusTitle.FontWeight = FontWeights.SemiBold;
        var focusText = Column(focusTitle, DashboardText($"{State.Settings.FocusMinutes} minutos. Uma coisa por vez.", 9, ColorBrush("#7A896D"))); focusText.Spacing = 0; focusText.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(focusText, 1); focusContent.Children.Add(focusText);
        var focusArrow = OriginalIcon.Create("arrow-right", 18, ColorBrush(DashboardDark ? "#DEEAD0" : "#43533B")); Grid.SetColumn(focusArrow, 2); focusContent.Children.Add(focusArrow);
        var focusPrompt = Tile(focusContent, () => Navigate("timer")); focusPrompt.Background = ColorBrush(DashboardDark ? "#34452C" : "#EBEEDD"); focusPrompt.BorderThickness = new Thickness(0); focusPrompt.Padding = new Thickness(15, 17, 15, 17); focusPrompt.CornerRadius = new CornerRadius(13); focusPrompt.Margin = new Thickness(0, 19, 0, 0); AutomationProperties.SetName(focusPrompt, $"Um tempo só para estudar, {State.Settings.FocusMinutes} minutos"); right.Children.Add(focusPrompt);

        var columns = new Grid { ColumnSpacing = 23 };
        columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.45, GridUnitType.Star) }); columns.ColumnDefinitions.Add(new ColumnDefinition());
        columns.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); columns.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        columns.Children.Add(left); Grid.SetColumn(right, 1); columns.Children.Add(right);
        columns.SizeChanged += (_, e) =>
        {
            var single = e.NewSize.Width < 590; var compact = Root.ActualWidth <= 1200;
            columns.ColumnSpacing = single ? 0 : compact ? 18 : 23;
            columns.ColumnDefinitions[0].Width = new GridLength(single ? 1 : compact ? 1.35 : 1.45, GridUnitType.Star);
            columns.ColumnDefinitions[1].Width = single ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
            Grid.SetColumn(right, single ? 0 : 1); Grid.SetRow(right, single ? 1 : 0);
            greetingTitle.FontSize = compact ? 29 : 32; greetingTitle.LineHeight = greetingTitle.FontSize * 1.2;
        };
        var footer = DashboardRow(OriginalIcon.Create("leaf", 16, ColorBrush("#99A38E")), DashboardText("Você não precisa aprender tudo hoje. Só precisa continuar.", 10, ColorBrush("#99A38E"))); footer.Spacing = 8; footer.HorizontalAlignment = HorizontalAlignment.Center; footer.Margin = new Thickness(0, 27, 0, 0);
        var recado = CoachSurface(true); recado.Margin = new Thickness(0, 22, 0, 0);
        var page = Column(intro, heroCard, stats, recado, columns, footer); page.Spacing = 0; return page;
    }
}
