import fs from 'node:fs';
import path from 'node:path';

import { ActivityLogEntry, ActivityType, RiskLevel } from '@ablepath/shared';

import { resolveAblePathPaths } from './paths.js';

export class ActivityStore {
  private readonly file: string;
  private entries: ActivityLogEntry[] = [];
  private loaded = false;

  constructor(baseDir?: string) {
    this.file = resolveAblePathPaths(baseDir).activityFile;
  }

  add(
    type: ActivityType,
    summary: string,
    options: { details?: Record<string, unknown>; riskLevel?: RiskLevel } = {},
  ): ActivityLogEntry {
    this.loadIfNeeded();
    const entry: ActivityLogEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      summary,
      details: options.details,
      riskLevel: options.riskLevel,
    };
    this.entries.push(entry);
    this.save();
    return entry;
  }

  recent(hoursBack = 24): ActivityLogEntry[] {
    this.loadIfNeeded();
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
    return this.entries.filter((entry) => Date.parse(entry.timestamp) >= cutoff);
  }

  stats(hoursBack = 24): {
    total: number;
    byType: Record<string, number>;
    lastActivityTime: string | null;
  } {
    const recent = this.recent(hoursBack);
    const byType: Record<string, number> = {};
    for (const entry of recent) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    }
    return {
      total: recent.length,
      byType,
      lastActivityTime: recent.at(-1)?.timestamp ?? null,
    };
  }

  lastActivityTime(): string | null {
    this.loadIfNeeded();
    return this.entries.at(-1)?.timestamp ?? null;
  }

  private loadIfNeeded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(this.file)) {
        this.entries = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as ActivityLogEntry[];
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.entries, null, 2)}\n`);
  }
}
