using System.Text.Json;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public sealed class MaterialImportTests
{
    private static StudyState Example() => new()
    {
        Programs = [new() { Id = "p", Name = "Meus estudos" }],
        Subjects = [new() { Id = "s", ProgramId = "p", Name = "Banco de dados" }, new() { Id = "t", ProgramId = "p", Name = "Literatura" }],
        Courses = [new() { Id = "123", SubjectId = "s", Title = "SQL", Provider = "Estratégia Concursos" }, new() { Id = "124", SubjectId = "t", Title = "Literatura", Provider = "ESTRATEGIA" }, new() { Id = "125", SubjectId = "s", Title = "Outro", Provider = "Outro professor" }],
        Lessons = [new() { Id = "123:aula:00", CourseId = "123", SubjectId = "s", Title = "Introdução" }, new() { Id = "123:aula:01", CourseId = "123", SubjectId = "s", Title = "Consultas" }, new() { Id = "124:aula:05", CourseId = "124", SubjectId = "t", Title = "Modernismo" }]
    };

    [Theory]
    [InlineData("curso-123-aula-00-hash-completo.pdf", "s", "123:aula:00")]
    [InlineData("CURSO-124-AULA-5_material.PDF", "t", "124:aula:05")]
    [InlineData("curso-123-aula-01.pdf", "s", "123:aula:01")]
    [InlineData("curso-123-aula-99-completo.pdf", "s", "")]
    [InlineData("curso-999-aula-00-a.pdf", "", "")]
    [InlineData("curso-125-aula-00-a.pdf", "", "")]
    [InlineData("curso-123-aula-00-a.txt", "", "")]
    [InlineData("anotacao.pdf", "", "")]
    [InlineData("prefixo-curso-123-aula-00-a.pdf", "", "")]
    [InlineData("curso-123-aula-00sem-separador.pdf", "", "")]
    public void StrategyInferenceMatchesOriginal(string filename, string subject, string lesson)
        => Assert.Equal(new MaterialContext(subject, lesson), MaterialImport.InferContext(Example(), filename));

    [Fact]
    public void ExplicitSubjectAndLessonTakePrecedenceAndEmptyLessonSuppressesInference()
    {
        var state = Example(); const string filename = "curso-123-aula-00-a.pdf";
        Assert.Equal(new MaterialContext("t", ""), MaterialImport.InferContext(state, filename, "t"));
        Assert.Equal(new MaterialContext("s", "123:aula:00"), MaterialImport.InferContext(state, filename, "s", null));
        Assert.Equal(new MaterialContext("s", ""), MaterialImport.InferContext(state, filename, "s", ""));
        Assert.Equal(new MaterialContext("s", "123:aula:01"), MaterialImport.InferContext(state, filename, "s", "123:aula:01"));
        Assert.Equal(new MaterialContext("t", "124:aula:05"), MaterialImport.InferContext(state, filename, "t", "124:aula:05"));
        Assert.Equal(new MaterialContext("s", "123:aula:00"), MaterialImport.InferContext(state, filename, ""));
        Assert.Equal(new MaterialContext("s", "123:aula:01"), MaterialImport.InferContext(state, "anotacao.txt", "s", "123:aula:01"));
    }

    [Fact]
    public void CourseIdMustAlsoMatchTheInferredLesson()
    {
        var state = Example(); state.Lessons[0].CourseId = "124";
        Assert.Equal(new MaterialContext("s", ""), MaterialImport.InferContext(state, "curso-123-aula-00-a.pdf"));
    }

    [Fact]
    public async Task MixedBatchInfersEachPdfAndPublishesOneStatePreservingOriginals()
    {
        using var files = new Files(); var store = await files.Store();
        var before = await files.StateJson(store);
        var one = await files.Source("curso-123-aula-00-a.pdf", "pdf one");
        var two = await files.Source("curso-124-aula-5-b.PDF", "pdf two");
        var three = await files.Source("anotacoes.txt", "my notes");
        var imported = await store.ImportMaterialsAsync([one, two, three]);
        Assert.Equal(3, imported.Count); Assert.Equal(3, store.State.Materials.Count);
        Assert.Equal("123:aula:00", imported[0].LessonId); Assert.Equal("124:aula:05", imported[1].LessonId); Assert.Equal("", imported[2].SubjectId);
        Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json.previous")));
        Assert.Equal("pdf one", await File.ReadAllTextAsync(one)); Assert.Equal("pdf two", await File.ReadAllTextAsync(two));
        foreach (var material in imported) Assert.Equal(new FileInfo(store.MaterialPath(material.StoredName)).Length, material.Size);
        var reopened = new StudyStore(store.DirectoryPath); await reopened.LoadAsync(files.Seed); Assert.Equal(3, reopened.State.Materials.Count);
    }

    [Theory]
    [InlineData(0)] [InlineData(101)]
    public async Task RejectsSelectionOutsideBatchLimitWithoutPublishing(int count)
    {
        using var files = new Files(); var store = await files.Store(); var before = await files.StateJson(store);
        var source = await files.Source("note.txt", "unchanged");
        await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportMaterialsAsync(Enumerable.Repeat(source, count).ToArray()));
        Assert.Empty(store.State.Materials); Assert.Equal(before, await files.StateJson(store));
        Assert.Equal("unchanged", await File.ReadAllTextAsync(source));
    }

    [Fact]
    public async Task MaximumBatchAndSameBasenameNeverOverwriteAnyOriginal()
    {
        using var files = new Files(); var store = await files.Store(); var before = await files.StateJson(store);
        var paths = new List<string>();
        for (var i = 0; i < 100; i++) paths.Add(await files.Source(Path.Combine(i.ToString(), "note.txt"), $"Original {i}"));
        var imported = await store.ImportMaterialsAsync(paths);
        Assert.Equal(100, imported.Count); Assert.Equal(100, imported.Select(x => x.StoredName).Distinct().Count());
        Assert.Equal(before, await File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json.previous")));
        for (var i = 0; i < 100; i++)
        {
            Assert.Equal($"Original {i}", await File.ReadAllTextAsync(paths[i]));
            Assert.Equal($"Original {i}", await File.ReadAllTextAsync(store.MaterialPath(imported[i].StoredName)));
        }
    }

    [Theory]
    [InlineData("missing.pdf")]
    [InlineData("unsupported.exe")]
    public async Task InvalidLastFileRejectsWholeBatchBeforeAnyCopies(string failingName)
    {
        using var files = new Files(); var store = await files.Store(); var before = await files.StateJson(store);
        var first = await files.Source("first.txt", "first");
        var failing = Path.Combine(files.Root, failingName);
        if (failingName.EndsWith(".exe")) await File.WriteAllTextAsync(failing, "unsupported");
        if (failingName.EndsWith(".exe")) await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportMaterialsAsync([first, failing]));
        else await Assert.ThrowsAsync<FileNotFoundException>(() => store.ImportMaterialsAsync([first, failing]));
        Assert.Equal(before, await files.StateJson(store)); Assert.Empty(store.State.Materials);
        Assert.False(Directory.Exists(Path.Combine(store.DirectoryPath, "materials")));
    }

    [Fact]
    public async Task OversizeAttachmentRejectsWholeBatchBeforeCopying()
    {
        using var files = new Files(); var store = await files.Store(); var before = await files.StateJson(store);
        var small = await files.Source("first.txt", "first"); var large = Path.Combine(files.Root, "large.pdf");
        using (var stream = File.Create(large)) stream.SetLength(2L * 1024 * 1024 * 1024 + 1);
        await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportMaterialsAsync([small, large]));
        Assert.Empty(store.State.Materials); Assert.Equal(before, await files.StateJson(store));
        Assert.False(Directory.Exists(Path.Combine(store.DirectoryPath, "materials")));
    }

    [Theory]
    [InlineData("missing-subject", null)]
    [InlineData("s", "124:aula:05")]
    public async Task InvalidExplicitLinksAreRejectedInsteadOfReassigned(string subject, string? lesson)
    {
        using var files = new Files(); var store = await files.Store(); var before = await files.StateJson(store);
        var source = await files.Source("curso-123-aula-00-a.pdf", "original");
        await Assert.ThrowsAsync<InvalidDataException>(() => store.ImportMaterialsAsync([source], subject, lesson));
        Assert.Equal(before, await files.StateJson(store)); Assert.Empty(store.State.Materials);
        Assert.Empty(Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials")));
    }

    [Fact]
    public async Task FailureOnSecondCopyRemovesOnlyThisBatchesCopies()
    {
        using var files = new Files(); var store = await files.Store();
        var old = await files.Source("old.txt", "existing material"); await store.ImportMaterialAsync(old, "s");
        var before = await files.StateJson(store); var existing = Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials"));
        var first = await files.Source("first.txt", "first"); var locked = await files.Source("second.txt", "second");
        using (var held = new FileStream(locked, FileMode.Open, FileAccess.Read, FileShare.None))
            await Assert.ThrowsAnyAsync<IOException>(() => store.ImportMaterialsAsync([first, locked]));
        Assert.Equal(before, await files.StateJson(store)); Assert.Single(store.State.Materials);
        Assert.Equal(existing, Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials")));
        Assert.Equal("existing material", await File.ReadAllTextAsync(existing[0]));
        Assert.Equal("first", await File.ReadAllTextAsync(first)); Assert.Equal("second", await File.ReadAllTextAsync(locked));
    }

    [Fact]
    public async Task FailedStatePublicationRollsBackAllNewCopies()
    {
        using var files = new Files(); var store = await files.Store();
        await store.ImportMaterialAsync(await files.Source("old.txt", "existing"), "s");
        var before = await files.StateJson(store); var existing = Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials"));
        var one = await files.Source("one.txt", "one"); var two = await files.Source("two.txt", "two");
        Directory.CreateDirectory(Path.Combine(store.DirectoryPath, "state.json.tmp"));
        await Assert.ThrowsAnyAsync<Exception>(() => store.ImportMaterialsAsync([one, two]));
        Assert.Equal(before, await files.StateJson(store)); Assert.Single(store.State.Materials);
        Assert.Equal(existing, Directory.GetFiles(Path.Combine(store.DirectoryPath, "materials")));
        Assert.Equal("one", await File.ReadAllTextAsync(one)); Assert.Equal("two", await File.ReadAllTextAsync(two));
    }

    [Fact]
    public async Task AlreadyCancelledBatchHasNoSideEffects()
    {
        using var files = new Files(); var store = await files.Store(); var before = await files.StateJson(store);
        var source = await files.Source("one.txt", "one"); using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => store.ImportMaterialsAsync([source], cancellationToken: cancelled.Token));
        Assert.Equal(before, await files.StateJson(store)); Assert.Empty(store.State.Materials);
        Assert.False(Directory.Exists(Path.Combine(store.DirectoryPath, "materials")));
    }

    [Fact]
    public async Task ConcurrentBatchesAndMutationsAreSerializedWithoutDroppingData()
    {
        using var files = new Files(); var store = await files.Store();
        var first = await files.Source("first.txt", "first"); var second = await files.Source("second.txt", "second");
        await Task.WhenAll(store.ImportMaterialsAsync([first], "s"), store.ImportMaterialsAsync([second], "t"), store.ChangeAsync(state => state.Settings.Name = "Preservado"));
        Assert.Equal(2, store.State.Materials.Count); Assert.Equal("Preservado", store.State.Settings.Name);
        var reopened = new StudyStore(store.DirectoryPath); await reopened.LoadAsync(files.Seed);
        Assert.Equal(2, reopened.State.Materials.Count); Assert.Equal("Preservado", reopened.State.Settings.Name);
    }

    private sealed class Files : IDisposable
    {
        private static readonly string Parent = Path.Combine(Path.GetTempPath(), "ninho-material-tests");
        public string Root { get; } = Path.Combine(Parent, Guid.NewGuid().ToString("N"));
        public string Seed => Path.Combine(Root, "seed.json");
        public Files() => Directory.CreateDirectory(Root);
        public async Task<StudyStore> Store()
        {
            await File.WriteAllTextAsync(Seed, JsonSerializer.Serialize(Example(), StudyStore.JsonOptions));
            var store = new StudyStore(Path.Combine(Root, "data")); await store.LoadAsync(Seed); return store;
        }
        public async Task<string> Source(string name, string contents)
        {
            var path = Path.Combine(Root, name); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, contents); return path;
        }
        public Task<string> StateJson(StudyStore store) => File.ReadAllTextAsync(Path.Combine(store.DirectoryPath, "state.json"));
        public void Dispose()
        {
            if (!Path.GetFullPath(Root).StartsWith(Path.GetFullPath(Parent) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Unsafe test cleanup path.");
            Directory.Delete(Root, true);
        }
    }
}
