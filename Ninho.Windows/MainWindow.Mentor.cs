using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Automation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private string assistantQuestion = "", assistantReply = "", assistantScope = "", signalFilter = "all";
    private TextBlock? assistantOutput;
    private Action? refreshAssistantConversation;
    private Button? assistantSend, assistantCancel;
    private long assistantGenerationVersion;
    private string assistantLastQuestion = "";
    private TextBox? assistantInput;
    private ScrollViewer? assistantMessagesScroll;
    private readonly List<(string Question, string Answer)> assistantHistory = [];
    private Brush MentorInk => ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#F0F1F3" : "#193C35");
    private Brush MentorMuted => ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#AEB3BE" : "#66766B");
    private Brush MentorGreen => ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#A8D7BC" : "#235E50");
    private Brush MentorMint => ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#303A37" : "#E8EEDF");
    private Brush MentorLine => ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#3B3E46" : "#E6EAE3");
    private TextBlock MentorText(string value, double size = 14, bool muted = false, bool display = false)
    {
        var text = new TextBlock { Text = value, FontSize = size, TextWrapping = TextWrapping.Wrap, Foreground = muted ? MentorMuted : MentorInk, LineHeight = size * 1.6, LineStackingStrategy = LineStackingStrategy.BlockLineHeight };
        if (display) { text.FontFamily = (FontFamily)Application.Current.Resources["NinhoDisplayFont"]; text.FontWeight = Microsoft.UI.Text.FontWeights.Medium; }
        else UseOriginalTextFace(text);
        return text;
    }
    private StackPanel MentorHeading(string eyebrow, string title, double size = 24)
    {
        var label = MentorText(eyebrow, 10, muted: true); label.CharacterSpacing = 110;
        var heading = Column(label, MentorText(title, size, display: true)); heading.Spacing = 7;
        return heading;
    }
    private Button MentorLink(string label, Func<Task> action)
    {
        var button = OriginalActionButton(label, "arrow-right", action);
        button.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent); button.BorderThickness = new Thickness(0); button.Padding = new Thickness(0, 5, 0, 5); button.Foreground = MentorGreen;
        return button;
    }
    private void OpenMentorReviews(string subjectId, string filter = "all")
    {
        selectedSubject = subjectId; reviewMode = filter == "all" ? "home" : "library";
        reviewFilter = filter; reviewQuery = revealedCard = ""; libraryPage = 0; Navigate("reviews");
    }
    private void OpenMentorStudies(string subjectId)
    {
        studySubjectId = subjectId; studyProgramId = State.Subjects.FirstOrDefault(x => x.Id == subjectId)?.ProgramId ?? "";
        studyQuery = ""; studyStatus = "all"; studyTab = "lessons"; Navigate("studies");
    }
    private async Task OpenMentorFocus(string subjectId)
    {
        if (State.Focus.RunningSince != null || State.Focus.Elapsed(DateTimeOffset.Now) > 0)
        {
            Navigate("timer"); return;
        }
        await Save(s => { s.Focus.SubjectId = subjectId; s.Focus.LessonId = ""; s.Focus.IsBreak = false; s.Focus.Stopwatch = false; s.Focus.TargetMinutes = s.Settings.FocusMinutes; }, false);
        Navigate("timer");
    }
    private StackPanel MentorPage()
    {
        var now = DateTimeOffset.Now;
        var insights = StudyEngine.Recommend(State, now);
        var scoped = insights.Where(x => assistantScope == "" || x.SubjectId == assistantScope).ToArray();
        var decks = State.Cards.GroupBy(x => x.SubjectId).ToDictionary(x => x.Key, x => x.ToArray());
        ReviewCard[] Deck(string id) => decks.GetValueOrDefault(id) ?? [];
        var cards = scoped.SelectMany(x => Deck(x.SubjectId)).ToArray();
        var practiced = cards.Count(x => x.LastReviewedAt != null); var due = scoped.Sum(x => x.Due);
        var heading = Column(MentorHeading("UM OLHAR ATENTO PARA O SEU ESTUDO", "Seu próximo passo, com a Íris.", 32), MentorText("Transforme seus registros em uma direção simples para hoje.", muted: true)); heading.Spacing = 5;
        var badge = new Border { Background = MentorMint, CornerRadius = new CornerRadius(7), Padding = new Thickness(9, 7, 9, 7), Child = Row(OriginalIcon.Create("shield-check", 15, MentorGreen), MentorText("ASSISTENTE LOCAL", 10)), VerticalAlignment = VerticalAlignment.Top, HorizontalAlignment = HorizontalAlignment.Right };
        var header = new Grid { ColumnSpacing = 18 }; header.ColumnDefinitions.Add(new ColumnDefinition()); header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); header.Children.Add(heading); Grid.SetColumn(badge, 1); header.Children.Add(badge);
        var summary = scoped.Length == 0 ? "Nenhuma matéria encontrada para este filtro." : practiced == 0
            ? $"Ainda não há respostas suas {(assistantScope == "" ? "nos cartões" : "nesta matéria")}. Podemos começar com uma aula e construir um histórico aos poucos."
            : $"{practiced} cartões já praticados {(assistantScope == "" ? "nas matérias" : "nesta matéria")}. {due} revisões previstas para agora. Esse retrato se limita ao que foi registrado no Ninho.";
        var introText = Column(MentorText("MENOS DÚVIDA SOBRE POR ONDE COMEÇAR", 10, muted: true), MentorText("Eu observo seu percurso.\nVocê constrói o seu conhecimento.", 28, display: true), MentorText(summary), MentorText("Minhas sugestões usam suas revisões, marcações, aulas e provas. São indícios do que merece atenção, não uma nota sobre sua capacidade.", muted: true)); introText.Spacing = 13;
        var intro = new Grid { ColumnSpacing = 30 }; intro.ColumnDefinitions.Add(new ColumnDefinition()); intro.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); intro.Children.Add(introText);
        var owl = new OwlControl { Width = 135, Height = 160, Happy = true, Animate = !State.Settings.ReducedMotion, VerticalAlignment = VerticalAlignment.Center }; Grid.SetColumn(owl, 1); intro.Children.Add(owl);
        var hero = Card(intro); hero.Background = MentorMint; hero.Padding = new Thickness(30, 27, 30, 27);
        var subject = SubjectPicker(assistantScope, true); subject.Header = MentorText("Olhar para", 12); subject.MaxWidth = 460;
        foreach (var item in subject.Items.OfType<ComboBoxItem>().Where(x => x.Tag?.ToString() != ""))
        {
            var current = State.Subjects.First(x => x.Id == item.Tag?.ToString());
            item.Content = current.Name + " · " + (State.Programs.FirstOrDefault(x => x.Id == current.ProgramId)?.Name ?? "Outros estudos");
        }
        subject.SelectionChanged += (_, _) => { assistantScope = Choice(subject); signalFilter = "all"; Render(); };
        var panel = Column(header, hero, Row(subject, OriginalIcon.Create("shield-check", 15, MentorMuted), MentorText("Suas informações ficam neste computador.", muted: true))); panel.Spacing = 24;
        var stats = new AdaptiveColumns { MaximumColumns = PageHost.Width >= 1060 ? 4 : 2, MinimumColumnWidth = 180, Gap = 16 };
        stats.SizeChanged += (_, args) => { var count = args.NewSize.Width >= 1060 ? 4 : 2; if (stats.MaximumColumns != count) { stats.MaximumColumns = count; stats.InvalidateMeasure(); } };
        foreach (var stat in new[] { ("all", practiced, "cartões já praticados", "Base das observações", "brain"), ("review", due, "revisões vencidas", "Hora de reencontrar o assunto", "clock-3"), ("relearn", cards.Count(x => x.Flag == "relearn"), "dúvidas marcadas", "Retomar a explicação", "circle-help"), ("outdated", cards.Count(x => x.Flag == "outdated"), "fontes para conferir", "Atualidade do conteúdo", "shield-check") })
        {
            var number = MentorText(stat.Item2.ToString(), 30); number.FontWeight = Microsoft.UI.Text.FontWeights.Medium;
            var label = MentorText(stat.Item3, 15); label.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            var content = Column(Row(OriginalIcon.Create(stat.Item5, 21, ColorBrush("#8AA079")), number), label, MentorText(stat.Item4, muted: true)); content.Spacing = 6;
            if (stat.Item1 == "all") { var item = Card(content); item.Padding = new Thickness(20); stats.Children.Add(item); }
            else
            {
                var button = Tile(content, () => { signalFilter = signalFilter == stat.Item1 ? "all" : stat.Item1; Render(); });
                AutomationProperties.SetName(button, $"{stat.Item2} {stat.Item3}. Filtrar matérias.");
                if (signalFilter == stat.Item1) { button.Background = MentorMint; button.BorderBrush = ColorBrush("#85A176"); }
                stats.Children.Add(button);
            }
        }
        panel.Children.Add(stats);
        var planHeading = new Grid { ColumnSpacing = 16 }; planHeading.ColumnDefinitions.Add(new ColumnDefinition()); planHeading.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); planHeading.Children.Add(MentorHeading("UMA COISA DE CADA VEZ", "Seu plano de agora")); var target = OriginalIcon.Create("target", 23, ColorBrush("#93AA82")); Grid.SetColumn(target, 1); planHeading.Children.Add(target);
        var plan = Column(planHeading, MentorText("Uma sugestão para começar. Você decide o ritmo.", muted: true));
        var steps = Column(); steps.Spacing = 0;
        foreach (var insight in scoped.Take(5))
        {
            var deck = Deck(insight.SubjectId);
            var outdated = deck.Any(x => x.Flag == "outdated"); var relearn = deck.Any(x => x.Flag == "relearn");
            var next = State.Lessons.Where(x => x.SubjectId == insight.SubjectId && x.Status != "done").OrderBy(x => x.Status == "in-progress" ? 0 : 1).ThenBy(x => x.Order).FirstOrDefault();
            var label = outdated ? "Conferir fonte · " + insight.Name : insight.Due > 0 ? "Revisar · " + insight.Name : relearn ? "Retomar a explicação · " + insight.Name : next != null ? "Continuar · " + next.Title : "Continuar estudando · " + insight.Name;
            var icon = outdated || insight.Due > 0 || relearn ? "brain" : "book-open";
            var button = ActionButton(label, () => { if (outdated) OpenMentorReviews(insight.SubjectId, "outdated"); else if (insight.Due > 0) OpenMentorReviews(insight.SubjectId); else if (relearn) OpenMentorReviews(insight.SubjectId, "relearn"); else if (next != null) OpenLesson(next); else OpenMentorStudies(insight.SubjectId); return Task.CompletedTask; });
            button.HorizontalAlignment = HorizontalAlignment.Stretch; button.HorizontalContentAlignment = HorizontalAlignment.Stretch; button.Padding = new Thickness(8, 18, 8, 18); button.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent); button.BorderBrush = MentorLine; button.BorderThickness = new Thickness(0, 0, 0, 1);
            var step = new Grid { ColumnSpacing = 12 }; step.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); step.ColumnDefinitions.Add(new ColumnDefinition()); step.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); step.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var index = MentorText((steps.Children.Count + 1).ToString()); index.HorizontalAlignment = HorizontalAlignment.Center; index.VerticalAlignment = VerticalAlignment.Center;
            step.Children.Add(new Border { Width = 30, Height = 30, CornerRadius = new CornerRadius(15), Background = MentorMint, Child = index, VerticalAlignment = VerticalAlignment.Top });
            var title = MentorText(label, 16); title.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            var copy = Column(title, MentorText(insight.Reason, muted: true)); copy.Spacing = 5; Grid.SetColumn(copy, 1); step.Children.Add(copy);
            var kind = OriginalIcon.Create(icon, 18, MentorGreen); Grid.SetColumn(kind, 2); step.Children.Add(kind); var arrow = OriginalIcon.Create("arrow-right", 16, MentorGreen); Grid.SetColumn(arrow, 3); step.Children.Add(arrow); button.Content = step; steps.Children.Add(button);
        }
        if (scoped.Length == 0) steps.Children.Add(Column(MentorText("Espaço para um novo passo.", 18, display: true), MentorText("Registre uma aula ou uma revisão para a Íris acompanhar seu caminho.", muted: true), MentorLink("Explorar meus estudos", () => { OpenMentorStudies(assistantScope); return Task.CompletedTask; })));
        plan.Children.Add(steps); plan.Children.Add(OriginalActionButton($"Reservar {State.Settings.FocusMinutes} minutos de foco", "timer", () => OpenMentorFocus(assistantScope)));
        var layout = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 490, Gap = 26 }; layout.Children.Add(Card(plan)); layout.Children.Add(CoachSurface(false)); panel.Children.Add(layout);
        var diagnosis = Column(MentorHeading("O QUE OS SEUS REGISTROS MOSTRAM", "Um olhar por matéria"), MentorLink("Ver progresso", () => { Navigate("progress"); return Task.CompletedTask; }));
        var filter = new ComboBox { Header = MentorText("Mostrar matérias"), HorizontalAlignment = HorizontalAlignment.Stretch, MaxWidth = 460 };
        foreach (var item in new[] { ("all", "Todos os sinais"), ("review", "Com revisão vencida"), ("relearn", "Com dúvidas marcadas"), ("outdated", "Com fontes para conferir"), ("unknown", "Ainda sem revisões") }) filter.Items.Add(new ComboBoxItem { Tag = item.Item1, Content = item.Item2 });
        filter.SelectedItem = filter.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == signalFilter);
        filter.SelectionChanged += (_, _) => { signalFilter = Choice(filter); Render(); }; diagnosis.Children.Add(filter);
        var subjects = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 480, Gap = 30 };
        foreach (var insight in scoped.Where(x => signalFilter == "all" || signalFilter == "review" && x.Due > 0 || signalFilter == "unknown" && Deck(x.SubjectId).All(c => c.LastReviewedAt == null) || Deck(x.SubjectId).Any(c => c.Flag == signalFilter)))
            subjects.Children.Add(MentorSubject(insight, Deck(insight.SubjectId), now));
        diagnosis.Children.Add(subjects);
        if (subjects.Children.Count == 0) diagnosis.Children.Add(Column(MentorText("Nenhuma matéria com esse sinal.", 18, display: true), MentorText(signalFilter == "all" ? "Adicione uma matéria para começar seu acompanhamento." : "Você pode escolher outro filtro para olhar seu percurso.", muted: true), MentorLink(signalFilter == "all" ? "Adicionar matéria" : "Ver todos os sinais", () => { if (signalFilter == "all") OpenMentorStudies(""); else { signalFilter = "all"; Render(); } return Task.CompletedTask; })));
        panel.Children.Add(Card(diagnosis));
        panel.Children.Add(Row(OriginalIcon.Create("shield-check", 19, MentorMuted), Column(MentorText("Um acompanhamento honesto.", 15), MentorText("O diagnóstico resume registros do Ninho; não mede seu domínio real da matéria nem prevê nota em prova.", muted: true), MentorText("Cobertura significa cartões que você já praticou, não percentual de conhecimento. Aulas concluídas são marcações suas.", muted: true), MentorText("Atraso de revisão sugere uma oportunidade de praticar. Conteúdo desatualizado precisa ser conferido na fonte; não é detectado automaticamente.", muted: true))));
        return panel;
    }
    private UIElement MentorSubject(Recommendation insight, ReviewCard[] deck, DateTimeOffset now)
    {
        var practiced = deck.Count(x => x.LastReviewedAt != null); var stable = deck.Count(x => x.LastReviewedAt != null && x.Repetitions >= 3 && x.IntervalDays >= 7);
        var lessons = State.Lessons.Where(x => x.SubjectId == insight.SubjectId).ToArray(); var done = lessons.Count(x => x.Status == "done");
        var outdated = deck.Count(x => x.Flag == "outdated"); var relearn = deck.Count(x => x.Flag == "relearn");
        var coverage = deck.Length == 0 ? 0 : practiced * 100d / deck.Length;
        var status = outdated > 0 ? "Conferir fonte" : insight.Due > 0 || relearn > 0 ? "Revisão necessária" : practiced == 0 && done == 0 && insight.Minutes == 0 ? "Ainda sem evidência" : practiced < 5 || coverage < 25 ? "Construindo base" : practiced >= 5 && stable >= practiced / 2d && coverage >= 50 ? "Em dia" : "Em consolidação";
        var confidence = practiced == 0 ? "sem evidência" : practiced < 5 ? "baixa" : practiced < 20 ? "moderada" : "ampla";
        var badge = new Border { Background = MentorMint, CornerRadius = new CornerRadius(6), Padding = new Thickness(10, 6, 10, 6), Child = MentorText(status, 12) };
        var title = MentorText(insight.Name, 18); title.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        var copy = Column(Row(title, badge), Row(OriginalIcon.Create("circle-check", 14, MentorMuted), MentorText("Evidência: " + confidence, muted: true), MentorText($"{done}/{lessons.Length} aulas concluídas", muted: true), MentorText($"{insight.Minutes} min registrados", muted: true)), Row(MentorText("Cartões já praticados", 15), MentorText($"{practiced}/{deck.Length}", 15))); copy.Spacing = 16;
        if (deck.Length > 0) copy.Children.Add(new ProgressBar { Value = practiced, Maximum = deck.Length, Height = 7, Foreground = ColorBrush(State.Subjects.First(x => x.Id == insight.SubjectId).Color) });
        copy.Children.Add(MentorText(deck.Length == 0 ? "Ainda não há cartões suficientes para calcular a cobertura." : $"{Math.Round(coverage)}% dos cartões já praticados. Isso não mede domínio da matéria.", muted: true));
        var signals = Column(); signals.Spacing = 5;
        foreach (var reason in insight.Reason.Split(" • ")) signals.Children.Add(MentorText("• " + reason, muted: true));
        copy.Children.Add(signals);
        var today = now.LocalDateTime.ToString("yyyy-MM-dd");
        var exam = State.Exams.Where(x => x.SubjectId == insight.SubjectId && !x.Completed && string.CompareOrdinal(x.Date, today) >= 0).OrderBy(x => x.Date).ThenBy(x => x.Time).FirstOrDefault();
        if (exam != null) copy.Children.Add(Row(OriginalIcon.Create("calendar-days", 15, MentorMuted), MentorText(exam.Title + " · " + DateTime.ParseExact(exam.Date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture).ToString("dd/MM/yyyy"), muted: true)));
        copy.Children.Add(new Expander { Header = "Por que merece essa atenção?", Content = MentorText(insight.Reason, muted: true), HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch });
        copy.Children.Add(MentorLink(insight.Due > 0 || outdated > 0 || relearn > 0 ? "Cuidar das revisões" : "Continuar estudando", () => { if (outdated > 0) OpenMentorReviews(insight.SubjectId, "outdated"); else if (relearn > 0) OpenMentorReviews(insight.SubjectId, "relearn"); else if (insight.Due > 0) OpenMentorReviews(insight.SubjectId); else OpenMentorStudies(insight.SubjectId); return Task.CompletedTask; }));
        return new Border { Child = copy, BorderBrush = MentorLine, BorderThickness = new Thickness(0, 0, 0, 1), Padding = new Thickness(0, 26, 0, 26) };
    }
    private Border MentorChat()
    {
        var heading = Column(MentorText("CONVERSA COM IA LOCAL", 10, muted: true), Row(OriginalIcon.Create("sparkles", 22, MentorGreen), MentorText("Pode falar comigo", 24, display: true)), MentorText("Eu uso seus registros para ajudar a planejar, explicar e praticar.", muted: true)); heading.Spacing = 8;
        var chat = Column(heading, Row(OriginalIcon.Create("cpu", 14, MentorMuted), MentorText("No seu computador", 13, muted: true)), MentorText("Modelo local", 13));
        chat.Children.Add(AssistantModelMenu());
        chat.Children.Add(Badge(assistantScope == "" ? "Todos os meus estudos" : SubjectName(assistantScope)));
        chat.Children.Add(MentorText("A conversa recebe um resumo dos seus estudos. Arquivos e vídeos não são lidos automaticamente.", muted: true));
        var messages = Column(); messages.Spacing = 14;
        Border Message(string role, string value)
        {
            var title = MentorText(role, 14); title.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            var answer = MentorText(value, 15); answer.IsTextSelectionEnabled = true;
            var content = Column(title, answer); content.Spacing = 7;
            return new Border { Child = content, Background = role == "Você" ? MentorMint : ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#2B2E35" : "#F2F4EE"), Padding = new Thickness(17), CornerRadius = new CornerRadius(11), Margin = role == "Você" ? new Thickness(20, 0, 0, 0) : new Thickness(0) };
        }
        assistantMessagesScroll = new ScrollViewer { Content = messages, MaxHeight = 420, MinHeight = 170, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        var scroll = assistantMessagesScroll;
        scroll.Loaded += (_, _) => { if (assistantHistory.Count > 0 || generation != null) DispatcherQueue.TryEnqueue(() => scroll.ChangeView(null, scroll.ScrollableHeight, null, true)); };
        chat.Children.Add(scroll);
        assistantInput = new TextBox { Text = assistantQuestion, PlaceholderText = "Pergunte, conte uma dificuldade ou cole um trecho da aula…", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 110, MaxLength = 1200, IsEnabled = generation == null };
        AutomationProperties.SetName(assistantInput, "Converse com Íris");
        assistantInput.TextChanged += (_, _) => assistantQuestion = assistantInput.Text;
        var enter = new KeyboardAccelerator { Key = global::Windows.System.VirtualKey.Enter, Modifiers = global::Windows.System.VirtualKeyModifiers.Control };
        enter.Invoked += async (_, args) => { args.Handled = true; await GenerateAdvice(); }; assistantInput.KeyboardAccelerators.Add(enter);
        if (assistantHistory.Count == 0)
        {
            var shortcuts = Row();
            foreach (var prompt in new[] { "Por onde eu começo hoje?", "Me ajude a entender um assunto", "Crie um exercício para eu praticar" })
            {
                var button = ActionButton(prompt, () => { assistantQuestion = prompt; if (assistantInput != null) assistantInput.Text = prompt; return Task.CompletedTask; }); button.IsEnabled = generation == null; button.FontSize = 12; button.Padding = new Thickness(10, 8, 10, 8); shortcuts.Children.Add(button);
            }
            chat.Children.Add(shortcuts);
        }
        assistantSend = new Button { Style = (Style)Application.Current.Resources["AccentButtonStyle"], Content = Row(OriginalIcon.Create("send", 16, new SolidColorBrush(Microsoft.UI.Colors.White)), new TextBlock { Text = "Enviar à Íris", Foreground = new SolidColorBrush(Microsoft.UI.Colors.White) }), IsEnabled = generation == null };
        assistantCancel = new Button { Content = Row(OriginalIcon.Create("square", 16, MentorInk), MentorText("Interromper", 13)), IsEnabled = generation != null };
        assistantCancel.Click += (_, _) => generation?.Cancel(); assistantSend.Click += async (_, _) => await GenerateAdvice();
        chat.Children.Add(assistantInput); chat.Children.Add(MentorText("Ctrl + Enter para enviar · Pode haver erros: confira informações importantes.", 12, muted: true)); chat.Children.Add(Row(assistantSend, assistantCancel));
        var clear = OriginalActionButton("Nova conversa", "trash-2", () =>
        {
            if (generation != null) { ShowNotice("Interrompa a resposta antes de iniciar outra conversa."); return Task.CompletedTask; }
            assistantHistory.Clear(); assistantReply = assistantQuestion = assistantLastQuestion = ""; refreshAssistantConversation?.Invoke(); return Task.CompletedTask;
        });
        chat.Children.Add(clear);
        void FillConversation()
        {
            messages.Children.Clear();
            foreach (var turn in assistantHistory) { messages.Children.Add(Message("Você", turn.Question)); messages.Children.Add(Message("Íris", turn.Answer)); }
        assistantOutput = null;
        if (assistantReply.Length > 0 && (generation != null || assistantHistory.LastOrDefault().Answer != assistantReply))
        {
            if (assistantLastQuestion.Length > 0) messages.Children.Add(Message("Você", assistantLastQuestion));
            assistantOutput = MentorText(assistantReply, 15); assistantOutput.IsTextSelectionEnabled = true;
            messages.Children.Add(new Border { Background = ColorBrush(Root.ActualTheme == ElementTheme.Dark ? "#2B2E35" : "#F2F4EE"), Padding = new Thickness(17), CornerRadius = new CornerRadius(11), Child = Column(MentorText("Íris", 14), assistantOutput) });
        }
        if (messages.Children.Count == 0) messages.Children.Add(Message("Íris", $"Oi, {State.Settings.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "estudante"}! Vamos destravar seus estudos?\n\nPosso explicar uma ideia passo a passo, criar exercícios e ajustar um plano junto com você."));
            assistantInput!.Text = assistantQuestion;
            assistantInput.IsEnabled = generation == null && profileGeneration == null;
            assistantSend!.IsEnabled = generation == null && profileGeneration == null;
            assistantCancel!.IsEnabled = generation != null;
            refreshAssistantModelState?.Invoke();
            clear.Visibility = assistantHistory.Count > 0 || assistantReply.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
            clear.IsEnabled = generation == null;
            if (assistantHistory.Count > 0 || generation != null) DispatcherQueue.TryEnqueue(() => scroll.ChangeView(null, scroll.ScrollableHeight, null, true));
        }
        refreshAssistantConversation = FillConversation;
        FillConversation();
        var result = Card(chat); result.Padding = new Thickness(26); return result;
    }
    private async Task GenerateAdvice()
    {
        if (generation != null || profileGeneration != null) return;
        if (changingAssistantModel) { ShowNotice("Aguarde a seleção do modelo terminar."); return; }
        if (string.IsNullOrWhiteSpace(State.Settings.ModelPath)) { assistantModelChoices?.Focus(Microsoft.UI.Xaml.FocusState.Programmatic); ShowNotice("Escolha um modelo no menu acima da conversa."); return; }
        if (string.IsNullOrWhiteSpace(assistantQuestion)) { ShowNotice("Escreva o que gostaria de planejar ou revisar."); return; }
        try { await FlushLocalEdits(); } catch { return; }
        if (!appActive || generation != null || profileGeneration != null || changingAssistantModel || string.IsNullOrWhiteSpace(assistantQuestion)) return;
        var question = assistantQuestion.Trim(); var scope = assistantScope; var snapshot = State; var version = assistantGenerationVersion;
        var request = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        generation = request;
        void Update(string value) { if (appActive && !request.IsCancellationRequested && version == assistantGenerationVersion && ReferenceEquals(generation, request)) UpdateAssistant(value); }
        assistantLastQuestion = question; assistantQuestion = ""; assistantReply = "Preparando seu contexto de estudos…";
        if (route == "mentor") refreshAssistantConversation?.Invoke();
        try
        {
            var history = assistantHistory.TakeLast(2).Select(x => new ContextMessage(x.Question, x.Answer)).ToArray();
            var context = await Task.Run(() => StudyEngine.BuildContext(snapshot, DateTimeOffset.Now, scope == "" ? null : scope, history));
            var lastUpdate = DateTime.MinValue;
            var progress = new Progress<string>(value => { if ((DateTime.UtcNow - lastUpdate).TotalMilliseconds < 100) return; Update(value); lastUpdate = DateTime.UtcNow; });
            var result = await model.AnswerAsync(snapshot.Settings.ModelPath, context, question, progress, request.Token);
            request.Token.ThrowIfCancellationRequested();
            if (!appActive) throw new OperationCanceledException();
            Update(result.Length > 0 ? result : "O modelo não gerou uma resposta. Tente uma pergunta mais curta.");
            if (result.Length > 0 && version == assistantGenerationVersion) { assistantHistory.Add((question, result)); if (assistantHistory.Count > 6) assistantHistory.RemoveAt(0); }
        }
        catch (OperationCanceledException) { if (version == assistantGenerationVersion && ReferenceEquals(generation, request)) UpdateAssistant("Geração interrompida. Seus estudos foram preservados."); }
        catch (Exception error) { Update("Não foi possível usar o modelo local: " + error.Message); }
        finally { request.Dispose(); if (ReferenceEquals(generation, request)) generation = null; if (route == "mentor") refreshAssistantConversation?.Invoke(); }
    }
    private void UpdateAssistant(string value)
    {
        assistantReply = value;
        if (route != "mentor") return;
        var scroll = assistantMessagesScroll;
        var follow = scroll != null && scroll.VerticalOffset >= scroll.ScrollableHeight - 60;
        if (assistantOutput != null) assistantOutput.Text = value;
        if (follow && scroll != null) DispatcherQueue.TryEnqueue(() => scroll.ChangeView(null, scroll.ScrollableHeight, null, true));
        if (assistantSend != null) assistantSend.IsEnabled = generation == null;
        if (assistantCancel != null) assistantCancel.IsEnabled = generation != null;
    }
}
