import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { RiotCredentialVault } from './riotCredentialVault';
import { RiotWindowsProcessCoordinator } from './riotProductionAdapters';
import type {
  RiotDesktopLoginProgressPayload,
  RiotDesktopLoginProgressStatus,
} from '../../../src/shared/types/ipc';

export interface DesktopAutofillOptions {
  profileId: string;
  autoLaunchClient?: boolean;
  autoSubmit?: boolean;
  targetHwnd?: string;
  targetPid?: number;
  isSyntheticTest?: boolean;
  timeoutMs?: number;
  onProgress?: (payload: RiotDesktopLoginProgressPayload) => void;
  signal?: AbortSignal;
}

export interface RiotDesktopLoginResult {
  success: boolean;
  profileId: string;
  methodUsed?: string;
  fieldsIdentified?: boolean;
  autoSubmitted?: boolean;
  message: string;
  error?: string;
}

export interface DiscoveredWindowInfo {
  hwnd: string;
  pid: number;
  title: string;
  processName: string;
}

/**
 * Embedded PowerShell UI Automation & Win32 worker script.
 * Runs in an isolated subprocess, accepts credentials strictly via stdin JSON,
 * verifies window foreground ownership before every keystroke, and cleans up memory immediately.
 */
export const UIA_WORKER_SCRIPT = `param(
  [string]$InputJson = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$win32Code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32AutomationHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'Win32AutomationHelper').Type) {
  Add-Type -TypeDefinition $win32Code
}

# Read configuration securely from stdin
if (-not $InputJson) {
  $InputJson = [Console]::In.ReadToEnd()
}

if (-not $InputJson) {
  Write-Output (@{ success = $false; error = "EMPTY_STDIN_PAYLOAD" } | ConvertTo-Json -Compress)
  exit 0
}

$config = $InputJson | ConvertFrom-Json
$targetHwnd = [IntPtr][long]$config.targetHwnd
$targetPid = [int]$config.targetPid
$username = [string]$config.username
$password = [string]$config.password
$autoSubmit = [bool]$config.autoSubmit
$method = "none"
$fieldsIdentified = $false

# 1. Verify Target Window
if ($targetHwnd -eq [IntPtr]::Zero) {
  Write-Output (@{ success = $false; error = "INVALID_WINDOW_HANDLE" } | ConvertTo-Json -Compress)
  exit 0
}

$procId = 0
[Win32AutomationHelper]::GetWindowThreadProcessId($targetHwnd, [ref]$procId) | Out-Null
if ($targetPid -gt 0 -and $procId -ne $targetPid) {
  Write-Output (@{ success = $false; error = "WINDOW_PROCESS_MISMATCH"; details = "Target PID $targetPid != Window PID $procId" } | ConvertTo-Json -Compress)
  exit 0
}

if (-not [Win32AutomationHelper]::IsWindowVisible($targetHwnd)) {
  Write-Output (@{ success = $false; error = "TARGET_WINDOW_NOT_VISIBLE" } | ConvertTo-Json -Compress)
  exit 0
}

# 2. Restore and Bring Window to Foreground
if ([Win32AutomationHelper]::IsIconic($targetHwnd)) {
  [Win32AutomationHelper]::ShowWindow($targetHwnd, 9) # SW_RESTORE
  Start-Sleep -Milliseconds 150
}

[Win32AutomationHelper]::SwitchToThisWindow($targetHwnd, $true)
[Win32AutomationHelper]::SetForegroundWindow($targetHwnd) | Out-Null
Start-Sleep -Milliseconds 150

# Check foreground window ownership
$fg = [Win32AutomationHelper]::GetForegroundWindow()
$fgPid = 0
if ($fg -ne [IntPtr]::Zero) {
  [Win32AutomationHelper]::GetWindowThreadProcessId($fg, [ref]$fgPid) | Out-Null
}

$isWindowSafe = $false
if ($fg -eq $targetHwnd) {
  $isWindowSafe = $true
} elseif ($fg -ne [IntPtr]::Zero -and $fgPid -eq $procId) {
  # Foreground belongs to the same target process
  $isWindowSafe = $true
} elseif ($fg -eq [IntPtr]::Zero) {
  # Background or headless environment with no active foreground app
  $isWindowSafe = $true
} else {
  # An unrelated application is in foreground: abort immediately to protect credentials!
  Write-Output (@{ success = $false; error = "FOREIGN_WINDOW_FOCUSED"; details = "Unrelated window PID $fgPid has focus. Expected target PID $procId" } | ConvertTo-Json -Compress)
  exit 0
}

# 3. Attach UI Automation
try {
  $winElem = [System.Windows.Automation.AutomationElement]::FromHandle($targetHwnd)
} catch {
  Write-Output (@{ success = $false; error = "UIA_ATTACH_FAILED"; details = $_.Exception.Message } | ConvertTo-Json -Compress)
  exit 0
}

if (-not $winElem) {
  Write-Output (@{ success = $false; error = "UIA_ELEMENT_NOT_FOUND" } | ConvertTo-Json -Compress)
  exit 0
}

# 4. Find Edit Fields in UIA Tree
$allDescendants = $winElem.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.Condition]::TrueCondition
)

$usernameElem = $null
$passwordElem = $null

foreach ($elem in $allDescendants) {
  try {
    $ctrlType = $elem.Current.ControlType.ProgrammaticName
    $className = $elem.Current.ClassName
    $name = $elem.Current.Name
    $autoId = $elem.Current.AutomationId
    $isPass = $elem.Current.IsPassword

    $isInputCandidate = (
      $ctrlType -eq "ControlType.Edit" -or 
      $ctrlType -eq "ControlType.Pane" -or
      $className -like "*Edit*" -or 
      $className -like "*TextBox*" -or
      $className -like "*Chrome_RenderWidgetHostHWND*"
    )

    if ($isInputCandidate) {
      if ($isPass -or $name -like "*password*" -or $autoId -like "*password*") {
        $passwordElem = $elem
      } elseif (-not $usernameElem -and ($name -like "*user*" -or $autoId -like "*user*" -or $name -like "*login*" -or $autoId -like "*login*")) {
        $usernameElem = $elem
      }
    }
  } catch {
    # Skip stale element
  }
}

# If not found by name, fallback to first two input controls
if (-not $usernameElem -or -not $passwordElem) {
  $editCandidates = [System.Collections.Generic.List[System.Windows.Automation.AutomationElement]]::new()
  foreach ($elem in $allDescendants) {
    try {
      if ($elem.Current.ControlType.ProgrammaticName -eq "ControlType.Edit" -or 
          $elem.Current.ClassName -like "*Edit*" -or 
          $elem.Current.ControlType.ProgrammaticName -eq "ControlType.Pane") {
        $editCandidates.Add($elem)
      }
    } catch {}
  }
  if ($editCandidates.Count -ge 2) {
    if (-not $usernameElem) { $usernameElem = $editCandidates[0] }
    if (-not $passwordElem) { $passwordElem = $editCandidates[1] }
  }
}

# 5. Execute Autofill
$usernameSet = $false
$passwordSet = $false

# Method A: UIA ValuePattern (Direct Accessibility Injection)
if ($usernameElem -and $passwordElem) {
  $fieldsIdentified = $true
  try {
    $userValPattern = $usernameElem.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $passValPattern = $passwordElem.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)

    if ($userValPattern -and -not $userValPattern.Current.IsReadOnly -and 
        $passValPattern -and -not $passValPattern.Current.IsReadOnly) {
      $userValPattern.SetValue($username)
      $passValPattern.SetValue($password)
      $usernameSet = $true
      $passwordSet = $true
      $method = "uia-value-pattern"
    }
  } catch {}

  # Method B: Native Win32 WM_SETTEXT
  if (-not $usernameSet) {
    try {
      $uHwnd = [IntPtr][long]$usernameElem.Current.NativeWindowHandle
      $pHwnd = [IntPtr][long]$passwordElem.Current.NativeWindowHandle

      if ($uHwnd -ne [IntPtr]::Zero -and $pHwnd -ne [IntPtr]::Zero) {
        [Win32AutomationHelper]::SendMessage($uHwnd, 0x000C, [IntPtr]::Zero, $username) | Out-Null
        [Win32AutomationHelper]::SendMessage($pHwnd, 0x000C, [IntPtr]::Zero, $password) | Out-Null
        $usernameSet = $true
        $passwordSet = $true
        $method = "win32-wm-settext"
      }
    } catch {}
  }

  # Method C: UIA Focused Element + SendKeys
  if (-not $usernameSet) {
    try {
      $usernameElem.SetFocus()
      Start-Sleep -Milliseconds 100

      $currentFg = [Win32AutomationHelper]::GetForegroundWindow()
      $curPid = 0
      if ($currentFg -ne [IntPtr]::Zero) { [Win32AutomationHelper]::GetWindowThreadProcessId($currentFg, [ref]$curPid) | Out-Null }
      if ($currentFg -eq $targetHwnd -or $curPid -eq $procId -or $currentFg -eq [IntPtr]::Zero) {
        [System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")
        [System.Windows.Forms.SendKeys]::SendWait($username)
        $usernameSet = $true
        Start-Sleep -Milliseconds 100
      }

      $passwordElem.SetFocus()
      Start-Sleep -Milliseconds 100

      $currentFg = [Win32AutomationHelper]::GetForegroundWindow()
      $curPid = 0
      if ($currentFg -ne [IntPtr]::Zero) { [Win32AutomationHelper]::GetWindowThreadProcessId($currentFg, [ref]$curPid) | Out-Null }
      if ($currentFg -eq $targetHwnd -or $curPid -eq $procId -or $currentFg -eq [IntPtr]::Zero) {
        [System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")
        [System.Windows.Forms.SendKeys]::SendWait($password)
        $passwordSet = $true
        $method = "uia-focused-input"
      }
    } catch {}
  }
}

# Method D: Scoped Verified Window Keyboard Fallback (CEF Canvas)
if (-not $usernameSet -or -not $passwordSet) {
  $currentFg = [Win32AutomationHelper]::GetForegroundWindow()
  $curPid = 0
  if ($currentFg -ne [IntPtr]::Zero) { [Win32AutomationHelper]::GetWindowThreadProcessId($currentFg, [ref]$curPid) | Out-Null }

  if ($currentFg -eq $targetHwnd -or $curPid -eq $procId -or $currentFg -eq [IntPtr]::Zero) {
    [System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")
    [System.Windows.Forms.SendKeys]::SendWait($username)
    Start-Sleep -Milliseconds 150

    $currentFg = [Win32AutomationHelper]::GetForegroundWindow()
    $curPid = 0
    if ($currentFg -ne [IntPtr]::Zero) { [Win32AutomationHelper]::GetWindowThreadProcessId($currentFg, [ref]$curPid) | Out-Null }

    if ($currentFg -eq $targetHwnd -or $curPid -eq $procId -or $currentFg -eq [IntPtr]::Zero) {
      [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
      Start-Sleep -Milliseconds 150

      $currentFg = [Win32AutomationHelper]::GetForegroundWindow()
      $curPid = 0
      if ($currentFg -ne [IntPtr]::Zero) { [Win32AutomationHelper]::GetWindowThreadProcessId($currentFg, [ref]$curPid) | Out-Null }

      if ($currentFg -eq $targetHwnd -or $curPid -eq $procId -or $currentFg -eq [IntPtr]::Zero) {
        [System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")
        [System.Windows.Forms.SendKeys]::SendWait($password)
        $usernameSet = $true
        $passwordSet = $true
        $method = "verified-window-fallback"
      }
    }
  }
}


# 6. Auto-Submit if enabled
$autoSubmitted = $false
if (($usernameSet -and $passwordSet) -and $autoSubmit) {
  Start-Sleep -Milliseconds 250

  $submitButton = $null
  foreach ($elem in $allDescendants) {
    try {
      $ctrlType = $elem.Current.ControlType.ProgrammaticName
      $name = $elem.Current.Name.ToLower()
      $autoId = $elem.Current.AutomationId.ToLower()

      if ($ctrlType -eq "ControlType.Button" -or $ctrlType -eq "ControlType.Image" -or $ctrlType -eq "ControlType.Pane") {
        if ($name -like "*sign in*" -or $name -like "*log in*" -or $name -like "*login*" -or 
            $autoId -like "*sign-in*" -or $autoId -like "*login*" -or $autoId -like "*submit*" -or
            $name -like "*submit*") {
          $submitButton = $elem
          break
        }
      }
    } catch {}
  }

  if ($submitButton) {
    try {
      $invokePattern = $submitButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      if ($invokePattern) {
        $invokePattern.Invoke()
        $autoSubmitted = $true
      }
    } catch {}
  }

  if (-not $autoSubmitted) {
    $currentFg = [Win32AutomationHelper]::GetForegroundWindow()
    $curPid = 0
    if ($currentFg -ne [IntPtr]::Zero) { [Win32AutomationHelper]::GetWindowThreadProcessId($currentFg, [ref]$curPid) | Out-Null }
    if ($currentFg -eq $targetHwnd -or $curPid -eq $procId -or $currentFg -eq [IntPtr]::Zero) {
      if ($passwordElem) {
        try { $passwordElem.SetFocus() } catch {}
        Start-Sleep -Milliseconds 100
      }
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
      $autoSubmitted = $true
    }
  }
}

# Wipe variables from memory
$username = $null
$password = $null
$config = $null
$InputJson = $null

$success = ($usernameSet -and $passwordSet)
$response = @{
  success = $success
  methodUsed = $method
  fieldsIdentified = $fieldsIdentified
  usernameSet = $usernameSet
  passwordSet = $passwordSet
  autoSubmitted = $autoSubmitted
}

Write-Output ($response | ConvertTo-Json -Compress)
`;

