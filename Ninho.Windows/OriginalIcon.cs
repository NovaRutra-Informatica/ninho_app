using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;

namespace Ninho.Windows;

public sealed class OriginalIcon : UserControl
{
    private readonly Canvas drawing = new() { Width = 24, Height = 24 };

    public static readonly DependencyProperty IconNameProperty = DependencyProperty.Register(
        nameof(IconName), typeof(string), typeof(OriginalIcon),
        new PropertyMetadata("", (sender, _) => ((OriginalIcon)sender).Draw()));

    public static readonly DependencyProperty SizeProperty = DependencyProperty.Register(
        nameof(Size), typeof(double), typeof(OriginalIcon),
        new PropertyMetadata(20d, (sender, _) => ((OriginalIcon)sender).Resize()));

    public static readonly DependencyProperty StrokeWidthProperty = DependencyProperty.Register(
        nameof(StrokeWidth), typeof(double), typeof(OriginalIcon), new PropertyMetadata(2d));

    public string IconName { get => (string)GetValue(IconNameProperty); set => SetValue(IconNameProperty, value); }
    public double Size { get => (double)GetValue(SizeProperty); set => SetValue(SizeProperty, value); }
    public double StrokeWidth { get => (double)GetValue(StrokeWidthProperty); set => SetValue(StrokeWidthProperty, value); }
    public static IEnumerable<string> AvailableNames => OriginalIcons.Paths.Keys;

    public OriginalIcon()
    {
        Width = Height = Size;
        HorizontalAlignment = HorizontalAlignment.Center;
        VerticalAlignment = VerticalAlignment.Center;
        IsHitTestVisible = false;
        IsTabStop = false;
        AutomationProperties.SetAccessibilityView(this, AccessibilityView.Raw);
        Content = new Viewbox { Stretch = Stretch.Uniform, Child = drawing };
    }

    public static OriginalIcon Create(string name, double size = 20, Brush? foreground = null)
    {
        var icon = new OriginalIcon { IconName = name, Size = size };
        if (foreground is not null) icon.Foreground = foreground;
        return icon;
    }

    private void Resize()
    {
        if (!double.IsFinite(Size) || Size <= 0) throw new ArgumentOutOfRangeException(nameof(Size));
        Width = Height = Size;
    }

    private void Draw()
    {
        drawing.Children.Clear();
        if (string.IsNullOrWhiteSpace(IconName)) return;
        var key = new string(IconName.Where(c => c is not '-' and not '_' && !char.IsWhiteSpace(c)).ToArray());
        if (!OriginalIcons.Aliases.TryGetValue(key, out var canonical))
            throw new ArgumentException($"Unknown original Lucide icon: {IconName}.", nameof(IconName));
        foreach (var data in OriginalIcons.Paths[canonical])
        {
            // Data is generated only from trusted local Lucide geometry. No external
            // XML, browser, raster assets, icon font, or network request is involved.
            var path = (Microsoft.UI.Xaml.Shapes.Path)XamlReader.Load($"<Path xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' Data='{data}' />");
            path.StrokeStartLineCap = PenLineCap.Round;
            path.StrokeEndLineCap = PenLineCap.Round;
            path.StrokeLineJoin = PenLineJoin.Round;
            path.SetBinding(Shape.StrokeProperty, new Binding { Source = this, Path = new PropertyPath(nameof(Foreground)) });
            path.SetBinding(Shape.StrokeThicknessProperty, new Binding { Source = this, Path = new PropertyPath(nameof(StrokeWidth)) });
            drawing.Children.Add(path);
        }
    }
}
