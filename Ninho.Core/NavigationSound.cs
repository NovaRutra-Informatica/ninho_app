namespace Ninho.Core;

public sealed class NavigationSoundGate
{
    private TimeSpan lastPlayed = TimeSpan.MinValue;
    public bool TryPlay(TimeSpan now, bool enabled, bool active, bool playing)
    {
        if (!enabled || !active || playing || lastPlayed != TimeSpan.MinValue && now - lastPlayed < TimeSpan.FromMilliseconds(140)) return false;
        lastPlayed = now;
        return true;
    }
}

public static class NavigationSound
{
    public const int SampleRate = 22050;
    public const double DurationSeconds = .07;
    public const double Frequency = 720;
    public static byte[] WaveData()
    {
        var count = (int)(SampleRate * DurationSeconds);
        using var stream = new MemoryStream(44 + count * 2);
        using var writer = new BinaryWriter(stream);
        writer.Write("RIFF"u8); writer.Write(36 + count * 2); writer.Write("WAVEfmt "u8); writer.Write(16);
        writer.Write((short)1); writer.Write((short)1); writer.Write(SampleRate); writer.Write(SampleRate * 2); writer.Write((short)2); writer.Write((short)16);
        writer.Write("data"u8); writer.Write(count * 2);
        for (var i = 0; i < count; i++)
        {
            var envelope = Math.Pow(Math.Sin(Math.PI * i / (count - 1)), 2);
            var phase = 2 * Math.PI * Frequency * i / SampleRate;
            writer.Write((short)Math.Round((Math.Sin(phase) + .12 * Math.Sin(2 * phase)) * envelope * .10 * short.MaxValue));
        }
        return stream.ToArray();
    }
}
