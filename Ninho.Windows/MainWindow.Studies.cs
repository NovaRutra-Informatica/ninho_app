using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private string studyProgramId = "", studySubjectId = "", studyQuery = "", studyStatus = "all", studyTrack = "all", studyTab = "lessons", expandedLesson = "";
    private readonly HashSet<string> collapsedCourses = [];
    private string pendingLessonScroll = "";
    private readonly Dictionary<string, string> lessonDrafts = [];
    private static bool ContainsText(string value, string query) => System.Globalization.CultureInfo.GetCultureInfo("pt-BR").CompareInfo.IndexOf(value, query, System.Globalization.CompareOptions.IgnoreCase | System.Globalization.CompareOptions.IgnoreNonSpace) >= 0;
    private Button OriginalActionButton(string label, string icon, Func<Task> action, bool accent = false)
    {
        var button = ActionButton(label, action, accent);
        var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        var drawing = OriginalIcon.Create(icon, 17);
        drawing.SetBinding(Control.ForegroundProperty, new Microsoft.UI.Xaml.Data.Binding { Source = button, Path = new PropertyPath("Foreground") });
        content.Children.Add(drawing);
        if (label.Length > 0)
        {
            var text = new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center, FontSize = 12, FontFamily = (Microsoft.UI.Xaml.Media.FontFamily)Application.Current.Resources["NinhoSemiBoldFont"] };
            text.SetBinding(TextBlock.ForegroundProperty, new Microsoft.UI.Xaml.Data.Binding { Source = button, Path = new PropertyPath("Foreground") });
            content.Children.Add(text);
        }
        button.Content = content;
        return button;
    }
    private void OpenLesson(Lesson lesson)
    {
        studySubjectId = lesson.SubjectId; studyProgramId = State.Subjects.First(x => x.Id == lesson.SubjectId).ProgramId; expandedLesson = pendingLessonScroll = lesson.Id; collapsedCourses.Remove(lesson.CourseId); studyTab = "lessons"; studyQuery = ""; studyStatus = "all"; Navigate("studies");
    }
    private async Task OpenLessonTimer(Lesson lesson)
    {
        var focus = State.Focus;
        if ((focus.Elapsed(DateTimeOffset.Now) > 0 || focus.RunningSince != null) && focus.LessonId != lesson.Id) { ShowNotice("Conclua ou reinicie a sessão antes de trocar de aula."); Navigate("timer"); return; }
        await Save(s => { s.Focus.SubjectId = lesson.SubjectId; s.Focus.LessonId = lesson.Id; }, false); Navigate("timer");
    }
    private readonly Dictionary<string, Action<bool>> studyLessonExpanders = [];
    private StackPanel StudiesPage()
    {
        var subject = State.Subjects.FirstOrDefault(x => x.Id == studySubjectId);
        var program = State.Programs.FirstOrDefault(x => x.Id == (subject?.ProgramId ?? studyProgramId));
        var page = StudyStack(0);
        var heading = DashboardText(subject?.Name ?? program?.Name ?? "Seus cursos. Seu próximo passo.", 32, display: true);
        heading.LineHeight = 38.4; heading.CharacterSpacing = -31;
        var introduction = StudyStack(0);
        if (program != null)
        {
            var back = StudyLink(subject == null ? "Todos os cursos" : "Voltar para " + program.Name, "arrow-left", () =>
            {
                if (subject != null) studySubjectId = ""; else studyProgramId = "";
                studyQuery = ""; studyStatus = "all"; studyTab = "lessons"; Render(); PageScroll.ChangeView(null, 0, null, true); return Task.CompletedTask;
            });
            back.Margin = new Thickness(0, 0, 0, 14); introduction.Children.Add(back);
        }
        introduction.Children.Add(heading);
        var description = StudyText(subject != null ? "Aulas, anotações e materiais da sua matéria." : !string.IsNullOrWhiteSpace(program?.Description) ? program.Description : "Escolha um curso, encontre suas matérias e estude uma coisa por vez.", 13, muted: true);
        description.LineHeight = 21.45; description.Margin = new Thickness(0, 8, 0, 0); introduction.Children.Add(description);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 9, VerticalAlignment = VerticalAlignment.Center };
        if (subject != null) actions.Children.Add(StudyIconButton("Editar matéria", "pencil", () => EditSubject(subject, subject.ProgramId), 19));
        else if (program != null) actions.Children.Add(StudyIconButton("Editar curso", "pencil", () => EditProgram(program), 19));
        actions.Children.Add(OriginalActionButton(subject != null ? "Adicionar módulo" : program != null ? "Nova matéria" : "Novo curso", "plus", () => subject != null ? EditCourse(null, subject.Id) : program != null ? EditSubject(null, program.Id) : EditProgram(null), true));
        var header = StudyBetween(introduction, actions, 22); header.Margin = new Thickness(0, 0, 0, 27); page.Children.Add(header);
        if (subject != null)
        {
            var tabs = StudySegments([("lessons", "Aulas", "book-open"), ("materials", "Materiais", "folder-open")], studyTab, id => { studyTab = id; Render(); }, State.Materials.Count(x => x.SubjectId == subject.Id));
            tabs.Margin = new Thickness(0, 0, 0, 24); page.Children.Add(tabs);
            if (studyTab == "materials") { page.Children.Add(MaterialCollection(subject.Id, null)); return page; }
        }
        var results = StudyStack(0);
        var search = new TextBox { PlaceholderText = subject != null ? "Buscar aula ou conteúdo…" : program != null ? "Buscar matéria ou conteúdo…" : "Buscar curso ou conteúdo…", Text = studyQuery };
        AutomationProperties.SetName(search, search.PlaceholderText);
        var searchSurface = StudySearch(search);
        searchSurface.HorizontalAlignment = HorizontalAlignment.Left;
        searchSurface.Width = 390;
        var toolbar = new Grid { ColumnSpacing = 13, Margin = new Thickness(0, 0, 0, 23) };
        toolbar.ColumnDefinitions.Add(new ColumnDefinition()); toolbar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); toolbar.Children.Add(searchSurface);
        if (subject != null)
        {
            var filter = new ComboBox { MinWidth = 180, FontSize = 12, Padding = new Thickness(13, 11, 13, 11), CornerRadius = new CornerRadius(10), Background = StudySoft, BorderBrush = DashboardLine };
            foreach (var item in new[] { ("all", "Todas as aulas"), ("not-started", "A estudar"), ("in-progress", "Em estudo"), ("done", "Concluídas") }) filter.Items.Add(new ComboBoxItem { Tag = item.Item1, Content = item.Item2 });
            filter.SelectedItem = filter.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == studyStatus);
            filter.SelectionChanged += (_, _) => { studyStatus = Choice(filter); Fill(); };
            AutomationProperties.SetName(filter, "Filtrar situação"); Grid.SetColumn(filter, 1); toolbar.Children.Add(filter);
        }
        else if (program == null)
        {
            var segmentsHost = new Border();
            void UpdateSegments() => segmentsHost.Child = StudySegments([("all", "Tudo", ""), ("concurso", "Concurso", ""), ("faculdade", "Faculdade", ""), ("pessoal", "Pessoal", "")], studyTrack, id => { studyTrack = id; UpdateSegments(); Fill(); });
            UpdateSegments(); Grid.SetColumn(segmentsHost, 1); toolbar.Children.Add(segmentsHost);
        }
        toolbar.SizeChanged += (_, e) => searchSurface.Width = Math.Max(160, Math.Min(390, e.NewSize.Width - (toolbar.Children.Count > 1 ? ((FrameworkElement)toolbar.Children[1]).ActualWidth + 13 : 0)));
        page.Children.Add(toolbar); page.Children.Add(results);
        void Fill()
        {
            results.Children.Clear(); studyLessonExpanders.Clear();
            bool ContentMatches(Lesson lesson) => ContainsText(lesson.Title + " " + lesson.Description + " " + lesson.Notes, studyQuery);
            bool Matches(Lesson lesson) => ContentMatches(lesson) && (studyStatus == "all" || lesson.Status == studyStatus);
            if (program == null)
            {
                var grid = new AdaptiveColumns { MaximumColumns = 3, MinimumColumnWidth = 220, Gap = 18 };
                foreach (var item in State.Programs.Where(x => (studyTrack == "all" || x.Track == studyTrack) && (ContainsText(x.Name + " " + x.Description, studyQuery) || State.Subjects.Any(s => s.ProgramId == x.Id && (ContainsText(s.Name, studyQuery) || State.Lessons.Any(l => l.SubjectId == s.Id && ContentMatches(l)))))))
                {
                    var subjects = State.Subjects.Where(x => x.ProgramId == item.Id).Select(x => x.Id).ToHashSet();
                    var lessons = State.Lessons.Where(x => subjects.Contains(x.SubjectId)).ToArray(); var done = lessons.Count(x => x.Status == "done");
                    grid.Children.Add(StudyCard("program-" + item.Id, item.Track == "faculdade" ? "graduation-cap" : item.Track == "concurso" ? "book-open" : "trophy", 28, item.Color,
                        item.Track == "concurso" ? "CONCURSO" : item.Track == "faculdade" ? "FACULDADE" : "PESSOAL", item.Name,
                        string.IsNullOrWhiteSpace(item.Description) ? "Um novo caminho para organizar e aprender." : item.Description,
                        $"{subjects.Count} {(subjects.Count == 1 ? "matéria" : "matérias")} · {lessons.Length} {(lessons.Length == 1 ? "aula" : "aulas")}",
                        done > 0 ? $"{done} aulas concluídas" : "Entre no curso para organizar suas matérias.", done, lessons.Length,
                        () => { studySubjectId = ""; studyProgramId = item.Id; studyQuery = ""; studyStatus = "all"; Render(); PageScroll.ChangeView(null, 0, null, true); }));
                }
                results.Children.Add(grid);
                if (grid.Children.Count == 0) results.Children.Add(State.Programs.Count == 0
                    ? StudyEmpty("Seu primeiro curso começa aqui.", "Adicione um concurso, uma faculdade ou um assunto que queira aprender.", "Criar primeiro curso", () => EditProgram(null))
                    : StudyEmpty("Nenhum curso encontrado.", "Ajuste a busca ou escolha outro tipo de curso."));
            }
            else if (subject == null)
            {
                if (program.Id == "senado-federal")
                {
                    var integrationIcon = new Border { Width = 37, Height = 37, Background = DashboardSurface, CornerRadius = new CornerRadius(10), Child = OriginalIcon.Create("layers", 21, DashboardGreen) };
                    var integrationText = StudyStack(3, StudyText("Seu Estratégia já tem um lugar aqui.", 12, bold: true), StudyText("20 módulos · 271 aulas e materiais extras · catálogo conferido em 14/09/2026", 10, muted: true));
                    var integration = StudyBetween(DashboardRow(integrationIcon, integrationText), StudyLink("Área do aluno", "arrow-up-right", () => OpenSource("https://www.estrategiaconcursos.com.br/app/dashboard/cursos"), false));
                    results.Children.Add(new Border { Child = integration, Background = StudyMint, BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), Padding = new Thickness(20, 17, 20, 17), Margin = new Thickness(0, 0, 0, 25) });
                }
                var grid = new AdaptiveColumns { MinimumColumnWidth = 220, MaximumColumns = 3, Gap = 18 };
                foreach (var item in State.Subjects.Where(x => x.ProgramId == program.Id && (ContainsText(x.Name, studyQuery) || State.Lessons.Any(l => l.SubjectId == x.Id && ContentMatches(l)))))
                {
                    var lessons = State.Lessons.Where(x => x.SubjectId == item.Id).ToArray(); var done = lessons.Count(x => x.Status == "done");
                    grid.Children.Add(StudyCard("subject-" + item.Id, "book-open", 25, item.Color, program.Name, item.Name,
                        $"{lessons.Length} aulas · {State.Cards.Count(x => x.SubjectId == item.Id)} cartões", null,
                        done > 0 ? $"{done} de {lessons.Length} aulas concluídas" : "Tudo começa com o primeiro passo.", done, lessons.Length,
                        () => { studySubjectId = item.Id; studyQuery = ""; studyStatus = "all"; studyTab = "lessons"; collapsedCourses.Clear(); expandedLesson = ""; Render(); PageScroll.ChangeView(null, 0, null, true); }));
                }
                results.Children.Add(grid);
                if (grid.Children.Count == 0) results.Children.Add(State.Subjects.Any(x => x.ProgramId == program.Id)
                    ? StudyEmpty("Nenhuma matéria corresponde à busca.", "Experimente outro termo.")
                    : StudyEmpty("Quais matérias fazem parte deste curso?", "Crie sua primeira matéria e depois adicione as aulas e os materiais.", "Criar primeira matéria", () => EditSubject(null, program.Id)));
            }
            else
            {
                var courses = State.Courses.Where(x => x.SubjectId == subject.Id).ToArray();
                if (courses.Length == 0) results.Children.Add(StudyEmpty("Um lugar para suas aulas.", "Crie um módulo para agrupar aulas, semestres ou fontes desta matéria.", "Adicionar primeiro módulo", () => EditCourse(null, subject.Id)));
                foreach (var course in courses)
                {
                    var allLessons = State.Lessons.Where(x => x.CourseId == course.Id).OrderBy(x => x.Order).ToArray();
                    var lessons = allLessons.Where(Matches).ToArray();
                    results.Children.Add(StudyCoursePanel(course, subject.Id, allLessons, lessons));
                }
                var microcopy = StudyText("O progresso registrado no Ninho é local. Ao abrir uma aula, seu navegador mantém o acesso à plataforma.", 10, muted: true); microcopy.HorizontalAlignment = HorizontalAlignment.Center; microcopy.TextAlignment = TextAlignment.Center; microcopy.Margin = new Thickness(0, 5, 0, 0); results.Children.Add(microcopy);
            }
        }
        search.TextChanged += (_, _) => { studyQuery = search.Text; Fill(); };
        Fill(); return page;
    }
    private UIElement StudyCoursePanel(Course course, string subjectId, Lesson[] allLessons, Lesson[] lessons)
    {
        var open = !collapsedCourses.Contains(course.Id) || studyQuery.Length > 0 || studyStatus != "all";
        var details = StudyStack(0); var content = StudyStack(0); var loaded = false;
        var eyebrow = StudyText($"{course.Provider} · {allLessons.Count(x => x.Status == "done")}/{allLessons.Length} concluídas", 8, muted: true, bold: true); eyebrow.CharacterSpacing = 225;
        var title = StudyText(course.Title, 16); title.FontWeight = Microsoft.UI.Text.FontWeights.Medium; title.LineHeight = 22.4;
        var titleContent = StudyStack(7, eyebrow, title); titleContent.IsHitTestVisible = false;
        Button? headingButton = null; Button? chevron = null;
        void Load()
        {
            if (loaded) return; loaded = true;
            var tools = Row();
            if (!string.IsNullOrWhiteSpace(course.Url)) tools.Children.Add(StudyLink("Abrir módulo", "arrow-up-right", () => OpenSource(course.Url), false));
            tools.Children.Add(StudyLink("Adicionar aula", "plus", () => EditLesson(null, subjectId, course.Id)));
            details.Children.Add(new Border { Child = tools, Padding = new Thickness(25, 13, 25, 13), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 0, 0, 1) });
            for (var index = 0; index < lessons.Length; index++)
            {
                var row = LessonElement(lessons[index]);
                if (index != lessons.Length - 1) row.BorderThickness = new Thickness(0, 0, 0, 1);
                details.Children.Add(row);
            }
            if (lessons.Length == 0) details.Children.Add(new Border { Padding = new Thickness(25, 20, 25, 20), Child = StudyText(allLessons.Length > 0 ? "Nenhuma aula corresponde ao filtro." : "Adicione sua primeira aula neste módulo.", 12, muted: true) });
        }
        void SetOpen()
        {
            if (open) Load(); details.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
            if (chevron?.Content is OriginalIcon icon) icon.RenderTransform = new Microsoft.UI.Xaml.Media.RotateTransform { Angle = open ? 0 : -90, CenterX = 10, CenterY = 10 };
            if (headingButton != null) AutomationProperties.SetItemStatus(headingButton, open ? "Expandido" : "Recolhido");
        }
        Task Toggle() { open = !open; if (open) collapsedCourses.Remove(course.Id); else collapsedCourses.Add(course.Id); SetOpen(); return Task.CompletedTask; }
        headingButton = StudyPlain(course.Title, titleContent, Toggle); headingButton.HorizontalAlignment = HorizontalAlignment.Stretch;
        chevron = StudyIconButton("Expandir ou recolher " + course.Title, "chevron-down", Toggle, 20);
        var edit = StudyIconButton("Editar módulo " + course.Title, "pencil", () => EditCourse(State.Courses.First(x => x.Id == course.Id), subjectId));
        var header = StudyBetween(headingButton, DashboardRow(edit, chevron), 15);
        content.Children.Add(new Border { Child = header, Padding = new Thickness(25, 21, 25, 21), Background = StudySoft, CornerRadius = new CornerRadius(14, 14, 0, 0) });
        content.Children.Add(details); SetOpen();
        return new Border { Child = content, BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(15), Background = DashboardSurface, Margin = new Thickness(0, 0, 0, 19) };
    }
    private Border LessonElement(Lesson lesson)
    {
        var sessions = State.Sessions.Where(x => x.LessonId == lesson.Id && x.DurationMinutes > 0).ToArray();
        var details = StudyStack(0); var content = StudyStack(0); var expanded = lesson.Id == expandedLesson; var loaded = false;
        StackPanel? materials = null;
        Button? titleButton = null; Button? expandButton = null;
        void Load()
        {
            if (loaded) return; loaded = true;
            var savedLesson = State.Lessons.First(x => x.Id == lesson.Id);
            var status = new ComboBox { MinWidth = 150, FontSize = 11, Padding = new Thickness(8), CornerRadius = new CornerRadius(10), Background = StudySoft, BorderBrush = DashboardLine };
            foreach (var option in new[] { ("not-started", "A estudar"), ("in-progress", "Em estudo"), ("done", "Concluída") }) status.Items.Add(new ComboBoxItem { Tag = option.Item1, Content = option.Item2 });
            status.SelectedItem = status.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == savedLesson.Status);
            status.SelectionChanged += async (_, _) => await Run(() => Save(s => { var current = s.Lessons.First(x => x.Id == lesson.Id); current.Status = Choice(status); current.UpdatedAt = DateTimeOffset.Now; }));
            AutomationProperties.SetName(status, "Situação de " + lesson.Title);
            var controls = Row(StudyStack(5, StudyText("Situação", 9, muted: true), status));
            if (!string.IsNullOrWhiteSpace(lesson.Url)) controls.Children.Add(StudyLink("Abrir aula", "arrow-up-right", () => OpenSource(lesson.Url), false));
            controls.Children.Add(StudySmallButton("Editar aula", "pencil", () => EditLesson(State.Lessons.First(x => x.Id == lesson.Id), lesson.SubjectId)));
            controls.Children.Add(StudySmallButton("Criar cartão", "plus", () => EditQuestion(null, lesson.SubjectId, lesson.Id)));
            controls.Margin = new Thickness(0, 0, 0, 17); details.Children.Add(controls);
            var notes = new TextBox { Text = lessonDrafts.GetValueOrDefault(lesson.Id, savedLesson.Notes), PlaceholderText = "O que ficou claro? O que preciso rever?", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 100, MaxHeight = 250, MaxLength = 20000, FontSize = 12, Padding = new Thickness(13, 11, 13, 11), CornerRadius = new CornerRadius(10), Background = StudySoft, BorderBrush = DashboardLine };
            AutomationProperties.SetName(notes, "Anotações de " + lesson.Title);
            notes.TextChanged += (_, _) => lessonDrafts[lesson.Id] = notes.Text;
            var notesLabel = DashboardRow(OriginalIcon.Create("sticky-note", 15, DashboardMuted), StudyText("Minhas anotações", 10, muted: true)); notesLabel.Spacing = 6;
            details.Children.Add(StudyStack(7, notesLabel, notes));
            var save = StudySmallButton("Salvar anotações", "save", async () =>
            {
                var value = notes.Text;
                await Save(s => { var current = s.Lessons.First(x => x.Id == lesson.Id); current.Notes = value; current.UpdatedAt = DateTimeOffset.Now; }, false);
                if (lessonDrafts.GetValueOrDefault(lesson.Id) == value) lessonDrafts.Remove(lesson.Id); ShowNotice("Anotações salvas.", InfoBarSeverity.Success);
            });
            var counts = StudyText($"{State.Materials.Count(x => x.LessonId == lesson.Id)} anexos · {State.Cards.Count(x => x.LessonId == lesson.Id)} cartões nesta aula", 10, muted: true); counts.VerticalAlignment = VerticalAlignment.Center;
            var footer = StudyBetween(counts, save); footer.Margin = new Thickness(0, 11, 0, 0); details.Children.Add(footer);
            materials = MaterialCollection(lesson.SubjectId, lesson.Id);
            materials.Margin = new Thickness(0, 24, 0, 0); details.Children.Add(materials);
        }
        void Expand(bool value)
        {
            expanded = value;
            if (expanded) Load(); details.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
            if (expandButton?.Content is OriginalIcon icon) icon.RenderTransform = new Microsoft.UI.Xaml.Media.RotateTransform { Angle = expanded ? 180 : 0, CenterX = 9, CenterY = 9 };
            if (titleButton != null) AutomationProperties.SetItemStatus(titleButton, expanded ? "Expandido" : "Recolhido");
        }
        void Open(bool value)
        {
            if (value)
            {
                expandedLesson = lesson.Id;
                foreach (var row in studyLessonExpanders.Where(x => x.Key != lesson.Id)) row.Value(false);
            }
            else if (expandedLesson == lesson.Id) expandedLesson = "";
            Expand(value);
        }
        studyLessonExpanders[lesson.Id] = Expand;
        var complete = StudyPlain((lesson.Status == "done" ? "Reabrir " : "Concluir ") + lesson.Title, OriginalIcon.Create(lesson.Status == "done" ? "check" : "circle", 17, ColorBrush(lesson.Status == "done" ? "#4E966B" : "#B0BCAF")), () => Save(s => { var current = s.Lessons.First(x => x.Id == lesson.Id); current.Status = current.Status == "done" ? "not-started" : "done"; current.UpdatedAt = DateTimeOffset.Now; }));
        complete.Width = complete.Height = 27; complete.Padding = new Thickness(5); complete.CornerRadius = new CornerRadius(14);
        if (lesson.Status == "done") complete.Background = ColorBrush("#E7F3E8");
        var name = StudyText(lesson.Title, 13, bold: true);
        var lessonHeading = Row(name);
        if (lesson.Status == "in-progress") lessonHeading.Children.Add(new Border { Child = StudyText("Em estudo", 8), Padding = new Thickness(6, 3, 6, 3), CornerRadius = new CornerRadius(5), Background = ColorBrush("#F1EADB") });
        var description = StudyText(lesson.Description, 11, muted: true); description.MaxLines = 2; description.TextTrimming = TextTrimming.CharacterEllipsis; description.LineHeight = 18.15;
        var labelContent = StudyStack(5, lessonHeading, description); labelContent.IsHitTestVisible = false;
        titleButton = StudyPlain(lesson.Title, labelContent, () => { Open(!expanded); return Task.CompletedTask; }); titleButton.HorizontalAlignment = HorizontalAlignment.Stretch;
        var time = StudyStack(7, StudyText($"{StudyTime(sessions.Sum(x => x.DurationMinutes))} · {sessions.Length} {(sessions.Length == 1 ? "sessão" : "sessões")}", 14, muted: true));
        time.VerticalAlignment = VerticalAlignment.Center;
        var active = State.Focus.LessonId == lesson.Id;
        if (active) time.Children.Add(new Border { Child = StudyText(State.Focus.RunningSince != null ? "Cronômetro rodando" : "Cronômetro pausado", 13, bold: true), Padding = new Thickness(9, 4, 9, 4), CornerRadius = new CornerRadius(20), Background = StudyMint });
        var timer = StudySmallButton(active ? "Ver cronômetro" : "Cronometrar", "timer", () => OpenLessonTimer(lesson), true);
        AutomationProperties.SetName(timer, "Cronometrar " + lesson.Title);
        var materialButton = StudySmallButton($"Materiais ({State.Materials.Count(x => x.LessonId == lesson.Id)})", "folder-open", () =>
        {
            Open(true); DispatcherQueue.TryEnqueue(() => materials?.StartBringIntoView(new BringIntoViewOptions { AnimationDesired = !State.Settings.ReducedMotion, VerticalAlignmentRatio = 0 })); return Task.CompletedTask;
        }, true);
        AutomationProperties.SetName(materialButton, "Materiais de " + lesson.Title);
        expandButton = StudyIconButton("Detalhes de " + lesson.Title, "chevron-down", () => { Open(!expanded); return Task.CompletedTask; }, 18);
        var top = new Grid { ColumnSpacing = 12, RowSpacing = 12, Padding = new Thickness(19, 16, 19, 16) };
        top.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); top.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        foreach (var width in new[] { GridLength.Auto, new GridLength(1, GridUnitType.Star), GridLength.Auto, GridLength.Auto, GridLength.Auto, GridLength.Auto }) top.ColumnDefinitions.Add(new ColumnDefinition { Width = width });
        var controlsList = new FrameworkElement[] { complete, titleButton, time, timer, materialButton, expandButton };
        for (var index = 0; index < controlsList.Length; index++) { Grid.SetColumn(controlsList[index], index); top.Children.Add(controlsList[index]); }
        bool? compact = null;
        top.SizeChanged += (_, e) =>
        {
            var narrow = e.NewSize.Width < 950; if (compact == narrow) return; compact = narrow;
            Grid.SetRow(time, narrow ? 1 : 0); Grid.SetColumn(time, narrow ? 1 : 2);
            Grid.SetRow(timer, narrow ? 1 : 0); Grid.SetColumn(timer, narrow ? 2 : 3);
            Grid.SetRow(materialButton, narrow ? 1 : 0); Grid.SetColumn(materialButton, narrow ? 3 : 4);
            Grid.SetColumnSpan(titleButton, narrow ? 4 : 1);
        };
        content.Children.Add(top); details.Margin = new Thickness(57, 0, 25, 22); content.Children.Add(details); Expand(expanded);
        var panel = new Border { Child = content, BorderBrush = DashboardLine };
        AutomationProperties.SetAutomationId(panel, "lesson-row-" + lesson.Id);
        panel.Loaded += (_, _) =>
        {
            if (pendingLessonScroll != lesson.Id) return; pendingLessonScroll = "";
            DispatcherQueue.TryEnqueue(() => panel.StartBringIntoView(new BringIntoViewOptions { AnimationDesired = !State.Settings.ReducedMotion, VerticalAlignmentRatio = .3 }));
        };
        return panel;
    }
    private async Task EditProgram(StudyProgram? program)
    {
        var name = new TextBox { Header = "Nome do curso", Text = program?.Name ?? "", MaxLength = 120 };
        var description = new TextBox { Header = "Seu objetivo", Text = program?.Description ?? "", AcceptsReturn = true, MaxLength = 1000 };
        var track = new ComboBox { Header = "Tipo", MinWidth = 200 };
        foreach (var item in new[] { ("concurso", "Concurso"), ("faculdade", "Faculdade"), ("pessoal", "Pessoal") }) track.Items.Add(new ComboBoxItem { Tag = item.Item1, Content = item.Item2 });
        track.SelectedItem = track.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == (program?.Track ?? "pessoal"));
        var color = new TextBox { Header = "Cor (hexadecimal)", Text = program?.Color ?? "#527969", MaxLength = 7 };
        await FormDialog(program == null ? "Novo curso" : "Editar curso", Column(name, description, track, color), async () =>
        {
        if (string.IsNullOrWhiteSpace(name.Text) || !ValidColor(color.Text)) throw new InvalidDataException("Informe nome e uma cor como #527969.");
        await Save(s => { var current = program == null ? new StudyProgram() : s.Programs.First(x => x.Id == program.Id); if (program == null) s.Programs.Add(current); current.Name = name.Text.Trim(); current.Description = description.Text.Trim(); current.Track = Choice(track); current.Color = color.Text; foreach (var item in s.Subjects.Where(x => x.ProgramId == current.Id)) item.Track = current.Track; });
        });
    }
    private async Task EditSubject(Subject? subject, string programId)
    {
        var name = new TextBox { Header = "Nome da matéria", Text = subject?.Name ?? "", MaxLength = 120 };
        var color = new TextBox { Header = "Cor (hexadecimal)", Text = subject?.Color ?? "#527969", MaxLength = 7 };
        var program = new ComboBox { Header = "Curso", HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var item in State.Programs) program.Items.Add(new ComboBoxItem { Content = item.Name, Tag = item.Id });
        program.SelectedItem = program.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == programId) ?? program.Items.FirstOrDefault();
        await FormDialog(subject == null ? "Nova matéria" : "Editar matéria", Column(name, program, color), async () =>
        {
        if (string.IsNullOrWhiteSpace(name.Text) || !ValidColor(color.Text) || Choice(program) == "") throw new InvalidDataException("Informe o nome, curso e uma cor como #527969.");
        await Save(s => { var current = subject == null ? new Subject() : s.Subjects.First(x => x.Id == subject.Id); if (subject == null) s.Subjects.Add(current); current.Name = name.Text.Trim(); current.Color = color.Text; current.ProgramId = Choice(program); current.Track = s.Programs.First(x => x.Id == current.ProgramId).Track; }, false);
        studyProgramId = Choice(program); Render();
        });
    }
    private static bool ValidColor(string value) => System.Text.RegularExpressions.Regex.IsMatch(value, "^#[0-9a-fA-F]{6}$");
    private async Task EditCourse(Course? course, string subjectId)
    {
        var title = new TextBox { Header = "Módulo", Text = course?.Title ?? "", MaxLength = 160 };
        var provider = new TextBox { Header = "Fonte ou professor", Text = course?.Provider ?? "", MaxLength = 160 };
        var url = new TextBox { Header = "Endereço da fonte (opcional)", Text = course?.Url ?? "", MaxLength = 2000 };
        await FormDialog(course == null ? "Adicionar módulo" : "Editar módulo", Column(title, provider, url), async () =>
        {
        if (string.IsNullOrWhiteSpace(title.Text) || !ValidSource(url.Text)) throw new InvalidDataException("Informe o título e um endereço http/https válido, ou deixe o endereço vazio.");
        await Save(s => { var current = course == null ? new Course { SubjectId = subjectId } : s.Courses.First(x => x.Id == course.Id); if (course == null) s.Courses.Add(current); current.Title = title.Text.Trim(); current.Provider = provider.Text.Trim(); current.Url = url.Text.Trim(); });
        });
    }
    private static bool ValidSource(string value) => string.IsNullOrWhiteSpace(value) || Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https";
    private static async Task OpenSource(string source)
    {
        if (!ValidSource(source) || string.IsNullOrWhiteSpace(source)) throw new InvalidDataException("Endereço de fonte inválido.");
        await global::Windows.System.Launcher.LaunchUriAsync(new Uri(source));
    }
}
