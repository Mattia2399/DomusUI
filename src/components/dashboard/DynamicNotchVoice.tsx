import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mic } from 'lucide-react';
import type { AssistantAgentClient } from '../../services/assistant/agentClients';
import { useI18n } from '../../i18n/I18nProvider';

type AssistantState = 'idle' | 'listening' | 'processing';

type DynamicNotchVoiceProps = {
  agentClient: AssistantAgentClient;
};

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultsLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultsLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

const VOICE_SEND_DEBOUNCE_MS = 950;
const PROCESSING_SETTLE_MS = 820;
const DRAG_ACTIVATION_DISTANCE = 64;
const DRAG_MAX_DISTANCE = 210;
const DRAG_TAP_TOLERANCE = 8;
const ASSISTANT_CONVERSATION_ENTITY_STORAGE_KEY = 'ha.dashboard.assistant.conversation.entity.v1';

const NOTCH_SPRING = {
  type: 'spring',
  stiffness: 300,
  damping: 23,
  mass: 0.8,
} as const;

const NOTCH_GEOMETRY: Record<AssistantState, { width: number; height: number; radius: string }> = {
  idle: {
    width: 7,
    height: 130,
    radius: '999px 0 0 999px',
  },
  listening: {
    width: 280,
    height: 52,
    radius: '26px 0 0 26px',
  },
  processing: {
    width: 220,
    height: 44,
    radius: '22px 0 0 22px',
  },
};

