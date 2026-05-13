import {
  AiPlanSafetyReview,
  TaskAuditEntry,
  TaskAuditResponse,
  TaskSession,
} from '@ablepath/shared';

export function buildTaskAudit(task: TaskSession): TaskAuditResponse {
  const entries = (task.events ?? []).map((event): TaskAuditEntry => {
    const details = event.details ?? {};
    const safetyReview = normalizeSafetyReview(details.safetyReview);
    return {
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      summary: event.summary,
      riskLevel: typeof details.riskLevel === 'string' ? details.riskLevel as TaskAuditEntry['riskLevel'] : undefined,
      planId: typeof details.planId === 'string' ? details.planId : undefined,
      safetyReview,
      warnings: Array.isArray(details.warnings) ? details.warnings.filter((item): item is string => typeof item === 'string') : undefined,
      blockedActions: safetyReview?.blockedActions,
      details: redactAuditDetails(details),
    };
  });

  if (task.plan) {
    entries.push({
      id: `${task.plan.id}-current`,
      timestamp: task.plan.createdAt,
      type: 'current-plan',
      summary: task.plan.explanation,
      riskLevel: task.plan.riskLevel,
      planId: task.plan.id,
      details: {
        steps: task.plan.steps.length,
        requiresConfirmation: task.plan.requiresConfirmation,
      },
    });
  }

  if (task.execution) {
    entries.push({
      id: `${task.execution.planId}-execution`,
      timestamp: task.updatedAt,
      type: 'current-execution',
      summary: task.execution.dryRun ? 'Dry-run result' : 'Execution result',
      execution: task.execution,
    });
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    task: {
      id: task.id,
      goal: task.goal,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    totals: {
      events: task.events?.length ?? 0,
      aiPlans: (task.events ?? []).filter((event) => event.type === 'ai-plan').length,
      blockedActions: entries.reduce((total, entry) => total + (entry.blockedActions?.length ?? 0), 0),
      executions: (task.events ?? []).filter((event) => event.type === 'execution').length,
      failedActions: task.execution?.results.filter((result) => !result.ok).length ?? 0,
    },
    entries,
  };
}

function normalizeSafetyReview(value: unknown): AiPlanSafetyReview | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as AiPlanSafetyReview;
  if (!record.riskLevel || !Array.isArray(record.blockedActions)) return undefined;
  return record;
}

function redactAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...details };
  if (typeof redacted.rawResponse === 'string') {
    redacted.rawResponsePreview = redacted.rawResponse.slice(0, 500);
    delete redacted.rawResponse;
  }
  return redacted;
}
