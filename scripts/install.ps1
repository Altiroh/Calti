# Installe (ou met à jour) la version autonome de Calti pour l'utilisateur courant.
# Prérequis : `cd app; npx tauri build --no-bundle` (produit target\release\calti.exe).
# Calti doit être fermé pendant la copie.
$ErrorActionPreference = "Stop"

$source = Join-Path (Resolve-Path "$PSScriptRoot\..") "target\release\calti.exe"
if (-not (Test-Path $source)) { throw "Introuvable : $source. Lancer d'abord 'npx tauri build --no-bundle' dans app\." }
if (Get-Process calti -ErrorAction SilentlyContinue) { throw "Calti est ouvert : le fermer avant la mise à jour." }

$dir = Join-Path $env:LOCALAPPDATA "Programs\Calti"
$exe = Join-Path $dir "calti.exe"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item $source $exe -Force

$shell = New-Object -ComObject WScript.Shell
function Set-Shortcut($path) {
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $exe
    $link.WorkingDirectory = $dir
    $link.IconLocation = "$exe,0"
    $link.Description = "Calti"
    $link.Save()
}

# Menu Démarrer (d'où l'on peut épingler Calti à la barre des tâches).
Set-Shortcut (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Calti.lnk")

# Icônes déjà épinglées vers une ancienne version (développement, ancien nom) : redirigées vers celle-ci.
$pins = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
Get-ChildItem $pins -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    $target = $shell.CreateShortcut($_.FullName).TargetPath
    if ($target -match "\\(calti|nopro[-_]cockpit)\.exe$" -and $target -ne $exe) {
        Set-Shortcut $_.FullName
        Write-Host "Icône épinglée redirigée : $($_.Name)"
    } elseif ($target -eq $exe) {
        # Réenregistrée pour que Windows relise l'icône de la nouvelle version (sinon elle reste en cache).
        Set-Shortcut $_.FullName
    }
}

# Icônes rafraîchies dans l'Explorateur et la barre des tâches (SHCNE_ASSOCCHANGED).
Add-Type 'using System; using System.Runtime.InteropServices; public static class CaltiShell { [DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b); }'
[CaltiShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host "Calti installé : $exe"
