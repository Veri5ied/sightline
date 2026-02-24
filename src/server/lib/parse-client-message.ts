import type { ClientSocketMessage } from '../../shared/types/socket-types.js';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const parseClientMessage = (raw: string): ClientSocketMessage | null => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isObject(parsed) || !isString(parsed.type)) {
    return null;
  }

  if (parsed.type === 'session.connect') {
    if (parsed.systemInstruction !== undefined && !isString(parsed.systemInstruction)) {
      return null;
    }

    return {
      type: 'session.connect',
      systemInstruction: parsed.systemInstruction
    };
  }

  if (parsed.type === 'session.disconnect') {
    return {
      type: 'session.disconnect'
    };
  }

  if (parsed.type === 'text.turn') {
    if (!isString(parsed.text)) {
      return null;
    }

    return {
      type: 'text.turn',
      text: parsed.text,
      turnComplete: typeof parsed.turnComplete === 'boolean' ? parsed.turnComplete : true
    };
  }

  if (parsed.type === 'audio.chunk') {
    if (!isString(parsed.data) || !isString(parsed.mimeType)) {
      return null;
    }

    return {
      type: 'audio.chunk',
      data: parsed.data,
      mimeType: parsed.mimeType
    };
  }

  if (parsed.type === 'audio.end') {
    return {
      type: 'audio.end'
    };
  }

  if (parsed.type === 'video.frame') {
    if (!isString(parsed.data) || !isString(parsed.mimeType)) {
      return null;
    }

    return {
      type: 'video.frame',
      data: parsed.data,
      mimeType: parsed.mimeType
    };
  }

  if (parsed.type === 'activity.start') {
    return {
      type: 'activity.start'
    };
  }

  if (parsed.type === 'activity.end') {
    return {
      type: 'activity.end'
    };
  }

  if (parsed.type === 'ping') {
    return {
      type: 'ping'
    };
  }

  return null;
};
