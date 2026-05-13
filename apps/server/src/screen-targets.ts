import {
  ScreenElement,
  ScreenElementBounds,
  VisionAnalyzeResponse,
} from '@ablepath/shared';

export const SCREEN_TARGET_PROMPT =
  '请分析这张电脑屏幕截图，找出可操作的按钮、输入框、链接、菜单项。' +
  '只返回 JSON，不要使用 Markdown。格式：' +
  '{"elements":[{"label":"名称","role":"button|input|link|menu|text|other","bounds":{"x":0,"y":0,"width":100,"height":40},"actionable":true,"confidence":0.8}]}。' +
  '坐标使用截图左上角为原点的像素近似值；无法确定时返回空 elements 数组。';

export function parseScreenElements(analysis: VisionAnalyzeResponse | string): ScreenElement[] {
  const raw = typeof analysis === 'string' ? analysis : analysis.response;
  const parsed = parseJsonObject(raw);
  const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];

  return elements
    .map((item, index) => normalizeElement(item, index))
    .filter((item): item is ScreenElement => item !== null);
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

function normalizeElement(value: unknown, index: number): ScreenElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const bounds = normalizeBounds(record.bounds);
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!label || !bounds) return null;

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `target-${index + 1}`,
    label,
    role: normalizeRole(record.role),
    bounds,
    actionable: record.actionable !== false,
    confidence: normalizeConfidence(record.confidence),
  };
}

function normalizeBounds(value: unknown): ScreenElementBounds | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function normalizeRole(value: unknown): ScreenElement['role'] {
  if (
    value === 'button' ||
    value === 'input' ||
    value === 'link' ||
    value === 'menu' ||
    value === 'text' ||
    value === 'other'
  ) {
    return value;
  }
  return 'other';
}

function normalizeConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}
