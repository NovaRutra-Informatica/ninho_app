using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private int welcomeStep;
    private bool welcomePlanAttempted;
    private CancellationTokenSource? profileGeneration;
    private long profileGenerationVersion;
    private TextBlock? profileSaveStatus;
    private Action<string, string, bool>? updateProfilePlan;
    private string profilePlanMessage = "", profilePlanPreview = "";
    private readonly RetainedSaveQueue pendingLocalEdits = new();
    private Task localEdits = Task.CompletedTask;
    private Button? localEditRetryButton;
    private string localEditFailureMessage = "";
    private bool closingAfterSave;

    private Task QueueLocalEdit(Action<StudyState> change, Action? after = null)
    {
        pendingLocalEdits.Enqueue(() => store.ChangeAsync(change), () =>
        {
            QueueDailyBackup();
            QueueCoachRefresh();
            ProfileName.Text = State.Settings.Name;
            ProfileAvatar.Text = State.Settings.Name.Trim().FirstOrDefault('E').ToString().ToUpperInvariant();
            after?.Invoke();
        });
        return FlushLocalEdits();
    }

    private Task FlushLocalEdits()
    {
        if (!localEdits.IsCompleted) return localEdits;
        if (pendingLocalEdits.PendingCount == 0)
        {
            ClearLocalEditRetry();
            return localEdits = Task.CompletedTask;
        }
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        localEdits = completion.Task;
        if (profileSaveStatus != null) profileSaveStatus.Text = "Salvando neste computador…";
        _ = PersistLocalEdits(completion);
        return localEdits;
    }

    private async Task PersistLocalEdits(TaskCompletionSource completion)
    {
        try
        {
            // An input can arrive after a drain completes but before this continuation.
            // Keep that edit in the same flush instead of reporting a premature success.
            do { await pendingLocalEdits.FlushAsync(); } while (pendingLocalEdits.PendingCount > 0);
            if (profileSaveStatus != null) profileSaveStatus.Text = "Alterações salvas neste computador.";
            ClearLocalEditRetry();
            completion.SetResult();
        }
        catch (Exception error)
        {
            var unsaved = pendingLocalEdits.PendingCount > 0;
            localEditFailureMessage = unsaved
                ? "Não foi possível salvar todas as alterações. Elas continuam aguardando nesta sessão. Libere espaço ou corrija o acesso à pasta e tente novamente. " + error.Message
                : "As alterações foram salvas, mas não foi possível atualizar a tela. " + error.Message;
            if (profileSaveStatus != null) profileSaveStatus.Text = localEditFailureMessage;
            ShowNotice(localEditFailureMessage, InfoBarSeverity.Error);
            if (unsaved)
            {
                localEditRetryButton ??= CreateLocalEditRetryButton();
                Notice.ActionButton = localEditRetryButton;
            }
            completion.SetException(error);
        }
        finally { refreshWelcomeNavigation?.Invoke(); }
    }

    private Button CreateLocalEditRetryButton()
    {
        var retry = new Button { Content = "Tentar salvar novamente" };
        retry.Click += async (_, _) =>
        {
            retry.IsEnabled = false;
            try { await FlushLocalEdits(); }
            catch { /* The pending edits and the retry action remain available. */ }
            finally { retry.IsEnabled = true; }
        };
        return retry;
    }

    private void ClearLocalEditRetry()
    {
        if (localEditRetryButton != null && ReferenceEquals(Notice.ActionButton, localEditRetryButton))
        {
            Notice.ActionButton = null;
            if (Notice.Message == localEditFailureMessage) Notice.IsOpen = false;
        }
        localEditFailureMessage = "";
    }

    private StudentProfile CurrentProfile => State.Profile ?? new StudentProfile
    {
        Name = State.Settings.Name == "Estudante" ? "" : State.Settings.Name,
        DailyMinutes = State.Settings.DailyMinutes, SessionMinutes = State.Settings.FocusMinutes
    };

    private async Task EditProfile(Action<StudentProfile> change)
    {
        try
        {
            await QueueLocalEdit(s =>
            {
                s.Profile ??= new StudentProfile { Name = s.Settings.Name == "Estudante" ? "" : s.Settings.Name, DailyMinutes = s.Settings.DailyMinutes, SessionMinutes = s.Settings.FocusMinutes };
                change(s.Profile); s.Profile.Revision++; s.Profile.UpdatedAt = DateTimeOffset.Now;
                if (s.Profile.Name.Trim().Length > 0) s.Settings.Name = s.Profile.Name.Trim();
                s.Settings.DailyMinutes = s.Profile.DailyMinutes; s.Settings.FocusMinutes = s.Profile.SessionMinutes;
                if (s.Focus.RunningSince == null && s.Focus.AccumulatedSeconds == 0 && !s.Focus.Stopwatch) s.Focus.TargetMinutes = s.Focus.IsBreak ? s.Settings.BreakMinutes : s.Settings.FocusMinutes;
            });
        }
        catch { }
        finally { refreshWelcomeNavigation?.Invoke(); }
    }

    private TextBox ProfileAnswer(string label, string hint, string value, int limit, Action<StudentProfile, string> set, bool multiline = true)
    {
        var input = new TextBox { Header = label, PlaceholderText = hint, Text = value, MaxLength = limit, AcceptsReturn = multiline,
            Style = (Style)Application.Current.Resources["NinhoAnswerStyle"], TextWrapping = TextWrapping.Wrap, MinHeight = multiline ? 104 : 56, FontSize = 15, HorizontalAlignment = HorizontalAlignment.Stretch };
        input.TextChanged += async (_, _) => { var answer = input.Text; await EditProfile(p => set(p, answer)); };
        return input;
    }

    private StackPanel ProfileQuestions(int section)
    {
        var p = CurrentProfile;
        if (section == 1) return Column(
            ProfileAnswer("Como você quer ser chamado?", "Seu nome ou apelido", p.Name, 100, (v, a) => v.Name = a, false),
            ProfileAnswer("O que você quer conquistar com os estudos?", "Uma prova, uma formação, uma habilidade… o que seria uma conquista para você?", p.Goal, 400, (v, a) => v.Goal = a),
            ProfileAnswer("Por que isso é importante para você?", "O que te motiva a continuar?", p.Motivation, 300, (v, a) => v.Motivation = a),
            ProfileAnswer("Existe uma data ou prazo?", "Ex.: prova em dezembro, ou ainda sem prazo", p.TargetDate, 40, (v, a) => v.TargetDate = a, false));
        if (section == 2) return Column(
            ProfileAnswer("Quais assuntos você quer estudar?", "Liste matérias, cursos ou temas que quer priorizar.", p.Subjects, 300, (v, a) => v.Subjects = a),
            ProfileAnswer("Qual é seu ponto de partida?", "O que já conhece e o que está começando agora?", p.Level, 160, (v, a) => v.Level = a),
            ProfileAnswer("Como você gosta de aprender?", "Aulas, leitura, exercícios, escrever com suas palavras…", p.Preferences, 300, (v, a) => v.Preferences = a));
        if (section == 3)
        {
            var days = Row();
            foreach (var (id, name) in new[] { ("mon", "Seg"), ("tue", "Ter"), ("wed", "Qua"), ("thu", "Qui"), ("fri", "Sex"), ("sat", "Sáb"), ("sun", "Dom") })
            {
                var toggle = new ToggleButton { Style = (Style)Application.Current.Resources["NinhoThemeChoiceStyle"], Content = name, BorderThickness = new Thickness(1), BorderBrush = DashboardLine, IsChecked = p.AvailableDays.Contains(id), Padding = new Thickness(12, 8, 12, 8), CornerRadius = new CornerRadius(10) };
                Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(toggle, "Disponibilidade: " + name);
                void Paint() { toggle.Background = toggle.IsChecked == true ? DashboardGreen : DashboardSurface; toggle.Foreground = toggle.IsChecked == true ? DashboardSurface : DashboardInk; }
                Paint();
                toggle.Click += async (_, _) => { Paint(); var selected = toggle.IsChecked == true; await EditProfile(v => { v.AvailableDays.Remove(id); if (selected) v.AvailableDays.Add(id); }); };
                days.Children.Add(toggle);
            }
            var minutes = new NumberBox { Header = "Quantos minutos cabem em um dia de estudo?", Minimum = 1, Maximum = 1440, Value = p.DailyMinutes, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline };
            minutes.ValueChanged += async (_, _) => { var value = minutes.Value; if (double.IsFinite(value) && value == Math.Truncate(value) && value is >= 1 and <= 1440) await EditProfile(v => v.DailyMinutes = (int)value); };
            var session = new NumberBox { Header = "Quanto tempo prefere em cada bloco de foco?", Minimum = 1, Maximum = 240, Value = p.SessionMinutes, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline };
            session.ValueChanged += async (_, _) => { var value = session.Value; if (double.IsFinite(value) && value == Math.Truncate(value) && value is >= 1 and <= 240) await EditProfile(v => v.SessionMinutes = (int)value); };
            return Column(ProfileAnswer("Como é a sua rotina?", "Trabalho, aulas, deslocamentos e compromissos que precisamos respeitar.", p.Routine, 400, (v, a) => v.Routine = a),
                TitleText("Em quais dias você costuma ter espaço?"), days, minutes, session,
                ProfileAnswer("Em qual horário você se sente melhor para estudar?", "Manhã, tarde, noite ou uma faixa de horário", p.PreferredTime, 160, (v, a) => v.PreferredTime = a, false));
        }
        return Column(
            ProfileAnswer("O que mais dificulta estudar hoje?", "Organização, tempo, lembrar conteúdos, alguma matéria específica…", p.Challenges, 400, (v, a) => v.Challenges = a),
            ProfileAnswer("Como podemos deixar o estudo mais confortável?", "Preferências de leitura, pausas, acessibilidade ou outras adaptações. Opcional.", p.Accessibility, 240, (v, a) => v.Accessibility = a),
            Body("Você pode deixar qualquer resposta para depois e mudar tudo em Meu perfil. Quanto mais contexto compartilhar, mais útil será o plano. Seus dados ficam neste computador."));
    }

    private StackPanel ProfilePage()
    {
        profileSaveStatus = Caption("Alterações salvas automaticamente neste computador.");
        var page = Column(StudyBetween(Column(Heading("Um Ninho com a sua cara."), Body("Seu momento pode mudar. Seu plano também.")),
            StudyLink("Ver a apresentação", "sparkles", async () => { await SetWelcomeStep(0); Navigate("welcome"); })), profileSaveStatus);
        var sections = new[] { "Você e seus objetivos", "Seu ponto de partida", "Sua rotina", "Suas necessidades" };
        var grid = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 330, Gap = 22 };
        for (var i = 1; i <= 4; i++) grid.Children.Add(Card(Column(TitleText(sections[i - 1]), ProfileQuestions(i))));
        page.Children.Add(grid); page.Children.Add(ProfilePlanPanel(false)); page.Children.Add(CoachPreferences());
        page.Children.Add(Card(Column(TitleText("Conheça cada cantinho."), Body("Reveja os tutoriais de cada tela, sem alterar seus estudos."),
            OriginalActionButton("Rever tutoriais", "book-open", async () => { await Save(s => { s.Profile ??= CurrentProfile; s.Profile.TutorialsSeen.Clear(); }, false); tutorialStep = 0; tutorialRoute = ""; Navigate("today"); }))));
        return page;
    }

    private void PublishPlanProgress(string message, string preview, bool working)
    {
        profilePlanMessage = message; profilePlanPreview = preview; updateProfilePlan?.Invoke(message, preview, working);
        refreshAssistantModelState?.Invoke();
        if (!working && route == "mentor") refreshAssistantConversation?.Invoke();
    }

    private UIElement AdvancedLanguagePlanPanel(bool welcome)
    {
        var profile = CurrentProfile;
        var status = Body(profile.PlanStatus == "pending" ? "Uma preparação anterior foi interrompida. Suas respostas foram preservadas; você pode tentar de novo." : "O perfil entra em cada conversa. O plano abaixo é uma sugestão da IA e pode ser ajustado por você.");
        var output = Text(profile.Plan, 14); output.IsTextSelectionEnabled = true;
        var spinner = new ProgressRing { IsActive = false, Visibility = Visibility.Collapsed, Width = 24, Height = 24 };
        var cancel = new Button { Content = "Interromper preparação", Visibility = Visibility.Collapsed };
        cancel.Click += (_, _) => profileGeneration?.Cancel();
        Button? generate = null, enter = null;
        async Task Prepare()
        {
            await FlushLocalEdits();
            if (!appActive) { status.Text = "Volte ao Ninho para preparar o plano. A geração fica pausada fora do primeiro plano."; return; }
            if (string.IsNullOrWhiteSpace(State.Settings.ModelPath)) { status.Text = "Escolha um modelo abaixo. Você também pode começar agora e preparar o plano mais tarde."; return; }
            if (generation != null || profileGeneration != null || changingAssistantModel) { status.Text = "Aguarde ou interrompa a resposta atual antes de preparar o plano."; return; }
            var generationVersion = profileGenerationVersion;
            using var token = new CancellationTokenSource(TimeSpan.FromMinutes(3)); profileGeneration = token;
            PublishPlanProgress("Preparando seu plano neste computador…", "Carregando o modelo local…", true);
            try
            {
                await Save(s => { s.Profile ??= CurrentProfile; s.Profile.CompletedAt ??= DateTimeOffset.Now; s.Profile.PlanStatus = "pending"; }, false);
                var snapshot = State; var revision = snapshot.Profile!.Revision;
                var context = await Task.Run(() => StudyEngine.BuildContext(snapshot, DateTimeOffset.Now), token.Token);
                var progress = new Progress<string>(message => { if (!token.IsCancellationRequested && profileGeneration == token && generationVersion == profileGenerationVersion) PublishPlanProgress("Preparando seu plano neste computador…", message, true); });
                var answer = await model.AnswerAsync(snapshot.Settings.ModelPath, context,
                    "Prepare um primeiro plano personalizado para a próxima semana, usando meu perfil completo. Cite meu objetivo e minhas restrições; respeite dias disponíveis, minutos por dia, horário e pausas. Proponha até três passos concretos incluindo estudo, prática e revisão. Não invente matérias, compromissos ou prazos. Diga o que ainda falta saber quando necessário.", progress, token.Token);
                token.Token.ThrowIfCancellationRequested();
                if (generationVersion != profileGenerationVersion) return;
                await Save(s => { if (generationVersion != profileGenerationVersion) return; if (s.Profile?.Revision != revision) throw new InvalidOperationException("Seu perfil mudou durante a preparação. Gere o plano novamente com as respostas atuais."); s.Profile.Plan = answer.Length <= 16000 ? answer : answer[..16000]; s.Profile.PlanStatus = "ready"; s.Profile.PlanProfileRevision = revision; }, false);
                PublishPlanProgress("Seu plano foi preparado pela IA local e salvo. Suas respostas continuam guardadas separadamente.", answer, false); PlayNinhoSound();
            }
            catch (Exception error)
            {
                if (generationVersion != profileGenerationVersion) return;
                await Save(s => { if (generationVersion == profileGenerationVersion && s.Profile != null) s.Profile.PlanStatus = "error"; }, false);
                PublishPlanProgress(error is OperationCanceledException ? "Preparação interrompida. Seu perfil está salvo; você pode tentar novamente quando quiser." : "O perfil está salvo. Não foi possível gerar o plano: " + error.Message, State.Profile?.Plan ?? "", false);
            }
            finally
            {
                profileGeneration = null; if (generationVersion == profileGenerationVersion) PublishPlanProgress(profilePlanMessage, profilePlanPreview, false);
            }
        }
        generate = new Button { Content = profile.Plan.Length > 0 ? "Atualizar meu plano com a IA local" : "Preparar meu plano com a IA local", Style = (Style)Application.Current.Resources["AccentButtonStyle"] };
        generate.Click += async (_, _) => { try { await Prepare(); } catch (Exception error) { status.Text = error.Message; } };
        var panel = Column(TitleText("Um primeiro plano, no seu ritmo."), status);
        if (profile.Plan.Length > 0 && profile.PlanProfileRevision != profile.Revision) panel.Children.Add(Body("Seu perfil mudou desde este plano. As próximas conversas já usarão as novas respostas; atualize o plano quando quiser."));
        panel.Children.Add(output); panel.Children.Add(Row(generate, cancel, spinner));
        panel.Children.Add(AssistantModelMenu());
        if (welcome)
        {
            enter = OriginalActionButton("Entrar no meu Ninho", "arrow-right", () => { Navigate("today"); return Task.CompletedTask; }); panel.Children.Add(enter);
            panel.Children.Add(Caption("Sem modelo disponível? Você pode usar seus estudos agora e preparar o plano depois em Meu perfil."));
        }
        void ShowPlanProgress(string message, string preview, bool working)
        {
            status.Text = message; output.Text = preview;
            generate.IsEnabled = !working; cancel.Visibility = working ? Visibility.Visible : Visibility.Collapsed;
            spinner.IsActive = working; spinner.Visibility = working ? Visibility.Visible : Visibility.Collapsed;
            if (enter != null) enter.IsEnabled = !working;
        }
        panel.Loaded += (_, _) => { updateProfilePlan = ShowPlanProgress; if (profileGeneration != null) ShowPlanProgress(profilePlanMessage, profilePlanPreview, true); };
        panel.Unloaded += (_, _) => { if (updateProfilePlan == ShowPlanProgress) updateProfilePlan = null; };
        if (welcome && !welcomePlanAttempted && profile.Plan.Length == 0 && State.Settings.ModelPath.Length > 0)
            panel.Loaded += async (_, _) => { if (welcomePlanAttempted) return; welcomePlanAttempted = true; try { await Prepare(); } catch (Exception error) { status.Text = error.Message; } };
        return Card(panel);
    }
}
