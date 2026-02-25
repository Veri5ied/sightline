import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlPanel } from "./components/control-panel";
import {
  TranscriptPanel,
  type TranscriptEntry,
} from "./components/transcript-panel";
import { VideoPreview } from "./components/video-preview";
import { useLiveConnection } from "./hooks/use-live-connection";
import { useMicrophoneStream } from "./hooks/use-microphone-stream";
import { useCameraStream } from "./hooks/use-camera-stream";
import { useAgentAudioPlayback } from "./hooks/use-agent-audio-playback";
import type { ServerSocketMessage } from "../shared/types/socket-types";

const defaultInstruction =
  "You are a realtime assistant. Keep responses concise, ask clarifying questions, and adapt to visual context from incoming camera frames.";

const createId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const isLikelyLiveModel = (model: string): boolean => {
  const normalized = model.toLowerCase();
  return (
    normalized.includes("live") ||
    normalized.includes("native-audio") ||
    normalized.includes("bidi")
  );
};

const normalizeTranscriptText = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const manualVisionPrompt =
  "Analyze the latest camera frame now. Give concise feedback about what you see and one actionable suggestion.";
const autoVisionPrompt =
  "You are in auto-observe mode. Give one concise spoken update about the latest scene change, one practical next step, and ask one short clarifying question only if context is unclear.";
const autoObserveFrameIntervalMs = 2500;
const userSilenceThresholdMs = 8000;
const autoFeedbackCooldownMs = 18000;
const autoFeedbackFrameFreshnessMs = 8000;

