import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AblePathEventBus,
  ActivityStore,
  AgentStore,
  buildAgentPlanPrompt,
  buildTaskAudit,
  ConfigStore,
  createActionPlanFromAiResponse,
  createClickPlanForScreenElement,
  createControlPlan,
  EmergencyStore,
  getProviderHealth,
  TaskStore,
} from '@ablepath/core';
import {
  AblePathConfig,
  ActivityLogEntry,
  AgentCommandRequest,
  AgentConfirmRequest,
  AgentSession,
  AgentStepRequest,
  AgentStopRequest,
  AgentToolCall,
  CaregiverPermission,
  CaregiverProfile,
  CaregiverRemoveRequest,
  CaregiverSummaryResponse,
  CaregiverTokenCreateRequest,
  CaregiverTokenRevokeRequest,
  CaregiverUpsertRequest,
  ChatRequest,
  ControlExecuteRequest,
  ControlPlanRequest,
  ControlTargetPlanRequest,
  EmergencyActionRequest,
  EmergencyEvent,
  EmergencyStatusResponse,
  EmergencyTriggerRequest,
  HealthResponse,
  InactivityCheckResponse,
  InactivityStatusResponse,
  ListenRequest,
  MvpChecklistItem,
  MvpChecklistResponse,
  ReadinessItem,
  ReadinessResponse,
  ScreenAnalyzeRequest,
  ScreenCaptureRequest,
  ScreenElement,
  ScreenTargetsRequest,
  SafetyUpdateRequest,
  TaskAdvanceRequest,
  TaskAdvanceScreenRequest,
  TaskCancelRequest,
  TaskExecuteRequest,
  TaskListResponse,
  TaskPlanAiRequest,
  TaskSession,
  TaskStartRequest,
  TTSRequest,
  VoiceStatusResponse,
  VisionAnalyzeRequest,
} from '@ablepath/shared';
import { WebSocketServer, WebSocket } from 'ws';

import { notifyEmergencyCaregivers } from './caregiver.js';
import { loadAblePathEnv } from './env.js';
import { executeControlPlan, getControlStatus } from './control.js';
import { json, notFound, readJsonBody } from './http-utils.js';
import { checkInactivity, getInactivityStatus } from './inactivity.js';
import { ChatProvider, DoubaoProvider } from './providers.js';
import { captureScreen, cleanupOldScreenshots, getScreenStatus } from './screen.js';
import { parseScreenElements, SCREEN_TARGET_PROMPT } from './screen-targets.js';
import { serveStatic } from './static.js';
import {
  getAudioStatus,
  listAudioDevices,
  recordAudio,
  transcribeAudio,
} from './voice/audio.js';
import {
  createRealtimeConfigFromEnv,
  DoubaoRealtimeSession,
  RealtimeSession,
} from './voice/realtime.js';
import { getTTSStatus, speakText } from './voice/tts.js';

export interface AblePathServerOptions {
  port?: number;
  host?: string;
  homeDir?: string;
  staticDir?: string;
  env?: Record<string, string | undefined>;
  provider?: ChatProvider;
}

export interface AblePathServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

const startedAt = Date.now();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ApiRequest {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers?: http.IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  handled: boolean;
}

export interface ApiErrorResponse {
  status: number;
  body: {
    error: string;
    code?: string;
    setupHints?: string[];
  };
}

type StoredCaregiverProfile = CaregiverProfile & {
  accessTokenHash?: string;
};

const DEFAULT_CAREGIVER_TOKEN_DAYS = 30;
const OWNER_SESSION_COOKIE = 'ablepath_owner';
const CAREGIVER_PERMISSIONS: CaregiverPermission[] = [
  'receive-emergency',
  'view-activity',
  'view-screen',
  'view-task-summary',
];
const MVP_REQUIRED_CONFIRMATIONS = ['click', 'doubleClick', 'type', 'hotkey', 'openUrl', 'openApp'] as const;

