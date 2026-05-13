import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type http from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { ConfigStore, createDefaultConfig } from '@ablepath/core';

import {
  createApiHandler,
  hasOwnerSession,
  isPublicApiRequest,
  ownerSessionCookie,
  shouldSetOwnerSessionCookie,
  toApiErrorResponse,
} from '../src/app.js';
import { json } from '../src/http-utils.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-server-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('AblePath API handler', () => {
  it('serves health and default config', async () => {
    const handle = createApiHandler(makeTempDir());

    const health = await handle({ method: 'GET', pathname: '/api/health', searchParams: new URLSearchParams() });
    const config = await handle({ method: 'GET', pathname: '/api/config', searchParams: new URLSearchParams() });

    expect(health.status).toBe(200);
    expect((health.body as { product: string }).product).toBe('AblePath');
    expect((config.body as { providers: { defaultChat: string } }).providers.defaultChat).toBe('doubao');
  });

  it('does not expose permissive CORS headers by default', () => {
    let headers: Record<string, string> = {};
    const response = {
      writeHead: (_status: number, nextHeaders: Record<string, string>) => {
        headers = nextHeaders;
      },
      end: () => undefined,
    } as unknown as http.ServerResponse;

    json(response, 200, { ok: true });

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Access-Control-Allow-Methods']).toBeUndefined();
    expect(headers['Access-Control-Allow-Headers']).toBeUndefined();
  });

  it('maps missing host tools to setup-required HTTP errors', () => {
    const recorder = toApiErrorResponse(new Error('No audio recording backend found. Install pulseaudio-utils, alsa-utils, or sox.'));
    const screenshot = toApiErrorResponse(new Error('No screen capture backend found. Install grim, scrot, gnome-screenshot, or ImageMagick import.'));
    const generic = toApiErrorResponse(new Error('Unexpected failure'));

    expect(recorder.status).toBe(424);
    expect(recorder.body.code).toBe('setup-required');
    expect(recorder.body.setupHints?.join(' ')).toContain('recorder');
    expect(screenshot.status).toBe(424);
    expect(screenshot.body.code).toBe('setup-required');
    expect(screenshot.body.setupHints?.join(' ')).toContain('screenshot');
    expect(generic.status).toBe(500);
    expect(generic.body.code).toBeUndefined();
  });

  it('classifies local owner session boundaries', () => {
    const token = 'owner-token';
    const cookie = ownerSessionCookie(token);

    expect(cookie).toContain('ablepath_owner=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(hasOwnerSession(cookie, token)).toBe(true);
    expect(hasOwnerSession(cookie, 'other-token')).toBe(false);
    expect(hasOwnerSession('ablepath_owner=%E0%A4%A', token)).toBe(false);
    expect(isPublicApiRequest('GET', '/api/health')).toBe(true);
    expect(isPublicApiRequest('GET', '/api/caregiver/summary-token')).toBe(true);
    expect(isPublicApiRequest('GET', '/api/config')).toBe(false);
    expect(isPublicApiRequest('POST', '/api/caregivers/token')).toBe(false);
    expect(shouldSetOwnerSessionCookie('/')).toBe(true);
    expect(shouldSetOwnerSessionCookie('/index.html')).toBe(true);
    expect(shouldSetOwnerSessionCookie('/caregiver')).toBe(false);
    expect(shouldSetOwnerSessionCookie('/caregiver/')).toBe(false);
    expect(shouldSetOwnerSessionCookie('/assets/index.js')).toBe(false);
  });

  it('reports provider configuration status', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/providers/status',
      searchParams: new URLSearchParams(),
    });

    const body = response.body as { providers: Array<{ id: string; status: string }> };
    expect(body.providers[0].id).toBe('doubao');
    expect(body.providers[0].status).toBe('missing-config');
  });

  it('reports local MVP readiness', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/readiness',
      searchParams: new URLSearchParams(),
    });

    expect(response.status).toBe(200);
    const body = response.body as {
      items: Array<{ id: string; status: string; setupHints: string[] }>;
      totals: Record<string, number>;
    };
    expect(body.items.map((item) => item.id)).toEqual([
      'ai',
      'voice',
      'screen',
      'control',
      'caregivers',
      'safety',
    ]);
    expect(body.items.find((item) => item.id === 'ai')?.status).toBe('needs-setup');
    expect(body.items.find((item) => item.id === 'caregivers')?.status).toBe('limited');
    expect(body.totals.ready + body.totals.limited + body.totals['needs-setup']).toBe(body.items.length);
  });

  it('does not mark AI readiness complete when only realtime is configured', async () => {
    const handle = createApiHandler(makeTempDir(), {
      VOLC_ASR_APP_KEY: 'app-key',
      VOLC_ASR_ACCESS_KEY: 'access-key',
    });

    const response = await handle({
      method: 'GET',
      pathname: '/api/readiness',
      searchParams: new URLSearchParams(),
    });

    const body = response.body as {
      items: Array<{ id: string; status: string; details: string }>;
    };
    const ai = body.items.find((item) => item.id === 'ai');
    expect(ai?.status).toBe('limited');
    expect(ai?.details).toContain('chat missing');
    expect(ai?.details).toContain('vision missing');
    expect(ai?.details).toContain('realtime ready');
  });

  it('reports the MVP host validation checklist', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/mvp/checklist',
      searchParams: new URLSearchParams(),
    });

    expect(response.status).toBe(200);
    const body = response.body as {
      generatedAt: string;
      sections: Array<{
        id: string;
        items: Array<{ id: string; status: string; nextStep: string }>;
      }>;
      totals: Record<string, number>;
    };
    const items = body.sections.flatMap((section) => section.items);
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
    expect(body.sections.map((section) => section.id)).toEqual(['ai', 'host', 'caregiver-safety']);
    expect(items.map((item) => item.id)).toContain('provider-chat-vision');
    expect(items.map((item) => item.id)).toContain('desktop-control');
    expect(items.map((item) => item.id)).toContain('caregiver-pairing');
    expect(items.find((item) => item.id === 'provider-chat-vision')?.status).toBe('fail');
    expect(items.every((item) => item.nextStep.length > 0)).toBe(true);
    expect(body.totals.pass + body.totals.warning + body.totals.fail).toBe(items.length);
  });

  it('warns when MVP safety confirmations do not cover required actions', async () => {
    const dir = makeTempDir();
    const config = createDefaultConfig();
    config.safety.requireConfirmationFor = ['openUrl'];
    new ConfigStore(dir).save(config);
    const handle = createApiHandler(dir, {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/mvp/checklist',
      searchParams: new URLSearchParams(),
    });

    const body = response.body as {
      sections: Array<{ items: Array<{ id: string; status: string; setupHints: string[] }> }>;
    };
    const safety = body.sections.flatMap((section) => section.items).find((item) => item.id === 'safety-confirmation');
    expect(safety?.status).toBe('warning');
    expect(safety?.setupHints.join(' ')).toContain('click');
  });

  it('persists config updates and records activity', async () => {
    const handle = createApiHandler(makeTempDir());
    const config = (await handle({ method: 'GET', pathname: '/api/config', searchParams: new URLSearchParams() })).body;

    const saved = await handle({
      method: 'POST',
      pathname: '/api/config',
      searchParams: new URLSearchParams(),
      body: { ...(config as object), locale: 'en-US' },
    });
    const stats = await handle({ method: 'GET', pathname: '/api/activity/stats', searchParams: new URLSearchParams() });

    expect(saved.status).toBe(200);
    expect((saved.body as { locale: string }).locale).toBe('en-US');
    expect((stats.body as { total: number }).total).toBe(1);
  });

  it('routes chat through the configured provider', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 2,
      chat: async (message: string) => ({
        response: `reply: ${message}`,
        provider: 'mock',
        turns: 2,
      }),
      vision: async () => ({
        response: 'vision reply',
        provider: 'mock',
      }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);

    const response = await handle({
      method: 'POST',
      pathname: '/api/chat',
      searchParams: new URLSearchParams(),
      body: { message: '你好' },
    });

    expect(response.status).toBe(200);
    expect((response.body as { response: string }).response).toBe('reply: 你好');
  });

  it('creates and dry-runs control plans with explicit confirmation', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const planned = await handle({
      method: 'POST',
      pathname: '/api/control/plan',
      searchParams: new URLSearchParams(),
      body: { intent: '打开 example.com' },
    });

    expect(planned.status).toBe(200);
    const plan = (planned.body as { plan: { id: string; requiresConfirmation: boolean } }).plan;
    expect(plan.requiresConfirmation).toBe(true);

    const rejected = await handle({
      method: 'POST',
      pathname: '/api/control/execute',
      searchParams: new URLSearchParams(),
      body: { planId: plan.id, dryRun: true },
    });
    expect(rejected.status).toBe(400);

    const executed = await handle({
      method: 'POST',
      pathname: '/api/control/execute',
      searchParams: new URLSearchParams(),
      body: { planId: plan.id, confirmed: true, dryRun: true },
    });
    expect(executed.status).toBe(200);
    expect((executed.body as { dryRun: boolean }).dryRun).toBe(true);
  });

  it('reports screen capture status without requiring a desktop session', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/screen/status',
      searchParams: new URLSearchParams(),
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('canCapture');
    expect(response.body).toHaveProperty('setupHints');
  });

  it('detects screen targets from provided image data and creates a target click plan', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 0,
      chat: async () => ({ response: 'ok', provider: 'mock', turns: 0 }),
      vision: async () => ({
        response:
          '{"elements":[{"label":"继续","role":"button","bounds":{"x":20,"y":30,"width":100,"height":40},"actionable":true,"confidence":0.88}]}',
        provider: 'mock',
      }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);

    const targets = await handle({
      method: 'POST',
      pathname: '/api/screen/targets',
      searchParams: new URLSearchParams(),
      body: { imageBase64: 'ZmFrZQ==', mimeType: 'image/png' },
    });

    expect(targets.status).toBe(200);
    const element = (targets.body as { elements: Array<{ id: string; label: string }> }).elements[0];
    expect(element.label).toBe('继续');

    const planned = await handle({
      method: 'POST',
      pathname: '/api/control/plan-target',
      searchParams: new URLSearchParams(),
      body: { targetId: element.id },
    });

    expect(planned.status).toBe(200);
    const plan = (planned.body as { plan: { steps: Array<{ params: { x: number; y: number } }> } }).plan;
    expect(plan.steps[0].params).toMatchObject({ x: 70, y: 50 });
  });

  it('runs the emergency pending, confirm, and resolve flow', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const initial = await handle({
      method: 'GET',
      pathname: '/api/emergency/status',
      searchParams: new URLSearchParams(),
    });
    expect((initial.body as { current: { state: string } }).current.state).toBe('normal');

    const triggered = await handle({
      method: 'POST',
      pathname: '/api/emergency/trigger',
      searchParams: new URLSearchParams(),
      body: { trigger: 'manual', details: '测试 SOS' },
    });
    expect(triggered.status).toBe(200);
    expect((triggered.body as { event: { state: string }; countdownSec: number }).event.state).toBe('pending-confirmation');

    const confirmed = await handle({
      method: 'POST',
      pathname: '/api/emergency/confirm',
      searchParams: new URLSearchParams(),
      body: { details: '确认需要帮助' },
    });
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as { event: { state: string } }).event.state).toBe('active');

    const resolved = await handle({
      method: 'POST',
      pathname: '/api/emergency/resolve',
      searchParams: new URLSearchParams(),
      body: { details: '已处理' },
    });
    expect(resolved.status).toBe(200);
    expect((resolved.body as { event: { state: string } }).event.state).toBe('resolved');
  });

  it('manages caregivers in config', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '家人', relationship: 'family', permissions: ['receive-emergency'] },
    });
    expect(saved.status).toBe(200);
    const caregiver = (saved.body as { caregiver: { id: string; name: string } }).caregiver;
    expect(caregiver.name).toBe('家人');

    const listed = await handle({
      method: 'GET',
      pathname: '/api/caregivers',
      searchParams: new URLSearchParams(),
    });
    expect((listed.body as { caregivers: unknown[] }).caregivers).toHaveLength(1);

    const removed = await handle({
      method: 'POST',
      pathname: '/api/caregivers/remove',
      searchParams: new URLSearchParams(),
      body: { id: caregiver.id },
    });
    expect(removed.status).toBe(200);
  });

  it('updates caregiver permissions through upsert', async () => {
    const handle = createApiHandler(makeTempDir(), {});
    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '权限测试', permissions: ['receive-emergency'] },
    });
    const caregiver = (saved.body as { caregiver: { id: string } }).caregiver;

    const updated = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { id: caregiver.id, name: '权限测试', permissions: ['view-task-summary', 'view-screen'] },
    });

    expect(updated.status).toBe(200);
    const body = updated.body as { caregiver: { permissions: string[] }; caregivers: Array<{ id: string }> };
    expect(body.caregiver.permissions).toEqual(['view-task-summary', 'view-screen']);
    expect(body.caregivers).toHaveLength(1);

    const invalid = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { id: caregiver.id, name: '权限测试', permissions: ['view-activity', 'admin', 'remote-assist'] },
    });
    expect(invalid.status).toBe(200);
    expect((invalid.body as { caregiver: { permissions: string[] } }).caregiver.permissions).toEqual(['view-activity']);
  });

  it('generates caregiver access tokens without leaking token hashes', async () => {
    const handle = createApiHandler(makeTempDir(), {});
    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '令牌测试', permissions: ['view-activity'] },
    });
    const caregiver = (saved.body as { caregiver: { id: string } }).caregiver;

    const tokenResponse = await handle({
      method: 'POST',
      pathname: '/api/caregivers/token',
      searchParams: new URLSearchParams(),
      body: { caregiverId: caregiver.id },
    });
    expect(tokenResponse.status).toBe(200);
    const tokenBody = tokenResponse.body as { token: string; expiresAt: string };
    const token = tokenBody.token;
    expect(token.length).toBeGreaterThan(20);
    expect(Date.parse(tokenBody.expiresAt)).toBeGreaterThan(Date.now());

    const listed = await handle({
      method: 'GET',
      pathname: '/api/caregivers',
      searchParams: new URLSearchParams(),
    });
    expect(JSON.stringify(listed.body)).not.toContain('accessTokenHash');
    expect(JSON.stringify(listed.body)).not.toContain(token);

    const config = await handle({
      method: 'GET',
      pathname: '/api/config',
      searchParams: new URLSearchParams(),
    });
    expect(JSON.stringify(config.body)).not.toContain('accessTokenHash');
    expect(JSON.stringify(config.body)).not.toContain(token);

    const savedConfig = await handle({
      method: 'POST',
      pathname: '/api/config',
      searchParams: new URLSearchParams(),
      body: config.body,
    });
    expect(savedConfig.status).toBe(200);

    const rejected = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams({ token: 'bad-token' }),
    });
    expect(rejected.status).toBe(401);

    const summary = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams({ token }),
    });
    expect(summary.status).toBe(401);

    const bearerSummary = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bearerSummary.status).toBe(200);
    expect(bearerSummary.body).toHaveProperty('activity');
  });

  it('rotates, expires, and revokes caregiver access tokens', async () => {
    const homeDir = makeTempDir();
    const handle = createApiHandler(homeDir, {});
    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '轮换测试', permissions: ['view-activity'] },
    });
    const caregiver = (saved.body as { caregiver: { id: string } }).caregiver;
    const first = await handle({
      method: 'POST',
      pathname: '/api/caregivers/token',
      searchParams: new URLSearchParams(),
      body: { caregiverId: caregiver.id },
    });
    const firstToken = (first.body as { token: string }).token;
    const second = await handle({
      method: 'POST',
      pathname: '/api/caregivers/token',
      searchParams: new URLSearchParams(),
      body: { caregiverId: caregiver.id, expiresInDays: -5 },
    });
    const secondBody = second.body as { token: string; expiresAt: string };
    expect(Date.parse(secondBody.expiresAt)).toBeGreaterThan(Date.now());

    const rotatedOut = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams({ token: firstToken }),
    });
    expect(rotatedOut.status).toBe(401);

    const valid = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams(),
      headers: { authorization: `Bearer ${secondBody.token}` },
    });
    expect(valid.status).toBe(200);

    const store = new ConfigStore(homeDir);
    const config = store.ensure();
    const storedCaregiver = config.caregivers.find((item) => item.id === caregiver.id) as
      | ({ accessTokenExpiresAt?: string })
      | undefined;
    if (storedCaregiver) storedCaregiver.accessTokenExpiresAt = 'bad-date';
    store.save(config);
    const invalidExpiry = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams(),
      headers: { authorization: `Bearer ${secondBody.token}` },
    });
    expect(invalidExpiry.status).toBe(401);

    const checklist = await handle({
      method: 'GET',
      pathname: '/api/mvp/checklist',
      searchParams: new URLSearchParams(),
    });
    const checklistBody = checklist.body as {
      sections: Array<{ items: Array<{ id: string; status: string }> }>;
    };
    const pairing = checklistBody.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === 'caregiver-pairing');
    expect(pairing?.status).toBe('warning');

    const refreshed = store.ensure();
    const refreshedCaregiver = refreshed.caregivers.find((item) => item.id === caregiver.id) as
      | ({ accessTokenExpiresAt?: string })
      | undefined;
    if (refreshedCaregiver) refreshedCaregiver.accessTokenExpiresAt = secondBody.expiresAt;
    store.save(refreshed);

    const revoked = await handle({
      method: 'POST',
      pathname: '/api/caregivers/token/revoke',
      searchParams: new URLSearchParams(),
      body: { caregiverId: caregiver.id },
    });
    expect(revoked.status).toBe(200);
    expect(JSON.stringify(revoked.body)).not.toContain('accessTokenCreatedAt');

    const afterRevoke = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary-token',
      searchParams: new URLSearchParams({ token: secondBody.token }),
    });
    expect(afterRevoke.status).toBe(401);
  });

  it('returns caregiver summaries scoped by permissions', async () => {
    const handle = createApiHandler(makeTempDir(), {});
    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '看护者', permissions: ['receive-emergency', 'view-activity'] },
    });
    const caregiver = (saved.body as { caregiver: { id: string } }).caregiver;
    await handle({
      method: 'POST',
      pathname: '/api/emergency/trigger',
      searchParams: new URLSearchParams(),
      body: { details: '测试' },
    });

    const summary = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary',
      searchParams: new URLSearchParams({ caregiverId: caregiver.id }),
    });

    expect(summary.status).toBe(200);
    expect(summary.body).toHaveProperty('emergency');
    expect(summary.body).toHaveProperty('activity');
    expect(summary.body).not.toHaveProperty('screen');
    expect(summary.body).not.toHaveProperty('tasks');
    const recent = (summary.body as { activity: { recent: Array<Record<string, unknown>> } }).activity.recent;
    expect(recent.every((entry) => !('details' in entry))).toBe(true);
  });

  it('redacts caregiver activity summaries', async () => {
    const handle = createApiHandler(makeTempDir(), {});
    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '活动看护者', permissions: ['view-activity'] },
    });
    const caregiver = (saved.body as { caregiver: { id: string } }).caregiver;
    await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '私人任务：打开 example.org' },
    });

    const summary = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary',
      searchParams: new URLSearchParams({ caregiverId: caregiver.id }),
    });

    expect(summary.status).toBe(200);
    expect(JSON.stringify((summary.body as { activity: unknown }).activity)).toContain('System activity');
    expect(JSON.stringify(summary.body)).not.toContain('私人任务');
    expect(JSON.stringify(summary.body)).not.toContain('example.org');
  });

  it('returns redacted caregiver task summaries only with task permission', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 1,
      chat: async () => ({
        response: '{"intent":"打开 example.org","actions":[{"type":"openUrl","params":{"url":"example.org"}}]}',
        provider: 'mock',
        turns: 1,
      }),
      vision: async () => ({ response: 'ok', provider: 'mock' }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);
    const saved = await handle({
      method: 'POST',
      pathname: '/api/caregivers/upsert',
      searchParams: new URLSearchParams(),
      body: { name: '看护者', permissions: ['view-task-summary'] },
    });
    const caregiver = (saved.body as { caregiver: { id: string } }).caregiver;
    const started = await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '打开私人网站 example.org' },
    });
    const task = (started.body as { task: { id: string } }).task;
    await handle({
      method: 'POST',
      pathname: '/api/tasks/plan-ai',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, instruction: '打开 example.org' },
    });

    const summary = await handle({
      method: 'GET',
      pathname: '/api/caregiver/summary',
      searchParams: new URLSearchParams({ caregiverId: caregiver.id }),
    });

    expect(summary.status).toBe(200);
    const body = summary.body as { tasks: { recent: Array<Record<string, unknown>> } };
    expect(body.tasks.recent).toHaveLength(1);
    expect(body.tasks.recent[0]).toHaveProperty('status');
    expect(body.tasks.recent[0]).toHaveProperty('aiPlans', 1);
    expect(JSON.stringify(body.tasks)).not.toContain('私人网站');
    expect(JSON.stringify(body.tasks)).not.toContain('example.org');
    expect(JSON.stringify(body.tasks)).not.toContain('rawResponse');
  });

  it('updates safety timeout settings with validation', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const updated = await handle({
      method: 'POST',
      pathname: '/api/safety/update',
      searchParams: new URLSearchParams(),
      body: { inactivityTimeoutMs: 60_000, emergencyConfirmationTimeoutSec: 20 },
    });
    expect(updated.status).toBe(200);
    expect((updated.body as { safety: { inactivityTimeoutMs: number } }).safety.inactivityTimeoutMs).toBe(60_000);

    const rejected = await handle({
      method: 'POST',
      pathname: '/api/safety/update',
      searchParams: new URLSearchParams(),
      body: { emergencyConfirmationTimeoutSec: 1 },
    });
    expect(rejected.status).toBe(400);
  });

  it('starts and dry-runs task sessions through the control confirmation boundary', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const started = await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '打开 example.com' },
    });
    expect(started.status).toBe(200);
    const task = (started.body as { task: { id: string; status: string } }).task;
    expect(task.status).toBe('awaiting-confirmation');

    const rejected = await handle({
      method: 'POST',
      pathname: '/api/tasks/execute',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, dryRun: true },
    });
    expect(rejected.status).toBe(400);

    const executed = await handle({
      method: 'POST',
      pathname: '/api/tasks/execute',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, confirmed: true, dryRun: true },
    });
    expect(executed.status).toBe(200);
    expect((executed.body as { task: { status: string } }).task.status).toBe('completed');
  });

  it('advances task sessions with user context and replans the next action', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const started = await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '打开 example.com' },
    });
    const task = (started.body as { task: { id: string } }).task;

    const advanced = await handle({
      method: 'POST',
      pathname: '/api/tasks/advance',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, instruction: '改为打开 example.org' },
    });

    expect(advanced.status).toBe(200);
    const updated = advanced.body as {
      task: {
        status: string;
        plan: { steps: Array<{ type: string; params: { url?: string } }> };
        events: Array<{ type: string }>;
      };
    };
    expect(updated.task.status).toBe('awaiting-confirmation');
    expect(updated.task.plan.steps[0].type).toBe('openUrl');
    expect(updated.task.plan.steps[0].params.url).toBe('https://example.org');
    expect(updated.task.events.map((event) => event.type)).toContain('user-note');
  });

  it('advances task sessions from screen analysis and replans the next action', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 0,
      chat: async () => ({ response: 'ok', provider: 'mock', turns: 0 }),
      vision: async () => ({
        response: '屏幕显示浏览器地址栏，请打开 example.org 继续。',
        provider: 'mock',
      }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);

    const started = await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '打开 example.com' },
    });
    const task = (started.body as { task: { id: string } }).task;

    const advanced = await handle({
      method: 'POST',
      pathname: '/api/tasks/advance-screen',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, imageBase64: 'ZmFrZQ==', mimeType: 'image/png' },
    });

    expect(advanced.status).toBe(200);
    const updated = advanced.body as {
      analysis: { response: string };
      task: {
        plan: { steps: Array<{ type: string; params: { url?: string } }> };
        events: Array<{ type: string; summary: string }>;
      };
    };
    expect(updated.analysis.response).toContain('example.org');
    expect(updated.task.plan.steps[0].type).toBe('openUrl');
    expect(updated.task.plan.steps[0].params.url).toBe('https://example.org');
    expect(updated.task.events.map((event) => event.type)).toContain('screen-analysis');
  });

  it('creates structured AI task plans through the confirmation boundary', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 1,
      chat: async () => ({
        response: '{"intent":"打开 example.org","explanation":"打开目标网站","actions":[{"type":"openUrl","description":"打开 example.org","params":{"url":"example.org"}}]}',
        provider: 'mock',
        turns: 1,
      }),
      vision: async () => ({ response: 'ok', provider: 'mock' }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);

    const started = await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '打开一个网站' },
    });
    const task = (started.body as { task: { id: string } }).task;

    const planned = await handle({
      method: 'POST',
      pathname: '/api/tasks/plan-ai',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, instruction: '打开 example.org' },
    });

    expect(planned.status).toBe(200);
    const body = planned.body as {
      warnings: string[];
      safetyReview: { riskLevel: string; requiresConfirmation: boolean; blockedActions: unknown[] };
      task: {
        status: string;
        plan: { requiresConfirmation: boolean; steps: Array<{ type: string; params: { url?: string } }> };
        events: Array<{ type: string }>;
      };
    };
    expect(body.warnings).toHaveLength(0);
    expect(body.safetyReview.riskLevel).toBe('medium');
    expect(body.safetyReview.requiresConfirmation).toBe(true);
    expect(body.safetyReview.blockedActions).toHaveLength(0);
    expect(body.task.status).toBe('awaiting-confirmation');
    expect(body.task.plan.requiresConfirmation).toBe(true);
    expect(body.task.plan.steps[0].params.url).toBe('https://example.org');
    expect(body.task.events.map((event) => event.type)).toContain('ai-plan');
  });

  it('creates agent command sessions with AI structured action previews', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 1,
      chat: async () => ({
        response: JSON.stringify({
          intent: '打开百度并搜索 1+1',
          actions: [
            { type: 'openUrl', params: { url: 'www.baidu.com', browser: 'chrome' } },
            { type: 'type', params: { text: '1+1' } },
            { type: 'hotkey', params: { keys: ['enter'] } },
          ],
          riskLevel: 'medium',
        }),
        provider: 'mock',
        turns: 1,
      }),
      vision: async () => ({ response: 'screen ok', provider: 'mock' }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);

    const planned = await handle({
      method: 'POST',
      pathname: '/api/agent/command',
      searchParams: new URLSearchParams(),
      body: { command: '打开 www.baidu.com 并搜索 1+1' },
    });

    expect(planned.status).toBe(200);
    const body = planned.body as {
      session: { status: string; plan: { steps: Array<{ type: string; params: Record<string, unknown> }> } };
    };
    expect(body.session.status).toBe('needs-confirmation');
    expect(body.session.plan.steps.map((step) => step.type)).toEqual(['openUrl', 'wait']);
    expect(body.session.plan.steps[0].params.url).toBe('https://www.baidu.com/s?wd=1%2B1');
    expect(body.session.plan.steps[0].params.url).toContain('wd=1%2B1');
  });

  it('dry-runs and stops agent sessions without real desktop execution', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 1,
      chat: async () => ({
        response: '{"intent":"wait","actions":[{"type":"wait","params":{"durationMs":100}}],"riskLevel":"low"}',
        provider: 'mock',
        turns: 1,
      }),
      vision: async () => ({ response: 'screen ok', provider: 'mock' }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);

    const planned = await handle({
      method: 'POST',
      pathname: '/api/agent/command',
      searchParams: new URLSearchParams(),
      body: { command: 'wait briefly' },
    });
    const session = (planned.body as { session: { id: string } }).session;
    const executed = await handle({
      method: 'POST',
      pathname: '/api/agent/confirm',
      searchParams: new URLSearchParams(),
      body: { sessionId: session.id, dryRun: true },
    });

    expect(executed.status).toBe(200);
    expect((executed.body as { session: { execution: { dryRun: boolean } } }).session.execution.dryRun).toBe(true);

    const stopped = await handle({
      method: 'POST',
      pathname: '/api/agent/stop',
      searchParams: new URLSearchParams(),
      body: { sessionId: session.id },
    });
    expect(stopped.status).toBe(200);
    expect((stopped.body as { session: { status: string } }).session.status).toBe('stopped');
  });

  it('returns local task audit records', async () => {
    const provider = {
      id: 'mock',
      clearHistory: () => undefined,
      getTurnCount: () => 1,
      chat: async () => ({
        response: '{"intent":"打开 example.org","actions":[{"type":"openUrl","params":{"url":"example.org"}}]}',
        provider: 'mock',
        turns: 1,
      }),
      vision: async () => ({ response: 'ok', provider: 'mock' }),
    };
    const handle = createApiHandler(makeTempDir(), {}, provider);
    const started = await handle({
      method: 'POST',
      pathname: '/api/tasks/start',
      searchParams: new URLSearchParams(),
      body: { goal: '打开一个网站' },
    });
    const task = (started.body as { task: { id: string } }).task;
    await handle({
      method: 'POST',
      pathname: '/api/tasks/plan-ai',
      searchParams: new URLSearchParams(),
      body: { taskId: task.id, instruction: '打开 example.org' },
    });

    const audit = await handle({
      method: 'GET',
      pathname: '/api/tasks/audit',
      searchParams: new URLSearchParams({ taskId: task.id }),
    });

    expect(audit.status).toBe(200);
    const body = audit.body as { totals: { aiPlans: number }; entries: Array<{ type: string }> };
    expect(body.totals.aiPlans).toBe(1);
    expect(body.entries.map((entry) => entry.type)).toContain('ai-plan');
  });

  it('checks inactivity and triggers pending emergency after timeout', async () => {
    const dir = makeTempDir();
    const config = createDefaultConfig();
    config.safety.inactivityTimeoutMs = 1;
    new ConfigStore(dir).save(config);
    const handle = createApiHandler(dir, {});

    const checked = await handle({
      method: 'POST',
      pathname: '/api/inactivity/check',
      searchParams: new URLSearchParams(),
      body: {},
    });

    expect(checked.status).toBe(200);
    expect((checked.body as { triggered: boolean; event?: { trigger: string } }).triggered).toBe(true);
    expect((checked.body as { event?: { trigger: string } }).event?.trigger).toBe('inactivity');
  });

  it('reports audio devices without requiring hardware in tests', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/devices/audio',
      searchParams: new URLSearchParams(),
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('devices');
    expect(response.body).toHaveProperty('status');
  });

  it('reports voice setup status without exposing secrets', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'GET',
      pathname: '/api/voice/status',
      searchParams: new URLSearchParams(),
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('audio');
    expect(response.body).toHaveProperty('tts');
    expect(response.body).toHaveProperty('realtime');
    expect(JSON.stringify(response.body)).not.toContain('accessKey');
  });

  it('validates TTS text', async () => {
    const handle = createApiHandler(makeTempDir(), {});

    const response = await handle({
      method: 'POST',
      pathname: '/api/tts',
      searchParams: new URLSearchParams(),
      body: { text: '' },
    });

    expect(response.status).toBe(400);
  });
});
