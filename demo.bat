@echo off
setlocal
cd /d "%~dp0"
title LoL Draft Helper - DEMO

rem Tryb demo: symulowany champ select, gra nie jest potrzebna.
rem Najpierw sprawdzamy, czy obok sa pozostale pliki aplikacji (np. uruchomienie prosto z ZIP-a).
if not exist "%~dp0package.json" goto :not_extracted
if not exist "%~dp0scripts\check-node.bat" goto :not_extracted

call "%~dp0scripts\check-node.bat" || exit /b 1

echo Uruchamiam LoL Draft Helper w trybie DEMO - przegladarka otworzy sie sama.
echo Aby zamknac aplikacje, zamknij to okno.
echo.
call npm.cmd run demo -- --open
pause
exit /b

:not_extracted
echo [!] Brakuje plikow aplikacji obok demo.bat.
echo     Najczesciej oznacza to, ze plik zostal uruchomiony prosto z archiwum ZIP.
echo.
echo     1. Kliknij prawym przyciskiem myszy na pobrany plik ZIP i wybierz "Wyodrebnij wszystkie..."
echo     2. Otworz rozpakowany folder lol-draft-helper-main
echo     3. Uruchom demo.bat z tego folderu
echo.
pause
exit /b 1
