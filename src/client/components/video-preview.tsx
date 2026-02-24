import { useEffect, useRef } from 'react';

interface VideoPreviewProps {
  stream: MediaStream | null;
  cameraEnabled: boolean;
}

export const VideoPreview = ({ stream, cameraEnabled }: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream;

    if (stream) {
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  return (
    <section className="panel video-panel">
      <div className="panel-header-row">
        <h2>vision stream</h2>
        <span className={`status-badge ${cameraEnabled ? 'status-connected' : 'status-disconnected'}`}>
          {cameraEnabled ? 'sending frames' : 'camera off'}
        </span>
      </div>

      <video ref={videoRef} className="video-preview" autoPlay muted playsInline />
      <p className="hint-text">Frames are captured every ~0.9s and sent as jpeg to Gemini Live.</p>
    </section>
  );
};
