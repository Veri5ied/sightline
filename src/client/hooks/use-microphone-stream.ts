import { useEffect } from 'react';
import { float32ToBase64Pcm } from '../lib/float32-to-base64-pcm';

interface UseMicrophoneStreamOptions {
  enabled: boolean;
  onChunk: (data: string, mimeType: string) => void;
  onError: (message: string) => void;
}

export const useMicrophoneStream = ({ enabled, onChunk, onError }: UseMicrophoneStreamOptions): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let mounted = true;
    let mediaStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let zeroGain: GainNode | null = null;

    const start = async (): Promise<void> => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });

        if (!mounted) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(2048, 1, 1);
        zeroGain = audioContext.createGain();
        zeroGain.gain.value = 0;

        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          const floatChannel = event.inputBuffer.getChannelData(0);
          const data = float32ToBase64Pcm(floatChannel);

          onChunk(data, `audio/pcm;rate=${audioContext?.sampleRate ?? 16000}`);
        };

        source.connect(processor);
        processor.connect(zeroGain);
        zeroGain.connect(audioContext.destination);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Microphone access failed.');
      }
    };

    start().catch(() => {
      onError('Microphone stream setup failed.');
    });

    return () => {
      mounted = false;

      if (processor) {
        processor.disconnect();
      }

      if (source) {
        source.disconnect();
      }

      if (zeroGain) {
        zeroGain.disconnect();
      }

      if (audioContext) {
        audioContext.close().catch(() => undefined);
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [enabled, onChunk, onError]);
};
