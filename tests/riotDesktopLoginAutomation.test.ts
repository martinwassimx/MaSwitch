import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';
import {
  RiotDesktopLoginAutomationService,
} from '../electron/services/accounts/riotDesktopLoginAutomation';
import { RiotWindowsProcessCoordinator } from '../electron/services/accounts/riotProductionAdapters';
import type { RiotDesktopLoginProgressPayload } from '../src/shared/types/ipc';

describe('RiotDesktopLoginAutomationService', () => {
  let tempDir: string;
  let vault: RiotCredentialVault;
  let service: RiotDesktopLoginAutomationService;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `maswitch_auto_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    vault = new RiotCredentialVault(tempDir, {
      allowInsecureTestCipher: true,
      safeStorageOverride: null,
    });

    service = new RiotDesktopLoginAutomationService(vault);
  });

  afterEach(() => {
    service.cancelActiveAutomation();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('fails with CREDENTIALS_NOT_FOUND when profile has no saved credentials', async () => {
    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await service.executeAutofill({
      profileId: 'nonexistent-profile',
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('CREDENTIALS_NOT_FOUND');
    expect(progressEvents.some((p) => p.status === 'failed')).toBe(true);
  });

  it('reports waiting-for-launch-approval if client is not running and autoLaunchClient is false', async () => {
    await vault.saveCredentials('profile-1', 'TestUser', 'TestPassword123!');

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [],
    });
    const mockService = new RiotDesktopLoginAutomationService(vault, mockCoordinator);

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await mockService.executeAutofill({
      profileId: 'profile-1',
      autoLaunchClient: false,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('CLIENT_NOT_RUNNING');
    expect(progressEvents.some((p) => p.status === 'waiting-for-launch-approval')).toBe(true);
  });

  it('fails cleanly if official client launcher throws an error', async () => {
    await vault.saveCredentials('profile-1', 'TestUser', 'TestPassword123!');

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [],
      clientLauncher: async () => {
        throw new Error('RiotClientServices.exe not found on disk');
      },
    });
    const mockService = new RiotDesktopLoginAutomationService(vault, mockCoordinator);

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await mockService.executeAutofill({
      profileId: 'profile-1',
      autoLaunchClient: true,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('CLIENT_LAUNCH_FAILED');
    expect(result.message).toContain('RiotClientServices.exe not found on disk');
    expect(progressEvents.some((p) => p.status === 'failed')).toBe(true);
  });

  it('aborts cleanly when cancelActiveAutomation is triggered', async () => {
    await vault.saveCredentials('profile-1', 'TestUser', 'TestPassword123!');

    // Mock coordinator where client is running, but window search is cancelled
    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 1234, imageNameLower: 'riotclientservices.exe' }],
    });
    const mockService = new RiotDesktopLoginAutomationService(vault, mockCoordinator);

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const promise = mockService.executeAutofill({
      profileId: 'profile-1',
      autoLaunchClient: false,
      timeoutMs: 5000,
      onProgress: (p) => progressEvents.push(p),
    });

    setTimeout(() => {
      mockService.cancelActiveAutomation();
    }, 200);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('CANCELLED');
    expect(progressEvents.some((p) => p.status === 'cancelled')).toBe(true);
  });

  it('fails closed and blocks autofill if window process PID does not match target', async () => {
    await vault.saveCredentials('profile-secure', 'TargetUser', 'TargetPassword123!');

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await service.executeAutofill({
      profileId: 'profile-secure',
      isSyntheticTest: true,
      targetHwnd: '999999',
      targetPid: 888888, // Non-existent target PID
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(false);
    expect(progressEvents.some((p) => p.status === 'failed')).toBe(true);
  });

  it('executes synthetic UI automation and injects exact vault credentials into a synthetic form', async () => {
    await vault.saveCredentials('profile-synth', 'AutomatedMelynelasUser', 'AutomatedMelynelasPass123!');

    const formScriptPath = path.join(tempDir, 'synthForm.ps1');
    const formReadyPath = path.join(tempDir, 'synthFormReady.json');
    const formOutputPath = path.join(tempDir, 'synthFormOutput.txt');

    const formScript = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = "Synthetic Riot Client Login Window"
$form.Width = 400
$form.Height = 300
$form.StartPosition = "CenterScreen"

$userBox = New-Object System.Windows.Forms.TextBox
$userBox.Name = "usernameField"
$userBox.AccessibleName = "username"
$userBox.Top = 50
$userBox.Left = 30
$userBox.Width = 250
$form.Controls.Add($userBox)

$passBox = New-Object System.Windows.Forms.TextBox
$passBox.Name = "passwordField"
$passBox.AccessibleName = "password"
$passBox.PasswordChar = '*'
$passBox.Top = 110
$passBox.Left = 30
$passBox.Width = 250
$form.Controls.Add($passBox)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  if ($userBox.Text.Length -gt 0 -and $passBox.Text.Length -gt 0) {
    [System.IO.File]::WriteAllText("${formOutputPath.replace(/\\/g, '/')}", $userBox.Text + "::" + $passBox.Text)
  }
})
$timer.Start()

$form.Add_Shown({
  $pidVal = [System.Diagnostics.Process]::GetCurrentProcess().Id
  $hwndVal = $form.Handle.ToInt64()
  $json = (@{ hwnd = $hwndVal; pid = $pidVal } | ConvertTo-Json -Compress)
  [System.IO.File]::WriteAllText("${formReadyPath.replace(/\\/g, '/')}", $json)
})

[System.Windows.Forms.Application]::Run($form)
`;

    fs.writeFileSync(formScriptPath, formScript, 'utf8');

    const formProc: ChildProcess = spawn('powershell.exe', [
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      formScriptPath,
    ]);

    try {
      let targetHwnd: string | null = null;
      let targetPid: number | null = null;

      // Wait for synthetic window to initialize
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (fs.existsSync(formReadyPath)) {
          const data = JSON.parse(fs.readFileSync(formReadyPath, 'utf8'));
          targetHwnd = String(data.hwnd);
          targetPid = Number(data.pid);
          break;
        }
      }

      expect(targetHwnd).not.toBeNull();
      expect(targetPid).not.toBeNull();

      const progressEvents: RiotDesktopLoginProgressPayload[] = [];
      const result = await service.executeAutofill({
        profileId: 'profile-synth',
        isSyntheticTest: true,
        autoSubmit: true,
        targetHwnd: targetHwnd!,
        targetPid: targetPid!,
        onProgress: (p) => progressEvents.push(p),
      });

      expect(result.success).toBe(true);
      expect(result.fieldsIdentified).toBe(true);
      expect(result.autoSubmitted).toBe(true);
      expect(result.methodUsed).toBeDefined();

      // Verify that progress events were emitted in proper sequence
      const statuses = progressEvents.map((p) => p.status);
      expect(statuses).toContain('checking-client');
      expect(statuses).toContain('verifying-window');
      expect(statuses).toContain('finding-fields');
      expect(statuses).toContain('entering-credentials');
      expect(statuses).toContain('waiting-for-user');

      // Verify exact credentials injected into the form
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150));
        if (fs.existsSync(formOutputPath)) break;
      }

      expect(fs.existsSync(formOutputPath)).toBe(true);
      const captured = fs.readFileSync(formOutputPath, 'utf8');
      expect(captured).toBe('AutomatedMelynelasUser::AutomatedMelynelasPass123!');
    } finally {
      formProc.kill();
    }
  });
  it('respects autoSubmit: false and skips pressing login button', async () => {
    await vault.saveCredentials('profile-no-submit', 'ManualSubmitUser', 'ManualSubmitPass123!');

    const formScriptPath = path.join(tempDir, 'synthFormNoSubmit.ps1');
    const formReadyPath = path.join(tempDir, 'synthFormReadyNoSubmit.json');
    const formOutputPath = path.join(tempDir, 'synthFormOutputNoSubmit.txt');

    const formScript = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = "Synthetic Riot Client Login Window"
$form.Width = 400
$form.Height = 300
$form.StartPosition = "CenterScreen"

$userBox = New-Object System.Windows.Forms.TextBox
$userBox.Name = "usernameField"
$userBox.AccessibleName = "username"
$userBox.Top = 50
$userBox.Left = 30
$userBox.Width = 250
$form.Controls.Add($userBox)

$passBox = New-Object System.Windows.Forms.TextBox
$passBox.Name = "passwordField"
$passBox.AccessibleName = "password"
$passBox.PasswordChar = '*'
$passBox.Top = 110
$passBox.Left = 30
$passBox.Width = 250
$form.Controls.Add($passBox)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  if ($userBox.Text.Length -gt 0 -and $passBox.Text.Length -gt 0) {
    [System.IO.File]::WriteAllText("${formOutputPath.replace(/\\/g, '/')}", $userBox.Text + "::" + $passBox.Text)
  }
})
$timer.Start()

