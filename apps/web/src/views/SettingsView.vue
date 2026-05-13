<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type {
  AblePathConfig,
  CaregiverPermission,
  CaregiverProfile,
  CaregiverSummaryResponse,
  InactivityStatusResponse,
  VoiceStatusResponse,
} from '@ablepath/shared';

import {
  checkInactivity,
  generateCaregiverToken,
  getCaregivers,
  getCaregiverSummary,
  getConfig,
  getInactivityStatus,
  getVoiceStatus,
  removeCaregiver,
  revokeCaregiverToken,
  updateSafetySettings,
  upsertCaregiver,
} from '../api';
import {
  buildCaregiverPairingLink,
  copyCaregiverPairingLink,
  normalizeCaregiverTokenDays,
} from '../caregiver-access';

const config = ref<AblePathConfig | null>(null);
const voice = ref<VoiceStatusResponse | null>(null);
const inactivity = ref<InactivityStatusResponse | null>(null);
const caregivers = ref<CaregiverProfile[]>([]);
const caregiverName = ref('');
const caregiverRelationship = ref('family');
const caregiverWebhook = ref('');
const caregiverPermissions = ref<CaregiverPermission[]>(['receive-emergency', 'view-activity', 'view-task-summary']);
const editingCaregiverId = ref<string | null>(null);
const caregiverTokenDays = ref(30);
const inactivityMinutes = ref(30);
const emergencyCountdownSec = ref(30);
const caregiverSummary = ref<CaregiverSummaryResponse | null>(null);
const generatedToken = ref<{ caregiverId: string; token: string; createdAt: string; expiresAt: string } | null>(null);
const generatedTokenDays = ref<number | null>(null);
const settingsError = ref('');
const linkCopyStatus = ref('');

onMounted(async () => {
  const [configResult, voiceResult, inactivityResult, caregiverResult] = await Promise.all([
    getConfig(),
    getVoiceStatus(),
    getInactivityStatus(),
    getCaregivers(),
  ]);
  config.value = configResult;
  voice.value = voiceResult;
  inactivity.value = inactivityResult;
  caregivers.value = caregiverResult.caregivers;
  inactivityMinutes.value = Math.round(configResult.safety.inactivityTimeoutMs / 60000);
  emergencyCountdownSec.value = configResult.safety.emergencyConfirmationTimeoutSec;
});

async function saveCaregiver(): Promise<void> {
  settingsError.value = '';
  try {
    const response = await upsertCaregiver({
      name: caregiverName.value,
      relationship: caregiverRelationship.value,
      notificationWebhook: caregiverWebhook.value || undefined,
      permissions: caregiverPermissions.value,
      id: editingCaregiverId.value ?? undefined,
    });
    caregivers.value = response.caregivers;
    resetCaregiverForm();
  } catch (err) {
    settingsError.value = err instanceof Error ? err.message : String(err);
  }
}

async function deleteCaregiver(id: string): Promise<void> {
  const response = await removeCaregiver({ id });
  caregivers.value = response.caregivers;
  if (caregiverSummary.value?.caregiver.id === id) caregiverSummary.value = null;
  if (generatedToken.value?.caregiverId === id) {
    generatedToken.value = null;
    generatedTokenDays.value = null;
  }
  if (editingCaregiverId.value === id) resetCaregiverForm();
}

async function createToken(id: string): Promise<void> {
  settingsError.value = '';
  linkCopyStatus.value = '';
  try {
    const expiresInDays = normalizeCaregiverTokenDays(caregiverTokenDays.value);
    caregiverTokenDays.value = expiresInDays;
    generatedToken.value = await generateCaregiverToken(id, expiresInDays);
    generatedTokenDays.value = expiresInDays;
    const response = await getCaregivers();
    caregivers.value = response.caregivers;
  } catch (err) {
    settingsError.value = err instanceof Error ? err.message : String(err);
  }
}

async function revokeToken(id: string): Promise<void> {
  settingsError.value = '';
  linkCopyStatus.value = '';
  try {
    const response = await revokeCaregiverToken(id);
    caregivers.value = response.caregivers;
    if (generatedToken.value?.caregiverId === id) {
      generatedToken.value = null;
      generatedTokenDays.value = null;
    }
  } catch (err) {
    settingsError.value = err instanceof Error ? err.message : String(err);
  }
}

function editCaregiver(caregiver: CaregiverProfile): void {
  editingCaregiverId.value = caregiver.id;
  caregiverName.value = caregiver.name;
  caregiverRelationship.value = caregiver.relationship;
  caregiverWebhook.value = caregiver.notificationWebhook ?? '';
  caregiverPermissions.value = [...caregiver.permissions];
}

function resetCaregiverForm(): void {
  editingCaregiverId.value = null;
  caregiverName.value = '';
  caregiverRelationship.value = 'family';
  caregiverWebhook.value = '';
  caregiverPermissions.value = ['receive-emergency', 'view-activity', 'view-task-summary'];
}

