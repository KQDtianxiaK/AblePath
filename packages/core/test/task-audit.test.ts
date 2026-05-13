import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createActionPlanFromAiResponse } from '../src/ai-plan.js';
import { buildTaskAudit } from '../src/task-audit.js';
import { createDefaultConfig } from '../src/defaults.js';
import { TaskStore } from '../src/task-store.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablepath-task-audit-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('buildTaskAudit', () => {
  it('summarizes AI plan reviews and execution results', () => {
    const store = new TaskStore(makeTempDir());
    const config = createDefaultConfig();
    const parsed = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","description":"点击提交订单","params":{"x":1,"y":2}},{"type":"openUrl","params":{"url":"example.org"}}]}',
      config,
      '测试审计',
    );
    const task = store.create('测试审计', parsed.plan);
    store.addEvent(task.id, 'ai-plan', 'AI structured plan via mock', {
      warnings: parsed.warnings,
      safetyReview: parsed.safetyReview,
      rawResponse: '{"large":"value"}',
    });
    store.setExecution(task.id, {
      planId: parsed.plan.id,
      executed: false,
      dryRun: true,
      results: [{ actionId: parsed.plan.steps[0].id, ok: true, skipped: true }],
    });

    const audit = buildTaskAudit(store.get(task.id)!);

    expect(audit.totals.aiPlans).toBe(1);
    expect(audit.totals.blockedActions).toBe(1);
    expect(audit.totals.executions).toBe(1);
    expect(audit.entries.some((entry) => entry.type === 'current-plan')).toBe(true);
    expect(JSON.stringify(audit.entries)).not.toContain('"rawResponse"');
    expect(JSON.stringify(audit.entries)).toContain('rawResponsePreview');
  });
});
