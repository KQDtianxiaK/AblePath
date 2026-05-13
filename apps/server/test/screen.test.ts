import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanupOldScreenshots, getScreenStatus } from '../src/screen.js';

describe('screen utilities', () => {
  it('reports screen capture backend status', () => {
    const status = getScreenStatus();

    expect(status).toHaveProperty('canCapture');
    expect(status).toHaveProperty('backend');
    expect(Array.isArray(status.setupHints)).toBe(true);
  });

  it('cleans up old screenshots', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-screen-'));
    const dir = path.join(home, 'data', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const oldFile = path.join(dir, 'old.png');
    fs.writeFileSync(oldFile, 'old');
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, oldDate, oldDate);

    expect(cleanupOldScreenshots(home, 60 * 60 * 1000)).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);

    fs.rmSync(home, { recursive: true, force: true });
  });
});
