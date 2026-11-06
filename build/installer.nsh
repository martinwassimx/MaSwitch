; MaSwitch 3.0 Modular Windows Installer Script
; Custom Component Selection & Presets for Low-End PC Optimization

!ifndef BUILD_UNINSTALLER

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Global UI control handles
Var /GLOBAL Dialog
Var /GLOBAL HwndPresetRadio1
Var /GLOBAL HwndPresetRadio2
Var /GLOBAL HwndPresetRadio3
Var /GLOBAL HwndPresetRadio4

Var /GLOBAL HwndChkCollections
Var /GLOBAL HwndChkBackup
Var /GLOBAL HwndChkYearInReview
Var /GLOBAL HwndChkPerfMon
Var /GLOBAL HwndChkNews
Var /GLOBAL HwndChkMemoryMgmt

Var /GLOBAL HwndDescLabel

; Feature selection state (preset & booleans)
Var /GLOBAL PresetChoice
Var /GLOBAL BoolCollections
Var /GLOBAL BoolBackup
Var /GLOBAL BoolYearInReview
Var /GLOBAL BoolPerfMon
Var /GLOBAL BoolNews
Var /GLOBAL BoolMemoryMgmt

!macro customPageAfterChangeDir
  Page custom ComponentsSelectionPage ComponentsSelectionPageLeave
!macroend

Function UpdatePresetUIFromState
  ${If} $PresetChoice == "minimal"
    ${NSD_SetState} $HwndPresetRadio1 ${BST_CHECKED}
    ${NSD_SetState} $HwndPresetRadio2 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio3 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio4 ${BST_UNCHECKED}

    ${NSD_SetState} $HwndChkCollections ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkBackup ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkYearInReview ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkPerfMon ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkNews ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkMemoryMgmt ${BST_UNCHECKED}

    StrCpy $BoolCollections "false"
    StrCpy $BoolBackup "false"
    StrCpy $BoolYearInReview "false"
    StrCpy $BoolPerfMon "false"
    StrCpy $BoolNews "false"
    StrCpy $BoolMemoryMgmt "false"

    ${NSD_SetText} $HwndDescLabel "Minimal: Core app only (0 MB optional RAM/CPU). Best for low-end PCs and max game FPS."
  ${ElseIf} $PresetChoice == "complete"
    ${NSD_SetState} $HwndPresetRadio1 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio2 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio3 ${BST_CHECKED}
    ${NSD_SetState} $HwndPresetRadio4 ${BST_UNCHECKED}

    ${NSD_SetState} $HwndChkCollections ${BST_CHECKED}
    ${NSD_SetState} $HwndChkBackup ${BST_CHECKED}
    ${NSD_SetState} $HwndChkYearInReview ${BST_CHECKED}
    ${NSD_SetState} $HwndChkPerfMon ${BST_CHECKED}
    ${NSD_SetState} $HwndChkNews ${BST_CHECKED}
    ${NSD_SetState} $HwndChkMemoryMgmt ${BST_CHECKED}

    StrCpy $BoolCollections "true"
    StrCpy $BoolBackup "true"
    StrCpy $BoolYearInReview "true"
    StrCpy $BoolPerfMon "true"
    StrCpy $BoolNews "true"
    StrCpy $BoolMemoryMgmt "true"

    ${NSD_SetText} $HwndDescLabel "Complete: All 6 optional features enabled (~65 MB RAM active). Full MaSwitch 3.0 feature set."
  ${ElseIf} $PresetChoice == "custom"
    ${NSD_SetState} $HwndPresetRadio1 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio2 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio3 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio4 ${BST_CHECKED}

    ${NSD_SetText} $HwndDescLabel "Custom: User-selected component configuration. Check or uncheck individual features."
  ${Else}
    ; Recommended is the default
    StrCpy $PresetChoice "recommended"
    ${NSD_SetState} $HwndPresetRadio1 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio2 ${BST_CHECKED}
    ${NSD_SetState} $HwndPresetRadio3 ${BST_UNCHECKED}
    ${NSD_SetState} $HwndPresetRadio4 ${BST_UNCHECKED}

    ${NSD_SetState} $HwndChkCollections ${BST_CHECKED}
    ${NSD_SetState} $HwndChkBackup ${BST_CHECKED}
    ${NSD_SetState} $HwndChkYearInReview ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkPerfMon ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkNews ${BST_UNCHECKED}
    ${NSD_SetState} $HwndChkMemoryMgmt ${BST_UNCHECKED}

    StrCpy $BoolCollections "true"
    StrCpy $BoolBackup "true"
    StrCpy $BoolYearInReview "false"
    StrCpy $BoolPerfMon "false"
    StrCpy $BoolNews "false"
    StrCpy $BoolMemoryMgmt "false"

    ${NSD_SetText} $HwndDescLabel "Recommended: Core + Collections + Backup & Restore (~16 MB RAM). Balanced for most PCs."
  ${EndIf}