export const WINDOW_DISCOVERY_SCRIPT = `
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

public class WinFindHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public class WinInfo {
        public long Hwnd;
        public uint Pid;
        public string Title;
        public string ProcessName;
        public int Width;
        public int Height;
    }

    public static List<WinInfo> FindWindows() {
        var list = new List<WinInfo>();
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                RECT rect;
                GetWindowRect(hWnd, out rect);
                int width = rect.Right - rect.Left;
                int height = rect.Bottom - rect.Top;

                if (width > 50 && height > 50) {
                    StringBuilder sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();

                    uint pid;
                    GetWindowThreadProcessId(hWnd, out pid);

                    string procName = "";
                    try {
                        var p = Process.GetProcessById((int)pid);
                        procName = p.ProcessName;
                    } catch {}

                    list.Add(new WinInfo {
                        Hwnd = hWnd.ToInt64(),
                        Pid = pid,
                        Title = title,
                        ProcessName = procName,
                        Width = width,
                        Height = height
                    });
                }
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
"@ -ErrorAction SilentlyContinue

$windows = [WinFindHelper]::FindWindows()
Write-Output ($windows | ConvertTo-Json -Compress)
`;

export class RiotDesktopLoginAutomationService {
  private readonly vault: RiotCredentialVault;
  private readonly coordinator: RiotWindowsProcessCoordinator;
  private activeWorkerProcess: ChildProcess | null = null;
  private isCancelled = false;
  private scriptFilePath: string | null = null;
  private discoveryFilePath: string | null = null;

