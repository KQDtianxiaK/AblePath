/**
 * 豆包流式语音识别模型 — WebSocket 二进制协议客户端
 *
 * 实现火山引擎大模型流式语音识别 API (ASR)
 * 文档: https://www.volcengine.com/docs/6561/1354869
 *
 * 协议: WebSocket 自定义二进制帧格式
 *   - 4 字节 header + [4B sequence] + payload size (4B) + payload
 *   - 支持 JSON 序列化 + Gzip 压缩
 *
 * 鉴权: HTTP 升级请求头携带 X-Api-App-Key / X-Api-Access-Key / X-Api-Resource-Id
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import { gzipSync, gunzipSync } from 'zlib';

import WebSocket from 'ws';
import type { IncomingMessage } from 'http';

const logger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

// ─── Config ──────────────────────────────────────────────────────────────────

export interface VolcASRConfig {
  /** 火山引擎控制台 APP ID */
  appKey: string;
  /** 火山引擎控制台 Access Token */
  accessKey: string;
  /** 资源 ID (默认: 豆包流式语音识别模型1.0 小时版; 2.0小时版为 volc.seedasr.sauc.duration) */
  resourceId?: string;
  /** 语言 (默认 zh-CN，仅 nostream 模式支持) */
  language?: string;
  /**
   * 接口模式:
   *   'nostream'  - 流式输入模式 (默认，满足大多数场景)
   *   'async'     - 双向流式优化版 (实时上屏)
   *   'stream'    - 双向流式旧版
   */
  mode?: 'nostream' | 'async' | 'stream';
}

export interface VolcASRResult {
  text: string;
  utterances?: Array<{
    text: string;
    definite: boolean;
    start_time: number;
    end_time: number;
  }>;
  duration?: number;
}

// ─── Binary Protocol Constants ───────────────────────────────────────────────

// Header byte 0: [4 bits version=0001][4 bits headerSize=0001]
const HEADER_BYTE0 = 0x11;
// Header byte 3: reserved
const HEADER_RESERVED = 0x00;

// Message types (4 bits, upper nibble of byte 1)
const MSG_FULL_CLIENT_REQUEST = 0x1;
const MSG_AUDIO_ONLY = 0x2;
const MSG_FULL_SERVER_RESPONSE = 0x9;
const MSG_ERROR = 0xf;

// Message type specific flags (4 bits, lower nibble of byte 1)
const FLAG_NONE = 0x0;
const FLAG_HAS_SEQUENCE = 0x1;
const FLAG_LAST_PACKET = 0x2;
const FLAG_LAST_WITH_SEQ = 0x3;

// Serialization (upper nibble of byte 2)
const SERIAL_NONE = 0x0;
const SERIAL_JSON = 0x1;

// Compression (lower nibble of byte 2)
const COMPRESS_NONE = 0x0;
const COMPRESS_GZIP = 0x1;

// ─── Frame Builder ───────────────────────────────────────────────────────────

function buildHeader(
  msgType: number,
  msgFlags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    HEADER_BYTE0,
    (msgType << 4) | (msgFlags & 0x0f),
    (serialization << 4) | (compression & 0x0f),
    HEADER_RESERVED,
  ]);
}

/**
 * Build a binary frame with sequence number.
 * Format: [4B header] [4B seq (signed int32 BE)] [4B payload size] [payload]
 */
function buildFrameWithSeq(
  msgType: number,
  msgFlags: number,
  serialization: number,
  compression: number,
  seq: number,
  payload: Buffer,
): Buffer {
  const header = buildHeader(msgType, msgFlags, serialization, compression);
  const compressed = compression === COMPRESS_GZIP ? gzipSync(payload) : payload;
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(seq, 0);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(compressed.length, 0);
  return Buffer.concat([header, seqBuf, sizeBuf, compressed]);
}

