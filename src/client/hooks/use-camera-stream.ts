import { useEffect, useState } from 'react';

interface UseCameraStreamOptions {
  enabled: boolean;
  frameIntervalMs?: number;
  onFrame: (data: string, mimeType: string) => void;
  onError: (message: string) => void;
}

export const useCameraStream = ({
  enabled,
  frameIntervalMs = 900,
  onFrame,
  onError
}: UseCameraStreamOptions): MediaStream | null => {
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPreviewStream(null);
      return;
    }

    let mounted = true;
    let stream: MediaStream | null = null;
    let timerId: number | null = null;

    const videoElement = document.createElement('video');
    videoElement.playsInline = true;
    videoElement.muted = true;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const start = async (): Promise<void> => {
      if (!context) {
        onError('Unable to create camera canvas context.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 10, max: 15 }
          }
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoElement.srcObject = stream;
        await videoElement.play();
        setPreviewStream(stream);

        timerId = window.setInterval(() => {
          if (videoElement.videoWidth <= 0 || videoElement.videoHeight <= 0) {
            return;
          }

          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          const commaIndex = dataUrl.indexOf(',');

          if (commaIndex === -1) {
            return;
          }

          onFrame(dataUrl.slice(commaIndex + 1), 'image/jpeg');
        }, frameIntervalMs);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Camera access failed.');
      }
    };

    start().catch(() => {
      onError('Camera stream setup failed.');
    });

    return () => {
      mounted = false;
      setPreviewStream(null);

      if (timerId !== null) {
        window.clearInterval(timerId);
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [enabled, frameIntervalMs, onError, onFrame]);

  return previewStream;
};