function setTokenDays(days: number): void {
  caregiverTokenDays.value = normalizeCaregiverTokenDays(days);
}

function caregiverPairingLink(token: string): string {
  return buildCaregiverPairingLink(window.location.origin, token);
}

async function copyCaregiverLink(token: string): Promise<void> {
  settingsError.value = '';
  linkCopyStatus.value = '';
  const link = caregiverPairingLink(token);
  const result = await copyCaregiverPairingLink(navigator.clipboard, link);
  linkCopyStatus.value = result.message ?? '';
  settingsError.value = result.error ?? '';
}

function togglePermission(permission: CaregiverPermission): void {
  caregiverPermissions.value = caregiverPermissions.value.includes(permission)
    ? caregiverPermissions.value.filter((item) => item !== permission)
    : [...caregiverPermissions.value, permission];
}

async function refreshInactivity(): Promise<void> {
  inactivity.value = await checkInactivity();
}

async function saveSafety(): Promise<void> {
  settingsError.value = '';
  try {
    const response = await updateSafetySettings({
      inactivityTimeoutMs: Math.max(0, Math.round(inactivityMinutes.value)) * 60 * 1000,
      emergencyConfirmationTimeoutSec: Math.round(emergencyCountdownSec.value),
    });
    if (config.value) config.value.safety = response.safety;
    inactivity.value = await getInactivityStatus();
  } catch (err) {
    settingsError.value = err instanceof Error ? err.message : String(err);
  }
}

