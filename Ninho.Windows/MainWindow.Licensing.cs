using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Ninho.Licensing;
using Ninho.Licensing.Windows;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    private LicenseClient? licenseClient = null;
    private LicenseClaims? purchase;
    private bool licenseAccepted;
    private Func<Task>? retryLibraryAfterActivation;
    private readonly CancellationTokenSource acquisitionLifetime = new();
    private bool licenseWindowClosed;

    private void ClosePurchase()
    {
        licenseWindowClosed = true;
        ready = false;
        appActive = false;
        acquisitionLifetime.Cancel();
        licenseClient?.Dispose();
    }

    private async Task<bool> EnsurePurchase(Func<Task> resume)
    {
        if (licenseWindowClosed) return false;
        retryLibraryAfterActivation = resume;
#if DEBUG || NINHO_PREVIEW
        licenseAccepted = true;
        DistributionLabel.Text = "Prévia de desenvolvimento · não distribuir";
        return await Task.FromResult(true);
#else
        try
        {
            if (licenseClient == null)
            {
                using var source = typeof(MainWindow).Assembly.GetManifestResourceStream("Ninho.Licensing.production.public.json")
                    ?? throw new InvalidDataException("A configuração comercial não acompanha esta edição.");
                using var reader = new StreamReader(source);
                var configuration = LicenseClientConfiguration.Parse(await reader.ReadToEndAsync(acquisitionLifetime.Token));
                var installation = await Task.Run(() => WindowsInstallationKey.Open(), acquisitionLifetime.Token);
                if (licenseWindowClosed) { installation.Dispose(); return false; }
                licenseClient = new LicenseClient(configuration, installation,
                    new ProtectedLicenseFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ninho", "Licensing")));
            }
            var validation = await licenseClient.ReadAsync(acquisitionLifetime.Token);
            if (licenseWindowClosed) return false;
            if (validation is { IsValid: true })
            {
                purchase = validation.Claims;
                licenseAccepted = true;
                return true;
            }
            ShowActivation(validation == null ? null : "O comprovante local não pôde ser validado. Ative novamente com seu código; seus estudos permanecem guardados.");
        }
        catch (Exception) when (licenseWindowClosed) { return false; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or CryptographicException or JsonException or ArgumentException or FormatException)
        {
            ShowActivation(licenseClient == null ? "Esta edição ainda não está pronta para ativação comercial. Solicite ao distribuidor uma versão configurada." : "Não foi possível abrir a licença local. Seus estudos estão preservados; você pode ativar novamente.");
        }
        return false;
#endif
    }

    private void ShowActivation(string? message)
    {
        if (licenseWindowClosed) return;
        Navigation.IsPaneVisible = false;
        Navigation.IsPaneToggleButtonVisible = false;
        Navigation.IsEnabled = true;
        PageHelp.Visibility = TutorialHost.Visibility = FocusPill.Visibility = Visibility.Collapsed;
        var code = new TextBox { PlaceholderText = "NINHO-…", MaxLength = 100, Style = (Style)Application.Current.Resources["NinhoAnswerStyle"], IsSpellCheckEnabled = false };
        AutomationProperties.SetName(code, "Código de ativação da compra");
        var status = Body(message ?? ""); status.Visibility = string.IsNullOrEmpty(message) ? Visibility.Collapsed : Visibility.Visible;
        AutomationProperties.SetLiveSetting(status, Microsoft.UI.Xaml.Automation.Peers.AutomationLiveSetting.Polite);
        var activate = DialogAction("Ativar meu Ninho", true);
        var activationBusy = false;
        activate.IsEnabled = licenseClient?.CanActivateOnline == true;
        activate.HorizontalAlignment = HorizontalAlignment.Stretch;
        async Task Complete(Func<Task<LicenseValidationResult>> operation)
        {
            if (activationBusy || licenseWindowClosed) return;
            activationBusy = true;
            activate.IsEnabled = false; code.IsEnabled = false;
            status.Text = "Confirmando sua compra…"; status.Visibility = Visibility.Visible;
            try
            {
                var result = await operation();
                if (licenseWindowClosed) return;
                purchase = result.Claims; licenseAccepted = result.IsValid;
                if (licenseAccepted && retryLibraryAfterActivation != null) await retryLibraryAfterActivation();
            }
            catch (Exception) when (licenseWindowClosed) { }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or IOException or UnauthorizedAccessException or InvalidOperationException or FormatException or CryptographicException or JsonException)
            {
                status.Text = error is HttpRequestException or OperationCanceledException
                    ? "Não foi possível acessar a ativação. Confira sua conexão e tente novamente. Depois de ativar, você poderá estudar offline."
                    : error is FormatException ? "Confira o código recebido com sua compra e cole-o por inteiro."
                    : error is UnauthorizedAccessException ? "O Windows não permitiu salvar a licença. Confira o acesso à pasta do Ninho e tente novamente; seus estudos foram preservados." : error.Message;
            }
            finally { activationBusy = false; if (!licenseWindowClosed) { activate.IsEnabled = licenseClient?.CanActivateOnline == true; code.IsEnabled = true; } }
        }
        activate.Click += async (_, _) => { if (licenseClient != null) await Complete(() => licenseClient.ActivateAsync(code.Text, acquisitionLifetime.Token)); };
        code.KeyDown += async (_, args) =>
        {
            if (args.Key == global::Windows.System.VirtualKey.Enter && activate.IsEnabled && licenseClient != null)
            { args.Handled = true; await Complete(() => licenseClient.ActivateAsync(code.Text, acquisitionLifetime.Token)); }
        };
        var content = Column(new OwlControl { Width = 128, Height = 128, HorizontalAlignment = HorizontalAlignment.Center },
            Heading("Seu Ninho, por inteiro."), Body("Uma compra. Seu espaço para continuar aprendendo."),
            Body(licenseClient?.CanActivateOnline == false
                ? "Cole o código que você recebeu ao comprar o Ninho para Windows e use a ativação assistida abaixo. Você recebe um comprovante para este computador e pode estudar offline, sem mensalidade."
                : "Cole o código que você recebeu ao comprar o Ninho para Windows. A conexão é necessária nesta ativação; depois, seus estudos funcionam offline, sem mensalidade."),
            code, activate, status, Body("A ativação envia apenas o código de compra e uma identificação criptográfica desta instalação. Seus estudos, materiais e perfil ficam neste computador."));
        var receipt = new TextBox { PlaceholderText = "Cole o comprovante ou o conteúdo do arquivo recebido", MaxLength = 16_384, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 90, Style = (Style)Application.Current.Resources["NinhoAnswerStyle"], IsSpellCheckEnabled = false };
        AutomationProperties.SetName(receipt, "Comprovante assinado de ativação");
        var import = DialogAction("Aplicar comprovante"); import.IsEnabled = licenseClient != null;
        import.Click += async (_, _) => { if (licenseClient != null) await Complete(() => licenseClient.AcceptReceiptAsync(receipt.Text, acquisitionLifetime.Token)); };
        var request = ActionButton("Salvar solicitação para o suporte", async () =>
        {
            if (licenseClient == null || activationBusy || licenseWindowClosed) return;
            try
            {
                var enteredCode = code.Text;
                var signedRequest = await Task.Run(() => licenseClient.Request(enteredCode), acquisitionLifetime.Token);
                if (licenseWindowClosed) return;
                var destination = await PickSave("Ninho-ativacao", ".json");
                if (destination == null || licenseWindowClosed) return;
                await File.WriteAllTextAsync(destination.Path, JsonSerializer.Serialize(signedRequest, LicenseProtocol.JsonOptions), acquisitionLifetime.Token);
                if (licenseWindowClosed) return;
                status.Text = "Solicitação salva. Envie apenas ao suporte responsável pela sua compra; ela contém seu código de ativação.";
            }
            catch (Exception) when (licenseWindowClosed) { return; }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or FormatException or CryptographicException)
            { status.Text = error is FormatException ? "Cole primeiro o código completo da sua compra." : "Não foi possível salvar a solicitação. Confira o destino e tente novamente."; }
            status.Visibility = Visibility.Visible;
        }); request.IsEnabled = licenseClient != null;
        content.Children.Add(new Expander { Header = "Ativação assistida, sem conexão neste computador", HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Content = Column(Body("Salve a solicitação e encaminhe-a ao suporte por outro dispositivo. Depois, cole aqui o comprovante assinado recebido. Ele é válido somente para esta instalação."), request, receipt, import) });
        content.Spacing = 18; content.MaxWidth = 520; content.HorizontalAlignment = HorizontalAlignment.Center;
        PageHost.Content = DashboardPanel(content, new Thickness(32));
        AutomationProperties.SetAutomationId(PageHost, "license.activation");
    }

    private UIElement PurchasePreferences()
    {
        var text = purchase == null ? "Edição de desenvolvimento. Não é uma licença comercial e não deve ser distribuída como produto pago."
            : "Compra única ativada neste computador. Sem mensalidade ou prazo de expiração; seus estudos continuam disponíveis offline.";
        var content = Column(TitleText("Sua licença"), Body(text));
        if (purchase != null)
        {
            var id = Body("Comprovante: " + purchase.LicenseId); id.IsTextSelectionEnabled = true;
            content.Children.Add(id);
            content.Children.Add(Body("Para recuperar a ativação após trocar de computador ou reinstalar o Windows, conserve seu código de compra e fale com o suporte. O backup de estudos não transfere a licença."));
        }
        return DashboardPanel(content, new Thickness(24));
    }
}
