using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private readonly CancellationTokenSource modelDiscoveryLifetime = new();
    private Task<LocalModelScanResult>? assistantModelScan;
    private bool changingAssistantModel;
    private ComboBox? assistantModelChoices;
    private Action<LocalModelCandidate>? activeModelSelection;
    private Action? refreshAssistantModelState;
    private LocalModelCandidate? selectedAssistantCandidate;

    private string SelectedModelName => string.IsNullOrWhiteSpace(State.Settings.ModelPath)
        ? "Escolha um modelo para conversar"
        : Path.GetFileNameWithoutExtension(State.Settings.ModelPath);

    private async Task<LocalModelCandidate> SelectAssistantModel(string path)
    {
        if (generation != null || profileGeneration != null) throw new InvalidOperationException("Interrompa a resposta antes de trocar o modelo.");
        if (changingAssistantModel) throw new InvalidOperationException("Aguarde a seleção atual terminar.");
        changingAssistantModel = true; refreshAssistantModelState?.Invoke();
        try
        {
            var candidate = await Task.Run(() => LocalModelCatalog.Validate(path));
            await Save(s => s.Settings.ModelPath = candidate.Path, false);
            selectedAssistantCandidate = candidate;
            activeModelSelection?.Invoke(candidate);
            return candidate;
        }
        finally { changingAssistantModel = false; refreshAssistantModelState?.Invoke(); }
    }

    private StackPanel AssistantModelMenu()
    {
        var menu = Column(); menu.Spacing = 8;
        var choices = new ComboBox { Header = MentorText("Modelo leve", 11), PlaceholderText = "Selecione um modelo", HorizontalAlignment = HorizontalAlignment.Stretch, MinWidth = 0, FontSize = 12 };
        if (route == "mentor") assistantModelChoices = choices;
        AutomationProperties.SetName(choices, "Escolher modelo de inteligência artificial");
        var status = MentorText("Buscando os modelos já baixados no LM Studio…", 12, muted: true);
        var loading = new ProgressRing { IsActive = false, Width = 18, Height = 18, Visibility = Visibility.Collapsed };
        Button? refresh = null, browse = null;
        bool updating = false, scanning = false;
        void UpdateControls()
        {
            var blocked = generation != null || profileGeneration != null || changingAssistantModel;
            choices.IsEnabled = !scanning && !blocked;
            if (browse != null) browse.IsEnabled = !scanning && !blocked;
            if (refresh != null) refresh.IsEnabled = !scanning && !changingAssistantModel;
        }
        void ShowCandidates(IEnumerable<LocalModelCandidate> candidates, string currentPath)
        {
            updating = true;
            choices.Items.Clear();
            foreach (var candidate in candidates.DistinctBy(x => x.Path, StringComparer.OrdinalIgnoreCase))
            {
                var item = new ComboBoxItem { Tag = candidate, Content = $"{candidate.Name} · {candidate.Bytes / 1_000_000_000d:0.00} GB" };
                ToolTipService.SetToolTip(item, candidate.Path);
                choices.Items.Add(item);
            }
            choices.SelectedItem = choices.Items.OfType<ComboBoxItem>().FirstOrDefault(x => string.Equals(((LocalModelCandidate)x.Tag).Path, currentPath, StringComparison.OrdinalIgnoreCase));
            updating = false;
        }
        async Task Refresh(bool rescan)
        {
            if (scanning) return;
            scanning = true; loading.Visibility = Visibility.Visible; loading.IsActive = true;
            choices.IsEnabled = false;
            if (refresh != null) refresh.IsEnabled = false;
            if (browse != null) browse.IsEnabled = false;
            status.Text = "Buscando os modelos já baixados no LM Studio…";
            try
            {
                if (rescan || assistantModelScan == null)
                    assistantModelScan = Task.Run(() => LocalModelCatalog.Scan(LocalModelCatalog.GetLMStudioModelDirectories(), modelDiscoveryLifetime.Token), modelDiscoveryLifetime.Token);
                var result = await assistantModelScan;
                var currentPath = State.Settings.ModelPath;
                LocalModelCandidate? current = null;
                if (!string.IsNullOrWhiteSpace(currentPath))
                {
                    try { current = await Task.Run(() => LocalModelCatalog.Validate(currentPath)); }
                    catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException or ArgumentException or NotSupportedException) { }
                }
                if (!menu.IsLoaded) return;
                if (!string.Equals(currentPath, State.Settings.ModelPath, StringComparison.OrdinalIgnoreCase)
                    && selectedAssistantCandidate is { } saved && string.Equals(saved.Path, State.Settings.ModelPath, StringComparison.OrdinalIgnoreCase))
                { current = saved; currentPath = saved.Path; }
                ShowCandidates(current == null ? result.Candidates : result.Candidates.Prepend(current), currentPath);
                status.Text = choices.Items.Count == 0
                    ? "Nenhum modelo encontrado. Escolha um arquivo GGUF já salvo no computador."
                    : "A escolha é salva automaticamente. O modelo só é carregado ao enviar.";
                if (currentPath.Length > 0 && current == null) status.Text = "O modelo selecionado não está disponível. Escolha outro arquivo para continuar.";
                if (result.Truncated) status.Text += " A busca foi limitada; use Escolher arquivo se o seu modelo não aparecer.";
            }
            catch (OperationCanceledException) { }
            catch (Exception)
            {
                assistantModelScan = null;
                if (menu.IsLoaded) status.Text = "Não foi possível consultar a pasta de modelos. Você pode escolher o arquivo diretamente.";
            }
            finally
            {
                scanning = false; loading.IsActive = false; loading.Visibility = Visibility.Collapsed;
                UpdateControls();
                }
        }
        browse = OriginalActionButton("Escolher arquivo", "folder-open", async () =>
        {
            if (generation != null || profileGeneration != null) throw new InvalidOperationException("Interrompa a resposta antes de trocar o modelo.");
            var file = await PickOpen([".gguf"]);
            if (file == null) return;
            var candidate = await SelectAssistantModel(file.Path);
            var existing = choices.Items.OfType<ComboBoxItem>().Select(x => (LocalModelCandidate)x.Tag).ToArray();
            ShowCandidates(existing.Prepend(candidate), candidate.Path);
            status.Text = "Modelo selecionado. Sua próxima mensagem usará este arquivo.";
        });
        refresh = StudyIconButton("Atualizar modelos locais", "refresh-cw", () => Refresh(true));
        choices.SelectionChanged += async (_, _) =>
        {
            if (updating || scanning || (choices.SelectedItem as ComboBoxItem)?.Tag is not LocalModelCandidate candidate || string.Equals(candidate.Path, State.Settings.ModelPath, StringComparison.OrdinalIgnoreCase)) return;
            choices.IsEnabled = false;
            try { await SelectAssistantModel(candidate.Path); status.Text = "Modelo selecionado. A próxima mensagem usará este arquivo."; }
            catch (Exception error)
            {
                status.Text = error.Message;
                updating = true;
                choices.SelectedItem = choices.Items.OfType<ComboBoxItem>().FirstOrDefault(x => string.Equals(((LocalModelCandidate)x.Tag).Path, State.Settings.ModelPath, StringComparison.OrdinalIgnoreCase));
                updating = false;
            }
            finally { UpdateControls(); }
        };
        var row = StudyBetween(choices, Row(refresh, loading));
        menu.Children.Add(row);
        menu.Children.Add(status);
        menu.Children.Add(StudyBetween(StudyText("Processado neste computador, sem precisar abrir o LM Studio.", 10, muted: true), browse));
        void ModelSelected(LocalModelCandidate candidate)
        {
            var existing = choices.Items.OfType<ComboBoxItem>().Select(x => (LocalModelCandidate)x.Tag).ToArray();
            ShowCandidates(existing.Prepend(candidate), candidate.Path);
            status.Text = "Modelo selecionado. Sua próxima mensagem usará este arquivo.";
        }
        menu.Loaded += async (_, _) => { activeModelSelection = ModelSelected; refreshAssistantModelState = UpdateControls; UpdateControls(); await Refresh(false); };
        menu.Unloaded += (_, _) => { if (activeModelSelection == ModelSelected) activeModelSelection = null; if (refreshAssistantModelState == UpdateControls) refreshAssistantModelState = null; };
        return menu;
    }
}
