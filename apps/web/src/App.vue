<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import DashboardView from './views/DashboardView.vue';
import ChatView from './views/ChatView.vue';
import ControlView from './views/ControlView.vue';
import TasksView from './views/TasksView.vue';
import ScreenView from './views/ScreenView.vue';
import ActivityView from './views/ActivityView.vue';
import EmergencyView from './views/EmergencyView.vue';
import SettingsView from './views/SettingsView.vue';
import CaregiverView from './views/CaregiverView.vue';
import {
  buildEventWebSocketUrl,
  initialViewForPath,
  isCaregiverPublicPath,
  shouldConnectOwnerEventStream,
  type ViewKey,
} from './app-routing';

const isCaregiverRoute = isCaregiverPublicPath(window.location.pathname);
const currentView = ref<ViewKey>(initialViewForPath(window.location.pathname));
const eventState = ref('connecting');

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: 'dashboard', label: 'Status' },
  { key: 'chat', label: 'Agent' },
  { key: 'control', label: 'Control Diag' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'screen', label: 'Screen Diag' },
  { key: 'activity', label: 'Activity' },
  { key: 'emergency', label: 'SOS' },
  { key: 'caregiver', label: 'Caregiver' },
  { key: 'settings', label: 'Settings' },
];

const activeComponent = computed(() => {
  return {
    dashboard: DashboardView,
    chat: ChatView,
    control: ControlView,
    tasks: TasksView,
    screen: ScreenView,
    activity: ActivityView,
    emergency: EmergencyView,
    caregiver: CaregiverView,
    settings: SettingsView,
  }[currentView.value];
});

onMounted(() => {
  if (!shouldConnectOwnerEventStream(window.location.pathname)) {
    eventState.value = 'caregiver';
    return;
  }

  const ws = new WebSocket(buildEventWebSocketUrl(window.location.protocol, window.location.host));
  ws.addEventListener('open', () => {
    eventState.value = 'connected';
  });
  ws.addEventListener('close', () => {
    eventState.value = 'disconnected';
  });
  ws.addEventListener('error', () => {
    eventState.value = 'error';
  });
});
</script>

<template>
  <main v-if="isCaregiverRoute" class="caregiver-public-shell">
    <div class="caregiver-public-brand">
      <div class="brand-mark">A</div>
      <div>
        <h1>AblePath</h1>
        <p>Caregiver summary</p>
      </div>
    </div>
    <CaregiverView />
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">A</div>
        <div>
          <h1>AblePath</h1>
          <p>AI desktop assistant</p>
        </div>
      </div>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          :class="{ active: currentView === item.key }"
          @click="currentView = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="connection" :class="eventState">
        Events: {{ eventState }}
      </div>
    </aside>

    <main class="content">
      <component :is="activeComponent" />
    </main>
  </div>
</template>
