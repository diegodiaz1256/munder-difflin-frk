@echo off
rem Uninstall Scranton Branch without its (unsigned) uninstaller. See the .ps1 next to this file.
rem Add -WhatIf to only show what would be removed, -RemoveUserData to also delete settings.
rem The script is copied out first: this folder may be the one being removed,
rem and the last line runs as one block, so nothing is read from it afterwards.
set "MD_UNINSTALL_PS1=%TEMP%\uninstall-scranton-branch-%RANDOM%.ps1"
copy /y "%~dp0uninstall-scranton-branch.ps1" "%MD_UNINSTALL_PS1%" >nul
(powershell -NoProfile -ExecutionPolicy Bypass -File "%MD_UNINSTALL_PS1%" %* & echo. & pause & del "%MD_UNINSTALL_PS1%" & exit /b)
