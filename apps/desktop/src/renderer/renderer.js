const api = window.ablepathDesktop;

const els = {
  shell: document.querySelector('.shell'),
  server: document.querySelector('#server'),
  orb: document.querySelector('#orb'),
  orbState: document.querySelector('#orb-state'),
  listenCountdown: document.querySelector('#listen-countdown'),
  listenProgress: document.querySelector('#listen-progress'),
  command: document.querySelector('#command'),
  includeScreen: document.querySelector('#include-screen'),
  autoExecute: document.querySelector('#auto-execute'),
  listen: document.querySelector('#listen'),
  speakTarget: document.querySelector('#speak-target'),
  speak: document.querySelector('#speak'),
  plan: document.querySelector('#plan'),
  next: document.querySelector('#next'),
  preview: document.querySelector('#preview'),
  status: document.querySelector('#status'),
  risk: document.querySelector('#risk'),
  explanation: document.querySelector('#explanation'),
  steps: document.querySelector('#steps'),
  dryRun: document.querySelector('#dry-run'),
  confirm: document.querySelector('#confirm'),
  stop: document.querySelector('#stop'),
  sos: document.querySelector('#sos'),
  notice: document.querySelector('#notice'),
  hide: document.querySelector('#hide'),
  close: document.querySelector('#close'),
};

let currentSession = null;
let holdTimer = null;
let listenCountdownTimer = null;
let suppressNextListenClick = false;
let autoExecutingSessionId = null;
const autoLoopCounts = new Map();
const stoppedSessionIds = new Set();
let autoContinueTimer = null;
const listenDurationSec = 5;
const maxAutoLoopSteps = 5;

setState('idle');
els.server.textContent = api.serverUrl;
api.health().then(() => setNotice('Ready')).catch((err) => setError(err));

els.orb.addEventListener('click', planCommand);
els.listen.addEventListener('click', () => {
  if (suppressNextListenClick) {
    suppressNextListenClick = false;
    return;
  }
  listenOnce('tap');
});
els.listen.addEventListener('pointerdown', startHoldToTalk);
els.listen.addEventListener('pointerup', endHoldToTalk);
els.listen.addEventListener('pointercancel', cancelHoldToTalk);
els.listen.addEventListener('pointerleave', cancelHoldToTalk);
els.speak.addEventListener('click', speakCurrent);
els.plan.addEventListener('click', planCommand);
els.next.addEventListener('click', nextStep);
els.dryRun.addEventListener('click', () => execute(true));
els.confirm.addEventListener('click', () => execute(false));
els.stop.addEventListener('click', stopSession);
els.sos.addEventListener('click', triggerSos);
els.hide.addEventListener('click', () => api.window.hide());
els.close.addEventListener('click', () => api.window.close());

async function planCommand() {
  const command = els.command.value.trim();
  if (!command) return setNotice('Enter a command first.');
  stoppedSessionIds.clear();
  autoLoopCounts.clear();
  setState('planning');
  try {
    const response = await api.command({ command, includeScreen: els.includeScreen.checked });
    renderSession(response.session);
  } catch (err) {
    setError(err);
  }
}

function startHoldToTalk(event) {
  if (event.button !== 0 || els.listen.disabled) return;
  holdTimer = window.setTimeout(() => {
    holdTimer = null;
    suppressNextListenClick = true;
    listenOnce('hold');
  }, 350);
}

