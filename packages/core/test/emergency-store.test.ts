import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EmergencyStore } from '../src/emergency-store.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-emergency-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('EmergencyStore', () => {
  it('starts in normal state', () => {
    const store = new EmergencyStore(makeTempDir());

    expect(store.current().state).toBe('normal');
    expect(store.countdownSec()).toBeNull();
  });

  it('supports pending trigger, cancel, confirm, and resolve', () => {
    const store = new EmergencyStore(makeTempDir());
    const now = new Date('2026-05-09T00:00:00.000Z');

    const pending = store.trigger({
      trigger: 'manual',
      details: 'Need help',
      confirmationTimeoutSec: 30,
    }, now);
    expect(pending.state).toBe('pending-confirmation');
    expect(store.countdownSec(now)).toBe(30);

    const cancelled = store.cancel('False alarm', new Date('2026-05-09T00:00:01.000Z'));
    expect(cancelled.state).toBe('normal');

    store.trigger({
      trigger: 'voice',
      details: 'Help',
      confirmationTimeoutSec: 30,
    }, now);
    const active = store.confirm('Confirmed', new Date('2026-05-09T00:00:02.000Z'));
    expect(active.state).toBe('active');

    const resolved = store.resolve('Resolved', new Date('2026-05-09T00:00:03.000Z'));
    expect(resolved.state).toBe('resolved');
  });

  it('auto-activates expired pending emergencies', () => {
    const store = new EmergencyStore(makeTempDir());

    store.trigger({
      trigger: 'manual',
      details: 'SOS',
      confirmationTimeoutSec: 1,
    }, new Date('2026-05-09T00:00:00.000Z'));

    expect(store.current(new Date('2026-05-09T00:00:02.000Z')).state).toBe('active');
  });
});
