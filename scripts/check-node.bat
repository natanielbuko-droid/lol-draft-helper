@echo off
rem Wspolne sprawdzenie dla start.bat i demo.bat: Node.js w wersji 20.12+ oraz zainstalowane zaleznosci.
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Nie znaleziono Node.js.
  echo     Zainstaluj wersje LTS ze strony https://nodejs.org ^(otworze ja za chwile^),
  echo     a potem uruchom ten plik ponownie.
  start "" https://nodejs.org
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=12)?0:1)"
if errorlevel 1 (
  echo [!] Masz za stara wersje Node.js. Potrzebna jest 20.12 lub nowsza - pobierz LTS z https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Pierwsze uruchomienie - instaluje zaleznosci, to potrwa okolo minuty...
  call npm.cmd install --no-fund --no-audit
  if errorlevel 1 (
    echo [!] Instalacja nie powiodla sie - sprawdz polaczenie z internetem.
    pause
    exit /b 1
  )
)
exit /b 0
