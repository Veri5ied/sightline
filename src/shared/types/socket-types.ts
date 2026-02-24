export type ClientSocketMessage =
  | {
      type: 'session.connect';
      systemInstruction?: string;
    }
  | {
      type: 'session.disconnect';
    }
  | {
      type: 'text.turn';
      text: string;
      turnComplete?: boolean;
    }
  | {
      type: 'audio.chunk';
      data: string;
      mimeType: string;
    }
  | {
      type: 'audio.end';
    }
  | {
      type: 'video.frame';
      data: string;
      mimeType: string;
    }
  | {
      type: 'activity.start';
    }
  | {
      type: 'activity.end';
    }
  | {
      type: 'ping';
    };

export type ServerSocketMessage =
  | {
      type: 'server.ready';
      model: string;
    }
  | {
      type: 'session.connected';
      sessionId?: string;
    }
  | {
      type: 'session.closed';
      reason?: string;
    }
  | {
      type: 'user.transcript';
      text: string;
      finished: boolean;
    }
  | {
      type: 'agent.text.delta';
      text: string;
    }
  | {
      type: 'agent.audio.chunk';
      data: string;
      mimeType: string;
    }
  | {
      type: 'agent.turn.complete';
    }
  | {
      type: 'live.interrupted';
    }
  | {
      type: 'live.waiting-input';
      waiting: boolean;
    }
  | {
      type: 'live.error';
      message: string;
    }
  | {
      type: 'pong';
    };
