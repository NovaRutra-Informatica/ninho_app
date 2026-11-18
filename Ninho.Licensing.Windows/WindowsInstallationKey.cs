using System.Security.Cryptography;

namespace Ninho.Licensing.Windows;

public sealed class WindowsInstallationKey : IDisposable
{
    private readonly ECDsaCng signer;
    private readonly object sync = new();
    public bool HardwareBacked { get; }
    public byte[] PublicKeyBytes { get { lock (sync) return signer.ExportSubjectPublicKeyInfo(); } }

    private WindowsInstallationKey(CngKey key)
    {
        HardwareBacked = key.Provider == CngProvider.MicrosoftPlatformCryptoProvider;
        signer = new ECDsaCng(key);
    }

    public static WindowsInstallationKey Open(string keyName = "Ninho.License.Installation.v1", bool preferHardware = true)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(keyName);
        if (preferHardware)
        {
            try
            {
                if (CngKey.Exists(keyName, CngProvider.MicrosoftPlatformCryptoProvider))
                    return OpenExisting(keyName, CngProvider.MicrosoftPlatformCryptoProvider);
            }
            catch (CryptographicException) { }
        }
        if (CngKey.Exists(keyName, CngProvider.MicrosoftSoftwareKeyStorageProvider))
            return OpenExisting(keyName, CngProvider.MicrosoftSoftwareKeyStorageProvider);
        if (preferHardware)
        {
            try { return Create(keyName, CngProvider.MicrosoftPlatformCryptoProvider); }
            catch (CryptographicException) { }
        }
        return Create(keyName, CngProvider.MicrosoftSoftwareKeyStorageProvider);
    }

    private static WindowsInstallationKey OpenExisting(string name, CngProvider provider)
    {
        using var key = CngKey.Open(name, provider);
        if (key.Algorithm != CngAlgorithm.ECDsaP256 || key.ExportPolicy != CngExportPolicies.None)
            throw new CryptographicException("A identidade de ativação não corresponde ao formato protegido esperado.");
        return new WindowsInstallationKey(key);
    }

    private static WindowsInstallationKey Create(string name, CngProvider provider)
    {
        using var key = CngKey.Create(CngAlgorithm.ECDsaP256, name, new CngKeyCreationParameters
        {
            Provider = provider,
            ExportPolicy = CngExportPolicies.None,
            KeyUsage = CngKeyUsages.Signing,
            KeyCreationOptions = CngKeyCreationOptions.None
        });
        return new WindowsInstallationKey(key);
    }

    public byte[] Sign(byte[] payload) { lock (sync) return signer.SignData(payload, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation); }
    public void Dispose() { lock (sync) signer.Dispose(); }
}
