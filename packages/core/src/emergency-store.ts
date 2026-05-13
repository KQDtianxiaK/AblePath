import fs from 'node:fs';
import path from 'node:path';

import { EmergencyEvent } from '@ablepath/shared';

import { resolveAblePathPaths } from './paths.js';

export class EmergencyStore {
  private readonly file: string;
  private events: EmergencyEvent[] = [];
  private loaded = false;

  constructor(baseDir?: string) {
    this.file = resolveAblePathPaths(baseDir).emergencyFile;
  }

  current(now = new Date()): EmergencyEvent {
    this.loadIfNeeded();
    this.activateExpiredPending(now);
    return this.events.at(-1) ?? createNormalEvent();
  }

  recent(limit = 20): EmergencyEvent[] {
    this.loadIfNeeded();
    return this.events.slice(-limit).reverse();
  }

  trigger(
    options: {
      trigger: EmergencyEvent['trigger'];
      details: string;
      confirmationTimeoutSec: number;
      activateImmediately?: boolean;
    },
    now = new Date(),
  ): EmergencyEvent {
    this.loadIfNeeded();
    const state = options.activateImmediately ? 'active' : 'pending-confirmation';
    const event: EmergencyEvent = {
      id: `emg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
      state,
      trigger: options.trigger,
      details: options.details,
      autoActivateAt: state === 'pending-confirmation'
        ? new Date(now.getTime() + options.confirmationTimeoutSec * 1000).toISOString()
        : undefined,
    };
    this.events.push(event);
    this.save();
    return event;
  }

  confirm(details = 'Emergency confirmed', now = new Date()): EmergencyEvent {
    this.loadIfNeeded();
    const current = this.current(now);
    if (current.state === 'active') return current;
    if (current.state !== 'pending-confirmation') {
      throw new Error('No pending emergency to confirm.');
    }
    const event: EmergencyEvent = {
      ...current,
      id: `emg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
      state: 'active',
      details,
      autoActivateAt: undefined,
    };
    this.events.push(event);
    this.save();
    return event;
  }

  cancel(details = 'Emergency cancelled', now = new Date()): EmergencyEvent {
    this.loadIfNeeded();
    const current = this.current(now);
    if (current.state !== 'pending-confirmation') {
      throw new Error('No pending emergency to cancel.');
    }
    const event: EmergencyEvent = {
      ...current,
      id: `emg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
      state: 'normal',
      details,
      autoActivateAt: undefined,
    };
    this.events.push(event);
    this.save();
    return event;
  }

  resolve(details = 'Emergency resolved', now = new Date()): EmergencyEvent {
    this.loadIfNeeded();
    const current = this.current(now);
    if (current.state !== 'active') {
      throw new Error('No active emergency to resolve.');
    }
    const event: EmergencyEvent = {
      ...current,
      id: `emg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
      state: 'resolved',
      details,
      resolvedAt: now.toISOString(),
    };
    this.events.push(event);
    this.save();
    return event;
  }

  countdownSec(now = new Date()): number | null {
    const current = this.current(now);
    if (current.state !== 'pending-confirmation' || !current.autoActivateAt) return null;
    return Math.max(0, Math.ceil((Date.parse(current.autoActivateAt) - now.getTime()) / 1000));
  }

  private activateExpiredPending(now: Date): EmergencyEvent | null {
    const current = this.events.at(-1);
    if (
      !current ||
      current.state !== 'pending-confirmation' ||
      !current.autoActivateAt ||
      Date.parse(current.autoActivateAt) > now.getTime()
    ) {
      return null;
    }
    const event: EmergencyEvent = {
      ...current,
      id: `emg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
      state: 'active',
      details: 'Emergency auto-activated after confirmation timeout.',
      autoActivateAt: undefined,
    };
    this.events.push(event);
    this.save();
    return event;
  }

  private loadIfNeeded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(this.file)) {
        this.events = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as EmergencyEvent[];
      }
    } catch {
      this.events = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.events, null, 2)}\n`);
  }
}

function createNormalEvent(): EmergencyEvent {
  return {
    id: 'emg-normal',
    timestamp: new Date(0).toISOString(),
    state: 'normal',
    trigger: 'system',
    details: 'No active emergency.',
  };
}