function parseServerFrame(data: Buffer): {
  msgType: number;
  flags: number;
  sequence?: number;
  payload: Buffer | null;
  errorCode?: number;
  errorMessage?: string;
} {
  const byte1 = data[1];
  const byte2 = data[2];
  const msgType = (byte1 >> 4) & 0x0f;
  const flags = byte1 & 0x0f;
  const compression = byte2 & 0x0f;

  let offset = 4; // after header

  // If flags indicate sequence number present (bit 0 or bit 1 with seq)
  let sequence: number | undefined;
  if (flags & 0x01) {
    // POS_SEQUENCE or NEG_WITH_SEQUENCE — signed int32
    sequence = data.readInt32BE(offset);
    offset += 4;
  }
  if (flags & 0x02) {
    // last packet indicator
  }
  if (flags & 0x04) {
    // event field (skip 4 bytes)
    offset += 4;
  }

  if (msgType === MSG_ERROR) {
    // Error frame: error code (4B) + error message size (4B) + error message
    const errorCode = data.readUInt32BE(offset);
    offset += 4;
    const errMsgSize = data.readUInt32BE(offset);
    offset += 4;
    const errorMessage = data.subarray(offset, offset + errMsgSize).toString('utf-8');
    return { msgType, flags, errorCode, errorMessage, payload: null };
  }

  // Payload size + payload
  const payloadSize = data.readUInt32BE(offset);
  offset += 4;
  let payload = data.subarray(offset, offset + payloadSize);

  if (compression === COMPRESS_GZIP && payloadSize > 0) {
    payload = gunzipSync(payload);
  }

  return { msgType, flags, sequence, payload };
}

// ─── Main Transcribe Function ────────────────────────────────────────────────

/**
 * 使用豆包流式语音识别模型转录音频文件。
 *
 * 流程 (与官方 Python demo 一致):
 *   1. WebSocket 连接 + 鉴权头
 *   2. 发送 full client request (seq=1, JSON+Gzip)
 *   3. 等待服务端确认响应
 *   4. 分块发送音频 (seq 递增, 每包 200ms, 最后一包用负 seq)
 *   5. 收集识别结果
 */
