@echo off
setlocal
cd /d "%~dp0"

echo.
echo  COLONIA 42 - MARTE
echo  Iniciando servidor local em http://127.0.0.1:8080/
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo  Python nao encontrado.
  echo  Instale Python 3 ou rode manualmente: npx serve .
  echo.
  pause
  exit /b 1
)

start "Colonia 42 - servidor" /min cmd /c "python -m http.server 8080"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080/"

echo  Servidor iniciado. Feche a janela minimizada para encerrar.
timeout /t 4 /nobreak >nul
exit /b 0
