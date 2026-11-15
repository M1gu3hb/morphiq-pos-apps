@echo off
rem Diagnostico de un POS con Windows, SIN instalar nada (sirve tambien en Windows 7 y 8).
rem Deja "diagnostico-<equipo>.txt" en el escritorio y lo abre. Solo lee: no cambia nada.
rem (Con SIN_ABRIR=1 no abre el Bloc de notas ni espera una tecla: es para probarlo.)
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$os = Get-WmiObject Win32_OperatingSystem; $pc = Get-WmiObject Win32_ComputerSystem; $cpu = @(Get-WmiObject Win32_Processor)[0];" ^
  "$video = @(Get-WmiObject Win32_VideoController)[0];" ^
  "$lineas = @();" ^
  "$lineas += 'DIAGNOSTICO DE ESTE APARATO (Windows)';" ^
  "$lineas += ('Fecha: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'));" ^
  "$lineas += '';" ^
  "$lineas += ('Sistema: ' + $os.Caption + ' ' + $os.Version);" ^
  "$lineas += ('Bits: ' + $os.OSArchitecture);" ^
  "$lineas += ('Equipo: ' + $pc.Manufacturer + ' ' + $pc.Model);" ^
  "$lineas += ('RAM total (MB): ' + [math]::Round($pc.TotalPhysicalMemory / 1MB));" ^
  "$lineas += ('RAM libre (MB): ' + [math]::Round($os.FreePhysicalMemory / 1KB));" ^
  "$lineas += ('Procesador: ' + $cpu.Name.Trim() + ' (' + $cpu.NumberOfLogicalProcessors + ' nucleos)');" ^
  "$lineas += ('Pantalla: ' + $video.CurrentHorizontalResolution + ' x ' + $video.CurrentVerticalResolution);" ^
  "$lineas += '';" ^
  "$lineas += 'IMPRESORAS (nombre | puerto | driver | predeterminada)';" ^
  "foreach ($p in Get-WmiObject Win32_Printer) { $lineas += ('  ' + $p.Name + ' | ' + $p.PortName + ' | ' + $p.DriverName + ' | ' + $p.Default) };" ^
  "$lineas += '';" ^
  "$lineas += 'PUERTOS SERIE';" ^
  "foreach ($s in Get-WmiObject Win32_SerialPort) { $lineas += ('  ' + $s.DeviceID + ' | ' + $s.Description) };" ^
  "$carpeta = [Environment]::GetFolderPath('Desktop'); if (-not $carpeta -or -not (Test-Path $carpeta)) { $carpeta = $env:TEMP };" ^
  "$ruta = Join-Path $carpeta ('diagnostico-' + $env:COMPUTERNAME + '.txt');" ^
  "$lineas | Out-File -FilePath $ruta -Encoding UTF8;" ^
  "Write-Host ('Listo: ' + $ruta);" ^
  "if (-not $env:SIN_ABRIR) { Start-Process notepad $ruta }"
if errorlevel 1 echo No se pudo escribir el diagnostico. Toma una foto de esta ventana.
if not defined SIN_ABRIR pause
endlocal
