<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { MvpChecklistResponse, ReadinessResponse } from '@ablepath/shared';

import { getActivityStats, getHealth, getMvpChecklist, getProviderStatus, getReadiness } from '../api';

const health = ref('loading');
const stats = ref<{ total: number; lastActivityTime: string | null }>({ total: 0, lastActivityTime: null });
const providers = ref<Array<{ id: string; displayName: string; status: string }>>([]);
const readiness = ref<ReadinessResponse | null>(null);
const checklist = ref<MvpChecklistResponse | null>(null);

onMounted(async () => {
  const [healthResult, statsResult, providerResult, readinessResult, checklistResult] = await Promise.all([
    getHealth(),
    getActivityStats(),
    getProviderStatus(),
    getReadiness(),
    getMvpChecklist(),
  ]);
  health.value = healthResult.ok ? 'ready' : 'error';
  stats.value = statsResult;
  providers.value = providerResult.providers;
  readiness.value = readinessResult;
  checklist.value = checklistResult;
});
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Overview</p>
      <h2>本地状态</h2>
    </header>

    <div class="metrics">
      <div class="metric">
        <span>服务</span>
        <strong>{{ health }}</strong>
      </div>
      <div class="metric">
        <span>24 小时活动</span>
        <strong>{{ stats.total }}</strong>
      </div>
      <div class="metric">
        <span>最近活动</span>
        <strong>{{ stats.lastActivityTime ?? '暂无' }}</strong>
      </div>
    </div>

    <section class="panel">
      <h3>AI Provider</h3>
      <div class="provider-list">
        <div v-for="provider in providers" :key="provider.id" class="provider-row">
          <span>{{ provider.displayName }}</span>
          <strong>{{ provider.status }}</strong>
        </div>
      </div>
    </section>

    <section class="panel" v-if="readiness">
      <h3>MVP 就绪度</h3>
      <div class="readiness-summary">
        <span>Ready {{ readiness.totals.ready }}</span>
        <span>Limited {{ readiness.totals.limited }}</span>
        <span>Needs setup {{ readiness.totals['needs-setup'] }}</span>
      </div>
      <div class="readiness-list">
        <div v-for="item in readiness.items" :key="item.id" class="readiness-row">
          <span>{{ item.label }}</span>
          <strong :class="item.status">{{ item.status }}</strong>
          <small>{{ item.details }}</small>
          <small v-if="item.setupHints.length">{{ item.setupHints.join(' ') }}</small>
        </div>
      </div>
    </section>

    <section class="panel" v-if="checklist">
      <h3>MVP 主机验收</h3>
      <div class="readiness-summary">
        <span>Pass {{ checklist.totals.pass }}</span>
        <span>Warning {{ checklist.totals.warning }}</span>
        <span>Fail {{ checklist.totals.fail }}</span>
      </div>
      <div class="checklist-sections">
        <section v-for="section in checklist.sections" :key="section.id" class="checklist-section">
          <h4>{{ section.label }}</h4>
          <div class="readiness-list">
            <div v-for="item in section.items" :key="item.id" class="readiness-row checklist-row">
              <span>{{ item.label }}</span>
              <strong :class="item.status">{{ item.status }}</strong>
              <small>{{ item.details }}</small>
              <small>{{ item.nextStep }}</small>
              <small v-if="item.setupHints.length">{{ item.setupHints.join(' ') }}</small>
            </div>
          </div>
        </section>
      </div>
    </section>
  </section>
</template>
