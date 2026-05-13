import fs from 'node:fs';
import path from 'node:path';

export function loadAblePathEnv(cwd = process.cwd()): Record<string, string | undefined> {
  const candidates = [
    ...findAncestorEnvCandidates(cwd),
    path.resolve(cwd, '.env'),
  ];

  const values: Record<string, string> = {};
  for (const file of [...new Set(candidates)]) {
    if (!fs.existsSync(file)) continue;
    Object.assign(values, parseEnvFile(fs.readFileSync(file, 'utf-8')));
  }

  return { ...values, ...process.env };
}

function findAncestorEnvCandidates(cwd: string): string[] {
  const candidates: string[] = [];
  let current = path.resolve(cwd);
  for (let i = 0; i < 8; i++) {
    candidates.unshift(path.join(current, '.env'));
    candidates.unshift(path.join(current, 'nanoclaw', '.env'));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

export function parseEnvFile(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) values[key] = value;
  }
  return values;
}