export const App = () => {
  const [systemInstruction, setSystemInstruction] =
    useState(defaultInstruction);
  const [draftText, setDraftText] = useState("");
  const [modelLabel, setModelLabel] = useState("");
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [speakResponses, setSpeakResponses] = useState(true);
  const [visionAutoFeedbackEnabled, setVisionAutoFeedbackEnabled] =
    useState(true);
  const [waitingForInput, setWaitingForInput] = useState(false);

  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [userPartial, setUserPartial] = useState("");
  const [agentPartial, setAgentPartial] = useState("");
  const userPartialRef = useRef("");
  const lastFrameCaptureAtRef = useRef(0);
  const lastVisionFeedbackRequestAtRef = useRef(0);
  const lastUserActivityAtRef = useRef(0);
  const { enqueueChunk: playAgentAudioChunk, stop: stopAgentAudioPlayback } =
    useAgentAudioPlayback();

  const appendEntry = useCallback((entry: Omit<TranscriptEntry, "id">) => {
    const normalizedNextText = normalizeTranscriptText(entry.text);

    if (!normalizedNextText) {
      return;
    }

    setEntries((previous) => {
      const last = previous[previous.length - 1];

      if (
        last &&
        last.role === entry.role &&
        normalizeTranscriptText(last.text) === normalizedNextText
      ) {
        return previous;
      }

      if (entry.role === "agent") {
        const recentAgentEntries = previous
          .slice(-4)
          .filter((item) => item.role === "agent");
        const alreadySeenRecentAgentReply = recentAgentEntries.some(
          (item) => normalizeTranscriptText(item.text) === normalizedNextText,
        );

        if (alreadySeenRecentAgentReply) {
          return previous;
        }
      }

      return [
        ...previous,
        {
          id: createId(),
          role: entry.role,
          text: normalizedNextText,
        },
      ];
    });
  }, []);

  const flushUserPartial = useCallback(() => {
    const pending = normalizeTranscriptText(userPartialRef.current);

    if (!pending) {
      return;
    }

    appendEntry({
      role: "user",
      text: pending,
    });

    userPartialRef.current = "";
    setUserPartial("");
  }, [appendEntry]);

  const onServerMessage = useCallback(
    (message: ServerSocketMessage) => {
      if (message.type === "server.ready") {
        setModelLabel(message.model);
        return;
      }

      if (message.type === "session.connected") {
        const now = Date.now();
        lastUserActivityAtRef.current = now;
        lastVisionFeedbackRequestAtRef.current = 0;
        appendEntry({
          role: "event",
          text: `Session connected${message.sessionId ? ` (${message.sessionId})` : ""}.`,
        });
        return;
      }

      if (message.type === "session.closed") {
        flushUserPartial();
        appendEntry({
          role: "event",
          text: message.reason
            ? `Session closed: ${message.reason}`
            : "Session closed.",
        });
        setMicEnabled(false);
        setCameraEnabled(false);
        setUserPartial("");
        setAgentPartial("");
        lastFrameCaptureAtRef.current = 0;
        lastVisionFeedbackRequestAtRef.current = 0;
        lastUserActivityAtRef.current = 0;
        stopAgentAudioPlayback();
        return;
      }

      if (message.type === "user.transcript") {
        if (message.text.trim()) {
          lastUserActivityAtRef.current = Date.now();
        }

        setUserPartial(message.text);
        userPartialRef.current = message.text;

        if (message.finished && message.text.trim()) {
          appendEntry({
            role: "user",
            text: message.text,
          });
          userPartialRef.current = "";
          setUserPartial("");
        }

        return;
      }

      if (message.type === "agent.text.delta") {
        setAgentPartial((previous) => {
          if (!previous) {
            return message.text;
          }

          if (message.text.startsWith(previous)) {
            return message.text;
          }

          return `${previous}${message.text}`;
        });
        return;
      }

      if (message.type === "agent.audio.chunk") {
        if (speakResponses) {
          playAgentAudioChunk(message.data, message.mimeType);
        }
        return;
      }

      if (message.type === "agent.turn.complete") {
        flushUserPartial();
        setAgentPartial((currentText) => {
          const trimmed = currentText.trim();

          if (trimmed) {
            appendEntry({
              role: "agent",
              text: trimmed,
            });
          }

          return "";
        });
        return;
      }

      if (message.type === "live.interrupted") {
        flushUserPartial();
        appendEntry({
          role: "event",
          text: "Model output interrupted by new user activity.",
        });
        stopAgentAudioPlayback();

        return;
      }

      if (message.type === "live.waiting-input") {
        setWaitingForInput(message.waiting);
        return;
      }

      if (message.type === "live.error") {
        appendEntry({
          role: "event",
          text: `Live error: ${message.message}`,
        });
        return;
      }
    },
    [
      appendEntry,
      flushUserPartial,
      playAgentAudioChunk,
      speakResponses,
      stopAgentAudioPlayback,
    ],
  );

  const {
    connectionState,
    startSession,
    stopSession,
    sendTextTurn,
    sendAudioChunk,
    endAudioStream,
    sendVideoFrame,
    sendActivityStart,
    sendActivityEnd,
  } = useLiveConnection({
    onServerMessage,
  });

  const liveInputEnabled = connectionState === "connected";

  const onMicStreamError = useCallback(
    (message: string) => {
      appendEntry({
        role: "event",
        text: `Microphone error: ${message}`,
      });
      setMicEnabled(false);
    },
    [appendEntry],
  );

  const onCameraStreamError = useCallback(
    (message: string) => {
      appendEntry({
        role: "event",
        text: `Camera error: ${message}`,
      });
      setCameraEnabled(false);
    },
    [appendEntry],
  );

  useMicrophoneStream({
    enabled: liveInputEnabled && micEnabled,
    onChunk: sendAudioChunk,
    onError: onMicStreamError,
  });

  const onCameraFrame = useCallback(
    (data: string, mimeType: string) => {
      lastFrameCaptureAtRef.current = Date.now();
      sendVideoFrame(data, mimeType);
    },
    [sendVideoFrame],
  );

  const previewStream = useCameraStream({
    enabled: liveInputEnabled && cameraEnabled,
    frameIntervalMs: autoObserveFrameIntervalMs,
    onFrame: onCameraFrame,
    onError: onCameraStreamError,
  });

  const onMicToggle = useCallback(
    (enabled: boolean) => {
      lastUserActivityAtRef.current = Date.now();
      setMicEnabled(enabled);

      if (!enabled && liveInputEnabled) {
        endAudioStream();
      }
    },
    [endAudioStream, liveInputEnabled],
  );

  const onStartSession = useCallback(() => {
    if (modelLabel && !isLikelyLiveModel(modelLabel)) {
      appendEntry({
        role: "event",
        text:
          `Configured model "${modelLabel}" does not look Live-capable for bidi sessions. ` +
          "Set GEMINI_LIVE_MODEL to a current Live model and restart server.",
      });
      return;
    }

    lastUserActivityAtRef.current = Date.now();
    startSession(systemInstruction);
  }, [appendEntry, modelLabel, startSession, systemInstruction]);

  const onStopSession = useCallback(() => {
    flushUserPartial();
    stopSession();
    setMicEnabled(false);
    setCameraEnabled(false);
    setWaitingForInput(false);
    lastFrameCaptureAtRef.current = 0;
    lastVisionFeedbackRequestAtRef.current = 0;
    lastUserActivityAtRef.current = 0;
    stopAgentAudioPlayback();
  }, [flushUserPartial, stopAgentAudioPlayback, stopSession]);

  const onSendText = useCallback(() => {
    const trimmed = draftText.trim();

    if (!trimmed) {
      return;
    }

    sendTextTurn(trimmed, true);
    lastUserActivityAtRef.current = Date.now();
    appendEntry({
      role: "user",
      text: trimmed,
    });
    setDraftText("");
  }, [appendEntry, draftText, sendTextTurn]);

  const requestVisionFeedback = useCallback(
    (mode: "manual" | "auto") => {
      if (!liveInputEnabled || !cameraEnabled) {
        return;
      }

      const now = Date.now();

      if (
        mode === "auto" &&
        now - lastVisionFeedbackRequestAtRef.current < autoFeedbackCooldownMs
      ) {
        return;
      }

      if (
        mode === "auto" &&
        now - lastFrameCaptureAtRef.current > autoFeedbackFrameFreshnessMs
      ) {
        return;
      }

      lastVisionFeedbackRequestAtRef.current = now;

      sendTextTurn(
        mode === "manual" ? manualVisionPrompt : autoVisionPrompt,
        true,
      );

      if (mode === "manual") {
        lastUserActivityAtRef.current = now;
        appendEntry({
          role: "user",
          text: "[vision] analyze latest frame",
        });
      }
    },
    [appendEntry, cameraEnabled, liveInputEnabled, sendTextTurn],
  );

  const onInterrupt = useCallback(() => {
    lastUserActivityAtRef.current = Date.now();
    sendActivityStart();
    window.setTimeout(() => {
      sendActivityEnd();
    }, 120);
    stopAgentAudioPlayback();
  }, [sendActivityEnd, sendActivityStart, stopAgentAudioPlayback]);

  useEffect(() => {
    if (!speakResponses) {
      stopAgentAudioPlayback();
    }
  }, [speakResponses, stopAgentAudioPlayback]);

  useEffect(() => {
    if (
      !visionAutoFeedbackEnabled ||
      !liveInputEnabled ||
      !cameraEnabled ||
      !waitingForInput
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (Date.now() - lastUserActivityAtRef.current < userSilenceThresholdMs) {
        return;
      }

      requestVisionFeedback("auto");
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    cameraEnabled,
    liveInputEnabled,
    requestVisionFeedback,
    visionAutoFeedbackEnabled,
    waitingForInput,
  ]);

  const titleStatus = useMemo(() => {
    if (connectionState === "connected") {
      return "session live";
    }

    if (connectionState === "connecting") {
      return "connecting to live api";
    }

    return "ready to connect";
  }, [connectionState]);

  const resolvedModelLabel = modelLabel || "pending...";
  const stageHeadline =
    agentPartial ||
    (waitingForInput
      ? "Listening for your next instruction."
      : connectionState === "connected"
        ? "Sightline Live is ready to assist."
        : "Start a live session to begin.");

  return (
    <div className="app-scene">
      <div className="studio-frame">
        <aside className="studio-sidebar">
          <div className="sidebar-brand-row">
            <div className="brand-glyph" />
            <div>
              <p className="sidebar-brand-title">sightline</p>
              <p className="sidebar-brand-subtitle">live agent</p>
            </div>
          </div>

          <ControlPanel
            connectionState={connectionState}
            modelLabel={resolvedModelLabel}
            systemInstruction={systemInstruction}
            draftText={draftText}
            micEnabled={micEnabled}
            cameraEnabled={cameraEnabled}
            speakResponses={speakResponses}
            visionAutoFeedbackEnabled={visionAutoFeedbackEnabled}
            waitingForInput={waitingForInput}
            onSystemInstructionChange={setSystemInstruction}
            onDraftTextChange={setDraftText}
            onMicToggle={onMicToggle}
            onCameraToggle={setCameraEnabled}
            onSpeakResponsesToggle={setSpeakResponses}
            onVisionAutoFeedbackToggle={setVisionAutoFeedbackEnabled}
            onStartSession={onStartSession}
            onStopSession={onStopSession}
            onSendText={onSendText}
            onRequestVisionFeedback={() => requestVisionFeedback("manual")}
            onInterrupt={onInterrupt}
          />

          <VideoPreview
            stream={previewStream}
            cameraEnabled={cameraEnabled && liveInputEnabled}
          />
        </aside>

        <section className="studio-stage">
          <div className="stage-top-row">
            {/*  <span className="stage-pill">daily design challenge</span> */}
            <span className="stage-pill">model: {resolvedModelLabel}</span>
          </div>

          <div className="stage-core-card">
            <button type="button" className="stage-close-button" disabled>
              x
            </button>
            <p className="stage-headline">{stageHeadline}</p>
            <div className="stage-wave-wrap">
              <span className="stage-wave-line" />
              <span className="stage-wave-line" />
              <span className="stage-wave-line" />
              <span className="stage-wave-line" />
            </div>

            <button
              type="button"
              className={`stage-mic-button ${micEnabled ? "active" : ""}`}
              onClick={() => onMicToggle(!micEnabled)}
              disabled={!liveInputEnabled}
            >
              mic
            </button>

            <p className="stage-status-line">{titleStatus}</p>
            {userPartial ? (
              <p className="stage-user-preview">you: {userPartial}</p>
            ) : null}
          </div>

          <div className="stage-orb" />
        </section>

        <aside className="studio-transcript">
          <div className="transcript-header-shell">
            <p className="transcript-shell-title">conversation</p>
            <span className={`status-badge status-${connectionState}`}>
              {titleStatus}
            </span>
          </div>
          <TranscriptPanel
            entries={entries}
            userPartial={userPartial}
            agentPartial={agentPartial}
          />
        </aside>
      </div>
    </div>
  );
};
