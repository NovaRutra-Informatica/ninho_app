using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private string tutorialRoute = "";
    private int tutorialStep;
    private bool tutorialVisible;
    private static readonly Dictionary<string, (string Title, string Detail)[]> PageGuides = new()
    {
        ["today"] = [
            ("Seu ponto de partida", "Hoje reúne tempo estudado, revisões e sua sequência de dias. O foguinho fica aceso quando você registra estudo hoje; clique nele para ver o calendário dos dias estudados."),
            ("Continue de onde parou", "O próximo estudo abre a aula que você pode retomar. Tarefas e provas mostram os compromissos da agenda."),
            ("Cada cantinho do seu Ninho", "Na barra da esquerda você navega entre estudos, revisões, materiais, agenda, progresso e assistente. Hora de focar abre o cronômetro; seu nome abre o perfil local.")],
        ["studies"] = [
            ("Um caminho de cada vez", "Comece por um objetivo ou curso. Abra uma matéria para encontrar seus módulos e aulas; você pode clicar no cartão inteiro."),
            ("Aulas, notas e materiais", "Abra o título de uma aula para ver o conteúdo, registrar anotações e marcar seu andamento. Os filtros e a busca ajudam a encontrar o que precisa.")],
        ["reviews"] = [
            ("Relembrar fortalece o estudo", "Revisar reúne os cartões que chegaram na hora de voltar. O limite de novos cartões respeita seus ajustes."),
            ("Primeiro, tente lembrar", "Leia a pergunta, responda com suas palavras e revele a resposta. Depois, indique como foi lembrar para ajustar a próxima revisão."),
            ("Seu acervo cresce com você", "Em Meu acervo, encontre, edite e organize cartões. Marque fontes que precisam ser conferidas e conteúdos para reaprender.")],
        ["materials"] = [
            ("Seus materiais por perto", "Importe arquivos locais e associe a uma matéria ou aula. Busca e filtros ajudam a organizar sua biblioteca."),
            ("Abra e consulte", "Clique no cartão para abrir a prévia, ler um PDF e anotar observações. O backup completo inclui os arquivos importados.")],
        ["agenda"] = [
            ("Um plano possível", "As setas mudam o mês. Clique em um dia para ver seus compromissos no painel ao lado; Hoje volta à data atual."),
            ("Pequenos passos e datas importantes", "Nova tarefa guarda uma ação. Marcar prova registra data, horário e local. Os pontos no calendário indicam tarefas e provas; o círculo conclui uma tarefa.")],
        ["progress"] = [
            ("Veja o que está construindo", "Aqui estão seu tempo registrado, aulas concluídas, revisões e constância. Os gráficos mostram o período selecionado."),
            ("Progresso com contexto", "Esses números refletem seus registros, não uma nota ou medida de domínio. Abra uma matéria para escolher o próximo passo.")],
        ["mentor"] = [
            ("Uma assistente que conhece seu momento", "Seus objetivos e sua rotina vêm do perfil local e orientam as sugestões. Você pode atualizá-los clicando no seu nome."),
            ("O acompanhamento já está incluído", "A análise local acompanha sessões, revisões e hábitos registrados. As observações aparecem aqui e em Hoje, com os dados que motivaram cada sugestão. Não é preciso importar modelo."),
            ("Você decide o caminho", "As sugestões usam aulas, revisões e registros. Confira as explicações e escolha o que funciona para você. Edite suas preferências em Meu perfil; tempo de navegação nunca é contado como estudo.")],
        ["timer"] = [
            ("Um tempo só para estudar", "Escolha a matéria, a aula e a duração, ou use o cronômetro livre. Começar e Pausar atualizam a contagem sem sair desta tela."),
            ("Guarde o que funcionou", "Concluir e salvar registra o tempo real. Conte como foi a sessão no feedback; isso ajuda a orientar os próximos estudos.")]
    };

    private void ShowPageTutorial()
    {
        TutorialHost.Visibility = Visibility.Collapsed;
        PageHelp.Visibility = PageGuides.ContainsKey(route) && State.Profile?.CompletedAt != null ? Visibility.Visible : Visibility.Collapsed;
        AutomationProperties.SetName(PageHelp, "Como usar " + TutorialTitle(route));
        if (tutorialVisible || State.Profile?.CompletedAt == null || !PageGuides.ContainsKey(route) || State.Profile.TutorialsSeen.Contains(route)) return;
        var currentRoute = route;
        DispatcherQueue.TryEnqueue(async () =>
        {
            if (route == currentRoute && !tutorialVisible) await OpenPageTutorial();
        });
    }

    private async void OpenPageHelp(object sender, RoutedEventArgs args)
    {
        PlayNavigationSound();
        await OpenPageTutorial();
    }

    private async Task OpenPageTutorial()
    {
        if (tutorialVisible || !PageGuides.TryGetValue(route, out var steps)) return;
        tutorialVisible = true; tutorialRoute = route; tutorialStep = 0;
        var currentRoute = route;
        var completed = false;
        var saving = false;
        var failure = Body(""); failure.Visibility = Visibility.Collapsed;
        var stepHost = new ContentControl { HorizontalContentAlignment = HorizontalAlignment.Stretch };
        var skip = new Button { Content = "Ver depois", Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"], Background = StudySoft, Foreground = DashboardGreen, BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), MinHeight = 44, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Center, Padding = new Thickness(15, 10, 15, 10) };
        var next = new Button { Content = "Próximo", Style = (Style)Application.Current.Resources["AccentButtonStyle"], Background = DashboardGreen, Foreground = DashboardSurface, CornerRadius = new CornerRadius(12), MinHeight = 44, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Center };
        var actions = new Grid { ColumnSpacing = 12 };
        actions.ColumnDefinitions.Add(new ColumnDefinition()); actions.ColumnDefinitions.Add(new ColumnDefinition());
        actions.Children.Add(skip); Grid.SetColumn(next, 1); actions.Children.Add(next);
        AutomationProperties.SetAutomationId(skip, "tutorial." + currentRoute + ".skip");
        AutomationProperties.SetAutomationId(next, "tutorial." + currentRoute + ".continue");
        var dialog = new ContentDialog
        {
            XamlRoot = Root.XamlRoot, RequestedTheme = Root.ActualTheme,
            Content = Column(stepHost, failure, actions), CornerRadius = new CornerRadius(30),
            Background = DashboardSurface, Foreground = DashboardInk, BorderBrush = DashboardLine
        };
        dialog.Resources["ContentDialogMaxWidth"] = 440d;
        dialog.Resources["ContentDialogCornerRadius"] = new CornerRadius(30);
        StyleNinhoDialog(dialog, 440, 30);
        ObserveInteractions(dialog);
        AutomationProperties.SetAutomationId(dialog, "tutorial." + currentRoute + ".modal");
        dialog.Closing += (_, args) => args.Cancel = !completed;
        void Fill()
        {
            var step = steps[tutorialStep];
            var owl = new OwlControl { Width = 82, Height = 82, Animate = !State.Settings.ReducedMotion };
            var counter = Caption($"{tutorialStep + 1}/{steps.Length}");
            AutomationProperties.SetAutomationId(counter, "tutorial." + currentRoute + ".step");
            var progress = new ProgressBar { Minimum = 0, Maximum = steps.Length, Value = tutorialStep + 1, Height = 5, Foreground = DashboardGreen, Background = StudyMint };
            var content = Column(StudyBetween(Row(owl, Column(Caption("NO SEU RITMO"), TitleText(TutorialTitle(currentRoute)))), counter), progress, TitleText(step.Title), Body(step.Detail));
            stepHost.Content = new ScrollViewer { Content = content, MaxHeight = Math.Max(140, Math.Min(400, Root.ActualHeight - 200)), HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
            next.Content = tutorialStep == steps.Length - 1 ? "Entendi" : "Próximo";
            AnimateLocalChange(content);
        }
        async Task Advance(bool advance)
        {
            if (saving) return;
            saving = true; skip.IsEnabled = next.IsEnabled = false;
            PlayNavigationSound(); failure.Visibility = Visibility.Collapsed;
            try
            {
                if (advance && tutorialStep + 1 < steps.Length) { tutorialStep++; Fill(); }
                else
                {
                    await FlushLocalEdits();
                    await Save(s => { if (s.Profile == null) throw new InvalidOperationException("Seu perfil não está disponível."); if (!s.Profile.TutorialsSeen.Contains(currentRoute)) s.Profile.TutorialsSeen.Add(currentRoute); }, false);
                    completed = true; dialog.Hide();
                }
            }
            catch (Exception error) { failure.Text = "Não foi possível salvar agora. " + error.Message; failure.Visibility = Visibility.Visible; }
            finally { saving = false; skip.IsEnabled = next.IsEnabled = true; }
        }
        next.Click += async (_, _) => await Advance(true);
        skip.Click += async (_, _) => await Advance(false);
        dialog.Opened += (_, _) => next.Focus(Microsoft.UI.Xaml.FocusState.Keyboard);
        Fill();
        try { await dialog.ShowAsync(); }
        catch (Exception error) { ShowNotice(error.Message, InfoBarSeverity.Error); }
        finally { tutorialVisible = false; }
    }
    private static string TutorialTitle(string page) => page switch
    {
        "today" => "Hoje", "studies" => "Meus estudos", "reviews" => "Revisões", "materials" => "Materiais",
        "agenda" => "Agenda", "progress" => "Meu progresso", "mentor" => "Minha assistente", "timer" => "Hora de focar", _ => "esta tela"
    };
}
