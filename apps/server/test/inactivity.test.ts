import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ActivityStore, ConfigStore, EmergencyStore } from '@ablepath/core';
import { afterEach, describe, expect, it } from 'vitest';

import { checkInactivity, getInactivityStatus } from '../src/inactivity.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-inactivity-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('inactivity monitor', () => {
  it('reports inactive duration from fallback start time when there is no activity', () => {
    const dir = makeTempDir();
    const config = new ConfigStore(dir).ensure();
    const status = getInactivityStatus(
      new ActivityStore(dir),
      new EmergencyStore(dir),
      config,
      Date.parse('2026-05-09T00:00:00.000Z'),
      new Date('2026-05-09T00:01:00.000Z'),
    );

    expect(status.inactiveMs).toBe(60_000);
    expect(status.wouldTrigger).toBe(false);
  });

  it('triggers a pending emergency after timeout', () => {
    const dir = makeTempDir();
    const config = new ConfigStore(dir).ensure();
    config.safety.inactivityTimeoutMs = 1000;

    const response = checkInactivity(
      new ActivityStore(dir),
      new EmergencyStore(dir),
      config,
      Date.parse('2026-05-09T00:00:00.000Z'),
      new Date('2026-05-09T00:00:02.000Z'),
    );

    expect(response.triggered).toBe(true);
    expect(response.event?.state).toBe('pending-confirmation');
    expect(response.event?.trigger).toBe('inactivity');
  });
});
