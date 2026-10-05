@echo off
cd /d "%~dp0"
echo Assistant patients - serveur + tunnel https pour le telephone
rem Code d'acces patient : fichier local admin-data\access-code.txt (jamais publie, voir .gitignore).
if not defined ACCESS_CODE if exist admin-data\access-code.txt set /p ACCESS_CODE=<admin-data\access-code.txt
node scripts/public.js
pause
