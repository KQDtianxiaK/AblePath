const { contextBridge, ipcRenderer } = require('electron');
const http = require('node:http');
const https = require('node:https');

const serverArg = process.argv.find((arg) => arg.startsWith('--ablepath-server-url='));
const serverUrl = serverArg?.split('=')[1] || 'http://localhost:4317';
let ownerCookie = '';

async function ensureOwnerCookie() {
  if (ownerCookie) return ownerCookie;
  const response = await requestRaw('GET', '/', undefined, false);
  const setCookie = response.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  ownerCookie = String(cookie || '').split(';')[0];
  if (!ownerCookie.includes('ablepath_owner=')) {
    throw new Error('AblePath owner session cookie was not created.');
  }
  return ownerCookie;
}

async function getJson(pathname) {
  const cookie = await ensureOwnerCookie();
  return requestJson('GET', pathname, undefined, cookie);
}

async function postJson(pathname, body, timeoutMs = 30_000) {
  const cookie = await ensureOwnerCookie();
  return requestJson('POST', pathname, body, cookie, timeoutMs);
}

async function requestJson(method, pathname, body, cookie, timeoutMs = 30_000) {
  const response = await requestRaw(method, pathname, body, true, cookie, timeoutMs);
  const data = response.text ? JSON.parse(response.text) : {};
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(formatApiError(pathname, response.statusCode, data));
  }
  return data;
}

function requestRaw(method, pathname, body, expectJson, cookie, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, serverUrl);
    const payload = body === undefined ? '' : JSON.stringify(body);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
      timeout: timeoutMs,
    }, (response) => {
      let text = '';
      response.setEncoding('utf-8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        if (expectJson && text) {
          try {
            JSON.parse(text);
          } catch {
            reject(new Error(`AblePath returned non-JSON response from ${pathname}.`));
            return;
          }
        }
        resolve({ statusCode: response.statusCode || 0, headers: response.headers, text });
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`AblePath request timed out after ${Math.round(timeoutMs / 1000)}s: ${pathname}`));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function formatApiError(pathname, statusCode, data) {
  const parts = [`${pathname} failed (${statusCode})`];
  if (data?.code) parts.push(`code=${data.code}`);
  if (data?.error) parts.push(data.error);
  if (data?.session?.error && data.session.error !== data.error) parts.push(data.session.error);
  if (Array.isArray(data?.setupHints) && data.setupHints.length > 0) {
    parts.push(`Setup: ${data.setupHints.join(' ')}`);
  }
  return parts.join(': ');
}

contextBridge.exposeInMainWorld('ablepathDesktop', {
  serverUrl,
  health: () => getJson('/api/health'),
  recentAgents: () => getJson('/api/agent/recent'),
  listen: (durationSec = 5) => postJson('/api/listen', { durationSec }, 90_000),
  speak: (text, priority = 'normal') => postJson('/api/tts', { text, priority }, 60_000),
  command: (request) => postJson('/api/agent/command', request, 90_000),
  step: (request) => postJson('/api/agent/step', request, 90_000),
  confirm: (request) => postJson('/api/agent/confirm', request),
  stop: (request) => postJson('/api/agent/stop', request),
  sos: (details) => postJson('/api/emergency/trigger', {
    trigger: 'manual',
    details: details || 'SOS triggered from AblePath desktop assistant.',
    activateImmediately: true,
  }),
  window: {
    minimize: () => ipcRenderer.invoke('ablepath:window:minimize'),
    hide: () => ipcRenderer.invoke('ablepath:window:hide'),
    close: () => ipcRenderer.invoke('ablepath:window:close'),
  },
});
