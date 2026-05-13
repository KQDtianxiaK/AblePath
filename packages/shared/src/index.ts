export type MotorCapability =
  | 'full'
  | 'limited-hands'
  | 'no-hands'
  | 'head-only'
  | 'eyes-only';

export type InputMethod =
  | 'voice'
  | 'text'
  | 'eye-tracking'
  | 'switch-scan'
  | 'head-tracking'
  | 'screen-vision';

export type OutputMethod = 'screen' | 'tts' | 'haptic' | 'braille';

export type ActivityType =
  | 'voice-command'
  | 'text-command'
  | 'ai-chat'
  | 'screen-capture'
  | 'computer-control'
  | 'emergency'
  | 'caregiver-event'
  | 'system-event';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ProviderCapability = 'chat' | 'vision' | 'realtime' | 'control' | 'task';

export type ProviderStatus = 'configured' | 'missing-config' | 'disabled' | 'error';

export type ControlActionType =
  | 'click'
  | 'doubleClick'
  | 'type'
  | 'hotkey'
  | 'scroll'
  | 'openUrl'
  | 'openApp'
  | 'switchWindow'
  | 'wait'
  | 'finished'
  | 'callUser';

export interface UserProfile {
  userId: string;
  displayName: string;
  motorCapability: MotorCapability;
  preferredInputs: InputMethod[];
  preferredOutputs: OutputMethod[];
}

export interface CaregiverProfile {
  id: string;
  name: string;
  relationship: string;
  permissions: CaregiverPermission[];
  notificationWebhook?: string;
  accessTokenCreatedAt?: string;
  accessTokenExpiresAt?: string;
}

export type CaregiverPermission =
  | 'receive-emergency'
  | 'view-activity'
  | 'view-screen'
  | 'view-task-summary'
  | 'remote-assist';

export interface ProviderConfig {
  defaultChat: string;
  defaultVision: string;
  defaultRealtime?: string;
  providers: Record<string, {
    enabled: boolean;
    displayName: string;
    capabilities: ProviderCapability[];
    requiredEnv: string[];
  }>;
}

export interface SafetyConfig {
  requireConfirmationFor: ControlActionType[];
  highRiskKeywords: string[];
  inactivityTimeoutMs: number;
  emergencyConfirmationTimeoutSec: number;
}

export interface AblePathConfig {
  productName: 'AblePath';
  locale: 'zh-CN' | 'en-US';
  profile: UserProfile;
  caregivers: CaregiverProfile[];
  providers: ProviderConfig;
  safety: SafetyConfig;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: ActivityType;
  summary: string;
  details?: Record<string, unknown>;
  riskLevel?: RiskLevel;
}

export interface ProviderHealth {
  id: string;
  displayName: string;
  status: ProviderStatus;
  capabilities: ProviderCapability[];
  missingEnv: string[];
}

export type ReadinessStatus = 'ready' | 'limited' | 'needs-setup';

export interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  details: string;
  setupHints: string[];
}

export interface ReadinessResponse {
  items: ReadinessItem[];
  totals: Record<ReadinessStatus, number>;
}

export type MvpChecklistStatus = 'pass' | 'warning' | 'fail';

export interface MvpChecklistItem {
  id: string;
  label: string;
  status: MvpChecklistStatus;
  details: string;
  nextStep: string;
  setupHints: string[];
}

export interface MvpChecklistSection {
  id: string;
  label: string;
  items: MvpChecklistItem[];
}

