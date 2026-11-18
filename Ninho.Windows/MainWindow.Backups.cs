using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Ninho.Core;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.System;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private DailyBackups? dailyBackups;
    private DailyBackupCoordinator? dailyBackupCoordinator;
    private string dailyBackupHome = "", dailyBackupStatus = "Preparando cópias diárias…";
    private string dailyBackupRecoveryWarning = "";
    private readonly DispatcherTimer dailyBackupDelay = new() { Interval = TimeSpan.FromSeconds(10) };
    private readonly DispatcherTimer dailyBackupClock = new() { Interval = TimeSpan.FromMinutes(5) };
    private Task dailyBackupWrite = Task.CompletedTask;
    private Action? refreshDailyBackupControls;

    private async Task InitializeDailyBackups(string? isolatedDirectory)
    {
        if (licenseWindowClosed) return;
        dailyBackupHome = isolatedDirectory != null ? Path.Combine(isolatedDirectory, "automatic-backups")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ninho", "AutomaticBackups");
        try
        {
            Directory.CreateDirectory(dailyBackupHome);
            var selected = dailyBackupHome;
            var config = Path.Combine(dailyBackupHome, "folder.json");
            if (File.Exists(config))
            {
                if (new FileInfo(config).Length > 8192) throw new InvalidDataException("Preferência de pasta de backup inválida.");
                selected = JsonSerializer.Deserialize<string>(await File.ReadAllTextAsync(config)) ?? dailyBackupHome;
                if (licenseWindowClosed) return;
                if (!Path.IsPathFullyQualified(selected)) throw new InvalidDataException("Pasta de backup inválida.");
            }
            var external = !Path.GetFullPath(selected).Equals(Path.GetFullPath(dailyBackupHome), StringComparison.OrdinalIgnoreCase);
            var local = new DailyBackups(dailyBackupHome, recoveryRequirement: Path.Combine(dailyBackupHome, "local-recovery-required.json"));
            dailyBackups = external ? new DailyBackups(selected, requireExistingDirectory: true, recoveryRequirement: Path.Combine(dailyBackupHome, "recovery-required.json")) : local;
            dailyBackupCoordinator = new DailyBackupCoordinator(local, external ? dailyBackups : null);
            var recovered = await dailyBackupCoordinator.RestoreIfMissingAsync(store.DirectoryPath);
            if (licenseWindowClosed) return;
            dailyBackupRecoveryWarning = recovered?.RecoveryWarning ?? "";
            dailyBackupStatus = recovered == null ? "Backup diário ativado. Os estudos serão copiados ao usar o Ninho."
                : $"Perfil e estudos recuperados da cópia de {recovered.CreatedAt.LocalDateTime:g}. PDFs, vídeos e modelos não fazem parte desta cópia leve. {recovered.RecoveryWarning}";
        }
        catch (Exception error)
        {
            if (licenseWindowClosed) return;
            dailyBackupStatus = "A cópia automática precisa de atenção. " + error.Message;
            if (!File.Exists(Path.Combine(store.DirectoryPath, "state.json"))) throw;
        }
        if (licenseWindowClosed) return;
        dailyBackupDelay.Tick += async (_, _) => { dailyBackupDelay.Stop(); await SaveDailyBackup(); };
        dailyBackupClock.Tick += async (_, _) => await SaveDailyBackup();
        dailyBackupClock.Start();
    }

    private void QueueDailyBackup()
    {
        if (!ready || dailyBackupCoordinator == null) return;
        dailyBackupDelay.Stop(); dailyBackupDelay.Start();
    }
    private async Task SaveDailyBackup()
    {
        dailyBackupDelay.Stop();
        if (!ready || dailyBackupCoordinator == null) return;
        var previous = dailyBackupWrite;
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        dailyBackupWrite = completion.Task;
        try
        {
            await previous;
            if (licenseWindowClosed) return;
            var snapshot = State; var analysis = journalWritable ? coachJournal.Snapshot() : null;
            var writer = dailyBackupCoordinator;
            var result = await Task.Run(() => writer.SaveAsync(snapshot, analysis, DateTimeOffset.Now));
            dailyBackupStatus = $"Cópia local verificada em {File.GetLastWriteTime(result.LocalPath):g}. Até {DailyBackups.RetainedDays} dias, sem PDFs, vídeos ou pesos de IA.";
            if (result.ExternalPath != null) dailyBackupStatus += " Arquivo também entregue à pasta escolhida; o serviço controla o envio e pode estar pendente.";
            if (result.ExternalError.Length > 0) dailyBackupStatus += " A cópia local está salva; a pasta escolhida não recebeu esta atualização: " + result.ExternalError;
            if (dailyBackupRecoveryWarning.Length > 0) dailyBackupStatus += " " + dailyBackupRecoveryWarning;
        }
        catch (Exception error) { dailyBackupStatus = "Não foi possível atualizar a cópia diária; seus estudos continuam salvos no aplicativo. " + error.Message; }
        finally
        {
            completion.TrySetResult();
            try { if (!licenseWindowClosed) refreshDailyBackupControls?.Invoke(); }
            catch { /* A disposed settings view cannot turn a saved backup into a failed close. */ }
        }
    }

    private UIElement DailyBackupPreferences()
    {
        var status = SettingsText(dailyBackupStatus, 11, muted: true);
        var location = SettingsText(dailyBackups?.DirectoryPath ?? dailyBackupHome, 10, muted: true); location.IsTextSelectionEnabled = true;
        var localOnly = OriginalActionButton("Manter só neste computador", "folder-open", UseLocalDailyBackups);
        localOnly.IsEnabled = dailyBackupCoordinator?.External != null;
        refreshDailyBackupControls = () => { status.Text = dailyBackupStatus; location.Text = dailyBackups?.DirectoryPath ?? dailyBackupHome; localOnly.IsEnabled = dailyBackupCoordinator?.External != null; };
        return SettingsPanel(Column(SettingsHeading("UM CUIDADO A CADA DIA", "Seu caminho fica guardado."),
            SettingsText("Uma cópia compacta local por dia guarda perfil, cursos, matérias, aulas, questões, respostas, planos, preferências e observações da assistente. Uma pasta adicional recebe outra cópia quando estiver disponível. As mudanças atualizam a cópia do dia; mantemos os 14 dias mais recentes.", 11, muted: true),
            status, location,
            Row(OriginalActionButton("Abrir pasta", "folder-open", async () =>
                { var directory = dailyBackups?.DirectoryPath ?? dailyBackupHome; Directory.CreateDirectory(directory); await Launcher.LaunchFolderAsync(await StorageFolder.GetFolderFromPathAsync(directory)); }),
                OriginalActionButton("Escolher pasta", "folder-open", ChooseDailyBackupFolder),
                OriginalActionButton("Atualizar cópia", "download", SaveDailyBackup)),
            OriginalActionButton("Restaurar cópia diária", "upload", RestoreDailyBackup),
            localOnly,
            SettingsText("A pasta padrão fica fora da instalação e é preservada ao desinstalar. Se reinstalar e não houver estado atual, o Ninho recupera a cópia válida mais recente. PDFs, vídeos e modelos precisam ser guardados à parte ou no backup completo abaixo.", 10, muted: true),
            SettingsText("Funciona enquanto o Ninho está aberto e ao fechar normalmente. Não há serviço rodando depois de fechar. Para sincronizar, você pode escolher uma pasta já configurada no OneDrive ou em outro serviço; essa sincronização pertence ao serviço escolhido. O Ninho não envia arquivos à nuvem.", 10, muted: true)));
    }
    private async Task ChooseDailyBackupFolder()
    {
        var picker = new FolderPicker(); picker.FileTypeFilter.Add("*");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        var folder = await picker.PickSingleFolderAsync(); if (folder == null) return;
        var chosen = Path.GetFullPath(Path.Combine(folder.Path, "Ninho Automatic Backups"));
        if (chosen.StartsWith(Path.GetFullPath(AppContext.BaseDirectory), StringComparison.OrdinalIgnoreCase)
            || chosen.StartsWith(store.DirectoryPath.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Escolha uma pasta fora da instalação e dos dados ativos do aplicativo.");
        await FlushLocalEdits(); await dailyBackupWrite;
        var candidate = new DailyBackups(chosen);
        var previous = await Task.Run(candidate.LatestValidAsync);
        if (previous != null && !DailyBackups.MatchesRestoredState(previous, State))
            throw new DailyBackupRecoveryRequiredException();
        var state = State; var analysis = journalWritable ? coachJournal.Snapshot() : null;
        var local = dailyBackupCoordinator?.Local ?? new DailyBackups(dailyBackupHome, recoveryRequirement: Path.Combine(dailyBackupHome, "local-recovery-required.json"));
        var result = await Task.Run(() => new DailyBackupCoordinator(local, candidate).SaveAsync(state, analysis, DateTimeOffset.Now));
        if (result.ExternalError.Length > 0) throw new IOException("A cópia local está salva; não foi possível preparar a pasta escolhida: " + result.ExternalError);
        Directory.CreateDirectory(dailyBackupHome);
        var config = Path.Combine(dailyBackupHome, "folder.json");
        await File.WriteAllTextAsync(config + ".tmp", JsonSerializer.Serialize(chosen)); File.Move(config + ".tmp", config, true);
        dailyBackups = new DailyBackups(chosen, requireExistingDirectory: true, recoveryRequirement: Path.Combine(dailyBackupHome, "recovery-required.json"));
        dailyBackupCoordinator = new DailyBackupCoordinator(local, dailyBackups);
        dailyBackups.FinishInitialRecovery();
        dailyBackupStatus = "Pasta salva e primeira cópia verificada. O serviço escolhido controla a sincronização; o envio pode estar pendente.";
        refreshDailyBackupControls?.Invoke();
    }
    private async Task UseLocalDailyBackups()
    {
        await FlushLocalEdits(); await dailyBackupWrite;
        var local = dailyBackupCoordinator?.Local ?? new DailyBackups(dailyBackupHome, recoveryRequirement: Path.Combine(dailyBackupHome, "local-recovery-required.json"));
        var snapshot = State; var analysis = journalWritable ? coachJournal.Snapshot() : null;
        await Task.Run(() => local.SaveAsync(snapshot, analysis, DateTimeOffset.Now));
        var config = Path.Combine(dailyBackupHome, "folder.json");
        await File.WriteAllTextAsync(config + ".tmp", JsonSerializer.Serialize(dailyBackupHome)); File.Move(config + ".tmp", config, true);
        dailyBackups = local; dailyBackupCoordinator = new DailyBackupCoordinator(local);
        dailyBackupStatus = "Cópia local verificada. O envio de novas cópias à pasta adicional foi desligado; os arquivos que já estavam nela foram preservados.";
        refreshDailyBackupControls?.Invoke();
    }
    private async Task RestoreDailyBackup()
    {
        var file = await PickOpen([".zip"]); if (file == null) return;
        var snapshot = await Task.Run(() => DailyBackups.ReadAsync(file.Path));
        if (!await Confirm("Restaurar esta cópia diária?", $"Cópia de {snapshot.CreatedAt.LocalDateTime:g}. Ela substitui perfil e registros; uma cópia do estado atual será preservada. Não contém os arquivos dos materiais nem modelos de IA.")) return;
        await FlushLocalEdits(); await dailyBackupWrite; await coachWrites;
        var temporary = Path.Combine(store.DirectoryPath, "daily-restore-" + Guid.NewGuid().ToString("N") + ".json");
        try
        {
            snapshot.State.Focus.Pause(snapshot.CreatedAt);
            await File.WriteAllBytesAsync(temporary, JsonSerializer.SerializeToUtf8Bytes(snapshot.State, StudyStore.JsonOptions));
            await store.ImportStateAsync(temporary);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        coachAnalysis?.Cancel(); generation?.Cancel(); profileGeneration?.Cancel();
        coachJournal = snapshot.Analysis ?? new CoachJournal();
        if (coachJournalStore != null) await coachJournalStore.SaveAsync(coachJournal.Snapshot());
        journalWritable = true; usageWatch.Reset(); coachInsights = []; observedRoute = "";
        dailyBackupRecoveryWarning = "";
        if (dailyBackupCoordinator?.External is { } external)
        {
            if (Path.GetFullPath(Path.GetDirectoryName(file.Path)!).Equals(external.DirectoryPath, StringComparison.OrdinalIgnoreCase))
                external.FinishInitialRecovery();
        }
        dailyBackupCoordinator?.Local.FinishInitialRecovery();
        lessonDrafts.Clear(); sessionFeedbackDrafts.Clear(); assistantHistory.Clear();
        await SetWelcomeStep(0); route = State.Profile is { CompletedAt: null } ? "welcome" : "settings";
        clock.Stop(); ApplyTheme(); Render(true); QueueCoachRefresh(); await SaveDailyBackup();
        ShowNotice("Cópia diária restaurada. Os arquivos de materiais existentes foram preservados; anexos ausentes podem ser importados novamente.", InfoBarSeverity.Success);
    }
}
