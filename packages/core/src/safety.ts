import { AblePathConfig, RiskLevel } from '@ablepath/shared';

export function classifyRisk(intent: string, config: AblePathConfig): RiskLevel {
  const lower = intent.toLowerCase();
  if (config.safety.highRiskKeywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
    return 'high';
  }
  if (lower.includes('打开') || lower.includes('open') || lower.includes('点击') || lower.includes('click')) {
    return 'medium';
  }
  return 'low';
}

export function requiresConfirmation(intent: string, config: AblePathConfig): boolean {
  return classifyRisk(intent, config) !== 'low';
}