async function showCaregiverSummary(id: string): Promise<void> {
  caregiverSummary.value = await getCaregiverSummary(id);
}
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Settings</p>
      <h2>设置</h2>
    </header>

    <section class="panel" v-if="config">
      <h3>{{ config.productName }}</h3>
      <dl class="settings-list">
        <div>
          <dt>语言</dt>
          <dd>{{ config.locale }}</dd>
        </div>
        <div>
          <dt>用户能力档案</dt>
          <dd>{{ config.profile.motorCapability }}</dd>
        </div>
        <div>
          <dt>默认对话 Provider</dt>
          <dd>{{ config.providers.defaultChat }}</dd>
        </div>
      </dl>
    </section>

    <section class="panel" v-if="voice">
      <h3>语音</h3>
      <dl class="settings-list">
        <div>
          <dt>录音</dt>
          <dd>{{ voice.audio.canRecord ? voice.audio.backend : 'unavailable' }}</dd>
        </div>
        <div>
          <dt>朗读</dt>
          <dd>{{ voice.tts.canSpeak ? voice.tts.engine : 'unavailable' }}</dd>
        </div>
        <div>
          <dt>实时语音</dt>
          <dd>{{ voice.realtime.canStart ? 'ready' : 'needs setup' }}</dd>
        </div>
      </dl>
      <ul v-if="voice.realtime.setupHints.length" class="setup-hints">
        <li v-for="hint in voice.realtime.setupHints" :key="hint">{{ hint }}</li>
      </ul>
    </section>

    <section class="panel" v-if="inactivity">
      <h3>不活动监测</h3>
      <dl class="settings-list">
        <div>
          <dt>状态</dt>
          <dd>{{ inactivity.enabled ? 'enabled' : 'disabled' }}</dd>
        </div>
        <div>
          <dt>阈值</dt>
          <dd>{{ Math.round(inactivity.timeoutMs / 60000) }} 分钟</dd>
        </div>
        <div>
          <dt>当前静默</dt>
          <dd>{{ Math.round(inactivity.inactiveMs / 1000) }} 秒</dd>
        </div>
        <div>
          <dt>紧急状态</dt>
          <dd>{{ inactivity.emergencyState }}</dd>
        </div>
      </dl>
      <div class="chat-actions settings-actions">
        <button type="button" class="secondary" @click="refreshInactivity">检查</button>
      </div>
      <form class="safety-form" @submit.prevent="saveSafety">
        <label>
          不活动阈值（分钟）
          <input v-model.number="inactivityMinutes" type="number" min="0" max="1440" />
        </label>
        <label>
          SOS 确认倒计时（秒）
          <input v-model.number="emergencyCountdownSec" type="number" min="5" max="300" />
        </label>
        <button type="submit">保存安全设置</button>
      </form>
    </section>

    <section class="panel">
      <h3>看护者</h3>
      <form class="caregiver-form" @submit.prevent="saveCaregiver">
        <input v-model="caregiverName" placeholder="姓名" />
        <input v-model="caregiverRelationship" placeholder="关系" />
        <input v-model="caregiverWebhook" placeholder="通知 webhook，可留空" />
        <div class="permission-grid">
          <label>
            <input
              type="checkbox"
              :checked="caregiverPermissions.includes('receive-emergency')"
              @change="togglePermission('receive-emergency')"
            />
            SOS
          </label>
          <label>
            <input
              type="checkbox"
              :checked="caregiverPermissions.includes('view-activity')"
              @change="togglePermission('view-activity')"
            />
            活动
          </label>
          <label>
            <input
              type="checkbox"
              :checked="caregiverPermissions.includes('view-screen')"
              @change="togglePermission('view-screen')"
            />
            屏幕状态
          </label>
          <label>
            <input
              type="checkbox"
              :checked="caregiverPermissions.includes('view-task-summary')"
              @change="togglePermission('view-task-summary')"
            />
            任务摘要
          </label>
        </div>
        <button type="submit" :disabled="!caregiverName.trim()">
          {{ editingCaregiverId ? '更新' : '保存' }}
        </button>
        <button v-if="editingCaregiverId" type="button" class="secondary" @click="resetCaregiverForm">取消</button>
      </form>
      <div class="caregiver-list">
        <div v-for="caregiver in caregivers" :key="caregiver.id" class="caregiver-row">
          <span>{{ caregiver.name }}</span>
          <strong>{{ caregiver.relationship }}</strong>
          <small>{{ caregiver.permissions.join(', ') }}</small>
          <small>{{ caregiver.accessTokenExpiresAt ? `token until ${caregiver.accessTokenExpiresAt}` : 'no token' }}</small>
          <button type="button" class="secondary" @click="editCaregiver(caregiver)">编辑</button>
          <button type="button" class="secondary" @click="showCaregiverSummary(caregiver.id)">摘要</button>
          <button type="button" class="secondary" @click="createToken(caregiver.id)">配对令牌</button>
          <button type="button" class="secondary" :disabled="!caregiver.accessTokenCreatedAt" @click="revokeToken(caregiver.id)">
            撤销令牌
          </button>
          <button type="button" class="secondary" @click="deleteCaregiver(caregiver.id)">移除</button>
        </div>
      </div>
      <div class="token-expiry-control">
        <span>配对链接有效期</span>
        <div class="token-expiry-buttons">
          <button type="button" :class="{ active: caregiverTokenDays === 1 }" @click="setTokenDays(1)">1 天</button>
          <button type="button" :class="{ active: caregiverTokenDays === 7 }" @click="setTokenDays(7)">7 天</button>
          <button type="button" :class="{ active: caregiverTokenDays === 30 }" @click="setTokenDays(30)">30 天</button>
          <button type="button" :class="{ active: caregiverTokenDays === 90 }" @click="setTokenDays(90)">90 天</button>
        </div>
        <label>
          自定义天数
          <input v-model.number="caregiverTokenDays" type="number" min="1" max="365" />
        </label>
      </div>
      <article v-if="generatedToken" class="plan-box">
        <strong>一次性配对令牌</strong>
        <p>{{ generatedToken.token }}</p>
        <label class="pairing-link">
          看护链接
          <input :value="caregiverPairingLink(generatedToken.token)" readonly />
        </label>
        <button type="button" class="secondary" @click="copyCaregiverLink(generatedToken.token)">复制看护链接</button>
        <small v-if="linkCopyStatus">{{ linkCopyStatus }}</small>
        <small v-if="generatedTokenDays">生成时有效期：{{ generatedTokenDays }} 天</small>
        <small>创建时间：{{ generatedToken.createdAt }}</small>
        <small>过期时间：{{ generatedToken.expiresAt }}</small>
      </article>
      <article v-if="caregiverSummary" class="plan-box">
        <strong>{{ caregiverSummary.caregiver.name }} 的可见摘要</strong>
        <p v-if="caregiverSummary.emergency">紧急状态：{{ caregiverSummary.emergency.current.state }}</p>
        <p v-if="caregiverSummary.activity">
          24 小时活动：{{ caregiverSummary.activity.stats.total }}，最近：{{ caregiverSummary.activity.stats.lastActivityTime ?? '暂无' }}
        </p>
        <p v-if="caregiverSummary.screen">
          屏幕权限：{{ caregiverSummary.screen.canCapture ? caregiverSummary.screen.backend : 'unavailable' }}
        </p>
        <p v-if="caregiverSummary.tasks">
          任务摘要：{{ caregiverSummary.tasks.recent.length }} 条，最近状态：{{ caregiverSummary.tasks.recent[0]?.status ?? '暂无' }}
        </p>
        <div v-if="caregiverSummary.tasks?.recent.length" class="summary-task-list">
          <div v-for="task in caregiverSummary.tasks.recent.slice(0, 5)" :key="task.id" class="summary-task-row">
            <span>{{ task.label }}</span>
            <strong>{{ task.status }}</strong>
            <small>risk {{ task.riskLevel ?? 'n/a' }} · ai {{ task.aiPlans }} · blocked {{ task.blockedActions }}</small>
          </div>
        </div>
      </article>
      <p v-if="settingsError" class="form-error">{{ settingsError }}</p>
    </section>
  </section>
</template>
