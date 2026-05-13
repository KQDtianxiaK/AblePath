<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { AgentSession } from '@ablepath/shared';

import {
  confirmAgentPlan,
  createAgentCommand,
  errorMessage,
  getAudioDevices,
  getRecentAgentSessions,
  isSetupRequiredError,
  listen,
  speak,
  stepAgentSession,
  stopAgentSession,
} from '../api';

const command = ref('');
const followUp = ref('');
const includeScreen = ref(true);
const busy = ref(false);
const listening = ref(false);
const error = ref('');
const audioStatus = ref('checking');
const setupHints = ref<string[]>([]);
const session = ref<AgentSession | null>(null);
const recent = ref<AgentSession[]>([]);
let eventsWs: WebSocket | null = null;

const canExecute = computed(() => Boolean(session.value?.plan && session.value.status !== 'executing'));

onMounted(() => {
  refreshRecent();
  getAudioDevices()
    .then((result) => {
      audioStatus.value = result.status.canRecord ? `ready (${result.status.backend})` : 'no recorder';
    })
    .catch(() => {
      audioStatus.value = 'unavailable';
    });

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  eventsWs = new WebSocket(`${protocol}//${window.location.host}/ws/events`);
  eventsWs.addEventListener('message', handleEvent);
});

onUnmounted(() => {
  eventsWs?.close();
  eventsWs = null;
});

async function refreshRecent(): Promise<void> {
  try {
    recent.value = (await getRecentAgentSessions()).sessions;
  } catch {
    recent.value = [];
  }
}

async function generatePlan(): Promise<void> {
  const text = command.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  error.value = '';
  setupHints.value = [];
  try {
    session.value = (await createAgentCommand({ command: text, includeScreen: includeScreen.value })).session;
    await refreshRecent();
  } catch (err) {
    showError(err);
  } finally {
    busy.value = false;
  }
}

async function continueStep(): Promise<void> {
  if (!session.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    session.value = (await stepAgentSession({
      sessionId: session.value.id,
      instruction: followUp.value.trim() || undefined,
      includeScreen: includeScreen.value,
    })).session;
    followUp.value = '';
    await refreshRecent();
  } catch (err) {
    showError(err);
  } finally {
    busy.value = false;
  }
}

async function dryRun(): Promise<void> {
  await executeCurrent(true);
}

async function confirmAndRun(): Promise<void> {
  await executeCurrent(false);
}

async function executeCurrent(dryRun: boolean): Promise<void> {
  if (!session.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    session.value = (await confirmAgentPlan({
      sessionId: session.value.id,
      confirmed: !dryRun,
      dryRun,
    })).session;
    await refreshRecent();
  } catch (err) {
    showError(err);
  } finally {
    busy.value = false;
  }
}

async function stopCurrent(): Promise<void> {
  if (!session.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    session.value = (await stopAgentSession({ sessionId: session.value.id, reason: 'Stopped from Agent Console.' })).session;
    await refreshRecent();
  } catch (err) {
    showError(err);
  } finally {
    busy.value = false;
  }
}

async function listenOnce(): Promise<void> {
  if (busy.value || listening.value) return;
  listening.value = true;
  error.value = '';
  setupHints.value = [];
  try {
    const response = await listen(5);
    command.value = response.text;
  } catch (err) {
    showError(err);
  } finally {
    listening.value = false;
  }
}

async function speakPlan(): Promise<void> {
  const text = session.value?.plan?.explanation || session.value?.error;
  if (text) await speak(text);
}

function selectSession(item: AgentSession): void {
  session.value = item;
  command.value = item.command;
}

function handleEvent(event: MessageEvent<string>): void {
  let payload: { type?: string; session?: AgentSession };
  try {
    payload = JSON.parse(event.data) as { type?: string; session?: AgentSession };
  } catch {
    return;
  }
  if (payload.type === 'agent.session.changed' && payload.session) {
    if (!session.value || payload.session.id === session.value.id) session.value = payload.session;
    refreshRecent();
  }
}

