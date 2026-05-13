import type {
  AblePathConfig,
  AgentCommandRequest,
  AgentCommandResponse,
  AgentConfirmRequest,
  AgentConfirmResponse,
  AgentListResponse,
  AgentStepRequest,
  AgentStepResponse,
  AgentStopRequest,
  AgentStopResponse,
  AudioDevice,
  ActivityLogEntry,
  ActionPlan,
  CaregiverProfile,
  CaregiverRemoveRequest,
  CaregiverSummaryResponse,
  CaregiverTokenCreateResponse,
  CaregiverUpsertRequest,
  ChatResponse,
  ControlExecuteResponse,
  ControlStatusResponse,
  ControlTargetPlanRequest,
  EmergencyEvent,
  EmergencyStatusResponse,
  HealthResponse,
  InactivityCheckResponse,
  InactivityStatusResponse,
  ListenResponse,
  MvpChecklistResponse,
  ProviderHealth,
  ReadinessResponse,
  ScreenAnalyzeResponse,
  ScreenCaptureResponse,
  ScreenTargetsResponse,
  ScreenStatusResponse,
  TTSResponse,
  TaskAdvanceRequest,
  TaskAdvanceScreenRequest,
  TaskAdvanceScreenResponse,
  TaskAuditResponse,
  TaskCancelRequest,
  TaskExecuteResponse,
  TaskListResponse,
  TaskPlanAiRequest,
  TaskPlanAiResponse,
  TaskStartResponse,
  VoiceStatusResponse,
  SafetyConfig,
  SafetyUpdateRequest,
} from '@ablepath/shared';

export interface ApiErrorBody {
  error?: string;
  code?: string;
  setupHints?: string[];
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly setupHints: string[];

