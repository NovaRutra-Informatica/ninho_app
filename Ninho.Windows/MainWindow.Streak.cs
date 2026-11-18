using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private bool streakVisible;
    private async Task OpenStreakCalendar()
    {
        if (streakVisible || tutorialVisible) return;
        streakVisible = true; PlayNavigationSound();
        var now = DateTimeOffset.Now;
        var today = DateOnly.FromDateTime(now.LocalDateTime);
        var days = StudyStreak.ActiveDays(State, now);
        var month = new DateOnly(today.Year, today.Month, 1);
        var currentMonth = month;
        var title = TitleText(""); var summary = Body("");
        var calendar = new Grid { ColumnSpacing = 5, RowSpacing = 6 };
        for (var i = 0; i < 7; i++) calendar.ColumnDefinitions.Add(new ColumnDefinition());
        AutomationProperties.SetAutomationId(calendar, "streak.calendar");
        var previous = new Button { Content = "‹", MinWidth = 44, MinHeight = 44 };
        var next = new Button { Content = "›", MinWidth = 44, MinHeight = 44 };
        var reset = new Button { Content = "Voltar para hoje", MinHeight = 44 };
        AutomationProperties.SetName(previous, "Mês anterior"); AutomationProperties.SetName(next, "Próximo mês");
        AutomationProperties.SetAutomationId(previous, "streak.previous"); AutomationProperties.SetAutomationId(next, "streak.next");
        AutomationProperties.SetAutomationId(title, "streak.month"); AutomationProperties.SetAutomationId(reset, "streak.today");
        void Fill()
        {
            title.Text = month.ToString("MMMM 'de' yyyy", PlanningCulture);
            next.IsEnabled = month < currentMonth; previous.IsEnabled = month.Year > 1900;
            reset.Visibility = month == currentMonth ? Visibility.Collapsed : Visibility.Visible;
            calendar.Children.Clear(); calendar.RowDefinitions.Clear();
            for (var i = 0; i < 7; i++) calendar.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var weekdays = new[] { "SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM" };
            for (var i = 0; i < 7; i++) { var label = Caption(weekdays[i]); label.HorizontalAlignment = HorizontalAlignment.Center; Grid.SetColumn(label, i); calendar.Children.Add(label); }
            var offset = ((int)month.DayOfWeek + 6) % 7;
            var count = DateTime.DaysInMonth(month.Year, month.Month);
            for (var number = 1; number <= count; number++)
            {
                var day = month.AddDays(number - 1); var studied = days.Contains(day);
                var label = Text(number.ToString()); label.HorizontalAlignment = HorizontalAlignment.Center;
                var flame = OriginalIcon.Create("flame", 13, ColorBrush(studied ? "#C88E67" : "#87928B")); flame.Opacity = studied ? 1 : 0;
                var cell = new Border { Child = Column(label, flame), Padding = new Thickness(5), MinHeight = 52, CornerRadius = new CornerRadius(9), Background = studied ? StudyMint : StudySoft, BorderBrush = day == today ? DashboardGreen : DashboardLine, BorderThickness = new Thickness(day == today ? 1.5 : 0), Opacity = day > today ? .35 : 1 };
                ((StackPanel)cell.Child).Spacing = 3;
                AutomationProperties.SetName(cell, day.ToString("D", PlanningCulture) + (day == today ? ", hoje" : "") + (studied ? ", estudo registrado" : day > today ? ", dia futuro" : ", sem estudo registrado"));
                AutomationProperties.SetAccessibilityView(cell, Microsoft.UI.Xaml.Automation.Peers.AccessibilityView.Content);
                AutomationProperties.SetAutomationId(cell, "streak.day." + day.ToString("yyyy-MM-dd"));
                var slot = offset + number - 1; Grid.SetColumn(cell, slot % 7); Grid.SetRow(cell, slot / 7 + 1); calendar.Children.Add(cell);
            }
            var active = days.Count(day => day.Year == month.Year && day.Month == month.Month);
            summary.Text = active == 0 ? "Ainda não há estudos registrados neste mês." : $"Você estudou em {active} {(active == 1 ? "dia deste mês" : "dias deste mês")}.";
            AnimateLocalChange(calendar);
        }
        previous.Click += (_, _) => { if (month.Year <= 1900) return; month = month.AddMonths(-1); PlayNavigationSound(); Fill(); };
        next.Click += (_, _) => { if (month >= currentMonth) return; month = month.AddMonths(1); PlayNavigationSound(); Fill(); };
        reset.Click += (_, _) => { month = currentMonth; PlayNavigationSound(); Fill(); };
        var countStreak = StudyStreak.Count(days, today);
        var content = Column(TitleText($"{countStreak} {(countStreak == 1 ? "dia seguido" : "dias seguidos")}"),
            StudyBetween(Row(previous, title), next), calendar, reset, summary,
            Body("O foguinho conta dias com sessões ou revisões registradas. Abrir o aplicativo ou deixar um cronômetro sem salvar não marca o dia."));
        var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, RequestedTheme = Root.ActualTheme, Title = "Sua sequência", Content = new ScrollViewer { Content = content, MaxHeight = Math.Max(180, Math.Min(550, Root.ActualHeight - 180)) }, CloseButtonText = "Concluir" };
        StyleNinhoDialog(dialog, 540);
        dialog.Resources["ContentDialogMaxWidth"] = 540d; AutomationProperties.SetAutomationId(dialog, "screen.streak");
        ObserveInteractions(dialog);
        Fill();
        try { await dialog.ShowAsync(); }
        catch (Exception error) { ShowNotice(error.Message, InfoBarSeverity.Error); }
        finally { streakVisible = false; }
    }
}