export function transcribeWithVolcASR(
  audioPath: string,
  config: VolcASRConfig,
): Promise<VolcASRResult> {
  return new Promise((resolve, reject) => {
    const connectId = randomUUID();
    const resourceId = config.resourceId || 'volc.bigasr.sauc.duration';

    // Choose endpoint based on mode
    const mode = config.mode || 'nostream';
    const endpointMap: Record<string, string> = {
      nostream: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream',
      async: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
      stream: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
    };
    const endpoint = endpointMap[mode];

    logger.info(
      { endpoint, resourceId, connectId, language: config.language },
      'Connecting to Volcengine ASR',
    );

    const ws = new WebSocket(endpoint, {
      headers: {
        'X-Api-App-Key': config.appKey,
        'X-Api-Access-Key': config.accessKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Connect-Id': connectId,
      },
    });

    let finalText = '';
    let finalUtterances: VolcASRResult['utterances'] = [];
    let duration = 0;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error('ASR 超时 (30s)'));
      }
    }, 30000);

    // Handle HTTP-level rejection (e.g. 403 resource not granted)
    ws.on('unexpected-response', (_req: unknown, res: IncomingMessage) => {
      let body = '';
      res.on('data', (d: Buffer) => { body += d.toString(); });
      res.on('end', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          let detail = '';
          try {
            const parsed = JSON.parse(body);
            detail = parsed.error || body;
          } catch {
            detail = body || `HTTP ${res.statusCode}`;
          }
          if (res.statusCode === 403) {
            reject(new Error(
              `ASR 鉴权失败 (403): ${detail}\n` +
              '   请检查:\n' +
              '   1. 火山引擎控制台是否已开通语音识别资源\n' +
              '   2. APP ID (VOLC_ASR_APP_KEY) 和 Access Token (VOLC_ASR_ACCESS_KEY) 是否正确\n' +
              '   3. 资源 ID (VOLC_ASR_RESOURCE_ID) 是否与已开通的版本匹配',
            ));
          } else {
            reject(new Error(`ASR 连接被拒绝 (HTTP ${res.statusCode}): ${detail}`));
          }
        }
      });
    });

    ws.on('open', () => {
      logger.info('ASR WebSocket connected, sending config...');

      let seq = 1;

      // 1. Send full client request (seq=1) — matches Python demo exactly
      const audioParams: Record<string, unknown> = {
        format: 'wav',
        codec: 'raw',
        rate: 16000,
        bits: 16,
        channel: 1,
      };
      // language 仅 bigmodel_nostream 支持
      if (mode === 'nostream' && config.language) {
        audioParams.language = config.language;
      }

      const requestPayload = {
        user: {
          uid: 'ablepath-user',
        },
        audio: audioParams,
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          show_utterances: true,
          result_type: 'full',
        },
      };

      const jsonPayload = Buffer.from(JSON.stringify(requestPayload), 'utf-8');
      const fullClientFrame = buildFrameWithSeq(
        MSG_FULL_CLIENT_REQUEST,
        FLAG_HAS_SEQUENCE,
        SERIAL_JSON,
        COMPRESS_GZIP,
        seq,
        jsonPayload,
      );
      ws.send(fullClientFrame);
      seq++;

      // 2. Read audio and send in chunks with sequence numbers
      // Send the entire WAV file (with header) — server expects format:'wav'
      const audioData = fs.readFileSync(audioPath);
      const CHUNK_SIZE = 6400; // 200ms of 16kHz 16-bit mono
      let offset = 0;

      // Send chunks with interval to simulate real-time streaming
      const sendNextChunk = () => {
        if (offset >= audioData.length) return;

        const end = Math.min(offset + CHUNK_SIZE, audioData.length);
        const chunk = audioData.subarray(offset, end);
        const isLast = end >= audioData.length;

        if (isLast) {
          // Last packet: NEG_WITH_SEQUENCE flag + negative seq (matches Python demo)
          const audioFrame = buildFrameWithSeq(
            MSG_AUDIO_ONLY,
            FLAG_LAST_WITH_SEQ,
            SERIAL_NONE,
            COMPRESS_GZIP,
            -seq,
            chunk,
          );
          ws.send(audioFrame);
        } else {
          const audioFrame = buildFrameWithSeq(
            MSG_AUDIO_ONLY,
            FLAG_HAS_SEQUENCE,
            SERIAL_NONE,
            COMPRESS_GZIP,
            seq,
            chunk,
          );
          ws.send(audioFrame);
          seq++;
          // Send next chunk after 200ms interval (simulates real-time)
          setTimeout(sendNextChunk, 200);
        }
        offset = end;
      };

      // Wait for server to acknowledge full client request, then send audio
      // The first 'message' event handler below will start sendNextChunk
      sendNextChunk();
    });

    ws.on('message', (data: Buffer) => {
      try {
        const frame = parseServerFrame(Buffer.from(data));

        if (frame.msgType === MSG_ERROR) {
          logger.error(
            { code: frame.errorCode, msg: frame.errorMessage },
            'ASR error from server',
          );
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            reject(new Error(`ASR 服务错误 (${frame.errorCode}): ${frame.errorMessage}`));
          }
          return;
        }

        if (frame.msgType === MSG_FULL_SERVER_RESPONSE && frame.payload) {
          const result = JSON.parse(frame.payload.toString('utf-8'));

          if (result.result) {
            finalText = result.result.text || '';
            if (result.result.utterances) {
              finalUtterances = result.result.utterances;
            }
          }
          if (result.audio_info?.duration) {
            duration = result.audio_info.duration;
          }

          // Check if this is the last response
          if (frame.flags === FLAG_LAST_PACKET || frame.flags === FLAG_LAST_WITH_SEQ) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              ws.close();
              resolve({
                text: finalText,
                utterances: finalUtterances,
                duration: duration / 1000, // ms to seconds
              });
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error parsing ASR response');
      }
    });

    ws.on('error', (err) => {
      logger.error({ err }, 'ASR WebSocket error');
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`ASR 连接错误: ${err.message}`));
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (finalText) {
          resolve({
            text: finalText,
            utterances: finalUtterances,
            duration: duration / 1000,
          });
        } else {
          reject(new Error('ASR 连接关闭但未收到识别结果'));
        }
      }
    });
  });
}
