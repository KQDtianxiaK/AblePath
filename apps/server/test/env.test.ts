import { describe, expect, it } from 'vitest';

import { parseEnvFile } from '../src/env.js';

describe('env parsing', () => {
  it('parses comments, empty lines, and quoted values', () => {
    const env = parseEnvFile(`
# comment
ARK_API_KEY="secret"
STT_LANGUAGE=zh-CN
`);

    expect(env.ARK_API_KEY).toBe('secret');
    expect(env.STT_LANGUAGE).toBe('zh-CN');
  });
});
