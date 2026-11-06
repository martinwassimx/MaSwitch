import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';
import {
  RiotDesktopLoginAutomationService,
} from '../electron/services/accounts/riotDesktopLoginAutomation';
import { RiotWindowsProcessCoordinator } from '../electron/services/accounts/riotProductionAdapters';
import {
  createRiotProcessTrustVerifier,
  evaluateRiotSignature,
  readSignerOrganization,
} from '../electron/services/accounts/riotProcessTrust';
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

    service = new RiotDesktopLoginAutomationService(vault, undefined, {
      allowSyntheticTestTargets: true,
    });
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

  describe('caller-selected targets without test opt-in (production wiring)', () => {
    const attempts = [
      { name: 'synthetic flag', opts: { isSyntheticTest: true } },
      { name: 'synthetic flag with foreign HWND/PID', opts: { isSyntheticTest: true, targetHwnd: '4660', targetPid: 4242 } },
      { name: 'bare HWND', opts: { targetHwnd: '4660' } },
      { name: 'bare PID', opts: { targetPid: 4242 } },
    ];

    for (const attempt of attempts) {
      it(`rejects ${attempt.name} before decrypting or typing credentials`, async () => {
        await vault.saveCredentials('profile-guard', 'GuardUser', 'GuardPass123!');
        const decryptSpy = vi.spyOn(vault, 'getDecryptedCredentials');
        const workerRunner = vi.fn();
        const windowDiscoverer = vi.fn(async () => [
          { hwnd: '4660', pid: 4242, title: 'Untitled - Notepad', processName: 'notepad' },
        ]);
        const productionService = new RiotDesktopLoginAutomationService(
          vault,
          new RiotWindowsProcessCoordinator({ processLister: async () => [] }),
          { workerRunner, windowDiscoverer }
        );

        const result = await productionService.executeAutofill({
          profileId: 'profile-guard',
          ...attempt.opts,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('SYNTHETIC_TARGET_NOT_ALLOWED');
        expect(decryptSpy).not.toHaveBeenCalled();
        expect(workerRunner).not.toHaveBeenCalled();
        expect(productionService.isLoginInProgress()).toBe(false);
      });
    }

    it('findTargetWindow ignores the synthetic flag and only matches Riot processes', async () => {
      const productionService = new RiotDesktopLoginAutomationService(vault, undefined, {
        windowDiscoverer: async () => [
          { hwnd: '4660', pid: 4242, title: 'Synthetic Riot Client Login Window', processName: 'powershell' },
          { hwnd: '777', pid: 55, title: 'Riot Client', processName: 'RiotClientUx' },
        ],
      });

      const found = await productionService.findTargetWindow({
        isSyntheticTest: true,
        targetHwnd: '4660',
        targetPid: 4242,
        timeoutMs: 300,
      });

      expect(found?.hwnd).toBe('777');
    });

    const lookalikeWindow = { hwnd: '777', pid: 55, title: 'Riot Client', processName: 'RiotClientUx' };
    const runningCoordinator = () =>
      new RiotWindowsProcessCoordinator({
        processLister: async () => [{ pid: 55, imageNameLower: 'riotclientservices.exe' }],
      });

    it('never sends credentials to a Riot-named process without a valid Riot signature', async () => {
      await vault.saveCredentials('profile-sig', 'SigUser', 'SigPass123!');
      const workerRunner = vi.fn();
      const processTrustVerifier = vi.fn(async () => ({ trusted: false, reason: 'Process is not signed by Riot Games.' }));
      const productionService = new RiotDesktopLoginAutomationService(vault, runningCoordinator(), {
        windowDiscoverer: async () => [lookalikeWindow],
        workerRunner,
        processTrustVerifier,
      });

      const result = await productionService.executeAutofill({ profileId: 'profile-sig', timeoutMs: 2000 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNTRUSTED_TARGET_PROCESS');
      expect(processTrustVerifier).toHaveBeenCalledWith(55);
      expect(workerRunner).not.toHaveBeenCalled();
    });

    it('sends credentials once the target process signature is verified', async () => {
      await vault.saveCredentials('profile-sig-ok', 'SigUser', 'SigPass123!');
      const workerRunner = vi.fn(async () => ({ success: true, methodUsed: 'uia-value-pattern', fieldsIdentified: true }));
      const productionService = new RiotDesktopLoginAutomationService(vault, runningCoordinator(), {
        windowDiscoverer: async () => [lookalikeWindow],
        workerRunner,
        processTrustVerifier: async () => ({ trusted: true }),
      });

      const result = await productionService.executeAutofill({ profileId: 'profile-sig-ok', timeoutMs: 2000 });

      expect(result.success).toBe(true);
      expect(workerRunner).toHaveBeenCalledTimes(1);
    });
  });

  describe('Riot process signature evaluation (MS-11)', () => {
    const riotSubject =
      'CN="Riot Games, Inc.", O="Riot Games, Inc.", L=Los Angeles, S=California, C=US, SERIALNUMBER=4155843';

    it('accepts a valid signature from Riot Games', () => {
      expect(readSignerOrganization(riotSubject)).toBe('Riot Games, Inc.');
      expect(evaluateRiotSignature({ path: 'C:\\x.exe', status: 'Valid', subject: riotSubject }).trusted).toBe(true);
    });

    it('rejects unsigned, invalid, or other-publisher signatures', () => {
      expect(evaluateRiotSignature({ path: 'C:\\x.exe', status: 'NotSigned', subject: null }).trusted).toBe(false);
      expect(evaluateRiotSignature({ path: 'C:\\x.exe', status: 'HashMismatch', subject: riotSubject }).trusted).toBe(false);
      expect(
        evaluateRiotSignature({ path: 'C:\\x.exe', status: 'Valid', subject: 'CN=Riot Games, O=Riot Games Imposter LLC, C=US' }).trusted
      ).toBe(false);
      expect(
        evaluateRiotSignature({ path: 'C:\\x.exe', status: 'Valid', subject: 'CN="O=Riot Games, Inc.", O=Evil Corp' }).trusted
      ).toBe(false);
    });

    it('caches trusted results per PID and re-checks failures', async () => {
      const query = vi.fn(async () => ({ path: 'C:\\x.exe', status: 'Valid', subject: riotSubject }));
      const verify = createRiotProcessTrustVerifier(query);
      await verify(10);
      await verify(10);
      expect(query).toHaveBeenCalledTimes(1);

      const failing = vi.fn(async () => ({ path: 'C:\\x.exe', status: 'NotSigned', subject: null }));
      const verifyFailing = createRiotProcessTrustVerifier(failing);
      await verifyFailing(11);
      await verifyFailing(11);
      expect(failing).toHaveBeenCalledTimes(2);
    });
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
  }, 15000);
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
  }, 15000);

});
