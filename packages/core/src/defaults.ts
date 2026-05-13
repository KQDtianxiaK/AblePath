import { AblePathConfig } from '@ablepath/shared';

export function createDefaultConfig(): AblePathConfig {
  return {
    productName: 'AblePath',
    locale: 'zh-CN',
    profile: {
      userId: 'local-user',
      displayName: 'AblePath User',
      motorCapability: 'no-hands',
      preferredInputs: ['voice', 'text', 'screen-vision'],
      preferredOutputs: ['screen', 'tts'],
    },
    caregivers: [],
    providers: {
      defaultChat: 'doubao',
      defaultVision: 'doubao',
      defaultRealtime: 'doubao-realtime',
      providers: {
        doubao: {
          enabled: true,
          displayName: 'Doubao',
          capabilities: ['chat', 'vision'],
          requiredEnv: ['ARK_API_KEY'],
        },
        'doubao-realtime': {
          enabled: true,
          displayName: 'Doubao Realtime',
          capabilities: ['realtime'],
          requiredEnv: ['VOLC_ASR_APP_KEY', 'VOLC_ASR_ACCESS_KEY'],
        },
      },
    },
    safety: {
      requireConfirmationFor: ['type', 'click', 'doubleClick', 'hotkey', 'openUrl', 'openApp'],
      highRiskKeywords: [
        '发送',
        '删除',
        '支付',
        '购买',
        '下单',
        '发布',
        '提交',
        'send',
        'delete',
        'pay',
        'purchase',
        'publish',
        'submit',
      ],
      inactivityTimeoutMs: 30 * 60 * 1000,
      emergencyConfirmationTimeoutSec: 30,
    },
  };
}
