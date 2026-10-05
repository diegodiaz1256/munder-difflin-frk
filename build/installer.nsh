; Extra Start Menu entry: uninstall WITHOUT the NSIS uninstaller, for machines
; whose endpoint security (Cortex XDR and similar) blocks it. The regular
; "Uninstall Scranton Branch" stays as it is; this one runs
; resources\uninstall-scranton-branch.cmd (Windows' own tools only).
;
; Upgrades: do NOT run the previous version's uninstaller. electron-builder
; copies it to %TEMP% as old-uninstaller.exe and runs it before installing,
; and endpoint security (Cortex XDR…) blocks that unsigned program, so every
; upgrade failed on managed laptops. It only runs when the old Apps & features
; entry names an UninstallString, so drop that value first: the new version is
; installed over the old one (same folder), and its own entry is written anew
; at the end of the install.
!macro customInit
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" "QuietUninstallString"
  !endif
!macroend

!macro customInstall
  ; Start in %TEMP%, not the app folder: a window standing in it keeps it "in use".
  SetOutPath "$TEMP"
  CreateShortCut "$SMPROGRAMS\Uninstall ${PRODUCT_NAME} (without uninstaller).lnk" "$INSTDIR\resources\uninstall-scranton-branch.cmd" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  SetOutPath "$INSTDIR"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Uninstall ${PRODUCT_NAME} (without uninstaller).lnk"
!macroend
