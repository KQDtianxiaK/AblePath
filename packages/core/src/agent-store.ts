import fs from 'node:fs';
import path from 'node:path';

import {
  AgentExecutionState,
  AgentPlanPreview,
  AgentSession,
  AgentSessionEventType,
  AgentStep,
  AgentToolCall,
  ActionPlan,
  ControlExecuteResponse,
} from '@ablepath/shared';

import { resolveAblePathPaths } from './paths.js';

export class AgentStore {
  private readonly file: string;
  private sessions: AgentSession[] = [];
  private loaded = false;

  constructor(baseDir?: string) {
    this.file = resolveAblePathPaths(baseDir).agentFile;
  }

  create(command: string): AgentSession {
    this.loadIfNeeded();
    const now = new Date().toISOString();
    const session: AgentSession = {
      id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      command,
      status: 'planning',
      steps: [makeAgentStep('created', `Agent command created: ${command}`)],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.push(session);
    this.save();
    return session;
  }

  get(id: string): AgentSession | undefined {
    this.loadIfNeeded();
    return this.sessions.find((session) => session.id === id);
  }

  recent(limit = 20): AgentSession[] {
    this.loadIfNeeded();
    return this.sessions.slice(-limit).reverse();
  }

  setPreview(id: string, preview: AgentPlanPreview): AgentSession {
    const session = this.require(id);
    session.preview = preview;
    session.plan = preview.plan;
    session.execution = undefined;
    session.error = preview.plan.steps.length === 0 ? preview.plan.explanation : undefined;
    session.status = preview.plan.steps.length === 0
      ? 'failed'
      : preview.plan.requiresConfirmation
        ? 'needs-confirmation'
        : 'ready';
    session.steps = [
      ...session.steps,
      makeAgentStep('ai-plan', preview.plan.explanation, {
        planId: preview.plan.id,
        provider: preview.provider,
        warnings: preview.warnings,
        safetyReview: preview.safetyReview,
      }),
      ...(preview.plan.requiresConfirmation
        ? [makeAgentStep('needs-confirmation', 'Plan preview is waiting for user confirmation.', {
            planId: preview.plan.id,
            riskLevel: preview.plan.riskLevel,
          })]
        : []),
    ];
    return this.touch(session);
  }

  setStatus(id: string, status: AgentExecutionState, error?: string): AgentSession {
    const session = this.require(id);
    session.status = status;
    session.error = error;
    return this.touch(session);
  }

  setExecution(id: string, execution: ControlExecuteResponse): AgentSession {
    const session = this.require(id);
    session.execution = execution;
    session.status = execution.results.every((result) => result.ok) ? 'completed' : 'failed';
    session.error = execution.results.find((result) => !result.ok)?.error;
    session.steps = [
      ...session.steps,
      makeAgentStep('execution', execution.dryRun ? 'Agent dry-run completed.' : 'Agent execution completed.', {
        planId: execution.planId,
        dryRun: execution.dryRun,
        ok: execution.results.every((result) => result.ok),
      }),
    ];
    return this.touch(session);
  }

  addStep(
    id: string,
    type: AgentSessionEventType,
    summary: string,
    details?: Record<string, unknown>,
    toolCalls?: AgentToolCall[],
  ): AgentSession {
    const session = this.require(id);
    session.steps = [...session.steps, makeAgentStep(type, summary, details, toolCalls)];
    return this.touch(session);
  }

  setPlan(id: string, plan: ActionPlan): AgentSession {
    const session = this.require(id);
    session.plan = plan;
    session.status = plan.requiresConfirmation ? 'needs-confirmation' : 'ready';
    return this.touch(session);
  }

  stop(id: string, reason = 'Agent session stopped.'): AgentSession {
    const session = this.require(id);
    session.status = 'stopped';
    session.error = reason;
    session.steps = [...session.steps, makeAgentStep('stopped', reason)];
    return this.touch(session);
  }

  private require(id: string): AgentSession {
    const session = this.get(id);
    if (!session) throw new Error('Agent session not found');
    return session;
  }

  private touch(session: AgentSession): AgentSession {
    session.updatedAt = new Date().toISOString();
    this.save();
    return session;
  }

  private loadIfNeeded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(this.file)) {
        this.sessions = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as AgentSession[];
      }
    } catch {
      this.sessions = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.sessions, null, 2)}\n`);
  }
}

function makeAgentStep(
  type: AgentSessionEventType,
  summary: string,
  details?: Record<string, unknown>,
  toolCalls?: AgentToolCall[],
): AgentStep {
  return {
    id: `agent-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    toolCalls,
    summary,
    details,
  };
}
