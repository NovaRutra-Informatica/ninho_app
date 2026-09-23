using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private string tutorialRoute = "";
    private int tutorialStep;
    private static readonly Dictionary<string, (string Title, string Detail)[]> PageGuides = new()
    {
        ["today"] = [
            ("Seu ponto de partida", "Hoje reúne o que merece atenção: tempo estudado, revisões e sua sequência de dias. Toque nesses cartões para abrir o foco, as revisões ou seu progresso."),
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
        if (State.Profile?.CompletedAt == null || !PageGuides.TryGetValue(route, out var steps) || State.Profile.TutorialsSeen.Contains(route))
        { TutorialHost.Visibility = Visibility.Collapsed; TutorialHost.Content = null; return; }
        if (tutorialRoute != route) { tutorialRoute = route; tutorialStep = 0; }
        tutorialStep = Math.Clamp(tutorialStep, 0, steps.Length - 1);
        var step = steps[tutorialStep]; var currentRoute = route;
        async Task Done()
        {
            await Save(s => { if (s.Profile != null && !s.Profile.TutorialsSeen.Contains(currentRoute)) s.Profile.TutorialsSeen.Add(currentRoute); }, false);
            ShowPageTutorial();
        }
        var next = ActionButton(tutorialStep == steps.Length - 1 ? "Entendi" : "Próximo", async () =>
        { if (tutorialStep == steps.Length - 1) await Done(); else { tutorialStep++; ShowPageTutorial(); } }, true);
        var previous = StudyLink("Voltar", "chevron-left", () => { tutorialStep = Math.Max(0, tutorialStep - 1); ShowPageTutorial(); return Task.CompletedTask; }); previous.IsEnabled = tutorialStep > 0;
        var guide = StudyStack(8, StudyBetween(Caption($"Conheça esta tela · {tutorialStep + 1} de {steps.Length}"), StudyLink("Ver depois no perfil", "x", Done)),
            StudyBetween(TitleText(step.Title), Row(previous, next)), Body(step.Detail));
        var panel = Card(guide); panel.Background = StudyMint; panel.Padding = new Thickness(22, 18, 22, 18);
        TutorialHost.Content = panel; TutorialHost.Visibility = Visibility.Visible;
    }
}