export interface MvpChecklistResponse {
  generatedAt: string;
  sections: MvpChecklistSection[];
  totals: Record<MvpChecklistStatus, number>;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  response: string;
  provider: string;
  turns: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface VisionAnalyzeRequest {
  question?: string;
  imageBase64?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  imagePath?: string;
}

export interface VisionAnalyzeResponse {
  response: string;
  provider: string;
  usage?: ChatResponse['usage'];
}

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenStatusResponse {
  canCapture: boolean;
  backend: string | null;
  missingCommands: string[];
  setupHints: string[];
}

export interface ScreenCaptureRequest {
  region?: ScreenRegion;
  includeImageBase64?: boolean;
}

export interface ScreenCaptureResponse {
  path: string;
  mimeType: 'image/png' | 'image/jpeg';
  sizeBytes: number;
  width?: number;
  height?: number;
  capturedAt: string;
  backend: string;
  imageBase64?: string;
}

export interface ScreenAnalyzeRequest extends ScreenCaptureRequest {
  question?: string;
}

export interface ScreenAnalyzeResponse {
  capture: ScreenCaptureResponse;
  analysis: VisionAnalyzeResponse;
}

export interface ScreenElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenElement {
  id: string;
  label: string;
  role: 'button' | 'input' | 'link' | 'menu' | 'text' | 'other';
  bounds: ScreenElementBounds;
  actionable: boolean;
  confidence: number;
}

export interface ScreenTargetsRequest extends ScreenAnalyzeRequest {
  imageBase64?: string;
  imagePath?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface ScreenTargetsResponse {
  capture?: ScreenCaptureResponse;
  rawAnalysis: string;
  elements: ScreenElement[];
}

export interface ControlTargetPlanRequest {
  targetId?: string;
  element?: ScreenElement;
  intent?: string;
}

export interface ControlAction {
  id: string;
  type: ControlActionType;
  description: string;
  params: Record<string, unknown>;
}

export interface ActionPlan {
  id: string;
  intent: string;
  steps: ControlAction[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  explanation: string;
  createdAt: string;
}

export interface AiPlanSafetyReview {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  warnings: string[];
  blockedActions: Array<{
    index: number;
    type?: ControlActionType;
    reason: string;
    description?: string;
  }>;
  riskReasons: string[];
}

export interface ControlPlanRequest {
  intent: string;
}

export interface ControlPlanResponse {
  plan: ActionPlan;
}

export interface ControlExecuteRequest {
  planId: string;
  confirmed?: boolean;
  dryRun?: boolean;
}

export interface ControlActionResult {
  actionId: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface ControlExecuteResponse {
  planId: string;
  executed: boolean;
  dryRun: boolean;
  results: ControlActionResult[];
}

export interface ControlStatusResponse {
  canExecute: boolean;
  capabilities: Record<ControlActionType, boolean>;
  missingCommands: string[];
  setupHints: string[];
}

export type AgentExecutionState =
  | 'idle'
  | 'planning'
  | 'needs-confirmation'
  | 'ready'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'stopped';

export type AgentSessionEventType =
  | 'created'
  | 'screen-capture'
  | 'screen-analysis'
  | 'ai-plan'
  | 'needs-confirmation'
  | 'execution'
  | 'stopped'
  | 'error';

export interface AgentToolCall {
  id: string;
  type: 'screen.capture' | 'screen.analyze' | 'control.plan' | 'control.execute' | 'sos.trigger' | 'settings.read';
  summary: string;
  ok: boolean;
  details?: Record<string, unknown>;
}

export interface AgentStep {
  id: string;
  timestamp: string;
  type: AgentSessionEventType;
  summary: string;
  toolCalls?: AgentToolCall[];
  details?: Record<string, unknown>;
}

export interface AgentPlanPreview {
  plan: ActionPlan;
  rawResponse?: string;
  provider?: string;
  warnings: string[];
  safetyReview: AiPlanSafetyReview;
}

export interface AgentSession {
  id: string;
  command: string;
  status: AgentExecutionState;
  plan?: ActionPlan;
  preview?: AgentPlanPreview;
  execution?: ControlExecuteResponse;
  error?: string;
  steps: AgentStep[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentCommandRequest {
  command: string;
  includeScreen?: boolean;
}

export interface AgentCommandResponse {
  session: AgentSession;
}

export interface AgentConfirmRequest {
  sessionId: string;
  confirmed?: boolean;
  dryRun?: boolean;
}

export interface AgentConfirmResponse {
  session: AgentSession;
}

export interface AgentStepRequest {
  sessionId: string;
  instruction?: string;
  includeScreen?: boolean;
}

export interface AgentStepResponse {
  session: AgentSession;
}

export interface AgentStopRequest {
  sessionId: string;
  reason?: string;
}

export interface AgentStopResponse {
  session: AgentSession;
}

export interface AgentListResponse {
  sessions: AgentSession[];
}

export type EmergencyState = 'normal' | 'pending-confirmation' | 'active' | 'resolved';

export interface EmergencyEvent {
  id: string;
  timestamp: string;
  state: EmergencyState;
  trigger: 'manual' | 'voice' | 'inactivity' | 'caregiver' | 'system';
  details: string;
  autoActivateAt?: string;
  resolvedAt?: string;
}

export interface EmergencyTriggerRequest {
  trigger?: EmergencyEvent['trigger'];
  details?: string;
  activateImmediately?: boolean;
}

export interface EmergencyActionRequest {
  details?: string;
}

export interface CaregiverNotificationResult {
  caregiverId: string;
  caregiverName: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface EmergencyStatusResponse {
  current: EmergencyEvent;
  recent: EmergencyEvent[];
  countdownSec: number | null;
  caregivers: Array<{
    id: string;
    name: string;
    relationship: string;
    canReceiveEmergency: boolean;
    hasWebhook: boolean;
  }>;
}

export interface CaregiverUpsertRequest {
  id?: string;
  name: string;
  relationship?: string;
  permissions?: CaregiverPermission[];
  notificationWebhook?: string;
}

export interface CaregiverRemoveRequest {
  id: string;
}

export interface CaregiverTokenCreateRequest {
  caregiverId: string;
  expiresInDays?: number;
}

export interface CaregiverTokenCreateResponse {
  caregiverId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface CaregiverTokenRevokeRequest {
  caregiverId: string;
}

export interface InactivityStatusResponse {
  enabled: boolean;
  timeoutMs: number;
  lastActivityTime: string | null;
  inactiveMs: number;
  wouldTrigger: boolean;
  emergencyState: EmergencyState;
}

export interface InactivityCheckResponse extends InactivityStatusResponse {
  triggered: boolean;
  event?: EmergencyEvent;
}

export interface CaregiverActivitySummary {
  id: string;
  timestamp: string;
  type: ActivityType;
  summary: string;
  riskLevel?: RiskLevel;
}

export interface CaregiverSummaryResponse {
  caregiver: {
    id: string;
    name: string;
    relationship: string;
    permissions: CaregiverPermission[];
  };
  emergency?: {
    current: EmergencyEvent;
    recent: EmergencyEvent[];
  };
  activity?: {
    stats: {
      total: number;
      byType: Record<string, number>;
      lastActivityTime: string | null;
    };
    recent: CaregiverActivitySummary[];
  };
  screen?: {
    canCapture: boolean;
    backend: string | null;
  };
  tasks?: {
    recent: CaregiverTaskSummary[];
  };
}

export interface CaregiverTaskSummary {
  id: string;
  label: string;
  status: TaskSessionStatus;
  riskLevel?: RiskLevel;
  updatedAt: string;
  aiPlans: number;
  blockedActions: number;
  executions: number;
  failedActions: number;
}

export interface SafetyUpdateRequest {
  inactivityTimeoutMs?: number;
  emergencyConfirmationTimeoutSec?: number;
}

export type TaskSessionStatus =
  | 'planning'
  | 'awaiting-confirmation'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskSession {
  id: string;
  goal: string;
  status: TaskSessionStatus;
  plan?: ActionPlan;
  execution?: ControlExecuteResponse;
  error?: string;
  events?: TaskSessionEvent[];
  createdAt: string;
  updatedAt: string;
}

export type TaskSessionEventType =
  | 'created'
  | 'user-note'
  | 'screen-context'
  | 'screen-analysis'
  | 'ai-plan'
  | 'plan-updated'
  | 'execution'
  | 'cancelled';

export interface TaskSessionEvent {
  id: string;
  timestamp: string;
  type: TaskSessionEventType;
  summary: string;
  details?: Record<string, unknown>;
}

export interface TaskStartRequest {
  goal: string;
}

export interface TaskStartResponse {
  task: TaskSession;
}

export interface TaskExecuteRequest {
  taskId: string;
  confirmed?: boolean;
  dryRun?: boolean;
}

export interface TaskExecuteResponse {
  task: TaskSession;
}

export interface TaskAdvanceRequest {
  taskId: string;
  instruction?: string;
  screenContext?: string;
}

export interface TaskAdvanceScreenRequest {
  taskId: string;
  instruction?: string;
  question?: string;
  region?: ScreenRegion;
  imageBase64?: string;
  imagePath?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface TaskAdvanceScreenResponse {
  task: TaskSession;
  analysis: VisionAnalyzeResponse;
  capture?: ScreenCaptureResponse;
}

export interface TaskPlanAiRequest {
  taskId: string;
  instruction?: string;
  screenContext?: string;
}

export interface TaskPlanAiResponse {
  task: TaskSession;
  rawResponse: string;
  provider: string;
  warnings: string[];
  safetyReview: AiPlanSafetyReview;
}

export interface TaskCancelRequest {
  taskId: string;
  reason?: string;
}

export interface TaskListResponse {
  tasks: TaskSession[];
}

export interface TaskAuditEntry {
  id: string;
  timestamp: string;
  type: TaskSessionEventType | 'current-plan' | 'current-execution';
  summary: string;
  riskLevel?: RiskLevel;
  planId?: string;
  safetyReview?: AiPlanSafetyReview;
  warnings?: string[];
  blockedActions?: AiPlanSafetyReview['blockedActions'];
  execution?: ControlExecuteResponse;
  details?: Record<string, unknown>;
}

export interface TaskAuditResponse {
  task: {
    id: string;
    goal: string;
    status: TaskSessionStatus;
    createdAt: string;
    updatedAt: string;
  };
  totals: {
    events: number;
    aiPlans: number;
    blockedActions: number;
    executions: number;
    failedActions: number;
  };
  entries: TaskAuditEntry[];
}

export type AblePathEvent =
  | { type: 'activity.created'; entry: ActivityLogEntry }
  | { type: 'emergency.changed'; event: EmergencyEvent }
  | { type: 'provider.status'; providers: ProviderHealth[] }
  | { type: 'control.plan.created'; plan: ActionPlan }
  | { type: 'control.action.started'; action: ControlAction }
  | { type: 'control.action.finished'; action: ControlAction; ok: boolean; error?: string }
  | { type: 'agent.session.changed'; session: AgentSession }
  | { type: 'agent.plan.created'; session: AgentSession; plan: ActionPlan }
  | { type: 'agent.action.started'; sessionId: string; action: ControlAction }
  | { type: 'agent.action.finished'; sessionId: string; action: ControlAction; ok: boolean; error?: string }
  | { type: 'agent.needs.confirmation'; session: AgentSession; plan: ActionPlan }
  | { type: 'agent.error'; sessionId?: string; message: string }
  | { type: 'task.changed'; task: TaskSession }
  | { type: 'realtime.state'; state: RealtimeVoiceState }
  | { type: 'realtime.notice'; message: string }
  | { type: 'asr.text'; text: string; isFinal: boolean }
  | { type: 'chat.text'; text: string }
  | { type: 'chat.ended' }
  | { type: 'tts.start'; text: string }
  | { type: 'tts.end' }
  | { type: 'error'; message: string }
  | { type: 'server.ready'; port: number };

export interface HealthResponse {
  ok: true;
  product: 'AblePath';
  version: string;
  uptimeSec: number;
}

export interface AudioDevice {
  id: string;
  label: string;
  backend: 'parecord' | 'arecord' | 'sox' | 'powershell' | 'system';
  isDefault: boolean;
}

export interface ListenRequest {
  durationSec?: number;
  deviceId?: string;
}

export interface ListenResponse {
  text: string;
  audioPath: string;
  durationSec: number;
  provider: string;
}

export interface TTSRequest {
  text: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

export interface TTSResponse {
  ok: true;
  engine: string;
  spoken: boolean;
}

export interface VoiceStatusResponse {
  audio: {
    backend: string | null;
    canRecord: boolean;
    missingRecordCommands: string[];
  };
  tts: {
    engine: string | null;
    canSpeak: boolean;
    missingCommands: string[];
  };
  realtime: {
    configured: boolean;
    canStart: boolean;
    missingEnv: string[];
    setupHints: string[];
  };
}

export type RealtimeVoiceState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'session-active'
  | 'listening'
  | 'speaking'
  | 'error';
