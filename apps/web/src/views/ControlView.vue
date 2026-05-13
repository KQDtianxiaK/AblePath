<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ActionPlan, ControlExecuteResponse, ControlStatusResponse } from '@ablepath/shared';

import { createControlPlan, executeControlPlan, getControlStatus } from '../api';

const intent = ref('');
const status = ref<ControlStatusResponse | null>(null);
const plan = ref<ActionPlan | null>(null);
const result = ref<ControlExecuteResponse | null>(null);
const busy = ref(false);
const error = ref('');

onMounted(async () => {
  status.value = await getControlStatus();
});

async function planIntent(): Promise<void> {
  const text = intent.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  error.value = '';
  result.value = null;
  try {
    plan.value = (await createControlPlan(text)).plan;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function runPlan(dryRun: boolean): Promise<void> {
  if (!plan.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    result.value = await executeControlPlan(plan.value.id, {
      confirmed: true,
      dryRun,
    });
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
      <p class="eyebrow">Diagnostics</p>
      <h2>Rule Control Check</h2>
    </header>

    <section class="panel control-panel">
      <div v-if="status" class="control-status">
        <span>Executor: {{ status.canExecute ? 'available' : 'limited' }}</span>
        <span>URL: {{ status.capabilities.openUrl ? 'ready' : 'unavailable' }}</span>
        <span>Desktop: {{ status.capabilities.click ? 'ready' : 'limited' }}</span>
      </div>

      <form class="control-form" @submit.prevent="planIntent">
        <textarea
          v-model="intent"
          rows="3"
          placeholder="Diagnostic examples: open example.com, type hello, press ctrl+l, click 500, 300"
          :disabled="busy"
        />
        <button type="submit" :disabled="busy || !intent.trim()">
          {{ busy ? 'Planning' : 'Generate Rule Plan' }}
        </button>
      </form>

      <article v-if="plan" class="plan-box">
        <div class="plan-heading">
          <strong>{{ plan.riskLevel }}</strong>
          <span>{{ plan.requiresConfirmation ? 'needs confirmation' : 'no confirmation' }}</span>
        </div>
        <p>{{ plan.explanation }}</p>
        <div v-if="plan.steps.length" class="step-list">
          <div v-for="step in plan.steps" :key="step.id" class="step-row">
            <span>{{ step.type }}</span>
            <strong>{{ step.description }}</strong>
          </div>
        </div>
        <div class="chat-actions">
          <button type="button" class="secondary" :disabled="busy" @click="runPlan(true)">Dry-run</button>
          <button type="button" :disabled="busy || plan.steps.length === 0" @click="runPlan(false)">
            Confirm Run
          </button>
        </div>
      </article>

      <article v-if="result" class="result-box">
        <strong>{{ result.dryRun ? 'Dry-run complete' : 'Execution complete' }}</strong>
        <span>{{ result.results.filter((item) => item.ok).length }} / {{ result.results.length }}</span>
      </article>

      <p v-if="error" class="form-error">{{ error }}</p>
    </section>
  </section>
</template>
