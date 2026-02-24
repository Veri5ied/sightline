import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientSocketMessage, ServerSocketMessage } from '../../shared/types/socket-types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface UseLiveConnectionOptions {
  onServerMessage: (message: ServerSocketMessage) => void;
}

interface UseLiveConnectionResult {
  connectionState: ConnectionState;
  startSession: (systemInstruction: string) => void;
  stopSession: () => void;
  sendTextTurn: (text: string, turnComplete?: boolean) => void;
  sendAudioChunk: (data: string, mimeType: string) => void;
  endAudioStream: () => void;
  sendVideoFrame: (data: string, mimeType: string) => void;
  sendActivityStart: () => void;
  sendActivityEnd: () => void;
}

const createSocketUrl = (): string => {
  const configuredBase = import.meta.env.VITE_WS_BASE_URL as string | undefined;

  if (configuredBase && configuredBase.trim().length > 0) {
    const normalizedBase = configuredBase.endsWith('/')
      ? configuredBase.slice(0, -1)
      : configuredBase;

    return `${normalizedBase}/ws/live`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/live`;
};

export const useLiveConnection = ({ onServerMessage }: UseLiveConnectionOptions): UseLiveConnectionResult => {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingInstructionRef = useRef<string>('');
  const hasActiveSessionRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const socketUrl = useMemo(() => createSocketUrl(), []);

  const sendMessage = useCallback((message: ClientSocketMessage) => {
    const socket = wsRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  }, []);

  const openSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const socket = new WebSocket(socketUrl);
    wsRef.current = socket;
    setConnectionState('connecting');

    socket.onopen = () => {
      sendMessage({
        type: 'session.connect',
        systemInstruction: pendingInstructionRef.current
      });
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as ServerSocketMessage;

        if (parsed.type === 'session.connected') {
          hasActiveSessionRef.current = true;
          setConnectionState('connected');
        } else if (parsed.type === 'session.closed') {
          hasActiveSessionRef.current = false;
          setConnectionState('disconnected');
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
          }
        }

        onServerMessage(parsed);
      } catch {
        onServerMessage({
          type: 'live.error',
          message: 'Failed to parse websocket server message.'
        });
      }
    };

    socket.onerror = () => {
      onServerMessage({
        type: 'live.error',
        message: 'WebSocket error while communicating with server.'
      });
    };

    socket.onclose = () => {
      hasActiveSessionRef.current = false;
      setConnectionState('disconnected');
      wsRef.current = null;
    };
  }, [onServerMessage, sendMessage, socketUrl]);

  const startSession = useCallback(
    (systemInstruction: string) => {
      pendingInstructionRef.current = systemInstruction;
      hasActiveSessionRef.current = false;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendMessage({
          type: 'session.connect',
          systemInstruction
        });
        return;
      }

      openSocket();
    },
    [openSocket, sendMessage]
  );

  const stopSession = useCallback(() => {
    sendMessage({
      type: 'session.disconnect'
    });

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    hasActiveSessionRef.current = false;
    setConnectionState('disconnected');
  }, [sendMessage]);

  const sendTextTurn = useCallback(
    (text: string, turnComplete = true) => {
      if (!hasActiveSessionRef.current) {
        return;
      }

      sendMessage({
        type: 'text.turn',
        text,
        turnComplete
      });
    },
    [sendMessage]
  );

  const sendAudioChunk = useCallback(
    (data: string, mimeType: string) => {
      if (!hasActiveSessionRef.current) {
        return;
      }

      sendMessage({
        type: 'audio.chunk',
        data,
        mimeType
      });
    },
    [sendMessage]
  );

  const endAudioStream = useCallback(() => {
    if (!hasActiveSessionRef.current) {
      return;
    }

    sendMessage({
      type: 'audio.end'
    });
  }, [sendMessage]);

  const sendVideoFrame = useCallback(
    (data: string, mimeType: string) => {
      if (!hasActiveSessionRef.current) {
        return;
      }

      sendMessage({
        type: 'video.frame',
        data,
        mimeType
      });
    },
    [sendMessage]
  );

  const sendActivityStart = useCallback(() => {
    if (!hasActiveSessionRef.current) {
      return;
    }

    sendMessage({
      type: 'activity.start'
    });
  }, [sendMessage]);

  const sendActivityEnd = useCallback(() => {
    if (!hasActiveSessionRef.current) {
      return;
    }

    sendMessage({
      type: 'activity.end'
    });
  }, [sendMessage]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      hasActiveSessionRef.current = false;
    };
  }, []);

  return {
    connectionState,
    startSession,
    stopSession,
    sendTextTurn,
    sendAudioChunk,
    endAudioStream,
    sendVideoFrame,
    sendActivityStart,
    sendActivityEnd
  };
};
