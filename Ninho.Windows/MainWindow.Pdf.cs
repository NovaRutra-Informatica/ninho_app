using System.Globalization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;
using Windows.ApplicationModel.DataTransfer;
using Windows.Data.Pdf;
using Windows.Storage;
using Windows.Storage.Streams;
using NativePdfDocument = Windows.Data.Pdf.PdfDocument;
using TextPdfDocument = UglyToad.PdfPig.PdfDocument;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    // PdfPig documents are never shared across threads. Limit concurrent parsers across previews,
    // including the small interval in which a cancelled preview is finishing a page.
    private static readonly SemaphoreSlim PdfTextWorker = new(1, 1);
    private const long PdfTextFileLimit = 64L * 1024 * 1024;
    private const int PdfSearchPageLimit = 300;
    private const int PdfPageTextLimit = 100_000;
    private const int PdfIndexTextLimit = 2_000_000;

    private async Task<UIElement> CreatePdfPreview(StorageFile file)
    {
        var properties = await file.GetBasicPropertiesAsync();
        var canReadText = properties.Size <= PdfTextFileLimit;
        var lifetime = new CancellationTokenSource();
        var rendering = new SemaphoreSlim(1, 1);
        CancellationTokenSource? renderRequest = null, pageTextRequest = null, searchRequest = null;
        NativePdfDocument? document = null;
        PdfTextResult? index = null;
        var disposed = false;
        var initialized = false;
        var pageNumber = 1;
        var textPageNumber = 0;
        var renderGeneration = 0;
        var textGeneration = 0;
        var searchGeneration = 0;
        var matches = new List<int>();
        var matchPosition = -1;
        var activeQuery = "";

        var status = Caption("Preparando PDF…");
        var searchStatus = Caption(canReadText ? "A busca usa o texto do PDF. Páginas digitalizadas podem não conter texto." : "Busca e cópia desativadas para PDFs acima de 64 MB. A leitura visual continua disponível.");
        var progress = new ProgressBar { IsIndeterminate = true, Height = 3 };
        var pageInput = new NumberBox { Header = "Página", Minimum = 1, Maximum = 1, Value = 1, Width = 115, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline, IsEnabled = false };
        var pageCount = Caption("de …"); pageCount.VerticalAlignment = VerticalAlignment.Center;
        var back = new Button { Content = "← Anterior", IsEnabled = false };
        var next = new Button { Content = "Próxima →", IsEnabled = false };
        var go = new Button { Content = "Ir", IsEnabled = false };
        var image = new Image { Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
        var viewer = new ScrollViewer
        {
            Content = image, Height = 380, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, ZoomMode = ZoomMode.Enabled,
            MinZoomFactor = .5f, MaxZoomFactor = 4f, HorizontalContentAlignment = HorizontalAlignment.Left,
            VerticalContentAlignment = VerticalAlignment.Top
        };
        AutomationProperties.SetName(viewer, "Página do PDF. Use os botões de zoom ou o gesto de pinça para ampliar.");
        var zoomLabel = Caption("100%"); zoomLabel.VerticalAlignment = VerticalAlignment.Center;
        var smaller = new Button { Content = "−", IsEnabled = false };
        var larger = new Button { Content = "+", IsEnabled = false };
        var fit = new Button { Content = "Ajustar à largura", IsEnabled = false };
        AutomationProperties.SetName(smaller, "Diminuir zoom"); AutomationProperties.SetName(larger, "Aumentar zoom");
        var query = new TextBox { PlaceholderText = "Palavra ou frase…", MaxLength = 120, MinWidth = 200, MaxWidth = 380, IsEnabled = canReadText };
        AutomationProperties.SetName(query, "Buscar no texto do PDF");
        var find = new Button { Content = "Buscar", IsEnabled = canReadText };
        var stop = new Button { Content = "Cancelar busca", Visibility = Visibility.Collapsed };
        var previousMatch = new Button { Content = "Resultado anterior", IsEnabled = false };
        var nextMatch = new Button { Content = "Próximo resultado", IsEnabled = false };
        var text = new TextBox { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 110, MaxHeight = 230, Text = "Abra este painel para ler e copiar o texto da página." };
        AutomationProperties.SetName(text, "Texto selecionável da página do PDF");
        var copy = new Button { Content = "Copiar texto da página", IsEnabled = false };
        var textStatus = Caption("A ordem extraída pode diferir da diagramação original. Não há OCR.");
        var textPanel = new Expander { Header = "Texto da página • selecionar e copiar", Content = Column(text, copy, textStatus), IsEnabled = canReadText, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        var root = Column(Row(back, pageInput, pageCount, go, next), Row(smaller, zoomLabel, larger, fit), progress, viewer, status,
            Row(query, find, stop), searchStatus, Row(previousMatch, nextMatch), textPanel);
        root.Spacing = 12;

        void FitWidth()
        {
            if (disposed || image.Width <= 0 || double.IsNaN(image.Width) || viewer.ViewportWidth <= 0) return;
            viewer.ChangeView(0, 0, (float)Math.Clamp((viewer.ViewportWidth - 10) / image.Width, viewer.MinZoomFactor, viewer.MaxZoomFactor), true);
        }
        void SetPageControls()
        {
            var available = document != null && document.PageCount > 0;
            back.IsEnabled = available && pageNumber > 1;
            next.IsEnabled = available && pageNumber < document!.PageCount;
            pageInput.IsEnabled = go.IsEnabled = smaller.IsEnabled = larger.IsEnabled = fit.IsEnabled = available;
        }
        void SelectMatch()
        {
            if (textPageNumber != pageNumber || activeQuery.Length == 0) return;
            var offset = CultureInfo.GetCultureInfo("pt-BR").CompareInfo.IndexOf(text.Text, activeQuery, CompareOptions.IgnoreCase);
            if (offset >= 0) text.Select(offset, Math.Min(activeQuery.Length, text.Text.Length - offset));
        }
        async Task ReadCurrentText()
        {
            if (disposed || !canReadText || document == null) return;
            var target = pageNumber;
            var generation = ++textGeneration;
            pageTextRequest?.Cancel();
            using var request = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            pageTextRequest = request;
            copy.IsEnabled = false; textPageNumber = 0;
            text.Text = "Preparando texto da página…";
            try
            {
                var result = index?.Pages.TryGetValue(target, out var cached) == true
                    ? new PdfTextResult(new Dictionary<int, string> { [target] = cached! }, index.Note)
                    : await ExtractPdfText(file.Path, target, request.Token);
                if (disposed || request.IsCancellationRequested || generation != textGeneration || target != pageNumber) return;
                var value = result.Pages.GetValueOrDefault(target, "");
                textPageNumber = target; text.Text = value.Length == 0 ? "Não há texto disponível para esta página dentro dos limites da prévia. Páginas digitalizadas podem precisar de OCR, que não está incluído aqui." : value;
                copy.IsEnabled = value.Length > 0;
                textStatus.Text = result.Note.Length > 0 ? result.Note : "Texto extraído da página atual. A ordem pode diferir da diagramação original.";
                SelectMatch();
            }
            catch (OperationCanceledException) { if (!disposed && generation == textGeneration) { text.Text = "Leitura de texto cancelada. Feche e reabra este painel para tentar novamente."; textStatus.Text = "O texto também é limitado por tempo para manter o aplicativo responsivo."; } }
            catch (Exception) { if (!disposed && generation == textGeneration) { text.Text = "Não foi possível extrair o texto desta página. A imagem do PDF continua disponível."; textStatus.Text = "Arquivos protegidos ou estruturas não suportadas podem impedir a extração."; } }
            finally { if (ReferenceEquals(pageTextRequest, request)) pageTextRequest = null; }
        }
        async Task ShowPage(int target)
        {
            if (disposed || document == null || target < 1 || target > document.PageCount) return;
            var currentDocument = document;
            var generation = ++renderGeneration;
            renderRequest?.Cancel(); pageTextRequest?.Cancel();
            using var request = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            renderRequest = request;
            pageNumber = target; pageInput.Value = target; textPageNumber = 0; copy.IsEnabled = false;
            progress.Visibility = Visibility.Visible; status.Text = $"Preparando página {target}…"; SetPageControls();
            var renderAcquired = false;
            try
            {
                await rendering.WaitAsync(request.Token);
                renderAcquired = true;
                if (disposed || generation != renderGeneration) return;
                using var page = currentDocument.GetPage((uint)(target - 1));
                using var stream = new InMemoryRandomAccessStream();
                var scale = Math.Min(1800 / Math.Max(1, page.Size.Width), 2400 / Math.Max(1, page.Size.Height));
                await page.RenderToStreamAsync(stream, new PdfPageRenderOptions
                {
                    DestinationWidth = (uint)Math.Max(1, Math.Round(page.Size.Width * scale)),
                    DestinationHeight = (uint)Math.Max(1, Math.Round(page.Size.Height * scale))
                }).AsTask(request.Token);
                request.Token.ThrowIfCancellationRequested();
                stream.Seek(0);
                var bitmap = new BitmapImage(); await bitmap.SetSourceAsync(stream).AsTask(request.Token);
                if (disposed || generation != renderGeneration) return;
                var displayScale = 750 / Math.Max(1, page.Size.Width);
                image.Width = 750; image.Height = Math.Clamp(page.Size.Height * displayScale, 1, 5000); image.Source = bitmap;
                viewer.ChangeView(0, 0, null, true);
                status.Text = $"Página {target} de {currentDocument.PageCount}";
                rendering.Release(); renderAcquired = false;
                if (textPanel.IsExpanded) await ReadCurrentText();
            }
            catch (OperationCanceledException) { }
            catch (Exception) { if (!disposed && generation == renderGeneration) { image.Source = null; status.Text = "Não foi possível renderizar esta página. Tente outra página ou abra o PDF no aplicativo padrão."; } }
            finally
            {
                if (renderAcquired) rendering.Release();
                if (ReferenceEquals(renderRequest, request)) renderRequest = null;
                if (!disposed && generation == renderGeneration) progress.Visibility = Visibility.Collapsed;
            }
        }
        async Task JumpToMatch(int position)
        {
            if (matches.Count == 0 || disposed) return;
            matchPosition = (position + matches.Count) % matches.Count;
            searchStatus.Text = $"Página encontrada {matchPosition + 1} de {matches.Count}. {index?.Note}";
            var wasExpanded = textPanel.IsExpanded;
            // Change the page first so Expanding reads the correct page.
            await ShowPage(matches[matchPosition]);
            if (disposed) return;
            if (!wasExpanded) textPanel.IsExpanded = true;
            else SelectMatch();
        }
        async Task FindText()
        {
            if (disposed || !canReadText || document == null || searchRequest != null) return;
            var term = query.Text.Trim();
            if (term.Length < 2) { searchStatus.Text = "Digite pelo menos dois caracteres para buscar."; return; }
            var generation = ++searchGeneration;
            pageTextRequest?.Cancel();
            using var request = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            searchRequest = request;
            find.IsEnabled = false; stop.Visibility = Visibility.Visible; matches.Clear(); previousMatch.IsEnabled = nextMatch.IsEnabled = false;
            searchStatus.Text = "Buscando no texto em segundo plano… Você pode continuar lendo ou cancelar.";
            try
            {
                index ??= await ExtractPdfText(file.Path, null, request.Token);
                request.Token.ThrowIfCancellationRequested();
                if (disposed || generation != searchGeneration) return;
                activeQuery = term;
                matches = index.Pages.Where(pair => CultureInfo.GetCultureInfo("pt-BR").CompareInfo.IndexOf(pair.Value, term, CompareOptions.IgnoreCase) >= 0).Select(pair => pair.Key).Order().ToList();
                previousMatch.IsEnabled = nextMatch.IsEnabled = matches.Count > 1;
                if (matches.Count > 0) await JumpToMatch(0);
                else searchStatus.Text = $"Nenhuma página com esse texto no trecho pesquisado. {index.Note}";
            }
            catch (OperationCanceledException) { if (!disposed) searchStatus.Text = "Busca cancelada. Sua leitura continua disponível."; }
            catch (Exception) { if (!disposed) searchStatus.Text = "Não foi possível pesquisar o texto. O PDF pode estar protegido ou ter uma estrutura não suportada."; }
            finally { if (ReferenceEquals(searchRequest, request)) searchRequest = null; if (!disposed) { find.IsEnabled = true; stop.Visibility = Visibility.Collapsed; } }
        }

        back.Click += async (_, _) => await ShowPage(pageNumber - 1);
        next.Click += async (_, _) => await ShowPage(pageNumber + 1);
        go.Click += async (_, _) => { if (double.IsFinite(pageInput.Value)) await ShowPage((int)Math.Clamp(Math.Round(pageInput.Value), 1, document?.PageCount ?? 1)); };
        pageInput.KeyDown += async (_, args) => { if (args.Key == global::Windows.System.VirtualKey.Enter && double.IsFinite(pageInput.Value)) { args.Handled = true; await ShowPage((int)Math.Clamp(Math.Round(pageInput.Value), 1, document?.PageCount ?? 1)); } };
        smaller.Click += (_, _) => viewer.ChangeView(null, null, Math.Max(viewer.MinZoomFactor, viewer.ZoomFactor - .25f), true);
        larger.Click += (_, _) => viewer.ChangeView(null, null, Math.Min(viewer.MaxZoomFactor, viewer.ZoomFactor + .25f), true);
        fit.Click += (_, _) => FitWidth();
        viewer.ViewChanged += (_, _) => zoomLabel.Text = $"{viewer.ZoomFactor * 100:0}%";
        image.SizeChanged += (_, _) => { if (initialized && image.Source != null) FitWidth(); };
        find.Click += async (_, _) => await FindText();
        query.KeyDown += async (_, args) => { if (args.Key == global::Windows.System.VirtualKey.Enter) { args.Handled = true; await FindText(); } };
        stop.Click += (_, _) => searchRequest?.Cancel();
        previousMatch.Click += async (_, _) => await JumpToMatch(matchPosition - 1);
        nextMatch.Click += async (_, _) => await JumpToMatch(matchPosition + 1);
        textPanel.Expanding += async (_, _) => await ReadCurrentText();
        copy.Click += (_, _) =>
        {
            if (!copy.IsEnabled || textPageNumber != pageNumber) return;
            try { var package = new DataPackage(); package.SetText(text.Text); Clipboard.SetContent(package); textStatus.Text = "Texto da página copiado."; }
            catch (Exception) { textStatus.Text = "Não foi possível copiar agora. Selecione o texto e use Ctrl+C."; }
        };
        root.Loaded += async (_, _) =>
        {
            if (initialized || disposed) return;
            initialized = true;
            try
            {
                document = await NativePdfDocument.LoadFromFileAsync(file).AsTask(lifetime.Token);
                if (disposed) { document = null; return; }
                pageCount.Text = $"de {document.PageCount}"; pageInput.Maximum = Math.Max(1, document.PageCount);
                if (document.PageCount > 0) await ShowPage(1);
                else { status.Text = "Este PDF não contém páginas."; progress.Visibility = Visibility.Collapsed; }
            }
            catch (OperationCanceledException) { }
            catch (Exception) { if (!disposed) { status.Text = "Não foi possível abrir este PDF. Use o aplicativo padrão para arquivos protegidos ou incompatíveis."; progress.Visibility = Visibility.Collapsed; } }
        };
        root.Unloaded += (_, _) =>
        {
            disposed = true; lifetime.Cancel(); renderRequest?.Cancel(); pageTextRequest?.Cancel(); searchRequest?.Cancel();
            image.Source = null; document = null; index = null; matches.Clear();
        };
        return root;
    }

    private sealed record PdfTextResult(Dictionary<int, string> Pages, string Note);

    private static async Task<PdfTextResult> ExtractPdfText(string path, int? onlyPage, CancellationToken cancellation)
    {
        await PdfTextWorker.WaitAsync(cancellation).ConfigureAwait(false);
        try
        {
            return await Task.Run(() =>
            {
                if (new FileInfo(path).Length > PdfTextFileLimit) throw new InvalidDataException("Texto limitado a PDFs de até 64 MB.");
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                budget.CancelAfter(TimeSpan.FromSeconds(20));
                using var input = new PdfCancellationStream(File.OpenRead(path), budget.Token);
                using var pdf = TextPdfDocument.Open(input);
                var result = new Dictionary<int, string>();
                var characters = 0;
                var truncated = false;
                var first = onlyPage ?? 1;
                var last = onlyPage ?? Math.Min(pdf.NumberOfPages, PdfSearchPageLimit);
                if (first < 1 || last > pdf.NumberOfPages) return new PdfTextResult(result, "Página não encontrada no texto do arquivo.");
                for (var number = first; number <= last; number++)
                {
                    cancellation.ThrowIfCancellationRequested();
                    if (budget.IsCancellationRequested) { truncated = true; break; }
                    try
                    {
                        var page = pdf.GetPage(number);
                        budget.Token.ThrowIfCancellationRequested();
                        if (page.Letters.Count > PdfPageTextLimit) { truncated = true; continue; }
                        var value = ContentOrderTextExtractor.GetText(page);
                        if (value.Length > PdfPageTextLimit) { value = value[..PdfPageTextLimit]; truncated = true; }
                        var available = PdfIndexTextLimit - characters;
                        if (value.Length > available) { value = value[..available]; truncated = true; }
                        result[number] = value; characters += value.Length;
                        if (characters >= PdfIndexTextLimit) { truncated = true; break; }
                    }
                    catch (OperationCanceledException) when (!cancellation.IsCancellationRequested) { truncated = true; break; }
                }
                cancellation.ThrowIfCancellationRequested();
                var limitedPages = onlyPage == null && pdf.NumberOfPages > PdfSearchPageLimit;
                var note = truncated || limitedPages
                    ? $"Busca parcial: até {PdfSearchPageLimit} páginas, 2 milhões de caracteres e 20 segundos; páginas muito complexas podem ser ignoradas. Abra uma página para ler seu texto individualmente."
                    : onlyPage == null ? $"{result.Count} páginas pesquisadas. PDFs digitalizados podem não conter texto." : "";
                return new PdfTextResult(result, note);
            }, cancellation).ConfigureAwait(false);
        }
        finally { PdfTextWorker.Release(); }
    }

    // PdfPig exposes synchronous parsing. Checking cancellation at stream reads and seeks,
    // as well as between pages, interrupts I/O and avoids blocking the UI thread.
    // CPU work already inside a parser operation remains cooperatively cancellable.
    private sealed class PdfCancellationStream(Stream inner, CancellationToken cancellation) : Stream
    {
        private void Check() => cancellation.ThrowIfCancellationRequested();
        public override bool CanRead => inner.CanRead;
        public override bool CanSeek => inner.CanSeek;
        public override bool CanWrite => false;
        public override long Length { get { Check(); return inner.Length; } }
        public override long Position { get { Check(); return inner.Position; } set { Check(); inner.Position = value; } }
        public override int Read(byte[] buffer, int offset, int count) { Check(); return inner.Read(buffer, offset, count); }
        public override int Read(Span<byte> buffer) { Check(); return inner.Read(buffer); }
        public override int ReadByte() { Check(); return inner.ReadByte(); }
        public override long Seek(long offset, SeekOrigin origin) { Check(); return inner.Seek(offset, origin); }
        public override void Flush() { Check(); }
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing) { if (disposing) inner.Dispose(); base.Dispose(disposing); }
    }
}
