export interface PerformanceMetrics {
  timestamp: number;
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramPercent: number;
  gpuPercent: number | null;
  gpuName?: string;
  maSwitchCpuPercent: number;
  maSwitchRamMb: number;
  temperatureCelsius: number | null;
  performanceMode: 'standard' | 'game-aware' | 'low-end';
  isGameRunning: boolean;
  activeGameTitle?: string;
}

export interface PerformanceMonitoringConfig {
  active: boolean;
  intervalMs: number; // 3000, 5000, or 10000
}

