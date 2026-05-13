import { EventEmitter } from 'node:events';

import { AblePathEvent } from '@ablepath/shared';

export class AblePathEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: AblePathEvent): void {
    this.emitter.emit('event', event);
  }

  subscribe(listener: (event: AblePathEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