function showError(err: unknown): void {
  error.value = errorMessage(err);
  setupHints.value = isSetupRequiredError(err) ? err.setupHints : [];
}
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Agent Console</p>
      <h2>AI 控制台</h2>
    </header>

    <section class="panel chat-panel">
      <div class="voice-toolbar">
        <span>音频：{{ audioStatus }}</span>
        <button type="button" class="secondary" :disabled="busy || listening" @click="listenOnce">
          {{ listening ? '聆听中' : '录音 5 秒' }}
        </button>
        <button type="button" class="secondary" :disabled="!session?.plan" @click="speakPlan">朗读计划</button>
      </div>

      <form class="chat-form" @submit.prevent="generatePlan">
        <textarea
          v-model="command"
          rows="3"
          placeholder="例如：打开 Chrome，访问 www.baidu.com，并搜索 1+1"
          :disabled="busy"
          @keydown.enter.exact.prevent="generatePlan"
        />
        <label class="confirm-line">
          <input v-model="includeScreen" type="checkbox" :disabled="busy" />
          生成计划时读取当前桌面截图
        </label>
        <div class="chat-actions">
          <button type="submit" :disabled="busy || !command.trim()">
            {{ busy ? '处理中' : '生成计划' }}
          </button>
        </div>
      </form>

      <section v-if="session" class="plan-box">
        <div class="plan-heading">
          <strong>{{ session.status }}</strong>
          <span v-if="session.plan">风险：{{ session.plan.riskLevel }}</span>
          <span v-if="session.plan?.requiresConfirmation">需要确认</span>
        </div>
        <p>{{ session.plan?.explanation || session.error || '等待 Agent 生成计划。' }}</p>

        <div v-if="session.plan" class="step-list">
          <article v-for="step in session.plan.steps" :key="step.id" class="step-row">
            <strong>{{ step.type }}</strong>
            <span>{{ step.description }} {{ JSON.stringify(step.params) }}</span>
          </article>
        </div>

        <div v-if="session.preview?.warnings.length" class="safety-review">
          <div class="review-heading">
            <strong>安全提示</strong>
            <span>{{ session.preview.safetyReview.riskReasons.join(' ') }}</span>
          </div>
          <div class="review-list">
            <p v-for="warning in session.preview.warnings" :key="warning">{{ warning }}</p>
          </div>
        </div>

        <form class="chat-form" @submit.prevent="continueStep">
          <textarea
            v-model="followUp"
            rows="2"
            placeholder="输入网页里的下一步操作，例如：点击登录、在搜索框输入内容、向下滚动"
            :disabled="busy"
          />
          <div class="chat-actions">
            <button type="button" class="secondary" :disabled="busy || !canExecute" @click="dryRun">Dry-run</button>
            <button type="button" :disabled="busy || !canExecute" @click="confirmAndRun">确认执行</button>
            <button type="submit" class="secondary" :disabled="busy || !session">生成下一步</button>
            <button type="button" class="secondary" :disabled="busy || !session" @click="stopCurrent">停止</button>
          </div>
        </form>

        <div v-if="session.execution" class="result-box">
          <strong>{{ session.execution.dryRun ? 'Dry-run 完成' : '执行完成' }}</strong>
          <span>{{ session.execution.results.filter((item) => item.ok).length }}/{{ session.execution.results.length }} 成功</span>
        </div>
      </section>

      <section v-if="recent.length" class="task-list">
        <button
          v-for="item in recent"
          :key="item.id"
          type="button"
          class="task-row"
          :class="{ active: item.id === session?.id }"
          @click="selectSession(item)"
        >
          <span>{{ item.command }}</span>
          <strong class="task-status" :class="item.status">{{ item.status }}</strong>
          <small>{{ new Date(item.updatedAt).toLocaleString() }}</small>
        </button>
      </section>

      <p v-if="error" class="form-error">{{ error }}</p>
      <ul v-if="setupHints.length" class="setup-hints">
        <li v-for="hint in setupHints" :key="hint">{{ hint }}</li>
      </ul>
    </section>
  </section>
</template>
