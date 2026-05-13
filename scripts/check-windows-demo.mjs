import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startAblePathServer } from '../apps/server/dist/src/app.js';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-demo-check-'));

const provider = {
  id: 'demo-check',
  clearHistory: () => undefined,
  getTurnCount: () => 1,
  chat: async () => ({
    response: JSON.stringify({
      intent: '打开百度并搜索 1+1',
      explanation: '将打开百度，输入 1+1 并按 Enter 搜索。',
      actions: [
        { type: 'openUrl', params: { url: 'www.baidu.com', browser: 'chrome' } },
        { type: 'type', params: { text: '1+1' } },
        { type: 'hotkey', params: { keys: ['enter'] } },
      ],
      riskLevel: 'medium',
      needsUser: false,
      done: false,
    }),
    provider: 'demo-check',
    turns: 1,
  }),
  vision: async () => ({ response: 'Demo screen context.', provider: 'demo-check' }),
};

const server = await startAblePathServer({
  port: 0,
  host: '127.0.0.1',
  homeDir: tempHome,
  provider,
  env: {},
});

const baseUrl = `http://127.0.0.1:${server.port}`;
try {
  const health = await getJson(`${baseUrl}/api/health`);
  assert(health.ok === true, 'health ok');

  const shell = await fetch(baseUrl);
  assert(shell.status === 200, 'owner shell status 200');
  const cookie = shell.headers.get('set-cookie') ?? '';
  assert(cookie.includes('ablepath_owner='), 'owner shell sets owner cookie');

  const recent = await getJson(`${baseUrl}/api/agent/recent`, cookie);
  assert(Array.isArray(recent.sessions), 'agent recent returns sessions');

  const planned = await postJson(`${baseUrl}/api/agent/command`, {
    command: '打开 www.baidu.com 并搜索 1+1',
    includeScreen: false,
  }, cookie);
  const steps = planned.session?.plan?.steps ?? [];
  assert(planned.session?.status === 'needs-confirmation', 'agent plan waits for confirmation');
  assert(steps.map((step) => step.type).join(',') === 'openUrl,wait', 'agent plan has expected actions');
  assert(steps[0].params.url === 'https://www.baidu.com/s?wd=1%2B1', 'agent plan normalizes Baidu search URL');
  assert(steps[0].params.browser === 'chrome', 'agent plan preserves Chrome browser hint');

  const dryRun = await postJson(`${baseUrl}/api/agent/confirm`, {
    sessionId: planned.session.id,
    dryRun: true,
  }, cookie);
  assert(dryRun.session?.execution?.dryRun === true, 'agent dry-run succeeds');

  console.log(`AblePath demo check passed at ${baseUrl}`);
} finally {
  await server.close();
  fs.rmSync(tempHome, { recursive: true, force: true });
}

async function getJson(url, cookie) {
  const response = await fetch(url, { headers: cookie ? { cookie } : undefined });
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJson(url, body, cookie) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function assert(value, label) {
  if (!value) throw new Error(`Demo check failed: ${label}`);
  console.log(`PASS ${label}`);
}
