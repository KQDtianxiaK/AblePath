import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ConfigStore } from '../src/config-store.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-core-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ConfigStore', () => {
  it('creates the default config when missing', () => {
    const dir = makeTempDir();
    const store = new ConfigStore(dir);

    const config = store.ensure();

    expect(config.productName).toBe('AblePath');
    expect(config.providers.defaultChat).toBe('doubao');
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(true);
  });

  it('merges saved partial-like config with defaults', () => {
    const dir = makeTempDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ locale: 'en-US' }));

    const config = new ConfigStore(dir).load();

    expect(config.locale).toBe('en-US');
    expect(config.profile.motorCapability).toBe('no-hands');
  });
});
