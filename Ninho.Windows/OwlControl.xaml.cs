using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Animation;

namespace Ninho.Windows;

public sealed partial class OwlControl : UserControl
{
    private readonly Storyboard motion = new();
    private bool initialized;
    private bool loaded;

    public static readonly DependencyProperty AnimateProperty = DependencyProperty.Register(
        nameof(Animate), typeof(bool), typeof(OwlControl), new PropertyMetadata(false, Changed));
    public static readonly DependencyProperty SmallProperty = DependencyProperty.Register(
        nameof(Small), typeof(bool), typeof(OwlControl), new PropertyMetadata(false, Changed));
    public static readonly DependencyProperty HappyProperty = DependencyProperty.Register(
        nameof(Happy), typeof(bool), typeof(OwlControl), new PropertyMetadata(false, Changed));

    public bool Animate { get => (bool)GetValue(AnimateProperty); set => SetValue(AnimateProperty, value); }
    public bool Small { get => (bool)GetValue(SmallProperty); set => SetValue(SmallProperty, value); }
    public bool Happy { get => (bool)GetValue(HappyProperty); set => SetValue(HappyProperty, value); }

    private static void Changed(DependencyObject sender, DependencyPropertyChangedEventArgs args) => ((OwlControl)sender).Refresh();

    public OwlControl()
    {
        InitializeComponent();
        initialized = true;
        Loaded += (_, _) => { loaded = true; Refresh(); };
        Unloaded += (_, _) => { loaded = false; motion.Stop(); };
    }

    private void Refresh()
    {
        if (!initialized) return;
        motion.Stop();
        motion.Children.Clear();
        StarsCanvas.Visibility = Small ? Visibility.Collapsed : Visibility.Visible;
        if (!loaded || !Animate || !new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled) return;

        if (!Small)
        {
            AddCycle(FloatTransform, "Y", 5, false, (0, 0), (.5, -5), (1, 0));
            AddCycle(EyesTransform, "ScaleY", 8, true, (0, 1), (.42, 1), (.44, .1), (.46, 1), (1, 1));
            AddCycle(StarsCanvas, "Opacity", 4, false, (0, .55), (.5, 1), (1, .55));
        }
        if (Happy) AddCycle(WingTransform, "Angle", 2, false, (0, 0), (.5, 7), (1, 0));
        if (motion.Children.Count > 0) motion.Begin();
    }

    private void AddCycle(DependencyObject target, string property, double seconds, bool cssEase, params (double Fraction, double Value)[] frames)
    {
        var animation = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromSeconds(seconds), RepeatBehavior = RepeatBehavior.Forever };
        foreach (var (fraction, value) in frames)
        {
            animation.KeyFrames.Add(new SplineDoubleKeyFrame
            {
                KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(seconds * fraction)),
                Value = value,
                KeySpline = new KeySpline
                {
                    ControlPoint1 = cssEase ? new global::Windows.Foundation.Point(.25, .1) : new global::Windows.Foundation.Point(.42, 0),
                    ControlPoint2 = cssEase ? new global::Windows.Foundation.Point(.25, 1) : new global::Windows.Foundation.Point(.58, 1)
                }
            });
        }
        Storyboard.SetTarget(animation, target);
        Storyboard.SetTargetProperty(animation, property);
        motion.Children.Add(animation);
    }
}
