using System.Globalization;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Shapes;
using Path = System.IO.Path;
using Ninho.Core;
using Windows.Storage;
using Windows.Media.Core;
using Windows.Foundation;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private sealed record MaterialViewState(string Query, string Format, string Subject, int Shown);
    private readonly Dictionary<string, MaterialViewState> materialViews = [];
    private StackPanel MaterialsPage() => MaterialCollection(null, null);
    private static string MaterialSize(long size) => size < 1024 * 1024 ? $"{Math.Max(1, Math.Round(size / 1024d))} KB" : $"{size / 1024d / 1024d:0.0} MB";
    private static string MaterialType(Material material) => (material.Type.Length > 0 ? material.Type : Path.GetExtension(material.StoredName)).TrimStart('.').ToLowerInvariant();
    private static bool MaterialFormatMatches(Material material, string filter)
    {
        var type = MaterialType(material);
        return filter switch
        {
            "all" => true,
            "image" => type is "png" or "jpg" or "jpeg" or "webp" or "gif" or "bmp",
            "video" => type is "mp4" or "webm" or "mov" or "mkv",
            "audio" => type is "mp3" or "wav" or "ogg" or "m4a" or "aac" or "flac",
            "docx" => type is "doc" or "docx",
            "pptx" => type is "ppt" or "pptx",
            "xlsx" => type is "xls" or "xlsx",
            _ => type == filter
        };
    }
    private string MaterialLessonLabel(string lessonId)
    {
        var lesson = State.Lessons.FirstOrDefault(x => x.Id == lessonId);
        return lesson == null ? "" : lesson.Title + " · " + (State.Courses.FirstOrDefault(x => x.Id == lesson.CourseId)?.Title ?? "Módulo sem nome");
    }
    private Button MaterialPlainButton(string label, string? icon, Func<Task> action)
    {
        var button = icon == null ? ActionButton(label, action) : OriginalActionButton(label, icon, action);
        button.Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"];
        button.Padding = new Thickness(0); button.MinWidth = 0; button.MinHeight = 0; button.BorderThickness = new Thickness(0); button.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        return button;
    }
    private StackPanel MaterialCollection(string? subjectId, string? lessonId)
    {
        var scopedLesson = lessonId == null ? null : State.Lessons.FirstOrDefault(x => x.Id == lessonId);
        var scopedSubject = subjectId ?? scopedLesson?.SubjectId;
        var scopeAvailable = lessonId == null || scopedLesson != null && scopedLesson.SubjectId == scopedSubject;
        var embedded = subjectId != null;
        var scopeKey = lessonId != null ? "lesson:" + lessonId : subjectId != null ? "subject:" + subjectId : "library";
        var remembered = materialViews.GetValueOrDefault(scopeKey);
        var subject = SubjectPicker(scopedSubject ?? remembered?.Subject ?? "", true);
        subject.Header = DashboardText("Filtrar matéria", 9, DashboardInk); subject.MinWidth = 180; subject.MaxWidth = 250; subject.FontSize = 12; subject.Margin = new Thickness(0, -13, 0, 0);
        subject.Padding = new Thickness(11); subject.CornerRadius = new CornerRadius(10);
        foreach (var option in subject.Items.OfType<ComboBoxItem>().Skip(1))
        {
            var item = State.Subjects.First(x => x.Id == option.Tag?.ToString());
            option.Content = item.Name + " · " + (State.Programs.FirstOrDefault(x => x.Id == item.ProgramId)?.Name ?? "Outros estudos");
        }
        subject.Visibility = embedded || lessonId != null ? Visibility.Collapsed : Visibility.Visible;
        AutomationProperties.SetName(subject, "Filtrar matéria");
        var search = new TextBox { PlaceholderText = "Buscar material…", Text = remembered?.Query ?? "", FontSize = 12, MinWidth = 160, Padding = new Thickness(41, 12, 35, 12), CornerRadius = new CornerRadius(10), Background = DashboardSurface, BorderBrush = DashboardLine, BorderThickness = new Thickness(1) };
        var searchBox = new Grid { MaxWidth = 390, MinWidth = 160 };
        search.HorizontalAlignment = HorizontalAlignment.Stretch; search.Width = double.NaN; searchBox.Children.Add(search);
        var searchIcon = OriginalIcon.Create("search", 17, ColorBrush("#91A093")); searchIcon.HorizontalAlignment = HorizontalAlignment.Left; searchIcon.Margin = new Thickness(14, 0, 0, 0); searchIcon.IsHitTestVisible = false; searchBox.Children.Add(searchIcon);
        var clearSearch = MaterialPlainButton("Limpar busca", "x", () => { search.Text = ""; return Task.CompletedTask; });
        clearSearch.Content = OriginalIcon.Create("x", 15, DashboardMuted); clearSearch.Width = 25; clearSearch.Height = 25; clearSearch.HorizontalAlignment = HorizontalAlignment.Right; clearSearch.Margin = new Thickness(0, 0, 8, 0); searchBox.Children.Add(clearSearch);
        AutomationProperties.SetName(search, "Buscar material");
        var format = new ComboBox { MinWidth = 165, MaxWidth = 210, FontSize = 13, Padding = new Thickness(13, 11, 13, 11), CornerRadius = new CornerRadius(10) };
        foreach (var option in new[] { ("all", "Todos os formatos"), ("pdf", "PDF"), ("image", "Imagens"), ("txt", "Texto"), ("md", "Markdown"), ("docx", "Word"), ("pptx", "PowerPoint"), ("xlsx", "Excel"), ("video", "Vídeos"), ("audio", "Áudios") }) format.Items.Add(new ComboBoxItem { Tag = option.Item1, Content = option.Item2 });
        format.SelectedItem = format.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == remembered?.Format) ?? format.Items[0]; AutomationProperties.SetName(format, "Tipo de arquivo");
        var importing = false;
        Button? addFiles = null, upload = null;
        async Task Import()
        {
            if (importing || !scopeAvailable) return;
            importing = true; if (addFiles != null) addFiles.IsEnabled = false; if (upload != null) upload.IsEnabled = false;
            try { await ImportMaterials(scopedSubject ?? Choice(subject), lessonId); }
            finally { importing = false; if (addFiles != null) addFiles.IsEnabled = scopeAvailable; if (upload != null) upload.IsEnabled = scopeAvailable; }
        }
        addFiles = OriginalActionButton(lessonId != null ? "Adicionar arquivos à aula" : "Adicionar arquivos", "plus", Import, true); addFiles.IsEnabled = scopeAvailable;
        var title = DashboardText(lessonId != null ? "Materiais desta aula" : embedded ? "Materiais desta matéria" : "Tudo que ajuda a aprender.", lessonId != null ? 22 : embedded ? 21 : 32, display: !embedded && lessonId == null);
        title.FontWeight = lessonId != null || embedded ? FontWeights.SemiBold : FontWeights.Medium; title.LineHeight = lessonId != null || embedded ? title.FontSize * 1.55 : 38.4; title.CharacterSpacing = lessonId != null || embedded ? -24 : -31;
        var description = DashboardText(lessonId != null ? "Seus PDFs, resumos e arquivos ficam juntos da aula em que você estuda." : embedded ? "As leituras, anotações e arquivos para continuar aprendendo." : "Sua biblioteca completa. Cada matéria também tem seus próprios materiais.", 14, DashboardMuted); description.LineHeight = 22.4;
        var headingCopy = Column(title, description); headingCopy.Spacing = 8;
        var heading = new Grid { ColumnSpacing = 22 };
        heading.ColumnDefinitions.Add(new ColumnDefinition()); heading.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        heading.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); heading.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        headingCopy.VerticalAlignment = addFiles.VerticalAlignment = lessonId != null ? VerticalAlignment.Top : VerticalAlignment.Center;
        heading.Children.Add(headingCopy); Grid.SetColumn(addFiles, 1); heading.Children.Add(addFiles);
        heading.SizeChanged += (_, e) => { var wrap = e.NewSize.Width < (lessonId != null ? 650 : 600); Grid.SetColumn(addFiles, wrap ? 0 : 1); Grid.SetRow(addFiles, wrap ? 1 : 0); heading.RowSpacing = wrap ? 14 : 0; heading.ColumnDefinitions[1].Width = wrap ? new GridLength(0) : GridLength.Auto; };
        var results = Column(); results.Spacing = 20;
        var toolbar = new MaterialToolbar(); toolbar.Children.Add(searchBox); toolbar.Children.Add(format); toolbar.Children.Add(subject);
        heading.Margin = new Thickness(0, 0, 0, lessonId != null ? 18 : embedded ? 22 : 27);
        toolbar.Margin = new Thickness(0, 0, 0, 23);
        var page = Column(heading, toolbar, results); page.Spacing = 0;
        var shown = Math.Clamp(remembered?.Shown ?? 60, 60, 10000);
        void Fill()
        {
            results.Children.Clear();
            var activeSubject = scopedSubject ?? Choice(subject);
            materialViews[scopeKey] = new MaterialViewState(search.Text, Choice(format), Choice(subject), shown);
            var scoped = State.Materials.Where(x => scopeAvailable && (activeSubject.Length == 0 || x.SubjectId == activeSubject) && (lessonId == null || x.LessonId == lessonId)).ToArray();
            var filtered = scoped.Where(x => ContainsText(x.Name + " " + x.Notes, search.Text) && MaterialFormatMatches(x, Choice(format))).ToArray();
            clearSearch.Visibility = search.Text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
            if (!scopeAvailable)
            {
                results.Children.Add(MaterialEmpty("Esta aula não está disponível.", "Volte aos estudos e abra uma aula existente para organizar seus materiais.", "folder-open")); return;
            }
            if (scoped.Length == 0 && string.IsNullOrWhiteSpace(search.Text))
            {
                var art = new Grid { Width = 65, Height = 55, Margin = new Thickness(0, 0, 0, lessonId != null ? 14 : 28), HorizontalAlignment = HorizontalAlignment.Center };
                art.Children.Add(OriginalIcon.Create("folder-open", 55, ColorBrush("#8EAA7C")));
                var plus = new Border { Width = 26, Height = 26, CornerRadius = new CornerRadius(13), Background = ColorBrush("#E8F0DF"), Child = OriginalIcon.Create("plus", 20, ColorBrush("#8EAA7C")), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -5, -10, 0) }; art.Children.Add(plus);
                var emptyTitle = DashboardText(lessonId != null ? "Nenhum material nesta aula ainda." : "Seu próximo conhecimento começa aqui.", lessonId != null ? 22 : 27, display: true); emptyTitle.TextAlignment = TextAlignment.Center; emptyTitle.Margin = new Thickness(0, 0, 0, 10);
                var emptyDescription = DashboardText(lessonId != null ? "Escolha arquivos no computador para estudar com eles nesta aula." : "Escolha arquivos no computador para montar sua biblioteca.", 14, DashboardMuted); emptyDescription.LineHeight = 22.4; emptyDescription.TextAlignment = TextAlignment.Center;
                var chooseText = DashboardText("Escolher arquivos", 12, DashboardSurface); chooseText.FontWeight = FontWeights.SemiBold;
                var chooseLabel = DashboardRow(chooseText, OriginalIcon.Create("arrow-up-right", 17, DashboardSurface));
                var choose = new Border { Child = chooseLabel, Background = DashboardGreen, CornerRadius = new CornerRadius(10), Padding = new Thickness(17, 11, 17, 11), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 25, 0, 0) };
                var limits = DashboardText("PDF, imagens, textos, Office, vídeos e áudios · até 2 GB por arquivo.", 14, DashboardMuted); limits.LineHeight = 22.4; limits.TextAlignment = TextAlignment.Center; limits.Margin = new Thickness(0, 25, 0, 0);
                var content = Column(art, emptyTitle, emptyDescription, choose, limits); content.Spacing = 0; content.VerticalAlignment = VerticalAlignment.Center; content.IsHitTestVisible = false;
                upload = ActionButton("Escolher arquivos", Import); upload.Content = content; upload.Padding = new Thickness(lessonId != null ? 24 : 35); upload.HorizontalContentAlignment = HorizontalAlignment.Stretch; upload.HorizontalAlignment = HorizontalAlignment.Stretch; upload.VerticalContentAlignment = VerticalAlignment.Center; upload.Background = DashboardSurface; upload.MinHeight = 350; upload.BorderThickness = new Thickness(0); upload.CornerRadius = new CornerRadius(18);
                var zone = new Grid(); zone.Children.Add(upload);
                var outline = new Rectangle { Stroke = ColorBrush("#BDCCBA"), StrokeThickness = 1.5, StrokeDashArray = new DoubleCollection { 5, 4 }, RadiusX = 18, RadiusY = 18, IsHitTestVisible = false }; zone.Children.Add(outline); results.Children.Add(zone); return;
            }
            var grid = new AdaptiveColumns { MaximumColumns = 3, MinimumColumnWidth = 220, Gap = lessonId != null ? 16 : 20 };
            if (filtered.Length == 0)
            {
                grid.Children.Add(MaterialEmpty("Nada encontrado.", lessonId != null ? "Tente outro nome ou formato entre os arquivos desta aula." : "Tente outro nome, formato ou matéria.", "search"));
                results.Children.Add(grid); return;
            }
            foreach (var material in filtered.Take(shown)) grid.Children.Add(MaterialCard(material, lessonId != null));
            results.Children.Add(grid);
            if (filtered.Length > shown)
            {
                var nextPage = OriginalActionButton($"Mostrar mais materiais ({shown} de {filtered.Length})", "plus", () => { shown += 60; Fill(); return Task.CompletedTask; }); results.Children.Add(nextPage);
            }
        }
        search.TextChanged += (_, _) => { shown = 60; Fill(); }; subject.SelectionChanged += (_, _) => { shown = 60; Fill(); }; format.SelectionChanged += (_, _) => { shown = 60; Fill(); };
        var note = new Grid { ColumnSpacing = 9, Margin = new Thickness(0, 20, 0, 0) };
        note.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); note.ColumnDefinitions.Add(new ColumnDefinition());
        var folder = OriginalIcon.Create("folder-open", 17, DashboardMuted); folder.VerticalAlignment = VerticalAlignment.Top; folder.Margin = new Thickness(0, 3, 0, 0); note.Children.Add(folder);
        var help = DashboardText(lessonId != null ? "Os arquivos adicionados aqui ficam vinculados a esta aula. Para usar um arquivo já importado, abra-o nos materiais da matéria e escolha esta aula." : "Os arquivos importados ganham uma cópia dentro do Ninho. Os originais ficam onde estão. PDFs do Estratégia com nome de curso e aula reconhecidos são organizados automaticamente.", 14, DashboardMuted); help.LineHeight = 22.4; Grid.SetColumn(help, 1); note.Children.Add(help); page.Children.Add(note);
        Fill(); return page;
    }
    private UIElement MaterialEmpty(string title, string description, string icon)
    {
        var graphic = OriginalIcon.Create(icon, icon == "search" ? 26 : 28, ColorBrush("#9EB094")); graphic.Margin = new Thickness(0, 0, 0, 17);
        var heading = DashboardText(title, 21, display: true); heading.LineHeight = 29.4; heading.TextAlignment = TextAlignment.Center;
        var body = DashboardText(description, 12, DashboardMuted); body.LineHeight = 19.8; body.TextAlignment = TextAlignment.Center; body.Margin = new Thickness(0, 10, 0, 18);
        var content = Column(graphic, heading, body); content.HorizontalAlignment = HorizontalAlignment.Center; content.Spacing = 0;
        return new Border { Child = content, Padding = new Thickness(24, 35, 24, 35), MaxWidth = 470, HorizontalAlignment = HorizontalAlignment.Center };
    }
    private sealed class MaterialToolbar : Panel
    {
        private readonly List<(UIElement Element, Rect Bounds)> layout = [];
        private Size ArrangeControls(double width)
        {
            layout.Clear();
            var children = Children.Where(x => x.Visibility == Visibility.Visible).ToArray();
            if (children.Length == 0) return new Size(width, 0);
            var sizes = new Size[children.Length];
            for (var index = 1; index < children.Length; index++)
            {
                children[index].Measure(new Size(Math.Min(width, index == 1 ? 210 : 250), double.PositiveInfinity));
                sizes[index] = children[index].DesiredSize;
            }
            var fixedWidth = sizes.Skip(1).Sum(x => x.Width);
            var inline = width >= 160 + fixedWidth + 13 * (children.Length - 1);
            var searchWidth = inline ? Math.Min(390, width - fixedWidth - 13 * (children.Length - 1)) : Math.Min(width, 390);
            children[0].Measure(new Size(searchWidth, double.PositiveInfinity));
            sizes[0] = new Size(searchWidth, children[0].DesiredSize.Height);
            if (inline)
            {
                var height = sizes.Max(x => x.Height);
                double x = 0;
                for (var index = 0; index < children.Length; index++)
                {
                    if (index == 2) x = width - sizes[index].Width;
                    layout.Add((children[index], new Rect(x, (height - sizes[index].Height) / 2, sizes[index].Width, sizes[index].Height)));
                    x += sizes[index].Width + 13;
                }
                return new Size(width, height);
            }
            double nextX = 0, nextY = 0, rowHeight = 0;
            for (var index = 0; index < children.Length; index++)
            {
                if (nextX > 0 && nextX + sizes[index].Width > width) { nextY += rowHeight + 10; nextX = 0; rowHeight = 0; }
                layout.Add((children[index], new Rect(nextX, nextY, sizes[index].Width, sizes[index].Height)));
                nextX += sizes[index].Width + 10; rowHeight = Math.Max(rowHeight, sizes[index].Height);
            }
            return new Size(width, nextY + rowHeight);
        }
        protected override Size MeasureOverride(Size availableSize) => ArrangeControls(double.IsFinite(availableSize.Width) ? availableSize.Width : 900);
        protected override Size ArrangeOverride(Size finalSize)
        {
            ArrangeControls(finalSize.Width);
            foreach (var item in layout) item.Element.Arrange(item.Bounds);
            return finalSize;
        }
    }
    private UIElement MaterialCard(Material material, bool lessonScoped)
    {
        var type = MaterialType(material); var image = MaterialFormatMatches(material, "image");
        var foreground = ColorBrush(type == "pdf" ? "#B88973" : "#91A67A");
        var label = DashboardText(type.ToUpperInvariant(), 8, foreground); label.FontWeight = FontWeights.Bold; label.CharacterSpacing = 188; label.HorizontalAlignment = HorizontalAlignment.Center;
        var picture = Column(OriginalIcon.Create(image ? "image" : "file-text", 42, foreground), label); picture.Spacing = 9; picture.HorizontalAlignment = HorizontalAlignment.Center;
        picture.VerticalAlignment = VerticalAlignment.Center;
        var thumbnail = new Border { Child = picture, Height = lessonScoped ? 105 : 139, CornerRadius = new CornerRadius(10), Background = ColorBrush(type == "pdf" ? "#F8EEE6" : "#F1F3E9") };
        var name = DashboardText(material.Name, 14); name.FontWeight = FontWeights.SemiBold; name.LineHeight = 22.4; name.Margin = new Thickness(0, 17, 0, 8);
        var subject = State.Subjects.FirstOrDefault(x => x.Id == material.SubjectId)?.Name ?? "Sem matéria";
        var detail = DashboardText(subject + (material.LessonId.Length > 0 ? " · " + MaterialLessonLabel(material.LessonId) : ""), 14, DashboardMuted);
        detail.LineHeight = 22.4;
        var footer = new Grid { ColumnSpacing = 10, Margin = new Thickness(0, 16, 0, 0), BorderBrush = DashboardLine, BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 9, 0, 0) };
        footer.ColumnDefinitions.Add(new ColumnDefinition()); footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var information = DashboardText(MaterialSize(material.Size) + " · " + material.CreatedAt.LocalDateTime.ToString("d 'de' MMM", CultureInfo.GetCultureInfo("pt-BR")), 14, DashboardMuted); information.LineHeight = 22.4; information.VerticalAlignment = VerticalAlignment.Center; footer.Children.Add(information);
        var removeSpace = new Border { Width = 33, Height = 33 }; Grid.SetColumn(removeSpace, 1); footer.Children.Add(removeSpace);
        var content = Column(thumbnail, name, detail); content.Spacing = 0; content.Margin = new Thickness(16, 16, 16, 0);
        content.IsHitTestVisible = footer.IsHitTestVisible = false;
        var open = MaterialPlainButton($"Abrir {material.Name}", null, () => PreviewMaterial(material));
        open.Content = null; open.Padding = new Thickness(0); open.CornerRadius = new CornerRadius(16); open.BorderThickness = new Thickness(1); open.BorderBrush = DashboardLine;
        open.HorizontalAlignment = HorizontalAlignment.Stretch; open.VerticalAlignment = VerticalAlignment.Stretch; open.HorizontalContentAlignment = HorizontalAlignment.Stretch; open.VerticalContentAlignment = VerticalAlignment.Top;
        var menu = new MenuFlyout(); var rename = new MenuFlyoutItem { Text = "Renomear material" }; rename.Click += async (_, _) => await Run(() => RenameMaterial(material)); menu.Items.Add(rename); open.ContextFlyout = menu;
        footer.Margin = new Thickness(16, 16, 16, 16);
        var remove = MaterialPlainButton($"Remover {material.Name}", "trash-2", () => RemoveMaterial(material)); remove.Content = OriginalIcon.Create("trash-2", 16, DashboardMuted); remove.Width = 33; remove.Height = 33; remove.CornerRadius = new CornerRadius(8); remove.HorizontalAlignment = HorizontalAlignment.Right; remove.VerticalAlignment = VerticalAlignment.Top; remove.Margin = new Thickness(0, 26, 16, 16);
        var card = new Grid { Background = DashboardSurface, CornerRadius = new CornerRadius(16) };
        card.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); card.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        card.Children.Add(content); Grid.SetRow(footer, 1); card.Children.Add(footer); Grid.SetRowSpan(open, 2); card.Children.Add(open); Grid.SetRow(remove, 1); card.Children.Add(remove); return card;
    }
    private async Task RenameMaterial(Material material)
    {
        var name = new TextBox { Header = "Nome", Text = material.Name, MaxLength = 500 };
        await FormDialog("Renomear material", name, async () =>
        {
            if (string.IsNullOrWhiteSpace(name.Text)) throw new InvalidDataException("Informe o nome do material.");
            await Save(s => s.Materials.First(x => x.Id == material.Id).Name = name.Text.Trim());
        });
    }
    private async Task RemoveMaterial(Material material)
    {
        if (!await Confirm("Remover da biblioteca?", "O material deixará de aparecer na biblioteca. O arquivo original do seu computador não será alterado.")) return;
        await Save(s => s.Materials.RemoveAll(x => x.Id == material.Id));
        ShowNotice("Material removido da biblioteca.", InfoBarSeverity.Success);
    }
    private async Task PreviewMaterial(Material material)
    {
        var path = store.MaterialPath(material.StoredName);
        var subject = SubjectPicker(material.SubjectId, true); subject.MinWidth = 0;
        subject.Header = null; ((ComboBoxItem)subject.Items[0]).Content = "Geral";
        foreach (var option in subject.Items.OfType<ComboBoxItem>().Skip(1))
        {
            var item = State.Subjects.First(x => x.Id == option.Tag?.ToString());
            option.Content = item.Name + " · " + (State.Programs.FirstOrDefault(x => x.Id == item.ProgramId)?.Name ?? "Outros estudos");
        }
        var lesson = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var field in new[] { subject, lesson }) { field.FontSize = 14; field.Padding = new Thickness(13, 11, 13, 11); field.CornerRadius = new CornerRadius(10); field.Background = ColorBrush(DashboardDark ? "#2B2E35" : "#F8F9F5"); field.BorderBrush = DashboardLine; }
        var lessonHelp = DashboardText("", 14, DashboardMuted); lessonHelp.LineHeight = 22.4;
        void FillLessons(string? id)
        {
            lesson.Items.Clear(); lesson.Items.Add(new ComboBoxItem { Content = "Sem aula específica", Tag = "" });
            foreach (var item in State.Lessons.Where(x => x.SubjectId == Choice(subject))) lesson.Items.Add(new ComboBoxItem { Content = MaterialLessonLabel(item.Id), Tag = item.Id });
            lesson.SelectedItem = lesson.Items.OfType<ComboBoxItem>().FirstOrDefault(x => x.Tag?.ToString() == id) ?? lesson.Items[0];
            lesson.IsEnabled = Choice(subject).Length > 0;
            lessonHelp.Text = lesson.IsEnabled ? "Escolha a aula ou deixe o arquivo disponível apenas na matéria." : "Escolha uma matéria para vincular o arquivo a uma aula.";
        }
        FillLessons(material.LessonId); subject.SelectionChanged += (_, _) => FillLessons(null);
        var notes = new TextBox { Text = material.Notes, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 204, FontSize = 14, CornerRadius = new CornerRadius(10), Padding = new Thickness(13, 11, 13, 11), Background = ColorBrush(DashboardDark ? "#2B2E35" : "#F8F9F5"), BorderBrush = DashboardLine, MaxLength = Math.Max(20000, material.Notes.Length), PlaceholderText = "Trechos importantes, dúvidas, páginas para voltar…" };
        AutomationProperties.SetName(subject, "Matéria"); AutomationProperties.SetName(lesson, "Aula do material"); AutomationProperties.SetName(notes, "Anotações do material");
        var validation = new InfoBar { Severity = InfoBarSeverity.Error, IsOpen = false };
        var preview = new ContentControl { HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Center, MinHeight = 480 };
        StackPanel Field(string title, params UIElement[] controls)
        {
            var label = DashboardText(title, 14); label.FontWeight = FontWeights.Medium; label.LineHeight = 22.4;
            var field = Column(label); field.Spacing = 8; foreach (var control in controls) field.Children.Add(control); return field;
        }
        var fields = Column(Field("Matéria", subject), Field("Aula do material", lesson, lessonHelp), Field("Anotações do material", notes)); fields.Spacing = 17;
        var metadata = Column(fields); metadata.Spacing = 0;
        // The outer preview owns the Run guard while the dialog is open, so dialog actions handle errors locally.
        var save = new Button { Content = "Salvar material", Style = (Style)Application.Current.Resources["AccentButtonStyle"], HorizontalAlignment = HorizontalAlignment.Stretch, Margin = new Thickness(0, 13, 0, 0) };
        AutomationProperties.SetName(save, "Salvar material"); metadata.Children.Add(save);
        var open = new Button { Content = DashboardRow(DashboardText("Abrir no Windows", 12), OriginalIcon.Create("arrow-up-right", 16, DashboardInk)), HorizontalAlignment = HorizontalAlignment.Stretch };
        open.Margin = new Thickness(0, 13, 0, 0); open.MinHeight = 42;
        AutomationProperties.SetName(open, "Abrir no Windows");
        open.Click += async (_, _) =>
        {
            try
            {
                var file = await StorageFile.GetFileFromPathAsync(path);
                if (!await global::Windows.System.Launcher.LaunchFileAsync(file)) throw new IOException("O Windows não encontrou um aplicativo para abrir este arquivo.");
            }
            catch (Exception error) { validation.Severity = InfoBarSeverity.Error; validation.Message = error.Message; validation.IsOpen = true; }
        };
        metadata.Children.Add(open);
        var layout = new Grid { ColumnSpacing = 24 };
        layout.ColumnDefinitions.Add(new ColumnDefinition()); layout.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(300) });
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var previewFrame = new Border { Child = preview, Background = ColorBrush(DashboardDark ? "#2B2E35" : "#F8F9F5"), BorderBrush = DashboardLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), VerticalAlignment = VerticalAlignment.Stretch };
        layout.Children.Add(previewFrame); Grid.SetColumn(metadata, 1); layout.Children.Add(metadata);
        layout.SizeChanged += (_, e) => { var wrap = e.NewSize.Width < 640; layout.ColumnDefinitions[1].Width = new GridLength(wrap ? 0 : 300); layout.RowSpacing = wrap ? 20 : 0; Grid.SetColumn(metadata, wrap ? 0 : 1); Grid.SetRow(metadata, wrap ? 1 : 0); };
        var title = DashboardText(material.Name, 24, display: true); title.LineHeight = 37.2;
        var detail = DashboardText(MaterialType(material).ToUpperInvariant() + " · " + MaterialSize(material.Size), 11, DashboardMuted); detail.Margin = new Thickness(0, 7, 0, 0);
        var headingText = Column(title, detail); headingText.Spacing = 0;
        var heading = new Grid { ColumnSpacing = 15 }; heading.ColumnDefinitions.Add(new ColumnDefinition()); heading.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); heading.Children.Add(headingText);
        var close = new Button { Style = (Style)Application.Current.Resources["NinhoPlainButtonStyle"], Content = OriginalIcon.Create("x", 18, DashboardMuted), Width = 33, Height = 33, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -5, -5, 0) };
        AutomationProperties.SetName(close, "Fechar prévia"); Grid.SetColumn(close, 1); heading.Children.Add(close);
        var content = Column(validation, layout); content.Spacing = 0;
        var dialogWidth = Math.Clamp(Root.ActualWidth - 56, 350, 1080);
        heading.Width = dialogWidth - 58;
        var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, RequestedTheme = Root.ActualTheme, Title = heading, Content = new ScrollViewer { Content = content, MaxHeight = Math.Clamp(Root.ActualHeight - 210, 240, 900), HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled }, CornerRadius = new CornerRadius(20), Background = DashboardSurface, BorderBrush = DashboardLine };
        ObserveInteractions(dialog);
        StyleNinhoDialog(dialog, 1080);
        AutomationProperties.SetName(dialog, material.Name);
        dialog.Resources["ContentDialogMaxWidth"] = 1080d;
        dialog.Resources["ContentDialogMinWidth"] = dialogWidth;
        dialog.Resources["ContentDialogMaxHeight"] = Math.Max(350, Root.ActualHeight - 56);
        dialog.Resources["ContentDialogPadding"] = new Thickness(28);
        dialog.Resources["ContentDialogTitleMargin"] = new Thickness(0, 0, 0, 25);
        dialog.Resources["ContentDialogTopOverlay"] = DashboardSurface;
        close.Click += (_, _) => dialog.Hide();
        MediaPlayerElement? player = null;
        var closed = false; var loading = false; var saved = false; var saving = false;
        dialog.Closing += (_, args) => { if (saving) args.Cancel = true; };
        using var cancellation = new CancellationTokenSource();
        async Task PreparePreview()
        {
            if (closed || loading) return;
            loading = true; player?.MediaPlayer?.Dispose(); player = null;
            preview.Content = Column(new ProgressRing { IsActive = true, Width = 28, Height = 28 }, Caption("Preparando prévia…"));
            try
            {
                if (!File.Exists(path)) throw new FileNotFoundException("Este anexo não está disponível. Importe novamente o arquivo original. Você ainda pode organizar ou remover este registro.");
                var file = await StorageFile.GetFileFromPathAsync(path);
                if (closed) return;
                var extension = Path.GetExtension(path).ToLowerInvariant();
                UIElement result;
                if (extension == ".pdf") result = await CreatePdfPreview(file);
                else if (extension is ".png" or ".jpg" or ".jpeg" or ".gif" or ".bmp" or ".webp")
                {
                    var bitmap = new BitmapImage { DecodePixelWidth = 1200 }; using var stream = await file.OpenReadAsync(); await bitmap.SetSourceAsync(stream);
                    result = new Image { Source = bitmap, MaxHeight = 520, Stretch = Stretch.Uniform };
                }
                else if (extension is ".txt" or ".md")
                {
                    using var reader = File.OpenText(path); var buffer = new char[100000]; var read = await reader.ReadBlockAsync(buffer.AsMemory(), cancellation.Token);
                    var text = DashboardText(new string(buffer, 0, read), 12); text.LineHeight = 20.4; text.IsTextSelectionEnabled = true; text.Margin = new Thickness(22);
                    var document = Column(new ScrollViewer { Content = text, Height = 520 });
                    if (read == buffer.Length) document.Children.Add(Caption("Prévia limitada a 100 mil caracteres. Abra o arquivo para ler tudo."));
                    result = document;
                }
                else if (extension is ".mp4" or ".mp3" or ".wav" or ".webm" or ".mov" or ".mkv" or ".ogg" or ".m4a" or ".aac" or ".flac")
                {
                    if (closed) return;
                    player = new MediaPlayerElement { Source = MediaSource.CreateFromStorageFile(file), AreTransportControlsEnabled = true, AutoPlay = false, Height = extension is ".mp4" or ".webm" or ".mov" or ".mkv" ? 350 : 100 };
                    if (player.MediaPlayer != null) player.MediaPlayer.MediaFailed += (_, _) => DispatcherQueue.TryEnqueue(() => { if (!closed) { validation.Severity = InfoBarSeverity.Warning; validation.Message = "Não foi possível reproduzir este formato aqui. Use Abrir no Windows para escolher outro aplicativo."; validation.IsOpen = true; } });
                    result = player;
                }
                else result = MaterialEmpty("Abra com seu aplicativo favorito.", "Este formato é aberto pelo programa padrão do Windows.", "file");
                if (!closed) preview.Content = result;
            }
            catch (OperationCanceledException) { }
            catch (Exception error)
            {
                if (closed) return;
                var retry = new Button { Content = DashboardRow(OriginalIcon.Create("file", 17, DashboardInk), DashboardText("Tentar prévia novamente", 12)) };
                retry.Click += async (_, _) => await PreparePreview();
                preview.Content = Column(MaterialEmpty("Não foi possível abrir a prévia.", error.Message, "file"), retry);
            }
            finally { loading = false; }
        }
        dialog.Opened += async (_, _) => await PreparePreview();
        save.Click += async (_, _) =>
        {
            if (saving || closed) return;
            saving = true; save.Content = "Salvando…"; save.IsEnabled = close.IsEnabled = subject.IsEnabled = lesson.IsEnabled = notes.IsEnabled = false;
            try
            {
                var materialNotes = notes.Text; var lessonId = Choice(lesson); var subjectId = Choice(subject);
                await Save(s => { var current = s.Materials.First(x => x.Id == material.Id); current.Notes = materialNotes; current.LessonId = lessonId; current.SubjectId = subjectId; }, false);
                saved = true; validation.Severity = InfoBarSeverity.Success; validation.Message = "Material atualizado."; validation.IsOpen = true;
            }
            catch (Exception error) { validation.Severity = InfoBarSeverity.Error; validation.Message = error.Message; validation.IsOpen = true; }
            finally { saving = false; save.Content = "Salvar material"; save.IsEnabled = close.IsEnabled = subject.IsEnabled = notes.IsEnabled = true; lesson.IsEnabled = Choice(subject).Length > 0; }
        };
        try { await dialog.ShowAsync(); }
        finally { closed = true; cancellation.Cancel(); player?.MediaPlayer?.Dispose(); preview.Content = null; }
        if (saved) Render();
    }
}
