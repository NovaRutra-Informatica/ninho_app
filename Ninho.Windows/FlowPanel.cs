using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace Ninho.Windows;

public sealed class FlowPanel : Panel
{
    private const double Gap = 10;
    protected override Size MeasureOverride(Size available)
    {
        double x = 0, y = 0, lineHeight = 0, width = 0;
        foreach (var child in Children)
        {
            child.Measure(new Size(available.Width, double.PositiveInfinity));
            var size = child.DesiredSize;
            if (x > 0 && x + size.Width > available.Width) { width = Math.Max(width, x - Gap); y += lineHeight + Gap; x = 0; lineHeight = 0; }
            x += size.Width + Gap; lineHeight = Math.Max(lineHeight, size.Height);
        }
        return new Size(Math.Max(width, Math.Max(0, x - Gap)), y + lineHeight);
    }
    protected override Size ArrangeOverride(Size final)
    {
        double x = 0, y = 0, lineHeight = 0;
        foreach (var child in Children)
        {
            var size = child.DesiredSize;
            if (x > 0 && x + size.Width > final.Width) { y += lineHeight + Gap; x = 0; lineHeight = 0; }
            child.Arrange(new Rect(x, y, Math.Min(size.Width, final.Width), size.Height));
            x += size.Width + Gap; lineHeight = Math.Max(lineHeight, size.Height);
        }
        return final;
    }
}
