using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace Ninho.LicenseServer;

public static class OperatorFiles
{
    // Operators supply a dedicated directory. Do not inherit broad read access
    // for signing keys, activation codes, or the licensing database.
    public static string RequirePrivatePath(string path, bool fileMustExist = false)
    {
        if (!Path.IsPathFullyQualified(path)) throw new ArgumentException("An absolute private path is required.");
        var full = Path.GetFullPath(path);
        var parent = Path.GetDirectoryName(full)!;
        if (!Directory.Exists(parent) || fileMustExist && !File.Exists(full)) throw new IOException("The private path is unavailable.");
        CheckAccess(new DirectoryInfo(parent));
        if (File.Exists(full)) CheckAccess(new FileInfo(full));
        return full;
    }
    private static void CheckAccess(FileSystemInfo item)
    {
        if ((item.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Private files must not be links.");
        if (OperatingSystem.IsWindows())
        {
            FileSystemSecurity security = item is DirectoryInfo directory ? directory.GetAccessControl() : ((FileInfo)item).GetAccessControl();
            var broad = new HashSet<string>(StringComparer.Ordinal) { "S-1-1-0", "S-1-5-11", "S-1-5-32-545", "S-1-5-32-546" };
            foreach (FileSystemAccessRule rule in security.GetAccessRules(true, true, typeof(SecurityIdentifier)))
                if (rule.AccessControlType == AccessControlType.Allow && broad.Contains(rule.IdentityReference.Value) && (rule.FileSystemRights & (FileSystemRights.ReadData | FileSystemRights.WriteData | FileSystemRights.CreateFiles | FileSystemRights.ChangePermissions)) != 0) throw new UnauthorizedAccessException("Remove broad access from the private directory and files.");
        }
        else
        {
            var permissions = File.GetUnixFileMode(item.FullName);
            if ((permissions & (UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute)) != 0) throw new UnauthorizedAccessException("Private paths require owner-only permissions.");
        }
    }
    public static async Task WriteNewAsync(string path, string content, CancellationToken cancellationToken = default)
    {
        var full = RequirePrivatePath(path);
        var options = new FileStreamOptions
        {
            Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None, Options = FileOptions.WriteThrough
        };
        if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        await using var stream = new FileStream(full, options);
        await stream.WriteAsync(Encoding.UTF8.GetBytes(content), cancellationToken);
        stream.Flush(true);
    }
}
