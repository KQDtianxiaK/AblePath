<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AiPlanSafetyReview, ScreenStatusResponse, TaskAuditResponse, TaskSession } from '@ablepath/shared';

import {
  advanceTask,
  advanceTaskFromScreen,
  cancelTask,
  executeTask,
  getRecentTasks,
  getScreenStatus,
  getTaskAudit,
  planTaskWithAi,
  startTask,
} from '../api';

const goal = ref('');
const nextInstruction = ref('');
const screenContext = ref('');
const screenStatus = ref<ScreenStatusResponse | null>(null);
const currentTask = ref<TaskSession | null>(null);
const recentTasks = ref<TaskSession[]>([]);
const confirmed = ref(false);
const busy = ref(false);
const error = ref('');
const aiPlanMessage = ref('');
const aiSafetyReview = ref<AiPlanSafetyReview | null>(null);
const audit = ref<TaskAuditResponse | null>(null);

onMounted(async () => {
  const [tasksResult, screenResult] = await Promise.allSettled([
    refreshTasks(),
    getScreenStatus(),
  ]);
  if (screenResult.status === 'fulfilled') screenStatus.value = screenResult.value;
  if (tasksResult.status === 'rejected') error.value = tasksResult.reason instanceof Error ? tasksResult.reason.message : String(tasksResult.reason);
});

async function refreshTasks(): Promise<void> {
  recentTasks.value = (await getRecentTasks()).tasks;
  if (!currentTask.value && recentTasks.value.length > 0) {
    currentTask.value = recentTasks.value[0];
  }
}

