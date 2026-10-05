@echo off
rem Uninstall Scranton Branch without its (unsigned) uninstaller. See the .ps1 next to this file.
rem Add -WhatIf to only show what would be removed, -RemoveUserData to also delete settings.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-scranton-branch.ps1" %*
echo.
pause
