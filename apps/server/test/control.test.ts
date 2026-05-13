import { describe, expect, it } from 'vitest';

import { createControlPlan, createDefaultConfig } from '@ablepath/core';

import { executeControlPlan, getControlStatus, windowsSendKeysForHotkey } from '../src/control.js';

describe('control execution boundary', () => {
  it('reports local control capabilities', () => {
    const status = getControlStatus();

    expect(status).toHaveProperty('capabilities');
    expect(status.capabilities).toHaveProperty('openUrl');
    expect(status.capabilities).toHaveProperty('openApp');
    expect(status.capabilities).toHaveProperty('click');
  });

  it('requires confirmation for medium-risk plans', async () => {
    const plan = createControlPlan('打开 example.com', createDefaultConfig());

    await expect(executeControlPlan(plan, { dryRun: true })).rejects.toThrow(/requires confirmation/i);
  });

  it('supports dry-run execution after confirmation', async () => {
    const plan = createControlPlan('打开 example.com', createDefaultConfig());
    const response = await executeControlPlan(plan, { confirmed: true, dryRun: true });

    expect(response.dryRun).toBe(true);
    expect(response.executed).toBe(false);
    expect(response.results[0]).toMatchObject({ ok: true, skipped: true });
  });

  it('maps AblePath hotkeys to Windows SendKeys tokens', () => {
    expect(windowsSendKeysForHotkey(['ctrl', 'v'])).toBe('^v');
    expect(windowsSendKeysForHotkey(['alt', 'tab'])).toBe('%{TAB}');
    expect(windowsSendKeysForHotkey(['shift', 'f4'])).toBe('+{F4}');
    expect(windowsSendKeysForHotkey(['enter'])).toBe('{ENTER}');
  });
});
