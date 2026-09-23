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
    private string dailyBackupHome = "", dailyBackupStatus = "Preparando cópias diárias…";
    private readonly DispatcherTimer dailyBackupDelay = new() { Interval = TimeSpan.FromSeconds(10) };
    private readonly DispatcherTimer dailyBackupClock = new() { Interval = TimeSpan.FromMinutes(5) };
    private Task dailyBackupWrite = Task.CompletedTask;
    private Action? refreshDailyBackupControls;

    private async Task InitializeDailyBackups(string? isolatedDirectory)
    {
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
                if (!Path.IsPathFullyQualified(selected)) throw new InvalidDataException("Pasta de backup inválida.");
            }
            dailyBackups = new DailyBackups(selected);
            var recovered = await dailyBackups.RestoreIfMissingAsync(store.DirectoryPath);
            dailyBackupStatus = recovered == null ? "Backup diário ativado. Os estudos serão copiados ao usar o Ninho."
                : $"Perfil e estudos recuperados da cópia de {recovered.CreatedAt.LocalDateTime:g}. PDFs, vídeos e modelos não fazem parte desta cópia leve.";
        }
        catch (Exception error) { dailyBackupStatus = "A cópia automática precisa de atenção. Seus estudos continuam disponíveis. " + error.Message; }
        dailyBackupDelay.Tick += async (_, _) => { dailyBackupDelay.Stop(); await SaveDailyBackup(); };
        dailyBackupClock.Tick += async (_, _) => await SaveDailyBackup();
        dailyBackupClock.Start();
    }

    private void QueueDailyBackup()
    {
        if (!ready || dailyBackups == null) return;
        dailyBackupDelay.Stop(); dailyBackupDelay.Start();
    }
    private async Task SaveDailyBackup()
    {
        dailyBackupDelay.Stop();
        if (!ready || dailyBackups == null) return;
        var previous = dailyBackupWrite;
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        dailyBackupWrite = completion.Task;
        try
        {
            await previous;
            var snapshot = State; var analysis = journalWritable ? coachJournal.Snapshot() : null;
            var writer = dailyBackups;
            var path = await Task.Run(() => writer.SaveAsync(snapshot, analysis, DateTimeOffset.Now));
            dailyBackupStatus = $"Cópia diária verificada em {File.GetLastWriteTime(path):g}. Até {DailyBackups.RetainedDays} dias, sem PDFs, vídeos ou pesos de IA.";
        }
        catch (Exception error) { dailyBackupStatus = "Não foi possível atualizar a cópia diária; seus estudos continuam salvos no aplicativo. " + error.Message; }
        finally
        {
            completion.TrySetResult();
            try { refreshDailyBackupControls?.Invoke(); }
            catch { /* A disposed settings view cannot turn a saved backup into a failed close. */ }
        }
    }

    private UIElement DailyBackupPreferences()
    {
        var status = SettingsText(dailyBackupStatus, 11, muted: true);
        var location = SettingsText(dailyBackups?.DirectoryPath ?? dailyBackupHome, 10, muted: true); location.IsTextSelectionEnabled = true;
        refreshDailyBackupControls = () => { status.Text = dailyBackupStatus; location.Text = dailyBackups?.DirectoryPath ?? dailyBackupHome; };
        return SettingsPanel(Column(SettingsHeading("UM CUIDADO A CADA DIA", "Seu caminho fica guardado."),
            SettingsText("Uma cópia compacta por dia guarda perfil, cursos, matérias, aulas, questões, respostas, planos, preferências e observações da assistente. As mudanças atualizam a cópia do dia; mantemos os 14 dias mais recentes.", 11, muted: true),
            status, location,
            Row(OriginalActionButton("Abrir pasta", "folder-open", async () =>
                { var directory = dailyBackups?.DirectoryPath ?? dailyBackupHome; Directory.CreateDirectory(directory); await Launcher.LaunchFolderAsync(await StorageFolder.GetFolderFromPathAsync(directory)); }),
                OriginalActionButton("Escolher pasta", "folder-open", ChooseDailyBackupFolder),
                OriginalActionButton("Atualizar cópia", "download", SaveDailyBackup)),
            OriginalActionButton("Restaurar cópia diária", "upload", RestoreDailyBackup),
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
        await dailyBackupWrite;
        var candidate = new DailyBackups(chosen);
        var state = State; var analysis = journalWritable ? coachJournal.Snapshot() : null;
        await Task.Run(() => candidate.SaveAsync(state, analysis, DateTimeOffset.Now));
        Directory.CreateDirectory(dailyBackupHome);
        var config = Path.Combine(dailyBackupHome, "folder.json");
        await File.WriteAllTextAsync(config + ".tmp", JsonSerializer.Serialize(chosen)); File.Move(config + ".tmp", config, true);
        dailyBackups = candidate; dailyBackupStatus = "Pasta salva e primeira cópia verificada. As cópias anteriores foram mantidas.";
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
        lessonDrafts.Clear(); sessionFeedbackDrafts.Clear(); assistantHistory.Clear();
        await SetWelcomeStep(0); route = State.Profile is { CompletedAt: null } ? "welcome" : "settings";
        clock.Stop(); ApplyTheme(); Render(true); QueueCoachRefresh(); QueueDailyBackup();
        ShowNotice("Cópia diária restaurada. Os arquivos de materiais existentes foram preservados; anexos ausentes podem ser importados novamente.", InfoBarSeverity.Success);
    }
}
