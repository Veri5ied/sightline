import { useEffect, useState } from 'react';

interface UseCameraStreamOptions {
  enabled: boolean;
  frameIntervalMs?: number;
  sceneChangeThreshold?: number;
  onFrame: (data: string, mimeType: string) => void;
  onError: (message: string) => void;
}

export const useCameraStream = ({
  enabled,
  frameIntervalMs = 2400,
  sceneChangeThreshold = 12,
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

    const frameCanvas = document.createElement('canvas');
    const frameContext = frameCanvas.getContext('2d');
    const sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = 32;
    sceneCanvas.height = 18;
    const sceneContext = sceneCanvas.getContext('2d', {
      willReadFrequently: true
    });
    let lastSceneSample: Float32Array | null = null;

    const getSceneSignature = (): Float32Array | null => {
      if (!sceneContext) {
        return null;
      }

      sceneContext.drawImage(
        videoElement,
        0,
        0,
        videoElement.videoWidth,
        videoElement.videoHeight,
        0,
        0,
        sceneCanvas.width,
        sceneCanvas.height
      );

      const imageData = sceneContext.getImageData(0, 0, sceneCanvas.width, sceneCanvas.height).data;
      const signature = new Float32Array(sceneCanvas.width * sceneCanvas.height);

      for (let sourceIndex = 0, targetIndex = 0; sourceIndex < imageData.length; sourceIndex += 4, targetIndex += 1) {
        const red = imageData[sourceIndex];
        const green = imageData[sourceIndex + 1];
        const blue = imageData[sourceIndex + 2];
        signature[targetIndex] = red * 0.299 + green * 0.587 + blue * 0.114;
      }

      return signature;
    };

    const hasMeaningfulSceneChange = (nextSample: Float32Array): boolean => {
      if (!lastSceneSample) {
        return true;
      }

      let totalDiff = 0;

      for (let index = 0; index < nextSample.length; index += 1) {
        totalDiff += Math.abs(nextSample[index] - lastSceneSample[index]);
      }

      const averageDiff = totalDiff / nextSample.length;
      return averageDiff >= sceneChangeThreshold;
    };

    const start = async (): Promise<void> => {
      if (!frameContext) {
        onError('Unable to create camera canvas context.');
        return;
      }

      if (!sceneContext) {
        onError('Unable to create camera scene analysis context.');
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

          const sceneSample = getSceneSignature();

          if (!sceneSample) {
            return;
          }

          if (!hasMeaningfulSceneChange(sceneSample)) {
            return;
          }

          lastSceneSample = sceneSample;

          frameCanvas.width = videoElement.videoWidth;
          frameCanvas.height = videoElement.videoHeight;
          frameContext.drawImage(videoElement, 0, 0, frameCanvas.width, frameCanvas.height);

          const dataUrl = frameCanvas.toDataURL('image/jpeg', 0.72);
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
  }, [enabled, frameIntervalMs, onError, onFrame, sceneChangeThreshold]);

  return previewStream;
};
