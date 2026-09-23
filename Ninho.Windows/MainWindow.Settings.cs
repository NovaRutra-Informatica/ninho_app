using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private TextBlock SettingsText(string value, double size = 11, bool muted = false, bool display = false)
    {
        var dark = Root.ActualTheme == ElementTheme.Dark;
        var text = new TextBlock
        {
            Text = value, FontSize = size, TextWrapping = TextWrapping.Wrap,
            Foreground = ColorBrush(muted ? dark ? "#AEB3BE" : "#66766B" : dark ? "#F0F1F3" : "#193C35"),
            LineHeight = size * 1.55, LineStackingStrategy = LineStackingStrategy.BlockLineHeight
        };
        if (display) { text.FontFamily = (FontFamily)Application.Current.Resources["NinhoDisplayFont"]; text.FontWeight = Microsoft.UI.Text.FontWeights.Medium; }
        return UseOriginalTextFace(text);
    }
    private StackPanel SettingsHeading(string eyebrow, string title)
    {
        var label = SettingsText(eyebrow, 9, muted: true); label.CharacterSpacing = 110;
        var heading = Column(label, SettingsText(title, 25, display: true)); heading.Spacing = 7;
        return heading;
    }
    private Border SettingsPanel(UIElement content)
    {
        var panel = Card(content); panel.Padding = new Thickness(28);
        return panel;
    }
    private StackPanel SettingsPage()
    {
        var dark = Root.ActualTheme == ElementTheme.Dark;
        var muted = ColorBrush(dark ? "#AEB3BE" : "#66766B");
        var green = ColorBrush(dark ? "#A8D7BC" : "#235E50");
        var line = ColorBrush(dark ? "#3B3E46" : "#E6EAE3");
        var surface = ColorBrush(dark ? "#23252A" : "#FFFFFF");
        var mint = ColorBrush(dark ? "#303A37" : "#E8EEDF");
        var name = new TextBox { Header = SettingsText("Como quer ser chamado?"), Text = State.Settings.Name, MaxLength = 100, FontSize = 12 };
        NumberBox Number(string title, int value, int min, int max) => new()
        {
            Header = SettingsText(title), Value = value, Minimum = min, Maximum = max, FontSize = 12,
            SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline, HorizontalAlignment = HorizontalAlignment.Stretch
        };
        var goal = Number("Meta diária (minutos)", State.Settings.DailyMinutes, 1, 1440);
        var cards = Number("Novos cartões por dia", State.Settings.NewCardsPerDay, 0, 200);
        var focus = Number("Tempo de foco (minutos)", State.Settings.FocusMinutes, 1, 240);
        var pause = Number("Tempo de pausa (minutos)", State.Settings.BreakMinutes, 1, 60);
        var numbers = new AdaptiveColumns { MinimumColumnWidth = 155, MaximumColumns = 2, Gap = 18 };
        foreach (var item in new[] { goal, cards, focus, pause }) numbers.Children.Add(item);
        var selectedTheme = State.Settings.Theme;
        var themes = new Grid { ColumnSpacing = 10, Margin = new Thickness(0, 0, 0, 5) };
        var themeButtons = new List<(ToggleButton Button, OriginalIcon Icon, TextBlock Label, string Value)>();
        void ShowSelectedTheme()
        {
            foreach (var item in themeButtons)
            {
                var selected = item.Value == selectedTheme;
                item.Button.IsChecked = selected;
                item.Button.Background = selected ? mint : surface;
                item.Button.BorderBrush = selected ? ColorBrush("#8EAC88") : line;
                item.Button.Foreground = item.Icon.Foreground = item.Label.Foreground = selected ? green : muted;
            }
        }
        foreach (var option in new[] { ("light", "Claro", "sun"), ("dark", "Escuro", "moon"), ("system", "Sistema", "laptop") })
        {
            themes.ColumnDefinitions.Add(new ColumnDefinition());
            var icon = OriginalIcon.Create(option.Item3, 22);
            var label = SettingsText(option.Item2); label.HorizontalAlignment = HorizontalAlignment.Center;
            var content = Column(icon, label); content.Spacing = 13;
            var toggle = new ToggleButton
            {
                Style = (Style)Application.Current.Resources["NinhoThemeChoiceStyle"],
                Content = content, MinWidth = 0, Padding = new Thickness(12, 19, 12, 19),
                HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Center,
                CornerRadius = new CornerRadius(10), BorderThickness = new Thickness(1)
            };
            AutomationProperties.SetName(toggle, "Aparência " + option.Item2);
            toggle.Click += async (_, _) => { selectedTheme = option.Item1; ShowSelectedTheme(); try { await QueueLocalEdit(v => v.Settings.Theme = option.Item1, () => { ApplyTheme(); Render(true); }); } catch { } };
            themeButtons.Add((toggle, icon, label, option.Item1));
            Grid.SetColumn(toggle, themes.ColumnDefinitions.Count - 1); themes.Children.Add(toggle);
        }
        ShowSelectedTheme();
        var sound = new ToggleSwitch { IsOn = State.Settings.Sound, OnContent = "", OffContent = "", MinWidth = 0, Width = 44, VerticalAlignment = VerticalAlignment.Center };
        var motion = new ToggleSwitch { IsOn = State.Settings.ReducedMotion, OnContent = "", OffContent = "", MinWidth = 0, Width = 44, VerticalAlignment = VerticalAlignment.Center };
        Border ToggleRow(string label, string hint, ToggleSwitch toggle)
        {
            AutomationProperties.SetName(toggle, label);
            var title = SettingsText(label); title.FontWeight = Microsoft.UI.Text.FontWeights.Medium;
            var copy = Column(title, SettingsText(hint, 9, muted: true)); copy.Spacing = 4;
            var row = new Grid { ColumnSpacing = 18 };
            row.ColumnDefinitions.Add(new ColumnDefinition()); row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(copy); Grid.SetColumn(toggle, 1); row.Children.Add(toggle);
            return new Border { BorderBrush = line, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 17, 0, 17), Child = row };
        }
        profileSaveStatus = SettingsText("Alterações salvas automaticamente neste computador.", 10, muted: true);
        name.TextChanged += async (_, _) =>
        {
            var value = name.Text.Trim();
            if (value.Length == 0) { profileSaveStatus.Text = "Informe um nome para salvar esta alteração."; return; }
            try { await QueueLocalEdit(s => { s.Settings.Name = value; if (s.Profile != null) { s.Profile.Name = value; s.Profile.Revision++; s.Profile.UpdatedAt = DateTimeOffset.Now; } }); } catch { }
        };
        foreach (var input in new[] { goal, cards, focus, pause }) input.ValueChanged += async (_, _) =>
        {
            var value = input.Value;
            if (!double.IsFinite(value) || value != Math.Truncate(value) || value < input.Minimum || value > input.Maximum)
            { profileSaveStatus.Text = "Informe um número inteiro dentro do intervalo para salvar."; return; }
            try { await QueueLocalEdit(s =>
            {
                if (input == goal) { s.Settings.DailyMinutes = (int)value; if (s.Profile != null) s.Profile.DailyMinutes = (int)value; }
                else if (input == cards) s.Settings.NewCardsPerDay = (int)value;
                else if (input == focus) { s.Settings.FocusMinutes = (int)value; if (s.Profile != null) s.Profile.SessionMinutes = (int)value; }
                else s.Settings.BreakMinutes = (int)value;
                if (s.Profile != null && (input == goal || input == focus)) { s.Profile.Revision++; s.Profile.UpdatedAt = DateTimeOffset.Now; }
                if (s.Focus.RunningSince == null && s.Focus.AccumulatedSeconds == 0 && !s.Focus.Stopwatch)
                    s.Focus.TargetMinutes = s.Focus.IsBreak ? s.Settings.BreakMinutes : s.Settings.FocusMinutes;
            }); } catch { }
        };
        sound.Toggled += async (_, _) => { var value = sound.IsOn; try { await QueueLocalEdit(s => s.Settings.Sound = value, () => { ApplyTheme(); if (value) PlayNinhoSound(); }); } catch { } };
        motion.Toggled += async (_, _) => { var value = motion.IsOn; try { await QueueLocalEdit(s => s.Settings.ReducedMotion = value); } catch { } };
        var rhythm = Column(SettingsHeading("VOCÊ & SEU RITMO", "Pequenos compromissos."), name, StudyLink("Personalizar meu perfil", "graduation-cap", () => { Navigate("profile"); return Task.CompletedTask; }), numbers,
            SettingsText("O limite de novos cartões mantém a rotina leve. As revisões que venceram continuam disponíveis. Para aplicar outro tempo a um cronômetro já iniciado, use Reiniciar.", 10, muted: true));
        rhythm.Spacing = 22;
        var toggles = Column(ToggleRow("Sons do Ninho", "Um toque suave ao concluir seus estudos.", sound), ToggleRow("Reduzir animações", "Uma interface mais tranquila.", motion)); toggles.Spacing = 0;
        var appearance = Column(SettingsHeading("UM LUGAR QUE COMBINA COM VOCÊ", "Ambiente de estudo."), SettingsText("Aparência"), themes, toggles, profileSaveStatus); appearance.Spacing = 13;
        var columns = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 330, Gap = 22 };
        columns.Children.Add(SettingsPanel(rhythm)); columns.Children.Add(SettingsPanel(appearance));

        var backupHeading = new Grid { ColumnSpacing = 17 };
        backupHeading.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); backupHeading.ColumnDefinitions.Add(new ColumnDefinition());
        backupHeading.Children.Add(new Border { Width = 48, Height = 48, CornerRadius = new CornerRadius(24), Background = mint, Child = OriginalIcon.Create("folder-heart", 25, green), VerticalAlignment = VerticalAlignment.Center });
        var backupCopy = Column(SettingsHeading("SEU APRENDIZADO É SEU", "Leve seu Ninho com você."), SettingsText("Uma cópia completa com progresso, cartões, agenda e todos os arquivos importados.", 11, muted: true)); backupCopy.Spacing = 7;
        Grid.SetColumn(backupCopy, 1); backupHeading.Children.Add(backupCopy);
        var export = OriginalActionButton("Exportar backup", "download", async () =>
        {
            var file = await PickSave("Ninho-backup", ".zip");
            if (file != null) { await store.ExportArchiveAsync(file.Path); ShowNotice("Backup completo salvo.", InfoBarSeverity.Success); }
        }, true);
        var restore = OriginalActionButton("Restaurar backup", "upload", RestoreBackup);
        export.FontSize = restore.FontSize = 12;
        var storage = new Grid { ColumnSpacing = 12 };
        storage.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); storage.ColumnDefinitions.Add(new ColumnDefinition());
        var shield = OriginalIcon.Create("shield-check", 17, muted); shield.VerticalAlignment = VerticalAlignment.Top; storage.Children.Add(shield);
        var path = SettingsText(store.DirectoryPath, 10, muted: true); path.IsTextSelectionEnabled = true;
        var location = Column(SettingsText("Armazenado neste computador", 10), path,
            SettingsText("Sem conta e sem envio de arquivos à nuvem. Para usar em outro computador, exporte e restaure seu backup.", 9, muted: true)); location.Spacing = 5;
        Grid.SetColumn(location, 1); storage.Children.Add(location);
        var storagePanel = new Border { Child = storage, BorderBrush = line, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 22, 0, 0) };
        var backupContent = Column(backupHeading, Row(export, restore), storagePanel); backupContent.Spacing = 23;
        var backup = SettingsPanel(backupContent);

        var localOptions = new Expander
        {
            Header = Row(OriginalIcon.Create("cpu", 18, green), SettingsText("Modelo local e opções de dados", 12)),
            HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Content = Column(SettingsText("Sua assistente fica neste computador.", 17, display: true), AssistantModelMenu(),
                SettingsText("Para conversar com sua assistente, selecione um modelo local no formato GGUF Instruct, de até 6 GB. Ele é carregado ao responder e libera a memória ao terminar.", 11, muted: true),
                OriginalActionButton("Minha assistente", "sparkles", () => { Navigate("mentor"); return Task.CompletedTask; }),
                SettingsText("Intercâmbio de dados", 17, display: true),
                SettingsText("O JSON contém os estudos, sem os anexos. Para transferir tudo, use Exportar backup. Backups da versão anterior também podem ser restaurados.", 11, muted: true),
                OriginalActionButton("Exportar estudos JSON", "download", async () => { var file = await PickSave("Ninho-estudos", ".json"); if (file != null) { await store.ExportAsync(file.Path); ShowNotice("Estudos exportados. O JSON não inclui anexos.", InfoBarSeverity.Success); } }))
        };
        var heading = Column(Heading("Do seu jeito."), Body("Um ritmo possível é melhor que uma rotina impossível.")); heading.Spacing = 6;
        var version = SettingsText("Ninho · Feito para o seu próximo passo · Windows 11", 9, muted: true); version.TextAlignment = TextAlignment.Center; version.Margin = new Thickness(0, 0, 0, 24);
        var page = Column(heading, columns, DailyBackupPreferences(), backup, localOptions, version); page.Spacing = 24;
        return page;
    }
    private async Task RestoreBackup()
    {
        var file = await PickOpen([".json", ".zip"]); if (file == null) return;
        var archive = file.FileType.Equals(".zip", StringComparison.OrdinalIgnoreCase);
        if (!archive) await Ninho.Core.StudyStore.ReadAsync(file.Path);
        if (!await Confirm("Restaurar um Ninho salvo?", "Após a validação, o backup substituirá os dados atuais. Uma cópia anterior será preservada. JSON inclui apenas estudos; ZIP também traz os anexos.")) return;
        await FlushLocalEdits();
        assistantGenerationVersion++; generation?.Cancel();
        profileGenerationVersion++; profileGeneration?.Cancel(); profilePlanMessage = profilePlanPreview = "";
        if (archive) await store.ImportArchiveAsync(file.Path); else await store.ImportStateAsync(file.Path);
        QueueDailyBackup();
        await ResetCoachAfterRestore();
        await SetWelcomeStep(0);
        if (State.Profile is { CompletedAt: null }) route = "welcome";
        lessonDrafts.Clear(); sessionFeedbackDrafts.Clear(); feedbackDraft = ""; studyProgramId = studySubjectId = selectedSubject = "";
        assistantHistory.Clear(); assistantReply = assistantQuestion = assistantLastQuestion = assistantScope = "";
        ApplyTheme(); Render();
        if (State.Focus.RunningSince != null) clock.Start(); else clock.Stop(); ShowNotice("Backup restaurado. Seu Ninho está de volta.", InfoBarSeverity.Success);
    }
}
