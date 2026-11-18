using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Ninho.Core;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private Brush StudySoft => ColorBrush(DashboardDark ? "#2B2E35" : "#F8F9F5");
    private Brush StudyMint => ColorBrush(DashboardDark ? "#303A37" : "#E9F2E8");
    private TextBlock StudyText(string value, double size, bool muted = false, bool bold = false)
    {
        var text = DashboardText(value, size, muted ? DashboardMuted : DashboardInk);
        text.IsTextSelectionEnabled = false;
        text.IsHitTestVisible = false;
        if (bold) text.FontWeight = FontWeights.SemiBold;
        return text;
    }
    private static StackPanel StudyStack(double gap, params UIElement[] children)
    {
        var stack = Column(children); stack.Spacing = gap; return stack;
    }
    private static Grid StudyBetween(FrameworkElement left, FrameworkElement right, double gap = 13)
    {
        var grid = new Grid { ColumnSpacing = gap };
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.Children.Add(left); Grid.SetColumn(right, 1); grid.Children.Add(right);
        return grid;
    }
    private Button StudyPlain(string label, UIElement content, Func<Task> action)
    {
        var button = ActionButton(label, action);
        button.Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"];
        button.Content = content; button.MinWidth = button.MinHeight = 0;
        button.Padding = new Thickness(0);
        button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        button.VerticalContentAlignment = VerticalAlignment.Center;
        return button;
    }
    private Button StudyIconButton(string label, string icon, Func<Task> action, double size = 17)
    {
        var button = StudyPlain(label, OriginalIcon.Create(icon, size, DashboardMuted), action);
        button.Width = button.Height = 33; button.CornerRadius = new CornerRadius(8);
        ToolTipService.SetToolTip(button, label); return button;
    }
    private Button StudyLink(string label, string icon, Func<Task> action, bool leading = true)
    {
        var text = StudyText(label, 11, bold: true); text.Foreground = DashboardGreen;
        var content = leading ? DashboardRow(OriginalIcon.Create(icon, 15, DashboardGreen), text) : DashboardRow(text, OriginalIcon.Create(icon, 15, DashboardGreen));
        content.Spacing = 7;
        var button = StudyPlain(label, content, action);
        button.Padding = new Thickness(0, 4, 0, 4); button.HorizontalAlignment = HorizontalAlignment.Left;
        return button;
    }
    private Button StudySmallButton(string label, string icon, Func<Task> action, bool lessonAction = false)
    {
        var button = OriginalActionButton(label, icon, action);
        button.MinHeight = lessonAction ? 40 : 35;
        button.Padding = new Thickness(12, 8, 12, 8);
        if (button.Content is StackPanel row)
        {
            row.Spacing = 9;
            foreach (var text in row.Children.OfType<TextBlock>()) { text.FontSize = lessonAction ? 14 : 11; text.IsTextSelectionEnabled = false; text.IsHitTestVisible = false; }
        }
        return button;
    }
    private Border StudySegments((string Id, string Label, string Icon)[] choices, string selected, Action<string> select, int? materialCount = null)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 3 };
        foreach (var choice in choices)
        {
            var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 9, VerticalAlignment = VerticalAlignment.Center };
            if (choice.Icon.Length > 0) content.Children.Add(OriginalIcon.Create(choice.Icon, 16, DashboardInk));
            content.Children.Add(StudyText(choice.Label, 11, choice.Id != selected));
            if (choice.Id == "materials" && materialCount != null)
                content.Children.Add(new Border { Background = StudyMint, Padding = new Thickness(5, 1, 5, 1), CornerRadius = new CornerRadius(4), Child = StudyText(materialCount.Value.ToString(), 9) });
            var button = StudyPlain(choice.Label, content, () => { select(choice.Id); return Task.CompletedTask; });
            button.Padding = new Thickness(15, 9, 15, 9); button.CornerRadius = new CornerRadius(7);
            button.Background = choice.Id == selected ? DashboardSurface : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
            AutomationProperties.SetItemStatus(button, choice.Id == selected ? "Selecionado" : "");
            row.Children.Add(button);
        }
        return new Border { Child = row, Padding = new Thickness(4), Background = ColorBrush(DashboardDark ? "#2B2E35" : "#E9ECE4"), CornerRadius = new CornerRadius(10), HorizontalAlignment = HorizontalAlignment.Left };
    }
    private Border StudySearch(TextBox input)
    {
        input.FontSize = 12; input.BorderThickness = new Thickness(0); input.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        input.Padding = new Thickness(0, 12, 0, 12); input.MinHeight = 0;
        var layout = new Grid { ColumnSpacing = 10 };
        layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(18) });
        layout.ColumnDefinitions.Add(new ColumnDefinition());
        layout.Children.Add(OriginalIcon.Create("search", 18, ColorBrush("#91A093"))); Grid.SetColumn(input, 1); layout.Children.Add(input);
        return new Border { Child = layout, Padding = new Thickness(14, 0, 14, 0), BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), Background = DashboardSurface, MinWidth = 160, MaxWidth = 390, HorizontalAlignment = HorizontalAlignment.Stretch };
    }
    private UIElement StudyProgress(int done, int total, string color)
    {
        var bar = new Border { Background = ColorBrush(color), CornerRadius = new CornerRadius(10), HorizontalAlignment = HorizontalAlignment.Left, Height = 5 };
        var track = new Border { Child = bar, Background = DashboardLine, Height = 5, CornerRadius = new CornerRadius(10) };
        track.SizeChanged += (_, e) => bar.Width = Math.Max(0, e.NewSize.Width * (total > 0 ? Math.Clamp((double)done / total, 0, 1) : 0));
        AutomationProperties.SetName(track, $"{done} de {total} aulas concluídas"); return track;
    }
    private UIElement StudyCard(string id, string icon, double iconSize, string color, string eyebrow, string title, string description, string? counts, string footer, int done, int total, Action open)
    {
        var tint = ((SolidColorBrush)ColorBrush(color)).Color; tint.A = 24;
        var graphic = new Border { Width = 46, Height = 46, CornerRadius = new CornerRadius(12), Background = new SolidColorBrush(tint), Child = OriginalIcon.Create(icon, iconSize, ColorBrush(color)), HorizontalAlignment = HorizontalAlignment.Left };
        var top = StudyBetween(graphic, OriginalIcon.Create("arrow-up-right", counts == null ? 19 : 20, ColorBrush("#A5B59E")));
        var label = StudyText(eyebrow, 8, muted: true); label.CharacterSpacing = 200; label.Margin = new Thickness(0, 22, 0, 0);
        var heading = StudyText(title, 17, bold: true); heading.LineHeight = 23.8; heading.Margin = new Thickness(0, 7, 0, 7);
        var detail = StudyText(description, 11, muted: true); detail.LineHeight = 18.15; detail.Margin = new Thickness(0, 0, 0, 20);
        var content = StudyStack(0, top, label, heading, detail);
        if (counts != null) { var count = StudyText(counts, 15); count.Margin = new Thickness(0, 0, 0, 14); content.Children.Add(count); }
        content.Children.Add(StudyProgress(done, total, color));
        var last = StudyText(footer, 9, muted: true); last.Margin = new Thickness(0, 12, 0, 0); content.Children.Add(last);
        content.IsHitTestVisible = false;
        var button = Tile(content, open); button.Padding = new Thickness(22); button.MinHeight = 224;
        button.Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"];
        button.Background = DashboardSurface; button.BorderBrush = DashboardLine; button.BorderThickness = new Thickness(1); button.CornerRadius = new CornerRadius(15);
        AutomationProperties.SetName(button, title); AutomationProperties.SetAutomationId(button, id);
        var translate = new TranslateTransform(); button.RenderTransform = translate;
        void Hover(bool active)
        {
            button.BorderBrush = active ? ColorBrush("#B8CBB7") : DashboardLine;
            if (State.Settings.ReducedMotion || !new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled) return;
            var animation = new DoubleAnimation { To = active ? -4 : 0, Duration = new Duration(TimeSpan.FromMilliseconds(180)), EnableDependentAnimation = true, EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            Storyboard.SetTarget(animation, translate); Storyboard.SetTargetProperty(animation, "Y");
            var storyboard = new Storyboard(); storyboard.Children.Add(animation); storyboard.Begin();
        }
        button.PointerEntered += (_, _) => Hover(true); button.PointerExited += (_, _) => Hover(false);
        return button;
    }
    private UIElement StudyEmpty(string title, string detail, string? label = null, Func<Task>? action = null)
    {
        var heading = DashboardText(title, 21, display: true); heading.TextAlignment = TextAlignment.Center;
        var description = StudyText(detail, 12, muted: true); description.TextAlignment = TextAlignment.Center; description.Margin = new Thickness(0, 10, 0, 18);
        var icon = OriginalIcon.Create("book-open", 28, ColorBrush("#9EB094")); icon.Margin = new Thickness(0, 0, 0, 17);
        var content = StudyStack(0, icon, heading, description);
        if (label != null && action != null) { var button = DashboardButton(label, "arrow-right", action); button.HorizontalAlignment = HorizontalAlignment.Center; content.Children.Add(button); }
        return new Border { Child = content, Padding = new Thickness(24, 35, 24, 35), MaxWidth = 470, HorizontalAlignment = HorizontalAlignment.Center };
    }
    private static string StudyTime(double minutes)
    {
        var seconds = (int)Math.Floor(minutes * 60 + .000001);
        if (seconds < 60) return $"{seconds} s";
        if (seconds < 3600) return $"{seconds / 60} min" + (seconds % 60 > 0 ? $" {seconds % 60} s" : "");
        return $"{seconds / 3600} h" + (seconds % 3600 / 60 > 0 ? $" {seconds % 3600 / 60} min" : "");
    }
}
