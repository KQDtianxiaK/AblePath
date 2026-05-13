import {
  AblePathConfig,
  ActionPlan,
  AiPlanSafetyReview,
  ControlAction,
  ControlActionType,
  RiskLevel,
} from '@ablepath/shared';

import { classifyRisk } from './safety.js';

const ACTION_TYPES: ControlActionType[] = [
  'click',
  'doubleClick',
  'type',
  'hotkey',
  'scroll',
  'openUrl',
  'openApp',
  'switchWindow',
  'wait',
  'finished',
  'callUser',
];

export function createActionPlanFromAiResponse(
  raw: string,
  config: AblePathConfig,
  fallbackIntent: string,
  options: { preferSearchUrl?: boolean } = {},
): { plan: ActionPlan; warnings: string[]; safetyReview: AiPlanSafetyReview } {
  const parsed = parseJsonObject(raw);
  const warnings: string[] = [];
  const intent = readString(parsed?.intent) || fallbackIntent.trim();
  const explanation = readString(parsed?.explanation);
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : Array.isArray(parsed?.steps) ? parsed.steps : [];
  const blockedActions: AiPlanSafetyReview['blockedActions'] = [];
  const parsedSteps = actions.flatMap((item, index) => {
    const action = normalizeAction(item, index, warnings);
    if (!action) return [];
    const blocked = reviewBlockedAction(action, index, config);
    if (blocked) {
      blockedActions.push(blocked);
      warnings.push(`Action ${index + 1} was blocked: ${blocked.reason}`);
      return [];
    }
    return [action];
  });
  const steps = augmentCommonIntentSteps(parsedSteps, `${intent}\n${fallbackIntent}`, {
    preferSearchUrl: options.preferSearchUrl ?? true,
  });

  if (!parsed) warnings.push('AI response did not contain a valid JSON object.');
  if (!actions.length) warnings.push('AI response did not contain actions.');
  if (actions.length > steps.length) warnings.push('Some AI actions were ignored because they were invalid.');

  const modelRisk = normalizeRisk(parsed?.riskLevel);
  const computedRisk = classifyControlRisk(`${intent}\n${JSON.stringify(steps)}`, steps, config);
  const riskLevel = maxRisk(modelRisk, computedRisk);
  const requiresConfirmation =
    riskLevel !== 'low' ||
    steps.some((step) => config.safety.requireConfirmationFor.includes(step.type));
  const riskReasons = buildRiskReasons(modelRisk, computedRisk, steps, config, blockedActions);
  const safetyReview: AiPlanSafetyReview = {
    riskLevel,
    requiresConfirmation,
    warnings,
    blockedActions,
    riskReasons,
  };

  return {
    plan: {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      intent,
      steps,
      riskLevel,
      requiresConfirmation,
      explanation: explanation || explainStructuredPlan(steps, riskLevel, requiresConfirmation, warnings),
      createdAt: new Date().toISOString(),
    },
    warnings,
    safetyReview,
  };
}

