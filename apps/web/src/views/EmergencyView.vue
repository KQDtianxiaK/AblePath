<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { EmergencyEvent, EmergencyStatusResponse } from '@ablepath/shared';

import {
  cancelEmergency,
  confirmEmergency,
  getEmergencyStatus,
  resolveEmergency,
  triggerEmergency,
} from '../api';

const status = ref<EmergencyStatusResponse | null>(null);
const current = ref<EmergencyEvent | null>(null);
const details = ref('需要帮助');
const busy = ref(false);
const error = ref('');

onMounted(load);

async function load(): Promise<void> {
  status.value = await getEmergencyStatus();
  current.value = status.value.current;
}

async function run(action: () => Promise<{ event: EmergencyEvent }>): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const response = await action();
    current.value = response.event;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Emergency</p>
      <h2>紧急安全</h2>
    </header>

    <section class="panel emergency-panel">
      <div class="emergency-state" :class="current?.state">
        <span>当前状态</span>
        <strong>{{ current?.state ?? 'loading' }}</strong>
        <small v-if="status?.countdownSec !== null">倒计时：{{ status?.countdownSec }} 秒</small>
      </div>

      <form class="control-form" @submit.prevent="run(() => triggerEmergency(details, false))">
        <textarea v-model="details" rows="2" :disabled="busy" />
        <div class="emergency-actions">
          <button type="submit" :disabled="busy">SOS</button>
          <button type="button" class="secondary" :disabled="busy" @click="run(() => triggerEmergency(details, true))">
            立即求助
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="busy || current?.state !== 'pending-confirmation'"
            @click="run(() => cancelEmergency('误触取消'))"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="busy || current?.state !== 'pending-confirmation'"
            @click="run(() => confirmEmergency('确认需要帮助'))"
          >
            确认
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="busy || current?.state !== 'active'"
            @click="run(() => resolveEmergency('已处理'))"
          >
            解除
          </button>
        </div>
      </form>

      <section v-if="status?.caregivers.length" class="caregiver-list">
        <h3>看护通知</h3>
        <div v-for="caregiver in status.caregivers" :key="caregiver.id" class="caregiver-row">
          <span>{{ caregiver.name }}</span>
          <strong>{{ caregiver.canReceiveEmergency ? '可接收' : '未授权' }}</strong>
          <small>{{ caregiver.hasWebhook ? 'webhook ready' : 'local only' }}</small>
        </div>
      </section>

      <section v-if="status?.recent.length" class="step-list">
        <h3>最近事件</h3>
        <div v-for="event in status.recent" :key="event.id" class="activity-row">
          <span>{{ event.state }}</span>
          <strong>{{ event.details }}</strong>
          <small>{{ event.timestamp }}</small>
        </div>
      </section>

      <p v-if="error" class="form-error">{{ error }}</p>
    </section>
  </section>
</template>
