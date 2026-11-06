import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';
import {
  RiotDesktopLoginAutomationService,
  DiscoveredWindowInfo,
  WorkerRunResult,
} from '../electron/services/accounts/riotDesktopLoginAutomation';
import { RiotWindowsProcessCoordinator } from '../electron/services/accounts/riotProductionAdapters';
import type { RiotDesktopLoginProgressPayload } from '../src/shared/types/ipc';

const trustSignedRiot = async () => ({ trusted: true, imagePath: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe' });

describe('Riot Login First-Attempt Failure & Silent Retry Test Suite', () => {
  let tempDir: string;
  let vault: RiotCredentialVault;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `maswitch_retry_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    fs.mkdirSync(tempDir, { recursive: true });

    vault = new RiotCredentialVault(tempDir, {
      allowInsecureTestCipher: true,
      safeStorageOverride: null,
    });

    await vault.saveCredentials('profile-melynelas', 'MelynelasUser', 'MelynelasSecurePassword456!');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('1. handles Riot Client slow startup by launching client and waiting for readiness', async () => {
    let clientRunning = false;
    let launchCalled = false;

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => (clientRunning ? [{ pid: 4000, imageNameLower: 'riotclientux.exe' }] : []),
      clientLauncher: async () => {
        launchCalled = true;
        clientRunning = true;
      },
    });

    const targetWin: DiscoveredWindowInfo = {
      hwnd: '4001',
      pid: 4000,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => (clientRunning ? [targetWin] : []),
        workerRunner: async () => ({
          success: true,
          methodUsed: 'uia-value-pattern',
          fieldsIdentified: true,
          autoSubmitted: true,
        }),
      }
    );

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      autoLaunchClient: true,
      timeoutMs: 5000,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(launchCalled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.autoSubmitted).toBe(true);

    const statuses = progressEvents.map((p) => p.status);
    expect(statuses).toContain('checking-client');
    expect(statuses).toContain('launching-client');
    expect(statuses).toContain('verifying-window');
    expect(statuses).toContain('waiting-for-user');
  });

  it('2. recovers seamlessly when login window appears late', async () => {
    let discoveryCalls = 0;
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '5001',
      pid: 5000,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 5000, imageNameLower: 'riotclientux.exe' }],
    });

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => {
          discoveryCalls++;
          // Window only appears on the 3rd discovery call
          if (discoveryCalls >= 3) {
            return [targetWin];
          }
          return [];
        },
        workerRunner: async () => ({
          success: true,
          methodUsed: 'uia-value-pattern',
          fieldsIdentified: true,
          autoSubmitted: true,
        }),
      }
    );

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      autoLaunchClient: false,
      timeoutMs: 6000,
      retryBackoffBaseMs: 100,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(true);
    expect(discoveryCalls).toBeGreaterThanOrEqual(3);
    expect(progressEvents.some((p) => p.status === 'waiting-for-window')).toBe(true);
  });

  it('3. handles window handle changing during startup without reusing stale handles', async () => {
    let callCount = 0;
    const staleWin: DiscoveredWindowInfo = {
      hwnd: '1001',
      pid: 6000,
      title: 'Riot Client Splash',
      processName: 'RiotClientServices',
      isHung: false,
    };
    const finalWin: DiscoveredWindowInfo = {
      hwnd: '2002',
      pid: 6001,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 6001, imageNameLower: 'riotclientux.exe' }],
    });

    const usedHwnds: string[] = [];
    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => {
          callCount++;
          if (callCount === 1) return [staleWin];
          return [finalWin];
        },
        workerRunner: async (target) => {
          usedHwnds.push(target.hwnd);
          if (target.hwnd === '1001') {
            return {
              success: false,
              error: 'STALE_WINDOW_HANDLE',
              details: 'Original splash window handle destroyed',
              retryable: true,
            };
          }
          return {
            success: true,
            methodUsed: 'uia-value-pattern',
            fieldsIdentified: true,
            autoSubmitted: true,
          };
        },
      }
    );

    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 5000,
      retryBackoffBaseMs: 50,
    });

    expect(result.success).toBe(true);
    expect(usedHwnds).toEqual(['1001', '2002']);
  });

  it('4. automatically recovers when first UIA attachment fails with "FromHandle: Unrecognized error"', async () => {
    let workerAttempts = 0;
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '7001',
      pid: 7000,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 7000, imageNameLower: 'riotclientux.exe' }],
    });

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => {
          workerAttempts++;
          if (workerAttempts === 1) {
            // Replicate the exact error from user screenshot
            return {
              success: false,
              error: 'UIA_ATTACH_FAILED',
              details: 'Exception calling "FromHandle" with "1" argument(s): "Unrecognized error."',
              retryable: true,
            };
          }
          return {
            success: true,
            methodUsed: 'uia-value-pattern',
            fieldsIdentified: true,
            autoSubmitted: true,
          };
        },
      }
    );

    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 5000,
      retryBackoffBaseMs: 100,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(true);
    expect(workerAttempts).toBe(2);

    // Verify silent retry: show calm message, no failure reported
    const retryEvent = progressEvents.find(
      (p) => p.status === 'connecting-client' && p.message.includes('Waiting for Riot Client to become ready')
    );
    expect(retryEvent).toBeDefined();

    // Verify no 'failed' status was ever emitted
    expect(progressEvents.some((p) => p.status === 'failed')).toBe(false);
  });

  it('5. handles UI Automation provider temporarily unavailable before DOM elements load', async () => {
    let workerAttempts = 0;
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '8001',
      pid: 8000,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 8000, imageNameLower: 'riotclientux.exe' }],
    });

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => {
          workerAttempts++;
          if (workerAttempts === 1) {
            return {
              success: false,
              error: 'UIA_ATTACH_FAILED',
              details: 'UIA COM provider not initialized yet',
              retryable: true,
            };
          }
          if (workerAttempts === 2) {
            return {
              success: false,
              error: 'FIELDS_NOT_FOUND',
              details: 'Username and password fields not rendered in CEF tree yet',
              retryable: true,
            };
          }
          return {
            success: true,
            methodUsed: 'uia-value-pattern',
            fieldsIdentified: true,
            autoSubmitted: true,
          };
        },
      }
    );

    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 6000,
      retryBackoffBaseMs: 100,
    });

    expect(result.success).toBe(true);
    expect(workerAttempts).toBe(3);
  });

  it('6. stops immediately if Riot Client is closed during login', async () => {
    let clientRunning = true;
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '9001',
      pid: 9000,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => (clientRunning ? [{ pid: 9000, imageNameLower: 'riotclientux.exe' }] : []),
    });

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => {
          // Simulate user closing client
          clientRunning = false;
          return {
            success: false,
            error: 'UIA_ATTACH_FAILED',
            details: 'Target window closed',
            retryable: true,
          };
        },
      }
    );

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 10000,
      retryBackoffBaseMs: 50,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('CLIENT_CLOSED');
    expect(result.message).toContain('Riot Client closed unexpectedly');
    expect(progressEvents.some((p) => p.status === 'failed')).toBe(true);
  });

  it('7. aborts cleanly when cancelled during retry backoff', async () => {
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '9101',
      pid: 9100,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 9100, imageNameLower: 'riotclientux.exe' }],
    });

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => ({
          success: false,
          error: 'UIA_ATTACH_FAILED',
          details: 'Wait for next attempt',
          retryable: true,
        }),
      }
    );

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const promise = mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 10000,
      retryBackoffBaseMs: 500,
      onProgress: (p) => progressEvents.push(p),
    });

    // Cancel after first attempt triggers backoff
    setTimeout(() => {
      mockService.cancelActiveAutomation();
    }, 150);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('CANCELLED');
    expect(progressEvents.some((p) => p.status === 'cancelled')).toBe(true);
  });

  it('8. reports failure with actionable error after overall timeout expires', async () => {
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '9201',
      pid: 9200,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 9200, imageNameLower: 'riotclientux.exe' }],
    });

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => ({
          success: false,
          error: 'UIA_ATTACH_FAILED',
          details: 'Unrecognized error.',
          retryable: true,
        }),
      }
    );

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 600,
      retryBackoffBaseMs: 100,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('UIA_ATTACH_FAILED');
    expect(result.message).toContain('Unrecognized error');
    expect(progressEvents.some((p) => p.status === 'failed')).toBe(true);
  });

  it('9. blocks multiple rapid login clicks with AUTOMATION_IN_PROGRESS', async () => {
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '9301',
      pid: 9300,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 9300, imageNameLower: 'riotclientux.exe' }],
    });

    let releaseFirst: () => void = () => {};
    const firstWorkerPromise = new Promise<WorkerRunResult>((resolve) => {
      releaseFirst = () =>
        resolve({
          success: true,
          methodUsed: 'uia-value-pattern',
          fieldsIdentified: true,
          autoSubmitted: true,
        });
    });

    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => firstWorkerPromise,
      }
    );

    const promise1 = mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 5000,
    });

    // Rapid second click
    const promise2 = mockService.executeAutofill({
      profileId: 'profile-melynelas',
      timeoutMs: 5000,
    });

    const result2 = await promise2;
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('AUTOMATION_IN_PROGRESS');

    // Complete first
    releaseFirst();
    const result1 = await promise1;
    expect(result1.success).toBe(true);
  });

  it('10. completes successful credential entry on single Login click without manual retry', async () => {
    let attemptCount = 0;
    const targetWin: DiscoveredWindowInfo = {
      hwnd: '9401',
      pid: 9400,
      title: 'Riot Client',
      processName: 'RiotClientUx',
      isHung: false,
    };

    const mockCoordinator = new RiotWindowsProcessCoordinator({
      processLister: async () => [{ pid: 9400, imageNameLower: 'riotclientux.exe' }],
    });

    const progressEvents: RiotDesktopLoginProgressPayload[] = [];
    const mockService = new RiotDesktopLoginAutomationService(
      vault,
      mockCoordinator,
      {
        processTrustVerifier: trustSignedRiot,
        windowDiscoverer: async () => [targetWin],
        workerRunner: async () => {
          attemptCount++;
          if (attemptCount === 1) {
            return {
              success: false,
              error: 'UIA_ATTACH_FAILED',
              details: 'Exception calling "FromHandle" with "1" argument(s): "Unrecognized error."',
              retryable: true,
            };
          }
          return {
            success: true,
            methodUsed: 'uia-value-pattern',
            fieldsIdentified: true,
            autoSubmitted: true,
          };
        },
      }
    );

    const result = await mockService.executeAutofill({
      profileId: 'profile-melynelas',
      autoSubmit: true,
      timeoutMs: 5000,
      retryBackoffBaseMs: 50,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(result.success).toBe(true);
    expect(result.methodUsed).toBe('uia-value-pattern');
    expect(result.autoSubmitted).toBe(true);
    expect(result.fieldsIdentified).toBe(true);
    expect(attemptCount).toBe(2);

    const finalEvent = progressEvents[progressEvents.length - 1];
    expect(finalEvent.status).toBe('waiting-for-user');
    expect(finalEvent.message).toContain('Credentials entered and login submitted');
  });
});
