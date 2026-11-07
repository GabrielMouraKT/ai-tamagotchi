' Abre o AI Tamagotchi SEM janela de terminal (duplo clique). Usa o Electron direto (aplicativo gráfico, sem console).
Option Explicit
Dim fso, sh, dir, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Falta instalar os componentes (uma vez só)." & vbCrLf & "Abra a pasta no PowerShell e rode: npm install", 48, "AI Tamagotchi"
Else
  sh.CurrentDirectory = dir
  ' 1 = janela normal do app (o Electron não cria console); nada de cmd/PowerShell visível.
  sh.Run """" & exe & """ """ & dir & "\electron\main.cjs""", 1, False
End If
