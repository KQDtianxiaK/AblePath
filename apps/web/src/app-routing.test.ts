import { describe, expect, it } from 'vitest';

import {
  buildEventWebSocketUrl,
  initialViewForPath,
  isCaregiverPublicPath,
  shouldConnectOwnerEventStream,
} from './app-routing';

describe('app routing helpers', () => {
  it('detects dedicated caregiver public paths', () => {
    expect(isCaregiverPublicPath('/caregiver')).toBe(true);
    expect(isCaregiverPublicPath('/caregiver/')).toBe(true);
    expect(isCaregiverPublicPath('/caregiver/share')).toBe(true);
    expect(isCaregiverPublicPath('/caregivers')).toBe(false);
    expect(isCaregiverPublicPath('/')).toBe(false);
    expect(isCaregiverPublicPath('/settings')).toBe(false);
  });

  it('selects the correct initial owner or caregiver view', () => {
    expect(initialViewForPath('/caregiver')).toBe('caregiver');
    expect(initialViewForPath('/caregiver/abc')).toBe('caregiver');
    expect(initialViewForPath('/')).toBe('dashboard');
    expect(initialViewForPath('/settings')).toBe('dashboard');
  });

  it('skips owner event streams on caregiver public paths', () => {
    expect(shouldConnectOwnerEventStream('/caregiver')).toBe(false);
    expect(shouldConnectOwnerEventStream('/caregiver/abc')).toBe(false);
    expect(shouldConnectOwnerEventStream('/')).toBe(true);
    expect(shouldConnectOwnerEventStream('/screen')).toBe(true);
  });

  it('builds WebSocket URLs from the current page protocol', () => {
    expect(buildEventWebSocketUrl('http:', 'localhost:4317')).toBe('ws://localhost:4317/ws/events');
    expect(buildEventWebSocketUrl('https:', 'ablepath.example')).toBe('wss://ablepath.example/ws/events');
  });
});
