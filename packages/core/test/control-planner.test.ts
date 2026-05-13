import { describe, expect, it } from 'vitest';

import { createClickPlanForScreenElement, createControlPlan } from '../src/control-planner.js';
import { createDefaultConfig } from '../src/defaults.js';

describe('control planner', () => {
  it('creates a confirmed open-url plan from natural language', () => {
    const plan = createControlPlan('打开 example.com', createDefaultConfig());

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].type).toBe('openUrl');
    expect(plan.steps[0].params.url).toBe('https://example.com');
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.riskLevel).toBe('medium');
  });

  it('marks destructive intents as high risk', () => {
    const plan = createControlPlan('删除这个文件', createDefaultConfig());

    expect(plan.riskLevel).toBe('high');
    expect(plan.requiresConfirmation).toBe(true);
  });

  it('returns an empty plan when the intent is underspecified', () => {
    const plan = createControlPlan('帮我处理一下', createDefaultConfig());

    expect(plan.steps).toHaveLength(0);
    expect(plan.explanation).toContain('没有识别出');
  });

  it('creates a coordinate click plan from a screen element', () => {
    const plan = createClickPlanForScreenElement(
      {
        id: 'el-1',
        label: '提交',
        role: 'button',
        actionable: true,
        confidence: 0.86,
        bounds: { x: 100, y: 40, width: 80, height: 30 },
      },
      createDefaultConfig(),
    );

    expect(plan.steps[0].type).toBe('click');
    expect(plan.steps[0].params.x).toBe(140);
    expect(plan.steps[0].params.y).toBe(55);
    expect(plan.requiresConfirmation).toBe(true);
  });
});
