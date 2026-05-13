import { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { RealtimeVoiceState } from '@ablepath/shared';
import WebSocket from 'ws';

import { createRawMicProcess, createRawSpeakerProcess } from './audio.js';

export interface RealtimeConfig {
  appId: string;
  accessKey: string;
  speaker?: string;
  botName?: string;
  systemRole?: string;
  speakingStyle?: string;
}

export interface RealtimeCallbacks {
  onASRText: (text: string, isFinal: boolean) => void;
  onChatText: (text: string) => void;
  onChatEnded: () => void;
  onTTSStart: (text: string) => void;
  onTTSEnded: () => void;
  onUserSpeechStart: () => void;
  onError: (error: string) => void;
  onStateChange: (state: RealtimeVoiceState) => void;
}

export interface RealtimeSession {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sendText: (text: string) => void;
  getState: () => RealtimeVoiceState;
}

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';
const RESOURCE_ID = 'volc.speech.dialog';
const APP_KEY = 'PlgvMymc7f3tQnJ6';

const HEADER_BYTE0 = 0x11;

const MSG_FULL_CLIENT = 0x1;
const MSG_AUDIO_CLIENT = 0x2;
const MSG_FULL_SERVER = 0x9;
const MSG_AUDIO_SERVER = 0xb;
const MSG_ERROR = 0xf;

const FLAG_EVENT = 0x4;

const SERIAL_RAW = 0x0;
const SERIAL_JSON = 0x1;

const COMPRESS_NONE = 0x0;
const COMPRESS_GZIP = 0x1;

const EVT_START_CONNECTION = 1;
const EVT_FINISH_CONNECTION = 2;
const EVT_START_SESSION = 100;
const EVT_FINISH_SESSION = 102;
const EVT_TASK_REQUEST = 200;
const EVT_CHAT_TEXT_QUERY = 501;

const EVT_CONNECTION_STARTED = 50;
const EVT_CONNECTION_FAILED = 51;
const EVT_CONNECTION_FINISHED = 52;
const EVT_SESSION_STARTED = 150;
const EVT_SESSION_FINISHED = 152;
const EVT_SESSION_FAILED = 153;
const EVT_TTS_SENTENCE_START = 350;
const EVT_TTS_RESPONSE = 352;
const EVT_TTS_ENDED = 359;
const EVT_ASR_INFO = 450;
const EVT_ASR_RESPONSE = 451;
const EVT_CHAT_RESPONSE = 550;
const EVT_CHAT_ENDED = 559;
const EVT_DIALOG_ERROR = 599;

const MIC_SAMPLE_RATE = 16000;
const MIC_CHUNK_MS = 20;
const MIC_CHUNK_BYTES = (MIC_SAMPLE_RATE * 2 * MIC_CHUNK_MS) / 1000;

function buildHeader(
  msgType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    HEADER_BYTE0,
    (msgType << 4) | (flags & 0x0f),
    (serialization << 4) | (compression & 0x0f),
    0x00,
  ]);
}

export function buildConnectEvent(eventId: number, payload: object | null): Buffer {
  const header = buildHeader(MSG_FULL_CLIENT, FLAG_EVENT, SERIAL_JSON, COMPRESS_NONE);
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeUInt32BE(eventId, 0);
  const payloadBuf = Buffer.from(JSON.stringify(payload ?? {}), 'utf-8');
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payloadBuf.length, 0);
  return Buffer.concat([header, eventBuf, sizeBuf, payloadBuf]);
}

export function buildSessionEvent(
  eventId: number,
  sessionId: string,
  payload: object | null,
  msgType = MSG_FULL_CLIENT,
  serialization = SERIAL_JSON,
): Buffer {
  const header = buildHeader(msgType, FLAG_EVENT, serialization, COMPRESS_NONE);
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeUInt32BE(eventId, 0);
  const sidBuf = Buffer.from(sessionId, 'utf-8');
  const sidSizeBuf = Buffer.alloc(4);
  sidSizeBuf.writeUInt32BE(sidBuf.length, 0);
  const payloadBuf = payload === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(payload), 'utf-8');
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payloadBuf.length, 0);
  return Buffer.concat([header, eventBuf, sidSizeBuf, sidBuf, sizeBuf, payloadBuf]);
}

