using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Automation;
using Ninho.Core;
using FocusState = Ninho.Core.FocusState;
using Windows.Storage.Pickers;
using Windows.Storage;
using Windows.System;
using Windows.Graphics;

namespace Ninho.Windows;

public sealed partial class MainWindow : Window
{
    private readonly StudyStore store;
    private readonly DispatcherTimer clock = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly LocalModel model = new();
    private CancellationTokenSource? generation;
    private string route = "today";
    private string renderedRoute = "";
    private Action? refreshPage;
    private string? selectedSubject;
    private bool ready, busy, completionPending;
    private TextBlock? timerText;
    private ProgressBar? timerProgress;
    private ProgressRing? timerRing;
    private int previewMinutes;
    private bool previewStopwatch;
    private string feedbackDraft = "";
    private readonly Dictionary<string, string> sessionFeedbackDrafts = [];
    private StudyState State => store.State;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Ninho — estudos";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(TitleBar);
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "icon.ico"));
        var overridePath = Environment.GetEnvironmentVariable("NINHO_DATA_DIR");
        store = new StudyStore(overridePath ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ninho", "native"));
        var starting = false;
        async Task StartLibrary()
        {
            if (ready || starting || licenseWindowClosed) return;
            starting = true;
            var scale = Root.XamlRoot.RasterizationScale;
            var area = Microsoft.UI.Windowing.DisplayArea.GetFromWindowId(AppWindow.Id, Microsoft.UI.Windowing.DisplayAreaFallback.Primary).WorkArea;
            AppWindow.Resize(new SizeInt32(Math.Min(area.Width, (int)(1180 * scale)), Math.Min(area.Height, (int)(820 * scale))));
            try
            {
                Navigation.IsEnabled = false;
                PageHost.Content = new ProgressRing { IsActive = true, Width = 36, Height = 36, Margin = new Thickness(40) };
                if (!await EnsurePurchase(StartLibrary) || licenseWindowClosed) return;
                await InitializeDailyBackups(overridePath);
                if (licenseWindowClosed) return;
                await store.LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets", "seed.json"), overridePath == null ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Ninho") : null);
                if (licenseWindowClosed) return;
                ready = true;
                ApplyTheme();
                Navigation.SelectedItem = Navigation.MenuItems[0];
                await ResumeWelcome();
                if (licenseWindowClosed) return;
                await InitializeCoach();
                if (licenseWindowClosed) return;
                await SaveDailyBackup();
                if (licenseWindowClosed) return;
                Navigation.IsEnabled = true;
                Notice.IsOpen = false; Notice.Visibility = Visibility.Collapsed;
                Render();
                UpdateClock();
                if (State.Focus.RunningSince != null) clock.Start();
                if (store.MigrationMessage is { } message) ShowNotice(message, InfoBarSeverity.Success);
                await RunPerformanceDiagnostics();
            }
            catch (Exception error)
            {
                if (licenseWindowClosed) return;
                ready = false;
                PageHost.Content = Column(Heading("Seus dados precisam de atenção"), Body("O arquivo não foi substituído. Confira a pasta de backup e aguarde a sincronização antes de tentar novamente."), Body(error.Message), Body(store.DirectoryPath), ActionButton("Tentar novamente", StartLibrary));
                Navigation.IsEnabled = true;
                ShowNotice("Não foi possível abrir os estudos. Os dados foram preservados.", InfoBarSeverity.Error);
            }
            finally { starting = false; }
        }
        Root.Loaded += async (_, _) => await StartLibrary();
        clock.Tick += (_, _) => UpdateClock();
        Root.SizeChanged += (_, _) =>
        {
            var narrow = Root.ActualWidth < 900;
            Navigation.PaneDisplayMode = narrow ? NavigationViewPaneDisplayMode.LeftMinimal : NavigationViewPaneDisplayMode.Left;
            Navigation.IsPaneToggleButtonVisible = ready && narrow && route != "welcome";
            if (!ready) Navigation.IsPaneVisible = false;
            PageFrame.Padding = narrow ? new Thickness(24, 30, 24, 24) : new Thickness(45, 39, 45, 24);
        };
        Activated += (_, args) => CoachActivation(args.WindowActivationState != WindowActivationState.Deactivated);
        Closed += (_, _) => { ClosePurchase(); dailyBackupDelay.Stop(); dailyBackupClock.Stop(); StopPageMotion(); coachAnalysis?.Cancel(); usageClock.Stop(); generation?.Cancel(); profileGeneration?.Cancel(); modelDiscoveryLifetime.Cancel(); clock.Stop(); ninhoSound?.Dispose(); navigationSound?.Dispose(); navigationAudio?.Dispose(); };
        InitializeSidebarMotion();
        AppWindow.Closing += async (_, args) =>
        {
            if (closingAfterSave) return;
            ObserveUsage(false);
            if (pendingLocalEdits.PendingCount == 0 && localEdits.IsCompletedSuccessfully && coachWrites.IsCompleted && dailyBackups == null) return;
            args.Cancel = true;
            Navigation.IsEnabled = false;
            try
            {
                Task edits;
                do { edits = FlushLocalEdits(); await edits; } while (pendingLocalEdits.PendingCount > 0 || edits != localEdits);
                await coachWrites; await SaveDailyBackup(); closingAfterSave = true; Close();
            }
            catch { ShowNotice("Uma alteração ainda não foi salva. Confira os campos antes de fechar.", InfoBarSeverity.Error); }
            finally { if (!closingAfterSave && !licenseWindowClosed) Navigation.IsEnabled = true; }
        };
    }

    private void NavigationInvoked(NavigationView sender, NavigationViewItemInvokedEventArgs args)
    {
        if (!ready || tutorialVisible) return;
        if (ready && route == "welcome") return;
        var previousRoute = route;
        route = args.IsSettingsInvoked ? "settings" : args.InvokedItemContainer?.Tag?.ToString() ?? "today";
        if (previousRoute != route) { ObserveUsage(true); PlayNavigationSound(); }
        if (route == "studies") { studyProgramId = studySubjectId = studyQuery = ""; studyStatus = "all"; studyTab = "lessons"; }
        if (ready) Render();
        PageScroll.ChangeView(null, 0, null, true);
    }
    private void OpenTimer(object sender, RoutedEventArgs e) => Navigate("timer");
    private void OpenHome(object sender, RoutedEventArgs e) => Navigate("today");
    private void OpenSettings(object sender, RoutedEventArgs e) => Navigate("settings");
    private void OpenProfile(object sender, RoutedEventArgs e) => Navigate("profile");
    private void Navigate(string page)
    {
        if (!ready || tutorialVisible) return;
        if (route == "welcome" && page != "welcome") return;
        var changed = route != page; route = page;
        if (changed) { ObserveUsage(true); PlayNavigationSound(); }
        Navigation.SelectedItem = Navigation.MenuItems.OfType<NavigationViewItem>().FirstOrDefault(x => x.Tag?.ToString() == page);
        if (Navigation.PaneDisplayMode == NavigationViewPaneDisplayMode.LeftMinimal) Navigation.IsPaneOpen = false;
        Render();
        PageScroll.ChangeView(null, 0, null, true);
    }
    private void Render(bool force = false)
    {
        if (licenseWindowClosed) return;
        if (!force && renderedRoute == route && refreshPage != null) { refreshPage(); UpdateClock(); return; }
        Navigation.IsPaneVisible = route != "welcome";
        Navigation.IsPaneToggleButtonVisible = route != "welcome" && Root.ActualWidth < 900;
        if (route != "welcome" && Root.ActualWidth >= 900) Navigation.IsPaneOpen = true;
        var location = PageLocation();
        var navigating = renderedPageLocation != location;
        renderedPageLocation = location;
        renderedRoute = route;
        refreshPage = null;
        timerText = null;
        timerProgress = null;
        timerRing = null;
        ProfileName.Text = State.Settings.Name; ProfileAvatar.Text = State.Settings.Name.Trim().FirstOrDefault('A').ToString().ToUpperInvariant();
        RefreshNavigation();
        var content = route switch
        {
            "timer" => TimerPage(), "studies" => StudiesPage(), "reviews" => ReviewsPage(),
            "materials" => MaterialsPage(), "progress" => ProgressPage(), "mentor" => MentorPage(),
            "settings" => SettingsPage(), "agenda" => AgendaPage(), "profile" => ProfilePage(), "welcome" => WelcomePage(), _ => TodayPage()
        };
        PageHost.Content = content;
        if (navigating) { AnimatePageChange(content); if (ready && route != "welcome") PlayNavigationSound(); }
        ShowPageTutorial();
        UpdateClock();
    }
    private void PageSizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (PageHost != null) PageHost.Width = Math.Max(240, Math.Min(1300, e.NewSize.Width));
    }
    private void ApplyTheme()
    {
        Root.RequestedTheme = State.Settings.Theme switch { "dark" => ElementTheme.Dark, "light" => ElementTheme.Light, _ => ElementTheme.Default };
        ElementSoundPlayer.State = ElementSoundPlayerState.Off;
        var accent = ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#A8D7BC" : "#235E50");
        foreach (var key in new[] { "AccentFillColorDefaultBrush", "AccentFillColorSecondaryBrush", "AccentFillColorTertiaryBrush", "SystemControlHighlightAccentBrush", "SystemControlHighlightAltAccentBrush", "ToggleSwitchFillOn", "ToggleSwitchFillOnPointerOver", "ToggleSwitchFillOnPressed" }) Root.Resources[key] = accent;
    }
    private void RefreshNavigation()
    {
        var entries = new[] { ("today", "Hoje", "home"), ("studies", "Meus estudos", "book-open"), ("reviews", "Revisões", "brain"), ("materials", "Materiais", "folder-open"), ("agenda", "Agenda", "calendar-days"), ("progress", "Progresso", "trending-up"), ("mentor", "Minha assistente", "sparkles") };
        var due = StudyEngine.DueCards(State, DateTimeOffset.Now).Count();
        foreach (var entry in entries)
        {
            var item = Navigation.MenuItems.OfType<NavigationViewItem>().First(x => x.Tag?.ToString() == entry.Item1);
            var active = route == entry.Item1;
            var brush = active ? DashboardGreen : DashboardMuted;
            item.Background = active ? ColorBrush(DashboardDark ? "#303A37" : "#E9F2E8") : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
            item.BorderBrush = active ? DashboardGreen : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
            item.BorderThickness = new Thickness(3, 0, 0, 0);
            item.Foreground = brush;
            var content = new Grid { ColumnSpacing = 13 };
            content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(20) });
            content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            content.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            content.Children.Add(OriginalIcon.Create(entry.Item3, 20, brush));
            var label = new TextBlock { Text = entry.Item2, FontSize = 13, Foreground = brush, VerticalAlignment = VerticalAlignment.Center,
                FontWeight = active ? Microsoft.UI.Text.FontWeights.Bold : Microsoft.UI.Text.FontWeights.Medium,
                FontFamily = (FontFamily)Application.Current.Resources[active ? "NinhoBoldFont" : "NinhoMediumFont"] };
            Grid.SetColumn(label, 1); content.Children.Add(label);
            if (entry.Item1 == "reviews" && due > 0)
            {
                var badge = new Border { Background = DashboardGreen, CornerRadius = new CornerRadius(6), MinWidth = 22, Padding = new Thickness(5, 3, 5, 3), VerticalAlignment = VerticalAlignment.Center,
                    Child = new TextBlock { Text = due.ToString(), FontSize = 10, Foreground = DashboardSurface, HorizontalAlignment = HorizontalAlignment.Center } };
                Grid.SetColumn(badge, 2); content.Children.Add(badge);
            }
            item.Content = content;
        }
        SettingsNavigation.Background = route == "settings" ? ColorBrush(DashboardDark ? "#303A37" : "#E9F2E8") : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        SettingsNavigation.BorderBrush = route == "settings" ? DashboardGreen : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        SettingsNavigation.BorderThickness = new Thickness(3, 0, 0, 0);
    }
    private void ShowNotice(string message, InfoBarSeverity severity = InfoBarSeverity.Informational)
    { if (licenseWindowClosed) return; Notice.Message = message; Notice.Severity = severity; Notice.Visibility = Visibility.Visible; Notice.IsOpen = true; }
    private void NoticeClosed(InfoBar sender, InfoBarClosedEventArgs args) => sender.Visibility = Visibility.Collapsed;
    private async Task Run(Func<Task> action)
    {
        if (busy) return;
        busy = true;
        try { await action(); }
        catch (Exception error) { ShowNotice(error.Message, InfoBarSeverity.Error); }
        finally { busy = false; }
    }
    private async Task Save(Action<StudyState> change, bool redraw = true, bool immediateBackup = false)
    {
        if (!licenseAccepted) throw new InvalidOperationException("Ative sua compra para abrir os estudos.");
        await store.ChangeAsync(change);
        if (immediateBackup) await SaveDailyBackup(); else QueueDailyBackup();
        QueueCoachRefresh();
        if (redraw) Render();
    }
    private Button ActionButton(string label, Func<Task> action, bool accent = false)
    {
        var button = new Button { Content = label, VerticalAlignment = VerticalAlignment.Center };
        AutomationProperties.SetName(button, label);
        if (accent) button.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
        button.Click += async (_, _) => await Run(action);
        return button;
    }
    private static StackPanel Column(params UIElement[] items)
    {
        var panel = new StackPanel { Spacing = 16, HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var item in items) panel.Children.Add(item);
        return panel;
    }
    private static FlowPanel Row(params UIElement[] items)
    {
        var panel = new FlowPanel();
        foreach (var item in items) panel.Children.Add(item);
        return panel;
    }
    private static TextBlock Text(string text, double size = 14) => UseOriginalTextFace(new() { Text = text, FontSize = size, TextWrapping = TextWrapping.Wrap });
    private static TextBlock UseOriginalTextFace(TextBlock text)
    {
        void Update()
        {
            if (text.FontFamily.Source.Contains("Fraunces", StringComparison.OrdinalIgnoreCase)) return;
            var weight = text.FontWeight.Weight;
            text.FontFamily = (FontFamily)Application.Current.Resources[weight >= 700 ? "NinhoBoldFont" : weight >= 600 ? "NinhoSemiBoldFont" : weight >= 500 ? "NinhoMediumFont" : "ContentControlThemeFontFamily"];
        }
        text.RegisterPropertyChangedCallback(TextBlock.FontWeightProperty, (_, _) => Update()); Update(); return text;
    }
    private static TextBlock Heading(string text) { var t = Text(text, 32); t.FontFamily = (FontFamily)Application.Current.Resources["NinhoDisplayFont"]; t.FontWeight = Microsoft.UI.Text.FontWeights.Medium; return t; }
    private static TextBlock TitleText(string text) { var t = Text(text, 19); t.FontFamily = (FontFamily)Application.Current.Resources["NinhoSemiBoldFont"]; t.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold; return t; }
    private static TextBlock Body(string text) { var t = Text(text); t.Opacity = .75; t.LineHeight = 22; return t; }
    private static Border Card(UIElement content) => new() { Child = content, Style = (Style)Application.Current.Resources["NinhoCardStyle"] };
    private static OwlControl Owl(double size) => new() { Width = size, Height = size };
    private ComboBox SubjectPicker(string? id = null, bool all = false)
    {
        var picker = new ComboBox { Header = "Matéria", MinWidth = 220, MaxWidth = 460, HorizontalAlignment = HorizontalAlignment.Stretch };
        if (all) picker.Items.Add(new ComboBoxItem { Content = "Todas as matérias", Tag = "" });
        foreach (var subject in State.Subjects) picker.Items.Add(new ComboBoxItem { Content = subject.Name, Tag = subject.Id });
        picker.SelectedItem = picker.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == id) ?? picker.Items.FirstOrDefault();
        return picker;
    }
    private static string Choice(ComboBox picker) => (picker.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
    private static string Minutes(double minutes)
    {
        if (minutes > 0 && minutes < 1) return $"{Math.Max(1, (int)Math.Round(minutes * 60))} s";
        var rounded = (int)Math.Round(minutes);
        return rounded >= 60 ? $"{rounded / 60} h {rounded % 60} min" : $"{rounded} min";
    }
    private string SubjectName(string id) => State.Subjects.FirstOrDefault(x => x.Id == id)?.Name ?? "Estudo livre";

    private Border RecommendationCard(Recommendation insight) => Card(Column(TitleText(insight.Name), Body(insight.Reason), Row(
        ActionButton("Estudar", async () =>
        {
            if (State.Focus.Elapsed(DateTimeOffset.Now) > 0 || State.Focus.RunningSince != null)
            {
                if (State.Focus.SubjectId != insight.SubjectId) ShowNotice("Conclua ou descarte a sessão atual antes de trocar de matéria.");
                Navigate("timer"); return;
            }
            await Save(s => { s.Focus.SubjectId = insight.SubjectId; s.Focus.LessonId = ""; }, false); Navigate("timer");
        }, true), ActionButton("Revisar", () => { selectedSubject = insight.SubjectId; Navigate("reviews"); return Task.CompletedTask; }))));

    private async Task CompleteFocus()
    {
        var drafts = sessionFeedbackDrafts.ToArray();
        await Save(s =>
        {
            foreach (var item in drafts)
                if (s.Sessions.FirstOrDefault(x => x.Id == item.Key) is { } session) session.Feedback = item.Value.Trim();
            StudyEngine.FinishFocus(s, DateTimeOffset.Now, feedbackDraft);
        }, false, immediateBackup: true);
        foreach (var item in drafts) if (sessionFeedbackDrafts.GetValueOrDefault(item.Key) == item.Value) sessionFeedbackDrafts.Remove(item.Key);
        feedbackDraft = "";
    }
    private void UpdateClock()
    {
        if (!ready) return;
        var focus = State.Focus;
        var elapsed = focus.Elapsed(DateTimeOffset.Now);
        var preview = route == "timer" && focus.RunningSince == null && elapsed == 0;
        var seconds = (preview ? previewStopwatch : focus.Stopwatch) ? elapsed : Math.Max(0, (preview ? previewMinutes : focus.TargetMinutes) * 60 - elapsed);
        var time = TimeSpan.FromSeconds(Math.Ceiling(seconds));
        var label = time.TotalHours >= 1 ? time.ToString(@"hh\:mm\:ss") : time.ToString(@"mm\:ss");
        SidebarFocusTitle.Text = focus.RunningSince != null ? label : "Hora de focar";
        SidebarFocusDetail.Text = focus.RunningSince != null ? "Seu tempo está correndo" : "Um minuto de cada vez";
        if (timerText != null) timerText.Text = label;
        if (timerProgress != null) timerProgress.Value = focus.Stopwatch ? 0 : elapsed / (focus.TargetMinutes * 60);
        if (timerRing != null) timerRing.Value = focus.Stopwatch ? 0 : elapsed / (focus.TargetMinutes * 60);
        FocusPill.Visibility = route != "welcome" && (elapsed > 0 || focus.RunningSince != null) ? Visibility.Visible : Visibility.Collapsed;
        FocusPill.Content = $"{(focus.RunningSince != null ? "Em foco" : "Sessão pausada")}  ·  {SubjectName(focus.SubjectId)}  ·  {label}  —  Abrir temporizador";
        if (!focus.Stopwatch && elapsed >= focus.TargetMinutes * 60 && focus.RunningSince != null && !completionPending && !busy)
        {
            completionPending = true;
            _ = Run(async () =>
            {
                try
                {
                    await CompleteFocus(); Render(); clock.Stop();
                    ShowNotice(focus.IsBreak ? "Pausa concluída. Seu próximo foco está pronto." : "Sessão salva. Faça uma pausa e registre como foi.", InfoBarSeverity.Success);
                    PlayNinhoSound();
                }
                finally { completionPending = false; }
            });
        }
    }

    private async Task AddSubject()
    {
        var name = new TextBox { Header = "Nome da matéria", MaxLength = 120 };
        var program = new ComboBox { Header = "Objetivo", MinWidth = 280 };
        foreach (var p in State.Programs) program.Items.Add(new ComboBoxItem { Content = p.Name, Tag = p.Id });
        program.Items.Add(new ComboBoxItem { Content = "Novo objetivo pessoal", Tag = "" }); program.SelectedIndex = 0;
        var goal = new TextBox { Header = "Nome do novo objetivo (se escolhido)", MaxLength = 120, PlaceholderText = "Ex.: Aprender programação" };
        await FormDialog("Nova matéria", Column(name, program, goal), async () =>
        {
        if (string.IsNullOrWhiteSpace(name.Text)) throw new InvalidDataException("Informe o nome da matéria.");
        var id = Guid.NewGuid().ToString("N");
        await Save(s =>
        {
            var programId = Choice(program);
            if (programId == "") { var created = new StudyProgram { Name = string.IsNullOrWhiteSpace(goal.Text) ? "Meus estudos" : goal.Text.Trim() }; s.Programs.Add(created); programId = created.Id; }
            s.Subjects.Add(new Subject { Id = id, Name = name.Text.Trim(), ProgramId = programId, Track = s.Programs.First(x => x.Id == programId).Track });
        }, false);
        selectedSubject = id; Render();
        });
    }
    private async Task AddCourse(string subjectId)
    {
        var name = new TextBox { Header = "Título", MaxLength = 160 };
        var provider = new TextBox { Header = "Fonte ou professor", MaxLength = 160 };
        await FormDialog("Novo módulo", Column(name, provider), async () =>
        {
        if (string.IsNullOrWhiteSpace(name.Text)) throw new InvalidDataException("Informe o título do módulo.");
        await Save(s => s.Courses.Add(new Course { SubjectId = subjectId, Title = name.Text.Trim(), Provider = provider.Text.Trim() }));
        });
    }
    private async Task EditLesson(Lesson? lesson, string subjectId, string? courseId = null)
    {
        if (lesson != null) lesson = State.Lessons.First(x => x.Id == lesson.Id);
        var title = new TextBox { Header = "Aula", Text = lesson?.Title ?? "", MaxLength = 200 };
        var course = new ComboBox { Header = "Módulo", MinWidth = 320 };
        foreach (var c in State.Courses.Where(x => x.SubjectId == subjectId)) course.Items.Add(new ComboBoxItem { Content = c.Title, Tag = c.Id });
        course.SelectedItem = course.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == (lesson?.CourseId ?? courseId)) ?? course.Items.FirstOrDefault();
        if (course.Items.Count == 0) { ShowNotice("Adicione um módulo antes da aula."); return; }
        var status = new ComboBox { Header = "Progresso", MinWidth = 200 };
        foreach (var item in new[] { ("not-started", "Não iniciada"), ("in-progress", "Em andamento"), ("done", "Concluída") }) status.Items.Add(new ComboBoxItem { Tag = item.Item1, Content = item.Item2 });
        status.SelectedItem = status.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == (lesson?.Status ?? "not-started"));
        var notes = new TextBox { Header = "Anotações", Text = lesson == null ? "" : lessonDrafts.GetValueOrDefault(lesson.Id, lesson.Notes), AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 130, MaxHeight = 240, MaxLength = 20000 };
        var description = new TextBox { Header = "Conteúdo", Text = lesson?.Description ?? "", MaxLength = 3000, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
        var url = new TextBox { Header = "Endereço da aula", Text = lesson?.Url ?? "", MaxLength = 2000 };
        var content = Column(title, description, course, status, url, notes);
        var id = lesson?.Id ?? Guid.NewGuid().ToString("N");
        var result = await FormDialog(lesson == null ? "Nova aula" : "Sua aula", content, async () =>
        {
        if (string.IsNullOrWhiteSpace(title.Text) || !ValidSource(url.Text)) throw new InvalidDataException("Informe o título da aula e confira o endereço.");
        await Save(s =>
        {
            var updated = s.Lessons.FirstOrDefault(x => x.Id == id);
            if (updated == null) { updated = new Lesson { Id = id, SubjectId = subjectId, Order = s.Lessons.Count(x => x.CourseId == Choice(course)) }; s.Lessons.Add(updated); }
            updated.Title = title.Text.Trim(); updated.Description = description.Text.Trim(); updated.Url = url.Text.Trim(); updated.CourseId = Choice(course); updated.Status = Choice(status); updated.Notes = notes.Text; updated.UpdatedAt = DateTimeOffset.Now;
        }, false);
        lessonDrafts.Remove(id); Render();
        }, secondary: lesson == null ? "" : "Salvar e estudar");
        if (result == ContentDialogResult.Secondary)
        {
            if (State.Focus.Elapsed(DateTimeOffset.Now) > 0 || State.Focus.RunningSince != null) { ShowNotice("Conclua a sessão atual antes de vincular outra aula."); Navigate("timer"); return; }
            await Save(s => { s.Focus.SubjectId = subjectId; s.Focus.LessonId = id; }, false); Navigate("timer");
        }
    }

    private Task AddQuestion() => EditQuestion(null);
    private async Task EditQuestion(ReviewCard? card, string? subjectId = null, string? lessonId = null)
    {
        var subject = SubjectPicker(card?.SubjectId ?? subjectId ?? selectedSubject);
        var question = new TextBox { Header = "Pergunta", PlaceholderText = "O que eu preciso conseguir explicar?", Text = card?.Question ?? "", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 70, MaxLength = 4000 };
        var answer = new TextBox { Header = "Resposta", PlaceholderText = "Use suas palavras. Um exemplo ajuda.", Text = card?.Answer ?? "", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 100, MaxLength = 8000 };
        var source = new TextBox { Header = "Fonte", Text = card?.Source ?? "", MaxLength = 500 };
        var sourceUrl = new TextBox { Header = "Link da fonte", Text = card?.SourceUrl ?? "", MaxLength = 2000 };
        var sources = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 180, Gap = 16 }; sources.Children.Add(source); sources.Children.Add(sourceUrl);
        await FormDialog(card == null ? "Guardar um conhecimento" : "Editar cartão", Column(Body("Uma pergunta clara. Uma resposta que você consegue lembrar."), subject, question, answer, sources), async () =>
        {
        if (Choice(subject) == "" || string.IsNullOrWhiteSpace(question.Text) || string.IsNullOrWhiteSpace(answer.Text) || !ValidSource(sourceUrl.Text)) throw new InvalidDataException("Preencha matéria, pergunta, resposta e confira a fonte.");
        await Save(s =>
        {
            var updated = card == null ? new ReviewCard { SubjectId = Choice(subject), LessonId = s.Lessons.Any(x => x.Id == lessonId && x.SubjectId == Choice(subject)) ? lessonId : null } : s.Cards.First(x => x.Id == card.Id);
            if (card == null) s.Cards.Add(updated);
            if (updated.SubjectId != Choice(subject)) updated.LessonId = null;
            updated.SubjectId = Choice(subject); updated.Question = question.Text.Trim(); updated.Answer = answer.Text.Trim(); updated.Source = source.Text.Trim(); updated.SourceUrl = sourceUrl.Text.Trim();
        });
        });
    }

    private Task AddAgendaItem(bool exam) => EditAgenda(exam);

    private async Task<ContentDialogResult> FormDialog(string title, UIElement content, Func<Task> save, string primary = "Salvar", string secondary = "", double maxWidth = 550)
    {
        var error = StudyText("", 12); error.Foreground = ColorBrush(DashboardDark ? "#E5B0A1" : "#A14434"); error.Visibility = Visibility.Collapsed;
        AutomationProperties.SetLiveSetting(error, Microsoft.UI.Xaml.Automation.Peers.AutomationLiveSetting.Assertive);
        var result = ContentDialogResult.None;
        var saving = false;
        var dialog = new ContentDialog();
        void CloseForm() { if (!saving) dialog.Hide(); }
        dialog.Title = DialogHeading(title, CloseForm);
        var cancel = DialogAction("Cancelar"); cancel.Click += (_, _) => CloseForm();
        var submit = DialogAction(primary, true);
        var alternative = DialogAction(secondary); alternative.Visibility = secondary.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        var fields = new ScrollViewer { Content = content, MaxHeight = Math.Max(100, Root.ActualHeight - 300), HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        dialog.Content = Column(fields, error, DialogActions(cancel, alternative, submit));
        StyleNinhoDialog(dialog, maxWidth);
        ObserveInteractions(dialog);
        async Task Submit(ContentDialogResult action)
        {
            if (saving) return;
            saving = true; submit.IsEnabled = alternative.IsEnabled = cancel.IsEnabled = false;
            error.Visibility = Visibility.Collapsed; fields.MaxHeight = Math.Max(100, Root.ActualHeight - 300);
            try { await save(); result = action; saving = false; dialog.Hide(); }
            catch (Exception failure)
            {
                error.Text = failure.Message; error.Visibility = Visibility.Visible;
                fields.MaxHeight = Math.Max(100, Root.ActualHeight - 360);
                Microsoft.UI.Xaml.Automation.Peers.FrameworkElementAutomationPeer.CreatePeerForElement(error)?.RaiseAutomationEvent(Microsoft.UI.Xaml.Automation.Peers.AutomationEvents.LiveRegionChanged);
            }
            finally { saving = false; submit.IsEnabled = alternative.IsEnabled = cancel.IsEnabled = true; }
        }
        submit.Click += async (_, _) => await Submit(ContentDialogResult.Primary);
        alternative.Click += async (_, _) => await Submit(ContentDialogResult.Secondary);
        dialog.KeyDown += async (_, args) =>
        {
            if (args.Handled || args.Key != VirtualKey.Enter || saving) return;
            var focused = Microsoft.UI.Xaml.Input.FocusManager.GetFocusedElement(dialog.XamlRoot) as DependencyObject;
            for (var ancestor = focused; ancestor != null && ancestor != dialog; ancestor = VisualTreeHelper.GetParent(ancestor))
                if (ancestor is Button or ComboBox or ComboBoxItem or CalendarDatePicker or CalendarView or DatePicker or NumberBox or RichEditBox || ancestor is TextBox { AcceptsReturn: true }) return;
            args.Handled = true;
            await Submit(ContentDialogResult.Primary);
        };
        dialog.Closing += (_, args) => args.Cancel = saving;
        await dialog.ShowAsync();
        return result;
    }
    private async Task<bool> Confirm(string title, string description)
    {
        var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, RequestedTheme = Root.ActualTheme, Title = title, Content = Text(description), PrimaryButtonText = "Confirmar", CloseButtonText = "Cancelar", DefaultButton = ContentDialogButton.Close };
        StyleNinhoDialog(dialog, 460);
        ObserveInteractions(dialog);
        return await dialog.ShowAsync() == ContentDialogResult.Primary;
    }
    private async Task<StorageFile?> PickOpen(string[] extensions)
    {
        var picker = new FileOpenPicker();
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        foreach (var extension in extensions) picker.FileTypeFilter.Add(extension);
        return await picker.PickSingleFileAsync();
    }
    private async Task<StorageFile?> PickSave(string name, string extension)
    {
        var picker = new FileSavePicker { SuggestedFileName = name };
        picker.FileTypeChoices.Add("Backup Ninho", [extension]);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        return await picker.PickSaveFileAsync();
    }
}
