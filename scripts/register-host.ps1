# Enregistre (ou retire avec -Unregister) l'hôte Native Messaging de Calti pour Brave.
# Portée : utilisateur courant uniquement (HKCU), aucun droit administrateur requis.
param(
    [ValidateSet("debug", "release")] [string] $Configuration = "debug",
    [switch] $Unregister
)

$ErrorActionPreference = "Stop"
$name = "com.calti.host"
$extensionId = "djgdkiajnehmpnnnanbojdmgndcmendg"
# Brave 156 contient les clés Chrome et Chromium dans chrome.dll ; un Brave neuf trouve l’hôte ainsi enregistré.
# On enregistre aux trois emplacements possibles ; allowed_origins limite l'accès à l'extension Calti.
$regKeys = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name",
    "HKCU:\Software\Chromium\NativeMessagingHosts\$name",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$name"
)
$manifestDir = Join-Path $env:LOCALAPPDATA "Calti"
$manifestPath = Join-Path $manifestDir "$name.json"

if ($Unregister) {
    $regKeys | ForEach-Object { Remove-Item -Path $_ -ErrorAction SilentlyContinue }
    Remove-Item -Path $manifestPath -ErrorAction SilentlyContinue
    Write-Host "Hôte $name retiré."
    return
}

$hostExe = Join-Path (Resolve-Path "$PSScriptRoot\..") "target\$Configuration\calti-host.exe"
if (-not (Test-Path $hostExe)) {
    throw "Introuvable : $hostExe. Lancer d'abord 'cargo build -p calti-host'."
}

New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null
$manifest = [ordered]@{
    name            = $name
    description     = "Relais entre Brave et Calti"
    path            = $hostExe
    type            = "stdio"
    allowed_origins = @("chrome-extension://$extensionId/")
}
# UTF-8 sans BOM : le chemin du projet contient des caractères accentués.
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))

foreach ($key in $regKeys) {
    New-Item -Path $key -Force | Out-Null
    Set-Item -Path $key -Value $manifestPath
}

Write-Host "Hôte $name enregistré :"
Write-Host "  manifeste : $manifestPath"
Write-Host "  exécutable : $hostExe"