FunctionEnd

Function OnClickPresetMinimal
  Pop $0
  StrCpy $PresetChoice "minimal"
  Call UpdatePresetUIFromState
FunctionEnd

Function OnClickPresetRecommended
  Pop $0
  StrCpy $PresetChoice "recommended"
  Call UpdatePresetUIFromState
FunctionEnd

Function OnClickPresetComplete
  Pop $0
  StrCpy $PresetChoice "complete"
  Call UpdatePresetUIFromState
FunctionEnd

Function OnClickPresetCustom
  Pop $0
  StrCpy $PresetChoice "custom"
  Call UpdatePresetUIFromState
FunctionEnd

Function OnClickComponentCheckbox
  Pop $0
  StrCpy $PresetChoice "custom"
  ${NSD_SetState} $HwndPresetRadio1 ${BST_UNCHECKED}
  ${NSD_SetState} $HwndPresetRadio2 ${BST_UNCHECKED}
  ${NSD_SetState} $HwndPresetRadio3 ${BST_UNCHECKED}
  ${NSD_SetState} $HwndPresetRadio4 ${BST_CHECKED}

  ${NSD_GetState} $HwndChkCollections $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolCollections "true"
  ${Else}
    StrCpy $BoolCollections "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkBackup $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolBackup "true"
  ${Else}
    StrCpy $BoolBackup "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkYearInReview $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolYearInReview "true"
  ${Else}
    StrCpy $BoolYearInReview "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkPerfMon $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolPerfMon "true"
  ${Else}
    StrCpy $BoolPerfMon "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkNews $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolNews "true"
  ${Else}
    StrCpy $BoolNews "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkMemoryMgmt $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolMemoryMgmt "true"
  ${Else}
    StrCpy $BoolMemoryMgmt "false"
  ${EndIf}

  ${NSD_SetText} $HwndDescLabel "Custom: User-selected component configuration. Check or uncheck individual features."
FunctionEnd

