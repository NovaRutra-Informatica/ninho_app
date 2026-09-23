namespace Ninho.Core;

/// <summary>
/// Keeps edits in FIFO order until their persistence delegate confirms the commit.
/// A failed flush leaves the uncommitted entry and everything after it available for retry.
/// Call from the UI context when delegates update controls; the drain preserves that context.
/// Entries are retained in memory, not recoverable after a forced process termination.
/// </summary>
public sealed class RetainedSaveQueue
{
    private sealed record Entry(Func<Task> Persist, Action? AfterCommit);
    private readonly object gate = new();
    private readonly Queue<Entry> pending = new();
    private Task? running;

    public int PendingCount { get { lock (gate) return pending.Count; } }

    public void Enqueue(Func<Task> persist, Action? afterCommit = null)
    {
        ArgumentNullException.ThrowIfNull(persist);
        lock (gate) pending.Enqueue(new(persist, afterCommit));
    }

    public Task FlushAsync()
    {
        TaskCompletionSource completion;
        lock (gate)
        {
            if (running != null) return running;
            if (pending.Count == 0) return Task.CompletedTask;
            completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
            running = completion.Task;
        }
        _ = DrainAsync(completion);
        return completion.Task;
    }

    private async Task DrainAsync(TaskCompletionSource completion)
    {
        try
        {
            while (true)
            {
                Entry entry;
                lock (gate)
                {
                    if (pending.Count == 0)
                    {
                        running = null;
                        completion.SetResult();
                        return;
                    }
                    entry = pending.Peek();
                }
                await entry.Persist();
                // Persistence is already confirmed. An optional UI callback must never
                // cause this mutation to be written twice if that callback throws.
                lock (gate) pending.Dequeue();
                entry.AfterCommit?.Invoke();
            }
        }
        catch (Exception error)
        {
            lock (gate)
            {
                running = null;
                completion.SetException(error);
            }
        }
    }
}