$form.Add_Shown({
  $pidVal = [System.Diagnostics.Process]::GetCurrentProcess().Id
  $hwndVal = $form.Handle.ToInt64()
  $json = (@{ hwnd = $hwndVal; pid = $pidVal } | ConvertTo-Json -Compress)
  [System.IO.File]::WriteAllText("${formReadyPath.replace(/\\/g, '/')}", $json)
})

[System.Windows.Forms.Application]::Run($form)
`;

    fs.writeFileSync(formScriptPath, formScript, 'utf8');

    const formProc: ChildProcess = spawn('powershell.exe', [
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      formScriptPath,
    ]);

    try {
      let targetHwnd: string | null = null;
      let targetPid: number | null = null;

      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (fs.existsSync(formReadyPath)) {
          const data = JSON.parse(fs.readFileSync(formReadyPath, 'utf8'));
          targetHwnd = String(data.hwnd);
          targetPid = Number(data.pid);
          break;
        }
      }

      expect(targetHwnd).not.toBeNull();
      expect(targetPid).not.toBeNull();

      const progressEvents: RiotDesktopLoginProgressPayload[] = [];
      const result = await service.executeAutofill({
        profileId: 'profile-no-submit',
        isSyntheticTest: true,
        autoSubmit: false,
        targetHwnd: targetHwnd!,
        targetPid: targetPid!,
        onProgress: (p) => progressEvents.push(p),
      });

      expect(result.success).toBe(true);
      expect(result.autoSubmitted).toBe(false);

      const waitingEvent = progressEvents.find((p) => p.status === 'waiting-for-user');
      expect(waitingEvent).toBeDefined();
      expect(waitingEvent?.autoSubmitted).toBe(false);
      expect(waitingEvent?.message).toContain('Click Sign In');
    } finally {
      formProc.kill();
    }
  });

});
