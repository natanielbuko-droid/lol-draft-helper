@echo off
setlocal
cd /d "%~dp0"
title LoL Draft Helper - DEMO

rem Tryb demo: symulowany champ select, gra nie jest potrzebna.
call "%~dp0scripts\check-node.bat" || exit /b 1

echo Uruchamiam LoL Draft Helper w trybie DEMO - przegladarka otworzy sie sama.
echo Aby zamknac aplikacje, zamknij to okno.
echo.
call npm.cmd run demo -- --open
pause
