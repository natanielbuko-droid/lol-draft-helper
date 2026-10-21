@echo off
setlocal
cd /d "%~dp0"
title LoL Draft Helper

rem Uruchamianie dwuklikiem. Uzywa npm.cmd, wiec dziala nawet gdy PowerShell blokuje skrypty.
call "%~dp0scripts\check-node.bat" || exit /b 1

echo Uruchamiam LoL Draft Helper - przegladarka otworzy sie sama.
echo Wlacz klienta League of Legends; rekomendacje pojawia sie w champ selekcie.
echo Aby zamknac aplikacje, zamknij to okno.
echo.
call npm.cmd start -- --open
pause