Function ComponentsSelectionPage
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Choose Components & Setup Preset" "Select which MaSwitch 3.0 features you want to install for your PC."

  ; Radio Buttons for Presets
  ${NSD_CreateRadioButton} 0 0 65u 12u "Minimal"
  Pop $HwndPresetRadio1
  ${NSD_CreateRadioButton} 70u 0 85u 12u "Recommended"
  Pop $HwndPresetRadio2
  ${NSD_CreateRadioButton} 160u 0 75u 12u "Complete"
  Pop $HwndPresetRadio3
  ${NSD_CreateRadioButton} 240u 0 55u 12u "Custom"
  Pop $HwndPresetRadio4

  ; Component section header
  ${NSD_CreateLabel} 0 15u 300u 10u "Optional Components (Resource impact detailed per feature):"
  Pop $0

  ; Feature checkboxes
  ${NSD_CreateCheckbox} 10u 26u 285u 11u "Smart Game Collections [~4 MB disk, ~6 MB RAM] (Rule-based sorting)"
  Pop $HwndChkCollections

  ${NSD_CreateCheckbox} 10u 38u 285u 11u "Backup & Restore [~6 MB disk, ~10 MB RAM] (Local backups, no passwords)"
  Pop $HwndChkBackup

  ${NSD_CreateCheckbox} 10u 50u 285u 11u "Gaming Year in Review [~14 MB disk, ~12 MB RAM] (Annual retrospect)"
  Pop $HwndChkYearInReview

  ${NSD_CreateCheckbox} 10u 62u 285u 11u "Lightweight Performance Monitor [~12 MB disk, ~15-25 MB RAM, <0.5% CPU]"
  Pop $HwndChkPerfMon

  ${NSD_CreateCheckbox} 10u 74u 285u 11u "Game Updates & News [~8 MB disk, ~10 MB RAM] (Official Steam RSS feed)"
  Pop $HwndChkNews

  ${NSD_CreateCheckbox} 10u 86u 285u 11u "Memory Management [~5 MB disk, ~0 MB idle RAM] (Safe RAM monitoring & cleanup)"
  Pop $HwndChkMemoryMgmt

  ; Description label at bottom
  ${NSD_CreateLabel} 0 102u 300u 26u "Select a preset above or check/uncheck optional components individually."
  Pop $HwndDescLabel

  ; Set default values if not yet initialized
  ${If} $PresetChoice == ""
    StrCpy $PresetChoice "recommended"
  ${EndIf}

  Call UpdatePresetUIFromState

  ; Register event listeners
  ${NSD_OnClick} $HwndPresetRadio1 OnClickPresetMinimal
  ${NSD_OnClick} $HwndPresetRadio2 OnClickPresetRecommended
  ${NSD_OnClick} $HwndPresetRadio3 OnClickPresetComplete
  ${NSD_OnClick} $HwndPresetRadio4 OnClickPresetCustom

  ${NSD_OnClick} $HwndChkCollections OnClickComponentCheckbox
  ${NSD_OnClick} $HwndChkBackup OnClickComponentCheckbox
  ${NSD_OnClick} $HwndChkYearInReview OnClickComponentCheckbox
  ${NSD_OnClick} $HwndChkPerfMon OnClickComponentCheckbox
  ${NSD_OnClick} $HwndChkNews OnClickComponentCheckbox
  ${NSD_OnClick} $HwndChkMemoryMgmt OnClickComponentCheckbox

  nsDialogs::Show
FunctionEnd

Function ComponentsSelectionPageLeave
  ; Retrieve actual checkbox states on page exit
  ${NSD_GetState} $HwndChkCollections $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolCollections "true"
  ${Else}
    StrCpy $BoolCollections "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkBackup $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolBackup "true"
  ${Else}
    StrCpy $BoolBackup "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkYearInReview $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolYearInReview "true"
  ${Else}
    StrCpy $BoolYearInReview "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkPerfMon $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolPerfMon "true"
  ${Else}
    StrCpy $BoolPerfMon "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkNews $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolNews "true"
  ${Else}
    StrCpy $BoolNews "false"
  ${EndIf}

  ${NSD_GetState} $HwndChkMemoryMgmt $1
  ${If} $1 == ${BST_CHECKED}
    StrCpy $BoolMemoryMgmt "true"
  ${Else}
    StrCpy $BoolMemoryMgmt "false"
  ${EndIf}
FunctionEnd

