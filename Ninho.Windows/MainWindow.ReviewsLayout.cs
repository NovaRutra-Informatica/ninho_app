using System.Globalization;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private static string ReviewDate(DateTimeOffset value) => value.LocalDateTime.ToString("d 'de' MMM", CultureInfo.GetCultureInfo("pt-BR"));

    private TextBlock ReviewEyebrow(string value)
    {
        var text = StudyText(value, 9, muted: true, bold: true); text.FontWeight = FontWeights.Bold; text.CharacterSpacing = 200; return text;
    }

    private Button ReviewPrimary(string label, string icon, Func<Task> action)
    {
        var foreground = DashboardDark ? ColorBrush("#18251F") : ColorBrush("#FFFFFF");
        var text = StudyText(label, 12, bold: true); text.Foreground = foreground;
        var row = DashboardRow(); if (icon.Length > 0) row.Children.Add(OriginalIcon.Create(icon, 17, foreground)); row.Children.Add(text); row.IsHitTestVisible = false;
        var button = StudyPlain(label, row, action); button.Padding = new Thickness(17, 11, 17, 11); button.MinHeight = 42;
        button.Background = DashboardGreen; button.Foreground = foreground; button.BorderBrush = DashboardGreen; button.BorderThickness = new Thickness(1); button.CornerRadius = new CornerRadius(10);
        button.HorizontalAlignment = HorizontalAlignment.Left; button.VerticalAlignment = VerticalAlignment.Center;
        return button;
    }

    private Border ReviewTabs(Action<string> select, out Action update)
    {
        var count = StudyText("", 9);
        var reviewText = StudyText("Revisar", 11); var libraryText = StudyText("Meu acervo", 11);
        var review = StudyPlain("Revisar", reviewText, () => { select("home"); return Task.CompletedTask; });
        var library = StudyPlain("Meu acervo", DashboardRow(libraryText, new Border { Child = count, Background = StudyMint, CornerRadius = new CornerRadius(4), Padding = new Thickness(5, 1, 5, 1) }), () => { select("library"); return Task.CompletedTask; });
        foreach (var button in new[] { review, library }) { button.Padding = new Thickness(15, 9, 15, 9); button.CornerRadius = new CornerRadius(7); }
        var row = DashboardRow(review, library); row.Spacing = 3;
        update = () =>
        {
            count.Text = State.Cards.Count.ToString();
            review.Background = reviewMode == "library" ? new SolidColorBrush(Microsoft.UI.Colors.Transparent) : DashboardSurface;
            library.Background = reviewMode == "library" ? DashboardSurface : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
            reviewText.Foreground = reviewMode == "library" ? DashboardMuted : DashboardInk;
            libraryText.Foreground = reviewMode == "library" ? DashboardInk : DashboardMuted;
            AutomationProperties.SetItemStatus(review, reviewMode == "library" ? "" : "Selecionado"); AutomationProperties.SetItemStatus(library, reviewMode == "library" ? "Selecionado" : "");
        };
        return new Border { Child = row, Padding = new Thickness(4), Background = ColorBrush(DashboardDark ? "#2B2E35" : "#E9ECE4"), CornerRadius = new CornerRadius(10), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center };
    }

    private Border ReviewTip(string icon, string title, string description, UIElement last)
    {
        var graphic = OriginalIcon.Create(icon, 21, ColorBrush("#A69B6D")); graphic.HorizontalAlignment = HorizontalAlignment.Left; graphic.Margin = new Thickness(0, 0, 0, 15);
        var heading = StudyText(title, 15, bold: true); heading.Margin = new Thickness(0, 0, 0, 7);
        var body = StudyText(description, 12, muted: true); body.Margin = new Thickness(0, 0, 0, 15);
        var panel = DashboardPanel(StudyStack(0, graphic, heading, body, last), new Thickness(25)); panel.CornerRadius = new CornerRadius(15); return panel;
    }

    private Button ReviewFlag(string label, string icon, Func<Task> action)
    {
        var button = StudyPlain(label, DashboardRow(OriginalIcon.Create(icon, 15, DashboardMuted), StudyText(label, 10, muted: true)), action);
        ((StackPanel)button.Content).Spacing = 7; button.Padding = new Thickness(9, 7, 9, 7); button.CornerRadius = new CornerRadius(6); return button;
    }

    private void SetReviewFlag(Button button, bool selected)
    {
        button.Background = selected ? ColorBrush(DashboardDark ? "#443B2C" : "#F5ECD9") : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        button.Foreground = selected ? ColorBrush(DashboardDark ? "#DDC185" : "#A68546") : DashboardMuted;
        if (button.Content is StackPanel content)
        {
            foreach (var text in content.Children.OfType<TextBlock>()) text.Foreground = button.Foreground;
            foreach (var icon in content.Children.OfType<OriginalIcon>()) icon.Foreground = button.Foreground;
        }
        else if (button.Content is OriginalIcon loneIcon) loneIcon.Foreground = button.Foreground;
        AutomationProperties.SetItemStatus(button, selected ? "Sinalizado" : "");
    }

    private Button ReviewRating(int number, string label, string hint, string color, Func<Task> action)
    {
        var ink = ColorBrush(color);
        var key = new Border { Child = StudyText(number.ToString(), 9), BorderBrush = DashboardLine, BorderThickness = new Thickness(1), Padding = new Thickness(6, 2, 6, 2), CornerRadius = new CornerRadius(4), Opacity = .7, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 9) };
        var heading = StudyText(label, 12, bold: true); heading.Foreground = ink; heading.TextAlignment = TextAlignment.Center;
        var detail = StudyText(hint, 9); detail.Foreground = ink; detail.TextAlignment = TextAlignment.Center; detail.Margin = new Thickness(0, 5, 0, 0);
        var content = StudyStack(0, key, heading, detail); content.IsHitTestVisible = false;
        var button = StudyPlain($"{number}: {label}, {hint}", content, action);
        button.Padding = new Thickness(8, 17, 8, 15); button.Background = DashboardSurface; button.BorderBrush = DashboardLine; button.BorderThickness = new Thickness(1); button.CornerRadius = new CornerRadius(11); button.HorizontalAlignment = HorizontalAlignment.Stretch;
        var translate = new TranslateTransform(); button.RenderTransform = translate;
        void Hover(bool hovered)
        {
            button.BorderBrush = hovered ? ink : DashboardLine;
            if (State.Settings.ReducedMotion || !new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled) return;
            var animation = new DoubleAnimation { To = hovered ? -3 : 0, Duration = new Duration(TimeSpan.FromMilliseconds(180)), EnableDependentAnimation = true, EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } };
            Storyboard.SetTarget(animation, translate); Storyboard.SetTargetProperty(animation, "Y"); var storyboard = new Storyboard(); storyboard.Children.Add(animation); storyboard.Begin();
        }
        button.PointerEntered += (_, _) => Hover(true); button.PointerExited += (_, _) => Hover(false); return button;
    }
}
