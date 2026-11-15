# Respaldo del ayudante: si `ayudante.exe` no arranca (por ejemplo, falta .NET Framework 4),
# se compila el mismo `Ayudante.cs` en memoria con Add-Type y se corre desde PowerShell.
# Uso: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ayudante.ps1 <subcomando> ...
$ErrorActionPreference = 'Stop'
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'Ayudante.cs') -ReferencedAssemblies 'System.dll'
} catch {
  [Console]::Out.WriteLine('{"ok":false,"codigo":"DESCONOCIDO","mensaje":"No se pudo compilar el ayudante de respaldo"}')
  exit 1
}
exit ([MorphiqAyudante.Programa]::Ejecutar([string[]]$args))
