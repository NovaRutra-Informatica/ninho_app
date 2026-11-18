using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace Ninho.Licensing.Windows;

public sealed class ProtectedLicenseFile(string directory)
{
    private const int MaximumBytes = 65_536;
    private readonly string path = Path.Combine(Path.GetFullPath(directory), "purchase.dat");
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Ninho.Windows.Purchase.v1");

    public async Task<string?> ReadAsync(CancellationToken cancellationToken = default)
    {
        CheckPath();
        if (!File.Exists(path)) return null;
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
        if (stream.Length is <= 0 or > MaximumBytes) throw new InvalidDataException("O comprovante local está inválido.");
        var bytes = new byte[checked((int)stream.Length)];
        await stream.ReadExactlyAsync(bytes, cancellationToken);
        var plain = Transform(bytes, false);
        try { return new UTF8Encoding(false, true).GetString(plain); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    public async Task WriteAsync(string token, CancellationToken cancellationToken = default)
    {
        var plain = Encoding.UTF8.GetBytes(token);
        if (plain.Length is <= 0 or > MaximumBytes / 2) throw new InvalidDataException("O comprovante ultrapassa o tamanho permitido.");
        byte[] protectedBytes;
        try { protectedBytes = Transform(plain, true); }
        finally { CryptographicOperations.ZeroMemory(plain); }
        CheckPath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        CheckPath();
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await output.WriteAsync(protectedBytes, cancellationToken);
                output.Flush(true);
            }
            cancellationToken.ThrowIfCancellationRequested();
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    private void CheckPath()
    {
        for (var entry = new DirectoryInfo(Path.GetDirectoryName(path)!); entry != null; entry = entry.Parent)
            if (entry.Exists && (entry.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("A pasta da licença não pode ser um link ou redirecionamento.");
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("O comprovante da licença não pode ser um link.");
    }

    private static byte[] Transform(byte[] input, bool protect)
    {
        var source = new Blob { Length = input.Length, Data = Marshal.AllocHGlobal(input.Length) };
        var entropy = new Blob { Length = Entropy.Length, Data = Marshal.AllocHGlobal(Entropy.Length) };
        var output = new Blob();
        try
        {
            Marshal.Copy(input, 0, source.Data, input.Length);
            Marshal.Copy(Entropy, 0, entropy.Data, Entropy.Length);
            var success = protect
                ? CryptProtectData(ref source, null, ref entropy, IntPtr.Zero, IntPtr.Zero, 1, out output)
                : CryptUnprotectData(ref source, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!success) throw new CryptographicException("O Windows não conseguiu proteger ou abrir este comprovante.", new Win32Exception(Marshal.GetLastWin32Error()));
            if (output.Length is <= 0 or > MaximumBytes) throw new InvalidDataException("O comprovante protegido está inválido.");
            var result = new byte[output.Length];
            Marshal.Copy(output.Data, result, 0, result.Length);
            return result;
        }
        finally
        {
            Marshal.Copy(new byte[input.Length], 0, source.Data, input.Length);
            Marshal.FreeHGlobal(source.Data);
            Marshal.FreeHGlobal(entropy.Data);
            if (output.Data != IntPtr.Zero) LocalFree(output.Data);
        }
    }

    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref Blob input, string? description, ref Blob entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, ref Blob entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
}
