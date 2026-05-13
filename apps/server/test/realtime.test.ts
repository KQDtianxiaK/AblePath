import { describe, expect, it } from 'vitest';

import {
  buildAudioFrame,
  buildConnectEvent,
  buildSessionEvent,
  createRealtimeConfigFromEnv,
  parseServerFrame,
} from '../src/voice/realtime.js';

describe('Doubao realtime protocol helpers', () => {
  it('builds connect event frames with event id and JSON payload', () => {
    const frame = buildConnectEvent(1, { ok: true });

    expect(frame[0]).toBe(0x11);
    expect(frame.readUInt32BE(4)).toBe(1);
    expect(JSON.parse(frame.subarray(12).toString('utf-8'))).toEqual({ ok: true });
  });

  it('round-trips session event frames through the parser', () => {
    const frame = buildSessionEvent(501, 'session-1', { content: '你好' });
    const parsed = parseServerFrame(frame);

    expect(parsed.eventId).toBe(501);
    expect(parsed.sessionId).toBe('session-1');
    expect(JSON.parse(parsed.payload.toString('utf-8'))).toEqual({ content: '你好' });
  });

  it('builds raw audio task frames', () => {
    const audio = Buffer.alloc(640, 1);
    const frame = buildAudioFrame('session-2', audio);
    const parsed = parseServerFrame(frame);

    expect(parsed.eventId).toBe(200);
    expect(parsed.sessionId).toBe('session-2');
    expect(parsed.payload.length).toBe(640);
  });

  it('validates realtime env configuration without exposing values', () => {
    expect(createRealtimeConfigFromEnv({}).missingEnv).toEqual(['VOLC_ASR_APP_KEY', 'VOLC_ASR_ACCESS_KEY']);

    const result = createRealtimeConfigFromEnv({
      VOLC_ASR_APP_KEY: 'app',
      VOLC_ASR_ACCESS_KEY: 'token',
    });

    expect(result.missingEnv).toEqual([]);
    expect(result.config?.botName).toBe('AblePath');
  });
});
