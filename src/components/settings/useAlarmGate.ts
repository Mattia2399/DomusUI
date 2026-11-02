import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import {
  INITIAL_AUTH_ATTEMPT_STATE,
  appendSecurityAuditEvent,
  formatAuthRateLimitMessage,
  getAuthRateLimitStatus,
  recordAuthFailure,
  recordAuthSuccess,
} from '../../services/securityAuth';
import {
  resolveAlarmManualCodeSubmission,
  resolveAlarmSecurityRequirement,
  type AlarmActionAuthOptions,
  type AlarmSecurityActionKind,
} from '../../utils/alarmSecurityPolicy';

/*
 * What stands between a touch and an alarm command: the code the entity asks
 * for, the device authorization, the limit on wrong attempts and the audit
 * trail. Every panel of the alarm goes through here, so that there is one gate.
 */

export type AlarmActionResult = boolean | void | Promise<boolean | void>;

export type AlarmActionId = 'disarm' | 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass' | 'trigger';

export type AlarmGateAction = {
  id: AlarmActionId;
  label: string;
  state?: string;
  onPress: (code?: string, options?: AlarmActionAuthOptions) => AlarmActionResult;
};

export type AlarmGateAlarm = {
  name: string;
  codeArmRequired?: boolean;
  unlockCode?: string;
  localExtraCode?: string;
  requireAuthToDisarm?: boolean;
  rawAttributes?: Record<string, unknown>;
};

const ALARM_ACTION_KIND_BY_ID: Record<AlarmActionId, AlarmSecurityActionKind> = {
  home: 'arm_home',
  away: 'arm_away',
  night: 'arm_night',
  vacation: 'arm_vacation',
  custom_bypass: 'arm_custom_bypass',
  disarm: 'disarm',
  trigger: 'trigger',
};

const CODE_LENGTH_LIMIT = 12;

