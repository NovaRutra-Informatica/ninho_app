using Microsoft.UI.Xaml.Controls;
using Ninho.Core;
using Windows.Storage.Pickers;

namespace Ninho.Windows;

public sealed partial class MainWindow
{
    // Call through ActionButton's existing Run guard; do not wrap this method in a second Run.
    private async Task ImportMaterials(string? subjectId, string? lessonId)
    {
        var picker = new FileOpenPicker();
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        foreach (var extension in StudyStore.MaterialExtensions) picker.FileTypeFilter.Add(extension);
        var files = await picker.PickMultipleFilesAsync();
        if (files.Count == 0) return;
        if (files.Count > 100) throw new InvalidDataException("Selecione até 100 arquivos por vez.");
        ShowNotice($"Importando {files.Count} arquivo(s). Você pode continuar navegando enquanto o Ninho organiza o lote.");
        try
        {
            // Keep null for an omitted lesson: an explicit empty string intentionally disables automatic lesson linking.
            var imported = await store.ImportMaterialsAsync(files.Select(file => file.Path).ToArray(), subjectId, lessonId);
            QueueDailyBackup();
            Render();
            ShowNotice($"{imported.Count} material(is) importado(s). Os arquivos originais foram preservados.", InfoBarSeverity.Success);
        }
        catch
        {
            ShowNotice("O lote não foi importado. Nenhum material desse lote foi adicionado; seus arquivos anteriores foram preservados.", InfoBarSeverity.Error);
            throw;
        }
    }
}
