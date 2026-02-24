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
  "Based on the latest camera frame, provide a short helpful update. Mention what changed and one next step.";

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
        stopAgentAudioPlayback();
        return;
      }

      if (message.type === "user.transcript") {
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
    onFrame: onCameraFrame,
    onError: onCameraStreamError,
  });

  const onMicToggle = useCallback(
    (enabled: boolean) => {
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
    stopAgentAudioPlayback();
  }, [flushUserPartial, stopAgentAudioPlayback, stopSession]);

  const onSendText = useCallback(() => {
    const trimmed = draftText.trim();

    if (!trimmed) {
      return;
    }

    sendTextTurn(trimmed, true);
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

      if (mode === "auto" && now - lastVisionFeedbackRequestAtRef.current < 6500) {
        return;
      }

      if (now - lastFrameCaptureAtRef.current > 4500) {
        return;
      }

      lastVisionFeedbackRequestAtRef.current = now;

      sendTextTurn(mode === "manual" ? manualVisionPrompt : autoVisionPrompt, true);

      if (mode === "manual") {
        appendEntry({
          role: "user",
          text: "[vision] analyze latest frame",
        });
      }
    },
    [appendEntry, cameraEnabled, liveInputEnabled, sendTextTurn],
  );

  const onInterrupt = useCallback(() => {
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
      !waitingForInput ||
      micEnabled
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      requestVisionFeedback("auto");
    }, 7000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    cameraEnabled,
    liveInputEnabled,
    micEnabled,
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

  return (
    <div className="page-shell">
      <header className="hero-header">
        <div>
          <p className="eyebrow">sightline live</p>
          <h1>Sightline Live</h1>
          <p className="hero-subtitle">
            Realtime voice + vision assistant using Gemini Live API with
            interruption support.
          </p>
        </div>
        <span className={`status-badge status-${connectionState}`}>
          {titleStatus}
        </span>
      </header>

      <main className="main-grid">
        <div className="left-column">
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
        </div>

        <TranscriptPanel
          entries={entries}
          userPartial={userPartial}
          agentPartial={agentPartial}
        />
      </main>
    </div>
  );
};
