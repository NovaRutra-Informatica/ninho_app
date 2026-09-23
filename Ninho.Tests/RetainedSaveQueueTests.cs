using System.Collections.Concurrent;
using System.Text.Json;
using Ninho.Core;
using Xunit;

namespace Ninho.Tests;

public sealed class RetainedSaveQueueTests
{
    [Fact]
    public async Task FailedWriteRetainsAllProfileEditsInOrderUntilTheyAreDurable()
    {
        var folder = Path.Combine(Path.GetTempPath(), "ninho-save-queue-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            var seed = Path.Combine(folder, "seed.json");
            await File.WriteAllTextAsync(seed, JsonSerializer.Serialize(new StudyState(), StudyStore.JsonOptions));
            var directory = Path.Combine(folder, "data");
            var store = new StudyStore(directory);
            await store.LoadAsync(seed);
            var queue = new RetainedSaveQueue();
            var attempts = new List<string>();
            var committed = new List<string>();
            var fail = true;
            queue.Enqueue(async () =>
            {
                attempts.Add("name");
                if (fail) throw new IOException("Simulated unavailable storage");
                await store.ChangeAsync(state => state.Profile!.Name = "Ana");
            }, () => committed.Add("name"));
            queue.Enqueue(async () =>
            {
                attempts.Add("goal");
                Assert.Equal("Ana", store.State.Profile!.Name);
                await store.ChangeAsync(state => state.Profile!.Goal = "Passar no vestibular");
            }, () => committed.Add("goal"));

            await Assert.ThrowsAsync<IOException>(() => queue.FlushAsync());

            Assert.Equal(2, queue.PendingCount);
            Assert.Equal(new[] { "name" }, attempts);
            Assert.Empty(committed);
            fail = false;
            await queue.FlushAsync();

            Assert.Equal(0, queue.PendingCount);
            Assert.Equal(new[] { "name", "name", "goal" }, attempts);
            Assert.Equal(new[] { "name", "goal" }, committed);
            var restarted = new StudyStore(directory);
            await restarted.LoadAsync(seed);
            Assert.Equal("Ana", restarted.State.Profile!.Name);
            Assert.Equal("Passar no vestibular", restarted.State.Profile.Goal);
        }
        finally { Directory.Delete(folder, true); }
    }

    [Fact]
    public async Task ConcurrentFlushesShareWorkAndDrainEditsEnqueuedDuringSave()
    {
        var queue = new RetainedSaveQueue();
        var entered = Signal();
        var release = Signal();
        var calls = new List<string>();
        var firstWrites = 0;
        queue.Enqueue(async () =>
        {
            Interlocked.Increment(ref firstWrites);
            calls.Add("first-start");
            entered.TrySetResult();
            await release.Task;
            calls.Add("first-end");
        });
        var firstFlush = queue.FlushAsync();
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var secondFlush = queue.FlushAsync();
        queue.Enqueue(() => { calls.Add("second"); return Task.CompletedTask; });
        var thirdFlush = queue.FlushAsync();

        Assert.Equal(2, queue.PendingCount);
        Assert.Equal(1, firstWrites);
        Assert.Equal(new[] { "first-start" }, calls);
        release.TrySetResult();
        await Task.WhenAll(firstFlush, secondFlush, thirdFlush).WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(new[] { "first-start", "first-end", "second" }, calls);
        Assert.Equal(1, firstWrites);
        Assert.Equal(0, queue.PendingCount);
    }

    [Fact]
    public async Task CallbackFailureDoesNotRepeatCommittedWriteAndLeavesFollowingEditForRetry()
    {
        var queue = new RetainedSaveQueue();
        var firstWrites = 0;
        var callbacks = 0;
        var secondWrites = 0;
        queue.Enqueue(() => { firstWrites++; return Task.CompletedTask; }, () =>
        {
            callbacks++;
            Assert.Equal(1, queue.PendingCount);
            throw new InvalidOperationException("Simulated view refresh failure");
        });
        queue.Enqueue(() => { secondWrites++; return Task.CompletedTask; });

        await Assert.ThrowsAsync<InvalidOperationException>(() => queue.FlushAsync());

        Assert.Equal(1, firstWrites);
        Assert.Equal(1, callbacks);
        Assert.Equal(0, secondWrites);
        Assert.Equal(1, queue.PendingCount);
        await queue.FlushAsync();
        Assert.Equal(1, firstWrites);
        Assert.Equal(1, callbacks);
        Assert.Equal(1, secondWrites);
        Assert.Equal(0, queue.PendingCount);
    }

