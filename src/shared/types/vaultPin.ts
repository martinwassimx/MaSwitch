export interface VaultPinStatus {
  isConfigured: boolean;
  isUnlocked: boolean;
  failedAttempts: number;
  lockedUntilIso: string | null;
}

export interface VaultPinOperationResult {
  success: boolean;
  message: string;
  status: VaultPinStatus;
  errorCode?: 'INVALID_PIN_FORMAT' | 'WRONG_PIN' | 'RATE_LIMITED' | 'ALREADY_CONFIGURED' | 'NOT_CONFIGURED';
}

