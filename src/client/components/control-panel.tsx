import type { ConnectionState } from '../hooks/use-live-connection';

interface ControlPanelProps {
  connectionState: ConnectionState;
  modelLabel: string;
  systemInstruction: string;
  draftText: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  speakResponses: boolean;
  visionAutoFeedbackEnabled: boolean;
  waitingForInput: boolean;
  onSystemInstructionChange: (value: string) => void;
  onDraftTextChange: (value: string) => void;
  onMicToggle: (value: boolean) => void;
  onCameraToggle: (value: boolean) => void;
  onSpeakResponsesToggle: (value: boolean) => void;
  onVisionAutoFeedbackToggle: (value: boolean) => void;
  onStartSession: () => void;
  onStopSession: () => void;
  onSendText: () => void;
  onRequestVisionFeedback: () => void;
  onInterrupt: () => void;
}

const statusLabel = (state: ConnectionState): string => {
  if (state === 'connected') {
    return 'connected';
  }

  if (state === 'connecting') {
    return 'connecting';
  }

  return 'disconnected';
};

export const ControlPanel = ({
  connectionState,
  modelLabel,
  systemInstruction,
  draftText,
  micEnabled,
  cameraEnabled,
  speakResponses,
  visionAutoFeedbackEnabled,
  waitingForInput,
  onSystemInstructionChange,
  onDraftTextChange,
  onMicToggle,
  onCameraToggle,
  onSpeakResponsesToggle,
  onVisionAutoFeedbackToggle,
  onStartSession,
  onStopSession,
  onSendText,
  onRequestVisionFeedback,
  onInterrupt
}: ControlPanelProps) => {
  const connected = connectionState === 'connected';

  return (
    <section className="panel control-panel">
      <div className="panel-header-row">
        <h2>live controls</h2>
        <span className={`status-badge status-${connectionState}`}>{statusLabel(connectionState)}</span>
      </div>

      <p className="meta-row">
        <strong>model:</strong> {modelLabel}
      </p>
      <p className="meta-row">
        <strong>waiting for input:</strong> {waitingForInput ? 'yes' : 'no'}
      </p>

      <label className="field-label" htmlFor="system-instruction-input">
        system instruction
      </label>
      <textarea
        id="system-instruction-input"
        rows={3}
        value={systemInstruction}
        onChange={(event) => onSystemInstructionChange(event.target.value)}
      />

      <div className="button-row">
        <button className="primary-button" type="button" onClick={onStartSession}>
          start live session
        </button>
        <button className="ghost-button" type="button" onClick={onStopSession}>
          stop session
        </button>
      </div>

      <label className="toggle-row" htmlFor="mic-toggle">
        <input
          id="mic-toggle"
          type="checkbox"
          checked={micEnabled}
          onChange={(event) => onMicToggle(event.target.checked)}
          disabled={!connected}
        />
        stream microphone audio
      </label>

      <label className="toggle-row" htmlFor="camera-toggle">
        <input
          id="camera-toggle"
          type="checkbox"
          checked={cameraEnabled}
          onChange={(event) => onCameraToggle(event.target.checked)}
          disabled={!connected}
        />
        stream camera frames
      </label>

      <label className="toggle-row" htmlFor="speak-toggle">
        <input
          id="speak-toggle"
          type="checkbox"
          checked={speakResponses}
          onChange={(event) => onSpeakResponsesToggle(event.target.checked)}
        />
        play model voice output
      </label>

      <label className="toggle-row" htmlFor="vision-auto-toggle">
        <input
          id="vision-auto-toggle"
          type="checkbox"
          checked={visionAutoFeedbackEnabled}
          onChange={(event) => onVisionAutoFeedbackToggle(event.target.checked)}
          disabled={!connected || !cameraEnabled}
        />
        auto observe mode (silence-aware)
      </label>

      <label className="field-label" htmlFor="text-turn-input">
        send text turn (optional)
      </label>
      <textarea
        id="text-turn-input"
        rows={2}
        value={draftText}
        onChange={(event) => onDraftTextChange(event.target.value)}
        placeholder="Ask a quick follow-up in text"
      />

      <div className="button-row">
        <button className="ghost-button" type="button" disabled={!connected || !draftText.trim()} onClick={onSendText}>
          send text turn
        </button>
        <button className="ghost-button" type="button" disabled={!connected || !cameraEnabled} onClick={onRequestVisionFeedback}>
          analyze latest frame
        </button>
        <button className="danger-button" type="button" disabled={!connected} onClick={onInterrupt}>
          interrupt now
        </button>
      </div>

      <p className="hint-text">
        Frames are auto-analyzed while camera stream is on. Use &quot;analyze latest frame&quot; for an immediate check.
      </p>
    </section>
  );
};
