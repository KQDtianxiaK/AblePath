<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ActivityLogEntry } from '@ablepath/shared';

import { getRecentActivity } from '../api';

const entries = ref<ActivityLogEntry[]>([]);

onMounted(async () => {
  entries.value = (await getRecentActivity()).entries;
});
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Activity</p>
      <h2>活动记录</h2>
    </header>

    <section class="panel">
      <div v-if="entries.length === 0" class="empty-state">暂无活动记录</div>
      <div v-for="entry in entries" :key="entry.id" class="activity-row">
        <span>{{ entry.type }}</span>
        <strong>{{ entry.summary }}</strong>
        <small>{{ entry.timestamp }}</small>
      </div>
    </section>
  </section>
</template>
