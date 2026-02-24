import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import type { ClientSocketMessage, ServerSocketMessage } from '../../shared/types/socket-types.js';

interface LiveSessionBridgeOptions {
  apiKey: string;
  model: string;
  send: (message: ServerSocketMessage) => void;
}

export class LiveSessionBridge {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly send: (message: ServerSocketMessage) => void;
  private session: Session | null;

  constructor(options: LiveSessionBridgeOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.send = options.send;
    this.session = null;
  }

  async connect(systemInstruction?: string): Promise<void> {
    if (!this.apiKey) {
      this.send({
        type: 'live.error',
        message: 'GEMINI_API_KEY is missing in server environment.'
      });
      return;
    }

    if (this.session) {
      this.disconnect('Reconnecting session.');
    }

    const ai = new GoogleGenAI({
      apiKey: this.apiKey
    });

    this.session = await ai.live.connect({
      model: this.model,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: systemInstruction && systemInstruction.trim().length > 0 ? systemInstruction : undefined
      },
      callbacks: {
        onopen: () => undefined,
        onmessage: (message: LiveServerMessage) => {
          this.handleServerMessage(message);
        },
        onerror: (event: { message?: string }) => {
          this.send({
            type: 'live.error',
            message: event.message || 'Gemini Live session error.'
          });
        },
        onclose: (event: { reason?: string }) => {
          this.session = null;
          this.send({
            type: 'session.closed',
            reason: event.reason || 'Live session closed.'
          });
        }
      }
    });
  }

  disconnect(reason?: string): void {
    if (!this.session) {
      return;
    }

    this.session.close();
    this.session = null;

    this.send({
      type: 'session.closed',
      reason
    });
  }

  async handleClientMessage(message: ClientSocketMessage): Promise<void> {
    try {
      if (message.type === 'session.connect') {
        await this.connect(message.systemInstruction);
        return;
      }

      if (message.type === 'session.disconnect') {
        this.disconnect('Disconnected by client request.');
        return;
      }

      if (message.type === 'ping') {
        this.send({
          type: 'pong'
        });
        return;
      }

      if (!this.session) {
        this.send({
          type: 'live.error',
          message: 'No active Live session. Click connect first.'
        });
        return;
      }

      if (message.type === 'text.turn') {
        this.session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: message.text }]
            }
          ],
          turnComplete: message.turnComplete ?? true
        });
        return;
      }

      if (message.type === 'audio.chunk') {
        this.session.sendRealtimeInput({
          audio: {
            data: message.data,
            mimeType: message.mimeType
          }
        });
        return;
      }

      if (message.type === 'audio.end') {
        this.session.sendRealtimeInput({
          audioStreamEnd: true
        });
        return;
      }

      if (message.type === 'video.frame') {
        this.session.sendRealtimeInput({
          video: {
            data: message.data,
            mimeType: message.mimeType
          }
        });
        return;
      }

      if (message.type === 'activity.start') {
        this.session.sendRealtimeInput({
          activityStart: {}
        });
        return;
      }

      if (message.type === 'activity.end') {
        this.session.sendRealtimeInput({
          activityEnd: {}
        });
      }
    } catch (error) {
      this.send({
        type: 'live.error',
        message: error instanceof Error ? error.message : 'Unhandled Live bridge error.'
      });
    }
  }

  private handleServerMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.send({
        type: 'session.connected',
        sessionId: message.setupComplete.sessionId
      });
    }

    const parts = message.serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inlineData = part.inlineData;
      const mimeType = inlineData?.mimeType ?? '';
      const data = inlineData?.data;

      if (data && mimeType.toLowerCase().startsWith('audio/')) {
        this.send({
          type: 'agent.audio.chunk',
          data,
          mimeType
        });
      }
    }

    if (message.serverContent?.inputTranscription?.text) {
      this.send({
        type: 'user.transcript',
        text: message.serverContent.inputTranscription.text,
        finished: Boolean(message.serverContent.inputTranscription.finished)
      });
    }

    const outputTranscriptText = message.serverContent?.outputTranscription?.text;
    if (outputTranscriptText && outputTranscriptText.trim().length > 0) {
      this.send({
        type: 'agent.text.delta',
        text: outputTranscriptText
      });
    } else if (message.text && message.text.trim().length > 0) {
      this.send({
        type: 'agent.text.delta',
        text: message.text
      });
    }

    if (message.serverContent?.interrupted) {
      this.send({
        type: 'live.interrupted'
      });
    }

    if (message.serverContent?.turnComplete) {
      this.send({
        type: 'agent.turn.complete'
      });
    }

    if (typeof message.serverContent?.waitingForInput === 'boolean') {
      this.send({
        type: 'live.waiting-input',
        waiting: message.serverContent.waitingForInput
      });
    }
  }
}
