<#
  Uninstall Scranton Branch WITHOUT running its uninstaller.

  The NSIS uninstaller is unsigned and runs from %TEMP% on upgrades, which
  endpoint security (Cortex XDR and similar) blocks. This does the same job
  with Windows' own tools: close the app, delete its program folder, its
  "Apps & features" entry and its shortcuts. Your settings, offices and keys
  (%APPDATA%\Scranton Branch) are KEPT unless you pass -RemoveUserData.

  After this, the new installer finds no previous version, so it never runs
  the old uninstaller either.

  Usage (double-click uninstall-scranton-branch.cmd, or):
    powershell -NoProfile -ExecutionPolicy Bypass -File uninstall-scranton-branch.ps1 [-WhatIf] [-RemoveUserData]
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$RemoveUserData)

$ErrorActionPreference = 'Stop'
$name = 'Scranton Branch'
# Never stand inside the folder being removed (a shell whose current folder is
# in it keeps it "in use").
Set-Location -LiteralPath $env:TEMP

# 1. Close the app (every process from its folder).
Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
  if ($PSCmdlet.ShouldProcess("$($_.Name) ($($_.Id))", 'Stop process')) { $_ | Stop-Process -Force }
}
Start-Sleep -Milliseconds 800

# 2. Find its uninstall entries (per-user install, or per-machine).
$roots = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
         'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
         'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
$entries = @(Get-ChildItem $roots -ErrorAction SilentlyContinue |
  Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName -like "$name*" })

function Get-InstallDir($p) {
  if ($p.InstallLocation) { return $p.InstallLocation.Trim('"') }
  foreach ($v in @($p.UninstallString, $p.DisplayIcon)) {
    if ($v) {
      $exe = ($v -replace '^"([^"]+)".*$', '$1') -replace ',\d+$', ''
      if ($exe) { return Split-Path $exe }
    }
  }
  return $null
}

$dirs = @()
foreach ($e in $entries) {
  $p = Get-ItemProperty $e.PSPath
  $d = Get-InstallDir $p
  Write-Host "Found: $($p.DisplayName) $($p.DisplayVersion)  ->  $d"
  if ($d) { $dirs += $d }
}
# The default per-user location, in case the entry is already gone.
$dirs += Join-Path $env:LOCALAPPDATA "Programs\$name"
$dirs = $dirs | Where-Object { $_ } | Select-Object -Unique

# 3. Delete the program folder(s). Refuse anything that is not clearly the app's own folder.
foreach ($d in $dirs) {
  if (-not (Test-Path -LiteralPath $d)) { continue }
  $leaf = Split-Path $d -Leaf
  if ($leaf -notlike "*$name*" -and $leaf -notlike '*scranton*') {
    Write-Warning "Skipping $d (does not look like the app's folder)"; continue
  }
  if (-not $PSCmdlet.ShouldProcess($d, 'Delete folder')) { continue }
  # Anything still running from the folder keeps it in use: the app's helper
  # processes, a terminal or agent it started from there.
  $prefix = (Resolve-Path -LiteralPath $d).Path.TrimEnd('\') + '\'
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $p = $null; try { $p = $_.Path } catch {}
    $p -and $p.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and $_.Id -ne $PID
  } | ForEach-Object { Write-Host "Closing $($_.Name) ($($_.Id))"; $_ | Stop-Process -Force -ErrorAction SilentlyContinue }
  $done = $false
  for ($i = 1; $i -le 5 -and -not $done; $i++) {
    try { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction Stop; $done = $true }
    catch { Start-Sleep -Seconds 2 }
  }
  if ($done) { Write-Host "Deleted $d" }
  else {
    Write-Warning "Could not delete $d (something still has it open). Close any window or terminal opened from that folder, then run this again; the entry and shortcuts are removed anyway."
  }
}

# 4. Remove the "Apps & features" entries (HKLM ones need an administrator PowerShell).
foreach ($e in $entries) {
  if ($PSCmdlet.ShouldProcess($e.PSPath, 'Delete uninstall entry')) {
    try { Remove-Item -LiteralPath $e.PSPath -Recurse -Force; Write-Host "Removed entry $($e.PSChildName)" }
    catch { Write-Warning "Could not remove $($e.PSPath): $($_.Exception.Message) (run as administrator for a per-machine install)" }
  }
}

# 5. Shortcuts.
$links = @(
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$name.lnk"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Uninstall $name (without uninstaller).lnk"),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) "$name.lnk"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\$name.lnk"),
  (Join-Path $env:PUBLIC "Desktop\$name.lnk")
)
foreach ($l in $links) {
  if ((Test-Path -LiteralPath $l) -and $PSCmdlet.ShouldProcess($l, 'Delete shortcut')) {
    Remove-Item -LiteralPath $l -Force -ErrorAction SilentlyContinue; Write-Host "Deleted $l"
  }
}

# 6. Optional: your data (settings, offices list, encrypted keys, logs).
if ($RemoveUserData) {
  $data = Join-Path $env:APPDATA $name
  if ((Test-Path -LiteralPath $data) -and $PSCmdlet.ShouldProcess($data, 'Delete user data')) {
    Remove-Item -LiteralPath $data -Recurse -Force; Write-Host "Deleted $data"
  }
} else {
  Write-Host "Kept your data in $(Join-Path $env:APPDATA $name)"
}
Write-Host 'Done. You can now run the new installer.'
