import fs from 'node:fs';
import path from 'node:path';

import { AblePathConfig } from '@ablepath/shared';

import { createDefaultConfig } from './defaults.js';
import { resolveAblePathPaths } from './paths.js';

export class ConfigStore {
  private readonly configFile: string;

  constructor(baseDir?: string) {
    this.configFile = resolveAblePathPaths(baseDir).configFile;
  }

  ensure(): AblePathConfig {
    if (!fs.existsSync(this.configFile)) {
      const config = createDefaultConfig();
      this.save(config);
      return config;
    }
    return this.load();
  }

  load(): AblePathConfig {
    try {
      const raw = fs.readFileSync(this.configFile, 'utf-8');
      return mergeConfig(createDefaultConfig(), JSON.parse(raw) as Partial<AblePathConfig>);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.ensure();
      }
      throw err;
    }
  }

  save(config: AblePathConfig): void {
    fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
    fs.writeFileSync(this.configFile, `${JSON.stringify(config, null, 2)}\n`);
  }
}

function mergeConfig(defaults: AblePathConfig, override: Partial<AblePathConfig>): AblePathConfig {
  return {
    ...defaults,
    ...override,
    profile: { ...defaults.profile, ...override.profile },
    caregivers: override.caregivers ?? defaults.caregivers,
    providers: {
      ...defaults.providers,
      ...override.providers,
      providers: {
        ...defaults.providers.providers,
        ...override.providers?.providers,
      },
    },
    safety: { ...defaults.safety, ...override.safety },
  };
}