async function startGoal(): Promise<void> {
  const text = goal.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  error.value = '';
  aiPlanMessage.value = '';
  aiSafetyReview.value = null;
  audit.value = null;
  confirmed.value = false;
  try {
    const response = await startTask(text);
    currentTask.value = response.task;
    goal.value = '';
    await refreshTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function loadAudit(): Promise<void> {
  if (!currentTask.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    audit.value = await getTaskAudit(currentTask.value.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function advanceCurrentTask(): Promise<void> {
  if (!currentTask.value || busy.value) return;
  const instruction = nextInstruction.value.trim();
  const context = screenContext.value.trim();
  if (!instruction && !context) return;
  busy.value = true;
  error.value = '';
  confirmed.value = false;
  try {
    const response = await advanceTask({
      taskId: currentTask.value.id,
      instruction: instruction || undefined,
      screenContext: context || undefined,
    });
    currentTask.value = response.task;
    nextInstruction.value = '';
    screenContext.value = '';
    await refreshTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function advanceFromScreen(): Promise<void> {
  if (!currentTask.value || busy.value) return;
  busy.value = true;
  error.value = '';
  confirmed.value = false;
  try {
    const response = await advanceTaskFromScreen({
      taskId: currentTask.value.id,
      instruction: nextInstruction.value.trim() || undefined,
    });
    currentTask.value = response.task;
    screenContext.value = response.analysis.response;
    nextInstruction.value = '';
    await refreshTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function planWithAi(): Promise<void> {
  if (!currentTask.value || busy.value) return;
  busy.value = true;
  error.value = '';
  aiPlanMessage.value = '';
  confirmed.value = false;
  try {
    const response = await planTaskWithAi({
      taskId: currentTask.value.id,
      instruction: nextInstruction.value.trim() || undefined,
      screenContext: screenContext.value.trim() || undefined,
    });
    currentTask.value = response.task;
    nextInstruction.value = '';
    aiPlanMessage.value = response.warnings.length
      ? `AI 计划已生成，${response.warnings.length} 个警告。`
      : `AI 计划已生成：${response.provider}`;
    aiSafetyReview.value = response.safetyReview;
    await refreshTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function runTask(dryRun: boolean): Promise<void> {
  if (!currentTask.value || busy.value) return;
  if (!dryRun && currentTask.value.plan?.requiresConfirmation && !confirmed.value) {
    error.value = '该任务需要先确认，再执行。';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const response = await executeTask(currentTask.value.id, {
      confirmed: dryRun ? true : confirmed.value || !currentTask.value.plan?.requiresConfirmation,
      dryRun,
    });
    currentTask.value = response.task;
    await refreshTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function stopTask(): Promise<void> {
  if (!currentTask.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await cancelTask({
      taskId: currentTask.value.id,
      reason: 'User cancelled from task view',
    });
    currentTask.value = response.task;
    await refreshTasks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function selectTask(task: TaskSession): void {
  currentTask.value = task;
  confirmed.value = false;
  error.value = '';
  aiPlanMessage.value = '';
  aiSafetyReview.value = null;
  audit.value = null;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <section class="view">
    <header>
      <p class="eyebrow">Tasks</p>
      <h2>任务会话</h2>
    </header>

    <section class="panel task-panel">
      <form class="control-form" @submit.prevent="startGoal">
        <textarea
          v-model="goal"
          rows="3"
          placeholder="例如：打开邮件、找到最新通知、进入在线文档并准备输入"
          :disabled="busy"
        />
        <button type="submit" :disabled="busy || !goal.trim()">
          {{ busy ? '处理中' : '开始任务' }}
        </button>
      </form>

      <article v-if="currentTask" class="task-session">
        <div class="task-heading">
          <div>
            <strong>{{ currentTask.goal }}</strong>
            <small>{{ formatTime(currentTask.updatedAt) }}</small>
          </div>
          <span class="task-status" :class="currentTask.status">{{ currentTask.status }}</span>
        </div>

        <form class="task-advance-form" @submit.prevent="advanceCurrentTask">
          <textarea
            v-model="nextInstruction"
            rows="2"
            placeholder="补充下一步，例如：改为打开 example.org、输入这段文字、按 ctrl+l"
            :disabled="busy || currentTask.status === 'cancelled'"
          />
          <textarea
            v-model="screenContext"
            rows="2"
            placeholder="可选屏幕上下文，例如：当前页面有一个继续按钮，坐标大约 500,300"
            :disabled="busy || currentTask.status === 'cancelled'"
          />
          <button
            type="submit"
            :disabled="busy || currentTask.status === 'cancelled' || (!nextInstruction.trim() && !screenContext.trim())"
          >
            更新下一步
          </button>
        </form>

        <div class="screen-advance-row">
          <span>
            屏幕读取：{{ screenStatus?.canCapture ? screenStatus.backend : 'unavailable' }}
          </span>
          <div class="task-tool-buttons">
            <button
              type="button"
              class="secondary"
              :disabled="busy || currentTask.status === 'cancelled'"
              @click="planWithAi"
            >
              AI 结构化计划
            </button>
            <button
              type="button"
              class="secondary"
              :disabled="busy || currentTask.status === 'cancelled' || !screenStatus?.canCapture"
              @click="advanceFromScreen"
            >
              读取屏幕并更新
            </button>
          </div>
        </div>

        <div v-if="currentTask.plan" class="plan-box">
          <div class="plan-heading">
            <strong>{{ currentTask.plan.riskLevel }}</strong>
            <span>{{ currentTask.plan.requiresConfirmation ? '需要确认' : '无需确认' }}</span>
          </div>
          <p>{{ currentTask.plan.explanation }}</p>
          <div v-if="currentTask.plan.steps.length" class="step-list">
            <div v-for="step in currentTask.plan.steps" :key="step.id" class="step-row">
              <span>{{ step.type }}</span>
              <strong>{{ step.description }}</strong>
            </div>
          </div>
        </div>

        <label v-if="currentTask.plan?.requiresConfirmation" class="confirm-line">
          <input v-model="confirmed" type="checkbox" />
          我确认执行这个电脑控制任务
        </label>

        <div class="chat-actions">
          <button type="button" class="secondary" :disabled="busy || !currentTask.plan" @click="runTask(true)">
            Dry-run
          </button>
          <button type="button" class="secondary" :disabled="busy" @click="loadAudit">
            审计
          </button>
          <button
            type="button"
            :disabled="busy || !currentTask.plan || currentTask.status === 'cancelled'"
            @click="runTask(false)"
          >
            确认执行
          </button>
          <button type="button" class="secondary" :disabled="busy || currentTask.status === 'cancelled'" @click="stopTask">
            取消
          </button>
        </div>

        <article v-if="currentTask.execution" class="result-box">
          <strong>{{ currentTask.execution.dryRun ? 'Dry-run 完成' : '执行完成' }}</strong>
          <span>
            {{ currentTask.execution.results.filter((item) => item.ok).length }} /
            {{ currentTask.execution.results.length }}
          </span>
        </article>

        <p v-if="currentTask.error" class="form-error">{{ currentTask.error }}</p>
        <p v-if="aiPlanMessage" class="form-note">{{ aiPlanMessage }}</p>

        <article v-if="aiSafetyReview" class="safety-review">
          <div class="review-heading">
            <strong>{{ aiSafetyReview.riskLevel }}</strong>
            <span>{{ aiSafetyReview.requiresConfirmation ? '需要确认' : '无需确认' }}</span>
            <span>{{ aiSafetyReview.blockedActions.length }} blocked</span>
          </div>
          <div v-if="aiSafetyReview.riskReasons.length" class="review-list">
            <p v-for="reason in aiSafetyReview.riskReasons" :key="reason">{{ reason }}</p>
          </div>
          <div v-if="aiSafetyReview.warnings.length" class="review-list">
            <p v-for="warning in aiSafetyReview.warnings" :key="warning">{{ warning }}</p>
          </div>
        </article>

        <div v-if="currentTask.events?.length" class="task-events">
          <div v-for="event in currentTask.events.slice().reverse().slice(0, 5)" :key="event.id" class="task-event">
            <span>{{ event.type }}</span>
            <strong>{{ event.summary }}</strong>
            <small>{{ formatTime(event.timestamp) }}</small>
          </div>
        </div>
      </article>

      <p v-else class="empty-state">暂无任务。</p>
      <p v-if="error" class="form-error">{{ error }}</p>
    </section>

    <section v-if="audit" class="panel task-panel">
      <h3>任务审计</h3>
      <div class="audit-metrics">
        <div>
          <span>事件</span>
          <strong>{{ audit.totals.events }}</strong>
        </div>
        <div>
          <span>AI 计划</span>
          <strong>{{ audit.totals.aiPlans }}</strong>
        </div>
        <div>
          <span>阻断动作</span>
          <strong>{{ audit.totals.blockedActions }}</strong>
        </div>
        <div>
          <span>执行</span>
          <strong>{{ audit.totals.executions }}</strong>
        </div>
        <div>
          <span>失败动作</span>
          <strong>{{ audit.totals.failedActions }}</strong>
        </div>
      </div>
      <div class="audit-list">
        <article v-for="entry in audit.entries.slice().reverse()" :key="entry.id" class="audit-entry">
          <div class="audit-entry-heading">
            <span>{{ entry.type }}</span>
            <small>{{ formatTime(entry.timestamp) }}</small>
          </div>
          <strong>{{ entry.summary }}</strong>
          <p v-if="entry.riskLevel">risk: {{ entry.riskLevel }}</p>
          <p v-if="entry.safetyReview">
            review: {{ entry.safetyReview.riskLevel }} / {{ entry.safetyReview.blockedActions.length }} blocked
          </p>
          <p v-if="entry.execution">
            execution: {{ entry.execution.results.filter((item) => item.ok).length }} /
            {{ entry.execution.results.length }}
          </p>
        </article>
      </div>
    </section>

    <section class="panel task-panel">
      <h3>最近任务</h3>
      <div class="task-list">
        <button
          v-for="task in recentTasks"
          :key="task.id"
          type="button"
          class="task-row"
          :class="{ active: task.id === currentTask?.id }"
          @click="selectTask(task)"
        >
          <span>{{ task.goal }}</span>
          <strong>{{ task.status }}</strong>
          <small>{{ formatTime(task.updatedAt) }}</small>
        </button>
      </div>
    </section>
  </section>
</template>
