using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private string reviewMode = "home", reviewFilter = "all", reviewQuery = "", revealedCard = "";
    private int reviewedCount;
    private int libraryPage;

    private StackPanel ReviewsPage()
    {
        var title = DashboardText("O que fica com você.", 32, display: true); title.LineHeight = 38.4;
        var subtitle = StudyText("", 13, muted: true); subtitle.Margin = new Thickness(0, 8, 0, 0);
        var add = ReviewPrimary("Novo cartão", "plus", AddQuestion);
        var header = StudyBetween(StudyStack(0, title, subtitle), add, 22); header.Margin = new Thickness(0, 0, 0, 27);
        var subject = SubjectPicker(selectedSubject, true);
        subject.Header = null; subject.FontSize = 12; subject.MinWidth = 180; subject.MaxWidth = 250; subject.MinHeight = 40;
        AutomationProperties.SetName(subject, "Filtrar matéria");
        var subjectField = StudyStack(4, StudyText("Filtrar matéria", 9, muted: true), subject); subjectField.Margin = new Thickness(0, -13, 0, 0);
        var tabs = ReviewTabs(mode => { reviewMode = mode; Render(); }, out var updateTabs);
        var toolbar = StudyBetween(tabs, subjectField); toolbar.Margin = new Thickness(0, 0, 0, 23);
        var content = StudyStack(0);
        var page = StudyStack(0, header, toolbar, content);
        string mountedMode = "";
        Action updateContent = () => { };
        bool refreshing = false;
        void RefreshReviews()
        {
            if (refreshing) return;
            refreshing = true;
            try
            {
                subtitle.Text = State.Subjects.Count > 0 ? "Revisões curtas para transformar estudo em memória." : "Crie uma matéria em Meus estudos para começar a guardar seus cartões.";
                add.IsEnabled = State.Subjects.Count > 0;
                ToolTipService.SetToolTip(add, add.IsEnabled ? "Novo cartão" : "Crie uma matéria em Meus estudos primeiro.");
                if (Choice(subject) != selectedSubject)
                    subject.SelectedItem = subject.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == selectedSubject) ?? subject.Items[0];
                selectedSubject = Choice(subject);
                updateTabs();
                if (mountedMode != reviewMode)
                {
                    var changingSection = mountedMode.Length > 0;
                    mountedMode = reviewMode;
                    content.Children.Clear();
                    content.Children.Add(reviewMode switch
                    {
                        "study" => ReviewStudyView(page, out updateContent),
                        "library" => ReviewLibraryView(out updateContent),
                        _ => ReviewWelcomeView(out updateContent)
                    });
                    if (changingSection) AnimatePageChange(content);
                }
                updateContent();
            }
            finally { refreshing = false; }
        }
        subject.SelectionChanged += (_, _) =>
        {
            if (refreshing) return;
            selectedSubject = Choice(subject); revealedCard = ""; libraryPage = 0; RefreshReviews();
        };
        refreshPage = RefreshReviews;
        RefreshReviews();
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        timer.Tick += (_, _) => { if (route == "reviews" && !busy && reviewMode != "library") RefreshReviews(); };
        page.Loaded += (_, _) => timer.Start(); page.Unloaded += (_, _) => timer.Stop();
        return page;
    }

    private ReviewCard[] CurrentReviewQueue() => StudyEngine.DueCards(State, DateTimeOffset.Now, string.IsNullOrEmpty(selectedSubject) ? null : selectedSubject).ToArray();
    private ReviewCard? ReviewById(string id) => State.Cards.FirstOrDefault(x => x.Id == id);

    private FrameworkElement ReviewWelcomeView(out Action update)
    {
        var heading = DashboardText("", 32, display: true); heading.LineHeight = 38.4; heading.Margin = new Thickness(0, 17, 0, 17);
        var description = StudyText("", 12, muted: true); description.MaxWidth = 410; description.HorizontalAlignment = HorizontalAlignment.Left;
        var start = ReviewPrimary("Começar revisão", "play", () => { reviewMode = "study"; reviewedCount = 0; revealedCard = ""; Render(); return Task.CompletedTask; });
        start.Margin = new Thickness(0, 23, 0, 0);
        var reviews = StudyText("", 10, muted: true); var fresh = StudyText("", 10, muted: true);
        var facts = DashboardRow(DashboardRow(OriginalIcon.Create("brain", 17, DashboardMuted), reviews), DashboardRow(OriginalIcon.Create("sparkles", 17, DashboardMuted), fresh));
        facts.Spacing = 25; facts.Margin = new Thickness(0, 25, 0, 0);
        foreach (var row in facts.Children.OfType<StackPanel>()) row.Spacing = 7;
        var words = StudyStack(0, ReviewEyebrow("UM POUCO, TODOS OS DIAS"), heading, description, start, facts); words.MaxWidth = 490; words.HorizontalAlignment = HorizontalAlignment.Left;
        var owl = new OwlControl { Happy = true, Width = 220, Height = 220, Animate = !State.Settings.ReducedMotion, Margin = new Thickness(0, 0, 25, 0) };
        var heroGrid = StudyBetween(words, owl, 30); heroGrid.VerticalAlignment = VerticalAlignment.Center;
        var hero = DashboardPanel(heroGrid, new Thickness(40)); hero.CornerRadius = new CornerRadius(15);
        hero.SizeChanged += (_, _) =>
        {
            var compact = hero.ActualWidth < 740;
            owl.Width = owl.Height = compact ? 150 : 220; owl.Margin = new Thickness(0, 0, compact ? 0 : 25, 0);
            hero.Padding = new Thickness(compact ? 26 : 40);
        };
        var tips = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 270, Gap = 20, Margin = new Thickness(0, 22, 0, 0) };
        tips.Children.Add(ReviewTip("flag", "Um conteúdo mudou?", "Use “Conferir conteúdo” para verificar leis, versões ou informações. O Ninho agenda revisões; a atualização da fonte é feita por você.",
            StudyLink("Ver conteúdos sinalizados", "arrow-right", () => { reviewFilter = "outdated"; reviewMode = "library"; libraryPage = 0; Render(); return Task.CompletedTask; }, false)));
        tips.Children.Add(ReviewTip("rotate-ccw", "Esquecer faz parte.", "Se não conseguiu lembrar, escolha “Não lembrei”. “Com esforço” significa que você lembrou sem olhar.", StudyText("Atalhos: espaço revela · 1, 2, 3 e 4 respondem", 10, muted: true)));
        update = () =>
        {
            var due = CurrentReviewQueue();
            heading.Text = due.Length > 0 ? $"{due.Length} conhecimentos esperam por você." : "Sua memória pode respirar.";
            description.Text = due.Length > 0 ? "Tente responder antes de revelar. A sua resposta ajusta quando o cartão volta." : "Você está em dia com as revisões disponíveis. Volte depois ou guarde um novo conhecimento.";
            start.IsEnabled = due.Length > 0;
            reviews.Text = $"{due.Count(x => x.LastReviewedAt != null)} revisões"; fresh.Text = $"{due.Count(x => x.LastReviewedAt == null)} novos hoje";
        };
        return StudyStack(0, hero, tips);
    }

    private FrameworkElement ReviewStudyView(UIElement scope, out Action update)
    {
        string currentId = "";
        var subject = StudyText("", 12); var progress = StudyText("", 10, muted: true);
        var meta = StudyBetween(subject, progress); meta.Margin = new Thickness(0, 0, 0, 17);
        var question = StudyText("", 23, bold: true); question.LineHeight = 34.5; question.MinHeight = 65; question.Margin = new Thickness(0, 30, 0, 30);
        AutomationProperties.SetAutomationId(question, "card-review-question");
        var answer = StudyText("", 15); answer.LineHeight = 27; answer.IsHitTestVisible = true; answer.IsTextSelectionEnabled = true;
        AutomationProperties.SetAutomationId(answer, "card-review-answer");
        var source = StudyText("", 10, muted: true); source.LineHeight = 16;
        var sourceLink = StudyLink("Conferir fonte", "arrow-up-right", () => ReviewById(currentId) is { } card ? OpenSource(card.SourceUrl) : Task.CompletedTask, false);
        var sourceRow = new Border { Child = StudyBetween(source, sourceLink, 15), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 14, 0, 0), Margin = new Thickness(0, 23, 0, 0) };
        var answerPanel = new Border { Child = StudyStack(0, answer, sourceRow), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 24, 0, 0) };
        Task Reveal()
        {
            if (reviewMode == "study" && currentId.Length > 0) { revealedCard = currentId; Render(); }
            return Task.CompletedTask;
        }
        var reveal = ReviewPrimary("Revelar resposta", "", Reveal);
        if (reveal.Content is StackPanel revealRow)
        {
            var shortcutText = StudyText("espaço", 9); shortcutText.Foreground = reveal.Foreground;
            revealRow.Children.Add(new Border { Child = shortcutText, BorderBrush = ColorBrush("#73968B"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4), Padding = new Thickness(5, 2, 5, 2), Margin = new Thickness(8, 0, 0, 0), Opacity = .7 });
        }
        reveal.HorizontalAlignment = HorizontalAlignment.Center; reveal.Margin = new Thickness(0, 8, 0, 30);
        AddReviewShortcut(reveal, scope, global::Windows.System.VirtualKey.Space, Reveal);
        var outdated = ReviewFlag("Conferir conteúdo", "flag", () => ToggleReviewFlag(currentId, "outdated"));
        var relearn = ReviewFlag("Rever aula", "brain", () => ToggleReviewFlag(currentId, "relearn"));
        var edit = StudyIconButton("Editar cartão", "pencil", () => ReviewById(currentId) is { } card ? EditQuestion(card) : Task.CompletedTask, 15);
        var flags = StudyBetween(DashboardRow(outdated, relearn), edit); flags.Margin = new Thickness(0, 30, 0, 0);
        ((StackPanel)flags.Children[0]).Spacing = 15;
        var cardPanel = DashboardPanel(StudyStack(0, ReviewEyebrow("LEMBRE COM SUAS PALAVRAS"), question, reveal, answerPanel, flags), new Thickness(40, 35, 40, 35)); cardPanel.CornerRadius = new CornerRadius(15);
        var ratings = new AdaptiveColumns { MaximumColumns = 4, MinimumColumnWidth = 130, Gap = 11, Margin = new Thickness(0, 16, 0, 0) };
        var number = 0;
        foreach (var rating in new[] { ("again", "Não lembrei", "Mais cedo", "#B97462"), ("hard", "Com esforço", "Um passo menor", "#AE9550"), ("good", "Lembrei", "Seguir no ritmo", "#5B946E"), ("easy", "Muito fácil", "Mais adiante", "#698DA5") })
        {
            var key = ++number;
            async Task Rate()
            {
                var id = currentId;
                if (reviewMode != "study" || id.Length == 0 || revealedCard != id || ReviewById(id) == null) return;
                await Save(s => StudyEngine.Review(s, id, rating.Item1, DateTimeOffset.Now), false, immediateBackup: true);
                reviewedCount++; revealedCard = ""; Render();
            }
            var button = ReviewRating(key, rating.Item2, rating.Item3, rating.Item4, Rate);
            AddReviewShortcut(button, scope, (global::Windows.System.VirtualKey)(48 + key), Rate); ratings.Children.Add(button);
        }
        var pause = StudyPlain("Pausar a revisão", StudyText("Pausar a revisão", 11, muted: true), () => { reviewMode = "home"; Render(); return Task.CompletedTask; });
        pause.HorizontalAlignment = HorizontalAlignment.Center; pause.Margin = new Thickness(0, 23, 0, 23);
        var session = StudyStack(0, meta, cardPanel, ratings, pause); session.MaxWidth = 800; session.HorizontalAlignment = HorizontalAlignment.Stretch; session.Margin = new Thickness(0, 35, 0, 35);
        var doneTitle = DashboardText("", 29, display: true); doneTitle.TextAlignment = TextAlignment.Center; doneTitle.Margin = new Thickness(0, 14, 0, 14);
        var doneOwl = new OwlControl { Happy = true, Width = 170, Height = 170, Animate = !State.Settings.ReducedMotion, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 10) };
        var doneCaption = ReviewEyebrow("PASSO DADO"); doneCaption.TextAlignment = TextAlignment.Center;
        var doneText = StudyText("O que você relembra hoje fica mais forte amanhã.", 12, muted: true); doneText.TextAlignment = TextAlignment.Center;
        var finish = ReviewPrimary("Concluir revisão", "check", () => { reviewMode = "home"; Render(); return Task.CompletedTask; }); finish.HorizontalAlignment = HorizontalAlignment.Center; finish.Margin = new Thickness(0, 25, 0, 0);
        var done = DashboardPanel(StudyStack(0, doneOwl, doneCaption, doneTitle, doneText, finish), new Thickness(32)); done.MaxWidth = 650; done.Margin = new Thickness(0, 30, 0, 30); done.HorizontalAlignment = HorizontalAlignment.Stretch;
        update = () =>
        {
            var due = CurrentReviewQueue(); var card = due.FirstOrDefault();
            currentId = card?.Id ?? "";
            session.Visibility = card == null ? Visibility.Collapsed : Visibility.Visible; done.Visibility = card == null ? Visibility.Visible : Visibility.Collapsed;
            doneTitle.Text = reviewedCount > 0 ? $"{reviewedCount} conhecimentos revisitados." : "Tudo em dia por enquanto.";
            if (card == null) return;
            subject.Text = SubjectName(card.SubjectId); progress.Text = $"{reviewedCount} revisados nesta sessão · {due.Length} disponíveis";
            question.Text = card.Question; answer.Text = card.Answer;
            source.Text = $"{(card.Source.Length > 0 ? card.Source : "Conhecimento criado por você")} · guardado em {ReviewDate(card.CreatedAt)}";
            sourceLink.Visibility = string.IsNullOrWhiteSpace(card.SourceUrl) ? Visibility.Collapsed : Visibility.Visible;
            var show = revealedCard == card.Id;
            answerPanel.Visibility = ratings.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
            reveal.Visibility = show ? Visibility.Collapsed : Visibility.Visible;
            SetReviewFlag(outdated, card.Flag == "outdated"); SetReviewFlag(relearn, card.Flag == "relearn");
        };
        return StudyStack(0, session, done);
    }

    private FrameworkElement ReviewLibraryView(out Action update)
    {
        var search = new TextBox { Text = reviewQuery, PlaceholderText = "Buscar nos cartões…" }; AutomationProperties.SetName(search, "Buscar nos cartões");
        var filter = new ComboBox { MinWidth = 180, FontSize = 12, MinHeight = 42 };
        AutomationProperties.SetName(filter, "Filtrar cartões");
        foreach (var item in new[] { ("all", "Todos os cartões"), ("outdated", "Conferir conteúdo"), ("relearn", "Rever aula"), ("suspended", "Pausados") }) filter.Items.Add(new ComboBoxItem { Tag = item.Item1, Content = item.Item2 });
        filter.SelectedItem = filter.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == reviewFilter) ?? filter.Items[0];
        var searchFrame = StudySearch(search); searchFrame.HorizontalAlignment = HorizontalAlignment.Left; searchFrame.Width = 390;
        var toolbar = StudyBetween(searchFrame, filter); toolbar.Margin = new Thickness(0, 0, 0, 23);
        var note = StudyText("Os 71 cartões iniciais vieram de dois PDFs consultados: Banco de dados (aula 00) e Literatura (aula 00). As demais aulas estão no catálogo para você acrescentar seus conhecimentos.", 11, muted: true);
        var opened = new HashSet<string>();
        var visibleIds = new System.Collections.ObjectModel.ObservableCollection<string>();
        var visibleCards = new Dictionary<string, ReviewCard>();
        var realized = new Dictionary<UIElement, (string Id, Action<ReviewCard> Update)>();
        var rows = new ItemsRepeater { Layout = new StackLayout { Spacing = 14 }, VerticalCacheLength = 1, Margin = new Thickness(0, 19, 0, 0) };
        rows.ItemTemplate = new ReviewElementFactory(id =>
        {
            var element = ReviewLibraryCard(id, opened, out var updater);
            updater(visibleCards[id]);
            realized[element] = (id, updater);
            return element;
        }, element => realized.Remove(element));
        rows.ItemsSource = visibleIds;
        var empty = StudyEmpty("Nenhum cartão por aqui.", State.Subjects.Count > 0 ? "Experimente outro filtro ou guarde um conhecimento novo." : "Crie uma matéria em Meus estudos antes de adicionar cartões.", State.Subjects.Count > 0 ? "Novo cartão" : null, State.Subjects.Count > 0 ? AddQuestion : null);
        var pageText = StudyText("", 10, muted: true);
        const int pageSize = 100;
        Action fill = () => { };
        var back = StudyLink("Anterior", "arrow-left", () => { libraryPage--; fill(); return Task.CompletedTask; });
        var next = StudyLink("Próximos", "arrow-right", () => { libraryPage++; fill(); return Task.CompletedTask; }, false);
        var paging = StudyBetween(DashboardRow(back, pageText), next); paging.Margin = new Thickness(0, 14, 0, 0);
        bool filling = false;
        List<ReviewCard>? previousCards = null;
        string? previousSubject = null, previousQuery = null, previousFilter = null;
        var previousPage = -1;
        var searchDelay = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(160) };
        searchDelay.Tick += (_, _) => { searchDelay.Stop(); fill(); };
        rows.Unloaded += (_, _) => searchDelay.Stop();
        fill = () =>
        {
            if (filling) return;
            filling = true;
            try
            {
                if (Choice(filter) != reviewFilter) filter.SelectedItem = filter.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == reviewFilter) ?? filter.Items[0];
                if (ReferenceEquals(previousCards, State.Cards) && previousSubject == selectedSubject && previousQuery == reviewQuery && previousFilter == reviewFilter && previousPage == libraryPage) return;
                var matches = State.Cards.Where(x => (selectedSubject == "" || x.SubjectId == selectedSubject) && ContainsText(x.Question + " " + x.Answer, reviewQuery) && (reviewFilter == "all" || reviewFilter == "suspended" && x.Suspended || reviewFilter == "outdated" && x.Flag == "outdated" || reviewFilter == "relearn" && (x.Flag == "relearn" || x.Lapses >= 3))).ToArray();
                libraryPage = Math.Clamp(libraryPage, 0, Math.Max(0, (matches.Length - 1) / pageSize));
                var visible = matches.Skip(libraryPage * pageSize).Take(pageSize).ToArray();
                visibleCards = visible.ToDictionary(card => card.Id);
                foreach (var item in realized.Values)
                    if (visibleCards.TryGetValue(item.Id, out var card)) item.Update(card);
                for (var i = visibleIds.Count - 1; i >= 0; i--)
                    if (!visibleCards.ContainsKey(visibleIds[i])) visibleIds.RemoveAt(i);
                for (var i = 0; i < visible.Length; i++)
                {
                    var existing = visibleIds.IndexOf(visible[i].Id);
                    if (existing < 0) visibleIds.Insert(i, visible[i].Id);
                    else if (existing != i) visibleIds.Move(existing, i);
                }
                empty.Visibility = matches.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
                paging.Visibility = matches.Length > pageSize ? Visibility.Visible : Visibility.Collapsed;
                back.IsEnabled = libraryPage > 0; next.IsEnabled = (libraryPage + 1) * pageSize < matches.Length;
                pageText.Text = $"{libraryPage * pageSize + 1}–{Math.Min(matches.Length, (libraryPage + 1) * pageSize)} de {matches.Length} cartões";
                previousCards = State.Cards; previousSubject = selectedSubject; previousQuery = reviewQuery; previousFilter = reviewFilter; previousPage = libraryPage;
            }
            finally { filling = false; }
        };
        search.TextChanged += (_, _) => { reviewQuery = search.Text; libraryPage = 0; searchDelay.Stop(); searchDelay.Start(); };
        filter.SelectionChanged += (_, _) => { if (filling) return; searchDelay.Stop(); reviewFilter = Choice(filter); libraryPage = 0; fill(); };
        update = fill;
        return StudyStack(0, toolbar, note, paging, empty, rows);
    }

    private sealed class ReviewElementFactory(Func<string, UIElement> create, Action<UIElement> recycle) : IElementFactory
    {
        public UIElement GetElement(ElementFactoryGetArgs args) => create((string)args.Data);
        public void RecycleElement(ElementFactoryRecycleArgs args) => recycle(args.Element);
    }

    private FrameworkElement ReviewLibraryCard(string id, HashSet<string> opened, out Action<ReviewCard> update)
    {
        var meta = StudyText("", 10, muted: true);
        var question = StudyText("", 14, bold: true); question.Margin = new Thickness(0, 8, 0, 10);
        var answer = StudyText("", 12); answer.Margin = new Thickness(0, 14, 0, 14); answer.IsTextSelectionEnabled = true; answer.IsHitTestVisible = true;
        var source = StudyText("", 10, muted: true);
        var link = StudyLink("Fonte", "arrow-up-right", () => ReviewById(id) is { } card ? OpenSource(card.SourceUrl) : Task.CompletedTask, false);
        var details = StudyStack(0, answer, source, link);
        var chevron = OriginalIcon.Create("chevron-right", 11, DashboardGreen); var angle = new RotateTransform(); chevron.RenderTransform = angle; chevron.RenderTransformOrigin = new global::Windows.Foundation.Point(.5, .5);
        var summaryText = StudyText("Ver resposta", 11); summaryText.Foreground = DashboardGreen;
        var summary = StudyPlain("Ver resposta", DashboardRow(chevron, summaryText), () =>
        {
            if (!opened.Add(id)) opened.Remove(id);
            details.Visibility = opened.Contains(id) ? Visibility.Visible : Visibility.Collapsed; angle.Angle = opened.Contains(id) ? 90 : 0;
            AutomationProperties.SetItemStatus(summaryText, opened.Contains(id) ? "Resposta aberta" : "Resposta fechada");
            return Task.CompletedTask;
        }); summary.HorizontalAlignment = HorizontalAlignment.Left;
        var due = StudyText("", 10, muted: true); due.Margin = new Thickness(0, 12, 0, 0);
        var words = StudyStack(0, meta, question, summary, details, due);
        var edit = StudyIconButton("Editar cartão", "pencil", () => ReviewById(id) is { } card ? EditQuestion(card) : Task.CompletedTask);
        var flag = StudyIconButton("Conferir conteúdo", "flag", () => ToggleReviewFlag(id, "outdated"));
        var suspend = StudyIconButton("Pausar cartão", "circle-pause", () => Save(s => { if (s.Cards.FirstOrDefault(x => x.Id == id) is { } card) card.Suspended = !card.Suspended; }));
        var delete = StudyIconButton("Excluir cartão", "trash-2", async () => { if (await Confirm("Excluir este cartão?", "O cartão e seu agendamento serão removidos. As aulas e os materiais continuam guardados.")) await Save(s => s.Cards.RemoveAll(x => x.Id == id)); });
        var actions = DashboardRow(edit, flag, suspend, delete); actions.Spacing = 2; actions.VerticalAlignment = VerticalAlignment.Top;
        var cardPanel = DashboardPanel(StudyBetween(words, actions, 20), new Thickness(22)); cardPanel.CornerRadius = new CornerRadius(15);
        AutomationProperties.SetAutomationId(cardPanel, $"card-library-{id}");
        update = card =>
        {
            meta.Text = SubjectName(card.SubjectId) + (card.Suspended ? " · Pausado" : "") + (card.Flag == "outdated" ? " · Conferir conteúdo" : card.Flag == "relearn" ? " · Rever aula" : "");
            question.Text = card.Question; answer.Text = card.Answer; source.Text = card.Source;
            details.Visibility = opened.Contains(id) ? Visibility.Visible : Visibility.Collapsed; angle.Angle = opened.Contains(id) ? 90 : 0;
            link.Visibility = string.IsNullOrWhiteSpace(card.SourceUrl) ? Visibility.Collapsed : Visibility.Visible;
            due.Text = (card.LastReviewedAt == null ? "Novo conhecimento" : $"Próxima revisão: {ReviewDate(card.DueAt)}") + $" · {card.Lapses} esquecimentos";
            suspend.Content = OriginalIcon.Create(card.Suspended ? "play" : "circle-pause", 17, DashboardMuted);
            var suspendLabel = card.Suspended ? "Retomar cartão" : "Pausar cartão"; AutomationProperties.SetName(suspend, suspendLabel); ToolTipService.SetToolTip(suspend, suspendLabel);
            SetReviewFlag(flag, card.Flag == "outdated");
        };
        return cardPanel;
    }

    private Task ToggleReviewFlag(string id, string flag) => Save(s => { if (s.Cards.FirstOrDefault(x => x.Id == id) is { } current) current.Flag = current.Flag == flag ? "none" : flag; });

    private void AddReviewShortcut(Button button, UIElement scope, global::Windows.System.VirtualKey key, Func<Task> action)
    {
        var shortcut = new KeyboardAccelerator { Key = key, ScopeOwner = scope };
        shortcut.Invoked += async (_, args) =>
        {
            var focused = FocusManager.GetFocusedElement(Root.XamlRoot) as DependencyObject;
            for (var control = focused; control != null; control = VisualTreeHelper.GetParent(control))
                if (control is TextBox or RichEditBox or ComboBox or NumberBox or ContentDialog) return;
            for (DependencyObject? ancestor = button; ancestor != null; ancestor = VisualTreeHelper.GetParent(ancestor))
                if (ancestor is UIElement element && element.Visibility != Visibility.Visible) return;
            if (route == "reviews" && reviewMode == "study" && !busy && button.IsLoaded && button.IsEnabled)
            {
                args.Handled = true;
                await Run(action);
            }
        };
        button.KeyboardAccelerators.Add(shortcut);
    }
}
