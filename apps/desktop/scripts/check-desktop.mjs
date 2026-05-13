import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/main.cjs',
  'src/preload.cjs',
  'src/renderer/index.html',
  'src/renderer/renderer.js',
  'src/renderer/styles.css',
];

for (const file of requiredFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) throw new Error(`Missing desktop file: ${file}`);
}

const preload = fs.readFileSync(path.join(root, 'src/preload.cjs'), 'utf-8');
if (!preload.includes("require('node:http')")) throw new Error('Desktop preload must use Node HTTP for owner cookies');
if (preload.includes('headers.get')) throw new Error('Desktop preload must not read forbidden browser Set-Cookie headers');
if (!preload.includes('formatApiError')) throw new Error('Desktop preload must preserve useful API error details');
if (!preload.includes("'/api/agent/command', request, 90_000")) {
  throw new Error('Desktop agent planning requests must allow real AI latency');
}
for (const endpoint of [
  '/api/agent/command',
  '/api/agent/step',
  '/api/agent/confirm',
  '/api/agent/stop',
  '/api/listen',
  '/api/tts',
  '/api/emergency/trigger',
]) {
  if (!preload.includes(endpoint)) throw new Error(`Desktop preload is missing ${endpoint}`);
}

const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf-8');
if (!renderer.includes('speakCurrent')) throw new Error('Desktop renderer is missing speakCurrent');
if (!renderer.includes('getSpeakText')) throw new Error('Desktop renderer is missing selectable speak target handling');
if (!renderer.includes('maybeAutoExecute')) throw new Error('Desktop renderer is missing auto execute handling');
if (!renderer.includes('maybeAutoContinue')) throw new Error('Desktop renderer is missing auto screen loop handling');
if (!renderer.includes('maxAutoLoopSteps')) throw new Error('Desktop renderer is missing auto loop guard');
if (!renderer.includes('forceScreen: true')) throw new Error('Desktop auto loop must force screen capture for continuation');
if (!renderer.includes('stoppedSessionIds')) throw new Error('Desktop renderer must let Stop cancel auto loop sessions');
if (!renderer.includes('startHoldToTalk')) throw new Error('Desktop renderer is missing hold-to-talk handling');
if (!renderer.includes('startListenCountdown')) throw new Error('Desktop renderer is missing listen countdown handling');
for (const state of ['listening', 'planning', 'executing', 'SOS', 'error']) {
  if (!renderer.includes(state)) throw new Error(`Desktop renderer is missing state ${state}`);
}

const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf-8');
if (!html.includes('id="speak-target"')) throw new Error('Desktop UI is missing speak target selector');
if (!html.includes('id="auto-execute"')) throw new Error('Desktop UI is missing auto execute toggle');
if (html.includes('id="include-screen" type="checkbox" checked')) {
  throw new Error('Desktop screen context must default off for faster first planning');
}

console.log('AblePath desktop scaffold check passed');