    [Fact]
    public async Task ConsecutiveFailuresKeepTheHeadAndNeverSkipToLaterEdits()
    {
        var queue = new RetainedSaveQueue();
        var attempts = 0;
        var committed = new List<string>();
        queue.Enqueue(() =>
        {
            attempts++;
            if (attempts <= 2) throw new IOException("Simulated full disk");
            return Task.CompletedTask;
        }, () => committed.Add("first"));
        queue.Enqueue(() => Task.CompletedTask, () => committed.Add("second"));

        for (var failure = 1; failure <= 2; failure++)
        {
            await Assert.ThrowsAsync<IOException>(() => queue.FlushAsync());
            Assert.Equal(failure, attempts);
            Assert.Equal(2, queue.PendingCount);
            Assert.Empty(committed);
        }

        await queue.FlushAsync();
        await queue.FlushAsync();
        Assert.Equal(3, attempts);
        Assert.Equal(new[] { "first", "second" }, committed);
        Assert.Equal(0, queue.PendingCount);
    }

    [Fact]
    public async Task EditEnqueuedByCommitCallbackIsIncludedInTheSameFlush()
    {
        var queue = new RetainedSaveQueue();
        var committed = new List<string>();
        queue.Enqueue(() => Task.CompletedTask, () =>
        {
            Assert.Equal(0, queue.PendingCount);
            committed.Add("first");
            queue.Enqueue(() => Task.CompletedTask, () => committed.Add("follow-up"));
        });

        await queue.FlushAsync();

        Assert.Equal(new[] { "first", "follow-up" }, committed);
        Assert.Equal(0, queue.PendingCount);
    }

    [Fact]
    public async Task ParallelProducersDoNotLoseOrDuplicateEditsWhileWorkerIsBlocked()
    {
        var queue = new RetainedSaveQueue();
        var entered = Signal();
        var release = Signal();
        var writes = new ConcurrentDictionary<int, int>();
        queue.Enqueue(async () => { entered.TrySetResult(); await release.Task; });
        var flush = queue.FlushAsync();
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await Task.WhenAll(Enumerable.Range(0, 64).Select(id => Task.Run(() =>
            queue.Enqueue(() =>
            {
                writes.AddOrUpdate(id, 1, (_, count) => count + 1);
                return Task.CompletedTask;
            }))));

        Assert.Equal(65, queue.PendingCount);
        release.TrySetResult();
        await flush.WaitAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(64, writes.Count);
        Assert.All(writes.Values, count => Assert.Equal(1, count));
        Assert.Equal(0, queue.PendingCount);
    }

    [Fact]
    public async Task PersistenceAndCommitCallbacksKeepTheFlushingCallersSynchronizationContext()
    {
        await RunOnDedicatedContext(async () =>
        {
            var context = SynchronizationContext.Current;
            var threadId = Environment.CurrentManagedThreadId;
            var queue = new RetainedSaveQueue();
            var commits = 0;
            void AssertContext()
            {
                Assert.Same(context, SynchronizationContext.Current);
                Assert.Equal(threadId, Environment.CurrentManagedThreadId);
            }
            for (var index = 0; index < 2; index++)
            {
                queue.Enqueue(async () =>
                {
                    AssertContext();
                    await Task.Yield();
                    AssertContext();
                }, () => { AssertContext(); commits++; });
            }

            await queue.FlushAsync();

            AssertContext();
            Assert.Equal(2, commits);
            Assert.Equal(0, queue.PendingCount);
        }).WaitAsync(TimeSpan.FromSeconds(5));
    }

    private static TaskCompletionSource Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    private static Task RunOnDedicatedContext(Func<Task> action)
    {
        var completed = Signal();
        var thread = new Thread(() =>
        {
            using var context = new PumpContext();
            SynchronizationContext.SetSynchronizationContext(context);
            context.Post(async _ =>
            {
                try { await action(); completed.TrySetResult(); }
                catch (Exception error) { completed.TrySetException(error); }
                finally { context.Complete(); }
            }, null);
            context.Run();
            SynchronizationContext.SetSynchronizationContext(null);
        }) { IsBackground = true };
        thread.Start();
        return completed.Task;
    }

    private sealed class PumpContext : SynchronizationContext, IDisposable
    {
        private readonly BlockingCollection<(SendOrPostCallback Callback, object? State)> callbacks = new();
        public override void Post(SendOrPostCallback callback, object? state) => callbacks.Add((callback, state));
        public void Run()
        {
            foreach (var (callback, state) in callbacks.GetConsumingEnumerable()) callback(state);
        }
        public void Complete() => callbacks.CompleteAdding();
        public void Dispose() => callbacks.Dispose();
    }
}