  constructor(vault: RiotCredentialVault, coordinator?: RiotWindowsProcessCoordinator) {
    this.vault = vault;
    this.coordinator = coordinator || new RiotWindowsProcessCoordinator();
  }

  private emitProgress(
    payload: RiotDesktopLoginProgressPayload,
    onProgress?: (p: RiotDesktopLoginProgressPayload) => void
  ): void {
    if (onProgress) {
      try {
        onProgress(payload);
      } catch {
        // Safe callback delivery
      }
    }
  }

  private ensureWorkerScriptFiles(): { workerPath: string; discoveryPath: string } {
    const tempDir = path.join(os.tmpdir(), 'maswitch_automation');
    fs.mkdirSync(tempDir, { recursive: true });

    if (!this.scriptFilePath || !fs.existsSync(this.scriptFilePath)) {
      const p = path.join(tempDir, 'uiaWorker.ps1');
      fs.writeFileSync(p, UIA_WORKER_SCRIPT, 'utf8');
      this.scriptFilePath = p;
    }

    if (!this.discoveryFilePath || !fs.existsSync(this.discoveryFilePath)) {
      const p = path.join(tempDir, 'winDiscovery.ps1');
      fs.writeFileSync(p, WINDOW_DISCOVERY_SCRIPT, 'utf8');
      this.discoveryFilePath = p;
    }

    return {
      workerPath: this.scriptFilePath,
      discoveryPath: this.discoveryFilePath,
    };
  }

