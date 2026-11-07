# Helper Win32 do AI Tamagotchi: lista janelas de terminal (Windows Terminal e console cmd/PowerShell) e suas
# posições. Emite uma linha JSON quando algo muda. NÃO lê o conteúdo do terminal: só classe, título, PID,
# nome do processo e retângulo. Encerra sozinho se o processo pai (Electron) sumir.
param([switch]$Once, [int]$IntervalMs = 200, [int]$ParentPid = 0)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class TamaWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
  public class Info { public long Hwnd; public uint Pid; public string Cls; public string Title; public int X, Y, W, H; public bool Fg; }
  // Per-monitor DPI v2: sem isso o Windows entrega retângulos "virtualizados" em telas com escala.
  public static void InitDpi() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { } }
  public static List<Info> Terminals() {
    List<Info> list = new List<Info>();
    IntPtr fg = GetForegroundWindow();
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      StringBuilder cls = new StringBuilder(256); GetClassName(h, cls, 256);
      string c = cls.ToString();
      if (c != "CASCADIA_HOSTING_WINDOW_CLASS" && c != "ConsoleWindowClass") return true;
      int cloaked = 0; DwmGetWindowAttribute(h, 14, out cloaked, 4);       // DWMWA_CLOAKED (outro desktop virtual)
      if (cloaked != 0) return true;
      RECT r;
      // DWMWA_EXTENDED_FRAME_BOUNDS = borda visível (GetWindowRect inclui ~7px invisíveis no Win10/11)
      if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) { if (!GetWindowRect(h, out r)) return true; }
      StringBuilder t = new StringBuilder(512); GetWindowText(h, t, 512);
      uint pid; GetWindowThreadProcessId(h, out pid);
      Info i = new Info();
      i.Hwnd = h.ToInt64(); i.Pid = pid; i.Cls = c; i.Title = t.ToString();
      i.X = r.Left; i.Y = r.Top; i.W = r.Right - r.Left; i.H = r.Bottom - r.Top; i.Fg = (h == fg);
      list.Add(i);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
'@
[TamaWin]::InitDpi()

$procNames = @{}   # cache pid -> nome do processo (evita Get-Process a cada varredura)
function Get-Snapshot {
  $items = @()
  foreach ($t in [TamaWin]::Terminals()) {
    $proc = $procNames[[int]$t.Pid]
    if ($null -eq $proc) { try { $proc = (Get-Process -Id $t.Pid -ErrorAction Stop).ProcessName } catch { $proc = '' }; $procNames[[int]$t.Pid] = $proc }
    $items += @{ hwnd = $t.Hwnd; pid = [int]$t.Pid; cls = $t.Cls; process = $proc; title = $t.Title; x = $t.X; y = $t.Y; width = $t.W; height = $t.H; foreground = $t.Fg }
  }
  return (ConvertTo-Json -InputObject @{ terminals = $items } -Compress -Depth 4)
}

if ($Once) { Write-Output (Get-Snapshot); exit 0 }

$last = ''; $lastAt = [DateTime]::UtcNow
while ($true) {
  if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit 0 }
  $json = Get-Snapshot
  $now = [DateTime]::UtcNow
  # Só emite quando muda (ou como batimento a cada 4 s).
  if ($json -ne $last -or ($now - $lastAt).TotalSeconds -ge 4) {
    Write-Output $json; [Console]::Out.Flush(); $last = $json; $lastAt = $now
  }
  Start-Sleep -Milliseconds $IntervalMs
}