  constructor(status: number, body: ApiErrorBody = {}) {
    super(body.error ?? `Request failed: ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.setupHints = body.setupHints ?? [];
  }
}

export function isSetupRequiredError(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError && err.code === 'setup-required';
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function getHealth(): Promise<HealthResponse> {
  return getJson('/api/health');
}

export async function getConfig(): Promise<AblePathConfig> {
  return getJson('/api/config');
}

export async function getRecentActivity(): Promise<{ entries: ActivityLogEntry[] }> {
  return getJson('/api/activity/recent');
}

export async function getActivityStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  lastActivityTime: string | null;
}> {
  return getJson('/api/activity/stats');
}

export async function getProviderStatus(): Promise<{ providers: ProviderHealth[] }> {
  return getJson('/api/providers/status');
}

export async function getReadiness(): Promise<ReadinessResponse> {
  return getJson('/api/readiness');
}

export async function getMvpChecklist(): Promise<MvpChecklistResponse> {
  return getJson('/api/mvp/checklist');
}

export async function getEmergencyStatus(): Promise<EmergencyStatusResponse> {
  return getJson('/api/emergency/status');
}

export async function getInactivityStatus(): Promise<InactivityStatusResponse> {
  return getJson('/api/inactivity/status');
}

export async function checkInactivity(): Promise<InactivityCheckResponse> {
  return postJson('/api/inactivity/check', {});
}

export async function getCaregivers(): Promise<{ caregivers: CaregiverProfile[] }> {
  return getJson('/api/caregivers');
}

export async function getCaregiverSummary(caregiverId: string): Promise<CaregiverSummaryResponse> {
  return getJson(`/api/caregiver/summary?caregiverId=${encodeURIComponent(caregiverId)}`);
}

export async function getCaregiverSummaryWithToken(token: string): Promise<CaregiverSummaryResponse> {
  return getJson('/api/caregiver/summary-token', {
    Authorization: `Bearer ${token}`,
  });
}

export async function generateCaregiverToken(
  caregiverId: string,
  expiresInDays?: number,
): Promise<CaregiverTokenCreateResponse> {
  return postJson('/api/caregivers/token', { caregiverId, expiresInDays });
}

export async function revokeCaregiverToken(
  caregiverId: string,
): Promise<{ caregiver: CaregiverProfile; caregivers: CaregiverProfile[] }> {
  return postJson('/api/caregivers/token/revoke', { caregiverId });
}

export async function upsertCaregiver(
  request: CaregiverUpsertRequest,
): Promise<{ caregiver: CaregiverProfile; caregivers: CaregiverProfile[] }> {
  return postJson('/api/caregivers/upsert', request);
}

export async function removeCaregiver(request: CaregiverRemoveRequest): Promise<{ caregivers: CaregiverProfile[] }> {
  return postJson('/api/caregivers/remove', request);
}

export async function updateSafetySettings(request: SafetyUpdateRequest): Promise<{ safety: SafetyConfig }> {
  return postJson('/api/safety/update', request);
}

export async function triggerEmergency(
  details: string,
  activateImmediately = false,
): Promise<{ event: EmergencyEvent; countdownSec: number | null }> {
  return postJson('/api/emergency/trigger', { trigger: 'manual', details, activateImmediately });
}

export async function confirmEmergency(details: string): Promise<{ event: EmergencyEvent }> {
  return postJson('/api/emergency/confirm', { details });
}

export async function cancelEmergency(details: string): Promise<{ event: EmergencyEvent }> {
  return postJson('/api/emergency/cancel', { details });
}

export async function resolveEmergency(details: string): Promise<{ event: EmergencyEvent }> {
  return postJson('/api/emergency/resolve', { details });
}

export async function getControlStatus(): Promise<ControlStatusResponse> {
  return getJson('/api/control/status');
}

export async function createControlPlan(intent: string): Promise<{ plan: ActionPlan }> {
  return postJson('/api/control/plan', { intent });
}

export async function executeControlPlan(
  planId: string,
  options: { confirmed?: boolean; dryRun?: boolean },
): Promise<ControlExecuteResponse> {
  return postJson('/api/control/execute', { planId, ...options });
}

export async function getRecentTasks(): Promise<TaskListResponse> {
  return getJson('/api/tasks/recent');
}

export async function getTaskAudit(taskId: string): Promise<TaskAuditResponse> {
  return getJson(`/api/tasks/audit?taskId=${encodeURIComponent(taskId)}`);
}

export async function startTask(goal: string): Promise<TaskStartResponse> {
  return postJson('/api/tasks/start', { goal });
}

export async function executeTask(
  taskId: string,
  options: { confirmed?: boolean; dryRun?: boolean },
): Promise<TaskExecuteResponse> {
  return postJson('/api/tasks/execute', { taskId, ...options });
}

export async function advanceTask(request: TaskAdvanceRequest): Promise<TaskExecuteResponse> {
  return postJson('/api/tasks/advance', request);
}

export async function advanceTaskFromScreen(request: TaskAdvanceScreenRequest): Promise<TaskAdvanceScreenResponse> {
  return postJson('/api/tasks/advance-screen', request);
}

export async function planTaskWithAi(request: TaskPlanAiRequest): Promise<TaskPlanAiResponse> {
  return postJson('/api/tasks/plan-ai', request);
}

export async function cancelTask(request: TaskCancelRequest): Promise<TaskExecuteResponse> {
  return postJson('/api/tasks/cancel', request);
}

export async function getRecentAgentSessions(): Promise<AgentListResponse> {
  return getJson('/api/agent/recent');
}

export async function createAgentCommand(request: AgentCommandRequest): Promise<AgentCommandResponse> {
  return postJson('/api/agent/command', request);
}

export async function confirmAgentPlan(request: AgentConfirmRequest): Promise<AgentConfirmResponse> {
  return postJson('/api/agent/confirm', request);
}

export async function stepAgentSession(request: AgentStepRequest): Promise<AgentStepResponse> {
  return postJson('/api/agent/step', request);
}

export async function stopAgentSession(request: AgentStopRequest): Promise<AgentStopResponse> {
  return postJson('/api/agent/stop', request);
}

export async function createControlPlanFromTarget(
  request: ControlTargetPlanRequest,
): Promise<{ plan: ActionPlan }> {
  return postJson('/api/control/plan-target', request);
}

export async function getScreenStatus(): Promise<ScreenStatusResponse> {
  return getJson('/api/screen/status');
}

export async function captureScreen(): Promise<ScreenCaptureResponse> {
  return postJson('/api/screen/capture', { includeImageBase64: true });
}

export async function analyzeScreen(question: string): Promise<ScreenAnalyzeResponse> {
  return postJson('/api/screen/analyze', { question, includeImageBase64: true });
}

export async function detectScreenTargets(question: string): Promise<ScreenTargetsResponse> {
  return postJson('/api/screen/targets', { question, includeImageBase64: true });
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  return postJson('/api/chat', { message });
}

export async function clearChatHistory(): Promise<{ ok: true }> {
  return postJson('/api/chat/history', {});
}

export async function getAudioDevices(): Promise<{
  devices: AudioDevice[];
  status: { backend: string | null; canRecord: boolean; missingRecordCommands: string[] };
}> {
  return getJson('/api/devices/audio');
}

export async function getVoiceStatus(): Promise<VoiceStatusResponse> {
  return getJson('/api/voice/status');
}

export async function listen(durationSec: number): Promise<ListenResponse> {
  return postJson('/api/listen', { durationSec });
}

export async function speak(text: string): Promise<TTSResponse> {
  return postJson('/api/tts', { text, priority: 'normal' });
}

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw await createApiError(response);
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new ApiRequestError(response.status, data);
  }
  return data as T;
}

async function createApiError(response: Response): Promise<ApiRequestError> {
  return new ApiRequestError(response.status, await readJson(response));
}

async function readJson(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {};
  }
}