export function useAlarmGate<TAction extends AlarmGateAction>({
  alarm,
  onAuthorizeDeviceAuth,
  onRan,
}: {
  alarm: AlarmGateAlarm;
  onAuthorizeDeviceAuth?: (label: string) => Promise<boolean>;
  onRan?: (action: TAction) => void;
}) {
  const { t } = useI18n();
  const [pendingAction, setPendingAction] = useState<TAction | null>(null);
  const [authCode, setAuthCode] = useState('');
  const [authSubmissionError, setAuthSubmissionError] = useState('');
  const [authAttemptState, setAuthAttemptState] = useState(INITIAL_AUTH_ATTEMPT_STATE);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const codeRequired = Boolean(alarm.codeArmRequired);
  const codeFormat = typeof alarm.rawAttributes?.code_format === 'string'
    ? alarm.rawAttributes.code_format.toLowerCase()
    : undefined;
  const storedHaPin = alarm.unlockCode?.trim() ?? '';
  const storedHaPinActive = storedHaPin.length > 0;
  const localExtraCode = alarm.localExtraCode?.trim() ?? '';
  const localExtraCodeActive = localExtraCode.length > 0;
  const requirementOf = (action: TAction) =>
    resolveAlarmSecurityRequirement({
      action: ALARM_ACTION_KIND_BY_ID[action.id],
      codeArmRequired: codeRequired,
      codeFormat,
      storedHaPinConfigured: storedHaPinActive,
      localExtraPinConfigured: localExtraCodeActive,
      deviceAuthEnabled: alarm.requireAuthToDisarm,
    });
  const pendingSecurityRequirement = pendingAction ? requirementOf(pendingAction) : null;
  const numericCodeMode = pendingSecurityRequirement?.codeFormat !== 'text';
  const alarmCodeTypeLabel = localExtraCodeActive ? t('alarm.auth.combinedPin') : t('alarm.auth.pin');
  const trimmedCode = authCode.trim();
  const pendingNeedsCode = Boolean(pendingSecurityRequirement?.needsCodeInput);
  const pendingPrefersDeviceAuth = Boolean(pendingSecurityRequirement?.allowsDeviceAuth && onAuthorizeDeviceAuth);
  const rateLimitStatus = getAuthRateLimitStatus(authAttemptState);
  const rateLimitMessage = formatAuthRateLimitMessage(rateLimitStatus);
  const authError = rateLimitMessage || authSubmissionError;

  const closeActionDialog = () => {
    if (isAuthBusy) {
      return;
    }
    setPendingAction(null);
    setAuthCode('');
    setAuthSubmissionError('');
  };

  const runAlarmAction = async (action: TAction, code?: string, options?: AlarmActionAuthOptions) => {
    if (isAuthBusy) {
      return false;
    }
    setIsAuthBusy(true);
    try {
      const didRun = await action.onPress(code, options);
      if (didRun === false) {
        setAuthSubmissionError(t('alarm.auth.unauthorized'));
        return false;
      }
      onRan?.(action);
      setPendingAction(null);
      setAuthCode('');
      setAuthSubmissionError('');
      return true;
    } finally {
      setIsAuthBusy(false);
    }
  };

  const openActionDialog = (action: TAction) => {
    const requirement = requirementOf(action);
    if (!requirement.needsCodeInput) {
      if (requirement.allowsDeviceAuth && onAuthorizeDeviceAuth) {
        setPendingAction(action);
        setAuthCode('');
        setAuthSubmissionError('');
        return;
      }
      void runAlarmAction(action);
      return;
    }
    setPendingAction(action);
    setAuthCode('');
    setAuthSubmissionError('');
  };

  const confirmPendingDeviceAuth = async () => {
    if (!pendingAction || !pendingSecurityRequirement?.allowsDeviceAuth || !onAuthorizeDeviceAuth) {
      return false;
    }

    const verified = await onAuthorizeDeviceAuth(pendingAction.label);
    if (!verified) {
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('alarm.audit.deviceFailed'),
        context: alarm.name || t('alarm.fallback'),
      });
      return false;
    }

    if (pendingSecurityRequirement.needsCodeInput && !storedHaPinActive) {
      return false;
    }

    appendSecurityAuditEvent({
      tone: 'success',
      message: t('alarm.audit.deviceAuthorized'),
      context: alarm.name || t('alarm.fallback'),
    });
    const didRun = await runAlarmAction(
      pendingAction,
      pendingSecurityRequirement.needsCodeInput ? storedHaPin : undefined,
      { deviceAuthVerified: true },
    );
    return didRun;
  };

  const confirmPendingAction = async () => {
    if (!pendingAction || isAuthBusy) {
      return;
    }
    if (!pendingSecurityRequirement?.needsCodeInput) {
      await runAlarmAction(pendingAction);
      return;
    }
    if (rateLimitStatus.isLocked) {
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('alarm.audit.temporarilyLocked'),
        context: alarm.name || t('alarm.fallback'),
      });
      return;
    }
    const manualCodeSubmission = resolveAlarmManualCodeSubmission({
      inputCode: authCode,
      localExtraCode,
      storedHaCode: storedHaPin,
      requiresCode: pendingSecurityRequirement.needsCodeInput,
    });
    if (manualCodeSubmission.ok === false && manualCodeSubmission.reason === 'missing') {
      setAuthSubmissionError(t('alarm.auth.enterCode', { label: alarmCodeTypeLabel.toLocaleLowerCase() }));
      return;
    }
    if (manualCodeSubmission.ok === false) {
      setAuthSubmissionError(t('alarm.auth.failed'));
      setAuthAttemptState(recordAuthFailure(authAttemptState));
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('alarm.audit.invalidPin'),
        context: alarm.name || t('alarm.fallback'),
      });
      return;
    }
    setAuthSubmissionError('');
    const code = manualCodeSubmission.haCode;
    const didRun = await runAlarmAction(pendingAction, code, { manualCodeVerified: true });
    if (!didRun) {
      setAuthAttemptState(recordAuthFailure(authAttemptState));
      return;
    }
    setAuthAttemptState(recordAuthSuccess());
    appendSecurityAuditEvent({
      tone: 'success',
      message: t('alarm.audit.pinVerified'),
      context: alarm.name || t('alarm.fallback'),
    });
  };

  const pushCodeDigit = (digit: string) => {
    if (trimmedCode.length >= CODE_LENGTH_LIMIT) {
      return;
    }
    setAuthSubmissionError('');
    setAuthCode((current) => `${current}${digit}`.slice(0, CODE_LENGTH_LIMIT));
  };

  const popCodeDigit = () => {
    setAuthSubmissionError('');
    setAuthCode((current) => current.slice(0, -1));
  };

  const clearCode = () => {
    setAuthSubmissionError('');
    setAuthCode('');
  };

  return {
    open: openActionDialog,
    modalProps: {
      isOpen: Boolean(pendingAction),
      pendingAlarmState: pendingAction?.state ?? null,
      pendingStateRequiresCode: pendingNeedsCode,
      title: pendingAction ? t('home.security.commandTitle') : undefined,
      description: pendingSecurityRequirement?.needsCodeInput ? t('home.security.alarmDescription') : t('home.security.deviceDescription'),
      authError,
      isAuthBusy,
      isAlarmCodeNumeric: numericCodeMode,
      alarmCodeTypeLabel,
      authPinInput: authCode,
      preferDeviceAuth: pendingPrefersDeviceAuth,
      deviceAuthLabel: t('alarm.auth.deviceVerify'),
      onVerifyWithDevice: pendingPrefersDeviceAuth ? confirmPendingDeviceAuth : undefined,
      onPinInputChange: (value: string) => {
        setAuthSubmissionError('');
        setAuthCode(
          numericCodeMode
            ? value.replace(/[^\d]/g, '').slice(0, CODE_LENGTH_LIMIT)
            : value.slice(0, CODE_LENGTH_LIMIT),
        );
      },
      onVerifyWithPin: confirmPendingAction,
      onPushPinDigit: pushCodeDigit,
      onPopPinDigit: popCodeDigit,
      onClearPin: clearCode,
      onClose: closeActionDialog,
      usePortal: true,
    },
  };
}
