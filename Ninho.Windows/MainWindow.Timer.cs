using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Ninho.Core;
using FocusState = Ninho.Core.FocusState;
namespace Ninho.Windows;
public sealed partial class MainWindow
{
    private StackPanel TimerPage()
    {
        var focus = State.Focus;
        var displayedFocusId = focus.Id;
        var updatingTimerInputs = false;
        previewMinutes = focus.TargetMinutes; previewStopwatch = focus.Stopwatch;
        var pending = focus.Elapsed(DateTimeOffset.Now) > 0 || focus.RunningSince != null;
        var subject = SubjectPicker(focus.SubjectId, true);
        ((ComboBoxItem)subject.Items[0]).Content = "Foco geral, sem matéria";
        subject.IsEnabled = !pending;
        var lesson = new ComboBox { Header = "Aula", IsEnabled = !pending, HorizontalAlignment = HorizontalAlignment.Stretch };
        void FillLessons(string? lessonId)
        {
            lesson.Items.Clear(); lesson.Items.Add(new ComboBoxItem { Content = "Sem aula específica", Tag = "" });
            foreach (var item in State.Lessons.Where(x => x.SubjectId == Choice(subject))) lesson.Items.Add(new ComboBoxItem { Content = item.Title + " · " + State.Courses.FirstOrDefault(c => c.Id == item.CourseId)?.Title, Tag = item.Id });
            lesson.SelectedItem = lesson.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == lessonId) ?? lesson.Items[0];
        }
        FillLessons(focus.LessonId); subject.SelectionChanged += (_, _) => FillLessons(null);
        var duration = new NumberBox { Header = "Duração em minutos", Minimum = 1, Maximum = 240, SmallChange = 5, LargeChange = 15, Value = focus.TargetMinutes, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline, HorizontalAlignment = HorizontalAlignment.Stretch, IsEnabled = !pending };
        var mode = new ComboBox { Header = "Modo", IsEnabled = !pending, HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var option in new[] { ("focus", "Foco"), ("stopwatch", "Cronômetro livre"), ("break", "Pausa") }) mode.Items.Add(new ComboBoxItem { Content = option.Item2, Tag = option.Item1 });
        mode.SelectedItem = mode.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == (focus.IsBreak ? "break" : focus.Stopwatch ? "stopwatch" : "focus"));
        duration.IsEnabled = !pending && !focus.Stopwatch;
        timerText = Text("", 58); timerText.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold; timerText.HorizontalAlignment = HorizontalAlignment.Center;
        timerProgress = new ProgressBar { Minimum = 0, Maximum = 1, Height = 5 };
        var preset = Row();
        foreach (var value in new[] { 15, 25, 45, 60 })
        {
            var button = ActionButton($"{value} min", () => { duration.Value = value; return Task.CompletedTask; }); button.IsEnabled = !pending; preset.Children.Add(button);
        }
        StudySession? previousSession = focus.IsBreak ? State.Sessions.Where(x => x.Kind == "focus" && x.SubjectId == focus.SubjectId && x.LessonId == focus.LessonId).OrderByDescending(x => x.CompletedAt).FirstOrDefault() : null;
        var feedback = new TextBox { Header = previousSession != null ? "Como foi a última sessão?" : "Como está sendo a sessão?", Text = previousSession != null ? sessionFeedbackDrafts.GetValueOrDefault(previousSession.Id, previousSession.Feedback) : feedbackDraft, PlaceholderText = "Ex.: entendi as junções, mas preciso praticar subconsultas.", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MaxLength = 1500, MinHeight = 82 };
        feedback.TextChanged += (_, _) => { if (updatingTimerInputs) return; if (previousSession == null) feedbackDraft = feedback.Text; else sessionFeedbackDrafts[previousSession.Id] = feedback.Text; };
        var feedbackPanel = Column(TitleText("O que você percebeu?"), Body("Seu feedback ajuda a Íris a orientar a próxima sessão."), feedback);
        var saveFeedback = ActionButton("Salvar feedback da última sessão", async () =>
        {
            if (previousSession == null) return;
            var id = previousSession.Id; var value = feedback.Text;
            await Save(s => s.Sessions.First(x => x.Id == id).Feedback = value.Trim(), false);
            if (sessionFeedbackDrafts.GetValueOrDefault(id) == value) sessionFeedbackDrafts.Remove(id);
            ShowNotice("Feedback salvo.", InfoBarSeverity.Success);
        });
        feedbackPanel.Children.Add(saveFeedback);
        Button? start = null;
        start = ActionButton("Começar", async () =>
        {
            var current = State.Focus;
            var hasTime = current.Elapsed(DateTimeOffset.Now) > 0 || current.RunningSince != null;
            if (current.RunningSince != null) { await Save(s => s.Focus.Pause(DateTimeOffset.Now), false); ObserveUsage(false, pause: !current.IsBreak); clock.Stop(); }
            else
            {
                if (!double.IsFinite(duration.Value) || duration.Value != Math.Truncate(duration.Value) || duration.Value < 1 || duration.Value > 240) throw new InvalidDataException("Escolha de 1 a 240 minutos.");
                var subjectId = Choice(subject); var lessonId = Choice(lesson); var minutes = (int)duration.Value; var selectedMode = Choice(mode);
                subject.IsEnabled = lesson.IsEnabled = mode.IsEnabled = duration.IsEnabled = false;
                foreach (var button in preset.Children.OfType<Button>()) button.IsEnabled = false;
                try { await Save(s => { if (!hasTime) { s.Focus.SubjectId = subjectId; s.Focus.LessonId = lessonId; s.Focus.TargetMinutes = minutes; s.Focus.Stopwatch = selectedMode == "stopwatch"; s.Focus.IsBreak = selectedMode == "break"; } s.Focus.RunningSince = DateTimeOffset.Now; }, false); }
                catch { Render(); throw; }
                clock.Start();
            }
            Render();
        }, true);
        var finish = ActionButton("Concluir e salvar", async () =>
        {
            var wasBreak = State.Focus.IsBreak;
            await CompleteFocus(); Render(); clock.Stop(); PlayNinhoSound();
            ShowNotice(wasBreak ? "Pausa concluída. Pronto para o próximo passo?" : "Sessão salva com seu tempo real de estudo.", InfoBarSeverity.Success);
        });
        var reset = ActionButton("Reiniciar", async () =>
        {
            var current = State.Focus;
            if ((current.Elapsed(DateTimeOffset.Now) > 0 || current.RunningSince != null) && !await Confirm("Descartar esta sessão?", "O tempo ainda não salvo será descartado.")) return;
            await Save(s => s.Focus = new FocusState { SubjectId = current.SubjectId, LessonId = current.LessonId, TargetMinutes = current.TargetMinutes, Stopwatch = current.Stopwatch, IsBreak = current.IsBreak }, false);
            feedbackDraft = ""; Render(); clock.Stop();
        });
        var buttons = Row(start, finish, reset);
        mode.SelectionChanged += (_, _) => { if (updatingTimerInputs) return; duration.IsEnabled = !pending && Choice(mode) != "stopwatch"; previewStopwatch = Choice(mode) == "stopwatch"; if (!pending) duration.Value = Choice(mode) == "break" ? State.Settings.BreakMinutes : State.Settings.FocusMinutes; refreshPage?.Invoke(); UpdateClock(); };
        duration.ValueChanged += (_, _) => { if (double.IsFinite(duration.Value)) { previewMinutes = (int)duration.Value; UpdateClock(); } };
        var dial = new Grid { Height = 290, Margin = new Thickness(0, 8, 0, 14) };
        dial.Children.Add(new Microsoft.UI.Xaml.Shapes.Ellipse { Width = 280, Height = 280, Stroke = ColorBrush("#DDE7DA"), StrokeThickness = 7, Opacity = .55 });
        timerRing = new ProgressRing { Width = 280, Height = 280, IsIndeterminate = false, Minimum = 0, Maximum = 1, Value = 0, Foreground = ColorBrush("#80B9A0") };
        dial.Children.Add(timerRing);
        var encouragement = Caption("Uma coisa por vez.");
        var face = Column(timerText, encouragement); face.Spacing = 5; face.HorizontalAlignment = HorizontalAlignment.Center; face.VerticalAlignment = VerticalAlignment.Center; dial.Children.Add(face);
        var settings = Column(TitleText("Prepare seu momento"), mode, subject, lesson, duration, preset); settings.Spacing = 16;
        var focusSurface = Column(dial, buttons, timerProgress); focusSurface.Spacing = 18;
        var columns = new AdaptiveColumns { MaximumColumns = 2, MinimumColumnWidth = 310, Gap = 22 }; columns.Children.Add(Card(focusSurface)); columns.Children.Add(Card(settings));
        var intro = Row(Owl(58), Column(Heading("Um tempo só para estudar"), Body("Sem pressa. Sem distrações. Um minuto de cada vez.")));
        void RefreshTimer()
        {
            var current = State.Focus;
            pending = current.Elapsed(DateTimeOffset.Now) > 0 || current.RunningSince != null;
            if (displayedFocusId != current.Id)
            {
                updatingTimerInputs = true;
                displayedFocusId = current.Id;
                mode.SelectedItem = mode.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == (current.IsBreak ? "break" : current.Stopwatch ? "stopwatch" : "focus"));
                duration.Value = current.TargetMinutes;
                previewMinutes = current.TargetMinutes; previewStopwatch = current.Stopwatch;
                previousSession = current.IsBreak ? State.Sessions.Where(x => x.Kind == "focus" && x.SubjectId == current.SubjectId && x.LessonId == current.LessonId).OrderByDescending(x => x.CompletedAt).FirstOrDefault() : null;
                feedback.Header = previousSession != null ? "Como foi a última sessão?" : "Como está sendo a sessão?";
                feedback.Text = previousSession == null ? feedbackDraft : sessionFeedbackDrafts.GetValueOrDefault(previousSession.Id, previousSession.Feedback);
                updatingTimerInputs = false;
            }
            if (pending)
            {
                updatingTimerInputs = true;
                subject.SelectedItem = subject.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == current.SubjectId) ?? subject.Items[0];
                if (Choice(lesson) != current.LessonId) FillLessons(current.LessonId);
                mode.SelectedItem = mode.Items.OfType<ComboBoxItem>().First(x => x.Tag?.ToString() == (current.IsBreak ? "break" : current.Stopwatch ? "stopwatch" : "focus"));
                duration.Value = current.TargetMinutes;
                updatingTimerInputs = false;
            }
            subject.IsEnabled = lesson.IsEnabled = mode.IsEnabled = !pending;
            duration.IsEnabled = !pending && Choice(mode) != "stopwatch";
            foreach (var button in preset.Children.OfType<Button>()) button.IsEnabled = !pending && Choice(mode) != "stopwatch";
            start.Content = current.RunningSince != null ? "Pausar" : pending ? "Continuar" : "Começar";
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(start, start.Content.ToString());
            finish.IsEnabled = current.RunningSince != null || current.Elapsed(DateTimeOffset.Now) >= 1;
            encouragement.Text = current.RunningSince != null ? "Este momento é seu." : pending ? "Uma pausa também faz parte." : "Uma coisa por vez.";
            saveFeedback.Visibility = previousSession == null ? Visibility.Collapsed : Visibility.Visible;
            UpdateClock();
        }
        refreshPage = RefreshTimer;
        RefreshTimer();
        return Column(intro, columns, Card(feedbackPanel), Caption("Ao zerar, o foco é salvo e uma pausa fica pronta. A contagem é recuperada ao reabrir o aplicativo; Pausar interrompe o tempo."));
    }
}
