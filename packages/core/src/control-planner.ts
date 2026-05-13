import {
  AblePathConfig,
  ActionPlan,
  ControlAction,
  ControlActionType,
  RiskLevel,
  ScreenElement,
} from '@ablepath/shared';

import { classifyRisk } from './safety.js';

export function createControlPlan(intent: string, config: AblePathConfig): ActionPlan {
  const normalized = intent.trim();
  const steps = normalized ? inferActions(normalized) : [];
  const riskLevel = classifyControlRisk(normalized, steps, config);
  const requiresConfirmation =
    riskLevel !== 'low' ||
    steps.some((step) => config.safety.requireConfirmationFor.includes(step.type));

  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent: normalized,
    steps,
    riskLevel,
    requiresConfirmation,
    explanation: explainPlan(steps, riskLevel, requiresConfirmation),
    createdAt: new Date().toISOString(),
  };
}

export function createClickPlanForScreenElement(
  element: ScreenElement,
  config: AblePathConfig,
  intent = `点击 ${element.label}`,
): ActionPlan {
  const centerX = Math.round(element.bounds.x + element.bounds.width / 2);
  const centerY = Math.round(element.bounds.y + element.bounds.height / 2);
  const steps = [
    action('click', `点击 ${element.label} (${centerX}, ${centerY})`, {
      x: centerX,
      y: centerY,
      targetId: element.id,
      targetLabel: element.label,
      targetRole: element.role,
      confidence: element.confidence,
    }),
  ];
  const riskLevel = classifyControlRisk(intent, steps, config);
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    intent,
    steps,
    riskLevel,
    requiresConfirmation: true,
    explanation: `将点击屏幕元素 "${element.label}" 的中心位置 (${centerX}, ${centerY})。执行前需要确认。`,
    createdAt: new Date().toISOString(),
  };
}

function inferActions(intent: string): ControlAction[] {
  const url = inferUrl(intent);
  if (url) {
    return [action('openUrl', `打开 ${url}`, { url })];
  }

  const typeText = inferTypeText(intent);
  if (typeText) {
    return [action('type', `输入文本`, { text: typeText })];
  }

  const hotkey = inferHotkey(intent);
  if (hotkey) {
    return [action('hotkey', `按快捷键 ${hotkey.join('+')}`, { keys: hotkey })];
  }

  const click = inferClick(intent);
  if (click) {
    return [action('click', click.x !== undefined ? `点击坐标 ${click.x}, ${click.y}` : '点击当前位置', click)];
  }

  const scroll = inferScroll(intent);
  if (scroll) {
    return [action('scroll', scroll.direction === 'down' ? '向下滚动' : '向上滚动', scroll)];
  }

  if (/切换窗口|switch window|alt\+tab/i.test(intent)) {
    return [action('switchWindow', '切换窗口', {})];
  }

  return [];
}

function action(type: ControlActionType, description: string, params: Record<string, unknown>): ControlAction {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    description,
    params,
  };
}

function inferUrl(intent: string): string | null {
  const direct = intent.match(/https?:\/\/[^\s，。]+/i)?.[0];
  if (direct) return direct;

  const domain = intent.match(/(?:打开|访问|open|visit)\s+([a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s，。]*)?)/i)?.[1];
  if (domain) return `https://${domain}`;
  return null;
}

function inferTypeText(intent: string): string | null {
  const match =
    intent.match(/(?:输入|键入|打字)\s*[：:]?\s*(.+)$/) ??
    intent.match(/(?:type|enter)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function inferHotkey(intent: string): string[] | null {
  const match =
    intent.match(/(?:按|快捷键)\s*([a-z0-9+\-\s]+)$/i) ??
    intent.match(/(?:press|hotkey)\s+([a-z0-9+\-\s]+)$/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;

  const keys = raw
    .replace(/\s*\+\s*/g, '+')
    .split(/[+\s-]+/)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);
  return keys.length > 0 ? keys : null;
}

function inferClick(intent: string): { x?: number; y?: number } | null {
  if (!/点击|click/i.test(intent)) return null;
  const point = intent.match(/(\d{1,5})\s*[,， ]\s*(\d{1,5})/);
  if (!point) return {};
  return { x: Number(point[1]), y: Number(point[2]) };
}

function inferScroll(intent: string): { direction: 'up' | 'down'; amount: number } | null {
  if (/向下滚动|下滑|scroll down/i.test(intent)) return { direction: 'down', amount: 5 };
  if (/向上滚动|上滑|scroll up/i.test(intent)) return { direction: 'up', amount: 5 };
  return null;
}

function classifyControlRisk(
  intent: string,
  steps: ControlAction[],
  config: AblePathConfig,
): RiskLevel {
  const base = classifyRisk(intent, config);
  if (base === 'high') return 'high';
  if (steps.some((step) => config.safety.requireConfirmationFor.includes(step.type))) return 'medium';
  return base;
}

function explainPlan(
  steps: ControlAction[],
  riskLevel: RiskLevel,
  requiresConfirmation: boolean,
): string {
  if (steps.length === 0) {
    return '没有识别出可执行的电脑控制动作；请补充目标、文本、网址、快捷键或坐标。';
  }
  const confirmation = requiresConfirmation ? '执行前需要确认。' : '可直接执行。';
  return `已生成 ${steps.length} 个控制动作，风险等级为 ${riskLevel}，${confirmation}`;
}