  public async isClientRunning(): Promise<boolean> {
    try {
      return await this.coordinator.isClientRunning();
    } catch {
      return false;
    }
  }

  public async launchOfficialClient(): Promise<{ success: boolean; pid?: number; message?: string }> {
    try {
      await this.coordinator.launchClient();
      return { success: true, message: 'Riot Client launched successfully.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  }

  public async discoverWindows(): Promise<DiscoveredWindowInfo[]> {
    const { discoveryPath } = this.ensureWorkerScriptFiles();

    return new Promise((resolve) => {
      const proc = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        discoveryPath,
      ]);

      let stdout = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.on('close', () => {
        try {
          const raw = JSON.parse(stdout.trim());
          const arr = Array.isArray(raw) ? raw : [raw];
          const results: DiscoveredWindowInfo[] = arr
            .filter((w) => w && w.Hwnd)
            .map((w) => ({
              hwnd: String(w.Hwnd),
              pid: Number(w.Pid),
              title: String(w.Title || ''),
              processName: String(w.ProcessName || ''),
            }));
          resolve(results);
        } catch {
          resolve([]);
        }
      });
      proc.on('error', () => resolve([]));
    });
  }

  public async findTargetWindow(options?: {
    targetHwnd?: string;
    targetPid?: number;
    isSyntheticTest?: boolean;
    timeoutMs?: number;
    cancelToken?: () => boolean;
  }): Promise<DiscoveredWindowInfo | null> {
    const timeoutMs = options?.timeoutMs ?? 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (options?.cancelToken && options.cancelToken()) {
        return null;
      }
      if (this.isCancelled) {
        return null;
      }

      const windows = await this.discoverWindows();

      for (const w of windows) {
        if (options?.isSyntheticTest) {
          if (options.targetHwnd && w.hwnd === options.targetHwnd) return w;
          if (options.targetPid && w.pid === options.targetPid) return w;
          if (w.title.includes('Synthetic Riot Client Login Window')) return w;
        } else {
          // Official Riot Client matching
          const pName = w.processName.toLowerCase();
          const title = w.title.toLowerCase();

          const isRiotProcess =
            pName === 'riot client' ||
            pName === 'riotclientux' ||
            pName === 'riotclientservices';

          const isRiotTitle =
            title === 'riot client' ||
            title.startsWith('riot client') ||
            title.includes('league of legends') ||
            title.includes('valorant');

          if (isRiotProcess && (isRiotTitle || !w.title || title === 'riot client')) {
            return w;
          }
        }
      }

      await new Promise((r) => setTimeout(r, 400));
    }

    return null;
  }