function normalizeAction(value: unknown, index: number, warnings: string[]): ControlAction | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const type = normalizeActionType(record.type);
  if (!type) return null;

  const params = normalizeParams(type, record.params ?? record);
  if (!params) {
    warnings.push(`Action ${index + 1} has invalid params for ${type}.`);
    return null;
  }

  return {
    id: readString(record.id) || `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    description: readString(record.description) || defaultDescription(type, params),
    params,
  };
}

function normalizeParams(type: ControlActionType, value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (type === 'openUrl') {
    const url = normalizeUrl(readString(record.url));
    const browser = normalizeBrowser(readString(record.browser));
    return url ? { url, ...(browser ? { browser } : {}) } : null;
  }

  if (type === 'openApp') {
    const name = readString(record.name ?? record.app ?? record.application);
    return name ? { name } : null;
  }

  if (type === 'type') {
    const text = readString(record.text);
    return text ? { text } : null;
  }

  if (type === 'hotkey') {
    const keys = Array.isArray(record.keys)
      ? record.keys.map(readString).filter((item): item is string => Boolean(item))
      : readString(record.keys)?.split(/[+\s-]+/).filter(Boolean);
    return keys?.length ? { keys: keys.map((key) => key.toLowerCase()) } : null;
  }

  if (type === 'click' || type === 'doubleClick') {
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      ...(readString(record.targetLabel) ? { targetLabel: readString(record.targetLabel) } : {}),
    };
  }

  if (type === 'scroll') {
    const direction = record.direction === 'up' ? 'up' : record.direction === 'down' ? 'down' : null;
    const amount = Number(record.amount ?? 5);
    return direction ? { direction, amount: Number.isFinite(amount) ? Math.max(1, Math.round(amount)) : 5 } : null;
  }

  if (type === 'wait') {
    const durationMs = Number(record.durationMs ?? record.ms ?? record.duration ?? 1000);
    return { durationMs: Number.isFinite(durationMs) ? Math.max(100, Math.min(Math.round(durationMs), 10_000)) : 1000 };
  }

  if (type === 'finished') {
    return {};
  }

  if (type === 'callUser') {
    return { reason: readString(record.reason) ?? 'Need user attention.' };
  }

  return {};
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const candidates = [
    raw.trim(),
    raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim(),
    raw.match(/\{[\s\S]*\}/)?.[0],
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeActionType(value: unknown): ControlActionType | null {
  return ACTION_TYPES.includes(value as ControlActionType) ? value as ControlActionType : null;
}

function normalizeRisk(value: unknown): RiskLevel | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(value)) return `https://${value}`;
  return null;
}

function normalizeBrowser(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return ['chrome', 'google-chrome'].includes(normalized) ? 'chrome' : null;
}

function augmentCommonIntentSteps(
  steps: ControlAction[],
  command: string,
  options: { preferSearchUrl: boolean },
): ControlAction[] {
  const systemSteps = augmentSystemOpenSteps(steps, command);
  const openSteps = augmentOpenClickSteps(systemSteps, command);
  return augmentCommonSearchSteps(openSteps, command, options);
}

function augmentSystemOpenSteps(steps: ControlAction[], command: string): ControlAction[] {
  const appName = knownOpenAppName(command);
  if (!appName) return steps;
  if (steps.some((step) => step.type === 'openApp' && String(step.params.name ?? '').toLowerCase() === appName.toLowerCase())) {
    return steps;
  }
  return [makeAction('openApp', `Open ${appName}`, { name: appName })];
}

function knownOpenAppName(command: string): string | null {
  if (/\u56de\u6536\u7ad9|recycle\s*bin/i.test(command)) return 'Recycle Bin';
  if (/zotero/i.test(command)) return 'Zotero';
  return null;
}

function augmentOpenClickSteps(steps: ControlAction[], command: string): ControlAction[] {
  if (!isOpenIntent(command) || extractSearchQuery(command)) return steps;
  return steps.map((step) => {
    if (step.type !== 'click') return step;
    return {
      ...step,
      type: 'doubleClick',
      description: step.description.replace(/^Click/i, 'Double click'),
    };
  });
}

function isOpenIntent(command: string): boolean {
  return /\u6253\u5f00|\u542f\u52a8|\u6253\u5f00|open|launch/i.test(command);
}

