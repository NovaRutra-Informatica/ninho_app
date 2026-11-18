using System.Globalization;
using System.Text.Json;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private DateTime agendaMonth = new(DateTime.Today.Year, DateTime.Today.Month, 1);
    private DateTime agendaDay = DateTime.Today;
    private static readonly CultureInfo PlanningCulture = CultureInfo.GetCultureInfo("pt-BR");
    private TextBlock PlanningEyebrow(string text)
    {
        var block = StudyText(text, 9, muted: true, bold: true); block.FontWeight = FontWeights.Bold; block.CharacterSpacing = 200; return block;
    }
    private Grid PlanningHeading(string title, string description, FrameworkElement actions)
    {
        var heading = DashboardText(title, 32, display: true); heading.LineHeight = 38.4; heading.CharacterSpacing = -31;
        var text = StudyText(description, 13, muted: true); text.LineHeight = 21.45; text.Margin = new Thickness(0, 8, 0, 0);
        actions.VerticalAlignment = VerticalAlignment.Center;
        var grid = StudyBetween(StudyStack(0, heading, text), actions, 22); grid.Margin = new Thickness(0, 0, 0, 27); return grid;
    }
    private Button PlanningButton(string label, string? icon, Func<Task> action, bool primary = false)
    {
        var color = primary ? DashboardSurface : DashboardInk;
        var text = StudyText(label, 12, bold: true); text.Foreground = color; text.LineHeight = 15.6;
        var content = icon == null ? (UIElement)text : DashboardRow(OriginalIcon.Create(icon, 17, color), text); content.IsHitTestVisible = false;
        var button = StudyPlain(label, content, action); button.Padding = new Thickness(17, 11, 17, 11); button.MinHeight = 42;
        button.Background = primary ? DashboardGreen : DashboardSurface; button.BorderBrush = primary ? DashboardGreen : DashboardLine;
        button.BorderThickness = new Thickness(1); button.CornerRadius = new CornerRadius(10); return button;
    }
    private Button PlanningIconButton(string label, string icon, Func<Task> action, double size = 17)
    {
        var button = StudyIconButton(label, icon, action, size); button.HorizontalContentAlignment = HorizontalAlignment.Center;
        button.PointerEntered += (_, _) => button.Background = StudyMint;
        button.PointerExited += (_, _) => button.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent); return button;
    }
    private static Ellipse CalendarDot(string color) => new() { Width = 4, Height = 4, Fill = ColorBrush(color), VerticalAlignment = VerticalAlignment.Center };

    private Grid PlanningSplit(FrameworkElement left, FrameworkElement right, double ratio)
    {
        var grid = new Grid { ColumnSpacing = 22, RowSpacing = 22 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(ratio, GridUnitType.Star) }); grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.Children.Add(left); Grid.SetColumn(right, 1); grid.Children.Add(right);
        bool? stacked = null;
        grid.SizeChanged += (_, args) =>
        {
            var compact = args.NewSize.Width < 630; if (stacked == compact) return; stacked = compact;
            grid.ColumnSpacing = compact ? 0 : 22; grid.ColumnDefinitions[0].Width = new GridLength(compact ? 1 : ratio, GridUnitType.Star);
            grid.ColumnDefinitions[1].Width = compact ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
            Grid.SetColumn(right, compact ? 0 : 1); Grid.SetRow(right, compact ? 1 : 0);
        };
        return grid;
    }
    private static void PlanningReconcile(Panel target, IReadOnlyList<UIElement> desired)
    {
        for (var index = target.Children.Count - 1; index >= 0; index--) if (!desired.Contains(target.Children[index])) target.Children.RemoveAt(index);
        for (var index = 0; index < desired.Count; index++)
        {
            if (index < target.Children.Count && ReferenceEquals(target.Children[index], desired[index])) continue;
            if (target.Children.Contains(desired[index])) target.Children.Remove(desired[index]);
            target.Children.Insert(index, desired[index]);
        }
    }
    private Border PlanningBadge(string text, bool coral = false, string? icon = null)
    {
        var foreground = coral ? ColorBrush(DashboardDark ? "#E5B0A1" : "#A86D54") : DashboardGreen;
        var label = StudyText(text, 9, bold: true); label.Foreground = foreground;
        return new Border { Child = icon == null ? label : DashboardRow(OriginalIcon.Create(icon, 15, foreground), label), Background = coral ? ColorBrush(DashboardDark ? "#43312F" : "#FAECE6") : StudyMint, Padding = new Thickness(9, 6, 9, 6), CornerRadius = new CornerRadius(6), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Left };
    }
    private StackPanel AgendaPage()
    {
        var actions = DashboardRow(PlanningButton("Nova tarefa", "plus", () => EditAgenda(false)), PlanningButton("Marcar prova", "calendar-days", () => EditAgenda(true), true));
        var page = StudyStack(0, PlanningHeading("Um pouco de plano. Mais tranquilidade.", "Provas, compromissos e pequenos passos para chegar preparado.", actions));
        var monthTitle = DashboardText("", 23, display: true); monthTitle.CharacterSpacing = -22; monthTitle.Margin = new Thickness(0, 9, 0, 0);
        var calendarGrid = new Grid { ColumnSpacing = 5, RowSpacing = 5 };
        for (var index = 0; index < 7; index++) calendarGrid.ColumnDefinitions.Add(new ColumnDefinition());
        var dayButtons = new Dictionary<DateTime, (Button Button, TextBlock Number, Ellipse Exam, Ellipse Task)>();
        var monthRendered = DateTime.MinValue;
        var dayEyebrow = PlanningEyebrow(""); var dayTitle = DashboardText("", 22, display: true); dayTitle.CharacterSpacing = -23; dayTitle.Margin = new Thickness(0, 10, 0, 0);
        var dayItems = StudyStack(0); var dayCache = new Dictionary<string, (string Signature, UIElement Element)>();
        var examCache = new Dictionary<string, (string Signature, UIElement Element)>();
        var examList = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 380, Gap = 15 }; var pending = StudyText("", 12, muted: true);
        var emptyDay = PlanningEmpty("Um espaço livre.", "Planeje uma pequena ação para este dia.", "Adicionar tarefa", () => EditAgenda(false), compact: true);
        var emptyExams = DashboardPanel(PlanningEmpty("Qual é a sua próxima prova?", "Adicione as datas da Mauá e dos concursos. Elas aparecerão aqui e na sua tela inicial.", "Marcar primeira prova", () => EditAgenda(true), icon: "calendar-days"), new Thickness(0));
        void UpdateSelectionAndDots()
        {
            var exams = State.Exams.Where(x => !x.Completed).Select(x => x.Date).ToHashSet(); var tasks = State.Tasks.Where(x => !x.Completed).Select(x => x.Date).ToHashSet();
            foreach (var (date, cell) in dayButtons)
            {
                var selected = date == agendaDay; var key = date.ToString("yyyy-MM-dd");
                cell.Button.Background = selected ? DashboardGreen : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
                cell.Button.BorderBrush = date == DateTime.Today ? ColorBrush("#BBD0AF") : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
                cell.Number.Foreground = selected ? DashboardSurface : DashboardInk;
                cell.Exam.Visibility = exams.Contains(key) ? Visibility.Visible : Visibility.Collapsed; cell.Task.Visibility = tasks.Contains(key) ? Visibility.Visible : Visibility.Collapsed;
                AutomationProperties.SetItemStatus(cell.Button, selected ? "Selecionado" : "");
                AutomationProperties.SetHelpText(cell.Button, (exams.Contains(key) ? "Com prova. " : "") + (tasks.Contains(key) ? "Com tarefa." : ""));
            }
        }
        void FillDay()
        {
            dayEyebrow.Text = agendaDay == DateTime.Today ? "HOJE" : "DIA SELECIONADO"; dayTitle.Text = agendaDay.ToString("d 'de' MMMM", PlanningCulture);
            var key = agendaDay.ToString("yyyy-MM-dd"); var desired = new List<UIElement>(); var live = new HashSet<string>();
            foreach (var exam in State.Exams.Where(x => x.Date == key).OrderBy(x => x.Time))
            {
                var id = "exam:" + exam.Id; var signature = JsonSerializer.Serialize(exam); live.Add(id);
                if (!dayCache.TryGetValue(id, out var cached) || cached.Signature != signature) dayCache[id] = cached = (signature, AgendaDayExam(exam));
                desired.Add(cached.Element);
            }
            foreach (var task in State.Tasks.Where(x => x.Date == key))
            {
                var id = "task:" + task.Id; var signature = JsonSerializer.Serialize(task); live.Add(id);
                if (!dayCache.TryGetValue(id, out var cached) || cached.Signature != signature) dayCache[id] = cached = (signature, AgendaDayTask(task));
                desired.Add(cached.Element);
            }
            foreach (var id in dayCache.Keys.Where(x => !live.Contains(x)).ToArray()) dayCache.Remove(id);
            if (desired.Count == 0) desired.Add(emptyDay); PlanningReconcile(dayItems, desired);
        }
        void FillCalendar()
        {
            if (monthRendered == agendaMonth) { UpdateSelectionAndDots(); return; }
            monthRendered = agendaMonth; var text = agendaMonth.ToString("MMMM 'de' yyyy", PlanningCulture); monthTitle.Text = char.ToUpper(text[0], PlanningCulture) + text[1..];
            calendarGrid.Children.Clear(); calendarGrid.RowDefinitions.Clear(); dayButtons.Clear(); calendarGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var offset = ((int)agendaMonth.DayOfWeek + 6) % 7; var count = DateTime.DaysInMonth(agendaMonth.Year, agendaMonth.Month); var slots = (int)Math.Ceiling((offset + count) / 7d) * 7;
            for (var index = 0; index < slots / 7; index++) calendarGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var weekdays = new[] { "SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM" };
            for (var index = 0; index < 7; index++)
            {
                var label = StudyText(weekdays[index], 8, muted: true, bold: true); label.CharacterSpacing = 125; label.HorizontalAlignment = HorizontalAlignment.Center; label.Margin = new Thickness(0, 0, 0, 12);
                Grid.SetColumn(label, index); calendarGrid.Children.Add(label);
            }
            for (var slot = 0; slot < slots; slot++)
            {
                var number = slot - offset + 1; FrameworkElement element;
                if (number < 1 || number > count) element = new Border { Height = 54 };
                else
                {
                    var date = new DateTime(agendaMonth.Year, agendaMonth.Month, number); var label = StudyText(number.ToString(), 12); label.HorizontalAlignment = HorizontalAlignment.Center;
                    var examDot = CalendarDot("#D69379"); var taskDot = CalendarDot("#A4B87D"); var dots = DashboardRow(examDot, taskDot); dots.Spacing = 3; dots.Height = 4; dots.HorizontalAlignment = HorizontalAlignment.Center;
                    var content = StudyStack(5, label, dots); content.IsHitTestVisible = false;
                    var button = StudyPlain(date.ToString("d 'de' MMMM yyyy", PlanningCulture), content, () => { agendaDay = date; PlayNavigationSound(); UpdateSelectionAndDots(); FillDay(); AnimateLocalChange(dayItems); return Task.CompletedTask; });
                    button.Height = 54; button.CornerRadius = new CornerRadius(10); button.BorderThickness = new Thickness(1); button.HorizontalAlignment = HorizontalAlignment.Stretch; button.HorizontalContentAlignment = HorizontalAlignment.Center;
                    button.PointerEntered += (_, _) => { if (date != agendaDay) button.Background = StudySoft; }; button.PointerExited += (_, _) => { if (date != agendaDay) button.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent); };
                    AutomationProperties.SetAutomationId(button, "agenda.day." + date.ToString("yyyy-MM-dd")); dayButtons.Add(date, (button, label, examDot, taskDot)); element = button;
                }
                Grid.SetColumn(element, slot % 7); Grid.SetRow(element, slot / 7 + 1); calendarGrid.Children.Add(element);
            }
            UpdateSelectionAndDots();
        }
        void FillExams()
        {
            pending.Text = $"{State.Exams.Count(x => !x.Completed)} pendentes"; var desired = new List<UIElement>(); var live = new HashSet<string>();
            foreach (var exam in State.Exams.OrderBy(x => x.Date).ThenBy(x => x.Time))
            {
                var signature = JsonSerializer.Serialize(exam) + (State.Subjects.FirstOrDefault(x => x.Id == exam.SubjectId)?.Name ?? "Geral"); live.Add(exam.Id);
                if (!examCache.TryGetValue(exam.Id, out var cached) || cached.Signature != signature) examCache[exam.Id] = cached = (signature, DashboardPanel(ExamElement(exam), new Thickness(20)));
                desired.Add(cached.Element);
            }
            foreach (var id in examCache.Keys.Where(x => !live.Contains(x)).ToArray()) examCache.Remove(id);
            PlanningReconcile(examList, desired); examList.Visibility = desired.Count == 0 ? Visibility.Collapsed : Visibility.Visible; emptyExams.Visibility = desired.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        void RefreshAgenda() { FillCalendar(); FillDay(); FillExams(); }
        var previous = PlanningIconButton("Mês anterior", "chevron-left", () => { if (agendaMonth.Year > 1900 || agendaMonth.Month > 1) agendaMonth = agendaMonth.AddMonths(-1); PlayNavigationSound(); FillCalendar(); AnimateLocalChange(calendarGrid); return Task.CompletedTask; }, 20);
        var today = StudyPlain("Hoje", StudyText("Hoje", 11, bold: true), () => { agendaDay = DateTime.Today; agendaMonth = new(agendaDay.Year, agendaDay.Month, 1); PlayNavigationSound(); FillCalendar(); FillDay(); AnimateLocalChange(calendarGrid); AnimateLocalChange(dayItems); return Task.CompletedTask; });
        today.Padding = new Thickness(0, 4, 0, 4); if (today.Content is TextBlock todayLabel) todayLabel.Foreground = DashboardGreen;
        var next = PlanningIconButton("Próximo mês", "chevron-right", () => { if (agendaMonth.Year < 2200 || agendaMonth.Month < 12) agendaMonth = agendaMonth.AddMonths(1); PlayNavigationSound(); FillCalendar(); AnimateLocalChange(calendarGrid); return Task.CompletedTask; }, 20);
        var calendarHeader = StudyBetween(StudyStack(0, PlanningEyebrow("SEU TEMPO, COM INTENÇÃO"), monthTitle), DashboardRow(previous, today, next), 15); calendarHeader.Margin = new Thickness(0, 0, 0, 25);
        var examLegend = DashboardRow(CalendarDot("#D69379"), StudyText("Prova", 9, muted: true)); examLegend.Spacing = 6; var taskLegend = DashboardRow(CalendarDot("#A4B87D"), StudyText("Tarefa", 9, muted: true)); taskLegend.Spacing = 6;
        var legend = DashboardRow(examLegend, taskLegend); legend.Spacing = 20; legend.HorizontalAlignment = HorizontalAlignment.Center; legend.Margin = new Thickness(0, 20, 0, 0);
        var calendar = DashboardPanel(StudyStack(0, calendarHeader, calendarGrid, legend), new Thickness(25));
        calendar.SizeChanged += (_, _) =>
        {
            var compact = Root.ActualWidth <= 1200;
            calendar.Padding = new Thickness(compact ? 20 : 25);
            foreach (var cell in dayButtons.Values) cell.Button.Height = compact ? 48 : 54;
            foreach (var blank in calendarGrid.Children.OfType<Border>()) blank.Height = compact ? 48 : 54;
            var columns = compact ? 1 : 2;
            if (examList.MaximumColumns != columns) { examList.MaximumColumns = columns; examList.InvalidateMeasure(); }
        };
        var add = StudyLink("Planejar este dia", "plus", () => EditAgenda(false)); add.Margin = new Thickness(0, 23, 0, 0);
        var dayPanel = DashboardPanel(StudyStack(0, dayEyebrow, dayTitle, dayItems, add), new Thickness(25)); page.Children.Add(PlanningSplit(calendar, dayPanel, 1.6));
        var listHeading = StudyBetween(StudyText("Provas e compromissos", 17, bold: true), pending); listHeading.Margin = new Thickness(0, 27, 0, 15);
        page.Children.Add(listHeading); page.Children.Add(examList); page.Children.Add(emptyExams); refreshPage = RefreshAgenda; RefreshAgenda(); return page;
    }
    private Border PlanningEmpty(string title, string description, string actionLabel, Func<Task> action, bool compact = false, string icon = "book-open")
    {
        var graphic = OriginalIcon.Create(icon, icon == "calendar-days" ? 27 : 28, ColorBrush("#9EB094")); graphic.HorizontalAlignment = HorizontalAlignment.Center; graphic.Margin = new Thickness(0, 0, 0, 17);
        var heading = DashboardText(title, compact ? 19 : 21, display: true); heading.TextAlignment = TextAlignment.Center;
        var detail = StudyText(description, 12, muted: true); detail.TextAlignment = TextAlignment.Center; detail.LineHeight = 19.8; detail.Margin = new Thickness(0, 10, 0, 18);
        var button = DashboardButton(actionLabel, "arrow-right", action); button.HorizontalAlignment = HorizontalAlignment.Center; button.Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"];
        if (compact && button.Content is StackPanel row) foreach (var label in row.Children.OfType<TextBlock>()) label.FontSize = 10;
        return new Border { Child = StudyStack(0, graphic, heading, detail, button), Padding = compact ? new Thickness(0, 40, 0, 20) : new Thickness(24, 35, 24, 35), MaxWidth = 470, HorizontalAlignment = HorizontalAlignment.Center };
    }
    private FrameworkElement AgendaDayExam(Exam exam)
    {
        var time = StudyText((exam.Time.Length > 0 ? exam.Time : "Horário a definir") + (exam.Completed ? " · Concluída" : ""), 9, muted: true); time.Margin = new Thickness(0, 5, 0, 0);
        var content = StudyBetween(StudyStack(0, StudyText(exam.Title, 11, bold: true), time), PlanningIconButton("Editar prova", "pencil", () => EditAgenda(true, examId: exam.Id), 15), 10);
        var row = new Grid { ColumnSpacing = 10 }; row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); row.ColumnDefinitions.Add(new ColumnDefinition()); row.Children.Add(OriginalIcon.Create("calendar-days", 20, ColorBrush("#A58B61"))); Grid.SetColumn(content, 1); row.Children.Add(content);
        return new Border { Child = row, Background = StudySoft, Padding = new Thickness(12, 14, 12, 14), CornerRadius = new CornerRadius(10), Margin = new Thickness(0, 20, 0, 0) };
    }
    private FrameworkElement AgendaDayTask(StudyTask task)
    {
        var complete = PlanningIconButton((task.Completed ? "Reabrir tarefa " : "Concluir tarefa ") + task.Title, task.Completed ? "check" : "circle", () => Save(s => { var current = s.Tasks.First(x => x.Id == task.Id); current.Completed = !current.Completed; }), 18); complete.Width = complete.Height = 18;
        if (complete.Content is OriginalIcon checkIcon) checkIcon.Foreground = ColorBrush(task.Completed ? "#60936A" : "#9FAC98");
        var title = StudyText(task.Title, 12, muted: task.Completed); title.VerticalAlignment = VerticalAlignment.Center; if (task.Completed) title.TextDecorations = global::Windows.UI.Text.TextDecorations.Strikethrough;
        var edit = PlanningIconButton("Editar tarefa", "pencil", () => EditAgenda(false, taskId: task.Id), 14); edit.Width = 25; edit.Height = 27;
        var remove = PlanningIconButton("Excluir tarefa", "trash-2", async () => { if (await Confirm("Excluir esta tarefa?", "Este compromisso será removido da sua agenda.")) await Save(s => s.Tasks.RemoveAll(x => x.Id == task.Id)); }, 14); remove.Width = 25; remove.Height = 27;
        var grid = new Grid { ColumnSpacing = 10 }; grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); grid.ColumnDefinitions.Add(new ColumnDefinition()); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.Children.Add(complete); Grid.SetColumn(title, 1); grid.Children.Add(title); Grid.SetColumn(edit, 2); grid.Children.Add(edit); Grid.SetColumn(remove, 3); grid.Children.Add(remove);
        return new Border { Child = grid, Padding = new Thickness(0, 13, 0, 13), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 0, 0, 1) };
    }
    private UIElement ExamElement(Exam exam)
    {
        var date = DateTime.ParseExact(exam.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture); var days = (date.Date - DateTime.Today).Days;
        var day = StudyText(date.ToString("dd"), 23); day.FontWeight = FontWeights.Medium; day.LineHeight = 23; day.TextAlignment = TextAlignment.Center;
        var month = StudyText(date.ToString("MMM", PlanningCulture).ToUpper(PlanningCulture), 9, muted: true); month.TextAlignment = TextAlignment.Center; month.Margin = new Thickness(0, 5, 0, 0);
        var calendar = new Border { Child = StudyStack(0, day, month), Padding = new Thickness(8, 10, 8, 10), CornerRadius = new CornerRadius(10), Background = StudySoft, MinWidth = 47, VerticalAlignment = VerticalAlignment.Center };
        var badge = PlanningBadge(exam.Completed ? "Concluída" : days == 0 ? "É hoje" : days < 0 ? $"Há {-days} dias" : $"Em {days} dias", !exam.Completed && days is >= 0 and <= 7);
        var title = StudyText(exam.Title, 14, bold: true); title.Margin = new Thickness(0, 9, 0, 9); title.LineHeight = 19.6;
        var info = StudyStack(0, StudyBetween(StudyText(State.Subjects.FirstOrDefault(x => x.Id == exam.SubjectId)?.Name ?? "Geral", 9, muted: true), badge, 8), title); var metadata = Row();
        if (exam.Time.Length > 0) { var item = DashboardRow(OriginalIcon.Create("clock-3", 14, DashboardMuted), StudyText(exam.Time, 10, muted: true)); item.Spacing = 4; metadata.Children.Add(item); }
        if (exam.Location.Length > 0) { var item = DashboardRow(OriginalIcon.Create("map-pin", 14, DashboardMuted), StudyText(exam.Location, 10, muted: true)); item.Spacing = 4; metadata.Children.Add(item); }
        if (metadata.Children.Count > 0) info.Children.Add(metadata);
        if (exam.Notes.Length > 0) { var notes = StudyText(exam.Notes, 10, muted: true); notes.Margin = new Thickness(0, 8, 0, 0); info.Children.Add(notes); }
        var actions = StudyStack(2, PlanningIconButton(exam.Completed ? "Reabrir prova" : "Concluir prova", "check", () => Save(s => { var current = s.Exams.First(x => x.Id == exam.Id); current.Completed = !current.Completed; }), 18), PlanningIconButton("Editar prova", "pencil", () => EditAgenda(true, examId: exam.Id)), PlanningIconButton("Excluir prova", "trash-2", async () => { if (await Confirm("Excluir esta prova?", "Este compromisso será removido da sua agenda.")) await Save(s => s.Exams.RemoveAll(x => x.Id == exam.Id)); }));
        info.VerticalAlignment = actions.VerticalAlignment = VerticalAlignment.Center;
        var layout = new Grid { ColumnSpacing = 18, Opacity = exam.Completed ? .65 : 1 }; layout.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); layout.ColumnDefinitions.Add(new ColumnDefinition()); layout.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        layout.Children.Add(calendar); Grid.SetColumn(info, 1); layout.Children.Add(info); Grid.SetColumn(actions, 2); layout.Children.Add(actions); return layout;
    }
    private async Task EditAgenda(bool exam, string? examId = null, string? taskId = null)
    {
        var existingExam = State.Exams.FirstOrDefault(x => x.Id == examId); var existingTask = State.Tasks.FirstOrDefault(x => x.Id == taskId);
        TextBox Input(string value, string placeholder, int maximum) => new() { Text = value, PlaceholderText = placeholder, MaxLength = maximum, FontSize = 12, FontFamily = (FontFamily)Application.Current.Resources["ContentControlThemeFontFamily"], Background = DashboardSurface, Foreground = DashboardInk, BorderBrush = DashboardLine, Padding = new Thickness(12, 11, 12, 11), CornerRadius = new CornerRadius(8), HorizontalAlignment = HorizontalAlignment.Stretch };
        StackPanel Field(string label, FrameworkElement control) { var text = StudyText(label, 12); text.FontWeight = FontWeights.Medium; AutomationProperties.SetName(control, label); return StudyStack(8, text, control); }
        var title = Input(existingExam?.Title ?? existingTask?.Title ?? "", exam ? "Ex.: Prova de Sistemas Distribuídos" : "Ex.: Resolver 10 questões de Redes", 200);
        var selected = DateTime.TryParseExact(existingExam?.Date ?? existingTask?.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) ? parsed : route == "agenda" ? agendaDay : DateTime.Today;
        var date = new CalendarDatePicker { Date = new DateTimeOffset(selected), DateFormat = "{day.integer(2)}/{month.integer(2)}/{year.full}", FontSize = 12, HorizontalAlignment = HorizontalAlignment.Stretch, Background = DashboardSurface, Foreground = DashboardInk, BorderBrush = DashboardLine, Padding = new Thickness(12, 11, 12, 11), CornerRadius = new CornerRadius(8) };
        var subject = SubjectPicker(existingExam?.SubjectId ?? existingTask?.SubjectId ?? (exam ? State.Subjects.FirstOrDefault(x => x.Track == "faculdade")?.Id : ""), true);
        subject.Header = null; subject.MinWidth = 0; subject.MaxWidth = double.PositiveInfinity; subject.FontSize = 12; subject.Padding = new Thickness(12, 11, 12, 11); ((ComboBoxItem)subject.Items[0]).Content = "Geral";
        foreach (var item in subject.Items.OfType<ComboBoxItem>().Skip(1)) { var related = State.Subjects.First(x => x.Id == item.Tag?.ToString()); item.Content = related.Name + " · " + (State.Programs.FirstOrDefault(x => x.Id == related.ProgramId)?.Name ?? "Outros estudos"); }
        var time = Input(existingExam?.Time ?? "", "HH:mm", 5); var location = Input(existingExam?.Location ?? "", "Campus, sala ou endereço", 500);
        var notes = Input(existingExam?.Notes ?? "", "Conteúdo da prova, o que levar, lembretes…", 10000); notes.AcceptsReturn = true; notes.TextWrapping = TextWrapping.Wrap; notes.MinHeight = 86;
        var content = StudyStack(17, Field(exam ? "Nome da prova" : "Tarefa", title));
        if (exam)
        {
            content.Children.Add(Field("Matéria", subject)); var dates = new Grid { ColumnSpacing = 17 }; dates.ColumnDefinitions.Add(new ColumnDefinition()); dates.ColumnDefinitions.Add(new ColumnDefinition());
            dates.Children.Add(Field("Data", date)); var timeField = Field("Horário", time); Grid.SetColumn(timeField, 1); dates.Children.Add(timeField); content.Children.Add(dates);
            content.Children.Add(Field("Local", location)); content.Children.Add(Field("Observações", notes));
        }
        else { content.Children.Add(Field("Data", date)); content.Children.Add(Field("Matéria", subject)); }
        var error = StudyText("", 12); error.Foreground = ColorBrush(DashboardDark ? "#E5B0A1" : "#A14434"); error.Visibility = Visibility.Collapsed; content.Children.Add(error);
        var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, RequestedTheme = Root.ActualTheme, Background = DashboardSurface, BorderBrush = DashboardLine, CornerRadius = new CornerRadius(20) };
        ObserveInteractions(dialog);
        var heading = DashboardText(exam ? existingExam == null ? "Uma prova no horizonte" : "Editar prova" : existingTask == null ? "Um passo de cada vez" : "Editar tarefa", 24, display: true); heading.LineHeight = 37.2; var headingCopy = StudyStack(0, heading);
        if (exam) { var subtitle = StudyText("Tenha tempo para se preparar, sem depender da memória.", 11, muted: true); subtitle.Margin = new Thickness(0, 7, 0, 0); headingCopy.Children.Add(subtitle); }
        var close = new Button { Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"], Content = OriginalIcon.Create("x", 18, DashboardMuted), Width = 33, Height = 33, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -5, -5, 0) }; AutomationProperties.SetName(close, "Fechar"); close.Click += (_, _) => dialog.Hide(); dialog.Title = StudyBetween(headingCopy, close, 15);
        Button FooterButton(string label, bool primary)
        {
            var text = StudyText(label, 12, bold: true); text.Foreground = primary ? DashboardSurface : DashboardInk;
            var button = new Button { Content = text, Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"], Background = primary ? DashboardGreen : DashboardSurface, BorderBrush = primary ? DashboardGreen : DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), Padding = new Thickness(17, 11, 17, 11), MinHeight = 42 }; AutomationProperties.SetName(button, label); return button;
        }
        var cancel = FooterButton("Cancelar", false); cancel.Click += (_, _) => dialog.Hide(); var submit = FooterButton(exam ? "Salvar prova" : "Salvar tarefa", true);
        var buttons = DashboardRow(cancel, submit); buttons.Spacing = 10; buttons.HorizontalAlignment = HorizontalAlignment.Right;
        content.Children.Add(new Border { Child = buttons, Padding = new Thickness(0, 20, 0, 0), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 1, 0, 0), Margin = new Thickness(0, 8, 0, 0) }); var saving = false;
        submit.Click += async (_, _) =>
        {
            if (saving) return; saving = true; submit.IsEnabled = cancel.IsEnabled = close.IsEnabled = false; error.Visibility = Visibility.Collapsed;
            try
            {
                if (string.IsNullOrWhiteSpace(title.Text) || date.Date == null || exam && time.Text.Length > 0 && !TimeOnly.TryParseExact(time.Text, "HH:mm", out _)) throw new InvalidDataException("Confira o título, a data e o horário.");
                await Save(s =>
                {
                    if (exam) { var current = existingExam == null ? new Exam() : s.Exams.First(x => x.Id == existingExam.Id); if (existingExam == null) s.Exams.Add(current); current.Title = title.Text.Trim(); current.Date = date.Date.Value.ToString("yyyy-MM-dd"); current.SubjectId = Choice(subject); current.Time = time.Text; current.Location = location.Text.Trim(); current.Notes = notes.Text; }
                    else { var current = existingTask == null ? new StudyTask() : s.Tasks.First(x => x.Id == existingTask.Id); if (existingTask == null) s.Tasks.Add(current); current.Title = title.Text.Trim(); current.Date = date.Date.Value.ToString("yyyy-MM-dd"); current.SubjectId = Choice(subject); }
                });
                ShowNotice(exam ? "Prova salva na agenda." : "Tarefa salva."); saving = false; dialog.Hide();
            }
            catch (Exception failure) { error.Text = failure.Message; error.Visibility = Visibility.Visible; }
            finally { saving = false; submit.IsEnabled = cancel.IsEnabled = close.IsEnabled = true; }
        };
        dialog.Closing += (_, args) => { if (saving) args.Cancel = true; };
        dialog.Content = new ScrollViewer { Content = content, MaxHeight = Math.Max(230, Root.ActualHeight - 245), HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        dialog.Resources["ContentDialogMinWidth"] = Math.Min(550d, Math.Max(320d, Root.ActualWidth - 56)); dialog.Resources["ContentDialogMaxWidth"] = 550d; dialog.Resources["ContentDialogMaxHeight"] = Math.Max(350, Root.ActualHeight - 56);
        dialog.Resources["ContentDialogPadding"] = new Thickness(28); dialog.Resources["ContentDialogTitleMargin"] = new Thickness(0, 0, 0, 25); dialog.Resources["ContentDialogTopOverlay"] = DashboardSurface;
        StyleNinhoDialog(dialog);
        await dialog.ShowAsync();
    }
}
