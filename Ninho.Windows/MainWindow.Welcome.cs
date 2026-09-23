using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private Action? refreshWelcomeNavigation;
    private readonly HashSet<string> invalidWelcomeAnswers = [];
    private string WelcomeProgressPath => Path.Combine(store.DirectoryPath, "welcome-step-v2.txt");
    private async Task ResumeWelcome()
    {
        if (State.Profile is not { } profile) return;
        var saved = 0;
        try { if (File.Exists(WelcomeProgressPath) && new FileInfo(WelcomeProgressPath).Length < 32) int.TryParse(await File.ReadAllTextAsync(WelcomeProgressPath), out saved); } catch { }
        if (profile.CompletedAt != null && saved == 0) return;
        welcomeStep = WelcomeJourney.Resume(saved, profile); route = "welcome";
    }
    private async Task SetWelcomeStep(int step)
    {
        var temporary = WelcomeProgressPath + ".tmp";
        await File.WriteAllTextAsync(temporary, step.ToString(System.Globalization.CultureInfo.InvariantCulture));
        File.Move(temporary, WelcomeProgressPath, true); welcomeStep = step;
    }
    private async Task ExitWelcome()
    {
        await FlushLocalEdits();
        if (State.Profile?.CompletedAt == null) return;
        await SetWelcomeStep(0);
        route = "today"; Navigate("today"); ObserveUsage(true);
    }
    private UIElement WelcomeDays()
    {
        var days = Row();
        foreach (var (id, name) in new[] { ("mon", "Seg"), ("tue", "Ter"), ("wed", "Qua"), ("thu", "Qui"), ("fri", "Sex"), ("sat", "Sáb"), ("sun", "Dom") })
        {
            var toggle = new ToggleButton { Style = (Style)Application.Current.Resources["NinhoThemeChoiceStyle"], Content = name, MinWidth = 64, MinHeight = 52,
                BorderThickness = new Thickness(2), IsChecked = CurrentProfile.AvailableDays.Contains(id), CornerRadius = new CornerRadius(14), FontFamily = (FontFamily)Application.Current.Resources["NinhoSemiBoldFont"] };
            void Paint() { toggle.Background = toggle.IsChecked == true ? DashboardGreen : DashboardSurface; toggle.Foreground = toggle.IsChecked == true ? DashboardSurface : DashboardInk; toggle.BorderBrush = toggle.IsChecked == true ? DashboardGreen : DashboardLine; }
            Paint(); Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(toggle, "Disponível: " + name);
            toggle.Click += async (_, _) => { Paint(); var selected = toggle.IsChecked == true; await EditProfile(p => { p.AvailableDays.Remove(id); if (selected) p.AvailableDays.Add(id); }); };
            days.Children.Add(toggle);
        }
        return days;
    }
    private UIElement WelcomeMinutes(string label, int value, int maximum, int[] presets, Action<StudentProfile, int> set)
    {
        var input = new TextBox { Style = (Style)Application.Current.Resources["NinhoAnswerStyle"], Text = value.ToString(), MaxLength = 4, Width = 110, TextAlignment = TextAlignment.Center, FontSize = 23 };
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(input, label + " em minutos");
        var error = Caption(""); error.Foreground = ColorBrush(DashboardDark ? "#ECA6A1" : "#9D4841"); error.Visibility = Visibility.Collapsed;
        input.TextChanged += async (_, _) =>
        {
            if (int.TryParse(input.Text, out var minutes) && minutes >= 1 && minutes <= maximum)
            { invalidWelcomeAnswers.Remove(label); error.Visibility = Visibility.Collapsed; await EditProfile(p => set(p, minutes)); }
            else { invalidWelcomeAnswers.Add(label); error.Text = $"Escolha de 1 a {maximum} minutos."; error.Visibility = Visibility.Visible; }
            refreshWelcomeNavigation?.Invoke();
        };
        Button Adjust(string icon, int difference)
        {
            var button = OriginalActionButton("", icon, () => { var current = int.TryParse(input.Text, out var n) ? n : value; input.Text = Math.Clamp(current + difference, 1, maximum).ToString(); return Task.CompletedTask; });
            button.Width = button.Height = 52; button.Padding = new Thickness(16); button.CornerRadius = new CornerRadius(14);
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, (difference > 0 ? "Aumentar " : "Diminuir ") + label); return button;
        }
        var choices = Row();
        foreach (var minutes in presets)
        {
            var chip = ActionButton(minutes + " min", () => { input.Text = minutes.ToString(); return Task.CompletedTask; }); chip.CornerRadius = new CornerRadius(20); choices.Children.Add(chip);
        }
        return Column(Caption(label), Row(Adjust("minus", -5), input, Adjust("plus", 5), Body("minutos")), choices, error);
    }
    private UIElement WelcomeQuestions(int step)
    {
        var p = CurrentProfile;
        UIElement Timing()
        {
            var columns = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 310, Gap = 32 };
            columns.Children.Add(WelcomeMinutes("Tempo disponível por dia", p.DailyMinutes, 1440, [15, 30, 60, 90], (v, a) => v.DailyMinutes = a));
            columns.Children.Add(WelcomeMinutes("Duração de cada bloco", p.SessionMinutes, 240, [10, 15, 25, 45], (v, a) => v.SessionMinutes = a));
            return columns;
        }
        return step switch
        {
            1 => ProfileAnswer("Seu nome ou apelido", "Como você gosta de ser chamado?", p.Name, 100, (v, a) => v.Name = a, false),
            2 => ProfileAnswer("Meu objetivo", "Uma prova, uma formação ou algo que quero aprender…", p.Goal, 400, (v, a) => v.Goal = a),
            3 => Column(ProfileAnswer("O que torna esse objetivo importante?", "O que te dá vontade de continuar?", p.Motivation, 300, (v, a) => v.Motivation = a), ProfileAnswer("Tem algum prazo?", "Ex.: dezembro, ou ainda sem prazo", p.TargetDate, 40, (v, a) => v.TargetDate = a, false)),
            4 => ProfileAnswer("Matérias, cursos ou temas", "O que você quer priorizar neste momento?", p.Subjects, 300, (v, a) => v.Subjects = a),
            5 => ProfileAnswer("Meu ponto de partida", "O que já conhece e o que ainda está começando?", p.Level, 160, (v, a) => v.Level = a),
            6 => ProfileAnswer("Meu dia a dia", "Trabalho, aulas, deslocamentos e compromissos que seu plano precisa respeitar.", p.Routine, 400, (v, a) => v.Routine = a),
            7 => Column(Caption("Dias em que costuma ter espaço"), WelcomeDays(), ProfileAnswer("Meu horário preferido", "Manhã, tarde, noite ou uma faixa de horário", p.PreferredTime, 160, (v, a) => v.PreferredTime = a, false)),
            8 => Timing(),
            9 => Column(ProfileAnswer("O que funciona para você?", "Aulas, leitura, exercícios, escrever com suas palavras…", p.Preferences, 300, (v, a) => v.Preferences = a), ProfileAnswer("O que costuma atrapalhar?", "Tempo, organização, lembrar conteúdos, alguma matéria…", p.Challenges, 400, (v, a) => v.Challenges = a)),
            _ => Column(ProfileAnswer("Como podemos deixar o estudo mais confortável?", "Pausas, preferências de leitura ou adaptações. Compartilhe apenas o que quiser.", p.Accessibility, 240, (v, a) => v.Accessibility = a),
                Body($"Seu ponto de partida: até {p.DailyMinutes} minutos por dia, em blocos de até {Math.Min(p.DailyMinutes, p.SessionMinutes)} minutos. Você pode mudar qualquer resposta depois em Meu perfil."))
        };
    }
    private StackPanel WelcomePage()
    {
        TutorialHost.Visibility = Visibility.Collapsed;
        var headings = new[] { "Um lugar para o seu próximo passo.", "Antes de tudo, como te chamo?", "O que você quer conquistar?", "Vamos dar sentido ao caminho.", "O que vamos aprender juntos?", "De onde você está partindo?", "Como os estudos entram no seu dia?", "Quando existe espaço para você?", "Vamos encontrar um ritmo possível.", "Cada pessoa aprende de um jeito.", "O seu conforto também faz parte.", "Seu Ninho começa com você." };
        var speeches = new[] { "Oi! Vamos preparar um cantinho de estudos com a sua cara?", "Quero te conhecer. Pode ser seu nome ou aquele apelido de que você gosta.", "Pode sonhar alto. Depois a gente divide esse objetivo em passos pequenos.", "Nos dias mais difíceis, lembrar do motivo pode ajudar. O prazo também entra no plano.", "Não precisa abraçar tudo de uma vez. Vamos começar pelo que importa agora.", "Começar agora ou voltar depois de um tempo: os dois caminhos têm lugar aqui.", "O plano precisa caber na sua vida. Conte quais compromissos eu devo respeitar.", "Uma rotina boa também tem espaço para descansar. Escolha os dias que fazem sentido.", "Não existe um número perfeito. A gente começa pequeno e ajusta com os seus registros.", "Me conte o que ajuda e o que pesa. Vou levar isso em conta nas sugestões.", "Última pergunta! Quero que esse espaço seja confortável para você.", "Pronto! Vou acompanhar os seus registros e trazer sugestões, um passo de cada vez." };
        var panel = Column(); panel.Spacing = 24; panel.MaxWidth = 760; panel.HorizontalAlignment = HorizontalAlignment.Center;
        void Fit() => panel.Width = Math.Max(240, Math.Min(760, PageHost.ActualWidth > 0 ? PageHost.ActualWidth : Root.ActualWidth - 90));
        SizeChangedEventHandler resize = (_, _) => Fit(); panel.Loaded += (_, _) => { Fit(); PageHost.SizeChanged += resize; }; panel.Unloaded += (_, _) => { PageHost.SizeChanged -= resize; refreshWelcomeNavigation = null; };
        var progressLabel = Caption(""); var progress = new Grid { ColumnSpacing = 5 };
        for (var i = 0; i < WelcomeJourney.QuestionCount; i++) { progress.ColumnDefinitions.Add(new ColumnDefinition()); var segment = new Border { Height = 6, CornerRadius = new CornerRadius(3) }; Grid.SetColumn(segment, i); progress.Children.Add(segment); }
        var brand = Heading("ninho"); brand.FontSize = 28;
        panel.Children.Add(StudyBetween(Row(OriginalIcon.Create("leaf", 22, DashboardGreen), brand), progressLabel)); panel.Children.Add(progress);
        var owl = new OwlControl { Width = 132, Height = 150, Happy = true, Animate = !State.Settings.ReducedMotion };
        var bubbleText = Text("", 16); bubbleText.LineHeight = 25;
        var bubble = new Border { Background = DashboardSurface, BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(22, 22, 22, 4), Padding = new Thickness(22), Child = bubbleText, VerticalAlignment = VerticalAlignment.Center };
        var conversation = new Grid { ColumnSpacing = 22 }; conversation.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); conversation.ColumnDefinitions.Add(new ColumnDefinition()); conversation.Children.Add(owl); Grid.SetColumn(bubble, 1); conversation.Children.Add(bubble); panel.Children.Add(conversation);
        var heading = Heading(""); panel.Children.Add(heading);
        var answers = new ContentControl { HorizontalContentAlignment = HorizontalAlignment.Stretch }; panel.Children.Add(answers);
        profileSaveStatus = Caption("Suas respostas são salvas neste computador."); panel.Children.Add(profileSaveStatus);
        var footer = new Grid { ColumnSpacing = 16 }; footer.ColumnDefinitions.Add(new ColumnDefinition()); footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Button back = null!, next = null!;
        back = StudyLink("Voltar", "chevron-left", async () =>
        {
            answers.IsEnabled = false;
            try { await FlushLocalEdits(); await SetWelcomeStep(Math.Max(0, welcomeStep - 1)); Fill(-1); }
            finally { answers.IsEnabled = true; }
        });
        next = OriginalActionButton("Vamos começar", "arrow-right", async () =>
        {
            answers.IsEnabled = false;
            try
            {
                await FlushLocalEdits();
                if (invalidWelcomeAnswers.Count > 0 || !WelcomeJourney.CanContinue(welcomeStep, CurrentProfile)) return;
                if (welcomeStep == WelcomeJourney.QuestionCount)
                {
                    await Save(s => { s.Profile ??= CurrentProfile; if (!WelcomeJourney.CanContinue(1, s.Profile) || !WelcomeJourney.CanContinue(2, s.Profile)) throw new InvalidDataException("Preencha seu nome e seu objetivo antes de criar o perfil."); s.Profile.CompletedAt ??= DateTimeOffset.Now; s.Profile.UpdatedAt = DateTimeOffset.Now; s.Profile.Plan = AdaptiveCoach.InitialPlan(s.Profile); s.Profile.PlanStatus = "ready"; s.Profile.PlanProfileRevision = s.Profile.Revision; }, false);
                }
                await SetWelcomeStep(welcomeStep + 1); Fill(1);
            }
            finally { answers.IsEnabled = true; }
        }, true);
        next.MinWidth = 178; next.MinHeight = 50; next.CornerRadius = new CornerRadius(14);
        footer.Children.Add(back); Grid.SetColumn(next, 1); footer.Children.Add(next); panel.Children.Add(footer);
        void UpdateNext() => next.IsEnabled = welcomeStep <= WelcomeJourney.QuestionCount && invalidWelcomeAnswers.Count == 0 && WelcomeJourney.CanContinue(welcomeStep, CurrentProfile);
        void Fill(int direction)
        {
            invalidWelcomeAnswers.Clear(); refreshWelcomeNavigation = UpdateNext;
            progressLabel.Text = welcomeStep == 0 ? "Um passo de cada vez" : welcomeStep > 10 ? "Perfil criado" : $"Pergunta {welcomeStep} de 10";
            for (var i = 0; i < progress.Children.Count; i++) ((Border)progress.Children[i]).Background = i < welcomeStep ? DashboardGreen : DashboardLine;
            bubbleText.Text = speeches[welcomeStep]; heading.Text = headings[welcomeStep];
            next.Content = welcomeStep == 0 ? "Vamos começar" : welcomeStep == 10 ? "Criar meu perfil" : "Continuar";
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(next, next.Content.ToString());
            back.Visibility = welcomeStep is > 0 and <= 10 ? Visibility.Visible : Visibility.Collapsed;
            footer.Visibility = welcomeStep > 10 ? Visibility.Collapsed : Visibility.Visible;
            answers.Content = welcomeStep == 0 ? Column(Body("Dez perguntas curtas sobre seus objetivos e sua rotina. A coruja vai acompanhar você por aqui."), Row(OriginalIcon.Create("shield-check", 20, DashboardGreen), Body("Sem conta. Sem nuvem. Seu perfil fica neste computador.")))
                : welcomeStep > 10 ? ProfilePlanPanel(true) : WelcomeQuestions(welcomeStep);
            UpdateNext(); PageScroll.ChangeView(null, 0, null, true);
            if (direction != 0 && !State.Settings.ReducedMotion && new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled)
            {
                var transform = new TranslateTransform { X = direction * 22 }; answers.RenderTransform = transform; answers.Opacity = 0;
                var animation = new Storyboard();
                var slide = new DoubleAnimation { From = direction * 22, To = 0, Duration = TimeSpan.FromMilliseconds(260), EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
                Storyboard.SetTarget(slide, transform); Storyboard.SetTargetProperty(slide, "X"); animation.Children.Add(slide);
                var fade = new DoubleAnimation { From = 0, To = 1, Duration = TimeSpan.FromMilliseconds(220) }; Storyboard.SetTarget(fade, answers); Storyboard.SetTargetProperty(fade, "Opacity"); animation.Children.Add(fade); animation.Begin();
                var nod = new RotateTransform(); owl.RenderTransform = nod; owl.RenderTransformOrigin = new global::Windows.Foundation.Point(.5, .7);
                var response = new DoubleAnimation { From = -5, To = 0, Duration = TimeSpan.FromMilliseconds(300), EnableDependentAnimation = true, EasingFunction = new BackEase { Amplitude = .25, EasingMode = EasingMode.EaseOut } };
                var greeting = new Storyboard(); Storyboard.SetTarget(response, nod); Storyboard.SetTargetProperty(response, "Angle"); greeting.Children.Add(response); greeting.Begin();
            }
        }
        Fill(0); return panel;
    }
    private UIElement ProfilePlanPanel(bool welcome)
    {
        var profile = CurrentProfile;
        var plan = Column(TitleText("Seu acompanhamento já vem pronto."), Body("A análise local faz parte do Ninho. Conforme você registra sessões e revisões, a assistente traz observações com motivos claros."));
        if (welcome)
        {
            plan.Children.Add(OriginalActionButton("Entrar no meu Ninho", "arrow-right", ExitWelcome, true));
            plan.Children.Add(new Expander { Header = "Ver meu primeiro plano", Content = Body(AdaptiveCoach.InitialPlan(profile)), HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch });
        }
        else
        {
            plan.Children.Add(Body(AdaptiveCoach.InitialPlan(profile)));
            plan.Children.Add(OriginalActionButton("Ver minhas sugestões", "sparkles", () => { Navigate("mentor"); return Task.CompletedTask; }, true));
            var advanced = new Expander { Header = "Modelo de linguagem opcional · avançado", HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch };
            advanced.Expanding += (_, _) => advanced.Content ??= Column(Body("O acompanhamento já funciona sem este recurso. Use seus pesos locais para elaborar um plano em texto; a geração consome mais memória."), AdvancedLanguagePlanPanel(false));
            plan.Children.Add(advanced);
        }
        return Card(plan);
    }
}