function augmentCommonSearchSteps(
  steps: ControlAction[],
  command: string,
  options: { preferSearchUrl: boolean },
): ControlAction[] {
  const query = extractSearchQuery(command);
  if (!query) return steps;
  if (!options.preferSearchUrl) return steps;

  if (options.preferSearchUrl && shouldOpenViaSearchUrl(command, steps)) {
    const params: Record<string, unknown> = {
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
    };
    if (inferChrome(command) || hasChromeHint(steps)) params.browser = 'chrome';
    return [
      makeAction('openUrl', `Open Baidu search results for ${query}`, params),
      makeAction('wait', 'Wait for search results to load', { durationMs: 2500 }),
    ];
  }

  if (steps.some((step) => step.type === 'type' || step.type === 'hotkey')) return steps;
  const openIndex = steps.findIndex((step) => step.type === 'openUrl' && isBaiduUrl(String(step.params.url ?? '')));
  if (openIndex >= 0) {
    const url = String(steps[openIndex].params.url ?? '');
    if (isBaiduSearchUrl(url)) return steps;
    const augmented = steps.slice();
    augmented.splice(openIndex + 1, 0,
      makeAction('wait', 'Wait for Baidu to load before searching', { durationMs: 2500 }),
      makeAction('type', `Type search query ${query}`, { text: query }),
      makeAction('hotkey', 'Press Enter to search', { keys: ['enter'] }),
    );
    return augmented;
  }

  const hasScreenClick = steps.some((step) => step.type === 'click' || step.type === 'doubleClick');
  if (hasScreenClick) {
    return stripPrematureFinished([
      ...steps,
      makeAction('type', `Type search query ${query}`, { text: query }),
      makeAction('hotkey', 'Press Enter to search', { keys: ['enter'] }),
    ]);
  }

  if (shouldPreferBaiduSearchUrl(command)) {
    const params: Record<string, unknown> = {
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
    };
    if (inferChrome(command)) params.browser = 'chrome';
    return [makeAction('openUrl', `Open Baidu search for ${query}`, params)];
  }

  return steps;
}

function extractSearchQuery(value: string): string | null {
  for (const line of value.split(/\r?\n/).reverse()) {
    const normalized = line.replace(/\s+/g, ' ').trim();
    const chinese = normalized.match(/(?:\u641c\u7d22|\u641c\u5bfb|\u641c)\s*([^\uff0c\u3002\uff1b;]+)\s*$/);
    const english = normalized.match(/(?:search(?:\s+for)?|look\s+up)\s+(.+)\s*$/i);
    const query = (chinese?.[1] ?? english?.[1] ?? '').trim();
    if (query) return cleanSearchQuery(query);
  }
  return null;
}

function cleanSearchQuery(value: string): string {
  return value
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '')
    .replace(/(?:\u5e76|\u7136\u540e)?\u6253\u5f00(?:\u7b2c\u4e00\u4e2a|\u7ed3\u679c)?$/u, '')
    .replace(/(?:and\s+)?open(?:\s+it|\s+the\s+first\s+result)?$/i, '')
    .trim();
}

function stripPrematureFinished(steps: ControlAction[]): ControlAction[] {
  return steps.filter((step, index) => step.type !== 'finished' || index === steps.length - 1);
}

function shouldPreferBaiduSearchUrl(command: string): boolean {
  return /\u767e\u5ea6|baidu/i.test(command);
}

function shouldOpenViaSearchUrl(command: string, steps: ControlAction[]): boolean {
  if (!shouldOpenSearchResult(command)) return false;
  if (shouldPreferBaiduSearchUrl(command)) return true;
  return /(?:\u641c\u7d22|\u641c\u5bfb|\u641c)/.test(command) &&
    steps.some((step) => ['click', 'doubleClick', 'type', 'hotkey'].includes(step.type));
}

function shouldOpenSearchResult(command: string): boolean {
  return /(?:\u641c\u7d22|\u641c\u5bfb|\u641c)[\s\S]*(?:\u6253\u5f00|open)|(?:search|look\s+up)[\s\S]*open/i.test(command);
}

function inferChrome(command: string): boolean {
  return /\u8c37\u6b4c|chrome/i.test(command);
}

function hasChromeHint(steps: ControlAction[]): boolean {
  return steps.some((step) => String(step.params.browser ?? '').toLowerCase() === 'chrome');
}

function isBaiduUrl(value: string): boolean {
  try {
    return new URL(normalizeUrl(value) ?? value).hostname.toLowerCase().endsWith('baidu.com');
  } catch {
    return /(^|\.)baidu\.com/i.test(value);
  }
}

