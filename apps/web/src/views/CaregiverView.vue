<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { CaregiverSummaryResponse } from '@ablepath/shared';

import { getCaregiverSummaryWithToken } from '../api';
import {
  bootstrapCaregiverToken,
  clearSavedCaregiverToken,
  saveCaregiverToken,
} from '../caregiver-access';

const token = ref('');
const summary = ref<CaregiverSummaryResponse | null>(null);
const busy = ref(false);
const error = ref('');
const saved = ref(false);

onMounted(() => {
  const bootstrap = bootstrapCaregiverToken({
    hash: window.location.hash,
    pathname: window.location.pathname,
    title: document.title,
    storage: localStorage,
    history: window.history,
  });
  if (!bootstrap.token) return;

  token.value = bootstrap.token;
  saved.value = bootstrap.saved;
  if (bootstrap.fromFragment) {
    void loadSummary();
  }
});

async function loadSummary(): Promise<void> {
  const trimmed = token.value.trim();
  if (!trimmed) {
    error.value = '请输入看护者配对令牌';
    return;
  }

  busy.value = true;
  error.value = '';
  try {
    summary.value = await getCaregiverSummaryWithToken(trimmed);
  } catch (err) {
    summary.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function saveToken(): void {
  const trimmed = token.value.trim();
  if (!trimmed) {
    error.value = '请输入看护者配对令牌';
    return;
  }

  token.value = saveCaregiverToken(localStorage, trimmed);
  saved.value = true;
  error.value = '';
}

function clearToken(): void {
  clearSavedCaregiverToken(localStorage);
  token.value = '';
  summary.value = null;
  saved.value = false;
  error.value = '';
}
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Caregiver</p>
      <h2>看护摘要</h2>
    </header>

    <section class="panel caregiver-token-panel">
      <h3>令牌访问</h3>
      <form class="token-form" @submit.prevent="loadSummary">
        <label>
          Bearer token
          <input v-model="token" type="password" autocomplete="off" placeholder="输入配对令牌" />
        </label>
        <button type="submit" :disabled="busy || !token.trim()">
          {{ busy ? '加载中' : '加载摘要' }}
        </button>
        <button type="button" class="secondary" :disabled="!token.trim()" @click="saveToken">保存令牌</button>
        <button type="button" class="secondary" :disabled="!token && !summary" @click="clearToken">清除</button>
      </form>
      <p v-if="saved" class="form-note">令牌已保存在此浏览器。</p>
      <p v-if="error" class="form-error">{{ error }}</p>
    </section>

    <section v-if="summary" class="panel">
      <h3>{{ summary.caregiver.name }}</h3>
      <dl class="settings-list">
        <div>
          <dt>关系</dt>
          <dd>{{ summary.caregiver.relationship }}</dd>
        </div>
        <div>
          <dt>可见权限</dt>
          <dd>{{ summary.caregiver.permissions.join(', ') }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="summary?.emergency" class="panel emergency-panel">
      <h3>紧急状态</h3>
      <dl class="settings-list">
        <div>
          <dt>当前状态</dt>
          <dd>{{ summary.emergency.current.state }}</dd>
        </div>
        <div>
          <dt>最近事件</dt>
          <dd>{{ summary.emergency.recent.length }} 条</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>{{ summary.emergency.current.timestamp }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="summary?.activity" class="panel">
      <h3>活动概览</h3>
      <div class="metrics caregiver-metrics">
        <div class="metric">
          <span>24 小时活动</span>
          <strong>{{ summary.activity.stats.total }}</strong>
        </div>
        <div class="metric">
          <span>最近活动</span>
          <strong>{{ summary.activity.stats.lastActivityTime ?? '暂无' }}</strong>
        </div>
        <div class="metric">
          <span>活动类型</span>
          <strong>{{ Object.keys(summary.activity.stats.byType).length }}</strong>
        </div>
      </div>
      <div class="activity-row" v-for="entry in summary.activity.recent.slice(0, 8)" :key="entry.id">
        <small>{{ entry.timestamp }}</small>
        <strong>{{ entry.type }}</strong>
        <small>{{ entry.type }} · risk {{ entry.riskLevel ?? 'n/a' }}</small>
      </div>
    </section>

    <section v-if="summary?.screen" class="panel">
      <h3>屏幕状态</h3>
      <dl class="settings-list">
        <div>
          <dt>截屏能力</dt>
          <dd>{{ summary.screen.canCapture ? 'available' : 'unavailable' }}</dd>
        </div>
        <div>
          <dt>后端</dt>
          <dd>{{ summary.screen.backend ?? 'none' }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="summary?.tasks" class="panel">
      <h3>任务摘要</h3>
      <div v-if="summary.tasks.recent.length" class="summary-task-list">
        <div v-for="task in summary.tasks.recent" :key="task.id" class="summary-task-row caregiver-task-row">
          <span>{{ task.label }}</span>
          <strong>{{ task.status }}</strong>
          <small>
            risk {{ task.riskLevel ?? 'n/a' }} · ai {{ task.aiPlans }} · blocked {{ task.blockedActions }} · failed
            {{ task.failedActions }} · {{ task.updatedAt }}
          </small>
        </div>
      </div>
      <p v-else class="empty-state">暂无可见任务摘要。</p>
    </section>

    <section v-if="summary && !summary.emergency && !summary.activity && !summary.screen && !summary.tasks" class="panel">
      <p class="empty-state">此令牌当前没有可见摘要权限。</p>
    </section>
  </section>
</template>
