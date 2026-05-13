import fs from 'node:fs';
import path from 'node:path';

import {
  ChatResponse,
  VisionAnalyzeRequest,
  VisionAnalyzeResponse,
} from '@ablepath/shared';

export interface ChatProvider {
  readonly id: string;
  chat(message: string): Promise<ChatResponse>;
  vision(request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse>;
  clearHistory(): void;
  getTurnCount(): number;
}

export interface DoubaoProviderOptions {
  apiKey?: string;
  model?: string;
  visionModel?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type ProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
};

const DEFAULT_MODEL = 'doubao-seed-2-0-lite-260215';
const DEFAULT_VISION_MODEL = 'doubao-seed-2-0-pro-260215';
const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const SYSTEM_PROMPT =
  '你是 AblePath 的本地 AI 助手，帮助行动受限者自主使用电脑和 AI。' +
  '回答应简洁、尊重、可执行。不要把用户描述为需要被补全。';

export class DoubaoProvider implements ChatProvider {
  readonly id = 'doubao';
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private history: ProviderMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  constructor(options: DoubaoProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.visionModel = options.visionModel ?? DEFAULT_VISION_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chat(message: string): Promise<ChatResponse> {
    this.ensureConfigured();
    this.history.push({ role: 'user', content: message });
    this.trimHistory();

    try {
      const result = await this.complete(this.history);
      this.history.push({ role: 'assistant', content: result.text });
      return {
        response: result.text,
        provider: this.id,
        turns: this.getTurnCount(),
        usage: result.usage,
      };
    } catch (err) {
      this.history.pop();
      throw err;
    }
  }

  async vision(request: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse> {
    this.ensureConfigured();
    const dataUrl = resolveImageDataUrl(request);
    const question = request.question?.trim() || '请描述这张图片中的内容。';
    const messages: ProviderMessage[] = [
      this.history[0],
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: question },
        ],
      },
    ];
    const result = await this.complete(messages, this.visionModel);
    return {
      response: result.text,
      provider: this.id,
      usage: result.usage,
    };
  }

  clearHistory(): void {
    this.history = [this.history[0]];
  }

  getTurnCount(): number {
    return this.history.filter((message) => message.role !== 'system').length;
  }

  private async complete(messages: ProviderMessage[], model = this.model): Promise<{
    text: string;
    usage?: ChatResponse['usage'];
  }> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Doubao API error (${response.status}): ${text}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    return {
      text: body.choices?.[0]?.message?.content ?? '',
      usage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens,
            completionTokens: body.usage.completion_tokens,
            totalTokens: body.usage.total_tokens,
          }
        : undefined,
    };
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new Error('Doubao provider is not configured: missing ARK_API_KEY');
    }
  }

  private trimHistory(): void {
    if (this.history.length <= 41) return;
    this.history = [this.history[0], ...this.history.slice(-40)];
  }
}

function resolveImageDataUrl(request: VisionAnalyzeRequest): string {
  if (request.imageBase64) {
    const mimeType = request.mimeType ?? 'image/png';
    return request.imageBase64.startsWith('data:')
      ? request.imageBase64
      : `data:${mimeType};base64,${request.imageBase64}`;
  }

  if (request.imagePath) {
    const imagePath = path.resolve(request.imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
    return `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`;
  }

  throw new Error('Missing imageBase64 or imagePath');
}
