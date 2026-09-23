using Microsoft.UI.Xaml;

namespace Ninho.Windows;

public partial class App : Application
{
    private Window? window;
    private Mutex? instance;
    public App() { InitializeComponent(); }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var isolation = Environment.GetEnvironmentVariable("NINHO_DATA_DIR") ?? "default";
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(isolation)))[..16];
        instance = new Mutex(true, "Local\\Ninho.Native." + hash, out var first);
        if (!first) { Exit(); return; }
        window = new MainWindow();
        window.Closed += (_, _) => { instance.ReleaseMutex(); instance.Dispose(); };
        window.Activate();
    }
}
