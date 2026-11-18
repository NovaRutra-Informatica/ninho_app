using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace Ninho.Windows;

public sealed class AdaptiveColumns : Panel
{
    public double MinimumColumnWidth { get; set; } = 260;
    public double Gap { get; set; } = 18;
    public int MaximumColumns { get; set; } = 3;
    private int Columns(double width) => Math.Max(1, Math.Min(MaximumColumns, (int)((width + Gap) / (MinimumColumnWidth + Gap))));
    protected override Size MeasureOverride(Size available)
    {
        var columns = Columns(available.Width); var width = (available.Width - Gap * (columns - 1)) / columns;
        double total = 0, rowHeight = 0; var index = 0;
        foreach (var child in Children)
        {
            child.Measure(new Size(width, double.PositiveInfinity)); rowHeight = Math.Max(rowHeight, child.DesiredSize.Height);
            if (++index % columns == 0) { total += rowHeight + Gap; rowHeight = 0; }
        }
        if (index % columns != 0) total += rowHeight + Gap;
        return new Size(available.Width, Math.Max(0, total - Gap));
    }
    protected override Size ArrangeOverride(Size final)
    {
        var columns = Columns(final.Width); var width = (final.Width - Gap * (columns - 1)) / columns;
        double y = 0;
        for (var i = 0; i < Children.Count; i += columns)
        {
            var row = Children.Skip(i).Take(columns).ToArray(); var height = row.Max(x => x.DesiredSize.Height);
            for (var j = 0; j < row.Length; j++) row[j].Arrange(new Rect(j * (width + Gap), y, width, height));
            y += height + Gap;
        }
        return final;
    }
}
