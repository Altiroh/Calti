# Aide aux tests : la page web (vue native) d'une instance de Calti est-elle visible en ces points ?
#   region.ps1 -CaltiPid 1234 -Points "x1,y1;x2,y2"   (pixels physiques, relatifs au coin de la page)
# → JSON [true|false, …] : vrai = la page est visible (point dans sa région), faux = découpée (l'interface se voit).
param([int]$CaltiPid, [string]$Points)
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class R {
  public delegate bool Each(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Each f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Each f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr h, IntPtr rgn);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int a, int b, int c, int d);
  [DllImport("gdi32.dll")] public static extern bool PtInRegion(IntPtr rgn, int x, int y);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr o);
  public static List<IntPtr> Top() { var l = new List<IntPtr>(); EnumWindows((h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
  public static List<IntPtr> Children(IntPtr parent) { var l = new List<IntPtr>(); EnumChildWindows(parent, (h, p) => { l.Add(h); return true; }, IntPtr.Zero); return l; }
}
"@
$region = [R]::CreateRectRgn(0, 0, 0, 0)
$page = $null
foreach ($top in [R]::Top()) {
  $p = 0; [R]::GetWindowThreadProcessId($top, [ref]$p) | Out-Null
  if ($p -ne $CaltiPid -or -not [R]::IsWindowVisible($top)) { continue }
  foreach ($child in [R]::Children($top)) {
    # Région posée par Calti (coins arrondis, découpes) : 2 = simple, 3 = complexe.
    if ([R]::IsWindowVisible($child) -and [R]::GetWindowRgn($child, $region) -ge 2) { $page = $child; break }
  }
  if ($page) { break }
}
if (-not $page) { "null"; exit }
$result = foreach ($pt in $Points.Split(";")) { $x, $y = $pt.Split(",") | ForEach-Object { [int][double]$_ }; [R]::PtInRegion($region, $x, $y) }
[R]::DeleteObject($region) | Out-Null
ConvertTo-Json @($result) -Compress