function endHoldToTalk() {
  if (holdTimer) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function cancelHoldToTalk() {
  if (!holdTimer) return;
  window.clearTimeout(holdTimer);
  holdTimer = null;
}

async function listenOnce(mode) {
  setState('listening');
  els.listen.disabled = true;
  els.plan.disabled = true;
  startListenCountdown(listenDurationSec);
  setNotice(mode === 'hold' ? `Hold-to-talk started. Recording ${listenDurationSec} seconds.` : `Listening for ${listenDurationSec} seconds.`);
  try {
    const response = await api.listen(listenDurationSec);
    els.command.value = response.text || '';
    setState('idle');
    setNotice(response.text ? `Heard: ${response.text}` : 'No speech recognized.');
  } catch (err) {
    setError(err);
  } finally {
    cancelHoldToTalk();
    stopListenCountdown();
    els.listen.disabled = false;
    els.plan.disabled = false;
  }
}

function startListenCountdown(durationSec) {
  stopListenCountdown();
  const startedAt = Date.now();
  els.listenProgress.max = durationSec;
  els.listenProgress.value = 0;
  updateListenCountdown(durationSec, durationSec);
  listenCountdownTimer = window.setInterval(() => {
    const elapsedSec = Math.min(durationSec, (Date.now() - startedAt) / 1000);
    const remainingSec = Math.max(0, Math.ceil(durationSec - elapsedSec));
    els.listenProgress.value = elapsedSec;
    updateListenCountdown(remainingSec, durationSec);
    if (elapsedSec >= durationSec) stopListenCountdown(false);
  }, 150);
}

function updateListenCountdown(remainingSec, durationSec) {
  els.listenCountdown.textContent = remainingSec > 0 ? `recording ${remainingSec}s` : 'processing';
  els.listenProgress.setAttribute('aria-label', `Recording progress ${durationSec - remainingSec} of ${durationSec} seconds`);
}

function stopListenCountdown(reset = true) {
  if (listenCountdownTimer) {
    window.clearInterval(listenCountdownTimer);
    listenCountdownTimer = null;
  }
  if (reset) {
    els.listenCountdown.textContent = 'ready';
    els.listenProgress.value = 0;
  }
}

async function speakCurrent() {
  const text = getSpeakText(els.speakTarget.value);
  if (!text) return setNotice('Nothing to speak.');
  els.speak.disabled = true;
  try {
    await api.speak(text, currentSession?.error || els.speakTarget.value === 'error' ? 'high' : 'normal');
    setNotice('Spoken.');
  } catch (err) {
    setError(err);
  } finally {
    els.speak.disabled = false;
  }
}

function getSpeakText(target) {
  const commandText = els.command.value.trim();
  const planText = currentSession?.plan?.explanation || '';
  const stepsText = (currentSession?.plan?.steps || [])
    .map((step, index) => `Step ${index + 1}. ${step.description}`)
    .join(' ');
  const statusText = [
    currentSession ? `Status: ${currentSession.status}.` : `Status: ${els.orbState.textContent}.`,
    els.notice.textContent,
  ].filter(Boolean).join(' ');
  const errorText = currentSession?.error || els.notice.textContent;

  switch (target) {
    case 'command':
      return commandText;
    case 'plan':
      return planText;
    case 'steps':
      return stepsText;
    case 'status':
      return statusText;
    case 'error':
      return errorText;
    default:
      return planText || stepsText || errorText || statusText || commandText;
  }
}

async function nextStep(options = {}) {
  if (!currentSession) return;
  const sessionId = currentSession.id;
  const instruction = els.command.value.trim();
  setState('planning');
  try {
    const response = await api.step({
      sessionId,
      instruction: instruction || undefined,
      includeScreen: options.forceScreen || els.includeScreen.checked,
    });
    if (stoppedSessionIds.has(sessionId)) return;
    renderSession(response.session);
  } catch (err) {
    setError(err);
  }
}

async function execute(dryRun) {
  if (!currentSession) return;
  const sessionId = currentSession.id;
  setState('executing');
  try {
    const response = await api.confirm({
      sessionId,
      confirmed: !dryRun,
      dryRun,
    });
    if (stoppedSessionIds.has(sessionId)) return;
    renderSession(response.session);
  } catch (err) {
    setError(err);
  }
}

async function stopSession() {
  if (!currentSession) return;
  stoppedSessionIds.add(currentSession.id);
  if (autoContinueTimer) {
    window.clearTimeout(autoContinueTimer);
    autoContinueTimer = null;
  }
  autoExecutingSessionId = null;
  setState('idle');
  try {
    const response = await api.stop({ sessionId: currentSession.id, reason: 'Stopped from desktop assistant.' });
    renderSession(response.session);
  } catch (err) {
    setError(err);
  }
}

async function triggerSos() {
  setState('SOS');
  try {
    await api.sos('SOS triggered from AblePath floating assistant.');
    setNotice('SOS sent.');
  } catch (err) {
    setError(err);
  }
}

function renderSession(session) {
  currentSession = session;
  setState(session.status);
  els.preview.hidden = false;
  els.status.textContent = session.status;
  els.risk.textContent = session.plan ? session.plan.riskLevel : 'no plan';
  els.explanation.textContent = session.plan?.explanation || session.error || '';
  els.steps.replaceChildren(...(session.plan?.steps || []).map((step) => {
    const item = document.createElement('li');
    item.textContent = `${step.type}: ${step.description}`;
    return item;
  }));
  const hasPlan = Boolean(session.plan);
  els.listen.disabled = session.status === 'executing';
  els.speak.disabled = false;
  els.plan.disabled = session.status === 'executing';
  els.dryRun.disabled = !hasPlan || session.status === 'executing';
  els.confirm.disabled = !hasPlan || session.status === 'executing';
  els.next.disabled = !currentSession || session.status === 'executing';
  els.stop.disabled = !currentSession || ['failed', 'stopped'].includes(session.status);
  setNotice(session.execution ? `${session.execution.dryRun ? 'Dry-run' : 'Execution'} finished.` : '');
  maybeAutoExecute(session);
  maybeAutoContinue(session);
}

function maybeAutoExecute(session) {
  if (stoppedSessionIds.has(session.id)) return;
  if (!els.autoExecute.checked || !session.plan || session.execution) return;
  if (!['needs-confirmation', 'ready'].includes(session.status)) return;
  if (autoExecutingSessionId === session.id) return;
  if (session.plan.steps.some((step) => step.type === 'callUser')) {
    setNotice('Auto mode is on, but this plan needs user input.');
    return;
  }

  autoExecutingSessionId = session.id;
  setNotice('Auto mode: executing current plan.');
  window.setTimeout(() => {
    execute(false).finally(() => {
      autoExecutingSessionId = null;
    });
  }, 150);
}

function maybeAutoContinue(session) {
  if (stoppedSessionIds.has(session.id)) return;
  if (!els.autoExecute.checked || !session.execution || session.execution.dryRun) return;
  if (session.status !== 'completed') return;
  if (!session.execution.results.every((result) => result.ok)) return;
  if (!session.plan || isTerminalPlan(session.plan)) return;

  const count = autoLoopCounts.get(session.id) || 0;
  if (count >= maxAutoLoopSteps) {
    setNotice(`Auto loop paused after ${maxAutoLoopSteps} steps. Review the screen, then press Next if needed.`);
    return;
  }

  autoLoopCounts.set(session.id, count + 1);
  setNotice(`Auto loop: checking screen for next step ${count + 1}/${maxAutoLoopSteps}.`);
  autoContinueTimer = window.setTimeout(() => {
    autoContinueTimer = null;
    if (stoppedSessionIds.has(session.id) || !els.autoExecute.checked || currentSession?.id !== session.id) return;
    nextStep({ forceScreen: true });
  }, 1200);
}

function isTerminalPlan(plan) {
  return plan.steps.some((step) => step.type === 'finished' || step.type === 'callUser');
}

function setState(state) {
  els.shell.dataset.state = state;
  els.orbState.textContent = state;
}

function setNotice(message) {
  els.notice.textContent = message;
}

function setError(err) {
  setState('error');
  setNotice(formatError(err));
}

function formatError(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String(err.message);
  return String(err);
}
