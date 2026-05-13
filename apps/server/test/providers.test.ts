import { describe, expect, it, vi } from 'vitest';

import { DoubaoProvider } from '../src/providers.js';

describe('DoubaoProvider', () => {
  it('sends OpenAI-compatible chat requests', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '你好，我在。' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    })));
    const provider = new DoubaoProvider({ apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });

    const response = await provider.chat('你好');

    expect(response.response).toBe('你好，我在。');
    expect(response.provider).toBe('doubao');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0] as unknown as Parameters<typeof fetch>;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string).model).toContain('doubao');
  });

  it('uses a separate model for vision requests', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '测试图片' } }],
    })));
    const provider = new DoubaoProvider({
      apiKey: 'test-key',
      model: 'chat-model',
      visionModel: 'vision-model',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const response = await provider.vision({
      imageBase64: 'ZmFrZQ==',
      mimeType: 'image/png',
      question: '描述图片',
    });

    expect(response.response).toBe('测试图片');
    const [, init] = fetchImpl.mock.calls[0] as unknown as Parameters<typeof fetch>;
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('vision-model');
    expect(body.messages[1].content[0].type).toBe('image_url');
  });

  it('fails clearly when ARK_API_KEY is missing', async () => {
    const provider = new DoubaoProvider({});

    await expect(provider.chat('你好')).rejects.toThrow('missing ARK_API_KEY');
  });
});