export function createApiHandler(
  homeDir?: string,
  env: Record<string, string | undefined> = loadAblePathEnv(),
  provider: ChatProvider = new DoubaoProvider({
    apiKey: env.ARK_API_KEY,
    model: env.DOUBAO_CHAT_MODEL,
    visionModel: env.DOUBAO_VISION_MODEL,
    baseUrl: env.DOUBAO_BASE_URL,
  }),
  eventBus: AblePathEventBus = new AblePathEventBus(),
): (request: ApiRequest) => Promise<ApiResponse> {
  const configStore = new ConfigStore(homeDir);
  const activityStore = new ActivityStore(homeDir);
  const emergencyStore = new EmergencyStore(homeDir);
  const taskStore = new TaskStore(homeDir);
  const agentStore = new AgentStore(homeDir);
  const controlPlans = new Map<string, ReturnType<typeof createControlPlan>>();
  const screenTargets = new Map<string, ScreenElement>();

  return async (request: ApiRequest): Promise<ApiResponse> => {
    const { method, pathname, searchParams } = request;

    if (method === 'GET' && pathname === '/api/health') {
      const response: HealthResponse = {
        ok: true,
        product: 'AblePath',
        version: '0.1.0',
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      };
      return { status: 200, body: response, handled: true };
    }

    if (method === 'GET' && pathname === '/api/config') {
      return { status: 200, body: sanitizeConfig(configStore.ensure()), handled: true };
    }

    if (method === 'POST' && pathname === '/api/config') {
      const existingConfig = configStore.ensure();
      const config = request.body as AblePathConfig;
      config.caregivers = preserveCaregiverTokenSecrets(
        config.caregivers.map(sanitizeCaregiver),
        existingConfig.caregivers,
      );
      configStore.save(config);
      const entry = activityStore.add('system-event', 'Configuration updated');
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: sanitizeConfig(config), handled: true };
    }

    if (method === 'POST' && pathname === '/api/safety/update') {
      const body = request.body as SafetyUpdateRequest;
      const config = configStore.ensure();
      if (body.inactivityTimeoutMs !== undefined) {
        const timeout = Number(body.inactivityTimeoutMs);
        if (!Number.isFinite(timeout) || timeout < 0 || timeout > 24 * 60 * 60 * 1000) {
          return { status: 400, body: { error: 'Invalid inactivityTimeoutMs' }, handled: true };
        }
        config.safety.inactivityTimeoutMs = Math.round(timeout);
      }
      if (body.emergencyConfirmationTimeoutSec !== undefined) {
        const timeout = Number(body.emergencyConfirmationTimeoutSec);
        if (!Number.isFinite(timeout) || timeout < 5 || timeout > 300) {
          return { status: 400, body: { error: 'Invalid emergencyConfirmationTimeoutSec' }, handled: true };
        }
        config.safety.emergencyConfirmationTimeoutSec = Math.round(timeout);
      }
      configStore.save(config);
      const entry = activityStore.add('system-event', 'Safety settings updated');
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { safety: config.safety }, handled: true };
    }

    if (method === 'GET' && pathname === '/api/caregivers') {
      return { status: 200, body: { caregivers: configStore.ensure().caregivers.map(sanitizeCaregiver) }, handled: true };
    }

    if (method === 'GET' && pathname === '/api/caregiver/summary') {
      const caregiverId = searchParams.get('caregiverId') ?? '';
      const config = configStore.ensure();
      const caregiver = config.caregivers.find((item) => item.id === caregiverId);
      if (!caregiver) {
        return { status: 404, body: { error: 'Caregiver not found' }, handled: true };
      }
      return {
        status: 200,
        body: getCaregiverSummary(caregiver, activityStore, emergencyStore, taskStore),
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/caregiver/summary-token') {
      const token = getBearerToken(request.headers) ?? '';
      const config = configStore.ensure();
      const caregiver = findCaregiverByToken(config.caregivers, token);
      if (!caregiver) {
        return { status: 401, body: { error: 'Invalid caregiver token' }, handled: true };
      }
      const stored = caregiver as StoredCaregiverProfile;
      if (isCaregiverTokenExpired(stored)) {
        return { status: 401, body: { error: 'Caregiver token expired' }, handled: true };
      }
      return {
        status: 200,
        body: getCaregiverSummary(caregiver, activityStore, emergencyStore, taskStore),
        handled: true,
      };
    }

    if (method === 'POST' && pathname === '/api/caregivers/upsert') {
      const body = request.body as CaregiverUpsertRequest;
      if (!body.name?.trim()) {
        return { status: 400, body: { error: 'Missing caregiver name' }, handled: true };
      }
      const config = configStore.ensure();
      const existing = body.id ? config.caregivers.find((item) => item.id === body.id) : undefined;
      const caregiver = normalizeCaregiver(body, existing);
      const index = config.caregivers.findIndex((item) => item.id === caregiver.id);
      if (index >= 0) config.caregivers[index] = caregiver;
      else config.caregivers.push(caregiver);
      configStore.save(config);
      const entry = activityStore.add('caregiver-event', `Caregiver saved: ${caregiver.name}`);
      eventBus.publish({ type: 'activity.created', entry });
      return {
        status: 200,
        body: { caregiver: sanitizeCaregiver(caregiver), caregivers: config.caregivers.map(sanitizeCaregiver) },
        handled: true,
      };
    }

    if (method === 'POST' && pathname === '/api/caregivers/token') {
      const body = request.body as CaregiverTokenCreateRequest;
      const config = configStore.ensure();
      const caregiver = config.caregivers.find((item) => item.id === body.caregiverId) as StoredCaregiverProfile | undefined;
      if (!caregiver) {
        return { status: 404, body: { error: 'Caregiver not found' }, handled: true };
      }
      const token = crypto.randomBytes(24).toString('base64url');
      const createdAt = new Date().toISOString();
      const days = normalizeTokenDays(body.expiresInDays);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      caregiver.accessTokenHash = hashCaregiverToken(token);
      caregiver.accessTokenCreatedAt = createdAt;
      caregiver.accessTokenExpiresAt = expiresAt;
      configStore.save(config);
      const entry = activityStore.add('caregiver-event', `Caregiver token generated: ${caregiver.name}`);
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { caregiverId: caregiver.id, token, createdAt, expiresAt }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/caregivers/token/revoke') {
      const body = request.body as CaregiverTokenRevokeRequest;
      const config = configStore.ensure();
      const caregiver = config.caregivers.find((item) => item.id === body.caregiverId) as StoredCaregiverProfile | undefined;
      if (!caregiver) {
        return { status: 404, body: { error: 'Caregiver not found' }, handled: true };
      }
      delete caregiver.accessTokenHash;
      delete caregiver.accessTokenCreatedAt;
      delete caregiver.accessTokenExpiresAt;
      configStore.save(config);
      const entry = activityStore.add('caregiver-event', `Caregiver token revoked: ${caregiver.name}`);
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { caregiver: sanitizeCaregiver(caregiver), caregivers: config.caregivers.map(sanitizeCaregiver) }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/caregivers/remove') {
      const body = request.body as CaregiverRemoveRequest;
      const config = configStore.ensure();
      const before = config.caregivers.length;
      config.caregivers = config.caregivers.filter((caregiver) => caregiver.id !== body.id);
      configStore.save(config);
      const entry = activityStore.add('caregiver-event', `Caregiver removed: ${body.id}`);
      eventBus.publish({ type: 'activity.created', entry });
      if (before === config.caregivers.length) {
        return { status: 404, body: { error: 'Caregiver not found' }, handled: true };
      }
      return { status: 200, body: { caregivers: config.caregivers.map(sanitizeCaregiver) }, handled: true };
    }

    if (method === 'GET' && pathname === '/api/activity/recent') {
      const hoursBack = Number(searchParams.get('hours') ?? '24');
      return {
        status: 200,
        body: { entries: activityStore.recent(Number.isFinite(hoursBack) ? hoursBack : 24) },
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/activity/stats') {
      const hoursBack = Number(searchParams.get('hours') ?? '24');
      return {
        status: 200,
        body: activityStore.stats(Number.isFinite(hoursBack) ? hoursBack : 24),
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/providers/status') {
      return {
        status: 200,
        body: { providers: getProviderHealth(configStore.ensure(), env) },
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/readiness') {
      return {
        status: 200,
        body: getReadiness(configStore.ensure(), env),
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/mvp/checklist') {
      return {
        status: 200,
        body: getMvpChecklist(configStore.ensure(), env),
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/tasks/recent') {
      const response: TaskListResponse = { tasks: taskStore.recent() };
      return { status: 200, body: response, handled: true };
    }

    if (method === 'GET' && pathname === '/api/tasks/status') {
      const taskId = searchParams.get('taskId') ?? '';
      const task = taskStore.get(taskId);
      if (!task) return { status: 404, body: { error: 'Task not found' }, handled: true };
      return { status: 200, body: { task }, handled: true };
    }

    if (method === 'GET' && pathname === '/api/tasks/audit') {
      const taskId = searchParams.get('taskId') ?? '';
      const task = taskStore.get(taskId);
      if (!task) return { status: 404, body: { error: 'Task not found' }, handled: true };
      return { status: 200, body: buildTaskAudit(task), handled: true };
    }

    if (method === 'POST' && pathname === '/api/tasks/start') {
      const body = request.body as TaskStartRequest;
      if (!body.goal?.trim()) {
        return { status: 400, body: { error: 'Missing goal' }, handled: true };
      }
      const plan = createControlPlan(body.goal, configStore.ensure());
      const task = taskStore.create(body.goal.trim(), plan);
      if (task.plan) controlPlans.set(task.plan.id, task.plan);
      const entry = activityStore.add('system-event', `Task started: ${task.goal}`, {
        details: { taskId: task.id, planId: task.plan?.id, status: task.status },
        riskLevel: task.plan?.riskLevel,
      });
      eventBus.publish({ type: 'task.changed', task });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { task }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/tasks/advance') {
      const body = request.body as TaskAdvanceRequest;
      const task = taskStore.get(body.taskId);
      if (!task) return { status: 404, body: { error: 'Task not found' }, handled: true };
      if (task.status === 'cancelled') {
        return { status: 400, body: { error: 'Cancelled tasks cannot be advanced.' }, handled: true };
      }

      const instruction = body.instruction?.trim();
      const screenContext = body.screenContext?.trim();
      if (!instruction && !screenContext) {
        return { status: 400, body: { error: 'Missing instruction or screenContext' }, handled: true };
      }

      if (instruction) {
        taskStore.addEvent(task.id, 'user-note', instruction);
      }
      if (screenContext) {
        taskStore.addEvent(task.id, 'screen-context', screenContext);
      }

      const nextIntent = [
        instruction ? `用户补充：${instruction}` : '',
        screenContext ? `屏幕上下文：${screenContext}` : '',
        `原任务目标：${task.goal}`,
      ].filter(Boolean).join('\n');
      const plan = createControlPlan(nextIntent, configStore.ensure());
      const updated = taskStore.setPlan(task.id, plan);
      controlPlans.set(plan.id, plan);
      const entry = activityStore.add('system-event', `Task advanced: ${updated.goal}`, {
        details: { taskId: updated.id, planId: plan.id },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'task.changed', task: updated });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { task: updated }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/tasks/advance-screen') {
      const body = request.body as TaskAdvanceScreenRequest;
      const task = taskStore.get(body.taskId);
      if (!task) return { status: 404, body: { error: 'Task not found' }, handled: true };
      if (task.status === 'cancelled') {
        return { status: 400, body: { error: 'Cancelled tasks cannot be advanced.' }, handled: true };
      }

      cleanupOldScreenshots(homeDir);
      const instruction = body.instruction?.trim();
      let capture: Awaited<ReturnType<typeof captureScreen>> | undefined;
      let analysis: Awaited<ReturnType<ChatProvider['vision']>>;
      try {
        capture = body.imageBase64 || body.imagePath
          ? undefined
          : await captureScreen({ region: body.region }, homeDir);
        analysis = await provider.vision({
          question: body.question?.trim() || [
            `当前任务目标：${task.goal}`,
            instruction ? `用户补充：${instruction}` : '',
            '请描述当前屏幕中和任务相关的状态，并给出下一步应该操作的文字、网址、按钮或输入框。',
          ].filter(Boolean).join('\n'),
          imageBase64: body.imageBase64,
          imagePath: body.imagePath ?? capture?.path,
          mimeType: body.mimeType ?? capture?.mimeType,
        });
      } catch (err) {
        return { status: 400, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }
      const screenContext = analysis.response.trim();
      if (!screenContext) {
        return { status: 400, body: { error: 'Screen analysis returned empty context' }, handled: true };
      }

      if (instruction) taskStore.addEvent(task.id, 'user-note', instruction);
      taskStore.addEvent(task.id, 'screen-analysis', screenContext, {
        provider: analysis.provider,
        capturePath: capture?.path ?? body.imagePath,
      });
      const nextIntent = [
        instruction ? `用户补充：${instruction}` : '',
        `屏幕分析：${screenContext}`,
        `原任务目标：${task.goal}`,
      ].filter(Boolean).join('\n');
      const plan = createControlPlan(nextIntent, configStore.ensure());
      const updated = taskStore.setPlan(task.id, plan);
      controlPlans.set(plan.id, plan);
      const entry = activityStore.add('screen-capture', `Task screen advanced via ${analysis.provider}`, {
        details: { taskId: updated.id, planId: plan.id, path: capture?.path ?? body.imagePath },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'task.changed', task: updated });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { task: updated, analysis, capture }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/tasks/plan-ai') {
      const body = request.body as TaskPlanAiRequest;
      const task = taskStore.get(body.taskId);
      if (!task) return { status: 404, body: { error: 'Task not found' }, handled: true };
      if (task.status === 'cancelled') {
        return { status: 400, body: { error: 'Cancelled tasks cannot be planned.' }, handled: true };
      }

      const instruction = body.instruction?.trim();
      const screenContext = body.screenContext?.trim();
      let aiResponse;
      try {
        aiResponse = await provider.chat(buildStructuredTaskPlanPrompt(task, instruction, screenContext));
      } catch (err) {
        return { status: 400, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }

      if (instruction) taskStore.addEvent(task.id, 'user-note', instruction);
      if (screenContext) taskStore.addEvent(task.id, 'screen-context', screenContext);
      const { plan, warnings, safetyReview } = createActionPlanFromAiResponse(
        aiResponse.response,
        configStore.ensure(),
        instruction || screenContext || task.goal,
      );
      taskStore.addEvent(task.id, 'ai-plan', `AI structured plan via ${aiResponse.provider}`, {
        provider: aiResponse.provider,
        warnings,
        safetyReview,
        rawResponse: aiResponse.response.slice(0, 2000),
      });
      const updated = taskStore.setPlan(task.id, plan);
      controlPlans.set(plan.id, plan);
      const entry = activityStore.add('computer-control', `AI task plan: ${updated.goal}`, {
        details: { taskId: updated.id, planId: plan.id, warnings, safetyReview },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'task.changed', task: updated });
      eventBus.publish({ type: 'activity.created', entry });
      return {
        status: 200,
        body: { task: updated, rawResponse: aiResponse.response, provider: aiResponse.provider, warnings, safetyReview },
        handled: true,
      };
    }

    if (method === 'POST' && pathname === '/api/tasks/execute') {
      const body = request.body as TaskExecuteRequest;
      const task = taskStore.get(body.taskId);
      if (!task) return { status: 404, body: { error: 'Task not found' }, handled: true };
      if (!task.plan) return { status: 400, body: { error: 'Task has no control plan' }, handled: true };
      if (task.plan.requiresConfirmation && !body.confirmed) {
        return { status: 400, body: { error: 'Task requires confirmation before execution.' }, handled: true };
      }

      const running = taskStore.setStatus(task.id, 'running');
      eventBus.publish({ type: 'task.changed', task: running });
      try {
        const response = await executeControlPlan(task.plan, {
          confirmed: body.confirmed,
          dryRun: body.dryRun ?? false,
        });
        const updated = taskStore.setExecution(task.id, response);
        const entry = activityStore.add(
          'system-event',
          `${response.dryRun ? 'Dry-run' : 'Executed'} task: ${updated.goal}`,
          { details: { taskId: updated.id, results: response.results }, riskLevel: updated.plan?.riskLevel },
        );
        eventBus.publish({ type: 'task.changed', task: updated });
        eventBus.publish({ type: 'activity.created', entry });
        return { status: 200, body: { task: updated }, handled: true };
      } catch (err) {
        const updated = taskStore.setStatus(task.id, 'failed', err instanceof Error ? err.message : String(err));
        eventBus.publish({ type: 'task.changed', task: updated });
        return { status: 400, body: { error: updated.error, task: updated }, handled: true };
      }
    }

    if (method === 'POST' && pathname === '/api/tasks/cancel') {
      const body = request.body as TaskCancelRequest;
      try {
        const task = taskStore.cancel(body.taskId, body.reason ?? 'Task cancelled');
        const entry = activityStore.add('system-event', `Task cancelled: ${task.goal}`, {
          details: { taskId: task.id, reason: body.reason },
          riskLevel: task.plan?.riskLevel,
        });
        eventBus.publish({ type: 'task.changed', task });
        eventBus.publish({ type: 'activity.created', entry });
        return { status: 200, body: { task }, handled: true };
      } catch (err) {
        return { status: 404, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }
    }

    if (method === 'GET' && pathname === '/api/emergency/status') {
      return {
        status: 200,
        body: getEmergencyStatus(emergencyStore, configStore.ensure()),
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/inactivity/status') {
      const response: InactivityStatusResponse = getInactivityStatus(
        activityStore,
        emergencyStore,
        configStore.ensure(),
        startedAt,
      );
      return { status: 200, body: response, handled: true };
    }

    if (method === 'POST' && pathname === '/api/inactivity/check') {
      const response: InactivityCheckResponse = checkInactivity(
        activityStore,
        emergencyStore,
        configStore.ensure(),
        startedAt,
      );
      if (response.event) publishEmergency(response.event, eventBus, activityStore, []);
      return { status: 200, body: response, handled: true };
    }

    if (method === 'POST' && pathname === '/api/emergency/trigger') {
      const body = request.body as EmergencyTriggerRequest;
      const config = configStore.ensure();
      const event = emergencyStore.trigger({
        trigger: body.trigger ?? 'manual',
        details: body.details?.trim() || 'Emergency assistance requested.',
        confirmationTimeoutSec: config.safety.emergencyConfirmationTimeoutSec,
        activateImmediately: body.activateImmediately ?? false,
      });
      const notifications = event.state === 'active'
        ? await notifyEmergencyCaregivers(config.caregivers, event)
        : [];
      publishEmergency(event, eventBus, activityStore, notifications);
      return {
        status: 200,
        body: { event, countdownSec: emergencyStore.countdownSec(), notifications },
        handled: true,
      };
    }

    if (method === 'POST' && pathname === '/api/emergency/confirm') {
      const body = request.body as EmergencyActionRequest;
      const config = configStore.ensure();
      try {
        const event = emergencyStore.confirm(body.details?.trim() || 'Emergency confirmed.');
        const notifications = await notifyEmergencyCaregivers(config.caregivers, event);
        publishEmergency(event, eventBus, activityStore, notifications);
        return { status: 200, body: { event, notifications }, handled: true };
      } catch (err) {
        return { status: 400, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }
    }

    if (method === 'POST' && pathname === '/api/emergency/cancel') {
      const body = request.body as EmergencyActionRequest;
      try {
        const event = emergencyStore.cancel(body.details?.trim() || 'Emergency cancelled.');
        publishEmergency(event, eventBus, activityStore, []);
        return { status: 200, body: { event }, handled: true };
      } catch (err) {
        return { status: 400, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }
    }

    if (method === 'POST' && pathname === '/api/emergency/resolve') {
      const body = request.body as EmergencyActionRequest;
      try {
        const event = emergencyStore.resolve(body.details?.trim() || 'Emergency resolved.');
        publishEmergency(event, eventBus, activityStore, []);
        return { status: 200, body: { event }, handled: true };
      } catch (err) {
        return { status: 400, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }
    }

    if (method === 'GET' && pathname === '/api/control/status') {
      return { status: 200, body: getControlStatus(), handled: true };
    }

    if (method === 'GET' && pathname === '/api/screen/status') {
      return { status: 200, body: getScreenStatus(), handled: true };
    }

    if (method === 'POST' && pathname === '/api/screen/capture') {
      const body = request.body as ScreenCaptureRequest;
      cleanupOldScreenshots(homeDir);
      const capture = await captureScreen(body, homeDir);
      const entry = activityStore.add('screen-capture', `Screen captured via ${capture.backend}`, {
        details: { path: capture.path, sizeBytes: capture.sizeBytes, backend: capture.backend },
      });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: capture, handled: true };
    }

    if (method === 'POST' && pathname === '/api/screen/analyze') {
      const body = request.body as ScreenAnalyzeRequest;
      cleanupOldScreenshots(homeDir);
      const capture = await captureScreen(body, homeDir);
      const analysis = await provider.vision({
        question: body.question?.trim() || '请描述当前电脑屏幕，并指出可操作的按钮、输入框、链接和重要状态。',
        imagePath: capture.path,
        mimeType: capture.mimeType,
      });
      const entry = activityStore.add('screen-capture', `Screen analyzed via ${analysis.provider}`, {
        details: { path: capture.path, sizeBytes: capture.sizeBytes, backend: capture.backend },
      });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { capture, analysis }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/screen/targets') {
      const body = request.body as ScreenTargetsRequest;
      cleanupOldScreenshots(homeDir);
      const capture = body.imageBase64 || body.imagePath ? undefined : await captureScreen(body, homeDir);
      const analysis = await provider.vision({
        question: [body.question?.trim(), SCREEN_TARGET_PROMPT].filter(Boolean).join('\n\n'),
        imageBase64: body.imageBase64,
        imagePath: body.imagePath ?? capture?.path,
        mimeType: body.mimeType ?? capture?.mimeType,
      });
      const elements = parseScreenElements(analysis);
      screenTargets.clear();
      for (const element of elements) {
        screenTargets.set(element.id, element);
      }
      const entry = activityStore.add('screen-capture', `Screen targets detected: ${elements.length}`, {
        details: {
          path: capture?.path ?? body.imagePath,
          count: elements.length,
        },
      });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { capture, rawAnalysis: analysis.response, elements }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/control/plan') {
      const body = request.body as ControlPlanRequest;
      if (!body.intent?.trim()) {
        return { status: 400, body: { error: 'Missing intent' }, handled: true };
      }
      const plan = createControlPlan(body.intent, configStore.ensure());
      controlPlans.set(plan.id, plan);
      const entry = activityStore.add('computer-control', `Control plan: ${plan.intent}`, {
        details: { planId: plan.id, steps: plan.steps.length, requiresConfirmation: plan.requiresConfirmation },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'control.plan.created', plan });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { plan }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/control/plan-target') {
      const body = request.body as ControlTargetPlanRequest;
      const element = body.element ?? (body.targetId ? screenTargets.get(body.targetId) : undefined);
      if (!element) {
        return { status: 404, body: { error: 'Unknown screen target' }, handled: true };
      }
      if (!element.actionable) {
        return { status: 400, body: { error: 'Screen target is not actionable' }, handled: true };
      }
      const plan = createClickPlanForScreenElement(element, configStore.ensure(), body.intent);
      controlPlans.set(plan.id, plan);
      const entry = activityStore.add('computer-control', `Target control plan: ${plan.intent}`, {
        details: { planId: plan.id, targetId: element.id, targetLabel: element.label },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'control.plan.created', plan });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { plan }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/control/execute') {
      const body = request.body as ControlExecuteRequest;
      const plan = controlPlans.get(body.planId);
      if (!plan) {
        return { status: 404, body: { error: 'Unknown control plan' }, handled: true };
      }
      if (plan.requiresConfirmation && !body.confirmed) {
        return {
          status: 400,
          body: { error: 'Control plan requires confirmation before execution.' },
          handled: true,
        };
      }
      try {
        for (const action of plan.steps) eventBus.publish({ type: 'control.action.started', action });
        const response = await executeControlPlan(plan, {
          confirmed: body.confirmed,
          dryRun: body.dryRun ?? false,
        });
        for (const result of response.results) {
          const action = plan.steps.find((step) => step.id === result.actionId);
          if (action) {
            eventBus.publish({
              type: 'control.action.finished',
              action,
              ok: result.ok,
              error: result.error,
            });
          }
        }
        const entry = activityStore.add(
          'computer-control',
          `${response.dryRun ? 'Dry-run' : 'Executed'} control plan: ${plan.intent}`,
          { details: { planId: plan.id, results: response.results }, riskLevel: plan.riskLevel },
        );
        eventBus.publish({ type: 'activity.created', entry });
        return { status: 200, body: response, handled: true };
      } catch (err) {
        return {
          status: 400,
          body: { error: err instanceof Error ? err.message : String(err) },
          handled: true,
        };
      }
    }

    if (method === 'GET' && pathname === '/api/agent/recent') {
      return { status: 200, body: { sessions: agentStore.recent(20) }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/agent/command') {
      const body = request.body as AgentCommandRequest;
      const command = body.command?.trim();
      if (!command) {
        return { status: 400, body: { error: 'Missing command' }, handled: true };
      }

      let session = agentStore.create(command);
      eventBus.publish({ type: 'agent.session.changed', session });
      let screenContext = '';
      if (body.includeScreen) {
        const screen = await collectAgentScreenContext(session.id, provider, homeDir);
        if (screen.sessionStep) {
          session = agentStore.addStep(
            session.id,
            screen.sessionStep.type,
            screen.sessionStep.summary,
            screen.sessionStep.details,
            screen.sessionStep.toolCalls,
          );
          eventBus.publish({ type: 'agent.session.changed', session });
        }
        screenContext = screen.context;
      }

      let aiResponse;
      try {
        aiResponse = await provider.chat(buildAgentPlanPrompt({ command, screenContext }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        session = agentStore.setStatus(session.id, 'failed', message);
        session = agentStore.addStep(session.id, 'error', message);
        eventBus.publish({ type: 'agent.error', sessionId: session.id, message });
        eventBus.publish({ type: 'agent.session.changed', session });
        return { status: 400, body: { error: message, session }, handled: true };
      }

      const { plan, warnings, safetyReview } = createActionPlanFromAiResponse(
        aiResponse.response,
        configStore.ensure(),
        command,
      );
      controlPlans.set(plan.id, plan);
      session = agentStore.setPreview(session.id, {
        plan,
        rawResponse: aiResponse.response,
        provider: aiResponse.provider,
        warnings,
        safetyReview,
      });
      const entry = activityStore.add('computer-control', `Agent plan: ${command}`, {
        details: { sessionId: session.id, planId: plan.id, warnings, safetyReview },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'agent.plan.created', session, plan });
      if (plan.requiresConfirmation) eventBus.publish({ type: 'agent.needs.confirmation', session, plan });
      eventBus.publish({ type: 'agent.session.changed', session });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { session }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/agent/confirm') {
      const body = request.body as AgentConfirmRequest;
      const session = agentStore.get(body.sessionId);
      if (!session) return { status: 404, body: { error: 'Agent session not found' }, handled: true };
      if (!session.plan) return { status: 400, body: { error: 'Agent session has no plan' }, handled: true };
      const dryRun = body.dryRun ?? false;
      if (session.plan.requiresConfirmation && !body.confirmed && !dryRun) {
        return { status: 400, body: { error: 'Agent plan requires confirmation before real execution.' }, handled: true };
      }

      let updated = agentStore.setStatus(session.id, 'executing');
      eventBus.publish({ type: 'agent.session.changed', session: updated });
      try {
        for (const action of session.plan.steps) eventBus.publish({ type: 'agent.action.started', sessionId: session.id, action });
        const response = await executeControlPlan(session.plan, {
          confirmed: body.confirmed || dryRun,
          dryRun,
        });
        for (const result of response.results) {
          const action = session.plan.steps.find((step) => step.id === result.actionId);
          if (action) {
            eventBus.publish({
              type: 'agent.action.finished',
              sessionId: session.id,
              action,
              ok: result.ok,
              error: result.error,
            });
          }
        }
        updated = agentStore.setExecution(session.id, response);
        const entry = activityStore.add(
          'computer-control',
          `${response.dryRun ? 'Dry-run' : 'Executed'} agent plan: ${session.command}`,
          { details: { sessionId: session.id, planId: session.plan.id, results: response.results }, riskLevel: session.plan.riskLevel },
        );
        eventBus.publish({ type: 'agent.session.changed', session: updated });
        eventBus.publish({ type: 'activity.created', entry });
        return { status: 200, body: { session: updated }, handled: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updated = agentStore.setStatus(session.id, 'failed', message);
        updated = agentStore.addStep(session.id, 'error', message);
        eventBus.publish({ type: 'agent.error', sessionId: session.id, message });
        eventBus.publish({ type: 'agent.session.changed', session: updated });
        return { status: 400, body: { error: message, session: updated }, handled: true };
      }
    }

    if (method === 'POST' && pathname === '/api/agent/step') {
      const body = request.body as AgentStepRequest;
      let session = agentStore.get(body.sessionId);
      if (!session) return { status: 404, body: { error: 'Agent session not found' }, handled: true };
      if (session.status === 'stopped') {
        return { status: 400, body: { error: 'Stopped agent sessions cannot continue.' }, handled: true };
      }

      session = agentStore.setStatus(session.id, 'planning');
      eventBus.publish({ type: 'agent.session.changed', session });
      let screenContext = '';
      if (body.includeScreen) {
        const screen = await collectAgentScreenContext(session.id, provider, homeDir);
        if (screen.sessionStep) {
          session = agentStore.addStep(
            session.id,
            screen.sessionStep.type,
            screen.sessionStep.summary,
            screen.sessionStep.details,
            screen.sessionStep.toolCalls,
          );
          eventBus.publish({ type: 'agent.session.changed', session });
        }
        screenContext = screen.context;
      }

      let aiResponse;
      try {
        aiResponse = await provider.chat(buildAgentPlanPrompt({
          command: session.command,
          instruction: body.instruction?.trim(),
          screenContext,
          previousSession: session,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        session = agentStore.setStatus(session.id, 'failed', message);
        session = agentStore.addStep(session.id, 'error', message);
        eventBus.publish({ type: 'agent.error', sessionId: session.id, message });
        eventBus.publish({ type: 'agent.session.changed', session });
        return { status: 400, body: { error: message, session }, handled: true };
      }

      const { plan, warnings, safetyReview } = createActionPlanFromAiResponse(
        aiResponse.response,
        configStore.ensure(),
        body.instruction?.trim() || session.command,
        { preferSearchUrl: false },
      );
      controlPlans.set(plan.id, plan);
      session = agentStore.setPreview(session.id, {
        plan,
        rawResponse: aiResponse.response,
        provider: aiResponse.provider,
        warnings,
        safetyReview,
      });
      const entry = activityStore.add('computer-control', `Agent step planned: ${session.command}`, {
        details: { sessionId: session.id, planId: plan.id, warnings, safetyReview },
        riskLevel: plan.riskLevel,
      });
      eventBus.publish({ type: 'agent.plan.created', session, plan });
      if (plan.requiresConfirmation) eventBus.publish({ type: 'agent.needs.confirmation', session, plan });
      eventBus.publish({ type: 'agent.session.changed', session });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { session }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/agent/stop') {
      const body = request.body as AgentStopRequest;
      try {
        const session = agentStore.stop(body.sessionId, body.reason?.trim() || 'Agent stopped by user.');
        const entry = activityStore.add('system-event', `Agent stopped: ${session.command}`, {
          details: { sessionId: session.id, reason: body.reason },
          riskLevel: session.plan?.riskLevel,
        });
        eventBus.publish({ type: 'agent.session.changed', session });
        eventBus.publish({ type: 'activity.created', entry });
        return { status: 200, body: { session }, handled: true };
      } catch (err) {
        return { status: 404, body: { error: err instanceof Error ? err.message : String(err) }, handled: true };
      }
    }

    if (method === 'POST' && pathname === '/api/chat') {
      const body = request.body as ChatRequest;
      if (!body.message?.trim()) {
        return { status: 400, body: { error: 'Missing message' }, handled: true };
      }
      const response = await provider.chat(body.message);
      const entry = activityStore.add('ai-chat', `Chat via ${response.provider}`, {
        details: { turns: response.turns },
      });
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: response, handled: true };
    }

    if (method === 'POST' && pathname === '/api/chat/history') {
      provider.clearHistory();
      const entry = activityStore.add('system-event', 'Chat history cleared');
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: { ok: true }, handled: true };
    }

    if (method === 'POST' && pathname === '/api/vision/analyze') {
      const body = request.body as VisionAnalyzeRequest;
      const response = await provider.vision(body);
      const entry = activityStore.add('screen-capture', `Vision analysis via ${response.provider}`);
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: response, handled: true };
    }

    if (method === 'GET' && pathname === '/api/devices/audio') {
      return {
        status: 200,
        body: { devices: listAudioDevices(), status: getAudioStatus() },
        handled: true,
      };
    }

    if (method === 'GET' && pathname === '/api/voice/status') {
      return {
        status: 200,
        body: getVoiceStatus(env),
        handled: true,
      };
    }

    if (method === 'POST' && pathname === '/api/listen') {
      const body = request.body as ListenRequest;
      const durationSec = Math.min(Math.max(Number(body.durationSec ?? 5), 1), 30);
      const audioPath = await recordAudio({ durationSec, deviceId: body.deviceId });
      const result = await transcribeAudio(audioPath, env);
      const entry = activityStore.add('voice-command', `Voice input: ${result.text || '(empty)'}`, {
        details: { audioPath, provider: result.provider },
      });
      eventBus.publish({ type: 'activity.created', entry });
      return {
        status: 200,
        body: { ...result, audioPath, durationSec },
        handled: true,
      };
    }

    if (method === 'POST' && pathname === '/api/tts') {
      const body = request.body as TTSRequest;
      if (!body.text?.trim()) {
        return { status: 400, body: { error: 'Missing text' }, handled: true };
      }
      const response = await speakText(body.text, body.priority ?? 'normal');
      const entry = activityStore.add('system-event', `TTS requested: ${body.text.slice(0, 80)}`);
      eventBus.publish({ type: 'activity.created', entry });
      return { status: 200, body: response, handled: true };
    }

    return { status: 404, body: { error: 'Not found' }, handled: false };
  };
}

export async function startAblePathServer(options: AblePathServerOptions = {}): Promise<AblePathServer> {
  const eventBus = new AblePathEventBus();
  const env = options.env ?? loadAblePathEnv();
  const handleApi = createApiHandler(options.homeDir, env, options.provider, eventBus);
  const staticDir = options.staticDir ?? resolveWebDistDir();
  const ownerSessionToken = crypto.randomBytes(32).toString('base64url');

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        if (!isPublicApiRequest(method, url.pathname) && !hasOwnerSession(req.headers.cookie, ownerSessionToken)) {
          json(res, 401, { error: 'Owner session required' });
          return;
        }
        const body = method === 'POST' ? await readJsonBody(req) : undefined;
        const response = await handleApi({
          method,
          pathname: url.pathname,
          searchParams: url.searchParams,
          headers: req.headers,
          body,
        });
        json(res, response.status, response.body);
        return;
      }

      const staticHeaders = shouldSetOwnerSessionCookie(url.pathname)
        ? { 'Set-Cookie': ownerSessionCookie(ownerSessionToken) }
        : {};
      if (serveStatic(req, res, staticDir, staticHeaders)) return;

      notFound(res);
    } catch (err) {
      const response = toApiErrorResponse(err);
      json(res, response.status, response.body);
    }
  });

  attachWebSocket(server, eventBus, env, ownerSessionToken);

  const port = options.port ?? Number(process.env.ABLEPATH_PORT ?? '4317');
  const host = options.host ?? process.env.ABLEPATH_HOST ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, resolve);
    server.once('error', reject);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  eventBus.publish({ type: 'server.ready', port: actualPort });
  const inactivityCheckMs = Number(process.env.ABLEPATH_INACTIVITY_CHECK_MS ?? '60000');
  const inactivityTimer = Number.isFinite(inactivityCheckMs) && inactivityCheckMs > 0
    ? setInterval(() => {
        void handleApi({
          method: 'POST',
          pathname: '/api/inactivity/check',
          searchParams: new URLSearchParams(),
          body: {},
        }).catch(() => undefined);
      }, inactivityCheckMs)
    : null;
  inactivityTimer?.unref?.();

  return {
    server,
    port: actualPort,
    close: () => new Promise((resolve) => {
      if (inactivityTimer) clearInterval(inactivityTimer);
      server.close(() => resolve());
    }),
  };
}

function attachWebSocket(
  server: http.Server,
  eventBus: AblePathEventBus,
  env: Record<string, string | undefined>,
  ownerSessionToken: string,
): void {
  const wss = new WebSocketServer({
    server,
    path: '/ws/events',
    verifyClient: (info: { req: http.IncomingMessage }) => hasOwnerSession(info.req.headers.cookie, ownerSessionToken),
  });
  const clients = new Set<WebSocket>();
  let realtimeSession: RealtimeSession | null = null;

  eventBus.subscribe((event) => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'server.ready', port: 0 }));
    ws.send(JSON.stringify({
      type: 'server.state',
      realtimeActive: realtimeSession !== null,
      realtimeState: realtimeSession?.getState() ?? 'disconnected',
    }));
    ws.on('message', (raw) => {
      const text = raw.toString();
      if (text === 'ping') {
        ws.send('pong');
        return;
      }
      void handleRealtimeMessage(text);
    });
    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  async function handleRealtimeMessage(raw: string): Promise<void> {
    let message: { type?: string; content?: string };
    try {
      message = JSON.parse(raw) as { type?: string; content?: string };
    } catch {
      return;
    }

    if (message.type === 'talk.start') {
      if (realtimeSession) {
        eventBus.publish({ type: 'error', message: '实时语音已在运行中。' });
        return;
      }

      const realtimeConfig = createRealtimeConfigFromEnv(env);
      if (!realtimeConfig.config) {
        eventBus.publish({
          type: 'error',
          message: `实时语音未配置：缺少 ${realtimeConfig.missingEnv.join(', ')}`,
        });
        return;
      }

      const audioStatus = getAudioStatus();
      if (!audioStatus.canRecord) {
        eventBus.publish({
          type: 'error',
          message: '未检测到录音工具。Windows 请确认 PowerShell 与麦克风权限；Linux/WSL 可安装 pulseaudio-utils、alsa-utils 或 sox。',
        });
        return;
      }

      realtimeSession = new DoubaoRealtimeSession(realtimeConfig.config, {
        onASRText: (text, isFinal) => eventBus.publish({ type: 'asr.text', text, isFinal }),
        onChatText: (text) => eventBus.publish({ type: 'chat.text', text }),
        onChatEnded: () => eventBus.publish({ type: 'chat.ended' }),
        onTTSStart: (text) => eventBus.publish({ type: 'tts.start', text }),
        onTTSEnded: () => eventBus.publish({ type: 'tts.end' }),
        onUserSpeechStart: () => undefined,
        onError: (message) => eventBus.publish({ type: 'error', message }),
        onStateChange: (state) => {
          eventBus.publish({ type: 'realtime.state', state });
          if (state === 'disconnected') realtimeSession = null;
        },
      });

      try {
        await realtimeSession.start();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        eventBus.publish({ type: 'error', message });
        eventBus.publish({ type: 'realtime.state', state: 'error' });
        await realtimeSession.stop().catch(() => undefined);
        realtimeSession = null;
      }
      return;
    }

    if (message.type === 'talk.stop') {
      if (!realtimeSession) {
        eventBus.publish({ type: 'realtime.state', state: 'disconnected' });
        return;
      }
      await realtimeSession.stop().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        eventBus.publish({ type: 'error', message });
      });
      realtimeSession = null;
      eventBus.publish({ type: 'realtime.state', state: 'disconnected' });
      return;
    }

    if (message.type === 'talk.text' && message.content) {
      if (!realtimeSession) {
        eventBus.publish({ type: 'error', message: '实时语音未启动。' });
        return;
      }
      try {
        realtimeSession.sendText(message.content);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        eventBus.publish({ type: 'error', message: error });
      }
    }
  }
}

function buildStructuredTaskPlanPrompt(
  task: TaskSession,
  instruction?: string,
  screenContext?: string,
): string {
  const recentEvents = (task.events ?? []).slice(-8).map((event) => ({
    type: event.type,
    summary: event.summary,
  }));
  return [
    '你是 AblePath 的电脑控制规划器。只返回 JSON，不要 Markdown，不要解释性前后缀。',
    '目标：把用户任务转换为结构化动作候选。动作必须保守、可审查，并且只使用已支持的动作类型。',
    'JSON 格式：{"intent":"简短意图","explanation":"为什么这些动作能推进任务","riskLevel":"low|medium|high","actions":[{"type":"openUrl|click|type|hotkey|scroll|switchWindow","description":"动作说明","params":{}}]}',
    '参数规则：openUrl.params.url 必须是网址；click.params.x/y 必须是屏幕像素坐标；type.params.text 必须是要输入的文本；hotkey.params.keys 必须是字符串数组；scroll.params.direction 为 up/down，可带 amount；switchWindow.params 可为空。',
    '不要生成删除、购买、付款、发送消息、提交表单等高影响动作，除非用户明确要求；即使生成也必须标为 high。',
    `任务目标：${task.goal}`,
    task.plan ? `当前计划：${task.plan.explanation}` : '',
    instruction ? `用户补充：${instruction}` : '',
    screenContext ? `屏幕上下文：${screenContext}` : '',
    recentEvents.length ? `最近任务事件：${JSON.stringify(recentEvents)}` : '',
  ].filter(Boolean).join('\n');
}

function getReadiness(config: AblePathConfig, env: Record<string, string | undefined>): ReadinessResponse {
  const providers = getProviderHealth(config, env);
  const chatReady = providers.some((provider) => provider.status === 'configured' && provider.capabilities.includes('chat'));
  const visionReady = providers.some((provider) => provider.status === 'configured' && provider.capabilities.includes('vision'));
  const realtimeReady = providers.some((provider) => provider.status === 'configured' && provider.capabilities.includes('realtime'));
  const voice = getVoiceStatus(env);
  const screen = getScreenStatus();
  const control = getControlStatus();
  const items: ReadinessItem[] = [
    {
      id: 'ai',
      label: 'AI Provider',
      status: chatReady && visionReady ? 'ready' : chatReady || visionReady || realtimeReady ? 'limited' : 'needs-setup',
      details: `chat ${chatReady ? 'ready' : 'missing'} · vision ${visionReady ? 'ready' : 'missing'} · realtime ${realtimeReady ? 'ready' : 'missing'}`,
      setupHints: providers
        .filter((provider) => provider.missingEnv.length > 0)
        .map((provider) => `${provider.displayName}: set ${provider.missingEnv.join(', ')}`),
    },
    {
      id: 'voice',
      label: 'Voice',
      status: voice.audio.canRecord && voice.tts.canSpeak && voice.realtime.canStart
        ? 'ready'
        : voice.audio.canRecord || voice.tts.canSpeak || voice.realtime.configured
          ? 'limited'
          : 'needs-setup',
      details: `record ${voice.audio.canRecord ? 'ready' : 'missing'} · tts ${voice.tts.canSpeak ? 'ready' : 'missing'} · realtime ${voice.realtime.canStart ? 'ready' : 'missing'}`,
      setupHints: voice.realtime.setupHints,
    },
    {
      id: 'screen',
      label: 'Screen',
      status: screen.canCapture ? 'ready' : 'needs-setup',
      details: screen.canCapture ? `capture via ${screen.backend}` : 'screen capture unavailable',
      setupHints: screen.setupHints,
    },
    {
      id: 'control',
      label: 'Computer Control',
      status: control.canExecute
        ? Object.values(control.capabilities).every(Boolean)
          ? 'ready'
          : 'limited'
        : 'needs-setup',
      details: `openUrl ${control.capabilities.openUrl ? 'ready' : 'missing'} · desktop actions ${control.capabilities.click ? 'ready' : 'missing'}`,
      setupHints: control.setupHints,
    },
    {
      id: 'caregivers',
      label: 'Caregivers',
      status: config.caregivers.length > 0 ? 'ready' : 'limited',
      details: `${config.caregivers.length} configured`,
      setupHints: config.caregivers.length > 0 ? [] : ['Add at least one trusted caregiver in Settings.'],
    },
    {
      id: 'safety',
      label: 'Safety',
      status: config.safety.requireConfirmationFor.length > 0 ? 'ready' : 'limited',
      details: `${config.safety.requireConfirmationFor.length} action types require confirmation`,
      setupHints: config.safety.requireConfirmationFor.length > 0
        ? []
        : ['Keep confirmation requirements enabled for high-risk computer control.'],
    },
  ];

  const totals = {
    ready: items.filter((item) => item.status === 'ready').length,
    limited: items.filter((item) => item.status === 'limited').length,
    'needs-setup': items.filter((item) => item.status === 'needs-setup').length,
  };

  return { items, totals };
}

function getMvpChecklist(config: AblePathConfig, env: Record<string, string | undefined>): MvpChecklistResponse {
  const providers = getProviderHealth(config, env);
  const voice = getVoiceStatus(env);
  const screen = getScreenStatus();
  const control = getControlStatus();
  const chatReady = providers.some((provider) => provider.status === 'configured' && provider.capabilities.includes('chat'));
  const visionReady = providers.some((provider) => provider.status === 'configured' && provider.capabilities.includes('vision'));
  const realtimeProvider = providers.find((provider) => provider.capabilities.includes('realtime'));
  const caregiverWithValidToken = config.caregivers.some((caregiver) => hasValidCaregiverToken(caregiver));
  const desktopActionsReady = control.capabilities.click
    && control.capabilities.type
    && control.capabilities.hotkey
    && control.capabilities.scroll
    && control.capabilities.switchWindow;
  const requiredConfirmationsReady = hasMvpRequiredConfirmations(config);

  const sections = [
    {
      id: 'ai',
      label: 'AI 能力',
      items: [
        checklistItem({
          id: 'provider-chat-vision',
          label: '对话与屏幕理解密钥',
          status: chatReady && visionReady ? 'pass' : chatReady || visionReady ? 'warning' : 'fail',
          details: `chat ${chatReady ? 'ready' : 'missing'} · vision ${visionReady ? 'ready' : 'missing'}`,
          nextStep: chatReady && visionReady ? 'Use Chat and Screen analysis in a normal session.' : 'Set provider keys in ablepath/.env.',
          setupHints: providers
            .filter((provider) => provider.capabilities.some((capability) => capability === 'chat' || capability === 'vision'))
            .filter((provider) => provider.missingEnv.length > 0)
            .map((provider) => `${provider.displayName}: set ${provider.missingEnv.join(', ')}`),
        }),
        checklistItem({
          id: 'provider-realtime',
          label: '实时语音密钥',
          status: voice.realtime.configured ? 'pass' : 'fail',
          details: realtimeProvider
            ? `${realtimeProvider.displayName} ${voice.realtime.configured ? 'configured' : 'missing config'}`
            : 'no realtime provider configured',
          nextStep: voice.realtime.configured ? 'Start realtime voice from Chat.' : 'Set realtime voice keys in ablepath/.env.',
          setupHints: realtimeProvider?.missingEnv.length
            ? [`${realtimeProvider.displayName}: set ${realtimeProvider.missingEnv.join(', ')}`]
            : [],
        }),
      ],
    },
    {
      id: 'host',
      label: '目标电脑能力',
      items: [
        checklistItem({
          id: 'voice-input',
          label: '语音输入',
          status: voice.audio.canRecord ? 'pass' : 'fail',
          details: voice.audio.canRecord ? `recording via ${voice.audio.backend}` : 'no recorder command available',
          nextStep: voice.audio.canRecord ? 'Run a short listen test from Chat.' : 'Install a supported recorder and confirm microphone access.',
          setupHints: voice.audio.canRecord ? [] : [recordingSetupHint()],
        }),
        checklistItem({
          id: 'voice-output',
          label: '语音输出',
          status: voice.tts.canSpeak ? 'pass' : 'warning',
          details: voice.tts.canSpeak ? `TTS via ${voice.tts.engine}` : 'no local TTS command available',
          nextStep: voice.tts.canSpeak ? 'Play a test response from Chat.' : 'Install a local TTS command if spoken feedback is needed.',
          setupHints: voice.tts.canSpeak ? [] : ['Linux TTS: install espeak-ng. macOS can use the built-in say command.'],
        }),
        checklistItem({
          id: 'screen-capture',
          label: '屏幕截图',
          status: screen.canCapture ? 'pass' : 'fail',
          details: screen.canCapture ? `capture via ${screen.backend}` : 'no screenshot backend available',
          nextStep: screen.canCapture ? 'Capture and analyze the current screen.' : 'Install a supported screenshot backend and run inside a desktop session.',
          setupHints: screen.setupHints,
        }),
        checklistItem({
          id: 'desktop-control',
          label: '电脑控制',
          status: desktopActionsReady ? 'pass' : control.capabilities.openUrl ? 'warning' : 'fail',
          details: `openUrl ${control.capabilities.openUrl ? 'ready' : 'missing'} · desktop actions ${desktopActionsReady ? 'ready' : 'missing'}`,
          nextStep: desktopActionsReady ? 'Dry-run and then confirm a simple click plan.' : 'Install xdotool for mouse, keyboard, scrolling, and window switching.',
          setupHints: control.setupHints,
        }),
      ],
    },
    {
      id: 'caregiver-safety',
      label: '家属与安全边界',
      items: [
        checklistItem({
          id: 'caregiver-profile',
          label: '家属联系人',
          status: config.caregivers.length > 0 ? 'pass' : 'warning',
          details: `${config.caregivers.length} configured`,
          nextStep: config.caregivers.length > 0 ? 'Confirm the caregiver list in Settings.' : 'Add at least one trusted caregiver in Settings.',
          setupHints: config.caregivers.length > 0 ? [] : ['Add a caregiver profile before a real trial.'],
        }),
        checklistItem({
          id: 'caregiver-pairing',
          label: '家属配对链接',
          status: caregiverWithValidToken ? 'pass' : config.caregivers.length > 0 ? 'warning' : 'fail',
          details: caregiverWithValidToken ? 'at least one unexpired caregiver token exists' : 'no active caregiver token stored',
          nextStep: caregiverWithValidToken ? 'Open the caregiver link on a second device.' : 'Generate a caregiver access link in Settings.',
          setupHints: caregiverWithValidToken ? [] : ['Use Settings to create a time-limited caregiver link.'],
        }),
        checklistItem({
          id: 'safety-confirmation',
          label: '高风险操作确认',
          status: requiredConfirmationsReady ? 'pass' : 'warning',
          details: `${config.safety.requireConfirmationFor.length} action types require confirmation`,
          nextStep: requiredConfirmationsReady ? 'Keep confirmations enabled during MVP trials.' : 'Enable confirmation for click, type, hotkey, and openUrl.',
          setupHints: requiredConfirmationsReady ? [] : ['Require confirmation for click, type, hotkey, and openUrl actions.'],
        }),
        checklistItem({
          id: 'inactivity-monitoring',
          label: '无活动监测',
          status: config.safety.inactivityTimeoutMs > 0 ? 'pass' : 'warning',
          details: config.safety.inactivityTimeoutMs > 0
            ? `${Math.round(config.safety.inactivityTimeoutMs / 60000)} minute timeout`
            : 'disabled',
          nextStep: config.safety.inactivityTimeoutMs > 0 ? 'Run a manual inactivity check from Settings.' : 'Set an inactivity timeout for caregiver reassurance.',
          setupHints: config.safety.inactivityTimeoutMs > 0 ? [] : ['Configure inactivity timeout in Settings.'],
        }),
      ],
    },
  ];
  const items = sections.flatMap((section) => section.items);
  const totals = {
    pass: items.filter((item) => item.status === 'pass').length,
    warning: items.filter((item) => item.status === 'warning').length,
    fail: items.filter((item) => item.status === 'fail').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    sections,
    totals,
  };
}

function checklistItem(item: MvpChecklistItem): MvpChecklistItem {
  return item;
}

function hasValidCaregiverToken(caregiver: CaregiverProfile): boolean {
  const stored = caregiver as StoredCaregiverProfile;
  return Boolean(stored.accessTokenHash) && !isCaregiverTokenExpired(stored);
}

function hasMvpRequiredConfirmations(config: AblePathConfig): boolean {
  return MVP_REQUIRED_CONFIRMATIONS.every((action) => config.safety.requireConfirmationFor.includes(action));
}

function getVoiceStatus(env: Record<string, string | undefined>): VoiceStatusResponse {
  const audio = getAudioStatus();
  const tts = getTTSStatus();
  const realtimeConfig = createRealtimeConfigFromEnv(env);
  const setupHints: string[] = [];

  if (!audio.canRecord) {
    setupHints.push(recordingSetupHint());
  }
  if (!tts.canSpeak) {
    setupHints.push('Linux TTS: install espeak-ng. macOS can use the built-in say command.');
  }
  if (realtimeConfig.missingEnv.length > 0) {
    setupHints.push(`Set ${realtimeConfig.missingEnv.join(', ')} in ablepath/.env.`);
  }

  return {
    audio,
    tts,
    realtime: {
      configured: realtimeConfig.missingEnv.length === 0,
      canStart: realtimeConfig.missingEnv.length === 0 && audio.canRecord,
      missingEnv: realtimeConfig.missingEnv,
      setupHints,
    },
  };
}

function getEmergencyStatus(
  emergencyStore: EmergencyStore,
  config: AblePathConfig,
): EmergencyStatusResponse {
  return {
    current: emergencyStore.current(),
    recent: emergencyStore.recent(),
    countdownSec: emergencyStore.countdownSec(),
    caregivers: config.caregivers.map((caregiver) => ({
      id: caregiver.id,
      name: caregiver.name,
      relationship: caregiver.relationship,
      canReceiveEmergency: caregiver.permissions.includes('receive-emergency'),
      hasWebhook: Boolean(caregiver.notificationWebhook),
    })),
  };
}

function recordingSetupHint(): string {
  if (process.platform === 'win32') {
    return 'Windows recorder: allow microphone access and make sure Windows PowerShell is available.';
  }
  if (process.platform === 'linux' && process.env.WSL_DISTRO_NAME) {
    return 'WSL recorder: install pulseaudio-utils, alsa-utils, or sox, or enable Windows PowerShell interop.';
  }
  return 'Linux recorder: install pulseaudio-utils, alsa-utils, or sox. macOS recording needs a compatible recorder command.';
}

function normalizeCaregiver(request: CaregiverUpsertRequest, existing?: CaregiverProfile): CaregiverProfile {
  const requestedPermissions: CaregiverPermission[] = request.permissions?.length
    ? request.permissions
    : ['receive-emergency'];
  const permissions = requestedPermissions
    .filter(isAllowedCaregiverPermission)
    .filter((permission, index, values) => values.indexOf(permission) === index);
  const storedExisting = existing as StoredCaregiverProfile | undefined;
  return {
    id: request.id?.trim() || `caregiver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: request.name.trim(),
    relationship: request.relationship?.trim() || 'family',
    permissions,
    notificationWebhook: request.notificationWebhook?.trim() || undefined,
    ...(storedExisting?.accessTokenHash ? { accessTokenHash: storedExisting.accessTokenHash } : {}),
    ...(storedExisting?.accessTokenCreatedAt ? { accessTokenCreatedAt: storedExisting.accessTokenCreatedAt } : {}),
    ...(storedExisting?.accessTokenExpiresAt ? { accessTokenExpiresAt: storedExisting.accessTokenExpiresAt } : {}),
  };
}

function isAllowedCaregiverPermission(permission: string): permission is CaregiverPermission {
  return (CAREGIVER_PERMISSIONS as string[]).includes(permission);
}

function sanitizeConfig(config: AblePathConfig): AblePathConfig {
  return {
    ...config,
    caregivers: config.caregivers.map(sanitizeCaregiver),
  };
}

function sanitizeCaregiver(caregiver: CaregiverProfile): CaregiverProfile {
  const stored = caregiver as StoredCaregiverProfile;
  return {
    id: caregiver.id,
    name: caregiver.name,
    relationship: caregiver.relationship,
    permissions: caregiver.permissions,
    notificationWebhook: caregiver.notificationWebhook,
    accessTokenCreatedAt: stored.accessTokenHash ? caregiver.accessTokenCreatedAt : undefined,
    accessTokenExpiresAt: stored.accessTokenHash ? caregiver.accessTokenExpiresAt : undefined,
  };
}

function preserveCaregiverTokenSecrets(
  incoming: CaregiverProfile[],
  existing: CaregiverProfile[],
): CaregiverProfile[] {
  const existingById = new Map(existing.map((caregiver) => [caregiver.id, caregiver as StoredCaregiverProfile]));
  return incoming.map((caregiver) => {
    const stored = existingById.get(caregiver.id);
    return {
      ...caregiver,
      ...(stored?.accessTokenHash ? { accessTokenHash: stored.accessTokenHash } : {}),
      ...(stored?.accessTokenCreatedAt ? { accessTokenCreatedAt: stored.accessTokenCreatedAt } : {}),
      ...(stored?.accessTokenExpiresAt ? { accessTokenExpiresAt: stored.accessTokenExpiresAt } : {}),
    };
  });
}

function hashCaregiverToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function findCaregiverByToken(caregivers: CaregiverProfile[], token: string): CaregiverProfile | undefined {
  if (!token) return undefined;
  const tokenHash = hashCaregiverToken(token);
  return caregivers.find((caregiver) => {
    const stored = caregiver as StoredCaregiverProfile;
    if (!stored.accessTokenHash) return false;
    const left = Buffer.from(stored.accessTokenHash, 'hex');
    const right = Buffer.from(tokenHash, 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  });
}

function getBearerToken(headers: ApiRequest['headers']): string | undefined {
  const raw = headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = typeof value === 'string' ? value.match(/^Bearer\s+(.+)$/i) : null;
  return match?.[1]?.trim() || undefined;
}

export function isPublicApiRequest(method: string, pathname: string): boolean {
  if (method === 'GET' && pathname === '/api/health') return true;
  if (method === 'GET' && pathname === '/api/caregiver/summary-token') return true;
  return false;
}

export function ownerSessionCookie(token: string): string {
  return `${OWNER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`;
}

export function shouldSetOwnerSessionCookie(pathname: string): boolean {
  if (pathname === '/caregiver' || pathname.startsWith('/caregiver/')) return false;
  if (pathname.startsWith('/assets/')) return false;
  return true;
}

export function hasOwnerSession(cookieHeader: string | undefined, token: string): boolean {
  if (!cookieHeader || !token) return false;
  const cookies = cookieHeader.split(';').map((item) => item.trim());
  const prefix = `${OWNER_SESSION_COOKIE}=`;
  const cookie = cookies.find((item) => item.startsWith(prefix));
  if (!cookie) return false;
  try {
    return safeEqual(decodeURIComponent(cookie.slice(prefix.length)), token);
  } catch {
    return false;
  }
}

export function toApiErrorResponse(err: unknown): ApiErrorResponse {
  const message = err instanceof Error ? err.message : String(err || 'Internal server error');
  if (isSetupRequiredError(message)) {
    return {
      status: 424,
      body: {
        error: message,
        code: 'setup-required',
        setupHints: setupHintsForError(message),
      },
    };
  }

  return {
    status: 500,
    body: { error: message || 'Internal server error' },
  };
}

function isSetupRequiredError(message: string): boolean {
  return [
    'No audio recording backend found.',
    'Recording failed',
    'Recording file is empty.',
    'STT is not configured.',
    'No screen capture backend found.',
    'Screen capture file is empty.',
  ].some((prefix) => message.startsWith(prefix));
}

function setupHintsForError(message: string): string[] {
  if (message.startsWith('No audio recording backend found.') || message.startsWith('Recording failed')) {
    return [recordingSetupHint()];
  }
  if (message.startsWith('Recording file is empty.')) {
    return ['Check microphone permissions, selected input device, and desktop/audio session access.'];
  }
  if (message.startsWith('STT is not configured.')) {
    return ['Set VOLC_ASR_APP_KEY and VOLC_ASR_ACCESS_KEY in ablepath/.env.'];
  }
  if (message.startsWith('No screen capture backend found.')) {
    return ['Install a supported screenshot tool such as grim, scrot, gnome-screenshot, ImageMagick import, or use macOS screencapture.'];
  }
  if (message.startsWith('Screen capture file is empty.')) {
    return ['Check desktop session access and screenshot permissions.'];
  }
  return [];
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeTokenDays(value: unknown): number {
  const days = Number(value ?? DEFAULT_CAREGIVER_TOKEN_DAYS);
  if (!Number.isFinite(days)) return DEFAULT_CAREGIVER_TOKEN_DAYS;
  return Math.max(1, Math.min(365, Math.round(days)));
}

function isCaregiverTokenExpired(caregiver: StoredCaregiverProfile): boolean {
  if (!caregiver.accessTokenExpiresAt) return true;
  const expiresAt = Date.parse(caregiver.accessTokenExpiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= Date.now();
}

type AgentScreenContextResult = {
  context: string;
  sessionStep?: {
    type: 'screen-analysis' | 'error';
    summary: string;
    details?: Record<string, unknown>;
    toolCalls?: AgentToolCall[];
  };
};

async function collectAgentScreenContext(
  sessionId: string,
  provider: ChatProvider,
  homeDir?: string,
): Promise<AgentScreenContextResult> {
  const captureTool: AgentToolCall = {
    id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'screen.capture',
    summary: 'Capture current desktop screen',
    ok: false,
  };
  const analyzeTool: AgentToolCall = {
    id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'screen.analyze',
    summary: 'Analyze screen for agent planning context',
    ok: false,
  };

  try {
    cleanupOldScreenshots(homeDir);
    const capture = await captureScreen({}, homeDir);
    captureTool.ok = true;
    captureTool.details = {
      path: capture.path,
      backend: capture.backend,
      sizeBytes: capture.sizeBytes,
      width: capture.width,
      height: capture.height,
      capturedAt: capture.capturedAt,
    };
    const analysis = await provider.vision({
      question: [
        'Describe the current desktop screen for an accessibility control agent.',
        capture.width && capture.height ? `Screenshot size is ${capture.width}x${capture.height} screen pixels.` : '',
        'List visible apps, focused fields, actionable buttons/links, and useful coordinates only as absolute screen pixels within the screenshot size.',
        'If the user wants to launch an installed app, prefer the openApp action during planning instead of clicking the Windows Start/menu/search area.',
        `Agent session: ${sessionId}`,
      ].filter(Boolean).join('\n'),
      imagePath: capture.path,
      mimeType: capture.mimeType,
    });
    analyzeTool.ok = true;
    analyzeTool.details = { provider: analysis.provider };
    return {
      context: analysis.response.trim(),
      sessionStep: {
        type: 'screen-analysis',
        summary: `Screen context collected via ${analysis.provider}`,
        details: { capturePath: capture.path, provider: analysis.provider },
        toolCalls: [captureTool, analyzeTool],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!captureTool.ok) captureTool.details = { error: message };
    else analyzeTool.details = { error: message };
    return {
      context: '',
      sessionStep: {
        type: 'error',
        summary: `Screen context unavailable: ${message}`,
        details: { error: message },
        toolCalls: [captureTool, analyzeTool],
      },
    };
  }
}

function getCaregiverSummary(
  caregiver: CaregiverProfile,
  activityStore: ActivityStore,
  emergencyStore: EmergencyStore,
  taskStore: TaskStore,
): CaregiverSummaryResponse {
  const summary: CaregiverSummaryResponse = {
    caregiver: {
      id: caregiver.id,
      name: caregiver.name,
      relationship: caregiver.relationship,
      permissions: caregiver.permissions,
    },
  };

  if (caregiver.permissions.includes('receive-emergency')) {
    summary.emergency = {
      current: emergencyStore.current(),
      recent: emergencyStore.recent(10),
    };
  }

  if (caregiver.permissions.includes('view-activity')) {
    summary.activity = {
      stats: activityStore.stats(24),
      recent: activityStore.recent(24).slice(-20).reverse().map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        type: entry.type,
        summary: redactActivitySummaryForCaregiver(entry),
        riskLevel: entry.riskLevel,
      })),
    };
  }

  if (caregiver.permissions.includes('view-screen')) {
    const screenStatus = getScreenStatus();
    summary.screen = {
      canCapture: screenStatus.canCapture,
      backend: screenStatus.backend,
    };
  }

  if (caregiver.permissions.includes('view-task-summary')) {
    summary.tasks = {
      recent: taskStore.recent(10).map((task) => {
        const audit = buildTaskAudit(task);
        return {
          id: task.id,
          label: `Task ${task.id.slice(-6)}`,
          status: task.status,
          riskLevel: task.plan?.riskLevel,
          updatedAt: task.updatedAt,
          aiPlans: audit.totals.aiPlans,
          blockedActions: audit.totals.blockedActions,
          executions: audit.totals.executions,
          failedActions: audit.totals.failedActions,
        };
      }),
    };
  }

  return summary;
}

function redactActivitySummaryForCaregiver(entry: ActivityLogEntry): string {
  switch (entry.type) {
    case 'voice-command':
      return 'Voice command activity';
    case 'text-command':
      return 'Text command activity';
    case 'ai-chat':
      return 'AI chat activity';
    case 'screen-capture':
      return 'Screen activity';
    case 'computer-control':
      return 'Computer control activity';
    case 'emergency':
      return 'Emergency activity';
    case 'caregiver-event':
      return 'Caregiver setting activity';
    case 'system-event':
      return 'System activity';
  }
}

function publishEmergency(
  event: EmergencyEvent,
  eventBus: AblePathEventBus,
  activityStore: ActivityStore,
  notifications: Array<{ caregiverId: string; ok: boolean; skipped?: boolean; error?: string }>,
): void {
  const entry = activityStore.add('emergency', `Emergency state: ${event.state}`, {
    details: { event, notifications },
    riskLevel: event.state === 'active' ? 'high' : 'medium',
  });
  eventBus.publish({ type: 'emergency.changed', event });
  eventBus.publish({ type: 'activity.created', entry });

  for (const notification of notifications) {
    const notificationEntry = activityStore.add(
      'caregiver-event',
      `Emergency notification ${notification.ok ? 'sent' : 'failed'}`,
      { details: notification, riskLevel: event.state === 'active' ? 'high' : 'medium' },
    );
    eventBus.publish({ type: 'activity.created', entry: notificationEntry });
  }
}

function resolveWebDistDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}
