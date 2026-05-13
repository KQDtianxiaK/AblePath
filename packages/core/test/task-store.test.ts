import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createControlPlan } from '../src/control-planner.js';
import { createDefaultConfig } from '../src/defaults.js';
import { TaskStore } from '../src/task-store.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-task-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('TaskStore', () => {
  it('creates tasks awaiting confirmation when the control plan requires it', () => {
    const store = new TaskStore(makeTempDir());
    const plan = createControlPlan('打开 example.com', createDefaultConfig());

    const task = store.create('打开 example.com', plan);

    expect(task.status).toBe('awaiting-confirmation');
    expect(store.get(task.id)?.plan?.id).toBe(plan.id);
    expect(task.events?.map((event) => event.type)).toContain('created');
    expect(task.events?.map((event) => event.type)).toContain('plan-updated');
  });

  it('records execution results and completion status', () => {
    const store = new TaskStore(makeTempDir());
    const plan = createControlPlan('打开 example.com', createDefaultConfig());
    const task = store.create('打开 example.com', plan);

    const updated = store.setExecution(task.id, {
      planId: plan.id,
      executed: false,
      dryRun: true,
      results: [{ actionId: plan.steps[0].id, ok: true, skipped: true }],
    });

    expect(updated.status).toBe('completed');
    expect(updated.execution?.dryRun).toBe(true);
    expect(updated.events?.at(-1)?.type).toBe('execution');
  });

  it('records user notes and replaces stale execution when replanning', () => {
    const store = new TaskStore(makeTempDir());
    const firstPlan = createControlPlan('打开 example.com', createDefaultConfig());
    const task = store.create('打开 example.com', firstPlan);
    store.setExecution(task.id, {
      planId: firstPlan.id,
      executed: false,
      dryRun: true,
      results: [{ actionId: firstPlan.steps[0].id, ok: true, skipped: true }],
    });

    store.addEvent(task.id, 'user-note', '改为打开 example.org');
    const secondPlan = createControlPlan('打开 example.org', createDefaultConfig());
    const updated = store.setPlan(task.id, secondPlan);

    expect(updated.execution).toBeUndefined();
    expect(updated.plan?.id).toBe(secondPlan.id);
    expect(updated.events?.map((event) => event.type)).toContain('user-note');
  });
});