  public cancelActiveAutomation(): void {
    this.isCancelled = true;
    if (this.activeWorkerProcess) {
      try {
        this.activeWorkerProcess.kill();
      } catch {
        // Process may have already exited
      }
      this.activeWorkerProcess = null;
    }
  }

  public async executeAutofill(options: DesktopAutofillOptions): Promise<RiotDesktopLoginResult> {
    this.isCancelled = false;
    const { profileId, autoLaunchClient, isSyntheticTest, targetHwnd, targetPid, onProgress, signal } = options;

    if (signal) {
      signal.addEventListener('abort', () => this.cancelActiveAutomation());
    }

    const report = (status: RiotDesktopLoginProgressStatus, message: string, extra?: Partial<RiotDesktopLoginProgressPayload>) => {
      this.emitProgress(
        {
          profileId,
          status,
          message,
          timestamp: new Date().toISOString(),
          ...extra,
        },
        onProgress
      );
    };

    try {
      // 1. Retrieve Decrypted Credentials securely
      const creds = await this.vault.getDecryptedCredentials(profileId);
      if (!creds || !creds.username || !creds.password) {
        report('failed', 'No saved credentials found in vault for this profile.');
        return {
          success: false,
          profileId,
          message: 'Saved credentials were not found in Windows DPAPI vault.',
          error: 'CREDENTIALS_NOT_FOUND',
        };
      }

      // 2. Check if Riot Client is Running
      report('checking-client', 'Checking if Riot Client is running...');

      let targetWindow: DiscoveredWindowInfo | null = null;

      if (isSyntheticTest && targetHwnd) {
        // Direct synthetic test target
        targetWindow = {
          hwnd: targetHwnd,
          pid: targetPid || 0,
          title: 'Synthetic Riot Client Login Window',
          processName: 'powershell',
        };
      } else {
        const running = await this.isClientRunning();

        if (!running) {
          if (!autoLaunchClient) {
            report('waiting-for-launch-approval', 'Riot Client is not running. Launch approval requested.');
            return {
              success: false,
              profileId,
              message: 'Riot Client is not running. Launch approval is required.',
              error: 'CLIENT_NOT_RUNNING',
            };
          }

          report('launching-client', 'Launching official Riot Client...');
          const launchRes = await this.launchOfficialClient();
          if (!launchRes.success) {
            report('failed', `Failed to launch Riot Client: ${launchRes.message}`);
            return {
              success: false,
              profileId,
              message: launchRes.message || 'Failed to launch Riot Client.',
              error: 'CLIENT_LAUNCH_FAILED',
            };
          }
        }

        // 3. Wait for Riot Client login window
        report('waiting-for-window', 'Waiting for official Riot Client login window to appear...');

        targetWindow = await this.findTargetWindow({
          isSyntheticTest: false,
          timeoutMs: options.timeoutMs ?? 30000,
          cancelToken: () => this.isCancelled,
        });

        if (!targetWindow) {
          if (this.isCancelled) {
            report('cancelled', 'Desktop automation was cancelled.');
            return { success: false, profileId, message: 'Automation cancelled.', error: 'CANCELLED' };
          }
          report('failed', 'Timed out waiting for Riot Client login window.');
          return {
            success: false,
            profileId,
            message: 'Timed out waiting for Riot Client login window.',
            error: 'WINDOW_NOT_FOUND',
          };
        }
      }

      if (this.isCancelled) {
        report('cancelled', 'Desktop automation was cancelled.');
        return { success: false, profileId, message: 'Automation cancelled.', error: 'CANCELLED' };
      }

      // 4. Verifying Window and Identifying Fields
      report('verifying-window', `Verifying target window: HWND ${targetWindow.hwnd} (PID ${targetWindow.pid})...`);
      report('finding-fields', 'Locating username and password fields via Windows UI Automation...');

      const { workerPath } = this.ensureWorkerScriptFiles();

      report('entering-credentials', 'Focusing window and securely entering credentials...');

      // Run worker with credentials strictly delivered via stdin
      const workerResult = await new Promise<{
        success: boolean;
        methodUsed?: string;
        fieldsIdentified?: boolean;
        autoSubmitted?: boolean;
        error?: string;
        details?: string;
      }>((resolve) => {
        const proc = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          workerPath,
        ]);

        this.activeWorkerProcess = proc;

        const payload = JSON.stringify({
          targetHwnd: targetWindow!.hwnd,
          targetPid: targetWindow!.pid,
          username: creds.username,
          password: creds.password,
          autoSubmit: options.autoSubmit ?? true,
        });

        proc.stdin.write(payload);
        proc.stdin.end();

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        proc.on('close', () => {
          this.activeWorkerProcess = null;
          try {
            const parsed = JSON.parse(stdout.trim());
            resolve(parsed);
          } catch {
            resolve({
              success: false,
              error: 'WORKER_PARSE_ERROR',
              details: stdout || stderr || 'Failed to parse worker JSON output.',
            });
          }
        });

        proc.on('error', (err) => {
          this.activeWorkerProcess = null;
          resolve({
            success: false,
            error: 'WORKER_SPAWN_ERROR',
            details: err.message,
          });
        });
      });

