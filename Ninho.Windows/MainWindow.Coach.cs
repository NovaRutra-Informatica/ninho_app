using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private CoachJournal coachJournal = new();
    private CoachJournalStore? coachJournalStore;
    private Task coachWrites = Task.CompletedTask;
    private bool journalWritable, appActive = true;
    private string observedRoute = "";
    private readonly Stopwatch usageWatch = new();
    private long lastCoachInteraction = Stopwatch.GetTimestamp();
    private readonly DispatcherTimer usageClock = new() { Interval = TimeSpan.FromSeconds(30) };
    private CancellationTokenSource? coachAnalysis;
    private IReadOnlyList<CoachInsight> coachInsights = [];
    private Action? refreshCoachPanel;

    private async Task InitializeCoach()
    {
        coachJournalStore = new CoachJournalStore(Path.Combine(store.DirectoryPath, "coach-usage.json"));
        try { coachJournal = await coachJournalStore.LoadAsync(); journalWritable = true; }
        catch { ShowNotice("O histórico de navegação não pôde ser lido e foi preservado. Seus estudos continuam disponíveis."); }
        usageClock.Tick += (_, _) => { ObserveUsage(false); QueueCoachRefresh(); };
        Root.AddHandler(UIElement.PointerPressedEvent, new Microsoft.UI.Xaml.Input.PointerEventHandler((_, _) => CoachInteraction()), true);
        Root.AddHandler(UIElement.KeyDownEvent, new Microsoft.UI.Xaml.Input.KeyEventHandler((_, _) => CoachInteraction()), true);
        if (appActive) usageClock.Start();
        ObserveUsage(true); QueueCoachRefresh();
    }
    private void ObserveUsage(bool visit, bool pause = false)
    {
        if (!ready) return;
        AccountVisibleInterval();
        usageWatch.Reset();
        observedRoute = route;
        if (appActive && CoachJournal.AllowedRoutes.Contains(route))
        {
            if (visit) lastCoachInteraction = Stopwatch.GetTimestamp();
            coachJournal.Observe(route, DateOnly.FromDateTime(DateTime.Now), 0, visit, pause); usageWatch.Start();
        }
        if (journalWritable && coachJournalStore != null)
        {
            var snapshot = coachJournal.Snapshot(); var previous = coachWrites;
            async Task Persist()
            {
                try { await previous; } catch { }
                try { await coachJournalStore.SaveAsync(snapshot); }
                catch { journalWritable = false; ShowNotice("Não foi possível guardar as observações de navegação. Seus registros de estudo continuam separados."); }
            }
            coachWrites = Persist();
        }
    }
    private void AccountVisibleInterval()
    {
        if (!usageWatch.IsRunning || !CoachJournal.AllowedRoutes.Contains(observedRoute)) return;
        var elapsed = usageWatch.Elapsed.TotalSeconds;
        var idle = (Stopwatch.GetTimestamp() - lastCoachInteraction) / (double)Stopwatch.Frequency;
        var active = Math.Min(elapsed, Math.Max(0, 60 - idle + elapsed));
        coachJournal.Observe(observedRoute, DateOnly.FromDateTime(DateTime.Now), active);
    }
    private void CoachInteraction()
    {
        if (!ready || !appActive) return;
        AccountVisibleInterval(); lastCoachInteraction = Stopwatch.GetTimestamp(); usageWatch.Restart();
    }
    private void CoachActivation(bool active)
    {
        if (appActive == active) return;
        // Account for the visible interval before changing state; deactivation never counts as a focus pause.
        ObserveUsage(false); appActive = active;
        if (!active)
        {
            usageWatch.Stop(); usageClock.Stop(); coachAnalysis?.Cancel(); generation?.Cancel(); profileGeneration?.Cancel();
        }
        else if (ready) { lastCoachInteraction = Stopwatch.GetTimestamp(); usageWatch.Restart(); usageClock.Start(); QueueCoachRefresh(); }
    }
    private void QueueCoachRefresh()
    {
        if (!ready || !appActive) return;
        coachAnalysis?.Cancel(); var request = new CancellationTokenSource(); coachAnalysis = request;
        async Task Analyze()
        {
            try
            {
                await Task.Delay(700, request.Token);
                var snapshot = State; var usage = coachJournal.Snapshot();
                var insights = await Task.Run(() => AdaptiveCoach.Analyze(snapshot, DateTimeOffset.Now, usage), request.Token);
                if (request.IsCancellationRequested || !appActive || snapshot != State) return;
                coachInsights = insights; refreshCoachPanel?.Invoke();
            }
            catch (OperationCanceledException) { }
            finally { if (coachAnalysis == request) coachAnalysis = null; request.Dispose(); }
        }
        _ = Analyze();
    }
    private async Task ResetCoachAfterRestore()
    {
        coachAnalysis?.Cancel(); await coachWrites;
        coachJournal = new() { Enabled = coachJournal.Enabled }; coachInsights = []; usageWatch.Reset(); observedRoute = "";
        if (coachJournalStore != null)
        {
            await coachJournalStore.SaveAsync(coachJournal.Snapshot()); journalWritable = true;
        }
        refreshCoachPanel?.Invoke(); ObserveUsage(true); QueueCoachRefresh();
    }
    private UIElement CoachPreferences()
    {
        var enabled = new ToggleSwitch { Header = "Guardar minhas visitas às telas", IsOn = coachJournal.Enabled, OnContent = "Ativado", OffContent = "Desativado" };
        var status = Caption("Estas observações ficam neste computador. Tempo de navegação e estudo são registrados separadamente.");
        async Task<bool> Persist()
        {
            try
            {
                await coachWrites;
                if (coachJournalStore != null) await coachJournalStore.SaveAsync(coachJournal.Snapshot());
                journalWritable = true; status.Text = "Preferência salva neste computador."; QueueCoachRefresh(); return true;
            }
            catch { status.Text = "Não foi possível salvar esta preferência. Libere espaço e tente novamente."; return false; }
        }
        enabled.Toggled += async (_, _) => { AccountVisibleInterval(); usageWatch.Restart(); coachJournal.Enabled = enabled.IsOn; await Persist(); };
        return Card(Column(TitleText("Um acompanhamento no seu ritmo"), enabled, status,
            OriginalActionButton("Apagar observações de navegação", "trash-2", async () => { coachJournal.Days.Clear(); if (await Persist()) status.Text = "Observações apagadas. Seus estudos e seu perfil foram mantidos."; })));
    }
    private Border CoachSurface(bool compact)
    {
        var items = Column(); items.Spacing = 16; var lastContent = "";
        var heading = Column(StudyBetween(Row(OriginalIcon.Create("sparkles", 20, DashboardGreen), TitleText(compact ? "Um recado da sua assistente" : "O que percebi por aqui")),
            StudyLink(compact ? "Ver acompanhamento" : "Editar meu perfil", "arrow-right", () => { Navigate(compact ? "mentor" : "profile"); return Task.CompletedTask; })),
            Caption("Análise local incluída · observações baseadas nos seus registros")); heading.Spacing = 5;
        var panel = Column(heading, items);
        void Fill()
        {
            var shown = coachInsights.Take(compact ? 1 : 7).ToArray();
            var signature = string.Join("|", shown.Select(i => i.Id + i.Message + i.Evidence));
            if (signature == lastContent && items.Children.Count > 0) return;
            lastContent = signature; items.Children.Clear();
            if (shown.Length == 0) { items.Children.Add(Body("Estou preparando um retrato dos seus registros. As sugestões aparecem aqui, sem precisar iniciar uma conversa.")); return; }
            foreach (var insight in shown)
            {
                var content = Column(TitleText(insight.Title), Body(insight.Message), Caption(insight.Evidence), OriginalActionButton(insight.Action, "arrow-right", () => { Navigate(insight.Route); return Task.CompletedTask; })); content.Spacing = 9;
                items.Children.Add(content);
            }
        }
        panel.Loaded += (_, _) => { refreshCoachPanel = Fill; Fill(); };
        panel.Unloaded += (_, _) => { if (refreshCoachPanel == Fill) refreshCoachPanel = null; };
        Fill(); return Card(panel);
    }
}
