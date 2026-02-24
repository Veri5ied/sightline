import { useCallback, useEffect, useRef } from 'react';

interface QueuedAudioChunk {
  data: string;
  mimeType: string;
}

interface UseAgentAudioPlaybackResult {
  enqueueChunk: (data: string, mimeType: string) => void;
  stop: () => void;
}

const parseSampleRate = (mimeType: string): number => {
  const match = mimeType.match(/rate=(\d+)/i);

  if (!match) {
    return 24000;
  }

  const parsed = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24000;
};

const base64ToUint8 = (base64: string): Uint8Array => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const pcm16ToFloat32 = (bytes: Uint8Array): Float32Array => {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const samples = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let index = 0; index < sampleCount; index += 1) {
    const int16 = view.getInt16(index * 2, true);
    samples[index] = int16 / 32768;
  }

  return samples;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
};

const createAudioContext = (): AudioContext => {
  const maybeWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  const AudioContextCtor = window.AudioContext ?? maybeWindow.webkitAudioContext;
  return new AudioContextCtor();
};

export const useAgentAudioPlayback = (): UseAgentAudioPlaybackResult => {
  const contextRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<QueuedAudioChunk[]>([]);
  const processingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const stop = useCallback(() => {
    queueRef.current = [];
    nextPlayTimeRef.current = 0;

    const context = contextRef.current;
    if (context) {
      contextRef.current = null;
      void context.close();
    }
  }, []);

  const ensureContext = useCallback(async (): Promise<AudioContext> => {
    if (!contextRef.current) {
      contextRef.current = createAudioContext();
    }

    const context = contextRef.current;
    if (context.state === 'suspended') {
      await context.resume();
    }

    return context;
  }, []);

  const scheduleBuffer = useCallback((context: AudioContext, buffer: AudioBuffer) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.01, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }, []);

  const createBufferFromChunk = useCallback(
    async (context: AudioContext, chunk: QueuedAudioChunk): Promise<AudioBuffer> => {
      const bytes = base64ToUint8(chunk.data);
      const mimeType = chunk.mimeType.toLowerCase();

      if (mimeType.startsWith('audio/pcm')) {
        const sampleRate = parseSampleRate(mimeType);
        const samples = pcm16ToFloat32(bytes);
        const buffer = context.createBuffer(1, samples.length, sampleRate);
        buffer.getChannelData(0).set(samples);
        return buffer;
      }

      return context.decodeAudioData(toArrayBuffer(bytes));
    },
    []
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

    try {
      while (queueRef.current.length > 0) {
        const chunk = queueRef.current.shift();
        if (!chunk) {
          continue;
        }

        const context = await ensureContext();
        const buffer = await createBufferFromChunk(context, chunk);
        scheduleBuffer(context, buffer);
      }
    } catch {
      stop();
    } finally {
      processingRef.current = false;
    }
  }, [createBufferFromChunk, ensureContext, scheduleBuffer, stop]);

  const enqueueChunk = useCallback(
    (data: string, mimeType: string) => {
      if (!data || !mimeType) {
        return;
      }

      queueRef.current.push({
        data,
        mimeType
      });

      void processQueue();
    },
    [processQueue]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    enqueueChunk,
    stop
  };
};
