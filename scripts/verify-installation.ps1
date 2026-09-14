<#
.SYNOPSIS
Checks the installed Ninho without launching or changing it.
.DESCRIPTION
Reads files, HKCU uninstall registration and shortcut properties. The only write
is a JSON report under this project's .cache directory. Exit 0 means every
required check passed; exit 1 means a failed check or an unexpected error.
.EXAMPLE
pwsh -NoProfile -File .\scripts\verify-installation.ps1
.EXAMPLE
pwsh -NoProfile -File .\scripts\verify-installation.ps1 -ReportPath .cache\installation-verification-1.1.1.json
#>
[CmdletBinding()]
param(
  [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\Ninho'),
  [string]$ReportPath = '',
  [string]$ProjectDirectory = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath($ProjectDirectory)
$installPath = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\', '/')
$cachePath = [IO.Path]::GetFullPath((Join-Path $projectPath '.cache'))
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $cachePath ('installation-verification-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '.json')
} elseif (-not [IO.Path]::IsPathRooted($ReportPath)) {
  $ReportPath = Join-Path $projectPath $ReportPath
}
$reportFile = [IO.Path]::GetFullPath($ReportPath)

# Even a custom report destination may write only beneath .cache. Reject links
# in that destination so writing the report cannot redirect to user data.
if (-not $reportFile.StartsWith($cachePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($reportFile) -ne '.json') {
  Write-Error 'The report must be a JSON file inside this project''s .cache directory.' -ErrorAction Continue
  exit 1
}
$candidate = $reportFile
while ($candidate.Length -ge $cachePath.Length) {
  if (Test-Path -LiteralPath $candidate) {
    $item = Get-Item -LiteralPath $candidate -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      Write-Error 'The report destination must not contain symbolic links or junctions.' -ErrorAction Continue
      exit 1
    }
  }
  if ($candidate.Equals($cachePath, [StringComparison]::OrdinalIgnoreCase)) { break }
  $candidate = [IO.Path]::GetDirectoryName($candidate)
}

$checks = New-Object 'System.Collections.Generic.List[object]'
$details = [ordered]@{}
$report = [ordered]@{
  checkedAtUtc = [DateTime]::UtcNow.ToString('o')
  projectDirectory = $projectPath
  installDirectory = $installPath
  reportPath = $reportFile
  readOnlyVerification = $true
  expectedVersion = $null
  passed = $false
  checks = @()
  details = $details
}

function Add-Check([string]$Name, [bool]$Passed, $Expected, $Actual) {
  $checks.Add([ordered]@{ name = $Name; status = $(if ($Passed) { 'passed' } else { 'failed' }); expected = $Expected; actual = $Actual })
}
function Add-Unavailable([string]$Name, [string]$Reason) {
  $checks.Add([ordered]@{ name = $Name; status = 'unavailable'; reason = $Reason })
}
function Same-Path([string]$First, [string]$Second) {
  if ([string]::IsNullOrWhiteSpace($First) -or [string]::IsNullOrWhiteSpace($Second)) { return $false }
  try {
    $one = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($First.Trim('"'))).TrimEnd('\', '/')
    $two = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Second.Trim('"'))).TrimEnd('\', '/')
    return $one.Equals($two, [StringComparison]::OrdinalIgnoreCase)
  } catch { return $false }
}
function File-Hash([string]$File) {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { return $null }
  return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Version-Matches([string]$Actual, [string]$Expected) {
  # Windows file versions commonly append a zero revision to the package version.
  return $Actual -eq $Expected -or $Actual -eq ($Expected + '.0')
}
function Command-Executable([string]$CommandLine) {
  if ($CommandLine -match '^\s*"([^"]+)"') { return $Matches[1] }
  if ($CommandLine -match '^\s*(.+?\.exe)(?:\s|$)') { return $Matches[1] }
  return ''
}
function Icon-Reference([string]$Value) {
  $iconPath = $Value
  $index = 0
  if ($Value -match '^(.*),\s*(-?\d+)\s*$') { $iconPath = $Matches[1]; $index = [int]$Matches[2] }
  return [pscustomobject]@{ path = $iconPath.Trim().Trim('"'); index = $index }
}
function Release-Com($Value) {
  if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
  }
}

try {
  $package = Get-Content -LiteralPath (Join-Path $projectPath 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = [string]$package.version
  $product = [string]$package.build.productName
  if (-not $product) { $product = [string]$package.productName }
  if (-not $version -or -not $product -or -not $package.build.appId) { throw 'package.json is missing version, productName or build.appId.' }
  $appId = [string]$package.build.appId
  $shortcutName = [string]$package.build.nsis.shortcutName
  if (-not $shortcutName) { $shortcutName = $product }
  $uninstallName = [string]$package.build.nsis.uninstallDisplayName
  if (-not $uninstallName) { $uninstallName = $product }
  $report.expectedVersion = $version
  $releasePath = Join-Path $projectPath 'release\win-unpacked'
  $executable = Join-Path $installPath ($product + '.exe')
  $releaseExecutable = Join-Path $releasePath ($product + '.exe')
  Add-Check 'installed executable exists' (Test-Path -LiteralPath $executable -PathType Leaf) $executable (Test-Path -LiteralPath $executable -PathType Leaf)
  if (Test-Path -LiteralPath $executable -PathType Leaf) {
    $metadata = [Diagnostics.FileVersionInfo]::GetVersionInfo($executable)
    $details.executable = [ordered]@{ path = $executable; productName = $metadata.ProductName; fileDescription = $metadata.FileDescription; productVersion = $metadata.ProductVersion; fileVersion = $metadata.FileVersion; sha256 = (File-Hash $executable) }
    Add-Check 'executable ProductName' ($metadata.ProductName -eq $product) $product $metadata.ProductName
    Add-Check 'executable FileDescription' ($metadata.FileDescription -eq $product) $product $metadata.FileDescription
    Add-Check 'executable ProductVersion' (Version-Matches $metadata.ProductVersion $version) $version $metadata.ProductVersion
    Add-Check 'executable FileVersion' (Version-Matches $metadata.FileVersion $version) $version $metadata.FileVersion
    $releaseExeHash = File-Hash $releaseExecutable
    Add-Check 'executable matches current unpacked release' ($null -ne $releaseExeHash -and $details.executable.sha256 -eq $releaseExeHash) $releaseExeHash $details.executable.sha256
  }

  $installedAsar = Join-Path $installPath 'resources\app.asar'
  $releaseAsar = Join-Path $releasePath 'resources\app.asar'
  $installedAsarHash = File-Hash $installedAsar
  $releaseAsarHash = File-Hash $releaseAsar
  $details.appAsar = [ordered]@{ installedPath = $installedAsar; releasePath = $releaseAsar; installedSha256 = $installedAsarHash; releaseSha256 = $releaseAsarHash }
  Add-Check 'app.asar matches current unpacked release' ($null -ne $installedAsarHash -and $null -ne $releaseAsarHash -and $installedAsarHash -eq $releaseAsarHash) $releaseAsarHash $installedAsarHash

  $installedIcon = Join-Path $installPath 'uninstallerIcon.ico'
  $sourceIcon = Join-Path $projectPath 'resources\icon.ico'
  $installedIconHash = File-Hash $installedIcon
  $sourceIconHash = File-Hash $sourceIcon
  $details.uninstallerIcon = [ordered]@{ installedPath = $installedIcon; sourcePath = $sourceIcon; installedSha256 = $installedIconHash; sourceSha256 = $sourceIconHash }
  Add-Check 'uninstaller icon matches project icon' ($null -ne $installedIconHash -and $null -ne $sourceIconHash -and $installedIconHash -eq $sourceIconHash) $sourceIconHash $installedIconHash

  $registrations = New-Object 'System.Collections.Generic.List[object]'
  foreach ($registryPath in @('Software\Microsoft\Windows\CurrentVersion\Uninstall', 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    $registry = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryPath, $false)
    if ($null -eq $registry) { continue }
    try {
      foreach ($keyName in $registry.GetSubKeyNames()) {
        $entry = $registry.OpenSubKey($keyName, $false)
        if ($null -eq $entry) { continue }
        try {
          if ([string]$entry.GetValue('DisplayName') -ne $uninstallName) { continue }
          $registrations.Add([ordered]@{ key = ('HKCU\' + $registryPath + '\' + $keyName); name = [string]$entry.GetValue('DisplayName'); version = [string]$entry.GetValue('DisplayVersion'); installLocation = [string]$entry.GetValue('InstallLocation'); uninstallString = [string]$entry.GetValue('UninstallString'); displayIcon = [string]$entry.GetValue('DisplayIcon') })
        } finally { $entry.Close() }
      }
    } finally { $registry.Close() }
  }
  $details.uninstallRegistration = @($registrations.ToArray())
  Add-Check 'one HKCU uninstall registration' ($registrations.Count -eq 1) 1 $registrations.Count
  foreach ($entry in $registrations) {
    $uninstaller = Command-Executable $entry.uninstallString
    $uninstallerDirectory = $(if ($uninstaller) { [IO.Path]::GetDirectoryName($uninstaller) } else { '' })
    $uninstallerExists = -not [string]::IsNullOrWhiteSpace($uninstaller) -and (Test-Path -LiteralPath $uninstaller -PathType Leaf)
    $icon = Icon-Reference $entry.displayIcon
    Add-Check 'uninstall registration version' ($entry.version -eq $version) $version $entry.version
    Add-Check 'uninstaller points to installed directory' (Same-Path $uninstallerDirectory $installPath) $installPath $uninstaller
    Add-Check 'registered uninstaller exists' $uninstallerExists $true $uninstallerExists
    Add-Check 'registration display icon' ((Same-Path $icon.path $installedIcon) -and $icon.index -eq 0) $installedIcon $entry.displayIcon
    # electron-builder stores InstallLocation in a companion key on some NSIS versions;
    # when absent here, UninstallString and DisplayIcon still validate the target directory.
    if ($entry.installLocation) { Add-Check 'registration InstallLocation' (Same-Path $entry.installLocation $installPath) $installPath $entry.installLocation }
  }

  $shortcuts = New-Object 'System.Collections.Generic.List[object]'
  $wscript = $null
  $shell = $null
  try {
    $wscript = New-Object -ComObject WScript.Shell
    try { $shell = New-Object -ComObject Shell.Application } catch { Add-Unavailable 'shortcut AppUserModelID access' $_.Exception.Message }
    $locations = [ordered]@{ desktop = [Environment]::GetFolderPath('DesktopDirectory'); startMenu = [Environment]::GetFolderPath('Programs') }
    foreach ($kind in $locations.Keys) {
      $shortcutFile = Join-Path $locations[$kind] ($shortcutName + '.lnk')
      $exists = Test-Path -LiteralPath $shortcutFile -PathType Leaf
      Add-Check ($kind + ' shortcut exists') $exists $shortcutFile $exists
      if (-not $exists) { continue }
      $link = $null; $folder = $null; $shellItem = $null
      try {
        # CreateShortcut reads the existing .lnk; Save is deliberately never called.
        $link = $wscript.CreateShortcut($shortcutFile)
        $icon = Icon-Reference ([string]$link.IconLocation)
        $properties = [ordered]@{ location = $kind; path = $shortcutFile; target = [string]$link.TargetPath; iconLocation = [string]$link.IconLocation; arguments = [string]$link.Arguments; workingDirectory = [string]$link.WorkingDirectory; appUserModelId = $null; appUserModelIdAccessible = $false }
        Add-Check ($kind + ' shortcut target') (Same-Path $properties.target $executable) $executable $properties.target
        Add-Check ($kind + ' shortcut icon') ((Same-Path $icon.path $executable) -and $icon.index -eq 0) ($executable + ',0') $properties.iconLocation
        Add-Check ($kind + ' shortcut arguments') ([string]::IsNullOrWhiteSpace($properties.arguments)) '' $properties.arguments
        if ($null -ne $shell) {
          try {
            $folder = $shell.NameSpace([IO.Path]::GetDirectoryName($shortcutFile))
            $shellItem = $folder.ParseName([IO.Path]::GetFileName($shortcutFile))
            if ($null -eq $shellItem) { throw 'Windows could not expose the shortcut property store.' }
            $properties.appUserModelId = [string]$shellItem.ExtendedProperty('System.AppUserModel.ID')
            $properties.appUserModelIdAccessible = $true
            Add-Check ($kind + ' shortcut AppUserModelID') ($properties.appUserModelId -eq $appId) $appId $properties.appUserModelId
          } catch { Add-Unavailable ($kind + ' shortcut AppUserModelID') $_.Exception.Message }
        }
        $shortcuts.Add($properties)
      } finally { Release-Com $shellItem; Release-Com $folder; Release-Com $link }
    }
  } finally { Release-Com $shell; Release-Com $wscript }
  $details.shortcuts = @($shortcuts.ToArray())

  $stateFile = Join-Path (Join-Path $env:APPDATA $product) 'state.json'
  $details.state = [ordered]@{ path = $stateFile; exists = (Test-Path -LiteralPath $stateFile -PathType Leaf) }
  Add-Check 'state.json exists' $details.state.exists $true $details.state.exists
  if ($details.state.exists) {
    $stateBefore = Get-Item -LiteralPath $stateFile
    if ($stateBefore.Length -gt 32MB) { throw 'state.json exceeds the supported 32 MiB metadata size.' }
    $beforeHash = File-Hash $stateFile
    $state = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $counts = [ordered]@{}
    foreach ($collection in @('programs', 'subjects', 'courses', 'lessons', 'cards', 'materials', 'exams', 'tasks', 'sessions')) {
      $property = $state.PSObject.Properties[$collection]
      $counts[$collection] = $(if ($null -ne $property -and $null -ne $property.Value) { @($property.Value).Count } else { 0 })
    }
    $seed = Get-Content -LiteralPath (Join-Path $projectPath 'resources\seed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $afterHash = File-Hash $stateFile
    $stateAfter = Get-Item -LiteralPath $stateFile
    $details.state.version = $state.version
    $details.state.counts = $counts
    $details.state.bytes = $stateBefore.Length
    $details.state.sha256Before = $beforeHash
    $details.state.sha256After = $afterHash
    $details.state.lastWriteTimeUtcBefore = $stateBefore.LastWriteTimeUtc.ToString('o')
    $details.state.lastWriteTimeUtcAfter = $stateAfter.LastWriteTimeUtc.ToString('o')
    Add-Check 'state schema version' ($state.version -eq $seed.version) $seed.version $state.version
    $preserved = $beforeHash -eq $afterHash -and $stateBefore.Length -eq $stateAfter.Length -and $stateBefore.LastWriteTimeUtc -eq $stateAfter.LastWriteTimeUtc
    Add-Check 'state.json preserved during verification' $preserved $beforeHash $afterHash
  }
} catch {
  Add-Check 'verification completed without unexpected errors' $false 'No error' $_.Exception.Message
}

$report.checks = @($checks.ToArray())
$report.passed = @($checks | Where-Object { $_.status -eq 'failed' }).Count -eq 0
$report.completedAtUtc = [DateTime]::UtcNow.ToString('o')
try {
  # This is the only intentional filesystem mutation in the verification.
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportFile))
  [IO.File]::WriteAllText($reportFile, ($report | ConvertTo-Json -Depth 15), (New-Object Text.UTF8Encoding($false)))
} catch {
  Write-Error ('Could not write verification report: ' + $_.Exception.Message) -ErrorAction Continue
  exit 1
}
Write-Output ('Report: ' + $reportFile)
Write-Output ('Passed: ' + $report.passed)
if (-not $report.passed) {
  foreach ($failure in @($checks | Where-Object { $_.status -eq 'failed' })) { Write-Output ('FAIL: ' + $failure.name) }
  exit 1
}
exit 0
