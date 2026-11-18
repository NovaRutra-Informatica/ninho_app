using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private void StyleNinhoDialog(ContentDialog dialog, double width = 550, double radius = 20)
    {
        dialog.XamlRoot = Root.XamlRoot;
        dialog.RequestedTheme = Root.ActualTheme;
        dialog.Background = DashboardSurface; dialog.Foreground = DashboardInk;
        dialog.BorderBrush = DashboardLine; dialog.BorderThickness = new Thickness(1);
        dialog.CornerRadius = new CornerRadius(radius);
        dialog.FontFamily = (FontFamily)Application.Current.Resources["ContentControlThemeFontFamily"];
        dialog.FontSize = 12;
        dialog.Resources["ContentDialogMinWidth"] = Math.Min(width, Math.Max(280, Root.ActualWidth - 56));
        dialog.Resources["ContentDialogMaxWidth"] = width;
        dialog.Resources["ContentDialogMaxHeight"] = Math.Max(280, Root.ActualHeight - 56);
        dialog.Resources["ContentDialogCornerRadius"] = new CornerRadius(radius);
        dialog.Resources["ContentDialogPadding"] = new Thickness(28);
        dialog.Resources["ContentDialogTitleMargin"] = new Thickness(0, 0, 0, 25);
        foreach (var key in new[] { "ContentDialogBackground", "ContentDialogTopOverlay", "ComboBoxBackground", "ComboBoxBackgroundUnfocused", "ComboBoxBackgroundPointerOver", "ComboBoxDropDownBackground" }) dialog.Resources[key] = DashboardSurface;
        dialog.Resources["ContentDialogSmokeFill"] = new SolidColorBrush(global::Windows.UI.Color.FromArgb(96, 16, 37, 30));
        foreach (var key in new[] { "ComboBoxBorderBrush", "ComboBoxBorderBrushPointerOver", "ComboBoxDropDownBorderBrush", "ComboBoxBackgroundBorderBrushUnfocused" }) dialog.Resources[key] = DashboardLine;
        foreach (var key in new[] { "ComboBoxForeground", "ComboBoxForegroundFocused", "ComboBoxForegroundPointerOver", "ComboBoxItemForeground", "ComboBoxItemForegroundSelected", "TextControlForeground" }) dialog.Resources[key] = DashboardInk;
        foreach (var key in new[] { "ComboBoxBorderBrushFocused", "ComboBoxBackgroundBorderBrushFocused", "AccentFillColorDefaultBrush", "SystemControlHighlightAccentBrush", "SystemControlHighlightAltAccentBrush", "TextControlBorderBrushFocused", "FocusStrokeColorOuterBrush" }) dialog.Resources[key] = DashboardGreen;
        foreach (var key in new[] { "ComboBoxItemBackgroundSelected", "ComboBoxItemBackgroundSelectedPointerOver", "ComboBoxItemBackgroundPointerOver" }) dialog.Resources[key] = StudyMint;
        if (dialog.Title is string title) dialog.Title = DashboardText(title, 24, display: true);
        dialog.PrimaryButtonStyle = (Style)Application.Current.Resources["AccentButtonStyle"];
        dialog.CloseButtonStyle = dialog.SecondaryButtonStyle = (Style)Application.Current.Resources["NinhoDialogButtonStyle"];
        if (dialog.Content is UIElement content) StyleNinhoFields(content);
    }

    private void StyleNinhoFields(UIElement element)
    {
        if (element is TextBox text)
        {
            text.Style = (Style)Application.Current.Resources["NinhoDialogTextBoxStyle"];
            text.FontFamily = (FontFamily)Application.Current.Resources["ContentControlThemeFontFamily"];
            text.FontSize = 12;
        }
        else if (element is ComboBox combo)
        {
            combo.FontFamily = (FontFamily)Application.Current.Resources["ContentControlThemeFontFamily"];
            combo.FontSize = 12; combo.CornerRadius = new CornerRadius(8);
            combo.Background = DashboardSurface; combo.Foreground = DashboardInk;
            combo.BorderBrush = DashboardLine; combo.BorderThickness = new Thickness(1);
            combo.Padding = new Thickness(12, 10, 34, 10); combo.MinHeight = 42;
            combo.HorizontalAlignment = HorizontalAlignment.Stretch;
            combo.Resources["ComboBoxHeaderThemeMargin"] = new Thickness(0, 0, 0, 8);
            foreach (var item in combo.Items.OfType<ComboBoxItem>()) { item.FontFamily = combo.FontFamily; item.FontSize = 12; }
        }
        else if (element is CalendarDatePicker date)
        {
            date.CornerRadius = new CornerRadius(8); date.Background = DashboardSurface;
            date.Foreground = DashboardInk; date.BorderBrush = DashboardLine;
            date.FontFamily = (FontFamily)Application.Current.Resources["ContentControlThemeFontFamily"]; date.FontSize = 12; date.MinHeight = 42;
        }
        if (element is Panel panel) foreach (var child in panel.Children) StyleNinhoFields(child);
        else if (element is Border { Child: { } child }) StyleNinhoFields(child);
        else if (element is ContentControl { Content: UIElement childContent }) StyleNinhoFields(childContent);
    }

    private Button DialogAction(string label, bool primary = false)
    {
        var button = new Button { Content = label, Style = (Style)Application.Current.Resources[primary ? "AccentButtonStyle" : "NinhoDialogButtonStyle"], MinHeight = 42 };
        AutomationProperties.SetName(button, label);
        return button;
    }

    private FrameworkElement DialogHeading(string title, Action close)
    {
        var button = new Button { Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"], Content = OriginalIcon.Create("x", 18, DashboardMuted), Width = 33, Height = 33, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -5, -5, 0) };
        AutomationProperties.SetName(button, "Fechar"); button.Click += (_, _) => close();
        return StudyBetween(DashboardText(title, 24, display: true), button, 15);
    }

    private Border DialogActions(params Button[] buttons)
    {
        var row = new FlowPanel { HorizontalAlignment = HorizontalAlignment.Right };
        foreach (var button in buttons) row.Children.Add(button);
        return new Border { Child = row, BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 20, 0, 0), Margin = new Thickness(0, 8, 0, 0) };
    }
}
