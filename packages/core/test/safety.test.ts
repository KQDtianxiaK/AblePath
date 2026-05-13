import { describe, expect, it } from 'vitest';

import { createDefaultConfig } from '../src/defaults.js';
import { classifyRisk, requiresConfirmation } from '../src/safety.js';

describe('safety policy', () => {
  it('classifies send/delete/payment style intents as high risk', () => {
    const config = createDefaultConfig();

    expect(classifyRisk('帮我给家人发送这条消息', config)).toBe('high');
    expect(requiresConfirmation('delete the file', config)).toBe(true);
  });

  it('allows low-risk descriptive intents without confirmation', () => {
    const config = createDefaultConfig();

    expect(classifyRisk('屏幕上有什么', config)).toBe('low');
    expect(requiresConfirmation('屏幕上有什么', config)).toBe(false);
  });
});
