; Extra Start Menu entry: uninstall WITHOUT the NSIS uninstaller, for machines
; whose endpoint security (Cortex XDR and similar) blocks it. The regular
; "Uninstall Scranton Branch" stays as it is; this one runs
; resources\uninstall-scranton-branch.cmd (Windows' own tools only).
!macro customInstall
  ; Start in %TEMP%, not the app folder: a window standing in it keeps it "in use".
  SetOutPath "$TEMP"
  CreateShortCut "$SMPROGRAMS\Uninstall ${PRODUCT_NAME} (without uninstaller).lnk" "$INSTDIR\resources\uninstall-scranton-branch.cmd" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  SetOutPath "$INSTDIR"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Uninstall ${PRODUCT_NAME} (without uninstaller).lnk"
!macroend
