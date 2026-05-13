<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type {
  ActionPlan,
  ControlExecuteResponse,
  ScreenCaptureResponse,
  ScreenElement,
  ScreenStatusResponse,
} from '@ablepath/shared';

import {
  analyzeScreen,
  captureScreen,
  createControlPlanFromTarget,
  detectScreenTargets,
  errorMessage,
  executeControlPlan,
  getScreenStatus,
  isSetupRequiredError,
} from '../api';

const status = ref<ScreenStatusResponse | null>(null);
const capture = ref<ScreenCaptureResponse | null>(null);
const question = ref('Describe the current desktop screen and identify actionable controls.');
const analysis = ref('');
const elements = ref<ScreenElement[]>([]);
const plan = ref<ActionPlan | null>(null);
const result = ref<ControlExecuteResponse | null>(null);
const busy = ref(false);
const error = ref('');
const setupHints = ref<string[]>([]);

onMounted(async () => {
  status.value = await getScreenStatus();
});

async function captureOnly(): Promise<void> {
  busy.value = true;
  error.value = '';
  setupHints.value = [];
  analysis.value = '';
  elements.value = [];
  plan.value = null;
  result.value = null;
  try {
    capture.value = await captureScreen();
  } catch (err) {
    setError(err);
  } finally {
    busy.value = false;
  }
}

async function analyze(): Promise<void> {
  busy.value = true;
  error.value = '';
  setupHints.value = [];
  analysis.value = '';
  elements.value = [];
  plan.value = null;
  result.value = null;
  try {
    const response = await analyzeScreen(question.value);
    capture.value = response.capture;
    analysis.value = response.analysis.response;
  } catch (err) {
    setError(err);
  } finally {
    busy.value = false;
  }
}

async function detectTargets(): Promise<void> {
  busy.value = true;
  error.value = '';
  setupHints.value = [];
  analysis.value = '';
  elements.value = [];
  plan.value = null;
  result.value = null;
  try {
    const response = await detectScreenTargets(question.value);
    capture.value = response.capture ?? null;
    analysis.value = response.rawAnalysis;
    elements.value = response.elements;
  } catch (err) {
    setError(err);
  } finally {
    busy.value = false;
  }
}

async function planElement(element: ScreenElement): Promise<void> {
  busy.value = true;
  error.value = '';
  setupHints.value = [];
  result.value = null;
  try {
    plan.value = (await createControlPlanFromTarget({ element })).plan;
  } catch (err) {
    setError(err);
  } finally {
    busy.value = false;
  }
}

async function runPlan(dryRun: boolean): Promise<void> {
  if (!plan.value) return;
  busy.value = true;
  error.value = '';
  setupHints.value = [];
  try {
    result.value = await executeControlPlan(plan.value.id, { confirmed: true, dryRun });
  } catch (err) {
    setError(err);
  } finally {
    busy.value = false;
  }
}

function setError(err: unknown): void {
  error.value = errorMessage(err);
  setupHints.value = isSetupRequiredError(err) ? err.setupHints : [];
}
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Diagnostics</p>
      <h2>Screen Check</h2>
    </header>

    <section class="panel screen-panel">
      <div v-if="status" class="control-status">
        <span>Capture: {{ status.canCapture ? status.backend : 'unavailable' }}</span>
        <span v-if="status.setupHints.length">{{ status.setupHints[0] }}</span>
      </div>

      <form class="control-form" @submit.prevent="analyze">
        <textarea v-model="question" rows="3" :disabled="busy" />
        <div class="chat-actions">
          <button type="button" class="secondary" :disabled="busy" @click="captureOnly">Capture</button>
          <button type="button" class="secondary" :disabled="busy || !question.trim()" @click="detectTargets">
            Detect Targets
          </button>
          <button type="submit" :disabled="busy || !question.trim()">
            {{ busy ? 'Analyzing' : 'Analyze Screen' }}
          </button>
        </div>
      </form>

      <img
        v-if="capture?.imageBase64"
        class="screen-preview"
        :src="`data:${capture.mimeType};base64,${capture.imageBase64}`"
        alt="screen capture"
      />

      <article v-if="analysis" class="plan-box">
        <strong>Analysis</strong>
        <p>{{ analysis }}</p>
      </article>

      <article v-if="elements.length" class="plan-box">
        <strong>Targets</strong>
        <div class="step-list">
          <div v-for="element in elements" :key="element.id" class="target-row">
            <span>{{ element.role }}</span>
            <strong>{{ element.label }}</strong>
            <small>{{ element.bounds.x }}, {{ element.bounds.y }} · {{ element.confidence }}</small>
            <button type="button" class="secondary" :disabled="busy || !element.actionable" @click="planElement(element)">
              Plan Click
            </button>
          </div>
        </div>
      </article>

      <article v-if="plan" class="plan-box">
        <div class="plan-heading">
          <strong>{{ plan.riskLevel }}</strong>
          <span>{{ plan.requiresConfirmation ? 'needs confirmation' : 'no confirmation' }}</span>
        </div>
        <p>{{ plan.explanation }}</p>
        <div class="chat-actions">
          <button type="button" class="secondary" :disabled="busy" @click="runPlan(true)">Dry-run</button>
          <button type="button" :disabled="busy" @click="runPlan(false)">Confirm Run</button>
        </div>
      </article>

      <article v-if="result" class="result-box">
        <strong>{{ result.dryRun ? 'Dry-run complete' : 'Execution complete' }}</strong>
        <span>{{ result.results.filter((item) => item.ok).length }} / {{ result.results.length }}</span>
      </article>

      <p v-if="error" class="form-error">{{ error }}</p>
      <ul v-if="setupHints.length" class="setup-hints">
        <li v-for="hint in setupHints" :key="hint">{{ hint }}</li>
      </ul>
    </section>
  </section>
</template>
