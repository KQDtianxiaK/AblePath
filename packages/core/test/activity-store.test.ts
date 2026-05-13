import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ActivityStore } from '../src/activity-store.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-activity-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ActivityStore', () => {
  it('writes and reads recent activity entries', () => {
    const store = new ActivityStore(makeTempDir());

    const entry = store.add('system-event', 'Server started');

    expect(entry.id).toMatch(/^act-/);
    expect(store.recent()).toHaveLength(1);
    expect(store.stats().byType['system-event']).toBe(1);
  });
});
