import { AblePathConfig, ProviderHealth } from '@ablepath/shared';

export function getProviderHealth(config: AblePathConfig, env: NodeJS.ProcessEnv): ProviderHealth[] {
  return Object.entries(config.providers.providers).map(([id, provider]) => {
    const missingEnv = provider.requiredEnv.filter((key) => !env[key]);
    return {
      id,
      displayName: provider.displayName,
      capabilities: provider.capabilities,
      missingEnv,
      status: provider.enabled ? (missingEnv.length ? 'missing-config' : 'configured') : 'disabled',
    };
  });
}