!macro customInstall
  DetailPrint "Configuring MaSwitch 3.0 Installed Features..."

  ; If $BoolCollections == "", check whether installed-features.json already exists in APPDATA or INSTDIR.
  ; In unattended update or upgrade mode, preserve the user's existing feature selection.
  ${If} $BoolCollections == ""
    ${If} ${FileExists} "$APPDATA\maswitch\installed-features.json"
      DetailPrint "Preserving existing user feature configuration from AppData..."
      CopyFiles /SILENT "$APPDATA\maswitch\installed-features.json" "$INSTDIR\installed-features.json"
      Goto skipFeatureOverwrite
    ${ElseIf} ${FileExists} "$INSTDIR\installed-features.json"
      DetailPrint "Preserving existing user feature configuration from install directory..."
      ${If} ${FileExists} "$APPDATA\maswitch\*"
        CopyFiles /SILENT "$INSTDIR\installed-features.json" "$APPDATA\maswitch\installed-features.json"
      ${EndIf}
      Goto skipFeatureOverwrite
    ${EndIf}
    StrCpy $BoolCollections "true"
    StrCpy $BoolBackup "true"
    StrCpy $BoolYearInReview "false"
    StrCpy $BoolPerfMon "false"
    StrCpy $BoolNews "false"
    StrCpy $BoolMemoryMgmt "false"
    StrCpy $PresetChoice "recommended"
  ${EndIf}

  ; Write installed-features.json in $INSTDIR
  FileOpen $0 "$INSTDIR\installed-features.json" w
  ${If} $0 != 0
    FileWrite $0 "{"
    FileWrite $0 '$\r$\n  "manifestVersion": "1.0.0",'
    FileWrite $0 '$\r$\n  "appVersion": "${VERSION}",'
    FileWrite $0 '$\r$\n  "preset": "$PresetChoice",'
    FileWrite $0 '$\r$\n  "installedAtIso": "2026-11-05T18:00:00.000Z",'
    FileWrite $0 '$\r$\n  "updatedAtIso": "2026-11-05T18:00:00.000Z",'
    FileWrite $0 '$\r$\n  "features": {'
    FileWrite $0 '$\r$\n    "yearInReview": { "installed": $BoolYearInReview, "enabled": $BoolYearInReview },'
    FileWrite $0 '$\r$\n    "smartCollections": { "installed": $BoolCollections, "enabled": $BoolCollections },'
    FileWrite $0 '$\r$\n    "performanceMonitor": { "installed": $BoolPerfMon, "enabled": $BoolPerfMon },'
    FileWrite $0 '$\r$\n    "gameNews": { "installed": $BoolNews, "enabled": $BoolNews },'
    FileWrite $0 '$\r$\n    "backupRestore": { "installed": $BoolBackup, "enabled": $BoolBackup },'
    FileWrite $0 '$\r$\n    "memoryManagement": { "installed": $BoolMemoryMgmt, "enabled": $BoolMemoryMgmt }'
    FileWrite $0 '$\r$\n  },'
    FileWrite $0 '$\r$\n  "isInstallerManaged": true,'
    FileWrite $0 '$\r$\n  "installerPath": "$EXEPATH"'
    FileWrite $0 "$\r$\n}$\r$\n"
    FileClose $0
  ${EndIf}

  ; Also write into AppData so existing user profile has the chosen configuration immediately
  ${If} ${FileExists} "$APPDATA\maswitch\*"
    FileOpen $1 "$APPDATA\maswitch\installed-features.json" w
    ${If} $1 != 0
      FileWrite $1 "{"
      FileWrite $1 '$\r$\n  "manifestVersion": "1.0.0",'
      FileWrite $1 '$\r$\n  "appVersion": "${VERSION}",'
      FileWrite $1 '$\r$\n  "preset": "$PresetChoice",'
      FileWrite $1 '$\r$\n  "installedAtIso": "2026-11-05T18:00:00.000Z",'
      FileWrite $1 '$\r$\n  "updatedAtIso": "2026-11-05T18:00:00.000Z",'
      FileWrite $1 '$\r$\n  "features": {'
      FileWrite $1 '$\r$\n    "yearInReview": { "installed": $BoolYearInReview, "enabled": $BoolYearInReview },'
      FileWrite $1 '$\r$\n    "smartCollections": { "installed": $BoolCollections, "enabled": $BoolCollections },'
      FileWrite $1 '$\r$\n    "performanceMonitor": { "installed": $BoolPerfMon, "enabled": $BoolPerfMon },'
      FileWrite $1 '$\r$\n    "gameNews": { "installed": $BoolNews, "enabled": $BoolNews },'
      FileWrite $1 '$\r$\n    "backupRestore": { "installed": $BoolBackup, "enabled": $BoolBackup },'
      FileWrite $1 '$\r$\n    "memoryManagement": { "installed": $BoolMemoryMgmt, "enabled": $BoolMemoryMgmt }'
      FileWrite $1 '$\r$\n  },'
      FileWrite $1 '$\r$\n  "isInstallerManaged": true,'
      FileWrite $1 '$\r$\n  "installerPath": "$EXEPATH"'
      FileWrite $1 "$\r$\n}$\r$\n"
      FileClose $1
    ${EndIf}
  ${EndIf}

skipFeatureOverwrite:
!macroend

!endif