function isBaiduSearchUrl(value: string): boolean {
  try {
    const url = new URL(normalizeUrl(value) ?? value);
    return url.hostname.toLowerCase().endsWith('baidu.com') && (url.searchParams.has('wd') || url.searchParams.has('word'));
  } catch {
    return /[?&](wd|word)=/i.test(value);
  }
}

function makeAction(type: ControlActionType, description: string, params: Record<string, unknown>): ControlAction {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    description,
    params,
  };
}

function classifyControlRisk(intent: string, steps: ControlAction[], config: AblePathConfig): RiskLevel {
  const base = classifyRisk(intent, config);
  if (base === 'high') return 'high';
  if (steps.some((step) => config.safety.requireConfirmationFor.includes(step.type))) return 'medium';
  return base;
}

function reviewBlockedAction(
  action: ControlAction,
  index: number,
  config: AblePathConfig,
): AiPlanSafetyReview['blockedActions'][number] | null {
  const text = `${action.description}\n${JSON.stringify(action.params)}`.toLowerCase();
  const keyword = config.safety.highRiskKeywords.find((item) => text.includes(item.toLowerCase()));
  if (!keyword) return null;
  return {
    index,
    type: action.type,
    reason: `Contains high-risk keyword: ${keyword}`,
    description: action.description,
  };
}

function buildRiskReasons(
  modelRisk: RiskLevel | null,
  computedRisk: RiskLevel,
  steps: ControlAction[],
  config: AblePathConfig,
  blockedActions: AiPlanSafetyReview['blockedActions'],
): string[] {
  const reasons: string[] = [];
  if (modelRisk) reasons.push(`Model reported ${modelRisk} risk.`);
  reasons.push(`AblePath computed ${computedRisk} risk.`);
  const confirmingTypes = steps
    .map((step) => step.type)
    .filter((type, index, values) => config.safety.requireConfirmationFor.includes(type) && values.indexOf(type) === index);
  if (confirmingTypes.length) reasons.push(`Confirmation required for: ${confirmingTypes.join(', ')}.`);
  if (blockedActions.length) reasons.push(`${blockedActions.length} high-risk AI action(s) blocked.`);
  return reasons;
}

function maxRisk(...values: Array<RiskLevel | null>): RiskLevel {
  const rank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
  return values.filter((item): item is RiskLevel => item !== null).sort((a, b) => rank[b] - rank[a])[0] ?? 'low';
}

function explainStructuredPlan(
  steps: ControlAction[],
  riskLevel: RiskLevel,
  requiresConfirmation: boolean,
  warnings: string[],
): string {
  if (!steps.length) return 'AI did not generate executable actions. Please provide a clearer goal or screen context.';
  const warningText = warnings.length ? ` ${warnings.length} warning(s) were recorded.` : '';
  return `AI generated ${steps.length} structured action(s). Risk is ${riskLevel}. ${requiresConfirmation ? 'Confirmation is required before execution.' : 'The plan can run after review.'}${warningText}`;
}

function defaultDescription(type: ControlActionType, params: Record<string, unknown>): string {
  if (type === 'openUrl') return `Open ${String(params.url)}`;
  if (type === 'openApp') return `Open app ${String(params.name)}`;
  if (type === 'type') return 'Type text';
  if (type === 'hotkey') return `Press hotkey ${(params.keys as string[]).join('+')}`;
  if (type === 'click') return `Click coordinate ${String(params.x)}, ${String(params.y)}`;
  if (type === 'doubleClick') return `Double click coordinate ${String(params.x)}, ${String(params.y)}`;
  if (type === 'scroll') return params.direction === 'up' ? 'Scroll up' : 'Scroll down';
  if (type === 'wait') return `Wait ${String(params.durationMs ?? 1000)} ms`;
  if (type === 'finished') return 'Task finished';
  if (type === 'callUser') return `Ask user: ${String(params.reason ?? '')}`;
  return 'Switch window';
}
