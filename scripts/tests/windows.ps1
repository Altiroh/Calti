# Aide aux tests : fenêtres Windows d'un processus de Calti (outils de développement ancrés ou non) et capture d'écran.
#   windows.ps1 -CaltiPid 1234                → JSON { tools: [fenêtres DevTools de premier niveau], child: bool }
#   windows.ps1 -CaltiPid 1234 -Shot out.png  → capture de la fenêtre de Calti telle qu'affichée à l'écran
param([int]$CaltiPid, [string]$Shot = "")
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class W {
  public delegate bool Each(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Each f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Each f, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static string Title(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  public static List<IntPtr> Top() { var l = new List<IntPtr>(); EnumWindows((h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static List<IntPtr> Children(IntPtr parent) { var l = new List<IntPtr>(); EnumChildWindows(parent, (h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
}
"@
$top = [W]::Top()
$main = $top | Where-Object { $p = 0; [W]::GetWindowThreadProcessId($_, [ref]$p) | Out-Null; $p -eq $CaltiPid -and [W]::IsWindowVisible($_) -and [W]::Title($_) -like "Calti*" } | Select-Object -First 1
if ($Shot) {
    $r = New-Object W+RECT
    [W]::GetWindowRect($main, [ref]$r) | Out-Null
    $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
    $bmp.Save($Shot)
    exit
}
# Outils des pages seulement (ceux de l’interface d’un autre Calti ouvert ne comptent pas).
$tools = @($top | Where-Object { [W]::IsWindowVisible($_) -and [W]::Title($_) -like "DevTools*" -and [W]::Title($_) -notlike "*tauri.localhost*" } | ForEach-Object { [W]::Title($_) })
$child = @([W]::Children($main) | Where-Object { [W]::Title($_) -like "DevTools*" -and [W]::IsWindowVisible($_) }).Count -gt 0
@{ tools = $tools; child = $child } | ConvertTo-Json -Compress
