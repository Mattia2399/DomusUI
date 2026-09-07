import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, PencilLine, SendHorizontal, Sparkles, X } from 'lucide-react';
import type { AssistantAgentClient } from '../../services/assistant/agentClients';
import { useI18n } from '../../i18n/I18nProvider';

type FavoritesDrawerProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  agentClient: AssistantAgentClient;
  haEntityIds?: string[];
};

const DRAWER_WIDTH = 380;
const EDGE_HIT_WIDTH = 20;
const OPEN_DRAG_RATIO_THRESHOLD = 0.08;
const CLOSE_DRAG_RATIO_THRESHOLD = 0.62;
const DRAG_TAP_TOLERANCE_PX = 8;
const VOICE_SEND_DEBOUNCE_MS = 950;
const ASSISTANT_MIC_ENABLED_STORAGE_KEY = 'ha.dashboard.assistant.mic.enabled.v1';
const ASSISTANT_CONVERSATION_ENTITY_STORAGE_KEY = 'ha.dashboard.assistant.conversation.entity.v1';

type ChatRole = 'user' | 'assistant' | 'system';

type AssistantChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

type MicReactiveLinesProps = {
  isListening: boolean;
};

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
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

function createChatMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `assistant-chat-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function loadStoredMicEnabled() {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(ASSISTANT_MIC_ENABLED_STORAGE_KEY);
    if (raw === '0') {
      return false;
    }
    if (raw === '1') {
      return true;
    }
  } catch {
    // no-op
  }
  return true;
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

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') {
    return null;
  }
  const speechWindow = window as WindowWithSpeechRecognition;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function averageSlice(values: Uint8Array, start: number, end: number) {
  if (end <= start) {
    return 0;
  }
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += values[index] ?? 0;
  }
  return total / (end - start);
}

function MicReactiveLines({ isListening }: MicReactiveLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);

  const stopAudioCapture = React.useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;

    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      // no-op
    }
    sourceNodeRef.current = null;

    try {
      analyserRef.current?.disconnect();
    } catch {
      // no-op
    }
    analyserRef.current = null;
    frequencyDataRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') {
      await context.close();
    }
  }, []);

  const startAudioCapture = React.useCallback(async () => {
    if (analyserRef.current || !isListening) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioContextCtor = window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('AudioContext non supportato');
      }
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = context;
      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      await stopAudioCapture();
    }
  }, [isListening, stopAudioCapture]);

  useEffect(() => {
    if (!isListening) {
      void stopAudioCapture();
      return;
    }
    void startAudioCapture();
    return () => {
      void stopAudioCapture();
    };
  }, [isListening, startAudioCapture, stopAudioCapture]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context2d = canvas.getContext('2d');
    if (!context2d) {
      return;
    }

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio));
      context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    resizeCanvas();
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);

    const render = (time: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const analyser = analyserRef.current;
      const frequencyData = frequencyDataRef.current;
      const hasLiveAudio = isListening && Boolean(analyser && frequencyData);

      let lowEnergy = 0;
      let midEnergy = 0;
      let highEnergy = 0;

      if (hasLiveAudio && analyser && frequencyData) {
        analyser.getByteFrequencyData(frequencyData);
        const dataLength = frequencyData.length;
        const lowEnd = Math.max(1, Math.floor(dataLength * 0.18));
        const midEnd = Math.max(lowEnd + 1, Math.floor(dataLength * 0.48));
        const highEnd = Math.max(midEnd + 1, Math.floor(dataLength * 0.95));
        lowEnergy = averageSlice(frequencyData, 0, lowEnd) / 255;
        midEnergy = averageSlice(frequencyData, lowEnd, midEnd) / 255;
        highEnergy = averageSlice(frequencyData, midEnd, highEnd) / 255;
      }

      context2d.clearRect(0, 0, width, height);
      context2d.globalCompositeOperation = 'screen';

      const lines = [
        {
          colorA: 'rgba(125, 211, 252, 0.92)',
          colorB: 'rgba(34, 211, 238, 0.38)',
          energy: lowEnergy,
          yRatio: 0.5,
          yOffset: -5,
          phase: 0,
        },
        {
          colorA: 'rgba(167, 139, 250, 0.88)',
          colorB: 'rgba(59, 130, 246, 0.42)',
          energy: midEnergy,
          yRatio: 0.5,
          yOffset: 0,
          phase: 1.6,
        },
        {
          colorA: 'rgba(45, 212, 191, 0.88)',
          colorB: 'rgba(56, 189, 248, 0.38)',
          energy: highEnergy,
          yRatio: 0.5,
          yOffset: 5,
          phase: 3.2,
        },
      ];

      lines.forEach((line) => {
        const gradient = context2d.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, line.colorA);
        gradient.addColorStop(1, line.colorB);
        context2d.strokeStyle = gradient;
        context2d.lineWidth = 1.6 + line.energy * 3.3;
        context2d.beginPath();

        const amplitude = hasLiveAudio ? line.energy * 28 : 0;
        for (let x = 0; x <= width; x += 3) {
          const nx = x / width;
          const t = hasLiveAudio ? time * 0.0014 : 0;
          const waveA = Math.sin(nx * 20 + t * 2.2 + line.phase);
          const waveB = Math.sin(nx * 38 - t * 1.7 + line.phase * 0.7);
          const waveC = Math.cos(nx * 14 + t * 2.6 - line.phase * 0.6);
          const mixed = waveA * 0.58 + waveB * 0.25 + waveC * 0.17;
          const y = height * line.yRatio + line.yOffset + mixed * amplitude;
          if (x === 0) {
            context2d.moveTo(x, y);
          } else {
            context2d.lineTo(x, y);
          }
        }
        context2d.stroke();
      });

      context2d.globalCompositeOperation = 'source-over';
      animationRef.current = window.requestAnimationFrame(render);
    };

    animationRef.current = window.requestAnimationFrame(render);
    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      observer.disconnect();
    };
  }, [isListening]);

  return (
    <div className="mt-4 -mx-5">
      <canvas ref={canvasRef} className="ai-mic-lines-canvas" />
    </div>
  );
}

export function FavoritesDrawer({ isOpen, onOpen, onClose, agentClient, haEntityIds = [] }: FavoritesDrawerProps) {
  const { t, locale } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const [command, setCommand] = useState('');
  const [isCoarsePointer, setIsCoarsePointer] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(pointer: coarse)').matches;
  });
  const [isListening, setIsListening] = useState(loadStoredMicEnabled);
  const [isKeyboardInputVisible, setIsKeyboardInputVisible] = useState(false);
  const [isConversationEntityEditMode, setIsConversationEntityEditMode] = useState(false);
  const [conversationEntityId, setConversationEntityId] = useState(loadStoredConversationEntity);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [chatMessages, setChatMessages] = useState<AssistantChatMessage[]>(() => [
    {
      id: createChatMessageId(),
      role: 'assistant',
      text: agentClient.isReady
        ? t('assistant.ready', { agent: agentClient.label })
        : t('assistant.offline'),
    },
  ]);
  const startXRef = useRef(0);
  const startOpenRef = useRef(false);
  const dragDistanceRef = useRef(0);
  const isSendingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRecognitionRef = useRef(false);
  const voiceDraftRef = useRef('');
  const voiceCommitTimerRef = useRef<number | null>(null);
  const voiceQueueRef = useRef<string[]>([]);
  const drainingVoiceQueueRef = useRef(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const conversationEntityIdRef = useRef(conversationEntityId);
  const conversationViewportRef = useRef<HTMLDivElement | null>(null);
  const conversationEntityDatalistId = 'assistant-conversation-entity-options';

  const conversationEntitySuggestions = React.useMemo(() => {
    const uniqueEntityIds = Array.from(new Set(haEntityIds.map((entityId) => entityId.trim()).filter(Boolean)));
    const focused = uniqueEntityIds.filter(
      (entityId) =>
        entityId.startsWith('conversation.') ||
        entityId.startsWith('assist_satellite.') ||
        entityId.includes('conversation') ||
        entityId.includes('assist'),
    );
    const fallback = focused.length > 0 ? focused : uniqueEntityIds;
    return fallback.slice(0, 220);
  }, [haEntityIds]);
  const isSpeechRecognitionSupported = React.useMemo(() => getSpeechRecognitionCtor() !== null, []);
  const canUseEdgeSwipe = !isCoarsePointer;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const handleChange = () => {
      setIsCoarsePointer(mediaQuery.matches);
    };
    handleChange();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }
    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    conversationEntityIdRef.current = conversationEntityId;
  }, [conversationEntityId]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - startXRef.current;
      dragDistanceRef.current = Math.max(dragDistanceRef.current, Math.abs(delta));
      if (startOpenRef.current) {
        const nextTranslate = Math.min(Math.max(delta, 0), DRAWER_WIDTH);
        setDragTranslate(nextTranslate);
      } else {
        const nextTranslate = Math.min(Math.max(DRAWER_WIDTH - Math.max(-delta, 0), 0), DRAWER_WIDTH);
        setDragTranslate(nextTranslate);
      }
    };

    const handlePointerUp = () => {
      const currentTranslate = dragTranslate ?? (isOpen ? 0 : DRAWER_WIDTH);
      const openedRatio = 1 - currentTranslate / DRAWER_WIDTH;
      const isTap = dragDistanceRef.current <= DRAG_TAP_TOLERANCE_PX;
      if (startOpenRef.current) {
        if (isTap || openedRatio >= CLOSE_DRAG_RATIO_THRESHOLD) {
          onOpen();
        } else {
          onClose();
        }
      } else {
        if (isTap || openedRatio >= OPEN_DRAG_RATIO_THRESHOLD) {
          onOpen();
        } else {
          onClose();
        }
      }
      setDragging(false);
      setDragTranslate(null);
      dragDistanceRef.current = 0;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragging, dragTranslate, isOpen, onOpen, onClose]);

  const beginDrag = (event: React.PointerEvent, startOpen: boolean) => {
    event.preventDefault();
    setDragging(true);
    startOpenRef.current = startOpen;
    startXRef.current = event.clientX;
    dragDistanceRef.current = 0;
    setDragTranslate(startOpen ? 0 : DRAWER_WIDTH);
  };

  const translateX = dragTranslate ?? (isOpen ? 0 : DRAWER_WIDTH);
  const appendSystemMessage = React.useCallback((text: string) => {
    setChatMessages((previous) => {
      const lastMessage = previous[previous.length - 1];
      if (lastMessage && lastMessage.role === 'system' && lastMessage.text === text) {
        return previous;
      }
      return [
        ...previous,
        {
          id: createChatMessageId(),
          role: 'system',
          text,
        },
      ];
    });
  }, []);

  useEffect(() => {
    const infoText = agentClient.isReady
      ? t('assistant.agentActive', { agent: agentClient.label })
      : t('assistant.agentUnavailable');
    appendSystemMessage(infoText);
  }, [agentClient.id, agentClient.isReady, agentClient.label, appendSystemMessage, t]);

  useEffect(() => {
    const viewport = conversationViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [chatMessages, isSending]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(ASSISTANT_MIC_ENABLED_STORAGE_KEY, isListening ? '1' : '0');
    } catch {
      // no-op
    }
  }, [isListening]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const trimmedValue = conversationEntityId.trim();
    try {
      if (trimmedValue.length > 0) {
        window.localStorage.setItem(ASSISTANT_CONVERSATION_ENTITY_STORAGE_KEY, trimmedValue);
      } else {
        window.localStorage.removeItem(ASSISTANT_CONVERSATION_ENTITY_STORAGE_KEY);
      }
    } catch {
      // no-op
    }
  }, [conversationEntityId]);

  const sendCommand = React.useCallback(
    async (rawText: string) => {
      const normalized = rawText.trim();
      if (!normalized || isSendingRef.current) {
        return false;
      }
      isSendingRef.current = true;
      const userMessage: AssistantChatMessage = {
        id: createChatMessageId(),
        role: 'user',
        text: normalized,
      };
      setChatMessages((previous) => [...previous, userMessage]);
      setIsSending(true);

      try {
        const response = await agentClient.sendText(normalized, {
          conversationId: conversationIdRef.current,
          agentId: conversationEntityIdRef.current.trim() || undefined,
        });
        if (response.conversationId) {
          conversationIdRef.current = response.conversationId;
          setConversationId(response.conversationId);
        }
        setChatMessages((previous) => [
          ...previous,
          {
            id: createChatMessageId(),
            role: 'assistant',
            text: response.text,
          },
        ]);
        return true;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t('assistant.sendError');
        appendSystemMessage(message);
        return false;
      } finally {
        setIsSending(false);
        isSendingRef.current = false;
      }
    },
    [agentClient, appendSystemMessage, t],
  );

  const drainVoiceQueue = React.useCallback(async () => {
    if (drainingVoiceQueueRef.current) {
      return;
    }
    drainingVoiceQueueRef.current = true;
    try {
      while (voiceQueueRef.current.length > 0) {
        const nextCommand = voiceQueueRef.current.shift();
        if (!nextCommand) {
          continue;
        }
        const sent = await sendCommand(nextCommand);
        if (!sent && isSendingRef.current) {
          voiceQueueRef.current.unshift(nextCommand);
          break;
        }
      }
    } finally {
      drainingVoiceQueueRef.current = false;
    }
  }, [sendCommand]);

  const enqueueVoiceCommand = React.useCallback(
    (rawText: string) => {
      const normalized = rawText.trim();
      if (!normalized) {
        return;
      }
      voiceQueueRef.current.push(normalized);
      void drainVoiceQueue();
    },
    [drainVoiceQueue],
  );

  const clearVoiceCommitTimer = React.useCallback(() => {
    if (voiceCommitTimerRef.current !== null) {
      window.clearTimeout(voiceCommitTimerRef.current);
      voiceCommitTimerRef.current = null;
    }
  }, []);

  const flushVoiceDraft = React.useCallback(() => {
    clearVoiceCommitTimer();
    const normalized = voiceDraftRef.current.trim();
    voiceDraftRef.current = '';
    setLiveTranscript('');
    if (!normalized) {
      return;
    }
    enqueueVoiceCommand(normalized);
  }, [clearVoiceCommitTimer, enqueueVoiceCommand]);

  useEffect(() => {
    if (!isSending && voiceQueueRef.current.length > 0) {
      void drainVoiceQueue();
    }
  }, [drainVoiceQueue, isSending]);

  useEffect(() => {
    if (!isListening) {
      shouldRestartRecognitionRef.current = false;
      const activeRecognition = recognitionRef.current;
      recognitionRef.current = null;
      if (activeRecognition) {
        try {
          activeRecognition.stop();
        } catch {
          // no-op
        }
      }
      flushVoiceDraft();
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      appendSystemMessage(t('assistant.transcriptionUnsupported'));
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = locale === 'fr' ? 'fr-FR' : locale === 'en' ? 'en-US' : 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    shouldRestartRecognitionRef.current = true;
    recognitionRef.current = recognition;

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
          flushVoiceDraft();
        }, VOICE_SEND_DEBOUNCE_MS);
      }

      const composedLiveText = [voiceDraftRef.current, interimSegment].filter(Boolean).join(' ').trim();
      setLiveTranscript(composedLiveText);
    };

    recognition.onerror = (event) => {
      const errorCode = typeof event.error === 'string' ? event.error : '';
      if (errorCode === 'no-speech') {
        return;
      }
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        appendSystemMessage(t('assistant.micDenied'));
        setIsListening(false);
        return;
      }
      if (errorCode.length > 0) {
        appendSystemMessage(t('assistant.transcriptionInterrupted', { error: errorCode }));
      }
    };

    recognition.onend = () => {
      if (!shouldRestartRecognitionRef.current) {
        return;
      }
      flushVoiceDraft();
      try {
        recognition.start();
      } catch {
        // no-op
      }
    };

    try {
      recognition.start();
    } catch {
      appendSystemMessage(t('assistant.transcriptionStartError'));
      setIsListening(false);
    }

    return () => {
      shouldRestartRecognitionRef.current = false;
      clearVoiceCommitTimer();
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      flushVoiceDraft();
    };
  }, [appendSystemMessage, clearVoiceCommitTimer, flushVoiceDraft, isListening, locale, t]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = command.trim();
    if (!normalized) {
      return;
    }
    setCommand('');
    await sendCommand(normalized);
  };

  return (
    <>
      {canUseEdgeSwipe ? (
        <div
          className="fixed top-0 right-0 h-full"
          style={{ width: EDGE_HIT_WIDTH, zIndex: 60, touchAction: 'none' }}
          onPointerDown={(event) => {
            if (isOpen) {
              return;
            }
            beginDrag(event, false);
          }}
        />
      ) : null}

      {!isOpen ? (
        canUseEdgeSwipe ? (
          <button
            type="button"
            onClick={onOpen}
            className="liquid-glass-control ai-assistant-swipe-hint fixed right-2 top-1/2 h-16 w-2 -translate-y-1/2"
            style={{ zIndex: 59 }}
            aria-label={t('assistant.open')}
          />
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="glass-button fixed right-4 bottom-24 border-cyan-200/35 px-3.5 py-2.5 text-xs uppercase tracking-[0.14em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.24)]"
            style={{ zIndex: 59 }}
            aria-label={t('assistant.open')}
          >
            <Sparkles size={14} />
            Assist
          </button>
        )
      ) : null}

      <div
        className={`fixed inset-0 bg-[color:var(--ui-scrim)] backdrop-blur-[2px] transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 55 }}
        onClick={onClose}
      />

      <aside
        className="fixed top-0 bottom-0 right-0"
        style={{
          width: DRAWER_WIDTH,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 220ms ease',
          zIndex: 60,
        }}
        onPointerDown={(event) => {
          if (!isOpen) {
            return;
          }
          const drawerLeft = window.innerWidth - DRAWER_WIDTH;
          if (event.clientX > drawerLeft + 26) {
            return;
          }
          beginDrag(event, true);
        }}
      >
        <div className="h-full min-h-0 p-5">
          <div
            className="liquid-glass-panel relative flex h-full min-h-0 flex-col overflow-hidden p-5"
          >
            <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsConversationEntityEditMode((previous) => !previous)}
                className={`liquid-glass-control inline-flex h-9 w-9 items-center justify-center transition-all active:scale-95 ${
                  isConversationEntityEditMode
                    ? 'border-cyan-300/35 bg-cyan-400/18 text-cyan-100'
                    : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)]'
                }`}
                aria-label={t('assistant.editEntity')}
                title={t('assistant.editEntity')}
              >
                <PencilLine size={15} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="glass-icon-button h-9 w-9"
                aria-label={t('assistant.close')}
                title={t('assistant.close')}
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">{t('assistant.eyebrow')}</p>
              <h3 className="mt-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{t('assistant.title')}</h3>
            </div>

            {isConversationEntityEditMode ? (
              <div className="liquid-glass-card mt-4 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">{t('assistant.entity')}</p>
                <input
                  list={conversationEntityDatalistId}
                  value={conversationEntityId}
                  onChange={(event) => setConversationEntityId(event.target.value)}
                  placeholder="Es. conversation.home_assistant"
                  className="mt-2 h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/45 outline-none focus:border-cyan-300/40"
                />
                <datalist id={conversationEntityDatalistId}>
                  {conversationEntitySuggestions.map((entityId) => (
                    <option key={entityId} value={entityId} />
                  ))}
                </datalist>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-white/45">
                    {conversationEntitySuggestions.length > 0
                      ? t('assistant.suggestions')
                      : t('assistant.noSuggestions')}
                  </p>
                  {conversationEntityId.trim().length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setConversationEntityId('')}
                      className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/80 hover:text-cyan-50"
                    >
                      {t('assistant.useDefault')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="liquid-glass-card mt-5 rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">{t('assistant.microphone')}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setIsListening((prev) => {
                        const next = !prev;
                        if (next) {
                          setIsKeyboardInputVisible(false);
                        }
                        return next;
                      })
                    }
                    className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-300 ${
                      isListening
                        ? 'border-cyan-200/45 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.35),rgba(255,255,255,0.1)_42%,rgba(2,6,23,0.72)_100%)] text-cyan-50 shadow-[0_8px_24px_rgba(56,189,248,0.45)]'
                        : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                    aria-label={isListening ? t('assistant.disableMic') : t('assistant.enableMic')}
                    title={isListening ? t('assistant.micOn') : t('assistant.micOff')}
                  >
                    {isListening ? <Mic size={16} /> : <MicOff size={16} />}
                    <span
                      className={`pointer-events-none absolute -bottom-0.5 h-1.5 w-1.5 rounded-full ${
                        isListening
                          ? 'bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.95)]'
                          : 'bg-white/30'
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIsKeyboardInputVisible((prev) => {
                        const next = !prev;
                        if (next) {
                          setIsListening(false);
                        }
                        return next;
                      })
                    }
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                      isKeyboardInputVisible
                        ? 'border-cyan-300/35 bg-cyan-400/20 text-cyan-100'
                        : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                    title={t('assistant.openKeyboard')}
                    aria-label={t('assistant.enableKeyboard')}
                  >
                    <Keyboard size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">{t('assistant.conversation')}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                  {conversationEntityId.trim().length > 0 ? conversationEntityId.trim() : agentClient.label}
                </p>
              </div>
              <div
                ref={conversationViewportRef}
                className="mt-3 flex-1 min-h-0 space-y-2 overflow-y-auto glass-scrollbar pr-1 text-sm text-white/80"
              >
                {chatMessages.map((message) => {
                  const wrapperClassName =
                    message.role === 'assistant'
                      ? 'flex justify-start'
                      : message.role === 'user'
                        ? 'flex justify-end'
                        : 'flex justify-center';
                  const bubbleClassName =
                    message.role === 'assistant'
                      ? 'max-w-[84%] rounded-2xl rounded-bl-md border border-white/12 bg-white/[0.06] px-3 py-2 text-white/90'
                      : message.role === 'user'
                        ? 'max-w-[84%] rounded-2xl rounded-br-md border border-cyan-300/25 bg-cyan-500/16 px-3 py-2 text-cyan-50'
                        : 'max-w-[90%] rounded-full border border-amber-300/18 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.08em] text-amber-100/90';
                  return (
                    <div key={message.id} className={wrapperClassName}>
                      <p className={bubbleClassName}>{message.text}</p>
                    </div>
                  );
                })}
                {isSending ? (
                  <div className="flex justify-start">
                    <p className="rounded-2xl rounded-bl-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-[0.1em] text-white/70">
                      Elaborazione in corso...
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {isKeyboardInputVisible ? (
              <form onSubmit={handleSubmit} className="liquid-glass-card mt-4 p-2">
                <div className="flex items-center gap-2">
                  <input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder={t('assistant.commandPlaceholder')}
                    className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-sm text-white placeholder:text-white/45 outline-none disabled:opacity-60"
                    disabled={isSending}
                  />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center gap-1 rounded-xl border border-cyan-300/35 bg-cyan-400/20 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSending}
                  >
                    <SendHorizontal size={14} />
                    {isSending ? t('assistant.sending') : t('assistant.send')}
                  </button>
                </div>
                <p className="mt-2 flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-white/45">
                  <Sparkles size={11} />
                  Contesto: Casa completa
                </p>
              </form>
            ) : (
              <div className="mt-1">
                <MicReactiveLines isListening={isListening} />
                <p className="px-1 text-[11px] text-white/62 min-h-[1.15rem]">
                  {isListening
                    ? liveTranscript || (isSpeechRecognitionSupported ? t('assistant.speakNow') : t('assistant.transcriptionUnsupportedShort'))
                    : t('assistant.micPaused')}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes assistantSwipePulse {
              0%, 100% { opacity: 0.58; }
              50% { opacity: 0.26; }
            }
            .ai-assistant-swipe-hint {
              animation: assistantSwipePulse 1.8s ease-in-out infinite;
            }

            .ai-mic-lines-canvas {
              display: block;
              height: 138px;
              width: 100%;
            }
          `,
        }}
      />
    </>
  );
}
