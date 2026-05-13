import { describe, expect, it } from 'vitest';

import { createActionPlanFromAiResponse } from '../src/ai-plan.js';
import { createDefaultConfig } from '../src/defaults.js';

describe('createActionPlanFromAiResponse', () => {
  it('parses structured URL actions from fenced JSON', () => {
    const result = createActionPlanFromAiResponse(
      '```json\n{"intent":"打开网站","actions":[{"type":"openUrl","params":{"url":"example.org"}}]}\n```',
      createDefaultConfig(),
      'fallback',
    );

    expect(result.plan.intent).toBe('打开网站');
    expect(result.plan.steps[0]).toMatchObject({
      type: 'openUrl',
      params: { url: 'https://example.org' },
    });
    expect(result.plan.requiresConfirmation).toBe(true);
  });

  it('drops invalid actions and reports warnings', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"deleteFile","params":{"path":"/tmp/a"}},{"type":"click","params":{"x":12,"y":20}}]}',
      createDefaultConfig(),
      '点击继续',
    );

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].type).toBe('click');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('does not trust low model risk for confirmable actions', () => {
    const result = createActionPlanFromAiResponse(
      '{"riskLevel":"low","actions":[{"type":"openUrl","params":{"url":"example.org"}}]}',
      createDefaultConfig(),
      '打开 example.org',
    );

    expect(result.plan.riskLevel).toBe('medium');
    expect(result.safetyReview.riskReasons.join(' ')).toContain('AblePath computed medium risk');
  });

  it('blocks high-risk actions before they become executable steps', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","description":"点击提交订单","params":{"x":200,"y":300}},{"type":"openUrl","params":{"url":"example.org"}}]}',
      createDefaultConfig(),
      '继续操作',
    );

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].type).toBe('openUrl');
    expect(result.safetyReview.blockedActions).toHaveLength(1);
    expect(result.safetyReview.blockedActions[0].reason).toContain('提交');
  });

  it('parses a multi-step AI desktop plan for Baidu search', () => {
    const result = createActionPlanFromAiResponse(
      JSON.stringify({
        intent: '打开百度并搜索 1+1',
        actions: [
          { type: 'openUrl', params: { url: 'www.baidu.com' } },
          { type: 'type', params: { text: '1+1' } },
          { type: 'hotkey', params: { keys: ['enter'] } },
        ],
        riskLevel: 'medium',
      }),
      createDefaultConfig(),
      'fallback',
    );

    expect(result.plan.steps.map((step) => step.type)).toEqual(['openUrl', 'type', 'hotkey']);
    expect(result.plan.steps[0].params.url).toBe('https://www.baidu.com');
    expect(result.plan.steps[1].params.text).toBe('1+1');
    expect(result.plan.steps[2].params.keys).toEqual(['enter']);
    expect(result.plan.requiresConfirmation).toBe(true);
  });

  it('normalizes non-destructive agent action types', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"wait","params":{"durationMs":20000}},{"type":"callUser","params":{"reason":"Need target"}},{"type":"finished","params":{}}]}',
      createDefaultConfig(),
      'continue',
    );

    expect(result.plan.steps).toHaveLength(3);
    expect(result.plan.steps[0]).toMatchObject({ type: 'wait', params: { durationMs: 10000 } });
    expect(result.plan.steps[1]).toMatchObject({ type: 'callUser', params: { reason: 'Need target' } });
    expect(result.plan.steps[2]).toMatchObject({ type: 'finished', params: {} });
  });

  it('preserves the Chrome browser hint for URL actions', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"openUrl","params":{"url":"example.org","browser":"chrome"}}]}',
      createDefaultConfig(),
      'open in chrome',
    );

    expect(result.plan.steps[0]).toMatchObject({
      type: 'openUrl',
      params: { url: 'https://example.org', browser: 'chrome' },
    });
  });

  it('supports launching desktop apps through typed openApp actions', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"openApp","params":{"name":"Zotero"}}]}',
      createDefaultConfig(),
      '打开 Zotero',
    );

    expect(result.plan.steps[0]).toMatchObject({
      type: 'openApp',
      params: { name: 'Zotero' },
    });
    expect(result.plan.requiresConfirmation).toBe(true);
  });

  it('adds missing Baidu search steps when the AI only opens the site', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"openUrl","params":{"url":"www.baidu.com","browser":"chrome"}}]}',
      createDefaultConfig(),
      '打开百度搜索 1+1',
    );

    expect(result.plan.steps.map((step) => step.type)).toEqual(['openUrl', 'wait']);
    expect(result.plan.steps[0].params.url).toBe('https://www.baidu.com/s?wd=1%2B1');
  });

  it('rewrites Recycle Bin open requests to a typed app launch', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","params":{"x":20,"y":1040}}]}',
      createDefaultConfig(),
      '\u6253\u5f00\u56de\u6536\u7ad9',
    );

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0]).toMatchObject({
      type: 'openApp',
      params: { name: 'Recycle Bin' },
    });
  });

  it('adds search text after a click-only screen plan for Baidu search', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","params":{"x":500,"y":300}},{"type":"finished","params":{}}]}',
      createDefaultConfig(),
      '\u5728\u767e\u5ea6\u9875\u9762\u641c\u7d22\u56fd\u79d1\u5927\u5b98\u7f51\u5e76\u6253\u5f00',
    );

    expect(result.plan.steps.map((step) => step.type)).toEqual(['openUrl', 'wait']);
    expect(result.plan.steps[0].params.url).toBe('https://www.baidu.com/s?wd=%E5%9B%BD%E7%A7%91%E5%A4%A7%E5%AE%98%E7%BD%91');
  });

  it('uses Baidu search URL for search-and-open even when the screen plan includes typing', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","params":{"x":500,"y":300}},{"type":"type","params":{"text":"\u56fd\u79d1\u5927\u5b98\u7f51"}},{"type":"hotkey","params":{"keys":["enter"]}}]}',
      createDefaultConfig(),
      '\u641c\u7d22\u56fd\u79d1\u5927\u5b98\u7f51\u5e76\u6253\u5f00',
    );

    expect(result.plan.steps.map((step) => step.type)).toEqual(['openUrl', 'wait']);
    expect(result.plan.steps[0].params.url).toContain('wd=');
  });

  it('can disable search URL rewrite for follow-up screen steps', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","params":{"x":430,"y":360,"targetLabel":"中国科学院大学"}}]}',
      createDefaultConfig(),
      '\u641c\u7d22\u56fd\u79d1\u5927\u5b98\u7f51\u5e76\u6253\u5f00',
      { preferSearchUrl: false },
    );

    expect(result.plan.steps.map((step) => step.type)).toEqual(['click']);
    expect(result.plan.steps[0].params.targetLabel).toBe('\u4e2d\u56fd\u79d1\u5b66\u9662\u5927\u5b66');
  });

  it('turns click-only open intents into double clicks', () => {
    const result = createActionPlanFromAiResponse(
      '{"actions":[{"type":"click","params":{"x":120,"y":240}}]}',
      createDefaultConfig(),
      '\u6253\u5f00\u684c\u9762\u56fe\u6807',
    );

    expect(result.plan.steps[0].type).toBe('doubleClick');
  });
});
