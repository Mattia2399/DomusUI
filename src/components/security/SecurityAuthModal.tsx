import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Delete, Fingerprint, KeyRound, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import GlassLoader from '../ui/GlassLoader';
import { useI18n } from '../../i18n/I18nProvider';

type DeviceAuthPhase = 'idle' | 'verifying' | 'failed' | 'success';

type SecurityAuthModalProps = {
  isOpen: boolean;
  pendingAlarmState?: string | null;
  pendingStateRequiresCode: boolean;
  title?: string;
  description?: string;
  authError?: string;
  isAuthBusy?: boolean;
  isAlarmCodeNumeric: boolean;
  alarmCodeTypeLabel: string;
  authPinInput: string;
  preferDeviceAuth?: boolean;
  deviceAuthLabel?: string;
  onVerifyWithDevice?: () => boolean | Promise<boolean>;
  onPinInputChange: (value: string) => void;
  onVerifyWithPin: () => void;
  onPushPinDigit: (digit: string) => void;
  onPopPinDigit: () => void;
  onClearPin: () => void;
  onClose: () => void;
  usePortal?: boolean;
};

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export function SecurityAuthModal({
  isOpen,
  pendingAlarmState,
  pendingStateRequiresCode,
  title,
  description,
  authError,
  isAuthBusy = false,
  isAlarmCodeNumeric,
  alarmCodeTypeLabel,
  authPinInput,
  preferDeviceAuth = false,
  deviceAuthLabel,
  onVerifyWithDevice,
  onPinInputChange,
  onVerifyWithPin,
  onPushPinDigit,
  onPopPinDigit,
  onClearPin,
  onClose,
  usePortal = false,
}: SecurityAuthModalProps) {
  const { t } = useI18n();
  const overlayTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
  const panelTransition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;
  const [devicePhase, setDevicePhase] = useState<DeviceAuthPhase>('idle');
  const [showPinFallback, setShowPinFallback] = useState(false);
  const [deviceAttemptNonce, setDeviceAttemptNonce] = useState(0);
  const hasAttemptedDeviceAuthRef = useRef(false);
  const verifyWithDeviceRef = useRef(onVerifyWithDevice);
  verifyWithDeviceRef.current = onVerifyWithDevice;
  const canTryDeviceAuth = preferDeviceAuth && Boolean(onVerifyWithDevice);
  const shouldShowDeviceStage = canTryDeviceAuth && !showPinFallback;
  const shouldShowPinStage = pendingStateRequiresCode && (!canTryDeviceAuth || showPinFallback);
  const pinSlots = Array.from({ length: Math.max(4, Math.min(8, authPinInput.length || 4)) });
  const resolvedDeviceAuthLabel = deviceAuthLabel ?? t('auth.deviceConfirmation');
  const resolvedTitle = title ?? t('auth.authorize', { state: pendingAlarmState ? t('auth.stateSuffix', { state: pendingAlarmState }) : '' });
  const resolvedDescription = description ?? (
    pendingStateRequiresCode
      ? t('auth.codeRequired', { label: alarmCodeTypeLabel })
      : t('auth.deviceRequired')
  );

  useEffect(() => {
    if (!isOpen) {
      setDevicePhase('idle');
      setShowPinFallback(false);
      hasAttemptedDeviceAuthRef.current = false;
      return;
    }
    setShowPinFallback(false);
    setDevicePhase(canTryDeviceAuth ? 'verifying' : 'idle');
    hasAttemptedDeviceAuthRef.current = false;
  }, [canTryDeviceAuth, isOpen, pendingAlarmState, title]);

  useEffect(() => {
    if (!isOpen || !canTryDeviceAuth || hasAttemptedDeviceAuthRef.current) {
      return;
    }

    let isMounted = true;
    hasAttemptedDeviceAuthRef.current = true;
    setDevicePhase('verifying');

    window.setTimeout(() => {
      if (!isMounted) {
        return;
      }
      void Promise.resolve(verifyWithDeviceRef.current?.())
        .then((verified) => {
          if (!isMounted) {
            return;
          }
          if (verified) {
            setDevicePhase('success');
            return;
          }
          setDevicePhase('failed');
          if (pendingStateRequiresCode) {
            setShowPinFallback(true);
          }
        })
        .catch(() => {
          if (!isMounted) {
            return;
          }
          setDevicePhase('failed');
          if (pendingStateRequiresCode) {
            setShowPinFallback(true);
          }
        });
    }, 260);

    return () => {
      isMounted = false;
    };
  }, [canTryDeviceAuth, deviceAttemptNonce, isOpen, pendingStateRequiresCode]);

  const retryDeviceAuth = () => {
    setShowPinFallback(false);
    setDevicePhase('verifying');
    hasAttemptedDeviceAuthRef.current = false;
    setDeviceAttemptNonce((current) => current + 1);
  };

  const deviceSubtitle =
    devicePhase === 'verifying'
      ? t('auth.verifyingDevice')
      : devicePhase === 'failed'
        ? pendingStateRequiresCode
          ? t('auth.enterAlarmPin')
          : t('auth.verificationFailed')
        : devicePhase === 'success'
          ? t('auth.verificationComplete')
          : t('auth.preparing');

  const modal = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[280] flex items-center justify-center p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayTransition}
          style={{ willChange: 'opacity' }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('auth.close')}
            className="absolute inset-0 bg-[color:var(--ui-scrim)] backdrop-blur-3xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgb(var(--ui-glass-highlight-rgb)/0.10),transparent_30%),radial-gradient(circle_at_52%_100%,rgb(var(--ui-accent-rgb)/0.08),transparent_38%)]" />

          <motion.div
            className="liquid-glass-panel relative z-10 isolate w-full max-w-[24rem] transform-gpu overflow-hidden rounded-[2.2rem] p-5 sm:p-6"
            initial={{ y: -8, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.985 }}
            transition={panelTransition}
            style={{ willChange: 'transform, opacity' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="glass-icon-button absolute right-4 top-4 h-8 w-8"
              aria-label={t('auth.closeShort')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="pr-10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--ui-text-tertiary)]">{t('auth.secureConfirmation')}</p>
              <h3 className="mt-1 text-xl font-semibold leading-tight tracking-[-0.04em] text-[color:var(--ui-text-primary)]">{resolvedTitle}</h3>
              <p className="mt-2 text-sm leading-snug text-[color:var(--ui-text-secondary)]">{resolvedDescription}</p>
            </div>

            <AnimatePresence mode="wait">
              {shouldShowDeviceStage ? (
                <motion.div
                  key="device-auth"
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.985 }}
                  transition={panelTransition}
                  className="mt-6 flex flex-col items-center text-center"
                >
                  <div className="relative flex h-36 w-36 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-white/[0.13] bg-slate-900/52" />
                    <div
                      className={cn(
                        'absolute inset-4 rounded-full border shadow-[0_24px_58px_rgba(0,0,0,0.28)]',
                        devicePhase === 'failed'
                          ? 'border-rose-200/28 bg-rose-950/58'
                          : devicePhase === 'success'
                            ? 'border-emerald-200/30 bg-emerald-950/58'
                            : 'border-white/[0.18] bg-slate-800/68',
                      )}
                    />
                    {devicePhase === 'verifying' ? (
                      <div className="absolute inset-1 rounded-full border border-white/[0.08] animate-[alarm-orb-breathe_2.8s_ease-in-out_infinite]" />
                    ) : null}
                    <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/[0.22] bg-black/42 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_16px_36px_rgba(0,0,0,0.32)]">
                      {devicePhase === 'verifying' ? (
                        <GlassLoader size="sm" ariaLabel={t('auth.inProgress')} />
                      ) : devicePhase === 'success' ? (
                        <Check className="h-8 w-8 text-emerald-100" strokeWidth={2.1} />
                      ) : devicePhase === 'failed' ? (
                        <Fingerprint className="h-8 w-8 text-rose-100/88" strokeWidth={1.7} />
                      ) : (
                        <ShieldCheck className="h-8 w-8 text-white/84" strokeWidth={1.7} />
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white/86">{resolvedDeviceAuthLabel}</p>
                  <p className="mt-1 max-w-[18rem] text-xs leading-snug text-white/45">{deviceSubtitle}</p>
                  {devicePhase === 'failed' && !pendingStateRequiresCode ? (
                    <div className="mt-5 rounded-[1.25rem] border border-amber-200/20 bg-amber-950/52 px-4 py-3 text-sm text-amber-50/82">
                      {t('auth.deviceUnavailable')}
                    </div>
                  ) : null}
                </motion.div>
              ) : shouldShowPinStage ? (
                <motion.div
                  key="pin"
                  initial={{ opacity: 0, y: 10, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.985 }}
                  transition={panelTransition}
                  className="mt-5"
                >
                  <div className="rounded-[1.7rem] border border-white/[0.14] bg-slate-950/68 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_42px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.13] bg-white/[0.10]">
                          <KeyRound className="h-3.5 w-3.5 text-white/78" />
                        </span>
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">{alarmCodeTypeLabel}</p>
                      </div>
                      {canTryDeviceAuth ? (
                        <button
                          type="button"
                          onClick={retryDeviceAuth}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.13] bg-white/[0.09] px-2.5 text-[0.64rem] font-semibold uppercase tracking-[0.10em] text-white/58 transition hover:bg-white/[0.13] hover:text-white/80"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t('auth.retry')}
                        </button>
                      ) : null}
                    </div>

                    <input
                      type="password"
                      value={authPinInput}
                      onChange={(event) => onPinInputChange(event.target.value)}
                      className={cn(
                        'mt-4 w-full rounded-[1.2rem] border border-white/[0.14] bg-black/32 px-4 py-3 text-center text-lg font-semibold tracking-[0.26em] text-white outline-none placeholder:tracking-normal placeholder:text-sm placeholder:font-medium placeholder:text-white/38 focus:border-white/34',
                        isAlarmCodeNumeric ? 'sr-only' : '',
                      )}
                      placeholder={isAlarmCodeNumeric ? t('auth.enterPin') : t('auth.enterCode')}
                      aria-label={alarmCodeTypeLabel}
                      inputMode={isAlarmCodeNumeric ? 'numeric' : 'text'}
                    />

                    {isAlarmCodeNumeric ? (
                      <>
                        <div className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[1.15rem] border border-white/[0.12] bg-black/30">
                          {pinSlots.map((_, index) => (
                            <span
                              key={index}
                              className={cn(
                                'h-2.5 w-2.5 rounded-full transition',
                                index < authPinInput.length
                                  ? 'bg-white/92 shadow-[0_0_14px_rgba(255,255,255,0.32)]'
                                  : 'bg-white/[0.24]',
                              )}
                            />
                          ))}
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              onClick={() => onPushPinDigit(digit)}
                              className="h-[3.25rem] rounded-full border border-white/[0.12] bg-white/[0.09] text-lg font-medium text-white/92 transition hover:bg-white/[0.13] active:scale-[0.96]"
                            >
                              {digit}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={onClearPin}
                            className="h-[3.25rem] rounded-full border border-transparent bg-transparent text-[0.67rem] font-semibold uppercase tracking-[0.12em] text-white/48 transition hover:bg-white/[0.08] hover:text-white/68 active:scale-[0.96]"
                          >
                            {t('auth.clear')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onPushPinDigit('0')}
                            className="h-[3.25rem] rounded-full border border-white/[0.12] bg-white/[0.09] text-lg font-medium text-white/92 transition hover:bg-white/[0.13] active:scale-[0.96]"
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={onPopPinDigit}
                            className="flex h-[3.25rem] items-center justify-center rounded-full border border-transparent bg-transparent text-white/52 transition hover:bg-white/[0.08] hover:text-white/72 active:scale-[0.96]"
                            aria-label={t('auth.deleteLast')}
                          >
                            <Delete className="h-5 w-5" />
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={onVerifyWithPin}
                    disabled={isAuthBusy}
                    className={cn(
                      'mt-4 w-full rounded-full border border-white/[0.18] bg-white/[0.20] px-3 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_14px_30px_rgba(0,0,0,0.24)] transition hover:bg-white/[0.25] active:scale-[0.985]',
                      isAuthBusy ? 'cursor-default opacity-45' : '',
                    )}
                  >
                    {isAuthBusy ? t('auth.checking') : t('auth.confirm')}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="no-fallback"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={panelTransition}
                  className="mt-5 rounded-[1.35rem] border border-amber-200/20 bg-amber-950/52 px-4 py-3 text-sm text-amber-50/84"
                >
                  {t('auth.unavailable')}
                </motion.div>
              )}
            </AnimatePresence>

            {authError && !shouldShowDeviceStage ? (
              <p className="mt-3 text-center text-xs font-medium text-rose-200/90">{authError}</p>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (usePortal && typeof document !== 'undefined') {
    return createPortal(modal, document.body);
  }

  return modal;
}

export default SecurityAuthModal;