const WAVE_BARS = [10, 18, 13, 24, 16, 22, 12, 19, 11];

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') {
    return null;
  }
  const speechWindow = window as WindowWithSpeechRecognition;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function loadStoredConversationEntity() {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.localStorage.getItem(ASSISTANT_CONVERSATION_ENTITY_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function stopRecognitionSafely(recognition: SpeechRecognitionLike | null) {
  if (!recognition) {
    return;
  }
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.stop();
  } catch {
    // Browser speech engines can throw if stop() races their own shutdown.
  }
}

export function DynamicNotchVoice({ agentClient }: DynamicNotchVoiceProps) {
  const { t } = useI18n();
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const assistantStateRef = useRef<AssistantState>('idle');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftRef = useRef('');
  const liveTranscriptRef = useRef('');
  const conversationIdRef = useRef<string | undefined>(undefined);
  const conversationEntityIdRef = useRef(loadStoredConversationEntity());
  const voiceCommitTimerRef = useRef<number | null>(null);
  const processingResetTimerRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const didDragRef = useRef(false);
  const handleToggleRef = useRef<() => void>(() => {});

  const geometry = NOTCH_GEOMETRY[assistantState];
  const isListening = assistantState === 'listening';
  const isProcessing = assistantState === 'processing';
  const isSpeechRecognitionSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);
  const dragProgress =
    assistantState === 'idle' ? Math.max(0, Math.min(1, dragOffset / DRAG_MAX_DISTANCE)) : 0;
  const isIdleDrag = assistantState === 'idle' && (isDragging || dragOffset > 0);
  const visualGeometry = isIdleDrag
    ? {
        width: Math.round(NOTCH_GEOMETRY.idle.width + (210 - NOTCH_GEOMETRY.idle.width) * dragProgress),
        height: Math.round(NOTCH_GEOMETRY.idle.height + (64 - NOTCH_GEOMETRY.idle.height) * dragProgress),
        radius: dragProgress > 0.32 ? '32px 0 0 32px' : NOTCH_GEOMETRY.idle.radius,
      }
    : geometry;
  const edgeStemWidth = assistantState === 'idle' ? 8 + dragProgress * 4 : 14;
  const edgeStemHeight =
    assistantState === 'idle'
      ? 118 + dragProgress * 36
      : assistantState === 'listening'
        ? 156
        : 138;
  const bridgeBlobSize = isIdleDrag ? 18 + dragProgress * 34 : isListening ? 42 : isProcessing ? 28 : 0;
  const bridgeBlobX = isIdleDrag ? -10 - dragProgress * 96 : isListening ? -16 : -8;

  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  const clearVoiceCommitTimer = React.useCallback(() => {
    if (voiceCommitTimerRef.current !== null) {
      window.clearTimeout(voiceCommitTimerRef.current);
      voiceCommitTimerRef.current = null;
    }
  }, []);

  const clearProcessingResetTimer = React.useCallback(() => {
    if (processingResetTimerRef.current !== null) {
      window.clearTimeout(processingResetTimerRef.current);
      processingResetTimerRef.current = null;
    }
  }, []);

  const resetVoiceDraft = React.useCallback(() => {
    voiceDraftRef.current = '';
    liveTranscriptRef.current = '';
    setLiveTranscript('');
  }, []);

  const settleBackToIdle = React.useCallback(() => {
    clearProcessingResetTimer();
    processingResetTimerRef.current = window.setTimeout(() => {
      isProcessingRef.current = false;
      setAssistantState('idle');
    }, PROCESSING_SETTLE_MS);
  }, [clearProcessingResetTimer]);

  const sendCommand = React.useCallback(
    async (rawText: string) => {
      const normalized = rawText.trim();
      if (!normalized || isProcessingRef.current) {
        setAssistantState('idle');
        return;
      }

      isProcessingRef.current = true;
      setAssistantState('processing');
      setStatusMessage('');

      try {
        const response = await agentClient.sendText(normalized, {
          conversationId: conversationIdRef.current,
          agentId: conversationEntityIdRef.current.trim() || undefined,
        });
        if (response.conversationId) {
          conversationIdRef.current = response.conversationId;
        }
        setStatusMessage(response.text);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t('assistant.sendError');
        setStatusMessage(message);
      } finally {
        resetVoiceDraft();
        settleBackToIdle();
      }
    },
    [agentClient, resetVoiceDraft, settleBackToIdle, t],
  );

  const commitCurrentVoiceDraft = React.useCallback(() => {
    clearVoiceCommitTimer();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    stopRecognitionSafely(recognition);

    const normalized = (voiceDraftRef.current.trim() || liveTranscriptRef.current.trim()).trim();
    resetVoiceDraft();
    if (!normalized) {
      setAssistantState('idle');
      return;
    }

    void sendCommand(normalized);
  }, [clearVoiceCommitTimer, resetVoiceDraft, sendCommand]);

  const cancelListening = React.useCallback(
    (message?: string) => {
      clearVoiceCommitTimer();
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      stopRecognitionSafely(recognition);
      resetVoiceDraft();
      if (message) {
        setStatusMessage(message);
      }
      setAssistantState('idle');
    },
    [clearVoiceCommitTimer, resetVoiceDraft],
  );

  const startListening = React.useCallback(() => {
    if (isProcessingRef.current) {
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setStatusMessage('Trascrizione vocale non supportata in questo browser.');
      setAssistantState('processing');
      settleBackToIdle();
      return;
    }

    clearProcessingResetTimer();
    isProcessingRef.current = false;
    resetVoiceDraft();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalSegment = '';
      let interimSegment = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? '';
        if (!transcript) {
          continue;
        }
        if (result.isFinal) {
          finalSegment = finalSegment.length > 0 ? `${finalSegment} ${transcript}` : transcript;
        } else {
          interimSegment = interimSegment.length > 0 ? `${interimSegment} ${transcript}` : transcript;
        }
      }

      if (finalSegment.length > 0) {
        voiceDraftRef.current =
          voiceDraftRef.current.length > 0 ? `${voiceDraftRef.current} ${finalSegment}` : finalSegment;
        clearVoiceCommitTimer();
        voiceCommitTimerRef.current = window.setTimeout(() => {
          commitCurrentVoiceDraft();
        }, VOICE_SEND_DEBOUNCE_MS);
      }

      const composedLiveText = [voiceDraftRef.current, interimSegment].filter(Boolean).join(' ').trim();
      liveTranscriptRef.current = composedLiveText;
      setLiveTranscript(composedLiveText);
    };

    recognition.onerror = (event) => {
      const errorCode = typeof event.error === 'string' ? event.error : '';
      if (errorCode === 'no-speech') {
        return;
      }
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        cancelListening('Permesso microfono negato.');
        return;
      }
      if (errorCode.length > 0) {
        cancelListening(`Trascrizione vocale interrotta (${errorCode}).`);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) {
        return;
      }
      recognitionRef.current = null;
      if (assistantStateRef.current === 'listening') {
        commitCurrentVoiceDraft();
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setStatusMessage('');
      setAssistantState('listening');
    } catch {
      stopRecognitionSafely(recognition);
      setStatusMessage(t('assistant.transcriptionStartError'));
      setAssistantState('idle');
    }
  }, [
    cancelListening,
    clearProcessingResetTimer,
    clearVoiceCommitTimer,
    commitCurrentVoiceDraft,
    resetVoiceDraft,
    settleBackToIdle,
  ]);

  useEffect(() => {
    return () => {
      clearVoiceCommitTimer();
      clearProcessingResetTimer();
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      stopRecognitionSafely(recognition);
    };
  }, [clearProcessingResetTimer, clearVoiceCommitTimer]);

  const handleToggle = React.useCallback(() => {
    if (assistantState === 'listening') {
      commitCurrentVoiceDraft();
      return;
    }
    if (assistantState === 'processing') {
      return;
    }
    startListening();
  }, [assistantState, commitCurrentVoiceDraft, startListening]);

  useEffect(() => {
    handleToggleRef.current = handleToggle;
  }, [handleToggle]);

  const settleDrag = React.useCallback(() => {
    dragPointerIdRef.current = null;
    dragOffsetRef.current = 0;
    didDragRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  const updateDragOffset = React.useCallback((clientX: number) => {
    const leftDrag = Math.max(0, dragStartXRef.current - clientX);
    const nextOffset = Math.min(leftDrag, DRAG_MAX_DISTANCE);
    dragOffsetRef.current = nextOffset;
    if (nextOffset > DRAG_TAP_TOLERANCE) {
      didDragRef.current = true;
    }
    setDragOffset(nextOffset);
  }, []);

  const completeDrag = React.useCallback(() => {
    const shouldActivateFromDrag = dragOffsetRef.current >= DRAG_ACTIVATION_DISTANCE;
    const shouldActivateFromTap = !didDragRef.current;
    settleDrag();

    if (shouldActivateFromDrag || shouldActivateFromTap) {
      handleToggleRef.current();
    }
  }, [settleDrag]);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const cleanupWindowDragListeners = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };

    const releasePointer = (pointerId: number) => {
      try {
        trigger.releasePointerCapture(pointerId);
      } catch {
        // no-op
      }
    };

    const finishDrag = (event: PointerEvent, shouldActivate: boolean) => {
      if (dragPointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointer(event.pointerId);
      cleanupWindowDragListeners();
      if (shouldActivate) {
        completeDrag();
      } else {
        settleDrag();
      }
    };

    function handleWindowPointerMove(event: PointerEvent) {
      if (dragPointerIdRef.current !== event.pointerId) {
        return;
      }
      updateDragOffset(event.clientX);
    }

    function handleWindowPointerUp(event: PointerEvent) {
      finishDrag(event, true);
    }

    function handleWindowPointerCancel(event: PointerEvent) {
      finishDrag(event, false);
    }

    const handleNativePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !trigger.contains(target)) {
        return;
      }
      if (assistantStateRef.current === 'processing') {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      event.preventDefault();
      cleanupWindowDragListeners();
      dragPointerIdRef.current = event.pointerId;
      dragStartXRef.current = event.clientX;
      dragOffsetRef.current = 0;
      didDragRef.current = false;
      setIsDragging(true);
      setDragOffset(0);

      try {
        trigger.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }

      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
      window.addEventListener('pointercancel', handleWindowPointerCancel);
    };

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      handleToggleRef.current();
    };

    window.addEventListener('pointerdown', handleNativePointerDown, { capture: true });
    trigger.addEventListener('keydown', handleNativeKeyDown);

    return () => {
      cleanupWindowDragListeners();
      window.removeEventListener('pointerdown', handleNativePointerDown, { capture: true });
      trigger.removeEventListener('keydown', handleNativeKeyDown);
    };
  }, [completeDrag, settleDrag, updateDragOffset]);

  const assistantAriaLabel = assistantState === 'listening'
    ? t('assistant.micOn')
    : assistantState === 'processing'
      ? t('assistant.sending')
      : statusMessage || t('assistant.open');

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[260] flex items-center justify-end">
      <svg aria-hidden className="absolute h-0 w-0">
        <filter id="notch-liquid-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 19 -8"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>

      <button
        ref={triggerRef}
        type="button"
        className="pointer-events-auto relative flex h-72 w-24 cursor-grab touch-none items-center justify-end bg-transparent p-0 outline-none active:cursor-grabbing sm:h-80 sm:w-28"
        aria-label={assistantAriaLabel}
        data-assistant-state={assistantState}
        data-drag-offset={Math.round(dragOffset)}
        title={statusMessage || (isSpeechRecognitionSupported ? 'Assist' : t('assistant.transcriptionUnsupportedShort'))}
        style={{ scale: 1 }}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 flex w-80 items-center justify-end"
          style={{ filter: 'url(#notch-liquid-goo)' }}
        >
          <motion.span
            className="absolute right-[-1px] top-1/2 bg-black"
            animate={{
              width: edgeStemWidth,
              height: edgeStemHeight,
              borderRadius: '999px 0 0 999px',
              opacity: 0.98,
            }}
            transition={NOTCH_SPRING}
            style={{ translate: '0 -50%' }}
          />
          <motion.span
            className="absolute right-[-1px] top-1/2 bg-black"
            animate={{
              width: visualGeometry.width,
              height: visualGeometry.height,
              borderRadius: visualGeometry.radius,
              opacity: assistantState === 'idle' ? 0.98 : 0.94,
            }}
            transition={NOTCH_SPRING}
            style={{ translate: '0 -50%' }}
          />
          <motion.span
            className="absolute right-5 top-1/2 rounded-full bg-black"
            animate={{
              width: bridgeBlobSize,
              height: bridgeBlobSize,
              opacity: assistantState === 'idle' ? dragProgress * 0.9 : 0.85,
              x: bridgeBlobX,
            }}
            transition={NOTCH_SPRING}
            style={{ translate: '0 -50%' }}
          />
        </div>

        <motion.div
          aria-hidden
          className="absolute right-[-1px] top-1/2 overflow-hidden border backdrop-blur-2xl"
          animate={{
            width: visualGeometry.width,
            height: visualGeometry.height,
            borderRadius: visualGeometry.radius,
            borderColor:
              assistantState === 'idle'
                ? `rgba(255,255,255,${0.03 + dragProgress * 0.1})`
                : 'rgba(255,255,255,0.14)',
            backgroundColor:
              assistantState === 'idle'
                ? `rgba(0,0,0,${0.95 - dragProgress * 0.12})`
                : 'rgba(4,7,12,0.72)',
            boxShadow:
              assistantState === 'idle' && dragProgress <= 0
                ? '0 8px 22px rgba(0,0,0,0.2)'
                : `0 16px ${28 + dragProgress * 18}px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,${0.08 + dragProgress * 0.08})`,
          }}
          transition={NOTCH_SPRING}
          style={{ translate: '0 -50%' }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02)_38%,rgba(255,255,255,0.08))]" />
          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div
                key="listening"
                className="relative z-10 flex h-full items-center justify-center gap-3 px-4 text-cyan-50"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                <motion.span
                  className="relative flex h-7 w-7 items-center justify-center rounded-full border border-cyan-100/25 bg-cyan-300/15"
                  animate={{
                    boxShadow: [
                      '0 0 0 0 rgba(125,211,252,0.34)',
                      '0 0 0 9px rgba(125,211,252,0)',
                      '0 0 0 0 rgba(125,211,252,0)',
                    ],
                  }}
                  transition={{ duration: 1.18, repeat: Infinity, ease: 'easeOut' }}
                >
                  <Mic size={14} />
                </motion.span>
                <span className="flex h-7 items-center gap-1.5" aria-hidden>
                  {WAVE_BARS.map((height, index) => (
                    <motion.span
                      key={`${height}-${index}`}
                      className="w-1 rounded-full bg-cyan-100/55"
                      animate={{
                        height: [7, height, 8],
                        opacity: [0.32, 0.86, 0.42],
                      }}
                      transition={{
                        duration: 0.68,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: index * 0.045,
                      }}
                    />
                  ))}
                </span>
                <span className="sr-only">{liveTranscript || 'In ascolto'}</span>
              </motion.div>
            ) : isProcessing ? (
              <motion.div
                key="processing"
                className="relative z-10 flex h-full items-center justify-center text-white/85"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.14 }}
              >
                <motion.span
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.82, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 size={15} />
                </motion.span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </button>
    </div>
  );
}
