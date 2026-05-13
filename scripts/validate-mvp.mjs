import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const withAi = process.argv.includes('--with-ai');
const keepData = process.argv.includes('--keep-data');
const host = process.env.ABLEPATH_VALIDATE_HOST ?? '127.0.0.1';
const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-mvp-'));
let baseUrl = '';
const TEST_IMAGE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR4nGP4TyFgGDVg1IBRA4aLAQBdePwur/3haQAAAABJRU5ErkJggg==';

process.env.ABLEPATH_HOME = homeDir;
process.env.ABLEPATH_INACTIVITY_CHECK_MS = '0';

const { startAblePathServer } = await import('../apps/server/dist/src/app.js');

const results = [];
let server;
let ownerCookie = '';

function record(name, ok, details = '') {
  results.push({ name, ok, details });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${details ? ` - ${details}` : ''}`);
}

async function request(pathname, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.cookie) headers.cookie = options.cookie;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, text };
}

function setCookieHeader(response) {
  return response.headers.get('set-cookie') ?? '';
}

function extractOwnerCookie(response) {
  const cookie = setCookieHeader(response);
  const match = cookie.match(/ablepath_owner=([^;]+)/);
  return match ? `ablepath_owner=${match[1]}` : '';
}

function hasCorsAllowHeaders(response) {
  return Boolean(
    response.headers.get('access-control-allow-origin')
      || response.headers.get('access-control-allow-methods')
      || response.headers.get('access-control-allow-headers'),
  );
}

function assertStatus(name, actual, expected, details = '') {
  record(name, actual === expected, `status ${actual}${details ? ` · ${details}` : ''}`);
}

try {
  server = await startAblePathServer({ port: 0, host });
  baseUrl = `http://${host}:${server.port}`;
  console.log(`AblePath MVP validation server: ${baseUrl}`);
  console.log(`Temporary data: ${homeDir}`);

  const health = await request('/api/health');
  assertStatus('health is public', health.response.status, 200);

  const configWithoutCookie = await request('/api/config');
  assertStatus('owner API rejects missing cookie', configWithoutCookie.response.status, 401);

  const caregiverShell = await request('/caregiver');
  const caregiverSetCookie = setCookieHeader(caregiverShell.response);
  record(
    'caregiver shell does not set owner cookie',
    caregiverShell.response.status === 200 && !caregiverSetCookie.includes('ablepath_owner='),
    `status ${caregiverShell.response.status}`,
  );

  const home = await request('/');
  ownerCookie = extractOwnerCookie(home.response);
  record(
    'owner shell sets HttpOnly owner cookie',
    home.response.status === 200
      && ownerCookie
      && setCookieHeader(home.response).includes('HttpOnly')
      && setCookieHeader(home.response).includes('SameSite=Strict'),
    `status ${home.response.status}`,
  );

  const originConfig = await request('/api/config', {
    cookie: ownerCookie,
    headers: { Origin: 'https://example.invalid' },
  });
  record('cross-origin API response has no permissive CORS headers', !hasCorsAllowHeaders(originConfig.response));

  const preflight = await request('/api/config', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.invalid',
      'Access-Control-Request-Method': 'POST',
    },
  });
  record('preflight has no permissive CORS headers', preflight.response.status === 204 && !hasCorsAllowHeaders(preflight.response));

  const config = await request('/api/config', { cookie: ownerCookie });
  assertStatus('owner can read config', config.response.status, 200);
  record('config redacts caregiver token hash', !JSON.stringify(config.body).includes('accessTokenHash'));

  const readiness = await request('/api/readiness', { cookie: ownerCookie });
  assertStatus('readiness API works', readiness.response.status, 200, JSON.stringify(readiness.body?.totals ?? {}));

  const checklist = await request('/api/mvp/checklist', { cookie: ownerCookie });
  assertStatus('MVP checklist API works', checklist.response.status, 200, JSON.stringify(checklist.body?.totals ?? {}));

  const caregiver = await request('/api/caregivers/upsert', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: {
      name: 'MVP Validator',
      relationship: 'family',
      permissions: ['receive-emergency', 'view-activity', 'view-task-summary'],
    },
  });
  assertStatus('owner can create caregiver', caregiver.response.status, 200);
  const caregiverId = caregiver.body?.caregiver?.id;

  const tokenResult = await request('/api/caregivers/token', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { caregiverId, expiresInDays: 1 },
  });
  assertStatus('owner can create caregiver token', tokenResult.response.status, 200);
  const token = tokenResult.body?.token;

  const bearerSummary = await request('/api/caregiver/summary-token', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertStatus('caregiver Bearer token can read summary', bearerSummary.response.status, 200);

  const querySummary = await request(`/api/caregiver/summary-token?token=${encodeURIComponent(token)}`);
  assertStatus('query caregiver token is rejected', querySummary.response.status, 401);

  const idSummary = await request(`/api/caregiver/summary?caregiverId=${encodeURIComponent(caregiverId)}`);
  assertStatus('caregiverId summary is owner-only', idSummary.response.status, 401);

  const controlPlan = await request('/api/control/plan', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { intent: '打开 example.com' },
  });
  assertStatus('control plan can be created', controlPlan.response.status, 200);
  const planId = controlPlan.body?.plan?.id;
  record('control plan requires confirmation', controlPlan.body?.plan?.requiresConfirmation === true);

  const noConfirm = await request('/api/control/execute', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { planId, dryRun: true },
  });
  assertStatus('unconfirmed control execution is rejected', noConfirm.response.status, 400);

  const confirmed = await request('/api/control/execute', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { planId, dryRun: true, confirmed: true },
  });
  record(
    'confirmed dry-run control execution succeeds without real action',
    confirmed.response.status === 200 && confirmed.body?.dryRun === true && confirmed.body?.executed === false,
    `status ${confirmed.response.status}`,
  );

  const task = await request('/api/tasks/start', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { goal: '打开 example.org' },
  });
  assertStatus('task can start with a control plan', task.response.status, 200);
  const taskId = task.body?.task?.id;

  const taskRun = await request('/api/tasks/execute', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { taskId, dryRun: true, confirmed: true },
  });
  record(
    'task confirmed dry-run completes',
    taskRun.response.status === 200 && taskRun.body?.task?.execution?.dryRun === true,
    `status ${taskRun.response.status}`,
  );

  const emergency = await request('/api/emergency/trigger', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { trigger: 'manual', details: 'MVP validation', activateImmediately: false },
  });
  record(
    'SOS pending trigger returns countdown',
    emergency.response.status === 200 && Number.isFinite(emergency.body?.countdownSec),
    `status ${emergency.response.status}`,
  );

  const cancel = await request('/api/emergency/cancel', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'Content-Type': 'application/json' },
    body: { details: 'MVP validation cancel' },
  });
  assertStatus('SOS pending can be canceled', cancel.response.status, 200);

  const voice = await request('/api/voice/status', { cookie: ownerCookie });
  const screen = await request('/api/screen/status', { cookie: ownerCookie });
  const control = await request('/api/control/status', { cookie: ownerCookie });
  record('voice diagnostics API works', voice.response.status === 200, `record=${Boolean(voice.body?.audio?.canRecord)} tts=${Boolean(voice.body?.tts?.canSpeak)}`);
  record('screen diagnostics API works', screen.response.status === 200, `capture=${Boolean(screen.body?.canCapture)}`);
  record('control diagnostics API works', control.response.status === 200, `openUrl=${Boolean(control.body?.capabilities?.openUrl)} desktop=${Boolean(control.body?.capabilities?.click)}`);

  if (withAi) {
    const chat = await request('/api/chat', {
      method: 'POST',
      cookie: ownerCookie,
      headers: { 'Content-Type': 'application/json' },
      body: { message: '请只回复 OK' },
    });
    record(
      'real AI chat responds',
      chat.response.status === 200 && Boolean(chat.body?.response),
      `status ${chat.response.status}${chat.body?.error ? ` · ${chat.body.error}` : ''}`,
    );

    const vision = await request('/api/vision/analyze', {
      method: 'POST',
      cookie: ownerCookie,
      headers: { 'Content-Type': 'application/json' },
      body: {
        question: '请用不超过五个字描述这张测试图片。',
        imageBase64: TEST_IMAGE_PNG_BASE64,
        mimeType: 'image/png',
      },
    });
    record(
      'real AI vision responds',
      vision.response.status === 200 && Boolean(vision.body?.response),
      `status ${vision.response.status}${vision.body?.error ? ` · ${vision.body.error}` : ''}`,
    );
  }
} catch (err) {
  record('validation runner crashed', false, err instanceof Error ? err.message : String(err));
} finally {
  if (server) await server.close();
  if (!keepData) fs.rmSync(homeDir, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
const passed = results.length - failed.length;
console.log('');
console.log(`MVP validation summary: ${passed}/${results.length} passed`);
if (failed.length) {
  console.log('Failed checks:');
  for (const failure of failed) {
    console.log(`- ${failure.name}${failure.details ? `: ${failure.details}` : ''}`);
  }
  process.exitCode = 1;
}