export function buildAudioFrame(sessionId: string, audioData: Buffer): Buffer {
  const header = buildHeader(MSG_AUDIO_CLIENT, FLAG_EVENT, SERIAL_RAW, COMPRESS_NONE);
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeUInt32BE(EVT_TASK_REQUEST, 0);
  const sidBuf = Buffer.from(sessionId, 'utf-8');
  const sidSizeBuf = Buffer.alloc(4);
  sidSizeBuf.writeUInt32BE(sidBuf.length, 0);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(audioData.length, 0);
  return Buffer.concat([header, eventBuf, sidSizeBuf, sidBuf, sizeBuf, audioData]);
}

export interface ParsedFrame {
  msgType: number;
  flags: number;
  eventId?: number;
  sessionId?: string;
  payload: Buffer;
}

export function parseServerFrame(data: Buffer): ParsedFrame {
  const byte1 = data[1];
  const byte2 = data[2];
  const msgType = (byte1 >> 4) & 0x0f;
  const flags = byte1 & 0x0f;
  const compression = byte2 & 0x0f;

  let offset = 4;
  let eventId: number | undefined;
  let sessionId: string | undefined;

  if (flags & FLAG_EVENT) {
    eventId = data.readUInt32BE(offset);
    offset += 4;
  }

  if (offset + 4 <= data.length) {
    const sidSize = data.readUInt32BE(offset);
    if (sidSize > 0 && sidSize <= 128 && offset + 4 + sidSize + 4 <= data.length) {
      offset += 4;
      sessionId = data.subarray(offset, offset + sidSize).toString('utf-8');
      offset += sidSize;
    }
  }

  let payload = Buffer.alloc(0);
  if (offset + 4 <= data.length) {
    const payloadSize = data.readUInt32BE(offset);
    offset += 4;
    if (payloadSize > 0 && offset + payloadSize <= data.length) {
      payload = Buffer.from(data.subarray(offset, offset + payloadSize));
    }
  }

  if (compression === COMPRESS_GZIP && payload.length > 0) {
    payload = Buffer.from(gunzipSync(payload));
  }

  return { msgType, flags, eventId, sessionId, payload };
}

export class DoubaoRealtimeSession implements RealtimeSession {
  private ws: WebSocket | null = null;
  private sessionId = '';
  private connectId = '';
  private state: RealtimeVoiceState = 'disconnected';
  private micProc: ChildProcess | null = null;
  private speakerProc: ChildProcess | null = null;
  private micBuffer = Buffer.alloc(0);
  private micStreamActive = false;
  private audioSendTimer: ReturnType<typeof setInterval> | null = null;
  private pendingWaiters: Array<{
    eventId: number;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(
    private readonly config: RealtimeConfig,
    private readonly callbacks: RealtimeCallbacks,
  ) {}

  async start(): Promise<void> {
    if (this.state !== 'disconnected') {
      throw new Error(`Cannot start realtime session from state ${this.state}`);
    }

    this.connectId = randomUUID();
    this.sessionId = randomUUID();
    this.setState('connecting');

    await this.connectWS();
    this.ws?.send(buildConnectEvent(EVT_START_CONNECTION, {}));
    await this.waitForEvent(EVT_CONNECTION_STARTED, 10000);
    this.setState('connected');

    this.ws?.send(buildSessionEvent(EVT_START_SESSION, this.sessionId, this.buildSessionPayload()));
    await this.waitForEvent(EVT_SESSION_STARTED, 10000);
    this.setState('session-active');

    this.startMicrophone();
  }

  async stop(): Promise<void> {
    this.stopMicrophone();
    this.stopSpeaker();

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(buildSessionEvent(EVT_FINISH_SESSION, this.sessionId, {}));
        await delay(300);
        this.ws.send(buildConnectEvent(EVT_FINISH_CONNECTION, {}));
        await delay(150);
      } catch {
        // Cleanup should continue even if the remote endpoint is already gone.
      }
      this.ws.close();
    }

