import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

function sanitizeDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export const VaultPinModal: React.FC = () => {
  const isOpen = useAppStore((s) => s.isPinModalOpen);
  const mode = useAppStore((s) => s.pinModalMode);
  const pinStatus = useAppStore((s) => s.vaultPinStatus);
  const closePinModal = useAppStore((s) => s.closePinModal);
  const setupVaultPin = useAppStore((s) => s.setupVaultPin);
  const unlockVaultPin = useAppStore((s) => s.unlockVaultPin);
  const changeVaultPin = useAppStore((s) => s.changeVaultPin);

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showDigits, setShowDigits] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const primaryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setConfirmPin('');
      setCurrentPin('');
      setShowDigits(false);
      setErrorMsg(null);
      setIsSubmitting(false);
      const focusTimer = setTimeout(() => {
        primaryInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(focusTimer);
    }
    return undefined;
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen || !pinStatus.lockedUntilIso) {
      setCooldownSeconds(0);
      return undefined;
    }
    const updateRemaining = () => {
      const target = Date.parse(pinStatus.lockedUntilIso || '');
      if (Number.isNaN(target)) {
        setCooldownSeconds(0);
        return;
      }
      const diff = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setCooldownSeconds(diff);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 500);
    return () => clearInterval(timer);
  }, [isOpen, pinStatus.lockedUntilIso]);

  if (!isOpen) {
    return null;
  }

  const handleDigitPress = (digit: string) => {
    if (cooldownSeconds > 0 || isSubmitting) return;
    setErrorMsg(null);
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
    primaryInputRef.current?.focus();
  };

  const handleBackspace = () => {
    if (isSubmitting) return;
    setErrorMsg(null);
    setPin((prev) => prev.slice(0, -1));
    primaryInputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || cooldownSeconds > 0) return;

    setErrorMsg(null);

    if (mode === 'unlock') {
      if (pin.length < 4 || pin.length > 6) {
        setErrorMsg('Enter your 4 to 6 digit PIN.');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await unlockVaultPin(pin);
        if (!res.success) {
          setErrorMsg(res.message);
          setPin('');
          primaryInputRef.current?.focus();
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not verify PIN.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === 'setup') {
      if (pin.length < 4 || pin.length > 6) {
        setErrorMsg('PIN must be 4 to 6 digits (0–9).');
        return;
      }
      if (pin !== confirmPin) {
        setErrorMsg('PIN codes do not match.');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await setupVaultPin(pin);
        if (!res.success) {
          setErrorMsg(res.message);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not save PIN.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // mode === 'change'
    if (currentPin.length < 4 || currentPin.length > 6) {
      setErrorMsg('Enter your current 4 to 6 digit PIN.');
      return;
    }
    if (pin.length < 4 || pin.length > 6) {
      setErrorMsg('New PIN must be 4 to 6 digits (0–9).');
      return;
    }
    if (pin !== confirmPin) {
      setErrorMsg('New PIN codes do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changeVaultPin(currentPin, pin);
      if (!res.success) {
        setErrorMsg(res.message);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not change PIN.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    mode === 'setup'
      ? 'Create PIN Code'
      : mode === 'change'
      ? 'Change PIN Code'
      : 'Enter PIN Code';

  const subtitle =
    mode === 'setup'
      ? 'Set a 4–6 digit PIN to protect your saved passwords when MaSwitch opens.'
      : mode === 'change'
      ? 'Update the 4–6 digit PIN used to unlock your saved passwords.'
      : 'Enter your PIN to unlock and use your saved passwords.';

  return (
    <div
      data-testid="vault-pin-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="w-full max-w-sm rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0">
              {mode === 'unlock' ? (
                <Lock className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-ms-text tracking-tight">
                {title}
              </h2>
              <p className="text-xs text-ms-muted leading-snug mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close PIN dialog"
            onClick={closePinModal}
            className="w-8 h-8 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-ms-text flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div
            data-testid="vault-pin-error"
            className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {cooldownSeconds > 0 && !errorMsg && (
          <div
            data-testid="vault-pin-cooldown"
            className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Locked temporarily — try again in {cooldownSeconds}s.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'change' && (
            <div>
              <label className="block text-xs font-semibold text-ms-text mb-1.5">
                Current PIN
              </label>
              <input
                ref={primaryInputRef}
                type={showDigits ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                data-testid="input-current-pin"
                value={currentPin}
                onChange={(e) => {
                  setErrorMsg(null);
                  setCurrentPin(sanitizeDigits(e.target.value));
                }}
                placeholder="••••"
                className="w-full h-11 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-4 text-center text-lg font-bold tracking-[0.35em] text-ms-text placeholder:text-ms-muted/50 focus:outline-none"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ms-text">
                {mode === 'change' ? 'New PIN (4–6 digits)' : 'PIN Code (4–6 digits)'}
              </label>
              <button
                type="button"
                onClick={() => setShowDigits((v) => !v)}
                className="text-[11px] font-medium text-ms-muted hover:text-ms-text inline-flex items-center gap-1"
              >
                {showDigits ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={mode === 'change' ? undefined : primaryInputRef}
              type={showDigits ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="off"
              data-testid="input-vault-pin"
              disabled={cooldownSeconds > 0 || isSubmitting}
              value={pin}
              onChange={(e) => {
                setErrorMsg(null);
                setPin(sanitizeDigits(e.target.value));
              }}
              placeholder="••••"
              className="w-full h-12 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-4 text-center text-xl font-extrabold tracking-[0.4em] text-ms-text placeholder:text-ms-muted/40 focus:outline-none disabled:opacity-50"
            />
          </div>

          {mode === 'unlock' && (
            <div className="grid grid-cols-3 gap-2 pt-0.5 select-none">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  data-testid={`pin-pad-${digit}`}
                  disabled={cooldownSeconds > 0 || isSubmitting}
                  onClick={() => handleDigitPress(digit)}
                  className="h-11 rounded-xl bg-ms-bg hover:bg-ms-elevated active:scale-95 border border-ms-border text-sm font-bold text-ms-text transition-all disabled:opacity-40"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                disabled={cooldownSeconds > 0 || isSubmitting || pin.length === 0}
                onClick={() => setPin('')}
                className="h-11 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-xs font-semibold text-ms-muted hover:text-ms-text transition-colors disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                data-testid="pin-pad-0"
                disabled={cooldownSeconds > 0 || isSubmitting}
                onClick={() => handleDigitPress('0')}
                className="h-11 rounded-xl bg-ms-bg hover:bg-ms-elevated active:scale-95 border border-ms-border text-sm font-bold text-ms-text transition-all disabled:opacity-40"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Backspace"
                disabled={cooldownSeconds > 0 || isSubmitting || pin.length === 0}
                onClick={handleBackspace}
                className="h-11 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text flex items-center justify-center transition-colors disabled:opacity-40"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>
          )}

          {(mode === 'setup' || mode === 'change') && (
            <div>
              <label className="block text-xs font-semibold text-ms-text mb-1.5">
                {mode === 'change' ? 'Confirm New PIN' : 'Confirm PIN'}
              </label>
              <input
                type={showDigits ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                data-testid="input-confirm-pin"
                value={confirmPin}
                onChange={(e) => {
                  setErrorMsg(null);
                  setConfirmPin(sanitizeDigits(e.target.value));
                }}
                placeholder="••••"
                className="w-full h-11 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-4 text-center text-lg font-bold tracking-[0.35em] text-ms-text placeholder:text-ms-muted/40 focus:outline-none"
              />
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              data-testid="pin-submit-btn"
              disabled={
                isSubmitting ||
                cooldownSeconds > 0 ||
                pin.length < 4 ||
                ((mode === 'setup' || mode === 'change') && confirmPin.length < 4)
              }
              className="w-full h-11 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Verifying...'
                  : mode === 'setup'
                  ? 'Save PIN & Unlock Passwords'
                  : mode === 'change'
                  ? 'Update PIN'
                  : 'Unlock Passwords'}
              </span>
            </button>

            <button
              type="button"
              data-testid="pin-skip-btn"
              onClick={closePinModal}
              className="w-full h-9 rounded-xl text-xs font-semibold text-ms-muted hover:text-ms-text hover:bg-ms-elevated/60 transition-colors"
            >
              {mode === 'change' ? 'Cancel' : 'Skip for now (keep passwords locked)'}
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-ms-muted/80 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Protected locally with Windows DPAPI encryption</span>
          </div>
        </form>
      </div>
    </div>
  );
};

