# Lance une instance d'essai de Calti, isolée de celle de l'utilisateur, et y joue un scénario de test.
#   powershell -File scripts\tests\run.ps1 features.test.cjs
# L'instance a son propre dossier WebView2 (réglages, sessions) et le profil jetable « essai » ; elle ne touche
# ni aux profils ni à la session de l'utilisateur, et ignore l'instance unique (elle peut tourner à côté).
param(
    [Parameter(Mandatory = $true)][string]$Test,
    [string]$Exe = "",
    [string[]]$AppArgs = @()
)
$ErrorActionPreference = "Stop"
# Par défaut : la version compilée du dépôt (deux dossiers au-dessus de ce script).
if (-not $Exe) { $Exe = Join-Path (Split-Path (Split-Path $PSScriptRoot)) "target\release\calti.exe" }
if (-not (Test-Path $Exe)) { throw "Introuvable : $Exe (compiler d'abord : cd app; npx tauri build --no-bundle)" }

$data = Join-Path $env:TEMP "calti-essai-$(Get-Random)"
New-Item -ItemType Directory -Path $data | Out-Null
$env:WEBVIEW2_USER_DATA_FOLDER = $data
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9334"
$argList = @($AppArgs | Where-Object { $_ })
$process = if ($argList.Count) { Start-Process $Exe -ArgumentList $argList -PassThru } else { Start-Process $Exe -PassThru }
$env:CALTI_PID = $process.Id
try {
    node --experimental-websocket (Join-Path $PSScriptRoot $Test)
    $code = $LASTEXITCODE
} finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    try { Remove-Item -LiteralPath (Get-Item -LiteralPath $data).FullName -Recurse -Force } catch { }
}
exit $code