    this.ws = null;
    this.clearWaiters(new Error('Realtime session stopped'));
    this.setState('disconnected');
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Realtime WebSocket is not connected');
    }
    this.ws.send(buildSessionEvent(EVT_CHAT_TEXT_QUERY, this.sessionId, { content: text }));
  }

  getState(): RealtimeVoiceState {
    return this.state;
  }

  private setState(state: RealtimeVoiceState): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  private buildSessionPayload(): object {
    return {
      asr: {
        audio_info: {
          format: 'pcm',
          sample_rate: MIC_SAMPLE_RATE,
          channel: 1,
        },
      },
      tts: {
        speaker: this.config.speaker ?? 'zh_male_yunzhou_jupiter_bigtts',
        audio_config: {
          channel: 1,
          format: 'pcm_s16le',
          sample_rate: 24000,
        },
      },
      dialog: {
        bot_name: this.config.botName ?? 'AblePath',
        system_role: this.config.systemRole ?? DEFAULT_SYSTEM_ROLE,
        speaking_style: this.config.speakingStyle ?? '清晰、尊重、简洁',
        extra: {
          input_mod: 'keep_alive',
        },
      },
    };
  }

  private connectWS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-ID': this.config.appId,
          'X-Api-Access-Key': this.config.accessKey,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-App-Key': APP_KEY,
          'X-Api-Connect-Id': this.connectId,
        },
      });

      ws.binaryType = 'nodebuffer';

      ws.on('open', () => {
        this.ws = ws;
        resolve();
      });

      ws.on('message', (data) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.handleMessage(buffer);
      });

      ws.on('error', (err) => {
        this.callbacks.onError(`Realtime WebSocket error: ${err.message}`);
        if (!this.ws) reject(err);
      });

      ws.on('close', () => {
        this.stopMicrophone();
        this.stopSpeaker();
        if (this.state !== 'disconnected') {
          this.setState('disconnected');
        }
      });

      ws.on('unexpected-response', (_req, res) => {
        reject(new Error(`Realtime WebSocket failed with HTTP ${res.statusCode}`));
      });
    });
  }

  private waitForEvent(eventId: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingWaiters = this.pendingWaiters.filter((waiter) => waiter.eventId !== eventId);
        reject(new Error(`Timed out waiting for realtime event ${eventId}`));
      }, timeoutMs);

      this.pendingWaiters.push({
        eventId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  private handleMessage(data: Buffer): void {
    try {
      const frame = parseServerFrame(data);

      if (frame.eventId !== undefined) {
        const waiterIndex = this.pendingWaiters.findIndex((waiter) => waiter.eventId === frame.eventId);
        if (waiterIndex >= 0) {
          this.pendingWaiters.splice(waiterIndex, 1)[0].resolve();
        }
      }

      if (frame.msgType === MSG_ERROR) {
        this.callbacks.onError(frame.payload.toString('utf-8') || 'Unknown realtime server error');
        return;
      }

      if (frame.msgType === MSG_AUDIO_SERVER) {
        if (frame.eventId === EVT_TTS_RESPONSE && frame.payload.length > 0) {
          this.playAudio(frame.payload);
        }
        return;
      }

      if (frame.msgType === MSG_FULL_SERVER) {
        this.handleServerEvent(frame.eventId, frame.payload);
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }

  private handleServerEvent(eventId: number | undefined, payload: Buffer): void {
    const json = parseJsonPayload(payload);

    switch (eventId) {
      case EVT_SESSION_FAILED:
      case EVT_CONNECTION_FAILED: {
        const message = stringValue(json.error) ?? stringValue(json.message) ?? 'Realtime connection failed';
        this.callbacks.onError(message);
        this.clearWaiters(new Error(message));
        this.setState('error');
        break;
      }

      case EVT_ASR_INFO:
        this.callbacks.onUserSpeechStart();
        this.stopSpeaker();
        this.setState('listening');
        break;

      case EVT_ASR_RESPONSE: {
        const results = json.results;
        if (Array.isArray(results)) {
          for (const result of results) {
            if (!isRecord(result)) continue;
            const text = stringValue(result.text);
            if (text) this.callbacks.onASRText(text, result.is_interim !== true);
          }
        }
        break;
      }

      case EVT_TTS_SENTENCE_START: {
        const text = stringValue(json.text) ?? '';
        this.callbacks.onTTSStart(text);
        this.ensureSpeaker();
        this.setState('speaking');
        break;
      }

      case EVT_TTS_ENDED:
        this.callbacks.onTTSEnded();
        this.setState('session-active');
        break;

      case EVT_CHAT_RESPONSE: {
        const content = stringValue(json.content);
        if (content) this.callbacks.onChatText(content);
        break;
      }

      case EVT_CHAT_ENDED:
        this.callbacks.onChatEnded();
        break;

      case EVT_DIALOG_ERROR: {
        const message = stringValue(json.message) ?? stringValue(json.error) ?? 'Realtime dialog error';
        this.callbacks.onError(message);
        break;
      }

      case EVT_SESSION_FINISHED:
      case EVT_CONNECTION_FINISHED:
        break;

      default:
        break;
    }
  }

  private startMicrophone(): void {
    try {
      this.micProc = createRawMicProcess();
      this.micBuffer = Buffer.alloc(0);
      this.micStreamActive = true;
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : String(err));
      return;
    }

    this.micProc.stdout?.on('data', (chunk: Buffer) => {
      if (!this.micStreamActive) return;
      this.micBuffer = Buffer.concat([this.micBuffer, chunk]);
    });

    this.micProc.stderr?.on('data', () => undefined);

    this.micProc.on('error', (err) => {
      this.callbacks.onError(`Microphone error: ${err.message}`);
    });

    this.micProc.on('close', () => {
      this.micStreamActive = false;
    });

    this.audioSendTimer = setInterval(() => {
      this.flushMicBuffer();
    }, MIC_CHUNK_MS);
  }

  private flushMicBuffer(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.micBuffer.length >= MIC_CHUNK_BYTES) {
      const chunk = this.micBuffer.subarray(0, MIC_CHUNK_BYTES);
      this.micBuffer = this.micBuffer.subarray(MIC_CHUNK_BYTES);
      this.ws.send(buildAudioFrame(this.sessionId, chunk));
    }
  }

  private stopMicrophone(): void {
    this.micStreamActive = false;
    if (this.audioSendTimer) {
      clearInterval(this.audioSendTimer);
      this.audioSendTimer = null;
    }
    if (this.micProc && !this.micProc.killed) {
      this.micProc.kill('SIGTERM');
    }
    this.micProc = null;
    this.micBuffer = Buffer.alloc(0);
  }

  private ensureSpeaker(): void {
    if (this.speakerProc && !this.speakerProc.killed) return;
    this.speakerProc = createRawSpeakerProcess();
    this.speakerProc?.stderr?.on('data', () => undefined);
    this.speakerProc?.on('close', () => {
      this.speakerProc = null;
    });
  }

  private playAudio(data: Buffer): void {
    this.ensureSpeaker();
    if (this.speakerProc?.stdin?.writable) {
      this.speakerProc.stdin.write(data);
    }
  }

  private stopSpeaker(): void {
    if (this.speakerProc && !this.speakerProc.killed) {
      this.speakerProc.stdin?.end();
      this.speakerProc.kill('SIGTERM');
    }
    this.speakerProc = null;
  }

  private clearWaiters(err: Error): void {
    for (const waiter of this.pendingWaiters.splice(0)) {
      waiter.reject(err);
    }
  }
}

export function createRealtimeConfigFromEnv(env: Record<string, string | undefined>): {
  config?: RealtimeConfig;
  missingEnv: string[];
} {
  const missingEnv = ['VOLC_ASR_APP_KEY', 'VOLC_ASR_ACCESS_KEY'].filter((key) => !env[key]);
  if (missingEnv.length > 0) return { missingEnv };

  return {
    missingEnv,
    config: {
      appId: env.VOLC_ASR_APP_KEY as string,
      accessKey: env.VOLC_ASR_ACCESS_KEY as string,
      botName: env.ASSISTANT_NAME || 'AblePath',
      speaker: env.DOUBAO_REALTIME_SPEAKER,
    },
  };
}

function parseJsonPayload(payload: Buffer): Record<string, unknown> {
  if (payload.length === 0) return {};
  try {
    const parsed = JSON.parse(payload.toString('utf-8')) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_SYSTEM_ROLE =
  '你是 AblePath 的语音助手。AblePath 旨在帮助行动受限者更自主地使用电脑和 AI。' +
  '请尊重用户的选择，用中文清晰、简洁地回答；不要替用户做高风险决定。' +
  '如果用户表达紧急求助，请优先确认情况并提示可联系家人、护理者或当地紧急服务。';