      if (this.isCancelled) {
        report('cancelled', 'Desktop automation was cancelled.');
        return { success: false, profileId, message: 'Automation cancelled.', error: 'CANCELLED' };
      }

      if (!workerResult.success) {
        const errMsg = workerResult.details
          ? `${workerResult.error}: ${workerResult.details}`
          : workerResult.error || 'Autofill execution failed.';
        report('failed', `Autofill failed: ${errMsg}`, {
          error: workerResult.error,
        });
        return {
          success: false,
          profileId,
          message: errMsg,
          error: workerResult.error,
        };
      }

      // 5. Successful autofill -> Guide user for manual 2FA / CAPTCHA
      report(
        'waiting-for-user',
        workerResult.autoSubmitted
          ? 'Credentials entered and login submitted! Complete CAPTCHA or two-factor authentication in Riot Client if prompted.'
          : 'Credentials entered into Riot Client! Click Sign In or complete CAPTCHA / 2FA to finish logging in.',
        {
          fieldsIdentified: workerResult.fieldsIdentified,
          methodUsed: workerResult.methodUsed,
          autoSubmitted: workerResult.autoSubmitted,
        }
      );

      return {
        success: true,
        profileId,
        methodUsed: workerResult.methodUsed,
        fieldsIdentified: workerResult.fieldsIdentified,
        autoSubmitted: workerResult.autoSubmitted,
        message: workerResult.autoSubmitted
          ? 'Credentials entered and login submitted into Riot Client.'
          : 'Credentials successfully entered into Riot Client.',
      };
    } finally {
      this.activeWorkerProcess = null;
    }
  }
}
