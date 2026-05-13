import fs from 'node:fs';
import path from 'node:path';

import {
  ActionPlan,
  ControlExecuteResponse,
  TaskSessionEvent,
  TaskSessionEventType,
  TaskSession,
  TaskSessionStatus,
} from '@ablepath/shared';

import { resolveAblePathPaths } from './paths.js';

export class TaskStore {
  private readonly file: string;
  private tasks: TaskSession[] = [];
  private loaded = false;

  constructor(baseDir?: string) {
    this.file = resolveAblePathPaths(baseDir).taskFile;
  }

  create(goal: string, plan?: ActionPlan): TaskSession {
    this.loadIfNeeded();
    const now = new Date().toISOString();
    const task: TaskSession = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      goal,
      plan,
      status: plan
        ? plan.steps.length === 0
          ? 'failed'
          : plan.requiresConfirmation
            ? 'awaiting-confirmation'
            : 'ready'
        : 'planning',
      error: plan?.steps.length === 0 ? plan.explanation : undefined,
      events: [
        makeEvent('created', `Task created: ${goal}`),
        ...(plan ? [makeEvent('plan-updated', plan.explanation, { planId: plan.id, riskLevel: plan.riskLevel })] : []),
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    this.save();
    return task;
  }

  get(id: string): TaskSession | undefined {
    this.loadIfNeeded();
    return this.tasks.find((task) => task.id === id);
  }

  recent(limit = 20): TaskSession[] {
    this.loadIfNeeded();
    return this.tasks.slice(-limit).reverse();
  }

  setPlan(id: string, plan: ActionPlan): TaskSession {
    const task = this.require(id);
    task.plan = plan;
    task.execution = undefined;
    task.status = plan.steps.length === 0
      ? 'failed'
      : plan.requiresConfirmation
        ? 'awaiting-confirmation'
        : 'ready';
    task.error = plan.steps.length === 0 ? plan.explanation : undefined;
    task.events = [
      ...(task.events ?? []),
      makeEvent('plan-updated', plan.explanation, { planId: plan.id, riskLevel: plan.riskLevel }),
    ];
    return this.touch(task);
  }

  setStatus(id: string, status: TaskSessionStatus, error?: string): TaskSession {
    const task = this.require(id);
    task.status = status;
    task.error = error;
    return this.touch(task);
  }

  setExecution(id: string, execution: ControlExecuteResponse): TaskSession {
    const task = this.require(id);
    task.execution = execution;
    task.status = execution.results.every((result) => result.ok) ? 'completed' : 'failed';
    task.error = execution.results.find((result) => !result.ok)?.error;
    task.events = [
      ...(task.events ?? []),
      makeEvent(execution.dryRun ? 'execution' : 'execution', execution.dryRun ? 'Dry-run completed' : 'Execution completed', {
        planId: execution.planId,
        dryRun: execution.dryRun,
        ok: execution.results.every((result) => result.ok),
      }),
    ];
    return this.touch(task);
  }

  addEvent(
    id: string,
    type: TaskSessionEventType,
    summary: string,
    details?: Record<string, unknown>,
  ): TaskSession {
    const task = this.require(id);
    task.events = [...(task.events ?? []), makeEvent(type, summary, details)];
    return this.touch(task);
  }

  cancel(id: string, reason = 'Task cancelled'): TaskSession {
    const task = this.require(id);
    task.status = 'cancelled';
    task.error = reason;
    task.events = [...(task.events ?? []), makeEvent('cancelled', reason)];
    return this.touch(task);
  }

  private require(id: string): TaskSession {
    const task = this.get(id);
    if (!task) throw new Error('Task not found');
    return task;
  }

  private touch(task: TaskSession): TaskSession {
    task.updatedAt = new Date().toISOString();
    this.save();
    return task;
  }

  private loadIfNeeded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(this.file)) {
        this.tasks = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as TaskSession[];
      }
    } catch {
      this.tasks = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.tasks, null, 2)}\n`);
  }
}

function makeEvent(
  type: TaskSessionEventType,
  summary: string,
  details?: Record<string, unknown>,
): TaskSessionEvent {
  return {
    id: `task-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    summary,
    details,
  };
}
