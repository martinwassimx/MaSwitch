import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitorService } from '../electron/services/performanceMonitorService';

describe('MaSwitch 3.0: Lightweight Performance Monitor Test Suite', () => {
  let service: PerformanceMonitorService;

  beforeEach(() => {
    service = new PerformanceMonitorService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('collects lightweight CPU, RAM, and process metrics accurately without crashing', () => {
    const metrics = service.getCurrentMetrics();

    expect(metrics).toBeDefined();
    expect(typeof metrics.cpuPercent).toBe('number');
    expect(metrics.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.cpuPercent).toBeLessThanOrEqual(100);

    expect(typeof metrics.ramPercent).toBe('number');
    expect(metrics.ramPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.ramPercent).toBeLessThanOrEqual(100);

    expect(typeof metrics.ramUsedMb).toBe('number');
    expect(metrics.ramUsedMb).toBeGreaterThan(0);

    expect(typeof metrics.ramTotalMb).toBe('number');
    expect(metrics.ramTotalMb).toBeGreaterThan(metrics.ramUsedMb);

    // MaSwitch internal process memory
    expect(typeof metrics.maSwitchRamMb).toBe('number');
    expect(metrics.maSwitchRamMb).toBeGreaterThan(0);

    // GPU and hardware sensors report Unsupported / null gracefully
    expect(metrics.gpuPercent).toBeNull();
    expect(metrics.temperatureCelsius).toBeNull();
    expect(typeof metrics.timestamp).toBe('number');
    expect(['standard', 'low-end', 'game-aware']).toContain(metrics.performanceMode);
  });

  it('activates and deactivates monitoring timer on demand to avoid background overhead', () => {
    expect(service.isMonitoringActive()).toBe(false);

    // Start monitoring with 3s interval
    service.setMonitoringConfig({ active: true, intervalMs: 3000 });
    expect(service.isMonitoringActive()).toBe(true);

    // Stop monitoring
    service.setMonitoringConfig({ active: false });
    expect(service.isMonitoringActive()).toBe(false);
  });

  it('handles custom refresh intervals (3s, 5s, 10s)', () => {
    service.setMonitoringConfig({ active: true, intervalMs: 5000 });
    expect(service.isMonitoringActive()).toBe(true);

    // Change to 10s
    service.setMonitoringConfig({ active: true, intervalMs: 10000 });
    expect(service.isMonitoringActive()).toBe(true);

    service.setMonitoringConfig({ active: false });
    expect(service.isMonitoringActive()).toBe(false);
  });
});
