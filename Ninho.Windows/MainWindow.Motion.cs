using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Hosting;
using Microsoft.UI.Composition;
using System.Numerics;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private global::Windows.Media.Playback.MediaPlayer? ninhoSound;
    private Visual? movingPage;
    private (string Route, string Program, string Subject, string Tab)? renderedPageLocation;

    private (string Route, string Program, string Subject, string Tab) PageLocation() =>
        route == "studies" ? (route, studyProgramId, studySubjectId, studyTab) : (route, "", "", "");

    private void AnimatePageChange(FrameworkElement content)
    {
        StopPageMotion();
        if (State.Settings.ReducedMotion || !new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled) return;
        void Begin()
        {
            if (!content.IsLoaded || State.Settings.ReducedMotion || !new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled) return;
            ElementCompositionPreview.SetIsTranslationEnabled(content, true);
            var visual = ElementCompositionPreview.GetElementVisual(content);
            movingPage = visual;
            var compositor = visual.Compositor;
            var easing = compositor.CreateCubicBezierEasingFunction(new Vector2(.2f, .8f), new Vector2(.2f, 1));
            var opacity = compositor.CreateScalarKeyFrameAnimation();
            opacity.InsertKeyFrame(0, .35f); opacity.InsertKeyFrame(1, 1, easing);
            opacity.Duration = TimeSpan.FromMilliseconds(180);
            var translation = compositor.CreateVector3KeyFrameAnimation();
            translation.InsertKeyFrame(0, new Vector3(0, 7, 0)); translation.InsertKeyFrame(1, Vector3.Zero, easing);
            translation.Duration = TimeSpan.FromMilliseconds(220);
            visual.StartAnimation("Opacity", opacity);
            visual.StartAnimation("Translation", translation);
        }
        if (content.IsLoaded) Begin();
        else
        {
            RoutedEventHandler? loaded = null;
            loaded = (_, _) => { content.Loaded -= loaded; Begin(); };
            content.Loaded += loaded;
        }
    }

    private void StopPageMotion()
    {
        if (movingPage is not { } visual) return;
        visual.StopAnimation("Opacity"); visual.Opacity = 1;
        visual.StopAnimation("Translation"); visual.Properties.InsertVector3("Translation", Vector3.Zero);
        movingPage = null;
    }
    private void InitializeSidebarMotion()
    {
        foreach (var item in Navigation.MenuItems.OfType<NavigationViewItem>())
        {
            item.PointerEntered += (_, _) => AnimateSidebarIcon(item.Content as Grid, true);
            item.PointerExited += (_, _) => AnimateSidebarIcon(item.Content as Grid, false);
            item.PointerCanceled += (_, _) => AnimateSidebarIcon(item.Content as Grid, false);
        }
        SettingsNavigation.PointerEntered += (_, _) => AnimateSidebarIcon(SettingsNavigation.Content as Panel, true);
        SettingsNavigation.PointerExited += (_, _) => AnimateSidebarIcon(SettingsNavigation.Content as Panel, false);
    }
    private void AnimateSidebarIcon(Panel? content, bool hover)
    {
        if (content?.Children.OfType<OriginalIcon>().FirstOrDefault() is not { } icon) return;
        var transform = icon.RenderTransform as CompositeTransform ?? new CompositeTransform();
        icon.RenderTransform = transform; icon.RenderTransformOrigin = new global::Windows.Foundation.Point(.5, .5);
        if (State.Settings.ReducedMotion || !new global::Windows.UI.ViewManagement.UISettings().AnimationsEnabled)
        { transform.Rotation = transform.TranslateY = 0; return; }
        var animation = new Storyboard();
        foreach (var (property, target) in new[] { ("Rotation", hover ? -5d : 0), ("TranslateY", hover ? -1d : 0) })
        {
            var tween = new DoubleAnimation { To = target, Duration = TimeSpan.FromMilliseconds(180), EnableDependentAnimation = true, EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
            Storyboard.SetTarget(tween, transform); Storyboard.SetTargetProperty(tween, property); animation.Children.Add(tween);
        }
        animation.Begin();
    }
    private void PlayNinhoSound()
    {
        if (!State.Settings.Sound) return;
        try
        {
            ninhoSound ??= new global::Windows.Media.Playback.MediaPlayer
            {
                Volume = .20,
                Source = global::Windows.Media.Core.MediaSource.CreateFromUri(new Uri(Path.Combine(AppContext.BaseDirectory, "Assets", "Sounds", "complete.wav")))
            };
            ninhoSound.PlaybackSession.Position = TimeSpan.Zero;
            ninhoSound.Play();
        }
        catch { /* An unavailable audio device must never interrupt saved study work. */ }
    }
}
